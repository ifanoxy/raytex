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
use raytex_core::settings::BuildTool;
use raytex_core::tex::Engine;
use raytex_core::{history, lighter::Weights, pdfa};
use serde::{Deserialize, Serialize};
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
    /// What a PDF/A export found in it.
    pub archive: Option<Archive>,
    /// What an accessible export found in it.
    pub accessible: Option<Accessible>,
}

/// What an accessible export found in the PDF it made (tagged, PDF/UA).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accessible {
    /// What does not go with PDF/UA (`untagged`, `lang`, `title`, `identification`, `alt`).
    pub problems: Vec<&'static str>,
    /// Pictures without a text in place of them (`alt={…}`).
    pub missing_alt: usize,
    /// The part of PDF/UA it says it is (2 alone, 1 with a PDF/A).
    pub part: Option<u8>,
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

/// What a PDF/A export found in the PDF it made (see `raytex_core::pdfa`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Archive {
    pub standard: pdfa::Standard,
    /// What does not go with the standard (`fonts`, `transparency`…).
    pub problems: Vec<&'static str>,
    /// The document gives its own `\DocumentMetadata`: it was kept.
    pub own: bool,
    pub check: pdfa::Check,
}

/// How the PDF is made apart, besides its pictures: a PDF/A, a version of
/// the document, tagged for screen readers.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Making {
    /// A PDF/A of that level.
    pub archive: Option<pdfa::Standard>,
    /// A version of the document (the subject of an exam, its answer key).
    pub version: Option<Version>,
    /// Tagged for screen readers (PDF/UA).
    pub accessible: bool,
}

/// A version of the document, built apart from the text of its root file
/// written for it (the subject of an exam, its answer key).
#[derive(Debug, Deserialize)]
pub struct Version {
    /// What it is called (`sujet`, `corrige`): the folder of its build.
    pub name: String,
    /// The text of the root file for this version.
    pub text: String,
}

impl Version {
    /// The name, as a folder can have it.
    fn folder(&self) -> String {
        let name: String = self
            .name
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .take(24)
            .collect();
        if name.is_empty() {
            "version".into()
        } else {
            name
        }
    }
}

