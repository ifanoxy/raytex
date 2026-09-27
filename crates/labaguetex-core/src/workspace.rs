//! The project model: every LaTeX and BibTeX file of a folder, indexed and
//! kept up to date with the editor, plus project-wide queries (root file,
//! include graph, outline, labels, bibliography, definitions, search…).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::aux::{AuxData, LabelInfo};
use crate::bib::{self, BibDatabase};
use crate::log::normalize;
use crate::settings::ProjectConfig;
use crate::syntax::{self, DocumentIndex, IncludeKind, LabelKind, ScanOptions, SectionKind};
use crate::tex::PackageAnalyzer;
use crate::text::{LineIndex, Range, Span};

/// Largest file indexed (bytes).
const MAX_FILE_SIZE: u64 = 8 * 1024 * 1024;
/// Maximum number of files walked in a project folder.
const MAX_FILES: usize = 20_000;

/// Kind of text file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DocKind {
    /// `.tex`, `.ltx`…
    Tex,
    /// `.sty`, `.cls` (scanned with `@` as a letter).
    Package,
    /// `.bib`
    Bib,
}

impl DocKind {
    /// Kind of a path from its extension.
    pub fn of(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        Some(match ext.as_str() {
            "tex" | "ltx" | "latex" | "tikz" | "pgf" | "lbx" | "cbx" | "bbx" | "def" | "cfg" => {
                DocKind::Tex
            }
            "sty" | "cls" | "dtx" => DocKind::Package,
            "bib" => DocKind::Bib,
            _ => return None,
        })
    }
}

/// A text file of the project.
#[derive(Debug, Clone)]
pub struct Document {
    /// Absolute path.
    pub path: PathBuf,
    /// Kind.
    pub kind: DocKind,
    /// Current text (from the editor when open, else from disk).
    pub text: String,
    /// Editor version (0 when read from disk).
    pub version: i64,
    /// Whether the editor owns the text.
    pub open: bool,
    /// Line index of `text`.
    pub lines: LineIndex,
    /// Structure (LaTeX files).
    pub index: DocumentIndex,
    /// Entries (BibTeX files).
    pub bib: Option<BibDatabase>,
}

impl Document {
    /// Creates and analyses a document.
    pub fn new(path: PathBuf, kind: DocKind, text: String, version: i64, open: bool) -> Self {
        let lines = LineIndex::new(&text);
        let (index, bib) = match kind {
            DocKind::Tex => (syntax::scan(&text), None),
            DocKind::Package => (
                syntax::scan_with(
                    &text,
                    ScanOptions {
                        at_letter: true,
                        descend_definitions: false,
                    },
                ),
                None,
            ),
            DocKind::Bib => (DocumentIndex::default(), Some(bib::parse(&text))),
        };
        Self {
            path,
            kind,
            text,
            version,
            open,
            lines,
            index,
            bib,
        }
    }

    /// Editor range of a byte span.
    pub fn range(&self, span: &Span) -> Range {
        self.lines.range(&self.text, span.clone())
    }
}

/// Makes a path absolute (relative to the current directory) and normalized,
/// without resolving symbolic links.
pub fn absolute(path: &Path) -> PathBuf {
    if path.is_absolute() {
        normalize(path)
    } else {
        normalize(&std::env::current_dir().unwrap_or_default().join(path))
    }
}

/// The project folder of a file: the nearest ancestor containing
/// `labaguetex.toml`, `.latexmkrc` or `.git`, else the file's own folder.
pub fn project_root_for(file: &Path) -> PathBuf {
    let file = absolute(file);
    let start = if file.is_dir() {
        file.clone()
    } else {
        file.parent().map(Path::to_path_buf).unwrap_or(file.clone())
    };
    let mut dir = start.as_path();
    loop {
        if [
            crate::settings::PROJECT_FILE,
            ".latexmkrc",
            "latexmkrc",
            ".git",
        ]
        .iter()
        .any(|m| dir.join(m).exists())
        {
            return dir.to_path_buf();
        }
        match dir.parent() {
            Some(p) if p != dir => dir = p,
            _ => return start,
        }
    }
}

/// A place in a file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Location {
    /// File.
    pub file: PathBuf,
    /// Range.
    pub range: Range,
}

