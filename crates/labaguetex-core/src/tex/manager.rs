//! Installing distributions and packages.
//!
//! This module only *plans* commands; running them (with streamed output
//! and, when needed, the OS administrator prompt) is done by the caller
//! through [`crate::process`]. Every plan is shown to the user before it runs.

use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;

use super::discovery::{Distribution, PackageManager};
use crate::kb::Doc;
use crate::process::{self, Cmd};

/// A sequence of commands that performs an operation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    /// Commands to run in order.
    pub steps: Vec<Cmd>,
    /// Whether administrator rights are required.
    pub needs_admin: bool,
    /// Explanation shown before running (both languages).
    pub note: Doc,
}

fn doc(en: &str, fr: &str) -> Doc {
    Doc {
        en: en.to_owned(),
        fr: fr.to_owned(),
    }
}

/// Plans the installation of TeX packages (package names of the distribution).
///
/// For TeX Live trees that are not writable, `user_mode` installs into the
/// user's own tree (`tlmgr --usermode`) instead of asking for admin rights.
pub fn install_packages(dist: &Distribution, packages: &[String], user_mode: bool) -> Option<Plan> {
    if packages.is_empty() {
        return None;
    }
    match &dist.package_manager {
        PackageManager::Tlmgr { writable, .. } => {
            let tlmgr = dist.cmd("tlmgr");
            if *writable {
                Some(Plan {
                    steps: vec![tlmgr.arg("install").args(packages.iter().cloned())],
                    needs_admin: false,
                    note: doc(
                        "Installs the packages with tlmgr.",
                        "Installe les packages avec tlmgr.",
                    ),
                })
            } else if user_mode {
                Some(Plan {
                    steps: vec![
                        tlmgr.clone().arg("init-usertree"),
                        tlmgr
                            .args(["--usermode", "install"])
                            .args(packages.iter().cloned()),
                    ],
                    needs_admin: false,
                    note: doc(
                        "Installs the packages in your personal TeX tree (no administrator rights needed).",
                        "Installe les packages dans votre arbre TeX personnel (sans droits administrateur).",
                    ),
                })
            } else {
                Some(Plan {
                    steps: vec![tlmgr.arg("install").args(packages.iter().cloned())],
                    needs_admin: true,
                    note: doc(
                        "The TeX Live installation belongs to the administrator: your password will be requested.",
                        "L'installation TeX Live appartient à l'administrateur : votre mot de passe sera demandé.",
                    ),
                })
            }
        }
        PackageManager::Miktex { modern, .. } => {
            let steps = if *modern {
                vec![
                    dist.cmd("miktex")
                        .args(["packages", "install"])
                        .args(packages.iter().cloned()),
                ]
            } else {
                packages
                    .iter()
                    .map(|p| dist.cmd("mpm").arg(format!("--install={p}")))
                    .collect()
            };
            Some(Plan {
                steps,
                needs_admin: false,
                note: doc(
                    "Installs the packages with MiKTeX.",
                    "Installe les packages avec MiKTeX.",
                ),
            })
        }
        PackageManager::Automatic => None,
        PackageManager::System { tool } => system_install(
            tool,
            &packages
                .iter()
                .map(|p| format!("{p}.sty"))
                .collect::<Vec<_>>(),
        ),
        PackageManager::None => None,
    }
}

/// Plans the installation of whatever provides the missing `files`
/// (`foo.sty`, `bar.cls`), resolving package names first when possible.
pub fn install_files(dist: &Distribution, files: &[String], user_mode: bool) -> Option<Plan> {
    match &dist.package_manager {
        PackageManager::System { tool } => system_install(tool, files),
        PackageManager::Automatic | PackageManager::None => None,
        _ => {
            let packages = resolve_packages(dist, files);
            install_packages(dist, &packages, user_mode)
        }
    }
}

