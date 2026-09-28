//! Edits of LaTeX text: the preamble (packages, options, lines, TikZ
//! libraries, magic comments) and small scanners. The editor has the same
//! preamble functions (`ui/lib/preamble.ts`) to apply fixes to its current
//! text; these ones apply fixes outside the editor (tests, command line).

use std::sync::LazyLock;

use regex::Regex;

/// Replaces comments by spaces: offsets stay valid, commented code is ignored.
pub fn mask(text: &str) -> String {
    let b = text.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'\\' => {
                out.push(b'\\');
                if let Some(&next) = b.get(i + 1) {
                    out.push(next);
                }
                i += 2;
            }
            b'%' => {
                while i < b.len() && b[i] != b'\n' {
                    out.push(b' ');
                    i += 1;
                }
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_owned())
}

/// Offset of `\begin{document}` (the end of the preamble), or the text length.
pub fn preamble_end(text: &str) -> usize {
    mask(text).find("\\begin{document}").unwrap_or(text.len())
}

/// One `\usepackage` of the preamble.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoadedPackage {
    /// Package names.
    pub names: Vec<String>,
    /// Options as written.
    pub options: String,
    /// Byte range of the command.
    pub from: usize,
    /// End of the command.
    pub to: usize,
}

static PACKAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}").unwrap()
});

/// Every `\usepackage` of the preamble.
pub fn loaded_packages(text: &str) -> Vec<LoadedPackage> {
    let masked = mask(text);
    let code = &masked[..preamble_end(text)];
    PACKAGE
        .captures_iter(code)
        .map(|m| {
            let all = m.get(0).unwrap();
            LoadedPackage {
                names: m[2]
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
                    .collect(),
                options: m.get(1).map_or(String::new(), |o| o.as_str().to_owned()),
                from: all.start(),
                to: all.end(),
            }
        })
        .collect()
}

/// Whether the preamble loads `name`.
pub fn has_package(text: &str, name: &str) -> bool {
    loaded_packages(text)
        .iter()
        .any(|p| p.names.iter().any(|n| n == name))
}

/// End of the line containing `offset` (before the newline).
pub fn line_end(text: &str, offset: usize) -> usize {
    text[offset..].find('\n').map_or(text.len(), |i| offset + i)
}

/// Start of the line containing `offset`.
pub fn line_start(text: &str, offset: usize) -> usize {
    text[..offset].rfind('\n').map_or(0, |i| i + 1)
}

/// Packages that must stay after the others.
const LOAD_LAST: &[&str] = &[
    "hyperref",
    "cleveref",
    "bookmark",
    "autonum",
    "glossaries",
    "glossaries-extra",
];

/// Where new preamble lines go: after the last `\usepackage` but before
/// hyperref (and friends, which must come last); else after `\documentclass`.
pub fn insertion_point(text: &str) -> Option<usize> {
    let packages = loaded_packages(text);
    let last = packages
        .iter()
        .position(|p| p.names.iter().any(|n| LOAD_LAST.contains(&n.as_str())));
    match last {
        Some(i) if i > 0 => return Some(line_end(text, packages[i - 1].to)),
        Some(_) => {
            let start = line_start(text, packages[0].from);
            return (start > 0).then(|| start - 1);
        }
        None => {}
    }
    if let Some(p) = packages.last() {
        return Some(line_end(text, p.to));
    }
    let code = mask(text);
    let class = code.find("\\documentclass")?;
    (class < preamble_end(text)).then(|| line_end(text, class))
}

fn insert_at(text: &str, at: usize, s: &str) -> String {
    format!("{}{s}{}", &text[..at], &text[at..])
}

/// Loads `name` (with `options`) unless it is loaded.
pub fn add_package(text: &str, name: &str, options: Option<&str>) -> Option<String> {
    if has_package(text, name) {
        return Some(text.to_owned());
    }
    let at = insertion_point(text)?;
    let options = options.map(|o| format!("[{o}]")).unwrap_or_default();
    Some(insert_at(
        text,
        at,
        &format!("\n\\usepackage{options}{{{name}}}"),
    ))
}

/// Adds an option to a loaded package, or loads it with the option.
pub fn add_package_option(text: &str, name: &str, option: &str) -> Option<String> {
    let packages = loaded_packages(text);
    let Some(pkg) = packages.iter().find(|p| p.names.iter().any(|n| n == name)) else {
        return add_package(text, name, Some(option));
    };
    let mut options: Vec<&str> = pkg
        .options
        .split(',')
        .map(str::trim)
        .filter(|o| !o.is_empty())
        .collect();
    if options.contains(&option) {
        return Some(text.to_owned());
    }
    options.push(option);
    let code = format!("\\usepackage[{}]{{{name}}}", options.join(","));
    let replacement = if pkg.names.len() > 1 {
        // Options of a line loading several packages apply to all of them:
        // the package gets a line of its own.
        let others: Vec<&str> = pkg
            .names
            .iter()
            .map(String::as_str)
            .filter(|n| *n != name)
            .collect();
        let opts = if pkg.options.is_empty() {
            String::new()
        } else {
            format!("[{}]", pkg.options)
        };
        format!("\\usepackage{opts}{{{}}}\n{code}", others.join(","))
    } else {
        code
    };
    Some(format!(
        "{}{replacement}{}",
        &text[..pkg.from],
        &text[pkg.to..]
    ))
}

