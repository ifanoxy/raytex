//! Fixes for the compiler's errors and warnings, found in the sources.
//!
//! TeX reports a line and the text read up to the error point. With the
//! sources of the project (scanned like the editor does), each kind of
//! problem gets the fix a LaTeX expert would make: the misspelled command
//! replaced by the right one, the brace closed, the environment renamed, the
//! TikZ library loaded, the key corrected… Fixes found here come first;
//! the generic ones of [`crate::log::hints`] follow.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::{Arc, LazyLock};

use regex::Regex;

use super::data::*;
use super::known::Learned;
use super::text::{self as tx, closest, content_end, group_end, group_start, mask};
use crate::diagnostics::{Diagnostic, FileEdit, Fix};
use crate::i18n::Lang;
use crate::kb::kb;
use crate::log::hints::{expanded_macro, undefined_command};

use crate::syntax::{
    DocumentIndex, EnvironmentSpan, IncludeKind, ProblemKind, ScanOptions, scan, scan_with,
};
use crate::tex::PackageAnalyzer;
use crate::text::{LineIndex, Range, Span};

/// A source file, scanned.
pub(crate) struct Src {
    /// Absolute path.
    pub path: PathBuf,
    /// Text.
    pub text: String,
    lines: LineIndex,
    /// What the scanner found.
    pub index: DocumentIndex,
}

impl Src {
    fn new(path: PathBuf, text: String) -> Self {
        let lines = LineIndex::new(&text);
        let index = scan(&text);
        Self {
            path,
            text,
            lines,
            index,
        }
    }

    fn range(&self, span: Span) -> Range {
        self.lines.range(&self.text, span)
    }

    pub(super) fn offset(&self, pos: crate::text::Position) -> usize {
        self.lines.offset(&self.text, pos)
    }

    pub(super) fn edit(&self, span: Span, text: impl Into<String>) -> FileEdit {
        FileEdit {
            file: self.path.clone(),
            range: self.range(span),
            text: text.into(),
        }
    }

    pub(super) fn insert(&self, at: usize, text: impl Into<String>) -> FileEdit {
        self.edit(at..at, text)
    }

    fn line_count(&self) -> usize {
        self.lines.line_count()
    }

    pub(super) fn line_of(&self, offset: usize) -> usize {
        self.lines.line_of(offset)
    }

    /// Span (without the newline) and text of a line.
    pub(super) fn line(&self, line: usize) -> (Span, &str) {
        let span = self.lines.line_span(&self.text, line);
        let text = self.text[span.clone()].trim_end_matches('\r');
        (span.start..span.start + text.len(), text)
    }

    /// A line and its newline (to delete it).
    fn full_line(&self, line: usize) -> Span {
        let (span, _) = self.line(line);
        let end = if line + 1 < self.line_count() {
            self.lines.line_start(line + 1)
        } else {
            span.end
        };
        span.start..end
    }

    /// Deletes `span`, with its line when nothing else is on it.
    pub(super) fn delete(&self, span: Span) -> FileEdit {
        let line = self.line_of(span.start);
        let (ls, lt) = self.line(line);
        let rest = format!(
            "{}{}",
            &lt[..span.start - ls.start],
            &lt[(span.end.min(ls.end)) - ls.start..]
        );
        if rest.trim().is_empty() && span.end <= ls.end {
            self.edit(self.full_line(line), "")
        } else {
            self.edit(span, "")
        }
    }

    /// Innermost environment containing `offset` among `names` (all when empty).
    pub(super) fn environment_at(&self, offset: usize, names: &[&str]) -> Option<&EnvironmentSpan> {
        self.index
            .environments
            .iter()
            .filter(|e| names.is_empty() || names.contains(&e.name.as_str()))
            .filter(|e| e.begin.start <= offset && e.end.as_ref().is_none_or(|x| offset <= x.end))
            .max_by_key(|e| e.begin.start)
    }
}

/// The sources of a project, read and scanned on demand.
pub(crate) struct Sources<'a> {
    root: PathBuf,
    read: &'a dyn Fn(&Path) -> Option<String>,
    cache: HashMap<PathBuf, Option<Rc<Src>>>,
    files: Option<Vec<PathBuf>>,
    /// Gives the sources of the installed packages; asked once, when a
    /// problem needs them.
    packages: Option<crate::build::PackageSource<'a>>,
    analyzer: Option<Option<Arc<PackageAnalyzer>>>,
    learned: Option<Rc<Learned>>,
}

impl<'a> Sources<'a> {
    /// Sources of the project whose main file is `root`.
    pub fn new(root: &Path, read: &'a dyn Fn(&Path) -> Option<String>) -> Self {
        Self {
            root: root.to_path_buf(),
            read,
            cache: HashMap::new(),
            files: None,
            packages: None,
            analyzer: None,
            learned: None,
        }
    }

    /// Reads what the packages of the document define in their sources.
    pub fn with_packages(mut self, packages: Option<crate::build::PackageSource<'a>>) -> Self {
        self.packages = packages;
        self
    }

    fn analyzer(&mut self) -> Option<Arc<PackageAnalyzer>> {
        let packages = self.packages;
        self.analyzer
            .get_or_insert_with(|| packages.and_then(|give| give()))
            .clone()
    }

    /// The class of the document and the packages it loads, as written.
    fn class_and_packages(&mut self) -> (Option<String>, Vec<String>) {
        let srcs = self.srcs();
        let class = srcs
            .first()
            .and_then(|s| s.index.document_class.as_ref())
            .map(|c| c.name.clone());
        let packages = srcs
            .iter()
            .flat_map(|s| s.index.packages.iter().map(|p| p.name.clone()))
            .collect();
        (class, packages)
    }

    /// What the document can use beyond the knowledge base: its own
    /// definitions, and those of the packages it loads (read once).
    pub(super) fn learned(&mut self) -> Rc<Learned> {
        if let Some(learned) = &self.learned {
            return learned.clone();
        }
        let (class, packages) = self.class_and_packages();
        let infos = self
            .analyzer()
            .map(|a| a.closure(class.as_deref(), packages.iter().map(String::as_str)))
            .unwrap_or_default();
        // A package or a class of the project itself (`macros.sty` next to
        // the document) is read like the documents.
        let mut local = Vec::new();
        let files = packages
            .iter()
            .map(|p| format!("{p}.sty"))
            .chain(class.iter().map(|c| format!("{c}.cls")));
        for file in files {
            if let Some(text) = (self.read)(&self.dir().join(file)) {
                local.push(scan_with(
                    &text,
                    ScanOptions {
                        at_letter: true,
                        descend_definitions: true,
                    },
                ));
            }
        }
        let srcs = self.srcs();
        let learned = Rc::new(Learned::new(
            srcs.iter().map(|s| &s.index).chain(local.iter()),
            &infos,
        ));
        self.learned = Some(learned.clone());
        learned
    }

    /// The installed packages that define command or environment `name`
    /// and that the document does not load, the most likely first. Empty
    /// when a loaded package is one of them: the name should then exist,
    /// and something else is wrong.
    pub(super) fn providers_of(&mut self, name: &str, environment: bool) -> Vec<(String, bool)> {
        let Some(analyzer) = self.analyzer() else {
            return Vec::new();
        };
        let providers = analyzer.providers();
        let found = if environment {
            providers.of_environment(name)
        } else {
            providers.of_command(name)
        };
        if found.is_empty() {
            return Vec::new();
        }
        let (class, packages) = self.class_and_packages();
        let loaded: HashSet<String> = analyzer
            .closure(class.as_deref(), packages.iter().map(String::as_str))
            .iter()
            .map(|info| info.name.clone())
            .collect();
        if found.iter().any(|p| loaded.contains(p.package)) {
            return Vec::new();
        }
        found
            .into_iter()
            .map(|p| (p.package.to_owned(), p.main))
            .collect()
    }

    /// Where `command` (`\mathbb`) is written in the definition of the
    /// macro `owner` of the project (`R` for `\newcommand{\R}{\mathbb{R}}`).
    pub(super) fn in_definition(&mut self, owner: &str, command: &str) -> Option<(Rc<Src>, Span)> {
        for src in self.srcs() {
            let text = mask(&src.text);
            for def in src.index.command_defs.iter().filter(|c| c.name == owner) {
                // The definition ends with its paragraph at the latest.
                let end = text[def.span.end..]
                    .find("\n\n")
                    .map_or(text.len(), |i| def.span.end + i);
                if let Some(i) = whole_commands(&text[def.span.end..end], command).next() {
                    let start = def.span.end + i;
                    return Some((src.clone(), start..start + command.len()));
                }
            }
        }
        None
    }

    /// The keys a set of the knowledge base reads in the installed source
    /// of its package (`keys.json`, `learn`).
    pub(super) fn learned_keys(&mut self, set: usize) -> Vec<String> {
        match self.analyzer() {
            Some(analyzer) => crate::completion::keys::learned(set, |f| analyzer.index().find(f)),
            None => Vec::new(),
        }
    }

    /// The options a package or a class declares: those the knowledge base
    /// describes and those its source declares. For a class, the options of
    /// the packages of the document too (they read the options of the class).
    pub(super) fn options_of(&mut self, name: &str, class: bool) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let mut add = |option: &str| {
            let option = option.trim_end_matches('=');
            if !option.is_empty() && !out.iter().any(|o| o == option) {
                out.push(option.to_owned());
            }
        };
        let mut names = vec![(name.to_owned(), class)];
        if class {
            let (_, packages) = self.class_and_packages();
            names.extend(packages.into_iter().map(|p| (p, false)));
        }
        let analyzer = self.analyzer();
        for (name, class) in names {
            let described = if class {
                kb().class(&name)
            } else {
                kb().package(&name)
            };
            for o in described.iter().flat_map(|p| p.options.iter()) {
                add(&o.name);
            }
            let Some(analyzer) = &analyzer else {
                continue;
            };
            // A class built on another one takes its options too.
            let mut next = Some(analyzer.analyze(&name, class));
            let mut depth = 0;
            while let Some(info) = next.take() {
                for o in &info.options {
                    add(o);
                }
                depth += 1;
                next = info
                    .requires
                    .iter()
                    .find_map(|r| r.strip_prefix("class:"))
                    .filter(|_| depth < 4)
                    .map(|base| analyzer.analyze(base, true));
            }
        }
        out
    }

    /// A file of the project.
    pub fn get(&mut self, path: &Path) -> Option<Rc<Src>> {
        if let Some(src) = self.cache.get(path) {
            return src.clone();
        }
        let src = (self.read)(path).map(|t| Rc::new(Src::new(path.to_path_buf(), t)));
        self.cache.insert(path.to_path_buf(), src.clone());
        src
    }

    fn root(&mut self) -> Option<Rc<Src>> {
        let root = self.root.clone();
        self.get(&root)
    }

    fn dir(&self) -> PathBuf {
        self.root
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default()
    }

    fn resolve(&self, path: &str, ext: &str) -> PathBuf {
        let p = self.dir().join(path);
        if p.extension().is_none() {
            p.with_extension(ext)
        } else {
            p
        }
    }

    /// The `.tex` files of the project: the root and what it includes.
    fn files(&mut self) -> Vec<PathBuf> {
        if let Some(f) = &self.files {
            return f.clone();
        }
        let mut out = vec![self.root.clone()];
        let mut i = 0;
        while i < out.len() && out.len() < 200 {
            if let Some(src) = self.get(&out[i].clone()) {
                for inc in &src.index.includes {
                    if matches!(
                        inc.kind,
                        IncludeKind::Input | IncludeKind::Include | IncludeKind::Subfile
                    ) {
                        let p = self.resolve(&inc.path, "tex");
                        if !out.contains(&p) && self.get(&p).is_some() {
                            out.push(p);
                        }
                    }
                }
            }
            i += 1;
        }
        self.files = Some(out.clone());
        out
    }

    pub(super) fn srcs(&mut self) -> Vec<Rc<Src>> {
        self.files()
            .into_iter()
            .filter_map(|f| self.get(&f))
            .collect()
    }

    /// Bibliography files: the ones the project names, else those of its folder.
    fn bib_files(&mut self) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for src in self.srcs() {
            for inc in &src.index.includes {
                if matches!(
                    inc.kind,
                    IncludeKind::Bibliography | IncludeKind::BibResource
                ) {
                    let p = self.resolve(&inc.path, "bib");
                    if !out.contains(&p) {
                        out.push(p);
                    }
                }
            }
        }
        if out.is_empty() {
            out = files_with(&self.dir(), &["bib"]);
        }
        out
    }

    fn bib_keys(&mut self) -> Vec<String> {
        let mut keys = Vec::new();
        for f in self.bib_files() {
            if let Some(text) = (self.read)(&f) {
                keys.extend(crate::bib::parse(&text).entries.into_iter().map(|e| e.key));
            }
        }
        keys
    }

    /// Packages effectively loaded (the kernel, the class, their dependencies).
    pub(super) fn loaded(&mut self) -> HashSet<String> {
        let (class, packages) = self.class_and_packages();
        kb().loaded_closure(class.as_deref(), packages.iter().map(String::as_str))
    }

    fn loads(&mut self, package: &str) -> bool {
        self.srcs()
            .iter()
            .any(|s| s.index.packages.iter().any(|p| p.name == package))
    }

    /// Whether the project has a bibliography command.
    fn has_bibliography(&mut self) -> bool {
        self.srcs().iter().any(|s| {
            s.index
                .includes
                .iter()
                .any(|i| matches!(i.kind, IncludeKind::Bibliography | IncludeKind::BibResource))
                || s.text.contains("\\printbibliography")
                || s.text.contains("\\begin{thebibliography}")
        })
    }
}

/// Files of `dir` (and its folders, a few levels deep) with one of `exts`.
pub(crate) fn files_with(dir: &Path, exts: &[&str]) -> Vec<PathBuf> {
    fn walk(dir: &Path, exts: &[&str], depth: usize, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            if p.is_dir() {
                if depth < 4 && !matches!(name.as_str(), "build" | "out" | "node_modules") {
                    walk(&p, exts, depth + 1, out);
                }
            } else if p
                .extension()
                .is_some_and(|x| exts.iter().any(|e| x.eq_ignore_ascii_case(e)))
            {
                out.push(p);
            }
            if out.len() > 2000 {
                return;
            }
        }
    }
    let mut out = Vec::new();
    walk(dir, exts, 0, &mut out);
    out.sort();
    out
}

/// Where a diagnostic is: its file, the token before the error point, its line.
pub(super) struct At {
    pub(super) src: Rc<Src>,
    pub(super) token: Span,
    pub(super) line: usize,
}

impl At {
    pub(super) fn point(&self) -> usize {
        self.token.end
    }
}

pub(super) fn at(d: &Diagnostic, s: &mut Sources<'_>) -> Option<At> {
    let src = s.get(d.file.as_ref()?)?;
    if let Some(r) = d.range {
        let token = src.offset(r.start)..src.offset(r.end);
        return Some(At {
            line: r.start.line as usize,
            token,
            src,
        });
    }
    let line = (d.line? as usize).checked_sub(1)?;
    if line >= src.line_count() {
        return None;
    }
    let (span, _) = src.line(line);
    Some(At {
        src,
        token: span,
        line,
    })
}

/// Moves a diagnostic to `span` of `src`.
pub(super) fn place(d: &mut Diagnostic, src: &Src, span: Span) {
    let r = src.range(span);
    d.file = Some(src.path.clone());
    d.line = Some(r.start.line + 1);
    d.end_line = None;
    d.range = Some(r);
}

/// Code given to a diagnostic that only follows from an earlier one (the same
/// mistake, reported again by TeX further on): it is not shown.
pub(crate) const CONSEQUENCE: &str = "consequence";

/// Says the cause found in the sources (the advice of the hint). Only what
/// was read in the document may be said here: a guess is never an advice.
pub(super) fn advise(d: &mut Diagnostic, lang: Lang, fr: &str, en: &str) {
    d.advise(lang.pick(fr, en));
}

/// The `%` that comes after the brace opened at `open`, on its line, when
/// the comment it starts holds the `}` (`\\textbf{50% de réduction}`).
pub(super) fn percent_hides_brace(text: &str, open: usize) -> Option<usize> {
    let b = text.as_bytes();
    let line_end = text[open..].find('\n').map_or(text.len(), |i| open + i);
    (open..line_end)
        .find(|&i| b[i] == b'%' && b[i - 1] != b'\\')
        .filter(|&i| text[i..line_end].contains('}'))
}

/// "Did you mean …?", for a name found close to the one written.
pub(super) fn did_you_mean(d: &mut Diagnostic, lang: Lang, best: &str) {
    advise(
        d,
        lang,
        &format!("Vouliez-vous écrire `{best}` ?"),
        &format!("Did you mean `{best}`?"),
    );
}

pub(super) fn edits(title: String, edits: Vec<FileEdit>) -> Vec<Fix> {
    if edits.is_empty() {
        return Vec::new();
    }
    vec![Fix::Edits { title, edits }]
}

/// Where the command `name` (`\\over`, not `\\overline`) is written in `text`.
fn whole_commands<'t>(text: &'t str, name: &'t str) -> impl Iterator<Item = usize> + 't {
    text.match_indices(name).map(|(i, _)| i).filter(move |&i| {
        !text[i + name.len()..].starts_with(|c: char| c.is_ascii_alphabetic() || c == '@')
    })
}

