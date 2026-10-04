//! `raytex` — the RayTeX command line.
//!
//! ```text
//! raytex doctor                 # TeX distributions, tools and advice
//! raytex build [main.tex]       # compile with the smart build loop
//! raytex lint  [file.tex]       # live diagnostics without compiling
//! raytex new article mon-projet --title "…" --lang fr
//! raytex install siunitx        # install packages with the distribution's manager
//! raytex clean | wordcount | templates
//! ```

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use clap::{Parser, Subcommand, ValueEnum};
use raytex_core::build::{self, BuildEvent, DocumentFacts, RunContext};
use raytex_core::diagnostics::{Diagnostic, Severity};
use raytex_core::i18n::Lang;
use raytex_core::lint::{self, LintOptions};
use raytex_core::settings::{BuildSettings, BuildTool, EngineChoice, Settings};
use raytex_core::tex::{self, Distribution, PackageAnalyzer, TexmfIndex, manager};
use raytex_core::workspace::{Workspace, project_root_for};
use raytex_core::{templates, wordcount};

#[derive(Parser)]
#[command(name = "raytex", version, about = "RayTeX from the command line", long_about = None)]
struct Cli {
    /// Message language (fr or en). Defaults to $LANG.
    #[arg(long, global = true)]
    lang: Option<String>,
    /// Output machine-readable JSON.
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Show TeX distributions, tools and advice.
    Doctor,
    /// Compile a document.
    Build {
        /// File to compile (its root document is found automatically).
        file: Option<PathBuf>,
        /// Engine.
        #[arg(long, value_enum)]
        engine: Option<EngineArg>,
        /// Driver.
        #[arg(long, value_enum)]
        tool: Option<ToolArg>,
        /// Allow external programs (minted, svg…).
        #[arg(long)]
        shell_escape: bool,
        /// Print the engine output.
        #[arg(short, long)]
        verbose: bool,
    },
    /// Check a file without compiling.
    Lint {
        /// File to check.
        file: Option<PathBuf>,
    },
    /// Create a project from a template.
    New {
        /// Template id (see `raytex templates`).
        template: String,
        /// Folder to create.
        dir: PathBuf,
        #[arg(long, default_value = "")]
        title: String,
        #[arg(long, default_value = "")]
        author: String,
        #[arg(long, default_value = "")]
        institution: String,
    },
    /// List templates.
    Templates,
    /// Install packages (names like `siunitx` or files like `foo.sty`).
    Install {
        /// Packages or files.
        packages: Vec<String>,
        /// Install in the user's own tree (TeX Live, no admin rights).
        #[arg(long)]
        user: bool,
        /// Only print the commands.
        #[arg(long)]
        dry_run: bool,
    },
    /// Remove auxiliary files.
    Clean {
        /// File whose build directory is cleaned.
        file: Option<PathBuf>,
    },
    /// Count words.
    Wordcount {
        /// File to count (the whole project of its root).
        file: Option<PathBuf>,
    },
}

#[derive(Clone, Copy, ValueEnum)]
enum EngineArg {
    Pdflatex,
    Xelatex,
    Lualatex,
    Latex,
    Tectonic,
}

