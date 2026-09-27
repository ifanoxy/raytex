//! Compilation.
//!
//! [`plan`] decides *how* to compile a root document (engine, driver,
//! bibliography tool, output directory) from the settings, the project
//! configuration, magic comments and the document itself. [`run`] executes
//! the plan, streaming output as [`BuildEvent`]s, then parses the logs into
//! diagnostics located precisely in the sources.
//!
//! Drivers:
//! * **smart** (default): labaguetex's own loop — engine, then Biber/BibTeX,
//!   makeindex, glossaries or nomenclature only when their inputs changed,
//!   then reruns only while LaTeX asks for them. No Perl needed.
//! * **latexmk**, **single pass** (fastest preview), **Tectonic**, and
//!   **custom** step lists.

pub mod refine;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};

use crate::diagnostics::{Diagnostic, Severity, Source};
use crate::i18n::Lang;
use crate::log::{self, LogReport, bibtex};
use crate::process::{self, Cmd, Stream};
use crate::settings::{BibTool, BuildSettings, BuildTool, CustomStep};
use crate::syntax::DocumentIndex;
use crate::tex::{Distribution, DistroKind, Engine};

/// Facts about the document that influence the build.
#[derive(Debug, Clone, Default)]
pub struct DocumentFacts {
    /// `% !TEX program`.
    pub magic_program: Option<String>,
    /// `% !BIB program`.
    pub magic_bib: Option<String>,
    /// Packages loaded anywhere in the project.
    pub packages: Vec<String>,
    /// Options of `biblatex` (for `backend=`).
    pub biblatex_options: Vec<String>,
    /// `\bibliography{…}` is used.
    pub uses_bibtex_command: bool,
}

impl DocumentFacts {
    /// Collects facts from the indexes of the project's files (root first).
    pub fn from_indexes<'a>(indexes: impl IntoIterator<Item = &'a DocumentIndex>) -> Self {
        let mut f = DocumentFacts::default();
        for (i, idx) in indexes.into_iter().enumerate() {
            if i == 0 {
                f.magic_program = idx.magic.program.clone();
                f.magic_bib = idx.magic.bib_program.clone();
            }
            for p in &idx.packages {
                if !f.packages.contains(&p.name) {
                    f.packages.push(p.name.clone());
                }
                if p.name == "biblatex" {
                    f.biblatex_options.extend(p.options.iter().cloned());
                }
            }
            if idx
                .includes
                .iter()
                .any(|inc| inc.kind == crate::syntax::IncludeKind::Bibliography)
            {
                f.uses_bibtex_command = true;
            }
        }
        f
    }

    fn uses(&self, p: &str) -> bool {
        self.packages.iter().any(|x| x == p)
    }
}

/// How a build will run.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildPlan {
    /// Root document.
    pub root: PathBuf,
    /// Job name (root file stem).
    pub job: String,
    /// Directory containing the root.
    pub root_dir: PathBuf,
    /// Output directory.
    pub out_dir: PathBuf,
    /// Engine.
    pub engine: Engine,
    /// Why this engine was chosen (for the UI).
    pub engine_reason: String,
    /// Driver actually used.
    pub tool: BuildTool,
    /// Bibliography tool, if any.
    pub bib_tool: Option<BibTool>,
    /// Expected PDF.
    pub pdf: PathBuf,
    /// Log file.
    pub log: PathBuf,
    /// SyncTeX file.
    pub synctex: PathBuf,
}

/// Why a build cannot start.
#[derive(Debug, Clone, thiserror::Error, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "detail")]
pub enum BuildError {
    /// No TeX distribution.
    #[error("no TeX distribution found")]
    NoDistribution,
    /// The chosen engine is not installed.
    #[error("{0} is not available in this distribution")]
    EngineMissing(String),
    /// The root file does not exist.
    #[error("file not found: {0}")]
    RootNotFound(String),
    /// A tool is missing (latexmk…).
    #[error("{0} is not installed")]
    ToolMissing(String),
}

impl BuildError {
    /// A diagnostic explaining the problem to the user.
    pub fn to_diagnostic(&self, lang: Lang) -> Diagnostic {
        let msg = match self {
            BuildError::NoDistribution => lang
                .pick(
                    "Aucune distribution TeX n'a été trouvée. Ouvrez l'assistant d'installation (Réglages → Distribution LaTeX).",
                    "No TeX distribution was found. Open the setup assistant (Settings → LaTeX distribution).",
                )
                .to_owned(),
            BuildError::EngineMissing(e) => format!(
                "{e} {}",
                lang.pick("n'est pas disponible dans la distribution choisie.", "is not available in the selected distribution.")
            ),
            BuildError::RootNotFound(f) => format!("{} {f}", lang.pick("Fichier introuvable :", "File not found:")),
            BuildError::ToolMissing(t) => format!(
                "{t} {}",
                lang.pick("n'est pas installé : choisissez le compilateur intégré dans les réglages.", "is not installed: choose the built-in driver in the settings.")
            ),
        };
        Diagnostic::new(Severity::Error, Source::Build, msg).with_code("build-setup")
    }
}

