//! Quick fixes for the problems of a document.
//!
//! [`latex`] finds fixes for the compiler's errors and warnings, using the
//! sources of the project (the error point, the environment it is in, the
//! labels and bibliography keys that exist…). [`apply`] applies a fix to
//! files the way the editor does (for tests and the command line).

mod cause;
mod data;
pub(crate) mod latex;
mod numeric;
pub mod text;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::diagnostics::{Diagnostic, FileEdit, Fix};
use crate::i18n::Lang;
use crate::text::LineIndex;

pub(crate) use latex::{CONSEQUENCE, Sources, relocate, suggest};

/// Whether an error is about the structure TeX is in (a group, a formula,
/// an environment): after a mistake that leaves one open, such an error
/// comes from that mistake.
pub(crate) fn about_structure(d: &Diagnostic) -> bool {
    let code = d.code.as_deref().unwrap_or_default();
    cause::is_symptom(code, &d.message)
        || matches!(
            code,
            "env-mismatch"
                | "file-ended"
                | "paragraph-ended"
                | "runaway-argument"
                | "table-structure"
                | "no-end-document"
        )
}

/// Whether a fix can be applied without asking (not an installation, a
/// security setting or a page of documentation).
pub fn is_automatic(fix: &Fix) -> bool {
    !matches!(
        fix,
        Fix::InstallPackage { .. } | Fix::EnableShellEscape | Fix::OpenDoc { .. }
    )
}

/// Label of a fix (the editor has its own, localized the same way).
pub fn title(fix: &Fix, lang: Lang) -> String {
    match fix {
        Fix::AddPackage { package, options } => match options {
            Some(o) => format!(
                "{} \\usepackage[{o}]{{{package}}}",
                lang.pick("Ajouter", "Add")
            ),
            None => format!("{} \\usepackage{{{package}}}", lang.pick("Ajouter", "Add")),
        },
        Fix::AddPackageOption { package, option } => format!(
            "{} {option} {} {package}",
            lang.pick("Ajouter l'option", "Add option"),
            lang.pick("à", "to")
        ),
        Fix::AddToPreamble { title, .. }
        | Fix::Replace { title, .. }
        | Fix::Edits { title, .. } => title.clone(),
        Fix::AddTikzLibrary { library } => format!(
            "{} \\usetikzlibrary{{{library}}}",
            lang.pick("Ajouter", "Add")
        ),
        Fix::InstallPackage { file } => format!("{} {file}", lang.pick("Installer", "Install")),
        Fix::UseEngine { engine } => {
            format!("{} {engine}", lang.pick("Compiler avec", "Compile with"))
        }
        Fix::EnableShellEscape => lang
            .pick(
                "Autoriser les commandes externes",
                "Allow external commands",
            )
            .into(),
        Fix::CreateFile { path } => format!("{} {path}", lang.pick("Créer", "Create")),
        Fix::Rebuild => lang.pick("Recompiler", "Compile again").into(),
        Fix::OpenDoc { package } => format!(
            "{} {package}",
            lang.pick("Documentation de", "Documentation of")
        ),
    }
}

/// Applies edits to a text (ranges of the original text, non-overlapping).
pub fn apply_edits(text: &str, edits: &[&FileEdit]) -> String {
    let lines = LineIndex::new(text);
    let mut spans: Vec<(usize, usize, &str)> = edits
        .iter()
        .map(|e| {
            (
                lines.offset(text, e.range.start),
                lines.offset(text, e.range.end),
                e.text.as_str(),
            )
        })
        .collect();
    spans.sort_by_key(|s| std::cmp::Reverse((s.0, s.1)));
    let mut out = text.to_owned();
    let mut limit = usize::MAX;
    for (from, to, new) in spans {
        if to > limit {
            continue; // overlaps an edit already applied
        }
        out.replace_range(from..to, new);
        limit = from;
    }
    out
}

/// New texts of the files a fix changes. `root` is the main file of the
/// project (where preamble fixes go).
pub fn apply(
    fix: &Fix,
    d: &Diagnostic,
    root: &Path,
    read: &dyn Fn(&Path) -> Option<String>,
) -> Result<Vec<(PathBuf, String)>, String> {
    let root_text = || read(root).ok_or_else(|| format!("cannot read {}", root.display()));
    let changed = |text: Option<String>| -> Result<Vec<(PathBuf, String)>, String> {
        text.map(|t| vec![(root.to_path_buf(), t)])
            .ok_or_else(|| "no preamble".to_owned())
    };
    match fix {
        Fix::AddPackage { package, options } => changed(text::add_package(
            &root_text()?,
            package,
            options.as_deref(),
        )),
        Fix::AddPackageOption { package, option } => {
            changed(text::add_package_option(&root_text()?, package, option))
        }
        Fix::AddToPreamble { code, after, .. } => {
            changed(text::add_line(&root_text()?, code, after.as_deref()))
        }
        Fix::AddTikzLibrary { library } => changed(text::add_tikz_library(&root_text()?, library)),
        Fix::UseEngine { engine } => Ok(vec![(
            root.to_path_buf(),
            text::set_magic_program(&root_text()?, engine),
        )]),
        Fix::Replace { range, text, .. } => {
            let file = d.file.clone().ok_or("no file")?;
            let edit = FileEdit {
                file: file.clone(),
                range: *range,
                text: text.clone(),
            };
            let old = read(&file).ok_or("cannot read the file")?;
            Ok(vec![(file, apply_edits(&old, &[&edit]))])
        }
        Fix::Edits { edits, .. } => {
            let mut by_file: BTreeMap<&Path, Vec<&FileEdit>> = BTreeMap::new();
            for e in edits {
                by_file.entry(&e.file).or_default().push(e);
            }
            by_file
                .into_iter()
                .map(|(file, list)| {
                    let old = read(file).unwrap_or_default();
                    Ok((file.to_path_buf(), apply_edits(&old, &list)))
                })
                .collect()
        }
        Fix::CreateFile { path } => {
            let dir = root.parent().ok_or("no folder")?;
            Ok(vec![(dir.join(path), String::new())])
        }
        Fix::Rebuild => Ok(Vec::new()),
        Fix::InstallPackage { .. } | Fix::EnableShellEscape | Fix::OpenDoc { .. } => {
            Err("needs the user".into())
        }
    }
}
