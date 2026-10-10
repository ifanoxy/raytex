//! The bibliography of a project as a list to read and to change.
//!
//! [`crate::bib`] reads `.bib` files for completion and checks. This module
//! gives the same entries to the bibliography panel, with what a reader
//! wants to know of each (how many times it is cited, whether another entry
//! is the same work), their fields as they are written, and the text
//! operations of the panel: writing an entry, replacing it, removing it.
//! It also fetches an entry from a DOI or an arXiv identifier, when asked.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::bib;
use crate::workspace::Workspace;

/// A field of an entry, as written in the file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Field {
    /// Name, lowercase (`author`).
    pub name: String,
    /// What stands between the braces or the quotes; for a raw field, the
    /// expression itself.
    pub value: String,
    /// Written without braces: a number, a `@string` macro (`jan`), or
    /// pieces joined by `#`.
    #[serde(default)]
    pub raw: bool,
}

/// An entry of the bibliography of a project.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BibItem {
    /// The `.bib` file.
    pub file: PathBuf,
    /// Line of the entry (1-based).
    pub line: u32,
    /// Citation key.
    pub key: String,
    /// Entry type, lowercase.
    pub kind: String,
    /// "Knuth", "Knuth & Lamport" or "Knuth et al.".
    pub authors: String,
    /// Year.
    pub year: String,
    /// Title, as plain text.
    pub title: String,
    /// Journal, book title or publisher.
    pub venue: String,
    /// Fields as written.
    pub fields: Vec<Field>,
    /// Number of times the project cites it.
    pub cited: usize,
    /// Another entry of the project has the same key.
    pub same_key: bool,
    /// Key of an earlier entry that is the same work (same DOI, or same
    /// title and year).
    pub same_as: Option<String>,
}

/// The bibliography of a project.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bibliography {
    /// The `.bib` files of the project.
    pub files: Vec<PathBuf>,
    /// Their entries, in order.
    pub entries: Vec<BibItem>,
    /// `\nocite{*}`: every entry is printed, cited or not.
    pub all_cited: bool,
}

/// The entries of the project whose main file is `root`.
pub fn list(ws: &Workspace, root: &Path) -> Bibliography {
    let mut cited: HashMap<&str, usize> = HashMap::new();
    for doc in ws.project_documents(root) {
        for use_ in &doc.index.citations {
            *cited.entry(use_.name.as_str()).or_default() += 1;
        }
    }
    let files = ws.bib_files(root);
    let mut entries = Vec::new();
    for file in &files {
        let Some(doc) = ws.document(file) else {
            continue;
        };
        let Some(db) = &doc.bib else { continue };
        for e in &db.entries {
            let summary = e.summary();
            entries.push(BibItem {
                file: file.clone(),
                line: doc.range(&e.span).start.line + 1,
                cited: cited.get(e.key.as_str()).copied().unwrap_or(0),
                key: summary.key,
                kind: summary.kind,
                authors: summary.authors,
                year: summary.year,
                title: summary.title,
                venue: summary.venue,
                fields: raw_fields(&doc.text[e.span.clone()]),
                same_key: false,
                same_as: None,
            });
        }
    }
    mark_duplicates(&mut entries);
    Bibliography {
        files,
        entries,
        all_cited: cited.contains_key("*"),
    }
}

/// What makes two entries the same work: their DOI, else their title and year.
fn identity(e: &BibItem) -> Option<String> {
    let field = |name: &str| {
        e.fields
            .iter()
            .find(|f| f.name == name)
            .map(|f| f.value.as_str())
    };
    if let Some(doi) = field("doi").and_then(clean_doi) {
        return Some(format!("doi:{}", doi.to_lowercase()));
    }
    let title: String = e
        .title
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    (title.len() >= 8 && !e.year.is_empty()).then(|| format!("{title}:{}", e.year))
}

