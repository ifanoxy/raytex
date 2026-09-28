//! Live diagnostics while typing (no compilation needed).
//!
//! Rules are identified by stable ids (users can disable them globally or
//! per project). Messages are localized and, whenever possible, come with
//! an automatic fix. The rules aim at catching real mistakes early and at
//! teaching good practice to beginners, without noise for experts.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::diagnostics::{Diagnostic, FileEdit, Fix, Hint, Severity, Source};
use crate::fixes::text::{
    brace_close_at, closest as closest_name, content_end, env_close_at, group_end, line_end,
    line_start,
};
use crate::i18n::Lang;
use crate::kb::{KERNEL, kb};
use crate::log::hints::levenshtein;
use crate::syntax::{IncludeKind, Problem, ProblemKind, context::comment_start};
use crate::tex::{Engine, TexmfIndex};
use crate::text::Span;
use crate::workspace::{DocKind, Document, Workspace};

/// Options of a lint run.
#[derive(Debug, Clone, Default)]
pub struct LintOptions<'a> {
    /// Message language.
    pub lang: Lang,
    /// Disabled rule ids.
    pub disabled: HashSet<String>,
    /// Include style hints.
    pub style_hints: bool,
    /// Engine that will compile the document, when fixed.
    pub engine: Option<Engine>,
    /// Shell escape enabled.
    pub shell_escape: bool,
    /// Installed files, to detect missing packages.
    pub installed: Option<&'a TexmfIndex>,
}

/// Every rule id with its default severity, for the settings UI.
pub const RULES: &[(&str, Severity)] = &[
    ("syntax", Severity::Error),
    ("undefined-reference", Severity::Warning),
    ("undefined-citation", Severity::Warning),
    ("duplicate-label", Severity::Warning),
    ("missing-file", Severity::Error),
    ("missing-image", Severity::Warning),
    ("missing-package", Severity::Warning),
    ("package-required", Severity::Warning),
    ("engine-required", Severity::Error),
    ("shell-escape-required", Severity::Info),
    ("label-before-caption", Severity::Warning),
    ("package-order", Severity::Hint),
    ("duplicate-package", Severity::Warning),
    ("obsolete", Severity::Hint),
    ("nbsp-ref", Severity::Hint),
    ("space-before-footnote", Severity::Hint),
    ("ellipsis", Severity::Hint),
    ("paragraph-break", Severity::Hint),
    ("bib-fields", Severity::Hint),
    ("cleveref-babel-french", Severity::Warning),
    ("tikz-semicolon", Severity::Warning),
];

struct Linter<'a> {
    ws: &'a Workspace,
    doc: &'a Document,
    root: PathBuf,
    opts: &'a LintOptions<'a>,
    out: Vec<Diagnostic>,
    excluded: Vec<Span>,
}

/// Lints `file` in the context of its project.
pub fn lint(ws: &Workspace, file: &Path, opts: &LintOptions<'_>) -> Vec<Diagnostic> {
    let Some(doc) = ws.document(file) else {
        return Vec::new();
    };
    let mut l = Linter {
        ws,
        doc,
        root: ws.root_for(file),
        opts,
        out: Vec::new(),
        excluded: Vec::new(),
    };
    match doc.kind {
        DocKind::Bib => l.bib(),
        DocKind::Package => l.structure(true),
        DocKind::Tex => {
            l.excluded = excluded_spans(doc);
            l.structure(false);
            l.tikz_paths();
            l.references();
            l.files();
            l.packages();
            l.label_before_caption();
            l.obsolete();
            if opts.style_hints {
                l.style();
            }
        }
    }
    let disabled = &opts.disabled;
    l.out
        .retain(|d| d.code.as_ref().is_none_or(|c| !disabled.contains(c)));
    for d in &mut l.out {
        if d.hint.is_none()
            && let Some(explanation) = d.code.as_deref().and_then(|c| explanation(c, opts.lang))
        {
            d.hint = Some(Hint {
                title: d.message.clone(),
                explanation: explanation.to_owned(),
            });
        }
    }
    if disabled.contains("syntax") {
        l.out.retain(|d| d.source != Source::Syntax);
    }
    l.out
}

