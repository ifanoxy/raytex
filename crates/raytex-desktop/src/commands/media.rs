//! Images, fonts and TikZ pictures: importing them into the project and
//! previewing them before they are added to the document.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use raytex_core::fonts::{self, FontFamily, FontRole, TexFont};
use raytex_core::images::{Compression, CompressionLevel};
use raytex_core::preview::{self, PreviewOutcome, PreviewRequest};
use raytex_core::tex::Engine;
use raytex_core::tikz::{self, TikzTemplate};
use raytex_core::{build, images};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::{CmdResult, abs, blocking, writable_path};
use crate::state::AppState;

// ------------------------------------------------------------------ images

/// Copies an image into a folder of the project under a LaTeX-safe name,
/// converting SVG drawings to PDF, and making a PNG or a JPEG lighter when
/// `level` says so (the image that was chosen is not touched). Returns the
/// new file.
#[tauri::command]
pub async fn import_image(
    app: AppHandle,
    source: String,
    dir: String,
    name: Option<String>,
    level: Option<CompressionLevel>,
) -> CmdResult<String> {
    let dir_path = {
        let state = app.state::<AppState>();
        writable_path(&state, &dir)?
    };
    let source = abs(&source);
    blocking(&app, move |app, state| {
        let target = images::import_with(
            &source,
            &dir_path,
            name.as_deref(),
            level.map(Compression::from),
        )?;
        state.note_own_write(&target);
        let _ = app.asset_protocol_scope().allow_file(&target);
        Ok(target.to_string_lossy().into_owned())
    })
    .await?
}

/// A header of a request that carries its data as its body.
fn header(request: &tauri::ipc::Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(super::files::percent_decode)
}

/// The compression a request names in its `x-level` header, if any.
fn level_of(request: &tauri::ipc::Request<'_>) -> Option<Compression> {
    match header(request, "x-level").as_deref() {
        Some("balanced") => Some(Compression::BALANCED),
        Some("light") => Some(Compression::LIGHT),
        _ => None,
    }
}