fn system_install(tool: &str, files: &[String]) -> Option<Plan> {
    let (program, args): (&str, Vec<String>) = match tool {
        "dnf" => (
            "dnf",
            ["install", "-y"]
                .iter()
                .map(|s| s.to_string())
                .chain(files.iter().map(|f| format!("tex({f})")))
                .collect(),
        ),
        "zypper" => (
            "zypper",
            ["install", "-y"]
                .iter()
                .map(|s| s.to_string())
                .chain(files.iter().map(|f| format!("tex({f})")))
                .collect(),
        ),
        "pacman" => (
            "pacman",
            ["-S", "--needed", "--noconfirm", "texlive", "texlive-lang"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
        ),
        "apt" => (
            "apt-get",
            [
                "install",
                "-y",
                "texlive-latex-extra",
                "texlive-science",
                "texlive-pictures",
                "texlive-fonts-extra",
                "texlive-bibtex-extra",
                "texlive-lang-french",
                "texlive-lang-european",
                "latexmk",
                "biber",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect(),
        ),
        _ => return None,
    };
    Some(Plan {
        steps: vec![Cmd::new(program).args(args)],
        needs_admin: true,
        note: match tool {
            "apt" => doc(
                "Debian/Ubuntu package TeX Live in large collections: this installs the most useful ones (texlive-full contains everything).",
                "Debian/Ubuntu regroupent TeX Live en grosses collections : ceci installe les plus utiles (texlive-full contient tout).",
            ),
            "pacman" => doc(
                "Installs the complete TeX Live of Arch Linux.",
                "Installe le TeX Live complet d'Arch Linux.",
            ),
            _ => doc(
                "Installs the distribution packages providing these files.",
                "Installe les paquets de la distribution qui fournissent ces fichiers.",
            ),
        },
    })
}

/// Maps missing files to package names of the distribution.
///
/// TeX Live: `tlmgr search --global --file` (needs the network). MiKTeX
/// and fallback: the file name without extension, which is the package
/// name for the vast majority of packages.
pub fn resolve_packages(dist: &Distribution, files: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for file in files {
        let stem = file
            .rsplit_once('.')
            .map_or(file.as_str(), |(s, _)| s)
            .to_owned();
        let mut found = None;
        if matches!(dist.package_manager, PackageManager::Tlmgr { .. }) {
            let cmd = dist
                .cmd("tlmgr")
                .args(["search", "--global", "--file"])
                .arg(format!("/{file}"));
            if let Ok(res) = process::output(&cmd, Duration::from_secs(60)) {
                found = parse_tlmgr_file_search(&res.stdout, file);
            }
        }
        let name = found.unwrap_or(stem);
        if !out.contains(&name) {
            out.push(name);
        }
    }
    out
}

/// Parses `tlmgr search --global --file /foo.sty` output.
pub fn parse_tlmgr_file_search(output: &str, file: &str) -> Option<String> {
    let mut current: Option<&str> = None;
    let mut first: Option<String> = None;
    for line in output.lines() {
        if line.starts_with("tlmgr") {
            continue;
        }
        if let Some(pkg) = line.strip_suffix(':')
            && !line.starts_with(char::is_whitespace)
        {
            current = Some(pkg.trim());
            continue;
        }
        let path = line.trim();
        if let Some(pkg) = current
            && (path.ends_with(&format!("/{file}")) || path == file)
        {
            // Prefer the package whose name matches the file.
            if file.starts_with(&format!("{pkg}.")) {
                return Some(pkg.to_owned());
            }
            first.get_or_insert_with(|| pkg.to_owned());
        }
    }
    first
}

/// Plans updating every installed package.
pub fn update_all(dist: &Distribution) -> Option<Plan> {
    match &dist.package_manager {
        PackageManager::Tlmgr { writable, .. } => Some(Plan {
            steps: vec![dist.cmd("tlmgr").args(["update", "--self", "--all"])],
            needs_admin: !writable,
            note: doc(
                "Updates TeX Live and all its packages.",
                "Met à jour TeX Live et tous ses packages.",
            ),
        }),
        PackageManager::Miktex { modern, .. } => Some(Plan {
            steps: if *modern {
                vec![
                    dist.cmd("miktex")
                        .args(["packages", "update-package-database"]),
                    dist.cmd("miktex").args(["packages", "update"]),
                ]
            } else {
                vec![
                    dist.cmd("mpm").arg("--update-db"),
                    dist.cmd("mpm").arg("--update"),
                ]
            },
            needs_admin: false,
            note: doc(
                "Updates MiKTeX packages.",
                "Met à jour les packages MiKTeX.",
            ),
        }),
        _ => None,
    }
}

/// Plans removing packages.
pub fn remove_packages(dist: &Distribution, packages: &[String]) -> Option<Plan> {
    match &dist.package_manager {
        PackageManager::Tlmgr { writable, .. } => Some(Plan {
            steps: vec![
                dist.cmd("tlmgr")
                    .arg("remove")
                    .args(packages.iter().cloned()),
            ],
            needs_admin: !writable,
            note: doc("Removes the packages.", "Supprime les packages."),
        }),
        PackageManager::Miktex { modern: true, .. } => Some(Plan {
            steps: vec![
                dist.cmd("miktex")
                    .args(["packages", "remove"])
                    .args(packages.iter().cloned()),
            ],
            needs_admin: false,
            note: doc("Removes the packages.", "Supprime les packages."),
        }),
        PackageManager::Miktex { modern: false, .. } => Some(Plan {
            steps: packages
                .iter()
                .map(|p| dist.cmd("mpm").arg(format!("--uninstall={p}")))
                .collect(),
            needs_admin: false,
            note: doc("Removes the packages.", "Supprime les packages."),
        }),
        _ => None,
    }
}

/// A package known to the distribution's repository.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryPackage {
    /// Package name.
    pub name: String,
    /// Short description.
    pub description: String,
    /// Whether it is installed.
    pub installed: bool,
}

/// Lists the packages of the distribution's repository (network may be used).
pub fn list_repository(dist: &Distribution, installed_only: bool) -> Vec<RepositoryPackage> {
    match &dist.package_manager {
        PackageManager::Tlmgr { .. } => {
            let mut cmd = dist
                .cmd("tlmgr")
                .args(["info", "--data", "name,installed,shortdesc"]);
            if installed_only {
                cmd = cmd.arg("--only-installed");
            }
            let Ok(out) = process::output(&cmd, Duration::from_secs(120)) else {
                return Vec::new();
            };
            parse_tlmgr_info_data(&out.stdout)
        }
        PackageManager::Miktex { modern, .. } => {
            let cmd = if *modern {
                dist.cmd("miktex").args(["packages", "list"])
            } else {
                dist.cmd("mpm").arg("--list")
            };
            let Ok(out) = process::output(&cmd, Duration::from_secs(120)) else {
                return Vec::new();
            };
            out.stdout
                .lines()
                .filter_map(|l| {
                    let installed = l.starts_with('i');
                    let name = l.split_whitespace().last()?.to_owned();
                    (!installed_only || installed).then_some(RepositoryPackage {
                        name,
                        description: String::new(),
                        installed,
                    })
                })
                .collect()
        }
        _ => Vec::new(),
    }
}

/// Parses `tlmgr info --data name,installed,shortdesc` (CSV-like).
pub fn parse_tlmgr_info_data(out: &str) -> Vec<RepositoryPackage> {
    out.lines()
        .filter_map(|l| {
            let mut parts = l.splitn(3, ',');
            let name = parts.next()?.trim().to_owned();
            let installed = parts.next()?.trim() == "1";
            let description = parts
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches('"')
                .replace("\"\"", "\"");
            // Skip architecture-specific binary packages.
            (!name.is_empty() && !name.contains('.')).then_some(RepositoryPackage {
                name,
                description,
                installed,
            })
        })
        .collect()
}

/// Command opening the documentation of a package (`texdoc pkg`).
pub fn texdoc(dist: &Distribution, package: &str) -> Option<Cmd> {
    dist.tool("texdoc").map(|_| dist.cmd("texdoc").arg(package))
}

// ------------------------------------------------------------ distributions

/// A way to install a TeX distribution, proposed by the setup assistant.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistroOption {
    /// Identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// What it is and who it is for.
    pub description: Doc,
    /// Approximate download size.
    pub size: String,
    /// Recommended choice for this OS.
    pub recommended: bool,
    /// Needs administrator rights.
    pub needs_admin: bool,
    /// One-click installation, run by labaguetex with streamed output.
    pub command: Option<Cmd>,
    /// Official page for a manual installation.
    pub url: String,
    /// Where it gets installed / remarks.
    pub notes: Doc,
}

