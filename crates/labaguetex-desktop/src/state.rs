//! Application state shared by all commands.
//!
//! Locks are held briefly: long operations (builds, package installs, TeX
//! detection) run on their own threads and only lock to read or publish
//! results. Poisoned locks are recovered (a panicking command must not brick
//! the whole application).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::time::{Instant, SystemTime};

use labaguetex_core::i18n::Lang;
use labaguetex_core::settings::{Settings, write_atomic};
use labaguetex_core::synctex::SyncTex;
use labaguetex_core::tex::{Distribution, PackageAnalyzer, TexmfIndex};
use labaguetex_core::workspace::Workspace;
use serde::{Deserialize, Serialize};

/// Where the application keeps its files.
#[derive(Debug, Clone)]
pub struct AppPaths {
    /// `settings.toml`.
    pub settings: PathBuf,
    /// `session.json` (recent projects, open files).
    pub session: PathBuf,
    /// User templates.
    pub templates: PathBuf,
    /// Cache (CTAN catalogue…).
    pub cache: PathBuf,
}

impl Default for AppPaths {
    /// Standard locations for this OS.
    fn default() -> Self {
        // Development builds can run apart from the installed application
        // (self-tests): LABAGUETEX_CONFIG_DIR holds settings, session and cache.
        if cfg!(debug_assertions)
            && let Some(dir) = std::env::var_os("LABAGUETEX_CONFIG_DIR")
        {
            let config = PathBuf::from(dir);
            return Self {
                settings: config.join("settings.toml"),
                session: config.join("session.json"),
                templates: config.join("templates"),
                cache: config.join("cache"),
            };
        }
        let dirs = directories::ProjectDirs::from("org", "labaguetex", "labaguetex");
        let (config, cache) = match &dirs {
            Some(d) => (d.config_dir().to_path_buf(), d.cache_dir().to_path_buf()),
            None => (
                std::env::temp_dir().join("labaguetex"),
                std::env::temp_dir().join("labaguetex-cache"),
            ),
        };
        Self {
            settings: config.join("settings.toml"),
            session: config.join("session.json"),
            templates: config.join("templates"),
            cache,
        }
    }
}

/// A recently opened project.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    /// Folder.
    pub path: PathBuf,
    /// Display name.
    pub name: String,
    /// Last opening (seconds since the epoch).
    pub opened_at: u64,
}

/// What is restored at start-up.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Session {
    /// Recent projects, most recent first.
    pub recent: Vec<RecentProject>,
    /// Project open when the application was closed.
    pub last_project: Option<PathBuf>,
    /// Files open in the editor, per project.
    pub open_files: HashMap<String, Vec<PathBuf>>,
    /// Active file, per project.
    pub active_file: HashMap<String, PathBuf>,
}

/// State of the TeX installation.
#[derive(Debug, Default)]
pub struct TexState {
    /// Found distributions.
    pub distributions: Vec<Distribution>,
    /// Detection has run at least once.
    pub detected: bool,
    /// Detection in progress.
    pub detecting: bool,
    /// Indexing of the active distribution in progress.
    pub indexing: bool,
    /// File index of the active distribution.
    pub index: Option<Arc<TexmfIndex>>,
    /// Package analyzer over that index.
    pub analyzer: Option<Arc<PackageAnalyzer>>,
}

/// An open project.
#[derive(Debug)]
pub struct Project {
    /// The indexed workspace.
    pub ws: Workspace,
    /// File watcher (dropped when the project closes).
    pub watcher: Option<notify::RecommendedWatcher>,
}

/// Build coordination.
#[derive(Debug, Default)]
pub struct BuildControl {
    /// Cancellation flag of the running build.
    pub running: Option<Arc<AtomicBool>>,
    /// A build requested while another was running (coalesced).
    pub queued: Option<PathBuf>,
}

/// Cached SyncTeX data of a PDF.
#[derive(Debug)]
pub struct SyncCache {
    /// The `.synctex.gz` file.
    pub path: PathBuf,
    /// Its modification time when loaded.
    pub modified: SystemTime,
    /// Parsed data.
    pub data: Arc<SyncTex>,
}

/// Everything the commands share.
#[derive(Debug)]
pub struct AppState {
    /// Files of the application.
    pub paths: AppPaths,
    /// User settings.
    pub settings: RwLock<Settings>,
    /// Interface language (resolved by the front-end).
    pub lang: RwLock<Lang>,
    /// TeX installation.
    pub tex: RwLock<TexState>,
    /// The open project.
    pub project: RwLock<Option<Project>>,
    /// Builds.
    pub build: Mutex<BuildControl>,
    /// SyncTeX cache.
    pub synctex: Mutex<Option<SyncCache>>,
    /// Cancellable background jobs (installations…).
    pub jobs: Mutex<HashMap<u64, Arc<AtomicBool>>>,
    /// Next job id.
    pub next_job: AtomicU64,
    /// Session.
    pub session: Mutex<Session>,
    /// Files written by the application recently (ignored by the watcher).
    pub own_writes: Mutex<HashMap<PathBuf, Instant>>,
    /// Previews run one at a time; the last result of each kind is kept.
    pub previews: Mutex<HashMap<String, (u64, labaguetex_core::preview::PreviewOutcome)>>,
    /// Template thumbnails are compiled one at a time.
    pub thumbnails: Mutex<()>,
    /// Fonts installed on the system (read once).
    pub system_fonts: Mutex<Option<Arc<Vec<labaguetex_core::fonts::FontFamily>>>>,
}

