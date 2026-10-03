//! What a free argument expects (an argument without a list of
//! proposals), shown above the cursor while it is typed: `\item[term]`,
//! then "term — free text shown instead of the bullet…".
//!
//! The signature comes from the knowledge base (`args` of the command) or
//! from the project's `\newcommand`; the text of each argument from
//! `data/arguments.json`: first by command and position (`\item[1]`), then
//! by the name of the argument (`text`, `title`, `key`…).

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::i18n::Lang;

/// Name and text of an argument, in French and English.
#[derive(Debug, Deserialize)]
struct Text {
    fr: (String, String),
    en: (String, String),
}

impl Text {
    fn pick(&self, lang: Lang) -> (&str, &str) {
        let (name, doc) = match lang {
            Lang::Fr => &self.fr,
            Lang::En => &self.en,
        };
        (name, doc)
    }
}

#[derive(Debug, Deserialize)]
struct Data {
    names: HashMap<String, Text>,
    arguments: HashMap<String, Text>,
}

fn data() -> &'static Data {
    static DATA: OnceLock<Data> = OnceLock::new();
    DATA.get_or_init(|| {
        serde_json::from_str(include_str!("../../data/arguments.json")).unwrap_or(Data {
            names: HashMap::new(),
            arguments: HashMap::new(),
        })
    })
}

/// What the argument at the cursor expects.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArgumentHint {
    /// The command and its arguments, in pieces: `\item`, `[term]`.
    pub parts: Vec<HintPart>,
    /// Name of the argument at the cursor.
    pub name: String,
    /// What to write there.
    pub doc: String,
}

/// A piece of a signature.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HintPart {
    /// Text shown.
    pub text: String,
    /// Whether it is the argument at the cursor.
    pub active: bool,
}

/// Arguments of a signature (`[label]{text}`): opening character and name.
pub fn signature_groups(args: &str) -> Vec<(char, String)> {
    let mut out = Vec::new();
    let mut chars = args.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        let close = match c {
            '[' => ']',
            '{' => '}',
            '<' => '>',
            _ => continue,
        };
        let mut depth = 0;
        let mut end = args.len();
        for (j, d) in chars.by_ref() {
            if d == c {
                depth += 1;
            } else if d == close {
                if depth == 0 {
                    end = j;
                    break;
                }
                depth -= 1;
            }
        }
        out.push((c, args[i + 1..end].trim().to_owned()));
    }
    out
}

/// Name and text of an argument in `lang`, as the hints show them.
pub(crate) fn argument_name(target: &str, name: &str, lang: Lang) -> (String, String) {
    describe(target, name, lang)
}

/// Name and text of an argument: by command and position, then by name.
fn describe(target: &str, name: &str, lang: Lang) -> (String, String) {
    let d = data();
    if let Some(t) = d.arguments.get(target) {
        let (n, doc) = t.pick(lang);
        return (n.to_owned(), doc.to_owned());
    }
    if let Some(t) = d.names.get(name) {
        let (n, doc) = t.pick(lang);
        return (n.to_owned(), doc.to_owned());
    }
    let doc = lang.pick("Texte libre.", "Free text.");
    (name.to_owned(), doc.to_owned())
}

/// The hint for argument `position` (1-based among the arguments opened
/// by `open`) of `head` (`\item`, `\begin{minipage}`), whose signature is
/// `args`; `target` names it for the data (`\item[1]`, `minipage{1}`).
pub fn hint(
    head: &str,
    args: &str,
    open: char,
    position: usize,
    target: &str,
    lang: Lang,
) -> Option<ArgumentHint> {
    let groups = signature_groups(args);
    let index = groups
        .iter()
        .enumerate()
        .filter(|(_, (c, _))| *c == open)
        .nth(position.checked_sub(1)?)
        .map(|(i, _)| i)?;
    let mut parts = vec![HintPart {
        text: head.to_owned(),
        active: false,
    }];
    let mut name = String::new();
    let mut doc = String::new();
    let mut seen: HashMap<char, usize> = HashMap::new();
    for (i, (c, raw)) in groups.iter().enumerate() {
        let n = seen.entry(*c).and_modify(|n| *n += 1).or_insert(1);
        let key = format!("{}{c}{n}{}", target_head(target), closing(*c));
        let (shown, text) = describe(&key, raw, lang);
        if i == index {
            name = shown.clone();
            doc = text;
        }
        parts.push(HintPart {
            text: format!("{c}{shown}{}", closing(*c)),
            active: i == index,
        });
    }
    Some(ArgumentHint { parts, name, doc })
}

/// `\item` of `\item[1]`, `minipage` of `minipage{1}`.
fn target_head(target: &str) -> &str {
    target.find(['[', '{']).map_or(target, |i| &target[..i])
}

fn closing(open: char) -> char {
    match open {
        '[' => ']',
        '{' => '}',
        _ => '>',
    }
}

/// Snippet defaults that are names of what to write (`${1:term}`), not
/// values: they are left out of the inserted text, the hint says it.
pub fn is_placeholder_name(default: &str) -> bool {
    default.len() > 2 && data().names.contains_key(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_and_section() {
        let h = hint("\\item", "[label]", '[', 1, "\\item[1]", Lang::Fr).unwrap();
        assert_eq!(h.name, "terme");
        assert!(h.doc.contains("puce"));
        assert_eq!(
            h.parts[1],
            HintPart {
                text: "[terme]".into(),
                active: true
            }
        );
        let s = hint(
            "\\section",
            "[short]{title}",
            '{',
            1,
            "\\section{1}",
            Lang::En,
        )
        .unwrap();
        assert_eq!(
            s.parts.iter().map(|p| p.text.as_str()).collect::<String>(),
            "\\section[short title]{title}"
        );
        assert!(s.parts[2].active && !s.parts[1].active);
        // Unknown names still give a hint; no argument there gives none.
        assert_eq!(
            hint("\\foo", "{zorglub}", '{', 1, "\\foo{1}", Lang::Fr)
                .unwrap()
                .doc,
            "Texte libre."
        );
        assert!(hint("\\foo", "{a}", '[', 1, "\\foo[1]", Lang::Fr).is_none());
        assert!(
            is_placeholder_name("term")
                && is_placeholder_name("title")
                && !is_placeholder_name("htbp")
        );
        assert_eq!(
            signature_groups("{{dir1/}{dir2/}}"),
            vec![('{', "{dir1/}{dir2/}".to_owned())]
        );
    }
}
