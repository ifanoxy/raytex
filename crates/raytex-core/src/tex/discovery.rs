//! Finding TeX distributions on this computer.
//!
//! Every directory that may contain TeX binaries is examined: the `PATH`
//! (including the login shell's, for GUI launches), the standard locations
//! of TeX Live, MacTeX, MiKTeX, TinyTeX and Tectonic on each OS, and any
//! directory configured by the user. Each directory holding an engine
//! becomes a [`Distribution`], identified and versioned.

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::process::{self, Cmd, exe_name, is_executable};

/// Family of a TeX distribution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DistroKind {
    /// Official TeX Live installation (any OS).
    TexLive,
    /// MacTeX (TeX Live packaged for macOS).
    MacTex,
    /// TinyTeX (minimal, user-owned TeX Live).
    TinyTex,
    /// TeX Live from a Linux distribution's packages.
    SystemTexLive,
    /// MiKTeX.
    MikTex,
    /// Tectonic (self-contained engine).
    Tectonic,
    /// Unidentified binaries.
    Other,
}

/// How packages are installed for a distribution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum PackageManager {
    /// TeX Live's `tlmgr`.
    Tlmgr {
        /// Path of `tlmgr`.
        path: PathBuf,
        /// Whether the TeX Live tree is writable by the current user.
        writable: bool,
    },
    /// MiKTeX's package manager (`miktex` or `mpm`).
    Miktex {
        /// Path of `miktex` (≥ 22) or `mpm`.
        path: PathBuf,
        /// Whether it is the `miktex` one-stop CLI.
        modern: bool,
    },
    /// Tectonic downloads what it needs automatically.
    Automatic,
    /// Linux distribution packages.
    System {
        /// `apt`, `dnf`, `pacman` or `zypper`.
        tool: String,
    },
    /// No known way to install packages.
    None,
}

/// A TeX engine.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, serde::Deserialize, PartialOrd, Ord,
)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    /// pdfLaTeX.
    Pdflatex,
    /// XeLaTeX.
    Xelatex,
    /// LuaLaTeX.
    Lualatex,
    /// LaTeX → DVI → PDF.
    Latex,
    /// Tectonic.
    Tectonic,
}

impl Engine {
    /// Executable name.
    pub fn program(self) -> &'static str {
        match self {
            Engine::Pdflatex => "pdflatex",
            Engine::Xelatex => "xelatex",
            Engine::Lualatex => "lualatex",
            Engine::Latex => "latex",
            Engine::Tectonic => "tectonic",
        }
    }

    /// Display name.
    pub fn label(self) -> &'static str {
        match self {
            Engine::Pdflatex => "pdfLaTeX",
            Engine::Xelatex => "XeLaTeX",
            Engine::Lualatex => "LuaLaTeX",
            Engine::Latex => "LaTeX (DVI)",
            Engine::Tectonic => "Tectonic",
        }
    }

    /// Parses a program name (`% !TEX program = xelatex`).
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s.trim().to_ascii_lowercase().as_str() {
            "pdflatex" | "pdftex" | "pdf" => Engine::Pdflatex,
            "xelatex" | "xetex" | "xe" => Engine::Xelatex,
            "lualatex" | "luatex" | "lua" | "lualatex-dev" => Engine::Lualatex,
            "latex" | "dvi" => Engine::Latex,
            "tectonic" => Engine::Tectonic,
            _ => return None,
        })
    }

    /// Every engine.
    pub const ALL: [Engine; 5] = [
        Engine::Pdflatex,
        Engine::Xelatex,
        Engine::Lualatex,
        Engine::Latex,
        Engine::Tectonic,
    ];
}

/// Tools RayTeX may use, looked up next to the engines.
pub const TOOLS: &[&str] = &[
    "pdflatex",
    "xelatex",
    "lualatex",
    "latex",
    "dvipdfmx",
    "tectonic",
    "latexmk",
    "bibtex",
    "biber",
    "makeindex",
    "makeglossaries",
    "xindy",
    "synctex",
    "kpsewhich",
    "tlmgr",
    "miktex",
    "mpm",
    "initexmf",
    "texdoc",
    "mthelp",
    "chktex",
    "latexindent",
    "texcount",
    "perl",
];

