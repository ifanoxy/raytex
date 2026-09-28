//! Hovers, go-to-definition, find references, rename, and the formula
//! under the cursor (for the live math preview).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::completion::{self, label_kind_name};
use crate::i18n::Lang;
use crate::kb::kb;
use crate::syntax::IncludeKind;
use crate::text::{Position, Range, Span};
use crate::workspace::{Document, Location, Workspace};

/// What the cursor is on.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Command(String, Span),
    Environment(String, Span),
    Reference(String, Span),
    Label(String, Span),
    Citation(String, Span),
    Include(usize),
    Package(String, Span, bool),
}

fn token_at(doc: &Document, offset: usize) -> Option<Token> {
    let idx = &doc.index;
    let within = |s: &Span| s.start <= offset && offset <= s.end;
    if let Some(k) = idx.references.iter().find(|k| within(&k.span)) {
        return Some(Token::Reference(k.name.clone(), k.span.clone()));
    }
    if let Some(k) = idx.citations.iter().find(|k| within(&k.span)) {
        return Some(Token::Citation(k.name.clone(), k.span.clone()));
    }
    if let Some(l) = idx.labels.iter().find(|l| within(&l.span)) {
        return Some(Token::Label(l.name.clone(), l.span.clone()));
    }
    if let Some(i) = idx.includes.iter().position(|i| within(&i.span)) {
        return Some(Token::Include(i));
    }
    if let Some(p) = idx.packages.iter().find(|p| within(&p.span)) {
        return Some(Token::Package(p.name.clone(), p.span.clone(), false));
    }
    if let Some(c) = idx.document_class.as_ref().filter(|c| within(&c.span)) {
        return Some(Token::Package(c.name.clone(), c.span.clone(), true));
    }
    for env in &idx.environments {
        for span in std::iter::once(&env.begin).chain(env.end.iter()) {
            if within(span) {
                let text = &doc.text[span.clone()];
                if let Some(open) = text.find('{') {
                    let start = span.start + open + 1;
                    let name_span = start..start + env.name.len();
                    if offset >= span.start + open {
                        return Some(Token::Environment(env.name.clone(), name_span));
                    }
                }
            }
        }
    }
    // A command name around the cursor.
    let bytes = doc.text.as_bytes();
    let mut start = offset.min(bytes.len());
    while start > 0 && bytes[start - 1].is_ascii_alphabetic() {
        start -= 1;
    }
    let mut end = offset.min(bytes.len());
    while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
        end += 1;
    }
    if start > 0 && bytes[start - 1] == b'\\' && end > start {
        return Some(Token::Command(
            doc.text[start..end].to_owned(),
            start - 1..end,
        ));
    }
    if offset < bytes.len() && bytes[offset] == b'\\' {
        let mut e = offset + 1;
        while e < bytes.len() && bytes[e].is_ascii_alphabetic() {
            e += 1;
        }
        if e > offset + 1 {
            return Some(Token::Command(
                doc.text[offset + 1..e].to_owned(),
                offset..e,
            ));
        }
    }
    None
}

/// Content of a hover.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Hover {
    /// Documentation.
    Markdown {
        /// Markdown text.
        markdown: String,
        /// Hovered range.
        range: Range,
    },
    /// An image to preview.
    Image {
        /// Image file.
        path: PathBuf,
        /// Hovered range.
        range: Range,
    },
}

