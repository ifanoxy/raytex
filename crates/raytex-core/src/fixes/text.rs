//! Edits of LaTeX text: the preamble (packages, options, lines, TikZ
//! libraries, magic comments) and small scanners. The editor has the same
//! preamble functions (`ui/lib/preamble.ts`) to apply fixes to its current
//! text; these ones apply fixes outside the editor (tests, command line).

use std::sync::LazyLock;

use regex::Regex;

use crate::kb::Mode;
use crate::text::Span;

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
/// at most `max`), ignoring `word` itself. A name of one or two characters
/// is close to too many others (`\\R` and `\\P`, `\\r` and `\\R`): nothing is
/// offered for it.
pub fn closest<'a>(
    word: &str,
    candidates: impl IntoIterator<Item = &'a str>,
    max: usize,
) -> Option<&'a str> {
    let length = word.chars().count();
    if length <= 2 {
        return None;
    }
    let limit = (length / 3).clamp(1, max);
    let lower = word.to_lowercase();
    // The closest one, case differences counting less than spelling
    // mistakes (`romain`: `roman` rather than `Roman`). Two names equally
    // close (`tabulax`: `tabular` or `tabularx`) say nothing: none is offered.
    let mut best: Option<((usize, usize), &str)> = None;
    let mut tie = false;
    for c in candidates {
        if c == word {
            continue;
        }
        let folded = c.to_lowercase();
        let d = if folded == lower {
            0
        } else {
            distance(&lower, &folded)
        };
        if d > limit {
            continue;
        }
        let key = (d, distance(word, c));
        match best {
            Some((b, name)) if key == b && name != c => tie = true,
            Some((b, _)) if key >= b => {}
            _ => {
                best = Some((key, c));
                tie = false;
            }
        }
    }
    best.filter(|_| !tie).map(|(_, c)| c)
}

