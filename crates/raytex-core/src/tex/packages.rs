//! Learning what any package provides by reading its source.
//!
//! This is what makes RayTeX work with *every* package, not only the
//! ones described in the curated knowledge base: for each package (or
//! class) used by a document, the `.sty`/`.cls` file is located in the
//! distribution, scanned with the same fault-tolerant scanner as documents
//! (with `@` as a letter), and its public commands, environments and
//! options are extracted. Dependencies (`\RequirePackage`, `\LoadClass`,
//! `\input` of code files) are followed. Results are cached per file.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex, OnceLock};

use regex::Regex;

use serde::Serialize;

use super::texmf::TexmfIndex;
use crate::syntax::{ScanOptions, scan_with};

/// Maximum size of one file to analyse.
const MAX_FILE: usize = 4 * 1024 * 1024;
/// Maximum number of code files followed through `\input` per package.
const MAX_INPUTS: usize = 24;

/// A command found in a package source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedCommand {
    /// Name without backslash.
    pub name: String,
    /// Number of arguments.
    pub args: u8,
    /// Whether the first argument is optional.
    pub first_optional: bool,
    /// Whether it is math-only (symbols, operators).
    pub math: bool,
    /// The arguments as they are written, `[]{}{}`, when the definition
    /// tells them.
    pub signature: Option<String>,
}

/// An environment found in a package source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedEnvironment {
    /// Name.
    pub name: String,
    /// Number of arguments.
    pub args: u8,
    /// The arguments after `\begin{name}`, `[]{}`, when the definition
    /// tells them.
    pub signature: Option<String>,
}

/// What a package provides, as read from its source.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    /// Package or class name.
    pub name: String,
    /// Whether it is a class.
    pub class: bool,
    /// Whether it was found in the distribution.
    pub installed: bool,
    /// Path of the main file.
    pub path: Option<PathBuf>,
    /// `\ProvidesPackage` information (date, version, description).
    pub description: Option<String>,
    /// Public commands.
    pub commands: Vec<ExtractedCommand>,
    /// Environments.
    pub environments: Vec<ExtractedEnvironment>,
    /// Declared options.
    pub options: Vec<String>,
    /// Packages and classes it loads.
    pub requires: Vec<String>,
}

/// The forms a definition takes in the source of a package: the name of the
/// command (first two groups) or of the environment (third group) it defines.
/// Redefinitions (`\renewcommand`, `\let`) are left out: what they change
/// exists somewhere else.
static DEFINITION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"\\(?:(?:provide|new)command|DeclareRobustCommand",
        r"|(?:New|Provide|Declare)(?:Expandable)?DocumentCommand",
        r"|(?:new|provide)robustcmd|DeclareMathOperator",
        r"|DeclareMath(?:Symbol|Delimiter|Accent|Alphabet|Radical)",
        r"|DeclarePairedDelimiter(?:X|XPP)?|[gex]?def)\*?\s*\{?\s*\\([A-Za-z@_:]+)",
        // The end of an environment made by hand: `\let\endfoo\endlist`.
        r"|\\let\s*\\(end[A-Za-z]+)\b",
        r"|\\(?:newenvironment|(?:New|Provide|Declare)DocumentEnvironment)\*?\s*\{\s*([A-Za-z@]+\*?)\s*\}",
    ))
    .unwrap()
});

/// Which installed packages define a command or an environment, for the
/// whole distribution: every `.sty` is searched once for the definitions it
/// holds (their forms only, not the full scan of [`PackageAnalyzer::analyze`]).
/// This is what tells that `\marginnote` needs the package `marginnote`
/// when nothing describes that package.
#[derive(Debug, Default)]
pub struct Providers {
    packages: Vec<String>,
    /// Whether the package is the one its folder is named after (the main
    /// file of what is installed there), by package.
    main: Vec<bool>,
    commands: HashMap<Box<str>, Vec<u32>>,
    environments: HashMap<Box<str>, Vec<u32>>,
    /// The same for the classes: what a class defines is not something a
    /// package adds (`\chapter` in `article`).
    classes: Vec<String>,
    class_commands: HashMap<Box<str>, Vec<u32>>,
    class_environments: HashMap<Box<str>, Vec<u32>>,
}

