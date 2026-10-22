//! Every file of the installed distribution read as RayTeX reads the files
//! of a project: scanned, checked, counted, completed and hovered at a few
//! places, its bibliography read, without a panic and in a reasonable time.
//! Tens of thousands of files written by others, in every style:
//!
//! ```text
//! RAYTEX_CORPUS=1 cargo test -p raytex-core --release --test distribution -- --ignored --nocapture
//! ```
//!
//! `RAYTEX_CORPUS=<text>` keeps the files whose path contains the text.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use raytex_core::completion::{self, CompletionRequest};
use raytex_core::i18n::Lang;
use raytex_core::lint::{self, LintOptions};
use raytex_core::settings::CompletionSettings;
use raytex_core::text::Position;
use raytex_core::workspace::Workspace;
use raytex_core::{bib, navigation, syntax, wordcount};

/// A file that takes longer is reported (each step runs at each keystroke).
const SLOW: Duration = Duration::from_millis(1500);

fn files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            files(&path, out);
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| ["tex", "ltx", "sty", "cls", "dtx", "bib"].contains(&e))
        {
            out.push(path);
        }
    }
}

/// Reads one file as the editor would; the steps that ran, for a report.
fn read(path: &Path, text: String) -> &'static str {
    let dir = path.parent().unwrap_or(Path::new("/"));
    let is_bib = path.extension().is_some_and(|e| e == "bib");
    if is_bib {
        let _ = bib::parse(&text);
    }
    let index = syntax::scan(&text);
    let _ = wordcount::count(&text, &index);
    let mut ws = Workspace::empty(dir);
    ws.update(path, text.clone(), 1);
    let _ = lint::lint(&ws, path, &LintOptions::default());
    let _ = ws.outline(path);
    let _ = ws.labels(path);
    let _ = ws.citations(path);
    let _ = ws.command_definitions(path);
    let settings = CompletionSettings::default();
    let complete = |at: usize| {
        let start = raytex_core::text::floor_char_boundary(&text, at.saturating_sub(4096));
        let mut end = (at + 200).min(text.len());
        while !text.is_char_boundary(end) {
            end += 1;
        }
        let req = CompletionRequest {
            file: path,
            before: &text[start..at],
            after: &text[at..end],
            explicit: true,
            lang: Lang::En,
            settings: &settings,
            macros: &[],
        };
        let _ = completion::complete(&ws, &req);
    };
    // Where completion has its own lists: right after these.
    for opening in [
        "\\cite{",
        "\\ref{",
        "\\begin{",
        "\\usepackage{",
        "\\includegraphics[",
        "\\",
        "{",
    ] {
        if let Some(i) = text.find(opening) {
            complete(i + opening.len());
        }
    }
    let lines: Vec<&str> = text.lines().collect();
    for share in [3, 2] {
        let line = lines.len() / share;
        let character = lines.get(line).map_or(0, |l| l.chars().count() / 2) as u32;
        let pos = Position {
            line: line as u32,
            character,
        };
        let _ = navigation::hover(&ws, path, pos, Lang::En);
        let _ = navigation::definition(&ws, path, pos);
        let _ = navigation::references(&ws, path, pos);
        let _ = navigation::rename(&ws, path, pos, "nouveau");
        let _ = navigation::math_at(&ws, path, pos);
        complete(
            text.char_indices()
                .nth(text.chars().count() / share)
                .map_or(text.len(), |(i, _)| i),
        );
    }
    "scan, count, lint, outline, hover, definition, references, rename, completion"
}

