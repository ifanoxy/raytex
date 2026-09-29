//! Friendly explanations and quick fixes for compiler diagnostics.
//!
//! The catalogue lives in `data/errors.json`: each entry matches messages
//! with a regular expression and explains them in French and English.
//! On top of the catalogue, a few errors get automatic fixes (load the
//! package that defines an unknown command, install a missing package,
//! switch engine…).

use std::sync::LazyLock;

use regex::Regex;
use serde::Deserialize;

use crate::diagnostics::{Diagnostic, Fix, Hint, Severity, Source};
use crate::i18n::Lang;
use crate::kb::{Doc, KERNEL, kb};

#[derive(Debug, Deserialize)]
struct Entry {
    id: String,
    #[serde(rename = "match")]
    pattern: String,
    title: Doc,
    explanation: Doc,
}

/// A compiled catalogue entry.
#[derive(Debug)]
pub struct ErrorInfo {
    /// Stable identifier (`undefined-control-sequence`).
    pub id: String,
    regex: Regex,
    /// Short title.
    pub title: Doc,
    /// Explanation (markdown).
    pub explanation: Doc,
}

static CATALOG: LazyLock<Vec<ErrorInfo>> = LazyLock::new(|| {
    let entries: Vec<Entry> =
        serde_json::from_str(include_str!("../../data/errors.json")).expect("errors.json");
    entries
        .into_iter()
        .filter_map(|e| match Regex::new(&e.pattern) {
            Ok(regex) => Some(ErrorInfo {
                id: e.id,
                regex,
                title: e.title,
                explanation: e.explanation,
            }),
            Err(err) => {
                tracing::error!("invalid pattern for {}: {err}", e.id);
                None
            }
        })
        .collect()
});

/// All documented errors (for the help centre).
pub fn catalog() -> &'static [ErrorInfo] {
    &CATALOG
}

static UNDEFINED_CS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\\(?:[A-Za-z@]+|.))\s*$").unwrap());
static ENV_UNDEFINED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Environment ([^\s]+) undefined").unwrap());
static FILE_NOT_FOUND: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"File `([^']+)' not found").unwrap());

/// Adds a hint and fixes to `d` (idempotent).
pub fn enrich(d: &mut Diagnostic, lang: Lang) {
    if d.hint.is_none()
        && let Some(info) = CATALOG.iter().find(|e| e.regex.is_match(&d.message))
    {
        if d.code.is_none() {
            d.code = Some(info.id.clone());
        }
        d.hint = Some(Hint {
            title: info.title.get(lang).to_owned(),
            explanation: info.explanation.get(lang).to_owned(),
        });
    }
    let mut extra = String::new();
    match d.code.as_deref() {
        Some("undefined-control-sequence") => {
            if let Some(cmd) = undefined_command(d) {
                let name = cmd.trim_start_matches('\\').to_owned();
                if let Some(pkg) = best_provider(kb().command_providers(&name)) {
                    extra = lang
                        .pick(
                            &format!("`\\{name}` est défini par le package `{pkg}`."),
                            &format!("`\\{name}` is defined by the `{pkg}` package."),
                        )
                        .to_owned();
                    push_fix(d, package_fix(pkg));
                } else if let Some(best) = closest_command(&name) {
                    extra = lang
                        .pick(
                            &format!("Vouliez-vous écrire `\\{best}` ?"),
                            &format!("Did you mean `\\{best}`?"),
                        )
                        .to_owned();
                }
            }
        }
        Some("env-undefined") => {
            if let Some(m) = ENV_UNDEFINED.captures(&d.message) {
                let env = m[1].to_owned();
                if let Some(pkg) = best_provider(kb().environment_providers(&env)) {
                    extra = lang
                        .pick(
                            &format!("L'environnement `{env}` est défini par le package `{pkg}`."),
                            &format!("The `{env}` environment is defined by the `{pkg}` package."),
                        )
                        .to_owned();
                    push_fix(d, package_fix(pkg));
                }
            }
        }
        Some("file-not-found") => {
            if let Some(m) = FILE_NOT_FOUND.captures(&d.message) {
                let file = m[1].to_owned();
                if file.ends_with(".sty")
                    || file.ends_with(".cls")
                    || file.ends_with(".ldf")
                    || file.ends_with(".bst")
                {
                    push_fix(d, Fix::InstallPackage { file });
                } else if file.ends_with(".tex") {
                    push_fix(d, Fix::CreateFile { path: file });
                }
            }
        }
        Some("fontspec-engine" | "unicode-not-set-up") => {
            push_fix(
                d,
                Fix::UseEngine {
                    engine: "lualatex".into(),
                },
            );
            push_fix(
                d,
                Fix::UseEngine {
                    engine: "xelatex".into(),
                },
            );
        }
        Some("shell-escape") => push_fix(d, Fix::EnableShellEscape),
        _ => {}
    }
    if !extra.is_empty()
        && let Some(hint) = &mut d.hint
        && !hint.explanation.contains(&extra)
    {
        hint.explanation = format!("{extra} {}", hint.explanation);
    }
}

static PACKAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:Package (\S+) (?:Error|Warning)|([A-Za-z][\w.-]*): )").unwrap()
});

/// Gives a diagnostic an explanation when the catalogue does not know its
/// message: what kind of problem it is and where to look.
pub fn fallback(d: &mut Diagnostic, lang: Lang) {
    if d.hint.is_some() {
        return;
    }
    let package = PACKAGE
        .captures(&d.message)
        .and_then(|m| m.get(1).or(m.get(2)))
        .map(|m| m.as_str().to_owned())
        .filter(|p| !matches!(p.as_str(), "Font" | "pdfTeX" | "LaTeX"));
    let error = d.severity == Severity::Error;
    let (title, explanation) = match (&package, d.source) {
        (_, Source::Bibtex | Source::Biber) => (
            lang.pick("Problème de bibliographie", "Bibliography problem").to_owned(),
            lang.pick(
                "BibTeX ou Biber signale un problème dans un fichier `.bib` ou dans les citations. Ouvrez l'entrée indiquée : une virgule, une accolade ou un champ manquant sont les causes les plus fréquentes.",
                "BibTeX or Biber reports a problem in a `.bib` file or in the citations. Open the entry: a missing comma, brace or field is the usual cause.",
            )
            .to_owned(),
        ),
        (Some(p), _) if error => (
            format!("{} {p}", lang.pick("Erreur du package", "Error of package")),
            format!(
                "{} `{p}` {}",
                lang.pick("Le package", "The package"),
                lang.pick(
                    "refuse ce qui est écrit à cet endroit. Le message (en anglais) dit quoi corriger ; sa documentation détaille ses commandes et options.",
                    "rejects what is written here. The message says what to fix; its documentation details its commands and options.",
                )
            ),
        ),
        (Some(p), _) => (
            format!("{} {p}", lang.pick("Avertissement du package", "Warning of package")),
            format!(
                "{} `{p}` {}",
                lang.pick("Le package", "The package"),
                lang.pick(
                    "signale un point à vérifier ; le PDF est tout de même produit. Le message (en anglais) indique quoi changer.",
                    "points out something to check; the PDF is still produced. The message says what to change.",
                )
            ),
        ),
        (None, _) if error => (
            lang.pick("Erreur LaTeX", "LaTeX error").to_owned(),
            lang.pick(
                "LaTeX s'est arrêté sur cette ligne. Regardez le texte signalé : une commande mal écrite, une accolade ou un `$` manquant sont les causes les plus fréquentes. Quand plusieurs erreurs se suivent, corrigez d'abord la première : les suivantes en sont souvent la conséquence.",
                "LaTeX stopped on this line. Look at the highlighted text: a misspelled command, a missing brace or `$` are the usual causes. When errors follow each other, fix the first one: the next ones are often its consequence.",
            )
            .to_owned(),
        ),
        (None, _) => (
            lang.pick("Avertissement LaTeX", "LaTeX warning").to_owned(),
            lang.pick(
                "LaTeX signale un point à vérifier, mais le PDF est produit. Le message (en anglais) indique ce qui ne va pas.",
                "LaTeX points out something to check, but the PDF is produced. The message says what is wrong.",
            )
            .to_owned(),
        ),
    };
    d.hint = Some(Hint { title, explanation });
}

