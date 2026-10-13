//! A lighter PDF (`raytex_core::lighter`): what the pictures of the
//! document weigh, and the export of the PDF built again with lighter
//! copies of them, in a copy of the project kept in the cache.
//!
//! Events emitted while such an export runs:
//! * `export:pictures` `{ done, total }` (pictures written lighter)
//! * `export:step` `{ name, command }`
//! * `export:output` `{ lines: [{ stream, text }] }`

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use raytex_core::build::{self, BuildEvent, RunContext};
use raytex_core::diagnostics::Severity;
use raytex_core::export::{self, Target};
use raytex_core::images::Compression;
use raytex_core::lighter::{self, Cache};
use raytex_core::{history, lighter::Weights};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::build::{OutputLine, Step, forward_output};
use super::{CmdResult, abs, blocking, err};
use crate::state::AppState;

/// The pictures of a document, and what they weigh.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPictures {
    /// How many PNG and JPEG pictures the document embeds.
    pub pictures: usize,
    /// Their size, in bytes.
    pub original: u64,
    /// The size of the PDF as it is, when it is whole.
    pub pdf: Option<u64>,
}

/// What the pictures weigh at each step, with the PDF as it is.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfWeights {
    #[serde(flatten)]
    weights: Weights,
    /// The size of the PDF as it is, when it is whole.
    pdf: Option<u64>,
}

/// The size of the PDF of a document, when it is whole.
fn pdf_size(out_dir: &Path, main: &Path) -> Option<u64> {
    let pdf = out_dir.join(format!("{}.pdf", main.file_stem()?.to_string_lossy()));
    export::pdf_complete(&pdf)
        .then(|| std::fs::metadata(&pdf).ok().map(|m| m.len()))
        .flatten()
}

fn cache(state: &AppState) -> Cache {
    Cache::at(state.paths.cache.join("pictures"))
}

/// The pictures the document of `path` embeds that can be made lighter
/// (from the record of its last build), without weighing anything.
#[tauri::command]
pub async fn pdf_pictures(app: AppHandle, path: String) -> CmdResult<Option<PdfPictures>> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        let (root_dir, main, out_dir, bib_files) = super::export::built_document(state, &file)?;
        let found = lighter::pictures(&Target {
            root_dir: &root_dir,
            main: &main,
            out_dir: &out_dir,
            bib_files: &bib_files,
        });
        Some(PdfPictures {
            pictures: found.len(),
            original: found.iter().map(|p| p.size).sum(),
            pdf: pdf_size(&out_dir, &main),
        })
    })
    .await
}

/// What the pictures of the document of `path` weigh at each step of
/// compression. Their lighter copies are made on the way (it takes seconds
/// the first time) and kept. `None` when it was given up.
#[tauri::command]
pub async fn pdf_weights(app: AppHandle, path: String) -> CmdResult<Option<PdfWeights>> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        let (root_dir, main, out_dir, bib_files) = super::export::built_document(state, &file)?;
        let cancel = state.weigh_cancel.clone();
        cancel.store(false, Ordering::SeqCst);
        let found = lighter::pictures(&Target {
            root_dir: &root_dir,
            main: &main,
            out_dir: &out_dir,
            bib_files: &bib_files,
        });
        let weights = lighter::weigh(&found, &cache(state), &cancel)?;
        Some(PdfWeights {
            weights,
            pdf: pdf_size(&out_dir, &main),
        })
    })
    .await
}

/// Gives up the weighing under way.
#[tauri::command]
pub async fn pdf_weights_cancel(state: tauri::State<'_, AppState>) -> CmdResult<()> {
    state.weigh_cancel.store(true, Ordering::SeqCst);
    Ok(())
}

/// A lighter PDF, exported.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LighterPdf {
    /// Its size, in bytes.
    pub size: u64,
    /// The step of compression it was made with.
    pub step: usize,
    /// It weighs what was asked at most (true when no limit was given).
    pub within: bool,
    /// Errors of its build (it made a PDF all the same).
    pub errors: usize,
}

#[derive(Debug, Clone, Serialize)]
struct Pictures {
    done: usize,
    total: usize,
}

/// The copy of the project, removed when the export ends, however it ends.
struct Copy(PathBuf);