impl Linter<'_> {
    fn lang(&self) -> Lang {
        self.opts.lang
    }

    fn t<'s>(&self, fr: &'s str, en: &'s str) -> &'s str {
        self.lang().pick(fr, en)
    }

    fn push(
        &mut self,
        severity: Severity,
        source: Source,
        code: &str,
        span: &Span,
        message: String,
    ) -> &mut Diagnostic {
        let d = Diagnostic::new(severity, source, message)
            .with_code(code)
            .at(Some(self.doc.path.clone()), self.doc.range(span));
        self.out.push(d);
        self.out.last_mut().unwrap()
    }

    fn excluded(&self, pos: usize) -> bool {
        let i = self.excluded.partition_point(|s| s.end <= pos);
        self.excluded.get(i).is_some_and(|s| s.start <= pos)
    }

    // ------------------------------------------------------------- syntax

    fn structure(&mut self, package_file: bool) {
        let problems = self.doc.index.problems.clone();
        for p in problems.clone() {
            if package_file
                && !matches!(
                    p.kind,
                    ProblemKind::UnmatchedCloseBrace | ProblemKind::UnclosedBrace
                )
            {
                continue;
            }
            let (msg, hint) = match &p.kind {
                ProblemKind::UnmatchedCloseBrace => (
                    self.t("Accolade fermante sans accolade ouvrante", "Closing brace without opening brace").to_owned(),
                    self.t("Supprimez cette `}` ou ajoutez la `{` manquante.", "Remove this `}` or add the missing `{`."),
                ),
                ProblemKind::UnclosedBrace => (
                    self.t("Accolade jamais fermée", "Brace never closed").to_owned(),
                    self.t("Ajoutez la `}` correspondante.", "Add the matching `}`."),
                ),
                ProblemKind::UnclosedEnvironment(name) => (
                    format!("{} \\begin{{{name}}} {}", self.t("L'environnement", "Environment"), self.t("n'est jamais fermé", "is never closed")),
                    self.t("Ajoutez `\\end{…}` à la fin de l'environnement.", "Add `\\end{…}` at the end of the environment."),
                ),
                ProblemKind::UnmatchedEnd(name) => (
                    format!("\\end{{{name}}} {}", self.t("sans \\begin correspondant", "without matching \\begin")),
                    self.t("Vérifiez l'orthographe du nom ou l'ordre des \\begin/\\end.", "Check the name or the order of \\begin/\\end."),
                ),
                ProblemKind::UnclosedMath => (
                    self.t("Formule mathématique non fermée (ou ligne vide dans une formule)", "Math not closed (or blank line inside math)").to_owned(),
                    self.t("Fermez la formule (`$`, `\\]`, `\\)`) et évitez les lignes vides dans les formules.", "Close the formula (`$`, `\\]`, `\\)`) and avoid blank lines inside math."),
                ),
                ProblemKind::UnmatchedMathClose => (
                    self.t("Fin de formule sans début", "Math closing without opening").to_owned(),
                    self.t("Ce `\\]` ou `\\)` n'a pas d'ouverture correspondante.", "This `\\]` or `\\)` has no matching opening."),
                ),
                ProblemKind::NestedMath => (
                    self.t("Formule dans une formule", "Math inside math").to_owned(),
                    self.t("On ne peut pas ouvrir `$`, `\\[` ou `equation` dans une formule déjà ouverte.", "`$`, `\\[` or `equation` cannot be opened inside math."),
                ),
                ProblemKind::LeftRightMismatch => (
                    self.t("\\left et \\right ne sont pas appariés", "\\left and \\right are not paired").to_owned(),
                    self.t("Chaque `\\left` doit avoir son `\\right` dans la même formule (`\\right.` pour un délimiteur invisible).", "Every `\\left` needs a `\\right` in the same formula (`\\right.` for an invisible one)."),
                ),
            };
            let fixes = self.syntax_fixes(&p, &problems);
            let d = self.push(Severity::Error, Source::Syntax, "syntax", &p.span, msg);
            d.hint = Some(Hint {
                title: d.message.clone(),
                explanation: hint.to_owned(),
            });
            d.fixes = fixes;
        }
    }

    /// TikZ paths not ended by `;` before the next one starts (TeX gives up
    /// on the path, or older versions silently draw something else).
    fn tikz_paths(&mut self) {
        const STARTERS: &[&str] = &[
            "draw",
            "fill",
            "filldraw",
            "path",
            "node",
            "shade",
            "shadedraw",
            "clip",
            "coordinate",
            "pattern",
            "pic",
            "graph",
            "matrix",
            "addplot",
            "addplot3",
        ];
        let text = self.doc.text.clone();
        let masked = crate::fixes::text::mask(&text);
        let pictures: Vec<(usize, usize)> = self
            .doc
            .index
            .environments
            .iter()
            .filter(|e| e.name == "tikzpicture")
            .filter_map(|e| e.end.as_ref().map(|end| (e.begin.end, end.start)))
            .collect();
        let mut missing: Vec<(usize, Span)> = Vec::new();
        for (from, to) in pictures {
            let b = masked.as_bytes();
            let (mut depth, mut open, mut last) = (0i32, false, from);
            let mut i = from;
            while i < to {
                match b[i] {
                    b'{' | b'[' => depth += 1,
                    b'}' | b']' => depth -= 1,
                    b';' if depth == 0 => open = false,
                    b'\\' => {
                        let name: String = masked[i + 1..to]
                            .chars()
                            .take_while(char::is_ascii_alphanumeric)
                            .collect();
                        if depth == 0 && !name.is_empty() {
                            let starts = STARTERS.contains(&name.as_str());
                            let boundary = matches!(name.as_str(), "begin" | "end");
                            if open && (starts || boundary) {
                                missing.push((last, i..i + 1 + name.len()));
                                open = false;
                            }
                            if starts {
                                open = true;
                            }
                        }
                        i += 1 + name.len().max(1);
                        last = i;
                        continue;
                    }
                    _ => {}
                }
                if !b[i].is_ascii_whitespace() {
                    last = i + 1;
                }
                i += 1;
            }
        }
        for (at, span) in missing {
            let msg = self
                .t(
                    "Il manque « ; » à la fin du tracé TikZ précédent",
                    "“;” is missing at the end of the previous TikZ path",
                )
                .to_owned();
            let fix = Fix::Edits {
                title: self
                    .t(
                        "Ajouter le ; qui termine le tracé",
                        "Add the ; that ends the path",
                    )
                    .into(),
                edits: vec![self.edit(at..at, ";")],
            };
            let d = self.push(
                Severity::Warning,
                Source::Lint,
                "tikz-semicolon",
                &span,
                msg,
            );
            d.fixes.push(fix);
        }
    }

    fn edit(&self, span: Span, text: impl Into<String>) -> FileEdit {
        FileEdit {
            file: self.doc.path.clone(),
            range: self.doc.range(&span),
            text: text.into(),
        }
    }

    /// Deletes `span`, with its line when nothing else is on it.
    fn delete(&self, span: Span) -> FileEdit {
        let text = &self.doc.text;
        let (start, end) = (line_start(text, span.start), line_end(text, span.end));
        if text[start..span.start].trim().is_empty() && text[span.end..end].trim().is_empty() {
            self.edit(start..(end + 1).min(text.len()), "")
        } else {
            self.edit(span, "")
        }
    }

    /// Renames `\end{old}` (whose span is `end`) to `\end{new}`: the same
    /// fix as the compiler's "ended by" error.
    fn rename_end(&self, end: &Span, new: &str) -> Vec<Fix> {
        vec![Fix::Edits {
            title: format!("{} \\end{{{new}}}", self.t("Remplacer par", "Replace with")),
            edits: vec![self.edit(end.start + 5..end.end - 1, new)],
        }]
    }

    /// Fixes of a structural problem, with the same edits as the fixes of
    /// the compiler errors it causes.
    fn syntax_fixes(&self, p: &Problem, all: &[Problem]) -> Vec<Fix> {
        let text = &self.doc.text;
        let one = |title: String, edits: Vec<FileEdit>| vec![Fix::Edits { title, edits }];
        match &p.kind {
            ProblemKind::UnmatchedCloseBrace => one(
                self.t("Supprimer cette }", "Delete this }").into(),
                vec![self.edit(p.span.clone(), "")],
            ),
            ProblemKind::UnclosedBrace => {
                let open = p.span.start;
                let start = text[..open]
                    .rfind('\\')
                    .filter(|&b| text[b + 1..open].chars().all(|c| c.is_ascii_alphabetic()))
                    .unwrap_or(open);
                let what = &text[start..open];
                let at = brace_close_at(text, open);
                one(
                    if what.is_empty() {
                        self.t("Fermer l'accolade", "Close the brace").into()
                    } else {
                        format!(
                            "{} {what}",
                            self.t("Fermer l'accolade de", "Close the brace of")
                        )
                    },
                    vec![self.edit(at..at, "}")],
                )
            }
            ProblemKind::UnclosedEnvironment(name) => {
                // An \end of another environment follows: it is the one to rename.
                if name != "document"
                    && let Some(end) = all.iter().find(|q| {
                        matches!(q.kind, ProblemKind::UnmatchedEnd(_))
                            && q.span.start > p.span.start
                    })
                {
                    return self.rename_end(&end.span, name);
                }
                let at = if name == "document" {
                    text.len()
                } else {
                    env_close_at(text, p.span.end)
                };
                let before = if at == text.len() && !text.is_empty() && !text.ends_with('\n') {
                    "\n"
                } else {
                    ""
                };
                one(
                    format!("{} \\end{{{name}}}", self.t("Fermer avec", "Close with")),
                    vec![self.edit(at..at, format!("{before}\\end{{{name}}}\n"))],
                )
            }
            ProblemKind::UnmatchedEnd(name) => {
                if let Some(open) = all.iter().rev().find(|q| {
                    matches!(q.kind, ProblemKind::UnclosedEnvironment(_))
                        && q.span.start < p.span.start
                }) && let ProblemKind::UnclosedEnvironment(other) = &open.kind
                    && other != "document"
                {
                    return self.rename_end(&p.span, other);
                }
                one(
                    format!("{} \\end{{{name}}}", self.t("Supprimer", "Delete")),
                    vec![self.delete(p.span.clone())],
                )
            }
            ProblemKind::UnclosedMath => {
                let token = &text[p.span.clone()];
                if token.trim().is_empty() {
                    // A blank line inside a math environment.
                    let start = p.span.start + usize::from(token.starts_with('\n'));
                    let end = (line_end(text, start) + 1).min(text.len());
                    return one(
                        self.t(
                            "Supprimer la ligne vide de la formule",
                            "Delete the blank line of the formula",
                        )
                        .into(),
                        vec![self.edit(start..end, "")],
                    );
                }
                let close = match token {
                    "$" => "$",
                    "$$" => "$$",
                    "\\[" => "\\]",
                    "\\(" => "\\)",
                    _ => return Vec::new(),
                };
                // The end of the paragraph.
                let mut para = line_end(text, p.span.end);
                while para < text.len() {
                    let next = line_end(text, para + 1);
                    if text[para + 1..next].trim().is_empty() {
                        break;
                    }
                    para = next;
                }
                // Closed after a blank line: the blank line is the mistake.
                let after = &text[para..(para + 600).min(text.len())];
                let blank_end = para + after.len() - after.trim_start().len();
                if blank_end < text.len() && text[blank_end..].starts_with(close) && close != "$" {
                    let start = para + 1;
                    return one(
                        self.t(
                            "Supprimer la ligne vide de la formule",
                            "Delete the blank line of the formula",
                        )
                        .into(),
                        vec![self.edit(start..line_start(text, blank_end), "")],
                    );
                }
                let line = line_end(text, p.span.end);
                if matches!(close, "$" | "\\)")
                    && let Some(at) = text_resumes(text, p.span.end, line)
                {
                    return one(
                        format!(
                            "{} {close}",
                            self.t("Fermer la formule avec", "Close the formula with")
                        ),
                        vec![self.edit(at..at, close)],
                    );
                }
                let at = if text[p.span.end..line].trim().is_empty() {
                    line_start(text, para) + content_end(&text[line_start(text, para)..para])
                } else {
                    line_start(text, p.span.end)
                        + content_end(&text[line_start(text, p.span.end)..line])
                };
                one(
                    format!(
                        "{} {close}",
                        self.t("Fermer la formule avec", "Close the formula with")
                    ),
                    vec![self.edit(at..at, close)],
                )
            }
            ProblemKind::UnmatchedMathClose => one(
                format!(
                    "{} {}",
                    self.t("Supprimer", "Delete"),
                    &text[p.span.clone()]
                ),
                vec![self.edit(p.span.clone(), "")],
            ),
            ProblemKind::NestedMath | ProblemKind::LeftRightMismatch => Vec::new(),
        }
    }

    // --------------------------------------------------------- references

    fn references(&mut self) {
        let labels = self.ws.labels(&self.root);
        let label_names: HashSet<&str> = labels.iter().map(|l| l.name.as_str()).collect();
        let aux_labels = self.ws.aux(&self.root).map(|a| &a.labels);
        let doc = self.doc;
        for r in &doc.index.references {
            if label_names.contains(r.name.as_str())
                || aux_labels.is_some_and(|a| a.contains_key(&r.name))
            {
                continue;
            }
            let message = format!(
                "{} « {} »",
                self.t("Label non défini :", "Undefined label:"),
                r.name
            );
            let best = closest(&r.name, label_names.iter().copied());
            let range = doc.range(&r.span);
            let fix_title = self.t("Remplacer par", "Replace with").to_owned();
            let d = self.push(
                Severity::Warning,
                Source::Lint,
                "undefined-reference",
                &r.span,
                message,
            );
            if let Some(best) = best {
                d.fixes.push(Fix::Replace {
                    title: format!("{fix_title} {best}"),
                    range,
                    text: best,
                });
            }
        }

        // Duplicate labels (reported where defined in this file).
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for l in &labels {
            *counts.entry(l.name.as_str()).or_default() += 1;
        }
        for l in &doc.index.labels {
            if counts.get(l.name.as_str()).copied().unwrap_or(0) > 1 {
                let msg = format!(
                    "{} « {} »",
                    self.t(
                        "Label défini plusieurs fois :",
                        "Label defined several times:"
                    ),
                    l.name
                );
                // The first definition keeps the name, the next ones get `-2`, `-3`…
                let range = doc.range(&l.span);
                let rank = labels
                    .iter()
                    .filter(|x| x.name == l.name)
                    .position(|x| x.location.file == doc.path && x.location.range == range);
                let mut fix = None;
                if let Some(rank) = rank.filter(|&r| r > 0) {
                    let mut n = 1;
                    let mut new = String::new();
                    for _ in 0..rank {
                        n += 1;
                        while label_names.contains(format!("{}-{n}", l.name).as_str()) {
                            n += 1;
                        }
                        new = format!("{}-{n}", l.name);
                    }
                    fix = Some(Fix::Edits {
                        title: format!("{} {new}", self.t("Renommer en", "Rename to")),
                        edits: vec![self.edit(l.span.clone(), new.clone())],
                    });
                }
                let d = self.push(
                    Severity::Warning,
                    Source::Lint,
                    "duplicate-label",
                    &l.span,
                    msg,
                );
                d.fixes.extend(fix);
            }
        }

        // Citations.
        let citations = self.ws.citations(&self.root);
        let has_bibliography = !citations.is_empty() || !self.ws.bib_files(&self.root).is_empty();
        let keys: HashSet<&str> = citations.iter().map(|c| c.summary.key.as_str()).collect();
        for c in &doc.index.citations {
            if keys.contains(c.name.as_str()) || c.name == "*" {
                continue;
            }
            let msg = if has_bibliography {
                format!(
                    "{} « {} »",
                    self.t(
                        "Référence bibliographique introuvable :",
                        "Unknown bibliography key:"
                    ),
                    c.name
                )
            } else {
                format!(
                    "{} « {} » {}",
                    self.t("Citation", "Citation"),
                    c.name,
                    self.t(
                        "sans bibliographie (\\addbibresource ou \\bibliography)",
                        "without bibliography (\\addbibresource or \\bibliography)"
                    )
                )
            };
            let best = closest(&c.name, keys.iter().copied());
            let range = doc.range(&c.span);
            let fix_title = self.t("Remplacer par", "Replace with").to_owned();
            let d = self.push(
                Severity::Warning,
                Source::Lint,
                "undefined-citation",
                &c.span,
                msg,
            );
            if let Some(best) = best {
                d.fixes.push(Fix::Replace {
                    title: format!("{fix_title} {best}"),
                    range,
                    text: best,
                });
            }
        }
    }

    // --------------------------------------------------------------- files

    fn files(&mut self) {
        let doc = self.doc;
        for inc in &doc.index.includes {
            if inc.path.contains(['\\', '#'])
                || self
                    .ws
                    .resolve_include(&self.root, &doc.path, inc)
                    .is_some()
            {
                continue;
            }
            match inc.kind {
                IncludeKind::Input
                | IncludeKind::Include
                | IncludeKind::Subfile
                | IncludeKind::Import => {
                    let msg = format!(
                        "{} « {} »",
                        self.t("Fichier introuvable :", "File not found:"),
                        inc.path
                    );
                    let path = if inc.path.ends_with(".tex") {
                        inc.path.clone()
                    } else {
                        format!("{}.tex", inc.path)
                    };
                    let similar = self.similar_file(&inc.path, &["tex"], true);
                    let d = self.push(
                        Severity::Error,
                        Source::Lint,
                        "missing-file",
                        &inc.span,
                        msg,
                    );
                    d.fixes.extend(similar);
                    d.fixes.push(Fix::CreateFile { path });
                }
                IncludeKind::Graphics => {
                    // Images shipped with the distribution (e.g. mwe's example-image).
                    let base = Path::new(&inc.path)
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    let installed = self.opts.installed.is_some_and(|i| {
                        i.contains(&base)
                            || ["pdf", "png", "jpg", "jpeg", "eps"]
                                .iter()
                                .any(|e| i.contains(&format!("{base}.{e}")))
                    });
                    if installed {
                        continue;
                    }
                    let msg = format!(
                        "{} « {} »",
                        self.t("Image introuvable :", "Image not found:"),
                        inc.path
                    );
                    let bare = Path::new(&inc.path).extension().is_none();
                    let similar =
                        self.similar_file(&inc.path, crate::fixes::latex::IMAGE_EXTENSIONS, bare);
                    let d = self.push(
                        Severity::Warning,
                        Source::Lint,
                        "missing-image",
                        &inc.span,
                        msg,
                    );
                    d.fixes.extend(similar);
                }
                IncludeKind::Bibliography | IncludeKind::BibResource => {
                    // A system-wide .bib may exist in the distribution.
                    let name = if inc.path.ends_with(".bib") {
                        inc.path.clone()
                    } else {
                        format!("{}.bib", inc.path)
                    };
                    if self.opts.installed.is_some_and(|i| i.contains(&name)) {
                        continue;
                    }
                    let msg = format!(
                        "{} « {} »",
                        self.t("Bibliographie introuvable :", "Bibliography not found:"),
                        inc.path
                    );
                    let d = self.push(
                        Severity::Warning,
                        Source::Lint,
                        "missing-file",
                        &inc.span,
                        msg,
                    );
                    d.fixes.push(Fix::CreateFile { path: name });
                }
                IncludeKind::Other => {}
            }
        }
    }

    /// "Use images/photo" for a file of the project named almost like `path`.
    fn similar_file(&self, path: &str, exts: &[&str], bare: bool) -> Option<Fix> {
        let dir = self.root.parent()?;
        let names: Vec<String> = crate::fixes::latex::files_with(dir, exts)
            .into_iter()
            .filter_map(|f| {
                let rel = f
                    .strip_prefix(dir)
                    .ok()?
                    .to_string_lossy()
                    .replace('\\', "/");
                Some(if bare {
                    rel.rsplit_once('.')
                        .map_or(rel.clone(), |(s, _)| s.to_owned())
                } else {
                    rel
                })
            })
            .collect();
        let written = path.trim_end_matches(".tex");
        let best = closest_name(written, names.iter().map(String::as_str), 3)?;
        let span = self
            .doc
            .index
            .includes
            .iter()
            .find(|i| i.path == path)?
            .span
            .clone();
        Some(Fix::Edits {
            title: format!("{} {best}", self.t("Utiliser", "Use")),
            edits: vec![self.edit(span, best)],
        })
    }

    /// Moves the `\usepackage` at `from` after the one at `after`.
    fn move_package(&self, from: &Span, after: &Span, title: String) -> Option<Fix> {
        let text = &self.doc.text;
        let stmt = &text[from.clone()];
        let at = line_end(text, after.end);
        Some(Fix::Edits {
            title,
            edits: vec![
                self.delete(from.clone()),
                self.edit(at..at, format!("\n{stmt}")),
            ],
        })
    }

    // ------------------------------------------------------------ packages

    fn packages(&mut self) {
        let doc = self.doc;
        let (class, packages) = self.ws.loaded_packages(&self.root);
        let installed = self.opts.installed.filter(|i| !i.is_empty());

        // Missing packages and classes.
        if let Some(index) = installed {
            for p in &doc.index.packages {
                let local = self.ws.root_dir.join(format!("{}.sty", p.name));
                if !index.contains(&format!("{}.sty", p.name))
                    && !local.exists()
                    && !p.name.contains('\\')
                {
                    let msg = format!(
                        "{} « {} » {}",
                        self.t("Le package", "Package"),
                        p.name,
                        self.t("n'est pas installé", "is not installed")
                    );
                    let d = self.push(
                        Severity::Warning,
                        Source::Lint,
                        "missing-package",
                        &p.span,
                        msg,
                    );
                    d.fixes.push(Fix::InstallPackage {
                        file: format!("{}.sty", p.name),
                    });
                }
            }
            if let Some(c) = &doc.index.document_class {
                let local = self.ws.root_dir.join(format!("{}.cls", c.name));
                if !index.contains(&format!("{}.cls", c.name)) && !local.exists() {
                    let msg = format!(
                        "{} « {} » {}",
                        self.t("La classe", "Class"),
                        c.name,
                        self.t("n'est pas installée", "is not installed")
                    );
                    let d = self.push(
                        Severity::Warning,
                        Source::Lint,
                        "missing-package",
                        &c.span,
                        msg,
                    );
                    d.fixes.push(Fix::InstallPackage {
                        file: format!("{}.cls", c.name),
                    });
                }
            }
        }

        // Duplicates within this file.
        let mut seen: HashSet<&str> = HashSet::new();
        for p in &doc.index.packages {
            if !seen.insert(p.name.as_str()) {
                let msg = format!(
                    "{} « {} » {}",
                    self.t("Le package", "Package"),
                    p.name,
                    self.t("est chargé deux fois", "is loaded twice")
                );
                let stmt = &doc.text[p.command_span.clone()];
                let names = stmt.trim_end_matches('}').rsplit('{').next().unwrap_or("");
                let fix = if names.split(',').filter(|n| !n.trim().is_empty()).count() <= 1 {
                    Some(self.delete(p.command_span.clone()))
                } else {
                    // Only this name is removed from the list.
                    let at = p.span.start;
                    let after = doc.text[p.span.end..].starts_with(',');
                    let span = if after {
                        at..p.span.end + 1
                    } else {
                        doc.text[..at].rfind(',').unwrap_or(at)..p.span.end
                    };
                    Some(self.edit(span, ""))
                };
                let title = format!(
                    "{} {}",
                    self.t(
                        "Retirer le second chargement de",
                        "Remove the second load of"
                    ),
                    p.name
                );
                let d = self.push(
                    Severity::Warning,
                    Source::Lint,
                    "duplicate-package",
                    &p.command_span,
                    msg,
                );
                d.fixes.extend(fix.map(|e| Fix::Edits {
                    title,
                    edits: vec![e],
                }));
            }
        }

        // Engine requirements.
        let unicode_only = [
            "fontspec",
            "unicode-math",
            "polyglossia",
            "xeCJK",
            "luacode",
            "luatexja",
        ];
        if self.opts.engine == Some(Engine::Pdflatex) || self.opts.engine == Some(Engine::Latex) {
            for p in &doc.index.packages {
                if unicode_only.contains(&p.name.as_str()) {
                    let msg = format!(
                        "« {} » {}",
                        p.name,
                        self.t(
                            "nécessite XeLaTeX ou LuaLaTeX (le projet utilise pdfLaTeX)",
                            "requires XeLaTeX or LuaLaTeX (the project uses pdfLaTeX)"
                        )
                    );
                    let d = self.push(
                        Severity::Error,
                        Source::Lint,
                        "engine-required",
                        &p.span,
                        msg,
                    );
                    d.fixes.push(Fix::UseEngine {
                        engine: "lualatex".into(),
                    });
                    d.fixes.push(Fix::UseEngine {
                        engine: "xelatex".into(),
                    });
                }
            }
        }
        if matches!(self.opts.engine, Some(Engine::Xelatex | Engine::Lualatex)) {
            for p in doc.index.packages.iter().filter(|p| p.name == "inputenc") {
                let msg = self
                    .t(
                        "inputenc est inutile avec XeLaTeX/LuaLaTeX (UTF-8 natif)",
                        "inputenc is useless with XeLaTeX/LuaLaTeX (native UTF-8)",
                    )
                    .to_owned();
                self.push(
                    Severity::Hint,
                    Source::Lint,
                    "obsolete",
                    &p.command_span,
                    msg,
                );
            }
        }
        if !self.opts.shell_escape {
            for p in &doc.index.packages {
                if matches!(
                    p.name.as_str(),
                    "minted" | "svg" | "pythontex" | "gnuplottex" | "sagetex" | "epstopdf"
                ) {
                    let msg = format!(
                        "« {} » {}",
                        p.name,
                        self.t(
                            "a besoin de shell escape pour fonctionner",
                            "needs shell escape to work"
                        )
                    );
                    let d = self.push(
                        Severity::Info,
                        Source::Lint,
                        "shell-escape-required",
                        &p.span,
                        msg,
                    );
                    d.fixes.push(Fix::EnableShellEscape);
                }
            }
        }

        // Package order: hyperref near the end, cleveref after hyperref.
        let order: Vec<&str> = doc.index.packages.iter().map(|p| p.name.as_str()).collect();
        if let Some(h) = order.iter().position(|p| *p == "hyperref") {
            let allowed_after = [
                "cleveref",
                "bookmark",
                "hypcap",
                "glossaries",
                "glossaries-extra",
                "amsrefs",
                "algorithm",
                "memhfixc",
                "hyperxmp",
                "orcidlink",
                "doi",
                "nameref",
                "zref-clever",
                "tcolorbox",
                "cite",
            ];
            let late: Vec<&str> = order[h + 1..]
                .iter()
                .copied()
                .filter(|p| !allowed_after.contains(p))
                .collect();
            if !late.is_empty() {
                let span = doc.index.packages[h].command_span.clone();
                let last = doc
                    .index
                    .packages
                    .iter()
                    .rev()
                    .find(|p| late.contains(&p.name.as_str()))
                    .map(|p| p.command_span.clone());
                let fix = last.and_then(|last| {
                    self.move_package(
                        &span,
                        &last,
                        self.t(
                            "Placer hyperref après les autres packages",
                            "Put hyperref after the other packages",
                        )
                        .into(),
                    )
                });
                let msg = format!(
                    "{} ({})",
                    self.t(
                        "hyperref devrait être chargé après les autres packages",
                        "hyperref should be loaded after the other packages"
                    ),
                    late.join(", ")
                );
                let d = self.push(Severity::Hint, Source::Lint, "package-order", &span, msg);
                d.fixes.extend(fix);
            }
        }
        if let (Some(c), Some(h)) = (
            order.iter().position(|p| *p == "cleveref"),
            order.iter().position(|p| *p == "hyperref"),
        ) && c < h
        {
            let span = doc.index.packages[c].command_span.clone();
            let msg = self
                .t(
                    "cleveref doit être chargé après hyperref",
                    "cleveref must be loaded after hyperref",
                )
                .to_owned();
            let fix = self.move_package(
                &span,
                &doc.index.packages[h].command_span.clone(),
                self.t(
                    "Placer cleveref après hyperref",
                    "Put cleveref after hyperref",
                )
                .into(),
            );
            let d = self.push(Severity::Warning, Source::Lint, "package-order", &span, msg);
            d.fixes.extend(fix);
        }

        self.cleveref_french(&packages);
        self.required_packages(class.as_deref(), &packages);
    }

    /// babel-french makes `:` active with pdfLaTeX, which breaks cleveref on `sec:x` labels.
    fn cleveref_french(&mut self, packages: &[String]) {
        let doc = self.doc;
        let Some(cleveref) = doc.index.packages.iter().find(|p| p.name == "cleveref") else {
            return;
        };
        if matches!(
            self.opts.engine,
            Some(Engine::Lualatex | Engine::Xelatex | Engine::Tectonic)
        ) || packages
            .iter()
            .any(|p| p == "fontspec" || p == "polyglossia")
        {
            return;
        }
        let french = self.ws.project_documents(&self.root).iter().any(|d| {
            d.index.packages.iter().any(|p| {
                p.name == "babel"
                    && p.options.iter().any(|o| {
                        matches!(o.as_str(), "french" | "francais" | "frenchb" | "acadian")
                    })
            })
        });
        let fixed = self
            .ws
            .project_documents(&self.root)
            .iter()
            .any(|d| d.text.contains("\\shorthandoff{:}"));
        let colon_refs = self.ws.project_documents(&self.root).iter().any(|d| {
            d.index
                .references
                .iter()
                .any(|r| r.command.eq_ignore_ascii_case("cref") && r.name.contains(':'))
        });
        if !french || fixed || !colon_refs {
            return;
        }
        let end = cleveref.command_span.end;
        let range = doc.range(&(end..end));
        let msg = self
            .t(
                "Avec babel français et pdfLaTeX, « : » est actif : \\cref échouera sur les labels comme sec:intro",
                "With French babel and pdfLaTeX, “:” is active: \\cref will fail on labels like sec:intro",
            )
            .to_owned();
        let span = cleveref.span.clone();
        let d = self.push(
            Severity::Warning,
            Source::Lint,
            "cleveref-babel-french",
            &span,
            msg,
        );
        d.fixes.push(Fix::Replace {
            title: "\\AtBeginDocument{\\shorthandoff{:}}".into(),
            range,
            text: "\n\\AtBeginDocument{\\shorthandoff{:}}".into(),
        });
    }

    /// Commands and environments used without the package that provides them.
    fn required_packages(&mut self, class: Option<&str>, packages: &[String]) {
        let kb = kb();
        let mut loaded = kb.loaded_closure(class, packages.iter().map(String::as_str));
        // Commands defined by the project itself.
        let mut defined: HashSet<String> = self
            .ws
            .command_definitions(&self.root)
            .into_iter()
            .map(|(d, _)| d.name.clone())
            .collect();
        let mut defined_envs: HashSet<String> = self
            .ws
            .environment_definitions(&self.root)
            .into_iter()
            .map(|(d, _)| d.name.clone())
            .collect();
        let analyzer = self
            .ws
            .packages()
            .filter(|a| !a.index().is_empty())
            .cloned();
        let accurate = if let Some(analyzer) = &analyzer {
            for info in analyzer.closure(class, packages.iter().map(String::as_str)) {
                loaded.insert(info.name.clone());
                defined.extend(info.commands.iter().map(|c| c.name.clone()));
                defined_envs.extend(info.environments.iter().map(|e| e.name.clone()));
            }
            true
        } else {
            // Without the distribution, only judge when every loaded package is known.
            packages.iter().all(|p| kb.package(p).is_some())
                && class.is_none_or(|c| kb.class(c).is_some())
        };
        if !accurate {
            return;
        }
        let severity = if analyzer.is_some() {
            Severity::Warning
        } else {
            Severity::Info
        };
        let doc = self.doc;
        let mut flagged: Vec<(String, Option<String>, bool)> = Vec::new();
        for name in doc.index.command_usage.keys() {
            if defined.contains(name) {
                continue;
            }
            let providers = kb.command_providers(name);
            if providers.is_empty()
                || providers.contains(&KERNEL)
                || providers.iter().any(|p| loaded.contains(*p))
            {
                continue;
            }
            flagged.push((
                name.clone(),
                providers.first().map(|p| (*p).to_owned()),
                false,
            ));
        }
        for name in doc.index.environment_usage.keys() {
            if defined_envs.contains(name) {
                continue;
            }
            let providers = kb.environment_providers(name);
            if providers.is_empty()
                || providers.contains(&KERNEL)
                || providers.iter().any(|p| loaded.contains(*p))
            {
                continue;
            }
            flagged.push((
                name.clone(),
                providers.first().map(|p| (*p).to_owned()),
                true,
            ));
        }
        flagged.sort();
        for (name, provider, env) in flagged {
            let Some(pkg) = provider else { continue };
            let needle = if env {
                format!("\\begin{{{name}}}")
            } else {
                format!("\\{name}")
            };
            let Some(pos) = find_command(&doc.text, &needle, env, |p| self.excluded(p)) else {
                continue;
            };
            let span = pos..pos + needle.len();
            let msg = if env {
                format!(
                    "{} « {name} » {} « {pkg} »",
                    self.t("L'environnement", "Environment"),
                    self.t("nécessite le package", "requires package")
                )
            } else {
                format!(
                    "\\{name} {} « {pkg} »",
                    self.t("nécessite le package", "requires package")
                )
            };
            let d = self.push(severity, Source::Lint, "package-required", &span, msg);
            d.fixes.push(Fix::add_package(pkg));
        }
    }

    // ------------------------------------------------------------ floats

    fn label_before_caption(&mut self) {
        let doc = self.doc;
        for env in &doc.index.environments {
            let base = env.name.trim_end_matches('*');
            if !matches!(
                base,
                "figure" | "table" | "subfigure" | "subtable" | "wrapfigure" | "wraptable"
            ) {
                continue;
            }
            let Some(end) = &env.end else { continue };
            let body = &doc.text[env.begin.end..end.start];
            // Only the first level: skip nested sub-floats.
            let (Some(label), Some(caption)) = (body.find("\\label{"), body.find("\\caption"))
            else {
                continue;
            };
            let nested = body
                .find("\\begin{sub")
                .is_some_and(|n| n < caption || n < label);
            if label < caption && !nested {
                let start = env.begin.end + label;
                let span = start..start + 6;
                // The \label moves right after the caption.
                let text = &doc.text;
                let label_end = group_end(text, start + 6).unwrap_or(start + 6);
                let cap = env.begin.end + caption + "\\caption".len();
                let mut open = cap;
                if text[open..].starts_with('[') {
                    open = text[open..].find(']').map_or(open, |i| open + i + 1);
                }
                let fix = group_end(text, open).map(|cap_end| Fix::Edits {
                    title: self
                        .t(
                            "Placer \\label après \\caption",
                            "Put \\label after \\caption",
                        )
                        .into(),
                    edits: vec![
                        self.delete(start..label_end),
                        self.edit(cap_end..cap_end, text[start..label_end].to_owned()),
                    ],
                });
                let msg = self
                    .t("\\label est placé avant \\caption : la référence donnera un mauvais numéro", "\\label is before \\caption: the reference will get the wrong number")
                    .to_owned();
                let d = self.push(
                    Severity::Warning,
                    Source::Lint,
                    "label-before-caption",
                    &span,
                    msg,
                );
                d.fixes.extend(fix);
            }
        }
    }

    // ------------------------------------------------------------ obsolete

    fn obsolete(&mut self) {
        let doc = self.doc;
        let replacements: &[(&str, &str, &str)] = &[
            ("bf", "\\textbf{…} / \\bfseries", "bfseries"),
            ("it", "\\textit{…} / \\itshape", "itshape"),
            ("rm", "\\textrm{…} / \\rmfamily", "rmfamily"),
            ("sf", "\\textsf{…} / \\sffamily", "sffamily"),
            ("tt", "\\texttt{…} / \\ttfamily", "ttfamily"),
            ("sc", "\\textsc{…} / \\scshape", "scshape"),
            ("sl", "\\textsl{…} / \\slshape", "slshape"),
            ("cal", "\\mathcal{…}", ""),
            ("over", "\\frac{…}{…}", ""),
            ("centerline", "\\centering / center", ""),
        ];
        for (old, new, replacement) in replacements {
            if !doc.index.command_usage.contains_key(*old) {
                continue;
            }
            let needle = format!("\\{old}");
            let mut from = 0;
            while let Some(pos) = find_command(&doc.text[from..], &needle, false, |p| {
                self.excluded(from + p)
            })
            .map(|p| p + from)
            {
                let span = pos..pos + needle.len();
                let msg = format!(
                    "\\{old} {} {new}",
                    self.t("est obsolète : utilisez", "is obsolete: use")
                );
                let range = doc.range(&span);
                let d = self.push(Severity::Hint, Source::Lint, "obsolete", &span, msg);
                if !replacement.is_empty() {
                    d.fixes.push(Fix::Replace {
                        title: format!("\\{replacement}"),
                        range,
                        text: format!("\\{replacement}"),
                    });
                }
                from = span.end;
            }
        }
        for env in &doc.index.environments {
            if env.name == "eqnarray" || env.name == "eqnarray*" {
                let msg = self
                    .t(
                        "eqnarray est obsolète : utilisez align (amsmath)",
                        "eqnarray is obsolete: use align (amsmath)",
                    )
                    .to_owned();
                self.push(Severity::Hint, Source::Lint, "obsolete", &env.begin, msg);
            }
        }
        // $$ … $$
        let bytes = doc.text.as_bytes();
        let mut i = 0;
        let mut open: Option<usize> = None;
        while let Some(k) = memchr::memmem::find(&bytes[i..], b"$$") {
            let pos = i + k;
            i = pos + 2;
            if (pos > 0 && bytes[pos - 1] == b'\\') || self.excluded(pos) {
                continue;
            }
            match open.take() {
                None => open = Some(pos),
                Some(start) => {
                    let msg = self
                        .t(
                            "$$ … $$ est déconseillé en LaTeX : utilisez \\[ … \\]",
                            "$$ … $$ is discouraged in LaTeX: use \\[ … \\]",
                        )
                        .to_owned();
                    let range_open = doc.range(&(start..start + 2));
                    let range_close = doc.range(&(pos..pos + 2));
                    let span = start..start + 2;
                    let d = self.push(Severity::Hint, Source::Lint, "obsolete", &span, msg);
                    // Fixes are applied in order; the closing one first keeps positions valid.
                    d.fixes.push(Fix::Replace {
                        title: "\\[ … \\]".into(),
                        range: range_close,
                        text: "\\]".into(),
                    });
                    d.fixes.push(Fix::Replace {
                        title: "\\[ … \\]".into(),
                        range: range_open,
                        text: "\\[".into(),
                    });
                }
            }
        }
        // Obsolete packages.
        let packages: &[(&str, &str)] = &[
            ("epsfig", "graphicx"),
            ("psfig", "graphicx"),
            ("a4wide", "geometry"),
            ("a4", "geometry"),
            ("subfigure", "subcaption"),
            ("subfig", "subcaption"),
            ("fancyheadings", "fancyhdr"),
            ("scrpage2", "scrlayer-scrpage"),
            ("times", "newtxtext + newtxmath"),
            ("palatino", "tgpagella / newpxtext"),
            ("utopia", "fourier"),
            ("doublespace", "setspace"),
            ("caption2", "caption"),
            ("t1enc", "fontenc"),
            ("isolatin1", "inputenc"),
            ("glossary", "glossaries"),
            ("ucs", "inputenc (utf8)"),
            ("mathptm", "newtxmath"),
            ("euler", "eulervm"),
        ];
        for p in &doc.index.packages {
            if let Some((_, new)) = packages.iter().find(|(old, _)| *old == p.name) {
                let msg = format!(
                    "{} « {} » {} {new}",
                    self.t("Le package", "Package"),
                    p.name,
                    self.t("est obsolète : préférez", "is obsolete: prefer")
                );
                self.push(Severity::Hint, Source::Lint, "obsolete", &p.span, msg);
            }
        }
    }

    // --------------------------------------------------------------- style

    fn style(&mut self) {
        let doc = self.doc;
        let text = &doc.text;
        let bytes = text.as_bytes();
        let math = doc.index.math.clone();
        let in_math = |pos: usize| math.iter().any(|m| m.start <= pos && pos < m.end);

        // Non-breaking space before references: "Figure \ref" → "Figure~\ref".
        for r in &doc.index.references {
            if !matches!(r.command.as_str(), "ref" | "eqref" | "pageref" | "vref") {
                continue;
            }
            let cmd_start = text[..r.span.start].rfind('\\').unwrap_or(r.span.start);
            if cmd_start < 2 {
                continue;
            }
            let (prev, prev2) = (bytes[cmd_start - 1], bytes[cmd_start - 2]);
            if prev == b' ' && prev2.is_ascii_alphanumeric() && !self.excluded(cmd_start) {
                let span = cmd_start - 1..cmd_start;
                let range = doc.range(&span);
                let msg = self
                    .t(
                        "Utilisez une espace insécable ~ avant la référence",
                        "Use a non-breaking space ~ before the reference",
                    )
                    .to_owned();
                let d = self.push(Severity::Hint, Source::Lint, "nbsp-ref", &span, msg);
                d.fixes.push(Fix::Replace {
                    title: "~".into(),
                    range,
                    text: "~".into(),
                });
            }
        }

        // Space before \footnote.
        let mut from = 0;
        while let Some(k) = memchr::memmem::find(&bytes[from..], b"\\footnote") {
            let pos = from + k;
            from = pos + 9;
            if bytes.get(pos + 9).is_some_and(|b| b.is_ascii_alphabetic()) || self.excluded(pos) {
                continue;
            }
            let mut s = pos;
            while s > 0 && (bytes[s - 1] == b' ' || bytes[s - 1] == b'\t') {
                s -= 1;
            }
            if s < pos && s > 0 && bytes[s - 1] != b'\n' {
                let span = s..pos;
                let range = doc.range(&span);
                let msg = self.t("Pas d'espace avant \\footnote : l'appel de note se placerait après une espace", "No space before \\footnote: the mark would follow a space").to_owned();
                let title = self.t("Supprimer l'espace", "Remove the space").to_owned();
                let d = self.push(
                    Severity::Hint,
                    Source::Lint,
                    "space-before-footnote",
                    &span,
                    msg,
                );
                d.fixes.push(Fix::Replace {
                    title,
                    range,
                    text: String::new(),
                });
            }
        }

        // "..." → \dots
        let mut from = 0;
        while let Some(k) = memchr::memmem::find(&bytes[from..], b"...") {
            let pos = from + k;
            from = pos + 3;
            while from < bytes.len() && bytes[from] == b'.' {
                from += 1;
            }
            if self.excluded(pos) || (pos > 0 && bytes[pos - 1] == b'\\') {
                continue;
            }
            // Keys and paths ({1,...,5} in TikZ loops) are not prose.
            let line_start = text[..pos].rfind('\n').map_or(0, |i| i + 1);
            if text[line_start..pos].contains("\\foreach")
                || text[pos..from.min(text.len())].len() != 3
            {
                continue;
            }
            let span = pos..pos + 3;
            let range = doc.range(&span);
            let replacement = if in_math(pos) { "\\dots" } else { "\\dots{}" };
            let msg = self
                .t(
                    "Utilisez \\dots pour des points de suspension correctement espacés",
                    "Use \\dots for properly spaced ellipsis",
                )
                .to_owned();
            let d = self.push(Severity::Hint, Source::Lint, "ellipsis", &span, msg);
            d.fixes.push(Fix::Replace {
                title: replacement.into(),
                range,
                text: replacement.into(),
            });
        }

        // "\\" at the end of a paragraph.
        let mut from = 0;
        while let Some(k) = memchr::memmem::find(&bytes[from..], b"\\\\") {
            let pos = from + k;
            from = pos + 2;
            if self.excluded(pos) || in_math(pos) || (pos > 0 && bytes[pos - 1] == b'\\') {
                continue;
            }
            let rest = &text[pos + 2..];
            let after_line = rest.split_once('\n').map(|(_, r)| r).unwrap_or("");
            let this_line_rest = rest.split('\n').next().unwrap_or("");
            let in_table = doc.index.environments.iter().any(|e| {
                e.begin.start < pos
                    && e.end.as_ref().is_none_or(|end| pos < end.start)
                    && matches!(
                        e.name.trim_end_matches('*'),
                        "tabular"
                            | "tabularx"
                            | "array"
                            | "longtable"
                            | "tabbing"
                            | "align"
                            | "matrix"
                            | "pmatrix"
                            | "bmatrix"
                            | "cases"
                            | "verse"
                            | "center"
                            | "flushleft"
                            | "flushright"
                            | "minipage"
                            | "letter"
                            | "tabu"
                            | "NiceTabular"
                            | "tblr"
                    )
            });
            if in_table || !this_line_rest.trim().is_empty() {
                continue;
            }
            if after_line.trim_start_matches([' ', '\t']).starts_with('\n')
                || after_line.trim().is_empty()
            {
                let span = pos..pos + 2;
                let msg = self
                    .t(
                        "\\\\ en fin de paragraphe : laissez simplement une ligne vide",
                        "\\\\ at the end of a paragraph: just leave a blank line",
                    )
                    .to_owned();
                // The same edit as the fix of the "Underfull \hbox" warning.
                let start = pos - (text[..pos].len() - text[..pos].trim_end().len());
                let fix = Fix::Edits {
                    title: self
                        .t(
                            "Supprimer le \\\\ en fin de paragraphe",
                            "Delete the \\\\ at the end of the paragraph",
                        )
                        .into(),
                    edits: vec![self.edit(start..pos + 2, "")],
                };
                let d = self.push(Severity::Hint, Source::Lint, "paragraph-break", &span, msg);
                d.fixes.push(fix);
            }
        }
    }

    // ----------------------------------------------------------------- bib

    fn bib(&mut self) {
        let doc = self.doc;
        let Some(db) = &doc.bib else { return };
        for p in &db.problems {
            let msg = format!(
                "{} {}",
                self.t("Erreur BibTeX :", "BibTeX error:"),
                p.message
            );
            self.push(Severity::Error, Source::Syntax, "syntax", &p.span, msg);
        }
        let mut seen: HashMap<&str, usize> = HashMap::new();
        for e in &db.entries {
            *seen.entry(e.key.as_str()).or_default() += 1;
        }
        for e in &db.entries {
            if seen[e.key.as_str()] > 1 {
                let msg = format!(
                    "{} « {} »",
                    self.t("Clé dupliquée :", "Duplicate key:"),
                    e.key
                );
                self.push(
                    Severity::Warning,
                    Source::Lint,
                    "duplicate-label",
                    &e.key_span,
                    msg,
                );
            }
            if e.field("title").is_none()
                && e.kind != "string"
                && e.kind != "xdata"
                && e.kind != "set"
            {
                let msg = format!(
                    "{} « {} » {}",
                    self.t("L'entrée", "Entry"),
                    e.key,
                    self.t("n'a pas de titre", "has no title")
                );
                self.push(Severity::Hint, Source::Lint, "bib-fields", &e.key_span, msg);
            }
        }
    }
}

