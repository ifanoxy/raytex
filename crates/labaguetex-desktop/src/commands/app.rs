//! Application-level commands: settings, language, session, OS integration.

use std::path::PathBuf;

use labaguetex_core::i18n::Lang;
use labaguetex_core::settings::Settings;
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use super::{CmdResult, abs, err};
use crate::state::{AppState, Session};

/// Information about the application.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    /// Version.
    pub version: String,
    /// Operating system (`macos`, `windows`, `linux`).
    pub os: String,
    /// CPU architecture.
    pub arch: String,
    /// Settings file.
    pub settings_path: PathBuf,
    /// User templates folder.
    pub templates_path: PathBuf,
}

/// Version and platform.
#[tauri::command]
pub async fn app_info(state: State<'_, AppState>) -> CmdResult<AppInfo> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        settings_path: state.paths.settings.clone(),
        templates_path: state.paths.templates.clone(),
    })
}

/// Current settings.
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> CmdResult<Settings> {
    Ok(state.settings().clone())
}

/// Saves the settings. Returns whether the TeX distribution must be re-detected.
#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> CmdResult<bool> {
    let redetect = {
        let old = state.settings();
        old.build.extra_bin_dirs != settings.build.extra_bin_dirs
            || old.build.distribution != settings.build.distribution
    };
    settings.save(&state.paths.settings).map_err(err)?;
    *state.settings_mut() = settings;
    if redetect {
        super::tex::start_detection(app);
    }
    Ok(redetect)
}

/// Sets the language of messages produced by the engine (`fr`, `en`).
#[tauri::command]
pub async fn set_language(state: State<'_, AppState>, lang: String) -> CmdResult<()> {
    *state
        .lang
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Lang::from_tag(&lang);
    Ok(())
}

/// Recent projects and last open files.
#[tauri::command]
pub async fn get_session(state: State<'_, AppState>) -> CmdResult<Session> {
    let mut s = state.session().clone();
    s.recent.retain(|r| r.path.exists());
    Ok(s)
}

/// Remembers the files open in the editor for the current project.
#[tauri::command]
pub async fn save_open_files(
    state: State<'_, AppState>,
    files: Vec<String>,
    active: Option<String>,
) -> CmdResult<()> {
    let Some(root) = state
        .project()
        .as_ref()
        .map(|p| p.ws.root_dir.to_string_lossy().into_owned())
    else {
        return Ok(());
    };
    {
        let mut s = state.session();
        s.open_files
            .insert(root.clone(), files.iter().map(|f| abs(f)).collect());
        match active {
            Some(a) => {
                s.active_file.insert(root, abs(&a));
            }
            None => {
                s.active_file.remove(&root);
            }
        }
    }
    state.save_session();
    Ok(())
}

/// Removes a project from the recent list.
#[tauri::command]
pub async fn forget_recent(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let p = abs(&path);
    state.session().recent.retain(|r| r.path != p);
    state.save_session();
    Ok(())
}

/// Opens a file with the default application of the system (e.g. the PDF).
#[tauri::command]
pub async fn open_in_os(app: AppHandle, path: String) -> CmdResult<()> {
    app.opener()
        .open_path(abs(&path).to_string_lossy(), None::<&str>)
        .map_err(err)
}

/// Shows a file in the system file manager.
#[tauri::command]
pub async fn reveal_in_os(app: AppHandle, path: String) -> CmdResult<()> {
    app.opener().reveal_item_in_dir(abs(&path)).map_err(err)
}

/// Opens a web page in the default browser.
#[tauri::command]
pub async fn open_url(app: AppHandle, url: String) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("only web links can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(err)
}

/// Reports an interface error (uncaught exception, failed promise) on the
/// standard error output, where it is visible when running from a terminal.
#[tauri::command]
pub async fn log_frontend(level: String, message: String) -> CmdResult<()> {
    let message: String = message.chars().take(4000).collect();
    eprintln!(
        "[ui:{}] {message}",
        if level == "error" { "error" } else { "info" }
    );
    Ok(())
}

/// Development only: the project given in `LABAGUETEX_SELFTEST`, for the
/// automated end-to-end check of the interface (see `ui/dev/selftest.ts`).
#[tauri::command]
pub async fn selftest_target() -> CmdResult<Option<String>> {
    Ok(if cfg!(debug_assertions) {
        std::env::var("LABAGUETEX_SELFTEST").ok()
    } else {
        None
    })
}

/// Development only: which screens the self-test walks through
/// (`LABAGUETEX_SELFTEST_SCENES=all|media`), and a folder of test files
/// (`LABAGUETEX_SELFTEST_ASSETS`).
#[tauri::command]
pub async fn selftest_scenes() -> CmdResult<(Option<String>, Option<String>)> {
    if !cfg!(debug_assertions) {
        return Ok((None, None));
    }
    Ok((
        std::env::var("LABAGUETEX_SELFTEST_SCENES").ok(),
        std::env::var("LABAGUETEX_SELFTEST_ASSETS").ok(),
    ))
}

/// Development only: ends the self-test with an exit code.
#[tauri::command]
pub async fn selftest_exit(app: AppHandle, code: i32) -> CmdResult<()> {
    // LABAGUETEX_SELFTEST_KEEP leaves the window open to look at the result.
    if cfg!(debug_assertions)
        && std::env::var_os("LABAGUETEX_SELFTEST").is_some()
        && std::env::var_os("LABAGUETEX_SELFTEST_KEEP").is_none()
    {
        app.exit(code);
    }
    Ok(())
}
