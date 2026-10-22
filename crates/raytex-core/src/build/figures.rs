//! TikZ pictures already drawn, put back as they were drawn.
//!
//! A pgfplots figure takes a large part of a pass (0.4 s of 0.9 s for two
//! curves of 400 points), and it is drawn again at each pass, whatever was
//! typed. After a build, a pass of its own, in the background, draws each
//! new picture on a page of its own (`.raytex-figures/f-….pdf`); the next
//! passes put that page in place of the picture (0.92 s → 0.54 s for that
//! document). The page is the picture itself: same pixels, with
//! pdfLaTeX, LuaLaTeX and XeLaTeX.
//!
//! * The pass of drawings is the document itself, not the picture alone:
//!   macros, styles, fonts and colours are those of the document. It gives
//!   way to the next build.
//! * A picture is put back when it is the same text at the same place of
//!   the same file, and the document defines nothing new for it: the key of
//!   its drawing holds its text, the files it names, the preamble and its
//!   files, the definitions of the text (`\newcommand`, `\tikzset`…), the
//!   engine. TeX checks the rest where the picture stands (width, font,
//!   colour, language) and that the picture read ends on the line written
//!   down; anything else is drawn as usual.
//! * Pictures that depend on the page or on the rest of the document are
//!   always drawn: references, citations, counters, `remember picture`,
//!   `overlay`, random numbers, links; Beamer, `standalone` and documents
//!   that keep their pictures with the `external` library too.
//! * An export draws everything (see [`in_pdf`]).

use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::process;
use crate::settings::{BuildSettings, BuildTool};
use crate::tex::{Distribution, DistroKind, Engine};

use super::{BuildPlan, only, preamble};

/// Folder of the drawings, in the output folder.
pub const FOLDER: &str = ".raytex-figures";

/// The TeX side: the hook of `tikzpicture`, the pass of drawings.
const CODE: &str = include_str!("../../data/tex/raytex-figures.tex");

/// Written while the PDF holds pictures put back (an export draws them).
const IN_PDF: &str = "in-pdf";

/// Written when the map stopped a pass (with the hash of [`CODE`]): the
/// pictures of that output folder are drawn as usual.
const BROKEN: &str = "broken";

/// A drawing not put back for so many builds is let go.
const KEPT_FOR: u64 = 200;

/// A picture the pass of drawings did not meet is tried again after so many builds.
const ABSENT_FOR: u64 = 50;

fn folder(plan: &BuildPlan) -> PathBuf {
    plan.out_dir.join(FOLDER)
}

/// Whether the PDF of the output folder `out_dir` holds pictures put back
/// from their drawings (an export then builds the document again, every
/// picture drawn).
pub fn in_pdf(out_dir: &Path) -> bool {
    out_dir.join(FOLDER).join(IN_PDF).exists()
}

/// Whether the builds of `plan` put back the pictures they drew: the
/// setting on, the whole document, an engine that writes a PDF, a
/// preamble that loads TikZ and keeps nothing apart.
pub fn applies(
    plan: &BuildPlan,
    settings: &BuildSettings,
    dist: &Distribution,
    root_text: &str,
) -> bool {
    settings.figure_cache
        && plan.only.is_none()
        && matches!(
            plan.engine,
            Engine::Pdflatex | Engine::Xelatex | Engine::Lualatex
        )
        && matches!(
            plan.tool,
            BuildTool::Auto | BuildTool::Single | BuildTool::Latexmk
        )
        && dist.kind != DistroKind::Tectonic
        && preamble::preamble_of(root_text).is_some_and(|p| suits(&p))
}

/// A preamble whose pictures can be put back.
fn suits(preamble: &str) -> bool {
    static CLASS: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\\documentclass\s*(?:\[[^\]]*\])?\s*\{\s*(beamer|standalone)\s*\}").unwrap()
    });
    let code = without_comments(preamble);
    (code.contains("tikz") || code.contains("pgfplots"))
        && !CLASS.is_match(&code)
        && ![
            "\\tikzexternalize",
            "external}",
            "external,",
            ",external",
            "\\DocumentMetadata",
            "{pdfx}",
            "remember picture",
            "overlay",
        ]
        .iter()
        .any(|w| code.contains(w))
}

/// `text` with its comments blanked (same length, same lines).
fn without_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.split_inclusive('\n') {
        let bytes = line.as_bytes();
        let mut cut = None;
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b'\\' => i += 2,
                b'%' => {
                    cut = Some(i);
                    break;
                }
                _ => i += 1,
            }
        }
        match cut {
            Some(at) => {
                out.push_str(&line[..at]);
                out.extend(
                    line[at..]
                        .chars()
                        .map(|c| if c == '\n' { '\n' } else { ' ' }),
                );
            }
            None => out.push_str(line),
        }
    }
    out
}

/// Environments whose text TeX does not run as it is written.
const VERBATIM: &[&str] = &[
    "verbatim",
    "verbatim*",
    "Verbatim",
    "lstlisting",
    "minted",
    "comment",
    "filecontents",
    "filecontents*",
];

/// `code` with the text of its verbatim environments blanked.
fn without_verbatim(code: &str) -> String {
    let mut out = code.to_owned();
    for env in VERBATIM {
        let (open, close) = (format!("\\begin{{{env}}}"), format!("\\end{{{env}}}"));
        let mut from = 0;
        while let Some(i) = out[from..].find(&open) {
            let start = from + i;
            let Some(j) = out[start..].find(&close) else {
                break;
            };
            let end = start + j + close.len();
            let blank: String = out[start..end]
                .chars()
                .map(|c| if c == '\n' { '\n' } else { ' ' })
                .collect();
            out.replace_range(start..end, &blank);
            from = start + blank.len();
        }
    }
    out
}

