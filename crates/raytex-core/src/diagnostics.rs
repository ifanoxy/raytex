//! Diagnostics shared by every producer: the structural scanner, the
//! linter, the TeX log parser and the BibTeX/Biber log parsers.

use std::path::PathBuf;

use serde::Serialize;

use crate::text::Range;

/// How serious a diagnostic is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Prevents a correct output.
    Error,
    /// Probably a mistake.
    Warning,
    /// Worth knowing (bad boxes, rerun notices).
    Info,
    /// Style suggestion.
    Hint,
}

/// Who produced a diagnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// The TeX engine (log file).
    Latex,
    /// BibTeX (`.blg`).
    Bibtex,
    /// Biber (`.blg`).
    Biber,
    /// makeindex / makeglossaries.
    Index,
    /// RayTeX's structural analysis.
    Syntax,
    /// RayTeX's linter.
    Lint,
    /// The build system itself (missing tool, crash…).
    Build,
}

/// A friendly explanation attached to a diagnostic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hint {
    /// Short title (what happened).
    pub title: String,
    /// What the message means, in plain words (markdown allowed). It holds
    /// for every document that gets this message: no guess about the cause.
    pub explanation: String,
    /// The cause found in the sources and what to write instead (markdown
    /// allowed). Only set when the place is known exactly: the range of the
    /// diagnostic is then the text to change.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub advice: Option<String>,
}

impl Hint {
    /// A hint without advice.
    pub fn new(title: impl Into<String>, explanation: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            explanation: explanation.into(),
            advice: None,
        }
    }
}

/// A change of one place of a file (fixes touching several places).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit {
    /// Absolute path of the file.
    pub file: PathBuf,
    /// Range to replace.
    pub range: Range,
    /// Replacement text.
    pub text: String,
}

/// An automatic fix the editor can apply.
///
/// Fixes of the preamble are described by their intent (load a package,
/// add an option…): the editor applies them to the current text, so they
/// stay right after other edits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Fix {
    /// Add `\usepackage[options]{name}` to the preamble of the root document.
    AddPackage {
        /// Package to load.
        package: String,
        /// Options, when the package needs some.
        #[serde(skip_serializing_if = "Option::is_none")]
        options: Option<String>,
    },
    /// Add an option to a package (loading it when it is not).
    AddPackageOption {
        /// Package.
        package: String,
        /// Option to add.
        option: String,
    },
    /// Add a line to the preamble (after a package, else after the others).
    AddToPreamble {
        /// Button label.
        title: String,
        /// The line.
        code: String,
        /// Package after which the line goes.
        #[serde(skip_serializing_if = "Option::is_none")]
        after: Option<String>,
    },
    /// Load a TikZ library.
    AddTikzLibrary {
        /// Library name (`positioning`).
        library: String,
    },
    /// Install a missing package with the distribution's package manager.
    InstallPackage {
        /// Missing file (`foo.sty`) or package name.
        file: String,
    },
    /// Replace a range of the file with new text.
    Replace {
        /// Button label.
        title: String,
        /// Range to replace.
        range: Range,
        /// Replacement text.
        text: String,
    },
    /// Several changes, possibly in several files, applied together.
    Edits {
        /// Button label.
        title: String,
        /// The changes (ranges of the same file do not overlap).
        edits: Vec<FileEdit>,
    },
    /// Switch the compiler for this project.
    UseEngine {
        /// `xelatex` or `lualatex`.
        engine: String,
    },
    /// Enable shell escape for this project.
    EnableShellEscape,
    /// Create a missing file.
    CreateFile {
        /// Path relative to the project root.
        path: String,
    },
    /// Compile again (the problem goes away with another pass).
    Rebuild,
    /// Open the documentation of a package.
    OpenDoc {
        /// Package name.
        package: String,
    },
}

impl Fix {
    /// Loads a package without options.
    pub fn add_package(package: impl Into<String>) -> Self {
        Fix::AddPackage {
            package: package.into(),
            options: None,
        }
    }
}

/// A problem found in a document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    /// Severity.
    pub severity: Severity,
    /// Producer.
    pub source: Source,
    /// Stable identifier (lint rule, error kind).
    pub code: Option<String>,
    /// Message, as reported (TeX) or localized (lint).
    pub message: String,
    /// Absolute path of the file, when known.
    pub file: Option<PathBuf>,
    /// Precise range, when known.
    pub range: Option<Range>,
    /// One-based line (log diagnostics).
    pub line: Option<u32>,
    /// One-based last line (bad boxes spanning several lines).
    pub end_line: Option<u32>,
    /// Source text before the error point, as shown by TeX.
    pub context_before: Option<String>,
    /// Source text after the error point, as shown by TeX.
    pub context_after: Option<String>,
    /// Raw log excerpt.
    pub raw: Option<String>,
    /// Friendly explanation.
    pub hint: Option<Hint>,
    /// Automatic fixes.
    pub fixes: Vec<Fix>,
    /// The mistake leaves something open (a brace, a formula, an
    /// environment): TeX misreads what follows, and what it reports about
    /// the structure after it comes from this mistake.
    #[serde(skip)]
    pub swallows: bool,
}

impl Diagnostic {
    /// Creates a diagnostic with only the essential fields.
    pub fn new(severity: Severity, source: Source, message: impl Into<String>) -> Self {
        Self {
            severity,
            source,
            code: None,
            message: message.into(),
            file: None,
            range: None,
            line: None,
            end_line: None,
            context_before: None,
            context_after: None,
            raw: None,
            hint: None,
            fixes: Vec::new(),
            swallows: false,
        }
    }

    /// Sets the code.
    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }

    /// Adds a fix.
    pub fn with_fix(mut self, fix: Fix) -> Self {
        self.fixes.push(fix);
        self
    }

    /// Says what was found to be the cause, in the sources (see [`Hint::advice`]).
    pub fn advise(&mut self, advice: impl Into<String>) {
        let message = &self.message;
        self.hint
            .get_or_insert_with(|| Hint::new(message.clone(), ""))
            .advice = Some(advice.into());
    }

    /// Sets file and range.
    pub fn at(mut self, file: Option<PathBuf>, range: Range) -> Self {
        self.file = file;
        self.line = Some(range.start.line + 1);
        self.range = Some(range);
        self
    }
}
