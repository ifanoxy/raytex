//! Small standalone documents compiled on the side, for live previews
//! (TikZ pictures, fonts).
//!
//! The project folder is the working directory, so relative paths (images,
//! `\input`, font files) resolve like in the document itself; every output
//! goes to a cache folder. The preamble of the project can be reused (see
//! [`project_preamble`]) so colours, styles and macros look the same.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::diagnostics::{Diagnostic, Severity, Source};
use crate::i18n::Lang;
use crate::log;
use crate::process;
use crate::tex::{Distribution, Engine};

/// A preview to compile.
#[derive(Debug, Clone)]
pub struct PreviewRequest<'a> {
    /// Options of the `standalone` class (`tikz,border=6pt`, `varwidth=12cm`…).
    pub class_options: &'a str,
    /// Preamble lines (packages, libraries, definitions).
    pub preamble: &'a str,
    /// Body of the document (a `tikzpicture`, sample text…).
    pub body: &'a str,
    /// Engine to use.
    pub engine: Engine,
    /// Working directory (the folder of the root document).
    pub workdir: &'a Path,
    /// Where the `.tex`, `.log` and `.pdf` are written.
    pub out_dir: &'a Path,
    /// Job name (one per kind of preview, so they do not overwrite each other).
    pub job: &'a str,
    /// Longest allowed run.
    pub timeout: Duration,
    /// Language of the explanations.
    pub lang: Lang,
}

/// Result of a preview.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewOutcome {
    /// The PDF, when one was produced.
    pub pdf: Option<PathBuf>,
    /// Bounding box of the first TikZ picture, in TeX points:
    /// `[left, bottom, right, top]`.
    pub bbox: Option<[f64; 4]>,
    /// White space added around the picture by `standalone` (`border`), in points.
    pub border: f64,
    /// Problems. `line` is relative to the body (1-based); problems of the
    /// preamble have no line.
    pub diagnostics: Vec<Diagnostic>,
    /// Duration of the run.
    pub duration_ms: u64,
    /// Engine used.
    pub engine: Engine,
}

/// Prints the bounding box of every TikZ picture in the log (`LBTBBOX:…`),
/// so the interface can map clicks on the preview to TikZ coordinates.
const BBOX_HOOK: &str = r"\makeatletter
\AtBeginDocument{\@ifpackageloaded{tikz}{\tikzset{every picture/.append style={execute at end picture={%
  \pgfpointanchor{current bounding box}{south west}\pgfgetlastxy{\lbt@x}{\lbt@y}%
  \pgfpointanchor{current bounding box}{north east}\pgfgetlastxy{\lbt@X}{\lbt@Y}%
  \immediate\typeout{LBTBBOX:\lbt@x:\lbt@y:\lbt@X:\lbt@Y}}}}}{}}
\makeatother
";

/// Full source of the preview document, and the line where the body starts (1-based).
pub fn document(req: &PreviewRequest<'_>) -> (String, usize) {
    let mut src = format!("\\documentclass[{}]{{standalone}}\n", req.class_options);
    src.push_str(req.preamble.trim_end());
    src.push('\n');
    src.push_str(BBOX_HOOK);
    src.push_str("\\begin{document}\n");
    let body_line = src.lines().count() + 1;
    src.push_str(req.body.trim_end());
    src.push_str("\n\\end{document}\n");
    (src, body_line)
}

/// `border=6pt` → 6.0 (points); 0 when absent.
fn border_of(options: &str) -> f64 {
    options
        .split(',')
        .find_map(|o| o.trim().strip_prefix("border="))
        .and_then(|v| parse_dimen(v.trim_matches(|c| c == '{' || c == '}')))
        .unwrap_or(0.0)
}

/// A TeX dimension in points (`6pt`, `0.5cm`, `2mm`, `1in`).
fn parse_dimen(s: &str) -> Option<f64> {
    let s = s.trim();
    let split = s.find(|c: char| c.is_ascii_alphabetic())?;
    let (num, unit) = s.split_at(split);
    let v: f64 = num.trim().parse().ok()?;
    Some(match unit.trim() {
        "pt" => v,
        "bp" => v * 72.27 / 72.0,
        "cm" => v * 72.27 / 2.54,
        "mm" => v * 72.27 / 25.4,
        "in" => v * 72.27,
        "em" => v * 10.0,
        _ => return None,
    })
}

/// Reads `LBTBBOX:-28.45pt:-5.0pt:56.9pt:30.0pt` from the log.
fn bbox_from_log(log: &str) -> Option<[f64; 4]> {
    let line = log.lines().find_map(|l| l.strip_prefix("LBTBBOX:"))?;
    let mut values = line
        .split(':')
        .map(|v| v.trim().trim_end_matches("pt").parse::<f64>());
    let mut out = [0.0; 4];
    for slot in &mut out {
        *slot = values.next()?.ok()?;
    }
    Some(out)
}

