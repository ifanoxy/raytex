//! BibTeX and Biber log (`.blg`) parsers.

use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;

use crate::diagnostics::{Diagnostic, Severity, Source};

static BIBTEX_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"---line (\d+) of file (.+?)\s*$").unwrap());
static BIBER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\[\d+\] [^>]*> (WARN|ERROR) - (.*)$").unwrap());
static BIBER_FILE_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"([^/\\\s]+\.bib)(?:_\d+\.utf8)?, line (\d+)").unwrap());
static BIBER_ENTRY_FILE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\(([^()]+\.bib)\)|in file '([^']+\.bib)'").unwrap());

/// Finds a `.bib` file named `name` under `dir` (as referenced by the log).
fn bib_path(dir: &Path, name: &str) -> std::path::PathBuf {
    let name = if name.ends_with(".bib") {
        name.to_owned()
    } else {
        format!("{name}.bib")
    };
    crate::log::normalize(&dir.join(name))
}

/// Parses a BibTeX `.blg` file. `dir` is the directory BibTeX ran in.
pub fn parse_bibtex(blg: &str, dir: &Path) -> Vec<Diagnostic> {
    let lines: Vec<&str> = blg.lines().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if let Some(msg) = line.strip_prefix("Warning--") {
            out.push(Diagnostic::new(
                Severity::Warning,
                Source::Bibtex,
                msg.to_owned(),
            ));
        } else if let Some(m) = BIBTEX_LINE.captures(line) {
            // "<message>---line N of file F": the message is on the same line.
            let message = line[..m.get(0).unwrap().start()].trim().to_owned();
            let mut d = Diagnostic::new(Severity::Error, Source::Bibtex, message);
            d.line = m[1].parse().ok();
            d.file = Some(bib_path(dir, &m[2]));
            // Context lines start with " : ".
            let mut ctx = Vec::new();
            while let Some(next) = lines.get(i + 1) {
                if let Some(c) = next.strip_prefix(" : ") {
                    ctx.push(c.to_owned());
                    i += 1;
                } else {
                    break;
                }
            }
            if !ctx.is_empty() {
                d.context_before = Some(ctx.join("\n"));
            }
            // The place alone, under a message already read on the line
            // above ("I couldn't open style file…"): nothing more to say.
            if !d.message.is_empty() {
                out.push(d);
            }
        } else if line.starts_with("I couldn't open")
            || line.starts_with("I found no")
            || line.starts_with("Illegal, another \\bib")
        {
            out.push(Diagnostic::new(
                Severity::Error,
                Source::Bibtex,
                line.to_owned(),
            ));
        }
        i += 1;
    }
    out
}

/// Parses a Biber `.blg` file. `dir` is the directory Biber ran in.
pub fn parse_biber(blg: &str, dir: &Path) -> Vec<Diagnostic> {
    let mut out = Vec::new();
    for line in blg.lines() {
        let Some(m) = BIBER.captures(line) else {
            continue;
        };
        let severity = if &m[1] == "ERROR" {
            Severity::Error
        } else {
            Severity::Warning
        };
        let message = m[2].to_owned();
        let mut d = Diagnostic::new(severity, Source::Biber, message.clone());
        if let Some(fl) = BIBER_FILE_LINE.captures(&message) {
            d.file = Some(bib_path(dir, &fl[1]));
            d.line = fl[2].parse().ok();
        } else if let Some(f) = BIBER_ENTRY_FILE.captures(&message) {
            let name = f.get(1).or(f.get(2)).unwrap().as_str();
            let name = Path::new(name)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            d.file = Some(bib_path(dir, &name));
        }
        out.push(d);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bibtex_log() {
        let blg = "This is BibTeX, Version 0.99d\nDatabase file #1: refs.bib\nWarning--I didn't find a database entry for \"knuth\"\nI was expecting a `,' or a `}'---line 5 of file refs.bib\n :   title = \"Foo\"\n :  \nI'm skipping whatever remains of this entry\n(There was 1 error message)\n";
        let d = parse_bibtex(blg, Path::new("/p"));
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].severity, Severity::Warning);
        assert_eq!(d[1].line, Some(5));
        assert_eq!(d[1].file.as_deref(), Some(Path::new("/p/refs.bib")));
        assert_eq!(d[1].message, "I was expecting a `,' or a `}'");
    }

    #[test]
    fn biber_log() {
        let blg = "[0] Config.pm:307> INFO - This is Biber 2.20\n[12] Biber.pm:1234> WARN - I didn't find a database entry for 'knuth' (section 0)\n[20] Utils.pm:411> ERROR - BibTeX subsystem: /tmp/par-1/cache/refs.bib_4242.utf8, line 7, syntax error: found \"title\", expected end of entry\n";
        let d = parse_biber(blg, Path::new("/p"));
        assert_eq!(d.len(), 2);
        assert_eq!(d[1].severity, Severity::Error);
        assert_eq!(d[1].line, Some(7));
        assert_eq!(d[1].file.as_deref(), Some(Path::new("/p/refs.bib")));
    }
}