/// A picture of the text: a `tikzpicture` environment over several lines,
/// the first one of its line.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Found {
    /// Lines of `\begin{tikzpicture}` and `\end{tikzpicture}` (from 1).
    line: u32,
    end: u32,
    /// Its text, from `\begin` to `\end{tikzpicture}`.
    text: String,
    /// Whether it may be put back (see [`eligible`]).
    eligible: bool,
}

const BEGIN: &str = "\\begin{tikzpicture}";
const END: &str = "\\end{tikzpicture}";

/// The pictures of `text`, and its code outside them (comments blanked).
fn pictures_of(text: &str) -> (Vec<Found>, String) {
    let code = without_verbatim(&without_comments(text));
    let line_at = |at: usize| code[..at].bytes().filter(|b| *b == b'\n').count() as u32 + 1;
    let mut found: Vec<Found> = Vec::new();
    let mut outside = String::with_capacity(code.len());
    let mut from = 0;
    let mut last_line = 0;
    while let Some(i) = code[from..].find(BEGIN) {
        let start = from + i;
        // The matching end, pictures inside counted.
        let mut depth = 0usize;
        let mut at = start;
        let mut stop = None;
        while at < code.len() {
            let next_begin = code[at..].find(BEGIN).map(|j| at + j);
            let next_end = code[at..].find(END).map(|j| at + j);
            match (next_begin, next_end) {
                (Some(b), Some(e)) if b < e => {
                    depth += 1;
                    at = b + BEGIN.len();
                }
                (_, Some(e)) => {
                    depth = depth.saturating_sub(1);
                    at = e + END.len();
                    if depth == 0 {
                        stop = Some(at);
                        break;
                    }
                }
                _ => break,
            }
        }
        let Some(stop) = stop else { break };
        outside.push_str(&code[from..start]);
        let (line, end) = (line_at(start), line_at(stop));
        let first_of_line = line != last_line;
        last_line = line;
        let inner = &code[start..stop];
        if first_of_line && end > line {
            found.push(Found {
                line,
                end,
                text: text[start..stop].to_owned(),
                eligible: eligible(inner),
            });
        }
        // The lines of a picture stay lines of the code outside.
        outside.extend(inner.chars().filter(|c| *c == '\n'));
        from = stop;
    }
    outside.push_str(&code[from..]);
    (found, outside)
}

/// Whether a picture (its code) may be put back: nothing in it depends on
/// the page, on the rest of the document or on chance.
fn eligible(code: &str) -> bool {
    static DEPENDS: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(concat!(
            r"remember picture|overlay|current page|use as bounding box|trim left|trim right|",
            r"\\useasboundingbox|\\pgfresetboundingbox|\\[A-Za-z]*ref\b|\\[A-Za-z]*cite|",
            r"\\label\b|\\footnote|\\href|\\url\b|\\hyperlink|\\hypertarget|\\index\b|",
            r"\\[gG]ls|\\acr|\\ac[slp]?\b|\\value\b|\\arabic|\\roman|\\Roman|\\alph|\\Alph|",
            r"\\fnsymbol|counter|\\today|\\jobname|\\write|\\immediate|\\marginpar|\\pause|",
            r"\\only\b|\\uncover|\\visible|\\invisible|\\onslide|\\alt\b|\\temporal|",
            r"\\tikzmark|\\subnode|\\tikzexternal|\\verb|\\lstinline|\\mintinline|",
            r"\brand\b|\brnd\b|random|\\pgfmathsetseed|\\directlua|\\input\|"
        ))
        .unwrap()
    });
    static THE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\\the([A-Za-z]+)").unwrap());
    !DEPENDS.is_match(code)
        && code.matches(BEGIN).count() == 1
        && !THE.captures_iter(code).any(|c| {
            // `\thefigure`, `\thepage`… but not `\theta` or `\therefore`.
            !["ta", "refore", "ad", "tasym"].contains(&&c[1][..])
        })
}

/// Lines of the text that change what a picture draws: definitions,
/// settings of TikZ, pgfplots and other packages, fonts, colours, lengths.
fn is_definition(line: &str) -> bool {
    static DEFINES: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(concat!(
            r"\\(?:(?:re)?newcommand|providecommand|(?:New|Renew|Provide|Declare)(?:Document|Expandable)?Command|",
            r"DeclareRobustCommand|DeclareMathOperator|[gex]?def|let|newlength|setlength|addtolength|",
            r"settowidth|settoheight|newcounter|setcounter|addtocounter|stepcounter|definecolor|colorlet|",
            r"newif|usetikzlibrary|usepgfplotslibrary|tikzstyle|newfontfamily|setmainfont|setsansfont|",
            r"setmonofont|setmathfont|selectlanguage|pgfmathsetmacro|pgfmathtruncatemacro|pgfmathparse|",
            r"pgfplotstableread|pgfkeys|pgfqkeys|SetKeys|setkeys|ExplSyntaxOn|NewDocumentEnvironment|",
            r"(?:re)?newenvironment|catcode|makeatletter|(?:tikz|pgf|pgfplots|pgfplotstable|lst|tcb|kv)set|",
            r"[A-Za-z]*setup)\b"
        ))
        .unwrap()
    });
    DEFINES.is_match(line)
}