/// What one file defines: its rank in the list it comes from, whether it is
/// the main file of its folder, its commands and its environments.
type Found = (u32, bool, Vec<String>, Vec<String>);

/// Searches the files `names` (with extension `ext`) for what they define.
fn search(index: &TexmfIndex, names: &[String], ext: &str) -> Vec<Found> {
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
    let chunk = names.len().div_ceil(threads).max(1);
    std::thread::scope(|scope| {
        let workers: Vec<_> = names
            .chunks(chunk)
            .enumerate()
            .map(|(n, names)| {
                scope.spawn(move || {
                    let mut out: Vec<Found> = Vec::new();
                    for (i, name) in names.iter().enumerate() {
                        let file = format!("{name}.{ext}");
                        let Some(text) = index.read(&file) else {
                            continue;
                        };
                        if text.len() > MAX_FILE {
                            continue;
                        }
                        let mut commands: Vec<String> = Vec::new();
                        let mut environments = Vec::new();
                        for c in DEFINITION.captures_iter(&text) {
                            if let Some(m) = c.get(1).or(c.get(2)) {
                                if is_public(m.as_str()) {
                                    commands.push(m.as_str().to_owned());
                                }
                            } else if let Some(m) = c.get(3) {
                                environments.push(m.as_str().to_owned());
                            }
                        }
                        // `\def\foo … \def\endfoo` defines environment `foo`.
                        for end in &commands {
                            if let Some(env) = end.strip_prefix("end")
                                && !env.is_empty()
                                && commands.iter().any(|c| c == env)
                            {
                                environments.push(env.to_owned());
                            }
                        }
                        let main = index
                            .find(&file)
                            .and_then(|p| {
                                p.parent()
                                    .and_then(|d| d.file_name())
                                    .map(|d| d.to_string_lossy() == name.as_str())
                            })
                            .unwrap_or(false);
                        out.push(((n * chunk + i) as u32, main, commands, environments));
                    }
                    out
                })
            })
            .collect();
        workers
            .into_iter()
            .flat_map(|w| w.join().unwrap_or_default())
            .collect()
    })
}

/// Files by what they define.
type Defined = HashMap<Box<str>, Vec<u32>>;

fn by_name(found: Vec<Found>, main: &mut [bool]) -> (Defined, Defined) {
    let (mut commands, mut environments) = (Defined::new(), Defined::new());
    for (file, is_main, cs, envs) in found {
        main[file as usize] = is_main;
        for (names, map) in [(cs, &mut commands), (envs, &mut environments)] {
            for name in names {
                let list = map.entry(name.into_boxed_str()).or_default();
                if !list.contains(&file) {
                    list.push(file);
                }
            }
        }
    }
    (commands, environments)
}

impl Providers {
    fn build(index: &TexmfIndex) -> Self {
        // A bundle read file by file through a program is not searched.
        if !index.on_disk() {
            return Self::default();
        }
        // The `lwarp-*` files stand for other packages when a document is
        // converted to HTML: nobody loads them.
        let packages: Vec<String> = index
            .packages()
            .into_iter()
            .filter(|p| !p.starts_with("lwarp-"))
            .collect();
        let classes = index.classes();
        let mut main = vec![false; packages.len()];
        let (commands, environments) = by_name(search(index, &packages, "sty"), &mut main);
        let mut class_main = vec![false; classes.len()];
        let (class_commands, class_environments) =
            by_name(search(index, &classes, "cls"), &mut class_main);
        Self {
            packages,
            main,
            commands,
            environments,
            classes,
            class_commands,
            class_environments,
        }
    }

    /// The installed classes that define command `name` themselves
    /// (`report` and `book` for `chapter`).
    pub fn classes_with_command(&self, name: &str) -> Vec<&str> {
        self.classes_in(self.class_commands.get(name))
    }

    /// The installed classes that define environment `name` themselves.
    pub fn classes_with_environment(&self, name: &str) -> Vec<&str> {
        self.classes_in(self.class_environments.get(name))
    }