/// Compiles the preview. Never fails: problems are reported as diagnostics.
pub fn compile(dist: &Distribution, req: &PreviewRequest<'_>) -> PreviewOutcome {
    let start = Instant::now();
    let mut outcome = PreviewOutcome {
        pdf: None,
        bbox: None,
        border: border_of(req.class_options),
        diagnostics: Vec::new(),
        duration_ms: 0,
        engine: req.engine,
    };
    let fail = |mut outcome: PreviewOutcome, message: String| {
        outcome
            .diagnostics
            .push(Diagnostic::new(Severity::Error, Source::Build, message));
        outcome.duration_ms = start.elapsed().as_millis() as u64;
        outcome
    };
    if let Err(e) = std::fs::create_dir_all(req.out_dir) {
        return fail(outcome, e.to_string());
    }
    let (source, body_line) = document(req);
    let tex = req.out_dir.join(format!("{}.tex", req.job));
    let pdf = req.out_dir.join(format!("{}.pdf", req.job));
    let log_path = req.out_dir.join(format!("{}.log", req.job));
    let _ = std::fs::remove_file(&pdf);
    if let Err(e) = std::fs::write(&tex, &source) {
        return fail(outcome, e.to_string());
    }

    let out = req.out_dir.to_string_lossy().into_owned();
    let cmd = if req.engine == Engine::Tectonic {
        dist.cmd("tectonic")
            .args(["--keep-logs", "--outdir", &out])
            .arg(tex.to_string_lossy().into_owned())
    } else {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let workdir = req.workdir.to_string_lossy();
        dist.cmd(req.engine.program())
            .env("max_print_line", "10000")
            .env("TEXINPUTS", format!("{workdir}{sep}"))
            .args([
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-file-line-error",
            ])
            .arg(format!("-output-directory={out}"))
            .arg(tex.to_string_lossy().into_owned())
    }
    .cwd(req.workdir);

    if let Err(e) = process::output(&cmd, req.timeout) {
        return fail(outcome, format!("{}: {e}", req.engine.label()));
    }
    let log_text = std::fs::read(&log_path)
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default();
    let report = log::parse_log(&log_text, req.workdir, &tex, req.lang);
    let tex_norm = log::normalize(&tex);
    for mut d in report.diagnostics {
        if d.severity == Severity::Info
            || d.code.as_deref().is_some_and(|c| c.starts_with("badbox"))
        {
            continue;
        }
        let in_preview = d
            .file
            .as_deref()
            .map(log::normalize)
            .is_none_or(|f| f == tex_norm);
        if in_preview {
            match d.line {
                Some(l) if l as usize >= body_line => {
                    d.line = Some(l - body_line as u32 + 1);
                    d.end_line = d.end_line.map(|e| e.saturating_sub(body_line as u32) + 1);
                }
                _ => {
                    d.line = None;
                    d.end_line = None;
                }
            }
            d.file = None;
            d.range = None;
        }
        outcome.diagnostics.push(d);
    }
    outcome.bbox = bbox_from_log(&log_text);
    if pdf.is_file() {
        outcome.pdf = Some(pdf);
    }
    outcome.duration_ms = start.elapsed().as_millis() as u64;
    outcome
}

/// Packages that make no sense (or break) in a small standalone preview.
const PREVIEW_UNFRIENDLY: &[&str] = &[
    "geometry",
    "hyperref",
    "bookmark",
    "biblatex",
    "fancyhdr",
    "titlesec",
    "titletoc",
    "tocloft",
    "glossaries",
    "glossaries-extra",
    "makeidx",
    "imakeidx",
    "nomencl",
    "setspace",
    "showframe",
    "lastpage",
    "draftwatermark",
    "background",
    "scrlayer-scrpage",
    "pdfpages",
    "standalone",
];

/// Commands of the preamble that only concern the whole document.
const DOCUMENT_ONLY: &[&str] = &[
    "\\addbibresource",
    "\\bibliography",
    "\\makeindex",
    "\\makeglossaries",
    "\\geometry",
    "\\hypersetup",
    "\\pagestyle",
    "\\fancyhf",
    "\\fancyhead",
    "\\fancyfoot",
    "\\title",
    "\\author",
    "\\date",
    "\\includeonly",
    "\\loadglsentries",
    "\\newglossaryentry",
];