/// Builds the document of `path` again apart and writes the PDF at `dest`:
/// with its pictures at `step` (in a copy of the project; with a `limit` in
/// bytes, a PDF that weighs more is built again at the next steps, three
/// times at most), and as `making` says: a PDF/A (in a folder of the build
/// of its own when the pictures stay as they are), a version of it (its
/// root file written in that folder, or in the copy), tagged for screen
/// readers (PDF/UA-2, or PDF/A-3b with PDF/UA-1 when a PDF/A is asked too).
/// Nothing of the project is touched.
///
/// Fails with `no-project`, `no-distribution`, `cancelled`, `archive-engine`
/// (an engine that cannot write a PDF/A), `archive-latex` (a LaTeX older
/// than June 2022), `accessible-latex` (one older than June 2025), or
/// `build:<what stopped it>` when no whole PDF was made.
#[tauri::command]
pub async fn export_pdf_lighter(
    app: AppHandle,
    path: String,
    dest: String,
    step: Option<usize>,
    limit: Option<u64>,
    making: Option<Making>,
) -> CmdResult<LighterPdf> {
    let Making {
        archive,
        version,
        accessible,
    } = making.unwrap_or_default();
    // With an accessible PDF, the PDF/A that goes with it.
    let archive = archive.map(|a| {
        if accessible {
            pdfa::ACCESSIBLE_ARCHIVE
        } else {
            a
        }
    });
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

        let mut settings = prep.settings.clone();
        settings.synctex = false;
        settings.precompile_preamble = false;
        settings.figure_cache = false;
        settings.halt_on_error = false;
        settings.copy_pdf_to_root = false;
        // Steps of one's own cannot be given what is read before the document.
        if (archive.is_some() || accessible) && settings.tool == BuildTool::Custom {
            settings.tool = BuildTool::Auto;
        }
        // Lighter pictures: in a copy of the project, removed at the end.
        let work = state
            .paths
            .cache
            .join("export")
            .join(history::folder(Path::new(""), &root_dir));
        let (_copy, mirror) = match step {
            Some(_) => {
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
                // Built outside its folder (a file opened on its own): the copy too.
                if !mirror
                    .out_dir
                    .starts_with(mirror.main.parent().unwrap_or(&work))
                {
                    settings.out_dir = mirror.out_dir.to_string_lossy().into_owned();
                }
                (Some(Copy(work.clone())), Some(mirror))
            }
            None => {
                // As it is, for the archive or a version: apart from the build of the project.
                let folder = match (archive.is_some() || accessible, &version) {
                    (true, Some(v)) => format!(".raytex-pdfa-{}", v.folder()),
                    (false, Some(v)) => format!(".raytex-{}", v.folder()),
                    _ if accessible => ".raytex-ua".to_owned(),
                    _ => ".raytex-pdfa".to_owned(),
                };
                settings.out_dir = out_dir.join(folder).to_string_lossy().into_owned();
                (None, None)
            }
        };
        let root = mirror
            .as_ref()
            .map_or(prep.root.clone(), |m| m.main.clone());
        // A version: its root file in the copy of the project, or in the
        // folder of its build (given to the engine from there).
        let written = match (&version, &mirror) {
            (Some(v), Some(_)) => {
                std::fs::write(&root, &v.text).map_err(err)?;
                None
            }
            (Some(v), None) => {
                let dir = PathBuf::from(&settings.out_dir);
                std::fs::create_dir_all(&dir).map_err(err)?;
                let file = dir.join(root.file_name().unwrap_or_default());
                std::fs::write(&file, &v.text).map_err(err)?;
                Some(file)
            }
            (None, _) => None,
        };
        let root_text = match &version {
            Some(v) => v.text.clone(),
            None => std::fs::read_to_string(&root).unwrap_or_default(),
        };
        let source = |p: &Path| std::fs::read_to_string(p).ok();
        let last = Compression::STEPS.len() - 1;
        let mut step = step.map(|s| s.min(last));
        let mut attempts = 0;
        let (built, size, errors, missing_alt) = loop {
            attempts += 1;
            if let (Some(mirror), Some(at)) = (&mirror, step) {
                let told = |done: usize, total: usize| {
                    let _ = app.emit("export:pictures", Pictures { done, total });
                };
                if !lighter::lighten(mirror, Compression::STEPS[at], &pictures, &cancel, &told) {
                    return Err("cancelled".to_owned());
                }
            }
            let mut plan = build::plan(&root, &settings, Some(&dist), &prep.facts, lang)
                .map_err(|e| format!("build:{}", e.to_diagnostic(lang).message))?;
            plan.source = written.clone();
            if archive.is_some() || accessible {
                if matches!(plan.engine, Engine::Tectonic | Engine::Latex) {
                    return Err("archive-engine".to_owned());
                }
                if accessible && !pdfa::tagging_supported(&dist) {
                    return Err("accessible-latex".to_owned());
                }
                if !pdfa::supported(&dist) {
                    return Err("archive-latex".to_owned());
                }
                plan.prefix = Some(pdfa::prefix_for(archive, accessible, &root_text));
            }
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
            if let Some(at) = step
                && limit.is_some_and(|l| size > l)
                && at < last
                && attempts < 4
            {
                step = Some(at + 1);
                continue;
            }
            // The pictures tagpdf found without a text in place of them.
            let missing_alt = outcome
                .diagnostics
                .iter()
                .filter(|d| d.message.contains(pdfa::MISSING_ALT))
                .count();
            break (built, size, errors.len(), missing_alt);
        };
        let check = if archive.is_some() || accessible {
            Some(pdfa::check(&built).map_err(err)?)
        } else {
            None
        };
        let accessible = match (&check, accessible) {
            (Some(check), true) => Some(Accessible {
                problems: pdfa::accessible_problems(check, missing_alt),
                missing_alt,
                part: check.ua_part,
            }),
            _ => None,
        };
        let archive = match (archive, check) {
            (Some(standard), Some(check)) => Some(Archive {
                standard,
                problems: pdfa::problems(&check, standard),
                own: pdfa::has_metadata(&root_text),
                check,
            }),
            _ => None,
        };
        state.note_own_write(&dest);
        export::copy_pdf(&built, &dest).map_err(err)?;
        Ok(LighterPdf {
            size,
            step: step.unwrap_or(0),
            within: limit.is_none_or(|l| size <= l),
            errors,
            archive,
            accessible,
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
