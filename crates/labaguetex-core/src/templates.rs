//! Project templates.
//!
//! Built-in templates live in `data/templates/<id>/` (embedded at build
//! time); user templates in a folder of the configuration directory. Each
//! template has a `template.toml` describing it and files where `{{…}}`
//! placeholders are replaced when a project is created:
//!
//! * `{{title}}`, `{{author}}`, `{{institution}}`, `{{date}}`, `{{year}}`;
//! * `{{babel}}` (`french`/`english`…), `{{lang}}` (`fr`/`en`);
//! * `{{fr:texte|en:text}}`: text depending on the chosen language.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::i18n::Lang;
use crate::kb::{Doc, TEMPLATE_FILES};

/// Metadata of a template (`template.toml`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    /// Identifier (folder name).
    #[serde(default)]
    pub id: String,
    /// Display name.
    pub name: Doc,
    /// Description.
    pub description: Doc,
    /// `general`, `student`, `teacher`, `researcher` or `user`.
    #[serde(default = "general")]
    pub category: String,
    /// Sort order in the gallery.
    #[serde(default)]
    pub order: u32,
    /// Main file.
    #[serde(default = "main_tex")]
    pub main: String,
    /// Engine used by the template.
    #[serde(default)]
    pub engine: Option<String>,
    /// Keywords.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Whether it is a user template.
    #[serde(default)]
    pub user: bool,
}

fn general() -> String {
    "general".into()
}

fn main_tex() -> String {
    "main.tex".into()
}

/// Values for the placeholders.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValues {
    /// Document title.
    pub title: String,
    /// Author(s).
    pub author: String,
    /// Institution (school, university, lab).
    #[serde(default)]
    pub institution: String,
    /// Language of the document (`fr`, `en`, `de`, `es`, `it`…).
    #[serde(default)]
    pub language: String,
}

/// All templates: built-in ones, then the user's (from `user_dir`).
pub fn list(user_dir: Option<&Path>) -> Vec<TemplateInfo> {
    let mut out: Vec<TemplateInfo> = Vec::new();
    for (id, rel, bytes) in TEMPLATE_FILES {
        if *rel == "template.toml"
            && let Ok(text) = std::str::from_utf8(bytes)
            && let Ok(mut info) = toml::from_str::<TemplateInfo>(text)
        {
            info.id = (*id).to_owned();
            out.push(info);
        }
    }
    out.sort_by_key(|t| (category_rank(&t.category), t.order, t.id.clone()));
    if let Some(dir) = user_dir
        && let Ok(rd) = std::fs::read_dir(dir)
    {
        let mut user: Vec<TemplateInfo> = rd
            .filter_map(Result::ok)
            .filter_map(|e| {
                let text = std::fs::read_to_string(e.path().join("template.toml")).ok()?;
                let mut info: TemplateInfo = toml::from_str(&text).ok()?;
                info.id = format!("user:{}", e.file_name().to_string_lossy());
                info.category = "user".into();
                info.user = true;
                Some(info)
            })
            .collect();
        user.sort_by(|a, b| a.id.cmp(&b.id));
        out.extend(user);
    }
    out
}

fn category_rank(c: &str) -> u8 {
    match c {
        "general" => 0,
        "student" => 1,
        "teacher" => 2,
        "researcher" => 3,
        _ => 4,
    }
}

/// Files of a template: relative path → content.
pub fn files(id: &str, user_dir: Option<&Path>) -> Option<BTreeMap<String, Vec<u8>>> {
    let mut out = BTreeMap::new();
    if let Some(name) = id.strip_prefix("user:") {
        let root = user_dir?.join(name);
        let walker = ignore::WalkBuilder::new(&root).hidden(false).build();
        for entry in walker.flatten() {
            if entry.file_type().is_some_and(|t| t.is_file()) {
                let rel = entry
                    .path()
                    .strip_prefix(&root)
                    .ok()?
                    .to_string_lossy()
                    .replace('\\', "/");
                out.insert(rel, std::fs::read(entry.path()).ok()?);
            }
        }
    } else {
        for (tid, rel, bytes) in TEMPLATE_FILES {
            if *tid == id {
                out.insert((*rel).to_owned(), bytes.to_vec());
            }
        }
    }
    out.remove("template.toml");
    (!out.is_empty()).then_some(out)
}

