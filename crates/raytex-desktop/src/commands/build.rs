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

use raytex_core::build::{self, BuildEvent, BuildOutcome, BuildPlan, DocumentFacts, RunContext};
use raytex_core::diagnostics::Diagnostic;
use raytex_core::process::Stream;
use raytex_core::settings::BuildSettings;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{CmdResult, abs, blocking};
use crate::state::AppState;

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
struct Step {
    name: String,
    command: String,
}

#[derive(Debug, Clone, Serialize)]
struct Finished {
    outcome: Option<BuildOutcome>,
    error: Option<Diagnostic>,
    manual: bool,
}

/// Starts (or queues) the compilation of the document containing `path`.
#[tauri::command]
pub async fn build(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    manual: Option<bool>,
) -> CmdResult<()> {
    let file = abs(&path);
    let manual = manual.unwrap_or(false);
    let flag = {
        let mut b = state.build();
        if b.running.is_some() {
            let was_manual = b.queued.as_ref().is_some_and(|(_, m)| *m);
            b.queued = Some((file, manual || was_manual));
            return Ok(());
        }
        let flag = Arc::new(AtomicBool::new(false));
        b.running = Some(flag.clone());
        flag
    };
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        run_one(&app, &state, &file, &flag, manual);
        loop {
            let next = {
                let mut b = state.build();
                match b.queued.take() {
                    Some((f, m)) => {
                        let fl = Arc::new(AtomicBool::new(false));
                        b.running = Some(fl.clone());
                        Some((f, fl, m))
                    }
                    None => {
                        b.running = None;
                        None
                    }
                }
            };
            match next {
                Some((f, fl, m)) => run_one(&app, &state, &f, &fl, m),
                None => break,
            }
        }
    });
    Ok(())
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

fn run_one(app: &AppHandle, state: &AppState, file: &Path, cancel: &Arc<AtomicBool>, manual: bool) {
    let lang = state.lang();
    let Some(prep) = prepare(state, file) else {
        let _ = app.emit(
            "build:finished",
            Finished {
                outcome: None,
                error: None,
                manual,
            },
        );
        return;
    };
    let dist = state.active_distribution();
    let plan = match build::plan(&prep.root, &prep.settings, dist.as_ref(), &prep.facts, lang) {
        Ok(p) => p,
        Err(e) => {
            let _ = app.emit(
                "build:finished",
                Finished {
                    outcome: None,
                    error: Some(e.to_diagnostic(lang)),
                    manual,
                },
            );
            return;
        }
    };
    let dist = dist.expect("plan checked the distribution");
    let _ = app.emit(
        "build:started",
        Started {
            plan: plan.clone(),
            manual,
        },
    );

    // Forward output in batches to keep the interface fluid on verbose builds.
    let (tx, rx) = mpsc::channel::<OutputLine>();
    let forward_app = app.clone();
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
                        let _ = forward_app.emit("build:output", Output { lines });
                        return;
                    }
                }
            }
            let _ = forward_app.emit("build:output", Output { lines });
        }
    });

    let sources = prep.sources;
    let source = move |p: &Path| {
        sources
            .get(p)
            .cloned()
            .or_else(|| std::fs::read_to_string(p).ok())
    };
    let ctx = RunContext {
        dist: &dist,
        settings: &prep.settings,
        cancel,
        lang,
        source: &source,
        // The app lives on: formats of preambles are prepared for the next builds.
        background: true,
    };
    let outcome = build::run(&plan, &ctx, &mut |ev| match ev {
        BuildEvent::Step { name, command } => {
            let _ = app.emit("build:step", Step { name, command });
        }
        BuildEvent::Output { stream, line } => {
            let _ = tx.send(OutputLine { stream, text: line });
        }
    });
    drop(tx);
    let _ = forwarder.join();

    // Real label numbers for completion and the outline.
    let aux = raytex_core::aux::read(
        &plan.out_dir,
        &plan.out_dir.join(format!("{}.aux", plan.job)),
    );
    if let Some(pr) = state.project_mut().as_mut() {
        pr.ws.set_aux(&plan.root, aux);
    }
    if let Some(pdf) = &outcome.pdf {
        let _ = app.asset_protocol_scope().allow_file(pdf);
    }
    let _ = app.emit(
        "build:finished",
        Finished {
            outcome: Some(outcome),
            error: None,
            manual,
        },
    );
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
