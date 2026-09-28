//! Fonts: the fonts installed on the system, font files added to a project,
//! and the LaTeX font packages that also work with pdfLaTeX.
//!
//! System and file fonts are used through `fontspec` (XeLaTeX / LuaLaTeX);
//! [`fontspec_code`] writes the matching preamble lines.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use svg2pdf::usvg::fontdb;

use crate::i18n::Lang;
use crate::kb::Doc;

/// One face (style) of a font.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FontFace {
    /// File containing the face.
    pub path: PathBuf,
    /// Index of the face in a collection (`.ttc`).
    pub index: u32,
    /// Family name ("Source Serif 4").
    pub family: String,
    /// PostScript name ("SourceSerif4-BoldIt").
    pub postscript: String,
    /// Weight (400 regular, 700 bold).
    pub weight: u16,
    /// Italic or oblique.
    pub italic: bool,
    /// Every glyph has the same width.
    pub monospace: bool,
}

impl FontFace {
    /// "Regular", "Bold", "Italic", "Bold Italic", "Light"…
    pub fn style_name(&self) -> String {
        let weight = match self.weight {
            0..=150 => "Thin",
            151..=250 => "ExtraLight",
            251..=350 => "Light",
            351..=450 => "",
            451..=550 => "Medium",
            551..=650 => "SemiBold",
            651..=750 => "Bold",
            751..=850 => "ExtraBold",
            _ => "Black",
        };
        match (weight, self.italic) {
            ("", false) => "Regular".into(),
            ("", true) => "Italic".into(),
            (w, false) => w.into(),
            (w, true) => format!("{w} Italic"),
        }
    }
}

/// A font family with its faces.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontFamily {
    /// Family name.
    pub name: String,
    /// Monospaced family.
    pub monospace: bool,
    /// Faces, regular first.
    pub faces: Vec<FontFace>,
}

fn face_of(info: &fontdb::FaceInfo) -> Option<FontFace> {
    let path = match &info.source {
        fontdb::Source::File(p) => p.clone(),
        fontdb::Source::SharedFile(p, _) => p.clone(),
        fontdb::Source::Binary(_) => return None,
    };
    let family = info.families.first()?.0.clone();
    Some(FontFace {
        path,
        index: info.index,
        family,
        postscript: info.post_script_name.clone(),
        weight: info.weight.0,
        italic: info.style != fontdb::Style::Normal,
        monospace: info.monospaced,
    })
}

fn group(faces: Vec<FontFace>) -> Vec<FontFamily> {
    let mut families: Vec<FontFamily> = Vec::new();
    for face in faces {
        // Hidden system fonts (".SF NS…") are not meant to be used by name.
        if face.family.starts_with('.') {
            continue;
        }
        match families.iter_mut().find(|f| f.name == face.family) {
            Some(f) => {
                f.monospace &= face.monospace;
                if !f.faces.iter().any(|x| x.postscript == face.postscript) {
                    f.faces.push(face);
                }
            }
            None => families.push(FontFamily {
                name: face.family.clone(),
                monospace: face.monospace,
                faces: vec![face],
            }),
        }
    }
    for f in &mut families {
        f.faces
            .sort_by_key(|x| (x.italic, (i32::from(x.weight) - 400).abs(), x.weight));
    }
    families.sort_by_key(|f| f.name.to_lowercase());
    families
}

/// Font families installed on the system.
pub fn system_families() -> Vec<FontFamily> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    group(db.faces().filter_map(face_of).collect())
}

/// Faces contained in font files (`.ttf`, `.otf`, `.ttc`).
pub fn inspect_files(paths: &[PathBuf]) -> Vec<FontFamily> {
    let mut db = fontdb::Database::new();
    for p in paths {
        let _ = db.load_font_file(p);
    }
    group(db.faces().filter_map(face_of).collect())
}

/// Whether a font file has an OpenType `MATH` table (usable with `\setmathfont`).
pub fn has_math_table(path: &Path, index: u32) -> bool {
    let Ok(data) = std::fs::read(path) else {
        return false;
    };
    let read_u32 = |at: usize| {
        data.get(at..at + 4)
            .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    };
    let read_u16 = |at: usize| {
        data.get(at..at + 2)
            .map(|b| u16::from_be_bytes([b[0], b[1]]))
    };
    // Collections start with `ttcf` and a list of face offsets.
    let base = if data.starts_with(b"ttcf") {
        match read_u32(12 + 4 * index as usize) {
            Some(o) => o as usize,
            None => return false,
        }
    } else {
        0
    };
    let Some(tables) = read_u16(base + 4) else {
        return false;
    };
    (0..tables as usize).any(|i| data.get(base + 12 + 16 * i..base + 16 + 16 * i) == Some(b"MATH"))
}

/// What a font is used for in the document.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FontRole {
    /// `\setmainfont`.
    Main,
    /// `\setsansfont`.
    Sans,
    /// `\setmonofont`.
    Mono,
    /// `\setmathfont` (unicode-math).
    Math,
    /// `\newfontfamily\name` (a font for a few words).
    Command,
}