/// An installed TeX distribution.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Distribution {
    /// Stable identifier (canonical binary directory).
    pub id: String,
    /// Family.
    pub kind: DistroKind,
    /// Display name, e.g. "TeX Live 2025".
    pub name: String,
    /// Version or year.
    pub version: Option<String>,
    /// Directory containing the binaries.
    pub bin_dir: PathBuf,
    /// Available tools and their paths.
    pub tools: BTreeMap<String, PathBuf>,
    /// Available engines.
    pub engines: Vec<Engine>,
    /// Package manager.
    pub package_manager: PackageManager,
}

impl Distribution {
    /// Path of a tool, if available.
    pub fn tool(&self, name: &str) -> Option<&Path> {
        self.tools.get(name).map(PathBuf::as_path)
    }

    /// Whether `engine` can be used.
    pub fn has_engine(&self, engine: Engine) -> bool {
        self.engines.contains(&engine)
    }

    /// A command running a TeX engine. MiKTeX is always told whether to
    /// install missing packages (silently) or not: left to its settings, it
    /// opens a window for every missing file.
    pub fn engine_cmd(&self, engine: Engine, install_missing: bool) -> Cmd {
        let cmd = self.cmd(engine.program());
        if self.kind == DistroKind::MikTex && engine != Engine::Tectonic {
            cmd.arg(if install_missing {
                "--enable-installer"
            } else {
                "--disable-installer"
            })
        } else {
            cmd
        }
    }

    /// A command running `tool` of this distribution, with its `bin` directory on `PATH`.
    pub fn cmd(&self, tool: &str) -> Cmd {
        let program = self
            .tool(tool)
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(exe_name(tool)));
        Cmd::new(program).path_prefix(self.bin_dir.clone())
    }
}

/// Candidate directories that may contain TeX binaries, most likely first.
pub fn candidate_dirs(extra: &[PathBuf]) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = extra.to_vec();
    let home = directories::BaseDirs::new().map(|b| b.home_dir().to_path_buf());
    let path = std::env::var_os("PATH").unwrap_or_default();
    dirs.extend(std::env::split_paths(&path));
    dirs.extend(process::login_shell_path());

    #[cfg(target_os = "macos")]
    {
        dirs.push("/Library/TeX/texbin".into());
        dirs.extend(glob_years(
            "/usr/local/texlive",
            &[
                "universal-darwin",
                "x86_64-darwin",
                "arm64-darwin",
                "x86_64-darwinlegacy",
            ],
        ));
        if let Some(h) = &home {
            dirs.push(h.join("Library/TinyTeX/bin/universal-darwin"));
            dirs.push(h.join("Library/TinyTeX/bin/x86_64-darwin"));
            dirs.push(h.join("bin"));
            dirs.push(h.join(".cargo/bin"));
        }
        dirs.push("/opt/homebrew/bin".into());
        dirs.push("/usr/local/bin".into());
        dirs.push("/Applications/MiKTeX Console.app/Contents/bin".into());
        dirs.push("/usr/texbin".into());
    }
    #[cfg(target_os = "linux")]
    {
        for arch in [
            "x86_64-linux",
            "aarch64-linux",
            "i386-linux",
            "x86_64-linuxmusl",
            "armhf-linux",
        ] {
            if let Some(h) = &home {
                dirs.push(h.join(".TinyTeX/bin").join(arch));
            }
        }
        dirs.extend(glob_years(
            "/usr/local/texlive",
            &[
                "x86_64-linux",
                "aarch64-linux",
                "i386-linux",
                "x86_64-linuxmusl",
                "armhf-linux",
            ],
        ));
        dirs.extend(glob_years(
            "/opt/texlive",
            &["x86_64-linux", "aarch64-linux"],
        ));
        if let Some(h) = &home {
            dirs.push(h.join(".local/bin"));
            dirs.push(h.join("bin"));
            dirs.push(h.join(".cargo/bin"));
        }
        dirs.push("/usr/bin".into());
        dirs.push("/usr/local/bin".into());
        dirs.push("/snap/bin".into());
    }
    #[cfg(windows)]
    {
        let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
        for root in ["C:\\texlive", "D:\\texlive"] {
            dirs.extend(glob_years(root, &["windows", "win64", "win32"]));
        }
        if let Some(appdata) = env("APPDATA") {
            dirs.push(appdata.join("TinyTeX\\bin\\windows"));
            dirs.push(appdata.join("TinyTeX\\bin\\win32"));
        }
        if let Some(local) = env("LOCALAPPDATA") {
            dirs.push(local.join("Programs\\MiKTeX\\miktex\\bin\\x64"));
            dirs.push(local.join("Programs\\MiKTeX\\miktex\\bin"));
            dirs.push(local.join("Microsoft\\WinGet\\Links"));
        }
        for pf in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(p) = env(pf) {
                dirs.push(p.join("MiKTeX\\miktex\\bin\\x64"));
                dirs.push(p.join("MiKTeX\\miktex\\bin"));
                dirs.push(p.join("MiKTeX 2.9\\miktex\\bin\\x64"));
            }
        }
        if let Some(h) = &home {
            dirs.push(h.join("scoop\\shims"));
            dirs.push(h.join(".cargo\\bin"));
        }
    }
    let _ = &home;
    let mut seen = HashSet::new();
    dirs.retain(|d| !d.as_os_str().is_empty() && seen.insert(d.clone()));
    dirs
}