/// Errors while creating a project.
#[derive(Debug, thiserror::Error)]
pub enum TemplateError {
    /// Unknown template.
    #[error("unknown template {0}")]
    Unknown(String),
    /// The target folder is not empty.
    #[error("the folder {0} already contains files")]
    NotEmpty(PathBuf),
    /// I/O.
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// Creates a project from template `id` in `dir` (which must be empty or absent).
/// Returns the main file.
pub fn instantiate(
    id: &str,
    dir: &Path,
    values: &TemplateValues,
    user_dir: Option<&Path>,
) -> Result<PathBuf, TemplateError> {
    let info = list(user_dir)
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| TemplateError::Unknown(id.into()))?;
    let files = files(id, user_dir).ok_or_else(|| TemplateError::Unknown(id.into()))?;
    if dir.exists()
        && std::fs::read_dir(dir)?
            .filter_map(Result::ok)
            .any(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        return Err(TemplateError::NotEmpty(dir.to_path_buf()));
    }
    std::fs::create_dir_all(dir)?;
    for (rel, bytes) in files {
        let path = dir.join(&rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let is_text = [
            ".tex", ".bib", ".toml", ".sty", ".cls", ".md", ".txt", ".cfg",
        ]
        .iter()
        .any(|e| rel.ends_with(e));
        match (is_text, String::from_utf8(bytes)) {
            (true, Ok(text)) => std::fs::write(&path, fill(&text, values))?,
            (_, Ok(text)) => std::fs::write(&path, text)?,
            (_, Err(e)) => std::fs::write(&path, e.into_bytes())?,
        }
    }
    Ok(dir.join(info.main))
}

/// Replaces the placeholders of a template file.
pub fn fill(text: &str, v: &TemplateValues) -> String {
    let lang_code = if v.language.is_empty() {
        "en".to_owned()
    } else {
        v.language.to_lowercase()
    };
    let lang = Lang::from_tag(&lang_code);
    let babel = match lang_code.split(['-', '_']).next().unwrap_or("en") {
        "fr" => "french",
        "de" => "ngerman",
        "es" => "spanish",
        "it" => "italian",
        "pt" => "portuguese",
        "nl" => "dutch",
        _ => "english",
    };
    let year = current_year();
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        if after.starts_with('{') {
            // `{{{title}}}`: a LaTeX brace followed by a placeholder.
            out.push('{');
            rest = &rest[start + 1..];
            continue;
        }
        let Some(end) = placeholder_end(after) else {
            out.push_str(&rest[start..]);
            return out;
        };
        let key = &after[..end];
        let value = match key.trim() {
            "title" => v.title.clone(),
            "author" => v.author.clone(),
            "institution" => v.institution.clone(),
            "date" => "\\today".to_owned(),
            "year" => year.to_string(),
            "babel" => babel.to_owned(),
            "lang" => lang_code.clone(),
            other if other.starts_with("fr:") => {
                let (fr, en) = other[3..].split_once("|en:").unwrap_or((&other[3..], ""));
                lang.pick(fr, en).to_owned()
            }
            _ => format!("{{{{{key}}}}}"),
        };
        out.push_str(&value);
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    out
}

/// End of a placeholder body: the first `}}` after which the body's braces are balanced.
fn placeholder_end(after: &str) -> Option<usize> {
    let bytes = after.as_bytes();
    let mut depth = 0i32;
    for i in 0..bytes.len() {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' if depth == 0 => return (bytes.get(i + 1) == Some(&b'}')).then_some(i),
            b'}' => depth -= 1,
            _ => {}
        }
    }
    None
}

fn current_year() -> i64 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    // Civil year from days since 1970 (proleptic Gregorian).
    let days = secs / 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    yoe + era * 400 + i64::from(month <= 2)
}

