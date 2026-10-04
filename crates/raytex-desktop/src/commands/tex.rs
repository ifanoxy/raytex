//! TeX installation: detection, indexing, installation of distributions
//! and packages, package information and the CTAN catalogue.
//!
//! Events:
//! * `tex:status` — detection / indexing progress (payload: [`TexStatus`]);
//! * `job:output` `{ id, lines }` and `job:finished` `{ id, success, code }`
//!   for installation jobs.
//!
//! Security: the interface never sends commands to run. It sends a typed
//! [`JobRequest`]; the plan is rebuilt here, shown to the user with
//! [`preview_job`], and executed by [`start_job`].

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use raytex_core::process::{self, Cmd};
use raytex_core::tex::ctan::{self, CatalogEntry, PackageDetails};
use raytex_core::tex::manager::{self, DistroOption, Plan, RepositoryPackage};
use raytex_core::tex::{Distribution, PackageAnalyzer, TexmfIndex, detect};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use super::{CmdResult, blocking, err};
use crate::state::AppState;

/// State of the TeX installation, for the interface.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexStatus {
    /// Detection has completed at least once.
    pub detected: bool,
    /// Detection running.
    pub detecting: bool,
    /// Indexing of installed files running.
    pub indexing: bool,
    /// Distributions found.
    pub distributions: Vec<Distribution>,
    /// Identifier of the distribution in use.
    pub active: Option<String>,
    /// Number of installed packages (0 while indexing).
    pub installed_packages: usize,
}

fn status(state: &AppState) -> TexStatus {
    let active = state.active_distribution().map(|d| d.id);
    let tex = state.tex();
    TexStatus {
        detected: tex.detected,
        detecting: tex.detecting,
        indexing: tex.indexing,
        distributions: tex.distributions.clone(),
        active,
        installed_packages: tex.index.as_ref().map(|i| i.packages().len()).unwrap_or(0),
    }
}

fn emit_status(app: &AppHandle) {
    let _ = app.emit("tex:status", status(&app.state::<AppState>()));
}

/// Detects distributions in the background, then indexes the active one.
pub fn start_detection(app: AppHandle) {
    {
        let state = app.state::<AppState>();
        let mut tex = state.tex_mut();
        if tex.detecting {
            return;
        }
        tex.detecting = true;
    }
    emit_status(&app);
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let extra = state.settings().build.extra_bin_dirs.clone();
        let found = detect(&extra);
        {
            let mut tex = state.tex_mut();
            tex.distributions = found;
            tex.detected = true;
            tex.detecting = false;
        }
        emit_status(&app);
        start_indexing(app.clone());
    });
}

/// Indexes the files of the active distribution in the background.
pub fn start_indexing(app: AppHandle) {
    let state = app.state::<AppState>();
    let Some(dist) = state.active_distribution() else {
        {
            let mut tex = state.tex_mut();
            tex.index = None;
            tex.analyzer = None;
        }
        if let Some(pr) = state.project_mut().as_mut() {
            pr.ws.set_packages(None);
        }
        emit_status(&app);
        return;
    };
    state.tex_mut().indexing = true;
    emit_status(&app);
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let index = Arc::new(TexmfIndex::build(&dist));
        let analyzer = Arc::new(PackageAnalyzer::new(index.clone()));
        {
            let mut tex = state.tex_mut();
            tex.index = Some(index);
            tex.analyzer = Some(analyzer.clone());
            tex.indexing = false;
        }
        // Learn the project's packages now rather than on first completion.
        let loaded = {
            let mut project = state.project_mut();
            project.as_mut().map(|pr| {
                pr.ws.set_packages(Some(analyzer.clone()));
                let root = pr
                    .ws
                    .configured_main()
                    .or_else(|| pr.ws.root_candidates().into_iter().next());
                root.map(|r| pr.ws.loaded_packages(&r)).unwrap_or_default()
            })
        };
        emit_status(&app);
        if let Some((class, packages)) = loaded {
            let _ = analyzer.closure(class.as_deref(), packages.iter().map(String::as_str));
        }
        // Which installed package defines what: read now, so that an unknown
        // command gets its package at the first build.
        let _ = analyzer.providers();
    });
}

/// Reads again the files installed in the distribution (MiKTeX installed
/// packages during a build).
#[tauri::command]
pub fn reindex_tex(app: AppHandle) {
    start_indexing(app);
}

/// Current TeX status.
#[tauri::command]
pub async fn tex_status(state: State<'_, AppState>) -> CmdResult<TexStatus> {
    Ok(status(&state))
}

/// Re-detects the TeX distributions.
#[tauri::command]
pub async fn detect_tex(app: AppHandle) -> CmdResult<()> {
    start_detection(app);
    Ok(())
}

/// Ways to install a distribution on this OS (setup assistant).
#[tauri::command]
pub async fn distro_options() -> CmdResult<Vec<DistroOption>> {
    Ok(manager::distro_options())
}