/// `root/<year>/bin/<arch>` directories, most recent year first.
#[allow(dead_code)]
fn glob_years(root: &str, archs: &[&str]) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut years: Vec<PathBuf> = rd
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.len() == 4 && n.chars().all(|c| c.is_ascii_digit()))
        })
        .collect();
    years.sort();
    years.reverse();
    years
        .into_iter()
        .flat_map(|y| archs.iter().map(move |a| y.join("bin").join(a)))
        .filter(|p| p.is_dir())
        .collect()
}

/// Finds all TeX distributions. `extra` are user-configured directories.
///
/// Engines are queried for their version in parallel; this takes a few
/// hundred milliseconds and should run off the UI thread.
pub fn detect(extra: &[PathBuf]) -> Vec<Distribution> {
    let mut seen = HashSet::new();
    let mut dirs = Vec::new();
    for dir in candidate_dirs(extra) {
        let has_engine = ["pdflatex", "xelatex", "lualatex", "tectonic", "latex"]
            .iter()
            .any(|e| is_executable(&dir.join(exe_name(e))));
        if !has_engine {
            continue;
        }
        // Symlinked directories (texbin, Homebrew) point to the same installation.
        let canonical = canonical_bin_dir(&dir);
        if seen.insert(canonical.clone()) {
            dirs.push((dir, canonical));
        }
    }
    let handles: Vec<_> = dirs
        .into_iter()
        .map(|(dir, canonical)| std::thread::spawn(move || examine(&dir, &canonical)))
        .collect();
    let mut found: Vec<Distribution> = handles
        .into_iter()
        .filter_map(|h| h.join().ok().flatten())
        .collect();
    // Tectonic next to another distribution is listed separately.
    found.sort_by_key(|d| match d.kind {
        DistroKind::MacTex | DistroKind::TexLive => 0,
        DistroKind::MikTex => 1,
        DistroKind::TinyTex => 2,
        DistroKind::SystemTexLive => 3,
        DistroKind::Tectonic => 4,
        DistroKind::Other => 5,
    });
    found
}

/// Without the `\\?\` prefix of Windows, which MiKTeX and many tools refuse.
fn canonical_bin_dir(dir: &Path) -> PathBuf {
    for engine in ["pdflatex", "xelatex", "lualatex", "tectonic", "latex"] {
        let exe = dir.join(exe_name(engine));
        if let Ok(real) = dunce::canonicalize(&exe)
            && let Some(parent) = real.parent()
        {
            // pdflatex is often a link to pdftex in the same directory.
            return parent.to_path_buf();
        }
    }
    dunce::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf())
}

