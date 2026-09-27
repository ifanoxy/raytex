//! A tolerant BibTeX / biblatex database parser.
//!
//! Extracts entries (type, key, fields) with their positions, expands
//! `@string` macros and `#` concatenation, and reports syntax problems.
//! Used for citation completion, hovers and "undefined citation" checks.

use std::collections::HashMap;

use serde::Serialize;

use crate::syntax::plain::to_plain;
use crate::text::Span;

/// A bibliography entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibEntry {
    /// Entry type, lowercase (`article`, `book`…).
    pub kind: String,
    /// Citation key.
    pub key: String,
    /// Span of the key.
    pub key_span: Span,
    /// Span of the whole entry.
    pub span: Span,
    /// Fields (lowercase names), values with braces removed and macros expanded.
    pub fields: Vec<(String, String)>,
}

impl BibEntry {
    /// Value of a field.
    pub fn field(&self, name: &str) -> Option<&str> {
        self.fields
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }

    /// Readable summary used by completion: `Knuth (1984) — The TeXbook`.
    pub fn summary(&self) -> BibSummary {
        let authors = self
            .field("author")
            .or(self.field("editor"))
            .map(short_authors)
            .unwrap_or_default();
        let year = self
            .field("year")
            .map(str::to_owned)
            .or_else(|| self.field("date").map(|d| d.chars().take(4).collect()))
            .unwrap_or_default();
        let title = self.field("title").map(to_plain).unwrap_or_default();
        let venue = self
            .field("journal")
            .or(self.field("journaltitle"))
            .or(self.field("booktitle"))
            .or(self.field("publisher"))
            .map(to_plain)
            .unwrap_or_default();
        BibSummary {
            key: self.key.clone(),
            kind: self.kind.clone(),
            authors,
            year,
            title,
            venue,
        }
    }
}

/// Human-friendly view of an entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BibSummary {
    /// Citation key.
    pub key: String,
    /// Entry type.
    pub kind: String,
    /// "Knuth", "Knuth and Lamport" or "Knuth et al.".
    pub authors: String,
    /// Year.
    pub year: String,
    /// Title (plain text).
    pub title: String,
    /// Journal, book title or publisher.
    pub venue: String,
}

/// A syntax problem in a `.bib` file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibProblem {
    /// Where.
    pub span: Span,
    /// English description (the linter localises known kinds).
    pub message: String,
}

/// A parsed `.bib` file.
#[derive(Debug, Clone, Default)]
pub struct BibDatabase {
    /// Entries in file order.
    pub entries: Vec<BibEntry>,
    /// Problems.
    pub problems: Vec<BibProblem>,
}

impl BibDatabase {
    /// Finds an entry by key (case-sensitive, as BibTeX keys are matched by biber).
    pub fn get(&self, key: &str) -> Option<&BibEntry> {
        self.entries.iter().find(|e| e.key == key)
    }
}

/// "Knuth", "Knuth and Lamport", "Knuth et al."
fn short_authors(list: &str) -> String {
    let names: Vec<String> = list
        .split(" and ")
        .map(|n| {
            let n = n.trim();
            // "Last, First" or "First Last"
            let last = match n.split_once(',') {
                Some((last, _)) => last.trim().to_owned(),
                None => n.rsplit(' ').next().unwrap_or(n).to_owned(),
            };
            to_plain(&last)
        })
        .filter(|n| !n.is_empty())
        .collect();
    match names.len() {
        0 => String::new(),
        1 => names[0].clone(),
        2 => format!("{} & {}", names[0], names[1]),
        _ => format!("{} et al.", names[0]),
    }
}

/// Parses a `.bib` file.
pub fn parse(text: &str) -> BibDatabase {
    let mut p = Parser {
        text,
        bytes: text.as_bytes(),
        pos: 0,
        db: BibDatabase::default(),
        strings: default_strings(),
    };
    p.run();
    p.db
}

