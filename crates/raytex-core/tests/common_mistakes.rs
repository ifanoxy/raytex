//! Common LaTeX documents and common mistakes, compiled with the local TeX
//! distribution (`cargo test -p raytex-core --release -- --ignored`).
//!
//! * A document using the most common commands and environments compiles
//!   without any error or warning, and the live checks find nothing wrong.
//! * Each mistake is reported (by the compiler or the live checks) with an
//!   explanation and an automatic fix; applying the fix like the editor does
//!   makes the problem go away.
//!
//! * The cause of a mistake is found in the sources: the diagnostic is on the
//!   text to change and its advice says what is wrong with it.
//!
//! `LBT_PROBE=1` prints every diagnostic instead of checking (to write new
//! cases); `LBT_CASE=<name>` runs the cases whose name contains the text.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};

use raytex_core::build::{self, BuildEvent, DocumentFacts, RunContext};
use raytex_core::diagnostics::{Diagnostic, Severity, Source};
use raytex_core::fixes;
use raytex_core::i18n::Lang;
use raytex_core::lint::{self, LintOptions};
use raytex_core::settings::BuildSettings;
use raytex_core::tex::{Distribution, PackageAnalyzer, TexmfIndex};
use raytex_core::workspace::Workspace;

/// A mistake and the diagnostic that must report it.
struct Case {
    name: &'static str,
    /// Code of the expected diagnostic.
    code: &'static str,
    /// The main file.
    main: String,
    /// Other files of the project.
    files: Vec<(&'static str, String)>,
    /// Bad boxes are shown (hidden by default).
    badboxes: bool,
    /// Warnings that may remain after the fix (a fix that is a first step).
    allow_after: &'static [&'static str],
    /// Who must report it (the live checks, before compiling).
    from: Option<Source>,
}

fn case(name: &'static str, code: &'static str, main: String) -> Case {
    Case {
        name,
        code,
        main,
        files: Vec::new(),
        badboxes: false,
        allow_after: &[],
        from: None,
    }
}

impl Case {
    fn with(mut self, path: &'static str, text: &str) -> Self {
        self.files.push((path, text.to_owned()));
        self
    }
    fn badboxes(mut self) -> Self {
        self.badboxes = true;
        self
    }
    fn live(mut self) -> Self {
        self.from = Some(if self.code == "syntax" {
            Source::Syntax
        } else {
            Source::Lint
        });
        self
    }
    fn allow(mut self, codes: &'static [&'static str]) -> Self {
        self.allow_after = codes;
        self
    }
}

/// An article with the given preamble lines and body.
fn doc(preamble: &str, body: &str) -> String {
    format!(
        "\\documentclass{{article}}\n{preamble}{}\\begin{{document}}\n{body}\n\\end{{document}}\n",
        if preamble.is_empty() { "" } else { "\n" }
    )
}

const BIB: &str = "@book{knuth,\n  author = {Knuth, Donald E.},\n  title = {The {\\TeX}book},\n  publisher = {Addison-Wesley},\n  year = {1984}\n}\n\n@article{lamport,\n  author = {Lamport, Leslie},\n  title = {{\\LaTeX}: A Document Preparation System},\n  journal = {Addison-Wesley},\n  year = {1994}\n}\n";

