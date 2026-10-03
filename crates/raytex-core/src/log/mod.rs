//! Parsers for compiler logs: TeX (`.log`), BibTeX and Biber (`.blg`).
//!
//! The TeX log is a notoriously irregular format. The parser here:
//!
//! * tracks the stack of open files from the `(file … )` markers, ignoring
//!   the text of messages whose parentheses would desynchronise it;
//! * recognises errors in both formats (`! Message` + `l.<n>` and
//!   `file:line: Message` with `-file-line-error`), keeping TeX's context
//!   lines so the editor can point at the exact column;
//! * collects LaTeX, class, package and font warnings (including their
//!   multi-line continuations) and bad boxes;
//! * detects "rerun" requests and missing files for the build loop;
//! * attaches friendly explanations and quick fixes (see [`hints`]).
//!
//! Logs should be produced with `max_print_line=10000` (set by the build
//! runner) so lines are not wrapped; wrapped logs (MiKTeX, defaults) are
//! partly repaired by [`unwrap_lines`].

pub mod bibtex;
pub mod hints;

use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

use crate::diagnostics::{Diagnostic, Severity, Source};
use crate::i18n::Lang;

/// Result of parsing a TeX log.
#[derive(Debug, Clone, Default)]
pub struct LogReport {
    /// Errors, warnings and bad boxes.
    pub diagnostics: Vec<Diagnostic>,
    /// Number of pages written, if reported.
    pub pages: Option<u32>,
    /// A rerun is needed to resolve references, outlines or citations.
    pub rerun_needed: bool,
    /// Biber must be run (biblatex asked for it).
    pub biber_needed: bool,
    /// Citations are undefined (BibTeX or Biber may be needed).
    pub undefined_citations: bool,
    /// Files TeX could not find (`foo.sty`, images…).
    pub missing_files: Vec<String>,
    /// The engine stopped on a fatal error.
    pub fatal: bool,
}

impl LogReport {
    /// Number of errors.
    pub fn error_count(&self) -> usize {
        self.diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .count()
    }
}

static FILE_LINE_ERROR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^((?:[A-Za-z]:)?[^:]+?\.[A-Za-z0-9]+):(\d+): (.*)$").unwrap());
static INPUT_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:on input line|at line|on line) (\d+)").unwrap());
static BADBOX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(Over|Under)full \\([hv])box \(([^)]*)\)(?: (?:in paragraph|in alignment) at lines (\d+)--(\d+)| detected at line (\d+)| has occurred while \\output is active)?").unwrap()
});
static WARNING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:(LaTeX|LaTeX Font|LaTeX3|pdfTeX)|(?:Package|Class|Module) ([^\s]+)) [Ww]arning(?: \([^)]*\))?: (.*)$")
        .unwrap()
});
static CONTEXT_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^l\.(\d+) ?(.*)$").unwrap());
static PAGES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^Output written on .*\((\d+) pages?").unwrap());
static MISSING_FILE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:File|file) [`']([^']+)' not found|I can't find file [`']([^']+)'|No file ([^\s]+\.(?:sty|cls|tex))\.").unwrap()
});

/// Lines TeX prints after an error that are help text, not content.
fn is_help_line(line: &str) -> bool {
    line.is_empty()
        || line.starts_with("See the LaTeX manual")
        || line.starts_with("Type  H <return>")
        || line.starts_with("Type X to quit")
        || line.starts_with("or enter new name")
        || line.starts_with("Enter file name")
}

/// Joins lines that TeX wrapped at 79 characters (when `max_print_line` was not raised).
pub fn unwrap_lines(log: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut pending = false;
    for line in log.lines() {
        if pending && let Some(last) = out.last_mut() {
            last.push_str(line);
        } else {
            out.push(line.to_owned());
        }
        // A line of exactly 79 bytes was probably wrapped (unless it is an error/context line).
        pending = line.len() == 79 && !line.starts_with('!') && !line.starts_with("l.");
    }
    out
}

