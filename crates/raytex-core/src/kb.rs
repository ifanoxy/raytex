//! Knowledge base: what LaTeX packages provide.
//!
//! One JSON file per package or class lives in `data/packages/` (see
//! `docs/knowledge-base.md` for the schema). Files are embedded at build time
//! and parsed lazily on first use. The knowledge base powers completion,
//! hover documentation, the symbol palette, the command reference and the
//! "missing `\usepackage`" diagnostics.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

use crate::i18n::Lang;

mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}

#[allow(unused_imports)]
pub(crate) use embedded::HELP_PAGES;
pub(crate) use embedded::TEMPLATE_FILES;

/// A bilingual documentation string.
#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct Doc {
    /// English text.
    #[serde(default)]
    pub en: String,
    /// French text.
    #[serde(default)]
    pub fr: String,
}

impl Doc {
    /// Text in `lang`, falling back to English.
    pub fn get(&self, lang: Lang) -> &str {
        match lang {
            Lang::Fr if !self.fr.is_empty() => &self.fr,
            _ => &self.en,
        }
    }
}

/// Where a command may be used.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Anywhere.
    #[default]
    Any,
    /// Text mode only.
    Text,
    /// Math mode only.
    Math,
    /// Preamble only.
    Preamble,
}

/// An option accepted by a package or class.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum OptionSpec {
    Name(String),
    Full {
        name: String,
        #[serde(default)]
        doc: Doc,
    },
}

#[derive(Debug, Deserialize)]
struct PackageFile {
    name: String,
    #[serde(default)]
    class: bool,
    #[serde(default)]
    description: Doc,
    #[serde(default)]
    loads: Vec<String>,
    #[serde(default)]
    options: Vec<OptionSpec>,
    #[serde(default)]
    commands: Vec<CommandFile>,
    #[serde(default)]
    environments: Vec<EnvironmentFile>,
    /// `category → [[name, glyph], …]` compact list of math symbols.
    #[serde(default)]
    symbols: Vec<SymbolGroupFile>,
}

#[derive(Debug, Deserialize)]
struct SymbolGroupFile {
    category: String,
    #[serde(default)]
    mode: Option<Mode>,
    items: Vec<(String, String)>,
}

#[derive(Debug, Deserialize)]
struct CommandFile {
    name: String,
    #[serde(default)]
    args: String,
    #[serde(default)]
    mode: Mode,
    #[serde(default)]
    doc: Doc,
    #[serde(default)]
    glyph: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    snippet: Option<String>,
    #[serde(default)]
    example: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EnvironmentFile {
    name: String,
    #[serde(default)]
    args: String,
    /// The environment body is in math mode (`align`).
    #[serde(default)]
    math: bool,
    /// Where the environment may be used (`pmatrix` is math-only).
    #[serde(default)]
    mode: Mode,
    #[serde(default)]
    doc: Doc,
    /// Body inserted between `\begin` and `\end` (snippet syntax).
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    example: Option<String>,
}

/// A package or class of the knowledge base.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    /// Name (`amsmath`).
    pub name: String,
    /// Whether it is a document class.
    pub class: bool,
    /// What it is for.
    pub description: Doc,
    /// Packages it loads itself.
    pub loads: Vec<String>,
    /// Known options.
    pub options: Vec<PackageOption>,
    /// Number of documented commands.
    pub command_count: usize,
    /// Number of documented environments.
    pub environment_count: usize,
}

/// A documented option of a package.
#[derive(Debug, Clone, Serialize)]
pub struct PackageOption {
    /// Option name (possibly `key=`).
    pub name: String,
    /// Documentation.
    pub doc: Doc,
}

/// A documented command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    /// Name without backslash.
    pub name: String,
    /// Providing package (`latex` for the kernel).
    pub package: String,
    /// Argument signature, e.g. `[n]{radicand}`.
    pub args: String,
    /// Where it can be used.
    pub mode: Mode,
    /// Documentation.
    pub doc: Doc,
    /// Unicode rendering for symbols.
    pub glyph: Option<String>,
    /// Symbol palette category.
    pub category: Option<String>,
    /// Snippet inserted on completion (CodeMirror `${1:x}` syntax, without `\`).
    pub snippet: String,
    /// Example of use.
    pub example: Option<String>,
}