fn cases() -> Vec<Case> {
    vec![
        // ------------------------------------------------ unknown commands
        case("typo-textbf", "undefined-control-sequence", doc("", "Du texte en \\textbff{gras}.")),
        case("typo-section", "undefined-control-sequence", doc("", "\\sectoin{Introduction}\nTexte.")),
        case("typo-user-macro", "undefined-control-sequence", doc("\\newcommand{\\vecteur}[1]{\\mathbf{#1}}", "$\\vecteru{u}$")),
        case("pkg-mathbb", "undefined-control-sequence", doc("", "Soit $x \\in \\mathbb{R}$.")),
        case("pkg-includegraphics", "undefined-control-sequence", doc("", "\\includegraphics[width=3cm]{example-image}")),
        case("pkg-url", "undefined-control-sequence", doc("", "Voir \\url{https://ctan.org}.")),
        case("pkg-href", "undefined-control-sequence", doc("", "Voir \\href{https://ctan.org}{CTAN}.")),
        case("pkg-textcolor", "undefined-control-sequence", doc("", "Un mot \\textcolor{red}{rouge}.")),
        case("pkg-toprule", "undefined-control-sequence", doc("", "\\begin{tabular}{ll}\n\\toprule\na & b \\\\\n\\bottomrule\n\\end{tabular}")),
        case("pkg-si", "undefined-control-sequence", doc("", "Une longueur de \\SI{3}{\\metre}.")),
        case("pkg-lipsum", "undefined-control-sequence", doc("", "\\lipsum[1]")),
        case("pkg-text", "undefined-control-sequence", doc("", "$x = 1 \\text{ si } y > 0$")),
        case("pkg-eqref", "undefined-control-sequence", doc("", "\\begin{equation}\\label{eq:a} a = b \\end{equation}\nVoir \\eqref{eq:a}.")),
        case("pkg-cref", "undefined-control-sequence", doc("", "\\section{A}\\label{sec:a}\nVoir \\cref{sec:a}.")),
        case("pkg-enquote", "undefined-control-sequence", doc("", "Il dit \\enquote{bonjour}.")),
        case("pkg-cancel", "undefined-control-sequence", doc("", "$\\cancel{x}$")),
        case("pkg-multirow", "undefined-control-sequence", doc("", "\\begin{tabular}{ll}\n\\multirow{2}{*}{a} & b \\\\\n & c \\\\\n\\end{tabular}")),
        case("pkg-checkmark", "undefined-control-sequence", doc("", "Fait : $\\checkmark$")),
        case("pkg-mathscr", "undefined-control-sequence", doc("", "$\\mathscr{L}$")),
        case("pkg-ce", "undefined-control-sequence", doc("", "L'eau : \\ce{H2O}.")),
        case("pkg-hl", "undefined-control-sequence", doc("", "Un \\hl{surlignage}.")),
        case("pkg-sout", "undefined-control-sequence", doc("", "Un mot \\sout{barré}.")),
        case("pkg-bm", "undefined-control-sequence", doc("", "$\\bm{x}$")),
        case("pkg-todo", "undefined-control-sequence", doc("", "Texte\\todo{relire}.")),
        // ----------------------------------------------- environments
        case("pkg-align", "env-undefined", doc("", "\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}")),
        case("pkg-tikzpicture", "env-undefined", doc("", "\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}")),
        case("pkg-lstlisting", "env-undefined", doc("", "\\begin{lstlisting}\nprint(1)\n\\end{lstlisting}")),
        case("pkg-multicols", "env-undefined", doc("", "\\begin{multicols}{2}\nA\n\nB\n\\end{multicols}")),
        case("typo-itemize", "env-undefined", doc("", "\\begin{itemise}\n\\item Un\n\\item Deux\n\\end{itemise}")),
        case("env-mismatch", "env-mismatch", doc("", "\\begin{itemize}\n\\item Un\n\\end{enumerate}")),
        case("env-not-closed", "env-mismatch", doc("", "\\begin{itemize}\n\\item Un\n\\item Deux\n\nFin.")),
        case("env-extra-end", "env-mismatch", doc("", "Texte centré.\n\\end{center}\nSuite.")),
        case("missing-item", "missing-item", doc("", "\\begin{itemize}\nPremier point\n\\item Second point\n\\end{itemize}")),
        case("lonely-item", "lonely-item", doc("", "\\item Premier\n\\item Second")),
        // ----------------------------------------------------- braces
        case("brace-not-closed", "file-ended", doc("", "Du texte \\textbf{en gras\n\nNouveau paragraphe.")),
        case("brace-extra", "extra-brace", doc("", "Du texte} en trop.")),
        case("brace-not-closed-end", "file-ended", doc("", "\\emph{jamais fermé")),
        // ------------------------------------------------------- math
        case("math-underscore", "missing-dollar", doc("", "Le fichier mon_fichier.txt est lu.")),
        case("math-superscript", "missing-dollar", doc("", "Le carré x^2 est positif.")),
        case("math-greek", "missing-dollar", doc("", "L'angle \\alpha est droit.")),
        case("math-blank-line", "missing-dollar", doc("\\usepackage{amsmath}", "\\[\na + b\n\nc\n\\]")),
        case("math-double-sup", "double-subscript", doc("", "$x^2^3$")),
        case("math-left", "missing-right", doc("", "$\\left( \\frac{a}{b} $")),
        case("math-align-in-display", "align-in-math", doc("\\usepackage{amsmath}", "\\[\n\\begin{align}\na &= b\n\\end{align}\n\\]")),
        // ---------------------------------------------- special characters
        case("char-ampersand", "misplaced-alignment-tab", doc("", "Dupont & Fils.")),
        case("char-hash", "hash-in-text", doc("", "Le #1 du classement.")),
        case("char-unicode", "unicode-not-set-up", doc("", "Donc $a$ → $b$ et α.")),
        // ----------------------------------------------------- tables
        case("table-extra-column", "extra-alignment-tab", doc("", "\\begin{tabular}{ll}\na & b & c \\\\\n\\end{tabular}")),
        case("table-hline", "misplaced-noalign", doc("", "\\begin{tabular}{ll}\n\\hline\na & b\n\\hline\n\\end{tabular}")),
        case("table-bad-column", "illegal-column", doc("", "\\begin{tabular}{lx}\na & b \\\\\n\\end{tabular}")),
        case("newline-nothing", "no-line-to-end", doc("", "\\\\\nTexte.")),
        // ----------------------------------------------------- floats
        case("float-h", "float-h", doc("\\usepackage{graphicx}", "\\lipsum\n\\begin{figure}[h]\n\\centering\n\\includegraphics[height=0.7\\textheight]{example-image}\n\\caption{Une image}\n\\end{figure}\nTexte.").replace("\\lipsum", "Texte.\n\n\\rule{1pt}{0.5\\textheight}")),
        case("float-H", "float-option", doc("\\usepackage{graphicx}", "\\begin{figure}[H]\n\\centering\n\\includegraphics[width=3cm]{example-image}\n\\end{figure}")),
        case("float-too-large", "float-too-large", doc("\\usepackage{graphicx}", "\\begin{figure}\n\\centering\n\\includegraphics[height=30cm]{example-image}\n\\caption{Grande}\n\\end{figure}")),
        case("caption-outside", "caption-outside-float", doc("\\usepackage{graphicx}", "\\begin{center}\n\\includegraphics[width=3cm]{example-image}\n\\caption{Une image}\n\\end{center}")),
        case("image-missing", "file-not-found", doc("\\usepackage{graphicx}", "\\includegraphics[width=3cm]{images/phot}")).with("images/photo.png", ""),
        case("image-key", "keyval-undefined", doc("\\usepackage{graphicx}", "\\includegraphics[widht=3cm]{example-image}")),
        case("image-too-wide", "overfull-box", doc("\\usepackage{graphicx}", "\\includegraphics[width=20cm]{example-image}")).badboxes(),
        // ------------------------------------------------- definitions
        case("newcommand-exists", "already-defined", doc("", "\\newcommand{\\vec}[1]{\\mathbf{#1}}").replace("\\begin{document}\n\\newcommand{\\vec}[1]{\\mathbf{#1}}", "\\newcommand{\\vec}[1]{\\mathbf{#1}}\n\\begin{document}\n$\\vec{u}$")),
        case("renewcommand-undefined", "renew-undefined", doc("\\renewcommand{\\monR}{\\mathbf{R}}", "$\\monR$")),
        case("newcommand-args", "illegal-parameter", doc("\\newcommand{\\carre}{#1^2}", "$\\carre{x}$")),
        case("newcommand-backslash", "missing-control-sequence", doc("\\newcommand{carre}{x^2}", "Texte.")),
        // --------------------------------------------------- preamble
        case("usepackage-in-body", "preamble-only", doc("", "\\usepackage{amsmath}\nTexte.")),
        case("usepackage-before-class", "before-documentclass", "\\usepackage{amsmath}\n\\documentclass{article}\n\\begin{document}\nTexte.\n\\end{document}\n".into()),
        case("no-begin-document", "missing-begin-document", "\\documentclass{article}\nTexte avant le document.\n\\end{document}\n".into()),
        case("no-end-document", "no-end-document", "\\documentclass{article}\n\\begin{document}\nTexte.\n".into()),
        case("inputenc-utf-8", "file-not-found", doc("\\usepackage[utf-8]{inputenc}", "Texte.")),
        case("option-clash", "option-clash", doc("\\usepackage{amsmath}\n\\usepackage[fleqn]{amsmath}", "\\[ a = b \\]")),
        case("geometry-key", "keyval-undefined", doc("\\usepackage[marging=2cm]{geometry}", "Texte.")),
        // Recent babel (MiKTeX) no longer knows `francais` at all.
        case("babel-francais", "babel-option|babel-unknown", doc("\\usepackage[T1]{fontenc}\n\\usepackage[francais]{babel}", "Texte.")),
        case("babel-unknown", "babel-unknown", doc("\\usepackage[T1]{fontenc}\n\\usepackage[frensh]{babel}", "Texte.")),
        case("fontenc-french", "french-fontenc", doc("\\usepackage[french]{babel}", "Texte.")),
        case("fontspec-pdflatex", "fontspec-engine", format!("% !TEX program = pdflatex\n{}", doc("\\usepackage{fontspec}", "Texte."))),
        case("unknown-option", "unknown-option", doc("\\usepackage[francais]{amsmath}", "Texte.")),
        // ----------------------------------------------------- colours
        case("color-unknown", "undefined-color", doc("\\usepackage{xcolor}", "\\textcolor{bleu}{Texte}.")),
        case("color-dvipsnames", "undefined-color", doc("\\usepackage{xcolor}", "\\textcolor{ForestGreen}{Texte}.")),
        // -------------------------------------------------------- TikZ
        case("tikz-semicolon", "tikz-semicolon", doc("\\usepackage{tikz}", "\\begin{tikzpicture}\n\\draw (0,0) -- (1,1)\n\\draw (1,0) -- (0,1);\n\\end{tikzpicture}")),
        case("tikz-positioning", "tikz-library", doc("\\usepackage{tikz}", "\\begin{tikzpicture}\n\\node (a) {A};\n\\node[right=of a] (b) {B};\n\\end{tikzpicture}")),
        case("tikz-arrows", "tikz-library", doc("\\usepackage{tikz}", "\\begin{tikzpicture}\n\\draw[-Stealth] (0,0) -- (1,0);\n\\end{tikzpicture}")),
        case("tikz-shapes", "tikz-unknown-key", doc("\\usepackage{tikz}", "\\begin{tikzpicture}\n\\node[draw, diamond] {A};\n\\end{tikzpicture}")),
        case("tikz-key", "tikz-unknown-key", doc("\\usepackage{tikz}", "\\begin{tikzpicture}\n\\draw[colr=red] (0,0) -- (1,0);\n\\end{tikzpicture}")),
        case("pgfplots-compat", "pgfplots-compat", doc("\\usepackage{pgfplots}", "\\begin{tikzpicture}\n\\begin{axis}\n\\addplot {x^2};\n\\end{axis}\n\\end{tikzpicture}")),
        // ---------------------------------------- references and citations
        case("ref-typo", "undefined-reference", doc("", "\\section{Intro}\\label{sec:intro}\nVoir la section~\\ref{sec:intr}.")),
        case("label-twice", "multiply-defined", doc("", "\\section{A}\\label{sec:a}\n\\section{B}\\label{sec:a}\nVoir~\\ref{sec:a}.")),
        case("cite-typo", "undefined-citation", doc("", "Voir \\cite{knut}.\n\\bibliographystyle{plain}\n\\bibliography{refs}")).with("refs.bib", BIB),
        case("cite-no-bibliography", "undefined-citation", doc("", "Voir \\cite{knuth}.")).with("refs.bib", BIB),
        case("bib-no-citation", "no-citation", doc("", "Texte.\n\\bibliographystyle{plain}\n\\bibliography{refs}")).with("refs.bib", BIB),
        case("bib-missing-comma", "bib-syntax", doc("", "Voir \\cite{knuth}.\n\\bibliographystyle{plain}\n\\bibliography{refs}")).with("refs.bib", &BIB.replace("title = {The {\\TeX}book},", "title = {The {\\TeX}book}")),
        case("natbib-numbers", "natbib-author", doc("\\usepackage{natbib}", "Voir \\citet{knuth}.\n\\bibliographystyle{plain}\n\\bibliography{refs}")).with("refs.bib", BIB),
        case("biblatex-typo", "undefined-citation", doc("\\usepackage{biblatex}\n\\addbibresource{refs.bib}", "Voir \\cite{lamprt}.\n\\printbibliography")).with("refs.bib", BIB),
        // ----------------------------------------------------- warnings
        case("cleveref-french", "endcsname", doc("\\usepackage[T1]{fontenc}\n\\usepackage[french]{babel}\n\\usepackage{cleveref}", "\\section{Intro}\\label{sec:intro}\nVoir la \\cref{sec:intro}.")),
        case("fancyhdr-headheight", "headheight", "\\documentclass[12pt]{article}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\begin{document}\nTexte.\n\\end{document}\n".into()),
        case("hyperref-math-title", "pdf-string", doc("\\usepackage{hyperref}", "\\section{La fonction $f$}\nTexte.")),
        case("verb-in-argument", "verb-in-argument", doc("", "\\section{Le code \\verb|x = 1|}\nTexte.")),
        case("newline-blank-line", "underfull-box", doc("", "Une ligne terminée par un saut\\\\\n\nNouveau paragraphe.")).badboxes(),
        case("url-too-long", "overfull-box", doc("\\usepackage{url}", "Adresse : \\url{https://www.example.com/un/chemin/vraiment/tres/tres/long/qui/ne/tient/pas/sur/la/ligne/index.html}.")).badboxes(),
        case("illegal-unit", "illegal-unit", doc("", "Texte.\n\\vspace{2}\nSuite.")),
        // The new file is empty: the document has no page until it is written.
        case("include-missing", "file-not-found", doc("", "\\input{chapitres/intro}")).allow(&["no-output"]),
        // ------------------------------- live checks (before compiling)
        case("live-brace", "syntax", doc("", "Du texte \\textbf{en gras\n\nSuite.")).live(),
        case("live-env-mismatch", "syntax", doc("", "\\begin{itemize}\n\\item Un\n\\end{enumerate}")).live(),
        case("live-env-unclosed", "syntax", doc("", "\\begin{center}\nCentré.\n\nFin.")).live(),
        case("live-extra-end", "syntax", doc("", "Texte.\n\\end{center}\nSuite.")).live(),
        case("live-display-unclosed", "syntax", doc("", "\\[\na + b = c\n\nSuite.")).live(),
        case("live-display-blank", "syntax", doc("\\usepackage{amsmath}", "\\begin{equation}\na + b\n\nc\n\\end{equation}")).live(),
        case("live-dollar-unclosed", "syntax", doc("", "Soit $x = 1 un réel.\n\nSuite.")).live(),
        case("live-close-alone", "syntax", doc("", "Texte \\] suite.")).live(),
        case("live-duplicate-label", "duplicate-label", doc("", "\\section{A}\\label{sec:a}\n\\section{B}\\label{sec:a}")).live(),
        case("live-missing-image", "missing-image", doc("\\usepackage{graphicx}", "\\includegraphics[width=3cm]{images/phot}")).with("images/photo.png", "").live(),
        case("live-missing-input", "missing-file", doc("", "\\input{chapitre}")).with("chapitres.tex", "Texte du chapitre.\n").live(),
        case("live-duplicate-package", "duplicate-package", doc("\\usepackage{amsmath}\n\\usepackage{amsmath}", "$a$")).live(),
        case("live-label-before-caption", "label-before-caption", doc("\\usepackage{graphicx}", "\\begin{figure}\n\\centering\n\\includegraphics[width=3cm]{example-image}\n\\label{fig:a}\n\\caption{Une image}\n\\end{figure}\nVoir~\\ref{fig:a}.")).live(),
        case("live-hyperref-order", "package-order", doc("\\usepackage{hyperref}\n\\usepackage{xcolor}", "Texte.")).live(),
        case("live-cleveref-order", "package-order", doc("\\usepackage{cleveref}\n\\usepackage{hyperref}", "\\section{A}\\label{sec-a}\nVoir \\cref{sec-a}.")).live(),
        case("live-paragraph-break", "paragraph-break", doc("", "Une ligne\\\\\n\nSuite.")).live(),
    ]
}