/// What can be said of the installed packages that define a name the
/// document does not have.
enum Provided {
    /// One package stands out: the one named like what it defines, the only
    /// one, the only one the knowledge base describes, or the only one that
    /// is not a part of something else.
    By(String),
    /// A few packages define it: they are named, none is chosen.
    Among(Vec<String>),
    Unknown,
}

fn provided(name: &str, packages: Vec<(String, bool)>) -> Provided {
    let only = |keep: &dyn Fn(&(String, bool)) -> bool| {
        let mut kept = packages.iter().filter(|p| keep(p));
        match (kept.next(), kept.next()) {
            (Some((package, _)), None) => Some(package.clone()),
            _ => None,
        }
    };
    let Some((first, _)) = packages.first() else {
        return Provided::Unknown;
    };
    if first == name {
        Provided::By(first.clone())
    } else if let Some(package) = only(&|_| true)
        .or_else(|| only(&|(p, _)| kb().package(p).is_some()))
        .or_else(|| only(&|(_, main)| *main))
    {
        Provided::By(package)
    } else if packages.len() <= 4 {
        Provided::Among(packages.into_iter().map(|(p, _)| p).collect())
    } else {
        Provided::Unknown
    }
}

/// `a`, `b` and `c`, each as code.
fn listed(names: &[String], and: &str) -> String {
    let quoted: Vec<String> = names.iter().map(|n| format!("`{n}`")).collect();
    match quoted.split_last() {
        Some((last, rest)) if !rest.is_empty() => format!("{} {and} {last}", rest.join(", ")),
        _ => quoted.concat(),
    }
}

static QUOTED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[`']([^'`]+)'").unwrap());

fn quoted(message: &str) -> Option<String> {
    QUOTED.captures(message).map(|m| m[1].to_owned())
}

/// The last occurrence of `word` in `src` on `line`, before `before` when possible.
pub(super) fn find_on_line(
    src: &Src,
    line: usize,
    word: &str,
    before: Option<usize>,
) -> Option<Span> {
    let (span, text) = src.line(line);
    let limit = before
        .filter(|b| (span.start..=span.end).contains(b))
        .map_or(text.len(), |b| b - span.start);
    let i = text[..limit].rfind(word).or_else(|| text.find(word))?;
    Some(span.start + i..span.start + i + word.len())
}

// ------------------------------------------------------------ relocation

