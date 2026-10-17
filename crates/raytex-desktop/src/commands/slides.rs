//! The slides mode: a window of its own for a Beamer deck (its slides as
//! thumbnails, the slide large, its notes), which shows what the main window
//! keeps (the text, its builds) and asks it for changes.

use tauri::{AppHandle, Manager};

use super::{CmdResult, err};
use crate::state::AppState;

/// Label of the window of the slides mode.
pub const SLIDES_WINDOW: &str = "slides";

/// Opens the window of the slides mode, or brings it to the front with its
/// new title.
#[tauri::command]
pub async fn slides_window_open(app: AppHandle, title: String) -> CmdResult<()> {
    if let Some(window) = app.get_webview_window(SLIDES_WINDOW) {
        let _ = window.set_title(&title);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    // The colour of the theme before the page is drawn, as for the main window.
    let chosen = app.state::<AppState>().settings().general.theme.clone();
    let dark = match chosen.as_str() {
        "light" => false,
        "dark" => true,
        _ => app
            .get_webview_window("main")
            .and_then(|w| w.theme().ok())
            .is_none_or(|t| t == tauri::Theme::Dark),
    };
    let colour = if dark {
        tauri::window::Color(16, 13, 28, 255)
    } else {
        tauri::window::Color(245, 243, 251, 255)
    };
    tauri::WebviewWindowBuilder::new(
        &app,
        SLIDES_WINDOW,
        tauri::WebviewUrl::App("slides.html".into()),
    )
    .title(title)
    .inner_size(1280.0, 820.0)
    .min_inner_size(900.0, 580.0)
    .resizable(true)
    .accept_first_mouse(true)
    .center()
    .background_color(colour)
    .build()
    .map(|_| ())
    .map_err(err)
}