/// Hover information at `pos`.
pub fn hover(ws: &Workspace, file: &Path, pos: Position, lang: Lang) -> Option<Hover> {
    let doc = ws.document(file)?;
    let offset = doc.lines.offset(&doc.text, pos);
    let root = ws.root_for(file);
    let token = token_at(doc, offset)?;
    let md = |markdown: String, span: &Span| {
        Some(Hover::Markdown {
            markdown,
            range: doc.range(span),
        })
    };
    match token {
        Token::Reference(key, span) | Token::Label(key, span) => {
            let text =
                completion::info(ws, file, &format!("label:{key}"), lang).unwrap_or_else(|| {
                    format!(
                        "`{key}` — {}",
                        lang.pick("label non défini", "undefined label")
                    )
                });
            md(text, &span)
        }
        Token::Citation(key, span) => {
            let text =
                completion::info(ws, file, &format!("cite:{key}"), lang).unwrap_or_else(|| {
                    format!(
                        "`{key}` — {}",
                        lang.pick(
                            "introuvable dans la bibliographie",
                            "not found in the bibliography"
                        )
                    )
                });
            md(text, &span)
        }
        Token::Include(i) => {
            let inc = &doc.index.includes[i];
            let target = ws.resolve_include(&root, file, inc);
            if inc.kind == IncludeKind::Graphics
                && let Some(p) = &target
            {
                return Some(Hover::Image {
                    path: p.clone(),
                    range: doc.range(&inc.span),
                });
            }
            let text = match target {
                Some(p) => format!("`{}`", p.display()),
                None => format!(
                    "`{}` — {}",
                    inc.path,
                    lang.pick("fichier introuvable", "file not found")
                ),
            };
            md(text, &inc.span)
        }
        Token::Package(name, span, class) => {
            let key = format!("pkg:{}:{name}", if class { "class" } else { "package" });
            md(completion::info(ws, file, &key, lang)?, &span)
        }
        Token::Environment(name, span) => {
            if let Some((def, loc)) = ws
                .environment_definitions(&root)
                .into_iter()
                .find(|(d, _)| d.name == name)
            {
                let title = def
                    .theorem_title
                    .clone()
                    .map(|t| format!(" — {t}"))
                    .unwrap_or_default();
                return md(
                    format!(
                        "`\\begin{{{name}}}`{title}\n\n*{}:{}*",
                        file_name(&loc.file),
                        loc.range.start.line + 1
                    ),
                    &span,
                );
            }
            let (class, packages) = ws.loaded_packages(&root);
            let loaded = kb().loaded_closure(class.as_deref(), packages.iter().map(String::as_str));
            if let Some(env) = kb().environment(&name, Some(&loaded)) {
                return md(kb().environment_markdown(env, lang), &span);
            }
            None
        }
        Token::Command(name, span) => {
            if let Some(text) = completion::info(ws, file, &format!("user:{name}"), lang) {
                return md(text, &span);
            }
            let (class, packages) = ws.loaded_packages(&root);
            let loaded = kb().loaded_closure(class.as_deref(), packages.iter().map(String::as_str));
            if let Some(cmd) = kb().command(&name, Some(&loaded)) {
                return md(kb().command_markdown(cmd, lang), &span);
            }
            if let Some(a) = ws.packages() {
                for info in a.closure(class.as_deref(), packages.iter().map(String::as_str)) {
                    if info.commands.iter().any(|c| c.name == name) {
                        return md(
                            completion::info(
                                ws,
                                file,
                                &format!("learned:{}:{name}", info.name),
                                lang,
                            )?,
                            &span,
                        );
                    }
                }
            }
            None
        }
    }
}

