//! # labaguetex-core
//!
//! The language engine behind the labaguetex LaTeX IDE. It has no UI
//! dependency and can be embedded in any front-end (desktop app, CLI,
//! language server…).
//!
//! | Module | Responsibility |
//! |---|---|
//! | [`text`] | Byte offsets ⇄ editor positions (UTF-16) |
//! | [`syntax`] | Fault-tolerant LaTeX scanner and cursor context |
//! | [`kb`] | Knowledge base of packages, commands, environments and symbols |
//! | [`i18n`] | Languages of the messages produced by the engine |
//! | [`diagnostics`] | Diagnostic type shared by every producer |
//! | [`log`] | TeX, BibTeX and Biber log parsers with explanations and fixes |
//! | [`tex`] | TeX distributions, installed files, any package's commands, package installation, CTAN |
//! | [`process`] | Running external programs (streaming, cancellation, elevation) |
//! | [`bib`] | BibTeX/biblatex database parser |
//! | [`aux`] | Label numbers and pages from `.aux` files |
//! | [`settings`] | Application settings and `labaguetex.toml` project configuration |
//! | [`workspace`] | The project model and project-wide queries |
//! | [`lint`] | Live diagnostics with explanations and fixes |
//! | [`completion`] | Context-aware completion and lazy documentation |
//! | [`navigation`] | Hover, definition, references, rename, formula under the cursor |
//! | [`build`] | Compilation planning, drivers and precise diagnostics |
//! | [`synctex`] | Native SyncTeX reader (source ⇄ PDF) |
//! | [`templates`] | Project templates (built-in and user) |
//! | [`help`] | Help centre: guides, command reference, symbols, errors |
//! | [`wordcount`] | Word counting |

#![warn(missing_docs)]

pub mod aux;
pub mod bib;
pub mod build;
pub mod completion;
pub mod diagnostics;
pub mod fonts;
pub mod help;
pub mod i18n;
pub mod images;
pub mod kb;
pub mod lint;
pub mod log;
pub mod navigation;
pub mod preview;
pub mod process;
pub mod settings;
pub mod synctex;
pub mod syntax;
pub mod templates;
pub mod tex;
pub mod text;
pub mod tikz;
pub mod wordcount;
pub mod workspace;