/// Saves a project folder as a user template.
pub fn save_as_template(
    project: &Path,
    user_dir: &Path,
    id: &str,
    info: &TemplateInfo,
) -> Result<PathBuf, TemplateError> {
    let target = user_dir.join(id);
    if target.exists() {
        return Err(TemplateError::NotEmpty(target));
    }
    let out_dir = crate::settings::ProjectConfig::load(project)
        .ok()
        .and_then(|c| c.build.out_dir)
        .unwrap_or_else(|| "build".into());
    let walker = ignore::WalkBuilder::new(project).hidden(true).build();
    for entry in walker.flatten() {
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(project) else {
            continue;
        };
        if rel
            .components()
            .next()
            .is_some_and(|c| c.as_os_str() == out_dir.as_str())
            || !entry.file_type().is_some_and(|t| t.is_file())
        {
            continue;
        }
        let name = rel.to_string_lossy();
        if crate::build::AUX_EXTENSIONS
            .iter()
            .any(|e| name.ends_with(&format!(".{e}")))
            || name.ends_with(".pdf") && rel.parent() == Some(Path::new(""))
        {
            continue;
        }
        let dest = target.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(path, dest)?;
    }
    let mut meta = info.clone();
    meta.id = id.to_owned();
    meta.user = true;
    std::fs::write(
        target.join("template.toml"),
        toml::to_string_pretty(&meta).unwrap_or_default(),
    )?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholders() {
        let v = TemplateValues {
            title: "Mon titre".into(),
            author: "A. B.".into(),
            institution: String::new(),
            language: "fr".into(),
        };
        let out = fill(
            "\\title{{{title}}} \\usepackage[{{babel}}]{babel} {{fr:Bonjour|en:Hello}} {{unknown}}",
            &v,
        );
        assert_eq!(
            out,
            "\\title{Mon titre} \\usepackage[french]{babel} Bonjour {{unknown}}"
        );
        let v = TemplateValues {
            language: "en".into(),
            ..v
        };
        assert!(fill("{{fr:Bonjour|en:Hello}}", &v).ends_with("Hello"));
        assert_eq!(
            fill("\\item {{fr:de \\qty{1}{\\ohm}|en:of \\qty{1}{\\ohm}}}", &v),
            "\\item of \\qty{1}{\\ohm}"
        );
        assert!(current_year() >= 2025);
    }

    #[test]
    fn builtin_templates_are_complete() {
        let all = list(None);
        assert!(all.len() >= 12, "{} templates", all.len());
        for t in &all {
            let files = files(&t.id, None).unwrap();
            assert!(files.contains_key(&t.main), "{} lacks {}", t.id, t.main);
            assert!(
                !t.name.fr.is_empty() && !t.description.en.is_empty(),
                "{} lacks texts",
                t.id
            );
        }
    }

    #[test]
    fn instantiate_project() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("p");
        let v = TemplateValues {
            title: "T".into(),
            author: "A".into(),
            institution: "I".into(),
            language: "fr".into(),
        };
        let main = instantiate("article", &target, &v, None).unwrap();
        let text = std::fs::read_to_string(&main).unwrap();
        assert!(
            text.contains("\\title{T}") && !text.contains("{{"),
            "{text}"
        );
        assert!(matches!(
            instantiate("article", &target, &v, None),
            Err(TemplateError::NotEmpty(_))
        ));
    }

    /// Compiles every template with the local distribution.
    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn every_template_compiles() {
        let dist = crate::tex::detect(&[]).into_iter().next().expect("no TeX");
        let settings = crate::settings::BuildSettings::default();
        let mut failures = Vec::new();
        for t in list(None) {
            for lang in ["fr", "en"] {
                let dir = tempfile::tempdir().unwrap();
                let v = TemplateValues {
                    title: "Titre de test".into(),
                    author: "Ada Lovelace".into(),
                    institution: "Université".into(),
                    language: lang.into(),
                };
                let main = instantiate(&t.id, &dir.path().join("p"), &v, None).unwrap();
                let ws = crate::workspace::Workspace::open(&dir.path().join("p"));
                let docs = ws.project_documents(&main);
                let facts =
                    crate::build::DocumentFacts::from_indexes(docs.iter().map(|d| &d.index));
                let config = ws.config.effective_build(&settings);
                let plan =
                    crate::build::plan(&main, &config, Some(&dist), &facts, Lang::En).unwrap();
                let cancel = std::sync::atomic::AtomicBool::new(false);
                let source = |p: &Path| std::fs::read_to_string(p).ok();
                let ctx = crate::build::RunContext {
                    dist: &dist,
                    settings: &config,
                    cancel: &cancel,
                    lang: Lang::En,
                    source: &source,
                };
                let outcome = crate::build::run(&plan, &ctx, &mut |_| {});
                let errors: Vec<String> = outcome
                    .diagnostics
                    .iter()
                    .filter(|d| d.severity == crate::diagnostics::Severity::Error)
                    .map(|d| {
                        format!(
                            "{:?}:{:?} {}",
                            d.file.as_ref().and_then(|f| f.file_name()),
                            d.line,
                            d.message
                        )
                    })
                    .collect();
                let warnings = outcome
                    .diagnostics
                    .iter()
                    .filter(|d| {
                        d.severity == crate::diagnostics::Severity::Warning
                            && !matches!(d.code.as_deref(), Some("overfull-box"))
                    })
                    .count();
                println!(
                    "{} [{lang}] {:?} {} ms, {} pages, {} errors, {} warnings",
                    t.id,
                    plan.engine,
                    outcome.duration_ms,
                    outcome.pages.unwrap_or(0),
                    errors.len(),
                    warnings
                );
                for d in outcome
                    .diagnostics
                    .iter()
                    .filter(|d| d.severity <= crate::diagnostics::Severity::Warning)
                {
                    println!(
                        "    {:?} {:?}:{:?} {}",
                        d.severity,
                        d.file.as_ref().and_then(|f| f.file_name()),
                        d.line,
                        d.message
                    );
                }
                if !outcome.success {
                    failures.push(format!("{} [{lang}]: {errors:?}", t.id));
                }
            }
        }
        assert!(failures.is_empty(), "{failures:#?}");
    }
}