/// An operation the user asked for.
#[derive(Debug, Clone, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum JobRequest {
    /// Install a distribution (setup assistant option id).
    InstallDistribution {
        /// Option id from [`distro_options`].
        option: String,
    },
    /// Install packages (names) and/or whatever provides missing files.
    InstallPackages {
        /// Package names.
        #[serde(default)]
        packages: Vec<String>,
        /// Missing files (`foo.sty`).
        #[serde(default)]
        files: Vec<String>,
        /// TeX Live user mode instead of administrator rights.
        #[serde(default)]
        user_mode: bool,
    },
    /// Remove packages.
    RemovePackages {
        /// Package names.
        packages: Vec<String>,
    },
    /// Update everything.
    UpdateAll,
}

fn plan_for(state: &AppState, req: &JobRequest) -> Result<Plan, String> {
    let lang = state.lang();
    match req {
        JobRequest::InstallDistribution { option } => {
            let opt = manager::distro_options()
                .into_iter()
                .find(|o| &o.id == option)
                .ok_or("unknown option")?;
            let cmd = opt.command.ok_or_else(|| {
                lang.pick(
                    "Installation manuelle uniquement",
                    "Manual installation only",
                )
                .to_owned()
            })?;
            Ok(Plan {
                steps: vec![cmd],
                needs_admin: opt.needs_admin,
                note: opt.description,
            })
        }
        JobRequest::InstallPackages {
            packages,
            files,
            user_mode,
        } => {
            let dist = state.active_distribution().ok_or("no TeX distribution")?;
            let mut steps = Vec::new();
            let mut needs_admin = false;
            let mut note = None;
            if !packages.is_empty() {
                let p = manager::install_packages(&dist, packages, *user_mode)
                    .ok_or("no package manager")?;
                needs_admin |= p.needs_admin;
                note = Some(p.note.clone());
                steps.extend(p.steps);
            }
            if !files.is_empty() {
                let p =
                    manager::install_files(&dist, files, *user_mode).ok_or("no package manager")?;
                needs_admin |= p.needs_admin;
                note.get_or_insert(p.note.clone());
                steps.extend(p.steps);
            }
            if steps.is_empty() {
                return Err(lang.pick("Rien à installer.", "Nothing to install.").into());
            }
            Ok(Plan {
                steps,
                needs_admin,
                note: note.unwrap_or_default(),
            })
        }
        JobRequest::RemovePackages { packages } => {
            let dist = state.active_distribution().ok_or("no TeX distribution")?;
            manager::remove_packages(&dist, packages).ok_or_else(|| "no package manager".into())
        }
        JobRequest::UpdateAll => {
            let dist = state.active_distribution().ok_or("no TeX distribution")?;
            manager::update_all(&dist).ok_or_else(|| "no package manager".into())
        }
    }
}

/// The exact commands a request would run (shown before running).
#[tauri::command]
pub async fn preview_job(app: AppHandle, request: JobRequest) -> CmdResult<Plan> {
    blocking(&app, move |_, state| plan_for(state, &request)).await?
}

#[derive(Debug, Clone, Serialize)]
struct JobOutput {
    id: u64,
    lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
struct JobFinished {
    id: u64,
    success: bool,
    cancelled: bool,
    code: Option<i32>,
}

/// Starts a job; returns its id. Output comes as `job:output` events.
#[tauri::command]
pub async fn start_job(app: AppHandle, request: JobRequest) -> CmdResult<u64> {
    let state = app.state::<AppState>();
    let plan = {
        let app2 = app.clone();
        let req = request.clone();
        blocking(&app2, move |_, state| plan_for(state, &req)).await??
    };
    let (id, cancel) = state.new_job();
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let (success, code, cancelled) = run_plan(&app, id, &plan, &cancel);
        state.end_job(id);
        let _ = app.emit(
            "job:finished",
            JobFinished {
                id,
                success,
                cancelled,
                code,
            },
        );
        if success {
            match request {
                JobRequest::InstallDistribution { .. } => start_detection(app.clone()),
                _ => start_indexing(app.clone()),
            }
        }
    });
    Ok(id)
}

fn run_plan(
    app: &AppHandle,
    id: u64,
    plan: &Plan,
    cancel: &Arc<AtomicBool>,
) -> (bool, Option<i32>, bool) {
    let mut last = None;
    for step in &plan.steps {
        let cmd: Cmd = if plan.needs_admin {
            process::elevated(step)
        } else {
            step.clone()
        };
        let _ = app.emit(
            "job:output",
            JobOutput {
                id,
                lines: vec![format!("$ {}", step.display())],
            },
        );
        let mut buffer: Vec<String> = Vec::new();
        let mut last_flush = std::time::Instant::now();
        let result = process::run_streaming(&cmd, cancel, None, |_, line| {
            buffer.push(line.to_owned());
            if last_flush.elapsed() > Duration::from_millis(80) {
                let _ = app.emit(
                    "job:output",
                    JobOutput {
                        id,
                        lines: std::mem::take(&mut buffer),
                    },
                );
                last_flush = std::time::Instant::now();
            }
        });
        if !buffer.is_empty() {
            let _ = app.emit("job:output", JobOutput { id, lines: buffer });
        }
        match result {
            Ok(status) if status.cancelled => return (false, None, true),
            Ok(status) => {
                last = status.code;
                if status.code != Some(0) {
                    return (false, status.code, false);
                }
            }
            Err(e) => {
                let _ = app.emit(
                    "job:output",
                    JobOutput {
                        id,
                        lines: vec![e.to_string()],
                    },
                );
                return (false, None, false);
            }
        }
    }
    (true, last, false)
}