fn default_strings() -> HashMap<String, String> {
    let months = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    let full = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    months
        .iter()
        .zip(full)
        .map(|(m, f)| (m.to_string(), f.to_string()))
        .collect()
}

struct Parser<'a> {
    text: &'a str,
    bytes: &'a [u8],
    pos: usize,
    db: BibDatabase,
    strings: HashMap<String, String>,
}

impl Parser<'_> {
    fn run(&mut self) {
        while let Some(at) = memchr::memchr(b'@', &self.bytes[self.pos..]) {
            let start = self.pos + at;
            self.pos = start + 1;
            let kind = self.ident().to_ascii_lowercase();
            if kind.is_empty() {
                continue;
            }
            self.ws();
            let close = match self.peek() {
                Some(b'{') => b'}',
                Some(b'(') => b')',
                _ => {
                    self.problem(start..self.pos, format!("expected {{ after @{kind}"));
                    continue;
                }
            };
            self.pos += 1;
            match kind.as_str() {
                "comment" => {
                    self.skip_balanced(close);
                }
                "preamble" => {
                    self.skip_balanced(close);
                }
                "string" => self.string_def(close),
                _ => self.entry(kind, start, close),
            }
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn ws(&mut self) {
        while self.peek().is_some_and(|b| b.is_ascii_whitespace()) {
            self.pos += 1;
        }
    }

    fn ident(&mut self) -> &str {
        let start = self.pos;
        while self
            .peek()
            .is_some_and(|b| !b.is_ascii_whitespace() && !b"{}(),=#\"@%".contains(&b))
        {
            self.pos += 1;
        }
        &self.text[start..self.pos]
    }

    fn problem(&mut self, span: std::ops::Range<usize>, message: String) {
        self.db.problems.push(BibProblem { span, message });
    }

    fn skip_balanced(&mut self, close: u8) {
        let mut depth = 1usize;
        while let Some(b) = self.peek() {
            self.pos += 1;
            match b {
                b'{' | b'(' if b == if close == b'}' { b'{' } else { b'(' } => depth += 1,
                b if b == close => {
                    depth -= 1;
                    if depth == 0 {
                        return;
                    }
                }
                _ => {}
            }
        }
    }

    fn string_def(&mut self, close: u8) {
        self.ws();
        let name = self.ident().to_ascii_lowercase();
        self.ws();
        if self.peek() == Some(b'=') {
            self.pos += 1;
            if let Some(value) = self.value(close) {
                self.strings.insert(name, value);
            }
        }
        self.ws();
        if self.peek() == Some(close) {
            self.pos += 1;
        }
    }

    fn entry(&mut self, kind: String, start: usize, close: u8) {
        self.ws();
        let key_start = self.pos;
        while self
            .peek()
            .is_some_and(|b| !b.is_ascii_whitespace() && b != b',' && b != close)
        {
            self.pos += 1;
        }
        let key_span = key_start..self.pos;
        let key = self.text[key_span.clone()].to_owned();
        if key.is_empty() {
            self.problem(start..self.pos, format!("@{kind} entry without key"));
        }
        let mut fields = Vec::new();
        loop {
            self.ws();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                    continue;
                }
                Some(b) if b == close => {
                    self.pos += 1;
                    break;
                }
                None => {
                    self.problem(start..self.text.len(), format!("entry {key} is not closed"));
                    break;
                }
                Some(b'@') => {
                    self.problem(
                        start..self.pos,
                        format!("entry {key} is not closed before the next entry"),
                    );
                    break;
                }
                _ => {}
            }
            let field_start = self.pos;
            let name = self.ident().to_ascii_lowercase();
            if name.is_empty() {
                self.problem(
                    self.pos..self.pos + 1,
                    format!("unexpected character in entry {key}"),
                );
                self.pos += 1;
                continue;
            }
            self.ws();
            if self.peek() != Some(b'=') {
                self.problem(
                    field_start..self.pos,
                    format!("expected = after field {name} in entry {key}"),
                );
                continue;
            }
            self.pos += 1;
            match self.value(close) {
                Some(v) => fields.push((name, v)),
                None => self.problem(
                    field_start..self.pos,
                    format!("invalid value for field {name} in entry {key}"),
                ),
            }
        }
        if !key.is_empty() {
            self.db.entries.push(BibEntry {
                kind,
                key,
                key_span,
                span: start..self.pos,
                fields,
            });
        }
    }

    /// Reads `{…}`, `"…"`, numbers and macros joined with `#`.
    fn value(&mut self, close: u8) -> Option<String> {
        let mut out = String::new();
        loop {
            self.ws();
            match self.peek()? {
                b'{' => {
                    let start = self.pos + 1;
                    let mut depth = 0usize;
                    loop {
                        let b = self.peek()?;
                        self.pos += 1;
                        match b {
                            b'{' => depth += 1,
                            b'}' => {
                                depth -= 1;
                                if depth == 0 {
                                    break;
                                }
                            }
                            b'@' if depth == 1 && self.looks_like_entry_start() => return None,
                            _ => {}
                        }
                    }
                    out.push_str(&clean(&self.text[start..self.pos - 1]));
                }
                b'"' => {
                    self.pos += 1;
                    let start = self.pos;
                    let mut depth = 0usize;
                    loop {
                        let b = self.peek()?;
                        self.pos += 1;
                        match b {
                            b'{' => depth += 1,
                            b'}' => depth = depth.saturating_sub(1),
                            b'"' if depth == 0 => break,
                            _ => {}
                        }
                    }
                    out.push_str(&clean(&self.text[start..self.pos - 1]));
                }
                b if b.is_ascii_alphanumeric() => {
                    let word = self.ident().to_owned();
                    match self.strings.get(&word.to_ascii_lowercase()) {
                        Some(v) => out.push_str(v),
                        None => out.push_str(&word),
                    }
                }
                b if b == close || b == b',' => return Some(out),
                _ => return None,
            }
            self.ws();
            if self.peek() == Some(b'#') {
                self.pos += 1;
            } else {
                return Some(out);
            }
        }
    }

    fn looks_like_entry_start(&self) -> bool {
        // "@article{" at the start of a line inside a value means a brace is missing.
        let line_start = self.text[..self.pos - 1].rfind('\n').map_or(0, |i| i + 1);
        self.text[line_start..self.pos - 1].trim().is_empty()
            && self.text[self.pos..]
                .split(['{', '('])
                .next()
                .is_some_and(|w| {
                    !w.is_empty() && w.len() < 20 && w.chars().all(|c| c.is_ascii_alphabetic())
                })
    }
}