static PACKAGE_IN_MESSAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^Package (\S+) (?:Error|Warning)|for package `([^']+)'|^([A-Za-z][\w-]*): )")
        .unwrap()
});

/// Errors reported inside a package (`geometry.sty:1005`) or an auxiliary
/// file (`main.aux`) are moved to the line of the document that causes them:
/// its `\usepackage`.
pub(crate) fn relocate(d: &mut Diagnostic, s: &mut Sources<'_>) {
    let Some(file) = d.file.clone() else { return };
    let ext = file
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let dir = s.dir();
    let generated = matches!(
        ext.as_str(),
        "sty"
            | "cls"
            | "ldf"
            | "def"
            | "cfg"
            | "fd"
            | "clo"
            | "aux"
            | "bbl"
            | "toc"
            | "lof"
            | "lot"
            | "out"
    );
    if file.starts_with(&dir) && !generated {
        return;
    }
    let Some(root) = s.root() else { return };
    let mut names = Vec::new();
    if matches!(ext.as_str(), "sty" | "cls") {
        names.push(
            file.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        );
    }
    if ext == "ldf" {
        names.push("babel".into());
    }
    if let Some(m) = PACKAGE_IN_MESSAGE.captures(&d.message)
        && let Some(p) = m.get(1).or(m.get(2)).or(m.get(3))
    {
        names.push(p.as_str().to_owned());
    }
    d.context_before = None;
    d.context_after = None;
    if ext == "bbl"
        && let Some(inc) = root
            .index
            .includes
            .iter()
            .find(|i| matches!(i.kind, IncludeKind::Bibliography))
    {
        place(d, &root, inc.span.clone());
        return;
    }
    for name in &names {
        if let Some(p) = root.index.packages.iter().find(|p| &p.name == name) {
            let mut span = p.command_span.clone();
            // The option or key the message is about, when it is in the command.
            if let Some(q) = quoted(&d.message)
                && let Some(i) = root.text[span.clone()].find(&q)
            {
                span = span.start + i..span.start + i + q.len();
            }
            place(d, &root, span);
            return;
        }
        if let Some(c) = &root.index.document_class
            && &c.name == name
        {
            place(d, &root, c.span.clone());
            return;
        }
    }
    d.file = Some(root.path.clone());
    d.line = None;
    d.range = None;
}

// ------------------------------------------------------------ dispatch

/// Adds the fixes found in the sources to `d` (before the generic ones).
pub(crate) fn suggest(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) {
    if let Some(fix) = cleveref_french(d, s, lang) {
        if !d.fixes.contains(&fix) {
            d.fixes.insert(0, fix);
        }
        advise(
            d,
            lang,
            "Avec babel en français, le « : » est un caractère actif : il casse la clé de `\\cref{…}` sur cette ligne.",
            "With French babel, `:` is an active character: it breaks the key of `\\cref{…}` on this line.",
        );
        return;
    }
    let code = d.code.clone().unwrap_or_default();
    let compiler = d.severity == crate::diagnostics::Severity::Error
        && d.source == crate::diagnostics::Source::Latex;
    // A message that only tells how TeX went on (a `$` or a brace it added):
    // what is wrong in the structure of the paragraph is its cause.
    if compiler
        && super::cause::is_symptom(&code, &d.message)
        && let Some(fixes) = super::cause::explain_structure(d, s, lang)
    {
        d.fixes = fixes;
        return;
    }
    // The `\` of a path are not commands to look for.
    if compiler
        && code == "undefined-control-sequence"
        && let Some(fixes) = super::cause::explain_path(d, s, lang)
    {
        d.fixes = fixes;
        return;
    }
    let found = match code.as_str() {
        "undefined-control-sequence" => undefined_cs(d, s, lang),
        "env-undefined" => env_undefined(d, s, lang),
        "env-mismatch" => env_mismatch(d, s, lang),
        "missing-item" => missing_item(d, s, lang),
        "lonely-item" => lonely_item(d, s, lang),
        "file-ended" | "paragraph-ended" | "runaway-argument" => unclosed_brace(d, s, lang),
        "extra-brace" => extra_brace(d, s, lang),
        "missing-brace" => missing_brace(d, s, lang),
        "missing-dollar" => missing_dollar(d, s, lang),
        "double-subscript" => double_script(d, s, lang),
        "missing-right" => missing_right(d, s, lang),
        "align-in-math" => align_in_math(d, s, lang),
        "misplaced-alignment-tab" => escape_char(d, s, lang, '&'),
        "hash-in-text" => escape_char(d, s, lang, '#'),
        "unicode-not-set-up" => unicode(d, s, lang),
        "extra-alignment-tab" => extra_column(d, s, lang),
        "misplaced-noalign" => end_row(d, s, lang),
        "illegal-column" => bad_column(d, s, lang),
        "no-line-to-end" => stray_newline(d, s, lang),
        "underfull-box" => newline_before_blank(d, s, lang),
        "float-h" => float_h(d, s, lang),
        "float-option" => float_option(d, s, lang),
        "float-too-large" => float_too_large(d, s, lang),
        "caption-outside-float" => caption_outside(d, s, lang),
        "file-not-found" => file_not_found(d, s, lang),
        "keyval-undefined" => keyval(d, s, lang),
        "overfull-box" => overfull(d, s, lang),
        "already-defined" => redefine(d, s, lang, true),
        "renew-undefined" => redefine(d, s, lang, false),
        "illegal-parameter" => parameters(d, s, lang),
        "missing-control-sequence" => backslash_name(d, s, lang),
        "preamble-only" => move_to_preamble(d, s, lang),
        "before-documentclass" => move_after_class(d, s, lang),
        "missing-begin-document" => begin_document(d, s, lang),
        "no-end-document" => end_document(d, s, lang),
        "option-clash" => option_clash(d, s, lang),
        "babel-option" | "babel-unknown" => babel_language(d, s, lang),
        "french-fontenc" | "encoding-command" => vec![Fix::AddPackage {
            package: "fontenc".into(),
            options: Some("T1".into()),
        }],
        "font-size" => font_size(s),
        "unknown-option" => unknown_option(d, s, lang),
        "undefined-color" => color(d, s, lang),
        "tikz-semicolon" => semicolon(d, s, lang),
        "tikz-library" | "tikz-unknown-key" => tikz(d, s, lang),
        "pgfplots-compat" => pgfplots(d, lang),
        "undefined-reference" => reference(d, s, lang),
        "multiply-defined" => duplicate_label(d, s, lang),
        "undefined-citation" | "bib-missing-entry" => citation(d, s, lang),
        "no-citation" => nocite(d, s, lang),
        "no-bibdata" => bibliography(s, lang).into_iter().collect(),
        "no-bibstyle" => bibstyle(d, s, lang),
        "bib-syntax" => bib_comma(d, s, lang),
        "natbib-author" => natbib(d, s, lang),
        "headheight" => headheight(d, s, lang),
        "pdf-string" => pdf_string(d, s, lang),
        "verb-in-argument" => verb(d, s, lang),
        "missing-number" | "illegal-unit" | "dimension-too-large" | "number-too-big" => {
            super::numeric::numbers(d, s, lang)
        }
        "include-nested" => include_nested(d, s, lang),
        "command-invalid-math" if !compiler => {
            super::cause::explain_warning(d, s, lang).unwrap_or_default()
        }
        "picture-size" => vec![Fix::add_package("pict2e")],
        "unused-option" => unused_option(d, s, lang),
        "no-author" => no_author(d, s),
        "bookmark-level" => bookmark_level(d, s, lang),
        "wrong-mode" => at_command(d, s, lang),
        "unknown-graphics-extension" => graphics_extension(d, s, lang),
        "capacity-exceeded" => recursion(d, s, lang),
        "rerun" | "biber-rerun" => vec![Fix::Rebuild],
        "mhchem-version" => vec![Fix::AddPackageOption {
            package: "mhchem".into(),
            option: "version=4".into(),
        }],
        _ => Vec::new(),
    };
    let mut all = found;
    for f in std::mem::take(&mut d.fixes) {
        if !all.contains(&f) {
            all.push(f);
        }
    }
    d.fixes = all;
    // No analysis of this message found the cause: it is looked for in the
    // source, whatever the message says.
    let explained = d.hint.as_ref().is_some_and(|h| h.advice.is_some());
    if !explained
        && compiler
        && let Some(fixes) = super::cause::explain(d, s, lang)
    {
        // The fix of the cause found replaces the ones offered before it,
        // which say the same thing or less.
        if !fixes.is_empty() {
            d.fixes
                .retain(|f| !matches!(f, Fix::Edits { .. } | Fix::Replace { .. }));
        }
        for f in fixes {
            if !d.fixes.contains(&f) {
                d.fixes.push(f);
            }
        }
    }
    // At least the documentation of the package that complains.
    if d.fixes.is_empty()
        && let Some(m) = PACKAGE_IN_MESSAGE.captures(&d.message)
        && let Some(p) = m.get(1).or(m.get(2)).or(m.get(3))
        && kb().package_or_class(p.as_str()).is_some()
    {
        d.fixes.push(Fix::OpenDoc {
            package: p.as_str().to_owned(),
        });
    }
}

/// With French babel, `:` is an active character: `\\cref{sec:intro}`
/// breaks (pdfLaTeX). Every error on such a line gets the fix.
fn cleveref_french(d: &Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Option<Fix> {
    if d.severity != crate::diagnostics::Severity::Error || !s.loads("cleveref") {
        return None;
    }
    let at = at(d, s)?;
    let (_, line) = at.src.line(at.line);
    let colon_ref = [
        "\\cref{",
        "\\Cref{",
        "\\crefrange{",
        "\\labelcref{",
        "\\namecref{",
    ]
    .iter()
    .any(|c| {
        line.split(c)
            .skip(1)
            .any(|rest| rest.split('}').next().is_some_and(|k| k.contains(':')))
    });
    let french = s.srcs().iter().any(|x| {
        x.index.packages.iter().any(|p| {
            p.name == "babel"
                && p.options
                    .iter()
                    .any(|o| matches!(o.as_str(), "french" | "francais" | "frenchb" | "acadian"))
        })
    });
    let fixed = s
        .srcs()
        .iter()
        .any(|x| x.text.contains("\\shorthandoff{:}"));
    (colon_ref && french && !fixed).then(|| Fix::AddToPreamble {
        title: lang
            .pick(
                "Désactiver le « : » actif de babel (\\shorthandoff{:})",
                "Turn off babel's active “:” (\\shorthandoff{:})",
            )
            .into(),
        code: "\\AtBeginDocument{\\shorthandoff{:}}".into(),
        after: Some("cleveref".into()),
    })
}

// ------------------------------------------------------- commands

fn undefined_cs(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(cmd) = undefined_command(d).map(|c| c.trim_start_matches('\\').to_owned()) else {
        return Vec::new();
    };
    let Some(mut at) = at(d, s) else {
        return Vec::new();
    };
    // The command TeX does not know is not always the one it stopped after:
    // it may be in an argument of the line, or in what a macro is made of
    // (`\R ->\mathbb`). The problem goes where the command is written.
    let written = format!("\\{cmd}");
    let mut lead: Option<String> = None;
    if at.src.text.get(at.token.clone()) != Some(written.as_str()) {
        let (line, text) = at.src.line(at.line);
        let on_line: Vec<usize> = whole_commands(text, &written).collect();
        let point = at.point().saturating_sub(line.start);
        if let Some(&i) = on_line
            .iter()
            .rev()
            .find(|&&i| i < point)
            .or(on_line.first())
        {
            let span = line.start + i..line.start + i + written.len();
            place(d, &at.src, span.clone());
            at.token = span;
        } else if let Some(owner) = expanded_macro(d).map(str::to_owned) {
            let used = at.line + 1;
            let name = owner.trim_start_matches('\\');
            match s.in_definition(name, &written) {
                Some((src, span)) => {
                    place(d, &src, span.clone());
                    at = At {
                        line: src.line_of(span.start),
                        token: span,
                        src,
                    };
                    lead = Some(
                        lang.pick(
                            &format!(
                                "`{written}` est écrit dans la définition de `{owner}`, que la ligne {used} utilise."
                            ),
                            &format!(
                                "`{written}` is written in the definition of `{owner}`, which line {used} uses."
                            ),
                        )
                        .to_owned(),
                    );
                }
                // A macro that is not of the project: nothing to change in
                // it, the problem stays where it is used.
                None => {
                    lead = Some(
                        lang.pick(
                            &format!("`{written}` vient de ce que `{owner}` écrit ici."),
                            &format!("`{written}` comes from what `{owner}` writes here."),
                        )
                        .to_owned(),
                    );
                }
            }
        }
    }
    let fixes = unknown_command(d, s, lang, &cmd, &at, lead.is_none());
    // Where the command is comes first, then what is known of it.
    if let Some(lead) = lead {
        let known = d.hint.as_ref().and_then(|h| h.advice.clone());
        d.advise(match known {
            Some(known) => format!("{lead} {known}"),
            None => lead,
        });
    }
    fixes
}

/// What is known of a command LaTeX does not have: the package that
/// defines it, or the name it is close to. `own` is false when the command
/// is not written by the user where the problem is (a macro of a package
/// writes it): its name is then not looked for among the macros of the
/// project.
fn unknown_command(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
    cmd: &str,
    at: &At,
    own: bool,
) -> Vec<Fix> {
    let replace = |best: &str| Fix::Edits {
        title: format!("{} \\{best}", lang.pick("Remplacer par", "Replace with")),
        edits: vec![at.src.edit(at.token.clone(), format!("\\{best}"))],
    };
    let described = d.fixes.iter().any(|f| matches!(f, Fix::AddPackage { .. }));
    // An installed package the knowledge base does not describe defines it.
    let installed = if described {
        Provided::Unknown
    } else {
        provided(cmd, s.providers_of(cmd, false))
    };
    let not_loaded = |d: &mut Diagnostic, package: &str| {
        advise(
            d,
            lang,
            &format!("`\\{cmd}` est défini par le package `{package}`, qui n'est pas chargé."),
            &format!("`\\{cmd}` is defined by the `{package}` package, which is not loaded."),
        );
        vec![crate::log::hints::package_fix(package.to_owned())]
    };
    // The package named like the command: nothing is closer.
    if let Provided::By(package) = &installed
        && package == cmd
    {
        return not_loaded(d, package);
    }
    // A macro of the project, misspelled.
    let user: Vec<String> = s
        .srcs()
        .iter()
        .flat_map(|src| src.index.command_defs.iter().map(|c| c.name.clone()))
        .collect();
    if own && let Some(best) = closest(cmd, user.iter().map(String::as_str), 2) {
        advise(
            d,
            lang,
            &format!("Vouliez-vous écrire `\\{best}`, défini dans ce document ?"),
            &format!("Did you mean `\\{best}`, defined in this document?"),
        );
        return vec![replace(best)];
    }
    if let Provided::By(package) = &installed {
        return not_loaded(d, package);
    }
    // A command of the kernel or of a loaded package, misspelled. When a
    // package defines the command, loading it comes first.
    // Among the hundreds of commands LaTeX has, a name of three letters is
    // one edit away from several (`\nom`: `\hom`, `\not`, `\num`): nothing
    // tells which, and none is offered.
    let loaded = s.loaded();
    let learned = s.learned();
    let max = if cmd.len() <= 4 { 1 } else { 2 };
    let names = kb()
        .commands()
        .iter()
        .filter(|c| cmd.len() >= 4 && loaded.contains(&c.package))
        .map(|c| c.name.as_str());
    // Then a command of a loaded package the knowledge base does not
    // describe, as the source of the package defines it.
    let read = || {
        (cmd.len() >= 4)
            .then(|| closest(cmd, learned.package_commands(), max))
            .flatten()
    };
    let Some(best) = closest(cmd, names, max).or_else(read) else {
        // A few installed packages define it: they are named, none chosen.
        if let Provided::Among(packages) = installed {
            advise(
                d,
                lang,
                &format!(
                    "`\\{cmd}` est défini par les packages {}, qui ne sont pas chargés.",
                    listed(&packages, "et")
                ),
                &format!(
                    "`\\{cmd}` is defined by the packages {}, which are not loaded.",
                    listed(&packages, "and")
                ),
            );
        }
        return Vec::new();
    };
    // A package defines exactly this command: loading it is the fix, a
    // name that looks like it is not offered next to it.
    if described {
        return Vec::new();
    }
    did_you_mean(d, lang, &format!("\\{best}"));
    vec![replace(best)]
}

static ENV_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Environment (\S+) undefined").unwrap());

fn env_undefined(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(name) = ENV_NAME.captures(&d.message).map(|m| m[1].to_owned()) else {
        return Vec::new();
    };
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    // `\renewenvironment` of an environment that does not exist.
    if let Some(span) = find_on_line(src, at.line, "\\renewenvironment", Some(at.point())) {
        advise(
            d,
            lang,
            &format!(
                "`\\renewenvironment` redéfinit un environnement qui existe, et `{name}` n'existe pas encore."
            ),
            &format!(
                "`\\renewenvironment` redefines an environment that exists, and `{name}` does not exist yet."
            ),
        );
        return edits(
            lang.pick("Utiliser \\newenvironment", "Use \\newenvironment")
                .into(),
            vec![src.edit(span, "\\newenvironment")],
        );
    }
    if d.fixes.iter().any(|f| matches!(f, Fix::AddPackage { .. })) {
        return Vec::new();
    }
    // An installed package the knowledge base does not describe defines it.
    let installed = provided(&name, s.providers_of(&name, true));
    let placed_on_name = |d: &mut Diagnostic| {
        let (line, text) = src.line(at.line);
        if let Some(i) = text.find(&format!("{{{name}}}")) {
            place(d, src, line.start + i + 1..line.start + i + 1 + name.len());
        }
    };
    if let Provided::By(package) = &installed {
        placed_on_name(d);
        advise(
            d,
            lang,
            &format!(
                "L'environnement `{name}` est défini par le package `{package}`, qui n'est pas chargé."
            ),
            &format!(
                "The `{name}` environment is defined by the `{package}` package, which is not loaded."
            ),
        );
        return vec![crate::log::hints::package_fix(package.clone())];
    }
    // A misspelled environment: \begin and \end are renamed together.
    let loaded = s.loaded();
    let learned = s.learned();
    let user: Vec<String> = s
        .srcs()
        .iter()
        .flat_map(|x| x.index.environment_defs.iter().map(|e| e.name.clone()))
        .collect();
    // The environments of the knowledge base, of the project, and those the
    // sources of the loaded packages define.
    let names = kb()
        .environments()
        .iter()
        .filter(|e| loaded.contains(&e.package))
        .map(|e| e.name.as_str())
        .chain(user.iter().map(String::as_str))
        .chain(learned.package_environments());
    let Some(best) = closest(&name, names, 3) else {
        return Vec::new();
    };
    let Some(env) = src
        .index
        .environments
        .iter()
        .find(|e| e.name == name && src.line_of(e.begin.start) == at.line)
    else {
        return Vec::new();
    };
    let name_in = |span: &Span| -> Option<Span> {
        let i = src.text[span.clone()].find(&format!("{{{name}}}"))?;
        Some(span.start + i + 1..span.start + i + 1 + name.len())
    };
    let mut list = Vec::new();
    for span in [Some(&env.begin), env.end.as_ref()].into_iter().flatten() {
        if let Some(n) = name_in(span) {
            list.push(src.edit(n, best));
        }
    }
    if !list.is_empty() {
        // The name is what is wrong: the problem is shown on it.
        if let Some(n) = name_in(&env.begin) {
            place(d, src, n);
        }
        did_you_mean(d, lang, best);
    }
    edits(
        format!("{} {best}", lang.pick("Remplacer par", "Replace with")),
        list,
    )
}

static MISMATCH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\begin\{([^}]*)\} on input line (\d+) ended by \\end\{([^}]*)\}").unwrap()
});
static DOCUMENT_ENDED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\begin\{document\} ended by \\end\{([^}]*)\}").unwrap());

fn env_mismatch(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    if let Some(m) = MISMATCH.captures(&d.message) {
        let (open, close) = (m[1].to_owned(), m[3].to_owned());
        let begin_line = m[2].parse::<usize>().unwrap_or(1).saturating_sub(1);
        if close == "document" {
            // `\begin{open}` never closed: closed at the end of its paragraph.
            let begin = src
                .line(begin_line.min(src.line_count().saturating_sub(1)))
                .0;
            let begin_end = src.text[begin.clone()]
                .find(&format!("\\begin{{{open}}}"))
                .map_or(begin.end, |i| begin.start + i + open.len() + 8);
            d.swallows = true;
            // Shown where it opens: that is where the `\\end` is missing from.
            let written = format!("\\begin{{{open}}}");
            if let Some(i) = src.text[begin.clone()].find(&written) {
                place(d, src, begin.start + i..begin.start + i + written.len());
            }
            advise(
                d,
                lang,
                &format!("Ce `\\begin{{{open}}}` n'est jamais fermé par `\\end{{{open}}}`."),
                &format!("This `\\begin{{{open}}}` is never closed by `\\end{{{open}}}`."),
            );
            return edits(
                format!("{} \\end{{{open}}}", lang.pick("Fermer avec", "Close with")),
                vec![src.insert(
                    tx::env_close_at(&src.text, begin_end),
                    format!("\\end{{{open}}}\n"),
                )],
            );
        }
        // `\end{close}` closes `\begin{open}`: the name is wrong.
        let Some(span) = find_on_line(src, at.line, &format!("\\end{{{close}}}"), None) else {
            return Vec::new();
        };
        place(d, src, span.clone());
        advise(
            d,
            lang,
            &format!(
                "`\\end{{{close}}}` ferme `\\begin{{{open}}}`, ouvert ligne {}.",
                begin_line + 1
            ),
            &format!(
                "`\\end{{{close}}}` closes `\\begin{{{open}}}`, opened on line {}.",
                begin_line + 1
            ),
        );
        return edits(
            format!(
                "{} \\end{{{open}}}",
                lang.pick("Remplacer par", "Replace with")
            ),
            vec![src.edit(span.start + 5..span.end - 1, open)],
        );
    }
    if let Some(m) = DOCUMENT_ENDED.captures(&d.message) {
        let close = m[1].to_owned();
        let Some(span) = find_on_line(src, at.line, &format!("\\end{{{close}}}"), None) else {
            return Vec::new();
        };
        // After an unknown `\begin{close}`, the `\end` is right.
        if mask(&src.text[..span.start]).contains(&format!("\\begin{{{close}}}")) {
            return Vec::new();
        }
        place(d, src, span.clone());
        advise(
            d,
            lang,
            &format!("Ce `\\end{{{close}}}` ne ferme aucun `\\begin{{{close}}}`."),
            &format!("This `\\end{{{close}}}` closes no `\\begin{{{close}}}`."),
        );
        return edits(
            format!("{} \\end{{{close}}}", lang.pick("Supprimer", "Delete")),
            vec![src.delete(span)],
        );
    }
    Vec::new()
}

const LISTS: &[&str] = &[
    "itemize",
    "enumerate",
    "description",
    "itemize*",
    "enumerate*",
    "description*",
    "compactitem",
    "compactenum",
    "inparaenum",
    "asparaenum",
];

fn missing_item(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let Some(env) = src.environment_at(at.point(), LISTS) else {
        return Vec::new();
    };
    // The text before the first \item.
    let mut from = env.begin.end;
    let rest = &src.text[from..];
    if rest.starts_with('[') {
        from += rest.find(']').map_or(0, |i| i + 1);
    }
    let body = &src.text[from..at.point().max(from)];
    let Some(i) = body.find(|c: char| !c.is_whitespace()) else {
        return Vec::new();
    };
    if body[i..].starts_with("\\item") || body[i..].starts_with('%') {
        return Vec::new();
    }
    advise(
        d,
        lang,
        &format!(
            "Ce texte vient avant le premier `\\item` de la liste `{}`.",
            env.name
        ),
        &format!(
            "This text comes before the first `\\item` of the `{}` list.",
            env.name
        ),
    );
    edits(
        lang.pick(
            "Ajouter \\item avant ce texte",
            "Add \\item before this text",
        )
        .into(),
        vec![src.insert(from + i, "\\item ")],
    )
}

fn lonely_item(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    // In an environment LaTeX does not know (a misspelled list): renaming
    // it is the fix, not adding a list.
    if src
        .environment_at(at.point(), &[])
        .is_some_and(|e| e.name != "document")
    {
        return Vec::new();
    }
    let is_item = |l: usize| src.line(l).1.trim_start().starts_with("\\item");
    let mut first = at.line;
    while first > 0 && is_item(first - 1) {
        first -= 1;
    }
    let mut last = at.line;
    while last + 1 < src.line_count() {
        let next = src.line(last + 1).1.trim_start();
        if next.is_empty() || (next.starts_with('\\') && !next.starts_with("\\item")) {
            break;
        }
        last += 1;
    }
    if let Some(item) = find_on_line(src, at.line, "\\item", Some(at.point())) {
        place(d, src, item);
    }
    advise(
        d,
        lang,
        "Ce `\\item` n'est dans aucune liste.",
        "This `\\item` is in no list.",
    );
    edits(
        lang.pick(
            "Mettre les \\item dans une liste itemize",
            "Put the \\items in an itemize list",
        )
        .into(),
        vec![
            src.insert(src.line(first).0.start, "\\begin{itemize}\n"),
            src.insert(src.line(last).0.end, "\n\\end{itemize}"),
        ],
    )
}

// --------------------------------------------------------- braces

static SCANNING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:use of|before) (\\[A-Za-z@]+)").unwrap());

fn unclosed_brace(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let cmd = SCANNING.captures(&d.message).map(|m| m[1].to_owned());
    let line = d.line.map(|l| l as usize - 1);
    let mut srcs = s.srcs();
    if let Some(f) = &d.file {
        srcs.sort_by_key(|x| &x.path != f);
    }
    for src in srcs {
        let same = d.file.as_ref() == Some(&src.path);
        let braces: Vec<usize> = src
            .index
            .problems
            .iter()
            .filter(|p| p.kind == ProblemKind::UnclosedBrace)
            .map(|p| p.span.start)
            .filter(|&o| !same || line.is_none_or(|l| src.line_of(o) <= l))
            .collect();
        // The last one before the error, preferably opened by the command TeX names.
        let named = |o: &usize| {
            cmd.as_ref()
                .is_some_and(|c| src.text[..*o].trim_end().ends_with(c.as_str()))
        };
        let Some(open) = braces
            .iter()
            .rev()
            .find(|o| named(o))
            .or(braces.last())
            .copied()
        else {
            continue;
        };
        let start = src.text[..open]
            .rfind('\\')
            .filter(|&b| {
                src.text[b + 1..open]
                    .chars()
                    .all(|c| c.is_ascii_alphabetic())
            })
            .unwrap_or(open);
        place(d, &src, start..open + 1);
        d.swallows = true;
        if let Some(percent) = percent_hides_brace(&src.text, open) {
            advise(
                d,
                lang,
                "Le `%` de cette ligne met la fin de la ligne en commentaire, avec la `}` qui ferme cette accolade. Un pourcentage s'écrit `\\%`.",
                "The `%` of this line turns the end of the line into a comment, with the `}` that closes this brace. A percent sign is written `\\%`.",
            );
            return edits(
                lang.pick("Écrire \\%", "Write \\%").into(),
                vec![src.edit(percent..percent + 1, "\\%")],
            );
        }
        advise(
            d,
            lang,
            "L'accolade ouverte ici n'est jamais refermée.",
            "The brace opened here is never closed.",
        );
        let at = tx::brace_close_at(&src.text, open);
        let what = &src.text[start..open];
        return edits(
            if what.is_empty() {
                lang.pick("Fermer l'accolade", "Close the brace").into()
            } else {
                format!(
                    "{} {what}",
                    lang.pick("Fermer l'accolade de", "Close the brace of")
                )
            },
            vec![src.insert(at, "}")],
        );
    }
    Vec::new()
}

fn extra_brace(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let p = at.point();
    let brace = if src.text[..p].ends_with('}') {
        Some(p - 1)
    } else {
        src.index
            .problems
            .iter()
            .find(|x| {
                x.kind == ProblemKind::UnmatchedCloseBrace && src.line_of(x.span.start) == at.line
            })
            .map(|x| x.span.start)
    };
    let Some(b) = brace else { return Vec::new() };
    // A brace of a formula ("Extra }, or forgotten $") is only removed when
    // it really has no opening brace.
    if !d.message.starts_with("Too many")
        && !src
            .index
            .problems
            .iter()
            .any(|x| x.kind == ProblemKind::UnmatchedCloseBrace && x.span.start == b)
    {
        return Vec::new();
    }
    place(d, src, b..b + 1);
    advise(
        d,
        lang,
        "Cette `}` ne ferme aucune `{`.",
        "This `}` closes no `{`.",
    );
    edits(
        lang.pick("Supprimer cette }", "Delete this }").into(),
        vec![src.edit(b..b + 1, "")],
    )
}

fn missing_brace(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    if !src
        .index
        .problems
        .iter()
        .any(|x| x.kind == ProblemKind::UnclosedBrace && src.line_of(x.span.start) == at.line)
    {
        return Vec::new();
    }
    let mut p = at.point();
    for close in ["$", "\\]", "\\)"] {
        if src.text[..p].ends_with(close) {
            p -= close.len();
            break;
        }
    }
    advise(
        d,
        lang,
        "Une `{` ouverte sur cette ligne n'est pas refermée.",
        "A `{` opened on this line is not closed.",
    );
    edits(
        lang.pick("Ajouter la } manquante", "Add the missing }")
            .into(),
        vec![src.insert(p, "}")],
    )
}

// ------------------------------------------------------------ math

static TRAILING_COMMAND: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\[A-Za-z]+\*?$").unwrap());

pub(super) fn inside_display(src: &Src, offset: usize) -> bool {
    let before = mask(&src.text[..offset]);
    let open = before.rfind("\\[").map(|i| i as isize).unwrap_or(-1);
    let close = before.rfind("\\]").map(|i| i as isize).unwrap_or(-1);
    open > close
        || crate::syntax::context::open_environments(&before)
            .iter()
            .any(|e| crate::syntax::is_math_environment(e))
}

fn missing_dollar(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (line_span, line_text) = src.line(at.line);
    let before = d.context_before.clone().unwrap_or_default();
    // Consequence of a formula that was not closed.
    if before.trim_start().starts_with("\\end{") {
        return Vec::new();
    }
    // A blank line inside a formula.
    if line_text.trim().is_empty() {
        if !inside_display(src, line_span.start) {
            return Vec::new();
        }
        let mut list = vec![src.edit(src.full_line(at.line), "")];
        let mut l = at.line + 1;
        while l + 1 < src.line_count() && src.line(l).1.trim().is_empty() {
            list.push(src.edit(src.full_line(l), ""));
            l += 1;
        }
        advise(
            d,
            lang,
            "Cette ligne vide est dans une formule : elle termine le paragraphe, et TeX ferme la formule avec lui.",
            "This blank line is inside a formula: it ends the paragraph, and TeX closes the formula with it.",
        );
        return edits(
            lang.pick(
                "Supprimer la ligne vide de la formule",
                "Delete the blank line of the formula",
            )
            .into(),
            list,
        );
    }
    let p = at.point();
    let text = &src.text;
    if text[..p].ends_with('_') || text[..p].ends_with('^') {
        // The word around the point.
        let start = text[line_span.start..p - 1]
            .rfind(|c: char| c.is_whitespace() || "({[~$".contains(c))
            .map_or(line_span.start, |i| line_span.start + i + 1);
        let mut end = p;
        let bytes = text.as_bytes();
        while end < line_span.end {
            let c = bytes[end];
            if c == b'{' {
                end = group_end(text, end).unwrap_or(end + 1);
                continue;
            }
            let next_is_word = bytes
                .get(end + 1)
                .is_some_and(|n| n.is_ascii_alphanumeric());
            if c.is_ascii_whitespace() || b"),;:!?".contains(&c) || (c == b'.' && !next_is_word) {
                break;
            }
            end += 1;
        }
        let word = &text[start..end];
        let escaped = word.replace('_', "\\_").replace('^', "\\^{}");
        let escape = Fix::Edits {
            title: format!("{} {escaped}", lang.pick("Écrire", "Write")),
            edits: word
                .match_indices(['_', '^'])
                .map(|(i, c)| {
                    src.edit(
                        start + i..start + i + 1,
                        if c == "_" { "\\_" } else { "\\^{}" },
                    )
                })
                .collect(),
        };
        let wrap = Fix::Edits {
            title: format!(
                "{} ${word}$",
                lang.pick("Mettre en mode mathématique :", "Make it math:")
            ),
            edits: vec![src.insert(start, "$"), src.insert(end, "$")],
        };
        // `mon_fichier` is text, `x^2` or `a_n` is math.
        let first = word.split(['_', '^']).next().unwrap_or("");
        let identifier = text[..p].ends_with('_')
            && first.chars().filter(char::is_ascii_alphabetic).count() >= 2;
        let script = &text[p - 1..p];
        place(d, src, p - 1..p);
        advise(
            d,
            lang,
            &format!(
                "`{script}` ({}) n'existe que dans une formule, et celui-ci est dans du texte.",
                if script == "_" { "indice" } else { "exposant" }
            ),
            &format!(
                "`{script}` (a {}) only exists in a formula, and this one is in text.",
                if script == "_" {
                    "subscript"
                } else {
                    "superscript"
                }
            ),
        );
        return if identifier {
            vec![escape, wrap]
        } else {
            vec![wrap, escape]
        };
    }
    if let Some(m) = TRAILING_COMMAND.find(&text[line_span.start..p]) {
        let start = line_span.start + m.start();
        let mut end = p;
        while text[end..].starts_with('{') {
            end = group_end(text, end).unwrap_or(end + 1);
        }
        let code = &text[start..end];
        let name = m.as_str();
        let math_only = kb()
            .command(name.trim_start_matches('\\').trim_end_matches('*'), None)
            .is_some_and(|c| c.mode == crate::kb::Mode::Math);
        if math_only {
            place(d, src, start..start + name.len());
            advise(
                d,
                lang,
                &format!("`{name}` n'existe que dans une formule, et celui-ci est dans du texte."),
                &format!("`{name}` only exists in a formula, and this one is in text."),
            );
        }
        return edits(
            format!(
                "{} ${code}$",
                lang.pick("Mettre en mode mathématique :", "Make it math:")
            ),
            vec![src.insert(start, "$"), src.insert(end, "$")],
        );
    }
    Vec::new()
}

/// Start of the argument of a script ending at `end` (exclusive).
fn argument_start(text: &str, end: usize) -> Option<usize> {
    if text[..end].ends_with('}') {
        return group_start(text, end - 1);
    }
    let prev = text[..end].char_indices().next_back()?.0;
    let letters = text[..end]
        .bytes()
        .rev()
        .take_while(u8::is_ascii_alphabetic)
        .count();
    if letters > 0 && text[..end - letters].ends_with('\\') {
        return Some(end - letters - 1);
    }
    Some(prev)
}

/// End of the argument of a script starting at `start`.
fn argument_end(text: &str, start: usize) -> Option<usize> {
    let rest = &text[start..];
    if rest.starts_with('{') {
        return group_end(text, start);
    }
    if let Some(cmd) = rest.strip_prefix('\\') {
        let n = cmd
            .bytes()
            .take_while(u8::is_ascii_alphabetic)
            .count()
            .max(1);
        return Some(start + 1 + n);
    }
    rest.chars().next().map(|c| start + c.len_utf8())
}

fn double_script(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let text = &src.text;
    let second = at.point().saturating_sub(1);
    let c = text.as_bytes().get(second).copied();
    if !matches!(c, Some(b'^' | b'_')) {
        return Vec::new();
    }
    let Some(arg_start) = argument_start(text, second) else {
        return Vec::new();
    };
    let Some(first) = arg_start
        .checked_sub(1)
        .filter(|&f| matches!(text.as_bytes()[f], b'^' | b'_'))
    else {
        return Vec::new();
    };
    let Some(end) = argument_end(text, second + 1) else {
        return Vec::new();
    };
    let Some(base) = argument_start(text, first) else {
        return Vec::new();
    };
    let nested = format!("{}{{{}}}", &text[base..first + 1], &text[first + 1..end]);
    let grouped = format!("{{{}}}{}", &text[base..second], &text[second..end]);
    let (script, fr, en) = if c == Some(b'_') {
        ("_", "indices", "subscripts")
    } else {
        ("^", "exposants", "superscripts")
    };
    place(d, src, base..end);
    advise(
        d,
        lang,
        &format!(
            "Deux {fr} (`{script}`) se suivent sur `{}` : TeX ne sait pas s'il faut lire `{nested}` ou `{grouped}`.",
            &text[base..first]
        ),
        &format!(
            "Two {en} (`{script}`) follow each other on `{}`: TeX cannot tell whether to read `{nested}` or `{grouped}`.",
            &text[base..first]
        ),
    );
    vec![
        Fix::Edits {
            title: format!("{} {nested}", lang.pick("Écrire", "Write")),
            edits: vec![src.edit(first + 1..end, format!("{{{}}}", &text[first + 1..end]))],
        },
        Fix::Edits {
            title: format!("{} {grouped}", lang.pick("Écrire", "Write")),
            edits: vec![src.edit(base..second, format!("{{{}}}", &text[base..second]))],
        },
    ]
}

const DELIMITERS: &[(&str, &str)] = &[
    ("\\langle", "\\rangle"),
    ("\\lvert", "\\rvert"),
    ("\\lVert", "\\rVert"),
    ("\\lfloor", "\\rfloor"),
    ("\\lceil", "\\rceil"),
    ("\\lbrace", "\\rbrace"),
    ("\\lbrack", "\\rbrack"),
    ("\\{", "\\}"),
    ("\\|", "\\|"),
    ("(", ")"),
    ("[", "]"),
    ("|", "|"),
    (".", "."),
];

fn missing_right(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (span, _) = src.line(at.line);
    let p = at.point();
    let before = &src.text[span.start..p];
    let Some(left) = before.rfind("\\left") else {
        return Vec::new();
    };
    let after_left = before[left + 5..].trim_start();
    let close = DELIMITERS
        .iter()
        .find(|(o, _)| after_left.starts_with(o))
        .map_or(".", |(_, c)| c);
    let mut at_ = p;
    for end in ["$$", "$", "\\]", "\\)"] {
        if before.ends_with(end) {
            at_ = p - end.len();
            break;
        }
    }
    let space = if src.text[..at_].ends_with(' ') {
        ""
    } else {
        " "
    };
    place(d, src, span.start + left..span.start + left + 5);
    advise(
        d,
        lang,
        "Ce `\\left` n'a pas de `\\right` avant la fin de la formule.",
        "This `\\left` has no `\\right` before the end of the formula.",
    );
    edits(
        format!("{} \\right{close}", lang.pick("Fermer avec", "Close with")),
        vec![src.insert(at_, format!("{space}\\right{close}"))],
    )
}

const AMS_DISPLAYS: &[&str] = &[
    "align",
    "align*",
    "gather",
    "gather*",
    "multline",
    "multline*",
    "flalign",
    "flalign*",
    "alignat",
    "alignat*",
    "equation",
    "equation*",
    "eqnarray",
    "eqnarray*",
];

fn align_in_math(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let text = &src.text;
    let Some(env) = src
        .index
        .environments
        .iter()
        .filter(|e| AMS_DISPLAYS.contains(&e.name.as_str()))
        .filter(|e| {
            src.line_of(e.begin.start) <= at.line
                && e.end
                    .as_ref()
                    .is_some_and(|x| src.line_of(x.end) >= at.line)
        })
        .max_by_key(|e| e.begin.start)
    else {
        return Vec::new();
    };
    let end = env.end.clone().unwrap();
    let before = text[..env.begin.start].trim_end();
    let after_start = end.end + (text[end.end..].len() - text[end.end..].trim_start().len());
    let after = &text[after_start..];
    let pairs = [
        ("\\[", "\\]"),
        ("$$", "$$"),
        ("\\begin{equation}", "\\end{equation}"),
        ("\\begin{equation*}", "\\end{equation*}"),
    ];
    for (open, close) in pairs {
        if before.ends_with(open) && after.starts_with(close) {
            let o = before.len() - open.len();
            advise(
                d,
                lang,
                &format!(
                    "`{}` ouvre déjà une formule : il ne se met pas dans `{open} … {close}`.",
                    env.name
                ),
                &format!(
                    "`{}` already opens a formula: it does not go inside `{open} … {close}`.",
                    env.name
                ),
            );
            return edits(
                format!(
                    "{} {open} … {close} {} {}",
                    lang.pick("Retirer", "Remove"),
                    lang.pick("autour de", "around"),
                    env.name
                ),
                vec![
                    src.delete(o..o + open.len()),
                    src.delete(after_start..after_start + close.len()),
                ],
            );
        }
    }
    Vec::new()
}

const ALIGNMENTS: &[&str] = &[
    "tabular",
    "tabular*",
    "tabularx",
    "tabulary",
    "array",
    "longtable",
    "align",
    "align*",
    "alignat",
    "alignat*",
    "aligned",
    "eqnarray",
    "eqnarray*",
    "matrix",
    "pmatrix",
    "bmatrix",
    "vmatrix",
    "Vmatrix",
    "Bmatrix",
    "smallmatrix",
    "cases",
    "split",
    "flalign",
    "flalign*",
    "tabu",
    "NiceTabular",
    "tblr",
];

fn escape_char(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang, c: char) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let p = at.point();
    if !src.text[..p].ends_with(c) || src.text[..p - 1].ends_with('\\') {
        return Vec::new();
    }
    // In a table or an alignment, the `&` is right: another error is the cause.
    if c == '&' && src.environment_at(p, ALIGNMENTS).is_some() {
        return Vec::new();
    }
    place(d, src, p - 1..p);
    if c == '&' {
        advise(
            d,
            lang,
            "Ce `&` n'est pas dans un tableau. Dans du texte, une esperluette s'écrit `\\&`.",
            "This `&` is not in a table. In text, an ampersand is written `\\&`.",
        );
    } else {
        advise(
            d,
            lang,
            &format!("Dans du texte, `{c}` s'écrit `\\{c}`."),
            &format!("In text, `{c}` is written `\\{c}`."),
        );
    }
    edits(
        format!("{} \\{c}", lang.pick("Écrire", "Write")),
        vec![src.edit(p - 1..p, format!("\\{c}"))],
    )
}

static UNICODE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Unicode character (.) \(U\+([0-9A-Fa-f]+)\)").unwrap());

fn unicode(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let message = d.message.clone();
    let Some(m) = UNICODE.captures(&message) else {
        return Vec::new();
    };
    let ch = m[1].chars().next().unwrap();
    let Some(&(_, cmd, math)) = UNICODE_COMMANDS.iter().find(|(c, _, _)| *c == ch) else {
        return Vec::new();
    };
    let Some(src) = d.file.as_ref().and_then(|f| s.get(f)) else {
        return Vec::new();
    };
    let text = &src.text;
    let list: Vec<FileEdit> = text
        .match_indices(ch)
        .map(|(i, found)| {
            let in_math = src.index.math.iter().any(|m| m.start <= i && i < m.end);
            let next_letter = text[i + found.len()..]
                .chars()
                .next()
                .is_some_and(|c| c.is_alphabetic());
            let mut code = if math && !in_math {
                format!("${cmd}$")
            } else {
                cmd.to_owned()
            };
            if next_letter && code.ends_with(|c: char| c.is_ascii_alphabetic()) {
                code.push(' ');
            }
            src.edit(i..i + found.len(), code)
        })
        .collect();
    if cmd.is_empty() {
        advise(
            d,
            lang,
            &format!(
                "Ce caractère invisible (U+{}) n'est pas lu par pdfLaTeX.",
                &m[2]
            ),
            &format!(
                "This invisible character (U+{}) is not read by pdfLaTeX.",
                &m[2]
            ),
        );
    } else {
        advise(
            d,
            lang,
            &format!("Avec pdfLaTeX, « {ch} » s'écrit `{cmd}`."),
            &format!("With pdfLaTeX, “{ch}” is written `{cmd}`."),
        );
    }
    let title = if cmd.is_empty() {
        format!(
            "{} U+{}",
            lang.pick(
                "Supprimer le caractère invisible",
                "Delete the invisible character"
            ),
            &m[2]
        )
    } else {
        format!(
            "{} « {ch} » {} {cmd}",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        )
    };
    edits(title, list)
}

// ---------------------------------------------------------- tables

pub(super) const TABULARS: &[&str] = &[
    "tabular",
    "tabular*",
    "tabularx",
    "tabulary",
    "array",
    "longtable",
    "tabu",
];

/// Span of the column specification of a table environment.
pub(super) fn column_spec(src: &Src, env: &EnvironmentSpan) -> Option<Span> {
    let text = &src.text;
    let mut i = env.begin.end;
    let skip_ws = |i: &mut usize| {
        while text[*i..].starts_with(char::is_whitespace) {
            *i += 1;
        }
    };
    skip_ws(&mut i);
    if text[i..].starts_with('[') {
        i += text[i..].find(']')? + 1;
        skip_ws(&mut i);
    }
    if matches!(env.name.as_str(), "tabular*" | "tabularx" | "tabulary") {
        i = group_end(text, i)?;
        skip_ws(&mut i);
    }
    let end = group_end(text, i)?;
    Some(i + 1..end - 1)
}

/// Number of columns of a specification (`|l|c|p{2cm}|` → 3).
fn count_columns(spec: &str) -> usize {
    let b = spec.as_bytes();
    let mut n = 0;
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'*' => {
                // *{3}{c}
                let open = i + 1;
                let Some(e1) = group_end(spec, open) else {
                    break;
                };
                let times: usize = spec[open + 1..e1 - 1].trim().parse().unwrap_or(1);
                let Some(e2) = group_end(spec, e1) else { break };
                n += times * count_columns(&spec[e1 + 1..e2 - 1]);
                i = e2;
                continue;
            }
            b'@' | b'!' | b'>' | b'<' => {
                i = group_end(spec, i + 1).unwrap_or(i + 1);
                continue;
            }
            b'p' | b'm' | b'b' | b'w' | b'W' => {
                n += 1;
                i += 1;
                while i < b.len() && b[i] == b'{' {
                    i = group_end(spec, i).unwrap_or(i + 1);
                }
                continue;
            }
            c if c.is_ascii_alphabetic() => n += 1,
            _ => {}
        }
        i += 1;
    }
    n
}

fn extra_column(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let p = at.point();
    let Some(env) = src.environment_at(p, TABULARS) else {
        return Vec::new();
    };
    let Some(spec) = column_spec(src, env) else {
        return Vec::new();
    };
    let text = &src.text;
    let row_start = text[spec.end..p]
        .rfind("\\\\")
        .map_or(spec.end + 1, |i| spec.end + i + 2);
    let env_end = env.end.as_ref().map_or(text.len(), |e| e.start);
    let row_end = text[p..env_end].find("\\\\").map_or(env_end, |i| p + i);
    let row = mask(&text[row_start..row_end]);
    let needed = row.matches('&').count() - row.matches("\\&").count() + 1;
    let current = &text[spec.clone()];
    let have = count_columns(current);
    if needed <= have {
        return Vec::new();
    }
    let letter = current
        .chars()
        .rev()
        .find(|c| matches!(c, 'l' | 'c' | 'r'))
        .unwrap_or('l');
    let extra: String = std::iter::repeat_n(letter, needed - have).collect();
    let new = match current.strip_suffix('|') {
        Some(stem) => format!(
            "{stem}|{}|",
            extra
                .chars()
                .map(String::from)
                .collect::<Vec<_>>()
                .join("|")
        ),
        None => format!("{current}{extra}"),
    };
    advise(
        d,
        lang,
        &format!(
            "Cette ligne a {needed} cellules, et le tableau {have} colonnes (`{{{current}}}`)."
        ),
        &format!("This row has {needed} cells, and the table {have} columns (`{{{current}}}`)."),
    );
    edits(
        format!(
            "{} {{{current}}} → {{{new}}}",
            lang.pick("Ajouter une colonne :", "Add a column:")
        ),
        vec![src.edit(spec, new)],
    )
}

const RULES: &[&str] = &[
    "\\hline",
    "\\cline",
    "\\toprule",
    "\\midrule",
    "\\bottomrule",
    "\\cmidrule",
];

fn end_row(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (line, line_text) = src.line(at.line);
    let point = at.point().clamp(line.start, line.end) - line.start;
    // The rule TeX stopped at, and what is written before it.
    let Some((rule_at, rule)) = RULES
        .iter()
        .filter_map(|r| line_text[..point].rfind(r).map(|i| (i, *r)))
        .max_by_key(|(i, _)| *i)
    else {
        return Vec::new();
    };
    let before = line_text[..rule_at].trim();
    let (insert_at, content) = if before.is_empty() {
        let Some(prev) = (0..at.line).rev().find(|&l| {
            let text = src.line(l).1;
            !text[..content_end(text)].trim().is_empty()
        }) else {
            return Vec::new();
        };
        let (span, text) = src.line(prev);
        (
            span.start + content_end(text),
            text[..content_end(text)].trim_start().to_owned(),
        )
    } else {
        (
            line.start + line_text[..rule_at].trim_end().len(),
            before.to_owned(),
        )
    };
    if content.ends_with("\\\\")
        || RULES
            .iter()
            .any(|r| content.starts_with(r) || content.ends_with(r))
        || content.starts_with("\\begin")
    {
        return Vec::new();
    }
    place(
        d,
        src,
        line.start + rule_at..line.start + rule_at + rule.len(),
    );
    advise(
        d,
        lang,
        &format!(
            "La ligne du tableau avant ce `{rule}` ne se termine pas par `\\\\` : un filet ne peut venir qu'après la fin d'une ligne."
        ),
        &format!(
            "The row of the table before this `{rule}` does not end with `\\\\`: a rule can only come after the end of a row."
        ),
    );
    edits(
        lang.pick(
            "Terminer la ligne du tableau par \\\\",
            "End the row of the table with \\\\",
        )
        .into(),
        vec![src.insert(insert_at, " \\\\")],
    )
}

static COLUMN_TYPES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\newcolumntype\s*\{?(\w)").unwrap());

fn bad_column(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let Some(env) = src
        .index
        .environments
        .iter()
        .filter(|e| TABULARS.contains(&e.name.as_str()) && src.line_of(e.begin.start) <= at.line)
        .max_by_key(|e| e.begin.start)
    else {
        return Vec::new();
    };
    let Some(spec) = column_spec(src, env) else {
        return Vec::new();
    };
    let own: String = s
        .srcs()
        .iter()
        .flat_map(|x| {
            COLUMN_TYPES
                .captures_iter(&x.text)
                .map(|m| m[1].to_owned())
                .collect::<Vec<_>>()
        })
        .collect();
    let text = &src.text[spec.clone()];
    let b = text.as_bytes();
    let mut i = 0;
    let mut bad = None;
    while i < b.len() {
        let c = b[i] as char;
        match c {
            '@' | '!' | '>' | '<' | '*' | '{' => {
                let open = if c == '{' { i } else { i + 1 };
                i = group_end(text, open).unwrap_or(i + 1);
                if c == '*' {
                    i = group_end(text, i).unwrap_or(i);
                }
                continue;
            }
            'l' | 'c' | 'r' | '|' | ' ' => {}
            'p' => {
                i = group_end(text, i + 1).unwrap_or(i + 1);
                continue;
            }
            _ if own.contains(c) => {}
            _ => {
                bad = Some((i, c));
                break;
            }
        }
        i += 1;
    }
    let Some((i, c)) = bad else { return Vec::new() };
    let at_ = spec.start + i;
    place(d, src, at_..at_ + 1);
    let from_package = |d: &mut Diagnostic, package: &str| {
        advise(
            d,
            lang,
            &format!("Les colonnes `{c}` viennent du package `{package}`, qui n'est pas chargé."),
            &format!("`{c}` columns come from the `{package}` package, which is not loaded."),
        );
        vec![Fix::add_package(package)]
    };
    match c {
        'm' | 'b' | 'w' | 'W' => return from_package(d, "array"),
        'S' | 's' => return from_package(d, "siunitx"),
        _ => {}
    }
    advise(
        d,
        lang,
        &format!("`{c}` n'est pas un type de colonne connu ici."),
        &format!("`{c}` is not a column type known here."),
    );
    ['l', 'c']
        .iter()
        .map(|r| Fix::Edits {
            title: format!(
                "{} « {c} » {} « {r} »",
                lang.pick("Remplacer la colonne", "Replace column"),
                lang.pick("par", "with")
            ),
            edits: vec![src.edit(at_..at_ + 1, r.to_string())],
        })
        .collect()
}

// ------------------------------------------------------ line breaks

fn stray_newline(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let text = &src.text;
    let limit = at.token.start;
    let Some(i) = text[..limit].rfind("\\\\") else {
        return Vec::new();
    };
    // Nothing but spaces between the `\\` and the text it should end.
    if !text[i + 2..limit].trim().is_empty() || src.line_of(limit) > src.line_of(i) + 2 {
        return Vec::new();
    }
    advise(
        d,
        lang,
        "Le `\\\\` qui précède a déjà terminé la ligne : celui-ci n'a plus de ligne à terminer.",
        "The `\\\\` before has already ended the line: this one has no line left to end.",
    );
    edits(
        lang.pick("Supprimer ce \\\\ inutile", "Delete this useless \\\\")
            .into(),
        vec![src.delete(i..i + 2)],
    )
}

fn newline_before_blank(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    if !d.message.contains("badness 10000") {
        return Vec::new();
    }
    let (Some(first), Some(src)) = (d.line, d.file.as_ref().and_then(|f| s.get(f))) else {
        return Vec::new();
    };
    let last = d.end_line.unwrap_or(first) as usize;
    let mut list = Vec::new();
    for l in first as usize - 1..last.min(src.line_count()) {
        let (span, text) = src.line(l);
        let content = &text[..content_end(text)];
        let next_blank = l + 1 >= src.line_count() || {
            let n = src.line(l + 1).1.trim_start();
            n.is_empty() || n.starts_with("\\end{") || n.starts_with("\\par")
        };
        if content.ends_with("\\\\") && !content.ends_with("\\\\\\\\") && next_blank {
            let end = span.start + content.len();
            let start = span.start + content[..content.len() - 2].trim_end().len();
            list.push(src.edit(start..end, ""));
        }
    }
    if !list.is_empty() {
        advise(
            d,
            lang,
            "`\\\\` à la fin d'un paragraphe laisse une ligne presque vide.",
            "`\\\\` at the end of a paragraph leaves an almost empty line.",
        );
    }
    edits(
        lang.pick(
            "Supprimer le \\\\ en fin de paragraphe",
            "Delete the \\\\ at the end of the paragraph",
        )
        .into(),
        list,
    )
}

// ---------------------------------------------------------- floats

static FLOAT_H: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\begin\{(?:figure|table|figure\*|table\*)\}\s*\[(!?h!?)\]").unwrap()
});

fn float_h(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let mut list = Vec::new();
    let mut first: Option<(Rc<Src>, Span)> = None;
    for src in s.srcs() {
        for m in FLOAT_H.captures_iter(&mask(&src.text)) {
            let opt = m.get(1).unwrap();
            let new = if opt.as_str().contains('!') {
                "!htbp"
            } else {
                "htbp"
            };
            list.push(src.edit(opt.range(), new));
            if first.is_none() {
                first = Some((src.clone(), opt.range()));
            }
        }
    }
    if d.range.is_none()
        && let Some((src, span)) = first
    {
        place(d, &src, span);
    }
    edits(
        lang.pick("Remplacer [h] par [htbp]", "Replace [h] with [htbp]")
            .into(),
        list,
    )
}

fn float_option(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(opt) = quoted(&d.message) else {
        return Vec::new();
    };
    if opt == "H" {
        advise(
            d,
            lang,
            "`[H]` (exactement ici) vient du package `float`, qui n'est pas chargé.",
            "`[H]` (exactly here) comes from the `float` package, which is not loaded.",
        );
        return vec![Fix::add_package("float")];
    }
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let Some(span) = find_on_line(&at.src, at.line, &format!("[{opt}]"), None) else {
        return Vec::new();
    };
    edits(
        format!(
            "{} [{opt}] {} [htbp]",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        ),
        vec![at.src.edit(span.start + 1..span.end - 1, "htbp")],
    )
}

static GRAPHICS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\includegraphics\*?\s*(\[([^\]]*)\])?\s*\{").unwrap());

/// Options of `\includegraphics` without the size keys, plus `size`.
fn sized_options(options: &str, size: &str) -> String {
    let mut keep: Vec<&str> = options
        .split(',')
        .map(str::trim)
        .filter(|o| {
            let key = o.split('=').next().unwrap_or("").trim();
            !o.is_empty()
                && !matches!(
                    key,
                    "width" | "height" | "scale" | "totalheight" | "keepaspectratio"
                )
        })
        .collect();
    keep.insert(0, size);
    keep.join(",")
}

/// Edits resizing the images of `region` of `src`.
fn resize_images(src: &Src, region: Span, size: &str) -> Vec<FileEdit> {
    GRAPHICS
        .captures_iter(&src.text[region.clone()])
        .map(|m| match m.get(1) {
            Some(opts) => src.edit(
                region.start + opts.start()..region.start + opts.end(),
                format!("[{}]", sized_options(&m[2], size)),
            ),
            None => {
                let at = region.start + m.get(0).unwrap().end() - 1;
                src.insert(at, format!("[{size}]"))
            }
        })
        .collect()
}

fn float_too_large(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let Some(env) = src
        .index
        .environments
        .iter()
        .filter(|e| e.name.starts_with("figure") || e.name.starts_with("table"))
        .filter(|e| src.line_of(e.begin.start) <= at.line)
        .max_by_key(|e| e.begin.start)
    else {
        return Vec::new();
    };
    let end = env.end.as_ref().map_or(src.text.len(), |e| e.end);
    edits(
        lang.pick("Adapter l'image à la page", "Fit the image to the page")
            .into(),
        resize_images(
            src,
            env.begin.end..end,
            "width=\\linewidth,height=0.8\\textheight,keepaspectratio",
        ),
    )
}

fn caption_outside(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let p = at.point();
    if let Some(env) = src.environment_at(p, &["center"])
        && let Some(end) = &env.end
    {
        let inner = &src.text[env.begin.end..end.start];
        let kind = if inner.contains("tabular") {
            "table"
        } else {
            "figure"
        };
        let (_, line) = src.line(src.line_of(env.begin.start));
        let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
        advise(
            d,
            lang,
            "Ce `\\caption` est dans `center`, qui n'est pas un flottant.",
            "This `\\caption` is in `center`, which is not a float.",
        );
        return edits(
            format!(
                "{} {kind}",
                lang.pick("Transformer center en", "Turn center into")
            ),
            vec![
                src.edit(
                    env.begin.clone(),
                    format!("\\begin{{{kind}}}[htbp]\n{indent}\\centering"),
                ),
                src.edit(end.clone(), format!("\\end{{{kind}}}")),
            ],
        );
    }
    let Some(span) = find_on_line(src, at.line, "\\caption", Some(p)) else {
        return Vec::new();
    };
    let mut list = vec![src.edit(span, "\\captionof{figure}")];
    if !s.loads("caption")
        && let Some(root) = s.root()
        && let Some(point) = tx::insertion_point(&root.text)
    {
        list.push(root.insert(point, "\n\\usepackage{caption}"));
    }
    edits(
        lang.pick("Utiliser \\captionof{figure}", "Use \\captionof{figure}")
            .into(),
        list,
    )
}

// ----------------------------------------------------------- files

static NOT_FOUND: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"File `([^']+)' not found|I can't find file `([^']+)'").unwrap());

pub(crate) const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "pdf", "eps", "svg", "gif", "bmp", "tif", "tiff",
];

fn file_not_found(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(name) = NOT_FOUND
        .captures(&d.message)
        .and_then(|m| m.get(1).or(m.get(2)).map(|x| x.as_str().to_owned()))
    else {
        return Vec::new();
    };
    let path = Path::new(&name);
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let Some(root) = s.root() else {
        return Vec::new();
    };
    let replace = |src: &Src, span: Span, new: &str| Fix::Edits {
        title: format!("{} {new}", lang.pick("Utiliser", "Use")),
        edits: vec![src.edit(span, new.to_owned())],
    };
    match ext.as_str() {
        // An encoding of inputenc or fontenc.
        "def" => {
            for p in &root.index.packages {
                let candidates = match p.name.as_str() {
                    "inputenc" => INPUT_ENCODINGS,
                    "fontenc" => FONT_ENCODINGS,
                    _ => continue,
                };
                if !p.options.contains(&stem) {
                    continue;
                }
                let Some(i) = root.text[p.command_span.clone()].find(&stem) else {
                    continue;
                };
                let span = p.command_span.start + i..p.command_span.start + i + stem.len();
                place(d, &root, span.clone());
                let best = closest(&stem, candidates.iter().copied(), 3);
                if let Some(best) = best {
                    advise(
                        d,
                        lang,
                        &format!(
                            "`{stem}` n'est pas un encodage connu. Vouliez-vous écrire `{best}` ?"
                        ),
                        &format!("`{stem}` is not a known encoding. Did you mean `{best}`?"),
                    );
                }
                return best
                    .map(|best| replace(&root, span, best))
                    .into_iter()
                    .collect();
            }
            Vec::new()
        }
        // Files the compiler writes: another error is the cause.
        "aux" | "toc" | "lof" | "lot" | "out" | "bbl" | "nav" | "snm" | "idx" | "ind" => Vec::new(),
        // A misspelled package.
        "sty" | "cls" => {
            let found = root
                .index
                .packages
                .iter()
                .find(|p| p.name == stem)
                .map(|p| p.span.clone())
                .or_else(|| {
                    root.index
                        .document_class
                        .as_ref()
                        .filter(|c| c.name == stem)
                        .map(|c| c.span.clone())
                });
            let Some(span) = found else { return Vec::new() };
            place(d, &root, span.clone());
            let what = if ext == "cls" {
                lang.pick("La classe", "The class")
            } else {
                lang.pick("Le package", "The package")
            };
            if kb().package_or_class(&stem).is_some() {
                advise(
                    d,
                    lang,
                    &format!(
                        "{what} `{stem}` existe, mais n'est pas installé dans cette distribution TeX."
                    ),
                    &format!(
                        "{what} `{stem}` exists, but is not installed in this TeX distribution."
                    ),
                );
                return Vec::new();
            }
            let names = kb().packages().iter().map(|p| p.name.as_str());
            let best = closest(&stem, names, 2);
            if let Some(best) = best {
                did_you_mean(d, lang, best);
            }
            best.map(|best| replace(&root, span, best))
                .into_iter()
                .collect()
        }
        _ => {
            // An image or a file of the project, misspelled.
            let written = name.trim_end_matches(".tex");
            let mut found = None;
            for src in s.srcs() {
                if let Some(inc) = src.index.includes.iter().find(|i| {
                    i.path == name
                        || i.path == written
                        || i.path.trim_end_matches(".tex") == written
                }) {
                    found = Some((src.clone(), inc.span.clone(), inc.kind));
                    break;
                }
            }
            let Some((src, span, kind)) = found else {
                return Vec::new();
            };
            place(d, &src, span.clone());
            let dir = s.dir();
            let graphics = matches!(kind, IncludeKind::Graphics);
            let candidates: Vec<String> =
                files_with(&dir, if graphics { IMAGE_EXTENSIONS } else { &["tex"] })
                    .into_iter()
                    .filter_map(|f| {
                        let rel = f
                            .strip_prefix(&dir)
                            .ok()?
                            .to_string_lossy()
                            .replace('\\', "/");
                        // Written like the original: without extension when it had none.
                        Some(if Path::new(&name).extension().is_none() || !graphics {
                            rel.rsplit_once('.')
                                .map_or(rel.clone(), |(s, _)| s.to_owned())
                        } else {
                            rel
                        })
                    })
                    .collect();
            let best = closest(written, candidates.iter().map(String::as_str), 3);
            if let Some(best) = best {
                advise(
                    d,
                    lang,
                    &format!(
                        "Le projet n'a pas de fichier `{written}` ; le plus proche est `{best}`."
                    ),
                    &format!("The project has no file `{written}`; the closest one is `{best}`."),
                );
            }
            best.map(|best| replace(&src, span, best))
                .into_iter()
                .collect()
        }
    }
}

static LENGTH_TAIL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\d+\s*(?:[a-z]{2}|\\[A-Za-z]+)$").unwrap());
static KEYVAL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"keyval Error: (.+?) undefined").unwrap());