#[test]
#[ignore = "reads the whole distribution"]
fn every_file_of_the_distribution_is_read() {
    let Some(filter) = std::env::var_os("RAYTEX_CORPUS") else {
        println!("RAYTEX_CORPUS is not set: nothing read");
        return;
    };
    let filter = filter.to_string_lossy().into_owned();
    let Some(dist) = raytex_core::tex::detect(&[]).into_iter().next() else {
        println!("no TeX distribution: nothing read");
        return;
    };
    let roots: Vec<PathBuf> = [
        dist.bin_dir.join("../../texmf-dist"),
        dist.bin_dir.join("../../../texmf-dist"),
        dist.bin_dir.join("../../.."),
    ]
    .into_iter()
    .filter(|p| p.join("tex").is_dir())
    .take(1)
    .collect();
    let mut all = Vec::new();
    for root in &roots {
        files(root, &mut all);
    }
    all.retain(|p| filter == "1" || p.to_string_lossy().contains(&filter));
    all.sort();
    println!("{} files under {roots:?}", all.len());
    if std::env::var_os("RAYTEX_CORPUS_LOUD").is_none() {
        std::panic::set_hook(Box::new(|_| {}));
    }
    let mut panics = Vec::new();
    let mut slow = Vec::new();
    let started = Instant::now();
    for (n, path) in all.iter().enumerate() {
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        let text = String::from_utf8_lossy(&bytes).into_owned();
        // As it is, then with letters of several bytes where the checks
        // count their places (beside braces, formulas, ends of lines).
        let variants = [
            ("", text.clone()),
            (
                " (CJK beside braces)",
                text.replace('{', "{語")
                    .replace('}', "語}")
                    .replace('$', "$é"),
            ),
            (
                " (letters of 2 bytes at the ends of lines)",
                text.replace('\n', "é\n").replace(' ', "\u{a0}"),
            ),
        ];
        for (variant, text) in variants {
            let t = Instant::now();
            if let Err(e) = catch_unwind(AssertUnwindSafe(|| read(path, text))) {
                let why = e
                    .downcast_ref::<String>()
                    .cloned()
                    .or_else(|| e.downcast_ref::<&str>().map(|s| (*s).to_owned()))
                    .unwrap_or_default();
                panics.push(format!("{}{variant}: {why}", path.display()));
            }
            let took = t.elapsed();
            if took > SLOW {
                slow.push((took, path.clone(), bytes.len()));
            }
        }
        if n % 2000 == 0 {
            println!("{n} files, {:?}", started.elapsed());
        }
    }
    let _ = std::panic::take_hook();
    slow.sort_by_key(|s| std::cmp::Reverse(s.0));
    for (took, path, size) in slow.iter().take(30) {
        println!("slow: {took:?} {} ({size} bytes)", path.display());
    }
    for p in panics.iter().take(50) {
        println!("panic: {p}");
    }
    println!(
        "{} files in {:?}: {} panics, {} slow",
        all.len(),
        started.elapsed(),
        panics.len(),
        slow.len()
    );
    assert!(panics.is_empty() && slow.is_empty());
}

/// The errors and warnings TeX prints most, as its log writes them; `{l}`
/// is the line, `{m}` the one after, `{b}` and `{a}` what TeX shows of the
/// line before and after the point where it stopped.
const LOG: &[&str] = &[
    "./main.tex:{l}: Undefined control sequence.\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Missing $ inserted.\n<inserted text> \n                $\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Extra }, or forgotten $.\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Missing } inserted.\n<inserted text> \n                }\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Extra alignment tab has been changed to \\cr.\n<template> \\endtemplate \nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Misplaced alignment tab character &.\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: LaTeX Error: Environment foo undefined.\n\nSee the LaTeX manual or LaTeX Companion for explanation.\nType  H <return>  for immediate help.\n ...                                              \n                                                  \nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: LaTeX Error: \\begin{itemize} on input line {m} ended by \\end{document}.\n\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Paragraph ended before \\textbf was complete.\n<to be read again> \n                   \\par \nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Illegal parameter number in definition of \\x.\n<to be read again> \n                   1\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Double superscript.\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Missing number, treated as zero.\n<to be read again> \n                   p\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Illegal unit of measure (pt inserted).\n<to be read again> \n                   x\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: LaTeX Error: There's no line here to end.\n\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: LaTeX Error: Something's wrong--perhaps a missing \\item.\n\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Too many }'s.\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Display math should end with $$.\n<to be read again> \n                   \\par \nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: LaTeX Error: Can be used only in preamble.\n\nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Dimension too large.\n<recently read> \\@tempdima \nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Argument of \\@caption has an extra }.\n<inserted text> \n                \\par \nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: Package babel Error: Unknown option 'xyz'.\n\nl.{l} {b}\n {a}\n",
    "Runaway argument?\n{{b}\n./main.tex:{l}: Paragraph ended before \\@caption was complete.\n<to be read again> \n                   \\par \nl.{l} {b}\n {a}\n",
    "./main.tex:{l}: LaTeX Error: File `zzz.sty' not found.\n\nType X to quit or <RETURN> to proceed,\nor enter new name. (Default extension: sty)\n\nEnter file name: \n./main.tex:{l}: Emergency stop.\n<read *> \n         \nl.{l} {b}\n {a}\n",
];

/// The warnings, alone (with errors, they are not shown).
const WARNINGS: &[&str] = &[
    "\nLaTeX Warning: Reference `sec:x' on page 1 undefined on input line {l}.\n\n",
    "\nLaTeX Warning: Citation `knuth' on page 1 undefined on input line {l}.\n\n",
    "\nLaTeX Warning: Label `a' multiply defined.\n\n",
    "\nOverfull \\hbox (12.0pt too wide) in paragraph at lines {l}--{m}\n[]\\T1/cmr/m/n/10 {b}|\n\n",
    "\nUnderfull \\hbox (badness 10000) in paragraph at lines {l}--{m}\n\n",
    "\nPackage hyperref Warning: Token not allowed in a PDF string (Unicode):\n(hyperref)                removing `\\textbf' on input line {l}.\n\n",
];

