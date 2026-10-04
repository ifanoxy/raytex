//! LaTeX syntax analysis.
//!
//! LaTeX cannot be parsed exactly without executing TeX, so this module does
//! what every good LaTeX tool does: a fast, fault-tolerant, single-pass
//! structural scan ([`scan`]) that recognises the constructs an editor cares
//! about (sections, labels, references, citations, includes, environments,
//! math, macro definitions…) and reports structural problems (unbalanced
//! braces, mismatched environments, unclosed math…).
//!
//! [`context`] answers the question "what is the user typing right now?" for
//! completion and hovers, and [`plain`] turns small LaTeX fragments (section
//! titles, captions) into readable text.

pub mod context;
pub mod plain;
mod scanner;

use std::collections::HashMap;

use serde::Serialize;

pub use scanner::{
    ScanOptions, is_citation_command, is_math_environment, is_reference_command,
    is_verbatim_environment, scan, scan_with,
};

use crate::text::Span;

/// Everything the scanner extracted from one file. Offsets are UTF-8 bytes.
#[derive(Debug, Clone, Default)]
pub struct DocumentIndex {
    /// `\documentclass[options]{name}`.
    pub document_class: Option<ClassUse>,
    /// `\usepackage` / `\RequirePackage`, one entry per package name.
    pub packages: Vec<PackageUse>,
    /// Sectioning commands and beamer frames, in source order.
    pub sections: Vec<Section>,
    /// `\label{…}` definitions.
    pub labels: Vec<LabelDef>,
    /// `\ref`-like references (one entry per key).
    pub references: Vec<KeyUse>,
    /// `\cite`-like citations (one entry per key).
    pub citations: Vec<KeyUse>,
    /// Included / referenced files (`\input`, `\includegraphics`, `.bib`…).
    pub includes: Vec<Include>,
    /// Directories declared with `\graphicspath`.
    pub graphics_paths: Vec<String>,
    /// User-defined commands (`\newcommand`, `\DeclareMathOperator`, `\def`…).
    pub command_defs: Vec<CommandDef>,
    /// User-defined environments (`\newenvironment`, `\newtheorem`…).
    pub environment_defs: Vec<EnvironmentDef>,
    /// Every `\begin … \end` pair (or unclosed `\begin`).
    pub environments: Vec<EnvironmentSpan>,
    /// Content spans of math regions (`$…$`, `\[…\]`, `equation`…).
    pub math: Vec<Span>,
    /// Colors defined with `\definecolor` / `\colorlet`.
    pub colors: Vec<NamedSpan>,
    /// Glossary entries and acronyms.
    pub glossary: Vec<GlossaryEntry>,
    /// Keys of manual `\bibitem`s.
    pub bibitems: Vec<NamedSpan>,
    /// TikZ / pgfplots libraries loaded.
    pub tikz_libraries: Vec<String>,
    /// `% TODO`, `% FIXME` and `\todo{…}` notes.
    pub todos: Vec<Todo>,
    /// Magic comments (`% !TEX root = …`).
    pub magic: MagicComments,
    /// Offset of `\begin{document}`, if present.
    pub begin_document: Option<usize>,
    /// Whether `\end{document}` is present.
    pub has_end_document: bool,
    /// Structural problems found while scanning.
    pub problems: Vec<Problem>,
    /// How many times each command name is used (for completion ranking).
    pub command_usage: HashMap<String, u32>,
    /// How many times each environment is used (for completion ranking).
    pub environment_usage: HashMap<String, u32>,
    /// Options declared by a package or class (`\DeclareOption`, key-value keys end with `=`).
    pub declared_options: Vec<String>,
    /// `\ProvidesPackage{name}[date version description]`.
    pub provides: Option<Provides>,
    /// `\LoadClass{name}` (classes built on another class).
    pub load_class: Option<String>,
}

/// Identification of a package or class file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Provides {
    /// Declared name.
    pub name: String,
    /// Date, version and description as written.
    pub info: String,
    /// Whether it is a class (`\ProvidesClass`).
    pub class: bool,
}

impl DocumentIndex {
    /// Whether this file looks like a compilable root document.
    pub fn is_root_candidate(&self) -> bool {
        self.document_class.is_some() && self.begin_document.is_some()
    }

