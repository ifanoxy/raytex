//! Spelling (`raytex_core::spell`): the dictionaries on this computer, the
//! one downloaded when the user asks for it, words checked against them
//! and the words the user adds.
//!
//! `spell_install` is the only command here that uses the network, and the
//! interface calls it only after the user agreed to that download.

use std::sync::Arc;

use raytex_core::spell::{self, Checker, Entry, Installed, SpellError, Store};
use serde::Serialize;
use tauri::AppHandle;

use super::{CmdResult, blocking, err};
use crate::state::AppState;

fn store(state: &AppState) -> Store {
    Store::at(&state.paths.dictionaries)
}

/// The checker of the installed dictionary `tag`, read once and kept.
fn checker(state: &AppState, tag: &str) -> Result<Arc<Checker>, SpellError> {
    let mut loaded = state
        .spell
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(c) = loaded.get(tag) {
        return Ok(c.clone());
    }
    let store = store(state);
    // The words of the user, read with the first dictionary.
    if loaded.is_empty()
        && let Ok(mut words) = state.spell_words.write()
    {
        *words = store.words();
    }
    let c = Arc::new(Checker::new(store.load(tag)?, state.spell_words.clone()));
    loaded.insert(tag.to_owned(), c.clone());
    Ok(c)
}

/// What the interface shows of the dictionaries.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellStatus {
    /// Those on this computer.
    pub installed: Vec<Installed>,
    /// Those that can be downloaded.
    pub catalog: Vec<Entry>,
    /// Where they come from, as it is shown before a download.
    pub source: &'static str,
    /// The words the user added.
    pub words: Vec<String>,
}

/// The dictionaries installed and offered, and the words of the user.
#[tauri::command]
pub async fn spell_status(app: AppHandle) -> CmdResult<SpellStatus> {
    blocking(&app, |_, state| {
        let store = store(state);
        SpellStatus {
            installed: store.installed(),
            catalog: spell::CATALOG.to_vec(),
            source: spell::SOURCE,
            words: store.words().into_iter().collect(),
        }
    })
    .await
}

/// Downloads and installs the dictionary of `tag`. Called once the user
/// agreed to it. Returns the tag installed.
#[tauri::command]
pub async fn spell_install(app: AppHandle, tag: String) -> CmdResult<String> {
    blocking(&app, move |_, state| {
        store(state)
            .install(&tag, &spell::download)
            .map(str::to_owned)
            .map_err(|e| match e {
                SpellError::Download(why) => format!("download:{why}"),
                other => other.to_string(),
            })
    })
    .await?
}

/// Removes an installed dictionary.
#[tauri::command]
pub async fn spell_remove(app: AppHandle, tag: String) -> CmdResult<()> {
    blocking(&app, move |_, state| {
        state
            .spell
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(&tag);
        store(state).remove(&tag).map_err(err)
    })
    .await?
}

/// Whether each of `words` is spelled right in the dictionary `tag`. Fails
/// with `missing` when that dictionary is not installed.
#[tauri::command]
pub async fn spell_check(app: AppHandle, tag: String, words: Vec<String>) -> CmdResult<Vec<bool>> {
    blocking(&app, move |_, state| {
        let c = checker(state, &tag).map_err(|e| match e {
            SpellError::Missing(_) => "missing".to_owned(),
            other => other.to_string(),
        })?;
        Ok(words.iter().map(|w| c.check(w)).collect())
    })
    .await?
}

/// What the dictionary `tag` offers in place of `word`.
#[tauri::command]
pub async fn spell_suggest(app: AppHandle, tag: String, word: String) -> CmdResult<Vec<String>> {
    blocking(&app, move |_, state| {
        checker(state, &tag)
            .map(|c| c.suggest(&word, 6))
            .map_err(err)
    })
    .await?
}

/// Adds a word to those of the user (`add`), or takes it back.
#[tauri::command]
pub async fn spell_learn(app: AppHandle, word: String, add: bool) -> CmdResult<()> {
    blocking(&app, move |_, state| {
        let store = store(state);
        if add {
            store.learn(&word).map_err(err)?;
        } else {
            store.forget(&word).map_err(err)?;
        }
        if let Ok(mut words) = state.spell_words.write() {
            *words = store.words();
        }
        Ok(())
    })
    .await?
}
