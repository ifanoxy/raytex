//! What RayTeX does when MiKTeX does not have a file a document needs
//! (`cargo test -p raytex-core --release --test miktex -- --ignored`, with
//! MiKTeX as the distribution found first: the workflow *MiKTeX* does it).
//!
//! MiKTeX starts with few packages and installs the others while it
//! compiles, when it is allowed to and can reach its repository. When it
//! does not (the installer turned off, no network, a repository it cannot
//! read), the document stops on a file that is "not found", often one the
//! author never asked for: French for babel reads `scalefnt.sty`, and babel
//! calls a language it knows "unknown" when its file is not there.
//!
//! Measured on MiKTeX 26.5 (2026-10-10): a file seldom has the name of its
//! package (`scalefnt.sty` is in `carlisle`, `tikz.sty` in `pgf`,
//! `ngerman.ldf` in `babel-german`), and asking MiKTeX for a package named
//! like the file installs nothing.

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use raytex_core::build::{self, BuildEvent, DocumentFacts, RunContext};
use raytex_core::diagnostics::{Diagnostic, Fix, Severity};
use raytex_core::i18n::Lang;
use raytex_core::lint::{self, LintOptions};
use raytex_core::settings::BuildSettings;
use raytex_core::tex::{Distribution, DistroKind, TexmfIndex, manager};
use raytex_core::workspace::Workspace;

/// MiKTeX, when it is the distribution RayTeX would use here.
fn miktex() -> Option<Distribution> {
    raytex_core::tex::detect(&[])
        .into_iter()
        .next()
        .filter(|d| d.kind == DistroKind::MikTex)
}

/// Compiles `main` without letting MiKTeX install anything.
fn compile(dist: &Distribution, main: &Path) -> (bool, Vec<Diagnostic>) {
    compile_with(dist, main, false)
}

/// Compiles `main`, MiKTeX installing what is missing while it compiles
/// when `install` is set (what RayTeX does unless the user turned it off).
fn compile_with(dist: &Distribution, main: &Path, install: bool) -> (bool, Vec<Diagnostic>) {
    let ws = Workspace::open(main.parent().unwrap());
    let root = ws.root_for(main);
    let docs = ws.project_documents(&root);
    let facts = DocumentFacts::from_indexes(docs.iter().map(|d| &d.index));
    let settings = BuildSettings {
        miktex_auto_install: install,
        precompile_preamble: false,
        ..ws.config.effective_build(&BuildSettings::default())
    };
    let plan = build::plan(&root, &settings, Some(dist), &facts, Lang::En).expect("plan");
    let cancel = AtomicBool::new(false);
    let source = |p: &Path| std::fs::read_to_string(p).ok();
    let ctx = RunContext {
        dist,
        settings: &settings,
        cancel: &cancel,
        lang: Lang::En,
        source: &source,
        packages: None,
        background: false,
        live: false,
    };
    let outcome = build::run(&plan, &ctx, &mut |_: BuildEvent| {});
    (outcome.success, outcome.diagnostics)
}

/// Runs a step of an installation. MiKTeX sometimes cannot reach its
/// repository in time ("Sorry, but: Timeout was reached", seen on
/// 2026-10-11 for a package it installed in every other run): that is the
/// network of the moment, not an answer about the package, and the step is
/// run again.
fn install_step(step: &raytex_core::process::Cmd) -> raytex_core::process::Output {
    let mut out = raytex_core::process::output(step, Duration::from_secs(600)).expect("run");
    for wait in [30, 90] {
        let said = format!("{}\n{}", out.stdout, out.stderr);
        if out.code == Some(0) || !said.contains("Timeout was reached") {
            break;
        }
        println!("  MiKTeX did not reach its repository in time: again in {wait} s");
        std::thread::sleep(Duration::from_secs(wait));
        out = raytex_core::process::output(step, Duration::from_secs(600)).expect("run");
    }
    out
}

/// The file a problem offers to install.
fn to_install(d: &Diagnostic) -> Option<&str> {
    d.fixes.iter().find_map(|f| match f {
        Fix::InstallPackage { file } => Some(file.as_str()),
        _ => None,
    })
}

#[test]
#[ignore = "needs MiKTeX"]
fn a_file_has_the_package_miktex_gives_it() {
    let Some(dist) = miktex() else {
        println!("MiKTeX is not the distribution found first: nothing checked");
        return;
    };
    let files = [
        "scalefnt.sty",
        "french.ldf",
        "ngerman.ldf",
        "tikz.sty",
        "subcaption.sty",
        "graphicx.sty",
        "algorithm.sty",
    ]
    .map(String::from);
    assert_eq!(
        manager::resolve_packages(&dist, &files),
        [
            "carlisle",
            "babel-french",
            "babel-german",
            "pgf",
            "caption",
            "graphics",
            "algorithms"
        ]
    );
}