/// The files of the project a piece of text names (data of a plot, images,
/// files read): with their content in a key, a picture changes with them.
fn named_files(text: &str, dirs: &[&Path]) -> Vec<PathBuf> {
    // A name with its extension, anywhere.
    static WITH_EXTENSION: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"([A-Za-z0-9_./~+-]+\.(?i:csv|dat|txt|tsv|tex|png|pdf|jpe?g|eps|table|data))\b")
            .unwrap()
    });
    // A name without one, given to a command that reads a file.
    static READ_BY: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?:\\includegraphics|\\input|\\pgfplotstableread|\btable|\bfile)\s*(?:\[[^\]]*\])?\s*\{\s*([^{}\s\\]+)\s*\}").unwrap()
    });
    const EXTENSIONS: &[&str] = &[
        "tex", "csv", "dat", "txt", "png", "pdf", "jpg", "jpeg", "eps",
    ];
    let mut out = BTreeSet::new();
    let names = WITH_EXTENSION
        .captures_iter(text)
        .chain(READ_BY.captures_iter(text))
        .map(|c| c[1].to_owned())
        .collect::<BTreeSet<_>>();
    for name in names {
        for dir in dirs {
            let path = dir.join(&name);
            let found = if path.is_file() {
                Some(path)
            } else if path.extension().is_none() {
                EXTENSIONS
                    .iter()
                    .map(|e| dir.join(format!("{name}.{e}")))
                    .find(|p| p.is_file())
            } else {
                None
            };
            if let Some(p) = found {
                out.insert(p);
                break;
            }
        }
    }
    out.into_iter().collect()
}

fn hash_files(files: &[PathBuf], h: &mut DefaultHasher) {
    for f in files {
        f.hash(h);
        std::fs::read(f).ok().hash(h);
    }
}

/// A picture of the document, with the key of its drawing.
#[derive(Debug, Clone)]
struct Picture {
    file: PathBuf,
    line: u32,
    end: u32,
    key: String,
}

/// What a build learned of the pictures of its document.
#[derive(Debug, Clone, Default)]
pub struct Prepared {
    /// What does not belong to one picture: preamble, definitions, engine.
    identity: u64,
    /// The pictures that may be put back.
    pictures: Vec<Picture>,
    /// The files of the document, with a hash of their text.
    texts: Vec<(PathBuf, u64)>,
    /// What the entries of the map stand for (entry n − 1 → key, drawing).
    map: Vec<(String, usize)>,
}

impl Prepared {
    /// Pictures put back by this build's map.
    pub fn entries(&self) -> usize {
        self.map.len()
    }
}

/// One drawing of a picture: a page of a PDF of the folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Drawing {
    /// Where TeX met it (`<file>@<line>`).
    at: String,
    /// Width, font, colour and language around it.
    ctx: String,
    /// Lines after its first one.
    lines: u32,
    pdf: String,
    page: u32,
    wd: String,
    ht: String,
    dp: String,
    /// Pictures pgf counted while drawing it (those inside included).
    pics: u32,
    /// The build that last put it back.
    used: u64,
}

/// What the folder of drawings holds.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Store {
    /// Builds that wrote a map (the age of a drawing).
    builds: u64,
    /// The drawings of each picture (by its key): one per context.
    drawings: BTreeMap<String, Vec<Drawing>>,
    /// Pictures the pass of drawings did not meet (in a macro, left out of
    /// the document…), with the build when it was seen.
    absent: BTreeMap<String, u64>,
    /// Pictures whose drawing did not suit where they stand now.
    missed: BTreeSet<String>,
    /// How TeX names each file (`\CurrentFilePath/\CurrentFile`), by its path.
    names: BTreeMap<String, String>,
    /// The identity of the document whose pass of drawings stopped on an error.
    failed: Option<u64>,
    /// Number of the next PDF of drawings.
    next_pdf: u64,
}

/// One change of the folder at a time (a build, the pass of drawings).
static STORE: Mutex<()> = Mutex::new(());