/// Builds a [`Distribution`] from a binary directory.
pub fn examine(dir: &Path, canonical: &Path) -> Option<Distribution> {
    let mut tools = BTreeMap::new();
    for tool in TOOLS {
        if let Some(p) =
            process::executable_in(dir, tool).or_else(|| process::executable_in(canonical, tool))
        {
            tools.insert((*tool).to_owned(), p);
        }
    }
    if !tools.contains_key("perl")
        && let Some(perl) = process::find_executable("perl", &[])
    {
        tools.insert("perl".into(), perl);
    }
    let engines: Vec<Engine> = Engine::ALL
        .into_iter()
        .filter(|e| tools.contains_key(e.program()))
        .collect();
    if engines.is_empty() {
        return None;
    }
    let only_tectonic = engines == [Engine::Tectonic];
    let (kind, name, version) = if only_tectonic {
        let version = version_line(&tools["tectonic"], "--version")
            .and_then(|l| l.split_whitespace().nth(1).map(str::to_owned));
        (
            DistroKind::Tectonic,
            format!("Tectonic {}", version.clone().unwrap_or_default())
                .trim()
                .to_owned(),
            version,
        )
    } else {
        identify(dir, canonical, &tools)
    };
    let package_manager = package_manager(kind, canonical, &tools);
    // A Tectonic binary sitting next to TeX Live is its own distribution.
    let mut engines = engines;
    if !only_tectonic {
        engines.retain(|e| *e != Engine::Tectonic);
    }
    Some(Distribution {
        id: canonical.to_string_lossy().into_owned(),
        kind,
        name,
        version,
        bin_dir: dir.to_path_buf(),
        tools,
        engines,
        package_manager,
    })
}

fn version_line(program: &Path, flag: &str) -> Option<String> {
    banner(&version_output(program, flag, Duration::from_secs(8))?).map(str::to_owned)
}

/// Everything `program flag` prints (standard output, then errors).
fn version_output(program: &Path, flag: &str, timeout: Duration) -> Option<String> {
    let out = process::output(&Cmd::new(program).arg(flag), timeout).ok()?;
    Some(format!("{}\n{}", out.stdout, out.stderr))
}

/// The version line of a program's output, past MiKTeX's reminders
/// (`pdflatex: major issue: So far, no MiKTeX administrator…`).
fn banner(output: &str) -> Option<&str> {
    output.lines().find(|l| {
        !l.trim().is_empty()
            && !l.contains(": major issue")
            && !l.contains(": minor issue")
            && !l.contains(": security risk")
    })
}

/// The version of MiKTeX in any line of an output (`… (MiKTeX 26.5)`).
fn miktex_version_in(output: &str) -> Option<String> {
    output
        .lines()
        .filter(|l| l.contains("(MiKTeX "))
        .find_map(miktex_version)
}

/// Version of MiKTeX in the banner of its engines:
/// `MiKTeX-pdfTeX 4.23 (MiKTeX 25.12)` → `25.12` (not the pdfTeX version).
fn miktex_version(banner: &str) -> Option<String> {
    let v = banner
        .rsplit("MiKTeX")
        .next()?
        .trim_matches(|c: char| c == ')' || c == '(' || c.is_whitespace());
    v.starts_with(|c: char| c.is_ascii_digit())
        .then(|| v.to_owned())
}

fn identify(
    dir: &Path,
    canonical: &Path,
    tools: &BTreeMap<String, PathBuf>,
) -> (DistroKind, String, Option<String>) {
    let engine = ["pdflatex", "xelatex", "lualatex", "latex"]
        .iter()
        .find_map(|e| tools.get(*e));
    // The first run of a freshly installed MiKTeX can take a while.
    let output = engine
        .and_then(|e| version_output(e, "--version", Duration::from_secs(20)))
        .unwrap_or_default();
    let banner = banner(&output).unwrap_or_default().to_owned();
    let lower_path = canonical.to_string_lossy().to_lowercase();
    if banner.contains("MiKTeX") || tools.contains_key("miktex") || tools.contains_key("initexmf") {
        // MiKTeX's own tools say its version too, when the engine did not.
        let version = miktex_version_in(&output).or_else(|| {
            ["miktex", "initexmf", "mpm"]
                .iter()
                .filter_map(|t| tools.get(*t))
                .find_map(|t| {
                    version_output(t, "--version", Duration::from_secs(20))
                        .and_then(|o| miktex_version_in(&o))
                })
        });
        let name = format!("MiKTeX {}", version.clone().unwrap_or_default())
            .trim()
            .to_owned();
        return (DistroKind::MikTex, name, version);
    }
    let year = banner
        .split("TeX Live ")
        .nth(1)
        .map(|v| {
            v.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
        })
        .filter(|y| !y.is_empty());
    let label = |base: &str| match &year {
        Some(y) => format!("{base} {y}"),
        None => base.to_owned(),
    };
    if lower_path.contains("tinytex") {
        return (DistroKind::TinyTex, label("TinyTeX"), year);
    }
    if cfg!(target_os = "macos")
        && (dir.starts_with("/Library/TeX") || lower_path.starts_with("/usr/local/texlive"))
        && Path::new("/Library/TeX").exists()
    {
        return (DistroKind::MacTex, label("MacTeX"), year);
    }
    if cfg!(target_os = "linux")
        && (canonical.starts_with("/usr/bin") || canonical.starts_with("/bin"))
    {
        return (DistroKind::SystemTexLive, label("TeX Live (système)"), year);
    }
    if banner.contains("TeX Live") || tools.contains_key("tlmgr") {
        return (DistroKind::TexLive, label("TeX Live"), year);
    }
    (DistroKind::Other, banner.chars().take(60).collect(), None)
}