// ------------------------------------------------------------ harness

fn distribution() -> Distribution {
    raytex_core::tex::detect(&[])
        .into_iter()
        .next()
        .expect("no TeX distribution")
}

struct Built {
    diagnostics: Vec<Diagnostic>,
    success: bool,
}

/// The analyzer of the installed packages, made once for all the cases.
fn analyzer(dist: &Distribution) -> Arc<PackageAnalyzer> {
    static ANALYZER: OnceLock<Arc<PackageAnalyzer>> = OnceLock::new();
    ANALYZER
        .get_or_init(|| Arc::new(PackageAnalyzer::new(Arc::new(TexmfIndex::build(dist)))))
        .clone()
}

/// Compiles the project like the application does, then adds the live checks.
fn compile(dist: &Distribution, index: &TexmfIndex, main: &Path, badboxes: bool) -> Built {
    let dir = main.parent().unwrap();
    let ws = Workspace::open(dir);
    let root = ws.root_for(main);
    let docs = ws.project_documents(&root);
    let facts = DocumentFacts::from_indexes(docs.iter().map(|d| &d.index));
    let settings = BuildSettings {
        show_badboxes: badboxes,
        precompile_preamble: false,
        ..ws.config.effective_build(&BuildSettings::default())
    };
    let plan = build::plan(&root, &settings, Some(dist), &facts, Lang::Fr).expect("plan");
    let cancel = AtomicBool::new(false);
    let source = |p: &Path| std::fs::read_to_string(p).ok();
    // Like the application: what a package defines is read in its source.
    let packages = || Some(analyzer(dist));
    let ctx = RunContext {
        dist,
        settings: &settings,
        cancel: &cancel,
        lang: Lang::Fr,
        source: &source,
        packages: Some(&packages),
        background: false,
    };
    let outcome = build::run(&plan, &ctx, &mut |_: BuildEvent| {});
    let mut diagnostics = outcome.diagnostics;
    // Live checks, with the auxiliary data of the build (labels, citations).
    let mut ws = Workspace::open(dir);
    let aux = raytex_core::auxfile::read(
        &plan.out_dir,
        &plan.out_dir.join(format!("{}.aux", plan.job)),
    );
    ws.set_aux(&root, aux);
    let files: Vec<PathBuf> = ws.documents().map(|d| d.path.clone()).collect();
    let checks = |installed: &TexmfIndex| {
        let opts = LintOptions {
            lang: Lang::Fr,
            style_hints: true,
            installed: Some(installed),
            ..Default::default()
        };
        files
            .iter()
            .flat_map(|f| lint::lint(&ws, f, &opts))
            .collect::<Vec<_>>()
    };
    let mut live = checks(index);
    // MiKTeX installed packages during the build: the application reads
    // the installed files again after such a build, and so does the test.
    if dist.kind == raytex_core::tex::DistroKind::MikTex
        && outcome.success
        && live
            .iter()
            .any(|d| d.code.as_deref() == Some("missing-package"))
    {
        live = checks(&TexmfIndex::build(dist));
    }
    diagnostics.extend(live);
    Built {
        diagnostics,
        success: outcome.success,
    }
}

fn describe(d: &Diagnostic) -> String {
    let place = match (&d.file, d.range, d.line) {
        (Some(f), Some(r), _) => format!(
            "{}:{}:{}-{}:{}",
            f.file_name().unwrap().to_string_lossy(),
            r.start.line + 1,
            r.start.character + 1,
            r.end.line + 1,
            r.end.character + 1
        ),
        (Some(f), None, Some(l)) => format!("{}:{l}", f.file_name().unwrap().to_string_lossy()),
        (Some(f), None, None) => f.file_name().unwrap().to_string_lossy().into_owned(),
        _ => "-".into(),
    };
    format!(
        "{:?}/{:?} [{}] {place}: {}{}{}{}",
        d.severity,
        d.source,
        d.code.as_deref().unwrap_or("?"),
        d.message,
        d.context_before
            .as_ref()
            .map(|c| format!("\n      before: {c:?}"))
            .unwrap_or_default(),
        d.context_after
            .as_ref()
            .map(|c| format!(" after: {c:?}"))
            .unwrap_or_default(),
        d.hint
            .as_ref()
            .and_then(|h| h.advice.as_ref())
            .map(|a| format!("\n      advice: {a}"))
            .unwrap_or_default()
            + &d.fixes
                .iter()
                .map(|f| format!("\n      fix: {}", serde_json::to_string(f).unwrap()))
                .collect::<String>()
    )
}

/// Problems that matter after a fix: errors and warnings (bad boxes only
/// when the case is about them).
/// `code` may list the codes of several versions of a package: `a|b`.
fn has_code(d: &Diagnostic, code: &str) -> bool {
    d.code
        .as_deref()
        .is_some_and(|c| code.split('|').any(|x| x == c))
}

fn remaining<'a>(built: &'a Built, case: &Case) -> Vec<&'a Diagnostic> {
    built
        .diagnostics
        .iter()
        .filter(|d| {
            (d.severity <= Severity::Warning || has_code(d, case.code))
                && !case
                    .allow_after
                    .iter()
                    .any(|a| d.code.as_deref() == Some(*a))
        })
        .collect()
}

fn write_case(dir: &Path, case: &Case) -> PathBuf {
    let main = dir.join("main.tex");
    std::fs::write(&main, &case.main).unwrap();
    for (path, text) in &case.files {
        let p = dir.join(path);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        if path.ends_with(".png") {
            // A real image: the one of the mwe package.
            let src = std::process::Command::new("kpsewhich")
                .arg("example-image-a.png")
                .output()
                .unwrap();
            let src = String::from_utf8_lossy(&src.stdout).trim().to_owned();
            std::fs::copy(src, &p).unwrap();
        } else {
            std::fs::write(&p, text).unwrap();
        }
    }
    main
}

/// Runs one case; returns a report line and whether it passed.
fn run_case(dist: &Distribution, index: &TexmfIndex, case: &Case, probe: bool) -> (String, bool) {
    let dir = tempfile::tempdir().unwrap();
    let main = write_case(dir.path(), case);
    let before = compile(dist, index, &main, case.badboxes);
    if probe {
        let mut out = format!("\n=== {} (success: {})\n", case.name, before.success);
        for d in &before.diagnostics {
            out.push_str(&format!("  {}\n", describe(d)));
        }
        return (out, true);
    }
    // The occurrence that has a fix (the first of two duplicate labels keeps its name).
    let matching: Vec<&Diagnostic> = before
        .diagnostics
        .iter()
        .filter(|d| has_code(d, case.code) && case.from.is_none_or(|s| d.source == s))
        .collect();
    let Some(d) = matching
        .iter()
        .find(|d| d.fixes.iter().any(fixes::is_automatic))
        .or(matching.first())
        .copied()
    else {
        let all: Vec<String> = before.diagnostics.iter().map(describe).collect();
        return (
            format!(
                "✘ {}: no `{}` diagnostic\n  {}",
                case.name,
                case.code,
                all.join("\n  ")
            ),
            false,
        );
    };
    // Explained: what the message means, or better, the cause found.
    if d.hint
        .as_ref()
        .is_none_or(|h| h.explanation.is_empty() && h.advice.is_none())
    {
        return (
            format!("✘ {}: no explanation for {}", case.name, describe(d)),
            false,
        );
    }
    let Some(fix) = d.fixes.iter().find(|f| fixes::is_automatic(f)) else {
        return (
            format!("✘ {}: no automatic fix for {}", case.name, describe(d)),
            false,
        );
    };
    let read = |p: &Path| std::fs::read_to_string(p).ok();
    let changes = match fixes::apply(fix, d, &main, &read) {
        Ok(c) => c,
        Err(e) => {
            return (
                format!("✘ {}: fix failed ({e}) for {}", case.name, describe(d)),
                false,
            );
        }
    };
    for (path, text) in &changes {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }
    let mut after = compile(dist, index, &main, case.badboxes);
    // MiKTeX may fail to fetch a package from its repository (network,
    // mirror): one more try before calling the fix wrong.
    if dist.kind == raytex_core::tex::DistroKind::MikTex
        && after
            .diagnostics
            .iter()
            .any(|d| d.code.as_deref() == Some("engine-no-log"))
    {
        std::thread::sleep(std::time::Duration::from_secs(10));
        after = compile(dist, index, &main, case.badboxes);
    }
    let left = remaining(&after, case);
    let title = fixes::title(fix, Lang::Fr);
    let empty_allowed = case.allow_after.contains(&"no-output");
    if (!after.success && !empty_allowed) || !left.is_empty() {
        let text = std::fs::read_to_string(&main).unwrap();
        return (
            format!(
                "✘ {}: still wrong after « {title} » (success: {})\n  {}\n--- main.tex\n{text}",
                case.name,
                after.success,
                left.iter()
                    .map(|d| describe(d))
                    .collect::<Vec<_>>()
                    .join("\n  ")
            ),
            false,
        );
    }
    (
        format!("✔ {:<24} {:<28} → {title}", case.name, case.code),
        true,
    )
}