/// A documented environment.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    /// Name.
    pub name: String,
    /// Providing package.
    pub package: String,
    /// Argument signature after `\begin{name}`.
    pub args: String,
    /// Whether the body is in math mode.
    pub math: bool,
    /// Where the environment may be used.
    pub mode: Mode,
    /// Documentation.
    pub doc: Doc,
    /// Snippet for the arguments and body (between `\begin{name}` and `\end{name}`).
    pub snippet_args: String,
    /// Snippet body.
    pub snippet_body: String,
    /// Example of use.
    pub example: Option<String>,
}

/// The whole knowledge base.
#[derive(Debug)]
pub struct KnowledgeBase {
    packages: Vec<Package>,
    package_index: HashMap<String, usize>,
    class_index: HashMap<String, usize>,
    commands: Vec<Command>,
    command_index: HashMap<String, Vec<usize>>,
    environments: Vec<Environment>,
    environment_index: HashMap<String, Vec<usize>>,
}

static KB: LazyLock<KnowledgeBase> = LazyLock::new(KnowledgeBase::load);

/// The global knowledge base (parsed on first use, ~1 ms).
pub fn kb() -> &'static KnowledgeBase {
    &KB
}

/// Name used for the LaTeX kernel (always loaded).
pub const KERNEL: &str = "latex";

impl KnowledgeBase {
    fn load() -> Self {
        let mut kb = KnowledgeBase {
            packages: Vec::new(),
            package_index: HashMap::new(),
            class_index: HashMap::new(),
            commands: Vec::new(),
            command_index: HashMap::new(),
            environments: Vec::new(),
            environment_index: HashMap::new(),
        };
        // The kernel first so that it wins ties.
        let mut files: Vec<&(&str, &str)> = embedded::PACKAGES.iter().collect();
        files.sort_by_key(|(stem, _)| (*stem != KERNEL, *stem));
        for (stem, json) in files {
            match serde_json::from_str::<PackageFile>(json) {
                Ok(file) => kb.add(file),
                Err(err) => tracing::error!("invalid knowledge base file {stem}.json: {err}"),
            }
        }
        kb
    }

    fn add(&mut self, file: PackageFile) {
        let package = file.name.clone();
        let mut command_count = 0;
        for c in file.commands {
            let snippet = c
                .snippet
                .unwrap_or_else(|| snippet_from_args(&c.name, &c.args));
            self.push_command(Command {
                name: c.name,
                package: package.clone(),
                args: c.args,
                mode: c.mode,
                doc: c.doc,
                glyph: c.glyph,
                category: c.category,
                snippet,
                example: c.example,
            });
            command_count += 1;
        }
        for group in file.symbols {
            for (name, glyph) in group.items {
                self.push_command(Command {
                    snippet: name.clone(),
                    name,
                    package: package.clone(),
                    args: String::new(),
                    mode: group.mode.unwrap_or(Mode::Math),
                    doc: Doc::default(),
                    glyph: Some(glyph),
                    category: Some(group.category.clone()),
                    example: None,
                });
                command_count += 1;
            }
        }
        let environment_count = file.environments.len();
        for e in file.environments {
            let (snippet_args, _) = args_snippet(&e.args, 1);
            let body_start = snippet_args.matches("${").count() + 1;
            let snippet_body = e.body.unwrap_or_else(|| format!("${{{body_start}}}"));
            let list = self.environment_index.entry(e.name.clone()).or_default();
            list.push(self.environments.len());
            self.environments.push(Environment {
                name: e.name,
                package: package.clone(),
                args: e.args,
                math: e.math,
                mode: e.mode,
                doc: e.doc,
                snippet_args,
                snippet_body,
                example: e.example,
            });
        }
        let options = file
            .options
            .into_iter()
            .map(|o| match o {
                OptionSpec::Name(name) => PackageOption {
                    name,
                    doc: Doc::default(),
                },
                OptionSpec::Full { name, doc } => PackageOption { name, doc },
            })
            .collect();
        let index = if file.class {
            &mut self.class_index
        } else {
            &mut self.package_index
        };
        index.insert(package.clone(), self.packages.len());
        self.packages.push(Package {
            name: package,
            class: file.class,
            description: file.description,
            loads: file.loads,
            options,
            command_count,
            environment_count,
        });
    }

    fn push_command(&mut self, command: Command) {
        let list = self.command_index.entry(command.name.clone()).or_default();
        list.push(self.commands.len());
        self.commands.push(command);
    }