/// Where the symbol at `pos` is defined.
pub fn definition(ws: &Workspace, file: &Path, pos: Position) -> Vec<Location> {
    let Some(doc) = ws.document(file) else {
        return Vec::new();
    };
    let offset = doc.lines.offset(&doc.text, pos);
    let root = ws.root_for(file);
    match token_at(doc, offset) {
        Some(Token::Reference(key, _)) => ws.find_label(&root, &key),
        Some(Token::Label(key, _)) => ws.key_uses(&root, &key, false),
        Some(Token::Citation(key, _)) => ws
            .citations(&root)
            .into_iter()
            .filter(|c| c.summary.key == key)
            .map(|c| c.location)
            .collect(),
        Some(Token::Include(i)) => ws
            .resolve_include(&root, file, &doc.index.includes[i])
            .map(|p| {
                vec![Location {
                    file: p,
                    range: Range::default(),
                }]
            })
            .unwrap_or_default(),
        Some(Token::Package(name, _, class)) => {
            let ext = if class { "cls" } else { "sty" };
            let local = ws.root_dir.join(format!("{name}.{ext}"));
            if local.exists() {
                return vec![Location {
                    file: local,
                    range: Range::default(),
                }];
            }
            ws.packages()
                .and_then(|a| a.index().find(&format!("{name}.{ext}")))
                .map(|p| {
                    vec![Location {
                        file: p,
                        range: Range::default(),
                    }]
                })
                .unwrap_or_default()
        }
        Some(Token::Environment(name, _)) => ws
            .environment_definitions(&root)
            .into_iter()
            .filter(|(d, _)| d.name == name)
            .map(|(_, l)| l)
            .collect(),
        Some(Token::Command(name, _)) => {
            let own: Vec<Location> = ws
                .command_definitions(&root)
                .into_iter()
                .filter(|(d, _)| d.name == name)
                .map(|(_, l)| l)
                .collect();
            if !own.is_empty() {
                return own;
            }
            package_definition(ws, &root, &name).into_iter().collect()
        }
        None => Vec::new(),
    }
}

/// Finds the definition of `name` in the sources of the loaded packages.
fn package_definition(ws: &Workspace, root: &Path, name: &str) -> Option<Location> {
    let analyzer = ws.packages()?;
    let (class, packages) = ws.loaded_packages(root);
    let patterns = [
        format!("\\newcommand{{\\{name}}}"),
        format!("\\newcommand*{{\\{name}}}"),
        format!("\\newcommand\\{name}"),
        format!("\\DeclareRobustCommand{{\\{name}}}"),
        format!("\\DeclareRobustCommand\\{name}"),
        format!("\\NewDocumentCommand\\{name}"),
        format!("\\NewDocumentCommand {{\\{name}}}"),
        format!("\\NewDocumentCommand{{\\{name}}}"),
        format!("\\NewDocumentCommand \\{name}"),
        format!("\\def\\{name}"),
        format!("\\DeclareMathSymbol{{\\{name}}}"),
        format!("\\DeclareMathOperator{{\\{name}}}"),
    ];
    for info in analyzer.closure(class.as_deref(), packages.iter().map(String::as_str)) {
        if !info.commands.iter().any(|c| c.name == name) {
            continue;
        }
        let path = info.path.clone()?;
        let text = std::fs::read_to_string(&path).ok()?;
        for pat in &patterns {
            if let Some(i) = text.find(pat.as_str()) {
                let next = text.as_bytes().get(i + pat.len());
                if next.is_some_and(|b| b.is_ascii_alphabetic()) {
                    continue;
                }
                let line = text[..i].matches('\n').count() as u32;
                return Some(Location {
                    file: path,
                    range: Range {
                        start: Position::new(line, 0),
                        end: Position::new(line, 0),
                    },
                });
            }
        }
        return Some(Location {
            file: path,
            range: Range::default(),
        });
    }
    None
}

/// All occurrences of the symbol at `pos` (definition included).
pub fn references(ws: &Workspace, file: &Path, pos: Position) -> Vec<Location> {
    let Some(doc) = ws.document(file) else {
        return Vec::new();
    };
    let offset = doc.lines.offset(&doc.text, pos);
    let root = ws.root_for(file);
    match token_at(doc, offset) {
        Some(Token::Reference(key, _)) | Some(Token::Label(key, _)) => {
            let mut v = ws.find_label(&root, &key);
            v.extend(ws.key_uses(&root, &key, false));
            v
        }
        Some(Token::Citation(key, _)) => {
            let mut v: Vec<Location> = ws
                .citations(&root)
                .into_iter()
                .filter(|c| c.summary.key == key)
                .map(|c| c.location)
                .collect();
            v.extend(ws.key_uses(&root, &key, true));
            v
        }
        Some(Token::Command(name, _)) => command_occurrences(ws, &root, &name),
        _ => Vec::new(),
    }
}

