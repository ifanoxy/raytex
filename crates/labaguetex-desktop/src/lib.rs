//! # labaguetex desktop
//!
//! The Tauri shell of labaguetex: it owns the application state, exposes
//! [`labaguetex_core`] to the web interface through IPC commands
//! ([`commands`]) and pushes events (build output, file changes, TeX
//! status). All the LaTeX intelligence lives in `labaguetex-core`.

pub mod commands;
pub mod state;
pub mod watcher;

use tauri::Manager;

use crate::state::AppState;

/// Starts the application.
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "warn".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState::new())
        .setup(|app| {
            commands::tex::start_detection(app.handle().clone());
            // Files passed on the command line (or "Open with…").
            if let Some(arg) = std::env::args().skip(1).find(|a| !a.starts_with('-')) {
                let state = app.state::<AppState>();
                state.session().last_project = Some(commands::abs(&arg));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::app::get_settings,
            commands::app::save_settings,
            commands::app::set_language,
            commands::app::get_session,
            commands::app::save_open_files,
            commands::app::forget_recent,
            commands::app::open_in_os,
            commands::app::reveal_in_os,
            commands::app::open_url,
            commands::app::log_frontend,
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
            commands::project::template_preview,
            commands::project::create_project,
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
            commands::language::hover,
            commands::language::definition,
            commands::language::references,
            commands::language::rename_symbol,
            commands::language::apply_edits,
            commands::language::math_at,
            commands::language::math_macros,
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
        .run(tauri::generate_context!())
        .expect("error while running labaguetex");
}