/// Installation options for this operating system, best first.
pub fn distro_options() -> Vec<DistroOption> {
    let has = |t: &str| {
        process::find_executable(
            t,
            &[
                PathBuf::from("/opt/homebrew/bin"),
                PathBuf::from("/usr/local/bin"),
            ],
        )
    };
    let mut v = Vec::new();
    let tinytex_desc = doc(
        "Minimal TeX Live (~250 MB) maintained by Yihui Xie. No administrator rights; missing packages are installed on demand, in one click, from labaguetex. Ideal for students.",
        "TeX Live minimal (~250 Mo) maintenu par Yihui Xie. Sans droits administrateur ; les packages manquants s'installent à la demande, en un clic, depuis labaguetex. Idéal pour les étudiants.",
    );
    let tectonic_desc = doc(
        "Modern self-contained engine: downloads exactly the packages a document needs, automatically. Compatible with most documents (no shell escape, fewer tools).",
        "Moteur moderne autonome : télécharge automatiquement exactement les packages nécessaires. Compatible avec la plupart des documents (pas de shell escape, moins d'outils).",
    );
    if cfg!(target_os = "macos") {
        v.push(DistroOption {
            id: "mactex".into(),
            name: "MacTeX".into(),
            description: doc(
                "The complete TeX Live for macOS (~6 GB): every package, every tool. The reference choice if you have the space.",
                "Le TeX Live complet pour macOS (~6 Go) : tous les packages, tous les outils. Le choix de référence si vous avez la place.",
            ),
            size: "6 GB".into(),
            recommended: true,
            needs_admin: true,
            command: None,
            url: "https://tug.org/mactex/mactex-download.html".into(),
            notes: doc("Download the .pkg and run it, then come back.", "Téléchargez le .pkg et lancez-le, puis revenez."),
        });
        v.push(tinytex(tinytex_desc.clone(), unix_tinytex()));
        v.push(DistroOption {
            id: "basictex".into(),
            name: "BasicTeX".into(),
            description: doc(
                "Small official TeX Live subset (~100 MB); add packages later with tlmgr (admin password).",
                "Petit sous-ensemble officiel de TeX Live (~100 Mo) ; ajoutez des packages ensuite avec tlmgr (mot de passe admin).",
            ),
            size: "100 MB".into(),
            recommended: false,
            needs_admin: true,
            command: None,
            url: "https://tug.org/mactex/morepackages.html".into(),
            notes: Doc::default(),
        });
        v.push(miktex(None));
        v.push(tectonic(
            tectonic_desc,
            has("brew").map(|b| Cmd::new(b).args(["install", "tectonic"])),
        ));
    } else if cfg!(windows) {
        let winget = has("winget").map(|w| {
            Cmd::new(w).args([
                "install",
                "--id",
                "MiKTeX.MiKTeX",
                "--exact",
                "--silent",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ])
        });
        let mut m = miktex(winget);
        m.recommended = true;
        v.push(m);
        v.push(DistroOption {
            id: "texlive".into(),
            name: "TeX Live".into(),
            description: doc(
                "The complete reference distribution (~7 GB). Everything is installed once for all.",
                "La distribution de référence complète (~7 Go). Tout est installé une fois pour toutes.",
            ),
            size: "7 GB".into(),
            recommended: false,
            needs_admin: false,
            command: None,
            url: "https://tug.org/texlive/windows.html".into(),
            notes: doc("Run install-tl-windows.exe, then come back.", "Lancez install-tl-windows.exe, puis revenez."),
        });
        v.push(tinytex(
            tinytex_desc,
            Some(Cmd::new("powershell").args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Invoke-WebRequest -UseBasicParsing https://yihui.org/tinytex/install-bin-windows.bat -OutFile $env:TEMP\\install-tinytex.bat; & $env:TEMP\\install-tinytex.bat",
            ])),
        ));
        v.push(tectonic(tectonic_desc, None));
    } else {
        let system = ["apt-get", "dnf", "pacman", "zypper"]
            .into_iter()
            .find(|t| has(t).is_some());
        if let Some(tool) = system {
            let (args, size): (Vec<&str>, &str) = match tool {
                "apt-get" => (vec!["install", "-y", "texlive-full"], "5 GB"),
                "dnf" => (vec!["install", "-y", "texlive-scheme-full"], "5 GB"),
                "zypper" => (vec!["install", "-y", "texlive-scheme-full"], "5 GB"),
                _ => (
                    vec![
                        "-S",
                        "--needed",
                        "--noconfirm",
                        "texlive",
                        "texlive-lang",
                        "biber",
                    ],
                    "3 GB",
                ),
            };
            v.push(DistroOption {
                id: "system".into(),
                name: format!("TeX Live ({tool})"),
                description: doc(
                    "TeX Live from your Linux distribution: installed and updated with the rest of the system.",
                    "TeX Live de votre distribution Linux : installé et mis à jour avec le reste du système.",
                ),
                size: size.into(),
                recommended: true,
                needs_admin: true,
                command: Some(Cmd::new(tool).args(args)),
                url: "https://tug.org/texlive/".into(),
                notes: Doc::default(),
            });
        }
        v.push(tinytex(tinytex_desc, unix_tinytex()));
        v.push(DistroOption {
            id: "texlive".into(),
            name: "TeX Live (official)".into(),
            description: doc(
                "Latest TeX Live from the official installer, updated with tlmgr.",
                "Dernier TeX Live via l'installeur officiel, mis à jour avec tlmgr.",
            ),
            size: "7 GB".into(),
            recommended: system.is_none(),
            needs_admin: false,
            command: None,
            url: "https://tug.org/texlive/quickinstall.html".into(),
            notes: Doc::default(),
        });
        v.push(tectonic(
            tectonic_desc,
            Some(Cmd::new("sh").args(["-c", "cd \"$HOME/.local/bin\" 2>/dev/null || mkdir -p \"$HOME/.local/bin\" && cd \"$HOME/.local/bin\" && curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh"])),
        ));
    }
    v
}