#[derive(Clone, Copy, ValueEnum)]
enum ToolArg {
    Auto,
    Latexmk,
    Single,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let lang = Lang::from_tag(
        &cli.lang
            .clone()
            .or_else(|| std::env::var("LANG").ok())
            .unwrap_or_default(),
    );
    match run(cli, lang) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("raytex: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli, lang: Lang) -> Result<ExitCode, String> {
    let settings = load_settings();
    match cli.command {
        Command::Doctor => doctor(&settings, lang, cli.json),
        Command::Build {
            file,
            engine,
            tool,
            shell_escape,
            verbose,
        } => {
            let mut b = settings.build.clone();
            if let Some(e) = engine {
                b.engine = match e {
                    EngineArg::Pdflatex => EngineChoice::Pdflatex,
                    EngineArg::Xelatex => EngineChoice::Xelatex,
                    EngineArg::Lualatex => EngineChoice::Lualatex,
                    EngineArg::Latex => EngineChoice::Latex,
                    EngineArg::Tectonic => EngineChoice::Tectonic,
                };
            }
            if let Some(t) = tool {
                b.tool = match t {
                    ToolArg::Auto => BuildTool::Auto,
                    ToolArg::Latexmk => BuildTool::Latexmk,
                    ToolArg::Single => BuildTool::Single,
                };
            }
            b.shell_escape |= shell_escape;
            build_cmd(file, &b, lang, verbose, cli.json)
        }
        Command::Lint { file } => {
            let file = resolve_file(file)?;
            let ws = Workspace::open(&project_root_for(&file));
            let index = distribution(&settings).ok().map(|d| TexmfIndex::build(&d));
            let opts = LintOptions {
                lang,
                style_hints: true,
                installed: index.as_ref(),
                ..Default::default()
            };
            let diags = lint::lint(&ws, &file, &opts);
            print_diagnostics(&diags, cli.json);
            Ok(if diags.iter().any(|d| d.severity == Severity::Error) {
                ExitCode::FAILURE
            } else {
                ExitCode::SUCCESS
            })
        }
        Command::New {
            template,
            dir,
            title,
            author,
            institution,
        } => {
            let values = templates::TemplateValues {
                title,
                author,
                institution,
                language: lang.code().into(),
            };
            let main = templates::instantiate(&template, &dir, &values, None)
                .map_err(|e| e.to_string())?;
            println!("{}", main.display());
            Ok(ExitCode::SUCCESS)
        }
        Command::Templates => {
            for t in templates::list(None) {
                println!("{:<18} {:<10} {}", t.id, t.category, t.name.get(lang));
            }
            Ok(ExitCode::SUCCESS)
        }
        Command::Install {
            packages,
            user,
            dry_run,
        } => {
            let dist = distribution(&settings)?;
            let (files, names): (Vec<String>, Vec<String>) =
                packages.into_iter().partition(|p| p.contains('.'));
            let mut plans = Vec::new();
            if !names.is_empty() {
                plans.extend(manager::install_packages(&dist, &names, user));
            }
            if !files.is_empty() {
                plans.extend(manager::install_files(&dist, &files, user));
            }
            if plans.is_empty() {
                println!(
                    "{}",
                    lang.pick(
                        "Rien à installer (ou gestionnaire indisponible).",
                        "Nothing to install (or no package manager)."
                    )
                );
                return Ok(ExitCode::SUCCESS);
            }
            for plan in plans {
                eprintln!("{}", plan.note.get(lang));
                for step in &plan.steps {
                    let step = if plan.needs_admin {
                        raytex_core::process::elevated(step)
                    } else {
                        step.clone()
                    };
                    println!("$ {}", step.display());
                    if dry_run {
                        continue;
                    }
                    let never = AtomicBool::new(false);
                    let status =
                        raytex_core::process::run_streaming(&step, &never, None, |_, line| {
                            println!("{line}")
                        })
                        .map_err(|e| e.to_string())?;
                    if status.code != Some(0) {
                        return Ok(ExitCode::FAILURE);
                    }
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        Command::Clean { file } => {
            let file = resolve_file(file)?;
            let ws = Workspace::open(&project_root_for(&file));
            let root = ws.root_for(&file);
            let b = ws.config.effective_build(&settings.build);
            let out = root.parent().unwrap_or(Path::new(".")).join(&b.out_dir);
            let job = root
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let n = build::clean(&out, &job);
            println!("{n} {}", lang.pick("fichiers supprimés", "files removed"));
            Ok(ExitCode::SUCCESS)
        }
        Command::Wordcount { file } => {
            let file = resolve_file(file)?;
            let ws = Workspace::open(&project_root_for(&file));
            let root = ws.root_for(&file);
            let mut total = wordcount::WordCount::default();
            for doc in ws.project_documents(&root) {
                total += wordcount::count(&doc.text, &doc.index);
            }
            if cli.json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&total).unwrap_or_default()
                );
            } else {
                println!(
                    "{} {}, {} {}, {} {}, {} {}, {} {}",
                    total.words,
                    lang.pick("mots", "words"),
                    total.headings,
                    lang.pick("titres", "headings"),
                    total.inline_math + total.display_math,
                    lang.pick("formules", "formulas"),
                    total.figures,
                    lang.pick("figures", "figures"),
                    total.tables,
                    lang.pick("tableaux", "tables")
                );
            }
            Ok(ExitCode::SUCCESS)
        }
    }
}

fn load_settings() -> Settings {
    raytex_core::settings::app_dirs()
        .map(|d| Settings::load(&d.config_dir().join("settings.toml")))
        .unwrap_or_default()
}

fn distribution(settings: &Settings) -> Result<Distribution, String> {
    let all = tex::detect(&settings.build.extra_bin_dirs);
    let chosen = settings
        .build
        .distribution
        .as_ref()
        .and_then(|id| all.iter().find(|d| &d.id == id).cloned());
    chosen
        .or_else(|| all.into_iter().next())
        .ok_or_else(|| "no TeX distribution found (run `raytex doctor`)".into())
}

fn resolve_file(file: Option<PathBuf>) -> Result<PathBuf, String> {
    let file = match file {
        Some(f) => f,
        None => {
            let ws = Workspace::open(Path::new("."));
            ws.root_candidates()
                .into_iter()
                .next()
                .ok_or("no .tex document found here")?
        }
    };
    dunce::canonicalize(&file).map_err(|e| format!("{}: {e}", file.display()))
}

fn doctor(settings: &Settings, lang: Lang, json: bool) -> Result<ExitCode, String> {
    let dists = tex::detect(&settings.build.extra_bin_dirs);
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&dists).unwrap_or_default()
        );
        return Ok(ExitCode::SUCCESS);
    }
    if dists.is_empty() {
        println!(
            "{}",
            lang.pick(
                "Aucune distribution TeX trouvée. Options d'installation :",
                "No TeX distribution found. Installation options:"
            )
        );
        for o in manager::distro_options() {
            println!(
                "  - {} ({}) — {}\n    {}",
                o.name,
                o.size,
                o.description.get(lang),
                o.url
            );
        }
        return Ok(ExitCode::FAILURE);
    }
    for d in &dists {
        println!("● {}  [{}]", d.name, d.bin_dir.display());
        println!(
            "  {}: {}",
            lang.pick("moteurs", "engines"),
            d.engines
                .iter()
                .map(|e| e.label())
                .collect::<Vec<_>>()
                .join(", ")
        );
        let tools: Vec<&str> = d.tools.keys().map(String::as_str).collect();
        println!("  {}: {}", lang.pick("outils", "tools"), tools.join(" "));
        println!(
            "  {}: {:?}",
            lang.pick("gestionnaire de packages", "package manager"),
            d.package_manager
        );
        for (tool, why) in [
            (
                "latexmk",
                lang.pick(
                    "optionnel (le compilateur intégré suffit)",
                    "optional (the built-in driver is enough)",
                ),
            ),
            (
                "biber",
                lang.pick("nécessaire pour biblatex", "needed by biblatex"),
            ),
            (
                "synctex",
                lang.pick(
                    "optionnel (SyncTeX est intégré)",
                    "optional (SyncTeX is built in)",
                ),
            ),
        ] {
            if d.tool(tool).is_none() {
                println!("  ⚠ {tool} {} — {why}", lang.pick("absent", "missing"));
            }
        }
    }
    let index = TexmfIndex::build(&dists[0]);
    println!(
        "{} {} {}",
        index.packages().len(),
        lang.pick("packages installés dans", "packages installed in"),
        dists[0].name
    );
    Ok(ExitCode::SUCCESS)
}