fn keyval(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(key) = KEYVAL.captures(&d.message).map(|m| m[1].trim().to_owned()) else {
        return Vec::new();
    };
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (span, line) = src.line(at.line);
    let upto = &line[..at.point().clamp(span.start, span.end) - span.start];
    // `width=2,5cm`: the comma ends the option, and `5cm` is read as another one.
    if LENGTH_TAIL.is_match(&key)
        && let Ok(written) = Regex::new(&format!(r"(\d+)\s*(,)\s*{}", regex::escape(&key)))
        && let Some(m) = written.captures(upto)
    {
        let (number, comma) = (m.get(1).unwrap(), m.get(2).unwrap());
        let whole = m.get(0).unwrap();
        place(d, src, span.start + whole.start()..span.start + whole.end());
        let fixed = format!("{}.{key}", number.as_str());
        advise(
            d,
            lang,
            &format!(
                "Dans une liste d'options, la virgule sépare les options : `{}` est lu `{}`, puis `{key}`. Écrivez `{fixed}`.",
                whole.as_str(),
                number.as_str()
            ),
            &format!(
                "In a list of options, the comma separates the options: `{}` is read `{}`, then `{key}`. Write `{fixed}`.",
                whole.as_str(),
                number.as_str()
            ),
        );
        return edits(
            format!("{} {fixed}", lang.pick("Écrire", "Write")),
            vec![src.edit(span.start + comma.start()..span.start + comma.end(), ".")],
        );
    }
    let package = src
        .index
        .packages
        .iter()
        .find(|p| src.line_of(p.command_span.start) == at.line)
        .map(|p| p.name.clone())
        .or_else(|| {
            KEYVAL_COMMANDS
                .iter()
                .filter_map(|(cmd, pkg)| upto.rfind(&format!("\\{cmd}")).map(|i| (i, *pkg)))
                .max()
                .map(|(_, p)| p.to_owned())
        });
    let keys: Vec<&str> = KEYVAL_KEYS
        .iter()
        .filter(|(p, _)| package.as_deref().is_none_or(|x| x == *p))
        .flat_map(|(_, k)| k.iter().copied())
        .collect();
    let Some(best) = closest(&key, keys, 3) else {
        return Vec::new();
    };
    let Some(found) = find_on_line(src, at.line, &key, Some(at.point())) else {
        return Vec::new();
    };
    place(d, src, found.clone());
    did_you_mean(d, lang, best);
    edits(
        format!(
            "{} {key} {} {best}",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        ),
        vec![src.edit(found, best)],
    )
}