    /// Whether `\documentclass{subfiles}` is used (a subfile of a larger project).
    pub fn subfile_parent(&self) -> Option<&str> {
        let class = self.document_class.as_ref()?;
        (class.name == "subfiles")
            .then(|| class.options.first().map(String::as_str))
            .flatten()
    }

    /// Whether `package` is loaded by this file.
    pub fn loads(&self, package: &str) -> bool {
        self.packages.iter().any(|p| p.name == package)
    }
}

/// A name with its source span.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NamedSpan {
    /// The name.
    pub name: String,
    /// Span of the name.
    pub span: Span,
}

/// `\documentclass`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassUse {
    /// Class name.
    pub name: String,
    /// Options, trimmed.
    pub options: Vec<String>,
    /// Span of the class name.
    pub span: Span,
}

/// One package loaded by `\usepackage` or `\RequirePackage`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackageUse {
    /// Package name.
    pub name: String,
    /// Options, trimmed.
    pub options: Vec<String>,
    /// Span of the package name.
    pub span: Span,
    /// Span of the whole `\usepackage[…]{…}` command.
    pub command_span: Span,
}

/// Kind of outline entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SectionKind {
    /// `\part`
    Part,
    /// `\chapter`
    Chapter,
    /// `\section`
    Section,
    /// `\subsection`
    Subsection,
    /// `\subsubsection`
    Subsubsection,
    /// `\paragraph`
    Paragraph,
    /// `\subparagraph`
    Subparagraph,
    /// beamer `frame`
    Frame,
}

impl SectionKind {
    /// Nesting level (smaller is higher in the hierarchy).
    pub fn level(self) -> u8 {
        match self {
            Self::Part => 0,
            Self::Chapter => 1,
            Self::Section => 2,
            Self::Subsection => 3,
            Self::Subsubsection => 4,
            Self::Paragraph => 5,
            Self::Subparagraph => 6,
            Self::Frame => 7,
        }
    }

    /// Name used in the table of contents (`\contentsline {section}`).
    pub fn toc_name(self) -> Option<&'static str> {
        Some(match self {
            Self::Part => "part",
            Self::Chapter => "chapter",
            Self::Section => "section",
            Self::Subsection => "subsection",
            Self::Subsubsection => "subsubsection",
            Self::Paragraph => "paragraph",
            Self::Subparagraph => "subparagraph",
            Self::Frame => return None,
        })
    }

    /// Maps a sectioning command name to its kind.
    pub fn from_command(name: &str) -> Option<Self> {
        Some(match name {
            "part" => Self::Part,
            "chapter" | "addchap" => Self::Chapter,
            "section" | "addsec" => Self::Section,
            "subsection" => Self::Subsection,
            "subsubsection" => Self::Subsubsection,
            "paragraph" => Self::Paragraph,
            "subparagraph" => Self::Subparagraph,
            _ => return None,
        })
    }
}

/// A sectioning command or beamer frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Section {
    /// Kind (and thus level).
    pub kind: SectionKind,
    /// Readable title.
    pub title: String,
    /// `\section*`.
    pub starred: bool,
    /// Span of the whole command (or of `\begin{frame}`).
    pub span: Span,
}

/// What a label points to, deduced from its surroundings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "name")]
pub enum LabelKind {
    /// Inside a sectioning unit.
    Section,
    /// Inside a figure-like environment.
    Figure,
    /// Inside a table-like environment.
    Table,
    /// Inside a display-math environment.
    Equation,
    /// Inside a theorem-like environment (name of the environment).
    Theorem(String),
    /// Inside an enumeration.
    Item,
    /// Inside a code listing.
    Listing,
    /// Inside an algorithm.
    Algorithm,
    /// Inside a beamer frame.
    Frame,
    /// Anything else.
    Other,
}

/// A `\label{…}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LabelDef {
    /// The key.
    pub name: String,
    /// Span of the key.
    pub span: Span,
    /// What it labels.
    pub kind: LabelKind,
    /// Section title, caption, theorem title or equation excerpt.
    pub context: Option<String>,
}

/// A use of a key (`\ref{key}`, `\cite{key}`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyUse {
    /// The key.
    pub name: String,
    /// Span of the key.
    pub span: Span,
    /// Command name without backslash.
    pub command: String,
}

