//! # RayTeX desktop
//!
//! The Tauri shell of RayTeX: it owns the application state, exposes
//! [`raytex_core`] to the web interface through IPC commands
//! ([`commands`]) and pushes events (build output, file changes, TeX
//! status). All the LaTeX intelligence lives in `raytex-core`.

pub mod commands;
pub mod state;
pub mod watcher;

use std::path::PathBuf;

use tauri::{Emitter, Manager};

use crate::state::AppState;

/// Starts the application.
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "warn".into()),
        )
        .init();

    let builder = tauri::Builder::default();
    // Windows and Linux start a new process for each file opened from the
    // file manager: it hands its files to the running window and quits
    // (macOS sends them to the running application by itself).
    #[cfg(any(windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        let files = argv
            .iter()
            .skip(1)
            .filter(|a| !a.starts_with('-'))
            .map(|a| {
                let p = PathBuf::from(a);
                if p.is_absolute() {
                    p
                } else {
                    PathBuf::from(&cwd).join(p)
                }
            })
            .filter(|p| p.exists())
            .collect();
        request_open(app, files);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // New versions, offered at start (ui/lib/state/updates.svelte.ts).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Size and position come back; the title bar is the one of the
        // configuration (drawn by RayTeX on Windows).
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .manage(AppState::new())
        // The last window is gone: the application quits (the unsaved files
        // were dealt with when it was closed).
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<AppState>()
                    .quitting
                    .store(true, std::sync::atomic::Ordering::SeqCst);
            }
        })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Before the page is drawn, the window has the colour of the
                // theme (the one of the launch screen), not black or white.
                let chosen = app.state::<AppState>().settings().general.theme.clone();
                let dark = match chosen.as_str() {
                    "light" => false,
                    "dark" => true,
                    _ => window.theme().map_or(true, |t| t == tauri::Theme::Dark),
                };
                let colour = if dark {
                    tauri::window::Color(16, 13, 28, 255)
                } else {
                    tauri::window::Color(245, 243, 251, 255)
                };
                let _ = window.set_background_color(Some(colour));
                fit_to_screen(&window);
            }
            commands::tex::start_detection(app.handle().clone());
            // Files passed on the command line ("Open with…" on Windows and Linux).
            let files: Vec<PathBuf> = std::env::args()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .map(|a| commands::abs(&a))
                .filter(|p| p.exists())
                .collect();
            request_open(app.handle(), files);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::app::get_settings,
            commands::app::take_open_requests,
            commands::app::quit_app,
            commands::app::save_settings,
            commands::app::set_language,
            commands::app::get_session,
            commands::app::save_open_files,
            commands::app::forget_recent,
            commands::app::open_in_os,
            commands::app::reveal_in_os,
            commands::app::open_url,
            commands::app::log_frontend,
            commands::media::import_image,
            commands::media::safe_file_name,
            commands::media::import_svg_data,
            commands::media::system_fonts,
            commands::media::inspect_fonts,
            commands::media::font_has_math,
            commands::media::import_fonts,
            commands::media::fontspec_code,
            commands::media::tex_fonts,
            commands::media::tikz_templates,
            commands::media::tikz_libraries,
            commands::media::tikz_sets,
            commands::media::save_tikz_sets,
            commands::media::preview_snippet,
            commands::media::preview_page,
            commands::app::selftest_target,
            commands::app::selftest_exit,
            commands::app::selftest_scenes,
            commands::project::open_project,
            commands::project::close_project,
            commands::project::project_info,
            commands::project::file_tree,
            commands::project::set_main_file,
            commands::project::save_project_config,
            commands::project::list_templates,
            commands::project::create_empty_project,
            commands::project::open_light_file,
            commands::project::list_projects,
            commands::project::projects_dir,
            commands::project::convert_to_project,
            commands::project::rename_project,
            commands::project::trash_project,
            commands::project::apply_template,
            commands::project::template_thumbnail,
            commands::project::save_as_template,
            commands::project::delete_template,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::read_binary_file,
            commands::files::write_binary_file,
            commands::files::file_modified,
            commands::files::path_exists,
            commands::files::create_file,
            commands::files::create_dir,
            commands::files::rename_path,
            commands::files::delete_path,
            commands::files::import_files,
            commands::files::export_file,
            commands::language::update_document,
            commands::language::close_document,
            commands::language::lint_project,
            commands::language::complete,
            commands::language::completion_info,
            commands::language::argument_hint,
            commands::language::hover,
            commands::language::definition,
            commands::language::references,
            commands::language::rename_symbol,
            commands::language::apply_edits,
            commands::language::math_at,
            commands::language::math_macros,
            commands::language::custom_commands,
            commands::language::draft_command,
            commands::language::structure,
            commands::language::search,
            commands::language::word_count,
            commands::language::root_of,
            commands::build::build,
            commands::build::cancel_build,
            commands::build::build_plan,
            commands::build::clean_build,
            commands::build::pdf_path,
            commands::synctex::synctex_forward,
            commands::synctex::synctex_inverse,
            commands::tex::tex_status,
            commands::tex::detect_tex,
            commands::tex::distro_options,
            commands::tex::preview_job,
            commands::tex::start_job,
            commands::tex::cancel_job,
            commands::tex::installed_packages,
            commands::tex::reindex_tex,
            commands::tex::installed_classes,
            commands::tex::repository_packages,
            commands::tex::package_details,
            commands::tex::ctan_catalog,
            commands::tex::ctan_package,
            commands::tex::open_texdoc,
            commands::help::help_pages,
            commands::help::help_page,
            commands::help::reference_search,
            commands::help::symbol_palette,
            commands::help::error_catalog,
            commands::help::builtin_snippets,
            commands::help::at_shortcuts,
            commands::help::lint_rules,
        ])
        .build(tauri::generate_context!())
        .expect("error while building RayTeX")
        .run(|app, event| {
            // No TeX run goes on after RayTeX (holding files open).
            if let tauri::RunEvent::Exit = &event {
                raytex_core::process::stop_all();
            }
            // Files opened from the Finder (double click, "Open with…", dropped on the icon).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                let files = urls.iter().filter_map(|u| u.to_file_path().ok()).collect();
                request_open(app, files);
            }
            // Quitting (⌘Q, the menu) with a window open: the interface first
            // offers to save the unsaved files, then calls `quit_app`.
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = &event
            {
                let state = app.state::<AppState>();
                if !state.quitting.load(std::sync::atomic::Ordering::SeqCst)
                    && !app.webview_windows().is_empty()
                {
                    api.prevent_exit();
                    let _ = app.emit("app:quit-requested", ());
                }
            }
        });
}

/// Queues files to open and tells the interface (which takes them when it
/// is ready, so none is lost at start-up).
fn request_open(app: &tauri::AppHandle, files: Vec<PathBuf>) {
    if files.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    state
        .open_requests
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .extend(files);
    let _ = app.emit("app:open-files", ());
}

/// A window larger than the usable part of its screen (the first start on a
/// laptop: 1366 × 768, or 1920 × 1080 at 150 %) is brought inside it, so the
/// status bar is not under the task bar.
fn fit_to_screen(window: &tauri::WebviewWindow) {
    let (Ok(Some(monitor)), Ok(size)) = (window.current_monitor(), window.outer_size()) else {
        return;
    };
    let area = monitor.work_area().size;
    if size.width <= area.width && size.height <= area.height {
        return;
    }
    let width = size.width.min(area.width * 95 / 100);
    let height = size.height.min(area.height * 95 / 100);
    let _ = window.set_size(tauri::PhysicalSize::new(width, height));
    let _ = window.center();
}
