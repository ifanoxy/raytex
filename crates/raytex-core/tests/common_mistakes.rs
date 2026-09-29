//! Common LaTeX documents and common mistakes, compiled with the local TeX
//! distribution (`cargo test -p raytex-core --release -- --ignored`).
//!
//! * A document using the most common commands and environments compiles
//!   without any error or warning, and the live checks find nothing wrong.
//! * Each mistake is reported (by the compiler or the live checks) with an
//!   explanation and an automatic fix; applying the fix like the editor does
//!   makes the problem go away.
//!
//! `LBT_PROBE=1` prints every diagnostic instead of checking (to write new
//! cases); `LBT_CASE=<name>` runs the cases whose name contains the text.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;

use raytex_core::build::{self, BuildEvent, DocumentFacts, RunContext};
use raytex_core::diagnostics::{Diagnostic, Severity, Source};
use raytex_core::fixes;
use raytex_core::i18n::Lang;
use raytex_core::lint::{self, LintOptions};
use raytex_core::settings::BuildSettings;
use raytex_core::tex::{Distribution, TexmfIndex};
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
    let ctx = RunContext {
        dist,
        settings: &settings,
        cancel: &cancel,
        lang: Lang::Fr,
        source: &source,
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
        d.fixes
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
    if d.hint.as_ref().is_none_or(|h| h.explanation.is_empty()) {
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
    let after = compile(dist, index, &main, case.badboxes);
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
