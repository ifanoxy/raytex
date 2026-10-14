//! Compilation commands and events.
//!
//! Events emitted while building:
//! * `build:started` `{ plan, manual }` (`manual`: asked for by the user,
//!   not a live or on-save build)
//! * `build:step` `{ name, command }`
//! * `build:output` `{ lines: [{ stream, text }] }` (batched every 60 ms)
//! * `build:finished` `{ outcome?, error?, manual }`
//!
//! A build requested while another one runs is queued and coalesced: only
//! the latest request runs after the current build (typing fast never
//! stacks builds up); it counts as asked for by the user when one of the
//! coalesced requests was.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, mpsc};
use std::time::Duration;

use raytex_core::build::{
    self, BuildEvent, BuildOutcome, BuildPlan, DocumentFacts, RunContext, only,
};
use raytex_core::diagnostics::Diagnostic;
use raytex_core::process::Stream;
use raytex_core::settings::BuildSettings;
use raytex_core::settings::{BibTool, BuildTool};
use raytex_core::tex::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{CmdResult, abs, blocking};
use crate::state::{AppState, BuildRequest};

/// A line of compiler output.
#[derive(Debug, Clone, Serialize)]
pub struct OutputLine {
    /// Stream.
    pub stream: Stream,
    /// Text.
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
struct Started {
    plan: BuildPlan,
    manual: bool,
}

#[derive(Debug, Clone, Serialize)]
struct Output {
    lines: Vec<OutputLine>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct Step {
    pub(crate) name: String,
    pub(crate) command: String,
}

#[derive(Debug, Clone, Serialize)]
struct Finished {
    outcome: Option<BuildOutcome>,
    error: Option<Diagnostic>,
    manual: bool,
    /// The build was given up for a newer text, which is being built now:
    /// nothing to say of it.
    superseded: bool,
}

/// Starts (or queues) the compilation of the document containing `path`.
///
/// `live`: a build made while the text is typed. It is one pass of the
/// engine (what would complete it is left to a later build, see
/// `RunContext::live`), and it gives way to a newer text: a live build
/// asked for while another one runs stops that one, unless it is nearly
/// done, so that the engine does not finish a page nobody will look at.
///
/// `only`: a file that is a part of its document is compiled on its own
/// (see `raytex_core::build::only`); the whole document otherwise.
#[tauri::command]
pub async fn build(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    manual: Option<bool>,
    live: Option<bool>,
    only: Option<bool>,
) -> CmdResult<()> {
    let file = abs(&path);
    let manual = manual.unwrap_or(false);
    let live = live.unwrap_or(false) && !manual;
    let only = only.unwrap_or(false);
    let flag = {
        let mut b = state.build();
        if let Some(running) = b.running.clone() {
            let (was_manual, was_live) = b
                .queued
                .as_ref()
                .map_or((false, true), |q| (q.manual, q.live));
            b.queued = Some(BuildRequest {
                file,
                manual: manual || was_manual,
                live: live && was_live,
                only,
            });
            if live && b.gives_way() {
                b.superseding = true;
                b.superseded += 1;
                running.store(true, Ordering::Relaxed);
            }
            return Ok(());
        }
        let flag = Arc::new(AtomicBool::new(false));
        b.running = Some(flag.clone());
        b.running_live = live;
        b.started = Some(std::time::Instant::now());
        flag
    };
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        run_one(
            &app,
            &state,
            &BuildRequest {
                file,
                manual,
                live,
                only,
            },
            &flag,
        );
        loop {
            let next = {
                let mut b = state.build();
                match b.queued.take() {
                    Some(q) => {
                        let fl = Arc::new(AtomicBool::new(false));
                        b.running = Some(fl.clone());
                        b.running_live = q.live;
                        b.started = Some(std::time::Instant::now());
                        Some((q, fl))
                    }
                    None => {
                        b.running = None;
                        b.writing = None;
                        b.running_live = false;
                        b.started = None;
                        None
                    }
                }
            };
            match next {
                Some((q, fl)) => run_one(&app, &state, &q, &fl),
                None => break,
            }
        }
    });
    Ok(())
}

/// Forwards the lines of a compiler to the interface as `event`, in batches
/// (every 60 ms) to keep it fluid on verbose builds. The lines are sent to
/// the channel; the thread ends when the channel is dropped.
pub(crate) fn forward_output(
    app: &AppHandle,
    event: &'static str,
) -> (mpsc::Sender<OutputLine>, std::thread::JoinHandle<()>) {
    let (tx, rx) = mpsc::channel::<OutputLine>();
    let app = app.clone();
    let forwarder = std::thread::spawn(move || {
        loop {
            let first = match rx.recv() {
                Ok(l) => l,
                Err(_) => return,
            };
            let mut lines = vec![first];
            let deadline = std::time::Instant::now() + Duration::from_millis(60);
            while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
                match rx.recv_timeout(left) {
                    Ok(l) => lines.push(l),
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        let _ = app.emit(event, Output { lines });
                        return;
                    }
                }
            }
            let _ = app.emit(event, Output { lines });
        }
    });
    (tx, forwarder)
}