/// The preamble of `root_source` (between `\documentclass` and
/// `\begin{document}`), without what cannot work in a small preview.
pub fn project_preamble(root_source: &str) -> String {
    let Some(begin) = root_source.find("\\begin{document}") else {
        return String::new();
    };
    let head = &root_source[..begin];
    let start = head
        .find("\\documentclass")
        .map(|i| head[i..].find('\n').map_or(head.len(), |n| i + n + 1))
        .unwrap_or(0);
    let mut out = String::new();
    for line in logical_lines(&head[start..]) {
        let code: String = line
            .lines()
            .map(strip_comment)
            .collect::<Vec<_>>()
            .join("\n");
        let trimmed = code.trim_start();
        if DOCUMENT_ONLY.iter().any(|c| {
            trimmed.starts_with(c)
                && !trimmed[c.len()..].starts_with(|ch: char| ch.is_ascii_alphabetic())
        }) {
            continue;
        }
        if let Some(kept) = filter_packages(&code) {
            if !kept.trim().is_empty() {
                out.push_str(&kept);
                out.push('\n');
            }
            continue;
        }
        out.push_str(&line);
        out.push('\n');
    }
    out
}

/// Lines joined while braces or brackets are open (`\hypersetup{` over
/// several lines, `\usepackage[` with options on the next lines).
fn logical_lines(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut depth = 0i32;
    let mut joined = 0;
    for line in text.lines() {
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
        let code = strip_comment(line).as_bytes();
        for (i, &b) in code.iter().enumerate() {
            let escaped = i > 0 && code[i - 1] == b'\\';
            match b {
                b'{' | b'[' if !escaped => depth += 1,
                b'}' | b']' if !escaped => depth -= 1,
                _ => {}
            }
        }
        joined += 1;
        if depth <= 0 || joined >= 40 {
            out.push(std::mem::take(&mut current));
            depth = 0;
            joined = 0;
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn strip_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'%' && (i == 0 || bytes[i - 1] != b'\\') {
            return &line[..i];
        }
    }
    line
}

/// For a `\usepackage[…]{a,b}` line, the same line without unfriendly
/// packages (`Some("")` when none is left); `None` for other lines.
fn filter_packages(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    let cmd = ["\\usepackage", "\\RequirePackage"]
        .into_iter()
        .find(|c| trimmed.starts_with(c))?;
    let rest = &trimmed[cmd.len()..];
    // Skip the options: they may contain braces (`[style={a}]`).
    let after_options = match rest.trim_start().strip_prefix('[') {
        Some(_) => {
            let lead = rest.len() - rest.trim_start().len();
            let mut depth = 0i32;
            let mut end = None;
            for (i, c) in rest[lead..].char_indices() {
                match c {
                    '[' | '{' => depth += 1,
                    ']' | '}' => {
                        depth -= 1;
                        if depth == 0 {
                            end = Some(lead + i + 1);
                            break;
                        }
                    }
                    _ => {}
                }
            }
            end?
        }
        None => 0,
    };
    let open = rest[after_options..].find('{')? + after_options;
    let close = rest[open..].find('}')? + open;
    let names: Vec<&str> = rest[open + 1..close]
        .split(',')
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .collect();
    let kept: Vec<&str> = names
        .iter()
        .copied()
        .filter(|n| !PREVIEW_UNFRIENDLY.contains(n))
        .collect();
    if kept.len() == names.len() {
        return Some(line.to_owned());
    }
    if kept.is_empty() {
        return Some(String::new());
    }
    Some(format!(
        "{cmd}{}{{{}}}{}",
        &rest[..open],
        kept.join(","),
        &rest[close + 1..]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_places_body_after_preamble() {
        let dir = Path::new(".");
        let req = PreviewRequest {
            class_options: "tikz,border=6pt",
            preamble: "\\usepackage{tikz}\n",
            body: "\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}",
            engine: Engine::Pdflatex,
            workdir: dir,
            out_dir: dir,
            job: "t",
            timeout: Duration::from_secs(1),
            lang: Lang::En,
        };
        let (src, line) = document(&req);
        assert_eq!(src.lines().nth(line - 1).unwrap(), req.body);
        assert!(src.starts_with("\\documentclass[tikz,border=6pt]{standalone}"));
        assert_eq!(border_of(req.class_options), 6.0);
    }

    fn distribution() -> Distribution {
        crate::tex::detect(&[])
            .into_iter()
            .next()
            .expect("a TeX distribution is needed for this test")
    }

    fn compile_body(
        dist: &Distribution,
        out: &Path,
        job: &str,
        options: &str,
        preamble: &str,
        body: &str,
        engine: Engine,
    ) -> PreviewOutcome {
        compile(
            dist,
            &PreviewRequest {
                class_options: options,
                preamble,
                body,
                engine,
                workdir: out,
                out_dir: out,
                job,
                timeout: Duration::from_secs(120),
                lang: Lang::En,
            },
        )
    }

    #[test]
    #[ignore = "needs a TeX distribution"]
    fn every_tikz_template_compiles() {
        let dist = distribution();
        let dir = tempfile::tempdir().unwrap();
        for lang in [Lang::Fr, Lang::En] {
            let project = if lang == Lang::Fr {
                "\\usepackage[T1]{fontenc}\n\\usepackage[french]{babel}\n"
            } else {
                ""
            };
            for t in crate::tikz::templates(lang) {
                let preamble =
                    crate::tikz::preview_preamble(project, &t.packages, &t.libraries, &t.preamble);
                let out = compile_body(
                    &dist,
                    dir.path(),
                    &t.id,
                    "tikz,border=6pt",
                    &preamble,
                    &t.code,
                    Engine::Pdflatex,
                );
                let errors: Vec<_> = out
                    .diagnostics
                    .iter()
                    .filter(|d| d.severity == Severity::Error)
                    .map(|d| &d.message)
                    .collect();
                assert!(
                    out.pdf.is_some() && errors.is_empty(),
                    "{} ({lang:?}): {errors:?}",
                    t.id
                );
                assert!(out.bbox.is_some(), "{}: no bounding box", t.id);
                println!("{:>16} {:?} {} ms", t.id, lang, out.duration_ms);
            }
        }
    }

    #[test]
    #[ignore = "needs a TeX distribution"]
    fn every_tex_font_compiles() {
        let dist = distribution();
        let dir = tempfile::tempdir().unwrap();
        for f in crate::fonts::tex_fonts(Lang::En) {
            let preamble = format!("\\usepackage[T1]{{fontenc}}\n{}", f.code());
            let out = compile_body(
                &dist,
                dir.path(),
                &f.id,
                "border=4pt",
                &preamble,
                "Sphinx of black quartz, judge my vow. \\textbf{Bold} \\textit{italic} $x^2$",
                Engine::Pdflatex,
            );
            let errors: Vec<_> = out
                .diagnostics
                .iter()
                .filter(|d| d.severity == Severity::Error)
                .map(|d| &d.message)
                .collect();
            assert!(
                out.pdf.is_some() && errors.is_empty(),
                "{}: {errors:?}",
                f.id
            );
        }
    }

    #[test]
    #[ignore = "needs a TeX distribution"]
    fn errors_point_to_the_body() {
        let dist = distribution();
        let dir = tempfile::tempdir().unwrap();
        let body = "\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n  \\drawx (0,0) circle (1);\n\\end{tikzpicture}";
        let out = compile_body(
            &dist,
            dir.path(),
            "err",
            "tikz,border=6pt",
            "\\usepackage{tikz}",
            body,
            Engine::Pdflatex,
        );
        let err = out
            .diagnostics
            .iter()
            .find(|d| d.severity == Severity::Error)
            .expect("an error");
        assert_eq!(err.line, Some(3), "{err:?}");
    }

    #[test]
    fn reads_the_bounding_box() {
        assert_eq!(
            bbox_from_log("x\nLBTBBOX:-28.45274pt:-5.0pt:56.9055pt:30.0pt\n"),
            Some([-28.45274, -5.0, 56.9055, 30.0])
        );
        assert_eq!(
            parse_dimen("1cm").map(|v| (v * 100.0).round()),
            Some(2845.0)
        );
    }

    #[test]
    fn project_preamble_keeps_what_previews_need() {
        let src = "\\documentclass[11pt]{report}\n\\usepackage[margin=2cm]{geometry}\n\\usepackage{amsmath,hyperref , xcolor}\n\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta}\n\\addbibresource{refs.bib}\n\\definecolor{brand}{HTML}{E3A857}\n\\newcommand{\\R}{\\mathbb{R}}\n\\title{T}\n\\begin{document}\nx\n\\end{document}\n";
        let p = project_preamble(src);
        assert!(
            !p.contains("geometry")
                && !p.contains("hyperref")
                && !p.contains("refs.bib")
                && !p.contains("\\title")
        );
        assert!(p.contains("\\usepackage{amsmath,xcolor}"));
        assert!(
            p.contains("\\usetikzlibrary{arrows.meta}")
                && p.contains("\\definecolor{brand}")
                && p.contains("\\newcommand{\\R}")
        );
        assert!(!p.contains("documentclass"));
        let multi = "\\documentclass{article}\n\\usepackage[\n  margin=2cm\n]{geometry}\n\\hypersetup{\n  colorlinks\n}\n\\usepackage{tikz}\n\\begin{document}\n";
        let p = project_preamble(multi);
        assert_eq!(p.trim(), "\\usepackage{tikz}");
        assert_eq!(
            filter_packages("\\usepackage[style={a,b}]{hyperref,tikz}").as_deref(),
            Some("\\usepackage[style={a,b}]{tikz}")
        );
    }
}
