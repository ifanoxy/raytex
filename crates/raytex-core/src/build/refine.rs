//! Locating compiler diagnostics precisely in the sources.
//!
//! TeX only reports a line and a fragment of text around the error point.
//! Using the current text of the file, the fragment is found in the line to
//! highlight exactly the offending token (e.g. `\textbff`). Errors reported
//! inside a package are moved to the `\usepackage` that causes them, then
//! every diagnostic gets its fixes ([`crate::fixes`]) and an explanation.

use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;

use crate::diagnostics::{Diagnostic, Fix, Severity};
use crate::fixes::{self, Sources};
use crate::i18n::Lang;
use crate::log::hints;
use crate::text::{LineIndex, Span};

static QUOTED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"`([^']+)'").unwrap());
static SPACE_AFTER_CS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\\[A-Za-z@]+) ").unwrap());
static NAMED_COMMAND: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\\[A-Za-z@]+").unwrap());

/// Locates every diagnostic precisely, then adds fixes and explanations.
/// `root` is the main file of the project.
/// `packages` reads the sources of the installed packages: with it, what a
/// package defines is known even when the knowledge base does not describe it.
pub fn refine_all(
    diags: &mut Vec<Diagnostic>,
    root: &Path,
    source: &dyn Fn(&Path) -> Option<String>,
    packages: Option<super::PackageSource<'_>>,
    lang: Lang,
) {
    let mut sources = Sources::new(root, source).with_packages(packages);
    for d in diags.iter_mut() {
        fixes::relocate(d, &mut sources);
        if d.range.is_none()
            && let Some(file) = d.file.clone()
            && let Some(text) = source(&file)
        {
            let lines = LineIndex::new(&text);
            refine(d, &text, &lines);
        }
        fixes::suggest(d, &mut sources, lang);
        hints::fallback(d, lang);
    }
    drop_math_consequences(diags, source);
    diags.retain(|d| d.code.as_deref() != Some(fixes::CONSEQUENCE));
    drop_what_follows(diags, source);
    drop_unconfirmed(diags, source);
    // Characters that a font lacks, reported without a line: as long as
    // there are errors, they are what TeX printed while going on after
    // them. They come back once the document compiles, if they are real.
    // A character of text in a formula is not in the font of the formulas:
    // TeX then writes the same lines, and they say nothing more.
    let text_in_formula = diags.iter().any(|d| {
        matches!(
            d.code.as_deref(),
            Some("command-invalid-math" | "math-accent")
        ) && d.hint.as_ref().is_some_and(|h| h.advice.is_some())
    });
    if text_in_formula || diags.iter().any(|d| d.severity == Severity::Error) {
        diags.retain(|d| {
            d.line.is_some() || !matches!(d.code.as_deref(), Some("missing-character" | "nullfont"))
        });
    }
}

/// How far after a mistake TeX may still report what follows from it.
const REACH: usize = 30;

