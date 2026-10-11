//! The local history of the open project (`raytex_core::history`): moments
//! taken while it changes, at most one every few minutes, and what the
//! window of the history shows of them.
//!
//! Nothing here goes into the folder of the project: the history is kept
//! with the data of the application. A file opened on its own has none (it
//! has no folder of its own).

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use raytex_core::build::{self, BuildEvent, RunContext};
use raytex_core::diagnostics::Severity;
use raytex_core::history::{self, CHANGES_JOB, Change, ChangesError, DiffLine, History, Moment};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{CmdResult, abs, blocking, err};
use crate::state::AppState;

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The folder of the open project and its history; `None` without a
/// project, and for a file opened on its own.
fn open_history(state: &AppState) -> Option<(PathBuf, History)> {
    let project = state.project();
    let pr = project.as_ref().filter(|pr| pr.light.is_none())?;
    let root = pr.ws.root_dir.clone();
    let history = History::at(history::folder(&state.paths.history, &root));
    Some((root, history))
}

/// Takes a moment of the open project when one is due (`reason` is why:
/// `open`, `save`). Returns at once: the work is done on its own thread,
/// and nothing is done at all between two moments.
pub fn tick(app: &AppHandle, reason: &'static str) {
    let state = app.state::<AppState>();
    let at = now();
    if reason != "open" && at < state.history_next.load(Ordering::Relaxed) {
        return;
    }
    let settings = state.settings().history.clone();
    if !settings.enabled {
        return;
    }
    let every = u64::from(settings.interval_minutes.max(1)) * 60_000;
    // Until the thread has looked, saves do not start another one.
    state.history_next.store(at + every, Ordering::Relaxed);
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let Some((root, history)) = open_history(&state) else {
            return;
        };
        let _one = state
            .history_lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if reason == "open" {
            history.prune(settings.keep_days.max(1), at);
        } else if !history.due(settings.interval_minutes.max(1), at) {
            let last = history.last().unwrap_or(at);
            state.history_next.store(last + every, Ordering::Relaxed);
            return;
        }
        match history.snapshot(&root, reason, at) {
            Ok(Some(_)) => {
                let _ = app.emit("history:changed", ());
            }
            Ok(None) => {}
            Err(e) => tracing::warn!("history of {}: {e}", root.display()),
        }
    });
}

/// Drops the histories nothing was added to for longer than what is kept
/// (projects that were moved, renamed outside RayTeX or thrown away).
pub fn forget_old(state: &AppState) {
    let keep = u64::from(state.settings().history.keep_days.max(1)) * 24 * 3_600_000;
    let at = now();
    for entry in std::fs::read_dir(&state.paths.history)
        .into_iter()
        .flatten()
        .flatten()
    {
        let history = History::at(entry.path());
        if history
            .last()
            .is_none_or(|last| at.saturating_sub(last) > keep)
        {
            let _ = history.clear();
        }
    }
}

/// What the window of the history shows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryView {
    /// The project has a history (not a file opened on its own).
    pub available: bool,
    /// The moments, the latest first.
    pub moments: Vec<Moment>,
    /// Size on disk, in bytes.
    pub size: u64,
}

/// The history of the open project.
#[tauri::command]
pub async fn history_list(app: AppHandle) -> CmdResult<HistoryView> {
    blocking(&app, |_, state| match open_history(state) {
        Some((_, history)) => HistoryView {
            available: true,
            moments: history.list(),
            size: history.size(),
        },
        None => HistoryView {
            available: false,
            moments: Vec::new(),
            size: 0,
        },
    })
    .await
}

/// The files of the project that are not what they were at a moment.
#[tauri::command]
pub async fn history_changes(app: AppHandle, id: String) -> CmdResult<Vec<Change>> {
    blocking(&app, move |_, state| {
        open_history(state)
            .map(|(root, history)| history.changes_since(&id, &root))
            .unwrap_or_default()
    })
    .await
}

/// A file then and now.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    /// Its text at the moment (`None` when it did not exist).
    pub then: Option<String>,
    /// Whether it exists now.
    pub exists: bool,
    /// From what it was to what it is, line by line.
    pub lines: Vec<DiffLine>,
}

/// Compares a file of the project (`file`: its path in the project) with
/// what it was at a moment.
#[tauri::command]
pub async fn history_compare(app: AppHandle, id: String, file: String) -> CmdResult<Comparison> {
    blocking(&app, move |_, state| {
        let (root, history) = open_history(state).ok_or("no project")?;
        if file.split('/').any(|part| part == "..") {
            return Err("outside the project".to_owned());
        }
        let then = history.read(&id, &file);
        let now = std::fs::read(root.join(&file))
            .ok()
            .map(|b| String::from_utf8_lossy(&b).into_owned());
        let lines = history::diff(then.as_deref().unwrap_or(""), now.as_deref().unwrap_or(""));
        Ok(Comparison {
            then,
            exists: now.is_some(),
            lines,
        })
    })
    .await?
}

/// Takes a moment now, whatever the time since the last one (`manual` when
/// the user asks, `before-restore` before files are put back). `None` when
/// nothing changed since the last moment.
#[tauri::command]
pub async fn history_keep(app: AppHandle, reason: String) -> CmdResult<Option<Moment>> {
    blocking(&app, move |app, state| {
        let (root, history) = open_history(state).ok_or("no project")?;
        let _one = state
            .history_lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let reason = if reason == "before-restore" {
            "before-restore"
        } else {
            "manual"
        };
        let moment = history.snapshot(&root, reason, now()).map_err(err)?;
        if moment.is_some() {
            let _ = app.emit("history:changed", ());
        }
        Ok(moment)
    })
    .await?
}

