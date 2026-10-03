//! Help centre content: guides (Markdown files in `data/help/<lang>/`),
//! the command reference, the symbol palette and the error catalogue.

use serde::Serialize;

use crate::i18n::Lang;
use crate::kb::{HELP_PAGES, KERNEL, Mode, kb};

/// A guide in the list.
#[derive(Debug, Clone, Serialize)]
pub struct PageInfo {
    /// Identifier (file name without the `NN-` prefix).
    pub id: String,
    /// Title (first `# ` heading).
    pub title: String,
}

fn split_id(file_id: &str) -> (&str, &str) {
    // "01-getting-started" → ("01", "getting-started")
    match file_id.split_once('-') {
        Some((n, rest)) if n.chars().all(|c| c.is_ascii_digit()) => (n, rest),
        _ => ("99", file_id),
    }
}

fn pages_in(lang: Lang) -> Vec<(&'static str, &'static str)> {
    let mut v: Vec<(&str, &str)> = HELP_PAGES
        .iter()
        .filter(|(l, _, _)| *l == lang.code())
        .map(|(_, id, md)| (*id, *md))
        .collect();
    if v.is_empty() && lang != Lang::En {
        return pages_in(Lang::En);
    }
    v.sort_by_key(|(id, _)| split_id(id).0.to_owned());
    v
}

/// Guides available in `lang` (English as fallback), in reading order.
pub fn pages(lang: Lang) -> Vec<PageInfo> {
    pages_in(lang)
        .into_iter()
        .map(|(id, md)| PageInfo {
            id: split_id(id).1.to_owned(),
            title: md
                .lines()
                .find_map(|l| l.strip_prefix("# "))
                .unwrap_or(id)
                .trim()
                .to_owned(),
        })
        .collect()
}

/// A guide rendered to HTML.
pub fn page_html(id: &str, lang: Lang) -> Option<String> {
    let md = pages_in(lang)
        .into_iter()
        .find(|(file_id, _)| split_id(file_id).1 == id)
        .or_else(|| {
            pages_in(Lang::En)
                .into_iter()
                .find(|(file_id, _)| split_id(file_id).1 == id)
        })?
        .1;
    Some(markdown_to_html(md))
}

/// Renders Markdown (GitHub flavour: tables, task lists, strikethrough) to HTML.
///
/// Raw HTML is escaped, never passed through: documentation may contain
/// user data (bibliography fields…), which must not inject markup. The only
/// exception is the attribute-free `<kbd>` tag, used for keyboard keys.
pub fn markdown_to_html(md: &str) -> String {
    use pulldown_cmark::{Event, Options, Parser, html};
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    let parser = Parser::new_ext(md, opts).map(|e| match e {
        Event::InlineHtml(h) if matches!(h.as_ref(), "<kbd>" | "</kbd>") => Event::InlineHtml(h),
        Event::Html(h) | Event::InlineHtml(h) => Event::Text(h),
        other => other,
    });
    let mut out = String::with_capacity(md.len() * 3 / 2);
    html::push_html(&mut out, parser);
    out
}

/// An entry of the command reference.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceEntry {
    /// `\frac` or `\begin{align}`.
    pub label: String,
    /// Command or environment.
    pub environment: bool,
    /// Providing package (`None` for the kernel).
    pub package: Option<String>,
    /// Signature.
    pub args: String,
    /// Short documentation.
    pub doc: String,
    /// Unicode glyph for symbols.
    pub glyph: Option<String>,
    /// Snippet to insert.
    pub insert: String,
}

