//! One file of a document compiled on its own.
//!
//! In a document of several files, the file being written can be compiled
//! alone, with the preamble of the document: a chapter builds in a fraction
//! of the time of the whole thesis. It keeps what it is in the document:
//! the numbers of its chapter, sections, figures, equations and pages, and
//! its references to the other files.
//!
//! * A **record** compiles the whole document once, in a folder of its
//!   own, with LaTeX noting at the start of each file the value of every
//!   counter (the file hooks of LaTeX, 2020 and later). Its auxiliary files
//!   give the labels and the citations of the whole.
//! * The file is then compiled from a small document: the preamble as it is
//!   written (its precompiled format applies), the labels of the whole, the
//!   commands defined in the other files, the counters as they were where
//!   it starts, and the file.
//!
//! The record is made again when a file other than the one shown (and
//! those it includes) changed, or the engine. The whole document keeps its
//! own PDF and auxiliary files: nothing of them is touched.

use std::collections::{BTreeMap, HashSet};
use std::ops::Range;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::BuildPlan;
use crate::syntax::{Include, IncludeKind};
use crate::workspace::Workspace;

/// Folder of these builds, in the output folder of the document (hidden:
/// the files of a project and its exports leave it out).
pub const FOLDER: &str = ".raytex-only";

/// What the record says, next to the builds.
const RECORD: &str = ".raytex-record.json";

/// What makes a build show one file of its document.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlyFile {
    /// The file shown.
    pub file: PathBuf,
    /// This build is the record of the whole document, made for that file.
    pub record: bool,
    /// Output folder of the whole document (its precompiled preambles serve here too).
    #[serde(skip)]
    pub whole_out_dir: PathBuf,
    /// The document the engine is given, written in the folder of the build.
    #[serde(skip)]
    pub source: PathBuf,
}

/// The plan of a build of `file` alone (`record`: of the record made for
/// it), from the plan of the whole document.
pub fn plan(whole: &BuildPlan, file: &Path, record: bool) -> BuildPlan {
    let out_dir = whole.out_dir.join(FOLDER);
    let mut p = whole.clone();
    p.pdf = out_dir.join(format!("{}.pdf", whole.job));
    p.log = out_dir.join(format!("{}.log", whole.job));
    p.synctex = out_dir.join(format!("{}.synctex.gz", whole.job));
    // Named after the job: `\jobname` is the same as for the whole.
    p.only = Some(OnlyFile {
        file: file.to_path_buf(),
        record,
        whole_out_dir: whole.out_dir.clone(),
        source: out_dir.join(format!("{}.tex", whole.job)),
    });
    p.out_dir = out_dir;
    p
}

/// How the shown file comes into the document.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Brought {
    /// `\input` or `\include`: read with `\input`.
    Input,
    /// `\subfile` (a document of its own, its preamble skipped).
    Subfile,
}

/// Where `\begin{document}` is written in `text` (bytes), a comment left aside.
pub fn begin_document(text: &str) -> Option<Range<usize>> {
    const BEGIN: &str = "\\begin{document}";
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        let bytes = line.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b'\\' if line[i..].starts_with(BEGIN) => {
                    return Some(offset + i..offset + i + BEGIN.len());
                }
                b'\\' => i += 2,
                b'%' => break,
                _ => i += 1,
            }
        }
        offset += line.len();
    }
    None
}

/// Written right after `\begin{document}`, on its line (the lines of the
/// document keep their numbers): at the start of each file read, the value
/// of every counter goes to the auxiliary file. Without the file hooks of
/// LaTeX (before 2020), nothing is noted and the file is shown without them.
///
/// * No name needs `@` to be a letter: with a precompiled preamble, the
///   rest of the line of `\begin{document}` is read before anything on it
///   runs, so `\makeatletter` there would come too late.
/// * The escape character is said: LaTeX reads the files of fonts in the
///   middle of a paragraph with none, and `\RTXckpt` would be written
///   `RTXckpt`, text before `\begin{document}` at the next pass.
const RECORD_HOOK: &str = "\\immediate\\write\\csname @mainaux\\endcsname{\\string\\providecommand\\string\\RTXckpt[2]{}}\
\\ifdefined\\AddToHook\
\\gdef\\RTXrecord{{\\expandafter\\def\\csname @elt\\endcsname##1{##1=\\the\\csname c@##1\\endcsname,}\
\\xdef\\RTXcounters{\\csname cl@@ckpt\\endcsname}}\
{\\escapechar=92 \\immediate\\write\\csname @mainaux\\endcsname{\\string\\RTXckpt{\\CurrentFilePath/\\CurrentFile}{\\RTXcounters}}}}\
\\AddToHook{file/before}{\\RTXrecord}\
\\fi ";

