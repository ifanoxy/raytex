//! Language intelligence: document synchronisation, live diagnostics,
//! completion, hovers, navigation, outline, search, word count.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use raytex_core::completion::{self, CompletionList, CompletionRequest};
use raytex_core::diagnostics::Diagnostic;
use raytex_core::help::markdown_to_html;
use raytex_core::lint::{self, LintOptions};
use raytex_core::navigation::{self, Hover, MathAt, TextEdit};
use raytex_core::syntax::Todo;
use raytex_core::tex::Engine;
use raytex_core::text::Position;
use raytex_core::wordcount::{self, WordCount};
use raytex_core::workspace::{
    CitationItem, LabelItem, Location, OutlineItem, SearchMatch, Workspace,
};
use serde::Serialize;
use tauri::AppHandle;

use super::{CmdResult, abs, blocking, err};
use crate::state::AppState;

/// Result of a document update.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentUpdate {
    /// Version the diagnostics belong to.
    pub version: i64,
    /// Live diagnostics.
    pub diagnostics: Vec<Diagnostic>,
    /// Root document of the file.
    pub root: PathBuf,
}

/// Lint options from the settings, the project and the document.
fn lint_options<'a>(
    state: &AppState,
    ws: &Workspace,
    file: &Path,
    index: Option<&'a raytex_core::tex::TexmfIndex>,
) -> LintOptions<'a> {
    let settings = state.settings();
    let build = ws.config.effective_build(&settings.build);
    let root = ws.root_for(file);
    let magic = ws
        .document(&root)
        .and_then(|d| d.index.magic.program.as_deref().and_then(Engine::parse));
    let mut disabled: HashSet<String> = settings.lint.disabled_rules.iter().cloned().collect();
    disabled.extend(ws.config.lint.disabled_rules.iter().cloned());
    LintOptions {
        lang: state.lang(),
        disabled,
        style_hints: settings.lint.style_hints,
        engine: build.engine.engine().or(magic),
        shell_escape: build.shell_escape,
        installed: index,
    }
}

/// Updates a document from the editor and returns its live diagnostics.
#[tauri::command]
pub async fn update_document(
    app: AppHandle,
    path: String,
    text: String,
    version: i64,
) -> CmdResult<DocumentUpdate> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let enabled = state.settings().lint.enabled;
        let index = state.tex().index.clone();
        let mut project = state.project_mut();
        let pr = project.as_mut().ok_or("no project")?;
        pr.ws.update(&p, text, version);
        let root = pr.ws.root_for(&p);
        let diagnostics = if enabled {
            let opts = lint_options(state, &pr.ws, &p, index.as_deref());
            lint::lint(&pr.ws, &p, &opts)
        } else {
            Vec::new()
        };
        Ok(DocumentUpdate {
            version,
            diagnostics,
            root,
        })
    })
    .await?
}

/// The editor closed a document (the disk version is the reference again).
#[tauri::command]
pub async fn close_document(app: AppHandle, path: String) -> CmdResult<()> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        if let Some(pr) = state.project_mut().as_mut() {
            pr.ws.close(&p);
        }
    })
    .await
}

/// Lints every LaTeX file of the project (for the Problems panel).
#[tauri::command]
pub async fn lint_project(app: AppHandle) -> CmdResult<Vec<Diagnostic>> {
    blocking(&app, move |_, state| {
        let index = state.tex().index.clone();
        let project = state.project();
        let Some(pr) = project.as_ref() else {
            return Vec::new();
        };
        let mut out = Vec::new();
        let mut files: Vec<PathBuf> = pr.ws.documents().map(|d| d.path.clone()).collect();
        files.sort();
        for f in files {
            let opts = lint_options(state, &pr.ws, &f, index.as_deref());
            out.extend(lint::lint(&pr.ws, &f, &opts));
        }
        out
    })
    .await
}

