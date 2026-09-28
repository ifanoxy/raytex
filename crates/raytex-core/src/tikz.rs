//! TikZ studio: a gallery of ready-made pictures (`data/tikz.json`) and the
//! preamble used to preview them with the project's own settings.

use serde::{Deserialize, Serialize};

use crate::i18n::Lang;
use crate::kb::Doc;
use crate::templates::{TemplateValues, fill};

#[derive(Debug, Deserialize)]
struct RawTemplate {
    id: String,
    category: String,
    name: Doc,
    description: Doc,
    #[serde(default)]
    packages: Vec<String>,
    #[serde(default)]
    libraries: Vec<String>,
    #[serde(default)]
    preamble: String,
    code: String,
}

/// A picture of the gallery, in one language.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TikzTemplate {
    /// Identifier.
    pub id: String,
    /// `basics`, `functions`, `diagrams`, `geometry`, `science`, `cs`, `math`.
    pub category: String,
    /// Name.
    pub name: String,
    /// One-sentence description.
    pub description: String,
    /// Packages to load (`tikz`, `pgfplots`, `circuitikz`…).
    pub packages: Vec<String>,
    /// TikZ libraries (`\usetikzlibrary`).
    pub libraries: Vec<String>,
    /// Extra preamble lines (`\pgfplotsset{compat=1.18}`).
    pub preamble: String,
    /// The picture.
    pub code: String,
}

/// The gallery, with texts in `lang` (labels inside pictures too).
pub fn templates(lang: Lang) -> Vec<TikzTemplate> {
    let raw: Vec<RawTemplate> =
        serde_json::from_str(include_str!("../data/tikz.json")).expect("tikz.json");
    let values = TemplateValues {
        language: lang.code().to_owned(),
        ..TemplateValues::default()
    };
    raw.into_iter()
        .map(|t| TikzTemplate {
            id: t.id,
            category: t.category,
            name: t.name.get(lang).to_owned(),
            description: t.description.get(lang).to_owned(),
            packages: t.packages,
            libraries: t.libraries,
            preamble: t.preamble,
            code: fill(&t.code, &values),
        })
        .collect()
}

/// Whether `preamble` loads `package` (`\usepackage[…]{a,package,b}`).
pub fn loads_package(preamble: &str, package: &str) -> bool {
    preamble.lines().any(|line| {
        let code = line.split('%').next().unwrap_or("");
        ["\\usepackage", "\\RequirePackage"].iter().any(|c| {
            code.contains(c)
                && code
                    .rsplit_once('{')
                    .and_then(|(_, rest)| rest.split_once('}'))
                    .is_some_and(|(names, _)| names.split(',').any(|n| n.trim() == package))
        })
    })
}

/// Preamble of a TikZ preview: the project's own preamble (already filtered
/// by [`crate::preview::project_preamble`]), plus the packages, libraries and
/// settings the picture needs.
pub fn preview_preamble(
    project: &str,
    packages: &[String],
    libraries: &[String],
    extra: &str,
) -> String {
    let mut out = project.trim_end().to_owned();
    out.push('\n');
    let mut packages: Vec<&str> = packages.iter().map(String::as_str).collect();
    if !packages.contains(&"tikz") {
        packages.insert(0, "tikz");
    }
    for p in packages {
        if !loads_package(project, p) {
            out.push_str(&format!("\\usepackage{{{p}}}\n"));
        }
    }
    let mut libs: Vec<&str> = libraries.iter().map(String::as_str).collect();
    // French babel makes `;` `:` `!` active: TikZ needs its babel library.
    if loads_package(project, "babel") && !libs.contains(&"babel") {
        libs.push("babel");
    }
    if !libs.is_empty() {
        out.push_str(&format!("\\usetikzlibrary{{{}}}\n", libs.join(",")));
    }
    for line in extra.lines().filter(|l| !l.trim().is_empty()) {
        // `\pgfplotsset{compat=…}` once is enough.
        let key = line.split('{').next().unwrap_or(line);
        if !(key.starts_with("\\pgfplotsset") && project.contains("\\pgfplotsset{compat")) {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gallery_is_bilingual_and_consistent() {
        let fr = templates(Lang::Fr);
        let en = templates(Lang::En);
        assert!(fr.len() >= 20);
        for (f, e) in fr.iter().zip(&en) {
            assert_eq!(f.id, e.id);
            assert!(!f.code.contains("{{"), "{}: unresolved placeholder", f.id);
            assert!(
                f.packages.iter().any(|p| p == "tikz"),
                "{}: tikz must be listed",
                f.id
            );
        }
        let flow_fr = fr.iter().find(|t| t.id == "flowchart").unwrap();
        let flow_en = en.iter().find(|t| t.id == "flowchart").unwrap();
        assert!(flow_fr.code.contains("{Début}") && flow_en.code.contains("{Start}"));
    }

    #[test]
    fn preview_preamble_adds_only_what_is_missing() {
        let project =
            "\\usepackage[french]{babel}\n\\usepackage{amsmath,tikz}\n\\pgfplotsset{compat=1.17}\n";
        let p = preview_preamble(
            project,
            &["tikz".into(), "pgfplots".into()],
            &["positioning".into()],
            "\\pgfplotsset{compat=1.18}",
        );
        assert!(!p.contains("\\usepackage{tikz}"));
        assert!(p.contains("\\usepackage{pgfplots}"));
        assert!(p.contains("\\usetikzlibrary{positioning,babel}"));
        assert!(!p.contains("compat=1.18"));
        assert!(loads_package("\\usepackage[x]{a, tikz ,b} % c", "tikz"));
        assert!(!loads_package("% \\usepackage{tikz}", "tikz"));
    }
}
