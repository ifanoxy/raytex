//! Opening projects, the file tree, the main file, project configuration and templates.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use labaguetex_core::build::AUX_EXTENSIONS;
use labaguetex_core::settings::ProjectConfig;
use labaguetex_core::templates::{self, TemplateInfo, TemplateValues};
use labaguetex_core::tex::Engine;
use labaguetex_core::workspace::{Workspace, project_root_for};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::{CmdResult, abs, blocking, err};
use crate::state::{AppState, Project, RecentProject};
use crate::watcher;

/// What the interface needs to know about the open project.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// Project folder.
    pub root: PathBuf,
    /// Display name.
    pub name: String,
    /// Main file (configured, or the best candidate).
    pub main: Option<PathBuf>,
    /// Files that can be compiled on their own.
    pub candidates: Vec<PathBuf>,
    /// `labaguetex.toml`.
    pub config: ProjectConfig,
    /// Error in `labaguetex.toml`.
    pub config_error: Option<String>,
    /// File to show first (the one opened, or the last active one).
    pub initial_file: Option<PathBuf>,
    /// Files open last time.
    pub open_files: Vec<PathBuf>,
}

pub(crate) fn info(state: &AppState, initial: Option<PathBuf>) -> Option<ProjectInfo> {
    let project = state.project();
    let ws = &project.as_ref()?.ws;
    let candidates = ws.root_candidates();
    let main = ws.configured_main().or_else(|| candidates.first().cloned());
    let key = ws.root_dir.to_string_lossy().into_owned();
    let session = state.session();
    let open_files: Vec<PathBuf> = session
        .open_files
        .get(&key)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|p| p.exists())
        .collect();
    let initial = initial
        .or_else(|| {
            session
                .active_file
                .get(&key)
                .cloned()
                .filter(|p| p.exists())
        })
        .or_else(|| main.clone());
    Some(ProjectInfo {
        name: ws.config.project.name.clone().unwrap_or_else(|| {
            ws.root_dir
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default()
        }),
        root: ws.root_dir.clone(),
        main,
        candidates,
        config: ws.config.clone(),
        config_error: ws.config_error.clone(),
        initial_file: initial,
        open_files,
    })
}

/// Opens a folder, or the folder of a file, as the current project.
#[tauri::command]
pub async fn open_project(app: AppHandle, path: String) -> CmdResult<ProjectInfo> {
    let target = abs(&path);
    if !target.exists() {
        return Err(format!("{} does not exist", target.display()));
    }
    blocking(&app, move |app, state| {
        let (root, initial) = if target.is_dir() {
            (target.clone(), None)
        } else {
            (project_root_for(&target), Some(target.clone()))
        };
        let mut ws = Workspace::open(&root);
        ws.set_packages(state.tex().analyzer.clone());
        // Let the webview load images and PDFs of the project.
        let _ = app
            .asset_protocol_scope()
            .allow_directory(&ws.root_dir, true);
        let watcher = watcher::watch(app.clone(), &ws.root_dir);
        let root_dir = ws.root_dir.clone();
        *state.project_mut() = Some(Project { ws, watcher });
        {
            let mut s = state.session();
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            s.recent.retain(|r| r.path != root_dir);
            s.recent.insert(
                0,
                RecentProject {
                    name: root_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    path: root_dir.clone(),
                    opened_at: now,
                },
            );
            s.recent.truncate(20);
            s.last_project = Some(root_dir);
        }
        state.save_session();
        info(state, initial).ok_or_else(|| "project not opened".to_owned())
    })
    .await?
}

/// Closes the project.
#[tauri::command]
pub async fn close_project(state: State<'_, AppState>) -> CmdResult<()> {
    *state.project_mut() = None;
    state.session().last_project = None;
    state.save_session();
    Ok(())
}

/// Information about the open project, if any.
#[tauri::command]
pub async fn project_info(state: State<'_, AppState>) -> CmdResult<Option<ProjectInfo>> {
    Ok(info(&state, None))
}

/// A node of the file tree.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    /// File name.
    pub name: String,
    /// Absolute path.
    pub path: PathBuf,
    /// Whether it is a folder.
    pub dir: bool,
    /// Children (folders).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<FileNode>,
}

/// Whether `dir` is a build output folder (hidden with the auxiliary files).
fn is_build_dir(dir: &Path, out_dirs: &[PathBuf]) -> bool {
    out_dirs.iter().any(|d| d == dir) || dir.join(".labaguetex-build.json").exists()
}