fn mark_duplicates(entries: &mut [BibItem]) {
    let mut keys: HashMap<String, usize> = HashMap::new();
    for e in entries.iter() {
        *keys.entry(e.key.clone()).or_default() += 1;
    }
    let mut works: HashMap<String, String> = HashMap::new();
    for e in entries.iter_mut() {
        e.same_key = keys[&e.key] > 1;
        if let Some(id) = identity(e) {
            match works.get(&id) {
                Some(first) if *first != e.key => e.same_as = Some(first.clone()),
                Some(_) => {}
                None => {
                    works.insert(id, e.key.clone());
                }
            }
        }
    }
}

// ------------------------------------------------------------------ text

/// The end of the piece that starts at `i` in a value: a group in braces,
/// a text in quotes, or a bare word.
fn piece_end(b: &[u8], i: usize) -> usize {
    match b.get(i) {
        Some(b'{') => {
            let mut depth = 0usize;
            let mut j = i;
            while j < b.len() {
                match b[j] {
                    b'\\' => j += 1,
                    b'{' => depth += 1,
                    b'}' => {
                        depth -= 1;
                        if depth == 0 {
                            return j + 1;
                        }
                    }
                    _ => {}
                }
                j += 1;
            }
            b.len()
        }
        Some(b'"') => {
            let mut depth = 0usize;
            let mut j = i + 1;
            while j < b.len() {
                match b[j] {
                    b'\\' => j += 1,
                    b'{' => depth += 1,
                    b'}' => depth = depth.saturating_sub(1),
                    b'"' if depth == 0 => return j + 1,
                    _ => {}
                }
                j += 1;
            }
            b.len()
        }
        _ => {
            let mut j = i;
            while j < b.len()
                && !matches!(b[j], b',' | b'}' | b')' | b'#')
                && !b[j].is_ascii_whitespace()
            {
                j += 1;
            }
            j
        }
    }
}

/// The fields of one entry (`@article{key, …}`) as they are written.
pub fn raw_fields(entry: &str) -> Vec<Field> {
    let b = entry.as_bytes();
    let mut out = Vec::new();
    // After the key.
    let Some(open) = entry.find(['{', '(']) else {
        return out;
    };
    let Some(comma) = entry[open..].find(',') else {
        return out;
    };
    let mut i = open + comma + 1;
    loop {
        while i < b.len() && (b[i].is_ascii_whitespace() || b[i] == b',') {
            i += 1;
        }
        let start = i;
        while i < b.len()
            && (b[i].is_ascii_alphanumeric() || matches!(b[i], b'_' | b'-' | b':' | b'.'))
        {
            i += 1;
        }
        if i == start {
            return out;
        }
        let name = entry[start..i].to_lowercase();
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if b.get(i) != Some(&b'=') {
            return out;
        }
        i += 1;
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        // The value: pieces joined by `#`.
        let from = i;
        let mut pieces = 0;
        let mut to = i;
        loop {
            let end = piece_end(b, i);
            if end == i {
                break;
            }
            pieces += 1;
            to = end;
            i = end;
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
            if b.get(i) != Some(&b'#') {
                break;
            }
            i += 1;
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
        }
        let text = &entry[from..to];
        let wrapped =
            pieces == 1 && (text.starts_with('{') || text.starts_with('"')) && text.len() >= 2;
        out.push(Field {
            name,
            value: if wrapped {
                text[1..text.len() - 1].to_owned()
            } else {
                text.trim().to_owned()
            },
            raw: !wrapped,
        });
    }
}

/// Whether the braces of a value are balanced (it can be written in braces).
pub fn balanced(value: &str) -> bool {
    let mut depth = 0i32;
    let mut escaped = false;
    for c in value.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        match c {
            '\\' => escaped = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
    }
    depth == 0
}

