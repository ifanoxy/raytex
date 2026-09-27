//! File operations. Reads are allowed anywhere (files chosen by the user,
//! package sources); modifications only inside the open project.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use labaguetex_core::settings::write_atomic;
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, State};

use super::{CmdResult, abs, blocking, err, writable_path};
use crate::state::AppState;

/// Largest text file opened in the editor.
const MAX_TEXT: u64 = 32 * 1024 * 1024;

/// A text file.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    /// Content (invalid UTF-8 is replaced).
    pub text: String,
    /// Whether the file was not valid UTF-8 (then saved as UTF-8).
    pub lossy: bool,
    /// Modification time (ms since the epoch).
    pub modified: u64,
}

fn modified_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Reads a text file.
#[tauri::command]
pub async fn read_text_file(app: AppHandle, path: String) -> CmdResult<TextFile> {
    let p = abs(&path);
    blocking(&app, move |_, _| {
        let meta = std::fs::metadata(&p).map_err(err)?;
        if meta.len() > MAX_TEXT {
            return Err(format!("{} is too large to edit", p.display()));
        }
        let bytes = std::fs::read(&p).map_err(err)?;
        let (text, lossy) = match String::from_utf8(bytes) {
            Ok(t) => (t, false),
            // Legacy documents are often Latin-1: decode byte by byte.
            Err(e) => (e.into_bytes().iter().map(|&b| b as char).collect(), true),
        };
        Ok(TextFile {
            text,
            lossy,
            modified: modified_ms(&p),
        })
    })
    .await?
}

/// Writes a text file atomically. Returns the new modification time.
#[tauri::command]
pub async fn write_text_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    text: String,
) -> CmdResult<u64> {
    let p = writable_path(&state, &path)?;
    blocking(&app, move |_, state| {
        state.note_own_write(&p);
        write_atomic(&p, text.as_bytes()).map_err(err)?;
        if p.file_name()
            .is_some_and(|n| n == labaguetex_core::settings::PROJECT_FILE)
            && let Some(pr) = state.project_mut().as_mut()
        {
            pr.ws.reload_config();
        }
        Ok(modified_ms(&p))
    })
    .await?
}

/// Reads a binary file (PDF, image) without JSON encoding.
#[tauri::command]
pub async fn read_binary_file(app: AppHandle, path: String) -> CmdResult<Response> {
    let p = abs(&path);
    let bytes = blocking(&app, move |_, _| std::fs::read(&p).map_err(err)).await??;
    Ok(Response::new(bytes))
}

/// Writes binary data sent as the raw request body; the target path is in
/// the `x-path` header (used to save pasted images).
#[tauri::command]
pub async fn write_binary_file(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> CmdResult<String> {
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-path header")?;
    let path = percent_decode(path);
    let p = writable_path(&state, &path)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let bytes = bytes.clone();
    blocking(&app, move |_, state| {
        state.note_own_write(&p);
        write_atomic(&p, &bytes).map_err(err)?;
        Ok(p.to_string_lossy().into_owned())
    })
    .await?
}

pub(crate) fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16)
        {
            out.push(b);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Modification time of a file (ms), 0 if it does not exist.
#[tauri::command]
pub async fn file_modified(path: String) -> CmdResult<u64> {
    Ok(modified_ms(&abs(&path)))
}

/// Whether a path exists.
#[tauri::command]
pub async fn path_exists(path: String) -> CmdResult<bool> {
    Ok(abs(&path).exists())
}

/// Creates a new file (fails if it exists).
#[tauri::command]
pub async fn create_file(
    state: State<'_, AppState>,
    path: String,
    text: Option<String>,
) -> CmdResult<String> {
    let p = writable_path(&state, &path)?;
    if p.exists() {
        return Err(format!("{} already exists", p.display()));
    }
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(err)?;
    }
    state.note_own_write(&p);
    std::fs::write(&p, text.unwrap_or_default()).map_err(err)?;
    Ok(p.to_string_lossy().into_owned())
}

/// Creates a folder.
#[tauri::command]
pub async fn create_dir(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let p = writable_path(&state, &path)?;
    std::fs::create_dir_all(p).map_err(err)
}

/// Renames or moves a file or folder inside the project.
#[tauri::command]
pub async fn rename_path(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> CmdResult<String> {
    let from = writable_path(&state, &from)?;
    let to = writable_path(&state, &to)?;
    if to.exists() {
        return Err(format!("{} already exists", to.display()));
    }
    if let Some(dir) = to.parent() {
        std::fs::create_dir_all(dir).map_err(err)?;
    }
    std::fs::rename(&from, &to).map_err(err)?;
    if let Some(pr) = state.project_mut().as_mut() {
        pr.ws.remove(&from);
        pr.ws.load_from_disk(&to);
    }
    Ok(to.to_string_lossy().into_owned())
}

/// The system trash. On macOS, the file manager API is used directly: the
/// default (asking Finder through AppleScript) needs an automation
/// permission and can block while the permission prompt waits.
fn trash_context() -> trash::TrashContext {
    #[allow(unused_mut)]
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx
}

/// Moves a file or folder to the system trash (recoverable).
#[tauri::command]
pub async fn delete_path(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let p = writable_path(&state, &path)?;
    if state
        .project()
        .as_ref()
        .is_some_and(|pr| pr.ws.root_dir == p)
    {
        return Err("the project folder itself cannot be deleted from here".into());
    }
    trash_context().delete(&p).map_err(err)?;
    if let Some(pr) = state.project_mut().as_mut() {
        pr.ws.remove(&p);
    }
    Ok(())
}

/// Copies external files (drag and drop) into a folder of the project.
/// Existing names get a numeric suffix. Returns the new paths.
#[tauri::command]
pub async fn import_files(
    app: AppHandle,
    state: State<'_, AppState>,
    sources: Vec<String>,
    dir: String,
) -> CmdResult<Vec<String>> {
    let dir = writable_path(&state, &dir)?;
    blocking(&app, move |_, state| {
        std::fs::create_dir_all(&dir).map_err(err)?;
        let mut out = Vec::new();
        for src in sources {
            let src = abs(&src);
            if !src.is_file() {
                continue;
            }
            let name = src
                .file_name()
                .ok_or("invalid file")?
                .to_string_lossy()
                .into_owned();
            let mut target = dir.join(&name);
            let (stem, ext) = match name.rsplit_once('.') {
                Some((s, e)) => (s.to_owned(), format!(".{e}")),
                None => (name.clone(), String::new()),
            };
            let mut n = 2;
            while target.exists() {
                target = dir.join(format!("{stem}-{n}{ext}"));
                n += 1;
            }
            state.note_own_write(&target);
            std::fs::copy(&src, &target).map_err(err)?;
            out.push(target.to_string_lossy().into_owned());
        }
        Ok(out)
    })
    .await?
}

/// Copies the PDF (or any file of the project) to a location chosen by the user.
#[tauri::command]
pub async fn export_file(from: String, to: String) -> CmdResult<()> {
    let from: PathBuf = abs(&from);
    let to: PathBuf = abs(&to);
    std::fs::copy(from, to).map(|_| ()).map_err(err)
}