/// An entry of the document outline.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    /// Section kind.
    pub kind: SectionKind,
    /// Nesting level (0 = part).
    pub level: u8,
    /// Title.
    pub title: String,
    /// Starred (unnumbered).
    pub starred: bool,
    /// Number from the last compilation ("2.1"), if known.
    pub number: Option<String>,
    /// Where.
    pub location: Location,
}

/// A label of the project.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelItem {
    /// Key.
    pub name: String,
    /// What it labels.
    pub kind: LabelKind,
    /// Title, caption or excerpt.
    pub context: Option<String>,
    /// Number and page from the last compilation.
    pub resolved: Option<LabelInfo>,
    /// Where.
    pub location: Location,
}

/// A bibliography entry of the project.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationItem {
    /// Summary.
    #[serde(flatten)]
    pub summary: bib::BibSummary,
    /// Where it is defined.
    pub location: Location,
}

/// A search match.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    /// Where.
    pub location: Location,
    /// The whole line.
    pub line_text: String,
}

/// A project folder.
#[derive(Debug)]
pub struct Workspace {
    /// Project folder.
    pub root_dir: PathBuf,
    /// `labaguetex.toml`.
    pub config: ProjectConfig,
    /// Error in `labaguetex.toml`, if any.
    pub config_error: Option<String>,
    docs: HashMap<PathBuf, Document>,
    aux: HashMap<PathBuf, AuxData>,
    packages: Option<Arc<PackageAnalyzer>>,
}

impl Workspace {
    /// Opens a folder and indexes its LaTeX and BibTeX files.
    pub fn open(root_dir: &Path) -> Self {
        let root_dir = absolute(root_dir);
        let (config, config_error) = match ProjectConfig::load(&root_dir) {
            Ok(c) => (c, None),
            Err(e) => (ProjectConfig::default(), Some(e)),
        };
        let mut ws = Workspace {
            root_dir,
            config,
            config_error,
            docs: HashMap::new(),
            aux: HashMap::new(),
            packages: None,
        };
        for path in ws.walk_text_files() {
            ws.load_from_disk(&path);
        }
        ws
    }

    /// An empty workspace for a single file outside any project.
    pub fn empty(root_dir: &Path) -> Self {
        Workspace {
            root_dir: absolute(root_dir),
            config: ProjectConfig::default(),
            config_error: None,
            docs: HashMap::new(),
            aux: HashMap::new(),
            packages: None,
        }
    }

    fn out_dir_name(&self) -> String {
        self.config
            .build
            .out_dir
            .clone()
            .unwrap_or_else(|| "build".into())
    }

    fn walk_text_files(&self) -> Vec<PathBuf> {
        let out_dir = self.out_dir_name();
        let mut files = Vec::new();
        let walker = ignore::WalkBuilder::new(&self.root_dir)
            .hidden(true)
            .git_ignore(true)
            .max_depth(Some(16))
            .filter_entry(move |e| {
                let name = e.file_name().to_string_lossy();
                !(e.depth() == 1 && name == out_dir.as_str())
                    && name != "node_modules"
                    && name != "target"
            })
            .build();
        for entry in walker.flatten().take(MAX_FILES) {
            let path = entry.path();
            if entry.file_type().is_some_and(|t| t.is_file())
                && DocKind::of(path).is_some()
                && entry.metadata().is_ok_and(|m| m.len() <= MAX_FILE_SIZE)
            {
                files.push(normalize(path));
            }
        }
        files
    }

    /// (Re)loads a file from disk unless the editor owns it. Returns whether it is indexed.
    pub fn load_from_disk(&mut self, path: &Path) -> bool {
        let path = normalize(path);
        if self.docs.get(&path).is_some_and(|d| d.open) {
            return true;
        }
        let Some(kind) = DocKind::of(&path) else {
            return false;
        };
        let Ok(bytes) = std::fs::read(&path) else {
            self.docs.remove(&path);
            return false;
        };
        let text = String::from_utf8(bytes)
            .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
        self.docs
            .insert(path.clone(), Document::new(path, kind, text, 0, false));
        true
    }

    /// Forgets a deleted file.
    pub fn remove(&mut self, path: &Path) {
        self.docs.remove(&normalize(path));
    }

    /// Updates a document from the editor. Stale versions are ignored.
    pub fn update(&mut self, path: &Path, text: String, version: i64) -> bool {
        let path = normalize(path);
        let kind = DocKind::of(&path).unwrap_or(DocKind::Tex);
        if let Some(doc) = self.docs.get(&path)
            && doc.open
            && doc.version > version
        {
            return false;
        }
        self.docs
            .insert(path.clone(), Document::new(path, kind, text, version, true));
        true
    }