/// The document of a record: the document itself, LaTeX noting where each
/// of its files starts.
pub fn record_source(root_text: &str) -> Option<String> {
    let at = begin_document(root_text)?;
    Some(format!(
        "{}{RECORD_HOOK}{}",
        &root_text[..at.end],
        &root_text[at.end..]
    ))
}

/// Number of the line of `\begin{document}` (one-based): a problem the
/// engine finds above it, in the document given to it, is in the preamble
/// of the root, at the same line.
pub fn preamble_lines(root_text: &str) -> Option<u32> {
    let at = begin_document(root_text)?;
    Some(root_text[..at.start].matches('\n').count() as u32 + 1)
}

/// What a file needs from the rest of the document.
#[derive(Debug, Default)]
pub struct Context<'a> {
    /// The file, from the folder of the root, with `/`.
    pub file: &'a str,
    /// How it comes in.
    pub brought: Option<Brought>,
    /// What the record knows.
    pub record: Option<&'a Record>,
    /// `\appendix`, `\mainmatter`… met before the file: they change how
    /// its numbers are written.
    pub matter: Vec<String>,
    /// Commands defined in the other files (with their guards).
    pub definitions: &'a str,
    /// The bibliography is made by Biber: the citations of the whole are
    /// asked for again, so that the numbers stay those of the whole.
    pub biblatex: bool,
}

/// The document that shows one file: the preamble as it is written, then
/// what the rest of the document gives it, then the file.
pub fn only_source(root_text: &str, cx: &Context<'_>) -> Option<String> {
    let at = begin_document(root_text)?;
    let mut out = String::with_capacity(at.end + 4096);
    out.push_str(&root_text[..at.end]);
    out.push_str("%\n\\chardef\\RTXatcat=\\catcode`\\@\\relax\\makeatletter\n");
    out.push_str("\\def\\RTX@label#1#2{\\@ifundefined{r@#1}{\\global\\@namedef{r@#1}{#2}}{}}%\n");
    out.push_str("\\def\\RTX@cite#1#2{\\@ifundefined{b@#1}{\\global\\@namedef{b@#1}{#2}}{}}%\n");
    out.push_str(
        "\\def\\RTX@set#1#2{\\@ifundefined{c@#1}{}{\\global\\csname c@#1\\endcsname=#2\\relax}}%\n",
    );
    // Read as an auxiliary file is: the shorthands of a language (`:` in
    // French) are not active in the names of the labels.
    out.push_str(
        "\\begingroup\\catcode`\\:=12 \\catcode`\\;=12 \\catcode`\\!=12 \\catcode`\\?=12 \\catcode`\\\"=12 \\catcode`\\~=12 \\relax\n",
    );
    if let Some(record) = cx.record {
        for (name, value) in &record.labels {
            out.push_str(&format!("\\RTX@label{{{name}}}{{{value}}}\n"));
        }
        for (key, value) in &record.cites {
            out.push_str(&format!("\\RTX@cite{{{key}}}{{{value}}}\n"));
        }
        if cx.biblatex && !record.citations.is_empty() {
            out.push_str(&format!("\\nocite{{{}}}\n", record.citations.join(",")));
        }
    }
    out.push_str("\\endgroup\n");
    for command in &cx.matter {
        out.push_str(command);
        out.push('\n');
    }
    if let Some(counters) = cx.record.and_then(|r| r.counters_at(cx.file)) {
        for (name, value) in counters {
            out.push_str(&format!("\\RTX@set{{{name}}}{{{value}}}"));
        }
        out.push('\n');
    }
    out.push_str("\\catcode`\\@=\\RTXatcat\\relax\n");
    out.push_str(cx.definitions);
    let command = match cx.brought {
        Some(Brought::Subfile) => "subfile",
        _ => "input",
    };
    out.push_str(&format!("\\{command}{{{}}}\n\\end{{document}}\n", cx.file));
    Some(out)
}

/// The commands met in `text` that change how numbers are written in what
/// follows (`\appendix`, `\mainmatter`, `\pagenumbering{roman}`…), in order.
pub fn matter_commands(text: &str) -> Vec<String> {
    const COMMANDS: &[&str] = &["frontmatter", "mainmatter", "backmatter", "appendix"];
    let mut out = Vec::new();
    for line in text.lines() {
        let code = strip_comment(line);
        let mut rest = code;
        while let Some(i) = rest.find('\\') {
            rest = &rest[i + 1..];
            let name: String = rest.chars().take_while(char::is_ascii_alphabetic).collect();
            if COMMANDS.contains(&name.as_str()) {
                out.push(format!("\\{name}"));
            } else if name == "pagenumbering"
                && let Some((arg, _)) = group(&rest[name.len()..], 0)
            {
                out.push(format!("\\pagenumbering{{{arg}}}"));
            }
        }
    }
    out
}