/// Stops the running build and forgets queued ones.
#[tauri::command]
pub async fn cancel_build(state: State<'_, AppState>) -> CmdResult<()> {
    let mut b = state.build();
    b.queued = None;
    if let Some(flag) = &b.running {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// Everything needed to build, gathered under the project lock.
pub(crate) struct Prepared {
    pub(crate) root: PathBuf,
    pub(crate) settings: BuildSettings,
    pub(crate) facts: DocumentFacts,
    sources: HashMap<PathBuf, String>,
}

pub(crate) fn prepare(state: &AppState, file: &Path) -> Option<Prepared> {
    let base = state.settings().build.clone();
    let project = state.project();
    let ws = &project.as_ref()?.ws;
    let root = ws.root_for(file);
    let docs = ws.project_documents(&root);
    let facts = DocumentFacts::from_indexes(docs.iter().map(|d| &d.index));
    let sources = docs
        .iter()
        .map(|d| (d.path.clone(), d.text.clone()))
        .collect();
    let mut settings = ws.config.effective_build(&base);
    if let Some(file) = &project.as_ref()?.light {
        // Light mode: nothing is written next to the file.
        settings.out_dir = state.light_out_dir(file).to_string_lossy().into_owned();
    }
    Some(Prepared {
        settings,
        root,
        facts,
        sources,
    })
}

fn run_one(app: &AppHandle, state: &AppState, req: &BuildRequest, cancel: &Arc<AtomicBool>) {
    let (file, manual, live) = (req.file.as_path(), req.manual, req.live);
    let lang = state.lang();
    let finish = |outcome: Option<BuildOutcome>, error: Option<Diagnostic>, superseded: bool| {
        let _ = app.emit(
            "build:finished",
            Finished {
                outcome,
                error,
                manual,
                superseded,
            },
        );
    };
    let Some(prep) = prepare(state, file) else {
        finish(None, None, false);
        return;
    };
    let dist = state.active_distribution();
    let whole = match build::plan(&prep.root, &prep.settings, dist.as_ref(), &prep.facts, lang) {
        Ok(p) => p,
        Err(e) => {
            finish(None, Some(e.to_diagnostic(lang)), false);
            return;
        }
    };
    let dist = dist.expect("plan checked the distribution");
    // A part of the document shown on its own: our own driver only (the
    // others compile what they are given, whole).
    let shown = (req.only
        && matches!(whole.tool, BuildTool::Auto | BuildTool::Single)
        && whole.engine != Engine::Tectonic)
        .then(|| {
            state
                .project()
                .as_ref()
                .and_then(|pr| only::shown(&pr.ws, &prep.root, file))
        })
        .flatten();
    let plan = match &shown {
        Some(s) => only::plan(&whole, &s.file, false),
        None => whole.clone(),
    };
    // Known from here on: this PDF is not to be copied until the build ends.
    state.build().writing = Some(plan.pdf.clone());
    let _ = app.emit(
        "build:started",
        Started {
            plan: plan.clone(),
            manual,
        },
    );

    let (tx, forwarder) = forward_output(app, "build:output");
    let sources = prep.sources;
    let root_text = sources
        .get(&prep.root)
        .cloned()
        .or_else(|| std::fs::read_to_string(&prep.root).ok());
    let source = move |p: &Path| {
        sources
            .get(p)
            .cloned()
            .or_else(|| std::fs::read_to_string(p).ok())
    };
    let packages = || state.tex().analyzer.clone();
    let context = |live: bool| RunContext {
        dist: &dist,
        settings: &prep.settings,
        cancel,
        lang,
        source: &source,
        packages: Some(&packages),
        // The app lives on: formats of preambles are prepared for the next builds.
        background: true,
        live,
    };
    let events = |suffix: Option<&'static str>| {
        let tx = tx.clone();
        move |ev: BuildEvent| match ev {
            BuildEvent::Step { name, command } => {
                let name = match suffix {
                    Some(s) => format!("{name} · {s}"),
                    None => name,
                };
                let _ = app.emit("build:step", Step { name, command });
            }
            BuildEvent::Output { stream, line } => {
                let _ = tx.send(OutputLine { stream, text: line });
            }
        }
    };

    let mut aux_of = None;
    let mut before = 0;
    let outcome = match &shown {
        None => {
            aux_of = Some(plan.clone());
            build::run(&plan, &context(live), &mut events(None))
        }
        Some(shown) => {
            let _ = std::fs::create_dir_all(&plan.out_dir);
            let engine = plan.engine.program();
            let kept = only::Record::load(&plan.out_dir)
                .filter(|r| r.serves(engine, &shown.files, &shown.own));
            let record = match kept {
                Some(r) => Some(r),
                None => {
                    // The whole document once, LaTeX noting where each file starts.
                    let record_plan = only::plan(&whole, &shown.file, true);
                    let written = root_text
                        .as_deref()
                        .and_then(only::record_source)
                        .is_some_and(|text| write_source(&record_plan, &text));
                    if written {
                        let whole_doc = lang.pick("document entier", "whole document");
                        let r =
                            build::run(&record_plan, &context(false), &mut events(Some(whole_doc)));
                        before = r.duration_ms;
                        if r.cancelled {
                            drop(tx);
                            let _ = forwarder.join();
                            let superseded = settle(state, &r);
                            finish(Some(r), None, superseded);
                            return;
                        }
                        aux_of = Some(record_plan.clone());
                        let record = only::Record::read(
                            &record_plan.out_dir,
                            &record_plan.job,
                            engine,
                            shown.files.clone(),
                        );
                        record.save(&plan.out_dir);
                        Some(record)
                    } else {
                        None
                    }
                }
            };
            let cx = only::Context {
                file: &shown.name,
                brought: Some(shown.brought),
                record: record.as_ref(),
                matter: shown.matter.clone(),
                definitions: &shown.definitions,
                biblatex: plan.bib_tool == Some(BibTool::Biber),
            };
            match root_text.as_deref().and_then(|t| only::only_source(t, &cx)) {
                Some(text) if write_source(&plan, &text) => {
                    build::run(&plan, &context(live), &mut events(None))
                }
                // The document cannot be cut (no `\begin{document}`…): it is built whole.
                _ => {
                    aux_of = Some(whole.clone());
                    build::run(&whole, &context(live), &mut events(None))
                }
            }
        }
    };
    let mut outcome = outcome;
    outcome.duration_ms += before;
    drop(tx);
    let _ = forwarder.join();

    // Real label numbers for completion and the outline: those of the whole
    // document (a file shown on its own has but its own).
    if let Some(p) = aux_of {
        let aux = raytex_core::auxfile::read(&p.out_dir, &p.out_dir.join(format!("{}.aux", p.job)));
        if let Some(pr) = state.project_mut().as_mut() {
            pr.ws.set_aux(&p.root, aux);
        }
    }
    if let Some(pdf) = &outcome.pdf {
        let _ = app.asset_protocol_scope().allow_file(pdf);
    }
    let superseded = settle(state, &outcome);
    finish(Some(outcome), None, superseded);
}

/// Writes the document an engine is given for a build of one file.
fn write_source(plan: &BuildPlan, text: &str) -> bool {
    let Some(o) = &plan.only else {
        return false;
    };
    std::fs::create_dir_all(&plan.out_dir).is_ok() && std::fs::write(&o.source, text).is_ok()
}

/// After a build: given up for a newer text, or let to its end (the next
/// live build is judged from there). Returns whether it was given up.
fn settle(state: &AppState, outcome: &BuildOutcome) -> bool {
    let mut b = state.build();
    let superseded = std::mem::take(&mut b.superseding) && outcome.cancelled;
    if !outcome.cancelled {
        b.superseded = 0;
        b.last_duration = Some(Duration::from_millis(outcome.duration_ms));
    }
    superseded
}

/// A file that is a part of its document and could be compiled on its own.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPart {
    /// The root of the document.
    root: PathBuf,
    /// The file.
    file: PathBuf,
}