// ------------------------------------------------------ bad boxes

fn overfull(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    if !d.message.contains("hbox") {
        return Vec::new();
    }
    let (Some(first), Some(src)) = (d.line, d.file.as_ref().and_then(|f| s.get(f))) else {
        return Vec::new();
    };
    let first = first as usize - 1;
    let last =
        (d.end_line.map_or(first, |l| l as usize - 1)).min(src.line_count().saturating_sub(1));
    if first >= src.line_count() {
        return Vec::new();
    }
    let region = src.line(first).0.start..src.line(last).0.end;
    let text = &src.text[region.clone()];
    if text.contains("\\includegraphics") {
        let mut list = resize_images(&src, region.clone(), "width=\\linewidth");
        // At the start of a paragraph, the indent would still push it out.
        let first_line = src.line(first).1;
        let starts_paragraph = first == 0
            || src.line(first - 1).1.trim().is_empty()
            || src
                .line(first - 1)
                .1
                .trim_start()
                .starts_with("\\begin{document}");
        if first_line.trim_start().starts_with("\\includegraphics")
            && starts_paragraph
            && src
                .environment_at(
                    region.start,
                    &[
                        "figure",
                        "figure*",
                        "center",
                        "minipage",
                        "table",
                        "wrapfigure",
                    ],
                )
                .is_none()
        {
            let indent = first_line.len() - first_line.trim_start().len();
            list.push(src.insert(region.start + indent, "\\noindent"));
        }
        advise(
            d,
            lang,
            "L'image de cette ligne est plus large que le texte.",
            "The image of this line is wider than the text.",
        );
        return edits(
            lang.pick(
                "Réduire l'image à la largeur du texte",
                "Shrink the image to the text width",
            )
            .into(),
            list,
        );
    }
    if text.contains("\\url")
        || text.contains("\\href")
        || d.context_before
            .as_deref()
            .is_some_and(|c| c.contains("tt/"))
    {
        return if s.loads("xurl") {
            Vec::new()
        } else {
            vec![Fix::add_package("xurl")]
        };
    }
    if d.message.contains("in alignment") || text.contains("\\begin{tabular}") {
        // A table wider than the text: scaled to the width.
        let env = src
            .index
            .environments
            .iter()
            .filter(|e| e.name == "tabular" && e.end.is_some())
            .find(|e| {
                src.line_of(e.begin.start) <= last
                    && src.line_of(e.end.as_ref().unwrap().end) >= first
            });
        let Some(env) = env else { return Vec::new() };
        let end = env.end.as_ref().unwrap().end;
        let mut list = vec![
            src.insert(env.begin.start, "\\resizebox{\\linewidth}{!}{%\n"),
            src.insert(end, "%\n}"),
        ];
        if !s.loads("graphicx")
            && let Some(root) = s.root()
            && let Some(point) = tx::insertion_point(&root.text)
        {
            list.push(root.insert(point, "\n\\usepackage{graphicx}"));
        }
        advise(
            d,
            lang,
            "Le tableau est plus large que le texte.",
            "The table is wider than the text.",
        );
        return edits(
            lang.pick(
                "Adapter le tableau à la largeur du texte",
                "Scale the table to the text width",
            )
            .into(),
            list,
        );
    }
    if inside_display(&src, region.start) || text.contains("\\[") || text.contains('$') {
        return Vec::new();
    }
    // Text: more room between words, better spacing.
    let mut out = vec![Fix::AddToPreamble {
        title: lang
            .pick(
                "Autoriser plus d'espace entre les mots",
                "Allow more space between words",
            )
            .into(),
        code: "\\setlength{\\emergencystretch}{3em}".into(),
        after: None,
    }];
    if !s.loads("microtype") {
        out.push(Fix::add_package("microtype"));
    }
    out
}

