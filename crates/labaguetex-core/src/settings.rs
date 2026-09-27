//! Application settings (per user) and project configuration
//! (`labaguetex.toml`, versioned with the project).
//!
//! Every field has a default, so partial or older files always load.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::tex::Engine;

/// Version of the settings format written by this release (see [`Settings::load`]).
pub const SETTINGS_VERSION: u32 = 3;

/// Settings of the application, stored in the user's configuration directory.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Format version (0 when absent: files written before versioning).
    #[serde(default)]
    pub version: u32,
    /// Language, theme, session.
    pub general: GeneralSettings,
    /// Text editor.
    pub editor: EditorSettings,
    /// Compilation defaults (a project may override them).
    pub build: BuildSettings,
    /// PDF preview.
    pub viewer: ViewerSettings,
    /// Completion.
    pub completion: CompletionSettings,
    /// Linting.
    pub lint: LintSettings,
    /// User macros (snippets with triggers and shortcuts).
    pub macros: Vec<Macro>,
    /// Keyboard shortcut overrides: action id → key (e.g. `"build": "Mod-Enter"`).
    pub keybindings: std::collections::BTreeMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            general: GeneralSettings::default(),
            editor: EditorSettings::default(),
            build: BuildSettings::default(),
            viewer: ViewerSettings::default(),
            completion: CompletionSettings::default(),
            lint: LintSettings::default(),
            macros: Vec::new(),
            keybindings: std::collections::BTreeMap::new(),
        }
    }
}

/// General settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GeneralSettings {
    /// `system`, `fr` or `en`.
    pub language: String,
    /// `system`, `light` or `dark`.
    pub theme: String,
    /// Reopen the last project and files at start-up.
    pub restore_session: bool,
    /// Show the welcome tips for beginners.
    pub beginner_tips: bool,
    /// Hide auxiliary files (`.aux`, `.log`…) in the file explorer.
    pub hide_aux_files: bool,
    /// Folder of the projects (default: `labaguetex` in the documents folder).
    pub projects_dir: Option<PathBuf>,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            language: "system".into(),
            theme: "system".into(),
            restore_session: true,
            beginner_tips: true,
            hide_aux_files: true,
            projects_dir: None,
        }
    }
}

/// Editor settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct EditorSettings {
    /// Font family (CSS).
    pub font_family: String,
    /// Font size in pixels.
    pub font_size: u16,
    /// Line height factor.
    pub line_height: f32,
    /// Indentation width.
    pub tab_size: u8,
    /// Indent with tabs instead of spaces.
    pub use_tabs: bool,
    /// Soft-wrap long lines.
    pub word_wrap: bool,
    /// Show line numbers.
    pub line_numbers: bool,
    /// Highlight the current line.
    pub highlight_active_line: bool,
    /// Close brackets, braces and `$` automatically.
    pub auto_close_brackets: bool,
    /// Insert `\end{…}` after `\begin{…}` automatically.
    pub auto_close_environments: bool,
    /// Live preview of the formula under the cursor.
    pub math_preview: bool,
    /// Hover documentation.
    pub hover_docs: bool,
    /// Spell checking by the system (webview).
    pub spellcheck: bool,
    /// Vim key bindings.
    pub vim_mode: bool,
    /// Save automatically.
    pub auto_save: bool,
    /// Delay before automatic save (ms).
    pub auto_save_delay_ms: u32,
    /// Show fold markers.
    pub folding: bool,
    /// Show indentation guides and visible whitespace.
    pub show_whitespace: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_family:
                "\"JetBrains Mono\", \"Fira Code\", \"SF Mono\", Menlo, Consolas, monospace".into(),
            font_size: 14,
            line_height: 1.55,
            tab_size: 2,
            use_tabs: false,
            word_wrap: true,
            line_numbers: true,
            highlight_active_line: true,
            auto_close_brackets: true,
            auto_close_environments: true,
            math_preview: true,
            hover_docs: true,
            spellcheck: false,
            vim_mode: false,
            auto_save: true,
            auto_save_delay_ms: 1000,
            folding: true,
            show_whitespace: false,
        }
    }
}

/// When to compile automatically.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AutoBuild {
    /// Only on demand.
    Off,
    /// After each save.
    OnSave,
    /// While typing (after a pause): live preview.
    #[default]
    OnIdle,
}