    /// The editor closed a document: the disk version becomes the reference.
    pub fn close(&mut self, path: &Path) {
        let path = normalize(path);
        if let Some(doc) = self.docs.get_mut(&path) {
            doc.open = false;
        }
        self.load_from_disk(&path);
    }

    /// Reloads `labaguetex.toml`.
    pub fn reload_config(&mut self) {
        match ProjectConfig::load(&self.root_dir) {
            Ok(c) => {
                self.config = c;
                self.config_error = None;
            }
            Err(e) => self.config_error = Some(e),
        }
    }

    /// Gives the workspace access to the distribution's packages.
    pub fn set_packages(&mut self, analyzer: Option<Arc<PackageAnalyzer>>) {
        self.packages = analyzer;
    }

    /// The package analyzer, when a distribution is available.
    pub fn packages(&self) -> Option<&Arc<PackageAnalyzer>> {
        self.packages.as_ref()
    }

    /// A document.
    pub fn document(&self, path: &Path) -> Option<&Document> {
        self.docs.get(&normalize(path))
    }

    /// All documents.
    pub fn documents(&self) -> impl Iterator<Item = &Document> {
        self.docs.values()
    }

    /// Records the `.aux` data of a root after a compilation.
    pub fn set_aux(&mut self, root: &Path, data: AuxData) {
        self.aux.insert(normalize(root), data);
    }

    /// `.aux` data of a root.
    pub fn aux(&self, root: &Path) -> Option<&AuxData> {
        self.aux.get(&normalize(root))
    }

    // ---------------------------------------------------------- root files

    /// Files that can be compiled on their own.
    pub fn root_candidates(&self) -> Vec<PathBuf> {
        let mut v: Vec<PathBuf> = self
            .docs
            .values()
            .filter(|d| d.kind == DocKind::Tex && d.index.is_root_candidate())
            .map(|d| d.path.clone())
            .collect();
        v.sort_by_key(|p| {
            let name = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            (
                !matches!(
                    name.as_str(),
                    "main" | "master" | "these" | "thesis" | "memoire" | "rapport" | "report"
                ),
                p.components().count(),
                p.clone(),
            )
        });
        v
    }

    /// The configured main file, if it exists.
    pub fn configured_main(&self) -> Option<PathBuf> {
        let main = self.config.project.main.as_ref()?;
        let p = normalize(&self.root_dir.join(main));
        p.exists().then_some(p)
    }

    /// The root document to compile when editing `file`.
    pub fn root_for(&self, file: &Path) -> PathBuf {
        let file = normalize(file);
        if let Some(doc) = self.docs.get(&file) {
            // 1. Magic comment.
            if let Some(root) = &doc.index.magic.root {
                let dir = file.parent().unwrap_or(&self.root_dir);
                let p = normalize(&dir.join(root));
                if p.exists() || self.docs.contains_key(&p) {
                    return p;
                }
            }
            // 2. subfiles: `\documentclass[../main.tex]{subfiles}` — compile the parent.
            if let Some(parent) = doc.index.subfile_parent() {
                let dir = file.parent().unwrap_or(&self.root_dir);
                let mut p = normalize(&dir.join(parent));
                if p.extension().is_none() {
                    p.set_extension("tex");
                }
                if self.docs.contains_key(&p) {
                    return p;
                }
            }
        }
        // 3. The configured main file, if it includes this file.
        let main = self.configured_main();
        if let Some(main) = &main
            && (main == &file || self.included_files(main).contains(&file))
        {
            return main.clone();
        }
        // 4. The file itself if it is a complete document.
        if self
            .docs
            .get(&file)
            .is_some_and(|d| d.index.is_root_candidate())
        {
            return file;
        }
        // 5. A root that includes it.
        for candidate in self.root_candidates() {
            if self.included_files(&candidate).contains(&file) {
                return candidate;
            }
        }
        // 6. Main file, else best candidate, else the file.
        main.or_else(|| self.root_candidates().into_iter().next())
            .unwrap_or(file)
    }