#[test]
#[ignore = "depends on the local TeX installation"]
fn common_mistakes_are_explained_and_fixed() {
    let dist = distribution();
    let index = TexmfIndex::build(&dist);
    let probe = std::env::var_os("LBT_PROBE").is_some();
    let only = std::env::var("LBT_CASE").ok();
    let cases: Vec<Case> = cases()
        .into_iter()
        .filter(|c| only.as_deref().is_none_or(|o| c.name.contains(o)))
        .collect();
    let next = Mutex::new(0usize);
    let results = Mutex::new(Vec::new());
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
    std::thread::scope(|s| {
        for _ in 0..threads {
            s.spawn(|| {
                loop {
                    let i = {
                        let mut n = next.lock().unwrap();
                        let i = *n;
                        *n += 1;
                        i
                    };
                    let Some(case) = cases.get(i) else { break };
                    let r = run_case(&dist, &index, case, probe);
                    results.lock().unwrap().push((i, r));
                }
            });
        }
    });
    let mut results = results.into_inner().unwrap();
    results.sort_by_key(|(i, _)| *i);
    let failed: Vec<&String> = results
        .iter()
        .filter(|(_, (_, ok))| !ok)
        .map(|(_, (l, _))| l)
        .collect();
    for (_, (line, _)) in &results {
        println!("{line}");
    }
    println!(
        "\n{} / {} cases fixed",
        results.len() - failed.len(),
        results.len()
    );
    assert!(failed.is_empty(), "{} cases failed", failed.len());
}

/// A mistake whose cause is in the sources: what must be shown (the text
/// of the range of the diagnostic) and what the advice must say.
struct Located {
    name: &'static str,
    code: &'static str,
    main: String,
    /// The text the diagnostic is placed on.
    shown: &'static str,
    /// A part of the advice; `None` when nothing may be said about the
    /// cause, because it cannot be told.
    advice: Option<&'static str>,
}

fn located(
    name: &'static str,
    code: &'static str,
    main: String,
    shown: &'static str,
    advice: Option<&'static str>,
) -> Located {
    Located {
        name,
        code,
        main,
        shown,
        advice,
    }
}

fn located_cases() -> Vec<Located> {
    let table = |rows: &str| format!("\\begin{{tabular}}{{ll}}\n{rows}\n\\end{{tabular}}");
    vec![
        // ------------------------------ a number or a length was expected
        located(
            "length-words",
            "missing-number",
            doc("", "Avant.\n\\vspace{abc}\nAprès."),
            "abc",
            Some("`\\vspace` attend une longueur"),
        ),
        located(
            "length-empty",
            "missing-number",
            doc("", "Avant\\hspace{}après."),
            "{}",
            Some("mais rien n'est écrit"),
        ),
        located(
            "length-second-argument",
            "missing-number",
            doc("", "\\rule{abc}{1pt}"),
            "abc",
            Some("`\\rule` attend une longueur"),
        ),
        located(
            "length-of-setlength",
            "missing-number",
            doc("", "\\setlength{\\parindent}{beaucoup} Texte."),
            "beaucoup",
            Some("`\\setlength` attend une longueur"),
        ),
        located(
            "length-of-parbox",
            "missing-number",
            doc("", "\\parbox{large}{Texte}"),
            "large",
            Some("`\\parbox`"),
        ),
        located(
            "length-of-raisebox",
            "missing-number",
            doc("", "\\raisebox{haut}{x}"),
            "haut",
            Some("`\\raisebox`"),
        ),
        located(
            "length-of-minipage",
            "missing-number",
            doc("", "\\begin{minipage}{large}\nTexte\n\\end{minipage}"),
            "large",
            Some("`\\begin{minipage}` attend une longueur"),
        ),
        located(
            "length-of-option",
            "missing-number",
            doc(
                "\\usepackage{graphicx}",
                "\\includegraphics[width=large]{example-image}",
            ),
            "large",
            Some("L'option `width` de `\\includegraphics`"),
        ),
        located(
            "length-after-primitive",
            "missing-number",
            doc("", "A\\kern abc B"),
            "abc",
            Some("`\\kern` attend une longueur"),
        ),
        located(
            "column-width-empty",
            "missing-number",
            doc("", "\\begin{tabular}{p{}}\na \\\\\n\\end{tabular}"),
            "p{}",
            Some("La colonne `p{…}` du tableau"),
        ),
        located(
            "counter-words",
            "missing-number",
            doc("", "\\setcounter{page}{abc} Texte."),
            "abc",
            Some("`\\setcounter` attend un nombre entier"),
        ),
        located(
            "counter-added-words",
            "missing-number",
            doc("", "\\addtocounter{section}{un} Texte."),
            "un",
            Some("`\\addtocounter` attend un nombre entier"),
        ),
        located(
            "columns-words",
            "missing-number",
            doc("", &table("\\multicolumn{deux}{c}{a} \\\\")),
            "deux",
            Some("`\\multicolumn` attend un nombre entier"),
        ),
        located(
            "break-words",
            "missing-number",
            doc("", "Texte\\linebreak[beaucoup] suite."),
            "beaucoup",
            Some("`\\linebreak` attend un nombre entier"),
        ),
        located(
            "bracket-after-newline",
            "missing-number",
            doc("", &table("a & b \\\\\n[note] c & d \\\\")),
            "[note]",
            Some("Le crochet qui suit `\\\\`"),
        ),
        located(
            "bracket-after-newline-same-line",
            "missing-number",
            doc("", &table("a & b \\\\ [note] c & d \\\\")),
            "[note]",
            Some("Le crochet qui suit `\\\\`"),
        ),
        // A command of the document: its definition is not read, nothing is guessed.
        located(
            "length-in-own-command",
            "missing-number",
            doc(
                "\\newcommand{\\espace}[1]{\\vspace{#1}}",
                "Avant.\n\\espace{abc}\nAprès.",
            ),
            "\\espace{abc}",
            None,
        ),
        // ------------------------------------------------------- too large
        located(
            "number-too-big",
            "number-too-big",
            doc("", "\\setcounter{page}{99999999999} Texte."),
            "99999999999",
            Some("2 147 483 647"),
        ),
        located(
            "length-too-large",
            "dimension-too-large",
            doc("", "Avant.\n\\vspace{99999cm}\nAprès."),
            "99999cm",
            Some("575,83 cm"),
        ),
        // ------------------------------------------------------------ units
        located(
            "unit-missing",
            "illegal-unit",
            doc("", "Avant.\n\\vspace{2}\nAprès."),
            "2",
            Some("n'a pas d'unité"),
        ),
        located(
            "unit-decimal-comma",
            "keyval-undefined",
            doc(
                "\\usepackage{graphicx}",
                "\\includegraphics[width=2,5cm]{example-image}",
            ),
            "2,5cm",
            Some("la virgule sépare les options"),
        ),
        // ------------------------------------------------ other mistakes
        located(
            "command-typo",
            "undefined-control-sequence",
            doc("", "Du texte en \\textbff{gras}."),
            "\\textbff",
            Some("Vouliez-vous écrire `\\textbf`"),
        ),
        located(
            "command-unknown",
            "undefined-control-sequence",
            doc("", "Du texte \\zzzqqq ici."),
            "\\zzzqqq",
            None,
        ),
        located(
            "underscore-in-text",
            "missing-dollar",
            doc("", "Le fichier mon_fichier est prêt."),
            "_",
            Some("n'existe que dans une formule"),
        ),
        located(
            "math-command-in-text",
            "missing-dollar",
            doc("", "Un angle \\alpha petit."),
            "\\alpha",
            Some("`\\alpha` n'existe que dans une formule"),
        ),
        located(
            "ampersand-in-text",
            "misplaced-alignment-tab",
            doc("", "Dupont & fils."),
            "&",
            Some("une esperluette s'écrit `\\&`"),
        ),
        located(
            "too-many-cells",
            "extra-alignment-tab",
            doc("", &table("a & b & c \\\\")),
            "&",
            Some("3 cellules, et le tableau 2 colonnes"),
        ),
        located(
            "label-typo",
            "undefined-reference",
            doc("", "\\section{A}\\label{sec:intro}\nVoir \\ref{sec:intr}."),
            "sec:intr",
            Some("le plus proche est `sec:intro`"),
        ),
        located(
            "renew-unknown",
            "renew-undefined",
            doc("\\renewcommand{\\nouveau}{x}", "\\nouveau"),
            "\\renewcommand",
            Some("`\\nouveau` n'existe pas encore"),
        ),
        located(
            "name-with-at",
            "wrong-mode",
            doc("", "\\@ifundefined{chapter}{a}{b}"),
            "\\@ifundefined",
            Some("contient `@`"),
        ),
        located(
            "image-format",
            "unknown-graphics-extension",
            doc("\\usepackage{graphicx}", "\\includegraphics{dessin.svg}"),
            "dessin.svg",
            Some("ne lit pas les images `.svg`"),
        ),
        located(
            "command-calls-itself",
            "capacity-exceeded",
            doc("\\newcommand{\\boucle}{a\\boucle b}", "\\boucle"),
            "\\boucle",
            Some("s'utilise elle-même"),
        ),
    ]
}