/// Writes an image given as data (pasted, or converted by the interface)
/// into a folder of the project, lighter when the `x-level` header says so.
/// The folder and the file name (with its extension) are in the `x-dir` and
/// `x-name` headers; the image is the raw request body. Returns the new file.
#[tauri::command]
pub async fn import_image_data(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> CmdResult<String> {
    let dir = header(&request, "x-dir").ok_or("missing x-dir header")?;
    let name = header(&request, "x-name").ok_or("missing x-name header")?;
    let how = level_of(&request);
    let dir_path = {
        let state = app.state::<AppState>();
        writable_path(&state, &dir)?
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let bytes = bytes.clone();
    blocking(&app, move |app, state| {
        let target = images::import_data(&bytes, &dir_path, &name, how)?;
        state.note_own_write(&target);
        let _ = app.asset_protocol_scope().allow_file(&target);
        Ok(target.to_string_lossy().into_owned())
    })
    .await?
}

/// What an image weighs, and what it would weigh made lighter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageWeight {
    /// Its size as it is, in bytes.
    pub original: u64,
    /// Its size made lighter; `None` when there is nothing to gain.
    pub compressed: Option<u64>,
    /// The extension of the lighter copy (`jpg` for a photograph kept as PNG).
    pub ext: Option<String>,
}

fn weigh(data: &[u8], how: Compression) -> ImageWeight {
    let lighter = images::compress(data, how, false);
    ImageWeight {
        original: data.len() as u64,
        compressed: lighter.as_ref().map(|c| c.data.len() as u64),
        ext: lighter.map(|c| c.ext.to_owned()),
    }
}

/// What the image file `path` would weigh at `level`.
#[tauri::command]
pub async fn image_weight(
    app: AppHandle,
    path: String,
    level: CompressionLevel,
) -> CmdResult<ImageWeight> {
    let path = abs(&path);
    blocking(&app, move |_, _| {
        let data = std::fs::read(&path).map_err(|e| e.to_string())?;
        Ok(weigh(&data, level.into()))
    })
    .await?
}

/// What an image given as data (the raw request body) would weigh at the
/// level of the `x-level` header.
#[tauri::command]
pub async fn image_weight_data(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> CmdResult<ImageWeight> {
    let how = level_of(&request).ok_or("missing x-level header")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let bytes = bytes.clone();
    blocking(&app, move |_, _| weigh(&bytes, how)).await
}

/// Converts SVG data (a pasted drawing) to a PDF in a folder of the project.
/// The folder and the file name are in the `x-dir` and `x-name` headers;
/// the SVG is the raw request body. Returns the new file.
#[tauri::command]
pub async fn import_svg_data(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> CmdResult<String> {
    let dir = header(&request, "x-dir").ok_or("missing x-dir header")?;
    let name = header(&request, "x-name").ok_or("missing x-name header")?;
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
    Ok(raytex_core::completion::data::TIKZ_LIBRARIES.to_vec())
}

/// The gallery of TikZ pictures.
#[tauri::command]
pub async fn tikz_templates(app: AppHandle) -> CmdResult<Vec<TikzTemplate>> {
    Ok(tikz::templates(app.state::<AppState>().lang()))
}

/// Shapes of the TikZ whiteboard kept under a name, to be drawn again in
/// any picture of any project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TikzSet {
    /// Identifier (never shown).
    pub id: String,
    /// Name given by the user.
    pub name: String,
    /// The TikZ statements of its shapes.
    pub code: String,
}

/// The sets are kept next to the settings, in a file of their own.
fn sets_file(state: &AppState) -> PathBuf {
    state.paths.settings.with_file_name("tikz-sets.json")
}

/// The sets of the user; none when the file is not there or cannot be read.
#[tauri::command]
pub async fn tikz_sets(app: AppHandle) -> CmdResult<Vec<TikzSet>> {
    let file = sets_file(&app.state::<AppState>());
    Ok(std::fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default())
}

/// Writes the sets of the user (all of them, in their order).
#[tauri::command]
pub async fn save_tikz_sets(app: AppHandle, sets: Vec<TikzSet>) -> CmdResult<()> {
    // A file written by hand could not grow without end either.
    if sets.len() > 500 || sets.iter().any(|s| s.code.len() > 200_000) {
        return Err("too many sets, or a set too large".into());
    }
    let file = sets_file(&app.state::<AppState>());
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&sets).map_err(|e| e.to_string())?;
    raytex_core::settings::write_atomic(&file, json.as_bytes()).map_err(|e| e.to_string())
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

/// The root document of `file`, its text (as it is in the editor) and the
/// engine that compiles it.
fn preview_context(
    state: &AppState,
    file: &std::path::Path,
    engine: Option<Engine>,
    dist: &raytex_core::tex::Distribution,
) -> (PathBuf, String, Engine) {
    let lang = state.lang();
    let prepared = super::build::prepare(state, file);
    let project = state.project();
    let ws = project.as_ref().map(|p| &p.ws);
    let root = prepared
        .as_ref()
        .map(|p| p.root.clone())
        .unwrap_or_else(|| file.to_path_buf());
    let text = ws
        .and_then(|ws| ws.document(&root).map(|d| d.text.clone()))
        .or_else(|| std::fs::read_to_string(&root).ok())
        .unwrap_or_default();
    let engine = engine.or_else(|| {
        let p = prepared.as_ref()?;
        build::plan(&p.root, &p.settings, Some(dist), &p.facts, lang)
            .ok()
            .map(|plan| plan.engine)
    });
    (root, text, engine.unwrap_or(Engine::Pdflatex))
}

/// The commands of the project a preview of `root` does not get from the
/// preamble (`all`: every one, for a preview that leaves the preamble
/// aside): a picture or a title that uses a command of a chapter is shown
/// as the document shows it.
fn project_commands(state: &AppState, root: &std::path::Path, all: bool) -> String {
    state
        .project()
        .as_ref()
        .map(|pr| raytex_core::custom::preview_definitions(&pr.ws, root, all))
        .unwrap_or_default()
}

/// What a preview answers when a newer one of its kind was asked while it
/// waited for its turn: typing while TeX runs (a second or two on Windows)
/// asked for one at each pause, all compiled one after the other, and the
/// picture followed the text several seconds late. Only the last is compiled.
const SUPERSEDED: &str = "superseded";

fn superseded(state: &AppState, job: &str, turn: u64) -> CmdResult<()> {
    if state.preview_turns.is_last(job, turn) {
        Ok(())
    } else {
        Err(SUPERSEDED.into())
    }
}

/// Compiles a small standalone document next to the project.
#[tauri::command]
pub async fn preview_snippet(app: AppHandle, request: SnippetRequest) -> CmdResult<PreviewOutcome> {
    let turn = app.state::<AppState>().preview_turns.ask(&request.job);
    blocking(&app, move |_, state| {
        let file = abs(&request.path);
        let dist = state.active_distribution().ok_or("no TeX distribution")?;
        let lang = state.lang();
        let (root, root_text, engine) = preview_context(state, &file, request.engine, &dist);
        let project = if request.project_preamble {
            preview::project_preamble(&root_text)
        } else {
            String::new()
        };
        let mut preamble =
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
        // After what the preview itself defines (a command being tried):
        // each of these gives way to what is defined already.
        if !preamble.ends_with('\n') {
            preamble.push('\n');
        }
        preamble.push_str(&project_commands(state, &root, !request.project_preamble));
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
        superseded(state, &request.job, turn)?;
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
                document: None,
                engine,
                workdir: &workdir,
                out_dir: &out_dir,
                job: &job,
                timeout: Duration::from_secs(60),
                lang,
                install_missing: state.settings().build.miktex_auto_install,
            },
        );
        previews.insert(request.job.clone(), (key, outcome.clone()));
        Ok(outcome)
    })
    .await?
}