/// Forgets the history of the open project.
#[tauri::command]
pub async fn history_clear(app: AppHandle) -> CmdResult<()> {
    blocking(&app, |app, state| {
        let (_, history) = open_history(state).ok_or("no project")?;
        let _one = state
            .history_lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        history.clear().map_err(err)?;
        state.history_next.store(0, Ordering::Relaxed);
        let _ = app.emit("history:changed", ());
        Ok(())
    })
    .await?
}

/// The PDF of what changed since a moment.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesPdf {
    /// The PDF, kept with the cache of the application.
    pub pdf: PathBuf,
    /// Errors of its build (a document of changes often has a few and
    /// still gives its pages).
    pub errors: usize,
}

/// Removes the document of the changes when its build is over, however it ends.
struct Transient<'a> {
    state: &'a AppState,
    tex: PathBuf,
    out_dir: Option<PathBuf>,
}

impl Drop for Transient<'_> {
    fn drop(&mut self) {
        self.state.note_own_write(&self.tex);
        let _ = std::fs::remove_file(&self.tex);
        if let Some(dir) = &self.out_dir {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

/// Builds the PDF of what changed in the document of `path` since the
/// moment `id`: the document latexdiff writes is compiled like the project
/// (same engine, same bibliography tool), next to its main file so that its
/// pictures and its bibliography are found, and removed once compiled.
///
/// Fails with a word the interface knows: `no-distribution`, `no-latexdiff`,
/// `no-main`, `no-document`, `exists`, `cancelled`, or `latexdiff:…` and `build:…` followed
/// by what the program said.
#[tauri::command]
pub async fn history_changes_pdf(
    app: AppHandle,
    path: String,
    id: String,
) -> CmdResult<ChangesPdf> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        let (root_dir, history) = open_history(state).ok_or("no-project")?;
        let prep = super::build::prepare(state, &file).ok_or("no-project")?;
        let dist = state.active_distribution().ok_or("no-distribution")?;
        let lang = state.lang();
        let cancel = state.changes_cancel.clone();
        cancel.store(false, Ordering::SeqCst);
        let name = history::folder(Path::new(""), &root_dir);
        let work = state.paths.cache.join("changes").join(name);

        let text = history
            .changes_document(&id, &root_dir, &prep.root, &dist, &work.join("then"))
            .map_err(|e| match e {
                ChangesError::NoLatexdiff => "no-latexdiff".to_owned(),
                ChangesError::NoMain => "no-main".to_owned(),
                ChangesError::NoDocument => "no-document".to_owned(),
                ChangesError::Failed(said) => format!("latexdiff:{said}"),
                ChangesError::Io(e) => e.to_string(),
            })?;
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".to_owned());
        }

        // Next to the main file: what it reads by a relative path is found.
        let dir = prep.root.parent().ok_or("no-project")?;
        let tex = dir.join(format!("{CHANGES_JOB}.tex"));
        // A file of that name that is not one of ours is left alone.
        if tex.exists() && !std::fs::read_to_string(&tex).is_ok_and(|t| t.starts_with("%DIF")) {
            return Err("exists".to_owned());
        }
        let mut transient = Transient {
            state,
            tex: tex.clone(),
            out_dir: None,
        };
        state.note_own_write(&tex);
        std::fs::write(&tex, text).map_err(err)?;

        // Built in a folder of its own: nothing of the build of the project
        // is touched, and the folder goes away with what it holds.
        let mut settings = prep.settings.clone();
        let out = settings.out_dir.trim().trim_end_matches(['/', '\\']);
        settings.out_dir = if out.is_empty() || out == "." {
            format!("{CHANGES_JOB}-build")
        } else {
            format!("{out}/{CHANGES_JOB}")
        };
        settings.synctex = false;
        settings.precompile_preamble = false;
        settings.halt_on_error = false;
        settings.copy_pdf_to_root = false;
        let plan = build::plan(&tex, &settings, Some(&dist), &prep.facts, lang)
            .map_err(|e| format!("build:{}", e.to_diagnostic(lang).message))?;
        transient.out_dir = Some(plan.out_dir.clone());
        let source = |p: &Path| std::fs::read_to_string(p).ok();
        let ctx = RunContext {
            dist: &dist,
            settings: &settings,
            cancel: &cancel,
            lang,
            source: &source,
            packages: None,
            background: false,
        };
        let outcome = build::run(&plan, &ctx, &mut |_: BuildEvent| {});
        if outcome.cancelled {
            return Err("cancelled".to_owned());
        }
        let errors: Vec<_> = outcome
            .diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();
        let Some(built) = outcome.pdf.as_ref().filter(|p| p.is_file()) else {
            let why = errors
                .first()
                .map(|d| d.message.lines().next().unwrap_or_default().to_owned())
                .unwrap_or_default();
            return Err(format!("build:{why}"));
        };
        let stem = prep
            .root
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "document".into());
        std::fs::create_dir_all(&work).map_err(err)?;
        let pdf = work.join(format!("{stem}-changes.pdf"));
        std::fs::copy(built, &pdf).map_err(err)?;
        Ok(ChangesPdf {
            pdf,
            errors: errors.len(),
        })
    })
    .await?
}

/// Stops the PDF of the changes being built.
#[tauri::command]
pub async fn history_changes_cancel(state: State<'_, AppState>) -> CmdResult<()> {
    state.changes_cancel.store(true, Ordering::SeqCst);
    Ok(())
}
