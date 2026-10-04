//! What a document can use, wherever it comes from.
//!
//! The curated knowledge base names the arguments of the commands it
//! describes and what they expect. It cannot hold every package: what it
//! does not describe is read where it is defined. The commands and the
//! environments of the project come from its own `\newcommand`,
//! `\NewDocumentCommand`, `\def`, `\newenvironment`, `\newtheorem`; those of
//! a package from the source of the package, found in the TeX distribution
//! ([`crate::tex::PackageAnalyzer`]) for each package the document loads and
//! everything these load in turn.
//!
//! The search for the cause of an error ([`super::cause`]) asks here: so a
//! macro of the user or a command of any installed package gets its
//! mistakes explained like one of the knowledge base (an argument that is
//! not written, a command of formulas in text, a misspelled name).

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use crate::kb::{Mode, kb};
use crate::syntax::DocumentIndex;
use crate::tex::PackageInfo;

/// What is known of a command or an environment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Known {
    /// The arguments as they are written (`[width]{text}`, or `[]{}` when
    /// their names are not known); `None` when they cannot be told.
    pub args: Option<String>,
    /// Where it can be written.
    pub mode: Mode,
    /// An environment whose body is a formula.
    pub math: bool,
    /// For a macro of the project that only works in a formula: the command
    /// of its definition that needs one (`\mathbb` for `\R`).
    pub because: Option<String>,
}

#[derive(Debug, Clone)]
struct Entry {
    signature: Option<String>,
    math: bool,
    because: Option<String>,
}

impl Entry {
    fn known(&self) -> Known {
        Known {
            args: self.signature.clone(),
            mode: if self.math { Mode::Math } else { Mode::Any },
            math: false,
            because: self.because.clone(),
        }
    }
}

/// The commands and environments of a project and of the packages it loads.
#[derive(Debug, Default)]
pub(crate) struct Learned {
    own_commands: HashMap<String, Entry>,
    own_environments: HashMap<String, Entry>,
    package_commands: HashMap<String, Entry>,
    package_environments: HashMap<String, Entry>,
}

static COMMAND: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\\([A-Za-z@]+)").unwrap());

/// What opens a formula by itself: a definition that holds one of them can
/// be used in text.
const OPENS_A_FORMULA: &[&str] = &["\\ensuremath", "$", "\\(", "\\[", "\\begin"];