/// A whole document to compile for a picture of its pages (the margins
/// and the page styles being set).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRequest {
    /// A file of the project: its root document gives the folder and the engine.
    pub path: String,
    /// Kind of preview: one result is kept per kind.
    pub job: String,
    /// The document, from its class to `\end{document}`.
    pub source: String,
}

/// Compiles a whole document next to the project, with the engine of the
/// project, without touching its files.
#[tauri::command]
pub async fn preview_page(app: AppHandle, request: PageRequest) -> CmdResult<PreviewOutcome> {
    let turn = app.state::<AppState>().preview_turns.ask(&request.job);
    blocking(&app, move |_, state| {
        let file = abs(&request.path);
        let dist = state.active_distribution().ok_or("no TeX distribution")?;
        let (root, _, engine) = preview_context(state, &file, None, &dist);
        let workdir = root
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| file.clone());
        // The source carries the preamble of the project: what the project
        // defines elsewhere is added at its end.
        let commands = project_commands(state, &root, false);
        let source = match request.source.find("\\begin{document}") {
            Some(at) if !commands.is_empty() => format!(
                "{}{commands}{}",
                &request.source[..at],
                &request.source[at..]
            ),
            _ => request.source.clone(),
        };
        let mut hasher = DefaultHasher::new();
        (&source, engine, &workdir).hash(&mut hasher);
        let key = hasher.finish();
        let mut previews = state.previews.lock().map_err(|e| e.to_string())?;
        superseded(state, &request.job, turn)?;
        if let Some((k, outcome)) = previews.get(&request.job)
            && *k == key
            && outcome.pdf.as_ref().is_some_and(|p| p.exists())
        {
            return Ok(outcome.clone());
        }
        let job = format!(
            "{}-preview",
            request
                .job
                .replace(|c: char| !c.is_ascii_alphanumeric(), "")
        );
        let outcome = preview::compile(
            &dist,
            &PreviewRequest {
                class_options: "",
                preamble: "",
                body: "",
                document: Some(&source),
                engine,
                workdir: &workdir,
                out_dir: &state.paths.cache.join("previews"),
                job: &job,
                timeout: Duration::from_secs(90),
                lang: state.lang(),
                install_missing: state.settings().build.miktex_auto_install,
            },
        );
        previews.insert(request.job.clone(), (key, outcome.clone()));
        Ok(outcome)
    })
    .await?
}