// ----------------------------------------------------- definitions

static DEFINED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:Command|Environment) (\\?\S+?)\.? (?:already defined|undefined)").unwrap()
});

fn redefine(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang, exists: bool) -> Vec<Fix> {
    let Some(name) = DEFINED.captures(&d.message).map(|m| m[1].to_owned()) else {
        return Vec::new();
    };
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (from, to) = if exists {
        ("\\new", "\\renew")
    } else {
        ("\\renew", "\\new")
    };
    let (span, line) = src.line(at.line);
    let found = ["command", "environment"].iter().find_map(|kind| {
        let word = format!("{from}{kind}");
        let i = line.rfind(&word)?;
        line[i..]
            .contains(&name)
            .then_some((i, word, format!("{to}{kind}")))
    });
    let Some((i, word, new)) = found else {
        return Vec::new();
    };
    place(d, src, span.start + i..span.start + i + word.len());
    if exists {
        advise(
            d,
            lang,
            &format!("`{name}` existe déjà : `{word}` refuse de le remplacer, `{new}` le fait."),
            &format!("`{name}` already exists: `{word}` refuses to replace it, `{new}` does."),
        );
    } else {
        advise(
            d,
            lang,
            &format!(
                "`{name}` n'existe pas encore : `{word}` ne peut pas le redéfinir, `{new}` le crée."
            ),
            &format!(
                "`{name}` does not exist yet: `{word}` cannot redefine it, `{new}` creates it."
            ),
        );
    }
    edits(
        format!("{} {new}", lang.pick("Utiliser", "Use")),
        vec![src.edit(span.start + i..span.start + i + word.len(), new)],
    )
}

static DEFINITION_OF: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"definition of (\\[A-Za-z@]+)").unwrap());
static PARAMETER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"#([1-9])").unwrap());

fn parameters(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(name) = DEFINITION_OF.captures(&d.message).map(|m| m[1].to_owned()) else {
        return Vec::new();
    };
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let text = &src.text;
    let re = Regex::new(&format!(
        r"\\(?:re)?newcommand\*?\s*(?:\{{\s*{0}\s*\}}|{0})",
        regex::escape(&name)
    ))
    .unwrap();
    let Some(m) = re.find(text) else {
        return Vec::new();
    };
    let mut i = m.end();
    let args = if text[i..].trim_start().starts_with('[') {
        let open = i + text[i..].find('[').unwrap();
        let close = open + text[open..].find(']').unwrap_or(0);
        let n: usize = text[open + 1..close].trim().parse().unwrap_or(0);
        i = close + 1;
        Some((open + 1..close, n))
    } else {
        None
    };
    let body_start = i + (text[i..].len() - text[i..].trim_start().len());
    let Some(body_end) = group_end(text, body_start) else {
        return Vec::new();
    };
    let max = PARAMETER
        .captures_iter(&text[body_start..body_end])
        .filter_map(|c| c[1].parse::<usize>().ok())
        .max()
        .unwrap_or(0);
    if max == 0 {
        return Vec::new();
    }
    let title = format!(
        "{} {max} {} : \\newcommand{{{name}}}[{max}]",
        lang.pick("Déclarer", "Declare"),
        if max > 1 {
            lang.pick("arguments", "arguments")
        } else {
            lang.pick("argument", "argument")
        }
    );
    let declared = args.as_ref().map_or(0, |(_, n)| *n);
    if declared < max {
        place(d, src, m.range());
        advise(
            d,
            lang,
            &format!(
                "La définition de `{name}` utilise `#{max}` et déclare {declared} argument(s)."
            ),
            &format!(
                "The definition of `{name}` uses `#{max}` and declares {declared} argument(s)."
            ),
        );
    }
    match args {
        Some((span, n)) if n < max => edits(title, vec![src.edit(span, max.to_string())]),
        Some(_) => Vec::new(),
        None => edits(title, vec![src.insert(m.end(), format!("[{max}]"))]),
    }
}

static NAME_WITHOUT_BACKSLASH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\(?:re)?newcommand\*?\s*\{([A-Za-z@]+)\}").unwrap());

fn backslash_name(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (span, line) = src.line(at.line);
    let Some(m) = NAME_WITHOUT_BACKSLASH.captures(line) else {
        return Vec::new();
    };
    let name = m.get(1).unwrap();
    place(d, src, span.start + name.start()..span.start + name.end());
    advise(
        d,
        lang,
        &format!(
            "Le nom d'une commande commence par `\\` : `\\{}`.",
            name.as_str()
        ),
        &format!(
            "The name of a command starts with `\\`: `\\{}`.",
            name.as_str()
        ),
    );
    edits(
        format!("{} \\{}", lang.pick("Écrire", "Write"), name.as_str()),
        vec![src.insert(span.start + name.start(), "\\")],
    )
}

// -------------------------------------------------------- preamble

fn move_to_preamble(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let p = at.point();
    let (line, _) = src.line(at.line);
    let masked = mask(&src.text);
    let written = super::numeric::command_start(&masked, line.start, p)
        .map_or(at.token.clone(), |start| start..p);
    let command = src.text[written.clone()].to_owned();
    if command.starts_with('\\')
        && let Some(begin) = masked
            .find("\\begin{document}")
            .filter(|b| *b < written.start)
    {
        place(d, src, written.clone());
        let line = src.line_of(begin) + 1;
        if command == "\\begin{document}" {
            advise(
                d,
                lang,
                &format!(
                    "Le document a déjà commencé ligne {line} : ce second `\\begin{{document}}` est en trop."
                ),
                &format!(
                    "The document has already begun on line {line}: this second `\\begin{{document}}` is one too many."
                ),
            );
            return edits(
                lang.pick(
                    "Supprimer ce \\begin{document}",
                    "Delete this \\begin{document}",
                )
                .into(),
                vec![src.delete(written)],
            );
        }
        let name = command
            .split(['{', '['])
            .next()
            .unwrap_or(&command)
            .to_owned();
        advise(
            d,
            lang,
            &format!(
                "Ce `{name}` vient après `\\begin{{document}}` (ligne {line}) : il ne s'emploie qu'avant, dans le préambule."
            ),
            &format!(
                "This `{name}` comes after `\\begin{{document}}` (line {line}): it is only used before it, in the preamble."
            ),
        );
    }
    let Some(pkg) = src
        .index
        .packages
        .iter()
        .find(|x| x.command_span.start <= p && p <= x.command_span.end)
    else {
        return Vec::new();
    };
    let stmt = src.text[pkg.command_span.clone()].to_owned();
    let Some(root) = s.root() else {
        return Vec::new();
    };
    let mut list = vec![src.delete(pkg.command_span.clone())];
    let names: Vec<&str> = src
        .index
        .packages
        .iter()
        .filter(|x| x.command_span == pkg.command_span)
        .map(|x| x.name.as_str())
        .collect();
    if !names.iter().all(|n| tx::has_package(&root.text, n)) {
        let Some(point) = tx::insertion_point(&root.text) else {
            return Vec::new();
        };
        list.push(root.insert(point, format!("\n{stmt}")));
    }
    edits(
        format!(
            "{} {stmt} {}",
            lang.pick("Déplacer", "Move"),
            lang.pick("dans le préambule", "to the preamble")
        ),
        list,
    )
}

fn move_after_class(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let Some(class) = &src.index.document_class else {
        return Vec::new();
    };
    let class_line = src.line_of(class.span.start);
    let (line_span, line) = src.line(at.line);
    if at.line >= class_line {
        return Vec::new();
    }
    let stmt = line.trim().to_owned();
    let class_end = src.line(class_line).0.end;
    edits(
        format!(
            "{} {stmt} {}",
            lang.pick("Placer", "Put"),
            lang.pick("après \\documentclass", "after \\documentclass")
        ),
        vec![
            src.edit(src.full_line(src.line_of(line_span.start)), ""),
            src.insert(class_end, format!("\n{stmt}")),
        ],
    )
}

fn begin_document(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let fix = backslash_name(d, s, lang);
    if !fix.is_empty() {
        return fix;
    }
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (span, line) = src.line(at.line);
    if line.trim_start().starts_with('\\') || src.index.begin_document.is_some() {
        return Vec::new();
    }
    advise(
        d,
        lang,
        "Le document n'a pas de `\\begin{document}` : ce texte est lu comme une partie du préambule.",
        "The document has no `\\begin{document}`: this text is read as a part of the preamble.",
    );
    edits(
        lang.pick(
            "Ajouter \\begin{document} avant ce texte",
            "Add \\begin{document} before this text",
        )
        .into(),
        vec![src.insert(span.start, "\\begin{document}\n")],
    )
}

fn end_document(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(root) = s.root() else {
        return Vec::new();
    };
    if root.index.has_end_document {
        return Vec::new();
    }
    let end = root.text.len();
    place(d, &root, end..end);
    let newline = if root.text.ends_with('\n') || root.text.is_empty() {
        ""
    } else {
        "\n"
    };
    edits(
        lang.pick(
            "Ajouter \\end{document} à la fin",
            "Add \\end{document} at the end",
        )
        .into(),
        vec![root.insert(end, format!("{newline}\\end{{document}}\n"))],
    )
}

static CLASH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Option clash for package ([^\s.]+)").unwrap());

fn option_clash(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(name) = CLASH.captures(&d.message).map(|m| m[1].to_owned()) else {
        return Vec::new();
    };
    let Some(root) = s.root() else {
        return Vec::new();
    };
    let Some(class) = &root.index.document_class else {
        return Vec::new();
    };
    let loads: Vec<_> = root
        .index
        .packages
        .iter()
        .filter(|p| p.name == name)
        .collect();
    let Some(last) = loads.last() else {
        return Vec::new();
    };
    let mut options: Vec<String> = Vec::new();
    for p in &loads {
        for o in &p.options {
            if !options.contains(o) {
                options.push(o.clone());
            }
        }
    }
    if options.is_empty() {
        return Vec::new();
    }
    place(d, &root, last.command_span.clone());
    // A command that loads only this package.
    let alone = |span: &Span| {
        root.text[span.clone()]
            .trim_end_matches('}')
            .rsplit('{')
            .next()
            .is_some_and(|n| n.trim() == name)
    };
    let opts = options.join(",");
    let mut list = Vec::new();
    if loads.len() > 1 && loads.iter().all(|p| alone(&p.command_span)) {
        // Loaded several times: once, with all the options.
        list.push(root.edit(
            loads[0].command_span.clone(),
            format!("\\usepackage[{opts}]{{{name}}}"),
        ));
        for p in &loads[1..] {
            list.push(root.delete(p.command_span.clone()));
        }
        return edits(
            format!(
                "{} {name} {}",
                lang.pick("Charger", "Load"),
                lang.pick(
                    "une seule fois avec toutes ses options",
                    "once with all its options"
                )
            ),
            list,
        );
    }
    // Loaded before by the class or another package: options passed ahead.
    for p in &loads {
        let stmt = &root.text[p.command_span.clone()];
        if !p.options.is_empty()
            && alone(&p.command_span)
            && let (Some(open), Some(close)) = (stmt.find('['), stmt.find(']'))
        {
            list.push(root.edit(
                p.command_span.start + open..p.command_span.start + close + 1,
                "",
            ));
        }
    }
    let class_line = root.line(root.line_of(class.span.start)).0.start;
    list.push(root.insert(
        class_line,
        format!("\\PassOptionsToPackage{{{opts}}}{{{name}}}\n"),
    ));
    edits(
        format!(
            "{} {name} (\\PassOptionsToPackage)",
            lang.pick("Donner d'avance les options de", "Pass the options of")
        ),
        list,
    )
}

static BABEL_DEPRECATED: LazyLock<Regex> = LazyLock::new(|| {
    // Quoted 'francais' (recent babel) or `francais' (older ones).
    Regex::new(r"Option [`'](\w+)' for Babel is \*deprecated\*.*use [`'](\w+)'").unwrap()
});
static BABEL_UNKNOWN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"Unknown option '([^']+)'|haven't defined the language '([^']+)'").unwrap()
});

/// Names of languages that babel no longer knows, with their current name.
const BABEL_OLD_NAMES: &[(&str, &str)] = &[
    ("francais", "french"),
    ("frenchb", "french"),
    ("canadien", "french"),
    ("acadian", "french"),
    ("germanb", "german"),
    ("ngermanb", "ngerman"),
    ("portuges", "portuguese"),
    ("brazil", "brazilian"),
    ("magyar", "hungarian"),
    ("bahasa", "indonesian"),
];

