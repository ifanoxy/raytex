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

/// Stable fingerprint of a template's files (FNV-1a), to tell whether a
/// thumbnail shipped with the application still shows it.
pub fn fingerprint(files: &BTreeMap<String, Vec<u8>>) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for (name, bytes) in files {
        for b in name.as_bytes().iter().chain([0u8].iter()).chain(bytes) {
            h ^= u64::from(*b);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    format!("{h:016x}")
}

/// File name of the thumbnail of a built-in template shipped with the
/// application (`crates/raytex-desktop/thumbnails`): its first page as an
/// image.
pub fn thumbnail_name(id: &str, lang: Lang) -> String {
    format!("{id}-{}.png", lang.code())
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
    ensure_empty(dir)?;
    write_files(id, dir, values, user_dir)
}

/// Fails when `dir` contains files other than hidden ones.
fn ensure_empty(dir: &Path) -> Result<(), TemplateError> {
    if dir.exists()
        && std::fs::read_dir(dir)?
            .filter_map(Result::ok)
            .any(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        return Err(TemplateError::NotEmpty(dir.to_path_buf()));
    }
    Ok(())
}

/// Name of the main file of an empty project.
pub const EMPTY_MAIN: &str = "main.tex";

/// Creates an empty project in `dir` (which must be empty or absent): an
/// empty main file, declared in `raytex.toml` (with the display `name`)
/// so that it is compiled once it has content. Returns the main file.
pub fn create_empty(dir: &Path, name: Option<&str>) -> Result<PathBuf, TemplateError> {
    ensure_empty(dir)?;
    std::fs::create_dir_all(dir)?;
    let main = dir.join(EMPTY_MAIN);
    std::fs::write(&main, "")?;
    let config = crate::settings::ProjectConfig {
        project: crate::settings::ProjectSection {
            main: Some(EMPTY_MAIN.into()),
            name: name
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .map(str::to_owned),
            ..Default::default()
        },
        ..Default::default()
    };
    config.save(dir)?;
    Ok(main)
}

/// Whether a template file is text (its placeholders are filled).
fn is_text_file(rel: &str) -> bool {
    [
        ".tex", ".bib", ".toml", ".sty", ".cls", ".md", ".txt", ".cfg",
    ]
    .iter()
    .any(|e| rel.ends_with(e))
}

/// Content of a template file with its placeholders filled.
fn filled(rel: &str, bytes: Vec<u8>, values: &TemplateValues) -> Vec<u8> {
    match String::from_utf8(bytes) {
        Ok(text) if is_text_file(rel) => fill(&text, values).into_bytes(),
        Ok(text) => text.into_bytes(),
        Err(e) => e.into_bytes(),
    }
}

/// Writes every file of template `id` into `dir` (replacing existing ones).
/// Returns the main file.
pub fn write_files(
    id: &str,
    dir: &Path,
    values: &TemplateValues,
    user_dir: Option<&Path>,
) -> Result<PathBuf, TemplateError> {
    let info = find(id, user_dir)?;
    let files = files(id, user_dir).ok_or_else(|| TemplateError::Unknown(id.into()))?;
    std::fs::create_dir_all(dir)?;
    for (rel, bytes) in files {
        let path = dir.join(&rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, filled(&rel, bytes, values))?;
    }
    Ok(dir.join(info.main))
}

fn find(id: &str, user_dir: Option<&Path>) -> Result<TemplateInfo, TemplateError> {
    list(user_dir)
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| TemplateError::Unknown(id.into()))
}

/// A template applied to an open project (see [`apply`]).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Applied {
    /// New text of the project's main file (the editor replaces the current
    /// text with it, so that the change can be undone).
    pub main_text: String,
    /// Other files of the template written into the project.
    pub created: Vec<PathBuf>,
    /// Files of the template that already existed and were left untouched.
    pub kept: Vec<PathBuf>,
    /// Engine required by the template (`lualatex`…), `None` for pdfLaTeX.
    pub engine: Option<String>,
}