/// Mistakes as people report them on forums. Whatever message TeX gives for
/// them (the case names none), the engine must find what is wrong in the
/// source by itself: one problem, on the text to change, with its cause.
fn forum_cases() -> Vec<Located> {
    let table = |rows: &str| format!("\\begin{{tabular}}{{ll}}\n{rows}\n\\end{{tabular}}");
    let any = "";
    vec![
        // ----------------------------------------------------------- formulas
        located(
            "dollar-in-equation",
            any,
            doc(
                "",
                "Avant.\n\\begin{equation}$ a = b $\\end{equation}\nAprès.",
            ),
            "$",
            Some("Ce `$` est dans `equation`, qui est déjà une formule : il n'en faut pas ici."),
        ),
        located(
            "display-closed-by-one-dollar",
            any,
            doc("", "Avant.\n$$ a = b $\nAprès."),
            "$",
            Some("La formule ouverte par `$$` ligne 4 est fermée ici par un seul `$`."),
        ),
        located(
            "fraction-in-text",
            any,
            doc("", "Soit \\frac{1}{2} la moitié."),
            "\\frac",
            Some("`\\frac` n'existe que dans une formule, et celui-ci est dans du texte."),
        ),
        located(
            "inline-math-never-closed",
            any,
            doc("", "Soit $a = b un réel.\n\nSuite."),
            "$",
            Some("La formule ouverte par ce `$` n'est pas refermée avant la fin du paragraphe."),
        ),
        located(
            "blank-line-in-display",
            any,
            doc("", "\\[\na = b\n\nc = d\n\\]"),
            "\\[",
            Some("Une ligne vide coupe cette formule : elle termine le paragraphe, et TeX ferme"),
        ),
        located(
            "equation-in-inline-math",
            any,
            doc("", "Texte $ \\begin{equation} a \\end{equation} $ suite."),
            "\\begin{equation}",
            Some("Ce `\\begin{equation}` ouvre une formule à l'intérieur d'une formule déjà"),
        ),
        located(
            "matrix-outside-math",
            any,
            doc(
                "\\usepackage{amsmath}",
                "Voici \\begin{pmatrix} a \\\\ b \\end{pmatrix} ici.",
            ),
            "\\begin{pmatrix}",
            Some("`\\begin{pmatrix}` n'existe que dans une formule, et celui-ci est dans du"),
        ),
        located(
            "aligned-outside-math",
            any,
            doc(
                "\\usepackage{amsmath}",
                "\\begin{aligned} a &= b \\end{aligned}",
            ),
            "\\begin{aligned}",
            Some("`\\begin{aligned}` n'existe que dans une formule, et celui-ci est dans du"),
        ),
        located(
            "left-without-delimiter",
            any,
            doc("", "$\\left a + b \\right)$"),
            "a",
            Some("`\\left` doit être suivi d'un délimiteur (`(`, `[`, `\\{`, `|`, ou `.` pour"),
        ),
        located(
            "display-in-display",
            any,
            doc("", "\\[ a \\[ b \\] \\]"),
            "\\[",
            Some("Ce `\\[` ouvre une formule à l'intérieur d'une formule déjà ouverte."),
        ),
        located(
            "brace-missing-in-math",
            any,
            doc("", "Soit $\\sqrt{2$ ici.\n\nSuite."),
            "{",
            Some("Cette `{` n'est jamais refermée."),
        ),
        located(
            "frac-one-argument",
            any,
            doc("", "Soit $\\frac{1}$ ici."),
            "\\frac{1}",
            Some("`\\frac` s'écrit `\\frac{numérateur}{dénominateur}` : il manque l'argument"),
        ),
        located(
            "dollar-as-currency",
            any,
            doc("", "Le prix est de 10$ seulement.\n\nSuite."),
            "$",
            Some("Ce `$` ouvre une formule qui n'est jamais fermée. Pour écrire le signe"),
        ),
        located(
            "text-command-in-math",
            any,
            doc("", "$a \\textbf{b} \\item c$"),
            "\\item",
            Some("`\\item` ne fonctionne que dans du texte, et celui-ci est dans une formule."),
        ),
        // ------------------------------------------------------------- braces
        located(
            "brace-never-closed",
            any,
            doc("", "Du \\textbf{gras\n\nSuite du texte."),
            "\\textbf{",
            Some("L'accolade ouverte ici n'est jamais refermée."),
        ),
        located(
            "brace-too-many",
            any,
            doc("", "Du texte } en trop."),
            "}",
            Some("Cette `}` ne ferme aucune `{`."),
        ),
        located(
            "brace-open-at-end",
            any,
            doc("", "\\section{Titre\nTexte."),
            "\\section{",
            Some("L'accolade ouverte ici n'est jamais refermée."),
        ),
        located(
            "group-closed-in-environment",
            any,
            doc("", "{\\begin{center} Texte } \\end{center}"),
            "}",
            Some("Cette `}` ferme le groupe ouvert ligne 3 alors que `\\begin{center}` est"),
        ),
        // ------------------------------------------------------- environments
        located(
            "environment-never-closed",
            any,
            doc("", "\\begin{center}\nTexte.\n"),
            "\\begin{center}",
            Some("Ce `\\begin{center}` n'est jamais fermé par `\\end{center}`."),
        ),
        located(
            "end-without-begin",
            any,
            doc("", "Texte.\n\\end{center}\nSuite."),
            "\\end{center}",
            Some("Ce `\\end{center}` ne ferme aucun `\\begin{center}`."),
        ),
        located(
            "float-in-minipage",
            any,
            doc(
                "",
                "\\begin{minipage}{5cm}\n\\begin{figure}\nx\n\\end{figure}\n\\end{minipage}",
            ),
            "\\begin{figure}",
            Some("Ce `figure` est dans `minipage` (ligne 3) : un flottant ne peut pas être"),
        ),
        located(
            "tabular-without-columns",
            any,
            doc("", "\\begin{tabular}\na & b \\\\\n\\end{tabular}"),
            "\\begin{tabular}",
            Some("`\\begin{tabular}` s'écrit `\\begin{tabular}{colonnes}` : il manque son"),
        ),
        located(
            "multicolumn-two-arguments",
            any,
            doc("", &table("\\multicolumn{2}{c} \\\\")),
            "\\multicolumn{2}{c}",
            Some("`\\multicolumn` s'écrit `\\multicolumn{colonnes}{alignement}{texte}` : il"),
        ),
        located(
            "rule-not-after-row",
            any,
            doc("", &table("a & b \\hline")),
            "\\hline",
            Some("La ligne du tableau avant ce `\\hline` ne se termine pas par `\\\\` : un filet"),
        ),
        located(
            "too-many-nested-lists",
            any,
            doc(
                "",
                "\\begin{itemize}\\item a\\begin{itemize}\\item b\\begin{itemize}\\item c\\begin{itemize}\\item d\\begin{itemize}\\item e\\end{itemize}\\end{itemize}\\end{itemize}\\end{itemize}\\end{itemize}",
            ),
            "\\begin{itemize}",
            Some("Cette liste est la 5ᵉ imbriquée ; LaTeX s'arrête à quatre du même type."),
        ),
        located(
            "rule-one-argument",
            any,
            doc("", "\\rule{1cm} Texte."),
            "\\rule{1cm}",
            Some("Il manque un argument à `\\rule` : à la place d'une longueur (un nombre et une"),
        ),
        // ---------------------------------------------------------------- names
        located(
            "color-in-french",
            any,
            doc("\\usepackage{xcolor}", "\\textcolor{rouge}{Texte}"),
            "rouge",
            Some("Vouliez-vous écrire `red` ?"),
        ),
        located(
            "counter-typo",
            any,
            doc("", "\\setcounter{sectoin}{1} Texte."),
            "sectoin",
            Some("Vouliez-vous écrire `section` ?"),
        ),
        located(
            "pagestyle-typo",
            any,
            doc("", "\\pagestyle{emtpy} Texte."),
            "emtpy",
            Some("`\\pagestyle` ne connaît pas `emtpy`. Vouliez-vous écrire `empty` ?"),
        ),
        located(
            "class-typo",
            any,
            "\\documentclass{artcle}\n\\begin{document}\nTexte.\n\\end{document}\n".into(),
            "artcle",
            Some("Vouliez-vous écrire `article` ?"),
        ),
        located(
            "tikz-library-typo",
            any,
            doc("\\usepackage{tikz}\n\\usetikzlibrary{arrow.meta}", "Texte."),
            "arrow.meta",
            Some("Vouliez-vous écrire `arrows.meta` ?"),
        ),
        located(
            "tikz-node-typo",
            any,
            doc(
                "\\usepackage{tikz}",
                "\\begin{tikzpicture}\n\\node (debut) at (0,0) {A};\n\\draw (debut) -- (debu);\n\\end{tikzpicture}",
            ),
            "debu",
            Some("Vouliez-vous écrire `debut` ?"),
        ),
        located(
            "label-with-command",
            any,
            doc("", "\\section{A}\\label{sec:\\alpha}\nTexte."),
            "\\alpha",
            Some("L'argument de `\\label` est un nom : il ne peut pas contenir la commande"),
        ),
        located(
            "windows-path-in-text",
            any,
            doc("", "Le fichier C:\\Users\\nom\\doc est ici."),
            "C:\\Users\\nom\\doc",
            Some(
                "`C:\\Users\\nom\\doc` est un chemin : LaTeX lit chacun de ses `\\` comme le début",
            ),
        ),
        // ------------------------------------------------------- definitions
        located(
            "definition-existing",
            any,
            doc("\\newcommand{\\alpha}{a}", "Texte."),
            "\\newcommand",
            Some("`\\alpha` existe déjà : `\\newcommand` refuse de le remplacer, `\\renewcommand`"),
        ),
        located(
            "parameter-not-declared",
            any,
            doc("\\newcommand{\\double}{#1#1}", "\\double{a}"),
            "\\newcommand{\\double}",
            Some("La définition de `\\double` utilise `#1` et déclare 0 argument(s)."),
        ),
        located(
            "verb-in-title",
            any,
            doc("", "\\section{Le code \\verb|x|}\nTexte."),
            "\\verb|x|",
            Some("Ce `\\verb` est dans l'argument d'une autre commande, où il ne peut pas lire"),
        ),
        located(
            "usepackage-in-body",
            any,
            doc("", "\\usepackage{amsmath}\nTexte."),
            "\\usepackage",
            Some("Ce `\\usepackage` vient après `\\begin{document}` (ligne 2) : il ne s'emploie"),
        ),
        located(
            "percent-eats-brace",
            any,
            doc("", "Une remise de \\textbf{50% de réduction}\n\nSuite."),
            "\\textbf{",
            Some("Le `%` de cette ligne met la fin de la ligne en commentaire, avec la `}` qui"),
        ),
        located(
            "length-brace-never-closed",
            any,
            doc("", "Avant\\hspace{1cm après.\n\nSuite."),
            "\\hspace{",
            Some("L'accolade ouverte ici n'est jamais refermée."),
        ),
        located(
            "register-without-unit",
            any,
            doc("\\parindent=10", "Texte."),
            "10",
            Some("`\\parindent` attend une longueur, et `10` n'a pas d'unité (`cm`, `mm`, `pt`,"),
        ),
        // ------------------------------------------- more of the same kinds
        located(
            "sqrt-in-text",
            any,
            doc("", "La racine \\sqrt{2} vaut environ 1,41."),
            "\\sqrt",
            Some("`\\sqrt` n'existe que dans une formule, et celui-ci est dans du texte."),
        ),
        located(
            "sum-in-text",
            any,
            doc("", "La somme \\sum_{i=1}^n i est connue."),
            "\\sum",
            Some("`\\sum` n'existe que dans une formule, et celui-ci est dans du texte."),
        ),
        located(
            "hat-in-text",
            any,
            doc("", "L'angle \\hat{A} est droit."),
            "\\hat",
            Some("`\\hat` n'existe que dans une formule, et celui-ci est dans du texte."),
        ),
        located(
            "underscore-in-texttt",
            any,
            doc("", "Le fichier \\texttt{mon_fichier} est prêt."),
            "_",
            Some("`_` n'existe que dans une formule, et celui-ci est dans le texte de `\\texttt`."),
        ),
        located(
            "brace-in-footnote",
            any,
            doc("", "Texte\\footnote{Une note\n\nSuite du texte."),
            "\\footnote{",
            Some("L'accolade ouverte ici n'est jamais refermée."),
        ),
        located(
            "end-without-brace",
            any,
            doc("", "\\begin{itemize}\n\\item a\n\\end{itemize\n\nSuite."),
            "\\end{",
            Some("L'accolade ouverte ici n'est jamais refermée."),
        ),
        located(
            "graphics-without-file",
            any,
            doc(
                "\\usepackage{graphicx}",
                "\\includegraphics[width=3cm]\n\nSuite.",
            ),
            "\\includegraphics[width=3cm]",
            Some("`\\includegraphics` s'écrit `\\includegraphics[options]{fichier}` : il manque"),
        ),
        located(
            "href-one-argument",
            any,
            doc(
                "\\usepackage{hyperref}",
                "Voir \\href{https://ctan.org}\n\nSuite.",
            ),
            "\\href{https://ctan.org}",
            Some("`\\href` s'écrit `\\href{adresse}{texte}` : il manque l'argument `{texte}`."),
        ),
        located(
            "ref-in-label",
            any,
            doc("", "\\section{A}\\label{sec:\\ref{a}}\nTexte."),
            "\\ref",
            Some("L'argument de `\\label` est un nom : il ne peut pas contenir la commande"),
        ),
        located(
            "cases-outside-math",
            any,
            doc(
                "\\usepackage{amsmath}",
                "Soit \\begin{cases} a \\\\ b \\end{cases} ici.",
            ),
            "\\begin{cases}",
            Some("`\\begin{cases}` n'existe que dans une formule, et celui-ci est dans du texte."),
        ),
        located(
            "dollar-in-align",
            any,
            doc(
                "\\usepackage{amsmath}",
                "\\begin{align}\n$a$ &= b\n\\end{align}",
            ),
            "$",
            Some("Ce `$` est dans `align`, qui est déjà une formule : il n'en faut pas ici."),
        ),
        located(
            "blank-line-in-align",
            any,
            doc(
                "\\usepackage{amsmath}",
                "\\begin{align}\na &= b\n\nc &= d\n\\end{align}",
            ),
            "",
            Some("Une ligne vide coupe cette formule : elle termine le paragraphe, et TeX ferme"),
        ),
        located(
            "multicols-without-number",
            any,
            doc(
                "\\usepackage{multicol}",
                "\\begin{multicols}\nTexte\n\\end{multicols}",
            ),
            "\\begin{multicols}",
            Some("`\\begin{multicols}` s'écrit `\\begin{multicols}{colonnes}` : il manque son"),
        ),
        located(
            "minipage-without-width",
            any,
            doc("", "\\begin{minipage}\nTexte\n\\end{minipage}"),
            "\\begin{minipage}",
            Some("`\\begin{minipage}` s'écrit `\\begin{minipage}[position]{largeur}` : il manque"),
        ),
        located(
            "unit-in-words",
            any,
            doc("", "Avant\\hspace{2 centimetres}après."),
            "centimetres",
            Some("`centimetres` n'est pas une unité que TeX connaît (`pt`, `cm`, `mm`, `in`,"),
        ),
        located(
            "begin-document-twice",
            any,
            doc("", "Texte.\n\\begin{document}\nSuite."),
            "\\begin{document}",
            Some("Le document a déjà commencé ligne 2 : ce second `\\begin{document}` est en"),
        ),
        located(
            "cell-with-ampersand",
            any,
            doc("", "\\begin{tabular}{l}\nR&D \\\\\n\\end{tabular}"),
            "&",
            Some("Cette ligne a 2 cellules, et le tableau 1 colonnes (`{l}`)."),
        ),
        located(
            "item-in-text",
            any,
            doc("", "Voici :\n\\item un point"),
            "\\item",
            Some("Ce `\\item` n'est dans aucune liste."),
        ),
        located(
            "textbf-across-paragraphs",
            any,
            doc("", "\\textbf{Premier paragraphe.\n\nSecond paragraphe.}"),
            "\\textbf{",
            Some("L'argument de `\\textbf` contient une ligne vide (ligne 4) : cette commande"),
        ),
        located(
            "center-closed-as-centre",
            any,
            doc("", "\\begin{center}\nTexte\n\\end{centre}"),
            "\\end{centre}",
            Some("`\\end{centre}` ferme `\\begin{center}`, ouvert ligne 3."),
        ),
        located(
            "right-without-left",
            any,
            doc("", "$a + b \\right)$"),
            "$",
            Some("`\\left` et `\\right` ne sont pas appariés dans cette formule (`\\right.` ferme"),
        ),
        located(
            "subscript-twice",
            any,
            doc("", "$a_i_j$"),
            "a_i_j",
            Some("Deux indices (`_`) se suivent sur `a` : TeX ne sait pas s'il faut lire"),
        ),
        located(
            "pagenumbering-typo",
            any,
            doc("", "\\pagenumbering{romain}\nTexte."),
            "romain",
            Some("`\\pagenumbering` ne connaît pas `romain`. Vouliez-vous écrire `roman` ?"),
        ),
    ]
}