fn babel_language(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let (old, new) = if let Some(m) = BABEL_DEPRECATED.captures(&d.message) {
        (m[1].to_owned(), m[2].to_owned())
    } else if let Some(m) = BABEL_UNKNOWN.captures(&d.message) {
        let old = m.get(1).or(m.get(2)).unwrap().as_str().to_owned();
        // Old names first (recent babel no longer knows `francais`), then
        // the closest known language.
        let renamed = BABEL_OLD_NAMES
            .iter()
            .find(|(o, _)| o.eq_ignore_ascii_case(&old))
            .map(|(_, n)| *n);
        let Some(best) = renamed.or_else(|| closest(&old, BABEL_LANGUAGES.iter().copied(), 3))
        else {
            return Vec::new();
        };
        (old, best.to_owned())
    } else {
        return Vec::new();
    };
    let Some(root) = s.root() else {
        return Vec::new();
    };
    // In the options of babel, or in the global options of the class.
    let mut spans: Vec<Span> = root
        .index
        .packages
        .iter()
        .filter(|p| p.name == "babel" && p.options.contains(&old))
        .map(|p| p.command_span.clone())
        .collect();
    if let Some(c) = &root.index.document_class
        && c.options.contains(&old)
    {
        spans.push(root.line(root.line_of(c.span.start)).0);
    }
    let list: Vec<FileEdit> = spans
        .iter()
        .filter_map(|span| {
            let i = root.text[span.clone()].find(&old)?;
            Some(root.edit(span.start + i..span.start + i + old.len(), new.clone()))
        })
        .collect();
    if let Some(first) = list.first() {
        d.file = Some(root.path.clone());
        d.line = Some(first.range.start.line + 1);
        d.range = Some(first.range);
        if BABEL_OLD_NAMES
            .iter()
            .any(|(o, n)| o.eq_ignore_ascii_case(&old) && *n == new)
        {
            advise(
                d,
                lang,
                &format!(
                    "`{old}` est un ancien nom de langue ; babel l'appelle maintenant `{new}`."
                ),
                &format!("`{old}` is an old language name; babel now calls it `{new}`."),
            );
        } else {
            did_you_mean(d, lang, &new);
        }
    }
    edits(
        format!(
            "{} {old} {} {new}",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        ),
        list,
    )
}

fn font_size(s: &mut Sources<'_>) -> Vec<Fix> {
    if s.loads("lmodern") {
        vec![Fix::add_package("fix-cm")]
    } else {
        vec![Fix::add_package("lmodern")]
    }
}

static UNKNOWN_OPTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"Unknown option `([^']+)' for (?:package|class) `([^']+)'").unwrap()
});

fn unknown_option(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(m) = UNKNOWN_OPTION.captures(&d.message) else {
        return Vec::new();
    };
    let (option, package) = (m[1].to_owned(), m[2].to_owned());
    let Some(root) = s.root() else {
        return Vec::new();
    };
    let command = root
        .index
        .packages
        .iter()
        .find(|p| p.name == package)
        .map(|p| p.command_span.clone())
        .or_else(|| {
            root.index
                .document_class
                .as_ref()
                .filter(|c| c.name == package)
                .map(|c| root.line(root.line_of(c.span.start)).0)
        });
    let Some(command) = command else {
        return Vec::new();
    };
    let stmt = &root.text[command.clone()];
    let (Some(open), Some(close)) = (stmt.find('['), stmt.find(']')) else {
        return Vec::new();
    };
    let Some(i) = stmt[open..close].find(&option).map(|i| open + i) else {
        return Vec::new();
    };
    let span = command.start + i..command.start + i + option.len();
    place(d, &root, span.clone());
    let is_class = root
        .index
        .document_class
        .as_ref()
        .is_some_and(|c| c.name == package);
    let known = s.options_of(&package, is_class);
    if let Some(best) = closest(&option, known.iter().map(String::as_str), 2) {
        did_you_mean(d, lang, best);
        return edits(
            format!(
                "{} {option} {} {best}",
                lang.pick("Remplacer", "Replace"),
                lang.pick("par", "with")
            ),
            vec![root.edit(span, best)],
        );
    }
    edits(
        format!(
            "{} {option}",
            lang.pick("Retirer l'option", "Remove option")
        ),
        vec![root.edit(
            option_removal(stmt, command.start, open, close, i, &option),
            "",
        )],
    )
}

static UNUSED_OPTIONS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Unused global option\(s\):\s*\[([^\]]+)\]").unwrap());

/// An option of `\documentclass[…]` that neither the class nor a package
/// took: it is shown where it is written.
fn unused_option(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(option) = UNUSED_OPTIONS
        .captures(&d.message)
        .and_then(|m| m[1].split(',').next().map(|o| o.trim().to_owned()))
    else {
        return Vec::new();
    };
    let Some(root) = s.root() else {
        return Vec::new();
    };
    let Some(class) = root.index.document_class.clone() else {
        return Vec::new();
    };
    let command = root.line(root.line_of(class.span.start)).0;
    let stmt = &root.text[command.clone()];
    let (Some(open), Some(close)) = (stmt.find('['), stmt.find(']')) else {
        return Vec::new();
    };
    let Some(i) = stmt[open..close].find(&option).map(|i| open + i) else {
        return Vec::new();
    };
    let span = command.start + i..command.start + i + option.len();
    place(d, &root, span.clone());
    let known = s.options_of(&class.name, true);
    if let Some(best) = closest(&option, known.iter().map(String::as_str), 2) {
        advise(
            d,
            lang,
            &format!(
                "Ni la classe `{}` ni un package ne connaît l'option `{option}`. Vouliez-vous écrire `{best}` ?",
                class.name
            ),
            &format!(
                "Neither the class `{}` nor a package knows the option `{option}`. Did you mean `{best}`?",
                class.name
            ),
        );
        return edits(
            format!(
                "{} {option} {} {best}",
                lang.pick("Remplacer", "Replace"),
                lang.pick("par", "with")
            ),
            vec![root.edit(span, best)],
        );
    }
    advise(
        d,
        lang,
        &format!(
            "Ni la classe `{}` ni un package ne connaît l'option `{option}` : elle n'a aucun effet.",
            class.name
        ),
        &format!(
            "Neither the class `{}` nor a package knows the option `{option}`: it has no effect.",
            class.name
        ),
    );
    edits(
        format!(
            "{} {option}",
            lang.pick("Retirer l'option", "Remove option")
        ),
        vec![root.edit(
            option_removal(stmt, command.start, open, close, i, &option),
            "",
        )],
    )
}

/// What to delete to remove an option of a list in brackets: the option
/// with its comma, or the brackets when it is the only one.
fn option_removal(
    stmt: &str,
    start: usize,
    open: usize,
    close: usize,
    i: usize,
    option: &str,
) -> Span {
    let options = &stmt[open + 1..close];
    if options.trim() == option {
        start + open..start + close + 1
    } else if stmt[i + option.len()..].trim_start().starts_with(',') {
        let after = stmt[i + option.len()..].find(',').unwrap() + 1;
        start + i..start + i + option.len() + after
    } else {
        let before = stmt[..i].rfind(',').unwrap_or(i);
        start + before..start + i + option.len()
    }
}

/// "No \author given": the title is made by `\maketitle`.
fn no_author(d: &mut Diagnostic, s: &mut Sources<'_>) -> Vec<Fix> {
    for src in s.srcs() {
        let text = mask(&src.text);
        if let Some(i) = text.find("\\maketitle") {
            place(d, &src, i..i + "\\maketitle".len());
            break;
        }
    }
    Vec::new()
}

const SECTIONING: &[&str] = &[
    "part",
    "chapter",
    "section",
    "subsection",
    "subsubsection",
    "paragraph",
    "subparagraph",
];
static SECTION_COMMAND: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b\*?")
        .unwrap()
});

/// hyperref: "Difference (2) between bookmark levels is greater than one".
/// A level of titles is skipped: the title is shown with the one before it.
fn bookmark_level(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let text = mask(&src.text);
    let (line, _) = src.line(at.line);
    let level = |name: &str| SECTIONING.iter().position(|x| *x == name);
    let Some(here) = SECTION_COMMAND
        .captures_iter(&text[line.clone()])
        .last()
        .map(|c| (line.start + c.get(0).unwrap().start(), c[1].to_owned()))
    else {
        return Vec::new();
    };
    let Some(before) = SECTION_COMMAND
        .captures_iter(&text[..here.0])
        .last()
        .map(|c| c[1].to_owned())
    else {
        return Vec::new();
    };
    let (Some(a), Some(b)) = (level(&before), level(&here.1)) else {
        return Vec::new();
    };
    if b <= a + 1 {
        return Vec::new();
    }
    let span = here.0..here.0 + 1 + here.1.len();
    let skipped = SECTIONING[a + 1];
    place(d, src, span.clone());
    advise(
        d,
        lang,
        &format!(
            "`\\{}` vient après `\\{before}` : le niveau `\\{skipped}` est sauté.",
            here.1
        ),
        &format!(
            "`\\{}` comes after `\\{before}`: the level `\\{skipped}` is skipped.",
            here.1
        ),
    );
    edits(
        format!("{} \\{skipped}", lang.pick("Écrire", "Write")),
        vec![src.edit(span, format!("\\{skipped}"))],
    )
}

// ------------------------------------------------------------ colours

static UNDEFINED_COLOR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Undefined color `([^']+)'").unwrap());

fn color(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(name) = UNDEFINED_COLOR
        .captures(&d.message)
        .map(|m| m[1].to_owned())
    else {
        return Vec::new();
    };
    let root_text = s.root().map(|r| r.text.clone()).unwrap_or_default();
    let options: Vec<String> = tx::loaded_packages(&root_text)
        .into_iter()
        .filter(|p| p.names.iter().any(|n| n == "xcolor"))
        .flat_map(|p| {
            p.options
                .split(',')
                .map(|o| o.trim().to_owned())
                .collect::<Vec<_>>()
        })
        .collect();
    let has = |o: &str| options.iter().any(|x| x == o);
    if DVIPS_COLORS.contains(&name.as_str()) && !has("dvipsnames") {
        advise(
            d,
            lang,
            &format!(
                "`{name}` est une couleur de l'option `dvipsnames` de `xcolor`, qui n'est pas demandée."
            ),
            &format!(
                "`{name}` is a color of the `dvipsnames` option of `xcolor`, which is not asked for."
            ),
        );
        return vec![Fix::AddPackageOption {
            package: "xcolor".into(),
            option: "dvipsnames".into(),
        }];
    }
    if SVG_COLORS.contains(&name.as_str()) && !has("svgnames") {
        advise(
            d,
            lang,
            &format!(
                "`{name}` est une couleur de l'option `svgnames` de `xcolor`, qui n'est pas demandée."
            ),
            &format!(
                "`{name}` is a color of the `svgnames` option of `xcolor`, which is not asked for."
            ),
        );
        return vec![Fix::AddPackageOption {
            package: "xcolor".into(),
            option: "svgnames".into(),
        }];
    }
    let own: Vec<String> = s
        .srcs()
        .iter()
        .flat_map(|x| x.index.colors.iter().map(|c| c.name.clone()))
        .collect();
    let mut known: Vec<&str> = BASE_COLORS.to_vec();
    if has("dvipsnames") {
        known.extend(DVIPS_COLORS);
    }
    if has("svgnames") {
        known.extend(SVG_COLORS);
    }
    known.extend(own.iter().map(String::as_str));
    let lower = name.to_lowercase();
    let best = FRENCH_COLORS
        .iter()
        .find(|(fr, _)| *fr == lower)
        .map(|(_, en)| *en)
        .or_else(|| closest(&name, known.iter().copied(), 3));
    let Some(best) = best else { return Vec::new() };
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let Some(span) = find_on_line(&at.src, at.line, &name, Some(at.point())) else {
        return Vec::new();
    };
    place(d, &at.src, span.clone());
    did_you_mean(d, lang, best);
    edits(
        format!(
            "{} {name} {} {best}",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        ),
        vec![at.src.edit(span, best)],
    )
}

// --------------------------------------------------------------- TikZ

fn semicolon(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    for l in (0..at.line).rev() {
        let (span, text) = src.line(l);
        let content = text[..content_end(text)].trim_start();
        if content.is_empty() {
            continue;
        }
        if content.ends_with(';') || content.ends_with('{') || content.starts_with("\\begin") {
            return Vec::new();
        }
        advise(
            d,
            lang,
            &format!("Le tracé de la ligne {} ne se termine pas par `;`.", l + 1),
            &format!("The path of line {} does not end with `;`.", l + 1),
        );
        return edits(
            lang.pick(
                "Ajouter le ; qui termine le tracé",
                "Add the ; that ends the path",
            )
            .into(),
            vec![src.insert(span.start + content_end(text), ";")],
        );
    }
    Vec::new()
}

static ARROW_TIP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Unknown arrow tip kind '([^']+)'").unwrap());
static DECORATION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"I do not know the decoration `([^']+)'").unwrap());
static TIKZ_KEY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"I do not know the key '/tikz/([^']+)'").unwrap());

fn tikz(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let msg = d.message.clone();
    // What is written comes from a library that is not loaded.
    let library = |d: &mut Diagnostic, what: &str, l: &str| {
        advise(
            d,
            lang,
            &format!("{what} vient de la bibliothèque TikZ `{l}`, qui n'est pas chargée."),
            &format!("{what} comes from the TikZ library `{l}`, which is not loaded."),
        );
        vec![Fix::AddTikzLibrary { library: l.into() }]
    };
    if let Some(m) = ARROW_TIP.captures(&msg) {
        let tip = m[1].trim();
        let what = format!("`{tip}`");
        if META_ARROWS.contains(&tip) {
            return library(d, &what, "arrows.meta");
        }
        if OLD_ARROWS.contains(&tip) {
            return library(d, &what, "arrows");
        }
        return Vec::new();
    }
    if msg.contains("Unknown function `of'") || msg.contains("No shape named `of ") {
        return library(d, "`=of`", "positioning");
    }
    if let Some(m) = DECORATION.captures(&msg) {
        return TIKZ_DECORATIONS
            .iter()
            .find(|(n, _)| *n == &m[1])
            .map(|(n, l)| library(d, &format!("`{n}`"), l))
            .unwrap_or_default();
    }
    if msg.contains("Cannot parse this coordinate")
        && let Some(at) = at(d, s)
        && at.src.line(at.line).1.contains("($")
    {
        return library(d, "`($ … $)`", "calc");
    }
    if msg.contains("active@") || msg.contains("language@active") {
        return vec![Fix::AddTikzLibrary {
            library: "babel".into(),
        }];
    }
    let Some(key) = TIKZ_KEY.captures(&msg).map(|m| m[1].to_owned()) else {
        return Vec::new();
    };
    if let Some((_, l)) = TIKZ_KEY_LIBRARIES.iter().find(|(k, _)| *k == key) {
        return library(d, &format!("`{key}`"), l);
    }
    if key.starts_with('"') {
        return library(d, "`\"…\"`", "quotes");
    }
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let keys = TIKZ_KEYS.iter().chain(BASE_COLORS).copied();
    let Some(best) = closest(&key, keys, 3) else {
        return Vec::new();
    };
    let Some(span) = find_on_line(&at.src, at.line, &key, Some(at.point())) else {
        return Vec::new();
    };
    place(d, &at.src, span.clone());
    did_you_mean(d, lang, best);
    edits(
        format!(
            "{} {key} {} {best}",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        ),
        vec![at.src.edit(span, best)],
    )
}

static COMPAT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\\pgfplotsset\{compat=[^}]+\})").unwrap());

fn pgfplots(d: &mut Diagnostic, lang: Lang) -> Vec<Fix> {
    let code = COMPAT
        .captures(&d.message)
        .map_or("\\pgfplotsset{compat=newest}".to_owned(), |m| {
            m[1].to_owned()
        });
    vec![Fix::AddToPreamble {
        title: format!("{} {code}", lang.pick("Ajouter", "Add")),
        code,
        after: Some("pgfplots".into()),
    }]
}

// ------------------------------------------- references and citations

fn rename_uses(uses: &[(Rc<Src>, Span)], new: &str) -> Vec<FileEdit> {
    uses.iter()
        .map(|(src, span)| src.edit(span.clone(), new.to_owned()))
        .collect()
}

fn reference(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(key) = quoted(&d.message) else {
        return Vec::new();
    };
    let srcs = s.srcs();
    let labels: Vec<String> = srcs
        .iter()
        .flat_map(|x| x.index.labels.iter().map(|l| l.name.clone()))
        .collect();
    if labels.contains(&key) {
        advise(
            d,
            lang,
            &format!(
                "`\\label{{{key}}}` existe dans le projet : une compilation de plus résout la référence."
            ),
            &format!(
                "`\\label{{{key}}}` exists in the project: one more build resolves the reference."
            ),
        );
        return vec![Fix::Rebuild];
    }
    let Some(best) = closest(&key, labels.iter().map(String::as_str), 3) else {
        advise(
            d,
            lang,
            &format!("Le projet n'a pas de `\\label{{{key}}}`."),
            &format!("The project has no `\\label{{{key}}}`."),
        );
        return Vec::new();
    };
    advise(
        d,
        lang,
        &format!("Le projet n'a pas de `\\label{{{key}}}` ; le plus proche est `{best}`."),
        &format!("The project has no `\\label{{{key}}}`; the closest one is `{best}`."),
    );
    let uses: Vec<(Rc<Src>, Span)> = srcs
        .iter()
        .flat_map(|x| {
            x.index
                .references
                .iter()
                .filter(|r| r.name == key)
                .map(|r| (x.clone(), r.span.clone()))
                .collect::<Vec<_>>()
        })
        .collect();
    edits(
        format!(
            "{} {key} {} {best}",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        ),
        rename_uses(&uses, best),
    )
}

