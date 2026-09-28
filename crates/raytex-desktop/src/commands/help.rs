//! Help centre, reference, symbols, snippets and lint rules.

use raytex_core::completion::data::{self, Snippet};
use raytex_core::diagnostics::Severity;
use raytex_core::help::{self, ErrorEntry, PageInfo, ReferenceEntry, SymbolCategory};
use serde::Serialize;
use tauri::State;

use super::CmdResult;
use crate::state::AppState;

/// Guides, in reading order.
#[tauri::command]
pub async fn help_pages(state: State<'_, AppState>) -> CmdResult<Vec<PageInfo>> {
    Ok(help::pages(state.lang()))
}

/// A guide rendered to HTML.
#[tauri::command]
pub async fn help_page(state: State<'_, AppState>, id: String) -> CmdResult<Option<String>> {
    Ok(help::page_html(&id, state.lang()))
}

/// Searches the command reference.
#[tauri::command]
pub async fn reference_search(
    state: State<'_, AppState>,
    query: String,
) -> CmdResult<Vec<ReferenceEntry>> {
    Ok(help::reference(&query, state.lang(), 300))
}

/// The symbol palette.
#[tauri::command]
pub async fn symbol_palette(state: State<'_, AppState>) -> CmdResult<Vec<SymbolCategory>> {
    Ok(help::symbols(state.lang()))
}

/// The catalogue of common errors.
#[tauri::command]
pub async fn error_catalog(state: State<'_, AppState>) -> CmdResult<Vec<ErrorEntry>> {
    Ok(help::errors(state.lang()))
}

/// A built-in snippet, localized.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetView {
    /// Trigger word.
    pub trigger: String,
    /// Name.
    pub name: String,
    /// Body.
    pub body: String,
    /// Math only.
    pub math: bool,
    /// Package needed.
    pub package: Option<String>,
}

/// Built-in snippets.
#[tauri::command]
pub async fn builtin_snippets(state: State<'_, AppState>) -> CmdResult<Vec<SnippetView>> {
    let lang = state.lang();
    Ok(data::snippets()
        .iter()
        .map(|s: &Snippet| SnippetView {
            trigger: s.trigger.clone(),
            name: s.name.get(lang).to_owned(),
            body: s.body.clone(),
            math: s.math,
            package: s.package.clone(),
        })
        .collect())
}

/// `@` shortcuts.
#[tauri::command]
pub async fn at_shortcuts() -> CmdResult<Vec<(String, String)>> {
    Ok(data::AT_SHORTCUTS
        .iter()
        .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
        .collect())
}

/// Lint rules with their default severity.
#[tauri::command]
pub async fn lint_rules() -> CmdResult<Vec<(String, Severity)>> {
    Ok(raytex_core::lint::RULES
        .iter()
        .map(|(id, s)| ((*id).to_owned(), *s))
        .collect())
}
