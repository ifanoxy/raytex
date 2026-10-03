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

/// Locates every diagnostic precisely, then adds fixes and explanations.
/// `root` is the main file of the project.
pub fn refine_all(
    diags: &mut Vec<Diagnostic>,
    root: &Path,
    source: &dyn Fn(&Path) -> Option<String>,
    lang: Lang,
) {
    let mut sources = Sources::new(root, source);
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
    // Characters that a font lacks, reported without a line: as long as
    // there are errors, they are what TeX printed while going on after
    // them. They come back once the document compiles, if they are real.
    if diags.iter().any(|d| d.severity == Severity::Error) {
        diags.retain(|d| {
            d.line.is_some() || !matches!(d.code.as_deref(), Some("missing-character" | "nullfont"))
        });
    }
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
        && let Some(i) = line_text.find(&m[1])
    {
        let s = span.start + i;
        d.range = Some(lines.range(text, s..s + m[1].len()));
        return;
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
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, Lang::En);
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
        let r = ds[1].range.unwrap();
        assert_eq!((r.start.line, r.end.character), (3, 11));
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
        let text = "\\documentclass{article}\n\\begin{document}\nAvant.\\vspace{abc} Après.\n\\includegraphics{plan.v2.png}\n\\espace{abc}\n\\end{document}\n";
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
                4,
                Some("\\includegraphics{plan.v2.png}"),
            ),
            number(5, "\\espace{abc}"),
        ];
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, Lang::En);
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
        refine_all(&mut ds, Path::new("/p/main.tex"), &source, Lang::En);
        assert_eq!(ds.len(), 1, "{ds:#?}");
        assert_eq!(shown(text, &ds[0]), "_");
    }
}
