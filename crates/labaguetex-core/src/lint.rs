//! Live diagnostics while typing (no compilation needed).
//!
//! Rules are identified by stable ids (users can disable them globally or
//! per project). Messages are localized and, whenever possible, come with
//! an automatic fix. The rules aim at catching real mistakes early and at
//! teaching good practice to beginners, without noise for experts.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::diagnostics::{Diagnostic, Fix, Hint, Severity, Source};
use crate::i18n::Lang;
use crate::kb::{KERNEL, kb};
use crate::log::hints::levenshtein;
use crate::syntax::{IncludeKind, ProblemKind, context::comment_start};
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
        for p in problems {
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
            let d = self.push(Severity::Error, Source::Syntax, "syntax", &p.span, msg);
            d.hint = Some(Hint {
                title: d.message.clone(),
                explanation: hint.to_owned(),
            });
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
                self.push(
                    Severity::Warning,
                    Source::Lint,
                    "duplicate-label",
                    &l.span,
                    msg,
                );
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
                    let d = self.push(
                        Severity::Error,
                        Source::Lint,
                        "missing-file",
                        &inc.span,
                        msg,
                    );
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
                    self.push(
                        Severity::Warning,
                        Source::Lint,
                        "missing-image",
                        &inc.span,
                        msg,
                    );
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
                self.push(
                    Severity::Warning,
                    Source::Lint,
                    "duplicate-package",
                    &p.command_span,
                    msg,
                );
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
                let msg = format!(
                    "{} ({})",
                    self.t(
                        "hyperref devrait être chargé après les autres packages",
                        "hyperref should be loaded after the other packages"
                    ),
                    late.join(", ")
                );
                self.push(Severity::Hint, Source::Lint, "package-order", &span, msg);
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
            self.push(Severity::Warning, Source::Lint, "package-order", &span, msg);
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
            d.fixes.push(Fix::AddPackage { package: pkg });
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
                let msg = self
                    .t("\\label est placé avant \\caption : la référence donnera un mauvais numéro", "\\label is before \\caption: the reference will get the wrong number")
                    .to_owned();
                self.push(
                    Severity::Warning,
                    Source::Lint,
                    "label-before-caption",
                    &span,
                    msg,
                );
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
                self.push(Severity::Hint, Source::Lint, "paragraph-break", &span, msg);
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