/// Parses a TeX log. `root_dir` is the directory the engine ran in; paths in
/// the log are resolved against it. `main_file` is used when no file is known.
pub fn parse_log(log: &str, root_dir: &Path, main_file: &Path, lang: Lang) -> LogReport {
    let wrapped = log.lines().any(|l| l.len() == 79);
    let lines: Vec<String> = if wrapped {
        unwrap_lines(log)
    } else {
        log.lines().map(str::to_owned).collect()
    };
    let real_root = dunce::canonicalize(root_dir).ok();
    let mut parser = Parser {
        lines: &lines,
        i: 0,
        root_dir,
        real_root: real_root.as_deref(),
        main_file,
        stack: Vec::new(),
        report: LogReport::default(),
        runaway: None,
    };
    parser.run();
    let mut report = parser.report;
    dedupe(&mut report.diagnostics);
    for d in &mut report.diagnostics {
        hints::enrich(d, lang);
    }
    report
}

#[derive(Debug)]
enum Frame {
    File(PathBuf),
    Paren,
}

struct Parser<'a> {
    lines: &'a [String],
    i: usize,
    root_dir: &'a Path,
    /// Real location of `root_dir`, to recognise its files written otherwise.
    real_root: Option<&'a Path>,
    main_file: &'a Path,
    stack: Vec<Frame>,
    report: LogReport,
    runaway: Option<String>,
}