fn strip_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'%' => return &line[..i],
            _ => i += 1,
        }
    }
    line
}

/// What the record of a document knows.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct Record {
    /// Engine of the record.
    pub engine: String,
    /// Each file of the document (from the folder of the root, with `/`)
    /// and the hash of its text, as recorded.
    pub files: BTreeMap<String, u64>,
    /// The counters at the start of each file read.
    pub counters: BTreeMap<String, Vec<(String, i64)>>,
    /// Labels of the whole document: name, value.
    pub labels: Vec<(String, String)>,
    /// Citations of a bibliography made by BibTeX: key, value.
    pub cites: Vec<(String, String)>,
    /// Keys cited, in the order of the document.
    pub citations: Vec<String>,
}

impl Record {
    /// The record kept in the folder of these builds.
    pub fn load(out_dir: &Path) -> Option<Record> {
        let text = std::fs::read_to_string(out_dir.join(RECORD)).ok()?;
        serde_json::from_str(&text).ok()
    }

    /// Keeps the record for the next builds.
    pub fn save(&self, out_dir: &Path) {
        if let Ok(text) = serde_json::to_string(self) {
            let _ = std::fs::write(out_dir.join(RECORD), text);
        }
    }

    /// Whether the record tells the truth for a file: the same engine and,
    /// but for that file and those it includes (`own`), the same files with
    /// the same text.
    pub fn serves(
        &self,
        engine: &str,
        files: &BTreeMap<String, u64>,
        own: &HashSet<String>,
    ) -> bool {
        self.engine == engine
            && files
                .iter()
                .filter(|(name, _)| !own.contains(*name))
                .all(|(name, hash)| self.files.get(name) == Some(hash))
            && self
                .files
                .keys()
                .all(|name| own.contains(name) || files.contains_key(name))
    }

    /// The counters at the start of `file`.
    pub fn counters_at(&self, file: &str) -> Option<&Vec<(String, i64)>> {
        self.counters.get(file)
    }

    /// What a record build left in `out_dir`: its auxiliary file and those
    /// of the `\include`d files.
    pub fn read(out_dir: &Path, job: &str, engine: &str, files: BTreeMap<String, u64>) -> Record {
        let mut record = Record {
            engine: engine.to_owned(),
            files,
            ..Record::default()
        };
        let mut seen = HashSet::new();
        record.read_aux(out_dir, &format!("{job}.aux"), &mut seen);
        record
    }

    fn read_aux(&mut self, out_dir: &Path, name: &str, seen: &mut HashSet<PathBuf>) {
        let path = crate::log::normalize(&out_dir.join(name));
        if seen.len() > 500 || !seen.insert(path.clone()) {
            return;
        }
        let Ok(bytes) = std::fs::read(&path) else {
            return;
        };
        let text = crate::text::decode_log(&bytes);
        let mut at = 0;
        while let Some(i) = text[at..].find('\\') {
            let start = at + i;
            let rest = &text[start + 1..];
            let name: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphabetic() || *c == '@')
                .collect();
            let after = start + 1 + name.len();
            at = after.max(start + 1);
            let args = |n: usize| -> Option<(Vec<String>, usize)> {
                let mut out = Vec::new();
                let mut pos = after;
                for _ in 0..n {
                    let (g, end) = group(&text, pos)?;
                    out.push(g);
                    pos = end;
                }
                Some((out, pos))
            };
            match name.as_str() {
                "newlabel" | "bibcite" => {
                    if let Some((a, end)) = args(2) {
                        if name == "newlabel" {
                            self.labels.push((a[0].clone(), a[1].clone()));
                        } else {
                            self.cites.push((a[0].clone(), a[1].clone()));
                        }
                        at = end;
                    }
                }
                "RTXckpt" => {
                    if let Some((a, end)) = args(2) {
                        let file = a[0].trim_start_matches('/').trim_start_matches("./");
                        let counters = a[1]
                            .split(',')
                            .filter_map(|kv| {
                                let (k, v) = kv.split_once('=')?;
                                Some((k.trim().to_owned(), v.trim().parse().ok()?))
                            })
                            .collect();
                        self.counters.entry(file.to_owned()).or_insert(counters);
                        at = end;
                    }
                }
                "abx@aux@cite" => {
                    // `\abx@aux@cite{key}`, or `{refsection}{key}` since biblatex 3.15.
                    if let Some((a, end)) = args(1) {
                        let (key, end) = match group(&text, end) {
                            Some((key, end2)) if text[end..].starts_with('{') => (key, end2),
                            _ => (a[0].clone(), end),
                        };
                        if !self.citations.contains(&key) {
                            self.citations.push(key);
                        }
                        at = end;
                    }
                }
                "@input" => {
                    if let Some((a, end)) = args(1) {
                        let file = a[0].clone();
                        self.read_aux(out_dir, &file, seen);
                        at = end;
                    }
                }
                _ => {}
            }
        }
    }
}

