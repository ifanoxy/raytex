//! The projects folder: its projects (for the projects browser), and
//! projects made from a file that was opened on its own (light mode).

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::settings::{PROJECT_FILE, ProjectConfig, ProjectSection};
use crate::templates::TemplateError;

/// A project of the projects folder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    /// Folder.
    pub path: PathBuf,
    /// Display name (`labaguetex.toml`, else the folder name).
    pub name: String,
    /// Main file.
    pub main: Option<PathBuf>,
    /// Last change of its sources (seconds since the epoch).
    pub modified: u64,
    /// Its PDF, when it was built.
    pub pdf: Option<PathBuf>,
}

/// Name of the default projects folder.
pub const FOLDER: &str = "LaBagueTex";
/// Its name before the application was renamed.
const LEGACY_FOLDER: &str = "labaguetex";

/// The default projects folder: `LaBagueTex` in the documents folder.
pub fn default_dir(documents: Option<&Path>, home: &Path) -> PathBuf {
    documents.unwrap_or(home).join(FOLDER)
}

/// Renames the projects folder of an earlier version (`labaguetex`) in
/// `parent` to its current name. Returns the old and new paths when it did.
pub fn migrate_legacy_dir(parent: &Path) -> Option<(PathBuf, PathBuf)> {
    // Names as stored: on case-insensitive file systems `LaBagueTex`
    // "exists" as soon as `labaguetex` does.
    let names: Vec<String> = std::fs::read_dir(parent)
        .ok()?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    if !names.iter().any(|n| n == LEGACY_FOLDER) || names.iter().any(|n| n == FOLDER) {
        return None;
    }
    let (old, new) = (parent.join(LEGACY_FOLDER), parent.join(FOLDER));
    std::fs::rename(&old, &new).ok()?;
    Some((old, new))
}

fn modified(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The main file of a project folder: the configured one, else the first
/// `.tex` file of the folder with a `\documentclass`.
fn main_of(dir: &Path, config: &ProjectConfig) -> Option<PathBuf> {
    if let Some(main) = &config.project.main {
        let p = dir.join(main);
        if p.is_file() {
            return Some(p);
        }
    }
    let mut candidates: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "tex"))
        .collect();
    candidates.sort_by_key(|p| (p.file_stem().is_none_or(|s| s != "main"), p.clone()));
    candidates
        .into_iter()
        .find(|p| std::fs::read_to_string(p).is_ok_and(|t| t.contains("\\documentclass")))
}

/// A project folder, or `None` when `dir` is not one.
pub fn entry(dir: &Path) -> Option<ProjectEntry> {
    let config = ProjectConfig::load(dir).unwrap_or_default();
    let has_config = dir.join(PROJECT_FILE).is_file();
    let main = main_of(dir, &config);
    if main.is_none() && !has_config {
        return None;
    }
    // Last change: the newest source file (two levels deep is enough).
    let mut newest = modified(&dir.join(PROJECT_FILE));
    let walker = ignore::WalkBuilder::new(dir).max_depth(Some(2)).build();
    for e in walker.flatten().take(2000) {
        let p = e.path();
        if p.extension().is_some_and(|x| x == "tex" || x == "bib") {
            newest = newest.max(modified(p));
        }
    }
    let out = config
        .build
        .out_dir
        .clone()
        .unwrap_or_else(|| "build".into());
    let pdf = main.as_ref().and_then(|m| {
        let stem = m.file_stem()?.to_string_lossy().into_owned();
        let pdf = m.parent()?.join(&out).join(format!("{stem}.pdf"));
        pdf.is_file().then_some(pdf)
    });
    Some(ProjectEntry {
        name: config.project.name.clone().unwrap_or_else(|| {
            dir.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default()
        }),
        path: dir.to_path_buf(),
        main,
        modified: newest,
        pdf,
    })
}

/// The projects of `dir`, most recently changed first.
pub fn list(dir: &Path) -> Vec<ProjectEntry> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<ProjectEntry> = rd
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| entry(&e.path()))
        .collect();
    out.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.name.cmp(&b.name)));
    out
}

/// A folder name for a project called `name` (`Rapport de stage` →
/// `rapport-de-stage`), not used yet in `parent`.
pub fn folder_for(parent: &Path, name: &str) -> PathBuf {
    let slug = crate::images::latex_file_name(name.trim());
    let slug = if slug.is_empty() || slug == "image" {
        "projet".to_owned()
    } else {
        slug
    };
    crate::images::unique_path(parent, &slug)
}