    fn classes_in(&self, list: Option<&Vec<u32>>) -> Vec<&str> {
        let mut out: Vec<&str> = list
            .into_iter()
            .flatten()
            .map(|&i| self.classes[i as usize].as_str())
            .collect();
        out.sort_unstable();
        out
    }

    fn named(&self, list: Option<&Vec<u32>>, name: &str) -> Vec<Provider<'_>> {
        let mut out: Vec<Provider<'_>> = list
            .into_iter()
            .flatten()
            .map(|&i| Provider {
                package: self.packages[i as usize].as_str(),
                main: self.main[i as usize],
            })
            .collect();
        // The package named like what it defines comes first, then the
        // main file of a folder, then the others.
        out.sort_by_key(|p| (p.package != name, !p.main, p.package));
        out
    }

    /// The installed packages that define command `name` (without
    /// backslash), the most likely first.
    pub fn of_command(&self, name: &str) -> Vec<Provider<'_>> {
        self.named(self.commands.get(name), name)
    }

    /// The installed packages that define environment `name`.
    pub fn of_environment(&self, name: &str) -> Vec<Provider<'_>> {
        self.named(self.environments.get(name), name)
    }

    /// Number of packages searched.
    pub fn len(&self) -> usize {
        self.packages.len()
    }

    /// Whether nothing was searched (no distribution on disk).
    pub fn is_empty(&self) -> bool {
        self.packages.is_empty()
    }
}

/// A package that defines a name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Provider<'a> {
    /// Its name.
    pub package: &'a str,
    /// Whether its folder is named after it: the main file of what is
    /// installed there, not a part of something else.
    pub main: bool,
}

/// Analyses packages of a distribution, with a cache.
#[derive(Debug)]
pub struct PackageAnalyzer {
    index: Arc<TexmfIndex>,
    cache: Mutex<HashMap<(String, bool), Arc<PackageInfo>>>,
    providers: OnceLock<Providers>,
}

impl PackageAnalyzer {
    /// Creates an analyzer over a file index.
    pub fn new(index: Arc<TexmfIndex>) -> Self {
        Self {
            index,
            cache: Mutex::new(HashMap::new()),
            providers: OnceLock::new(),
        }
    }

    /// Which installed packages define what: every package of the
    /// distribution is searched the first time this is asked (some seconds;
    /// the application asks in the background, when it starts).
    pub fn providers(&self) -> &Providers {
        self.providers.get_or_init(|| Providers::build(&self.index))
    }

    /// The file index.
    pub fn index(&self) -> &TexmfIndex {
        &self.index
    }

    /// Analyses one package (`class = false`) or class.
    pub fn analyze(&self, name: &str, class: bool) -> Arc<PackageInfo> {
        let key = (name.to_owned(), class);
        if let Some(info) = self.cache.lock().unwrap().get(&key) {
            return info.clone();
        }
        let info = Arc::new(self.analyze_uncached(name, class));
        self.cache.lock().unwrap().insert(key, info.clone());
        info
    }