/// The group `{…}` that opens at `at` (spaces before it skipped): its
/// inside and where it ends.
fn group(text: &str, at: usize) -> Option<(String, usize)> {
    let bytes = text.as_bytes();
    let mut i = at;
    while i < bytes.len() && bytes[i] == b' ' {
        i += 1;
    }
    if bytes.get(i) != Some(&b'{') {
        return None;
    }
    let open = i;
    let mut depth = 0usize;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some((text[open + 1..i].to_owned(), i + 1));
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// What a build of one file needs to know of its document.
#[derive(Debug, Clone)]
pub struct Shown {
    /// The file.
    pub file: PathBuf,
    /// It, from the folder of the root, with `/`.
    pub name: String,
    /// How it comes in.
    pub brought: Brought,
    /// `\appendix`, `\mainmatter`… met before it.
    pub matter: Vec<String>,
    /// The commands defined in the other files.
    pub definitions: String,
    /// It and the files it brings in, from the folder of the root.
    pub own: HashSet<String>,
    /// Every file of the document and the hash of its text.
    pub files: BTreeMap<String, u64>,
}

/// How `file` would be shown on its own in the document of `root`; `None`
/// when it is the root, is not in the document, is read by the preamble,
/// or comes through `\import` (its paths are those of another folder).
pub fn shown(ws: &Workspace, root: &Path, file: &Path) -> Option<Shown> {
    let root = crate::log::normalize(root);
    let file = crate::log::normalize(file);
    let root_dir = root.parent()?;
    let (chain, brought) = part_of(ws, &root, &file)?;
    let body = begin_document(&ws.document(&root)?.text)?.end;
    let mut matter = Vec::new();
    for (parent, inc) in &chain {
        let text = &ws.document(parent)?.text;
        let from = if *parent == root { body } else { 0 };
        if let Some(before) = text.get(from..inc.span.start.max(from)) {
            matter.extend(matter_commands(before));
        }
    }
    let under = ws.files_under(&root, &file);
    let own = under.iter().filter_map(|p| relative(root_dir, p)).collect();
    let files = hashes(
        root_dir,
        ws.project_documents(&root)
            .into_iter()
            .map(|d| (&d.path, &d.text)),
    );
    Some(Shown {
        name: relative(root_dir, &file)?,
        brought,
        matter,
        definitions: crate::custom::definitions_outside(ws, &root, &under),
        own,
        files,
        file,
    })
}

/// Whether `file` is a part of the document of `root` that can be shown on
/// its own: the includes that bring it in, and how the last one does.
pub fn part_of(
    ws: &Workspace,
    root: &Path,
    file: &Path,
) -> Option<(Vec<(PathBuf, Include)>, Brought)> {
    let root = crate::log::normalize(root);
    let file = crate::log::normalize(file);
    if root == file {
        return None;
    }
    let chain = ws.inclusion_chain(&root, &file)?;
    let body = begin_document(&ws.document(&root)?.text)?.end;
    let (first_parent, first) = chain.first()?;
    let in_preamble = *first_parent == root && first.span.start < body;
    if in_preamble || chain.iter().any(|(_, inc)| inc.kind == IncludeKind::Import) {
        return None;
    }
    let brought = if chain.last()?.1.kind == IncludeKind::Subfile {
        Brought::Subfile
    } else {
        Brought::Input
    };
    Some((chain, brought))
}

/// The files of a document and the hash of their text, from the folder of
/// the root, with `/`.
pub fn hashes<'a>(
    root_dir: &Path,
    texts: impl IntoIterator<Item = (&'a PathBuf, &'a String)>,
) -> BTreeMap<String, u64> {
    texts
        .into_iter()
        .filter_map(|(path, text)| Some((relative(root_dir, path)?, super::hash_str(text))))
        .collect()
}