fn package_manager(
    kind: DistroKind,
    canonical: &Path,
    tools: &BTreeMap<String, PathBuf>,
) -> PackageManager {
    match kind {
        DistroKind::Tectonic => PackageManager::Automatic,
        DistroKind::MikTex => {
            if let Some(p) = tools.get("miktex") {
                PackageManager::Miktex {
                    path: p.clone(),
                    modern: true,
                }
            } else if let Some(p) = tools.get("mpm") {
                PackageManager::Miktex {
                    path: p.clone(),
                    modern: false,
                }
            } else {
                PackageManager::None
            }
        }
        DistroKind::SystemTexLive => {
            let tool = ["apt-get", "dnf", "pacman", "zypper"]
                .into_iter()
                .find(|t| process::find_executable(t, &[]).is_some())
                .map(|t| if t == "apt-get" { "apt" } else { t });
            match tool {
                Some(t) => PackageManager::System { tool: t.to_owned() },
                None => PackageManager::None,
            }
        }
        _ => match tools.get("tlmgr") {
            Some(path) => {
                // <root>/bin/<arch>/tlmgr → the tree root is two levels up.
                let root = canonical
                    .parent()
                    .and_then(Path::parent)
                    .unwrap_or(canonical);
                PackageManager::Tlmgr {
                    path: path.clone(),
                    writable: is_writable(&root.join("tlpkg")),
                }
            }
            None => PackageManager::None,
        },
    }
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".raytex-write-test");
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn miktex_versions() {
        assert_eq!(
            miktex_version("MiKTeX-pdfTeX 4.23 (MiKTeX 25.12)").as_deref(),
            Some("25.12")
        );
        assert_eq!(
            miktex_version("MiKTeX-pdfTeX 4.27 (MiKTeX 26.5)").as_deref(),
            Some("26.5")
        );
        assert_eq!(miktex_version("MiKTeX-pdfTeX 4.27"), None);
    }

    #[test]
    fn miktex_version_after_its_reminders() {
        // A MiKTeX nobody has updated yet speaks before giving its banner.
        let output = "pdflatex: major issue: So far, no MiKTeX administrator has checked for updates.\n\
                      pdflatex: security risk: running with elevated privileges\n\
                      MiKTeX-pdfTeX 4.27 (MiKTeX 26.5)\n\
                      © 2026 Han The Thanh\n";
        assert_eq!(banner(output), Some("MiKTeX-pdfTeX 4.27 (MiKTeX 26.5)"));
        assert_eq!(miktex_version_in(output).as_deref(), Some("26.5"));
        // `miktex --version`, the fallback.
        assert_eq!(
            miktex_version_in("One MiKTeX Utility 1.12 (MiKTeX 26.5)\nCopyright (C) 2021-2026")
                .as_deref(),
            Some("26.5")
        );
        assert_eq!(miktex_version_in("pdflatex: major issue: …"), None);
        assert_eq!(
            banner("\npdfTeX 3.141592653-2.6-1.40.27 (TeX Live 2025)\nkpathsea version 6.4.1"),
            Some("pdfTeX 3.141592653-2.6-1.40.27 (TeX Live 2025)")
        );
    }

    use super::*;

    #[test]
    fn engine_names() {
        assert_eq!(Engine::parse("XeLaTeX"), Some(Engine::Xelatex));
        assert_eq!(Engine::parse("lualatex-dev"), Some(Engine::Lualatex));
        assert_eq!(Engine::parse("word"), None);
    }

    /// Runs against the real machine; prints what was found.
    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn detects_local_distributions() {
        for d in detect(&[]) {
            println!(
                "{} [{:?}] {:?} engines={:?} pm={:?}",
                d.name, d.kind, d.bin_dir, d.engines, d.package_manager
            );
        }
    }
}
