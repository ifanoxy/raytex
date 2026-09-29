//! Images added to a project: file names that LaTeX accepts everywhere,
//! and conversion of SVG drawings to PDF (vector), which every engine reads.
//!
//! Raster formats that LaTeX cannot read (WebP, GIF, HEIC, BMP, TIFF) are
//! converted to PNG by the interface, which already decodes them.

use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use svg2pdf::usvg;

/// Formats read directly by pdfLaTeX, XeLaTeX and LuaLaTeX.
pub const DIRECT: &[&str] = &["pdf", "png", "jpg", "jpeg", "eps", "jbig2", "jb2"];

/// How an image must be prepared before `\includegraphics` can use it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preparation {
    /// Used as is.
    None,
    /// SVG drawing converted to PDF (keeps it vector).
    SvgToPdf,
    /// Raster format converted to PNG (done by the interface).
    ToPng,
}

/// What `path` needs, from its extension.
pub fn preparation(path: &Path) -> Preparation {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if DIRECT.contains(&ext.as_str()) {
        Preparation::None
    } else if ext == "svg" || ext == "svgz" {
        Preparation::SvgToPdf
    } else {
        Preparation::ToPng
    }
}

fn fold(c: char) -> Option<&'static str> {
    Some(match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => "a",
        'æ' | 'Æ' => "ae",
        'ç' | 'Ç' => "c",
        'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => "e",
        'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => "i",
        'ñ' | 'Ñ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø' => "o",
        'œ' | 'Œ' => "oe",
        'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => "u",
        'ý' | 'ÿ' | 'Ý' => "y",
        'ß' => "ss",
        _ => return None,
    })
}

/// A file name LaTeX accepts on every system: lowercase ASCII letters,
/// digits and hyphens, one dot before the extension
/// (`Capture d’écran 10.12.png` → `capture-d-ecran-10-12.png`).
pub fn latex_file_name(name: &str) -> String {
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() && !e.is_empty() && e.len() <= 5 => (s, Some(e)),
        _ => (name, None),
    };
    let mut out = String::new();
    for c in stem.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if let Some(f) = fold(c) {
            out.push_str(f);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let stem = out.trim_matches('-');
    let stem = if stem.is_empty() { "image" } else { stem };
    match ext {
        Some(e) => format!("{stem}.{}", e.to_ascii_lowercase()),
        None => stem.to_owned(),
    }
}

/// `dir/name`, or `dir/name-2`, `dir/name-3`… if it already exists.
pub fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((s, e)) => (s.to_owned(), format!(".{e}")),
        None => (file_name.to_owned(), String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem}-{n}{ext}")))
        .find(|p| !p.exists())
        .expect("an unused name exists")
}

/// Whether an SVG has text, which needs the fonts of the system.
fn has_text(data: &[u8]) -> bool {
    data.windows(5).any(|w| w == b"<text" || w == b":text")
}

/// The fonts of the system, read once: reading them takes seconds on
/// Windows.
fn system_fonts() -> Arc<usvg::fontdb::Database> {
    static FONTS: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    FONTS
        .get_or_init(|| {
            let mut db = usvg::fontdb::Database::new();
            db.load_system_fonts();
            Arc::new(db)
        })
        .clone()
}

/// Converts an SVG drawing to a PDF page of the same size, keeping it vector.
pub fn svg_to_pdf(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut options = usvg::Options::default();
    if has_text(data) {
        options.fontdb = system_fonts();
    }
    let tree = usvg::Tree::from_data(data, &options).map_err(|e| e.to_string())?;
    svg2pdf::to_pdf(
        &tree,
        svg2pdf::ConversionOptions::default(),
        svg2pdf::PageOptions::default(),
    )
    .map_err(|e| e.to_string())
}

/// Copies `source` into `dir` under a LaTeX-safe name (`name`, or the
/// source's name), converting SVG to PDF. Returns the new file.
pub fn import(source: &Path, dir: &Path, name: Option<&str>) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let original = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".into());
    let wanted = latex_file_name(name.filter(|n| !n.trim().is_empty()).unwrap_or(&original));
    match preparation(source) {
        Preparation::SvgToPdf => {
            let data = std::fs::read(source).map_err(|e| e.to_string())?;
            let data = if source
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("svgz"))
            {
                use std::io::Read;
                let mut out = Vec::new();
                flate2::read::GzDecoder::new(&data[..])
                    .read_to_end(&mut out)
                    .map_err(|e| e.to_string())?;
                out
            } else {
                data
            };
            let pdf = svg_to_pdf(&data)?;
            let stem = wanted.rsplit_once('.').map_or(wanted.as_str(), |(s, _)| s);
            let target = unique_path(dir, &format!("{stem}.pdf"));
            std::fs::write(&target, pdf).map_err(|e| e.to_string())?;
            Ok(target)
        }
        _ => {
            let ext = source
                .extension()
                .map(|e| e.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            let stem = wanted.rsplit_once('.').map_or(wanted.as_str(), |(s, _)| s);
            let file = if ext.is_empty() {
                stem.to_owned()
            } else {
                format!("{stem}.{ext}")
            };
            // Already in place (an image of the project): nothing to copy.
            if source.parent() == Some(dir)
                && source.file_name().is_some_and(|n| n == file.as_str())
            {
                return Ok(source.to_path_buf());
            }
            let target = unique_path(dir, &file);
            std::fs::copy(source, &target).map_err(|e| e.to_string())?;
            Ok(target)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_names() {
        assert_eq!(
            latex_file_name("Capture d’écran 2026-09-27 à 10.12.33.PNG"),
            "capture-d-ecran-2026-09-27-a-10-12-33.png"
        );
        assert_eq!(latex_file_name("Œuvre (finale).jpg"), "oeuvre-finale.jpg");
        assert_eq!(latex_file_name("???.png"), "image.png");
        assert_eq!(latex_file_name("schéma"), "schema");
    }

    #[test]
    fn preparation_by_extension() {
        assert_eq!(preparation(Path::new("a.PNG")), Preparation::None);
        assert_eq!(preparation(Path::new("a.svg")), Preparation::SvgToPdf);
        assert_eq!(preparation(Path::new("a.webp")), Preparation::ToPng);
        assert_eq!(preparation(Path::new("a.heic")), Preparation::ToPng);
    }

    #[test]
    fn imports_with_unique_names_and_converts_svg() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("Mon Schéma.svg");
        std::fs::write(
            &src,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect x="5" y="5" width="90" height="40" fill="teal"/></svg>"#,
        )
        .unwrap();
        let figures = dir.path().join("figures");
        let pdf = import(&src, &figures, None).unwrap();
        assert_eq!(pdf.file_name().unwrap(), "mon-schema.pdf");
        assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
        let png = dir.path().join("photo.png");
        std::fs::write(&png, b"\x89PNG").unwrap();
        let a = import(&png, &figures, Some("Photo 1.png")).unwrap();
        let b = import(&png, &figures, Some("Photo 1.png")).unwrap();
        assert_eq!(a.file_name().unwrap(), "photo-1.png");
        assert_eq!(b.file_name().unwrap(), "photo-1-2.png");
        // An image already in the folder is used where it is.
        assert_eq!(import(&a, &figures, None).unwrap(), a);
    }
}
