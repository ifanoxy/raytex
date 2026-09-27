//! Images, fonts and TikZ pictures: importing them into the project and
//! previewing them before they are added to the document.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use labaguetex_core::fonts::{self, FontFamily, FontRole, TexFont};
use labaguetex_core::preview::{self, PreviewOutcome, PreviewRequest};
use labaguetex_core::tex::Engine;
use labaguetex_core::tikz::{self, TikzTemplate};
use labaguetex_core::{build, images};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use super::{CmdResult, abs, blocking, writable_path};
use crate::state::AppState;

// ------------------------------------------------------------------ images

/// Copies an image into a folder of the project under a LaTeX-safe name,
/// converting SVG drawings to PDF. Returns the new file.
#[tauri::command]
pub async fn import_image(
    app: AppHandle,
    source: String,
    dir: String,
    name: Option<String>,
) -> CmdResult<String> {
    let dir_path = {
        let state = app.state::<AppState>();
        writable_path(&state, &dir)?
    };
    let source = abs(&source);
    blocking(&app, move |app, state| {
        let target = images::import(&source, &dir_path, name.as_deref())?;
        state.note_own_write(&target);
        let _ = app.asset_protocol_scope().allow_file(&target);
        Ok(target.to_string_lossy().into_owned())
    })
    .await?
}

/// Converts SVG data (a pasted drawing) to a PDF in a folder of the project.
/// The folder and the file name are in the `x-dir` and `x-name` headers;
/// the SVG is the raw request body. Returns the new file.
#[tauri::command]
pub async fn import_svg_data(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> CmdResult<String> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(super::files::percent_decode)
            .ok_or(format!("missing {name} header"))
    };
    let dir = header("x-dir")?;
    let name = header("x-name")?;
    let dir_path = {
        let state = app.state::<AppState>();
        writable_path(&state, &dir)?
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let bytes = bytes.clone();
    blocking(&app, move |_, state| {
        std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
        let pdf = images::svg_to_pdf(&bytes)?;
        let stem = images::latex_file_name(&name);
        let stem = stem
            .rsplit_once('.')
            .map_or(stem.as_str(), |(s, _)| s)
            .to_owned();
        let target = images::unique_path(&dir_path, &format!("{stem}.pdf"));
        state.note_own_write(&target);
        std::fs::write(&target, pdf).map_err(|e| e.to_string())?;
        Ok(target.to_string_lossy().into_owned())
    })
    .await?
}

/// A LaTeX-safe version of a file name (`Mon image.PNG` → `mon-image.png`).
#[tauri::command]
pub async fn safe_file_name(name: String) -> CmdResult<String> {
    Ok(images::latex_file_name(&name))
}

// ------------------------------------------------------------------- fonts

/// Font families installed on the system (read once, then cached).
#[tauri::command]
pub async fn system_fonts(app: AppHandle) -> CmdResult<Arc<Vec<FontFamily>>> {
    blocking(&app, |_, state| {
        if let Some(cached) = state.system_fonts.lock().ok().and_then(|g| g.clone()) {
            return cached;
        }
        let families = Arc::new(fonts::system_families());
        if let Ok(mut g) = state.system_fonts.lock() {
            *g = Some(families.clone());
        }
        families
    })
    .await
}

/// Families and styles found in font files.
#[tauri::command]
pub async fn inspect_fonts(app: AppHandle, paths: Vec<String>) -> CmdResult<Vec<FontFamily>> {
    let paths: Vec<PathBuf> = paths.iter().map(|p| abs(p)).collect();
    blocking(&app, move |_, _| fonts::inspect_files(&paths)).await
}

/// Whether a font can typeset mathematics (OpenType `MATH` table).
#[tauri::command]
pub async fn font_has_math(app: AppHandle, path: String, index: u32) -> CmdResult<bool> {
    let p = abs(&path);
    blocking(&app, move |_, _| fonts::has_math_table(&p, index)).await
}

/// Copies font files into a folder of the project. Returns the new files.
#[tauri::command]
pub async fn import_fonts(
    app: AppHandle,
    sources: Vec<String>,
    dir: String,
) -> CmdResult<Vec<String>> {
    let dir_path = {
        let state = app.state::<AppState>();
        writable_path(&state, &dir)?
    };
    blocking(&app, move |_, state| {
        std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for s in sources {
            let src = abs(&s);
            let name = src
                .file_name()
                .map(|n| images::latex_file_name(&n.to_string_lossy()))
                .ok_or("invalid file")?;
            let target = dir_path.join(&name);
            // The same font imported twice is reused, not duplicated.
            if !(target.exists()
                && std::fs::metadata(&target).ok().map(|m| m.len())
                    == std::fs::metadata(&src).ok().map(|m| m.len()))
            {
                state.note_own_write(&target);
                std::fs::copy(&src, &target).map_err(|e| format!("{}: {e}", src.display()))?;
            }
            out.push(target.to_string_lossy().into_owned());
        }
        Ok(out)
    })
    .await?
}

/// Preamble code loading a family with fontspec.
#[tauri::command]
pub async fn fontspec_code(
    family: FontFamily,
    role: FontRole,
    dir: Option<String>,
    command: String,
) -> CmdResult<String> {
    Ok(fonts::fontspec_code(
        &family,
        role,
        dir.as_deref(),
        &command,
    ))
}