/// Searches the command reference (name, package or documentation).
pub fn reference(query: &str, lang: Lang, limit: usize) -> Vec<ReferenceEntry> {
    let q = query.trim().trim_start_matches('\\').to_lowercase();
    let mut scored: Vec<(u32, ReferenceEntry)> = Vec::new();
    let score = |name: &str, doc: &str, pkg: &str| -> Option<u32> {
        let n = name.to_lowercase();
        if q.is_empty() {
            Some(10)
        } else if n == q {
            Some(0)
        } else if n.starts_with(&q) {
            Some(1)
        } else if n.contains(&q) {
            Some(2)
        } else if pkg == q {
            Some(3)
        } else if doc.to_lowercase().contains(&q) {
            Some(4)
        } else {
            None
        }
    };
    for c in kb().commands() {
        let doc = c.doc.get(lang);
        if let Some(s) = score(&c.name, doc, &c.package) {
            scored.push((
                s,
                ReferenceEntry {
                    label: format!("\\{}", c.name),
                    environment: false,
                    package: (c.package != KERNEL).then(|| c.package.clone()),
                    args: c.args.clone(),
                    doc: if doc.is_empty() {
                        c.glyph.clone().unwrap_or_default()
                    } else {
                        doc.to_owned()
                    },
                    glyph: c.glyph.clone(),
                    insert: format!("\\{}", c.snippet),
                },
            ));
        }
    }
    for e in kb().environments() {
        let doc = e.doc.get(lang);
        if let Some(s) = score(&e.name, doc, &e.package) {
            scored.push((
                s,
                ReferenceEntry {
                    label: format!("\\begin{{{}}}", e.name),
                    environment: true,
                    package: (e.package != KERNEL).then(|| e.package.clone()),
                    args: e.args.clone(),
                    doc: doc.to_owned(),
                    glyph: None,
                    insert: format!(
                        "\\begin{{{}}}{}\n{}\n\\end{{{}}}",
                        e.name, e.snippet_args, e.snippet_body, e.name
                    ),
                },
            ));
        }
    }
    scored.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| a.1.label.len().cmp(&b.1.label.len()))
            .then_with(|| a.1.label.cmp(&b.1.label))
    });
    scored.into_iter().take(limit).map(|(_, e)| e).collect()
}

/// A symbol of the palette.
#[derive(Debug, Clone, Serialize)]
pub struct Symbol {
    /// Command as typed (`\theta`).
    pub command: String,
    /// Unicode rendering.
    pub glyph: String,
    /// Package (`None` for the kernel).
    pub package: Option<String>,
    /// Whether it is math-only.
    pub math: bool,
}

/// A category of the palette.
#[derive(Debug, Clone, Serialize)]
pub struct SymbolCategory {
    /// Identifier.
    pub id: String,
    /// Localized name.
    pub name: String,
    /// Symbols.
    pub symbols: Vec<Symbol>,
}

/// The symbol palette, built from the knowledge base.
pub fn symbols(lang: Lang) -> Vec<SymbolCategory> {
    let order = [
        ("greek", "Lettres grecques", "Greek letters"),
        ("greek-upper", "Grecques majuscules", "Greek capitals"),
        ("relation", "Relations", "Relations"),
        ("binary", "Opérations", "Operations"),
        ("arrow", "Flèches", "Arrows"),
        ("large-operator", "Grands opérateurs", "Large operators"),
        ("delimiter", "Délimiteurs", "Delimiters"),
        ("accent", "Accents", "Accents"),
        ("dots", "Points", "Dots"),
        ("misc", "Divers", "Miscellaneous"),
        ("unit", "Unités (siunitx)", "Units (siunitx)"),
    ];
    let mut out: Vec<SymbolCategory> = order
        .iter()
        .map(|(id, fr, en)| SymbolCategory {
            id: (*id).into(),
            name: lang.pick(fr, en).into(),
            symbols: Vec::new(),
        })
        .collect();
    let mut seen = std::collections::HashSet::new();
    for c in kb().commands() {
        let (Some(cat), Some(glyph)) = (&c.category, &c.glyph) else {
            continue;
        };
        if !seen.insert((cat.clone(), c.name.clone())) {
            continue;
        }
        if let Some(group) = out.iter_mut().find(|g| &g.id == cat) {
            group.symbols.push(Symbol {
                // What is typed: `\theta`, not the name `theta`.
                command: if c.name.starts_with('\\') {
                    c.name.clone()
                } else {
                    format!("\\{}", c.name)
                },
                glyph: glyph.clone(),
                package: (c.package != KERNEL).then(|| c.package.clone()),
                math: c.mode == Mode::Math,
            });
        }
    }
    out.retain(|g| !g.symbols.is_empty());
    out
}