fn recover<T>(r: Result<T, std::sync::PoisonError<T>>) -> T {
    r.unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl AppState {
    /// Loads settings and session.
    pub fn new() -> Self {
        let paths = AppPaths::default();
        let settings = Settings::load(&paths.settings);
        let session = std::fs::read_to_string(&paths.session)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self {
            paths,
            settings: RwLock::new(settings),
            lang: RwLock::new(Lang::En),
            tex: RwLock::new(TexState::default()),
            project: RwLock::new(None),
            build: Mutex::new(BuildControl::default()),
            synctex: Mutex::new(None),
            jobs: Mutex::new(HashMap::new()),
            next_job: AtomicU64::new(1),
            session: Mutex::new(session),
            own_writes: Mutex::new(HashMap::new()),
            previews: Mutex::new(HashMap::new()),
            thumbnails: Mutex::new(()),
            system_fonts: Mutex::new(None),
        }
    }

    /// Read access to the settings.
    pub fn settings(&self) -> RwLockReadGuard<'_, Settings> {
        recover(self.settings.read())
    }

    /// Write access to the settings.
    pub fn settings_mut(&self) -> RwLockWriteGuard<'_, Settings> {
        recover(self.settings.write())
    }

    /// Current interface language.
    pub fn lang(&self) -> Lang {
        *recover(self.lang.read())
    }

    /// Read access to the TeX state.
    pub fn tex(&self) -> RwLockReadGuard<'_, TexState> {
        recover(self.tex.read())
    }

    /// Write access to the TeX state.
    pub fn tex_mut(&self) -> RwLockWriteGuard<'_, TexState> {
        recover(self.tex.write())
    }

    /// Read access to the project.
    pub fn project(&self) -> RwLockReadGuard<'_, Option<Project>> {
        recover(self.project.read())
    }

    /// Write access to the project.
    pub fn project_mut(&self) -> RwLockWriteGuard<'_, Option<Project>> {
        recover(self.project.write())
    }

    /// Build control.
    pub fn build(&self) -> MutexGuard<'_, BuildControl> {
        recover(self.build.lock())
    }

    /// Session.
    pub fn session(&self) -> MutexGuard<'_, Session> {
        recover(self.session.lock())
    }

    /// Persists the session.
    pub fn save_session(&self) {
        let json = serde_json::to_string_pretty(&*self.session()).unwrap_or_default();
        if let Err(e) = write_atomic(&self.paths.session, json.as_bytes()) {
            tracing::warn!("cannot save session: {e}");
        }
    }

    /// The distribution chosen in the settings (or the first found).
    pub fn active_distribution(&self) -> Option<Distribution> {
        let wanted = self.settings().build.distribution.clone();
        let tex = self.tex();
        wanted
            .and_then(|id| tex.distributions.iter().find(|d| d.id == id).cloned())
            .or_else(|| tex.distributions.first().cloned())
    }

    /// Remembers that the application itself wrote `path`.
    pub fn note_own_write(&self, path: &Path) {
        let mut w = recover(self.own_writes.lock());
        w.retain(|_, t| t.elapsed().as_secs() < 5);
        w.insert(path.to_path_buf(), Instant::now());
    }

    /// Whether `path` was written by the application in the last moments.
    pub fn is_own_write(&self, path: &Path) -> bool {
        recover(self.own_writes.lock())
            .get(path)
            .is_some_and(|t| t.elapsed().as_millis() < 1500)
    }

    /// Registers a cancellable job.
    pub fn new_job(&self) -> (u64, Arc<AtomicBool>) {
        let id = self.next_job.fetch_add(1, Ordering::Relaxed);
        let flag = Arc::new(AtomicBool::new(false));
        recover(self.jobs.lock()).insert(id, flag.clone());
        (id, flag)
    }

    /// Forgets a finished job.
    pub fn end_job(&self, id: u64) {
        recover(self.jobs.lock()).remove(&id);
    }

    /// Cancels a job.
    pub fn cancel_job(&self, id: u64) {
        if let Some(flag) = recover(self.jobs.lock()).get(&id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    /// SyncTeX data for `path`, loaded or reused from the cache.
    pub fn synctex(&self, path: &Path) -> Option<Arc<SyncTex>> {
        let modified = std::fs::metadata(path).and_then(|m| m.modified()).ok()?;
        let mut cache = recover(self.synctex.lock());
        if let Some(c) = cache.as_ref()
            && c.path == path
            && c.modified == modified
        {
            return Some(c.data.clone());
        }
        let data = Arc::new(SyncTex::load(path).ok()?);
        *cache = Some(SyncCache {
            path: path.to_path_buf(),
            modified,
            data: data.clone(),
        });
        Some(data)
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