impl Drop for Copy {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Builds the document of `path` again with its pictures at `step`, in a
/// copy of the project, and writes the PDF at `dest`. With a `limit` (in
/// bytes), a PDF that weighs more is built again at the next steps (three
/// times at most). Nothing of the project is touched.
///
/// Fails with `no-project`, `no-distribution`, `cancelled`, or
/// `build:<what stopped it>` when no whole PDF was made.
#[tauri::command]
pub async fn export_pdf_lighter(
    app: AppHandle,
    path: String,
    dest: String,
    step: usize,
    limit: Option<u64>,
) -> CmdResult<LighterPdf> {
    let file = abs(&path);
    let dest = abs(&dest);
    blocking(&app, move |app, state| {
        let (root_dir, main, out_dir, bib_files) =
            super::export::built_document(state, &file).ok_or("no-project")?;
        let prep = super::build::prepare(state, &file).ok_or("no-project")?;
        let dist = state.active_distribution().ok_or("no-distribution")?;
        let lang = state.lang();
        let whole = state.project().as_ref().is_some_and(|p| p.light.is_none());
        let cancel = state.export_cancel.clone();
        cancel.store(false, Ordering::SeqCst);
        let pictures = cache(state);
        pictures.prune();

        let work = state
            .paths
            .cache
            .join("export")
            .join(history::folder(Path::new(""), &root_dir));
        let _copy = Copy(work.clone());
        let mirror = lighter::mirror(
            &Target {
                root_dir: &root_dir,
                main: &main,
                out_dir: &out_dir,
                bib_files: &bib_files,
            },
            whole,
            &work,
        )
        .map_err(err)?;

        let mut settings = prep.settings.clone();
        settings.synctex = false;
        settings.precompile_preamble = false;
        settings.halt_on_error = false;
        settings.copy_pdf_to_root = false;
        // Built outside its folder (a file opened on its own): the copy too.
        if !mirror
            .out_dir
            .starts_with(mirror.main.parent().unwrap_or(&work))
        {
            settings.out_dir = mirror.out_dir.to_string_lossy().into_owned();
        }
        let source = |p: &Path| std::fs::read_to_string(p).ok();
        let last = Compression::STEPS.len() - 1;
        let mut step = step.min(last);
        let mut attempts = 0;
        let (built, size, errors) = loop {
            attempts += 1;
            let told = |done: usize, total: usize| {
                let _ = app.emit("export:pictures", Pictures { done, total });
            };
            if !lighter::lighten(&mirror, Compression::STEPS[step], &pictures, &cancel, &told) {
                return Err("cancelled".to_owned());
            }
            let plan = build::plan(&mirror.main, &settings, Some(&dist), &prep.facts, lang)
                .map_err(|e| format!("build:{}", e.to_diagnostic(lang).message))?;
            let (tx, forwarder) = forward_output(app, "export:output");
            let ctx = RunContext {
                dist: &dist,
                settings: &settings,
                cancel: &cancel,
                lang,
                source: &source,
                packages: None,
                background: false,
                live: false,
            };
            let outcome = build::run(&plan, &ctx, &mut |ev| match ev {
                BuildEvent::Step { name, command } => {
                    let _ = app.emit("export:step", Step { name, command });
                }
                BuildEvent::Output { stream, line } => {
                    let _ = tx.send(OutputLine { stream, text: line });
                }
            });
            drop(tx);
            let _ = forwarder.join();
            if outcome.cancelled {
                return Err("cancelled".to_owned());
            }
            let errors: Vec<_> = outcome
                .diagnostics
                .iter()
                .filter(|d| d.severity == Severity::Error)
                .collect();
            let Some(built) = outcome.pdf.clone().filter(|p| export::pdf_complete(p)) else {
                let why = errors
                    .first()
                    .map(|d| d.message.lines().next().unwrap_or_default().to_owned())
                    .unwrap_or_default();
                return Err(format!("build:{why}"));
            };
            let size = std::fs::metadata(&built).map_err(err)?.len();
            // Over the limit: the pictures one step lighter, the build again
            // (its state is there: one pass).
            if limit.is_some_and(|l| size > l) && step < last && attempts < 4 {
                step += 1;
                continue;
            }
            break (built, size, errors.len());
        };
        state.note_own_write(&dest);
        export::copy_pdf(&built, &dest).map_err(err)?;
        Ok(LighterPdf {
            size,
            step,
            within: limit.is_none_or(|l| size <= l),
            errors,
        })
    })
    .await?
}

/// Gives up the export of a lighter PDF under way.
#[tauri::command]
pub async fn export_pdf_cancel(state: tauri::State<'_, AppState>) -> CmdResult<()> {
    state.export_cancel.store(true, Ordering::SeqCst);
    Ok(())
}
