//! The window of a presentation: the slides of a deck full screen, on the
//! screen of the projector when there is one (the presenter's view stays in
//! the main window), else over everything on the only screen.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

use super::{CmdResult, err};

/// Label of the window of a presentation.
pub const PRESENT_WINDOW: &str = "present";

/// A screen the slides can be shown on.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Screen {
    /// Its name, as the system gives it.
    pub name: String,
    /// Its size in pixels.
    pub width: u32,
    /// Its size in pixels.
    pub height: u32,
    /// The main window is on it.
    pub main: bool,
}

/// The screens of the computer, in the order of the system.
#[tauri::command]
pub async fn present_screens(app: AppHandle) -> CmdResult<Vec<Screen>> {
    let monitors = app.available_monitors().map_err(err)?;
    let main_at = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .map(|m| *m.position());
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(i, m)| Screen {
            name: m.name().cloned().unwrap_or_else(|| format!("{}", i + 1)),
            width: m.size().width,
            height: m.size().height,
            main: Some(*m.position()) == main_at,
        })
        .collect())
}

/// Shows the window of the presentation full screen on screen `screen`
/// (by default, one the main window is not on, else the only one), opening
/// it if it is not open; gives the screen it is on.
#[tauri::command]
pub async fn present_open(app: AppHandle, screen: Option<usize>) -> CmdResult<usize> {
    let monitors = app.available_monitors().map_err(err)?;
    let main_at = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .map(|m| *m.position());
    let index = screen
        .filter(|i| *i < monitors.len())
        .or_else(|| monitors.iter().position(|m| Some(*m.position()) != main_at))
        .unwrap_or(0);
    let window = match app.get_webview_window(PRESENT_WINDOW) {
        Some(window) => window,
        None => {
            let window = tauri::WebviewWindowBuilder::new(
                &app,
                PRESENT_WINDOW,
                tauri::WebviewUrl::App("present.html".into()),
            )
            .title("RayTeX")
            .visible(false)
            .decorations(false)
            .background_color(tauri::window::Color(0, 0, 0, 255))
            .build()
            .map_err(err)?;
            // Closed in any way: the main window ends the presentation.
            let handle = app.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Destroyed = event {
                    let _ = handle.emit("present:closed", ());
                }
            });
            window
        }
    };
    // The scenes of the interface check it in a small window, not over the whole screen.
    if std::env::var_os("RAYTEX_SELFTEST").is_some() {
        let _ = window.set_size(tauri::LogicalSize::new(480.0, 270.0));
        let _ = window.show();
        return Ok(index);
    }
    if let Some(m) = monitors.get(index) {
        let _ = window.set_fullscreen(false);
        let _ = window.set_position(*m.position());
        let _ = window.set_size(*m.size());
    }
    let _ = window.show();
    let _ = window.set_fullscreen(true);
    let _ = window.set_focus();
    Ok(index)
}

/// Whether the window of the presentation is open.
#[tauri::command]
pub async fn present_shown(app: AppHandle) -> CmdResult<bool> {
    Ok(app.get_webview_window(PRESENT_WINDOW).is_some())
}

/// Closes the window of the presentation, if it is open.
#[tauri::command]
pub async fn present_close(app: AppHandle) -> CmdResult<()> {
    if let Some(window) = app.get_webview_window(PRESENT_WINDOW) {
        let _ = window.close();
    }
    Ok(())
}