/// Where the text of an unclosed inline formula resumes: before the first
/// word (two letters or more, not a command) after its opening, if any.
fn text_resumes(text: &str, from: usize, to: usize) -> Option<usize> {
    let mut last_end = from;
    let mut pos = from;
    for token in text[from..to].split_whitespace() {
        let start = pos + text[pos..to].find(token)?;
        let word = token.trim_end_matches(|c: char| ".,;:!?".contains(c));
        if start > from && word.chars().count() >= 2 && word.chars().all(char::is_alphabetic) {
            return Some(last_end);
        }
        last_end = start + token.len();
        pos = last_end;
    }
    None
}

/// Why a rule reports something and what to do, in plain words.
fn explanation(code: &str, lang: Lang) -> Option<&'static str> {
    let (fr, en) = match code {
        "undefined-reference" => (
            "Aucun `\\label{…}` ne porte ce nom dans le projet : la référence affichera « ?? ». Vérifiez l'orthographe, ou ajoutez le label à l'endroit visé.",
            "No `\\label{…}` has this name in the project: the reference will print “??”. Check the spelling, or add the label where it should point.",
        ),
        "undefined-citation" => (
            "Cette clé n'est dans aucun fichier `.bib` du projet : la citation affichera « ? ». Vérifiez l'orthographe de la clé ou ajoutez l'entrée.",
            "This key is in no `.bib` file of the project: the citation will print “?”. Check the spelling of the key or add the entry.",
        ),
        "duplicate-label" => (
            "Deux labels (ou deux entrées de bibliographie) ont le même nom : les références pointeront toutes vers le dernier. Donnez un nom unique à chacun.",
            "Two labels (or two bibliography entries) have the same name: every reference will point to the last one. Give each a unique name.",
        ),
        "missing-file" => (
            "Le fichier n'existe pas. Le chemin part du dossier du document principal, et l'extension `.tex` peut être omise.",
            "The file does not exist. The path starts from the folder of the main document, and the `.tex` extension can be left out.",
        ),
        "missing-image" => (
            "L'image n'existe pas à cet emplacement : la compilation échouera. Vérifiez le nom et le dossier (l'extension peut être omise).",
            "The image does not exist at this place: the build will fail. Check its name and folder (the extension can be left out).",
        ),
        "missing-package" => (
            "Ce package n'est pas installé dans votre distribution TeX : la compilation échouera tant qu'il manque. Installez-le en un clic.",
            "This package is not installed in your TeX distribution: the build fails until it is. Install it in one click.",
        ),
        "package-required" => (
            "Cette commande vient d'un package qui n'est pas chargé : ajoutez-le au préambule.",
            "This command comes from a package that is not loaded: add it to the preamble.",
        ),
        "engine-required" => (
            "Ce package ne fonctionne qu'avec XeLaTeX ou LuaLaTeX, pas avec pdfLaTeX.",
            "This package only works with XeLaTeX or LuaLaTeX, not with pdfLaTeX.",
        ),
        "shell-escape-required" => (
            "Ce package lance des programmes externes : il faut autoriser les commandes externes (shell escape) pour ce projet.",
            "This package runs external programs: external commands (shell escape) must be allowed for this project.",
        ),
        "label-before-caption" => (
            "Le numéro d'une figure ou d'un tableau est créé par `\\caption` : un `\\label` placé avant reprend le numéro de la section. Placez `\\label` juste après `\\caption`.",
            "The number of a figure or table is created by `\\caption`: a `\\label` before it gets the number of the section. Put `\\label` right after `\\caption`.",
        ),
        "package-order" => (
            "hyperref modifie beaucoup de commandes : il se charge après les autres packages, sauf quelques-uns (cleveref, bookmark…) qui viennent juste après lui.",
            "hyperref changes many commands: it is loaded after the other packages, except a few (cleveref, bookmark…) that come right after it.",
        ),
        "duplicate-package" => (
            "Charger deux fois le même package est inutile, et provoque une erreur si les options diffèrent.",
            "Loading the same package twice is useless, and an error when the options differ.",
        ),
        "obsolete" => (
            "Cette commande est ancienne : sa version moderne donne un meilleur résultat et fonctionne avec les autres packages.",
            "This command is old: its modern version gives a better result and works with the other packages.",
        ),
        "nbsp-ref" => (
            "Une espace insécable `~` avant une référence évite qu'un numéro se retrouve seul en début de ligne.",
            "A non-breaking space `~` before a reference keeps a number from starting a line on its own.",
        ),
        "space-before-footnote" => (
            "Une espace avant `\\footnote` décale l'appel de note du mot : collez `\\footnote` au mot.",
            "A space before `\\footnote` separates the note mark from the word: attach `\\footnote` to the word.",
        ),
        "ellipsis" => (
            "`\\ldots` (ou `\\dots`) espace correctement les points de suspension.",
            "`\\ldots` (or `\\dots`) spaces the ellipsis correctly.",
        ),
        "paragraph-break" => (
            "`\\\\` coupe la ligne sans finir le paragraphe et provoque des avertissements « Underfull \\hbox ». Pour un nouveau paragraphe, une ligne vide suffit.",
            "`\\\\` breaks the line without ending the paragraph and causes “Underfull \\hbox” warnings. For a new paragraph, a blank line is enough.",
        ),
        "bib-fields" => (
            "Une entrée sans titre s'affichera incomplète dans la bibliographie.",
            "An entry without a title will be incomplete in the bibliography.",
        ),
        "tikz-semicolon" => (
            "Chaque tracé TikZ (`\\draw`, `\\node`, `\\fill`…) se termine par `;`. Sans lui, le tracé suivant est lu comme la suite du précédent.",
            "Every TikZ path (`\\draw`, `\\node`, `\\fill`…) ends with `;`. Without it, the next path is read as the rest of the previous one.",
        ),
        "cleveref-babel-french" => (
            "Avec babel en français, « : » devient un caractère actif : les labels comme `sec:intro` font échouer `\\cref`. `\\AtBeginDocument{\\shorthandoff{:}}` le désactive.",
            "With French babel, “:” becomes an active character: labels like `sec:intro` make `\\cref` fail. `\\AtBeginDocument{\\shorthandoff{:}}` turns it off.",
        ),
        _ => return None,
    };
    Some(lang.pick(fr, en))
}

