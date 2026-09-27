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
    /// labaguetex's structural analysis.
    Syntax,
    /// labaguetex's linter.
    Lint,
    /// The build system itself (missing tool, crash…).
    Build,
}

/// A friendly explanation attached to a diagnostic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hint {
    /// Short title (what happened).
    pub title: String,
    /// Explanation in plain words (why), markdown allowed.
    pub explanation: String,
}

/// An automatic fix the editor can apply.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Fix {
    /// Add `\usepackage{name}` to the preamble of the root document.
    AddPackage {
        /// Package to load.
        package: String,
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
        }
    }

    /// Sets the code.
    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }

    /// Sets file and range.
    pub fn at(mut self, file: Option<PathBuf>, range: Range) -> Self {
        self.file = file;
        self.line = Some(range.start.line + 1);
        self.range = Some(range);
        self
    }
}