/// A documented error.
#[derive(Debug, Clone, Serialize)]
pub struct ErrorEntry {
    /// Identifier.
    pub id: String,
    /// Title.
    pub title: String,
    /// Explanation (HTML).
    pub explanation: String,
}

/// The catalogue of common errors, for the help centre.
pub fn errors(lang: Lang) -> Vec<ErrorEntry> {
    crate::log::hints::catalog()
        .iter()
        .map(|e| ErrorEntry {
            id: e.id.clone(),
            title: e.title.get(lang).to_owned(),
            explanation: markdown_to_html(&match &e.more {
                Some(more) => format!("{}\n\n{}", e.explanation.get(lang), more.get(lang)),
                None => e.explanation.get(lang).to_owned(),
            }),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::markdown_to_html as md;

    #[test]
    fn guides_exist_in_both_languages_and_links_resolve() {
        use crate::i18n::Lang;
        let fr: Vec<String> = super::pages(Lang::Fr).into_iter().map(|p| p.id).collect();
        let en: Vec<String> = super::pages(Lang::En).into_iter().map(|p| p.id).collect();
        assert!(fr.len() >= 12, "{fr:?}");
        assert_eq!(fr, en, "every guide must exist in French and English");
        for (lang, ids) in [(Lang::Fr, &fr), (Lang::En, &en)] {
            for id in ids {
                let html = super::page_html(id, lang).unwrap();
                assert!(html.starts_with("<h1>"), "{id} must start with a title");
                // Links between guides: `href="NN-id.md"`.
                for link in html.split("href=\"").skip(1) {
                    let target = link.split('"').next().unwrap();
                    if target.starts_with("http") || target.starts_with('#') {
                        continue;
                    }
                    let target = target.trim_end_matches(".md");
                    let target = target.split_once('-').map_or(target, |(n, rest)| {
                        if n.chars().all(|c| c.is_ascii_digit()) {
                            rest
                        } else {
                            target
                        }
                    });
                    assert!(
                        ids.contains(&target.to_owned()),
                        "{id}: broken link to {target}"
                    );
                }
            }
        }
    }

    #[test]
    fn keeps_kbd_only() {
        assert_eq!(md("<kbd>Ctrl</kbd>"), "<p><kbd>Ctrl</kbd></p>\n");
        assert!(md("<kbd onclick=x>a</kbd>").contains("&lt;kbd onclick=x&gt;"));
        assert!(md("<script>x</script>").contains("&lt;script&gt;"));
    }

    use super::*;

    #[test]
    fn reference_and_symbols() {
        let r = reference("frac", Lang::Fr, 10);
        assert_eq!(r[0].label, "\\frac");
        assert!(
            reference("matrice", Lang::Fr, 50)
                .iter()
                .any(|e| e.label == "\\begin{pmatrix}")
        );
        let s = symbols(Lang::En);
        assert_eq!(s[0].id, "greek");
        assert!(
            s[0].symbols
                .iter()
                .any(|x| x.command == "\\alpha" && x.glyph == "α")
        );
        assert!(
            errors(Lang::Fr)
                .iter()
                .any(|e| e.title == "Commande inconnue")
        );
        assert!(markdown_to_html("| a | b |\n|---|---|\n| 1 | 2 |").contains("<table>"));
        assert!(markdown_to_html("x <img src=y onerror=alert(1)>").contains("&lt;img"));
    }
}