/// Spans that are not LaTeX prose: comments and verbatim-like environments.
fn excluded_spans(doc: &Document) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut offset = 0;
    for line in doc.text.split_inclusive('\n') {
        if let Some(c) = comment_start(line) {
            spans.push(offset + c..offset + line.len());
        }
        offset += line.len();
    }
    for env in &doc.index.environments {
        if crate::syntax::is_verbatim_environment(&env.name) {
            spans.push(env.begin.start..env.end.as_ref().map_or(doc.text.len(), |e| e.end));
        }
    }
    spans.sort_by_key(|s| s.start);
    // Merge overlaps so that the binary search works.
    let mut merged: Vec<Span> = Vec::with_capacity(spans.len());
    for s in spans {
        match merged.last_mut() {
            Some(last) if s.start <= last.end => last.end = last.end.max(s.end),
            _ => merged.push(s),
        }
    }
    merged
}

/// First occurrence of `\name` (not followed by a letter) outside excluded spans.
fn find_command(
    text: &str,
    needle: &str,
    env: bool,
    excluded: impl Fn(usize) -> bool,
) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut from = 0;
    while let Some(k) = memchr::memmem::find(&bytes[from..], needle.as_bytes()) {
        let pos = from + k;
        from = pos + needle.len();
        let next_is_letter = bytes.get(from).is_some_and(|b| b.is_ascii_alphabetic());
        let escaped = pos > 0 && bytes[pos - 1] == b'\\';
        if (env || !next_is_letter) && !escaped && !excluded(pos) {
            return Some(pos);
        }
    }
    None
}