/// Makes a project in `dir` from `file` (opened on its own) and the files it
/// uses (`files`: sources, bibliographies, images…). Files outside the
/// folder of `file` are left out. Returns the main file of the project.
pub fn from_file(
    file: &Path,
    files: &[PathBuf],
    dir: &Path,
    name: &str,
) -> Result<PathBuf, TemplateError> {
    if dir.exists() && std::fs::read_dir(dir)?.next().is_some() {
        return Err(TemplateError::NotEmpty(dir.to_path_buf()));
    }
    std::fs::create_dir_all(dir)?;
    let base = file.parent().unwrap_or(Path::new("."));
    for f in files.iter().chain(std::iter::once(&file.to_path_buf())) {
        let Ok(rel) = f.strip_prefix(base) else {
            continue;
        };
        let target = dir.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(f, &target)?;
    }
    let main_name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "main.tex".into());
    let config = ProjectConfig {
        project: ProjectSection {
            main: Some(main_name.clone()),
            name: Some(name.trim().to_owned()).filter(|n| !n.is_empty()),
            ..Default::default()
        },
        ..Default::default()
    };
    config.save(dir)?;
    Ok(dir.join(main_name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::Workspace;

    #[test]
    fn renames_the_legacy_projects_folder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("labaguetex/td")).unwrap();
        let (old, new) = migrate_legacy_dir(dir.path()).unwrap();
        assert_eq!(old, dir.path().join("labaguetex"));
        assert_eq!(new, default_dir(Some(dir.path()), dir.path()));
        assert!(new.join("td").is_dir());
        let names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();
        assert_eq!(names, ["LaBagueTex"]);
        assert!(migrate_legacy_dir(dir.path()).is_none());
    }

    #[test]
    fn lists_projects_and_makes_one_from_a_file() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("projets");
        // A template project, an empty one, a folder that is not a project.
        crate::templates::instantiate(
            "article",
            &root.join("rapport"),
            &crate::templates::example_values(crate::i18n::Lang::Fr),
            None,
        )
        .unwrap();
        crate::templates::create_empty(&root.join("vide"), Some("Mon vide")).unwrap();
        std::fs::create_dir_all(root.join("photos")).unwrap();
        std::fs::write(root.join("photos/a.png"), b"x").unwrap();
        let list = list(&root);
        let names: Vec<&str> = list.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(list.len(), 2, "{names:?}");
        assert!(names.contains(&"Mon vide") && names.contains(&"rapport"));
        assert!(list.iter().all(|p| p.main.is_some()));

        // A file with a bibliography, an input and an image, opened alone.
        let loose = tmp.path().join("Téléchargements");
        std::fs::create_dir_all(loose.join("img")).unwrap();
        std::fs::write(loose.join("devoir.tex"), "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\input{partie}\n\\includegraphics{img/photo}\n\\bibliography{refs}\n\\end{document}\n").unwrap();
        std::fs::write(loose.join("partie.tex"), "Texte.\n").unwrap();
        std::fs::write(loose.join("refs.bib"), "@misc{a, title={A}}\n").unwrap();
        std::fs::write(loose.join("img/photo.png"), b"png").unwrap();
        std::fs::write(loose.join("autre.pdf"), b"%PDF").unwrap();
        let ws = Workspace::single_file(&loose.join("devoir.tex"));
        assert_eq!(
            ws.documents().count(),
            3,
            "the file, its input and its bibliography only"
        );
        let files = ws.referenced_files(&loose.join("devoir.tex"));
        let dir = folder_for(&root, "Devoir de maths");
        assert_eq!(dir.file_name().unwrap(), "devoir-de-maths");
        let main = from_file(&loose.join("devoir.tex"), &files, &dir, "Devoir de maths").unwrap();
        assert!(main.is_file());
        for f in ["partie.tex", "refs.bib", "img/photo.png", "labaguetex.toml"] {
            assert!(dir.join(f).is_file(), "{f} copied");
        }
        assert!(!dir.join("autre.pdf").exists(), "unused files stay out");
        let entry = entry(&dir).unwrap();
        assert_eq!(entry.name, "Devoir de maths");
        assert_eq!(entry.main.as_deref(), Some(main.as_path()));
        assert!(from_file(&loose.join("devoir.tex"), &files, &dir, "x").is_err());
    }
}