/// One mistake, one problem. Once the cause of an error is found, the
/// errors TeX reports next in the same paragraph (it goes on reading from a
/// state the mistake left wrong) are kept only when a cause of their own is
/// found for them; the others come back at the next build if they are real.
/// Two errors that lead to the same place are the same mistake.
fn drop_what_follows(diags: &mut Vec<Diagnostic>, source: &dyn Fn(&Path) -> Option<String>) {
    let explained = |d: &Diagnostic| d.hint.as_ref().is_some_and(|h| h.advice.is_some());
    let compiler = |d: &Diagnostic| {
        d.severity == Severity::Error && d.source == crate::diagnostics::Source::Latex
    };
    let mut dropped = vec![false; diags.len()];
    for i in 0..diags.len() {
        let d = &diags[i];
        let (Some(file), Some(range)) = (&d.file, d.range) else {
            continue;
        };
        if dropped[i] || !compiler(d) || !explained(d) {
            continue;
        }
        let Some(text) = source(file) else { continue };
        let lines = LineIndex::new(&text);
        let blank =
            |l: usize| l >= lines.line_count() || text[lines.line_span(&text, l)].trim().is_empty();
        // The paragraph of the mistake, and the line TeX ends it on.
        let first = range.start.line as usize;
        let mut last = first;
        while !blank(last + 1) && last < first + REACH {
            last += 1;
        }
        // What the package says next about the same thing, without a line.
        for (j, next) in diags.iter().enumerate().skip(i + 1) {
            if next.severity != Severity::Warning || next.line.is_some() || explained(next) {
                break;
            }
            dropped[j] = true;
        }
        for j in 0..diags.len() {
            let next = &diags[j];
            if j == i || dropped[j] || !compiler(next) || next.file.as_ref() != Some(file) {
                continue;
            }
            // Something left open: TeX misreads the structure of what follows.
            if d.swallows && j > i && fixes::about_structure(next) {
                dropped[j] = true;
                continue;
            }
            if explained(next) {
                // The same place found twice.
                dropped[j] = j > i && next.range == d.range;
                continue;
            }
            let Some(line) = next.line.map(|l| l as usize - 1) else {
                continue;
            };
            dropped[j] = j > i && first <= line && line <= last + 1;
        }
        // The warnings of the line of the mistake come from it too, but for
        // a reference or a citation that is not defined.
        for (j, next) in diags.iter().enumerate() {
            let own = matches!(
                next.code.as_deref(),
                Some("undefined-reference" | "undefined-citation" | "multiply-defined")
            );
            let in_formula = next.code.as_deref() == Some("command-invalid-math");
            // A warning whose cause is found is kept, but when it is the
            // place of the error, or text read as a formula because of it.
            let same = if explained(next) {
                next.range == d.range || (in_formula && fixes::about_structure(d))
            } else {
                next.line == d.line || in_formula
            };
            if next.severity == Severity::Warning
                && next.source == crate::diagnostics::Source::Latex
                && next.file.as_ref() == Some(file)
                && !own
                && next
                    .line
                    .is_some_and(|l| (first..=last).contains(&(l as usize - 1)))
                && same
            {
                dropped[j] = true;
            }
        }
    }
    let mut i = 0;
    diags.retain(|_| {
        i += 1;
        !dropped[i - 1]
    });
}

/// How far before a complaint about the structure the error it follows from
/// may be.
const BEFORE: u32 = 40;

/// What TeX says of the structure (a group or an environment closed too
/// early or never, something inserted to go on) after another error, when
/// the source shows nothing of the kind: its braces, formulas and
/// environments are balanced. TeX lost count while going on after the first
/// error; the complaint comes back at the next build if it is real. The
/// same for what TeX itself adds, on the same line, to the message of a
/// package.
fn drop_unconfirmed(diags: &mut Vec<Diagnostic>, source: &dyn Fn(&Path) -> Option<String>) {
    let explained = |d: &Diagnostic| d.hint.as_ref().is_some_and(|h| h.advice.is_some());
    let compiler = |d: &Diagnostic| {
        d.severity == Severity::Error && d.source == crate::diagnostics::Source::Latex
    };
    let mut sound: std::collections::HashMap<std::path::PathBuf, bool> =
        std::collections::HashMap::new();
    let mut dropped = vec![false; diags.len()];
    for j in 0..diags.len() {
        let d = &diags[j];
        let (Some(file), Some(line)) = (&d.file, d.line) else {
            continue;
        };
        if !compiler(d) || explained(d) {
            continue;
        }
        let earlier = |same_line: bool| {
            diags[..j].iter().enumerate().any(|(i, first)| {
                !dropped[i]
                    && compiler(first)
                    && first.file.as_ref() == Some(file)
                    && first.line.is_some_and(|l| {
                        if same_line {
                            l == line && first.message.contains(" Error: ")
                        } else {
                            l + BEFORE >= line
                        }
                    })
            })
        };
        let recovery = d.code.as_deref() == Some("use-mismatch") && earlier(true);
        let structure = fixes::about_structure(d)
            && earlier(false)
            && *sound.entry(file.clone()).or_insert_with(|| {
                source(file).is_some_and(|text| fixes::structure_is_sound(file, &text))
            });
        dropped[j] = recovery || structure;
    }
    let mut i = 0;
    diags.retain(|_| {
        i += 1;
        !dropped[i - 1]
    });
}

