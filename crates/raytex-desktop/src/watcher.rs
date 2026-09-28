//! Watches the project folder and keeps the workspace in sync with files
//! changed outside RayTeX (other editors, git, generated files).
//!
//! Emits `fs:changed` `{ paths, structure }`: `structure` is true when files
//! or folders were created, removed or renamed (the tree must refresh).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
struct Changed {
    paths: Vec<PathBuf>,
    structure: bool,
}

/// Starts watching `root` (and its sub-folders when `recursive`). Returns
/// `None` if the OS refuses.
pub fn watch(app: AppHandle, root: &Path, recursive: bool) -> Option<notify::RecommendedWatcher> {
    let (tx, rx) = mpsc::channel::<notify::Event>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })
    .ok()?;
    let mode = if recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };
    watcher.watch(root, mode).ok()?;
    let root = root.to_path_buf();
    std::thread::spawn(move || {
        // Debounce: gather events for 150 ms after the first one.
        while let Ok(first) = rx.recv() {
            let mut events = vec![first];
            while let Ok(e) = rx.recv_timeout(Duration::from_millis(150)) {
                events.push(e);
            }
            handle(&app, &root, events);
        }
    });
    Some(watcher)
}

fn ignored(root: &Path, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return true;
    };
    rel.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('.') || s == "node_modules"
    }) || path.extension().is_some_and(|e| e == "lbt-tmp")
}

fn handle(app: &AppHandle, root: &Path, events: Vec<notify::Event>) {
    let state = app.state::<AppState>();
    let mut paths = BTreeSet::new();
    let mut structure = false;
    for e in events {
        let is_structure = matches!(
            e.kind,
            EventKind::Create(_)
                | EventKind::Remove(_)
                | EventKind::Modify(notify::event::ModifyKind::Name(_))
        );
        for p in e.paths {
            if ignored(root, &p) || state.is_own_write(&p) {
                continue;
            }
            structure |= is_structure;
            paths.insert(p);
        }
    }
    if paths.is_empty() {
        return;
    }
    {
        let mut project = state.project_mut();
        let Some(pr) = project.as_mut() else { return };
        if pr.ws.root_dir != root {
            return;
        }
        // Light mode: only the files of the document matter, not its neighbours.
        if pr.light.is_some() {
            paths.retain(|p| pr.ws.document(p).is_some());
            if paths.is_empty() {
                return;
            }
            structure = false;
        }
        for p in &paths {
            if pr.light.is_none()
                && p.file_name()
                    .is_some_and(|n| n == raytex_core::settings::PROJECT_FILE)
            {
                pr.ws.reload_config();
            } else if p.exists() {
                pr.ws.load_from_disk(p);
            } else {
                pr.ws.remove(p);
            }
        }
    }
    let _ = app.emit(
        "fs:changed",
        Changed {
            paths: paths.into_iter().collect(),
            structure,
        },
    );
}
