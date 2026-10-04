//! Precompiled preambles (pdfLaTeX).
//!
//! Reading the packages of the preamble takes most of the time of a pass:
//! 0.8 s of 0.8 s for a usual article, 1.3 s with TikZ and pgfplots. The
//! preamble is dumped once into a format with `mylatexformat`; later passes
//! load the format and start at `\begin{document}` — 35 to 55 % faster,
//! which matters most for the live preview.
//!
//! * The format is built **in the background** after a build, never during
//!   one: no build is slowed down, the next ones are faster.
//! * It is keyed by a hash of the preamble, of the local files it reads
//!   (`.sty`, `.cls`, `\input` files) and of the distribution.
//! * Preambles that cannot be dumped safely (files opened for writing,
//!   `\jobname`, indexes, glossaries, `minted`…) are never precompiled, and a
//!   pass that stops with the format is redone without it (the format is
//!   then abandoned for that preamble).

use std::collections::HashSet;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use crate::process;
use crate::settings::{BuildSettings, BuildTool};
use crate::tex::{Distribution, DistroKind, Engine};

use super::BuildPlan;

/// Commands whose effect cannot be stored in a format (files opened for
/// writing, the job name, commands meant for the document itself).
const UNSAFE_COMMANDS: &[&str] = &[
    "\\makeindex",
    "\\makeglossaries",
    "\\makenoidxglossaries",
    "\\makenomenclature",
    "\\newwrite",
    "\\openout",
    "\\immediate\\write",
    "\\write18",
    "\\ShellEscape",
    "\\jobname",
    "\\includeonly",
    "\\DocumentMetadata",
    "\\tikzexternalize",
    "\\endofdump",
    "\\begin{filecontents",
    "\\directlua",
    "\\input|",
];

/// Packages that write files or run programs while loading (or need their
/// own engine): their preamble is compiled normally.
const UNSAFE_PACKAGES: &[&str] = &[
    "minted",
    "pythontex",
    "svg",
    "pdfx",
    "glossaries",
    "glossaries-extra",
    "imakeidx",
    "nomencl",
    "currfile",
    "subfiles",
    "docmute",
    "snapshot",
    "luacode",
    "fontspec",
    "unicode-math",
    "filecontents",
    "hyperxmp",
    "embedfile",
    "auto-pst-pdf",
    "pstool",
    "gnuplottex",
    "sagetex",
    "asymptote",
    "bashful",
    "shellesc",
    "memoize",
    "robust-externalize",
];

/// The preamble of `source` (up to `\begin{document}`), comments removed.
pub fn preamble_of(source: &str) -> Option<String> {
    let mut out = String::new();
    for line in source.lines() {
        let mut code = line;
        let bytes = line.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == b'%' {
                code = &line[..i];
                break;
            }
            i += 1;
        }
        if let Some(at) = code.find("\\begin{document}") {
            out.push_str(&code[..at]);
            return Some(out);
        }
        out.push_str(code);
        out.push('\n');
    }
    None
}

/// Packages of `\usepackage{a,b}` lines of a preamble.
fn packages(preamble: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = preamble;
    while let Some(i) = rest
        .find("\\usepackage")
        .or_else(|| rest.find("\\RequirePackage"))
    {
        rest = &rest[i + 1..];
        let Some(open) = rest.find('{') else { break };
        // Options in brackets may come first.
        let Some(close) = rest[open..].find('}') else {
            break;
        };
        out.extend(
            rest[open + 1..open + close]
                .split(',')
                .map(|p| p.trim().to_owned())
                .filter(|p| !p.is_empty()),
        );
        rest = &rest[open + close..];
    }
    out
}

/// Why a preamble is compiled normally, or `None` when it can be precompiled.
pub fn unsafe_reason(preamble: &str) -> Option<String> {
    if let Some(c) = UNSAFE_COMMANDS.iter().find(|c| preamble.contains(*c)) {
        return Some((*c).to_owned());
    }
    packages(preamble)
        .into_iter()
        .find(|p| UNSAFE_PACKAGES.contains(&p.as_str()))
}

/// Files of the project the preamble may read: local classes and packages,
/// and the files given to `\input` / `\include`.
fn local_inputs(root_dir: &Path, preamble: &str) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(root_dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if ["sty", "cls", "cfg", "def", "clo", "ldf"].contains(&ext.as_str()) {
                files.push(path);
            }
        }
    }
    for cmd in ["\\input{", "\\include{", "\\input "] {
        let mut rest = preamble;
        while let Some(i) = rest.find(cmd) {
            rest = &rest[i + cmd.len()..];
            let name: String = rest
                .chars()
                .take_while(|c| *c != '}' && *c != '\n' && (cmd.ends_with('{') || *c != ' '))
                .collect();
            let name = name.trim();
            if name.is_empty() {
                continue;
            }
            let path = root_dir.join(name);
            files.push(if path.extension().is_some() {
                path
            } else {
                path.with_extension("tex")
            });
        }
    }
    files.sort();
    files.dedup();
    files
}