/// LaTeX font packages (they also work with pdfLaTeX).
#[tauri::command]
pub async fn tex_fonts(app: AppHandle) -> CmdResult<Vec<TexFontView>> {
    let lang = app.state::<AppState>().lang();
    Ok(fonts::tex_fonts(lang)
        .into_iter()
        .map(TexFontView::from)
        .collect())
}

/// A LaTeX font package with its preamble code.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexFontView {
    #[serde(flatten)]
    font: TexFont,
    code: String,
}

impl From<TexFont> for TexFontView {
    fn from(font: TexFont) -> Self {
        let code = font.code();
        Self { font, code }
    }
}

// -------------------------------------------------------------------- TikZ

/// Every TikZ library (for `\usetikzlibrary`).
#[tauri::command]
pub async fn tikz_libraries() -> CmdResult<Vec<&'static str>> {
    Ok(labaguetex_core::completion::data::TIKZ_LIBRARIES.to_vec())
}

/// The gallery of TikZ pictures.
#[tauri::command]
pub async fn tikz_templates(app: AppHandle) -> CmdResult<Vec<TikzTemplate>> {
    Ok(tikz::templates(app.state::<AppState>().lang()))
}

/// A preview to compile (TikZ picture, font sample…).
#[derive(Debug, Clone, Deserialize, Hash)]
#[serde(rename_all = "camelCase")]
pub struct SnippetRequest {
    /// A file of the project: its root document gives the folder and the preamble.
    pub path: String,
    /// Kind of preview (`tikz`, `font`…): one result is kept per kind.
    pub job: String,
    /// Options of the `standalone` class.
    pub class_options: String,
    /// Reuse the preamble of the document (colours, macros, fonts).
    pub project_preamble: bool,
    /// Packages to load.
    #[serde(default)]
    pub packages: Vec<String>,
    /// TikZ libraries.
    #[serde(default)]
    pub libraries: Vec<String>,
    /// Extra preamble lines.
    #[serde(default)]
    pub extra: String,
    /// Body of the document.
    pub body: String,
    /// Engine; the document's own engine when absent.
    #[serde(default)]
    pub engine: Option<Engine>,
}

/// Compiles a small standalone document next to the project.
#[tauri::command]
pub async fn preview_snippet(app: AppHandle, request: SnippetRequest) -> CmdResult<PreviewOutcome> {
    blocking(&app, move |_, state| {
        let file = abs(&request.path);
        let dist = state.active_distribution().ok_or("no TeX distribution")?;
        let lang = state.lang();
        let (root, root_text, engine) = {
            let prepared = super::build::prepare(state, &file);
            let project = state.project();
            let ws = project.as_ref().map(|p| &p.ws);
            let root = prepared
                .as_ref()
                .map(|p| p.root.clone())
                .unwrap_or_else(|| file.clone());
            let text = ws
                .and_then(|ws| ws.document(&root).map(|d| d.text.clone()))
                .or_else(|| std::fs::read_to_string(&root).ok())
                .unwrap_or_default();
            let engine = request.engine.or_else(|| {
                let p = prepared.as_ref()?;
                build::plan(&p.root, &p.settings, Some(&dist), &p.facts, lang)
                    .ok()
                    .map(|plan| plan.engine)
            });
            (root, text, engine.unwrap_or(Engine::Pdflatex))
        };
        let project = if request.project_preamble {
            preview::project_preamble(&root_text)
        } else {
            String::new()
        };
        let preamble =
            if !request.libraries.is_empty() || request.packages.iter().any(|p| p == "tikz") {
                tikz::preview_preamble(
                    &project,
                    &request.packages,
                    &request.libraries,
                    &request.extra,
                )
            } else {
                let mut p = project;
                for pkg in &request.packages {
                    p.push_str(&format!("\\usepackage{{{pkg}}}\n"));
                }
                p.push_str(&request.extra);
                p
            };
        let workdir = root
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| file.clone());
        let mut hasher = DefaultHasher::new();
        (
            &preamble,
            &request.body,
            &request.class_options,
            engine,
            &workdir,
        )
            .hash(&mut hasher);
        let key = hasher.finish();
        // One preview at a time: TeX runs are short, and the files are shared.
        let mut previews = state.previews.lock().map_err(|e| e.to_string())?;
        if let Some((k, outcome)) = previews.get(&request.job)
            && *k == key
            && outcome.pdf.as_ref().is_some_and(|p| p.exists())
        {
            return Ok(outcome.clone());
        }
        let out_dir = state.paths.cache.join("previews");
        let job = format!(
            "{}-preview",
            request
                .job
                .replace(|c: char| !c.is_ascii_alphanumeric(), "")
        );
        let outcome = preview::compile(
            &dist,
            &PreviewRequest {
                class_options: &request.class_options,
                preamble: &preamble,
                body: &request.body,
                engine,
                workdir: &workdir,
                out_dir: &out_dir,
                job: &job,
                timeout: Duration::from_secs(60),
                lang,
            },
        );
        previews.insert(request.job.clone(), (key, outcome.clone()));
        Ok(outcome)
    })
    .await?
}