/// Applies template `id` to the project in `root`: its main file becomes the
/// returned text (the caller puts it in the editor), its other files are
/// written unless a file of the same name exists, and its engine is
/// recorded in `raytex.toml` (reset to automatic for pdfLaTeX).
pub fn apply(
    id: &str,
    root: &Path,
    values: &TemplateValues,
    user_dir: Option<&Path>,
) -> Result<Applied, TemplateError> {
    let info = find(id, user_dir)?;
    let files = files(id, user_dir).ok_or_else(|| TemplateError::Unknown(id.into()))?;
    let mut applied = Applied {
        main_text: String::new(),
        created: Vec::new(),
        kept: Vec::new(),
        engine: info
            .engine
            .clone()
            .filter(|e| !e.eq_ignore_ascii_case("pdflatex")),
    };
    for (rel, bytes) in files {
        if rel == info.main {
            applied.main_text = String::from_utf8_lossy(&filled(&rel, bytes, values)).into_owned();
            continue;
        }
        // The project keeps its own configuration (main file, settings).
        if rel == crate::settings::PROJECT_FILE {
            continue;
        }
        let path = root.join(&rel);
        if path.exists() {
            applied.kept.push(path);
            continue;
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, filled(&rel, bytes, values))?;
        applied.created.push(path);
    }
    let mut config = crate::settings::ProjectConfig::load(root).unwrap_or_default();
    let engine = applied
        .engine
        .as_deref()
        .and_then(crate::settings::EngineChoice::parse);
    if config.build.engine != engine {
        config.build.engine = engine;
        config.save(root)?;
    }
    Ok(applied)
}