/// The log TeX would write for `entries` at places of `text`.
fn log_for(text: &str, entries: &[&str]) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut log = String::from(
        "This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n(./main.tex\nLaTeX2e <2024-11-01>\n",
    );
    if lines.is_empty() {
        return log;
    }
    for (i, entry) in entries.iter().enumerate() {
        let n = (i * 7919 + 13) % lines.len();
        let line: Vec<char> = lines[n].chars().collect();
        let cut = line.len() / 2;
        let before: String = line[..cut]
            .iter()
            .rev()
            .take(40)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        let after: String = line[cut..].iter().take(40).collect();
        log.push_str(
            &entry
                .replace("{l}", &(n + 1).to_string())
                .replace("{m}", &(n + 3).to_string())
                .replace("{b}", &before)
                .replace("{a}", &after),
        );
    }
    log.push_str(")\nOutput written on main.pdf (1 page, 1000 bytes).\n");
    log
}

#[test]
#[ignore = "reads the whole distribution"]
fn every_file_of_the_distribution_has_its_errors_explained() {
    use raytex_core::build::refine::{FAULTS, refine_all};
    use std::sync::atomic::Ordering;

    let Some(filter) = std::env::var_os("RAYTEX_CORPUS") else {
        println!("RAYTEX_CORPUS is not set: nothing read");
        return;
    };
    let filter = filter.to_string_lossy().into_owned();
    let Some(dist) = raytex_core::tex::detect(&[]).into_iter().next() else {
        println!("no TeX distribution: nothing read");
        return;
    };
    let Some(root) = [
        dist.bin_dir.join("../../texmf-dist"),
        dist.bin_dir.join("../../../texmf-dist"),
        dist.bin_dir.join("../../.."),
    ]
    .into_iter()
    .find(|p| p.join("tex").is_dir()) else {
        return;
    };
    let mut all = Vec::new();
    files(&root, &mut all);
    all.retain(|p| {
        p.extension().is_some_and(|e| e == "tex" || e == "ltx")
            && (filter == "1" || p.to_string_lossy().contains(&filter))
    });
    all.sort();
    if std::env::var_os("RAYTEX_CORPUS_LOUD").is_none() {
        std::panic::set_hook(Box::new(|_| {}));
    }
    let dir = tempfile::tempdir().unwrap();
    let main = raytex_core::log::normalize(&dir.path().join("main.tex"));
    let (mut panics, mut faults, mut slow) = (Vec::new(), Vec::new(), Vec::new());
    let mut found = 0;
    let started = Instant::now();
    for path in &all {
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        let text = String::from_utf8_lossy(&bytes).into_owned();
        for (variant, text) in [
            ("", text.clone()),
            (
                " (CJK beside braces)",
                text.replace('{', "{語")
                    .replace('}', "語}")
                    .replace('$', "$é"),
            ),
        ] {
            let before = FAULTS.load(Ordering::Relaxed);
            let t = Instant::now();
            let looked = catch_unwind(AssertUnwindSafe(|| {
                let mut n = 0;
                for entries in [LOG, WARNINGS] {
                    let log = log_for(&text, entries);
                    let mut report = raytex_core::log::parse_log(&log, dir.path(), &main, Lang::En);
                    let source = |p: &Path| (p == main).then(|| text.clone());
                    refine_all(&mut report.diagnostics, &main, &source, None, Lang::En);
                    n += report.diagnostics.len();
                }
                n
            }));
            if let Ok(n) = looked {
                found += n;
            }
            if let Err(e) = looked {
                let why = e
                    .downcast_ref::<String>()
                    .cloned()
                    .or_else(|| e.downcast_ref::<&str>().map(|s| (*s).to_owned()))
                    .unwrap_or_default();
                panics.push(format!("{}{variant}: {why}", path.display()));
            }
            if FAULTS.load(Ordering::Relaxed) > before {
                faults.push(format!("{}{variant}", path.display()));
            }
            if t.elapsed() > SLOW {
                slow.push((t.elapsed(), path.clone()));
            }
        }
    }
    let _ = std::panic::take_hook();
    for (took, path) in slow.iter().take(20) {
        println!("slow: {took:?} {}", path.display());
    }
    for p in panics.iter().take(40) {
        println!("panic: {p}");
    }
    for f in faults.iter().take(40) {
        println!("fault in the search of a cause: {f}");
    }
    println!(
        "{} files in {:?}, {found} problems said: {} panics, {} faults, {} slow",
        all.len(),
        started.elapsed(),
        panics.len(),
        faults.len(),
        slow.len()
    );
    assert!(found > all.len() * 10, "the logs are read");
    assert!(panics.is_empty() && faults.is_empty() && slow.is_empty());
}