/// After `_`, `^` or a math command written in text, TeX opens a formula by
/// itself and closes it at the end of the paragraph. What it reports until
/// there (accents it refuses in a formula, the formula closed by another
/// "Missing $ inserted") is the same mistake: only the first problem, on
/// the character that opened the formula, is kept.
fn drop_math_consequences(diags: &mut Vec<Diagnostic>, source: &dyn Fn(&Path) -> Option<String>) {
    let mut consequence = vec![false; diags.len()];
    for i in 0..diags.len() {
        let d = &diags[i];
        let opened = d.code.as_deref() == Some("missing-dollar")
            && d.hint.as_ref().is_some_and(|h| h.advice.is_some());
        let (Some(file), Some(range)) = (&d.file, d.range) else {
            continue;
        };
        if !opened || consequence[i] {
            continue;
        }
        let Some(text) = source(file) else { continue };
        let lines = LineIndex::new(&text);
        let token = &text[lines.offset(&text, range.start)..lines.offset(&text, range.end)];
        if !(token == "_" || token == "^" || token.starts_with('\\')) {
            continue;
        }
        // The paragraph ends at the next blank line.
        let first = range.start.line as usize;
        let mut last = first;
        while last + 1 < lines.line_count()
            && !text[lines.line_span(&text, last + 1)].trim().is_empty()
        {
            last += 1;
        }
        for j in i + 1..diags.len() {
            let next = &diags[j];
            let Some(line) = next.line.map(|l| l as usize - 1) else {
                continue;
            };
            if next.file.as_ref() != Some(file) || line < first || line > last + 1 {
                break;
            }
            match next.code.as_deref() {
                Some("command-invalid-math" | "math-accent") => consequence[j] = true,
                Some("missing-dollar") => {
                    consequence[j] = true;
                    break;
                }
                _ => {}
            }
        }
    }
    let mut i = 0;
    diags.retain(|_| {
        i += 1;
        !consequence[i - 1]
    });
}