    /// Resolves the target of an include written in `from`, relative to `root`'s folder.
    pub fn resolve_include(
        &self,
        root: &Path,
        from: &Path,
        inc: &syntax::Include,
    ) -> Option<PathBuf> {
        let root_dir = root.parent().unwrap_or(&self.root_dir);
        let from_dir = from.parent().unwrap_or(root_dir);
        let rel = match &inc.dir {
            Some(dir) => Path::new(dir).join(&inc.path),
            None => PathBuf::from(&inc.path),
        };
        let bases: Vec<&Path> =
            if matches!(inc.kind, IncludeKind::Import) || inc.command.starts_with("sub") {
                vec![from_dir, root_dir]
            } else {
                vec![root_dir, from_dir]
            };
        let exts: &[&str] = match inc.kind {
            IncludeKind::Input
            | IncludeKind::Include
            | IncludeKind::Subfile
            | IncludeKind::Import => &["", "tex"],
            IncludeKind::Bibliography | IncludeKind::BibResource => &["", "bib"],
            IncludeKind::Graphics => &[
                "", "pdf", "png", "jpg", "jpeg", "eps", "svg", "PDF", "PNG", "JPG",
            ],
            IncludeKind::Other => &[""],
        };
        let mut dirs: Vec<PathBuf> = bases.iter().map(|b| b.to_path_buf()).collect();
        if inc.kind == IncludeKind::Graphics {
            for doc in self.docs.values() {
                for gp in &doc.index.graphics_paths {
                    dirs.push(root_dir.join(gp));
                }
            }
        }
        for dir in dirs {
            for ext in exts {
                let mut p = normalize(&dir.join(&rel));
                if !ext.is_empty() {
                    if p.extension().is_some_and(|e| e.eq_ignore_ascii_case(ext)) {
                        continue;
                    }
                    let name = format!("{}.{ext}", p.file_name()?.to_string_lossy());
                    p.set_file_name(name);
                }
                if self.docs.contains_key(&p) || p.is_file() {
                    return Some(p);
                }
            }
        }
        None
    }

    /// LaTeX files reachable from `root` through `\input`/`\include`…, in document order (root first).
    pub fn included_files(&self, root: &Path) -> Vec<PathBuf> {
        let root = normalize(root);
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        self.collect_includes(&root, &root, &mut out, &mut seen, 0);
        out
    }

    fn collect_includes(
        &self,
        root: &Path,
        file: &Path,
        out: &mut Vec<PathBuf>,
        seen: &mut HashSet<PathBuf>,
        depth: usize,
    ) {
        if depth > 32 || !seen.insert(file.to_path_buf()) {
            return;
        }
        out.push(file.to_path_buf());
        let Some(doc) = self.docs.get(file) else {
            return;
        };
        for inc in &doc.index.includes {
            if inc.kind.is_source()
                && let Some(target) = self.resolve_include(root, file, inc)
            {
                self.collect_includes(root, &target, out, seen, depth + 1);
            }
        }
        // Local packages and classes are part of the project too.
        for pkg in &doc.index.packages {
            let local = self.root_dir.join(format!("{}.sty", pkg.name));
            if self.docs.contains_key(&local) && !seen.contains(&local) {
                seen.insert(local.clone());
                out.push(local);
            }
        }
        if let Some(class) = &doc.index.document_class {
            let local = self.root_dir.join(format!("{}.cls", class.name));
            if self.docs.contains_key(&local) && seen.insert(local.clone()) {
                out.push(local);
            }
        }
    }

    /// Files considered for project-wide queries: those reachable from the
    /// root, or every LaTeX file when the root includes nothing.
    pub fn project_documents(&self, root: &Path) -> Vec<&Document> {
        let files = self.included_files(root);
        let mut docs: Vec<&Document> = files.iter().filter_map(|f| self.docs.get(f)).collect();
        if docs.len() <= 1 {
            // Loose files (no includes yet): consider the whole folder.
            let root = normalize(root);
            docs = self
                .docs
                .values()
                .filter(|d| d.kind != DocKind::Bib)
                .collect();
            docs.sort_by_key(|d| (d.path != root, d.path.clone()));
        }
        docs
    }

    // ------------------------------------------------------------ queries

    /// Class and packages loaded by the project of `root`.
    pub fn loaded_packages(&self, root: &Path) -> (Option<String>, Vec<String>) {
        let mut class = None;
        let mut packages: Vec<String> = Vec::new();
        for doc in self.project_documents(root) {
            if class.is_none() && doc.kind == DocKind::Tex {
                class = doc.index.document_class.as_ref().map(|c| c.name.clone());
            }
            for p in &doc.index.packages {
                if !packages.contains(&p.name) {
                    packages.push(p.name.clone());
                }
            }
        }
        (class, packages)
    }