/// Adds a line after package `after` (when loaded) or after the other
/// packages, unless the preamble already has it.
pub fn add_line(text: &str, line: &str, after: Option<&str>) -> Option<String> {
    let masked = mask(text);
    let code = &masked[..preamble_end(text)];
    if code.contains(line.trim()) {
        return Some(text.to_owned());
    }
    let anchor = after.and_then(|a| {
        loaded_packages(text)
            .into_iter()
            .find(|p| p.names.iter().any(|n| n == a))
    });
    let at = match anchor {
        Some(p) => line_end(text, p.to),
        None => insertion_point(text)?,
    };
    Some(insert_at(text, at, &format!("\n{line}")))
}

static TIKZ_LIBRARIES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\usetikzlibrary\s*\{([^}]*)\}").unwrap());

/// Adds a TikZ library to the existing `\usetikzlibrary`, or a new one after TikZ.
pub fn add_tikz_library(text: &str, library: &str) -> Option<String> {
    let masked = mask(text);
    let code = &masked[..preamble_end(text)];
    let mut last = None;
    for m in TIKZ_LIBRARIES.captures_iter(code) {
        if m[1].split(',').any(|l| l.trim() == library) {
            return Some(text.to_owned());
        }
        last = Some((m.get(0).unwrap().end() - 1, m[1].trim().is_empty()));
    }
    if let Some((close, empty)) = last {
        let sep = if empty { "" } else { "," };
        return Some(insert_at(text, close, &format!("{sep}{library}")));
    }
    let tikz = loaded_packages(text).into_iter().rfind(|p| {
        p.names
            .iter()
            .any(|n| ["tikz", "pgfplots", "circuitikz", "tikz-cd"].contains(&n.as_str()))
    });
    let at = match tikz {
        Some(p) => line_end(text, p.to),
        None => insertion_point(text)?,
    };
    Some(insert_at(
        text,
        at,
        &format!("\n\\usetikzlibrary{{{library}}}"),
    ))
}

/// Sets the `% !TEX program` magic comment.
pub fn set_magic_program(text: &str, engine: &str) -> String {
    let magic = format!("% !TEX program = {engine}");
    let re = Regex::new(r"(?i)^%\s*!\s*TEX\s+(TS-)?program\s*=").unwrap();
    let mut offset = 0;
    for line in text.split_inclusive('\n').take(20) {
        if re.is_match(line) {
            let end = offset + line.trim_end_matches(['\n', '\r']).len();
            return format!("{}{magic}{}", &text[..offset], &text[end..]);
        }
        offset += line.len();
    }
    format!("{magic}\n{text}")
}

/// End of the content of a line (before a comment and trailing spaces).
pub fn content_end(line: &str) -> usize {
    let code = match crate::syntax::context::comment_start(line) {
        Some(c) => &line[..c],
        None => line,
    };
    code.trim_end().len()
}

/// Edit distance where swapping two neighbouring letters counts as one
/// edit (`widht` → `width`), like most typing mistakes.
pub fn distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut d = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in d[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            d[i][j] = (d[i - 1][j] + 1)
                .min(d[i][j - 1] + 1)
                .min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[a.len()][b.len()]
}

/// The closest candidate to `word` (edit distance ≤ a third of its length,
/// at most `max`), ignoring `word` itself.
pub fn closest<'a>(
    word: &str,
    candidates: impl IntoIterator<Item = &'a str>,
    max: usize,
) -> Option<&'a str> {
    let limit = (word.chars().count() / 3).clamp(1, max);
    let lower = word.to_lowercase();
    candidates
        .into_iter()
        .filter(|c| *c != word)
        .map(|c| {
            // Case differences count less than spelling mistakes.
            let d = if c.to_lowercase() == lower {
                0
            } else {
                distance(&lower, &c.to_lowercase())
            };
            (d, c)
        })
        .filter(|(d, _)| *d <= limit)
        .min_by(|a, b| {
            a.0.cmp(&b.0)
                .then(a.1.len().cmp(&b.1.len()))
                .then(a.1.cmp(b.1))
        })
        .map(|(_, c)| c)
}

/// Where the brace opened at `open` is closed: at the end of its line when
/// the argument starts on it, else at the end of its paragraph.
pub fn brace_close_at(text: &str, open: usize) -> usize {
    let end = line_end(text, open);
    if text
        .get(open + 1..end)
        .is_some_and(|rest| !rest.trim().is_empty())
    {
        return line_start(text, open) + content_end(&text[line_start(text, open)..end]);
    }
    let mut last = (line_start(text, open), end);
    let mut at = end;
    while at < text.len() {
        let start = at + 1;
        let stop = line_end(text, start);
        if text[start..stop].trim().is_empty() {
            break;
        }
        last = (start, stop);
        at = stop;
    }
    last.0 + content_end(&text[last.0..last.1])
}