/// Decides how to compile `root`.
pub fn plan(
    root: &Path,
    settings: &BuildSettings,
    dist: Option<&Distribution>,
    facts: &DocumentFacts,
    lang: Lang,
) -> Result<BuildPlan, BuildError> {
    let dist = dist.ok_or(BuildError::NoDistribution)?;
    if !root.is_file() {
        return Err(BuildError::RootNotFound(root.display().to_string()));
    }
    let root_dir = root.parent().unwrap_or(Path::new(".")).to_path_buf();
    let job = root
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".into());
    let out_dir = if settings.out_dir.trim().is_empty() || settings.out_dir == "." {
        root_dir.clone()
    } else {
        log::normalize(&root_dir.join(&settings.out_dir))
    };

    let (engine, engine_reason) = choose_engine(settings, dist, facts, lang)?;
    if !dist.has_engine(engine) {
        return Err(BuildError::EngineMissing(engine.label().into()));
    }
    let tool = match (engine, settings.tool) {
        (Engine::Tectonic, _) => BuildTool::Auto,
        (_, BuildTool::Latexmk) if dist.tool("latexmk").is_none() => {
            return Err(BuildError::ToolMissing("latexmk".into()));
        }
        (_, t) => t,
    };
    let bib_tool = choose_bib(settings, facts);
    Ok(BuildPlan {
        pdf: out_dir.join(format!("{job}.pdf")),
        log: out_dir.join(format!("{job}.log")),
        synctex: out_dir.join(format!("{job}.synctex.gz")),
        root: root.to_path_buf(),
        job,
        root_dir,
        out_dir,
        engine,
        engine_reason,
        tool,
        bib_tool,
    })
}

fn choose_engine(
    settings: &BuildSettings,
    dist: &Distribution,
    facts: &DocumentFacts,
    lang: Lang,
) -> Result<(Engine, String), BuildError> {
    if let Some(e) = settings.engine.engine() {
        return Ok((
            e,
            lang.pick("choisi dans les réglages", "chosen in the settings")
                .into(),
        ));
    }
    if let Some(e) = facts.magic_program.as_deref().and_then(Engine::parse) {
        return Ok((
            e,
            lang.pick(
                "commentaire magique % !TEX program",
                "magic comment % !TEX program",
            )
            .into(),
        ));
    }
    if dist.kind == DistroKind::Tectonic {
        return Ok((Engine::Tectonic, "Tectonic".into()));
    }
    let lua_only = [
        "luacode",
        "luatexja",
        "luaotfload",
        "lua-visual-debug",
        "luamplib",
        "lualatex-math",
        "emoji",
    ];
    let unicode = [
        "fontspec",
        "unicode-math",
        "polyglossia",
        "xeCJK",
        "xunicode",
        "xltxtra",
        "mathspec",
    ];
    if let Some(p) = facts
        .packages
        .iter()
        .find(|p| lua_only.contains(&p.as_str()))
    {
        return Ok((
            Engine::Lualatex,
            format!("{} {p}", lang.pick("requis par", "required by")),
        ));
    }
    if let Some(p) = facts
        .packages
        .iter()
        .find(|p| unicode.contains(&p.as_str()))
    {
        let e = if dist.has_engine(Engine::Lualatex) {
            Engine::Lualatex
        } else {
            Engine::Xelatex
        };
        return Ok((e, format!("{} {p}", lang.pick("requis par", "required by"))));
    }
    Ok((Engine::Pdflatex, lang.pick("par défaut", "default").into()))
}

fn choose_bib(settings: &BuildSettings, facts: &DocumentFacts) -> Option<BibTool> {
    match settings.bib_tool {
        BibTool::None => return None,
        BibTool::Biber => return Some(BibTool::Biber),
        BibTool::Bibtex => return Some(BibTool::Bibtex),
        BibTool::Auto => {}
    }
    match facts.magic_bib.as_deref() {
        Some("biber") => return Some(BibTool::Biber),
        Some("bibtex" | "bibtex8" | "bibtexu") => return Some(BibTool::Bibtex),
        _ => {}
    }
    if facts.uses("biblatex") {
        let bibtex_backend = facts
            .biblatex_options
            .iter()
            .any(|o| o.replace(' ', "").starts_with("backend=bibtex"));
        return Some(if bibtex_backend {
            BibTool::Bibtex
        } else {
            BibTool::Biber
        });
    }
    if facts.uses_bibtex_command || facts.uses("natbib") {
        return Some(BibTool::Bibtex);
    }
    None
}

