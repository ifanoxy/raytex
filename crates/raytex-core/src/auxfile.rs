//! Reading `.aux` files written by LaTeX, to know the real number and page
//! of every label after a compilation (`fig:plan` → "Figure 2.3, p. 12").

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

/// Resolved information about a label.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LabelInfo {
    /// Printed number ("2.3").
    pub number: String,
    /// Page ("12").
    pub page: String,
}

/// A numbered entry of the table of contents (`\numberline`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TocEntry {
    /// Sectioning level (`chapter`, `section`…).
    pub kind: String,
    /// Printed number ("2.1", "A").
    pub number: String,
}

/// Labels, citations and headings resolved by the last compilation.
#[derive(Debug, Clone, Default)]
pub struct AuxData {
    /// Label key → number and page.
    pub labels: HashMap<String, LabelInfo>,
    /// Citation keys known to the bibliography (`\bibcite`).
    pub bibcites: HashMap<String, String>,
    /// Numbered headings, in document order.
    pub toc: Vec<TocEntry>,
}

/// Reads `main.aux` in `dir` and the auxiliary files it includes (`\@input`),
/// in document order.
pub fn read(dir: &Path, main_aux: &Path) -> AuxData {
    let mut data = AuxData::default();
    let mut budget = 200;
    read_into(dir, main_aux, &mut data, &mut budget);
    data
}

fn read_into(dir: &Path, path: &Path, data: &mut AuxData, budget: &mut usize) {
    if *budget == 0 {
        return;
    }
    *budget -= 1;
    let Ok(bytes) = std::fs::read(path) else {
        return;
    };
    let text = String::from_utf8_lossy(&bytes);
    {
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("\\newlabel{") {
                if let Some((key, value)) = rest.split_once('}')
                    && !key.ends_with("@cref")
                {
                    let groups = groups(value);
                    let number = groups.first().cloned().unwrap_or_default();
                    let page = groups.get(1).cloned().unwrap_or_default();
                    data.labels.insert(
                        key.to_owned(),
                        LabelInfo {
                            number: clean(&number),
                            page: clean(&page),
                        },
                    );
                }
            } else if let Some(rest) = line.strip_prefix("\\bibcite{") {
                if let Some((key, value)) = rest.split_once('}') {
                    // `{1}` (BibTeX) or `{{1}{2020}{…}}` (natbib).
                    let g = groups(value);
                    let number = match g.first() {
                        Some(first) => first.clone(),
                        None => value
                            .trim()
                            .trim_start_matches('{')
                            .trim_end_matches('}')
                            .to_owned(),
                    };
                    data.bibcites.insert(key.to_owned(), clean(&number));
                }
            } else if let Some(rest) = line
                .strip_prefix("\\@writefile{toc}{\\contentsline {")
                .or_else(|| line.strip_prefix("\\@writefile{toc}{\\contentsline{"))
            {
                if let Some(entry) = toc_entry(rest) {
                    data.toc.push(entry);
                }
            } else if let Some(rest) = line.strip_prefix("\\@input{")
                && let Some(file) = rest.strip_suffix('}')
            {
                // Included chapters: their headings come at this point of the document.
                read_into(dir, &dir.join(file), data, budget);
            }
        }
    }
}

/// `section}{\numberline {1.2}Title}{3}{…}` → section 1.2 (unnumbered entries are skipped).
fn toc_entry(rest: &str) -> Option<TocEntry> {
    let (kind, after) = rest.split_once('}')?;
    let after = after.trim_start().strip_prefix('{')?;
    let after = after
        .strip_prefix("\\numberline")?
        .trim_start()
        .strip_prefix('{')?;
    let (number, _) = after.split_once('}')?;
    Some(TocEntry {
        kind: kind.trim().to_owned(),
        number: clean(number),
    })
}

/// Top-level `{…}` groups of `{{1.2}{3}{…}}` → ["1.2", "3", …].
fn groups(s: &str) -> Vec<String> {
    let inner = s
        .trim()
        .strip_prefix('{')
        .and_then(|s| s.strip_suffix('}'))
        .unwrap_or(s);
    let mut out = Vec::new();
    let mut depth = 0usize;
    let mut cur = String::new();
    for c in inner.chars() {
        match c {
            '{' => {
                if depth > 0 {
                    cur.push(c);
                }
                depth += 1;
            }
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    out.push(std::mem::take(&mut cur));
                } else {
                    cur.push(c);
                }
            }
            _ if depth > 0 => cur.push(c),
            _ => {}
        }
    }
    out
}

fn clean(s: &str) -> String {
    crate::syntax::plain::to_plain(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_labels_and_includes() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("main.aux"),
            "\\relax\n\\newlabel{sec:intro}{{1}{1}{Introduction}{section.1}{}}\n\\newlabel{fig:a}{{2.3}{12}}\n\\bibcite{knuth}{1}\n\\@input{chap.aux}\n",
        )
        .unwrap();
        std::fs::write(
            dir.path().join("chap.aux"),
            "\\newlabel{eq:e}{{\\textbf {4}}{7}}\n",
        )
        .unwrap();
        let data = read(dir.path(), &dir.path().join("main.aux"));
        assert_eq!(
            data.labels["fig:a"],
            LabelInfo {
                number: "2.3".into(),
                page: "12".into()
            }
        );
        assert_eq!(data.labels["eq:e"].number, "4");
        assert_eq!(data.bibcites["knuth"], "1");
    }

    #[test]
    fn reads_the_table_of_contents_in_document_order() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("main.aux"),
            "\\@writefile{toc}{\\contentsline {chapter}{\\numberline {1}Intro}{3}{chapter.1}\\protected@file@percent }\n\\@input{chap.aux}\n\\@writefile{toc}{\\contentsline {chapter}{Bibliographie}{9}{chapter*.2}}\n\\@writefile{toc}{\\contentsline {chapter}{\\numberline {A}Annexe}{10}{appendix.A}}\n",
        )
        .unwrap();
        std::fs::write(
            dir.path().join("chap.aux"),
            "\\@writefile{toc}{\\contentsline {section}{\\numberline {1.1}Contexte}{3}{section.1.1}}\n",
        )
        .unwrap();
        let data = read(dir.path(), &dir.path().join("main.aux"));
        let toc: Vec<(&str, &str)> = data
            .toc
            .iter()
            .map(|e| (e.kind.as_str(), e.number.as_str()))
            .collect();
        assert_eq!(
            toc,
            [("chapter", "1"), ("section", "1.1"), ("chapter", "A")]
        );
    }
}