/// Where the brace opened at `open` is closed: at the end of its line when
/// the argument starts on it, else at the end of its paragraph.
pub fn brace_close_at(text: &str, open: usize) -> usize {
    let end = line_end(text, open);
    if text
        .get(open + 1..end)
        .is_some_and(|rest| !rest.trim().is_empty())
    {
        let line = line_start(text, open);
        let content = line + content_end(&text[line..end]);
        // An argument that is a command (`\\newcommand{\\R{…}`) ends with
        // its name.
        if first_argument(text, open).is_some_and(|name| name.starts_with('\\'))
            && text[open + 1..content].starts_with('\\')
        {
            let letters = text[open + 2..content]
                .bytes()
                .take_while(|c| c.is_ascii_alphabetic() || *c == b'@')
                .count();
            if letters > 0 {
                return open + 2 + letters;
            }
        }
        // The argument of a command that takes a name (a label, a file, a
        // key) ends with the name.
        if takes_a_name(text, open) {
            let name = text[open + 1..content]
                .find(|c: char| c.is_whitespace() || matches!(c, '\\' | '{' | '}' | '$'))
                .map_or(content, |i| open + 1 + i);
            // The point that ends the sentence is not part of the name.
            let name = open + 1 + text[open + 1..name].trim_end_matches(SENTENCE).len();
            if name > open + 1 {
                return name;
            }
        }
        // It cannot go past what closes the place it is in: the `}` of a
        // group around it, the `$` of its formula, the end of a cell or of
        // an environment.
        let b = text.as_bytes();
        let in_formula = text[line..open].matches('$').count() % 2 == 1;
        let (mut i, mut depth) = (open + 1, 0usize);
        while i < content {
            match b[i] {
                b'\\' => {
                    if text[i..].starts_with("\\\\") || text[i..].starts_with("\\end{") {
                        break;
                    }
                    i += 1;
                }
                b'{' => depth += 1,
                b'}' if depth == 0 => break,
                b'}' => depth -= 1,
                b'$' if in_formula && depth == 0 => break,
                b'&' if depth == 0 => break,
                _ => {}
            }
            i += 1;
        }
        let stop = i.min(content);
        let until = |at: usize| open + 1 + text[open + 1..at].trim_end().len();
        // A group written in it that is the argument of nothing (`\frac{a{b}`,
        // `\SI{3{\metre}`) is the next argument of the command: the brace
        // closes before it. When the command takes one argument only, the
        // group has to touch what is before it.
        let after = arguments_after(text, open);
        let (mut depth, mut k) = (0usize, open + 1);
        while k < stop {
            match b[k] {
                b'\\' => k += 1,
                b'{' => {
                    let before = &text[open + 1..k];
                    let letters = before
                        .bytes()
                        .rev()
                        .take_while(u8::is_ascii_alphabetic)
                        .count();
                    let argument = before.ends_with(['_', '^', ']'])
                        || (letters > 0 && before[..before.len() - letters].ends_with('\\'));
                    let touches = !before.is_empty() && !before.ends_with(char::is_whitespace);
                    if depth == 0 && !argument && (after > 0 || touches) && k > open + 1 {
                        return until(k);
                    }
                    depth += 1;
                }
                b'}' => depth = depth.saturating_sub(1),
                _ => {}
            }
            k += 1;
        }
        let text_argument = takes_text(text, open);
        // Text holds nothing of formulas: it ends before what is one
        // (`\text{si x \geq 0`).
        if text_argument {
            let mode = |name: &str| crate::kb::kb().command(name, None).map(|c| c.mode);
            let line = open + 1..stop;
            let formula = text[line.clone()]
                .match_indices('\\')
                .map(|(j, _)| open + 1 + j)
                .find_map(|j| {
                    let len = text[j + 1..stop]
                        .bytes()
                        .take_while(u8::is_ascii_alphabetic)
                        .count();
                    (len > 0 && mode(&text[j + 1..j + 1 + len]) == Some(Mode::Math))
                        .then(|| formula_start(text, &line, j, j + 1 + len, &mode, false))
                });
            if let Some(at) = formula.filter(|&at| until(at) > open + 1) {
                return until(at);
            }
        }
        // The point that ends the sentence is not part of a number or of a
        // name.
        let close = until(stop);
        let bare = open + 1 + text[open + 1..close].trim_end_matches(SENTENCE).len();
        if stop == content && !text_argument && bare > open + 1 {
            return bare;
        }
        return close;
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

/// Arguments that are names, not text to print.
const NAMES: &[&str] = &[
    "label",
    "key",
    "keys",
    "citation",
    "file",
    "name",
    "counter",
    "package",
    "class",
    "color",
    "environment",
    "style",
    "library",
    "language",
    "url",
    "number",
];

/// How many arguments in braces the command takes after the one that the
/// brace at `open` starts, when that brace is its first argument.
fn arguments_after(text: &str, open: usize) -> usize {
    let before = &text[line_start(text, open)..open];
    let letters = before
        .bytes()
        .rev()
        .take_while(u8::is_ascii_alphabetic)
        .count();
    let name = &before[before.len() - letters..];
    if letters == 0 || !before[..before.len() - letters].ends_with('\\') {
        return 0;
    }
    crate::kb::kb().command(name, None).map_or(0, |c| {
        crate::completion::hints::signature_groups(&c.args)
            .iter()
            .filter(|(open, _)| *open == '{')
            .count()
            .saturating_sub(1)
    })
}

/// Arguments that are text to print.
const TEXTS: &[&str] = &[
    "text",
    "content",
    "title",
    "caption",
    "short",
    "term",
    "note",
    "body",
    "quote",
    "author",
    "date",
    "description",
];

/// Whether the brace at `open` starts the first argument of a command that
/// the knowledge base says to be text: a `%` there is a percent sign.
pub fn takes_text(text: &str, open: usize) -> bool {
    first_argument(text, open).is_some_and(|name| TEXTS.contains(&name.as_str()))
}

/// Whether the brace at `open` starts the first argument of a command that
/// the knowledge base says to be a name.
pub fn takes_a_name(text: &str, open: usize) -> bool {
    first_argument(text, open).is_some_and(|name| NAMES.contains(&name.as_str()))
}

/// The name the knowledge base gives to the first argument in braces of
/// the command written right before the brace at `open`.
fn first_argument(text: &str, open: usize) -> Option<String> {
    let before = &text[line_start(text, open)..open];
    let before = match before.rfind('[') {
        Some(i) if before.ends_with(']') => &before[..i],
        _ => before,
    };
    let letters = before
        .bytes()
        .rev()
        .take_while(u8::is_ascii_alphabetic)
        .count();
    let name = &before[before.len() - letters..];
    if letters == 0 || !before[..before.len() - letters].ends_with('\\') {
        return None;
    }
    crate::kb::kb().command(name, None).and_then(|c| {
        crate::completion::hints::signature_groups(&c.args)
            .into_iter()
            .find(|(open, _)| *open == '{')
            .map(|(_, argument)| argument)
    })
}

/// Whether deleting the `\end{…}` at `end` can repair the document: when
/// the line above is the same `\end`, written twice, or when what is
/// written above it is plain text, which needs no environment. A command,
/// a cell or an argument above it was meant for the environment, and it is
/// its `\begin` that is missing.
pub fn end_can_go(text: &str, end: usize) -> bool {
    let masked = mask(text);
    let below = line_start(text, end);
    if !masked[below..end].trim().is_empty() {
        return false;
    }
    let written = &masked[end..];
    let written = &written[..written.find('}').map_or(written.len(), |i| i + 1)];
    let mut start = below;
    while start > 0 {
        let previous = line_start(text, start - 1);
        let line = masked[previous..start].trim();
        if start == below && line == written {
            return true;
        }
        if line.is_empty() || line.starts_with("\\begin{") {
            break;
        }
        start = previous;
    }
    let above = masked[start..below].trim();
    !(above.contains(['\\', '&']) || above.starts_with(['{', '[']))
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

/// What a paragraph with one `$` too few shows of the formula that lost
/// it: every `$` after the missing one is read the other way round, so that
/// a formula ends up read as text.
#[derive(Debug, PartialEq, Eq)]
pub enum LostDollar {
    /// A formula that a `$` closes and none opens.
    Opening {
        /// What is read as text and only exists in a formula.
        token: Span,
        /// Where the `$` goes.
        at: usize,
    },
    /// A formula that is not closed: the `$` after it opens the next
    /// formula, and is read as what closes this one.
    Closing {
        /// The `$` that opens it.
        open: usize,
        /// The `$` read as what closes it.
        next: usize,
        /// Where the `$` goes, when the end of the formula is sure.
        at: Option<usize>,
    },
    /// Something of formulas is read as text, and nothing tells which `$`
    /// is missing.
    Unknown {
        /// What is read as text and only exists in a formula.
        token: Span,
    },
    /// A `$` read as the start of a formula, with no formula after it: the
    /// `$` that goes with it is missing, before it or after it.
    Unpaired {
        /// That `$`.
        dollar: usize,
    },
}

/// Reads the paragraph that ends with the `$` at `last`, the one left
/// alone, and tells which `$` it lacks. `mode` tells where a command can be
/// written, when it is known; `seen` is where TeX added a `$` by itself:
/// what is written there only exists in a formula, known or not.
pub fn lost_dollar(
    text: &str,
    last: usize,
    mode: &dyn Fn(&str) -> Option<Mode>,
    seen: Option<usize>,
) -> Option<LostDollar> {
    let b = text.as_bytes();
    // The paragraph, from the last thing that ends a formula for sure.
    let mut start = line_start(text, last);
    for _ in 0..40 {
        if start == 0 {
            break;
        }
        let previous = line_start(text, start - 1);
        let line = &text[previous..start];
        if line.trim().is_empty() || ends_formulas(line) {
            break;
        }
        start = previous;
    }
    // The `$` of the paragraph, and the first thing of formulas that is
    // read as text, with the number of `$` before it.
    let mut dollars = Vec::new();
    let mut found: Option<(Span, usize)> = None;
    let (mut i, mut math) = (start, false);
    while i < last {
        match b[i] {
            b'%' => i = line_end(text, i),
            b'$' => {
                if b.get(i + 1) == Some(&b'$') {
                    return None;
                }
                dollars.push(i);
                math = !math;
                i += 1;
            }
            b'\\' => {
                let len = text[i + 1..]
                    .bytes()
                    .take_while(u8::is_ascii_alphabetic)
                    .count();
                if len == 0 {
                    // `\(` and `\[` are formulas this does not read.
                    if matches!(b.get(i + 1), Some(b'(' | b')' | b'[' | b']')) {
                        return None;
                    }
                    i += 1 + text[i + 1..].chars().next().map_or(1, char::len_utf8);
                    continue;
                }
                let after = i + 1 + len;
                let of_formulas = mode(&text[i + 1..after]) == Some(Mode::Math) || seen == Some(i);
                if !math && found.is_none() && of_formulas {
                    found = Some((i..after, dollars.len()));
                }
                // A name is not a formula: `\label{eq_1}`.
                let mut brace = after;
                if b.get(brace) == Some(&b'[')
                    && let Some(close) = text[brace..line_end(text, brace)].find(']')
                {
                    brace += close + 1;
                }
                i = match group_end(text, brace) {
                    Some(end) if takes_a_name(text, brace) => end,
                    _ => after,
                };
            }
            b'_' | b'^' if !math && found.is_none() => {
                found = Some((i..i + 1, dollars.len()));
                i += 1;
            }
            _ => i += 1,
        }
    }
    // The first two `$` read as a formula that hold none (a cell that
    // ends, a brace that closes, commands on lines of their own): from the
    // first of them on, every `$` is read the other way round.
    let wrong = dollars
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| (pair[0], pair[1]))
        .find(|&(open, close)| !reads_as_formula(&text[open + 1..close], mode));
    if let Some((open, close)) = wrong
        && found.as_ref().is_none_or(|(token, _)| open < token.start)
    {
        return Some(unpaired(text, start, open, close, mode));
    }
    let Some((token, before)) = found else {
        return closes_nothing(text, start, last, mode);
    };
    // The word that holds it.
    let word_start = text[start..token.start]
        .rfind(|c: char| c.is_ascii_whitespace() || c == '$')
        .map_or(start, |j| start + j + 1);
    let mut word_end = token.end;
    while word_end < last && !b[word_end].is_ascii_whitespace() && b[word_end] != b'$' {
        word_end = match b[word_end] {
            b'{' => group_end(text, word_end).unwrap_or(word_end + 1),
            _ => word_end + 1,
        };
    }
    let word_end = word_end.min(last);
    let token = word_start..word_end;
    let next = dollars.get(before).copied().unwrap_or(last);
    let pair = (before >= 2).then(|| (dollars[before - 2], dollars[before - 1]));
    let lead = pair.map_or(start, |(_, close)| close + 1)..word_start;
    // No word between the `$` before it and the formula: that `$` opens
    // it, and the formula it was read as closing is the one left open.
    if let Some((open, close)) = pair
        && plain_words(text, lead.clone()).is_empty()
    {
        match plain_words(text, open + 1..close).first() {
            Some(word) => {
                // Text right after the `$`: it was not opening a formula
                // either.
                let formula = text[open + 1..word.start].trim_end();
                if formula.is_empty() {
                    return Some(LostDollar::Unknown { token });
                }
                // It ends where what is written stops being a formula.
                let line = open + 1..line_end(text, open).min(open + 1 + formula.len());
                let end = formula_end(text, &line, open + 1, mode);
                // What is left out must hold nothing of formulas.
                let sure = end > open + 1 && !holds_math(&text[end..close], mode);
                return Some(LostDollar::Closing {
                    open,
                    next: close,
                    at: sure.then_some(end),
                });
            }
            // Two formulas that touch.
            None if lead.is_empty() => {
                return Some(LostDollar::Closing {
                    open,
                    next: close,
                    at: None,
                });
            }
            // `$a$, b^2$`: a whole formula before this one.
            None => {}
        }
    }
    // No word between the formula and the `$` after it: that `$` closes it.
    if !plain_words(text, word_end..next).is_empty() {
        return Some(LostDollar::Unknown { token });
    }
    // What is written before it and belongs to the formula for sure.
    let line = lead.start.max(line_start(text, word_start))..line_end(text, word_start);
    let at = formula_start(text, &line, word_start, word_end, mode, false);
    Some(LostDollar::Opening { token, at })
}

/// Whether what two `$` hold can be a formula: its braces are closed, no
/// cell and no row ends in it, and it is more than commands on several
/// lines.
fn reads_as_formula(content: &str, mode: &dyn Fn(&str) -> Option<Mode>) -> bool {
    // A line of it that starts with a command which is not one of
    // formulas (`\item`, `\State`) is not a line of a formula.
    let starts_text = content.split('\n').skip(1).any(|line| {
        line.trim_start()
            .strip_prefix('\\')
            .map(|rest| &rest[..rest.bytes().take_while(u8::is_ascii_alphabetic).count()])
            .is_some_and(|name| !name.is_empty() && mode(name) != Some(Mode::Math))
    });
    if starts_text {
        return false;
    }
    let b = content.as_bytes();
    let environment = content.contains("\\begin{");
    let (mut depth, mut substance, mut commands, mut i) = (0usize, false, false, 0);
    while i < b.len() {
        match b[i] {
            b'\\' => {
                let len = content[i + 1..]
                    .bytes()
                    .take_while(u8::is_ascii_alphabetic)
                    .count();
                if len == 0 {
                    if b.get(i + 1) == Some(&b'\\') && depth == 0 && !environment {
                        return false;
                    }
                    i += 2;
                    continue;
                }
                commands = true;
                substance |= mode(&content[i + 1..i + 1 + len]) == Some(Mode::Math);
                i += 1 + len;
                continue;
            }
            b'{' => depth += 1,
            b'}' if depth == 0 => return false,
            b'}' => depth -= 1,
            b'&' if depth == 0 && !environment => return false,
            c => substance |= !c.is_ascii_whitespace(),
        }
        i += 1;
    }
    depth == 0 && (substance || (commands && !content.contains('\n')))
}

/// What the `$` at `open` shows, when what it is read as opening is no
/// formula: the formula that touches it before, which it closes; else the
/// one written right after it, which it opens and nothing closes.
fn unpaired(
    text: &str,
    start: usize,
    open: usize,
    close: usize,
    mode: &dyn Fn(&str) -> Option<Mode>,
) -> LostDollar {
    let line = start.max(line_start(text, open))..line_end(text, open);
    let word = piece_before(text, open, line.start);
    if !word.is_empty() && word.end == open {
        let at = formula_start(text, &line, word.start, open, mode, true);
        let formula = &text[at..open];
        // `10$` is a price, `prix$` a word.
        let digits = formula
            .chars()
            .all(|c| c.is_ascii_digit() || SENTENCE.contains(&c));
        if formula.contains(|c: char| c.is_alphanumeric()) && !digits && !is_plain_word(formula) {
            return LostDollar::Opening {
                token: at..open,
                at,
            };
        }
    }
    let after = open + 1..line_end(text, open).min(close);
    let end = formula_end(text, &after, open + 1, mode);
    if end > open + 1 && !holds_math(&text[end..close], mode) {
        return LostDollar::Closing {
            open,
            next: close,
            at: Some(end),
        };
    }
    LostDollar::Unpaired { dollar: open }
}

/// `on calcule x = 2y$ puis`: the `$` left alone touches what is before
/// it, which holds a sign of formulas, and text follows it. It closes a
/// formula that nothing opens.
fn closes_nothing(
    text: &str,
    start: usize,
    last: usize,
    mode: &dyn Fn(&str) -> Option<Mode>,
) -> Option<LostDollar> {
    let line = start.max(line_start(text, last))..line_end(text, last);
    let after = piece_after(text, last + 1, line.end);
    let text_follows = after.start > last + 1 || after.is_empty();
    let word = piece_before(text, last, line.start);
    if !text_follows || word.is_empty() || word.end != last {
        return None;
    }
    let at = formula_start(text, &line, word.start, last, mode, true);
    let formula = &text[at..last];
    // Nothing after it that it could open: the end of the line, of a row,
    // of a cell or of an argument. What touches it is then what it closes,
    // but a number, which makes a price of it.
    let rest = text[last + 1..line.end].trim_start();
    let ends = rest.is_empty()
        || ["\\\\", "&", "}", "\\end{"]
            .iter()
            .any(|e| rest.starts_with(e));
    let digits = formula
        .chars()
        .all(|c| c.is_ascii_digit() || SENTENCE.contains(&c));
    if ends && !digits && formula.contains(char::is_alphanumeric) && !is_plain_word(formula) {
        return Some(LostDollar::Opening {
            token: at..last,
            at,
        });
    }
    let signs = formula.contains(['=', '<', '>', '+']) || holds_math(formula, mode);
    (signs && !is_plain_word(formula)).then_some(LostDollar::Opening {
        token: at..last,
        at,
    })
}

/// `$$ … $`: the single `$` that follows the `$$` at `open` on its line,
/// and whether the formula is written in a line of text (something is
/// before it on the line): it is then the `$$` that has a `$` too many.
pub fn display_closed_by_one(text: &str, open: usize) -> Option<(usize, bool)> {
    let b = text.as_bytes();
    let end = line_end(text, open);
    let mut i = open + 2;
    while i < end {
        match b[i] {
            b'\\' => i += 1,
            b'%' => return None,
            b'$' if b.get(i + 1) == Some(&b'$') => return None,
            b'$' => {
                let inline = !text[line_start(text, open)..open].trim().is_empty();
                return (i > open + 2).then_some((i, inline));
            }
            _ => {}
        }
        i += 1;
    }
    None
}

const SENTENCE: [char; 6] = ['.', ',', ';', ':', '!', '?'];

/// The formula that holds `start..end` on its line: what is written beside
/// it and belongs to a formula for sure. A `$` right after it is the one
/// that closes it, and that is the `true` given back.
pub fn formula_around(
    text: &str,
    line: &Span,
    start: usize,
    end: usize,
    mode: &dyn Fn(&str) -> Option<Mode>,
) -> (Span, bool) {
    formula_run(text, line, start, end, mode, false)
}

/// Where the formula opened right before `open` ends on its line: as far
/// as what is written can be one, a comma included (`1, n \rrbracket`).
pub fn formula_end(
    text: &str,
    line: &Span,
    open: usize,
    mode: &dyn Fn(&str) -> Option<Mode>,
) -> usize {
    formula_run(text, line, open, open, mode, true).0.end
}

fn formula_run(
    text: &str,
    line: &Span,
    start: usize,
    end: usize,
    mode: &dyn Fn(&str) -> Option<Mode>,
    open: bool,
) -> (Span, bool) {
    let left = formula_start(text, line, start, end, mode, false);
    let (mut right, mut closed) = (end, false);
    let mut last: Option<Span> = None;
    // What is read after a comma is kept once a formula follows for sure:
    // `1, n \rrbracket`, not `x^2, puis`.
    let (mut cursor, mut comma) = (end, false);
    loop {
        if text[cursor..line.end].starts_with(',') {
            (cursor, comma) = (cursor + 1, true);
        }
        let piece = piece_after(text, cursor, line.end);
        if piece.is_empty() {
            // Only a `$` that touches the formula closes it.
            if piece.start == cursor && text[cursor..line.end].starts_with('$') {
                (right, closed) = (cursor, true);
            }
            break;
        }
        let written = &text[piece.clone()];
        let bare = written.trim_end_matches(SENTENCE);
        if bare.is_empty() || !of_a_formula(bare, mode, false) {
            break;
        }
        if !comma || open || holds_math(bare, mode) {
            right = piece.start + bare.len();
            last = Some(piece.start..right);
            comma = false;
        }
        match &written[bare.len()..] {
            "" => cursor = piece.end,
            "," => (cursor, comma) = (piece.end, true),
            _ => break,
        }
    }
    // `$\alpha$ a une valeur`: the last letter is a word of the sentence.
    if let Some(last) = last
        && !closed
        && last.end == right
        && is_a_word_alone(&text[last.clone()])
    {
        right = text[..last.start].trim_end().len();
    }
    (left..right.max(end), closed)
}

/// Where the formula that holds `start..end` starts on its line. When
/// nothing in it is of formulas for sure (`strict`), a command nothing is
/// known of is left out of it.
fn formula_start(
    text: &str,
    line: &Span,
    start: usize,
    end: usize,
    mode: &dyn Fn(&str) -> Option<Mode>,
    strict: bool,
) -> usize {
    let b = text.as_bytes();
    let mut left = start;
    let mut first: Option<Span> = None;
    loop {
        let piece = piece_before(text, left, line.start);
        let written = &text[piece.clone()];
        // Never next to a `$`: `$$` is something else.
        let touches = piece.start > 0 && b[piece.start - 1] == b'$';
        if piece.is_empty() || touches || !of_a_formula(written, mode, strict) {
            break;
        }
        // `(x, y) \in E`: a comma is kept inside its parentheses.
        let run = &text[piece.end..end];
        let inside = run.matches(')').count() > run.matches('(').count();
        if written.ends_with(',') && !inside && !holds_math(written, mode) {
            break;
        }
        left = piece.start;
        first = Some(piece);
    }
    // `on a x^2`: the first letter is a word of the sentence.
    match first {
        Some(first) if is_a_word_alone(&text[first.clone()]) => {
            first.end + (text[first.end..].len() - text[first.end..].trim_start().len())
        }
        _ => left,
    }
}

/// One letter that is a word in a sentence.
fn is_a_word_alone(piece: &str) -> bool {
    matches!(piece, "a" | "y" | "A" | "I")
}

/// What is written after `from`, up to a blank or a `$` outside any group.
fn piece_after(text: &str, from: usize, limit: usize) -> Span {
    let b = text.as_bytes();
    let mut i = from;
    while i < limit && matches!(b[i], b' ' | b'\t') {
        i += 1;
    }
    let start = i;
    let mut depth = 0;
    while i < limit {
        match b[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' if depth == 0 => break,
            b'}' => depth -= 1,
            b'$' if depth == 0 => break,
            c if c.is_ascii_whitespace() && depth == 0 => break,
            _ => {}
        }
        i += 1;
    }
    start..i.clamp(start, limit)
}

/// What is written before `to`, from a blank or a `$` outside any group.
fn piece_before(text: &str, to: usize, limit: usize) -> Span {
    let b = text.as_bytes();
    let mut i = to;
    while i > limit && matches!(b[i - 1], b' ' | b'\t') {
        i -= 1;
    }
    let end = i;
    let mut depth = 0;
    while i > limit {
        let escaped = i >= 2 && b[i - 2] == b'\\';
        if !escaped {
            match b[i - 1] {
                b'}' => depth += 1,
                b'{' if depth == 0 => break,
                b'{' => depth -= 1,
                b'$' if depth == 0 => break,
                c if c.is_ascii_whitespace() && depth == 0 => break,
                _ => {}
            }
        }
        i -= 1;
    }
    i..end
}

/// Whether a line holds what ends every formula before it: a displayed
/// formula, or the start of the document.
fn ends_formulas(line: &str) -> bool {
    line.contains("\\]")
        || line.contains("\\begin{document}")
        || ["\\begin{", "\\end{"].iter().any(|opening| {
            line.match_indices(opening).any(|(i, _)| {
                let name = &line[i + opening.len()..];
                let name = &name[..name.find('}').unwrap_or(name.len())];
                crate::syntax::is_math_environment(name)
            })
        })
}

/// The words of `range` that are text: letters, two or more, outside any
/// group.
fn plain_words(text: &str, range: Span) -> Vec<Span> {
    let b = text.as_bytes();
    let mut words = Vec::new();
    let (mut depth, mut i) = (0i32, range.start);
    while i < range.end {
        if b[i].is_ascii_whitespace() {
            i += 1;
            continue;
        }
        let (start, top) = (i, depth <= 0);
        while i < range.end && !b[i].is_ascii_whitespace() {
            match b[i] {
                b'\\' => i += 1,
                b'{' => depth += 1,
                b'}' => depth -= 1,
                _ => {}
            }
            i += 1;
        }
        i = i.min(range.end);
        if top && is_plain_word(&text[start..i]) {
            words.push(start..i);
        }
    }
    words
}

/// `ensemble`, `l'ensemble,`, `à`: letters only, and not one letter that
/// could be a variable.
fn is_plain_word(token: &str) -> bool {
    let core = token.trim_matches(|c: char| SENTENCE.contains(&c) || "()«»\"".contains(c));
    let letters = |t: &str| t.chars().all(char::is_alphabetic);
    !core.is_empty()
        && core.chars().all(|c| c.is_alphabetic() || "'’-".contains(c))
        && core
            .split(['\'', '’', '-'])
            .any(|part| letters(part) && (part.chars().count() >= 2 || !part.is_ascii()))
}

/// Whether a piece of text holds something that only exists in a formula.
fn holds_math(text: &str, mode: &dyn Fn(&str) -> Option<Mode>) -> bool {
    text.contains(['^', '_']) || commands(text).any(|name| mode(name) == Some(Mode::Math))
}

/// The names of the commands written in a piece of text.
fn commands(text: &str) -> impl Iterator<Item = &str> {
    text.match_indices('\\').filter_map(|(i, _)| {
        let len = text[i + 1..]
            .bytes()
            .take_while(u8::is_ascii_alphabetic)
            .count();
        (len > 0).then(|| &text[i + 1..i + 1 + len])
    })
}

/// Whether a word written before a formula is part of it for sure: signs,
/// numbers, letters alone, commands that are not known for text.
fn of_a_formula(piece: &str, mode: &dyn Fn(&str) -> Option<Mode>, strict: bool) -> bool {
    let balanced = piece.matches('{').count() == piece.matches('}').count();
    balanced
        && !is_plain_word(piece)
        && !piece.trim_matches(SENTENCE).is_empty()
        && !piece.ends_with(['.', ';', ':', '!', '?'])
        && !piece.contains("\\\\")
        && !piece.contains('&')
        && commands(piece).all(|name| match mode(name) {
            Some(Mode::Math) => true,
            None => !strict,
            _ => false,
        })
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

    /// The kind of loss and the text once the `$` is put where it says.
    fn lost(text: &str) -> (&'static str, String) {
        let mode = |name: &str| match name {
            "alpha" | "leq" | "beta" | "in" | "R" | "geq" | "norme" | "frac" | "gets" => {
                Some(Mode::Math)
            }
            "item" | "ldots" | "textbf" | "label" => Some(Mode::Any),
            _ => None,
        };
        let put = |at: usize| format!("{}${}", &text[..at], &text[at..]);
        let last = text.rfind('$').unwrap();
        match lost_dollar(text, last, &mode, None) {
            Some(LostDollar::Opening { at, .. }) => ("opening", put(at)),
            Some(LostDollar::Closing { at, open, .. }) => {
                ("closing", at.map_or_else(|| format!("open at {open}"), put))
            }
            Some(LostDollar::Unknown { token }) => ("unknown", text[token].to_owned()),
            Some(LostDollar::Unpaired { dollar }) => ("unpaired", format!("at {dollar}")),
            None => ("nothing", String::new()),
        }
    }

    #[test]
    fn a_brace_is_closed_where_its_argument_ends() {
        let closed = |text: &str, open: &str| {
            let open = text.find(open).unwrap() + open.len() - 1;
            let at = brace_close_at(text, open);
            format!("{}}}{}", &text[..at], &text[at..])
        };
        // A command that is defined: its name is the whole argument.
        assert_eq!(
            closed("\\newcommand{\\R{\\mathbb{R}}", "\\newcommand{"),
            "\\newcommand{\\R}{\\mathbb{R}}"
        );
        assert_eq!(
            closed("\\setlength{\\parskip{6pt}", "\\setlength{"),
            "\\setlength{\\parskip}{6pt}"
        );
        // The next argument is the group that is the argument of nothing.
        assert_eq!(
            closed("  d &= \\frac{e{f} + \\sqrt{g}", "\\frac{"),
            "  d &= \\frac{e}{f} + \\sqrt{g}"
        );
        assert_eq!(
            closed("de \\frac{\\sqrt{2}{3} et", "\\frac{"),
            "de \\frac{\\sqrt{2}}{3} et"
        );
        assert_eq!(
            closed("Une vitesse de \\unitfrac[3]{km{h} et", "]{"),
            "Une vitesse de \\unitfrac[3]{km}{h} et"
        );
        // Text ends before what is a formula; a number, before the point.
        assert_eq!(
            closed("$x & \\text{si x \\geq 0 \\\\ -x$", "\\text{"),
            "$x & \\text{si} x \\geq 0 \\\\ -x$"
        );
        assert_eq!(
            closed("une masse de \\num{12.5.", "\\num{"),
            "une masse de \\num{12.5}."
        );
        assert_eq!(
            closed("Du \\textbf{texte en gras.", "\\textbf{"),
            "Du \\textbf{texte en gras.}"
        );
    }

    #[test]
    fn an_end_goes_only_when_nothing_above_needs_it() {
        let can_go = |text: &str| end_can_go(text, text.rfind("\\end{").unwrap());
        assert!(can_go(
            "\\begin{document}\nTexte centré.\n\\end{center}\nSuite."
        ));
        assert!(can_go(
            "\\begin{center}\nTexte\n\\end{center}\n\\end{center}\n"
        ));
        assert!(!can_go(
            "[htbp]\n\\centering\n\\caption{Une image}\n\\end{figure}\n"
        ));
        assert!(!can_go(
            "\\caption{T}\n\\begin{tabular}{l}\na\n\\end{tabular}\n\\end{table}\n"
        ));
        assert!(!can_go("{0.45\\textwidth}\nDu texte.\n\\end{minipage}\n"));
        assert!(!can_go("\\item Un\n\\end{itemize}\n"));
    }

    #[test]
    fn a_formula_is_taken_whole() {
        let mode = |name: &str| match name {
            "in" | "lim" | "to" | "infty" | "alpha" | "frac" | "rrbracket" | "llbracket" => {
                Some(Mode::Math)
            }
            "item" | "ldots" | "textbf" => Some(Mode::Any),
            _ => None,
        };
        let around = |text: &str, of: &str| {
            let start = text.find(of).unwrap();
            let (span, closed) =
                formula_around(text, &(0..text.len()), start, start + of.len(), &mode);
            (text[span].to_owned(), closed)
        };
        // Letters, macros of the document and groups with blanks in them.
        assert_eq!(
            around("une fonction et x \\in \\R un nombre.", "\\in"),
            ("x \\in \\R".into(), false)
        );
        assert_eq!(
            around(
                "et \\lim_{n \\to \\infty} u_n = \\argmax_{x} f(x). Fin",
                "\\lim"
            ),
            (
                "\\lim_{n \\to \\infty} u_n = \\argmax_{x} f(x)".into(),
                false
            )
        );
        assert_eq!(
            around("Pour tout (x, y) \\in E, on a", "\\in"),
            ("(x, y) \\in E".into(), false)
        );
        // Words of the sentence stay out, also when they are one letter.
        assert_eq!(
            around("on a x^2 + 1 a pour", "x^2"),
            ("x^2 + 1".into(), false)
        );
        assert_eq!(
            around("\\item \\alpha vaut \\textbf{un}", "\\alpha"),
            ("\\alpha".into(), false)
        );
        // A comma goes on when a formula follows for sure.
        assert_eq!(
            around(
                "un intervalle \\llbracket 1, n \\rrbracket. Fin",
                "\\llbracket"
            ),
            ("\\llbracket 1, n \\rrbracket".into(), false)
        );
        assert_eq!(around("donc x^2, puis y", "x^2"), ("x^2".into(), false));
        // A formula that is open goes as far as what is written can be one.
        let end = |text: &str| {
            let open = text.find('$').unwrap() + 1;
            text[open..formula_end(text, &(open..text.len()), open, &mode)].to_owned()
        };
        assert_eq!(
            end("un intervalle $\\llbracket 1, n \\rrbracket. Fin"),
            "\\llbracket 1, n \\rrbracket"
        );
        assert_eq!(end("Soit $x = 1, puis on"), "x = 1");
        assert_eq!(end("Linéaire & $n/2$ & $n \\\\"), "n/2");
        // The `$` that closes it is seen.
        assert_eq!(
            around("Soit a^2 + b^2$, et", "a^2"),
            ("a^2 + b^2".into(), true)
        );
        assert_eq!(around("les $a$ b^2 $c$", "b^2"), ("b^2".into(), false));
    }

    #[test]
    fn the_dollar_a_paragraph_lacks_is_found_from_what_is_read_as_text() {
        // The opening one: the formula is closed, and text is before it.
        assert_eq!(
            lost("Une formule, a^2 + b^2 = c^2$, et une autre : $\\alpha \\leq \\beta$."),
            (
                "opening",
                "Une formule, $a^2 + b^2 = c^2$, et une autre : $\\alpha \\leq \\beta$.".into()
            )
        );
        assert_eq!(
            lost("Pour tout x \\in \\R$, on a $x^2 \\geq 0$."),
            (
                "opening",
                "Pour tout $x \\in \\R$, on a $x^2 \\geq 0$.".into()
            )
        );
        // On several lines, through an environment that is not a formula.
        assert_eq!(
            lost("On note \\norme{x}$ la norme.\n\\begin{theoreme}\n  Pour tout $x \\in \\R$, on a $x^2 \\geq 0$.\n\\end{theoreme}\n").1,
            "On note $\\norme{x}$ la norme.\n\\begin{theoreme}\n  Pour tout $x \\in \\R$, on a $x^2 \\geq 0$.\n\\end{theoreme}\n"
        );
        // `a` is a word of the sentence, not of the formula.
        assert_eq!(
            lost("Ici on a x^2 \\geq 0$ et $y$ aussi."),
            ("opening", "Ici on a $x^2 \\geq 0$ et $y$ aussi.".into())
        );
        // Never two `$` side by side.
        assert_eq!(
            lost("Avec $a$, b^2$ et $c$."),
            ("opening", "Avec $a$, $b^2$ et $c$.".into())
        );
        // The closing one: the next `$` opens the formula after it.
        assert_eq!(
            lost("Soit $x \\in \\R un nombre, et $y^2$ son carré."),
            (
                "closing",
                "Soit $x \\in \\R$ un nombre, et $y^2$ son carré.".into()
            )
        );
        assert_eq!(
            lost("Une formule, $a^2 + b^2 = c^2, et une autre : $\\alpha \\leq \\beta$."),
            (
                "closing",
                "Une formule, $a^2 + b^2 = c^2$, et une autre : $\\alpha \\leq \\beta$.".into()
            )
        );
        // Nothing tells which one: it is said, and nothing is offered.
        assert_eq!(lost("Soit x$ un réel et $y^2$ son carré.").0, "unknown");
        assert_eq!(lost("Le prix, x^2 dx vaut 3$ et $y$.").0, "unknown");
        // Nothing of formulas alone, but a `$` that closes what is before
        // it: signs tell a formula from a price.
        assert_eq!(
            lost("On calcule x = 2y$ puis\n\\[ y \\]"),
            ("opening", "On calcule $x = 2y$ puis\n\\[ y \\]".into())
        );
        // What two `$` hold is no formula: a cell ends in it, a brace
        // closes in it, or it is commands on lines of their own. The
        // first of the two is where the reading goes wrong.
        assert_eq!(
            lost("  Linéaire & n/2$ & $n$ \\\\"),
            ("opening", "  Linéaire & $n/2$ & $n$ \\\\".into())
        );
        assert_eq!(
            lost("\\While{i < n$}\n  \\If{$t[i] = x$}\n    \\State $i \\gets 1$"),
            (
                "opening",
                "\\While{$i < n$}\n  \\If{$t[i] = x$}\n    \\State $i \\gets 1$".into()
            )
        );
        assert_eq!(
            lost("\\If{$t[i] = x}\n  \\State \\Return $i$\n\\EndIf\n\\State $i \\gets 1$"),
            (
                "closing",
                "\\If{$t[i] = x$}\n  \\State \\Return $i$\n\\EndIf\n\\State $i \\gets 1$".into()
            )
        );
        assert_eq!(
            lost("\\State \\Return i$\n\\EndIf\n\\State $i \\gets i + 1$"),
            (
                "opening",
                "\\State \\Return $i$\n\\EndIf\n\\State $i \\gets i + 1$".into()
            )
        );
        assert_eq!(lost("Le prix & 10$ & $n$ \\\\").0, "unpaired");
        assert_eq!(
            lost("\\State \\Return $i\n\\EndIf\n\\State $i \\gets i + 1$"),
            (
                "closing",
                "\\State \\Return $i$\n\\EndIf\n\\State $i \\gets i + 1$".into()
            )
        );
        // The last `$` of a row with nothing after it closes what touches it.
        assert_eq!(
            lost("  Linéaire & $n/2$ & n$ \\\\"),
            ("opening", "  Linéaire & $n/2$ & $n$ \\\\".into())
        );
        assert_eq!(lost("  Linéaire & $n/2$ & 10$ \\\\").0, "nothing");
        // A name is not a formula, and a price is not a lost `$`.
        assert_eq!(lost("Voir \\label{eq_1} pour 10$ seulement.").0, "nothing");
        assert_eq!(lost("Un texte et une formule $x + y").0, "nothing");
        // TeX added a `$` at a command nothing is known of: it is one of
        // formulas.
        let text = "Soit f \\colon \\R \\to \\R$ une fonction et $x$ un nombre.";
        assert_eq!(
            lost_dollar(
                text,
                text.rfind('$').unwrap(),
                &|_| None,
                text.find("\\colon")
            ),
            Some(LostDollar::Opening {
                token: 7..13,
                at: 5
            })
        );
        // A displayed formula above ends what was before it.
        assert_eq!(
            lost("\\begin{equation}\n a_1 = 2\n\\end{equation}\nOn a donc $x").0,
            "nothing"
        );
    }

    #[test]
    fn a_name_that_only_looks_like_another_is_not_offered() {
        // One or two characters are close to too many names.
        assert_eq!(closest("R", ["P", "S", "r"], 2), None);
        assert_eq!(closest("RR", ["rr", "RN"], 2), None);
        // Two letters to remove out of five is another word.
        assert_eq!(closest("paire", ["par", "pair"], 2), Some("pair"));
        assert_eq!(closest("paire", ["par"], 2), None);
        assert_eq!(closest("marginnot", ["marginnote"], 2), Some("marginnote"));
        // Two names equally close: none is offered.
        assert_eq!(closest("tabulax", ["tabular", "tabularx"], 2), None);
        assert_eq!(closest("romain", ["roman", "Roman"], 2), Some("roman"));
    }

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