/// Something that happened during a build.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum BuildEvent {
    /// A step starts.
    Step {
        /// Display name ("pdfLaTeX (2)").
        name: String,
        /// Command line.
        command: String,
    },
    /// A line of output.
    Output {
        /// Stream.
        stream: Stream,
        /// Text.
        line: String,
    },
}

/// Summary of a step.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepSummary {
    /// Display name.
    pub name: String,
    /// Duration.
    pub duration_ms: u64,
    /// Exit code.
    pub exit_code: Option<i32>,
}

/// Result of a build.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildOutcome {
    /// No error and a PDF was produced.
    pub success: bool,
    /// Stopped by the user.
    pub cancelled: bool,
    /// The PDF, if it exists.
    pub pdf: Option<PathBuf>,
    /// Whether the PDF was (re)written by this build.
    pub pdf_updated: bool,
    /// Total duration.
    pub duration_ms: u64,
    /// Errors, warnings, bad boxes.
    pub diagnostics: Vec<Diagnostic>,
    /// Page count.
    pub pages: Option<u32>,
    /// Steps executed.
    pub steps: Vec<StepSummary>,
    /// Files TeX could not find (for one-click installation).
    pub missing_files: Vec<String>,
    /// Engine used.
    pub engine: Engine,
    /// The plan.
    pub plan: BuildPlan,
}

/// Environment of a build run.
#[allow(missing_debug_implementations)]
pub struct RunContext<'a> {
    /// Distribution.
    pub dist: &'a Distribution,
    /// Effective settings.
    pub settings: &'a BuildSettings,
    /// Cancellation flag.
    pub cancel: &'a AtomicBool,
    /// Message language.
    pub lang: Lang,
    /// Current text of a source file (editor buffers first, then disk).
    pub source: &'a dyn Fn(&Path) -> Option<String>,
}

struct Runner<'a, 'b> {
    ctx: &'a RunContext<'b>,
    plan: &'a BuildPlan,
    events: &'a mut dyn FnMut(BuildEvent),
    steps: Vec<StepSummary>,
    cancelled: bool,
    ran_bib: Option<BibTool>,
    deadline: Instant,
}

/// Runs a build.
pub fn run(
    plan: &BuildPlan,
    ctx: &RunContext<'_>,
    events: &mut dyn FnMut(BuildEvent),
) -> BuildOutcome {
    let start = Instant::now();
    let started_at = SystemTime::now();
    let _ = std::fs::create_dir_all(&plan.out_dir);
    mirror_directories(&plan.root_dir, &plan.out_dir);
    let mut r = Runner {
        ctx,
        plan,
        events,
        steps: Vec::new(),
        cancelled: false,
        ran_bib: None,
        deadline: start + Duration::from_secs(ctx.settings.timeout_s.max(10) as u64),
    };
    let mut report = match (plan.engine, plan.tool) {
        (Engine::Tectonic, _) => r.tectonic(),
        (_, BuildTool::Latexmk) => r.latexmk(),
        (_, BuildTool::Single) => r.engine_pass(1).1,
        (_, BuildTool::Custom) => r.custom(),
        _ => r.smart(),
    };

    // Bibliography logs.
    let blg = plan.out_dir.join(format!("{}.blg", plan.job));
    if let Some(tool) = r.ran_bib
        && let Ok(text) = std::fs::read_to_string(&blg)
    {
        let mut d = match tool {
            BibTool::Biber => bibtex::parse_biber(&text, &plan.root_dir),
            _ => bibtex::parse_bibtex(&text, &plan.root_dir),
        };
        report.diagnostics.append(&mut d);
    }
    if !ctx.settings.show_badboxes {
        report
            .diagnostics
            .retain(|d| !matches!(d.code.as_deref(), Some("overfull-box" | "underfull-box")));
    }
    refine::refine_all(&mut report.diagnostics, ctx.source, ctx.lang);

    let pdf_meta = std::fs::metadata(&plan.pdf).ok();
    let pdf_updated = pdf_meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .is_some_and(|t| t >= started_at);
    let pdf = pdf_meta.map(|_| plan.pdf.clone());
    if pdf_updated && ctx.settings.copy_pdf_to_root && plan.out_dir != plan.root_dir {
        let _ = std::fs::copy(&plan.pdf, plan.root_dir.join(format!("{}.pdf", plan.job)));
    }
    let failed_step = r.steps.iter().any(|s| s.exit_code.is_some_and(|c| c != 0));
    let errors = report.error_count();
    BuildOutcome {
        success: !r.cancelled && errors == 0 && !failed_step && pdf.is_some(),
        cancelled: r.cancelled,
        pdf,
        pdf_updated,
        duration_ms: start.elapsed().as_millis() as u64,
        diagnostics: report.diagnostics,
        pages: report.pages,
        steps: r.steps,
        missing_files: report.missing_files,
        engine: plan.engine,
        plan: plan.clone(),
    }
}