fn command_occurrences(ws: &Workspace, root: &Path, name: &str) -> Vec<Location> {
    let needle = format!("\\{name}");
    let mut out = Vec::new();
    for doc in ws.project_documents(root) {
        let bytes = doc.text.as_bytes();
        let mut from = 0;
        while let Some(k) = memchr::memmem::find(&bytes[from..], needle.as_bytes()) {
            let s = from + k;
            let e = s + needle.len();
            from = e;
            let escaped = s > 0 && bytes[s - 1] == b'\\';
            if escaped || bytes.get(e).is_some_and(|b| b.is_ascii_alphabetic()) {
                continue;
            }
            out.push(Location {
                file: doc.path.clone(),
                range: doc.range(&(s + 1..e)),
            });
        }
    }
    out
}

/// A text replacement in a file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextEdit {
    /// File.
    pub file: PathBuf,
    /// Range replaced.
    pub range: Range,
    /// New text.
    pub new_text: String,
}

/// Renames the label, citation key or user command at `pos` everywhere.
pub fn rename(ws: &Workspace, file: &Path, pos: Position, new_name: &str) -> Option<Vec<TextEdit>> {
    let doc = ws.document(file)?;
    let offset = doc.lines.offset(&doc.text, pos);
    let root = ws.root_for(file);
    let new_name = new_name.trim().trim_start_matches('\\');
    if new_name.is_empty() || new_name.contains(|c: char| c.is_whitespace() || "{}%#\\".contains(c))
    {
        return None;
    }
    let locations = match token_at(doc, offset)? {
        Token::Reference(..) | Token::Label(..) | Token::Citation(..) => references(ws, file, pos),
        Token::Command(name, _) => {
            if !ws
                .command_definitions(&root)
                .iter()
                .any(|(d, _)| d.name == name)
            {
                return None; // only the project's own commands can be renamed
            }
            if !new_name.chars().all(|c| c.is_ascii_alphabetic()) {
                return None;
            }
            command_occurrences(ws, &root, &name)
        }
        _ => return None,
    };
    let mut edits: Vec<TextEdit> = locations
        .into_iter()
        .map(|l| TextEdit {
            file: l.file,
            range: l.range,
            new_text: new_name.to_owned(),
        })
        .collect();
    edits.sort_by(|a, b| (a.file.clone(), b.range.start).cmp(&(b.file.clone(), a.range.start)));
    edits.dedup();
    Some(edits)
}

/// The formula around the cursor, ready for a math renderer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MathAt {
    /// LaTeX source (environment kept for `align`-like ones).
    pub latex: String,
    /// Display (block) math.
    pub display: bool,
    /// Range of the formula.
    pub range: Range,
    /// User macros usable by the renderer (`\R` → `\mathbb{R}`).
    pub macros: BTreeMap<String, String>,
}

/// Formula containing `pos`, if any.
pub fn math_at(ws: &Workspace, file: &Path, pos: Position) -> Option<MathAt> {
    let doc = ws.document(file)?;
    let offset = doc.lines.offset(&doc.text, pos);
    let span = doc
        .index
        .math
        .iter()
        .find(|m| m.start <= offset && offset <= m.end)?
        .clone();
    let before = &doc.text[..span.start];
    let env = doc.index.environments.iter().find(|e| {
        e.begin.end <= span.start
            && e.end.as_ref().is_some_and(|x| x.start >= span.end)
            && crate::syntax::is_math_environment(&e.name)
            && e.begin.end + 64 >= span.start
    });
    let (latex, display, range_span) = match env {
        Some(e) => {
            let end = e.end.clone().unwrap();
            let name = e.name.as_str();
            let body = &doc.text[e.begin.end..end.start];
            let latex = match name.trim_end_matches('*') {
                "equation" | "displaymath" | "math" => body.to_owned(),
                "multline" => format!("\\begin{{gather}}{body}\\end{{gather}}"),
                "eqnarray" => format!(
                    "\\begin{{align}}{}\\end{{align}}",
                    body.replace("&=&", "&=")
                ),
                _ => format!("\\begin{{{name}}}{body}\\end{{{name}}}"),
            };
            (latex, true, e.begin.start..end.end)
        }
        None => {
            let display = before.ends_with("$$") || before.ends_with("\\[");
            (doc.text[span.clone()].to_owned(), display, span.clone())
        }
    };
    let latex = strip_for_preview(&latex);
    if latex.trim().is_empty() {
        return None;
    }
    let root = ws.root_for(file);
    let mut macros = BTreeMap::new();
    for (def, _) in ws.command_definitions(&root) {
        if !def.body.is_empty() && !def.name.contains('@') && def.args <= 9 && !def.first_optional {
            macros.insert(format!("\\{}", def.name), def.body.clone());
        }
    }
    Some(MathAt {
        latex,
        display,
        range: doc.range(&range_span),
        macros,
    })
}

