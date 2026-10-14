//! Source ⇄ PDF navigation (SyncTeX).

use std::path::{Path, PathBuf};

use raytex_core::synctex::{ForwardResult, InverseResult};
use serde::Serialize;
use tauri::AppHandle;

use super::{CmdResult, abs, blocking};

/// Where a source line is in the PDF.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardView {
    /// The PDF.
    pub pdf: PathBuf,
    /// Page and rectangles.
    #[serde(flatten)]
    pub result: ForwardResult,
}

fn synctex_for_pdf(pdf: &Path) -> Option<PathBuf> {
    let gz = pdf.with_extension("synctex.gz");
    if gz.exists() {
        return Some(gz);
    }
    let plain = pdf.with_extension("synctex");
    plain.exists().then_some(plain)
}

/// Source → PDF: where `line` (one-based) of `path` appears.
#[tauri::command]
///
/// `pdf`: the PDF on screen, looked into first (a file of the document
/// shown on its own has a PDF of its own).
pub async fn synctex_forward(
    app: AppHandle,
    path: String,
    line: u32,
    pdf: Option<String>,
) -> CmdResult<Option<ForwardView>> {
    let file = abs(&path);
    let shown = pdf.map(|p| abs(&p));
    blocking(&app, move |_, state| {
        if let Some(pdf) = shown
            && let Some(data) = synctex_for_pdf(&pdf).and_then(|s| state.synctex(&s))
            && let Some(result) = data.forward(&file, line)
        {
            return Some(ForwardView { pdf, result });
        }
        let (root, out_dir) = {
            let base = state.settings().build.clone();
            let project = state.project();
            let ws = &project.as_ref()?.ws;
            let root = ws.root_for(&file);
            let settings = ws.config.effective_build(&base);
            let out = raytex_core::log::normalize(&root.parent()?.join(&settings.out_dir));
            (root, out)
        };
        let pdf = out_dir.join(format!("{}.pdf", root.file_stem()?.to_string_lossy()));
        let data = state.synctex(&synctex_for_pdf(&pdf)?)?;
        data.forward(&file, line)
            .map(|result| ForwardView { pdf, result })
    })
    .await
}

/// PDF → source: which line produced point `(x, y)` (PDF points from the top-left) of `page`.
#[tauri::command]
pub async fn synctex_inverse(
    app: AppHandle,
    pdf: String,
    page: u32,
    x: f64,
    y: f64,
) -> CmdResult<Option<InverseResult>> {
    let pdf = abs(&pdf);
    blocking(&app, move |_, state| {
        let data = state.synctex(&synctex_for_pdf(&pdf)?)?;
        let mut found = data.inverse(page, x, y)?;
        // The file as the project names it (not a second, read-only copy).
        if let Some(pr) = state.project().as_ref() {
            let root = &pr.ws.root_dir;
            let real_root = dunce::canonicalize(root).ok();
            found.file =
                raytex_core::workspace::project_form(root, real_root.as_deref(), found.file);
        }
        Some(found)
    })
    .await
}