/// What the knowledge base does not describe: the macros of the document
/// and packages read in the distribution (marginnote, fancybox, paralist,
/// stmaryrd, units, lineno, ntheorem are not in it). Their mistakes are
/// explained the same way, from what their definitions say.
fn dynamic_cases() -> Vec<Located> {
    let any = "";
    vec![
        // ------------------------------------------- macros of the document
        located(
            "own-macro-of-formulas-in-text",
            any,
            doc(
                "\\usepackage{amssymb}\n\\newcommand{\\R}{\\mathbb{R}}",
                "Soit \\R l'ensemble des réels.",
            ),
            "\\R",
            Some("`\\R` est défini avec `\\mathbb`, qui n'existe que dans une formule"),
        ),
        located(
            "own-nested-macro-in-text",
            any,
            doc(
                "\\usepackage{amssymb}\n\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\plan}{\\R^2}",
                "Dans le \\plan, un point.",
            ),
            "\\plan",
            Some("`\\plan` est défini avec `\\R`, qui n'existe que dans une formule"),
        ),
        located(
            "own-operator-in-text",
            any,
            doc(
                "\\usepackage{amsmath}\n\\DeclareMathOperator{\\argmax}{argmax}",
                "Le \\argmax de la fonction.",
            ),
            "\\argmax",
            Some("`\\argmax` n'existe que dans une formule, et celui-ci est dans du texte."),
        ),
        located(
            "own-macro-missing-argument",
            any,
            doc(
                "\\newcommand*{\\paire}[2]{(#1, #2)}",
                "Le couple \\paire{a}\n\nSuite.",
            ),
            "\\paire{a}",
            Some("`\\paire` s'écrit `\\paire{…}{…}` : il manque son 2ᵉ argument."),
        ),
        located(
            "own-xparse-missing-argument",
            any,
            doc(
                "\\NewDocumentCommand{\\cadre}{O{1pt} m m}{\\fbox{#2 #3}}",
                "Un \\cadre[2pt]{a}\n\nSuite.",
            ),
            "\\cadre[2pt]{a}",
            Some("`\\cadre` s'écrit `\\cadre[…]{…}{…}` : il manque son 2ᵉ argument."),
        ),
        located(
            "own-def-missing-argument",
            any,
            doc(
                "\\def\\paire#1#2{(#1, #2)}",
                "Le couple \\paire{a}\n\nSuite.",
            ),
            "\\paire{a}",
            Some("il manque son 2ᵉ argument"),
        ),
        located(
            "own-environment-typo",
            any,
            doc(
                "\\newenvironment{encadre}{\\begin{center}}{\\end{center}}",
                "\\begin{encadr}\nTexte.\n\\end{encadr}",
            ),
            "encadr",
            Some("Vouliez-vous écrire `encadre` ?"),
        ),
        // --------------------------- packages read in the distribution
        located(
            "package-command-typo",
            any,
            doc("\\usepackage{marginnote}", "Texte\\marginnot{note} ici."),
            "\\marginnot",
            Some("Vouliez-vous écrire `\\marginnote` ?"),
        ),
        located(
            "package-command-typo-2",
            any,
            doc("\\usepackage{fancybox}", "Une \\shadowbx{boîte} ici."),
            "\\shadowbx",
            Some("Vouliez-vous écrire `\\shadowbox` ?"),
        ),
        located(
            "package-environment-typo",
            any,
            doc(
                "\\usepackage{paralist}",
                "\\begin{compactitm}\n\\item a\n\\end{compactitm}",
            ),
            "compactitm",
            Some("Vouliez-vous écrire `compactitem` ?"),
        ),
        located(
            "package-symbol-in-text",
            any,
            doc("\\usepackage{stmaryrd}", "Un crochet \\llbracket ici."),
            "\\llbracket",
            Some("`\\llbracket` n'existe que dans une formule, et celui-ci est dans du texte."),
        ),
        located(
            "package-command-missing-argument",
            any,
            doc(
                "\\usepackage{units}",
                "Une vitesse de \\unitfrac{km}\n\nSuite.",
            ),
            "\\unitfrac{km}",
            Some("`\\unitfrac` s'écrit `\\unitfrac[…]{…}{…}` : il manque son 2ᵉ argument."),
        ),
        located(
            "package-option-typo",
            any,
            doc("\\usepackage[pagewize]{lineno}", "Texte."),
            "pagewize",
            Some("Vouliez-vous écrire `pagewise` ?"),
        ),
        located(
            "package-option-typo-2",
            any,
            doc("\\usepackage[framd]{ntheorem}", "Texte."),
            "framd",
            Some("Vouliez-vous écrire `framed` ?"),
        ),
        // ------------------------------------- keys, whoever reads them
        located(
            "key-siunitx-setup",
            any,
            doc(
                "\\usepackage{siunitx}",
                "\\sisetup{round-mod=places}\nTexte \\num{1.2}.",
            ),
            "round-mod",
            Some("Vouliez-vous écrire `round-mode` ?"),
        ),
        located(
            "key-siunitx-inline",
            any,
            doc(
                "\\usepackage{siunitx}",
                "Texte \\num[round-mod=places]{1.2}.",
            ),
            "round-mod",
            Some("Vouliez-vous écrire `round-mode` ?"),
        ),
        located(
            "key-hyperref",
            any,
            doc(
                "\\usepackage{hyperref}",
                "\\hypersetup{colorlink=true}\nTexte.",
            ),
            "colorlink",
            Some("Vouliez-vous écrire `colorlinks` ?"),
        ),
        located(
            "key-on-another-line",
            any,
            doc(
                "\\usepackage{hyperref}",
                "\\hypersetup{\n  pdftitle={Titre},\n  linkcolour=blue,\n}\nTexte.",
            ),
            "linkcolour",
            Some("Vouliez-vous écrire `linkcolor` ?"),
        ),
        located(
            "key-listings",
            any,
            doc("\\usepackage{listings}", "\\lstset{langage=Python}\nTexte."),
            "langage",
            Some("Vouliez-vous écrire `language` ?"),
        ),
        located(
            "key-caption",
            any,
            doc(
                "\\usepackage{caption}",
                "\\captionsetup{labelfnt=bf}\nTexte.",
            ),
            "labelfnt",
            Some("Vouliez-vous écrire `labelfont` ?"),
        ),
        located(
            "key-enumitem",
            any,
            doc(
                "\\usepackage{enumitem}",
                "\\begin{enumerate}[lable=\\alph*)]\n\\item a\n\\end{enumerate}",
            ),
            "lable",
            Some("Vouliez-vous écrire `label` ?"),
        ),
        located(
            "key-tcolorbox",
            any,
            doc(
                "\\usepackage{tcolorbox}",
                "\\begin{tcolorbox}[colbak=red!5]\nTexte.\n\\end{tcolorbox}",
            ),
            "colbak",
            Some("Vouliez-vous écrire `colback` ?"),
        ),
        located(
            "key-todonotes",
            any,
            doc("\\usepackage{todonotes}", "Texte\\todo[colour=red]{note}."),
            "colour",
            Some("Vouliez-vous écrire `color` ?"),
        ),
        located(
            "key-geometry-command",
            any,
            doc("\\usepackage{geometry}", "\\newgeometry{margn=2cm}\nTexte."),
            "margn",
            Some("Vouliez-vous écrire `margin` ?"),
        ),
        // An accent of text in a formula is an error without T1 fonts.
        located(
            "accent-in-formula-error",
            any,
            doc("", "Soit $x = Écart$ ici."),
            "Écart",
            Some(
                "`É` est une lettre de texte : une formule ne compose pas les lettres accentuées.",
            ),
        ),
    ]
}