    /// All packages and classes.
    pub fn packages(&self) -> &[Package] {
        &self.packages
    }

    /// Looks up a package by name.
    pub fn package(&self, name: &str) -> Option<&Package> {
        self.package_index.get(name).map(|&i| &self.packages[i])
    }

    /// Looks up a document class by name.
    pub fn class(&self, name: &str) -> Option<&Package> {
        self.class_index.get(name).map(|&i| &self.packages[i])
    }

    /// Looks up a package, or else a class, by name.
    pub fn package_or_class(&self, name: &str) -> Option<&Package> {
        self.package(name).or_else(|| self.class(name))
    }

    /// All documented commands.
    pub fn commands(&self) -> &[Command] {
        &self.commands
    }

    /// All documented environments.
    pub fn environments(&self) -> &[Environment] {
        &self.environments
    }

    /// Every documented definition of command `name` (several packages may provide it).
    pub fn commands_named(&self, name: &str) -> impl Iterator<Item = &Command> {
        self.command_index
            .get(name)
            .into_iter()
            .flatten()
            .map(|&i| &self.commands[i])
    }

    /// Preferred definition of `name`, favouring packages in `loaded`.
    pub fn command(&self, name: &str, loaded: Option<&HashSet<String>>) -> Option<&Command> {
        let mut candidates = self.commands_named(name);
        let first = candidates.next()?;
        if let Some(loaded) = loaded
            && !loaded.contains(&first.package)
        {
            return self
                .commands_named(name)
                .find(|c| loaded.contains(&c.package))
                .or(Some(first));
        }
        Some(first)
    }

    /// Preferred definition of environment `name`.
    pub fn environment(
        &self,
        name: &str,
        loaded: Option<&HashSet<String>>,
    ) -> Option<&Environment> {
        let list = self.environment_index.get(name)?;
        let all = || list.iter().map(|&i| &self.environments[i]);
        if let Some(loaded) = loaded
            && let Some(env) = all().find(|e| loaded.contains(&e.package))
        {
            return Some(env);
        }
        all().next()
    }

    /// Packages that provide command `name`.
    pub fn command_providers(&self, name: &str) -> Vec<&str> {
        self.commands_named(name)
            .map(|c| c.package.as_str())
            .collect()
    }

    /// Packages that provide environment `name`.
    pub fn environment_providers(&self, name: &str) -> Vec<&str> {
        self.environment_index
            .get(name)
            .into_iter()
            .flatten()
            .map(|&i| self.environments[i].package.as_str())
            .collect()
    }

    /// The set of packages effectively loaded: the kernel, the class, the given
    /// packages and everything they load transitively (as far as known).
    pub fn loaded_closure<'s>(
        &self,
        class: Option<&str>,
        packages: impl IntoIterator<Item = &'s str>,
    ) -> HashSet<String> {
        let mut set = HashSet::new();
        let mut stack: Vec<String> = vec![KERNEL.to_owned()];
        if let Some(class) = class {
            set.insert(class.to_owned());
            if let Some(c) = self.class(class) {
                stack.extend(c.loads.iter().cloned());
            }
        }
        stack.extend(packages.into_iter().map(str::to_owned));
        while let Some(name) = stack.pop() {
            if set.insert(name.clone())
                && let Some(p) = self.package_or_class(&name)
            {
                stack.extend(p.loads.iter().cloned());
            }
        }
        set
    }

    /// Markdown documentation for a command, in `lang`.
    pub fn command_markdown(&self, cmd: &Command, lang: Lang) -> String {
        let mut md = format!("`\\{}{}`", cmd.name, cmd.args);
        if let Some(g) = &cmd.glyph {
            md.push_str(&format!("  {g}"));
        }
        md.push_str("\n\n");
        let doc = cmd.doc.get(lang);
        if !doc.is_empty() {
            md.push_str(doc);
            md.push_str("\n\n");
        }
        if let Some(example) = &cmd.example {
            md.push_str(&format!("```latex\n{example}\n```\n\n"));
        }
        md.push_str(&package_line(&cmd.package, cmd.mode, lang));
        md
    }

    /// Markdown documentation for an environment, in `lang`.
    pub fn environment_markdown(&self, env: &Environment, lang: Lang) -> String {
        let mut md = format!("`\\begin{{{}}}{}`\n\n", env.name, env.args);
        let doc = env.doc.get(lang);
        if !doc.is_empty() {
            md.push_str(doc);
            md.push_str("\n\n");
        }
        if let Some(example) = &env.example {
            md.push_str(&format!("```latex\n{example}\n```\n\n"));
        }
        md.push_str(&package_line(&env.package, env.mode, lang));
        md
    }
}