/// Completions at the cursor.
#[tauri::command]
pub async fn complete(
    app: AppHandle,
    path: String,
    before: String,
    after: String,
    explicit: bool,
) -> CmdResult<Option<CompletionList>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let settings = state.settings().clone();
        let project = state.project();
        let pr = project.as_ref()?;
        let req = CompletionRequest {
            file: &p,
            before: &before,
            after: &after,
            explicit,
            lang: state.lang(),
            settings: &settings.completion,
            macros: &settings.macros,
        };
        completion::complete(&pr.ws, &req)
    })
    .await
}

/// Documentation of a completion item (HTML).
#[tauri::command]
pub async fn completion_info(
    app: AppHandle,
    path: String,
    key: String,
) -> CmdResult<Option<String>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let pr = project.as_ref()?;
        completion::info(&pr.ws, &p, &key, state.lang()).map(|md| markdown_to_html(&md))
    })
    .await
}

/// Hover content with HTML already rendered.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum HoverView {
    /// Documentation.
    Html {
        /// Rendered HTML.
        html: String,
        /// Range.
        range: raytex_core::text::Range,
    },
    /// An image to preview.
    Image {
        /// Image path.
        path: PathBuf,
        /// Range.
        range: raytex_core::text::Range,
    },
}

/// Hover at a position.
#[tauri::command]
pub async fn hover(
    app: AppHandle,
    path: String,
    line: u32,
    character: u32,
) -> CmdResult<Option<HoverView>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let pr = project.as_ref()?;
        match navigation::hover(&pr.ws, &p, Position::new(line, character), state.lang())? {
            Hover::Markdown { markdown, range } => Some(HoverView::Html {
                html: markdown_to_html(&markdown),
                range,
            }),
            Hover::Image { path, range } => Some(HoverView::Image { path, range }),
        }
    })
    .await
}

/// Definition of the symbol at a position.
#[tauri::command]
pub async fn definition(
    app: AppHandle,
    path: String,
    line: u32,
    character: u32,
) -> CmdResult<Vec<Location>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        project
            .as_ref()
            .map(|pr| navigation::definition(&pr.ws, &p, Position::new(line, character)))
            .unwrap_or_default()
    })
    .await
}

/// All uses of the symbol at a position.
#[tauri::command]
pub async fn references(
    app: AppHandle,
    path: String,
    line: u32,
    character: u32,
) -> CmdResult<Vec<Location>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        project
            .as_ref()
            .map(|pr| navigation::references(&pr.ws, &p, Position::new(line, character)))
            .unwrap_or_default()
    })
    .await
}

/// Edits renaming the symbol at a position everywhere in the project.
#[tauri::command]
pub async fn rename_symbol(
    app: AppHandle,
    path: String,
    line: u32,
    character: u32,
    new_name: String,
) -> CmdResult<Vec<TextEdit>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let pr = project.as_ref().ok_or("no project")?;
        navigation::rename(&pr.ws, &p, Position::new(line, character), &new_name)
            .ok_or_else(|| "nothing to rename here".to_owned())
    })
    .await?
}

/// Applies edits to files that are not open in the editor (rename in closed files).
#[tauri::command]
pub async fn apply_edits(app: AppHandle, edits: Vec<TextEdit>) -> CmdResult<Vec<String>> {
    blocking(&app, move |_, state| {
        let mut by_file: std::collections::BTreeMap<PathBuf, Vec<TextEdit>> =
            std::collections::BTreeMap::new();
        for e in edits {
            by_file.entry(e.file.clone()).or_default().push(e);
        }
        let mut changed = Vec::new();
        for (file, mut edits) in by_file {
            let path = super::writable_path(state, &file.to_string_lossy())?;
            let text = std::fs::read_to_string(&path).map_err(err)?;
            let lines = raytex_core::text::LineIndex::new(&text);
            // Apply from the end so earlier offsets stay valid.
            edits.sort_by_key(|e| std::cmp::Reverse(e.range.start));
            let mut out = text.clone();
            for e in edits {
                let s = lines.offset(&text, e.range.start);
                let end = lines.offset(&text, e.range.end);
                out.replace_range(s..end, &e.new_text);
            }
            state.note_own_write(&path);
            raytex_core::settings::write_atomic(&path, out.as_bytes()).map_err(err)?;
            if let Some(pr) = state.project_mut().as_mut() {
                pr.ws.load_from_disk(&path);
            }
            changed.push(path.to_string_lossy().into_owned());
        }
        Ok(changed)
    })
    .await?
}