    /// Outline of the document of `root`, following includes in order.
    pub fn outline(&self, root: &Path) -> Vec<OutlineItem> {
        let root = normalize(root);
        let aux = self.aux.get(&root);
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        self.outline_of(&root, &root, aux, &mut out, &mut seen, 0);
        if let Some(aux) = aux.filter(|a| !a.toc.is_empty()) {
            number_from_toc(&mut out, &aux.toc);
        }
        out
    }

    fn outline_of(
        &self,
        root: &Path,
        file: &Path,
        aux: Option<&AuxData>,
        out: &mut Vec<OutlineItem>,
        seen: &mut HashSet<PathBuf>,
        depth: usize,
    ) {
        if depth > 32 || !seen.insert(file.to_path_buf()) {
            return;
        }
        let Some(doc) = self.docs.get(file) else {
            return;
        };
        // Interleave sections and includes by position.
        enum Item<'d> {
            Section(&'d syntax::Section),
            Include(&'d syntax::Include),
        }
        let mut items: Vec<(usize, Item<'_>)> = doc
            .index
            .sections
            .iter()
            .map(|s| (s.span.start, Item::Section(s)))
            .collect();
        items.extend(
            doc.index
                .includes
                .iter()
                .filter(|i| i.kind.is_source())
                .map(|i| (i.span.start, Item::Include(i))),
        );
        items.sort_by_key(|(pos, _)| *pos);
        for (_, item) in items {
            match item {
                Item::Section(s) => {
                    let number = aux.and_then(|a| {
                        // The number of a section is known through a label right after it.
                        doc.index
                            .labels
                            .iter()
                            .find(|l| l.span.start > s.span.start && l.span.start < s.span.end + 80)
                            .and_then(|l| a.labels.get(&l.name))
                            .map(|i| i.number.clone())
                    });
                    out.push(OutlineItem {
                        kind: s.kind,
                        level: s.kind.level(),
                        title: s.title.clone(),
                        starred: s.starred,
                        number,
                        location: Location {
                            file: file.to_path_buf(),
                            range: doc.range(&s.span),
                        },
                    });
                }
                Item::Include(inc) => {
                    if let Some(target) = self.resolve_include(root, file, inc) {
                        self.outline_of(root, &target, aux, out, seen, depth + 1);
                    }
                }
            }
        }
    }

    /// All labels of the project of `root`.
    pub fn labels(&self, root: &Path) -> Vec<LabelItem> {
        let aux = self.aux.get(&normalize(root));
        let mut out = Vec::new();
        for doc in self.project_documents(root) {
            for l in &doc.index.labels {
                out.push(LabelItem {
                    name: l.name.clone(),
                    kind: l.kind.clone(),
                    context: l.context.clone(),
                    resolved: aux.and_then(|a| a.labels.get(&l.name).cloned()),
                    location: Location {
                        file: doc.path.clone(),
                        range: doc.range(&l.span),
                    },
                });
            }
        }
        out
    }

    /// `.bib` files used by the project of `root` (or all of them).
    pub fn bib_files(&self, root: &Path) -> Vec<PathBuf> {
        let root = normalize(root);
        let mut files = Vec::new();
        for doc in self.project_documents(&root) {
            for inc in &doc.index.includes {
                if matches!(
                    inc.kind,
                    IncludeKind::Bibliography | IncludeKind::BibResource
                ) && let Some(p) = self.resolve_include(&root, &doc.path, inc)
                    && !files.contains(&p)
                {
                    files.push(p);
                }
            }
        }
        if files.is_empty() {
            files = self
                .docs
                .values()
                .filter(|d| d.kind == DocKind::Bib)
                .map(|d| d.path.clone())
                .collect();
            files.sort();
        }
        files
    }

    /// Bibliography entries of the project, plus manual `\bibitem`s.
    pub fn citations(&self, root: &Path) -> Vec<CitationItem> {
        let mut out = Vec::new();
        for file in self.bib_files(root) {
            let Some(doc) = self.docs.get(&file) else {
                continue;
            };
            let Some(db) = &doc.bib else { continue };
            for e in &db.entries {
                out.push(CitationItem {
                    summary: e.summary(),
                    location: Location {
                        file: file.clone(),
                        range: doc.range(&e.key_span),
                    },
                });
            }
        }
        for doc in self.project_documents(root) {
            for item in &doc.index.bibitems {
                out.push(CitationItem {
                    summary: bib::BibSummary {
                        key: item.name.clone(),
                        kind: "bibitem".into(),
                        authors: String::new(),
                        year: String::new(),
                        title: String::new(),
                        venue: String::new(),
                    },
                    location: Location {
                        file: doc.path.clone(),
                        range: doc.range(&item.span),
                    },
                });
            }
        }
        out
    }

    /// User-defined commands of the project: name → (definition, location).
    pub fn command_definitions(&self, root: &Path) -> Vec<(&syntax::CommandDef, Location)> {
        let mut out = Vec::new();
        for doc in self.project_documents(root) {
            for def in &doc.index.command_defs {
                out.push((
                    def,
                    Location {
                        file: doc.path.clone(),
                        range: doc.range(&def.span),
                    },
                ));
            }
        }
        out
    }

    /// User-defined environments of the project.
    pub fn environment_definitions(&self, root: &Path) -> Vec<(&syntax::EnvironmentDef, Location)> {
        let mut out = Vec::new();
        for doc in self.project_documents(root) {
            for def in &doc.index.environment_defs {
                out.push((
                    def,
                    Location {
                        file: doc.path.clone(),
                        range: doc.range(&def.span),
                    },
                ));
            }
        }
        out
    }

    /// Usage counts of commands and environments across the project.
    pub fn usage(&self, root: &Path) -> (HashMap<String, u32>, HashMap<String, u32>) {
        let mut cmds: HashMap<String, u32> = HashMap::new();
        let mut envs: HashMap<String, u32> = HashMap::new();
        for doc in self.project_documents(root) {
            for (k, v) in &doc.index.command_usage {
                *cmds.entry(k.clone()).or_default() += v;
            }
            for (k, v) in &doc.index.environment_usage {
                *envs.entry(k.clone()).or_default() += v;
            }
        }
        (cmds, envs)
    }

    /// Where `key` is labelled.
    pub fn find_label(&self, root: &Path, key: &str) -> Vec<Location> {
        self.labels(root)
            .into_iter()
            .filter(|l| l.name == key)
            .map(|l| l.location)
            .collect()
    }

    /// Every use of a label key (`\ref`…) or citation key in the project.
    pub fn key_uses(&self, root: &Path, key: &str, citation: bool) -> Vec<Location> {
        let mut out = Vec::new();
        for doc in self.project_documents(root) {
            let list = if citation {
                &doc.index.citations
            } else {
                &doc.index.references
            };
            for k in list.iter().filter(|k| k.name == key) {
                out.push(Location {
                    file: doc.path.clone(),
                    range: doc.range(&k.span),
                });
            }
        }
        out
    }

    /// Text search across the project's text files.
    pub fn search(
        &self,
        query: &str,
        regex: bool,
        case_sensitive: bool,
        max: usize,
    ) -> Result<Vec<SearchMatch>, String> {
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let pattern = if regex {
            query.to_owned()
        } else {
            regex::escape(query)
        };
        let re = regex::RegexBuilder::new(&pattern)
            .case_insensitive(!case_sensitive)
            .multi_line(true)
            .build()
            .map_err(|e| e.to_string())?;
        let mut docs: Vec<&Document> = self.docs.values().collect();
        docs.sort_by(|a, b| a.path.cmp(&b.path));
        let mut out = Vec::new();
        for doc in docs {
            for m in re.find_iter(&doc.text) {
                let line = doc.lines.line_of(m.start());
                let span = doc.lines.line_span(&doc.text, line);
                out.push(SearchMatch {
                    location: Location {
                        file: doc.path.clone(),
                        range: doc.range(&(m.start()..m.end())),
                    },
                    line_text: crate::text::ellipsize(doc.text[span].trim_end(), 300),
                });
                if out.len() >= max {
                    return Ok(out);
                }
            }
        }
        Ok(out)
    }
}

/// Numbers headings with the table of contents of the last build: the
/// n-th numbered `\section` gets the n-th section number of the TOC (exact
/// even with `\appendix`, custom counters or classes).
fn number_from_toc(items: &mut [OutlineItem], toc: &[crate::aux::TocEntry]) {
    let mut next: HashMap<&str, usize> = HashMap::new();
    for item in items.iter_mut() {
        if item.starred {
            continue;
        }
        let Some(kind) = item.kind.toc_name() else {
            continue;
        };
        let start = next.entry(kind).or_insert(0);
        if let Some(pos) = toc[*start..].iter().position(|e| e.kind == kind) {
            item.number = Some(toc[*start + pos].number.clone());
            *start += pos + 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (tempfile::TempDir, Workspace) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        std::fs::create_dir_all(p.join("chapters")).unwrap();
        std::fs::create_dir_all(p.join("build")).unwrap();
        std::fs::write(
            p.join("main.tex"),
            "\\documentclass{report}\n\\usepackage{amsmath}\n\\usepackage{mymacros}\n\\addbibresource{refs.bib}\n\\begin{document}\n\\chapter{Intro}\\label{ch:intro}\n\\input{chapters/one}\n\\section{End}\n\\end{document}\n",
        )
        .unwrap();
        std::fs::write(p.join("chapters/one.tex"), "\\section{First}\\label{sec:first}\nSee \\ref{ch:intro}.\n\\begin{figure}\\caption{Cap}\\label{fig:a}\\end{figure}\n").unwrap();
        std::fs::write(
            p.join("mymacros.sty"),
            "\\newcommand{\\R}{\\mathbb{R}}\n\\def\\my@internal{}\n",
        )
        .unwrap();
        std::fs::write(
            p.join("refs.bib"),
            "@book{knuth, author={Knuth, Donald}, title={The TeXbook}, year=1984}\n",
        )
        .unwrap();
        std::fs::write(
            p.join("build/ignored.tex"),
            "\\documentclass{article}\\begin{document}\\end{document}",
        )
        .unwrap();
        std::fs::write(
            p.join("standalone.tex"),
            "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n",
        )
        .unwrap();
        let ws = Workspace::open(p);
        (dir, ws)
    }

    #[test]
    fn indexes_and_resolves_roots() {
        let (dir, ws) = project();
        let p = normalize(dir.path());
        assert!(ws.document(&p.join("build/ignored.tex")).is_none());
        assert_eq!(ws.root_candidates()[0], p.join("main.tex"));
        assert_eq!(ws.root_for(&p.join("chapters/one.tex")), p.join("main.tex"));
        assert_eq!(
            ws.root_for(&p.join("standalone.tex")),
            p.join("standalone.tex")
        );
        let files = ws.included_files(&p.join("main.tex"));
        assert_eq!(
            files,
            [
                p.join("main.tex"),
                p.join("chapters/one.tex"),
                p.join("mymacros.sty")
            ]
        );
    }

    #[test]
    fn project_queries() {
        let (dir, ws) = project();
        let root = normalize(dir.path()).join("main.tex");
        let titles: Vec<_> = ws
            .outline(&root)
            .into_iter()
            .map(|o| (o.level, o.title))
            .collect();
        assert_eq!(
            titles,
            [
                (1, "Intro".to_string()),
                (2, "First".to_string()),
                (2, "End".to_string())
            ]
        );
        let labels: Vec<_> = ws.labels(&root).into_iter().map(|l| l.name).collect();
        assert_eq!(labels, ["ch:intro", "sec:first", "fig:a"]);
        let cites = ws.citations(&root);
        assert_eq!(cites[0].summary.authors, "Knuth");
        let defs: Vec<_> = ws
            .command_definitions(&root)
            .into_iter()
            .map(|(d, _)| d.name.clone())
            .collect();
        assert_eq!(defs, ["R", "my@internal"]);
        let (class, pkgs) = ws.loaded_packages(&root);
        assert_eq!(class.as_deref(), Some("report"));
        assert_eq!(pkgs, ["amsmath", "mymacros"]);
        let found = ws.search("\\ref{", false, true, 10).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(ws.key_uses(&root, "ch:intro", false).len(), 1);
    }

    #[test]
    fn editor_versions_win() {
        let (dir, mut ws) = project();
        let f = normalize(dir.path()).join("standalone.tex");
        assert!(ws.update(&f, "\\section{Live}".into(), 5));
        assert!(!ws.update(&f, "old".into(), 3));
        assert_eq!(ws.document(&f).unwrap().index.sections[0].title, "Live");
        ws.load_from_disk(&f);
        assert_eq!(
            ws.document(&f).unwrap().version,
            5,
            "open documents are not overwritten by disk"
        );
    }
}