impl Parser<'_> {
    fn run(&mut self) {
        // Skip the banner up to the first file.
        while self.i < self.lines.len() {
            let line = self.lines[self.i].clone();
            if let Some(m) = PAGES.captures(&line) {
                self.report.pages = m[1].parse().ok();
            }
            if let Some(message) = line.strip_prefix("! ") {
                self.error(message.to_owned(), None, None);
                continue;
            }
            if let Some(m) = FILE_LINE_ERROR.captures(&line)
                && self.looks_like_file(&m[1])
            {
                let file = self.resolve(&m[1]);
                let line_no = m[2].parse().ok();
                self.error(m[3].to_owned(), Some(file), line_no);
                continue;
            }
            if line == "Runaway argument?"
                || line == "Runaway definition?"
                || line == "Runaway text?"
            {
                // The text read so far comes on the next line, unless nothing
                // was read: the error follows at once.
                let next = self.lines.get(self.i + 1);
                let error = next.is_some_and(|l| {
                    l.starts_with("! ")
                        || FILE_LINE_ERROR
                            .captures(l)
                            .is_some_and(|m| self.looks_like_file(&m[1]))
                });
                if error {
                    self.runaway = Some(String::new());
                    self.i += 1;
                } else {
                    self.runaway = next.cloned();
                    self.i += 2;
                }
                continue;
            }
            if let Some(m) = WARNING.captures(&line) {
                let who = m
                    .get(1)
                    .or(m.get(2))
                    .map(|w| w.as_str().to_owned())
                    .unwrap_or_default();
                self.warning(who, m[3].to_owned());
                continue;
            }
            if let Some(m) = BADBOX.captures(&line) {
                self.badbox(&m);
                continue;
            }
            if line.starts_with("Missing character: There is no") {
                // In `nullfont` the text is invisible (package artefacts, or text
                // outside a TikZ node): informative only.
                let severity = if line.contains("nullfont") {
                    Severity::Info
                } else {
                    Severity::Warning
                };
                let code = if line.contains("nullfont") {
                    "nullfont"
                } else {
                    "missing-character"
                };
                let mut d = Diagnostic::new(severity, Source::Latex, line.clone()).with_code(code);
                self.place(&mut d, None);
                self.push(d);
                self.i += 1;
                continue;
            }
            if line.starts_with("*** (job aborted, no legal \\end found)") {
                // The end of the file came before `\end{document}`.
                let errors = self
                    .report
                    .diagnostics
                    .iter()
                    .filter(|d| d.severity == Severity::Error)
                    .count();
                if let Some(d) = self.report.diagnostics.last_mut()
                    && d.message.starts_with("Emergency stop")
                    && errors == 1
                {
                    d.message = "Emergency stop: no legal \\end found.".into();
                }
            }
            if line.starts_with("No pages of output") {
                let d = Diagnostic::new(Severity::Warning, Source::Latex, line.clone())
                    .with_code("no-output");
                self.push(d);
            }
            self.track_files(&line);
            self.i += 1;
        }
    }

    // ------------------------------------------------------------ files

    fn looks_like_file(&self, s: &str) -> bool {
        let s = s.trim_matches('"');
        s.starts_with("./")
            || s.starts_with("../")
            || s.starts_with('/')
            || s.starts_with('~')
            || s.as_bytes().get(1) == Some(&b':')
            || self.root_dir.join(s).exists()
    }

    fn resolve(&self, s: &str) -> PathBuf {
        let s = s.trim_matches('"');
        let p = Path::new(s);
        let abs = if p.is_absolute() {
            p.to_path_buf()
        } else {
            self.root_dir.join(p)
        };
        crate::workspace::project_form(self.root_dir, self.real_root, normalize(&abs))
    }

    /// Updates the file stack from the parentheses of an ordinary line.
    fn track_files(&mut self, line: &str) {
        let bytes = line.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b'(' => {
                    let rest = &line[i + 1..];
                    let (token, len) = file_token(rest);
                    if !token.is_empty() && self.is_file_name(token) {
                        let path = self.resolve(token);
                        self.stack.push(Frame::File(path));
                        i += 1 + len;
                        continue;
                    }
                    self.stack.push(Frame::Paren);
                }
                b')' => {
                    self.stack.pop();
                }
                _ => {}
            }
            i += 1;
        }
    }

    fn is_file_name(&self, token: &str) -> bool {
        let t = token.trim_matches('"');
        let has_ext = Path::new(t).extension().is_some_and(|e| {
            !e.is_empty()
                && e.len() <= 12
                && e.to_string_lossy()
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric())
        });
        has_ext && (self.looks_like_file(t) || !t.contains(' '))
    }

    /// Innermost file of the stack, preferring files of the project.
    fn current_file(&self) -> (Option<PathBuf>, bool) {
        let mut first_file = None;
        for frame in self.stack.iter().rev() {
            if let Frame::File(p) = frame {
                if first_file.is_none() {
                    first_file = Some(p.clone());
                }
                if p.starts_with(self.root_dir) {
                    let exact = first_file.as_ref() == Some(p);
                    return (Some(p.clone()), exact);
                }
            }
        }
        (Some(self.main_file.to_path_buf()), first_file.is_none())
    }

    /// Sets the file of a diagnostic. When the innermost file is not part of
    /// the project, the line number (which refers to that file) is dropped.
    fn place(&self, d: &mut Diagnostic, line: Option<u32>) {
        let (file, exact) = self.current_file();
        d.file = file;
        d.line = if exact { line } else { None };
    }

    fn push(&mut self, d: Diagnostic) {
        self.report.diagnostics.push(d);
    }

    // ------------------------------------------------------------ errors

    fn error(&mut self, first: String, file: Option<PathBuf>, line: Option<u32>) {
        let start = self.i;
        let mut message = first.trim_end().to_owned();
        self.i += 1;
        // Continuation of the message (package errors use "(pkg)   text",
        // LaTeX errors indent the rest of a long message).
        let latex_error = message.contains("LaTeX Error:") || message.contains(" Error:");
        while let Some(next) = self.lines.get(self.i) {
            let t = next.trim_start();
            if t.starts_with('(') && t.contains(')') && next.starts_with('(') {
                let cont = t.split_once(')').map(|(_, r)| r.trim()).unwrap_or("");
                message.push(' ');
                message.push_str(cont);
                self.i += 1;
            } else if latex_error && next.starts_with("    ") && !t.is_empty() {
                message.push(' ');
                message.push_str(t);
                self.i += 1;
            } else {
                break;
            }
        }
        // Find the "l.<n> context" line within the error block.
        let mut context_line = None;
        let mut context_before = None;
        let mut context_after = None;
        let limit = (self.i + 30).min(self.lines.len());
        let mut j = self.i;
        while j < limit {
            let l = &self.lines[j];
            if l.starts_with("! ")
                || (j > self.i && FILE_LINE_ERROR.is_match(l) && !l.starts_with("l."))
            {
                break;
            }
            if let Some(m) = CONTEXT_LINE.captures(l) {
                context_line = m[1].parse::<u32>().ok();
                let before = m[2].to_owned();
                // TeX prints the rest of the line starting below the end of the first part.
                let col = l.len();
                let after = self
                    .lines
                    .get(j + 1)
                    .map(|a| {
                        if a.len() >= col {
                            a[floor(a, col)..].to_owned()
                        } else {
                            a.trim().to_owned()
                        }
                    })
                    .unwrap_or_default();
                context_before = Some(before);
                context_after = Some(after.trim_end().to_owned());
                j += 2;
                // Skip TeX's help text (until a blank line).
                while j < self.lines.len() && !self.lines[j].is_empty() {
                    j += 1;
                }
                break;
            }
            j += 1;
        }
        if context_line.is_some() {
            self.i = j;
        } else {
            // No context: skip help lines only.
            while self.i < self.lines.len()
                && is_help_line(&self.lines[self.i])
                && !self.lines[self.i].is_empty()
            {
                self.i += 1;
            }
        }

        let raw = self.lines[start..self.i.min(self.lines.len())].join("\n");
        let fatal = message.contains("Emergency stop")
            || message.contains("Fatal error occurred")
            || message.contains("job aborted");
        if fatal {
            self.report.fatal = true;
            // Consequence of a previous error: do not report it twice.
            if self
                .report
                .diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error)
            {
                return;
            }
        }
        if let Some(m) = MISSING_FILE.captures(&message) {
            let name = m
                .get(1)
                .or(m.get(2))
                .or(m.get(3))
                .unwrap()
                .as_str()
                .to_owned();
            if !self.report.missing_files.contains(&name) {
                self.report.missing_files.push(name);
            }
        }
        let mut d = Diagnostic::new(Severity::Error, Source::Latex, message);
        d.context_before = context_before.filter(|s| !s.is_empty());
        d.context_after = context_after.filter(|s| !s.is_empty());
        d.raw = Some(match self.runaway.take() {
            Some(r) => format!("Runaway argument?\n{r}\n{raw}"),
            None => raw,
        });
        let line_no = line.or(context_line);
        match file {
            Some(f) => {
                d.file = Some(f);
                d.line = line_no;
            }
            None => self.place(&mut d, line_no),
        }
        self.push(d);
    }

    // ---------------------------------------------------------- warnings

    fn warning(&mut self, who: String, first: String) {
        let start = self.i;
        let mut message = first.trim_end().to_owned();
        self.i += 1;
        let prefix = format!(
            "({})",
            if who == "LaTeX Font" {
                "Font"
            } else {
                who.as_str()
            }
        );
        while let Some(next) = self.lines.get(self.i) {
            if next.is_empty() {
                break;
            }
            let cont = if let Some(rest) = next.strip_prefix(&prefix) {
                rest.trim()
            } else if who == "LaTeX"
                && !next.starts_with('(')
                && !next.starts_with('[')
                && !WARNING.is_match(next)
            {
                // LaTeX warnings are wrapped without prefix.
                next.trim()
            } else {
                break;
            };
            message.push(' ');
            message.push_str(cont);
            self.i += 1;
        }
        let line = INPUT_LINE
            .captures(&message)
            .and_then(|m| m[1].parse().ok());
        let lower = message.to_ascii_lowercase();
        // babel reads the languages of the last build from the .aux file.
        let stale_language = lower.contains("undefined language") && lower.contains("in aux");
        if lower.contains("rerun") || lower.contains("please rerun latex") || stale_language {
            self.report.rerun_needed = true;
        }
        if lower.contains("(re)run biber") || lower.contains("rerun biber") {
            self.report.biber_needed = true;
        }
        if message.starts_with("Citation") && message.contains("undefined") {
            self.report.undefined_citations = true;
        }
        let severity = if lower.contains("rerun")
            || lower.starts_with("there were")
            || lower.starts_with("marginpar on page")
            // lipsum without Latin hyphenation: only the dummy text is concerned.
            || lower.contains("hyphenation patterns for")
            || stale_language
        {
            Severity::Info
        } else {
            Severity::Warning
        };
        let label = match who.as_str() {
            "LaTeX" | "LaTeX3" => String::new(),
            "LaTeX Font" => "Font: ".to_owned(),
            "pdfTeX" => "pdfTeX: ".to_owned(),
            other => format!("{other}: "),
        };
        let mut d = Diagnostic::new(severity, Source::Latex, format!("{label}{message}"));
        d.raw = Some(self.lines[start..self.i].join("\n"));
        self.place(&mut d, line);
        self.push(d);
    }

    fn badbox(&mut self, m: &regex::Captures<'_>) {
        let over = &m[1] == "Over";
        let start: Option<u32> = m.get(4).or(m.get(6)).and_then(|x| x.as_str().parse().ok());
        let end: Option<u32> = m.get(5).and_then(|x| x.as_str().parse().ok());
        let message = m[0].to_owned();
        let mut d = Diagnostic::new(
            if over {
                Severity::Warning
            } else {
                Severity::Info
            },
            Source::Latex,
            message,
        )
        .with_code(if over {
            "overfull-box"
        } else {
            "underfull-box"
        });
        // The next line shows the offending material.
        if let Some(next) = self.lines.get(self.i + 1)
            && !next.is_empty()
        {
            d.context_before = Some(next.trim().to_owned());
        }
        self.place(&mut d, start);
        if d.line.is_some() {
            d.end_line = end.filter(|e| Some(*e) != start);
        }
        self.i += 1;
        // Skip the box content lines (they may contain parentheses).
        while self.i < self.lines.len()
            && !self.lines[self.i].is_empty()
            && self.lines[self.i].starts_with(['[', ' ', '\\'])
        {
            self.i += 1;
        }
        self.push(d);
    }
}