/// The formula around the cursor (live math preview).
#[tauri::command]
pub async fn math_at(
    app: AppHandle,
    path: String,
    line: u32,
    character: u32,
) -> CmdResult<Option<MathAt>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        navigation::math_at(&project.as_ref()?.ws, &p, Position::new(line, character))
    })
    .await
}

/// User macros usable by the math renderer (`\\R` → `\\mathbb{R}`).
#[tauri::command]
pub async fn math_macros(
    app: AppHandle,
    path: String,
) -> CmdResult<std::collections::BTreeMap<String, String>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let Some(pr) = project.as_ref() else {
            return Default::default();
        };
        let root = pr.ws.root_for(&p);
        pr.ws
            .command_definitions(&root)
            .into_iter()
            .filter(|(d, _)| !d.body.is_empty() && !d.name.contains('@') && !d.first_optional)
            .map(|(d, _)| (format!("\\{}", d.name), d.body.clone()))
            .collect()
    })
    .await
}

/// Structure of the project of a file.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Structure {
    /// Root document.
    pub root: PathBuf,
    /// Sections and frames in document order.
    pub outline: Vec<OutlineItem>,
    /// Labels.
    pub labels: Vec<LabelItem>,
    /// Bibliography entries.
    pub citations: Vec<CitationItem>,
    /// Notes left in the sources.
    pub todos: Vec<TodoItem>,
}

/// A todo note with its location.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    /// Tag.
    pub tag: String,
    /// Text.
    pub text: String,
    /// Where.
    pub location: Location,
}

/// Outline, labels, citations and todos of the project of `path`.
#[tauri::command]
pub async fn structure(app: AppHandle, path: String) -> CmdResult<Option<Structure>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let ws = &project.as_ref()?.ws;
        let root = ws.root_for(&p);
        let mut todos = Vec::new();
        for doc in ws.project_documents(&root) {
            for Todo { tag, text, span } in &doc.index.todos {
                todos.push(TodoItem {
                    tag: tag.clone(),
                    text: text.clone(),
                    location: Location {
                        file: doc.path.clone(),
                        range: doc.range(span),
                    },
                });
            }
        }
        Some(Structure {
            outline: ws.outline(&root),
            labels: ws.labels(&root),
            citations: ws.citations(&root),
            todos,
            root,
        })
    })
    .await
}

/// Project-wide text search.
#[tauri::command]
pub async fn search(
    app: AppHandle,
    query: String,
    regex: bool,
    case_sensitive: bool,
) -> CmdResult<Vec<SearchMatch>> {
    blocking(&app, move |_, state| {
        let project = state.project();
        let pr = project.as_ref().ok_or("no project")?;
        pr.ws.search(&query, regex, case_sensitive, 2000)
    })
    .await?
}

/// Word counts of a file and of its whole project.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordCounts {
    /// This file.
    pub file: WordCount,
    /// The whole document of its root.
    pub project: WordCount,
}

/// Counts words.
#[tauri::command]
pub async fn word_count(app: AppHandle, path: String) -> CmdResult<Option<WordCounts>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let ws = &project.as_ref()?.ws;
        let doc = ws.document(&p)?;
        let file = wordcount::count(&doc.text, &doc.index);
        let mut total = WordCount::default();
        for d in ws.project_documents(&ws.root_for(&p)) {
            if d.kind == raytex_core::workspace::DocKind::Tex {
                total += wordcount::count(&d.text, &d.index);
            }
        }
        Some(WordCounts {
            file,
            project: total,
        })
    })
    .await
}

/// The root document of a file.
#[tauri::command]
pub async fn root_of(app: AppHandle, path: String) -> CmdResult<Option<PathBuf>> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        state.project().as_ref().map(|pr| pr.ws.root_for(&p))
    })
    .await
}