fn clean(s: &str) -> String {
    crate::text::squash_whitespace(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_entries_strings_and_errors() {
        let src = r#"
@string{tug = "TeX Users Group"}
@comment{ ignored @article{nope, title={x}} }
@Book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The {\TeX}book},
  publisher = "Addison-" # tug,
  year      = 1984,
  month     = sep,
}
@article{lamport,
  author = {Lamport, Leslie and Knuth, Donald and Other, A.},
  title = {\LaTeX: A document preparation system},
  journal = {J},
  date = {1986-01-01}
@misc{after, title={Still parsed}}
"#;
        let db = parse(src);
        let keys: Vec<_> = db.entries.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, ["knuth1984", "lamport", "after"]);
        let k = &db.entries[0];
        assert_eq!(k.kind, "book");
        assert_eq!(k.field("publisher"), Some("Addison-TeX Users Group"));
        assert_eq!(k.field("month"), Some("September"));
        let s = k.summary();
        assert_eq!(
            (s.authors.as_str(), s.year.as_str(), s.title.as_str()),
            ("Knuth", "1984", "The TeXbook")
        );
        let l = db.entries[1].summary();
        assert_eq!(l.authors, "Lamport et al.");
        assert_eq!(l.year, "1986");
        assert_eq!(db.problems.len(), 1, "{:?}", db.problems);
        assert!(db.problems[0].message.contains("lamport"));
    }
}