/// An entry as it is written in a `.bib` file: a field per line, empty
/// fields left out.
pub fn entry_text(kind: &str, key: &str, fields: &[Field]) -> String {
    let mut out = format!("@{}{{{},\n", kind.trim().to_lowercase(), key.trim());
    for f in fields {
        let value = f.value.trim();
        if f.name.trim().is_empty() || value.is_empty() {
            continue;
        }
        let name = f.name.trim().to_lowercase();
        if f.raw {
            out.push_str(&format!("  {name} = {value},\n"));
        } else {
            out.push_str(&format!("  {name} = {{{value}}},\n"));
        }
    }
    out.push('}');
    out
}

/// `text` with `entry` in place of the entry whose key is `replaces`, or
/// added at the end when there is none.
pub fn upsert(text: &str, replaces: Option<&str>, entry: &str) -> String {
    let db = bib::parse(text);
    if let Some(old) = replaces.and_then(|k| db.get(k)) {
        return format!(
            "{}{}{}",
            &text[..old.span.start],
            entry,
            &text[old.span.end..]
        );
    }
    let body = text.trim_end();
    if body.is_empty() {
        format!("{entry}\n")
    } else {
        format!("{body}\n\n{entry}\n")
    }
}

/// `text` without the entry whose key is `key`.
pub fn remove(text: &str, key: &str) -> Option<String> {
    let db = bib::parse(text);
    let e = db.get(key)?;
    let before = text[..e.span.start].trim_end_matches([' ', '\t']);
    let after = text[e.span.end..].trim_start_matches([' ', '\t']);
    let after = after
        .strip_prefix("\r\n")
        .or(after.strip_prefix('\n'))
        .unwrap_or(after);
    // One blank line between what was around it.
    let before = before.trim_end_matches('\n');
    let after = after.trim_start_matches(['\n', '\r']);
    Some(match (before.is_empty(), after.is_empty()) {
        (true, _) => after.to_owned(),
        (false, true) => format!("{before}\n"),
        (false, false) => format!("{before}\n\n{after}"),
    })
}

/// An entry read from pasted or fetched BibTeX.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Draft {
    /// Entry type.
    pub kind: String,
    /// Key as written.
    pub key: String,
    /// Fields as written.
    pub fields: Vec<Field>,
}

/// The entries of a piece of BibTeX (pasted from a site, or fetched).
pub fn drafts(text: &str) -> Vec<Draft> {
    bib::parse(text)
        .entries
        .iter()
        .map(|e| Draft {
            kind: e.kind.clone(),
            key: e.key.clone(),
            fields: raw_fields(&text[e.span.clone()]),
        })
        .collect()
}

/// A key for an entry: the name of its first author and its year
/// (`knuth1984`), with a letter when it is taken.
pub fn suggest_key(fields: &[Field], taken: &[String]) -> String {
    let field = |name: &str| {
        fields
            .iter()
            .find(|f| f.name == name)
            .map(|f| f.value.as_str())
            .unwrap_or_default()
    };
    let author = field("author");
    let author = if author.is_empty() {
        field("editor")
    } else {
        author
    };
    let first = author.split(" and ").next().unwrap_or_default().trim();
    let last = match first.split_once(',') {
        Some((last, _)) => last,
        None => first.rsplit(' ').next().unwrap_or(first),
    };
    let mut name: String = crate::syntax::plain::to_plain(last)
        .chars()
        .filter_map(|c| match c {
            'a'..='z' | '0'..='9' => Some(c),
            'A'..='Z' => Some(c.to_ascii_lowercase()),
            'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' | 'À' | 'Á' | 'Â' | 'Ä' => Some('a'),
            'ç' | 'Ç' => Some('c'),
            'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => Some('e'),
            'ì' | 'í' | 'î' | 'ï' | 'Î' | 'Ï' => Some('i'),
            'ñ' | 'Ñ' => Some('n'),
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' | 'ø' | 'Ô' | 'Ö' | 'Ø' => Some('o'),
            'ù' | 'ú' | 'û' | 'ü' | 'Û' | 'Ü' => Some('u'),
            _ => None,
        })
        .collect();
    if name.is_empty() {
        name = "ref".into();
    }
    let year: String = field("year")
        .chars()
        .chain(field("date").chars())
        .filter(char::is_ascii_digit)
        .take(4)
        .collect();
    let base = format!("{name}{year}");
    if !taken.contains(&base) {
        return base;
    }
    ('a'..='z')
        .map(|c| format!("{base}{c}"))
        .find(|k| !taken.contains(k))
        .unwrap_or(base)
}