impl BuildPlan {
    /// Environment variables for TeX tools.
    fn env(&self, dist: &Distribution) -> Vec<(String, String)> {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let root = self.root_dir.to_string_lossy();
        let mut env = vec![
            ("max_print_line".to_owned(), "10000".to_owned()),
            ("error_line".to_owned(), "254".to_owned()),
            ("half_error_line".to_owned(), "238".to_owned()),
            // Let tools running in the output directory find the sources.
            ("BIBINPUTS".to_owned(), format!("{root}{sep}")),
            ("BSTINPUTS".to_owned(), format!("{root}{sep}")),
            ("INDEXSTYLE".to_owned(), format!("{root}{sep}")),
            ("TEXINPUTS".to_owned(), format!("{root}{sep}")),
        ];
        if dist.kind == DistroKind::MikTex {
            env.retain(|(k, _)| !k.contains("_line"));
        }
        env
    }
}

impl Runner<'_, '_> {
    fn t<'s>(&self, fr: &'s str, en: &'s str) -> &'s str {
        self.ctx.lang.pick(fr, en)
    }

    fn cancelled(&self) -> bool {
        self.cancelled || self.ctx.cancel.load(Ordering::Relaxed)
    }

    /// Runs one command, streaming its output.
    fn step(&mut self, name: String, cmd: Cmd) -> Option<i32> {
        if self.cancelled() {
            self.cancelled = true;
            return None;
        }
        (self.events)(BuildEvent::Step {
            name: name.clone(),
            command: cmd.display(),
        });
        let start = Instant::now();
        let remaining = self
            .deadline
            .saturating_duration_since(Instant::now())
            .max(Duration::from_secs(5));
        let events = &mut self.events;
        let result =
            process::run_streaming(&cmd, self.ctx.cancel, Some(remaining), |stream, line| {
                (events)(BuildEvent::Output {
                    stream,
                    line: line.to_owned(),
                });
            });
        let code = match result {
            Ok(status) => {
                if status.cancelled {
                    self.cancelled = true;
                }
                status.code
            }
            Err(e) => {
                (self.events)(BuildEvent::Output {
                    stream: Stream::Stderr,
                    line: format!("{}: {e}", cmd.program.display()),
                });
                Some(-1)
            }
        };
        self.steps.push(StepSummary {
            name,
            duration_ms: start.elapsed().as_millis() as u64,
            exit_code: code,
        });
        code
    }

    fn engine_cmd(&self) -> Cmd {
        let plan = self.plan;
        let s = self.ctx.settings;
        let dist = self.ctx.dist;
        let mut cmd = dist.cmd(plan.engine.program()).cwd(&plan.root_dir);
        for (k, v) in plan.env(dist) {
            cmd = cmd.env(k, v);
        }
        if s.synctex {
            cmd = cmd.arg("-synctex=1");
        }
        cmd = cmd.args(["-interaction=nonstopmode", "-file-line-error"]);
        if s.halt_on_error {
            cmd = cmd.arg("-halt-on-error");
        }
        // Without the option, TeX Live keeps its *restricted* shell escape
        // (safe, needed by epstopdf); `-no-shell-escape` would disable it.
        if s.shell_escape {
            cmd = cmd.arg("-shell-escape");
        }
        if dist.kind == DistroKind::MikTex && s.miktex_auto_install {
            cmd = cmd.arg("-enable-installer");
        }
        if plan.engine == Engine::Latex {
            cmd = cmd.arg("-output-format=dvi");
        }
        cmd = cmd.arg(format!("-output-directory={}", plan.out_dir.display()));
        cmd = cmd.args(s.extra_args.iter().cloned());
        cmd.arg(
            plan.root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        )
    }

    /// One engine run; returns its exit code and parsed log.
    fn engine_pass(&mut self, pass: usize) -> (Option<i32>, LogReport) {
        let name = if pass > 1 {
            format!("{} ({pass})", self.plan.engine.label())
        } else {
            self.plan.engine.label().to_owned()
        };
        let code = self.step(name, self.engine_cmd());
        let report = self.read_log();
        (code, report)
    }