/// Cancels a job.
#[tauri::command]
pub async fn cancel_job(state: State<'_, AppState>, id: u64) -> CmdResult<()> {
    state.cancel_job(id);
    Ok(())
}

/// Installed packages (names) of the active distribution.
#[tauri::command]
pub async fn installed_packages(state: State<'_, AppState>) -> CmdResult<Vec<String>> {
    Ok(state
        .tex()
        .index
        .as_ref()
        .map(|i| i.packages())
        .unwrap_or_default())
}

/// Installed document classes of the active distribution.
#[tauri::command]
pub async fn installed_classes(state: State<'_, AppState>) -> CmdResult<Vec<String>> {
    Ok(state
        .tex()
        .index
        .as_ref()
        .map(|i| i.classes())
        .unwrap_or_default())
}

/// Packages of the distribution's repository (may use the network).
#[tauri::command]
pub async fn repository_packages(
    app: AppHandle,
    installed_only: bool,
) -> CmdResult<Vec<RepositoryPackage>> {
    blocking(&app, move |_, state| {
        state
            .active_distribution()
            .map(|d| manager::list_repository(&d, installed_only))
            .unwrap_or_default()
    })
    .await
}

/// Everything known about a package.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageView {
    /// Name.
    pub name: String,
    /// Class rather than package.
    pub class: bool,
    /// Installed in the active distribution.
    pub installed: bool,
    /// Main file.
    pub path: Option<std::path::PathBuf>,
    /// Curated description (in the interface language).
    pub summary: Option<String>,
    /// `\ProvidesPackage` line.
    pub provides: Option<String>,
    /// Public commands found in the source.
    pub commands: Vec<String>,
    /// Environments found in the source.
    pub environments: Vec<String>,
    /// Options.
    pub options: Vec<String>,
    /// Loaded packages.
    pub requires: Vec<String>,
    /// Commands documented by RayTeX.
    pub documented: usize,
}

/// Package information from the knowledge base and the package source.
#[tauri::command]
pub async fn package_details(app: AppHandle, name: String, class: bool) -> CmdResult<PackageView> {
    blocking(&app, move |_, state| {
        let lang = state.lang();
        let kb = raytex_core::kb::kb();
        let curated = if class {
            kb.class(&name)
        } else {
            kb.package(&name)
        };
        let analyzer = state.tex().analyzer.clone();
        let info = analyzer.map(|a| a.analyze(&name, class));
        PackageView {
            installed: info.as_ref().is_some_and(|i| i.installed),
            path: info.as_ref().and_then(|i| i.path.clone()),
            summary: curated.map(|p| p.description.get(lang).to_owned()),
            provides: info.as_ref().and_then(|i| i.description.clone()),
            commands: info
                .as_ref()
                .map(|i| i.commands.iter().map(|c| c.name.clone()).collect())
                .unwrap_or_default(),
            environments: info
                .as_ref()
                .map(|i| i.environments.iter().map(|e| e.name.clone()).collect())
                .unwrap_or_default(),
            options: info.as_ref().map(|i| i.options.clone()).unwrap_or_default(),
            requires: info
                .as_ref()
                .map(|i| i.requires.clone())
                .unwrap_or_default(),
            documented: curated
                .map(|p| p.command_count + p.environment_count)
                .unwrap_or(0),
            name,
            class,
        }
    })
    .await
}

/// The whole CTAN catalogue (cached for a week).
#[tauri::command]
pub async fn ctan_catalog(app: AppHandle) -> CmdResult<Vec<CatalogEntry>> {
    blocking(&app, move |_, state| {
        ctan::catalog_cached(
            &state.paths.cache.join("ctan-catalog.json"),
            Duration::from_secs(7 * 24 * 3600),
        )
        .map_err(err)
    })
    .await?
}

/// CTAN details of a package.
#[tauri::command]
pub async fn ctan_package(app: AppHandle, name: String) -> CmdResult<PackageDetails> {
    blocking(&app, move |_, _| ctan::fetch_package(&name).map_err(err)).await?
}

/// Opens the documentation of a package with `texdoc`.
#[tauri::command]
pub async fn open_texdoc(app: AppHandle, name: String) -> CmdResult<bool> {
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || "-_.".contains(c))
    {
        return Err("invalid package name".into());
    }
    blocking(&app, move |_, state| {
        let Some(dist) = state.active_distribution() else {
            return false;
        };
        let Some(cmd) = manager::texdoc(&dist, &name) else {
            return false;
        };
        process::output(&cmd, Duration::from_secs(20)).is_ok_and(|o| o.success())
    })
    .await
}