fn refine(d: &mut Diagnostic, text: &str, lines: &LineIndex) {
    // Missing packages have no line: find the \usepackage.
    if d.line.is_none() {
        let wanted = d.fixes.iter().find_map(|f| match f {
            Fix::InstallPackage { file } => Some(
                file.rsplit_once('.')
                    .map_or(file.as_str(), |(s, _)| s)
                    .to_owned(),
            ),
            _ => None,
        });
        if let Some(name) = wanted
            && let Some(span) = find_package_name(text, &name)
        {
            d.range = Some(lines.range(text, span.clone()));
            d.line = Some(lines.line_of(span.start) as u32 + 1);
        }
        return;
    }
    let line = (d.line.unwrap() - 1) as usize;
    if line >= lines.line_count() {
        return;
    }
    let span = lines.line_span(text, line);
    let line_text = &text[span.clone()];

    if let Some(end_line) = d.end_line {
        let end = lines.line_span(
            text,
            (end_line as usize)
                .saturating_sub(1)
                .min(lines.line_count() - 1),
        );
        d.range = Some(lines.range(text, trim_span(text, span.start..end.end)));
        return;
    }

    // Quoted names in warnings: "Reference `sec:x' on page 1 undefined".
    if d.context_before.is_none()
        && let Some(m) = QUOTED.captures(&d.message)
    {
        if let Some(i) = line_text.find(&m[1]) {
            let s = span.start + i;
            d.range = Some(lines.range(text, s..s + m[1].len()));
            return;
        }
        // The line of a warning is where a statement ends: the name may be
        // some lines above, in the same paragraph (`\hypersetup{` … `}`).
        let mut first = line;
        while first > 0
            && line - first < 20
            && !text[lines.line_span(text, first - 1)].trim().is_empty()
        {
            first -= 1;
        }
        let above = lines.line_span(text, first).start..span.start;
        if let Some(i) = text[above.clone()].rfind(&m[1]) {
            let s = above.start + i;
            d.range = Some(lines.range(text, s..s + m[1].len()));
            d.line = Some(lines.line_of(s) as u32 + 1);
            return;
        }
    }

    // Commands named in a warning ("Foreign command \over; \frac or \genfrac
    // should be used instead"): the first of them written on the line.
    if d.context_before.is_none() {
        for m in NAMED_COMMAND.find_iter(&d.message) {
            if let Some(i) = find_command(line_text, m.as_str()) {
                let s = span.start + i;
                d.range = Some(lines.range(text, s..s + m.as_str().len()));
                return;
            }
        }
    }

    let found = d
        .context_before
        .as_deref()
        .and_then(|before| locate(line_text, before));
    let Some(point) = found else {
        d.range = Some(lines.range(text, trim_span(text, span)));
        return;
    };
    let bytes = line_text.as_bytes();
    let mut start = point;
    if d.code.as_deref() == Some("undefined-control-sequence")
        || (start > 0
            && bytes[..start]
                .iter()
                .rev()
                .take_while(|b| b.is_ascii_alphabetic())
                .count()
                > 0)
    {
        while start > 0 && bytes[start - 1].is_ascii_alphabetic() {
            start -= 1;
        }
        if start > 0 && bytes[start - 1] == b'\\' {
            start -= 1;
        }
    }
    if start == point {
        // Highlight the character before (or at) the error point.
        if point > 0 {
            start = crate::text::floor_char_boundary(line_text, point - 1);
        } else {
            let end = line_text
                .char_indices()
                .nth(1)
                .map_or(line_text.len(), |(i, _)| i);
            d.range = Some(lines.range(text, span.start..span.start + end));
            return;
        }
    }
    let token = span.start + start..span.start + point;
    d.range = Some(lines.range(text, token));
}

/// Where the command `name` (`\over`, not `\overline`) is written in `line`.
fn find_command(line: &str, name: &str) -> Option<usize> {
    line.match_indices(name).map(|(i, _)| i).find(|&i| {
        !line[i + name.len()..].starts_with(|c: char| c.is_ascii_alphabetic() || c == '@')
    })
}

/// Byte offset in `line` where TeX's context fragment `before` ends.
fn locate(line: &str, before: &str) -> Option<usize> {
    let before = before.trim_start_matches("...");
    let variants = [
        before.to_owned(),
        SPACE_AFTER_CS.replace_all(before, "$1").into_owned(),
    ];
    for v in &variants {
        let v = v.trim_start();
        // Longest suffix of the fragment present in the line.
        let chars: Vec<(usize, char)> = v.char_indices().collect();
        for (i, _) in chars.iter().take(chars.len().saturating_sub(1).max(1)) {
            let suffix = &v[*i..];
            if suffix.chars().count() < 2 && v.chars().count() >= 2 {
                break;
            }
            if let Some(pos) = line.rfind(suffix) {
                return Some(pos + suffix.len());
            }
        }
    }
    if before.trim().is_empty() {
        return Some(0);
    }
    None
}

fn trim_span(text: &str, span: Span) -> Span {
    let s = &text[span.clone()];
    let start = span.start + (s.len() - s.trim_start().len());
    let end = span.end - (s.len() - s.trim_end().len());
    if end > start { start..end } else { span }
}