/// Whether the build of `plan` may use a precompiled preamble: pdfLaTeX,
/// our own driver, a TeX Live-like distribution, the setting on.
pub fn applies(plan: &BuildPlan, settings: &BuildSettings, dist: &Distribution) -> bool {
    settings.precompile_preamble
        && plan.engine == Engine::Pdflatex
        && matches!(plan.tool, BuildTool::Auto | BuildTool::Single)
        && !matches!(dist.kind, DistroKind::MikTex | DistroKind::Tectonic)
        && dist.has_engine(Engine::Pdflatex)
}

/// Key of the format of a preamble: its text, the local files it reads, the
/// distribution and the options that change what the preamble does.
pub fn key(plan: &BuildPlan, settings: &BuildSettings, dist: &Distribution, preamble: &str) -> u64 {
    let mut h = DefaultHasher::new();
    preamble.hash(&mut h);
    dist.id.hash(&mut h);
    dist.version.hash(&mut h);
    settings.shell_escape.hash(&mut h);
    settings.extra_args.hash(&mut h);
    // A distribution update rewrites its file index.
    for ls_r in [
        dist.bin_dir.join("../../texmf-dist/ls-R"),
        dist.bin_dir.join("../../../texmf-dist/ls-R"),
    ] {
        if let Ok(m) = std::fs::metadata(&ls_r).and_then(|m| m.modified()) {
            m.hash(&mut h);
        }
    }
    for file in local_inputs(&plan.root_dir, preamble) {
        file.hash(&mut h);
        std::fs::read(&file).ok().hash(&mut h);
    }
    h.finish()
}

/// Folder of the formats of a build.
fn folder(plan: &BuildPlan) -> PathBuf {
    plan.out_dir.join(".raytex-fmt")
}

/// The format of a preamble (without its `.fmt` extension: `-fmt=` takes it so).
pub fn format_base(plan: &BuildPlan, key: u64) -> PathBuf {
    folder(plan).join(format!("{}-{key:016x}", plan.job))
}

/// Marks a preamble that must not be precompiled (its format failed).
fn bad_marker(plan: &BuildPlan, key: u64) -> PathBuf {
    folder(plan).join(format!("{}-{key:016x}.bad", plan.job))
}

/// The format to use now, if it is ready.
pub fn ready(plan: &BuildPlan, key: u64) -> Option<PathBuf> {
    let base = format_base(plan, key);
    (base.with_extension("fmt").is_file() && !bad_marker(plan, key).exists()).then_some(base)
}

/// Remembers that the format of `key` does not work (the next builds
/// compile the preamble normally, until it changes).
pub fn abandon(plan: &BuildPlan, key: u64) {
    let _ = std::fs::remove_file(format_base(plan, key).with_extension("fmt"));
    let _ = std::fs::create_dir_all(folder(plan));
    let _ = std::fs::write(bad_marker(plan, key), b"");
}

/// Formats being built (one at a time per preamble).
static BUILDING: LazyLock<Mutex<HashSet<PathBuf>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// Builds the format of `key` in the background, unless it exists, failed
/// before or is being built.
pub fn prepare_in_background(
    plan: &BuildPlan,
    dist: &Distribution,
    env: Vec<(String, String)>,
    key: u64,
) {
    let base = format_base(plan, key);
    if base.with_extension("fmt").is_file() || bad_marker(plan, key).exists() {
        return;
    }
    {
        let mut building = BUILDING.lock().unwrap_or_else(|e| e.into_inner());
        if !building.insert(base.clone()) {
            return;
        }
    }
    let plan = plan.clone();
    let dist = dist.clone();
    std::thread::spawn(move || {
        let ok = build_format(&plan, &dist, &env, key);
        if !ok {
            abandon(&plan, key);
        }
        BUILDING
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&base);
    });
}

