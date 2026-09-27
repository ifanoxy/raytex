//! Learning what any package provides by reading its source.
//!
//! This is what makes labaguetex work with *every* package, not only the
//! ones described in the curated knowledge base: for each package (or
//! class) used by a document, the `.sty`/`.cls` file is located in the
//! distribution, scanned with the same fault-tolerant scanner as documents
//! (with `@` as a letter), and its public commands, environments and
//! options are extracted. Dependencies (`\RequirePackage`, `\LoadClass`,
//! `\input` of code files) are followed. Results are cached per file.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

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
}

/// An environment found in a package source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedEnvironment {
    /// Name.
    pub name: String,
    /// Number of arguments.
    pub args: u8,
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

/// Analyses packages of a distribution, with a cache.
#[derive(Debug)]
pub struct PackageAnalyzer {
    index: Arc<TexmfIndex>,
    cache: Mutex<HashMap<(String, bool), Arc<PackageInfo>>>,
}

impl PackageAnalyzer {
    /// Creates an analyzer over a file index.
    pub fn new(index: Arc<TexmfIndex>) -> Self {
        Self {
            index,
            cache: Mutex::new(HashMap::new()),
        }
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

    fn analyze_uncached(&self, name: &str, class: bool) -> PackageInfo {
        let file = format!("{name}.{}", if class { "cls" } else { "sty" });
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
                && commands.contains_key(env)
            {
                environments
                    .entry(env.to_owned())
                    .or_insert(ExtractedEnvironment {
                        name: env.to_owned(),
                        args: 0,
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
        let siunitx = analyzer.analyze("siunitx", false);
        assert!(siunitx.commands.iter().any(|c| c.name == "qty"));
        let beamer = analyzer.analyze("beamer", true);
        assert!(
            beamer.options.iter().any(|o| o.starts_with("aspectratio")),
            "{:?}",
            beamer.options
        );
    }
}