/// Engine selection.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineChoice {
    /// Magic comment, then document analysis (fontspec → XeLaTeX…), then pdfLaTeX.
    #[default]
    Auto,
    /// pdfLaTeX.
    Pdflatex,
    /// XeLaTeX.
    Xelatex,
    /// LuaLaTeX.
    Lualatex,
    /// LaTeX (DVI) then dvipdfmx.
    Latex,
    /// Tectonic.
    Tectonic,
}

impl EngineChoice {
    /// The fixed engine, if any.
    pub fn engine(self) -> Option<Engine> {
        match self {
            Self::Auto => None,
            Self::Pdflatex => Some(Engine::Pdflatex),
            Self::Xelatex => Some(Engine::Xelatex),
            Self::Lualatex => Some(Engine::Lualatex),
            Self::Latex => Some(Engine::Latex),
            Self::Tectonic => Some(Engine::Tectonic),
        }
    }

    /// A fixed engine from its name (`lualatex`, `XeLaTeX`…).
    pub fn parse(name: &str) -> Option<Self> {
        Some(match Engine::parse(name)? {
            Engine::Pdflatex => Self::Pdflatex,
            Engine::Xelatex => Self::Xelatex,
            Engine::Lualatex => Self::Lualatex,
            Engine::Latex => Self::Latex,
            Engine::Tectonic => Self::Tectonic,
        })
    }
}

/// How the compilation is driven.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildTool {
    /// labaguetex's own build loop (engine, bibliography, index, reruns).
    #[default]
    Auto,
    /// latexmk.
    Latexmk,
    /// A single engine pass (fastest preview, no bibliography).
    Single,
    /// The steps of [`BuildSettings::custom_steps`].
    Custom,
}

/// Bibliography processor.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BibTool {
    /// Detected from the document (biblatex → biber, \bibliography → bibtex).
    #[default]
    Auto,
    /// Biber.
    Biber,
    /// BibTeX.
    Bibtex,
    /// Never run.
    None,
}

/// A custom build step: program and arguments with placeholders
/// `%DOC%` (root file without extension), `%DOCFILE%` (file name),
/// `%OUTDIR%`, `%ENGINE%`, `%DIR%` (root directory).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomStep {
    /// Display name.
    pub name: String,
    /// Program.
    pub program: String,
    /// Arguments.
    #[serde(default)]
    pub args: Vec<String>,
}

/// Compilation settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BuildSettings {
    /// Engine.
    pub engine: EngineChoice,
    /// Driver.
    pub tool: BuildTool,
    /// Bibliography processor.
    pub bib_tool: BibTool,
    /// Automatic compilation.
    pub auto_build: AutoBuild,
    /// Pause before compiling while typing (ms).
    pub auto_build_delay_ms: u32,
    /// Output directory, relative to the root file's directory.
    pub out_dir: String,
    /// Generate SyncTeX data (source ⇄ PDF navigation).
    pub synctex: bool,
    /// Allow running external programs (minted, svg…). Security risk with untrusted documents.
    pub shell_escape: bool,
    /// Stop at the first error (faster feedback) instead of trying to continue.
    pub halt_on_error: bool,
    /// Extra engine arguments.
    pub extra_args: Vec<String>,
    /// Custom steps (with [`BuildTool::Custom`]).
    pub custom_steps: Vec<CustomStep>,
    /// Maximum duration of a build (s).
    pub timeout_s: u32,
    /// Identifier of the distribution to use (default: the first found).
    pub distribution: Option<String>,
    /// Extra directories searched for TeX binaries.
    pub extra_bin_dirs: Vec<PathBuf>,
    /// Report under/overfull boxes.
    pub show_badboxes: bool,
    /// Let MiKTeX install missing packages while compiling.
    pub miktex_auto_install: bool,
    /// Copy the PDF next to the root file after a successful build.
    pub copy_pdf_to_root: bool,
    /// Precompile the preamble of pdfLaTeX documents (faster passes, see
    /// [`crate::build::preamble`]).
    pub precompile_preamble: bool,
}

impl Default for BuildSettings {
    fn default() -> Self {
        Self {
            engine: EngineChoice::Auto,
            tool: BuildTool::Auto,
            bib_tool: BibTool::Auto,
            auto_build: AutoBuild::OnIdle,
            auto_build_delay_ms: 600,
            out_dir: "build".into(),
            synctex: true,
            shell_escape: false,
            halt_on_error: false,
            extra_args: Vec::new(),
            custom_steps: Vec::new(),
            timeout_s: 300,
            distribution: None,
            extra_bin_dirs: Vec::new(),
            show_badboxes: true,
            miktex_auto_install: true,
            copy_pdf_to_root: false,
            precompile_preamble: true,
        }
    }
}