/// Values used to preview templates (thumbnails).
pub fn example_values(lang: Lang) -> TemplateValues {
    TemplateValues {
        title: lang.pick("Titre du document", "Document title").to_owned(),
        author: lang.pick("Camille Martin", "Alex Smith").to_owned(),
        institution: lang.pick("Université", "University").to_owned(),
        language: lang.code().to_owned(),
    }
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

    fn thumbnails_dir() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../raytex-desktop/thumbnails")
    }

    /// Writes the thumbnails shipped with the application (first pages of
    /// the built-in templates, in French and English) and their manifest:
    /// `RAYTEX_WRITE_THUMBNAILS=1 cargo test -p raytex-core --release -- --ignored write_bundled_thumbnails`.
    #[test]
    #[ignore = "needs a TeX distribution; run to refresh the shipped thumbnails"]
    fn write_bundled_thumbnails() {
        if std::env::var_os("RAYTEX_WRITE_THUMBNAILS").is_none() {
            return;
        }
        let dist = crate::tex::detect(&[]).into_iter().next().expect("no TeX");
        let out = thumbnails_dir();
        std::fs::create_dir_all(&out).unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let mut manifest = std::collections::BTreeMap::new();
        for t in list(None) {
            let files = files(&t.id, None).unwrap();
            manifest.insert(t.id.clone(), fingerprint(&files));
            for lang in [Lang::Fr, Lang::En] {
                let src = tmp.path().join(format!("{}-{}", t.id, lang.code()));
                let main = write_files(&t.id, &src, &example_values(lang), None).unwrap();
                let engine = t
                    .engine
                    .as_deref()
                    .and_then(crate::tex::Engine::parse)
                    .unwrap_or(crate::tex::Engine::Pdflatex);
                let pdf = crate::preview::compile_document(
                    &dist,
                    engine,
                    &main,
                    &src.join("out"),
                    std::time::Duration::from_secs(180),
                    true,
                )
                .unwrap_or_else(|e| panic!("{} ({}): {e}", t.id, lang.code()));
                // First page, 600 px on its long side: sips (macOS), else Ghostscript.
                let png = out.join(thumbnail_name(&t.id, lang));
                let done = std::process::Command::new("sips")
                    .args(["-s", "format", "png", "-Z", "600"])
                    .arg(&pdf)
                    .arg("--out")
                    .arg(&png)
                    .output()
                    .is_ok_and(|o| o.status.success())
                    || std::process::Command::new("gs")
                        .args([
                            "-q",
                            "-dSAFER",
                            "-dBATCH",
                            "-dNOPAUSE",
                            "-sDEVICE=png16m",
                            "-r72",
                        ])
                        .args([
                            "-dTextAlphaBits=4",
                            "-dGraphicsAlphaBits=4",
                            "-dFirstPage=1",
                            "-dLastPage=1",
                        ])
                        .arg(format!("-sOutputFile={}", png.display()))
                        .arg(&pdf)
                        .output()
                        .is_ok_and(|o| o.status.success());
                assert!(done, "{}: neither sips nor gs could make the image", t.id);
            }
        }
        std::fs::write(
            out.join("manifest.json"),
            serde_json::to_string_pretty(&manifest).unwrap() + "\n",
        )
        .unwrap();
    }

    /// Every built-in template has its shipped thumbnails, made from its
    /// current files (otherwise: run `write_bundled_thumbnails`).
    #[test]
    fn bundled_thumbnails_are_up_to_date() {
        let dir = thumbnails_dir();
        let manifest: std::collections::BTreeMap<String, String> =
            serde_json::from_str(&std::fs::read_to_string(dir.join("manifest.json")).unwrap())
                .unwrap();
        for t in list(None) {
            assert_eq!(
                manifest.get(&t.id),
                Some(&fingerprint(&files(&t.id, None).unwrap())),
                "thumbnail of {} is missing or old: RAYTEX_WRITE_THUMBNAILS=1 cargo test -p raytex-core --release -- --ignored write_bundled_thumbnails",
                t.id
            );
            for lang in [Lang::Fr, Lang::En] {
                assert!(
                    dir.join(thumbnail_name(&t.id, lang)).is_file(),
                    "{}",
                    thumbnail_name(&t.id, lang)
                );
            }
        }
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
                    packages: None,
                    background: false,
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

    #[test]
    fn empty_project_then_template() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("projet");
        let main = create_empty(&root, Some(" Mon projet ")).unwrap();
        assert_eq!(std::fs::read_to_string(&main).unwrap(), "");
        let config = crate::settings::ProjectConfig::load(&root).unwrap();
        assert_eq!(config.project.main.as_deref(), Some("main.tex"));
        assert_eq!(config.project.name.as_deref(), Some("Mon projet"));
        assert!(
            create_empty(&root, None).is_err(),
            "the folder is not empty any more"
        );

        let values = example_values(Lang::Fr);
        // A template with other files and another engine.
        let applied = apply("modern-article", &root, &values, None).unwrap();
        assert!(applied.main_text.contains("\\documentclass"));
        assert!(applied.main_text.contains("Titre du document"));
        assert_eq!(applied.engine.as_deref(), Some("lualatex"));
        assert!(root.join("references.bib").is_file());
        assert_eq!(applied.created, vec![root.join("references.bib")]);
        // The main file itself is left to the editor.
        assert_eq!(std::fs::read_to_string(&main).unwrap(), "");
        let config = crate::settings::ProjectConfig::load(&root).unwrap();
        assert_eq!(config.project.main.as_deref(), Some("main.tex"));
        assert_eq!(
            config.build.engine,
            Some(crate::settings::EngineChoice::Lualatex)
        );
        // Existing files are kept; pdfLaTeX templates reset the engine.
        std::fs::write(root.join("references.bib"), "% mine").unwrap();
        let applied = apply("research-article", &root, &values, None).unwrap();
        assert_eq!(applied.kept, vec![root.join("references.bib")]);
        assert_eq!(
            std::fs::read_to_string(root.join("references.bib")).unwrap(),
            "% mine"
        );
        assert_eq!(applied.engine, None);
        let config = crate::settings::ProjectConfig::load(&root).unwrap();
        assert_eq!(config.build.engine, None);
        // A template whose main file has another name fills the project's.
        let applied = apply("tikz-figure", &root, &values, None).unwrap();
        assert!(applied.main_text.contains("tikzpicture"));
        assert!(!root.join("figure.tex").exists());
    }
}