    fn read_log(&self) -> LogReport {
        let plan = self.plan;
        match std::fs::read(&plan.log) {
            Ok(bytes) => log::parse_log(
                &String::from_utf8_lossy(&bytes),
                &plan.root_dir,
                &plan.root,
                self.ctx.lang,
            ),
            Err(_) => LogReport::default(),
        }
    }

    fn smart(&mut self) -> LogReport {
        let plan = self.plan;
        let state_path = plan.out_dir.join(".labaguetex-build.json");
        let mut state: BuildState = std::fs::read_to_string(&state_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let (code, mut report) = self.engine_pass(1);
        if self.cancelled() || (code != Some(0) && report.fatal && !plan.pdf.exists()) {
            return report;
        }
        let aux_before = hash_file(&plan.out_dir.join(format!("{}.aux", plan.job)));
        let mut auxiliary_ran = false;

        // Bibliography.
        match plan.bib_tool {
            Some(BibTool::Biber) => {
                let bcf = plan.out_dir.join(format!("{}.bcf", plan.job));
                let bbl = plan.out_dir.join(format!("{}.bbl", plan.job));
                let h = hash_file(&bcf);
                if bcf.exists()
                    && (report.biber_needed
                        || h != state.bcf
                        || !bbl.exists()
                        || report.undefined_citations && state.bcf.is_none())
                {
                    if self.ctx.dist.tool("biber").is_none() {
                        report.diagnostics.push(
                            Diagnostic::new(
                                Severity::Error,
                                Source::Build,
                                self.t(
                                    "Biber est nécessaire (biblatex) mais n'est pas installé.",
                                    "Biber is required (biblatex) but not installed.",
                                ),
                            )
                            .with_code("biber-missing"),
                        );
                    } else {
                        let cmd = self
                            .ctx
                            .dist
                            .cmd("biber")
                            .cwd(&plan.root_dir)
                            .arg(format!("--output-directory={}", plan.out_dir.display()))
                            .arg(&plan.job);
                        self.step("Biber".into(), cmd);
                        self.ran_bib = Some(BibTool::Biber);
                        state.bcf = h;
                        auxiliary_ran = true;
                    }
                }
            }
            Some(BibTool::Bibtex) => {
                let aux = plan.out_dir.join(format!("{}.aux", plan.job));
                let bbl = plan.out_dir.join(format!("{}.bbl", plan.job));
                let text = std::fs::read_to_string(&aux).unwrap_or_default();
                let relevant: String = text
                    .lines()
                    .filter(|l| {
                        l.starts_with("\\citation")
                            || l.starts_with("\\bibdata")
                            || l.starts_with("\\bibstyle")
                    })
                    .collect();
                let h = Some(hash_str(&relevant));
                if text.contains("\\bibdata") && (h != state.citations || !bbl.exists()) {
                    let mut cmd = self
                        .ctx
                        .dist
                        .cmd("bibtex")
                        .cwd(&plan.out_dir)
                        .arg(&plan.job);
                    for (k, v) in plan.env(self.ctx.dist) {
                        cmd = cmd.env(k, v);
                    }
                    self.step("BibTeX".into(), cmd);
                    self.ran_bib = Some(BibTool::Bibtex);
                    state.citations = h;
                    auxiliary_ran = true;
                }
            }
            _ => {}
        }

        // Index, glossaries, nomenclature.
        let idx = plan.out_dir.join(format!("{}.idx", plan.job));
        let h = hash_file(&idx);
        if h.is_some() && h != state.idx && self.ctx.dist.tool("makeindex").is_some() {
            let mut cmd = self
                .ctx
                .dist
                .cmd("makeindex")
                .cwd(&plan.out_dir)
                .arg(format!("{}.idx", plan.job));
            for (k, v) in plan.env(self.ctx.dist) {
                cmd = cmd.env(k, v);
            }
            self.step("makeindex".into(), cmd);
            state.idx = h;
            auxiliary_ran = true;
        }
        let glo = plan.out_dir.join(format!("{}.glo", plan.job));
        let acn = plan.out_dir.join(format!("{}.acn", plan.job));
        let h = hash_str(&format!("{:?}{:?}", hash_file(&glo), hash_file(&acn)));
        if (glo.exists() || acn.exists()) && Some(h) != state.glossaries {
            let tool = ["makeglossaries-lite", "makeglossaries"]
                .into_iter()
                .find(|t| {
                    self.ctx.dist.tool(t).is_some()
                        || process::find_executable(t, std::slice::from_ref(&self.ctx.dist.bin_dir))
                            .is_some()
                });
            if let Some(tool) = tool {
                let cmd = self.ctx.dist.cmd(tool).cwd(&plan.out_dir).arg(&plan.job);
                self.step("glossaries".into(), cmd);
                state.glossaries = Some(h);
                auxiliary_ran = true;
            }
        }
        let nlo = plan.out_dir.join(format!("{}.nlo", plan.job));
        let h = hash_file(&nlo);
        if h.is_some() && h != state.nomencl && self.ctx.dist.tool("makeindex").is_some() {
            let cmd = self.ctx.dist.cmd("makeindex").cwd(&plan.out_dir).args([
                format!("{}.nlo", plan.job),
                "-s".into(),
                "nomencl.ist".into(),
                "-o".into(),
                format!("{}.nls", plan.job),
            ]);
            self.step("nomencl".into(), cmd);
            state.nomencl = h;
            auxiliary_ran = true;
        }
        let _ = std::fs::write(
            &state_path,
            serde_json::to_string(&state).unwrap_or_default(),
        );

        // Reruns while needed.
        let mut pass = 1;
        let mut aux = aux_before;
        while !self.cancelled() && pass < 5 && (auxiliary_ran || report.rerun_needed) {
            auxiliary_ran = false;
            pass += 1;
            let (_, r) = self.engine_pass(pass);
            report = r;
            let new_aux = hash_file(&plan.out_dir.join(format!("{}.aux", plan.job)));
            if new_aux == aux && pass > 2 {
                break; // Stable: further runs would not change anything.
            }
            aux = new_aux;
        }

        if plan.engine == Engine::Latex && !self.cancelled() {
            let cmd = self
                .ctx
                .dist
                .cmd("dvipdfmx")
                .cwd(&plan.out_dir)
                .arg(format!("{}.dvi", plan.job));
            self.step("dvipdfmx".into(), cmd);
        }
        report
    }

    fn latexmk(&mut self) -> LogReport {
        let plan = self.plan;
        let s = self.ctx.settings;
        let mode = match plan.engine {
            Engine::Pdflatex => "-pdf",
            Engine::Xelatex => "-pdfxe",
            Engine::Lualatex => "-pdflua",
            Engine::Latex => "-pdfdvi",
            Engine::Tectonic => "-pdf",
        };
        let mut cmd = self.ctx.dist.cmd("latexmk").cwd(&plan.root_dir);
        for (k, v) in plan.env(self.ctx.dist) {
            cmd = cmd.env(k, v);
        }
        cmd = cmd.args([mode, "-interaction=nonstopmode", "-file-line-error"]);
        if s.synctex {
            cmd = cmd.arg("-synctex=1");
        }
        if s.halt_on_error {
            cmd = cmd.arg("-halt-on-error");
        }
        if s.shell_escape {
            cmd = cmd.arg("-shell-escape");
        }
        if plan.bib_tool.is_none() {
            cmd = cmd.arg("-bibtex-");
        }
        cmd = cmd.arg(format!("-outdir={}", plan.out_dir.display()));
        cmd = cmd.args(s.extra_args.iter().cloned());
        cmd = cmd.arg(
            plan.root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        );
        self.step("latexmk".into(), cmd);
        self.ran_bib = plan.bib_tool;
        self.read_log()
    }

    fn tectonic(&mut self) -> LogReport {
        let plan = self.plan;
        let s = self.ctx.settings;
        let mut cmd = self.ctx.dist.cmd("tectonic").cwd(&plan.root_dir).args([
            "-X",
            "compile",
            "--keep-logs",
            "--keep-intermediates",
        ]);
        if s.synctex {
            cmd = cmd.arg("--synctex");
        }
        if s.shell_escape {
            cmd = cmd.args(["-Z", "shell-escape"]);
        }
        cmd = cmd.arg("--outdir").arg(plan.out_dir.display().to_string());
        cmd = cmd.arg(
            plan.root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        );
        self.step("Tectonic".into(), cmd);
        self.read_log()
    }

    fn custom(&mut self) -> LogReport {
        let plan = self.plan;
        let steps: Vec<CustomStep> = self.ctx.settings.custom_steps.clone();
        if steps.is_empty() {
            return self.smart();
        }
        let root_name = plan
            .root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let subst = |s: &str| {
            s.replace("%DOCFILE%", &root_name)
                .replace("%DOC%", &plan.job)
                .replace("%OUTDIR%", &plan.out_dir.to_string_lossy())
                .replace("%DIR%", &plan.root_dir.to_string_lossy())
                .replace("%ENGINE%", plan.engine.program())
        };
        for step in steps {
            let program = subst(&step.program);
            let tool_path = self
                .ctx
                .dist
                .tool(&program)
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from(&program));
            let mut cmd = Cmd::new(tool_path)
                .path_prefix(self.ctx.dist.bin_dir.clone())
                .cwd(&plan.root_dir)
                .args(step.args.iter().map(|a| subst(a)));
            for (k, v) in plan.env(self.ctx.dist) {
                cmd = cmd.env(k, v);
            }
            if program.contains("biber") {
                self.ran_bib = Some(BibTool::Biber);
            } else if program.contains("bibtex") {
                self.ran_bib = Some(BibTool::Bibtex);
            }
            let code = self.step(step.name.clone(), cmd);
            if code != Some(0) || self.cancelled() {
                break;
            }
        }
        self.read_log()
    }
}