fn load(dir: &Path) -> Store {
    std::fs::read_to_string(dir.join("index.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(dir: &Path, store: &Store) {
    let tmp = dir.join("index.json.tmp");
    if std::fs::write(&tmp, serde_json::to_string(store).unwrap_or_default()).is_ok() {
        let _ = std::fs::rename(&tmp, dir.join("index.json"));
    }
}

/// How TeX is given a file of the folder: from the folder of the root
/// (where the engine runs), with `/`.
fn tex_path(plan: &BuildPlan, path: &Path) -> String {
    only::relative(&plan.root_dir, path)
        .unwrap_or_else(|| path.to_string_lossy().replace('\\', "/"))
}

/// The name of a file of the document for the store (from the root).
fn store_name(plan: &BuildPlan, path: &Path) -> String {
    only::relative(&plan.root_dir, path).unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// The files of the document: those its last pass read (`.tex`), the root
/// first.
fn document_files(plan: &BuildPlan) -> Vec<PathBuf> {
    let mut files = vec![plan.root.clone()];
    if let Some(read) = super::project_inputs(plan) {
        let root = crate::log::normalize(&plan.root);
        files.extend(read.into_iter().filter(|p| {
            p.extension().is_some_and(|e| e.eq_ignore_ascii_case("tex"))
                && crate::log::normalize(p) != root
        }));
    }
    files
}

/// Before a build: the pictures of the document and the map of those that
/// are put back (`figures.tex`, read by TeX from the `.aux`). `None`, and
/// no map left, when the build draws everything.
pub fn prepare(
    plan: &BuildPlan,
    settings: &BuildSettings,
    dist: &Distribution,
    source: &dyn Fn(&Path) -> Option<String>,
) -> Option<Prepared> {
    let dir = folder(plan);
    let map_path = dir.join("figures.tex");
    // What TeX reads: the files as they are written.
    let root_text = std::fs::read_to_string(&plan.root)
        .ok()
        .or_else(|| source(&plan.root))
        .unwrap_or_default();
    let broken = std::fs::read_to_string(dir.join(BROKEN))
        .is_ok_and(|code| code == super::hash_str(CODE).to_string());
    if broken || !applies(plan, settings, dist, &root_text) {
        let _ = std::fs::remove_file(&map_path);
        let _ = std::fs::remove_file(dir.join(IN_PDF));
        return None;
    }
    let preamble = preamble::preamble_of(&root_text).unwrap_or_default();
    let mut identity = DefaultHasher::new();
    CODE.hash(&mut identity);
    plan.engine.program().hash(&mut identity);
    dist.id.hash(&mut identity);
    dist.version.hash(&mut identity);
    settings.shell_escape.hash(&mut identity);
    settings.extra_args.hash(&mut identity);
    without_comments(&preamble).hash(&mut identity);
    hash_files(
        &preamble::local_inputs(&plan.root_dir, &preamble),
        &mut identity,
    );
    hash_files(&named_files(&preamble, &[&plan.root_dir]), &mut identity);

    let mut found: Vec<(PathBuf, Found)> = Vec::new();
    let mut texts = Vec::new();
    let mut files = document_files(plan);
    files.sort();
    files.dedup();
    for file in files {
        let text = if file == plan.root {
            root_text.clone()
        } else {
            match std::fs::read_to_string(&file) {
                Ok(t) => t,
                Err(_) => continue,
            }
        };
        texts.push((file.clone(), super::hash_str(&text)));
        let (pictures, outside) = pictures_of(&text);
        let dirs: Vec<&Path> = [file.parent(), Some(plan.root_dir.as_path())]
            .into_iter()
            .flatten()
            .collect();
        // The body only, for the root: its preamble is counted whole.
        let body = if file == plan.root {
            outside
                .find("\\begin{document}")
                .map_or("", |at| &outside[at..])
        } else {
            &outside
        };
        for line in body.lines().filter(|l| is_definition(l)) {
            line.trim().hash(&mut identity);
            hash_files(&named_files(line, &dirs), &mut identity);
        }
        // A picture written in the preamble (in a command) is not drawn
        // where it is written.
        let body_from = if file == plan.root {
            only::preamble_lines(&text).unwrap_or(u32::MAX)
        } else {
            0
        };
        found.extend(
            pictures
                .into_iter()
                .filter(|p| p.line >= body_from)
                .map(|p| (file.clone(), p)),
        );
    }
    let identity = identity.finish();
    let pictures: Vec<Picture> = found
        .into_iter()
        .filter(|(_, p)| p.eligible)
        .map(|(file, p)| {
            let dirs: Vec<&Path> = [file.parent(), Some(plan.root_dir.as_path())]
                .into_iter()
                .flatten()
                .collect();
            let mut h = DefaultHasher::new();
            identity.hash(&mut h);
            p.text.hash(&mut h);
            hash_files(&named_files(&p.text, &dirs), &mut h);
            Picture {
                file,
                line: p.line,
                end: p.end,
                key: format!("{:016x}", h.finish()),
            }
        })
        .collect();

    let _guard = STORE.lock().unwrap_or_else(|e| e.into_inner());
    let _ = std::fs::create_dir_all(&dir);
    let mut store = load(&dir);
    store.builds += 1;
    let builds = store.builds;
    // Drawings not put back for long, pictures long absent, PDFs no
    // drawing points to: let go.
    for list in store.drawings.values_mut() {
        list.retain(|d| d.used + KEPT_FOR >= builds);
    }
    store.drawings.retain(|_, list| !list.is_empty());
    store.absent.retain(|_, at| *at + ABSENT_FOR >= builds);
    let kept: BTreeSet<&str> = store
        .drawings
        .values()
        .flatten()
        .map(|d| d.pdf.as_str())
        .collect();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("f-") && name.ends_with(".pdf") && !kept.contains(name.as_str()) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    let mut map = Vec::new();
    let mut entries = String::new();
    for p in &pictures {
        let Some(tex_name) = store.names.get(&store_name(plan, &p.file)).cloned() else {
            continue;
        };
        let Some(list) = store.drawings.get_mut(&p.key) else {
            continue;
        };
        let at = format!("{tex_name}@{}", p.line);
        // The drawing made at this very place, or the last one put back.
        let Some(i) = list
            .iter()
            .position(|d| d.at == at)
            .or_else(|| (0..list.len()).max_by_key(|&i| list[i].used))
        else {
            continue;
        };
        let d = &mut list[i];
        if d.lines != p.end - p.line || !dir.join(&d.pdf).is_file() {
            continue;
        }
        d.used = builds;
        map.push((p.key.clone(), i));
        entries.push_str(&format!(
            "\\RTXfig{{{}}}{{{at}}}{{{}}}{{{}}}{{{}}}{{{}}}{{{}}}{{{}}}{{{}}}{{{}}}\n",
            map.len(),
            d.ctx,
            p.end,
            tex_path(plan, &dir.join(&d.pdf)),
            d.page,
            d.wd,
            d.ht,
            d.dp,
            d.pics,
        ));
    }
    save(&dir, &store);
    let text = format!(
        "\\expandafter\\gdef\\csname RTXfig@self\\endcsname{{{}}}%\n{CODE}{entries}",
        tex_path(plan, &map_path)
    );
    if std::fs::read_to_string(&map_path).ok().as_deref() != Some(text.as_str()) {
        let tmp = dir.join("figures.tex.tmp");
        if std::fs::write(&tmp, &text).is_ok() {
            let _ = std::fs::rename(&tmp, &map_path);
        }
    }
    Some(Prepared {
        identity,
        pictures,
        texts,
        map,
    })
}

/// Before a pass: the `.aux` it reads loads the map (each pass writes the
/// line again in the `.aux` it writes; it is added when it is missing).
pub fn link(plan: &BuildPlan) {
    let aux = plan.out_dir.join(format!("{}.aux", plan.job));
    let Ok(text) = std::fs::read_to_string(&aux) else {
        return;
    };
    let line = format!(
        "\\InputIfFileExists{{{}}}{{}}{{}}",
        tex_path(plan, &folder(plan).join("figures.tex"))
    );
    if !text.contains(&line) {
        let sep = if text.ends_with('\n') || text.is_empty() {
            ""
        } else {
            "\n"
        };
        let _ = std::fs::write(&aux, format!("{text}{sep}{line}\n"));
    }
}

/// Whether an error of the pass is in the map: it is then removed, and the
/// pictures of this output folder are drawn as usual from now on.
pub fn broke(plan: &BuildPlan, report: &crate::log::LogReport) -> bool {
    let dir = folder(plan);
    let real = dunce::canonicalize(&dir).ok();
    let broke = report.diagnostics.iter().any(|d| {
        d.severity == crate::diagnostics::Severity::Error
            && d.file.as_deref().is_some_and(|f| {
                let f = crate::log::normalize(f);
                f.starts_with(crate::log::normalize(&dir))
                    || real.as_ref().is_some_and(|r| f.starts_with(r))
                    || f.ends_with("figures.tex") && f.to_string_lossy().contains(FOLDER)
            })
    });
    if broke {
        let _ = std::fs::write(dir.join(BROKEN), super::hash_str(CODE).to_string());
        let _ = std::fs::remove_file(dir.join("figures.tex"));
        let _ = std::fs::remove_file(dir.join(IN_PDF));
    }
    broke
}

/// After a build: what TeX said of the pictures put back (in its log).
/// Returns the pictures to draw: those without a drawing, or whose drawing
/// did not suit where they stand now.
pub fn after(plan: &BuildPlan, prepared: &Prepared) -> Vec<String> {
    let dir = folder(plan);
    let log = std::fs::read(&plan.log)
        .map(|b| crate::text::decode_log(&b))
        .unwrap_or_default();
    let mut hits = 0;
    let mut misses = BTreeSet::new();
    for line in log.lines() {
        let entry = |prefix: &str| {
            line.strip_prefix(prefix)
                .and_then(|n| n.trim().parse::<usize>().ok())
                .and_then(|n| prepared.map.get(n.wrapping_sub(1)))
        };
        if entry("RTXfig-hit ").is_some() {
            hits += 1;
        } else if let Some((key, _)) = entry("RTXfig-miss ") {
            misses.insert(key.clone());
        }
    }
    if hits > 0 {
        let _ = std::fs::write(dir.join(IN_PDF), b"");
    } else {
        let _ = std::fs::remove_file(dir.join(IN_PDF));
    }
    let _guard = STORE.lock().unwrap_or_else(|e| e.into_inner());
    let mut store = load(&dir);
    store.missed.extend(misses);
    if store.failed == Some(prepared.identity) {
        save(&dir, &store);
        return Vec::new();
    }
    let due: BTreeSet<String> = prepared
        .pictures
        .iter()
        .filter(|p| {
            store.missed.contains(&p.key)
                || !store.drawings.contains_key(&p.key) && !store.absent.contains_key(&p.key)
        })
        .map(|p| p.key.clone())
        .collect();
    save(&dir, &store);
    due.into_iter().collect()
}

/// Passes of drawings under way, by output folder (a build stops the one of
/// its folder).
static DRAWING: LazyLock<Mutex<HashMap<PathBuf, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Stops the pass of drawings of the output folder of `plan`, if one runs.
pub fn stop(plan: &BuildPlan) {
    if let Some(flag) = DRAWING
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&plan.out_dir)
    {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Draws the pictures `due` in the background, a moment after the build
/// (a build that follows stops it).
pub fn draw_in_background(
    plan: &BuildPlan,
    settings: &BuildSettings,
    dist: &Distribution,
    format: Option<PathBuf>,
    prepared: Prepared,
    due: Vec<String>,
) {
    let flag = Arc::new(AtomicBool::new(false));
    if let Some(old) = DRAWING
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(plan.out_dir.clone(), flag.clone())
    {
        old.store(true, Ordering::Relaxed);
    }
    let (plan, settings, dist) = (plan.clone(), settings.clone(), dist.clone());
    std::thread::spawn(move || {
        for _ in 0..30 {
            if flag.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        draw(
            &plan,
            &settings,
            &dist,
            format.as_deref(),
            &prepared,
            &due,
            &flag,
        );
        let mut drawing = DRAWING.lock().unwrap_or_else(|e| e.into_inner());
        if drawing
            .get(&plan.out_dir)
            .is_some_and(|f| Arc::ptr_eq(f, &flag))
        {
            drawing.remove(&plan.out_dir);
        }
    });
}

/// The pass of drawings: the document again, in a folder of its own, from
/// the auxiliary files of the build; each picture to draw is shipped on a
/// page of its own, the pages of the document are not written. Returns how
/// many drawings were kept.
pub fn draw(
    plan: &BuildPlan,
    settings: &BuildSettings,
    dist: &Distribution,
    format: Option<&Path>,
    prepared: &Prepared,
    due: &[String],
    cancel: &AtomicBool,
) -> usize {
    let dir = folder(plan);
    let run = dir.join("run");
    let _ = std::fs::remove_dir_all(&run);
    if std::fs::create_dir_all(&run).is_err() {
        return 0;
    }
    super::mirror_directories(&plan.root_dir, &run);
    // What the build read back (labels, contents, bibliography), the map
    // loaded in its pass of drawings.
    let map_line = format!(
        "\\InputIfFileExists{{{}}}{{}}{{}}",
        tex_path(plan, &dir.join("figures.tex"))
    );
    let export_line = format!(
        "\\InputIfFileExists{{{}}}{{}}{{}}",
        tex_path(plan, &dir.join("draw.tex"))
    );
    let _ = std::fs::write(
        dir.join("draw.tex"),
        format!(
            "\\expandafter\\gdef\\csname RTXfig@exporting\\endcsname{{}}\\input{{{}}}\n",
            tex_path(plan, &dir.join("figures.tex"))
        ),
    );
    let main_aux = plan.out_dir.join(format!("{}.aux", plan.job));
    let mut copied = super::auxiliary_files(&plan.out_dir);
    let bbl = plan.out_dir.join(format!("{}.bbl", plan.job));
    if let Ok(data) = std::fs::read(&bbl) {
        copied.push((bbl, data));
    }
    let mut linked = false;
    for (path, data) in copied {
        let Ok(rel) = path.strip_prefix(&plan.out_dir) else {
            continue;
        };
        let target = run.join(rel);
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let data = if path == main_aux {
            linked = true;
            let text = String::from_utf8_lossy(&data).replace(&map_line, "");
            format!("{}\n{export_line}\n", text.trim_end()).into_bytes()
        } else {
            data
        };
        let _ = std::fs::write(target, data);
    }
    if !linked {
        return 0;
    }

    let mut cmd = dist
        .engine_cmd(plan.engine, settings.miktex_auto_install)
        .cwd(&plan.root_dir);
    for (k, v) in plan.engine_env(dist) {
        cmd = cmd.env(k, v);
    }
    cmd = cmd.arg("-interaction=nonstopmode");
    if settings.shell_escape {
        cmd = cmd.arg("-shell-escape");
    }
    cmd = cmd.arg(format!("-output-directory={}", run.display()));
    if let Some(format) = format {
        cmd = cmd.args(preamble::use_format(dist, format));
    }
    cmd = cmd
        .args(settings.extra_args.iter().cloned())
        .arg(plan.engine_input())
        .stopping_with_app();
    let timeout = Duration::from_secs(u64::from(settings.timeout_s.max(10)));
    let status = process::run_streaming(&cmd, cancel, Some(timeout), |_, _| {});
    if cancel.load(Ordering::Relaxed) || status.as_ref().map_or(true, |s| s.cancelled) {
        return 0;
    }
    let log = std::fs::read(run.join(format!("{}.log", plan.job)))
        .map(|b| crate::text::decode_log(&b))
        .unwrap_or_default();
    let aux = std::fs::read_to_string(run.join(format!("{}.aux", plan.job))).unwrap_or_default();
    let pdf = run.join(format!("{}.pdf", plan.job));

    let _guard = STORE.lock().unwrap_or_else(|e| e.into_inner());
    let mut store = load(&dir);
    // The text changed while it was drawn: what was drawn is not known.
    let same = prepared
        .texts
        .iter()
        .all(|(file, h)| std::fs::read_to_string(file).is_ok_and(|t| super::hash_str(&t) == *h));
    if !same {
        return 0;
    }
    if log.lines().any(|l| l.starts_with("! ")) {
        // Something of the document does not go with the pass of drawings:
        // its pictures are drawn as usual until it changes.
        store.failed = Some(prepared.identity);
        save(&dir, &store);
        return 0;
    }
    let name = format!("f-{}.pdf", store.next_pdf);
    let mut kept = 0;
    let mut met = BTreeSet::new();
    for line in aux.lines() {
        let Some(rest) = line.strip_prefix("\\RTXfigout") else {
            continue;
        };
        let Some(g) = groups(rest, 8) else { continue };
        let (at, ctx) = (g[0], g[1]);
        let (Some((tex_name, line)), Ok(end), Ok(page), Ok(pics)) = (
            at.rsplit_once('@')
                .and_then(|(n, l)| Some((n, l.parse::<u32>().ok()?))),
            g[2].parse::<u32>(),
            g[3].parse::<u32>(),
            g[7].parse::<u32>(),
        ) else {
            continue;
        };
        if [at, ctx].iter().any(|s| s.contains(['%', '\\'])) {
            continue;
        }
        let Some(file) = resolve(plan, tex_name, prepared) else {
            continue;
        };
        let Some(p) = prepared
            .pictures
            .iter()
            .find(|p| p.file == file && p.line == line && p.end == end)
        else {
            continue;
        };
        if !met.insert(p.key.clone()) {
            continue;
        }
        store
            .names
            .insert(store_name(plan, &file), tex_name.to_owned());
        let list = store.drawings.entry(p.key.clone()).or_default();
        list.retain(|d| d.ctx != ctx);
        list.push(Drawing {
            at: at.to_owned(),
            ctx: ctx.to_owned(),
            lines: end - line,
            pdf: name.clone(),
            page,
            wd: g[4].to_owned(),
            ht: g[5].to_owned(),
            dp: g[6].to_owned(),
            pics,
            used: store.builds,
        });
        store.missed.remove(&p.key);
        store.absent.remove(&p.key);
        kept += 1;
    }
    // Pictures to draw that the pass did not meet: not tried again for a while.
    for key in due {
        if !met.contains(key) {
            store.missed.remove(key);
            store.absent.insert(key.clone(), store.builds);
        }
    }
    if kept > 0 {
        if std::fs::rename(&pdf, dir.join(&name)).is_err() {
            return 0;
        }
        store.next_pdf += 1;
    }
    save(&dir, &store);
    let _ = std::fs::remove_dir_all(&run);
    kept
}

/// The file of the document TeX names `tex_name` (`\CurrentFilePath/\CurrentFile`;
/// `/` alone for the root).
fn resolve(plan: &BuildPlan, tex_name: &str, prepared: &Prepared) -> Option<PathBuf> {
    if tex_name == "/" {
        return Some(plan.root.clone());
    }
    let same = |a: &Path, b: &Path| {
        crate::log::normalize(a) == crate::log::normalize(b)
            || dunce::canonicalize(a)
                .ok()
                .is_some_and(|a| dunce::canonicalize(b).is_ok_and(|b| a == b))
    };
    let relative = plan.root_dir.join(tex_name.trim_start_matches('/'));
    let absolute = Path::new(tex_name);
    prepared
        .texts
        .iter()
        .map(|(f, _)| f)
        .find(|f| same(f, &relative) || absolute.is_absolute() && same(f, absolute))
        .cloned()
}

/// The first `n` groups `{…}` of `s` (braces inside counted).
fn groups(s: &str, n: usize) -> Option<Vec<&str>> {
    let mut out = Vec::with_capacity(n);
    let bytes = s.as_bytes();
    let mut i = 0;
    while out.len() < n {
        if bytes.get(i) != Some(&b'{') {
            return None;
        }
        let start = i + 1;
        let mut depth = 0usize;
        loop {
            match bytes.get(i)? {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                _ => {}
            }
            i += 1;
        }
        out.push(&s[start..i]);
        i += 1;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pictures_of_a_text_are_found_with_their_lines() {
        let text = "Un cercle \\begin{tikzpicture}\\draw (0,0) circle (1ex);\\end{tikzpicture} ici.\n\
            \\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n\
            % \\begin{tikzpicture}\n%\\end{tikzpicture}\n\
            \\begin{verbatim}\n\\begin{tikzpicture}\nx\n\\end{tikzpicture}\n\\end{verbatim}\n\
            \\begin{tikzpicture}\n\\node {\\ref{x}};\n\\end{tikzpicture}\n\
            \\begin{tikzpicture}\n\\node {\\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}};\n\\end{tikzpicture}\n";
        let (found, outside) = pictures_of(text);
        let lines: Vec<(u32, u32, bool)> =
            found.iter().map(|f| (f.line, f.end, f.eligible)).collect();
        // The one of a single line is left; references and pictures inside
        // a picture are drawn.
        assert_eq!(lines, vec![(2, 4, true), (12, 14, false), (15, 17, false)]);
        assert!(found[0].text.starts_with(BEGIN) && found[0].text.ends_with(END));
        assert_eq!(outside.lines().count(), text.lines().count());
        assert!(!outside.contains("\\draw (0,0) --"));
    }

    #[test]
    fn what_a_picture_depends_on_is_seen() {
        assert!(eligible(
            "\\begin{tikzpicture}\\draw (0,0) node {$\\theta$};\\end{tikzpicture}"
        ));
        for depends in [
            "\\node {\\thefigure};",
            "\\node {\\cite{a}};",
            "\\node {\\eqref{e}};",
            "[remember picture]",
            "\\draw (rand,0);",
            "\\node {\\href{x}{y}};",
        ] {
            assert!(!eligible(&format!("{BEGIN}{depends}{END}")), "{depends}");
        }
        assert!(is_definition("\\tikzset{every node/.style={red}}"));
        assert!(is_definition("\\pgfplotsset{width=5cm}"));
        assert!(is_definition("\\newcommand\\R{\\mathbb{R}}"));
        assert!(!is_definition("Du texte, et \\emph{un mot}."));
    }

    #[test]
    fn groups_are_read_with_their_braces() {
        let line = "{/@12}{{345.0pt}{T1}{0 g 0 G}}{14}{1}{52.8pt}{10.4pt}{3.5pt}{1}";
        let g = groups(line, 8).unwrap();
        assert_eq!(g[0], "/@12");
        assert_eq!(g[1], "{345.0pt}{T1}{0 g 0 G}");
        assert_eq!(g[7], "1");
        assert!(groups("{a}{b", 2).is_none());
    }

    /// A document of five pictures that may be put back (and one drawn
    /// always, on a single line), in French.
    const DOCUMENT: &str = r"\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage{tikz}
\usetikzlibrary{shadows}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
\begin{document}
Un cercle \begin{tikzpicture}[baseline=-0.5ex]\draw (0,0) circle (1ex);\end{tikzpicture} dans la ligne.

Un dessin dans le texte
\begin{tikzpicture}[baseline=(a.base)]
\node[draw,fill=red!20] (a) {Nœud : ici};
\end{tikzpicture}
et la suite.

\begin{figure}[h]
\centering
\begin{tikzpicture}
\begin{axis}[width=0.8\linewidth, height=5cm]
\addplot[domain=0:10, samples=SAMPLES] {sin(deg(x))*exp(-x/5)};
\end{axis}
\end{tikzpicture}
\caption{Courbe}
\end{figure}

\begin{itemize}
\item Dans une liste
\begin{tikzpicture}
\fill[blue, opacity=0.5] (0,0) rectangle (\linewidth,1);
\draw[line width=6pt] (0,1.5) -- (3,1.5);
\end{tikzpicture}
\end{itemize}

{\small\sffamily
\begin{tikzpicture}
\node[draw, drop shadow, fill=white] {Petit texte $x^2$};
\end{tikzpicture}\par}

\input{chapitres/un}
\end{document}
";

    #[test]
    #[ignore = "needs a TeX distribution"]
    fn pictures_drawn_once_are_put_back() {
        use crate::build::{BuildEvent, DocumentFacts, RunContext, plan, run};
        use crate::i18n::Lang;
        use crate::settings::EngineChoice;
        let Some(dist) = crate::tex::detect(&[]).into_iter().next() else {
            println!("no TeX distribution: nothing checked");
            return;
        };
        for (engine, tool) in [
            (EngineChoice::Pdflatex, BuildTool::Auto),
            (EngineChoice::Xelatex, BuildTool::Auto),
            (EngineChoice::Lualatex, BuildTool::Auto),
            (EngineChoice::Pdflatex, BuildTool::Latexmk),
        ] {
            let dir = tempfile::tempdir().unwrap();
            let base = dunce::canonicalize(dir.path()).unwrap();
            let root = base.join("main.tex");
            std::fs::create_dir_all(base.join("chapitres")).unwrap();
            std::fs::write(
                base.join("chapitres/un.tex"),
                "\\section{Un}\n\\begin{tikzpicture}\n\\draw[->] (0,0) -- (3,1) node[right] {Fin : ici};\n\\end{tikzpicture}\n",
            )
            .unwrap();
            let write = |samples: &str, before: &str| {
                std::fs::write(
                    &root,
                    DOCUMENT.replace("SAMPLES", samples).replace(
                        "\\begin{document}\n",
                        &format!("\\begin{{document}}\n{before}"),
                    ),
                )
                .unwrap();
            };
            write("200", "");
            let mut settings = BuildSettings {
                engine,
                tool,
                out_dir: "build".to_owned(),
                precompile_preamble: false,
                ..BuildSettings::default()
            };
            let source = |p: &Path| std::fs::read_to_string(p).ok();
            let build = |settings: &BuildSettings| {
                let plan = plan(
                    &root,
                    settings,
                    Some(&dist),
                    &DocumentFacts::default(),
                    Lang::En,
                )
                .unwrap();
                let cancel = AtomicBool::new(false);
                let ctx = RunContext {
                    dist: &dist,
                    settings,
                    cancel: &cancel,
                    lang: Lang::En,
                    source: &source,
                    packages: None,
                    background: false,
                    live: false,
                };
                let outcome = run(&plan, &ctx, &mut |_: BuildEvent| {});
                assert!(
                    outcome.success,
                    "{engine:?} {tool:?}: {:?} {:?}",
                    outcome.diagnostics, outcome.steps
                );
                let log = std::fs::read_to_string(&plan.log).unwrap_or_default();
                let hits = log.lines().filter(|l| l.starts_with("RTXfig-hit ")).count();
                (plan, hits)
            };
            let draw = |plan: &BuildPlan| {
                let prepared =
                    prepare(plan, &settings, &dist, &source).expect("pictures of the document");
                let due = after(plan, &prepared);
                draw(
                    plan,
                    &settings,
                    &dist,
                    None,
                    &prepared,
                    &due,
                    &AtomicBool::new(false),
                )
            };
            // The first build reads no map (no .aux yet), the second one draws.
            build(&settings);
            let (plan, hits) = build(&settings);
            assert_eq!(hits, 0, "{engine:?} {tool:?}");
            assert_eq!(draw(&plan), 5, "{engine:?} {tool:?}");
            let (_, hits) = build(&settings);
            assert_eq!(hits, 5, "{engine:?} {tool:?}: put back");
            assert!(in_pdf(&plan.out_dir));
            // A picture changed is drawn, and drawn again on its page.
            write("100", "");
            let (plan, hits) = build(&settings);
            assert_eq!(hits, 4, "{engine:?} {tool:?}: the curve changed");
            assert_eq!(draw(&plan), 1, "{engine:?} {tool:?}");
            assert_eq!(build(&settings).1, 5, "{engine:?} {tool:?}");
            // Lines added above: the same pictures, further down.
            write("100", "Un paragraphe.\n\nEt un autre.\n\n");
            assert_eq!(build(&settings).1, 5, "{engine:?} {tool:?}: lines moved");
            // What surrounds a picture changed (a narrower line): drawn as
            // usual, then drawn again for its new place.
            std::fs::write(
                base.join("chapitres/un.tex"),
                "\\section{Un}\n\\begin{itemize}\\item Une liste\n\\begin{tikzpicture}\n\\draw[->] (0,0) -- (3,1) node[right] {Fin : ici};\n\\end{tikzpicture}\n\\end{itemize}\n",
            )
            .unwrap();
            let (plan, hits) = build(&settings);
            assert_eq!(hits, 4, "{engine:?} {tool:?}: another width");
            assert_eq!(draw(&plan), 1, "{engine:?} {tool:?}");
            assert_eq!(build(&settings).1, 5, "{engine:?} {tool:?}");
            // Turned off: everything is drawn, nothing is said to be put back.
            settings.figure_cache = false;
            let (plan, hits) = build(&settings);
            assert_eq!(hits, 0, "{engine:?} {tool:?}: turned off");
            assert!(!in_pdf(&plan.out_dir));
            assert!(!folder(&plan).join("figures.tex").exists());
        }
    }
}