/// Whether `path` is a part of its document that can be compiled on its
/// own (a chapter brought in by `\input`, `\include` or `\subfile`).
#[tauri::command]
pub async fn document_part(app: AppHandle, path: String) -> CmdResult<Option<DocumentPart>> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let ws = &project.as_ref()?.ws;
        let root = ws.root_for(&file);
        only::part_of(ws, &root, &file)?;
        Some(DocumentPart {
            root: raytex_core::log::normalize(&root),
            file: raytex_core::log::normalize(&file),
        })
    })
    .await
}

/// How the document containing `path` would be built (engine, output…).
#[tauri::command]
pub async fn build_plan(app: AppHandle, path: String) -> CmdResult<Result<BuildPlan, Diagnostic>> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        let lang = state.lang();
        let prep = prepare(state, &file).ok_or("no project")?;
        let dist = state.active_distribution();
        Ok(
            build::plan(&prep.root, &prep.settings, dist.as_ref(), &prep.facts, lang)
                .map_err(|e| e.to_diagnostic(lang)),
        )
    })
    .await?
}

/// Removes the auxiliary files of the document containing `path`.
#[tauri::command]
pub async fn clean_build(app: AppHandle, path: String) -> CmdResult<usize> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        let prep = prepare(state, &file).ok_or("no project")?;
        let dir = prep.root.parent().unwrap_or(Path::new(".")).to_path_buf();
        let out = raytex_core::log::normalize(&dir.join(&prep.settings.out_dir));
        let job = prep
            .root
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        Ok(build::clean(&out, &job))
    })
    .await?
}

/// Path of the PDF of the document containing `path` (whether it exists or not).
#[tauri::command]
pub async fn pdf_path(app: AppHandle, path: String) -> CmdResult<Option<PathBuf>> {
    let file = abs(&path);
    blocking(&app, move |app, state| {
        let prep = prepare(state, &file)?;
        let dir = prep.root.parent()?.to_path_buf();
        let out = raytex_core::log::normalize(&dir.join(&prep.settings.out_dir));
        let pdf = out.join(format!("{}.pdf", prep.root.file_stem()?.to_string_lossy()));
        if pdf.exists() {
            let _ = app.asset_protocol_scope().allow_file(&pdf);
        }
        Some(pdf)
    })
    .await
}