/// Hashes of the inputs of auxiliary tools at their last run.
#[derive(Debug, Default, Serialize, Deserialize)]
struct BuildState {
    bcf: Option<u64>,
    citations: Option<u64>,
    idx: Option<u64>,
    glossaries: Option<u64>,
    nomencl: Option<u64>,
}

fn hash_str(s: &str) -> u64 {
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    h.finish()
}

fn hash_file(path: &Path) -> Option<u64> {
    let bytes = std::fs::read(path).ok()?;
    let mut h = DefaultHasher::new();
    bytes.hash(&mut h);
    Some(h.finish())
}

/// Creates in `out` the sub-directories of `root` that contain `.tex` files
/// (TeX writes the `.aux` of `\include{dir/file}` there and fails otherwise).
fn mirror_directories(root: &Path, out: &Path) {
    if out == root || !out.starts_with(root) {
        return;
    }
    let walker = ignore::WalkBuilder::new(root)
        .hidden(true)
        .max_depth(Some(6))
        .build();
    for entry in walker.flatten().take(10_000) {
        let path = entry.path();
        if path.starts_with(out) || !path.extension().is_some_and(|e| e == "tex") {
            continue;
        }
        if let Some(parent) = path.parent()
            && let Ok(rel) = parent.strip_prefix(root)
            && !rel.as_os_str().is_empty()
        {
            let _ = std::fs::create_dir_all(out.join(rel));
        }
    }
}