/// What LaTeX only warns about: the warning is placed on what causes it,
/// like an error, and says what it is when the source shows it.
fn warning_cases() -> Vec<Located> {
    let warning = "*warning";
    let t1 = "\\usepackage[T1]{fontenc}";
    vec![
        located(
            "accent-in-formula",
            warning,
            doc(t1, "Avant.\n$Écrivez iciadizjdazd$\nAprès."),
            "Écrivez",
            Some("`É` est une lettre de texte : une formule ne compose pas les lettres accentuées. Le mot `Écrivez` se met dans `\\textrm{…}`."),
        ),
        located(
            "accent-in-formula-amsmath",
            warning,
            doc(
                "\\usepackage[T1]{fontenc}\n\\usepackage{amsmath}",
                "Soit $v_{début} = 0$ ici.",
            ),
            "début",
            Some("Le mot `début` se met dans `\\text{…}`."),
        ),
        located(
            "accent-command-in-formula",
            warning,
            doc(t1, "Soit $x = \\'e$ ici."),
            "\\'e",
            Some("`\\'` est un accent de texte : une formule ne le compose pas. Dans une formule, cet accent s'écrit `\\acute{e}`."),
        ),
        located(
            "accented-letter-alone",
            warning,
            doc(t1, "Soit $é + 1$ ici."),
            "é",
            Some("Dans une formule, cet accent s'écrit `\\acute{e}`."),
        ),
        located(
            "cedilla-in-formula",
            warning,
            doc(t1, "Soit $x_{reçu}$ ici."),
            "reçu",
            Some("`ç` est une lettre de texte"),
        ),
        located(
            "two-accents-in-formula",
            warning,
            doc(t1, "Soit $x_{été} + y_{forêt}$ ici."),
            "été",
            Some("Le mot `été` se met dans"),
        ),
        located(
            "accent-in-display",
            warning,
            doc(t1, "\\[\n  v_{début} = 0\n\\]"),
            "début",
            Some("Le mot `début` se met dans"),
        ),
        located(
            "accent-in-equation",
            warning,
            doc(
                t1,
                "\\begin{equation}\n  v = 0 \\quad où v est la vitesse\n\\end{equation}",
            ),
            "où",
            Some("`ù` est une lettre de texte"),
        ),
        located(
            "letter-of-text-in-formula",
            warning,
            doc(t1, "Soit $n_{œuvres}$ ici."),
            "œuvres",
            Some("`œ` est une lettre de texte : une formule ne la compose pas."),
        ),
        located(
            "degree-in-formula",
            warning,
            doc(t1, "Un angle de $90°$ ici."),
            "°",
            Some("`°` est un caractère de texte : une formule ne le compose pas. Dans une formule, il s'écrit `^\\circ`."),
        ),
        located(
            "euro-in-formula",
            warning,
            doc(t1, "Un prix de $5 €$ ici."),
            "€",
            Some("`€` est un caractère de texte : une formule ne le compose pas."),
        ),
        located(
            "size-in-formula",
            warning,
            doc("", "Soit $\\Large x$ ici."),
            "\\Large",
            Some("`\\Large` ne fonctionne que dans du texte, et celui-ci est dans une formule."),
        ),
        // A command the warning names is shown where it is written.
        located(
            "command-named-by-the-warning",
            warning,
            doc("\\usepackage{amsmath}", "Soit $a \\over b$ ici."),
            "\\over",
            None,
        ),
        located(
            "picture-size",
            warning,
            doc(
                "",
                "\\begin{picture}(10,10)\\put(5,5){\\circle{200}}\\end{picture}",
            ),
            "\\circle",
            None,
        ),
        located(
            "title-level-skipped",
            warning,
            doc(
                "\\usepackage{hyperref}",
                "\\section{A}\n\\subsubsection{B}\nTexte.",
            ),
            "\\subsubsection",
            Some("`\\subsubsection` vient après `\\section` : le niveau `\\subsection` est sauté."),
        ),
        located(
            "class-option-typo",
            warning,
            "\\documentclass[a4papr]{article}\n\\begin{document}\nTexte.\n\\end{document}\n".to_owned(),
            "a4papr",
            Some("Vouliez-vous écrire `a4paper` ?"),
        ),
        located(
            "class-option-unknown",
            warning,
            "\\documentclass[11pt,brouillon]{article}\n\\begin{document}\nTexte.\n\\end{document}\n".to_owned(),
            "brouillon",
            Some("Ni la classe `article` ni un package ne connaît l'option `brouillon` : elle n'a aucun effet."),
        ),
        located(
            "no-author",
            warning,
            doc("\\title{T}", "\\maketitle\nTexte."),
            "\\maketitle",
            None,
        ),
    ]
}

