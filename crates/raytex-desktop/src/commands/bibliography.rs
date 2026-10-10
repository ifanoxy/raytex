//! The bibliography panel: the entries of the project, the text of a `.bib`
//! file with an entry written, replaced or removed, and an entry fetched
//! from its DOI or its arXiv identifier (only when the user asks for it:
//! it is the one thing here that goes to the network).

use raytex_core::bibliography::{self, Bibliography, Draft, FetchError, Field};
use tauri::AppHandle;

use super::{CmdResult, abs, blocking};

/// The entries of the project of a file, with how much each is cited.
#[tauri::command]
pub async fn bibliography(app: AppHandle, path: String) -> CmdResult<Bibliography> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        let project = state.project();
        let Some(pr) = project.as_ref() else {
            return Bibliography::default();
        };
        let root = pr.ws.root_for(&p);
        bibliography::list(&pr.ws, &root)
    })
    .await
}

/// The text of a `.bib` file with an entry written in it: in place of the
/// entry whose key is `replaces`, or at the end. Fails with `key` or
/// `braces:<field>` when the entry cannot be written as it is.
#[tauri::command]
pub async fn bib_write(
    text: String,
    replaces: Option<String>,
    kind: String,
    key: String,
    fields: Vec<Field>,
) -> CmdResult<String> {
    let key = key.trim();
    if key.is_empty()
        || key
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, ',' | '{' | '}' | '"' | '#' | '%' | '\\'))
    {
        return Err("key".into());
    }
    if let Some(f) = fields
        .iter()
        .find(|f| !f.raw && !bibliography::balanced(&f.value))
    {
        return Err(format!("braces:{}", f.name));
    }
    let entry = bibliography::entry_text(&kind, key, &fields);
    Ok(bibliography::upsert(&text, replaces.as_deref(), &entry))
}

/// The text of a `.bib` file without the entry whose key is `key`.
#[tauri::command]
pub async fn bib_remove(text: String, key: String) -> CmdResult<Option<String>> {
    Ok(bibliography::remove(&text, &key))
}

/// The entries of a piece of BibTeX that was pasted.
#[tauri::command]
pub async fn bib_drafts(text: String) -> CmdResult<Vec<Draft>> {
    Ok(bibliography::drafts(&text))
}

/// A key made from the author and the year of an entry, not one of `taken`.
#[tauri::command]
pub async fn bib_key(fields: Vec<Field>, taken: Vec<String>) -> CmdResult<String> {
    Ok(bibliography::suggest_key(&fields, &taken))
}

/// The entry of a DOI (`source` = `doi`) or of an arXiv preprint (`arxiv`).
/// Fails with `invalid`, `not-found`, or what the network said.
#[tauri::command]
pub async fn bib_fetch(app: AppHandle, source: String, id: String) -> CmdResult<Vec<Draft>> {
    blocking(&app, move |_, _| {
        let text = match source.as_str() {
            "arxiv" => bibliography::fetch_arxiv(&id),
            _ => bibliography::fetch_doi(&id),
        };
        match text {
            Ok(text) => Ok(bibliography::drafts(&text)),
            Err(FetchError::Invalid) => Err("invalid".to_owned()),
            Err(FetchError::NotFound) => Err("not-found".to_owned()),
            Err(FetchError::Http(e)) => Err(e),
        }
    })
    .await?
}
