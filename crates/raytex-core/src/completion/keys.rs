//! Keys and values of arguments: `\includegraphics[width=…]`,
//! `\begin{itemize}[label=…]`, `\hypersetup{colorlinks, …}`, options of
//! `\usepackage[…]{geometry}`…
//!
//! A documented list (`data/keys.json`, in French and English) says which
//! argument takes which keys; the keys that the installed version of a
//! package declares in its sources (`\define@key{Gin}{…}`, `\lst@Key{…}`,
//! l3keys…) are added to it, without documentation.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use regex::Regex;
use serde::Deserialize;

use crate::i18n::Lang;

/// Keys taken by some arguments, brought by one package.
#[derive(Debug, Deserialize)]
pub struct KeySet {
    /// Package bringing the keys: `latex` for the kernel, `class:beamer` for a class.
    pub package: String,
    /// Arguments taking them: `\includegraphics[1]` (first optional
    /// argument), `\hypersetup{1}` (first mandatory one), `itemize[1]`
    /// (`\begin{itemize}[…]`).
    #[serde(default, rename = "for")]
    pub targets: Vec<String>,
    /// Packages whose options (`\usepackage[…]{geometry}`) take them too.
    #[serde(default)]
    pub options_of: Vec<String>,
    /// The argument is one of these names and nothing else (`\pagestyle`).
    /// Without it, the keys are proposals: `\vspace{1em}` does not make
    /// `\vspace{1cm}` a mistake.
    #[serde(default)]
    pub exact: bool,
    /// How to find more keys in the sources of the package.
    #[serde(default)]
    pub learn: Option<Learn>,
    /// The documented keys.
    pub keys: Vec<Key>,
}

/// Files of a package and the pattern of its key declarations (first group: the key).
#[derive(Debug, Deserialize)]
pub struct Learn {
    /// Files of the package (`graphicx.sty`).
    pub files: Vec<String>,
    /// Regular expression of a declaration.
    pub pattern: String,
}

/// One key.
#[derive(Debug, Deserialize)]
pub struct Key {
    /// Name of the key.
    #[serde(rename = "k")]
    pub name: String,
    /// Snippet written after `name=` (none: a key without value, or one
    /// whose values are listed).
    #[serde(default, rename = "v")]
    pub value: Option<String>,
    /// French documentation.
    #[serde(default)]
    pub fr: String,
    /// English documentation.
    #[serde(default)]
    pub en: String,
    /// Values offered after `name=`.
    #[serde(default)]
    pub values: Vec<Value>,
}

impl Key {
    /// Documentation in `lang`.
    pub fn doc(&self, lang: Lang) -> &str {
        lang.pick(&self.fr, &self.en)
    }
}

/// A value: plain, or `[value, French doc, English doc]`.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Value {
    /// A value alone.
    Plain(String),
    /// Value, French and English documentation.
    Documented(String, String, String),
}

impl Value {
    /// What is written.
    pub fn name(&self) -> &str {
        match self {
            Value::Plain(v) | Value::Documented(v, _, _) => v,
        }
    }

    /// Documentation in `lang` (empty for a plain value).
    pub fn doc(&self, lang: Lang) -> &str {
        match self {
            Value::Plain(_) => "",
            Value::Documented(_, fr, en) => lang.pick(fr, en),
        }
    }
}

#[derive(Deserialize)]
struct File {
    sets: Vec<KeySet>,
}

/// Every key set, in the order of the data file.
pub fn sets() -> &'static [KeySet] {
    static SETS: OnceLock<Vec<KeySet>> = OnceLock::new();
    SETS.get_or_init(|| {
        serde_json::from_str::<File>(include_str!("../../data/keys.json"))
            .map(|f| f.sets)
            .unwrap_or_default()
    })
}

/// Keys that set `index` declares in the installed sources of its package
/// (read once); `find` locates a file of the TeX distribution.
pub fn learned(index: usize, find: impl Fn(&str) -> Option<PathBuf>) -> Vec<String> {
    static CACHE: OnceLock<Mutex<HashMap<usize, Vec<String>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Mutex::default);
    if let Some(keys) = cache.lock().ok().and_then(|c| c.get(&index).cloned()) {
        return keys;
    }
    let Some(learn) = sets().get(index).and_then(|s| s.learn.as_ref()) else {
        return Vec::new();
    };
    let Ok(re) = Regex::new(&learn.pattern) else {
        return Vec::new();
    };
    let mut keys: Vec<String> = Vec::new();
    for file in &learn.files {
        let Some(text) = find(file).and_then(|p| std::fs::read_to_string(p).ok()) else {
            continue;
        };
        for c in re.captures_iter(&text) {
            let key = c[1].trim();
            // Internal keys (`@`, `#1` of a loop) are left out.
            if key.len() > 1
                && key
                    .chars()
                    .all(|ch| ch.is_ascii_alphabetic() || matches!(ch, ' ' | '-' | '*'))
                && !keys.iter().any(|k| k == key)
            {
                keys.push(key.to_owned());
            }
        }
    }
    if let Ok(mut c) = cache.lock() {
        c.insert(index, keys.clone());
    }
    keys
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_is_read() {
        let sets = sets();
        assert!(sets.len() > 20, "keys.json could not be read");
        let graphicx = sets
            .iter()
            .find(|s| s.targets.iter().any(|t| t == "\\includegraphics[1]"))
            .unwrap();
        let width = graphicx.keys.iter().find(|k| k.name == "width").unwrap();
        assert!(width.value.as_deref().unwrap().contains("\\linewidth"));
        assert!(!width.doc(Lang::Fr).is_empty() && !width.doc(Lang::En).is_empty());
        let enumitem = sets.iter().find(|s| s.package == "enumitem").unwrap();
        let label = enumitem.keys.iter().find(|k| k.name == "label").unwrap();
        assert!(label.values.iter().any(|v| v.name() == "\\arabic*."));
        for s in sets {
            for t in &s.targets {
                assert!(
                    t.ends_with(']') || t.ends_with('}'),
                    "target without a position: {t}"
                );
            }
            if let Some(l) = &s.learn {
                assert!(Regex::new(&l.pattern).is_ok(), "{}", l.pattern);
            }
        }
    }

    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn keys_are_read_from_installed_packages() {
        let dist = crate::tex::detect(&[]).into_iter().next().expect("no TeX");
        let index = crate::tex::texmf::TexmfIndex::build(&dist);
        for package in [
            "graphicx",
            "hyperref",
            "geometry",
            "enumitem",
            "caption",
            "listings",
            "siunitx",
            "tcolorbox",
            "tikz",
        ] {
            let Some((i, _)) = sets()
                .iter()
                .enumerate()
                .find(|(_, s)| s.package == package && s.learn.is_some())
            else {
                panic!("{package}: no set to learn");
            };
            let keys = learned(i, |f| index.find(f));
            println!(
                "{package}: {} keys, {:?}",
                keys.len(),
                &keys[..keys.len().min(8)]
            );
            if index
                .find(&sets()[i].learn.as_ref().unwrap().files[0])
                .is_some()
            {
                assert!(keys.len() > 5, "{package}: {keys:?}");
            }
        }
    }
}