/// Where `\end{…}` goes for an environment whose `\begin` ends at
/// `begin_end`: before the first blank line after it, else before
/// `\end{document}`, else at the end of the text. Always a line start.
pub fn env_close_at(text: &str, begin_end: usize) -> usize {
    let masked = mask(text);
    let end_doc = masked[begin_end..]
        .find("\\end{document}")
        .map(|i| line_start(text, begin_end + i));
    let limit = end_doc.unwrap_or(text.len());
    let mut at = line_end(text, begin_end);
    while at < limit {
        let start = at + 1;
        let stop = line_end(text, start);
        if start >= limit {
            break;
        }
        if text[start..stop].trim().is_empty() {
            return start;
        }
        at = stop;
    }
    end_doc.unwrap_or(text.len())
}

/// End (exclusive) of a balanced `{…}` group starting at `open`.
pub fn group_end(text: &str, open: usize) -> Option<usize> {
    let b = text.as_bytes();
    if b.get(open) != Some(&b'{') {
        return None;
    }
    let mut depth = 0;
    let mut i = open;
    while i < b.len() {
        match b[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i + 1);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Start of a balanced `{…}` group ending at `close` (the `}`).
pub fn group_start(text: &str, close: usize) -> Option<usize> {
    let b = text.as_bytes();
    if b.get(close) != Some(&b'}') {
        return None;
    }
    let mut depth = 0;
    let mut i = close as isize;
    while i >= 0 {
        let c = b[i as usize];
        let escaped = i > 0 && b[i as usize - 1] == b'\\';
        if !escaped {
            if c == b'}' {
                depth += 1;
            } else if c == b'{' {
                depth -= 1;
                if depth == 0 {
                    return Some(i as usize);
                }
            }
        }
        i -= 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOC: &str = "\\documentclass{article}\n\\usepackage[T1]{fontenc}\n% \\usepackage{tikz}\n\\usepackage{amsmath,xcolor}\n\\usepackage{hyperref}\n\\begin{document}\nx\n\\end{document}\n";

    #[test]
    fn preamble_edits() {
        assert!(has_package(DOC, "xcolor"));
        assert!(!has_package(DOC, "tikz"), "commented");
        let t = add_package(DOC, "graphicx", None).unwrap();
        assert!(t.contains(
            "\\usepackage{amsmath,xcolor}\n\\usepackage{graphicx}\n\\usepackage{hyperref}"
        ));
        let t = add_package_option(DOC, "xcolor", "dvipsnames").unwrap();
        assert!(t.contains("\\usepackage{amsmath}\n\\usepackage[dvipsnames]{xcolor}"));
        let t = add_line(DOC, "\\pgfplotsset{compat=1.18}", Some("fontenc")).unwrap();
        assert!(t.contains("{fontenc}\n\\pgfplotsset{compat=1.18}\n"));
        let t = add_tikz_library(&add_package(DOC, "tikz", None).unwrap(), "calc").unwrap();
        assert!(t.contains("\\usepackage{tikz}\n\\usetikzlibrary{calc}"));
        let t = add_tikz_library(&t, "positioning").unwrap();
        assert!(t.contains("\\usetikzlibrary{calc,positioning}"));
        let t = set_magic_program(DOC, "lualatex");
        assert!(t.starts_with("% !TEX program = lualatex\n\\documentclass"));
        assert_eq!(
            set_magic_program(&t, "xelatex").lines().next(),
            Some("% !TEX program = xelatex")
        );
    }

    #[test]
    fn helpers() {
        assert_eq!(
            closest("itemise", ["itemize", "enumerate"], 3),
            Some("itemize")
        );
        assert_eq!(closest("widht", ["width", "height"], 3), Some("width"));
        assert_eq!(distance("sectoin", "section"), 1);
        assert_eq!(
            closest("forestgreen", ["ForestGreen"], 3),
            Some("ForestGreen")
        );
        assert_eq!(closest("xyz", ["itemize"], 3), None);
        assert_eq!(content_end("a & b   % comment"), 5);
        let t = "a \\textbf{gras\nsuite\n\nb";
        assert_eq!(brace_close_at(t, 9), 14, "end of the line");
        let t = "\\newcommand{\\x}{\n  corps\n\nfin";
        assert_eq!(
            brace_close_at(t, 15),
            t.find("corps").unwrap() + 5,
            "end of the paragraph"
        );
        let t = "\\begin{itemize}\n\\item a\n\nFin\n\\end{document}\n";
        assert_eq!(env_close_at(t, 15), t.find("\n\nFin").unwrap() + 1);
        let t = "\\begin{itemize}\n\\item a\n\\end{document}\n";
        assert_eq!(env_close_at(t, 15), t.find("\\end{document}").unwrap());
        let t = "\\frac{a}{b{c}}";
        assert_eq!(group_end(t, 8), Some(t.len()));
        assert_eq!(group_start(t, t.len() - 1), Some(8));
    }
}
