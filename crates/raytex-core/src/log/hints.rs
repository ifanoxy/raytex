//! Friendly explanations and quick fixes for compiler diagnostics.
//!
//! The catalogue lives in `data/errors.json`: each entry matches messages
//! with a regular expression and says, in French and English, what the
//! message means. An explanation holds for every document that gets the
//! message: it never guesses a cause. The usual causes of a message are
//! kept apart (`more`), for the help centre.
//!
//! The cause of a problem in a given document is found in its sources
//! ([`crate::fixes`]) and said in the advice of the hint, with the fix.
//! Here, a few errors get the advice and the fixes that the message alone
//! gives (the package that defines an unknown command, a missing package to
//! install, another engine…).

use std::sync::LazyLock;

use regex::Regex;
use serde::Deserialize;

use crate::diagnostics::{Diagnostic, Fix, Hint};
use crate::i18n::Lang;
use crate::kb::{Doc, KERNEL, kb};

#[derive(Debug, Deserialize)]
struct Entry {
    id: String,
    #[serde(rename = "match")]
    pattern: String,
    title: Doc,
    explanation: Doc,
    #[serde(default)]
    more: Option<Doc>,
}

/// A compiled catalogue entry.
#[derive(Debug)]
pub struct ErrorInfo {
    /// Stable identifier (`undefined-control-sequence`).
    pub id: String,
    regex: Regex,
    /// Short title.
    pub title: Doc,
    /// What the message means (markdown).
    pub explanation: Doc,
    /// The usual causes and remedies (markdown), for the help centre.
    pub more: Option<Doc>,
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
                more: e.more,
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
    // Patterns are written for the message itself: `LaTeX Error:` and
    // `Package x Error:` before it are not part of what they match.
    let bare = PREFIX.replace(&d.message, "");
    if d.hint.is_none()
        && let Some(info) = CATALOG
            .iter()
            .find(|e| e.regex.is_match(&d.message) || e.regex.is_match(&bare))
    {
        if d.code.is_none() {
            d.code = Some(info.id.clone());
        }
        d.hint = Some(Hint::new(info.title.get(lang), info.explanation.get(lang)));
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
    if !extra.is_empty() {
        d.advise(extra);
    }
}

static PREFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:LaTeX Error|Package \S+ Error|Class \S+ Error): ").unwrap());
static PACKAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(Package|Class) (\S+) (Error|Warning)").unwrap());
static MISSING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^Missing (.+?) inserted").unwrap());
static EXTRA: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^Extra (.+?)(?:, or forgotten (.+?))?\.?$").unwrap());
static MISPLACED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^Misplaced (.+?)\.?$").unwrap());
static INCOMPLETE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^Incomplete (\\if\w*); all text was ignored after line (\d+)").unwrap()
});
static ONLY_IN_MODE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(.+?) allowed only in (\w+) mode").unwrap());