fn find_package_name(text: &str, name: &str) -> Option<Span> {
    for cmd in ["\\usepackage", "\\RequirePackage", "\\documentclass"] {
        let mut from = 0;
        while let Some(i) = text[from..].find(cmd) {
            let start = from + i;
            from = start + cmd.len();
            let rest = &text[from..];
            let Some(open) = rest.find('{') else { continue };
            let Some(close) = rest[open..].find('}') else {
                continue;
            };
            let args = &rest[open + 1..open + close];
            if let Some(j) = args.split(',').map(str::trim).position(|a| a == name) {
                let offset = args.find(args.split(',').nth(j).unwrap()).unwrap();
                let piece = args.split(',').nth(j).unwrap();
                let lead = piece.len() - piece.trim_start().len();
                let s = from + open + 1 + offset + lead;
                return Some(s..s + name.len());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::{Severity, Source};
    use std::path::PathBuf;

    fn diag(message: &str, line: u32, before: Option<&str>) -> Diagnostic {
        let mut d = Diagnostic::new(Severity::Error, Source::Latex, message);
        d.line = Some(line);
        d.context_before = before.map(str::to_owned);
        d.file = Some(PathBuf::from("/p/main.tex"));
        crate::log::hints::enrich(&mut d, Lang::En);
        d
    }

    #[test]
    fn precise_ranges() {
        let text = "\\documentclass{article}\n\\usepackage{amsmath, nonexistentpkg}\nVoici une commande inconnue \\textbff{gras}.\n$\\frac{1}{2$ fin\nSee \\ref{sec:nope} here.\n";
        let source = |_: &Path| Some(text.to_owned());
        let mut ds = vec![
            diag(
                "Undefined control sequence.",
                3,
                Some("Voici une commande inconnue \\textbff"),
            ),
            diag("Missing $ inserted.", 4, Some("$\\frac {1}{2")),
            diag(
                "Reference `sec:nope' on page 1 undefined on input line 5.",
                5,
                None,
            ),
            {
                let mut d = diag("LaTeX Error: File `nonexistentpkg.sty' not found.", 1, None);
                d.line = None;
                d
            },
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        let r = ds[0].range.unwrap();
        assert_eq!(
            (r.start.line, r.start.character, r.end.character),
            (2, 28, 36)
        );
        assert!(
            matches!(&ds[0].fixes[0], Fix::Edits { edits, .. } if edits[0].text == "\\textbf"),
            "{:?}",
            ds[0].fixes
        );
        // "Missing $ inserted": a symptom of the brace that is not closed.
        let r = ds[1].range.unwrap();
        assert_eq!(
            (r.start.line, r.start.character, r.end.character),
            (3, 9, 10)
        );
        let r = ds[2].range.unwrap();
        assert_eq!((r.start.character, r.end.character), (9, 17));
        let r = ds[3].range.unwrap();
        assert_eq!(
            (r.start.line, r.start.character, r.end.character),
            (1, 21, 35)
        );
        assert_eq!(ds[3].line, Some(2));
    }

    fn shown(text: &str, d: &Diagnostic) -> String {
        let lines = LineIndex::new(text);
        let r = d.range.unwrap();
        text[lines.offset(text, r.start)..lines.offset(text, r.end)].to_owned()
    }

    #[test]
    fn the_cause_is_shown_where_it_is() {
        let text = "\\documentclass{article}\n\\begin{document}\nAvant.\\vspace{abc} Après.\n\n\\includegraphics{plan.v2.png}\n\n\\espace{abc}\n\\end{document}\n";
        let source = |_: &Path| Some(text.to_owned());
        let number = |line: u32, before: &str| {
            let mut d = diag("Missing number, treated as zero.", line, Some(before));
            d.raw = Some(format!(
                "! Missing number, treated as zero.\n<to be read again> \n                   a\nl.{line} {before}"
            ));
            d
        };
        let mut ds = vec![
            number(3, "Avant.\\vspace{abc}"),
            diag(
                "LaTeX Error: Unknown graphics extension: .v2.png.",
                5,
                Some("\\includegraphics{plan.v2.png}"),
            ),
            number(7, "\\espace{abc}"),
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        let advice = |d: &Diagnostic| d.hint.as_ref().and_then(|h| h.advice.clone());
        // The value that is not a length, and what is wrong with it.
        assert_eq!(shown(text, &ds[0]), "abc");
        assert!(
            advice(&ds[0]).is_some_and(|a| a.starts_with("`\\vspace` expects a length")),
            "{:?}",
            ds[0].hint
        );
        // A dot in the name of an image, with the way to write it.
        assert_eq!(shown(text, &ds[1]), "plan.v2.png");
        assert!(advice(&ds[1]).is_some_and(|a| a.contains("holds a dot")));
        assert!(
            matches!(&ds[1].fixes[0], Fix::Edits { edits, .. } if edits[0].text == "{plan.v2}.png")
        );
        // A command of the document: its whole call is shown, and nothing
        // is said about a cause that cannot be told.
        assert_eq!(shown(text, &ds[2]), "\\espace{abc}");
        assert_eq!(advice(&ds[2]), None);
        // The explanation never names a cause.
        assert_eq!(
            ds[2].hint.as_ref().unwrap().explanation,
            ds[0].hint.as_ref().unwrap().explanation
        );
    }

    #[test]
    fn the_cause_is_read_in_the_source_whatever_the_message() {
        let text = "\\documentclass{article}\n\\begin{document}\n\\begin{equation}$ a = b $\\end{equation}\n\nSoit $\\frac{1}$ ici.\n\nUn texte sans faute.\n\\end{document}\n";
        let source = |_: &Path| Some(text.to_owned());
        let mut ds = vec![
            // A message the catalogue does not know, for a `$` in an equation.
            diag(
                "Missing \\endgroup inserted.",
                3,
                Some("\\begin{equation}$"),
            ),
            // What TeX reports next in the same paragraph is the same mistake.
            diag(
                "You can't use `\\eqno' in math mode.",
                3,
                Some("\\begin{equation}$ a = b $\\end{equation}"),
            ),
            // "Missing } inserted" for an argument that is not written.
            diag("Missing } inserted.", 5, Some("Soit $\\frac{1}$")),
            // What TeX says of the structure after these, where the source
            // shows nothing wrong: it lost count, and this is not listed.
            diag("Missing \\endgroup inserted.", 7, Some("Un texte")),
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        assert_eq!(ds.len(), 2, "{ds:#?}");
        // Alone, nothing wrong in the source: the message is read by its
        // shape, or left as TeX wrote it. Nothing says it is not understood.
        let mut alone = vec![
            diag("Missing \\endgroup inserted.", 7, Some("Un texte")),
            diag(
                "Something TeX says that nobody knows.",
                7,
                Some("Un texte sans"),
            ),
        ];
        refine_all(
            &mut alone,
            Path::new("/p/main.tex"),
            &source,
            None,
            Lang::En,
        );
        ds.extend(alone);
        assert_eq!(ds.len(), 4, "{ds:#?}");
        let hint = |d: &Diagnostic| d.hint.clone().unwrap();
        assert_eq!(shown(text, &ds[0]), "$");
        assert_eq!(hint(&ds[0]).title, "`$` inside a formula");
        assert!(hint(&ds[0]).advice.unwrap().contains("`equation`"));
        assert!(matches!(&ds[0].fixes[0], Fix::Edits { edits, .. } if edits.len() == 2));
        assert_eq!(shown(text, &ds[1]), "\\frac{1}");
        assert_eq!(hint(&ds[1]).title, "Missing argument");
        assert!(
            hint(&ds[1])
                .advice
                .unwrap()
                .contains("`{denominator}` is missing")
        );
        assert_eq!(hint(&ds[2]).title, "Missing `\\endgroup`");
        assert_eq!(hint(&ds[2]).advice, None);
        assert!(hint(&ds[2]).explanation.contains("added it by itself"));
        assert_eq!(ds[3].hint, None);
    }

    fn warning(message: &str, line: Option<u32>) -> Diagnostic {
        let mut d = Diagnostic::new(Severity::Warning, Source::Latex, message);
        d.line = line;
        d.file = Some(PathBuf::from("/p/main.tex"));
        crate::log::hints::enrich(&mut d, Lang::En);
        d
    }

    #[test]
    fn a_warning_is_placed_on_what_causes_it() {
        let text = "\\documentclass[a4papr]{article}\n\\usepackage{amsmath}\n\\begin{document}\n$Écrivez ici$ puis $\\'e$ et $90°$.\nSoit $a \\over b$ et $\\text{été} + \\Large x$.\n\\end{document}\n";
        let source = |_: &Path| Some(text.to_owned());
        let mut ds = vec![
            warning("Command \\' invalid in math mode on input line 4.", Some(4)),
            warning(
                "Command \\textdegree invalid in math mode on input line 4.",
                Some(4),
            ),
            warning("Missing character: There is no É in font cmr10!", None),
            warning(
                "amsmath: Foreign command \\over; \\frac or \\genfrac should be used instead on input line 5.",
                Some(5),
            ),
            warning(
                "Font: Command \\Large invalid in math mode on input line 5.",
                Some(5),
            ),
            warning("Unused global option(s): [a4papr].", None),
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        // The character the font of formulas lacks is the same problem.
        assert_eq!(ds.len(), 5, "{ds:#?}");
        let hint = |d: &Diagnostic| d.hint.clone().unwrap();
        // The word with the accent, not the line; text goes in \text{…}.
        assert_eq!(shown(text, &ds[0]), "Écrivez");
        assert_eq!(hint(&ds[0]).title, "Accented text in a formula");
        assert!(
            hint(&ds[0])
                .advice
                .unwrap()
                .contains("The word `Écrivez` goes in `\\text{…}`")
        );
        assert!(matches!(
            &ds[0].fixes[0],
            Fix::Edits { edits, .. } if edits[0].text == "\\text{Écrivez}"
        ));
        assert_eq!(shown(text, &ds[1]), "°");
        assert!(hint(&ds[1]).advice.unwrap().contains("`^\\circ`"));
        // A command the warning names, where it is written.
        assert_eq!(shown(text, &ds[2]), "\\over");
        // `\text{été}` is text: the accent is not there, `\Large` is.
        assert_eq!(shown(text, &ds[3]), "\\Large");
        assert_eq!(hint(&ds[3]).title, "Text command in a formula");
        // An option nobody took, with the one that exists.
        assert_eq!(shown(text, &ds[4]), "a4papr");
        assert!(hint(&ds[4]).advice.unwrap().contains("`a4paper`"));
    }

    #[test]
    fn macros_of_the_document_are_explained_like_the_others() {
        let text = "\\documentclass{article}\n\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand*{\\paire}[2]{(#1, #2)}\n\\begin{document}\nSoit \\R ici.\n\nLe couple \\paire{a}\n\nFin.\n\\end{document}\n";
        let source = |_: &Path| Some(text.to_owned());
        let mut ds = vec![
            diag(
                "LaTeX Error: \\mathbb allowed only in math mode.",
                5,
                Some("Soit \\R"),
            ),
            diag("Paragraph ended before \\paire was complete.", 8, Some("")),
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        assert_eq!(ds.len(), 2, "{ds:#?}");
        let advice = |d: &Diagnostic| d.hint.clone().unwrap().advice.unwrap();
        assert_eq!(shown(text, &ds[0]), "\\R");
        assert!(
            advice(&ds[0])
                .contains("`\\R` is defined with `\\mathbb`, which only exists in a formula"),
            "{}",
            advice(&ds[0])
        );
        assert_eq!(shown(text, &ds[1]), "\\paire{a}");
        assert!(
            advice(&ds[1])
                .contains("`\\paire` is written `\\paire{…}{…}`: its argument 2 is missing"),
            "{}",
            advice(&ds[1])
        );
    }

    #[test]
    fn a_package_of_the_project_is_read_like_its_documents() {
        let main = "\\documentclass{article}\n\\usepackage{macros}\n\\begin{document}\nLe vecteur \\vect{AB} ici.\n\\end{document}\n";
        let package = "\\ProvidesPackage{macros}\n\\newcommand{\\vect}[1]{\\vec{#1}}\n";
        let source = |p: &Path| match p.file_name()?.to_str()? {
            "main.tex" => Some(main.to_owned()),
            "macros.sty" => Some(package.to_owned()),
            _ => None,
        };
        let mut ds = vec![diag(
            "Missing $ inserted.",
            4,
            Some("Le vecteur \\vect{AB}"),
        )];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        let advice = ds[0].hint.clone().unwrap().advice.unwrap();
        assert_eq!(shown(main, &ds[0]), "\\vect");
        assert!(
            advice.contains("`\\vect` is defined with `\\vec`"),
            "{advice}"
        );
    }

    #[test]
    fn an_unknown_command_is_shown_where_it_is_written() {
        let text = "\\documentclass{article}\n\\begin{document}\n\\newcommand{\\R}{\\mathbb{R}}\n\\paire{10}\n\n\\R\n\nUn \\textbf{mot \\inconnue ici}.\n\\end{document}\n";
        let source = |_: &Path| Some(text.to_owned());
        let with_raw = |mut d: Diagnostic, raw: &str| {
            d.raw = Some(raw.to_owned());
            d.hint = None;
            d.code = None;
            crate::log::hints::enrich(&mut d, Lang::En);
            d
        };
        let mut ds = vec![
            diag("Undefined control sequence.", 4, Some("\\paire")),
            // TeX shows what `\R` is made of above the line of the document.
            with_raw(
                diag("Undefined control sequence.", 6, Some("\\R")),
                "! Undefined control sequence.\n\\R ->\\mathbb \n             {R}\nl.6 \\R\n       ",
            ),
            // And the argument it is reading.
            with_raw(
                diag(
                    "Undefined control sequence.",
                    8,
                    Some("Un \\textbf{mot \\inconnue ici}"),
                ),
                "! Undefined control sequence.\n<argument> mot \\inconnue \n                        ici\nl.8 Un \\textbf{mot \\inconnue ici}\n                                .",
            ),
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        assert_eq!(ds.len(), 3, "{ds:#?}");
        // No name is close enough to `\paire`: `\par` is not offered.
        assert_eq!(shown(text, &ds[0]), "\\paire");
        assert_eq!(ds[0].hint.clone().unwrap().advice, None);
        assert!(ds[0].fixes.is_empty(), "{:?}", ds[0].fixes);
        // `\mathbb`, in the definition of `\R`, with the package it needs.
        assert_eq!(shown(text, &ds[1]), "\\mathbb");
        assert_eq!(ds[1].range.unwrap().start.line, 2);
        let advice = ds[1].hint.clone().unwrap().advice.unwrap();
        assert!(
            advice.contains("is written in the definition of `\\R`, which line 6 uses")
                && advice.contains("`amsfonts`"),
            "{advice}"
        );
        assert_eq!(
            ds[1].fixes,
            vec![Fix::AddPackage {
                package: "amsfonts".into(),
                options: None
            }]
        );
        assert_eq!(shown(text, &ds[2]), "\\inconnue");
    }

    #[test]
    fn what_follows_a_formula_tex_opened_is_dropped() {
        let text = "\\documentclass{article}\n\\begin{document}\nLe fichier mon_fichier est prêt.\n\\end{document}\n";
        let source = |_: &Path| Some(text.to_owned());
        let mut ds = vec![
            diag("Missing $ inserted.", 3, Some("Le fichier mon_")),
            diag(
                "Please use \\mathaccent for accents in math mode.",
                3,
                Some("Le fichier mon_fichier est prê"),
            ),
            diag("Missing $ inserted.", 4, Some("\\end{document}")),
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, None, Lang::En);
        assert_eq!(ds.len(), 1, "{ds:#?}");
        assert_eq!(shown(text, &ds[0]), "_");
    }
}