/// A language babel knows and MiKTeX does not have: said before the build,
/// said again by the build with the same repair, and repaired by installing
/// what holds each missing file, as many times as a file is missing.
#[test]
#[ignore = "needs MiKTeX"]
fn a_language_that_is_not_installed_is_installed() {
    let Some(dist) = miktex() else {
        println!("MiKTeX is not the distribution found first: nothing checked");
        return;
    };
    let index = TexmfIndex::build(&dist);
    let Some(language) = [
        "icelandic",
        "welsh",
        "irish",
        "estonian",
        "galician",
        "french",
    ]
    .into_iter()
    .find(|l| !index.contains(&format!("{l}.ldf"))) else {
        println!("every language tried is installed already: nothing checked");
        return;
    };
    let file = format!("{language}.ldf");
    let dir = tempfile::tempdir().unwrap();
    let main = dir.path().join("main.tex");
    std::fs::write(
        &main,
        format!("\\documentclass{{article}}\n\\usepackage[T1]{{fontenc}}\n\\usepackage[{language}]{{babel}}\n\\begin{{document}}\nText.\n\\end{{document}}\n"),
    )
    .unwrap();

    // Before any build.
    let ws = Workspace::open(dir.path());
    let opts = LintOptions {
        installed: Some(&index),
        ..Default::default()
    };
    let live = lint::lint(&ws, &raytex_core::log::normalize(&main), &opts);
    assert!(
        live.iter().any(|d| to_install(d) == Some(&file)),
        "the live checks do not offer {file}: {live:#?}"
    );

    // The build says it too; installing what it names ends in a document.
    let mut installed = Vec::new();
    for round in 1..=4 {
        let (success, diagnostics) = compile(&dist, &main);
        if success {
            println!("{language}: compiled after installing {installed:?}");
            assert!(round > 1, "{language} was said not to be installed");
            return;
        }
        let errors: Vec<&Diagnostic> = diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();
        for d in &errors {
            println!(
                "round {round}: {:?} {} → {:?}",
                d.code,
                d.message.lines().next().unwrap_or_default(),
                to_install(d)
            );
        }
        let missing = errors
            .iter()
            .find_map(|d| to_install(d))
            .unwrap_or_else(|| panic!("no error offers an installation: {errors:#?}"))
            .to_owned();
        if round == 1 {
            assert_eq!(missing, file, "the first thing to install is the language");
        }
        let plan = manager::install_files(&dist, std::slice::from_ref(&missing), true)
            .expect("a plan to install the file");
        for step in &plan.steps {
            println!("  {} {}", step.program.display(), step.args.join(" "));
            let out = install_step(step);
            assert_eq!(out.code, Some(0), "{}\n{}", out.stdout, out.stderr);
        }
        installed.push(missing);
    }
    panic!("{language} still does not compile after installing {installed:?}");
}

/// `ulem.sty`, seen on 2026-10-11: MiKTeX, allowed to install what a
/// document needs while it compiles, stopped on "File `ulem.sty' not found"
/// in a run where it fetched every other package asked of it (lipsum,
/// cancel, multirow, mhchem, soul, todonotes…), one build at a time.
///
/// This says what MiKTeX answers for that file, which package its database
/// gives for it, and checks that the *Install* RayTeX offers on the error
/// ends in a document.
#[test]
#[ignore = "needs MiKTeX"]
fn a_package_miktex_does_not_fetch_while_it_compiles() {
    let Some(dist) = miktex() else {
        println!("MiKTeX is not the distribution found first: nothing checked");
        return;
    };
    let file = "ulem.sty".to_owned();
    println!(
        "{file}: in the files of the distribution before anything: {}",
        TexmfIndex::build(&dist).contains(&file)
    );
    println!(
        "{file}: package given by the database of MiKTeX: {:?}",
        manager::resolve_packages(&dist, std::slice::from_ref(&file))
    );
    let dir = tempfile::tempdir().unwrap();
    let main = dir.path().join("main.tex");
    std::fs::write(
        &main,
        "\\documentclass{article}\n\\usepackage{ulem}\n\\begin{document}\nUn mot \\sout{barré}.\n\\end{document}\n",
    )
    .unwrap();

    // What MiKTeX says when it is asked for the file directly, its
    // installer on: the program that finds files installs them too.
    let found = raytex_core::process::output(
        &dist.cmd("kpsewhich").arg(file.clone()),
        Duration::from_secs(300),
    );
    match &found {
        Ok(out) => println!(
            "kpsewhich {file}: code {:?}\n  stdout: {}\n  stderr: {}",
            out.code,
            out.stdout.trim(),
            out.stderr.trim()
        ),
        Err(e) => println!("kpsewhich {file}: {e}"),
    }

    let (success, diagnostics) = compile_with(&dist, &main, true);
    println!("with the installer of MiKTeX on: success {success}");
    for d in diagnostics.iter().filter(|d| d.severity == Severity::Error) {
        println!(
            "  {:?} {} → {:?}",
            d.code,
            d.message.lines().next().unwrap_or_default(),
            to_install(d)
        );
    }
    let log =
        std::fs::read_to_string(dir.path().join("build").join("main.log")).unwrap_or_default();
    for line in log
        .lines()
        .filter(|l| l.to_lowercase().contains("miktex") || l.contains("ulem") || l.starts_with('!'))
        .take(30)
    {
        println!("  log | {line}");
    }
    if success {
        println!("{file}: MiKTeX fetched it by itself this time");
        return;
    }

    // What the user is offered: installing the file the error names.
    let missing = diagnostics
        .iter()
        .filter(|d| d.severity == Severity::Error)
        .find_map(|d| to_install(d))
        .unwrap_or_else(|| panic!("no error offers an installation: {diagnostics:#?}"))
        .to_owned();
    assert_eq!(missing, file);
    let plan = manager::install_files(&dist, std::slice::from_ref(&missing), true)
        .expect("a plan to install the file");
    for step in &plan.steps {
        println!("  {} {}", step.program.display(), step.args.join(" "));
        let out = install_step(step);
        println!(
            "  → code {:?}\n  stdout: {}\n  stderr: {}",
            out.code,
            out.stdout.trim(),
            out.stderr.trim()
        );
        assert_eq!(out.code, Some(0), "the installation RayTeX offers failed");
    }
    let (success, diagnostics) = compile(&dist, &main);
    assert!(
        success,
        "{file} installed as RayTeX offers, and the document still does not compile: {diagnostics:#?}"
    );
    println!("{file}: compiled after the installation RayTeX offers");
}