/// `path` from `root_dir`, with `/`.
pub fn relative(root_dir: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root_dir).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "\\documentclass{report}\n% \\begin{document} in a comment\n\\usepackage{hyperref}\n\\begin{document}\n\\tableofcontents\n\\input{chapters/a}\n\\appendix\n\\include{chapters/b}\n\\end{document}\n";

    #[test]
    fn the_document_starts_where_it_is_written() {
        let at = begin_document(ROOT).unwrap();
        assert_eq!(&ROOT[at.clone()], "\\begin{document}");
        assert_eq!(preamble_lines(ROOT), Some(4));
        assert!(begin_document("\\documentclass{article}\n\\% \\begin{document}").is_some());
        assert!(begin_document("% \\begin{document}\n").is_none());
    }

    #[test]
    fn a_record_keeps_the_lines_of_the_document() {
        let source = record_source(ROOT).unwrap();
        assert_eq!(source.lines().count(), ROOT.lines().count());
        assert!(source.contains("\\begin{document}\\immediate\\write"));
        assert!(source.contains("\\AddToHook{file/before}{\\RTXrecord}"));
        assert!(source.ends_with("\\include{chapters/b}\n\\end{document}\n"));
    }

    #[test]
    fn what_a_record_left_is_read_back() {
        let dir = std::env::temp_dir().join(format!("raytex-only-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("chapters")).unwrap();
        std::fs::write(
            dir.join("main.aux"),
            "\\relax \n\\providecommand\\RTXckpt[2]{}\n\\RTXckpt{chapters/a.tex}{page=2,chapter=0,}\n\\newlabel{sec:a}{{1.1}{2}{Un \\{titre\\}}{section.1.1}{}}\n\\abx@aux@cite{0}{doe}\n\\abx@aux@cite{roe}\n\\@input{chapters/b.aux}\n\\bibcite{doe}{1}\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("chapters/b.aux"),
            "\\relax \n\\RTXckpt{/chapters/b.tex}{page=5,chapter=1,}\n\\newlabel{chap:b}{{A}{5}}\n\\abx@aux@cite{0}{doe}\n",
        )
        .unwrap();
        let r = Record::read(&dir, "main", "pdflatex", BTreeMap::new());
        assert_eq!(
            r.labels,
            vec![
                (
                    "sec:a".to_owned(),
                    "{1.1}{2}{Un \\{titre\\}}{section.1.1}{}".to_owned()
                ),
                ("chap:b".to_owned(), "{A}{5}".to_owned()),
            ]
        );
        assert_eq!(r.cites, vec![("doe".to_owned(), "1".to_owned())]);
        assert_eq!(r.citations, vec!["doe", "roe"]);
        assert_eq!(
            r.counters_at("chapters/a.tex"),
            Some(&vec![("page".to_owned(), 2), ("chapter".to_owned(), 0)])
        );
        assert_eq!(r.counters_at("chapters/b.tex").map(|c| c[0].1), Some(5));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_record_serves_until_another_file_changes() {
        let files: BTreeMap<String, u64> = [("main.tex", 1), ("a.tex", 2), ("b.tex", 3)]
            .into_iter()
            .map(|(k, v)| (k.to_owned(), v))
            .collect();
        let record = Record {
            engine: "pdflatex".into(),
            files: files.clone(),
            ..Record::default()
        };
        let own: HashSet<String> = ["a.tex".to_owned()].into();
        let mut now = files.clone();
        now.insert("a.tex".into(), 20);
        assert!(
            record.serves("pdflatex", &now, &own),
            "the file shown changed: still good"
        );
        assert!(!record.serves("xelatex", &now, &own), "another engine");
        now.insert("b.tex".into(), 30);
        assert!(
            !record.serves("pdflatex", &now, &own),
            "another file changed"
        );
        let mut fewer = files.clone();
        fewer.remove("b.tex");
        assert!(
            !record.serves("pdflatex", &fewer, &own),
            "a file left the document"
        );
        let mut more = files;
        more.insert("c.tex".into(), 4);
        assert!(!record.serves("pdflatex", &more, &own), "a file came in");
    }

    /// A chapter compiled on its own is what it is in the document: its
    /// numbers, its pages, its references to the rest, the commands of the
    /// other files; with each engine, and with a precompiled preamble
    /// (`cargo test -p raytex-core --lib only -- --ignored --nocapture`).
    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn a_file_alone_is_what_it_is_in_the_document() {
        use crate::build::{BuildEvent, DocumentFacts, RunContext};
        use crate::i18n::Lang;
        use crate::settings::{BuildSettings, EngineChoice};
        use std::sync::atomic::AtomicBool;
        let Some(dist) = crate::tex::detect(&[]).into_iter().next() else {
            println!("no TeX distribution: nothing checked");
            return;
        };
        const MAIN: &str = "\\documentclass{report}\n\\usepackage{iftex}\n\\ifPDFTeX\\usepackage[T1]{fontenc}\\fi\n\\usepackage[french]{babel}\n\\usepackage{amsmath,amssymb}\n\\usepackage{hyperref}\n\\begin{document}\n\\tableofcontents\n\\input{chapitres/intro}\n\\include{chapitres/methode}\n\\appendix\n\\input{chapitres/annexe}\n\\end{document}\n";
        let files = [
            ("main.tex", MAIN),
            (
                "chapitres/intro.tex",
                "\\chapter{Introduction}\\label{chap:intro}\n\\newcommand{\\R}{\\mathbb{R}}\nTexte.\n\\section{Un}\\label{sec:un}\n\\begin{equation}a=b\\label{eq:un}\\end{equation}\n\\clearpage\nSuite.\n\\clearpage\nFin.\n",
            ),
            (
                "chapitres/methode.tex",
                "\\chapter{Méthode}\\label{chap:methode}\nVoir la section~\\ref{sec:un}, l'équation~\\eqref{eq:un}, $x \\in \\R$ et l'annexe page~\\pageref{chap:annexe}.\n\\section{Deux}\\label{sec:deux}\n\\begin{equation}c=d\\label{eq:deux}\\end{equation}\n",
            ),
            (
                "chapitres/annexe.tex",
                "\\chapter{Données}\\label{chap:annexe}\nVoir la section~\\ref{sec:deux}.\n\\section{Tableau}\\label{sec:tableau}\n",
            ),
        ];
        for (engine, format) in [
            (EngineChoice::Pdflatex, false),
            (EngineChoice::Pdflatex, true),
            (EngineChoice::Xelatex, false),
            (EngineChoice::Lualatex, false),
        ] {
            let dir = tempfile::tempdir().unwrap();
            let root_dir = crate::log::normalize(&dunce::canonicalize(dir.path()).unwrap());
            for (name, text) in files {
                let path = root_dir.join(name);
                std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                std::fs::write(path, text).unwrap();
            }
            let ws = Workspace::open(&root_dir);
            let root = root_dir.join("main.tex");
            let settings = BuildSettings {
                engine,
                out_dir: "build".to_owned(),
                precompile_preamble: format,
                ..BuildSettings::default()
            };
            let whole = super::super::plan(
                &root,
                &settings,
                Some(&dist),
                &DocumentFacts::default(),
                Lang::En,
            )
            .unwrap();
            let cancel = AtomicBool::new(false);
            let source = |p: &Path| std::fs::read_to_string(p).ok();
            let cx = |background: bool| RunContext {
                dist: &dist,
                settings: &settings,
                cancel: &cancel,
                lang: Lang::En,
                source: &source,
                packages: None,
                background,
                live: false,
            };
            if format {
                // A whole build, after which the format of its preamble is made.
                assert!(super::super::run(&whole, &cx(true), &mut |_: BuildEvent| {}).success);
                // Ready: written under a temporary name first, then renamed.
                let preamble = crate::build::preamble::preamble_of(MAIN).unwrap();
                let key = crate::build::preamble::key(&whole, &settings, &dist, &preamble);
                let made = (0..240).any(|_| {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    crate::build::preamble::ready(&whole, key).is_some()
                });
                assert!(made, "the format of the preamble was made");
            }
            for (name, chapter) in [
                ("chapitres/methode.tex", "2"),
                ("chapitres/annexe.tex", "A"),
            ] {
                let file = root_dir.join(name);
                let shown = shown(&ws, &root, &file).expect("a part of the document");
                assert_eq!(shown.name, name);
                // The record.
                let record_plan = plan(&whole, &file, true);
                std::fs::create_dir_all(&record_plan.out_dir).unwrap();
                std::fs::write(
                    &record_plan.only.as_ref().unwrap().source,
                    record_source(MAIN).unwrap(),
                )
                .unwrap();
                let r = super::super::run(&record_plan, &cx(false), &mut |_: BuildEvent| {});
                // Every pass went through, with the precompiled preamble when there is one.
                assert!(
                    r.steps.iter().all(|s| s.exit_code == Some(0)),
                    "{engine:?} format {format}: {:?}",
                    r.steps
                );
                if format {
                    let log = std::fs::read_to_string(&record_plan.log).unwrap_or_default();
                    assert!(
                        log.lines()
                            .next()
                            .unwrap_or_default()
                            .contains("preloaded format=main-"),
                        "{}",
                        log.lines().next().unwrap_or_default()
                    );
                }
                assert!(r.success, "{engine:?}: record {:?}", r.diagnostics);
                let record = Record::read(&record_plan.out_dir, "main", "x", shown.files.clone());
                let counters = record.counters_at(name).unwrap_or_else(|| {
                    panic!(
                        "{engine:?}: counters at {name}: {:?}",
                        record.counters.keys()
                    )
                });
                assert!(counters.iter().any(|(c, _)| c == "page"));
                // The file alone.
                let only_plan = plan(&whole, &file, false);
                let text = only_source(
                    MAIN,
                    &Context {
                        file: &shown.name,
                        brought: Some(shown.brought),
                        record: Some(&record),
                        matter: shown.matter.clone(),
                        definitions: &shown.definitions,
                        biblatex: false,
                    },
                )
                .unwrap();
                std::fs::write(&only_plan.only.as_ref().unwrap().source, &text).unwrap();
                let o = super::super::run(&only_plan, &cx(false), &mut |_: BuildEvent| {});
                // Errors, and what the rest of the document was to give (the
                // notices of a package about itself are not this test's).
                let problems: Vec<_> = o
                    .diagnostics
                    .iter()
                    .filter(|d| {
                        d.severity == crate::diagnostics::Severity::Error
                            || ["undefined", "Undefined", "may have changed", "multiply"]
                                .iter()
                                .any(|w| d.message.contains(w))
                    })
                    .map(|d| (d.file.clone(), d.line, d.message.clone()))
                    .collect();
                assert!(
                    o.success && problems.is_empty(),
                    "{engine:?} {name}: {problems:?}\n{text}"
                );
                let aux = std::fs::read_to_string(only_plan.out_dir.join("main.aux")).unwrap();
                let label = if chapter == "2" {
                    "chap:methode"
                } else {
                    "chap:annexe"
                };
                let numbered = format!("\\newlabel{{{label}}}{{{{{chapter}}}");
                assert!(
                    aux.contains(&numbered),
                    "{engine:?} {name}: {numbered} in\n{aux}"
                );
                // On the page it has in the document.
                let in_whole = &record.labels.iter().find(|(l, _)| l == label).unwrap().1;
                let number_and_page: String = in_whole
                    .splitn(3, '}')
                    .take(2)
                    .collect::<Vec<_>>()
                    .join("}");
                assert!(
                    aux.contains(&format!("\\newlabel{{{label}}}{{{number_and_page}}}")),
                    "{engine:?} {name}: {in_whole} in\n{aux}"
                );
                let log = std::fs::read_to_string(&only_plan.log).unwrap_or_default();
                if format {
                    assert!(
                        log.lines()
                            .next()
                            .unwrap_or_default()
                            .contains("preloaded format=main-"),
                        "{}",
                        log.lines().next().unwrap_or_default()
                    );
                }
                let whole_pages = r.pages.unwrap_or(0);
                println!(
                    "{engine:?} format {format}: {name} alone, {:?} of {whole_pages} pages, record {} ms, alone {} ms",
                    o.pages, r.duration_ms, o.duration_ms
                );
                assert!(o.pages.unwrap_or(0) < whole_pages);
            }
            // The whole document was not touched.
            assert!(!whole.pdf.exists() || format);
        }
    }

    /// With Biber, a chapter alone cites with the numbers of the whole
    /// document: the citations of the whole are asked for again, first.
    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn citations_keep_their_numbers_alone() {
        use crate::build::{BuildEvent, DocumentFacts, RunContext};
        use crate::i18n::Lang;
        use crate::settings::BuildSettings;
        use std::sync::atomic::AtomicBool;
        let Some(dist) = crate::tex::detect(&[]).into_iter().next() else {
            println!("no TeX distribution: nothing checked");
            return;
        };
        let Some(gs) = ["/opt/homebrew/bin/gs", "/usr/local/bin/gs", "/usr/bin/gs"]
            .into_iter()
            .find(|p| Path::new(p).exists())
        else {
            println!("no Ghostscript to read the PDF: nothing checked");
            return;
        };
        const MAIN: &str = "\\documentclass{report}\n\\usepackage[backend=biber,style=numeric,sorting=none]{biblatex}\n\\addbibresource{refs.bib}\n\\begin{document}\n\\input{un}\n\\input{deux}\n\\printbibliography\n\\end{document}\n";
        let dir = tempfile::tempdir().unwrap();
        let root_dir = crate::log::normalize(&dunce::canonicalize(dir.path()).unwrap());
        for (name, text) in [
            ("main.tex", MAIN),
            ("un.tex", "\\chapter{Un}\nVoir \\cite{alpha}.\n"),
            (
                "deux.tex",
                "\\chapter{Deux}\nVoir \\cite{beta} et \\cite{alpha}.\n",
            ),
            (
                "refs.bib",
                "@book{alpha, author={Alpha, A.}, title={Premier}, year={2001}}\n@book{beta, author={Beta, B.}, title={Second}, year={2002}}\n",
            ),
        ] {
            std::fs::write(root_dir.join(name), text).unwrap();
        }
        let ws = Workspace::open(&root_dir);
        let root = root_dir.join("main.tex");
        let file = root_dir.join("deux.tex");
        let settings = BuildSettings {
            out_dir: "build".to_owned(),
            precompile_preamble: false,
            ..BuildSettings::default()
        };
        let mut facts = DocumentFacts::default();
        facts.packages.push("biblatex".into());
        let whole = super::super::plan(&root, &settings, Some(&dist), &facts, Lang::En).unwrap();
        let cancel = AtomicBool::new(false);
        let source = |p: &Path| std::fs::read_to_string(p).ok();
        let cx = RunContext {
            dist: &dist,
            settings: &settings,
            cancel: &cancel,
            lang: Lang::En,
            source: &source,
            packages: None,
            background: false,
            live: false,
        };
        let shown = shown(&ws, &root, &file).unwrap();
        let record_plan = plan(&whole, &file, true);
        std::fs::create_dir_all(&record_plan.out_dir).unwrap();
        std::fs::write(
            &record_plan.only.as_ref().unwrap().source,
            record_source(MAIN).unwrap(),
        )
        .unwrap();
        assert!(super::super::run(&record_plan, &cx, &mut |_: BuildEvent| {}).success);
        let record = Record::read(&record_plan.out_dir, "main", "x", shown.files.clone());
        assert_eq!(record.citations, vec!["alpha", "beta"]);
        let only_plan = plan(&whole, &file, false);
        let text = only_source(
            MAIN,
            &Context {
                file: &shown.name,
                brought: Some(shown.brought),
                record: Some(&record),
                matter: shown.matter.clone(),
                definitions: &shown.definitions,
                biblatex: true,
            },
        )
        .unwrap();
        std::fs::write(&only_plan.only.as_ref().unwrap().source, &text).unwrap();
        let o = super::super::run(&only_plan, &cx, &mut |_: BuildEvent| {});
        assert!(o.success, "{:?}", o.diagnostics);
        let out = std::process::Command::new(gs)
            .args([
                "-q",
                "-dNOPAUSE",
                "-dBATCH",
                "-sDEVICE=txtwrite",
                "-sOutputFile=-",
            ])
            .arg(&only_plan.pdf)
            .output()
            .unwrap();
        let words = String::from_utf8_lossy(&out.stdout)
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        assert!(words.contains("Voir [2] et [1]"), "{words}");
    }

    #[test]
    fn a_file_is_shown_with_what_the_document_gives_it() {
        let record = Record {
            engine: "pdflatex".into(),
            counters: [(
                "chapters/b.tex".to_owned(),
                vec![("page".to_owned(), 5), ("chapter".to_owned(), 1)],
            )]
            .into(),
            labels: vec![("sec:a".into(), "{1.1}{2}".into())],
            cites: vec![("doe".into(), "1".into())],
            citations: vec!["doe".into(), "roe".into()],
            ..Record::default()
        };
        let cx = Context {
            file: "chapters/b.tex",
            brought: Some(Brought::Input),
            record: Some(&record),
            matter: matter_commands(
                "\\input{chapters/a}\n\\appendix % annexes\n% \\mainmatter\n\\pagenumbering{roman}",
            ),
            definitions: "",
            biblatex: true,
        };
        let source = only_source(ROOT, &cx).unwrap();
        assert!(source.starts_with("\\documentclass{report}\n% \\begin{document} in a comment\n\\usepackage{hyperref}\n\\begin{document}%\n"));
        assert!(source.contains("\\RTX@label{sec:a}{{1.1}{2}}\n"));
        assert!(source.contains("\\RTX@cite{doe}{1}\n"));
        assert!(source.contains("\\nocite{doe,roe}\n"));
        assert!(source.contains(
            "\\appendix\n\\pagenumbering{roman}\n\\RTX@set{page}{5}\\RTX@set{chapter}{1}\n"
        ));
        assert!(source.ends_with("\\input{chapters/b.tex}\n\\end{document}\n"));
        assert!(
            !source.contains("\\tableofcontents"),
            "nothing else of the document"
        );
        let subfile = only_source(
            ROOT,
            &Context {
                brought: Some(Brought::Subfile),
                ..cx
            },
        )
        .unwrap();
        assert!(subfile.ends_with("\\subfile{chapters/b.tex}\n\\end{document}\n"));
    }
}