/// Extracts a file token after `(`: up to whitespace or a parenthesis.
fn file_token(rest: &str) -> (&str, usize) {
    if let Some(quoted) = rest.strip_prefix('"')
        && let Some(end) = quoted.find('"')
    {
        return (&rest[..end + 2], end + 2);
    }
    let end = rest
        .find(|c: char| {
            c.is_whitespace() || c == '(' || c == ')' || c == '{' || c == '[' || c == '<'
        })
        .unwrap_or(rest.len());
    (&rest[..end], end)
}

fn floor(s: &str, mut i: usize) -> usize {
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// Removes `.` and `..` components without touching the file system.
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

fn dedupe(diags: &mut Vec<Diagnostic>) {
    let mut seen = std::collections::HashSet::new();
    diags.retain(|d| seen.insert((d.file.clone(), d.line, d.message.clone())));
    // What is not a number where TeX expects one gives "Missing number",
    // then other errors as TeX reads on from the same place ("Illegal unit
    // of measure", "Missing = inserted for \ifdim"). They say nothing
    // more about the mistake: one mistake, one problem.
    //
    // More generally, an error reported at the very place of an earlier one
    // (TeX has read nothing more of the document) comes from the way TeX
    // went on after the first: it is the same mistake.
    let consequence: Vec<bool> = (0..diags.len())
        .map(|i| {
            let d = &diags[i];
            if d.severity != Severity::Error {
                return false;
            }
            let after_number = (d.message.starts_with("Illegal unit of measure")
                || d.message.starts_with("Missing = inserted for \\if"))
                && diags[..i].iter().any(|first| {
                    first.message.starts_with("Missing number")
                        && first.file == d.file
                        && first.line == d.line
                });
            let same_place = d.context_before.is_some()
                && d.line.is_some()
                && diags[..i].iter().any(|first| {
                    first.severity == Severity::Error
                        && first.file == d.file
                        && first.line == d.line
                        && first.context_before == d.context_before
                        && first.context_after == d.context_after
                });
            after_number || same_place
        })
        .collect();
    let mut consequence = consequence;
    for i in 0..diags.len() {
        if !consequence[i] {
            continue;
        }
        let same_place = |other: &Diagnostic| {
            other.file == diags[i].file
                && other.line == diags[i].line
                && other.context_before == diags[i].context_before
                && other.context_after == diags[i].context_after
        };
        // A definition without the name of a command gives several errors
        // at its place; "Missing control sequence inserted" is the one that
        // says what is wrong.
        if diags[i]
            .message
            .starts_with("Missing control sequence inserted")
            && let Some(first) = (0..i).find(|&k| !consequence[k] && same_place(&diags[k]))
        {
            consequence[first] = true;
            consequence[i] = false;
            continue;
        }
        // TeX opened a formula by itself while going on: what it refuses in
        // that formula, and the "Missing $ inserted" that closes it at the
        // end of the paragraph, come from the first error too.
        if diags[i].message.starts_with("Missing $ inserted") {
            for j in i + 1..diags.len() {
                let next = &diags[j];
                let near = next
                    .line
                    .zip(diags[i].line)
                    .is_none_or(|(a, b)| a.abs_diff(b) <= 60);
                if next.file != diags[i].file || !near {
                    break;
                }
                if next.message.contains("invalid in math mode")
                    || next.message.contains("Please use \\mathaccent")
                {
                    consequence[j] = true;
                } else if next.message.starts_with("Missing $ inserted") {
                    consequence[j] = true;
                    break;
                }
            }
        }
    }
    let mut i = 0;
    diags.retain(|_| {
        i += 1;
        !consequence[i - 1]
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_runaway_argument_keeps_its_error() {
        // `\\includegraphics[width=3cm]` then a blank line: nothing was read
        // of the argument, the error comes right after "Runaway argument?".
        let log = "(./main.tex\nRunaway argument?\n./main.tex:5: Paragraph ended before \\Gin@ii was complete.\n<to be read again> \n                   \\par \nl.5 \n    \nI suspect you've forgotten a `}', causing me to apply this\n\n)\n";
        let root = Path::new("/proj");
        let r = parse_log(log, root, &root.join("main.tex"), Lang::En);
        assert_eq!(r.diagnostics.len(), 1, "{:?}", r.diagnostics);
        assert_eq!(r.diagnostics[0].line, Some(5));
    }

    #[test]
    fn one_mistake_gives_one_problem() {
        // A length that is not a number: TeX reports "Missing number", then
        // "Illegal unit of measure" at the same place.
        let log = "(./main.tex\n./main.tex:4: Missing number, treated as zero.\n<to be read again> \n                   a\nl.4 Avant.\\vspace{abc}\n                       Après.\nA number should have been here; I inserted `0'.\n\n./main.tex:4: Illegal unit of measure (pt inserted).\n<to be read again> \n                   a\nl.4 Avant.\\vspace{abc}\n                       Après.\nDimensions can be in units of em, ex, in, pt, pc,\n\n./main.tex:7: Undefined control sequence.\nl.7 \\zzz\n        \nThe control sequence at the end of the top line\n\n)\n";
        let root = Path::new("/proj");
        let r = parse_log(log, root, &root.join("main.tex"), Lang::En);
        let messages: Vec<&str> = r.diagnostics.iter().map(|d| d.message.as_str()).collect();
        assert_eq!(
            messages,
            [
                "Missing number, treated as zero.",
                "Undefined control sequence."
            ]
        );
    }

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/logs")
                .join(name),
        )
        .unwrap()
    }

    fn summary(r: &LogReport) -> Vec<(Severity, Option<String>, Option<u32>, String)> {
        r.diagnostics
            .iter()
            .map(|d| {
                let file = d
                    .file
                    .as_ref()
                    .map(|f| f.file_name().unwrap().to_string_lossy().to_string());
                (d.severity, file, d.line, d.message.clone())
            })
            .collect()
    }

    #[test]
    fn parses_errors_with_file_line_error() {
        let root = Path::new("/proj");
        let r = parse_log(
            &fixture("errors-fle.log"),
            root,
            &root.join("main.tex"),
            Lang::En,
        );
        let s = summary(&r);
        let errors: Vec<_> = s.iter().filter(|d| d.0 == Severity::Error).collect();
        assert_eq!(errors.len(), 6, "{s:#?}");
        assert_eq!(errors[0].1.as_deref(), Some("main.tex"));
        assert_eq!(errors[0].2, Some(7));
        assert_eq!(errors[0].3, "Undefined control sequence.");
        let first = &r.diagnostics[0];
        assert_eq!(
            first.context_before.as_deref(),
            Some("Voici une commande inconnue \\textbff")
        );
        assert_eq!(first.context_after.as_deref(), Some("{gras}."));
        assert!(first.raw.as_deref().unwrap().contains("l.7"));
        assert!(s.iter().any(|d| d.3.contains("Reference `sec:nope' on page 1 undefined") && d.2 == Some(8)));
        assert!(r.undefined_citations);
        assert!(r.rerun_needed);
        assert_eq!(r.missing_files, ["missing"]);
        assert_eq!(r.pages, Some(1));
        // The runaway argument is kept as context of the next error.
        assert!(r.diagnostics.iter().any(|d| {
            d.raw
                .as_deref()
                .is_some_and(|x| x.starts_with("Runaway argument?"))
        }));
    }

    #[test]
    fn parses_errors_without_file_line_error() {
        let root = Path::new("/proj");
        let r = parse_log(
            &fixture("errors-nofle.log"),
            root,
            &root.join("main.tex"),
            Lang::En,
        );
        let errors: Vec<_> = r
            .diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();
        assert_eq!(errors.len(), 6);
        assert!(
            errors
                .iter()
                .all(|d| d.file.as_deref() == Some(Path::new("/proj/main.tex")))
        );
        assert_eq!(
            errors.iter().map(|d| d.line.unwrap()).collect::<Vec<_>>(),
            [7, 9, 10, 10, 13, 15]
        );
    }

    #[test]
    fn parses_wrapped_log() {
        let root = Path::new("/proj");
        let r = parse_log(
            &fixture("errors-wrapped.log"),
            root,
            &root.join("main.tex"),
            Lang::En,
        );
        assert_eq!(r.error_count(), 6);
    }

    #[test]
    fn missing_package_is_fatal_and_single() {
        let root = Path::new("/proj");
        let r = parse_log(
            &fixture("missing-package.log"),
            root,
            &root.join("doc.tex"),
            Lang::En,
        );
        assert!(r.fatal);
        assert_eq!(r.missing_files, ["nonexistentpkg.sty"]);
        assert_eq!(r.error_count(), 1);
        let d = &r
            .diagnostics
            .iter()
            .find(|d| d.severity == Severity::Error)
            .unwrap();
        assert!(
            d.fixes
                .iter()
                .any(|f| matches!(f, crate::diagnostics::Fix::InstallPackage { .. }))
        );
    }

    #[test]
    fn warnings_and_badboxes() {
        let root = Path::new("/proj");
        let r = parse_log(
            &fixture("warnings.log"),
            root,
            &root.join("doc2.tex"),
            Lang::En,
        );
        let s = summary(&r);
        let hyperref: Vec<_> = s.iter().filter(|d| d.3.starts_with("hyperref:")).collect();
        assert_eq!(hyperref.len(), 2, "{s:#?}");
        assert!(
            hyperref[0]
                .3
                .contains("removing `math shift' on input line 5")
        );
        assert_eq!(hyperref[0].2, Some(5));
        let french = s.iter().find(|d| d.3.starts_with("french3.ldf:")).unwrap();
        assert!(
            french
                .3
                .contains("Add \\usepackage[T1]{fontenc} to the preamble of your document")
        );
        let boxes: Vec<_> = r
            .diagnostics
            .iter()
            .filter(|d| d.code.as_deref() == Some("overfull-box"))
            .collect();
        assert_eq!(boxes.len(), 2);
        assert_eq!(boxes[0].line, Some(6));
        assert_eq!(boxes[0].end_line, Some(7));
        assert_eq!(r.error_count(), 1);
        let err = r
            .diagnostics
            .iter()
            .find(|d| d.severity == Severity::Error)
            .unwrap();
        assert_eq!(err.line, Some(11));
        assert_eq!(err.message, "Extra alignment tab has been changed to \\cr.");
    }
}