/// The text of the document a diagnostic is placed on.
fn shown(text: &str, d: &Diagnostic) -> String {
    let Some(r) = d.range else {
        return String::new();
    };
    let lines: Vec<&str> = text.split('\n').collect();
    let at = |line: u32, character: u32| -> usize {
        let l = lines.get(line as usize).copied().unwrap_or("");
        let mut units = 0;
        for (i, c) in l.char_indices() {
            if units >= character as usize {
                return i;
            }
            units += c.len_utf16();
        }
        l.len()
    };
    if r.start.line != r.end.line {
        return lines[r.start.line as usize][at(r.start.line, r.start.character)..].to_owned();
    }
    lines[r.start.line as usize]
        [at(r.start.line, r.start.character)..at(r.end.line, r.end.character)]
        .to_owned()
}

fn run_located(
    dist: &Distribution,
    index: &TexmfIndex,
    case: &Located,
    probe: bool,
) -> (String, bool) {
    let dir = tempfile::tempdir().unwrap();
    let main = dir.path().join("main.tex");
    std::fs::write(&main, &case.main).unwrap();
    let built = compile(dist, index, &main, false);
    if probe {
        let mut out = format!("\n=== {} (success: {})\n", case.name, built.success);
        for d in &built.diagnostics {
            out.push_str(&format!(
                "  {}\n      shown: {:?}\n",
                describe(d),
                shown(&case.main, d)
            ));
        }
        return (out, true);
    }
    let fail = |why: String| {
        let all: Vec<String> = built.diagnostics.iter().map(describe).collect();
        (
            format!("✘ {}: {why}\n  {}", case.name, all.join("\n  ")),
            false,
        )
    };
    // Whatever message TeX gives when the case names none: its first error.
    let reported = |d: &&Diagnostic| {
        if case.code == "*warning" {
            d.severity == Severity::Warning && d.source == Source::Latex
        } else if case.code.is_empty() {
            d.severity == Severity::Error && d.source == Source::Latex
        } else {
            has_code(d, case.code)
        }
    };
    let Some(d) = built.diagnostics.iter().find(reported) else {
        return fail(format!("no `{}` diagnostic", case.code));
    };
    let text = shown(&case.main, d);
    if text != case.shown {
        return fail(format!("placed on {text:?}, not on {:?}", case.shown));
    }
    let advice = d.hint.as_ref().and_then(|h| h.advice.clone());
    match (case.advice, &advice) {
        (Some(part), Some(a)) if a.contains(part) => {}
        (None, None) => {}
        (Some(part), _) => return fail(format!("the advice does not say {part:?}: {advice:?}")),
        (None, Some(a)) => return fail(format!("a cause is given though none is known: {a}")),
    }
    // One mistake, one problem: what follows from it is not reported.
    let same_line: Vec<&Diagnostic> = built
        .diagnostics
        .iter()
        .filter(|x| x.severity == Severity::Error && x.source == Source::Latex)
        .filter(|x| !std::ptr::eq(*x, d) && !has_code(x, "emergency-stop"))
        .collect();
    if !same_line.is_empty() {
        return fail(format!(
            "{} other error(s) for the same mistake",
            same_line.len()
        ));
    }
    (
        format!(
            "✔ {:<32} {:<20} {:<14} {}",
            case.name,
            case.code,
            text,
            advice.unwrap_or_else(|| "(no advice)".into())
        ),
        true,
    )
}

/// The cause of a mistake is found in the sources: the diagnostic is placed
/// on the word or the argument to change and its advice says what is wrong
/// with it; when the cause cannot be told, no advice is given.
#[test]
#[ignore = "depends on the local TeX installation"]
fn causes_are_found_and_shown() {
    let dist = distribution();
    let index = TexmfIndex::build(&dist);
    let probe = std::env::var_os("LBT_PROBE").is_some();
    let only = std::env::var("LBT_CASE").ok();
    let mut failed = 0;
    let mut cases = located_cases();
    cases.extend(forum_cases());
    cases.extend(dynamic_cases());
    for case in cases
        .iter()
        .filter(|c| only.as_deref().is_none_or(|o| c.name.contains(o)))
    {
        let (line, ok) = run_located(&dist, &index, case, probe);
        println!("{line}");
        failed += usize::from(!ok);
    }
    assert!(failed == 0, "{failed} cases failed");
}

/// A warning is placed on what causes it, and says what it is.
#[test]
#[ignore = "depends on the local TeX installation"]
fn warnings_are_placed_on_their_cause() {
    let dist = distribution();
    let index = TexmfIndex::build(&dist);
    let probe = std::env::var_os("LBT_PROBE").is_some();
    let only = std::env::var("LBT_CASE").ok();
    let mut failed = 0;
    for case in warning_cases()
        .iter()
        .filter(|c| only.as_deref().is_none_or(|o| c.name.contains(o)))
    {
        let (line, ok) = run_located(&dist, &index, case, probe);
        println!("{line}");
        failed += usize::from(!ok);
    }
    assert!(failed == 0, "{failed} cases failed");
}

/// The most common commands and environments: no error, no warning, and
/// the live checks find nothing to say.
#[test]
#[ignore = "depends on the local TeX installation"]
fn common_documents_compile_cleanly() {
    let dist = distribution();
    let index = TexmfIndex::build(&dist);
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path();
    std::fs::write(p.join("refs.bib"), BIB).unwrap();
    std::fs::create_dir_all(p.join("chapitres")).unwrap();
    std::fs::write(
        p.join("chapitres/annexe.tex"),
        "\\section{Annexe}\\label{sec:annexe}\nRetour à la section~\\ref{sec:intro}.\n",
    )
    .unwrap();
    let main = p.join("main.tex");
    std::fs::write(&main, COMMON_DOCUMENT).unwrap();
    let built = compile(&dist, &index, &main, false);
    for d in &built.diagnostics {
        println!("{}", describe(d));
    }
    assert!(built.success);
    let problems: Vec<String> = built
        .diagnostics
        .iter()
        .filter(|d| d.severity <= Severity::Warning || d.source == Source::Syntax)
        .map(describe)
        .collect();
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

const COMMON_DOCUMENT: &str = r#"\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage{lmodern}
\usepackage{microtype}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{xcolor}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning}
\usepackage{enumitem}
\usepackage{csquotes}
\usepackage{siunitx}
\usepackage{hyperref}
\usepackage{cleveref}
\AtBeginDocument{\shorthandoff{:}}

\newtheorem{theoreme}{Théorème}
\newcommand{\R}{\mathbb{R}}
\DeclareMathOperator{\argmax}{argmax}

\title{Un document ordinaire}
\author{Camille Martin}
\date{\today}

\begin{document}
\maketitle
\tableofcontents

\begin{abstract}
Un résumé court, avec du texte en \emph{italique} et en \textbf{gras}.
\end{abstract}

\section{Introduction}\label{sec:intro}
Du texte avec une note\footnote{Une note de bas de page.}, une citation
\enquote{entre guillemets} et une référence au livre de Knuth~\cite{knuth}.
Voir aussi la \cref{sec:resultats}, la figure~\ref{fig:image} et
l'équation~\eqref{eq:euler}. Une adresse : \url{https://ctan.org}, un
\href{https://www.latex-project.org}{lien}, une mesure de \SI{3.5}{\metre}.

\subsection{Listes}
\begin{itemize}
  \item Un point ;
  \item un autre, avec \texttt{du code} ;
  \item[--] un dernier.
\end{itemize}
\begin{enumerate}[label=\alph*)]
  \item Premier ;
  \item second.
\end{enumerate}
\begin{description}
  \item[Terme] Sa définition.
\end{description}

\section{Mathématiques}\label{sec:maths}
Soit $f \colon \R \to \R$ et $x \in \R$ tel que $x^2 \leq 1$. Alors
\begin{equation}\label{eq:euler}
  e^{i\pi} + 1 = 0.
\end{equation}
\begin{align}
  (a + b)^2 &= a^2 + 2ab + b^2, \\
  \int_0^1 x \, \mathrm{d}x &= \frac{1}{2}.
\end{align}
\[
  \sum_{k=1}^{n} k = \frac{n(n+1)}{2}, \qquad
  \lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e.
\]
\begin{theoreme}
Tout ensemble non vide et majoré de $\R$ admet une borne supérieure.
\end{theoreme}
\begin{proof}
C'est l'axiome de la borne supérieure.
\end{proof}

\section{Résultats}\label{sec:resultats}
\begin{table}[htbp]
  \centering
  \begin{tabular}{lcr}
    \toprule
    Nom & Valeur & Unité \\
    \midrule
    Longueur & 3,5 & m \\
    Masse & 12 & kg \\
    \bottomrule
  \end{tabular}
  \caption{Un tableau}\label{tab:valeurs}
\end{table}

\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.5\linewidth]{example-image}
  \caption{Une image}\label{fig:image}
\end{figure}

\begin{figure}[htbp]
  \centering
  \begin{tikzpicture}[node distance=2cm]
    \node[draw, rounded corners] (a) {A};
    \node[draw, right=of a] (b) {B};
    \draw[-Stealth, thick, blue] (a) -- (b);
  \end{tikzpicture}
  \caption{Un schéma}\label{fig:schema}
\end{figure}

\begin{quote}
Une citation longue, en retrait.
\end{quote}
\begin{center}
Du texte centré en \textcolor{red}{rouge}.
\end{center}
\begin{verbatim}
du code tel quel
\end{verbatim}

\input{chapitres/annexe}

\bibliographystyle{plain}
\bibliography{refs}
\end{document}
"#;