fn unix_tinytex() -> Option<Cmd> {
    Some(Cmd::new("sh").args([
        "-c",
        "if command -v curl >/dev/null; then curl -sL https://yihui.org/tinytex/install-bin-unix.sh | sh; else wget -qO- https://yihui.org/tinytex/install-bin-unix.sh | sh; fi",
    ]))
}

fn tinytex(description: Doc, command: Option<Cmd>) -> DistroOption {
    DistroOption {
        id: "tinytex".into(),
        name: "TinyTeX".into(),
        description,
        size: "250 MB".into(),
        recommended: false,
        needs_admin: false,
        command,
        url: "https://yihui.org/tinytex/".into(),
        notes: doc(
            "Installed in your user folder.",
            "Installé dans votre dossier utilisateur.",
        ),
    }
}

fn miktex(command: Option<Cmd>) -> DistroOption {
    DistroOption {
        id: "miktex".into(),
        name: "MiKTeX".into(),
        description: doc(
            "Installs only the basics and fetches missing packages automatically while compiling. Light and convenient.",
            "N'installe que l'essentiel et récupère automatiquement les packages manquants pendant la compilation. Léger et pratique.",
        ),
        size: "250 MB".into(),
        recommended: false,
        needs_admin: false,
        command,
        url: "https://miktex.org/download".into(),
        notes: doc(
            "Open the MiKTeX Console once after installing to finish the setup.",
            "Ouvrez une fois la console MiKTeX après l'installation pour finaliser la configuration.",
        ),
    }
}

