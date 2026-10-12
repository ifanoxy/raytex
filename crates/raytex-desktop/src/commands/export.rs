//! Exporting the open project as an archive (`raytex_core::export`): what
//! it will hold, shown before anything is written, then the `.zip` where
//! the user says.

use std::path::{Path, PathBuf};

use raytex_core::export::{self, ExportOptions, ExportPlan, Target};
use raytex_core::log::normalize;
use tauri::AppHandle;

use super::{CmdResult, abs, blocking, err};
use crate::state::AppState;

/// A document: its folder, its main file, where it is built, its `.bib` files.
type Document = (PathBuf, PathBuf, PathBuf, Vec<PathBuf>);

/// The document of `file` in the open project. `None` without a project,
/// and for a file opened on its own (it has no folder of its own to export).
fn document(state: &AppState, file: &Path) -> Option<Document> {
    state.project().as_ref().filter(|pr| pr.light.is_none())?;
    built_document(state, file)
}

/// The document of `file` as it is built, a file opened on its own included.
fn built_document(state: &AppState, file: &Path) -> Option<Document> {
    let prep = super::build::prepare(state, file)?;
    let project = state.project();
    let pr = project.as_ref()?;
    let main_dir = prep.root.parent()?.to_path_buf();
    let out = prep.settings.out_dir.trim();
    let out_dir = if out.is_empty() || out == "." {
        main_dir
    } else {
        normalize(&main_dir.join(out))
    };
    let bib_files = pr.ws.bib_files(&prep.root);
    Some((pr.ws.root_dir.clone(), prep.root, out_dir, bib_files))
}

/// Whether the PDF of the document of `path` is that of its files as they
/// are: whole, and built since the last change of what it reads. It is not
/// while a build runs.
#[tauri::command]
pub async fn pdf_fresh(app: AppHandle, path: String) -> CmdResult<bool> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        if state.build().running.is_some() {
            return false;
        }
        let Some((root_dir, main, out_dir, bib_files)) = built_document(state, &file) else {
            return false;
        };
        export::pdf_fresh(&Target {
            root_dir: &root_dir,
            main: &main,
            out_dir: &out_dir,
            bib_files: &bib_files,
        })
    })
    .await
}

/// What an export of the document of `path` would hold.
#[tauri::command]
pub async fn export_plan(
    app: AppHandle,
    path: String,
    options: ExportOptions,
) -> CmdResult<ExportPlan> {
    let file = abs(&path);
    blocking(&app, move |_, state| {
        let (root_dir, main, out_dir, bib_files) = document(state, &file).ok_or("no project")?;
        let target = Target {
            root_dir: &root_dir,
            main: &main,
            out_dir: &out_dir,
            bib_files: &bib_files,
        };
        Ok(export::plan(&target, &options))
    })
    .await?
}

/// Writes the archive at `dest`. Returns its size in bytes.
#[tauri::command]
pub async fn export_write(
    app: AppHandle,
    path: String,
    options: ExportOptions,
    dest: String,
) -> CmdResult<u64> {
    let file = abs(&path);
    let dest = abs(&dest);
    blocking(&app, move |_, state| {
        let (root_dir, main, out_dir, bib_files) = document(state, &file).ok_or("no project")?;
        let target = Target {
            root_dir: &root_dir,
            main: &main,
            out_dir: &out_dir,
            bib_files: &bib_files,
        };
        let plan = export::plan(&target, &options);
        if plan.files.is_empty() {
            return Err("nothing to export".to_owned());
        }
        // An archive written in the project is not one of its files.
        state.note_own_write(&dest);
        export::write(&plan, &target, &options, &dest).map_err(err)
    })
    .await?
}
