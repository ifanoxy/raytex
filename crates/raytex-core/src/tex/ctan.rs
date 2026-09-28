//! The CTAN catalogue: every LaTeX package that exists (~7000), with
//! descriptions, documentation links and distribution package names.
//! Used by the package browser to find and install packages that are not
//! installed yet, whatever the distribution.

use std::path::Path;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

const API: &str = "https://ctan.org/json/2.0";

/// Errors while talking to CTAN.
#[derive(Debug, thiserror::Error)]
pub enum CtanError {
    /// Network or HTTP failure.
    #[error("CTAN request failed: {0}")]
    Http(String),
    /// Unexpected answer.
    #[error("unexpected CTAN answer: {0}")]
    Format(#[from] serde_json::Error),
}

/// One line of the catalogue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogEntry {
    /// Identifier.
    pub key: String,
    /// Display name.
    pub name: String,
    /// One-line description.
    pub caption: String,
}

/// A documentation link.
#[derive(Debug, Clone, Serialize)]
pub struct DocLink {
    /// What it is (user manual, examples…).
    pub label: String,
    /// URL.
    pub url: String,
}

/// Details of one package.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageDetails {
    /// Identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// One-line description.
    pub caption: String,
    /// Long description (plain text).
    pub description: String,
    /// Version and date.
    pub version: Option<String>,
    /// License identifier.
    pub license: Option<String>,
    /// Documentation links.
    pub documentation: Vec<DocLink>,
    /// Home page.
    pub home: Option<String>,
    /// Source repository.
    pub repository: Option<String>,
    /// Package name in TeX Live.
    pub texlive: Option<String>,
    /// Package name in MiKTeX.
    pub miktex: Option<String>,
    /// CTAN topics.
    pub topics: Vec<String>,
    /// CTAN page.
    pub ctan_url: String,
}

fn get(url: &str) -> Result<String, CtanError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .user_agent(concat!("raytex/", env!("CARGO_PKG_VERSION")))
        .build()
        .into();
    agent
        .get(url)
        .call()
        .map_err(|e| CtanError::Http(e.to_string()))?
        .body_mut()
        .read_to_string()
        .map_err(|e| CtanError::Http(e.to_string()))
}

/// Downloads the whole catalogue (~500 KB).
pub fn fetch_catalog() -> Result<Vec<CatalogEntry>, CtanError> {
    Ok(serde_json::from_str(&get(&format!("{API}/packages"))?)?)
}

/// Returns the catalogue from `cache` if younger than `max_age`, else downloads
/// and caches it. Falls back to a stale cache when offline.
pub fn catalog_cached(cache: &Path, max_age: Duration) -> Result<Vec<CatalogEntry>, CtanError> {
    let fresh = std::fs::metadata(cache)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|age| age < max_age);
    let read_cache = || {
        std::fs::read_to_string(cache)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
    };
    if fresh && let Some(c) = read_cache() {
        return Ok(c);
    }
    match fetch_catalog() {
        Ok(c) => {
            if let Some(dir) = cache.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::write(cache, serde_json::to_string(&c).unwrap_or_default());
            Ok(c)
        }
        Err(e) => read_cache().ok_or(e),
    }
}

#[derive(Deserialize)]
struct RawPackage {
    id: String,
    name: String,
    #[serde(default)]
    caption: String,
    #[serde(default)]
    descriptions: Vec<RawText>,
    #[serde(default)]
    version: Option<RawVersion>,
    #[serde(default)]
    license: Option<serde_json::Value>,
    #[serde(default)]
    documentation: Vec<RawDoc>,
    #[serde(default)]
    home: Option<String>,
    #[serde(default)]
    repository: Option<String>,
    #[serde(default)]
    texlive: Option<String>,
    #[serde(default)]
    miktex: Option<String>,
    #[serde(default)]
    topics: Vec<String>,
}

#[derive(Deserialize)]
struct RawText {
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct RawVersion {
    #[serde(default)]
    number: Option<String>,
    #[serde(default)]
    date: Option<String>,
}

#[derive(Deserialize)]
struct RawDoc {
    #[serde(default)]
    details: Option<String>,
    href: String,
}

/// Downloads the details of one package.
pub fn fetch_package(name: &str) -> Result<PackageDetails, CtanError> {
    let raw: RawPackage = serde_json::from_str(&get(&format!("{API}/pkg/{name}"))?)?;
    Ok(PackageDetails {
        ctan_url: format!("https://ctan.org/pkg/{}", raw.id),
        id: raw.id,
        name: raw.name,
        caption: strip_html(&raw.caption),
        description: raw
            .descriptions
            .first()
            .map(|d| strip_html(&d.text))
            .unwrap_or_default(),
        version: raw.version.map(|v| {
            [v.number, v.date]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" — ")
        }),
        license: raw.license.map(|l| match l {
            serde_json::Value::Array(a) => a
                .iter()
                .filter_map(|x| x.as_str())
                .collect::<Vec<_>>()
                .join(", "),
            other => other.as_str().unwrap_or_default().to_owned(),
        }),
        documentation: raw
            .documentation
            .into_iter()
            .map(|d| DocLink {
                label: d.details.unwrap_or_else(|| "Documentation".into()),
                url: d
                    .href
                    .strip_prefix("ctan:")
                    .map_or(d.href.clone(), |p| format!("https://mirrors.ctan.org{p}")),
            })
            .collect(),
        home: raw.home,
        repository: raw.repository,
        texlive: raw.texlive,
        miktex: raw.miktex,
        topics: raw.topics,
    })
}

/// Removes HTML tags and entities, collapsing whitespace.
pub fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let out = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    crate::text::squash_whitespace(&out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_html() {
        assert_eq!(strip_html("<p>\n  A &amp; B <q>wide</q></p>"), "A & B wide");
    }

    #[test]
    #[ignore = "needs the network"]
    fn fetches_from_ctan() {
        let catalog = fetch_catalog().unwrap();
        assert!(catalog.len() > 5000);
        let p = fetch_package("siunitx").unwrap();
        assert_eq!(p.texlive.as_deref(), Some("siunitx"));
        assert!(p.documentation.iter().any(|d| d.url.ends_with(".pdf")));
    }
}