fn build_tree(
    dir: &Path,
    hide_aux: Option<&[PathBuf]>,
    budget: &mut usize,
    depth: usize,
) -> Vec<FileNode> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut entries: Vec<(String, PathBuf, bool)> = rd
        .filter_map(Result::ok)
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "node_modules" || name.ends_with(".lbt-tmp") {
                return None;
            }
            let is_dir = e.file_type().ok()?.is_dir();
            if let Some(out_dirs) = hide_aux {
                let hidden = if is_dir {
                    is_build_dir(&e.path(), out_dirs)
                } else {
                    AUX_EXTENSIONS
                        .iter()
                        .any(|x| name.ends_with(&format!(".{x}")))
                };
                if hidden {
                    return None;
                }
            }
            Some((name, e.path(), is_dir))
        })
        .collect();
    entries.sort_by(|a, b| {
        b.2.cmp(&a.2)
            .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
    });
    let mut out = Vec::new();
    for (name, path, is_dir) in entries {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let children = if is_dir && depth < 12 {
            build_tree(&path, hide_aux, budget, depth + 1)
        } else {
            Vec::new()
        };
        out.push(FileNode {
            name,
            path,
            dir: is_dir,
            children,
        });
    }
    out
}

/// The file tree of the project.
#[tauri::command]
pub async fn file_tree(app: AppHandle) -> CmdResult<Vec<FileNode>> {
    blocking(&app, |_, state| {
        let base = state.settings().build.clone();
        let hide = state.settings().general.hide_aux_files;
        let project = state.project();
        let Some(pr) = project.as_ref() else {
            return Vec::new();
        };
        let root = pr.ws.root_dir.clone();
        // Output folders of the compilable files (`build/` next to each of them).
        let out = pr.ws.config.effective_build(&base).out_dir;
        let out_dirs: Vec<PathBuf> = pr
            .ws
            .root_candidates()
            .iter()
            .filter_map(|m| {
                m.parent()
                    .map(|d| labaguetex_core::log::normalize(&d.join(&out)))
            })
            .collect();
        drop(project);
        build_tree(&root, hide.then_some(out_dirs.as_slice()), &mut 20_000, 0)
    })
    .await
}

/// Makes `path` the main file of the project (saved in `labaguetex.toml`).
#[tauri::command]
pub async fn set_main_file(app: AppHandle, path: String) -> CmdResult<ProjectInfo> {
    let p = abs(&path);
    blocking(&app, move |_, state| {
        {
            let mut project = state.project_mut();
            let pr = project.as_mut().ok_or("no project")?;
            let rel = p
                .strip_prefix(&pr.ws.root_dir)
                .map_err(|_| "the file is outside the project".to_owned())?;
            pr.ws.config.project.main = Some(rel.to_string_lossy().replace('\\', "/"));
            state.note_own_write(&pr.ws.root_dir.join(labaguetex_core::settings::PROJECT_FILE));
            pr.ws.config.save(&pr.ws.root_dir).map_err(err)?;
        }
        info(state, None).ok_or_else(|| "no project".to_owned())
    })
    .await?
}

/// Saves `labaguetex.toml`.
#[tauri::command]
pub async fn save_project_config(app: AppHandle, config: ProjectConfig) -> CmdResult<ProjectInfo> {
    blocking(&app, move |_, state| {
        {
            let mut project = state.project_mut();
            let pr = project.as_mut().ok_or("no project")?;
            state.note_own_write(&pr.ws.root_dir.join(labaguetex_core::settings::PROJECT_FILE));
            config.save(&pr.ws.root_dir).map_err(err)?;
            pr.ws.config = config;
            pr.ws.config_error = None;
        }
        info(state, None).ok_or_else(|| "no project".to_owned())
    })
    .await?
}

/// Built-in and user templates.
#[tauri::command]
pub async fn list_templates(state: State<'_, AppState>) -> CmdResult<Vec<TemplateInfo>> {
    Ok(templates::list(Some(&state.paths.templates)))
}

/// Creates an empty project (an empty `main.tex`) named `name` and opens it.
#[tauri::command]
pub async fn create_empty_project(
    app: AppHandle,
    dir: String,
    name: Option<String>,
) -> CmdResult<ProjectInfo> {
    let target = abs(&dir);
    let main = tauri::async_runtime::spawn_blocking(move || {
        templates::create_empty(&target, name.as_deref())
    })
    .await
    .map_err(err)?
    .map_err(err)?;
    open_project(app, main.to_string_lossy().into_owned()).await
}