// ----------------------------------------------------------------- fetch

/// Why an entry could not be fetched.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum FetchError {
    /// What was typed is not an identifier of that kind.
    #[error("not an identifier")]
    Invalid,
    /// Nothing is known under this identifier.
    #[error("not found")]
    NotFound,
    /// The network, or the answer.
    #[error("{0}")]
    Http(String),
}

/// A DOI out of what was typed or pasted (`https://doi.org/10.1000/xyz`,
/// `doi:10.1000/xyz`).
pub fn clean_doi(input: &str) -> Option<String> {
    let s = input.trim();
    let at = s.find("10.")?;
    let doi = s[at..].trim_end_matches(['.', ',', ';', ')', '}']);
    let (prefix, suffix) = doi.split_once('/')?;
    let registrant = prefix.strip_prefix("10.")?;
    ((4..=9).contains(&registrant.len())
        && registrant.chars().all(|c| c.is_ascii_digit() || c == '.')
        && !suffix.is_empty()
        && !doi.contains(char::is_whitespace))
    .then(|| doi.to_owned())
}

/// An arXiv identifier out of what was typed or pasted
/// (`arXiv:2301.01234v2`, `https://arxiv.org/abs/2301.01234`,
/// `hep-th/9901001`).
pub fn clean_arxiv(input: &str) -> Option<String> {
    let s = input.trim().trim_end_matches(".pdf");
    let s = s.rsplit_once("arxiv.org/abs/").map_or(s, |(_, id)| id);
    let s = s.rsplit_once("arxiv.org/pdf/").map_or(s, |(_, id)| id);
    let s = s
        .strip_prefix("arXiv:")
        .or(s.strip_prefix("arxiv:"))
        .unwrap_or(s)
        .trim();
    let (id, version) = match s.rfind('v') {
        Some(i)
            if i > 0
                && s[i + 1..].chars().all(|c| c.is_ascii_digit())
                && !s[i + 1..].is_empty() =>
        {
            (&s[..i], &s[i..])
        }
        _ => (s, ""),
    };
    let digits = |t: &str, n: std::ops::RangeInclusive<usize>| {
        n.contains(&t.len()) && t.chars().all(|c| c.is_ascii_digit())
    };
    let new_style = id
        .split_once('.')
        .is_some_and(|(a, b)| digits(a, 4..=4) && digits(b, 4..=5));
    let old_style = id.split_once('/').is_some_and(|(archive, number)| {
        !archive.is_empty()
            && archive
                .chars()
                .all(|c| c.is_ascii_alphabetic() || c == '-' || c == '.')
            && digits(number, 7..=7)
    });
    (new_style || old_style).then(|| format!("{id}{version}"))
}

fn http_get(url: &str, accept: &str) -> Result<String, FetchError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .user_agent(concat!("raytex/", env!("CARGO_PKG_VERSION")))
        .build()
        .into();
    let mut response = agent
        .get(url)
        .header("Accept", accept)
        .call()
        .map_err(|e| match e {
            ureq::Error::StatusCode(404) => FetchError::NotFound,
            other => FetchError::Http(other.to_string()),
        })?;
    response
        .body_mut()
        .read_to_string()
        .map_err(|e| FetchError::Http(e.to_string()))
}

/// The entry of a DOI, as BibTeX (asked to doi.org, which hands the
/// question to the registry of the DOI).
pub fn fetch_doi(input: &str) -> Result<String, FetchError> {
    let doi = clean_doi(input).ok_or(FetchError::Invalid)?;
    let text = http_get(
        &format!("https://doi.org/{doi}"),
        "application/x-bibtex; charset=utf-8",
    )?;
    if drafts(&text).is_empty() {
        return Err(FetchError::NotFound);
    }
    Ok(text)
}