/// Gives a title and an explanation to a message the catalogue does not
/// know, from its shape: TeX builds its messages on a few patterns
/// ("Missing … inserted", "Extra …", "Misplaced …"), and what they mean
/// does not depend on what they name. A message of another shape is left
/// as it is: it is shown as TeX wrote it, without a text saying nothing.
pub fn fallback(d: &mut Diagnostic, lang: Lang) {
    // An advice found in the sources may have come before the title.
    if d.hint.as_ref().is_some_and(|h| h.title != d.message) {
        return;
    }
    let advice = d.hint.take().and_then(|h| h.advice);
    let bare = PREFIX.replace(&d.message, "").into_owned();
    let read = if let Some(m) = MISSING.captures(&bare) {
        let what = &m[1];
        if what.starts_with("delimiter") {
            Some((
                lang.pick("Délimiteur manquant", "Missing delimiter").to_owned(),
                lang.pick(
                    "`\\left`, `\\right` et les commandes `\\big…` doivent être suivis d'un délimiteur ; TeX a mis `.` (aucun délimiteur) à la place.",
                    "`\\left`, `\\right` and the `\\big…` commands must be followed by a delimiter; TeX put `.` (no delimiter) instead.",
                )
                .to_owned(),
            ))
        } else {
            Some((
                lang.pick(&format!("`{what}` manquant"), &format!("Missing `{what}`"))
                    .to_owned(),
                lang.pick(
                    &format!("TeX attendait `{what}` à cet endroit et l'a ajouté lui-même pour continuer."),
                    &format!("TeX expected `{what}` at this place and added it by itself to go on."),
                )
                .to_owned(),
            ))
        }
    } else if let Some(m) = EXTRA.captures(&bare) {
        let what = &m[1];
        let or = m.get(2).map(|f| {
            lang.pick(
                &format!(" (ou bien `{}` manque avant)", f.as_str()),
                &format!(" (or `{}` is missing before it)", f.as_str()),
            )
            .to_owned()
        });
        Some((
            lang.pick(&format!("`{what}` en trop"), &format!("Extra `{what}`"))
                .to_owned(),
            format!(
                "{}{}.",
                lang.pick(
                    &format!("TeX a rencontré `{what}` sans ce qui doit l'ouvrir"),
                    &format!("TeX met `{what}` without what must open it"),
                ),
                or.unwrap_or_default()
            ),
        ))
    } else if let Some(m) = MISPLACED.captures(&bare) {
        let what = &m[1];
        Some((
            lang.pick(
                &format!("`{what}` mal placé"),
                &format!("Misplaced `{what}`"),
            )
            .to_owned(),
            lang.pick(
                &format!("`{what}` ne peut pas se trouver à cet endroit."),
                &format!("`{what}` cannot be at this place."),
            )
            .to_owned(),
        ))
    } else if let Some(m) = INCOMPLETE.captures(&bare) {
        Some((
            lang.pick("Condition jamais terminée", "Condition never ended").to_owned(),
            lang.pick(
                &format!("Une condition (`{}`) commencée ligne {} n'est pas terminée par `\\fi` : TeX a ignoré tout le texte qui la suit.", &m[1], &m[2]),
                &format!("A condition (`{}`) started on line {} is not ended by `\\fi`: TeX ignored all the text after it.", &m[1], &m[2]),
            )
            .to_owned(),
        ))
    } else if let Some(m) = ONLY_IN_MODE.captures(&bare) {
        let what = &m[1];
        let (fr, en) = match &m[2] {
            "math" => ("dans une formule", "in a formula"),
            "paragraph" => (
                "dans le texte courant, hors d'une formule et d'une boîte",
                "in running text, outside a formula and a box",
            ),
            _ => ("dans un autre mode", "in another mode"),
        };
        Some((
            lang.pick(
                &format!("`{what}` n'est pas permis ici"),
                &format!("`{what}` is not allowed here"),
            )
            .to_owned(),
            lang.pick(
                &format!("`{what}` n'est permis que {fr}."),
                &format!("`{what}` is only allowed {en}."),
            )
            .to_owned(),
        ))
    } else if let Some(m) = PACKAGE.captures(&d.message) {
        // The message of a package says by itself what it refuses.
        let class = &m[1] == "Class";
        let title = match (&m[3] == "Error", class) {
            (true, false) => lang.pick("Erreur du package", "Error of package"),
            (true, true) => lang.pick("Erreur de la classe", "Error of class"),
            (false, false) => lang.pick("Avertissement du package", "Warning of package"),
            (false, true) => lang.pick("Avertissement de la classe", "Warning of class"),
        };
        Some((format!("{title} `{}`", &m[2]), String::new()))
    } else {
        None
    };
    d.hint = match (read, advice) {
        (Some((title, explanation)), advice) => Some(Hint {
            title,
            explanation,
            advice,
        }),
        (None, Some(advice)) => Some(Hint {
            title: d.message.clone(),
            explanation: String::new(),
            advice: Some(advice),
        }),
        (None, None) => None,
    };
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
        assert_eq!(
            hint.advice.as_deref(),
            Some("Vouliez-vous écrire `\\textbf` ?")
        );
        // The explanation says what the message means, without guessing.
        assert!(!hint.explanation.contains("textbf"), "{}", hint.explanation);

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