    /// Analyses a class and packages together with everything they load.
    /// The result is in dependency order (the given ones first).
    pub fn closure<'a>(
        &self,
        class: Option<&str>,
        packages: impl IntoIterator<Item = &'a str>,
    ) -> Vec<Arc<PackageInfo>> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let mut queue: std::collections::VecDeque<(String, bool)> =
            std::collections::VecDeque::new();
        if let Some(c) = class {
            queue.push_back((c.to_owned(), true));
        }
        queue.extend(packages.into_iter().map(|p| (p.to_owned(), false)));
        while let Some((name, is_class)) = queue.pop_front() {
            if !seen.insert((name.clone(), is_class)) || out.len() > 200 {
                continue;
            }
            let info = self.analyze(&name, is_class);
            for dep in &info.requires {
                let (dep_name, dep_class) = match dep.strip_prefix("class:") {
                    Some(c) => (c.to_owned(), true),
                    None => (dep.clone(), false),
                };
                queue.push_back((dep_name, dep_class));
            }
            out.push(info);
        }
        out
    }

    /// What LaTeX itself defines (`latex.ltx`): the commands of the kernel
    /// that nothing else describes are read there, like those of a package.
    pub fn kernel(&self) -> Arc<PackageInfo> {
        let key = ("latex.ltx".to_owned(), false);
        if let Some(info) = self.cache.lock().unwrap().get(&key) {
            return info.clone();
        }
        let info = Arc::new(self.analyze_file("latex", "latex.ltx".to_owned(), false));
        self.cache.lock().unwrap().insert(key, info.clone());
        info
    }

    fn analyze_uncached(&self, name: &str, class: bool) -> PackageInfo {
        let file = format!("{name}.{}", if class { "cls" } else { "sty" });
        self.analyze_file(name, file, class)
    }

    fn analyze_file(&self, name: &str, file: String, class: bool) -> PackageInfo {
        let mut info = PackageInfo {
            name: name.to_owned(),
            class,
            ..PackageInfo::default()
        };
        let Some(text) = self.index.read(&file) else {
            return info;
        };
        info.installed = true;
        info.path = self.index.find(&file);

        let mut commands: HashMap<String, ExtractedCommand> = HashMap::new();
        let mut environments: HashMap<String, ExtractedEnvironment> = HashMap::new();
        let mut options: Vec<String> = Vec::new();
        let mut requires: Vec<String> = Vec::new();
        let mut queue = vec![text];
        let mut visited: HashSet<String> = HashSet::new();
        visited.insert(file);
        let mut inputs = 0;
        while let Some(text) = queue.pop() {
            if text.len() > MAX_FILE {
                continue;
            }
            let idx = scan_with(
                &text,
                ScanOptions {
                    at_letter: true,
                    descend_definitions: true,
                },
            );
            if info.description.is_none() {
                info.description = idx
                    .provides
                    .as_ref()
                    .map(|p| p.info.clone())
                    .filter(|s| !s.is_empty());
            }
            for def in &idx.command_defs {
                if is_public(&def.name) {
                    commands
                        .entry(def.name.clone())
                        .or_insert(ExtractedCommand {
                            name: def.name.clone(),
                            args: def.args,
                            first_optional: def.first_optional,
                            math: def.math,
                            signature: def.signature.clone(),
                        });
                }
            }
            for env in &idx.environment_defs {
                if is_public(&env.name) {
                    environments
                        .entry(env.name.clone())
                        .or_insert(ExtractedEnvironment {
                            name: env.name.clone(),
                            args: env.args,
                            signature: env.signature.clone(),
                        });
                }
            }
            for opt in &idx.declared_options {
                if !options.contains(opt) {
                    options.push(opt.clone());
                }
            }
            for p in &idx.packages {
                if !requires.contains(&p.name) && p.name != name {
                    requires.push(p.name.clone());
                }
            }
            if let Some(c) = &idx.load_class {
                requires.push(format!("class:{c}"));
            }
            // Follow code files included with \input (tikz → tikz.code.tex…).
            for inc in &idx.includes {
                if inputs >= MAX_INPUTS || !matches!(inc.kind, crate::syntax::IncludeKind::Input) {
                    continue;
                }
                let target = if inc.path.contains('.') {
                    inc.path.clone()
                } else {
                    format!("{}.tex", inc.path)
                };
                if visited.insert(target.clone())
                    && let Some(t) = self.index.read(&target)
                {
                    inputs += 1;
                    queue.push(t);
                }
            }
        }
        // `\def\foo … \def\endfoo` defines environment `foo`.
        let names: Vec<String> = commands.keys().cloned().collect();
        for n in &names {
            if let Some(env) = n.strip_prefix("end")
                && !env.is_empty()
                && let Some(begin) = commands.get(env)
            {
                let signature = begin.signature.clone();
                environments
                    .entry(env.to_owned())
                    .or_insert(ExtractedEnvironment {
                        name: env.to_owned(),
                        args: 0,
                        signature,
                    });
                commands.remove(n);
            }
        }
        info.commands = commands.into_values().collect();
        info.commands.sort_by(|a, b| a.name.cmp(&b.name));
        info.environments = environments.into_values().collect();
        info.environments.sort_by(|a, b| a.name.cmp(&b.name));
        info.options = options;
        info.requires = requires;
        info
    }
}