/// The entry of an arXiv preprint, as BibTeX (asked to export.arxiv.org).
pub fn fetch_arxiv(input: &str) -> Result<String, FetchError> {
    let id = clean_arxiv(input).ok_or(FetchError::Invalid)?;
    let feed = http_get(
        &format!("https://export.arxiv.org/api/query?id_list={id}"),
        "application/atom+xml",
    )?;
    arxiv_entry(&feed, &id).ok_or(FetchError::NotFound)
}

/// The text of the first `<tag>` of `xml`.
fn xml_text<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open = xml.find(&format!("<{tag}"))?;
    let start = open + xml[open..].find('>')? + 1;
    let end = start + xml[start..].find(&format!("</{tag}>"))?;
    Some(&xml[start..end])
}

fn xml_plain(s: &str) -> String {
    let s = s
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'");
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The entry of the preprint `id`, from the answer of arXiv (Atom).
pub fn arxiv_entry(feed: &str, id: &str) -> Option<String> {
    let entry = xml_text(feed, "entry")?;
    let title = xml_plain(xml_text(entry, "title")?);
    if title.is_empty() || title == "Error" {
        return None;
    }
    let authors: Vec<String> = entry
        .split("<author>")
        .skip(1)
        .filter_map(|a| xml_text(a, "name").map(xml_plain))
        .collect();
    let year: String = xml_text(entry, "published")?.chars().take(4).collect();
    let class = entry
        .find("primary_category")
        .and_then(|i| entry[i..].split_once("term=\""))
        .and_then(|(_, rest)| rest.split_once('"'))
        .map(|(term, _)| term.to_owned());
    let bare = id
        .rfind('v')
        .filter(|&i| i > 0 && id[i + 1..].chars().all(|c| c.is_ascii_digit()))
        .map_or(id, |i| &id[..i]);
    let field = |name: &str, value: String| Field {
        name: name.into(),
        value,
        raw: false,
    };
    let mut fields = vec![
        field("author", authors.join(" and ")),
        field("title", title),
        field("year", year),
        field("eprint", bare.to_owned()),
        field("archiveprefix", "arXiv".into()),
    ];
    if let Some(class) = class {
        fields.push(field("primaryclass", class));
    }
    if let Some(doi) = xml_text(entry, "arxiv:doi") {
        fields.push(field("doi", xml_plain(doi)));
    }
    fields.push(field("url", format!("https://arxiv.org/abs/{bare}")));
    let key = suggest_key(&fields, &[]);
    Some(entry_text("misc", &key, &fields))
}

#[cfg(test)]
mod tests {
    use super::*;

    const KNUTH: &str = "@book{knuth1984,\n  author = {Knuth, Donald E.},\n  title = {The {\\TeX}book},\n  year = 1984,\n  publisher = \"Addison-Wesley\",\n  month = jan,\n  note = jgr # \" Letters\",\n}";

    #[test]
    fn fields_are_read_as_they_are_written() {
        let fields = raw_fields(KNUTH);
        let shown: Vec<(&str, &str, bool)> = fields
            .iter()
            .map(|f| (f.name.as_str(), f.value.as_str(), f.raw))
            .collect();
        assert_eq!(
            shown,
            [
                ("author", "Knuth, Donald E.", false),
                ("title", "The {\\TeX}book", false),
                ("year", "1984", true),
                ("publisher", "Addison-Wesley", false),
                ("month", "jan", true),
                ("note", "jgr # \" Letters\"", true),
            ]
        );
        // Written back: braces for a text, nothing around a number or a macro.
        assert_eq!(
            entry_text("Book", " knuth1984 ", &fields),
            "@book{knuth1984,\n  author = {Knuth, Donald E.},\n  title = {The {\\TeX}book},\n  year = 1984,\n  publisher = {Addison-Wesley},\n  month = jan,\n  note = jgr # \" Letters\",\n}"
        );
        assert!(
            balanced("The {\\TeX}book")
                && balanced("50\\} off")
                && !balanced("a {b")
                && !balanced("a } b {")
        );
    }

    #[test]
    fn an_entry_is_replaced_added_and_removed() {
        let file =
            format!("% my references\n\n{KNUTH}\n\n@misc{{web,\n  title = {{A page}},\n}}\n");
        let new = "@misc{web2,\n  title = {Another page},\n}";
        let replaced = upsert(&file, Some("web"), new);
        assert!(
            replaced.contains("@misc{web2,")
                && !replaced.contains("@misc{web,")
                && replaced.contains("knuth1984")
        );
        let added = upsert(&file, None, new);
        assert!(added.ends_with(
            "@misc{web,\n  title = {A page},\n}\n\n@misc{web2,\n  title = {Another page},\n}\n"
        ));
        assert_eq!(upsert("", None, new), format!("{new}\n"));
        // A key that is not there is an addition.
        assert_eq!(upsert(&file, Some("nobody"), new), added);
        let removed = remove(&file, "knuth1984").unwrap();
        assert_eq!(
            removed,
            "% my references\n\n@misc{web,\n  title = {A page},\n}\n"
        );
        assert_eq!(remove(&removed, "web").unwrap(), "% my references\n");
        assert_eq!(remove(&file, "nobody"), None);
    }

    #[test]
    fn keys_are_made_from_the_author_and_the_year() {
        let f = |name: &str, value: &str| Field {
            name: name.into(),
            value: value.into(),
            raw: false,
        };
        assert_eq!(
            suggest_key(
                &[
                    f("author", "Knuth, Donald E. and Lamport, Leslie"),
                    f("year", "1984")
                ],
                &[]
            ),
            "knuth1984"
        );
        assert_eq!(
            suggest_key(
                &[f("author", "Évariste Galois"), f("date", "1832-05-31")],
                &[]
            ),
            "galois1832"
        );
        assert_eq!(
            suggest_key(
                &[f("author", "Knuth, D."), f("year", "1984")],
                &["knuth1984".into(), "knuth1984a".into()]
            ),
            "knuth1984b"
        );
        assert_eq!(suggest_key(&[f("title", "No author")], &[]), "ref");
    }

    #[test]
    fn identifiers_are_read_from_what_is_pasted() {
        assert_eq!(
            clean_doi("https://doi.org/10.1016/j.jcp.2019.108925.").as_deref(),
            Some("10.1016/j.jcp.2019.108925")
        );
        assert_eq!(clean_doi("doi:10.1000/182").as_deref(), Some("10.1000/182"));
        assert_eq!(clean_doi("10.1000"), None);
        assert_eq!(clean_doi("see my paper"), None);
        assert_eq!(
            clean_arxiv("arXiv:2301.01234v2").as_deref(),
            Some("2301.01234v2")
        );
        assert_eq!(
            clean_arxiv("https://arxiv.org/abs/2301.01234").as_deref(),
            Some("2301.01234")
        );
        assert_eq!(
            clean_arxiv("https://arxiv.org/pdf/1706.03762v7.pdf").as_deref(),
            Some("1706.03762v7")
        );
        assert_eq!(
            clean_arxiv("hep-th/9901001").as_deref(),
            Some("hep-th/9901001")
        );
        assert_eq!(clean_arxiv("2301.1"), None);
        assert_eq!(clean_arxiv("10.1000/182"), None);
    }

    #[test]
    fn an_arxiv_answer_becomes_an_entry() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: id_list=1706.03762</title>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All
  You Need</title>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>"#;
        assert_eq!(
            arxiv_entry(feed, "1706.03762v7").unwrap(),
            "@misc{vaswani2017,\n  author = {Ashish Vaswani and Noam Shazeer},\n  title = {Attention Is All You Need},\n  year = {2017},\n  eprint = {1706.03762},\n  archiveprefix = {arXiv},\n  primaryclass = {cs.CL},\n  url = {https://arxiv.org/abs/1706.03762},\n}"
        );
        assert_eq!(arxiv_entry("<feed></feed>", "1706.03762"), None);
    }

    /// The real answers of doi.org and arxiv.org
    /// (`RAYTEX_ONLINE=1 cargo test -p raytex-core --lib online -- --ignored`).
    #[test]
    #[ignore = "asks doi.org and arxiv.org"]
    fn online_references_are_fetched() {
        if std::env::var_os("RAYTEX_ONLINE").is_none() {
            println!("RAYTEX_ONLINE is not set: nothing asked");
            return;
        }
        let doi = fetch_doi("https://doi.org/10.1145/359327.359336").expect("doi");
        let entry = &drafts(&doi)[0];
        println!("{doi}");
        let field = |name: &str| {
            entry
                .fields
                .iter()
                .find(|f| f.name == name)
                .map(|f| (f.value.as_str(), f.raw))
        };
        assert_eq!(
            field("title"),
            Some(("The CRAY-1 computer system", false)),
            "{doi}"
        );
        assert_eq!(field("year"), Some(("1978", false)));
        // A month is a macro of BibTeX, written without braces; names are lowercase.
        assert_eq!(field("month"), Some(("Jan", true)));
        assert_eq!(field("doi"), Some(("10.1145/359327.359336", false)));
        assert_eq!(suggest_key(&entry.fields, &[]), "russell1978");
        let arxiv = fetch_arxiv("arXiv:1706.03762v7").expect("arxiv");
        println!("{arxiv}");
        assert!(
            arxiv.starts_with("@misc{vaswani2017,") && arxiv.contains("Attention Is All You Need"),
            "{arxiv}"
        );
        assert_eq!(
            fetch_doi("10.99999/this-does-not-exist-raytex"),
            Err(FetchError::NotFound)
        );
        assert_eq!(fetch_doi("not a doi"), Err(FetchError::Invalid));
        assert_eq!(fetch_arxiv("9999.99999"), Err(FetchError::NotFound));
    }

    #[test]
    fn the_bibliography_of_a_project() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\nSee \\cite{knuth1984} and \\cite{knuth1984, lamport}.\n\\bibliography{refs}\n\\end{document}\n",
        )
        .unwrap();
        std::fs::write(
            dir.path().join("refs.bib"),
            format!("{KNUTH}\n\n@book{{lamport,\n  title = {{LaTeX: A Document Preparation System}},\n  year = {{1986}},\n  doi = {{10.1000/182}},\n}}\n\n@book{{lamport2,\n  title = {{Another title}},\n  doi = {{https://doi.org/10.1000/182}},\n}}\n\n@misc{{knuth1984,\n  title = {{the texbook}},\n  year = {{1984}},\n}}\n\n@misc{{never,\n  title = {{Never cited at all}},\n}}\n"),
        )
        .unwrap();
        let ws = Workspace::open(dir.path());
        let root = ws.root_for(&dir.path().join("main.tex"));
        let b = list(&ws, &root);
        assert_eq!(b.files.len(), 1);
        assert!(!b.all_cited);
        let shown: Vec<(&str, usize, bool, Option<&str>, u32)> = b
            .entries
            .iter()
            .map(|e| {
                (
                    e.key.as_str(),
                    e.cited,
                    e.same_key,
                    e.same_as.as_deref(),
                    e.line,
                )
            })
            .collect();
        assert_eq!(
            shown,
            [
                ("knuth1984", 2, true, None, 1),
                ("lamport", 1, false, None, 10),
                // The same DOI as `lamport`, written as an address.
                ("lamport2", 0, false, Some("lamport"), 16),
                // The same key as the first one (and the same title and year).
                ("knuth1984", 2, true, None, 21),
                ("never", 0, false, None, 26),
            ]
        );
        assert_eq!(b.entries[0].authors, "Knuth");
        assert_eq!(b.entries[0].fields[1].value, "The {\\TeX}book");
    }
}