fn build_cmd(
    file: Option<PathBuf>,
    b: &BuildSettings,
    lang: Lang,
    verbose: bool,
    json: bool,
) -> Result<ExitCode, String> {
    let file = resolve_file(file)?;
    let ws = Workspace::open(&project_root_for(&file));
    let root = ws.root_for(&file);
    let b = ws.config.effective_build(b);
    let dist = distribution(&load_settings())?;
    let docs = ws.project_documents(&root);
    let facts = DocumentFacts::from_indexes(docs.iter().map(|d| &d.index));
    let plan = build::plan(&root, &b, Some(&dist), &facts, lang)
        .map_err(|e| e.to_diagnostic(lang).message)?;
    eprintln!(
        "{} {} ({}) → {}",
        lang.pick("Compilation avec", "Compiling with"),
        plan.engine.label(),
        plan.engine_reason,
        plan.pdf.display()
    );
    let cancel = AtomicBool::new(false);
    let source = |p: &Path| std::fs::read_to_string(p).ok();
    // The files of the distribution are only listed when a problem needs
    // to know what a package defines.
    let packages = || {
        Some(Arc::new(PackageAnalyzer::new(Arc::new(TexmfIndex::build(
            &dist,
        )))))
    };
    let ctx = RunContext {
        dist: &dist,
        settings: &b,
        cancel: &cancel,
        lang,
        source: &source,
        packages: Some(&packages),
        background: false,
    };
    let outcome = build::run(&plan, &ctx, &mut |e| match e {
        BuildEvent::Step { name, .. } => eprintln!("▸ {name}"),
        BuildEvent::Output { line, .. } if verbose => eprintln!("{line}"),
        _ => {}
    });
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&outcome).unwrap_or_default()
        );
    } else {
        print_diagnostics(&outcome.diagnostics, false);
        eprintln!(
            "{} {} ms, {} {}",
            if outcome.success { "✔" } else { "✘" },
            outcome.duration_ms,
            outcome.pages.unwrap_or(0),
            lang.pick("pages", "pages")
        );
    }
    Ok(if outcome.success {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

fn print_diagnostics(diags: &[Diagnostic], json: bool) {
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(diags).unwrap_or_default()
        );
        return;
    }
    for d in diags {
        let sev = match d.severity {
            Severity::Error => "\x1b[31merror\x1b[0m",
            Severity::Warning => "\x1b[33mwarning\x1b[0m",
            Severity::Info => "\x1b[36minfo\x1b[0m",
            Severity::Hint => "\x1b[2mhint\x1b[0m",
        };
        let place = match (&d.file, d.range, d.line) {
            (Some(f), Some(r), _) => format!(
                "{}:{}:{}",
                f.display(),
                r.start.line + 1,
                r.start.character + 1
            ),
            (Some(f), None, Some(l)) => format!("{}:{l}", f.display()),
            (Some(f), None, None) => f.display().to_string(),
            _ => String::new(),
        };
        println!("{place}: {sev}: {}", d.message);
        if let Some(h) = &d.hint {
            println!("    → {}", h.advice.as_deref().unwrap_or(&h.explanation));
        }
    }
}