fn duplicate_label(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(key) = quoted(&d.message) else {
        return Vec::new();
    };
    let srcs = s.srcs();
    let all: HashSet<String> = srcs
        .iter()
        .flat_map(|x| x.index.labels.iter().map(|l| l.name.clone()))
        .collect();
    let defs: Vec<(Rc<Src>, Span)> = srcs
        .iter()
        .flat_map(|x| {
            x.index
                .labels
                .iter()
                .filter(|l| l.name == key)
                .map(|l| (x.clone(), l.span.clone()))
                .collect::<Vec<_>>()
        })
        .collect();
    if defs.len() < 2 {
        return Vec::new();
    }
    place(d, &defs[1].0, defs[1].1.clone());
    advise(
        d,
        lang,
        &format!(
            "`\\label{{{key}}}` est écrit {} fois dans le projet.",
            defs.len()
        ),
        &format!(
            "`\\label{{{key}}}` is written {} times in the project.",
            defs.len()
        ),
    );
    let mut n = 2;
    let mut list = Vec::new();
    let mut first_new = String::new();
    for (src, span) in &defs[1..] {
        while all.contains(&format!("{key}-{n}")) {
            n += 1;
        }
        let new = format!("{key}-{n}");
        if first_new.is_empty() {
            first_new = new.clone();
        }
        list.push(src.edit(span.clone(), new));
        n += 1;
    }
    edits(
        format!(
            "{} {key} {} {first_new}",
            lang.pick("Renommer le second", "Rename the second"),
            lang.pick("en", "to")
        ),
        list,
    )
}

static CITATION_KEY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?:Citation|database entry for) [`'"]([^'"`]+)['"]"#).unwrap());

/// Adds a bibliography (the `.bib` files of the project) at the end of the document.
fn bibliography(s: &mut Sources<'_>, lang: Lang) -> Option<Fix> {
    let bibs = s.bib_files();
    if bibs.is_empty() {
        return None;
    }
    let root = s.root()?;
    let dir = s.dir();
    let names: Vec<String> = bibs
        .iter()
        .filter_map(|b| b.strip_prefix(&dir).ok())
        .map(|b| b.to_string_lossy().replace('\\', "/"))
        .collect();
    let end = mask(&root.text).rfind("\\end{document}")?;
    let files = names.join(", ");
    let mut list = Vec::new();
    if s.loads("biblatex") {
        let point = tx::insertion_point(&root.text)?;
        for n in &names {
            list.push(root.insert(point, format!("\n\\addbibresource{{{n}}}")));
        }
        list.push(root.insert(end, "\\printbibliography\n"));
    } else {
        let stems: Vec<&str> = names.iter().map(|n| n.trim_end_matches(".bib")).collect();
        let style = if root.text.contains("\\bibliographystyle") {
            String::new()
        } else {
            "\\bibliographystyle{plain}\n".into()
        };
        list.push(root.insert(
            end,
            format!("{style}\\bibliography{{{}}}\n", stems.join(",")),
        ));
    }
    Some(Fix::Edits {
        title: format!(
            "{} ({files})",
            lang.pick("Ajouter la bibliographie", "Add the bibliography")
        ),
        edits: list,
    })
}

fn citation(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(key) = CITATION_KEY.captures(&d.message).map(|m| m[1].to_owned()) else {
        return Vec::new();
    };
    let srcs = s.srcs();
    let uses: Vec<(Rc<Src>, Span)> = srcs
        .iter()
        .flat_map(|x| {
            x.index
                .citations
                .iter()
                .filter(|c| c.name == key)
                .map(|c| (x.clone(), c.span.clone()))
                .collect::<Vec<_>>()
        })
        .collect();
    if d.range.is_none()
        && let Some((src, span)) = uses.first()
    {
        place(d, src, span.clone());
    }
    let keys = s.bib_keys();
    if keys.contains(&key) {
        if !s.has_bibliography() {
            advise(
                d,
                lang,
                &format!(
                    "`{key}` est dans un fichier `.bib` du projet, mais le document n'affiche aucune bibliographie."
                ),
                &format!(
                    "`{key}` is in a `.bib` file of the project, but the document prints no bibliography."
                ),
            );
            return bibliography(s, lang).into_iter().collect();
        }
        advise(
            d,
            lang,
            &format!(
                "`{key}` est dans le fichier `.bib` : une compilation de plus résout la citation."
            ),
            &format!("`{key}` is in the `.bib` file: one more build resolves the citation."),
        );
        return vec![Fix::Rebuild];
    }
    let Some(best) = closest(&key, keys.iter().map(String::as_str), 3) else {
        if !keys.is_empty() {
            advise(
                d,
                lang,
                &format!("Aucune entrée des fichiers `.bib` du projet ne s'appelle `{key}`."),
                &format!("No entry of the `.bib` files of the project is named `{key}`."),
            );
        }
        return Vec::new();
    };
    advise(
        d,
        lang,
        &format!(
            "Aucune entrée des fichiers `.bib` ne s'appelle `{key}` ; la plus proche est `{best}`."
        ),
        &format!("No entry of the `.bib` files is named `{key}`; the closest one is `{best}`."),
    );
    edits(
        format!(
            "{} {key} {} {best}",
            lang.pick("Remplacer", "Replace"),
            lang.pick("par", "with")
        ),
        rename_uses(&uses, best),
    )
}

fn nocite(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(root) = s.root() else {
        return Vec::new();
    };
    let Some(inc) = root
        .index
        .includes
        .iter()
        .find(|i| matches!(i.kind, IncludeKind::Bibliography))
    else {
        return Vec::new();
    };
    let line = root.line_of(inc.span.start);
    place(d, &root, inc.span.clone());
    let at_ = [line.saturating_sub(1), line]
        .into_iter()
        .find(|&l| root.line(l).1.contains("\\bibliographystyle"))
        .unwrap_or(line);
    edits(
        lang.pick(
            "Lister toute la bibliographie (\\nocite{*})",
            "List the whole bibliography (\\nocite{*})",
        )
        .into(),
        vec![root.insert(root.line(at_).0.start, "\\nocite{*}\n")],
    )
}

fn bibstyle(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(root) = s.root() else {
        return Vec::new();
    };
    let Some(inc) = root
        .index
        .includes
        .iter()
        .find(|i| matches!(i.kind, IncludeKind::Bibliography))
    else {
        return Vec::new();
    };
    place(d, &root, inc.span.clone());
    let line = root.line(root.line_of(inc.span.start)).0.start;
    edits(
        lang.pick(
            "Ajouter \\bibliographystyle{plain}",
            "Add \\bibliographystyle{plain}",
        )
        .into(),
        vec![root.insert(line, "\\bibliographystyle{plain}\n")],
    )
}

fn bib_comma(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let (Some(line), Some(src)) = (d.line, d.file.as_ref().and_then(|f| s.get(f))) else {
        return Vec::new();
    };
    if !d.message.contains("expecting a `,'") && !d.message.contains("syntax error") {
        return Vec::new();
    }
    let line = line as usize - 1;
    for l in (0..line.min(src.line_count())).rev() {
        let (span, text) = src.line(l);
        let content = text.trim_end();
        if content.trim().is_empty() {
            continue;
        }
        if content.ends_with(',') || content.ends_with('{') || content.ends_with('(') {
            return Vec::new();
        }
        advise(
            d,
            lang,
            &format!(
                "Le champ de la ligne {} ne se termine pas par une virgule.",
                l + 1
            ),
            &format!("The field of line {} does not end with a comma.", l + 1),
        );
        return edits(
            lang.pick("Ajouter la virgule manquante", "Add the missing comma")
                .into(),
            vec![src.insert(span.start + content.len(), ",")],
        );
    }
    Vec::new()
}

static BIBSTYLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\bibliographystyle\s*\{(plain|unsrt|abbrv)\}").unwrap());

fn natbib(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    for src in s.srcs() {
        if let Some(m) = BIBSTYLE.captures(&mask(&src.text)) {
            let style = m.get(1).unwrap();
            let new = format!("{}nat", style.as_str());
            if d.range.is_none() {
                place(d, &src, style.range());
            }
            return edits(
                format!(
                    "{} {new} ({})",
                    lang.pick("Utiliser le style", "Use style"),
                    lang.pick("compatible natbib", "made for natbib")
                ),
                vec![src.edit(style.range(), new)],
            );
        }
    }
    vec![Fix::AddPackageOption {
        package: "natbib".into(),
        option: "numbers".into(),
    }]
}

static AT_LEAST: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"at least ([\d.]+)pt").unwrap());

fn headheight(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(value) = AT_LEAST
        .captures(&d.message)
        .and_then(|m| m[1].parse::<f64>().ok())
    else {
        return Vec::new();
    };
    let value = (value * 10.0).ceil() / 10.0;
    let code = format!("\\setlength{{\\headheight}}{{{value}pt}}");
    let after = ["fancyhdr", "scrlayer-scrpage", "geometry"]
        .into_iter()
        .find(|p| s.loads(p))
        .map(str::to_owned);
    vec![Fix::AddToPreamble {
        title: format!("{} {code}", lang.pick("Ajouter", "Add")),
        code,
        after,
    }]
}

static TITLE_COMMAND: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\(?:part|chapter|section|subsection|subsubsection|paragraph|caption|title)\*?\s*(?:\[[^\]]*\])?\s*\{").unwrap()
});

fn pdf_string(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    if !d.message.contains("math shift") {
        // The message names what is left out: a command, a line break…
        if let Some(token) = quoted(&d.message).filter(|t| t.starts_with('\\')) {
            advise(
                d,
                lang,
                &format!("Le titre contient `{token}`, que le signet du PDF ne peut pas afficher."),
                &format!("The title holds `{token}`, which the PDF bookmark cannot show."),
            );
        }
        return Vec::new();
    }
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (span, line) = src.line(at.line);
    let mut list = Vec::new();
    for m in TITLE_COMMAND.find_iter(line) {
        let open = span.start + m.end() - 1;
        let Some(close) = group_end(&src.text, open) else {
            continue;
        };
        let arg = &src.text[open + 1..close - 1];
        let mut i = 0;
        while let Some(a) = arg[i..].find('$').map(|x| i + x) {
            let Some(b) = arg[a + 1..].find('$').map(|x| a + 1 + x) else {
                break;
            };
            let formula = &arg[a..=b];
            let plain: String = arg[a + 1..b]
                .chars()
                .filter(|c| !matches!(c, '\\' | '{' | '}' | '^' | '_'))
                .collect();
            list.push(src.edit(
                open + 1 + a..open + 1 + b + 1,
                format!("\\texorpdfstring{{{formula}}}{{{}}}", plain.trim()),
            ));
            i = b + 1;
        }
    }
    if !list.is_empty() {
        advise(
            d,
            lang,
            "Le titre contient une formule, que le signet du PDF ne peut pas afficher.",
            "The title holds a formula, which the PDF bookmark cannot show.",
        );
    }
    edits(
        lang.pick(
            "Utiliser \\texorpdfstring pour la formule du titre",
            "Use \\texorpdfstring for the formula of the title",
        )
        .into(),
        list,
    )
}

fn verb(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (span, line) = src.line(at.line);
    let Some(i) = line.find("\\verb") else {
        return Vec::new();
    };
    let mut j = i + 5;
    if line[j..].starts_with('*') {
        j += 1;
    }
    let Some(delim) = line[j..].chars().next() else {
        return Vec::new();
    };
    let body_start = j + delim.len_utf8();
    let Some(len) = line[body_start..].find(delim) else {
        return Vec::new();
    };
    let body = &line[body_start..body_start + len];
    place(
        d,
        src,
        span.start + i..span.start + body_start + len + delim.len_utf8(),
    );
    advise(
        d,
        lang,
        "Ce `\\verb` est dans l'argument d'une autre commande, où il ne peut pas lire son texte tel quel.",
        "This `\\verb` is in the argument of another command, where it cannot read its text as it is.",
    );
    let mut escaped = String::new();
    for c in body.chars() {
        match c {
            '\\' => escaped.push_str("\\textbackslash{}"),
            '~' => escaped.push_str("\\textasciitilde{}"),
            '^' => escaped.push_str("\\textasciicircum{}"),
            '{' | '}' | '_' | '#' | '%' | '&' | '$' => {
                escaped.push('\\');
                escaped.push(c);
            }
            c => escaped.push(c),
        }
    }
    edits(
        lang.pick(
            "Remplacer \\verb par \\texttt",
            "Replace \\verb with \\texttt",
        )
        .into(),
        vec![src.edit(
            span.start + i..span.start + body_start + len + delim.len_utf8(),
            format!("\\texttt{{{escaped}}}"),
        )],
    )
}

fn include_nested(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let Some(span) = find_on_line(&at.src, at.line, "\\include", Some(at.point())) else {
        return Vec::new();
    };
    edits(
        lang.pick("Utiliser \\input", "Use \\input").into(),
        vec![at.src.edit(span, "\\input")],
    )
}

static AT_COMMAND: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\[A-Za-z]*@[A-Za-z@]*").unwrap());

/// "You can't use `\\spacefactor' in vertical mode": a command whose name
/// holds `@`, read outside `\\makeatletter … \\makeatother` (TeX reads `\\@`
/// alone, then the rest as text).
fn at_command(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    if !d.message.contains("\\spacefactor") {
        return Vec::new();
    }
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let (span, line) = src.line(at.line);
    let point = at.point().clamp(span.start, span.end) - span.start;
    let Some(m) = AT_COMMAND
        .find_iter(line)
        .filter(|m| m.start() < point)
        .last()
    else {
        return Vec::new();
    };
    let before = mask(&src.text[..span.start + m.start()]);
    if before.rfind("\\makeatletter") > before.rfind("\\makeatother") {
        return Vec::new();
    }
    let name = m.as_str().to_owned();
    place(d, src, span.start + m.start()..span.start + m.end());
    advise(
        d,
        lang,
        &format!(
            "`{name}` contient `@` : un tel nom n'est lu en entier qu'entre `\\makeatletter` et `\\makeatother`."
        ),
        &format!(
            "`{name}` holds `@`: such a name is only read whole between `\\makeatletter` and `\\makeatother`."
        ),
    );
    edits(
        lang.pick(
            "Entourer de \\makeatletter … \\makeatother",
            "Surround with \\makeatletter … \\makeatother",
        )
        .into(),
        vec![
            src.insert(span.start, "\\makeatletter\n"),
            src.insert(span.end, "\n\\makeatother"),
        ],
    )
}

static EXTENSION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Unknown graphics extension: (\.\S+?)\.?$").unwrap());

/// "Unknown graphics extension": a format the compiler does not read, or a
/// dot in the name of the file, taken for the start of the extension.
fn graphics_extension(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(ext) = EXTENSION.captures(&d.message).map(|m| m[1].to_owned()) else {
        return Vec::new();
    };
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let src = &at.src;
    let Some(inc) = src.index.includes.iter().find(|i| {
        matches!(i.kind, IncludeKind::Graphics)
            && src.line_of(i.span.start) == at.line
            && i.path.ends_with(&ext)
    }) else {
        return Vec::new();
    };
    place(d, src, inc.span.clone());
    if ext[1..].contains('.')
        && let Some((stem, last)) = inc.path.rsplit_once('.')
    {
        let new = format!("{{{stem}}}.{last}");
        advise(
            d,
            lang,
            &format!(
                "Le nom du fichier contient un point : LaTeX prend `{ext}` pour son extension. Entre accolades, le nom est lu en entier : `{new}`."
            ),
            &format!(
                "The name of the file holds a dot: LaTeX takes `{ext}` for its extension. In braces, the name is read whole: `{new}`."
            ),
        );
        return edits(
            format!("{} {new}", lang.pick("Écrire", "Write")),
            vec![src.edit(inc.span.clone(), new)],
        );
    }
    advise(
        d,
        lang,
        &format!(
            "Ce compilateur ne lit pas les images `{ext}` : il lit les fichiers PDF, PNG et JPG."
        ),
        &format!("This compiler does not read `{ext}` images: it reads PDF, PNG and JPG files."),
    );
    Vec::new()
}

static DEFINITION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\(?:re)?newcommand\*?\s*\{?\s*(\\[A-Za-z@]+)\s*\}?\s*(?:\[[^\]]*\]\s*)*\{")
        .unwrap()
});

/// "TeX capacity exceeded": a command that uses itself in its own
/// definition is expanded without end.
fn recursion(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    for src in s.srcs() {
        let text = mask(&src.text);
        for m in DEFINITION.captures_iter(&text) {
            let name = m.get(1).unwrap();
            let open = m.get(0).unwrap().end() - 1;
            let Some(end) = group_end(&text, open) else {
                continue;
            };
            let body = &text[open + 1..end - 1];
            let itself = body.match_indices(name.as_str()).any(|(i, _)| {
                !body[i + name.len()..].starts_with(|c: char| c.is_ascii_alphabetic() || c == '@')
            });
            if itself {
                place(d, &src, name.range());
                advise(
                    d,
                    lang,
                    &format!(
                        "`{}` s'utilise elle-même dans sa propre définition : TeX la développe sans fin.",
                        name.as_str()
                    ),
                    &format!(
                        "`{}` uses itself in its own definition: TeX expands it without end.",
                        name.as_str()
                    ),
                );
                return Vec::new();
            }
        }
    }
    Vec::new()
}