/// Removes what math renderers do not support (`\label`, `\nonumber`…).
fn strip_for_preview(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find("\\label{") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 7..];
        rest = after.find('}').map_or("", |j| &after[j + 1..]);
    }
    out.push_str(rest);
    out.replace("\\nonumber", "")
        .replace("\\notag", "")
        .replace("\\intertext", "\\text")
}

fn file_name(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Localized kind of a label (for the outline panel).
pub fn label_kind(kind: &crate::syntax::LabelKind, lang: Lang) -> String {
    label_kind_name(kind, lang, &std::collections::HashMap::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::log::normalize;

    fn setup() -> (tempfile::TempDir, Workspace, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        std::fs::write(
            p.join("main.tex"),
            "\\documentclass{article}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\n\\section{A}\\label{sec:a}\nSee \\ref{sec:a} and \\R.\n\\begin{align}\n x &= \\R \\label{eq:x}\n\\end{align}\n$y^2$\n\\end{document}\n",
        )
        .unwrap();
        let ws = Workspace::open(p);
        let main = normalize(&p.join("main.tex"));
        (dir, ws, main)
    }

    #[test]
    fn hover_and_definition() {
        let (_d, ws, main) = setup();
        // on "sec:a" inside \ref (line 4, col 10)
        let h = hover(&ws, &main, Position::new(4, 10), Lang::En).unwrap();
        match h {
            Hover::Markdown { markdown, .. } => {
                assert!(markdown.contains("sec:a") && markdown.contains("Section"))
            }
            _ => panic!(),
        }
        let defs = definition(&ws, &main, Position::new(4, 10));
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].range.start.line, 3);
        let cmd = definition(&ws, &main, Position::new(4, 22));
        assert_eq!(cmd[0].range.start.line, 1, "\\R defined on line 2");
        let refs = references(&ws, &main, Position::new(4, 10));
        assert_eq!(refs.len(), 2);
    }

    #[test]
    fn rename_label_and_command() {
        let (_d, ws, main) = setup();
        let edits = rename(&ws, &main, Position::new(4, 10), "sec:intro").unwrap();
        assert_eq!(edits.len(), 2);
        assert!(edits.iter().all(|e| e.new_text == "sec:intro"));
        let edits = rename(&ws, &main, Position::new(4, 22), "Reals").unwrap();
        assert_eq!(edits.len(), 3, "{edits:?}");
        assert!(rename(&ws, &main, Position::new(4, 22), "bad name").is_none());
    }

    #[test]
    fn math_under_cursor() {
        let (_d, ws, main) = setup();
        let m = math_at(&ws, &main, Position::new(6, 3)).unwrap();
        assert!(m.display);
        assert_eq!(m.latex, "\\begin{align}\n x &= \\R \n\\end{align}");
        assert_eq!(m.macros["\\R"], "\\mathbb{R}");
        let inline = math_at(&ws, &main, Position::new(8, 2)).unwrap();
        assert!(!inline.display);
        assert_eq!(inline.latex, "y^2");
        assert!(math_at(&ws, &main, Position::new(4, 1)).is_none());
    }
}
