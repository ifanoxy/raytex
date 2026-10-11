//! The local history of the open project (`raytex_core::history`): moments
//! taken while it changes, at most one every few minutes, and what the
//! window of the history shows of them.
//!
//! Nothing here goes into the folder of the project: the history is kept
//! with the data of the application. A file opened on its own has none (it
//! has no folder of its own).

use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use raytex_core::history::{self, Change, DiffLine, History, Moment};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::{CmdResult, blocking, err};
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