/// Whether a command name is meant for users (not internal).
fn is_public(name: &str) -> bool {
    !name.is_empty()
        && !name.contains(['@', ':', '_'])
        && name.chars().all(|c| c.is_ascii_alphabetic())
        && !name.starts_with("if")
        && !name.ends_with("true")
        && !name.ends_with("false")
        && !matches!(name, "next" | "reserved" | "tmp" | "x" | "y" | "z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_names() {
        assert!(is_public("mathbb"));
        assert!(!is_public("@tempa"));
        assert!(!is_public("cs_new:Npn"));
        assert!(!is_public("ifmmode"));
    }

    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn analyses_real_packages() {
        let dist = super::super::discovery::detect(&[])
            .into_iter()
            .next()
            .expect("no TeX distribution");
        let index = Arc::new(TexmfIndex::build(&dist));
        println!(
            "{} files indexed, {} packages",
            index.len(),
            index.packages().len()
        );
        // MiKTeX installs most packages on first use: only those present
        // are checked.
        let installed = |file: &str| index.find(file).is_some();
        let (siunitx_here, beamer_here) = (installed("siunitx.sty"), installed("beamer.cls"));
        let analyzer = PackageAnalyzer::new(index);
        for (pkg, class) in [
            ("amssymb", false),
            ("siunitx", false),
            ("tikz", false),
            ("beamer", true),
            ("cleveref", false),
        ] {
            let info = analyzer.analyze(pkg, class);
            println!(
                "{pkg}: {} commands, {} envs, {} options, requires {:?}, {:?}",
                info.commands.len(),
                info.environments.len(),
                info.options.len(),
                info.requires,
                info.description
            );
        }
        let amsfonts = analyzer.analyze("amsfonts", false);
        assert!(
            amsfonts.commands.iter().any(|c| c.name == "mathbb"),
            "{:?}",
            amsfonts.commands
        );
        let tikz = analyzer.analyze("tikz", false);
        assert!(tikz.commands.iter().any(|c| c.name == "draw"));
        // The kernel is read like a package: `\fontsize` takes two arguments.
        let started = std::time::Instant::now();
        let kernel = analyzer.kernel();
        println!(
            "kernel: {} commands in {:?}",
            kernel.commands.len(),
            started.elapsed()
        );
        let fontsize = kernel.commands.iter().find(|c| c.name == "fontsize");
        assert_eq!(
            fontsize.and_then(|c| c.signature.as_deref()),
            Some("{}{}"),
            "{fontsize:?}"
        );
        // Which package defines what, for the whole distribution.
        let started = std::time::Instant::now();
        let providers = analyzer.providers();
        println!(
            "{} packages searched in {:?}",
            providers.len(),
            started.elapsed()
        );
        for name in [
            "marginnote",
            "lipsum",
            "todo",
            "R",
            "paire",
            "shadowbox",
            "ding",
        ] {
            println!("\\{name}: {:?}", providers.of_command(name));
        }
        println!(
            "classes with \\chapter: {:?}",
            providers.classes_with_command("chapter")
        );
        let classes = providers.classes_with_command("chapter");
        assert!(classes.contains(&"book") && !classes.contains(&"article"));
        assert!(
            providers
                .classes_with_environment("abstract")
                .contains(&"article")
        );
        for name in ["compactitem", "tcolorbox", "multicols"] {
            println!("{name}: {:?}", providers.of_environment(name));
        }
        if analyzer.index().find("marginnote.sty").is_some() {
            assert_eq!(
                providers
                    .of_command("marginnote")
                    .first()
                    .map(|p| p.package),
                Some("marginnote")
            );
        }
        if analyzer.index().find("paralist.sty").is_some() {
            let found = providers.of_environment("compactitem");
            assert!(
                found.iter().any(|p| p.package == "paralist" && p.main),
                "{found:?}"
            );
        }
        if siunitx_here {
            let siunitx = analyzer.analyze("siunitx", false);
            assert!(siunitx.commands.iter().any(|c| c.name == "qty"));
        }
        if beamer_here {
            let beamer = analyzer.analyze("beamer", true);
            assert!(
                beamer.options.iter().any(|o| o.starts_with("aspectratio")),
                "{:?}",
                beamer.options
            );
        }
    }
}