/// Dumps the preamble of `plan` into its format. Returns whether it worked.
pub fn build_format(
    plan: &BuildPlan,
    dist: &Distribution,
    env: &[(String, String)],
    key: u64,
) -> bool {
    let dir = folder(plan);
    if std::fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let base = format_base(plan, key);
    let name = base
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    // Written under a temporary name, renamed once complete.
    let tmp = format!("{name}-tmp");
    let mut cmd = dist
        .engine_cmd(Engine::Pdflatex, false)
        .cwd(&plan.root_dir)
        .args(["-ini", "-interaction=nonstopmode", "-halt-on-error"])
        .arg(format!("-jobname={tmp}"))
        .arg(format!("-output-directory={}", dir.display()));
    for (k, v) in env {
        cmd = cmd.env(k.clone(), v.clone());
    }
    let cmd = cmd.stopping_with_app().args([
        "&pdflatex".to_owned(),
        "mylatexformat.ltx".to_owned(),
        plan.root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    ]);
    let ok = process::output(&cmd, Duration::from_secs(120)).is_ok_and(|o| o.code == Some(0));
    let made = dir.join(format!("{tmp}.fmt"));
    let _ = std::fs::remove_file(dir.join(format!("{tmp}.log")));
    if !ok || !made.is_file() {
        let _ = std::fs::remove_file(&made);
        return false;
    }
    if std::fs::rename(&made, base.with_extension("fmt")).is_err() {
        return false;
    }
    // Formats of former preambles of this document are not needed any more.
    if let Ok(rd) = std::fs::read_dir(&dir) {
        let keep = base.with_extension("fmt");
        for entry in rd.flatten() {
            let p = entry.path();
            let file = p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            if p != keep && file.starts_with(&format!("{}-", plan.job)) && file.ends_with(".fmt") {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preamble_and_safety() {
        let src = "\\documentclass{article}\n% \\makeindex\n\\usepackage[french]{babel}\n\\usepackage{amsmath, tikz}\n\\begin{document}\n\\makeindex\n";
        let p = preamble_of(src).unwrap();
        assert!(p.contains("\\usepackage{amsmath, tikz}") && !p.contains("makeindex"));
        assert_eq!(unsafe_reason(&p), None);
        assert_eq!(packages(&p), ["babel", "amsmath", "tikz"]);
        assert_eq!(
            unsafe_reason("\\usepackage[cache=false]{minted}"),
            Some("minted".into())
        );
        assert_eq!(
            unsafe_reason("\\usepackage{makeidx}\n\\makeindex"),
            Some("\\makeindex".into())
        );
        assert_eq!(
            unsafe_reason("\\input{\\jobname.cfg}"),
            Some("\\jobname".into())
        );
        assert_eq!(
            preamble_of("\\documentclass{article}\n\\usepackage{x}"),
            None
        );
    }

    /// Every pdfLaTeX template, built normally then with its precompiled
    /// preamble: same pages, same errors, faster passes.
    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn templates_build_the_same_with_a_format() {
        use std::sync::atomic::AtomicBool;

        use crate::build::{DocumentFacts, RunContext, plan, run};
        use crate::i18n::Lang;

        let dist = crate::tex::detect(&[]).into_iter().next().expect("no TeX");
        let dir = tempfile::tempdir().unwrap();
        let settings = BuildSettings::default();
        let cancel = AtomicBool::new(false);
        let source = |path: &Path| std::fs::read_to_string(path).ok();
        let ctx = RunContext {
            dist: &dist,
            settings: &settings,
            cancel: &cancel,
            lang: Lang::Fr,
            source: &source,
            packages: None,
            background: false,
        };
        for t in crate::templates::list(None) {
            let root = dir.path().join(&t.id);
            let main = crate::templates::write_files(
                &t.id,
                &root,
                &crate::templates::example_values(Lang::Fr),
                None,
            )
            .unwrap();
            let text = std::fs::read_to_string(&main).unwrap();
            let index = crate::syntax::scan(&text);
            let facts = DocumentFacts::from_indexes([&index]);
            let p = plan(&main, &settings, Some(&dist), &facts, Lang::Fr).unwrap();
            if !applies(&p, &settings, &dist) {
                eprintln!("{}: {} (not precompiled)", t.id, p.engine.label());
                continue;
            }
            let pre = preamble_of(&text).unwrap();
            if let Some(reason) = unsafe_reason(&pre) {
                eprintln!("{}: not precompiled ({reason})", t.id);
                continue;
            }
            let normal = run(&p, &ctx, &mut |_| {});
            let k = key(&p, &settings, &dist, &pre);
            let env = p.env(&dist);
            assert!(build_format(&p, &dist, &env, k), "{}: format", t.id);
            assert!(ready(&p, k).is_some());
            let fast = run(&p, &ctx, &mut |_| {});
            let used = fast
                .steps
                .iter()
                .all(|s| s.exit_code == Some(0) || s.exit_code.is_none());
            assert_eq!(
                normal.success, fast.success,
                "{}: {:?}",
                t.id, fast.diagnostics
            );
            assert_eq!(normal.pages, fast.pages, "{}", t.id);
            assert!(ready(&p, k).is_some(), "{}: format abandoned", t.id);
            let first = |o: &crate::build::BuildOutcome| {
                o.steps.first().map(|s| s.duration_ms).unwrap_or(0)
            };
            eprintln!(
                "{}: first pass {} ms → {} ms ({} pages, clean {used})",
                t.id,
                first(&normal),
                first(&fast),
                fast.pages.unwrap_or(0)
            );
        }
    }
}