fn package_line(package: &str, mode: Mode, lang: Lang) -> String {
    let pkg = if package == KERNEL {
        lang.pick("Noyau LaTeX", "LaTeX kernel").to_owned()
    } else {
        format!("{} `{package}`", lang.pick("Package", "Package"))
    };
    let mode = match mode {
        Mode::Math => lang.pick(" · mode mathématique", " · math mode"),
        Mode::Text => lang.pick(" · mode texte", " · text mode"),
        Mode::Preamble => lang.pick(" · préambule", " · preamble"),
        Mode::Any => "",
    };
    format!("*{pkg}{mode}*")
}

/// Builds `name{${1:a}}{${2:b}}` from an argument signature such as `[opt]{a}{b}`.
///
/// Optional arguments are left out of the snippet: they are optional, and the
/// documentation shows them.
pub fn snippet_from_args(name: &str, args: &str) -> String {
    let (snippet, _) = args_snippet(args, 1);
    format!("{name}{snippet}")
}

/// Converts the mandatory arguments of a signature into snippet fields
/// numbered from `first`. Returns the snippet and the next free number.
fn args_snippet(args: &str, first: usize) -> (String, usize) {
    let mut out = String::new();
    let mut n = first;
    let mut rest = args;
    while let Some(c) = rest.chars().next() {
        let close = match c {
            '{' => '}',
            '[' | '(' | '<' => {
                let close = match c {
                    '[' => ']',
                    '(' => ')',
                    _ => '>',
                };
                rest = rest.find(close).map_or("", |i| &rest[i + 1..]);
                continue;
            }
            _ => {
                rest = &rest[c.len_utf8()..];
                continue;
            }
        };
        let Some(end) = rest.find(close) else { break };
        let placeholder = rest[1..end].trim();
        if placeholder.is_empty() {
            out.push_str(&format!("{{${{{n}}}}}"));
        } else {
            out.push_str(&format!("{{${{{n}:{placeholder}}}}}"));
        }
        n += 1;
        rest = &rest[end + 1..];
    }
    (out, n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippets_from_signatures() {
        assert_eq!(
            snippet_from_args("frac", "{num}{den}"),
            "frac{${1:num}}{${2:den}}"
        );
        assert_eq!(snippet_from_args("sqrt", "[n]{x}"), "sqrt{${1:x}}");
        assert_eq!(snippet_from_args("alpha", ""), "alpha");
        assert_eq!(snippet_from_args("x", "{}"), "x{${1}}");
    }

    #[test]
    fn knowledge_base_loads_and_is_consistent() {
        let kb = kb();
        assert!(kb.package(KERNEL).is_some(), "kernel missing");
        assert!(
            kb.commands().len() > 500,
            "only {} commands",
            kb.commands().len()
        );
        let frac = kb.command("frac", None).unwrap();
        assert_eq!(frac.package, KERNEL);
        assert!(!frac.doc.fr.is_empty());
        let loaded = kb.loaded_closure(Some("article"), ["amssymb"]);
        assert!(loaded.contains("amsfonts"));
        for pkg in kb.packages() {
            for dep in &pkg.loads {
                assert!(
                    kb.package_or_class(dep).is_some(),
                    "{} loads unknown {dep}",
                    pkg.name
                );
            }
        }
        for cmd in kb.commands() {
            assert!(!cmd.name.starts_with('\\'), "{} has a backslash", cmd.name);
            assert!(
                !cmd.snippet.starts_with('\\'),
                "{} snippet has a backslash",
                cmd.name
            );
            if cmd.glyph.is_none() {
                assert!(
                    !cmd.doc.en.is_empty() && !cmd.doc.fr.is_empty(),
                    "\\{} ({}) lacks docs",
                    cmd.name,
                    cmd.package
                );
            }
        }
        for env in kb.environments() {
            assert!(
                !env.doc.en.is_empty() && !env.doc.fr.is_empty(),
                "env {} ({}) lacks docs",
                env.name,
                env.package
            );
        }
    }
}