/// Preamble lines loading `family` with fontspec.
///
/// When the faces come from files of the project (`dir` is their folder,
/// relative to the root document), the files are named explicitly, so the
/// document compiles anywhere without installing the font.
pub fn fontspec_code(
    family: &FontFamily,
    role: FontRole,
    dir: Option<&str>,
    command: &str,
) -> String {
    let cmd = match role {
        FontRole::Main => "\\setmainfont".to_owned(),
        FontRole::Sans => "\\setsansfont".to_owned(),
        FontRole::Mono => "\\setmonofont".to_owned(),
        FontRole::Math => "\\setmathfont".to_owned(),
        FontRole::Command => format!("\\newfontfamily\\{command}"),
    };
    let Some(dir) = dir else {
        return format!("{cmd}{{{}}}", family.name);
    };
    let file = |f: &FontFace| {
        f.path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    let find = |bold: bool, italic: bool| {
        family
            .faces
            .iter()
            .filter(|f| f.italic == italic && (f.weight >= 600) == bold)
            .min_by_key(|f| (i32::from(f.weight) - if bold { 700 } else { 400 }).abs())
    };
    let upright = find(false, false).or_else(|| family.faces.first());
    let Some(upright) = upright else {
        return format!("{cmd}{{{}}}", family.name);
    };
    let dir = if dir.is_empty() || dir.ends_with('/') {
        dir.to_owned()
    } else {
        format!("{dir}/")
    };
    let mut options = vec![format!("Path = {dir}")];
    if role != FontRole::Math {
        for (key, face) in [
            ("BoldFont", find(true, false)),
            ("ItalicFont", find(false, true)),
            ("BoldItalicFont", find(true, true)),
        ] {
            if let Some(face) = face.filter(|f| f.path != upright.path) {
                options.push(format!("{key} = {}", file(face)));
            }
        }
    }
    format!(
        "{cmd}{{{}}}[\n  {}\n]",
        file(upright),
        options.join(",\n  ")
    )
}

/// A LaTeX font package (works with pdfLaTeX, and usually with every engine).
#[derive(Debug, Clone, Deserialize)]
struct RawTexFont {
    id: String,
    name: String,
    package: String,
    #[serde(default)]
    options: String,
    kind: String,
    #[serde(default)]
    math: bool,
    #[serde(default)]
    fontspec: Option<String>,
    #[serde(default)]
    extra: String,
    description: Doc,
}

/// A LaTeX font package, for the interface.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexFont {
    /// Identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Package(s) to load (`newpxtext,newpxmath`).
    pub package: String,
    /// Package options.
    pub options: String,
    /// `serif`, `sans` or `mono`.
    pub kind: String,
    /// Also provides maths.
    pub math: bool,
    /// Same font as an OpenType family (for fontspec), if any.
    pub fontspec: Option<String>,
    /// Extra preamble line (`\renewcommand{\familydefault}{\sfdefault}`).
    pub extra: String,
    /// Description.
    pub description: String,
}

impl TexFont {
    /// Preamble lines loading the font.
    pub fn code(&self) -> String {
        let opts = if self.options.is_empty() {
            String::new()
        } else {
            format!("[{}]", self.options)
        };
        let mut code = format!("\\usepackage{opts}{{{}}}", self.package);
        if !self.extra.is_empty() {
            code.push('\n');
            code.push_str(&self.extra);
        }
        code
    }
}

/// The LaTeX font packages known to RayTeX (`data/fonts.json`).
pub fn tex_fonts(lang: Lang) -> Vec<TexFont> {
    let raw: Vec<RawTexFont> =
        serde_json::from_str(include_str!("../data/fonts.json")).expect("fonts.json");
    raw.into_iter()
        .map(|f| TexFont {
            id: f.id,
            name: f.name,
            package: f.package,
            options: f.options,
            kind: f.kind,
            math: f.math,
            fontspec: f.fontspec,
            extra: f.extra,
            description: f.description.get(lang).to_owned(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn face(name: &str, weight: u16, italic: bool) -> FontFace {
        FontFace {
            path: PathBuf::from(format!("/p/fonts/{name}")),
            index: 0,
            family: "Demo".into(),
            postscript: name.into(),
            weight,
            italic,
            monospace: false,
        }
    }

    #[test]
    fn fontspec_names_every_style_of_project_fonts() {
        let family = FontFamily {
            name: "Demo".into(),
            monospace: false,
            faces: vec![
                face("Demo-Regular.otf", 400, false),
                face("Demo-Bold.otf", 700, false),
                face("Demo-Italic.otf", 400, true),
                face("Demo-BoldItalic.otf", 700, true),
                face("Demo-Light.otf", 300, false),
            ],
        };
        let code = fontspec_code(&family, FontRole::Main, Some("fonts"), "");
        assert_eq!(
            code,
            "\\setmainfont{Demo-Regular.otf}[\n  Path = fonts/,\n  BoldFont = Demo-Bold.otf,\n  ItalicFont = Demo-Italic.otf,\n  BoldItalicFont = Demo-BoldItalic.otf\n]"
        );
        assert_eq!(
            fontspec_code(&family, FontRole::Sans, None, ""),
            "\\setsansfont{Demo}"
        );
        assert_eq!(
            fontspec_code(&family, FontRole::Command, None, "titre"),
            "\\newfontfamily\\titre{Demo}"
        );
        assert_eq!(face("x", 700, true).style_name(), "Bold Italic");
        assert_eq!(face("x", 400, false).style_name(), "Regular");
    }

    #[test]
    fn tex_fonts_load() {
        let fonts = tex_fonts(Lang::Fr);
        assert!(fonts.len() >= 20);
        let helvet = fonts.iter().find(|f| f.id == "helvet").unwrap();
        assert_eq!(
            helvet.code(),
            "\\usepackage{tgheros}\n\\renewcommand{\\familydefault}{\\sfdefault}"
        );
    }

    #[test]
    #[ignore = "reads the fonts installed on this computer"]
    fn lists_system_fonts() {
        let families = system_families();
        assert!(!families.is_empty());
        let with_math = families
            .iter()
            .flat_map(|f| &f.faces)
            .filter(|f| has_math_table(&f.path, f.index))
            .count();
        println!(
            "{} families, {with_math} faces with a MATH table",
            families.len()
        );
    }
}