impl Learned {
    /// Reads the definitions of the project (`indexes`) and what the sources
    /// of its packages define (`packages`, in the order they are loaded).
    pub(crate) fn new<'a>(
        indexes: impl IntoIterator<Item = &'a DocumentIndex>,
        packages: &[std::sync::Arc<PackageInfo>],
    ) -> Self {
        let mut out = Self::default();
        let mut bodies: Vec<(String, String)> = Vec::new();
        for index in indexes {
            for c in &index.command_defs {
                out.own_commands.insert(
                    c.name.clone(),
                    Entry {
                        signature: c.signature.clone(),
                        math: c.math,
                        because: None,
                    },
                );
                bodies.push((c.name.clone(), c.body.clone()));
            }
            for e in &index.environment_defs {
                out.own_environments.insert(
                    e.name.clone(),
                    Entry {
                        signature: e.signature.clone(),
                        math: false,
                        because: None,
                    },
                );
            }
        }
        for info in packages {
            for c in &info.commands {
                out.package_commands
                    .entry(c.name.clone())
                    .or_insert_with(|| Entry {
                        signature: c.signature.clone(),
                        math: c.math,
                        because: None,
                    });
            }
            for e in &info.environments {
                out.package_environments
                    .entry(e.name.clone())
                    .or_insert_with(|| Entry {
                        signature: e.signature.clone(),
                        math: false,
                        because: None,
                    });
            }
        }
        // A macro made of a command of formulas (`\newcommand{\R}{\mathbb{R}}`)
        // only works in a formula too, and so does one made of such a macro.
        for _ in 0..3 {
            let mut changed = false;
            for (name, body) in &bodies {
                if out.own_commands[name].math {
                    continue;
                }
                if let Some(because) = out.needs_a_formula(body) {
                    let entry = out.own_commands.get_mut(name).unwrap();
                    entry.math = true;
                    entry.because = Some(because);
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        out
    }

    /// The first command of a definition that only exists in a formula,
    /// when the definition does not open one itself.
    fn needs_a_formula(&self, body: &str) -> Option<String> {
        if body.is_empty() || OPENS_A_FORMULA.iter().any(|o| body.contains(o)) {
            return None;
        }
        COMMAND.captures_iter(body).find_map(|c| {
            let name = &c[1];
            let math = match self.own_commands.get(name) {
                Some(own) => own.math,
                None => kb()
                    .command(name, None)
                    .is_some_and(|k| k.mode == Mode::Math),
            };
            math.then(|| format!("\\{name}"))
        })
    }

    /// A command: as the project defines it, else as the knowledge base
    /// describes it, else as the source of a loaded package defines it.
    pub(crate) fn command(&self, name: &str) -> Option<Known> {
        if let Some(own) = self.own_commands.get(name) {
            return Some(own.known());
        }
        if let Some(k) = kb().command(name, None) {
            return Some(Known {
                args: Some(k.args.clone()),
                mode: k.mode,
                math: false,
                because: None,
            });
        }
        self.package_commands.get(name).map(Entry::known)
    }

    /// An environment, looked for like a command.
    pub(crate) fn environment(&self, name: &str) -> Option<Known> {
        if let Some(own) = self.own_environments.get(name) {
            return Some(own.known());
        }
        if let Some(k) = kb().environment(name, None) {
            return Some(Known {
                args: Some(k.args.clone()),
                mode: k.mode,
                math: k.math,
                because: None,
            });
        }
        self.package_environments.get(name).map(Entry::known)
    }

    /// Whether a command only exists in a formula.
    pub(crate) fn math_only(&self, name: &str) -> bool {
        self.command(name).is_some_and(|k| k.mode == Mode::Math)
    }

    /// The commands the sources of the loaded packages define.
    pub(crate) fn package_commands(&self) -> impl Iterator<Item = &str> {
        self.package_commands.keys().map(String::as_str)
    }

    /// The environments the sources of the loaded packages define.
    pub(crate) fn package_environments(&self) -> impl Iterator<Item = &str> {
        self.package_environments.keys().map(String::as_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::syntax::scan;

    #[test]
    fn the_definitions_of_the_project_are_known() {
        let index = scan(
            "\\newcommand{\\norme}[2][2]{\\left\\lVert #2 \\right\\rVert_{#1}}\n\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\RR}{\\R^2}\n\\newcommand{\\reel}{\\ensuremath{\\mathbb{R}}}\n\\NewDocumentCommand{\\cadre}{s O{1pt} m o m}{#3}\n\\def\\paire#1#2{(#1, #2)}\n\\def\\jusqua#1.{#1}\n\\newenvironment{encadre}[1]{\\textbf{#1}}{}\n\\newtheorem{lemme}{Lemme}\n\\DeclareMathOperator{\\argmax}{argmax}\n",
        );
        let known = Learned::new([&index], &[]);
        let args = |name: &str| known.command(name).unwrap().args;
        assert_eq!(args("norme").as_deref(), Some("[]{}"));
        assert_eq!(args("cadre").as_deref(), Some("[]{}[]{}"));
        assert_eq!(args("paire").as_deref(), Some("{}{}"));
        // Delimited parameters: the arguments cannot be told.
        assert_eq!(args("jusqua"), None);
        // What a definition is made of tells where it can be written.
        let r = known.command("R").unwrap();
        assert_eq!(
            (r.mode, r.because.as_deref()),
            (Mode::Math, Some("\\mathbb"))
        );
        assert_eq!(known.command("RR").unwrap().because.as_deref(), Some("\\R"));
        assert_eq!(known.command("reel").unwrap().mode, Mode::Any);
        assert!(known.math_only("argmax") && known.math_only("norme"));
        let env = |name: &str| known.environment(name).unwrap().args;
        assert_eq!(env("encadre").as_deref(), Some("{}"));
        assert_eq!(env("lemme").as_deref(), Some("[]"));
        // The knowledge base still answers for what the project does not define.
        assert_eq!(known.command("frac").unwrap().mode, Mode::Math);
        assert!(known.command("nexistepas").is_none());
    }
}