fn tectonic(description: Doc, command: Option<Cmd>) -> DistroOption {
    DistroOption {
        id: "tectonic".into(),
        name: "Tectonic".into(),
        description,
        size: "30 MB".into(),
        recommended: false,
        needs_admin: false,
        command,
        url: "https://tectonic-typesetting.github.io/install.html".into(),
        notes: Doc::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tlmgr_outputs() {
        let search = "tlmgr: package repository https://mirror/tlpkg (verified)\nsiunitx:\n\ttexmf-dist/tex/latex/siunitx/siunitx.sty\nsomebundle:\n\ttexmf-dist/tex/latex/other/siunitx.sty\n";
        assert_eq!(
            parse_tlmgr_file_search(search, "siunitx.sty").as_deref(),
            Some("siunitx")
        );
        let info = "amsmath,1,\"AMS mathematical facilities for LaTeX\"\nbeamer,0,A LaTeX class for producing presentations\nbiber.x86_64-linux,0,\n";
        let pkgs = parse_tlmgr_info_data(info);
        assert_eq!(pkgs.len(), 2);
        assert!(pkgs[0].installed);
        assert_eq!(pkgs[0].description, "AMS mathematical facilities for LaTeX");
    }

    #[test]
    fn options_exist_for_this_os() {
        let opts = distro_options();
        assert!(opts.iter().any(|o| o.id == "tinytex"));
        assert!(opts.iter().filter(|o| o.recommended).count() >= 1);
    }
}