/// PDF preview settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ViewerSettings {
    /// Scroll the PDF to the cursor after each build.
    pub sync_after_build: bool,
    /// Invert PDF colours in dark theme.
    pub invert_in_dark: bool,
    /// `page-width`, `page-fit` or a percentage.
    pub default_zoom: String,
    /// Double-click in the PDF jumps to the source.
    pub double_click_sync: bool,
}

impl Default for ViewerSettings {
    fn default() -> Self {
        Self {
            sync_after_build: true,
            invert_in_dark: false,
            default_zoom: "page-width".into(),
            double_click_sync: true,
        }
    }
}

/// Completion settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CompletionSettings {
    /// Completion enabled.
    pub enabled: bool,
    /// Add the `\usepackage` of a completed command automatically.
    pub auto_add_package: bool,
    /// `@a` → `\alpha` shortcuts.
    pub at_shortcuts: bool,
    /// Offer snippets and macros.
    pub snippets: bool,
    /// Learn commands from the installed packages' sources.
    pub learn_from_packages: bool,
}

impl Default for CompletionSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add_package: true,
            at_shortcuts: true,
            snippets: true,
            learn_from_packages: true,
        }
    }
}

/// Lint settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct LintSettings {
    /// Linting enabled.
    pub enabled: bool,
    /// Show style hints (non-breaking spaces, quotes…).
    pub style_hints: bool,
    /// Disabled rule identifiers.
    pub disabled_rules: Vec<String>,
}

impl Default for LintSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            style_hints: true,
            disabled_rules: Vec::new(),
        }
    }
}

/// A user macro: text inserted by a trigger word or a keyboard shortcut.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Macro {
    /// Name shown in lists.
    pub name: String,
    /// Word that proposes the macro in completion (optional).
    #[serde(default)]
    pub trigger: String,
    /// Keyboard shortcut (CodeMirror notation, optional), e.g. `Mod-Alt-m`.
    #[serde(default)]
    pub key: String,
    /// Snippet body; `${1:name}` fields, `${SELECTION}` for the selected text.
    pub body: String,
    /// Only in math mode.
    #[serde(default)]
    pub math: bool,
}

impl Settings {
    /// Loads settings from TOML, falling back to defaults on any problem.
    /// Files of older versions are migrated.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| toml::from_str::<Self>(&s).ok())
            .map(Self::migrated)
            .unwrap_or_default()
    }

    /// Brings settings written by an older release up to date.
    pub fn migrated(mut self) -> Self {
        if self.version < 2 && self.build.auto_build == AutoBuild::OnSave {
            // Version 2: the preview follows the text by default. "After each
            // save" was the old default, not a choice (saving is automatic).
            self.build.auto_build = AutoBuild::OnIdle;
        }
        if self.version < 3 && self.build.auto_build_delay_ms == 800 {
            // Version 3: builds are faster (precompiled preambles), the
            // preview follows sooner. 800 ms was the old default.
            self.build.auto_build_delay_ms = 600;
        }
        self.version = SETTINGS_VERSION;
        self
    }

    /// Saves settings as TOML (atomically).
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let text = toml::to_string_pretty(self).map_err(std::io::Error::other)?;
        write_atomic(path, text.as_bytes())
    }
}

/// Writes a file atomically (temporary file + rename).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension(format!(
        "{}.lbt-tmp",
        path.extension()
            .map(|e| e.to_string_lossy().into_owned())
            .unwrap_or_default()
    ));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

// ---------------------------------------------------------------- project

/// Name of the project configuration file.
pub const PROJECT_FILE: &str = "labaguetex.toml";

/// Project configuration (`labaguetex.toml`). Every build field overrides
/// the application setting of the same name.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectConfig {
    /// Project metadata.
    pub project: ProjectSection,
    /// Build overrides.
    pub build: ProjectBuild,
    /// Lint overrides.
    pub lint: ProjectLint,
}

/// `[project]`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectSection {
    /// Display name.
    pub name: Option<String>,
    /// Main file, relative to the project folder.
    pub main: Option<String>,
    /// Spell-check language (`fr`, `en-GB`…).
    pub language: Option<String>,
}