/// Applies a template to the open project (see [`templates::apply`]): the
/// interface puts the returned text in the main file.
#[tauri::command]
pub async fn apply_template(
    app: AppHandle,
    id: String,
    values: TemplateValues,
) -> CmdResult<templates::Applied> {
    blocking(&app, move |_, state| {
        let mut project = state.project_mut();
        let pr = project.as_mut().ok_or("no project")?;
        let root = pr.ws.root_dir.clone();
        state.note_own_write(&root.join(labaguetex_core::settings::PROJECT_FILE));
        let applied =
            templates::apply(&id, &root, &values, Some(&state.paths.templates)).map_err(err)?;
        if let Ok(config) = ProjectConfig::load(&root) {
            pr.ws.config = config;
            pr.ws.config_error = None;
        }
        Ok(applied)
    })
    .await?
}

/// First page of a template, compiled once with example values and the
/// active distribution, then kept in the cache. Returns the PDF.
#[tauri::command]
pub async fn template_thumbnail(app: AppHandle, id: String) -> CmdResult<String> {
    use std::hash::{DefaultHasher, Hash, Hasher};
    blocking(&app, move |_, state| {
        let dist = state.active_distribution().ok_or("no TeX distribution")?;
        let lang = state.lang();
        let user_dir = state.paths.templates.clone();
        let info = templates::list(Some(&user_dir))
            .into_iter()
            .find(|t| t.id == id)
            .ok_or("unknown template")?;
        let files = templates::files(&id, Some(&user_dir)).ok_or("unknown template")?;
        let mut hasher = DefaultHasher::new();
        (&files, lang.code(), &dist.id, &info.engine).hash(&mut hasher);
        let safe: String = id
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let dir = state
            .paths
            .cache
            .join("template-previews")
            .join(format!("{safe}-{:016x}", hasher.finish()));
        let out = dir.join("out");
        let stem = Path::new(&info.main)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "main".into());
        let pdf = out.join(format!("{stem}.pdf"));
        // One compilation per template folder, a few templates at a time.
        let dir_lock = state
            .thumbnail_dirs
            .lock()
            .map_err(|e| e.to_string())?
            .entry(dir.clone())
            .or_default()
            .clone();
        let _dir = dir_lock.lock().map_err(|e| e.to_string())?;
        if pdf.is_file() {
            return Ok(pdf.to_string_lossy().into_owned());
        }
        // Sources in `dir`, around `out/`: `\include` writes `.aux` files in
        // sub-folders of the output folder, which must be inside the sources.
        let _slot = state.thumbnails.acquire();
        let main =
            templates::write_files(&id, &dir, &templates::example_values(lang), Some(&user_dir))
                .map_err(err)?;
        let wanted = info
            .engine
            .as_deref()
            .and_then(Engine::parse)
            .unwrap_or(Engine::Pdflatex);
        let engine = if !dist.has_engine(wanted) && dist.has_engine(Engine::Tectonic) {
            Engine::Tectonic
        } else {
            wanted
        };
        let pdf = labaguetex_core::preview::compile_document(
            &dist,
            engine,
            &main,
            &out,
            std::time::Duration::from_secs(90),
        )?;
        Ok(pdf.to_string_lossy().into_owned())
    })
    .await?
}

/// Saves the open project as a user template.
#[tauri::command]
pub async fn save_as_template(app: AppHandle, name: String, description: String) -> CmdResult<()> {
    blocking(&app, move |_, state| {
        let project = state.project();
        let pr = project.as_ref().ok_or("no project")?;
        let id: String = name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_owned();
        if id.is_empty() {
            return Err("invalid name".to_owned());
        }
        let main = pr
            .ws
            .configured_main()
            .or_else(|| pr.ws.root_candidates().into_iter().next());
        let info = TemplateInfo {
            id: id.clone(),
            name: labaguetex_core::kb::Doc {
                en: name.clone(),
                fr: name,
            },
            description: labaguetex_core::kb::Doc {
                en: description.clone(),
                fr: description,
            },
            category: "user".into(),
            order: 0,
            main: main
                .and_then(|m| {
                    m.strip_prefix(&pr.ws.root_dir)
                        .ok()
                        .map(|r| r.to_string_lossy().replace('\\', "/"))
                })
                .unwrap_or_else(|| "main.tex".into()),
            engine: None,
            tags: Vec::new(),
            user: true,
        };
        templates::save_as_template(&pr.ws.root_dir, &state.paths.templates, &id, &info)
            .map(|_| ())
            .map_err(err)
    })
    .await?
}

/// Deletes a user template (moved to the trash).
#[tauri::command]
pub async fn delete_template(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let name = id
        .strip_prefix("user:")
        .ok_or("only user templates can be deleted")?;
    if name.contains(['/', '\\']) || name.contains("..") {
        return Err("invalid template".into());
    }
    let dir = state.paths.templates.join(name);
    trash::delete(&dir).map_err(err)
}