/// The closest key (edit distance ≤ 2, and ≤ a third of the length).
fn closest<'k>(key: &str, candidates: impl Iterator<Item = &'k str>) -> Option<String> {
    let max = (key.chars().count() / 3).clamp(1, 3);
    candidates
        .map(|c| (levenshtein(key, c), c))
        .filter(|(d, _)| *d <= max)
        .min()
        .map(|(_, c)| c.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lint_text(
        files: &[(&str, &str)],
        target: &str,
        opts: LintOptions<'_>,
    ) -> Vec<(String, String)> {
        let dir = tempfile::tempdir().unwrap();
        for (name, text) in files {
            let p = dir.path().join(name);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, text).unwrap();
        }
        let ws = Workspace::open(dir.path());
        lint(&ws, &crate::log::normalize(&dir.path().join(target)), &opts)
            .into_iter()
            .map(|d| (d.code.unwrap_or_default(), d.message))
            .collect()
    }

    #[test]
    fn tikz_paths_without_semicolon() {
        let main = "\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1) % trait\n\\draw (1,0) -- (0,1);\n\\node[draw] at (0,0) {$\\alpha; \\beta$};\n\\draw (0,0) node[above] {A} -- (1,0);\n\\foreach \\x in {1,2} { \\draw (\\x,0) circle (1pt); }\n\\end{tikzpicture}\n\\end{document}\n";
        let d = lint_text(&[("main.tex", main)], "main.tex", LintOptions::default());
        let found: Vec<_> = d.iter().filter(|(c, _)| c == "tikz-semicolon").collect();
        assert_eq!(found.len(), 1, "{d:?}");
    }

    #[test]
    fn finds_common_mistakes() {
        let main = "\\documentclass{article}\n\\usepackage{hyperref}\n\\usepackage{amsmath}\n\\begin{document}\n\\section{A}\\label{sec:a}\nVoir Section \\ref{sec:b} et \\ref{sec:aa}.\n$\\mathbb{R}$ et \\cite{knut}.\n\\begin{figure}\\label{fig:x}\\caption{C}\\end{figure}\n\\input{missing}\nFin... et $$x$$ \\bf gras.\\\\\n\nNote \\footnote{x}.\n% \\ref{commented} ...\n\\end{document}\n";
        let bib = "@book{knuth, title={T}}\n";
        let d = lint_text(
            &[("main.tex", main), ("refs.bib", bib)],
            "main.tex",
            LintOptions {
                lang: Lang::En,
                style_hints: true,
                ..Default::default()
            },
        );
        let codes: Vec<&str> = d.iter().map(|(c, _)| c.as_str()).collect();
        for expected in [
            "undefined-reference",
            "undefined-citation",
            "missing-file",
            "label-before-caption",
            "obsolete",
            "nbsp-ref",
            "ellipsis",
            "space-before-footnote",
            "paragraph-break",
            "package-order",
            "package-required",
        ] {
            assert!(codes.contains(&expected), "missing {expected} in {d:#?}");
        }
        assert!(
            !d.iter().any(|(_, m)| m.contains("commented")),
            "comments must be ignored"
        );
        let pkg = d.iter().find(|(c, _)| c == "package-required").unwrap();
        assert!(
            pkg.1.contains("\\mathbb") && pkg.1.contains("amsfonts"),
            "{pkg:?}"
        );
    }

    #[test]
    fn cleveref_with_french_babel() {
        let main = "\\documentclass{article}\n\\usepackage[french]{babel}\n\\usepackage{cleveref}\n\\begin{document}\n\\section{A}\\label{sec:a} \\cref{sec:a}\n\\end{document}\n";
        let d = lint_text(&[("main.tex", main)], "main.tex", LintOptions::default());
        assert!(d.iter().any(|(c, _)| c == "cleveref-babel-french"), "{d:?}");
        let fixed = main.replace(
            "{cleveref}",
            "{cleveref}\\AtBeginDocument{\\shorthandoff{:}}",
        );
        let d = lint_text(&[("main.tex", &fixed)], "main.tex", LintOptions::default());
        assert!(!d.iter().any(|(c, _)| c == "cleveref-babel-french"));
    }

    #[test]
    fn engine_and_disabled_rules() {
        let main = "\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\nx\n\\end{document}\n";
        let d = lint_text(
            &[("main.tex", main)],
            "main.tex",
            LintOptions {
                engine: Some(Engine::Pdflatex),
                ..Default::default()
            },
        );
        assert!(d.iter().any(|(c, _)| c == "engine-required"));
        let mut disabled = HashSet::new();
        disabled.insert("engine-required".to_string());
        let d = lint_text(
            &[("main.tex", main)],
            "main.tex",
            LintOptions {
                engine: Some(Engine::Pdflatex),
                disabled,
                ..Default::default()
            },
        );
        assert!(!d.iter().any(|(c, _)| c == "engine-required"));
    }

    #[test]
    fn french_messages_and_bib() {
        let d = lint_text(
            &[(
                "refs.bib",
                "@article{a, title={x}}\n@article{a, title={y}}\n@book{b,\n",
            )],
            "refs.bib",
            LintOptions {
                lang: Lang::Fr,
                ..Default::default()
            },
        );
        assert!(
            d.iter().any(|(_, m)| m.starts_with("Clé dupliquée")),
            "{d:?}"
        );
        assert!(
            d.iter().any(|(_, m)| m.starts_with("Erreur BibTeX")),
            "{d:?}"
        );
    }
}