/// Loads a package, with the options it asks for when loaded without them.
pub fn package_fix(package: String) -> Fix {
    let options = match package.as_str() {
        "mhchem" => Some("version=4".to_owned()),
        _ => None,
    };
    Fix::AddPackage { package, options }
}

fn push_fix(d: &mut Diagnostic, fix: Fix) {
    if !d.fixes.contains(&fix) {
        d.fixes.push(fix);
    }
}

/// The undefined command named by an "Undefined control sequence" error.
pub fn undefined_command(d: &Diagnostic) -> Option<&str> {
    let before = d.context_before.as_deref()?;
    UNDEFINED_CS
        .captures(before)
        .map(|m| m.get(1).unwrap().as_str())
}

fn best_provider(providers: Vec<&str>) -> Option<String> {
    if providers.contains(&KERNEL) {
        return None;
    }
    providers.first().map(|p| (*p).to_owned())
}

/// The command of the LaTeX kernel closest to `name` (edit distance ≤ 2), if any.
pub fn closest_command(name: &str) -> Option<String> {
    let max = if name.len() <= 4 { 1 } else { 2 };
    let mut best: Option<(usize, &str)> = None;
    for cmd in kb().commands().iter().filter(|c| c.package == KERNEL) {
        let candidate = cmd.name.as_str();
        if candidate == name || candidate.len().abs_diff(name.len()) > max {
            continue;
        }
        let dist = levenshtein(name, candidate);
        if dist <= max && best.is_none_or(|(d, c)| dist < d || (dist == d && candidate < c)) {
            best = Some((dist, candidate));
        }
    }
    best.map(|(_, c)| c.to_owned())
}

/// Edit distance between two short strings.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for (i, ca) in a.chars().enumerate() {
        cur[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != *cb);
            cur[j + 1] = (prev[j + 1] + 1).min(cur[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::{Severity, Source};

    #[test]
    fn undefined_command_suggestions() {
        let mut d = Diagnostic::new(
            Severity::Error,
            Source::Latex,
            "Undefined control sequence.",
        );
        d.context_before = Some("Voici \\textbff".into());
        enrich(&mut d, Lang::Fr);
        let hint = d.hint.unwrap();
        assert_eq!(hint.title, "Commande inconnue");
        assert!(
            hint.explanation
                .starts_with("Vouliez-vous écrire `\\textbf` ?"),
            "{}",
            hint.explanation
        );

        let mut d = Diagnostic::new(
            Severity::Error,
            Source::Latex,
            "Undefined control sequence.",
        );
        d.context_before = Some("$x \\in \\mathbb".into());
        enrich(&mut d, Lang::En);
        assert_eq!(d.fixes, [Fix::add_package("amsfonts")]);
    }

    #[test]
    fn bitmap_font_with_microtype_is_explained() {
        let mut d = Diagnostic::new(
            Severity::Error,
            Source::Latex,
            "pdfTeX error (font expansion): auto expansion is only possible with scalable fonts.",
        );
        enrich(&mut d, Lang::En);
        let hint = d.hint.unwrap();
        assert_eq!(hint.title, "Font not installed as a vector font");
        assert!(hint.explanation.contains("expansion=false"));
    }

    #[test]
    fn catalog_is_valid() {
        assert!(catalog().len() > 30);
        assert_eq!(levenshtein("textbff", "textbf"), 1);
    }
}