/// `[build]` overrides.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectBuild {
    /// Engine.
    pub engine: Option<EngineChoice>,
    /// Driver.
    pub tool: Option<BuildTool>,
    /// Bibliography processor.
    pub bib_tool: Option<BibTool>,
    /// Output directory.
    pub out_dir: Option<String>,
    /// Shell escape.
    pub shell_escape: Option<bool>,
    /// Extra engine arguments.
    pub extra_args: Option<Vec<String>>,
    /// Custom steps.
    pub custom_steps: Option<Vec<CustomStep>>,
    /// Copy the PDF next to the root file.
    pub copy_pdf_to_root: Option<bool>,
}

/// `[lint]` overrides.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectLint {
    /// Rules disabled for this project.
    pub disabled_rules: Vec<String>,
}

impl ProjectConfig {
    /// Reads `labaguetex.toml` in `dir` (defaults if absent). Errors are returned
    /// so the UI can point at an invalid file.
    pub fn load(dir: &Path) -> Result<Self, String> {
        match std::fs::read_to_string(dir.join(PROJECT_FILE)) {
            Ok(s) => toml::from_str(&s).map_err(|e| e.to_string()),
            Err(_) => Ok(Self::default()),
        }
    }

    /// Writes `labaguetex.toml` in `dir`.
    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        let text = toml::to_string_pretty(self).map_err(std::io::Error::other)?;
        write_atomic(&dir.join(PROJECT_FILE), text.as_bytes())
    }

    /// Effective build settings: application defaults overridden by the project.
    pub fn effective_build(&self, base: &BuildSettings) -> BuildSettings {
        let mut b = base.clone();
        let p = &self.build;
        if let Some(v) = p.engine {
            b.engine = v;
        }
        if let Some(v) = p.tool {
            b.tool = v;
        }
        if let Some(v) = p.bib_tool {
            b.bib_tool = v;
        }
        if let Some(v) = &p.out_dir {
            b.out_dir = v.clone();
        }
        if let Some(v) = p.shell_escape {
            b.shell_escape = v;
        }
        if let Some(v) = &p.extra_args {
            b.extra_args = v.clone();
        }
        if let Some(v) = &p.custom_steps {
            b.custom_steps = v.clone();
        }
        if let Some(v) = p.copy_pdf_to_root {
            b.copy_pdf_to_root = v;
        }
        b
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_files_load_with_defaults() {
        let s: Settings =
            toml::from_str("[editor]\nfontSize = 16\n[build]\nengine = \"xelatex\"\n").unwrap();
        assert_eq!(s.editor.font_size, 16);
        assert_eq!(s.editor.tab_size, 2);
        assert_eq!(s.build.engine, EngineChoice::Xelatex);
        let p: ProjectConfig = toml::from_str("[project]\nmain = \"these.tex\"\n[build]\nengine = \"lualatex\"\nshell_escape = true\n").unwrap();
        let b = p.effective_build(&s.build);
        assert_eq!(b.engine, EngineChoice::Lualatex);
        assert!(b.shell_escape);
        assert_eq!(b.out_dir, "build");
        let roundtrip: Settings = toml::from_str(&toml::to_string(&s).unwrap()).unwrap();
        assert_eq!(roundtrip, s);
    }

    #[test]
    fn old_files_are_migrated_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.toml");
        std::fs::write(&path, "[build]\nautoBuild = \"onSave\"\n").unwrap();
        let s = Settings::load(&path);
        assert_eq!(s.build.auto_build, AutoBuild::OnIdle);
        assert_eq!(s.version, SETTINGS_VERSION);
        // A choice made after the migration is kept.
        let mut chosen = s.clone();
        chosen.build.auto_build = AutoBuild::OnSave;
        chosen.save(&path).unwrap();
        assert_eq!(Settings::load(&path).build.auto_build, AutoBuild::OnSave);
        assert_eq!(Settings::default().build.auto_build, AutoBuild::OnIdle);
        std::fs::write(&path, "version = 2\n[build]\nautoBuildDelayMs = 800\n").unwrap();
        assert_eq!(Settings::load(&path).build.auto_build_delay_ms, 600);
        std::fs::write(&path, "version = 2\n[build]\nautoBuildDelayMs = 1500\n").unwrap();
        assert_eq!(Settings::load(&path).build.auto_build_delay_ms, 1500);
    }
}
