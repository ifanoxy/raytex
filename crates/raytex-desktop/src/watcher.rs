//! Watches the project folder and keeps the workspace in sync with files
//! changed outside RayTeX (other editors, git, generated files).
//!
//! Emits `fs:changed` `{ paths, structure }`: `structure` is true when files
//! or folders were created, removed or renamed (the tree must refresh).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::event::{AccessKind, AccessMode};
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
    // The system tells the real path of a folder opened through a link
    // (`/var` is `/private/var` on macOS, a synced folder…).
    let real = std::fs::canonicalize(&root).ok().filter(|r| *r != root);
    std::thread::spawn(move || {
        // Debounce: gather events for 150 ms after the first one.
        while let Ok(first) = rx.recv() {
            let mut events = vec![first];
            while let Ok(e) = rx.recv_timeout(Duration::from_millis(150)) {
                events.push(e);
            }
            for e in &mut events {
                for p in &mut e.paths {
                    *p = as_opened(p, &root, real.as_deref());
                }
            }
            handle(&app, &root, events);
        }
    });
    Some(watcher)
}

/// `path` as the project knows it: under `root` as it was opened, when the
/// system gave it under the real path `real` of that folder.
fn as_opened(path: &Path, root: &Path, real: Option<&Path>) -> PathBuf {
    match real.and_then(|r| path.strip_prefix(r).ok()) {
        Some(rel) if !path.starts_with(root) => root.join(rel),
        _ => path.to_path_buf(),
    }
}

fn ignored(root: &Path, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return true;
    };
    rel.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('.') || s == "node_modules"
    }) || path.extension().is_some_and(|e| e == "lbt-tmp")
        // The document of the changes of the history, there for one build.
        || rel.components().any(|c| {
            let name = c.as_os_str().to_string_lossy();
            name.starts_with(raytex_core::history::CHANGES_JOB)
        })
}

/// Whether an event says a file changed: Linux tells every opening and
/// every reading too (by TeX, by a viewer, by the application itself, whose
/// reading of a file said changed was told again as a change).
fn is_change(kind: &EventKind) -> bool {
    match kind {
        EventKind::Access(AccessKind::Close(AccessMode::Write)) => true,
        EventKind::Access(_) => false,
        _ => true,
    }
}

fn handle(app: &AppHandle, root: &Path, events: Vec<notify::Event>) {
    let state = app.state::<AppState>();
    let mut paths = BTreeSet::new();
    // Written by the application: the project reads them (a file created or
    // imported and not opened is known all the same), the interface is not
    // told (it knows what it wrote).
    let mut own = BTreeSet::new();
    let mut structure = false;
    for e in events.into_iter().filter(|e| is_change(&e.kind)) {
        let is_structure = matches!(
            e.kind,
            EventKind::Create(_)
                | EventKind::Remove(_)
                | EventKind::Modify(notify::event::ModifyKind::Name(_))
        );
        for p in e.paths {
            if ignored(root, &p) {
                continue;
            }
            if state.is_own_write(&p) {
                own.insert(p);
                continue;
            }
            structure |= is_structure;
            paths.insert(p);
        }
    }
    own.retain(|p| !paths.contains(p));
    if paths.is_empty() && own.is_empty() {
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
            own.retain(|p| pr.ws.document(p).is_some());
            structure = false;
        }
        for p in paths.iter().chain(own.iter()) {
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
    if paths.is_empty() {
        return;
    }
    let _ = app.emit(
        "fs:changed",
        Changed {
            paths: paths.into_iter().collect(),
            structure,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, ModifyKind, RemoveKind};

    #[test]
    fn a_file_read_is_not_a_file_changed() {
        for read in [
            AccessKind::Open(AccessMode::Any),
            AccessKind::Open(AccessMode::Read),
            AccessKind::Close(AccessMode::Read),
            AccessKind::Read,
            AccessKind::Any,
        ] {
            assert!(!is_change(&EventKind::Access(read)), "{read:?}");
        }
        for changed in [
            EventKind::Access(AccessKind::Close(AccessMode::Write)),
            EventKind::Modify(ModifyKind::Data(DataChange::Any)),
            EventKind::Modify(ModifyKind::Any),
            EventKind::Create(CreateKind::File),
            EventKind::Remove(RemoveKind::File),
            EventKind::Any,
        ] {
            assert!(is_change(&changed), "{changed:?}");
        }
    }

    #[test]
    fn paths_told_under_the_real_folder_come_back_under_the_one_opened() {
        let root = Path::new("/var/folders/x/projet");
        let real = Some(Path::new("/private/var/folders/x/projet"));
        assert_eq!(
            as_opened(
                Path::new("/private/var/folders/x/projet/main.tex"),
                root,
                real
            ),
            PathBuf::from("/var/folders/x/projet/main.tex")
        );
        // Already under the folder opened, or elsewhere: as they are.
        assert_eq!(
            as_opened(Path::new("/var/folders/x/projet/a.tex"), root, real),
            PathBuf::from("/var/folders/x/projet/a.tex")
        );
        assert_eq!(
            as_opened(Path::new("/other/a.tex"), root, real),
            PathBuf::from("/other/a.tex")
        );
        assert_eq!(
            as_opened(Path::new("/var/folders/x/projet/a.tex"), root, None),
            PathBuf::from("/var/folders/x/projet/a.tex")
        );
    }
}