/// Kind of included file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum IncludeKind {
    /// `\input`
    Input,
    /// `\include`
    Include,
    /// `\subfile`
    Subfile,
    /// `\import` family.
    Import,
    /// `\includegraphics`, `\includesvg`
    Graphics,
    /// `\bibliography` (BibTeX, `.bib` implied)
    Bibliography,
    /// `\addbibresource` (biblatex)
    BibResource,
    /// `\includepdf`, `\lstinputlisting`, `\inputminted`…
    Other,
}

impl IncludeKind {
    /// Whether the included file is LaTeX source that is part of the document.
    pub fn is_source(self) -> bool {
        matches!(
            self,
            Self::Input | Self::Include | Self::Subfile | Self::Import
        )
    }
}

/// A file referenced from the source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Include {
    /// Kind of inclusion.
    pub kind: IncludeKind,
    /// Path as written (without the implicit extension).
    pub path: String,
    /// Base directory for the `\import` family.
    pub dir: Option<String>,
    /// Span of the path.
    pub span: Span,
    /// Command name without backslash.
    pub command: String,
}

/// A user-defined command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandDef {
    /// Name without backslash.
    pub name: String,
    /// Number of arguments.
    pub args: u8,
    /// Whether the first argument is optional.
    pub first_optional: bool,
    /// Short excerpt of the definition.
    pub definition: String,
    /// Full body (whitespace squashed, at most 4 KiB), e.g. for math previews.
    pub body: String,
    /// Whether it is a math operator (`\DeclareMathOperator`).
    pub math: bool,
    /// The arguments as they are written, `[]{}{}`; `None` when the
    /// definition does not tell them (delimited parameters, a `\let`).
    pub signature: Option<String>,
    /// Span of the name.
    pub span: Span,
}

/// A user-defined environment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvironmentDef {
    /// Environment name.
    pub name: String,
    /// Number of arguments.
    pub args: u8,
    /// Theorem title for `\newtheorem`.
    pub theorem_title: Option<String>,
    /// The arguments after `\begin{name}`, `[]{}`; `None` when the
    /// definition does not tell them.
    pub signature: Option<String>,
    /// Span of the name.
    pub span: Span,
}

/// A `\begin{…} … \end{…}` pair.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvironmentSpan {
    /// Environment name.
    pub name: String,
    /// Span of `\begin{name}`.
    pub begin: Span,
    /// Span of `\end{name}`, `None` if unclosed.
    pub end: Option<Span>,
}

/// A glossary entry or acronym.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GlossaryEntry {
    /// Key used with `\gls`.
    pub key: String,
    /// Readable description.
    pub description: String,
    /// Whether it is an acronym.
    pub acronym: bool,
    /// Span of the key.
    pub span: Span,
}

/// A note left by the author.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Todo {
    /// `TODO`, `FIXME`, `todo`…
    pub tag: String,
    /// The note.
    pub text: String,
    /// Span of the note.
    pub span: Span,
}

/// `% !TEX …` magic comments.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MagicComments {
    /// `% !TEX root = …`
    pub root: Option<String>,
    /// `% !TEX program = …` (or `TS-program`)
    pub program: Option<String>,
    /// `% !BIB program = …`
    pub bib_program: Option<String>,
    /// `% !TEX spellcheck = …`
    pub spellcheck: Option<String>,
}

/// A structural problem detected by the scanner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    /// Where.
    pub span: Span,
    /// What.
    pub kind: ProblemKind,
}

/// Structural problem kinds. Messages are produced by [`crate::lint`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProblemKind {
    /// A `}` without matching `{`.
    UnmatchedCloseBrace,
    /// A `{` never closed.
    UnclosedBrace,
    /// `\begin{name}` never closed.
    UnclosedEnvironment(String),
    /// `\end{name}` without `\begin{name}`.
    UnmatchedEnd(String),
    /// Math mode opened here is never closed (or crosses a paragraph).
    UnclosedMath,
    /// `\)` or `\]` without opener.
    UnmatchedMathClose,
    /// `\[` or `\(` used while already in math mode.
    NestedMath,
    /// `\left` without `\right` (or the reverse) within one math region.
    LeftRightMismatch,
}
