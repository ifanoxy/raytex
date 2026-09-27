//! IPC commands called by the user interface.
//!
//! Every command is `async` so that it never runs on the main (UI) thread;
//! CPU- or IO-heavy work is moved to the blocking thread pool with
//! [`blocking`]. Errors are returned as human-readable strings.

pub mod app;
pub mod build;
pub mod files;
pub mod help;
pub mod language;
pub mod media;
pub mod project;
pub mod synctex;
pub mod tex;

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Result type of commands.
pub type CmdResult<T> = Result<T, String>;

/// Converts any error into a command error.
pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Runs `f` on the blocking thread pool with access to the state.
pub async fn blocking<T, F>(app: &AppHandle, f: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle, &AppState) -> T + Send + 'static,
{
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        f(&app, &state)
    })
    .await
    .map_err(err)
}

/// Makes `path` absolute and normalized.
pub fn abs(path: &str) -> PathBuf {
    labaguetex_core::workspace::absolute(Path::new(path))
}

/// Ensures that `path` is inside the open project (or the user templates),
/// for operations that modify the file system.
pub fn writable_path(state: &AppState, path: &str) -> CmdResult<PathBuf> {
    let p = abs(path);
    let project = state.project();
    let inside_project = project
        .as_ref()
        .is_some_and(|pr| p.starts_with(&pr.ws.root_dir));
    if inside_project || p.starts_with(&state.paths.templates) {
        Ok(p)
    } else {
        Err(format!("{} is outside the open project", p.display()))
    }
}