/// Auxiliary file extensions removed by [`clean`].
pub const AUX_EXTENSIONS: &[&str] = &[
    "aux",
    "log",
    "out",
    "toc",
    "lof",
    "lot",
    "lol",
    "loa",
    "bbl",
    "blg",
    "bcf",
    "run.xml",
    "fls",
    "fdb_latexmk",
    "synctex.gz",
    "synctex",
    "idx",
    "ilg",
    "ind",
    "nav",
    "snm",
    "vrb",
    "xdv",
    "dvi",
    "glo",
    "gls",
    "glg",
    "acn",
    "acr",
    "alg",
    "ist",
    "nlo",
    "nls",
    "thm",
    "ptc",
    "auxlock",
    "dpth",
    "md5",
    "pyg",
    "upa",
    "upb",
    "xwm",
    "listing",
    "loe",
    "brf",
    "tdo",
    "maf",
    "mtc",
    "mtc0",
    "soc",
    "slg",
    "syg",
    "sls",
];

/// Removes auxiliary files of `job` in `out_dir` (and sub-directories).
/// Only files with a known auxiliary extension are touched; the PDF is kept.
pub fn clean(out_dir: &Path, job: &str) -> usize {
    let mut removed = 0;
    let walker = ignore::WalkBuilder::new(out_dir)
        .hidden(false)
        .git_ignore(false)
        .max_depth(Some(6))
        .build();
    for entry in walker.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let is_aux = AUX_EXTENSIONS
            .iter()
            .any(|e| name.ends_with(&format!(".{e}")));
        let is_state = name == ".labaguetex-build.json";
        let belongs = path.parent() != Some(out_dir)
            || name.starts_with(&format!("{job}."))
            || name.starts_with(job);
        if ((is_aux && belongs) || is_state) && std::fs::remove_file(path).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn fake_dist(engines: &[Engine], kind: DistroKind) -> Distribution {
        Distribution {
            id: "test".into(),
            kind,
            name: "Test".into(),
            version: None,
            bin_dir: PathBuf::from("/nonexistent"),
            tools: BTreeMap::new(),
            engines: engines.to_vec(),
            package_manager: crate::tex::PackageManager::None,
        }
    }

    #[test]
    fn engine_and_bib_selection() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("main.tex");
        std::fs::write(&root, "x").unwrap();
        let all = [Engine::Pdflatex, Engine::Xelatex, Engine::Lualatex];
        let dist = fake_dist(&all, DistroKind::TexLive);
        let s = BuildSettings::default();
        let facts = DocumentFacts {
            packages: vec!["fontspec".into(), "biblatex".into()],
            ..Default::default()
        };
        let p = plan(&root, &s, Some(&dist), &facts, Lang::En).unwrap();
        assert_eq!(p.engine, Engine::Lualatex);
        assert_eq!(p.bib_tool, Some(BibTool::Biber));
        assert_eq!(p.out_dir, log::normalize(&dir.path().join("build")));
        let facts = DocumentFacts {
            magic_program: Some("xelatex".into()),
            uses_bibtex_command: true,
            ..Default::default()
        };
        let p = plan(&root, &s, Some(&dist), &facts, Lang::En).unwrap();
        assert_eq!(p.engine, Engine::Xelatex);
        assert_eq!(p.bib_tool, Some(BibTool::Bibtex));
        let p = plan(&root, &s, Some(&dist), &DocumentFacts::default(), Lang::En).unwrap();
        assert_eq!(p.engine, Engine::Pdflatex);
        assert_eq!(p.bib_tool, None);
        assert!(matches!(
            plan(&root, &s, None, &DocumentFacts::default(), Lang::En),
            Err(BuildError::NoDistribution)
        ));
        let only_pdf = fake_dist(&[Engine::Pdflatex], DistroKind::TexLive);
        let facts = DocumentFacts {
            magic_program: Some("lualatex".into()),
            ..Default::default()
        };
        assert!(matches!(
            plan(&root, &s, Some(&only_pdf), &facts, Lang::En),
            Err(BuildError::EngineMissing(_))
        ));
    }

    /// Full compilation with the local TeX installation.
    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn compiles_real_documents() {
        let dist = crate::tex::detect(&[]).into_iter().next().expect("no TeX");
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        std::fs::create_dir_all(p.join("chapters")).unwrap();
        std::fs::write(p.join("refs.bib"), "@book{knuth, author={Knuth, Donald}, title={The TeXbook}, year=1984, publisher={AW}}\n").unwrap();
        std::fs::write(
            p.join("chapters/one.tex"),
            "\\section{One}\\label{sec:one}\nSee \\cite{knuth} and \\ref{sec:one}.\n",
        )
        .unwrap();
        std::fs::write(
            p.join("main.tex"),
            "\\documentclass{article}\n\\usepackage[backend=biber]{biblatex}\n\\addbibresource{refs.bib}\n\\begin{document}\n\\include{chapters/one}\n\\textbff{x}\n\\printbibliography\n\\end{document}\n",
        )
        .unwrap();
        let root = p.join("main.tex");
        let settings = BuildSettings::default();
        let facts = DocumentFacts {
            packages: vec!["biblatex".into()],
            biblatex_options: vec!["backend=biber".into()],
            ..Default::default()
        };
        let plan = plan(&root, &settings, Some(&dist), &facts, Lang::Fr).unwrap();
        let cancel = AtomicBool::new(false);
        let source = |path: &Path| std::fs::read_to_string(path).ok();
        let ctx = RunContext {
            dist: &dist,
            settings: &settings,
            cancel: &cancel,
            lang: Lang::Fr,
            source: &source,
        };
        let mut lines = 0;
        let outcome = run(&plan, &ctx, &mut |e| {
            if let BuildEvent::Step { name, command } = &e {
                println!("STEP {name}: {command}");
            }
            if matches!(e, BuildEvent::Output { .. }) {
                lines += 1;
            }
        });
        println!(
            "{} ms, steps {:?}",
            outcome.duration_ms,
            outcome
                .steps
                .iter()
                .map(|s| (&s.name, s.duration_ms))
                .collect::<Vec<_>>()
        );
        for d in &outcome.diagnostics {
            println!(
                "{:?} {:?}:{:?} {:?} {}",
                d.severity,
                d.file.as_ref().map(|f| f.file_name()),
                d.line,
                d.range,
                d.message
            );
        }
        assert!(lines > 10);
        assert!(outcome.pdf.is_some() && outcome.pdf_updated);
        assert!(plan.synctex.exists());
        let err = outcome
            .diagnostics
            .iter()
            .find(|d| d.message.contains("Undefined control sequence"))
            .unwrap();
        assert_eq!(err.line, Some(6));
        let range = err.range.unwrap();
        assert_eq!(
            (range.start.character, range.end.character),
            (0, 8),
            "\\textbff highlighted"
        );
        assert!(
            !outcome
                .diagnostics
                .iter()
                .any(|d| d.message.contains("Citation")),
            "biber ran"
        );
        assert!(outcome.steps.iter().any(|s| s.name == "Biber"));
        // Second build: nothing changed, a single pass is enough.
        let outcome2 = run(&plan, &ctx, &mut |_| {});
        assert_eq!(
            outcome2.steps.len(),
            1,
            "{:?}",
            outcome2.steps.iter().map(|s| &s.name).collect::<Vec<_>>()
        );
        assert!(clean(&plan.out_dir, &plan.job) > 3);
        assert!(plan.pdf.exists(), "clean keeps the PDF");
    }
}
