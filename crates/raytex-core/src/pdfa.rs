//! PDF/A: the document built for archiving (a thesis to deposit).
//!
//! LaTeX writes it itself (`\DocumentMetadata{pdfstandard=…}`, the PDF
//! management of the kernel): metadata, colour profile, fonts embedded. The
//! line is given to the engine before the document (nothing is written in
//! it), with the version of PDF the standard allows (the kernel writes PDF
//! 2.0 otherwise, too recent for PDF/A-2) and the language of the document.
//! The PDF made is then looked at: what a PDF/A must hold is there, and
//! what it must not is not. That is a check, not a certification (veraPDF
//! is the reference).

use std::io::Read;
use std::path::Path;

use regex::bytes::Regex;
use serde::{Deserialize, Serialize};

/// The levels offered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Standard {
    /// PDF/A-1b (PDF 1.4: no transparency).
    #[serde(rename = "a-1b")]
    A1b,
    /// PDF/A-2b (PDF 1.7), the one most deposits ask for.
    #[serde(rename = "a-2b")]
    A2b,
    /// PDF/A-2u: also the text of every character known (copied, searched).
    #[serde(rename = "a-2u")]
    A2u,
    /// PDF/A-3b: files may be attached.
    #[serde(rename = "a-3b")]
    A3b,
}

impl Standard {
    /// As the kernel names it.
    pub fn key(self) -> &'static str {
        match self {
            Standard::A1b => "a-1b",
            Standard::A2b => "a-2b",
            Standard::A2u => "a-2u",
            Standard::A3b => "a-3b",
        }
    }

    /// The part (1, 2, 3) and the conformance (`B`, `U`).
    pub fn part(self) -> (u8, char) {
        match self {
            Standard::A1b => (1, 'B'),
            Standard::A2b => (2, 'B'),
            Standard::A2u => (2, 'U'),
            Standard::A3b => (3, 'B'),
        }
    }

    /// The version of PDF it is made of.
    pub fn pdf_version(self) -> &'static str {
        match self {
            Standard::A1b => "1.4",
            _ => "1.7",
        }
    }
}

/// The language of a document as a tag (`fr-FR`): the main language of
/// babel or polyglossia; `None` when it does not say.
pub fn language_tag(root: &str) -> Option<&'static str> {
    let preamble = root.split("\\begin{document}").next().unwrap_or(root);
    let babel = Regex::new(r"\\usepackage\s*\[([^\]]*)\]\s*\{babel\}").unwrap();
    let poly =
        Regex::new(r"\\set(?:default|main)language\s*(?:\[[^\]]*\])?\s*\{([a-zA-Z]+)\}").unwrap();
    let name = if let Some(m) = poly.captures(preamble.as_bytes()) {
        String::from_utf8_lossy(&m[1]).into_owned()
    } else {
        let m = babel.captures(preamble.as_bytes())?;
        let options = String::from_utf8_lossy(&m[1]).into_owned();
        let options: Vec<&str> = options
            .split(',')
            .map(str::trim)
            .filter(|o| !o.is_empty())
            .collect();
        // `main=…`, or the last language given.
        options
            .iter()
            .find_map(|o| o.strip_prefix("main=").map(str::to_owned))
            .or_else(|| {
                options
                    .iter()
                    .rev()
                    .find(|o| !o.contains('='))
                    .map(|o| (*o).to_owned())
            })?
    };
    Some(match name.as_str() {
        "french" | "francais" | "frenchb" | "acadian" => "fr-FR",
        "english" | "american" | "USenglish" => "en-US",
        "british" | "UKenglish" => "en-GB",
        "canadian" => "en-CA",
        "australian" => "en-AU",
        "german" | "ngerman" => "de-DE",
        "austrian" | "naustrian" => "de-AT",
        "spanish" => "es-ES",
        "italian" => "it-IT",
        "portuguese" | "portuges" => "pt-PT",
        "brazil" | "brazilian" => "pt-BR",
        "dutch" => "nl-NL",
        "catalan" => "ca-ES",
        "polish" => "pl-PL",
        "swedish" => "sv-SE",
        "danish" => "da-DK",
        "norsk" | "norwegian" => "nb-NO",
        "czech" => "cs-CZ",
        "russian" => "ru-RU",
        "greek" => "el-GR",
        _ => return None,
    })
}

/// Whether LaTeX of `dist` writes PDF/A: `\DocumentMetadata` came in its
/// kernel in June 2022 (an older one types its keys as text). Read from the
/// date of `latex.ltx`; a distribution that does not tell is trusted.
pub fn supported(dist: &crate::tex::Distribution) -> bool {
    kernel_at_least(dist, (2022, 6, 1))
}

/// Whether LaTeX of `dist` tags a PDF: the key `tagging` of
/// `\DocumentMetadata` (and a list of standards) came in June 2025.
pub fn tagging_supported(dist: &crate::tex::Distribution) -> bool {
    kernel_at_least(dist, (2025, 6, 1))
}

/// Whether the kernel of `dist` is of `date` or later (a distribution that does not tell is trusted).
fn kernel_at_least(dist: &crate::tex::Distribution, date: (u32, u32, u32)) -> bool {
    let Ok(found) = crate::process::output(
        &dist.cmd("kpsewhich").arg("latex.ltx"),
        std::time::Duration::from_secs(30),
    ) else {
        return true;
    };
    let path = found.stdout.lines().next().unwrap_or("").trim().to_owned();
    let Ok(text) = std::fs::read_to_string(&path) else {
        return true;
    };
    kernel_date(&text).is_none_or(|found| found >= date)
}

/// The date of the kernel, from `\edef\fmtversion {2022-11-01}`.
fn kernel_date(latex_ltx: &str) -> Option<(u32, u32, u32)> {
    let m = Regex::new(r"\\e?def\\fmtversion\s*\{(\d{4})[-/](\d{2})[-/](\d{2})\}").unwrap();
    let c = m.captures(latex_ltx.as_bytes())?;
    let n = |i: usize| std::str::from_utf8(&c[i]).ok()?.parse().ok();
    Some((n(1)?, n(2)?, n(3)?))
}

/// Whether the document gives its own `\DocumentMetadata` (it is then kept as it is).
pub fn has_metadata(root: &str) -> bool {
    root.split("\\documentclass").next().is_some_and(|before| {
        before.lines().any(|l| {
            l.split('%')
                .next()
                .unwrap_or("")
                .contains("\\DocumentMetadata")
        })
    })
}

/// The text of every glyph of the Type 1 fonts (the large symbols of
/// mathematics among them, which pdfTeX and LuaTeX leave without one): the
/// PDF is copied and searched as it reads, and PDF/A-2u asks for it. The
/// names of Computer Modern are those of pdfx (`glyphtounicode-cmr`).
pub const UNICODE: &str = concat!(
    r"\ifdefined\pdfextension",
    r"\begingroup\def\pdfglyphtounicode{\pdfextension glyphtounicode}",
    r"\input{glyphtounicode}\IfFileExists{glyphtounicode-cmr.tex}{\input{glyphtounicode-cmr}}{}",
    r"\endgroup\pdfvariable gentounicode=1 ",
    r"\else\ifdefined\pdfglyphtounicode",
    r"\input{glyphtounicode}\IfFileExists{glyphtounicode-cmr.tex}{\input{glyphtounicode-cmr}}{}",
    r"\pdfgentounicode=1 ",
    r"\fi\fi"
);

/// What is given to the engine before the document: the text of the
/// glyphs, and the metadata of the standard (unless the document gives its
/// own `\DocumentMetadata`, which is kept).
pub fn prefix(standard: Standard, root: &str) -> String {
    prefix_for(Some(standard), false, root)
}

/// The same, for a PDF/A, an accessible PDF, or both (see [`metadata_for`]).
pub fn prefix_for(archive: Option<Standard>, accessible: bool, root: &str) -> String {
    if has_metadata(root) {
        UNICODE.to_owned()
    } else {
        format!("{UNICODE}{}", metadata_for(archive, accessible, root))
    }
}

/// The `\DocumentMetadata` of a standard.
pub fn metadata(standard: Standard, root: &str) -> String {
    metadata_for(Some(standard), false, root)
}

/// The PDF/A of an accessible PDF: PDF/A-3b, the files its tags embed
/// (the source of the formulas) being refused by PDF/A-2.
pub const ACCESSIBLE_ARCHIVE: Standard = Standard::A3b;

/// The `\DocumentMetadata` of a PDF/A (`archive`), of an accessible PDF
/// (tagged: its structure read aloud by screen readers, PDF/UA-2 in PDF
/// 2.0), or of both (PDF/A-3b with PDF/UA-1, in PDF 1.7: checked by
/// veraPDF with the three engines). An accessible PDF always says its
/// language (English when the document does not choose one).
pub fn metadata_for(archive: Option<Standard>, accessible: bool, root: &str) -> String {
    let lang = language_tag(root);
    let mut keys = Vec::new();
    match (archive, accessible) {
        (Some(standard), false) => {
            keys.push(format!("pdfstandard={}", standard.key()));
            keys.push(format!("pdfversion={}", standard.pdf_version()));
        }
        (None, true) => {
            keys.push("tagging=on".to_owned());
            keys.push("pdfstandard=ua-2".to_owned());
        }
        (Some(_), true) => {
            keys.push("tagging=on".to_owned());
            keys.push(format!("pdfstandard={{{},ua-1}}", ACCESSIBLE_ARCHIVE.key()));
            keys.push("pdfversion=1.7".to_owned());
        }
        (None, false) => {}
    }
    if let Some(lang) = lang.or(accessible.then_some("en-US")) {
        keys.push(format!("lang={lang}"));
    }
    format!("\\DocumentMetadata{{{}}}", keys.join(", "))
}

/// What was found in a PDF.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    /// `1.7`…
    pub version: String,
    /// What its metadata say it is (part, conformance).
    pub part: Option<u8>,
    /// `B`, `U`…
    pub conformance: Option<String>,
    /// A colour profile for the archive.
    pub output_intent: bool,
    /// Fonts of a file format (not drawn in the PDF itself).
    pub fonts: usize,
    /// Fonts whose file is not in the PDF.
    pub not_embedded: usize,
    /// Their names.
    pub missing: Vec<String>,
    /// Transparency (refused by PDF/A-1).
    pub transparency: bool,
    /// Locked with a password.
    pub encrypted: bool,
    /// Holds JavaScript.
    pub javascript: bool,
    /// Tagged: a tree of the structure, marked as such.
    pub tagged: bool,
    /// Says its language.
    pub lang: bool,
    /// Has a title, shown in place of the name of the file.
    pub title: bool,
    /// What its metadata say it is of PDF/UA (part).
    pub ua_part: Option<u8>,
}

/// What does not go with an accessible PDF, by code (`untagged`, `lang`,
/// `title`, `identification`, `alt`: pictures without a text in place of
/// them, as many as `missing_alt`).
pub fn accessible_problems(check: &Check, missing_alt: usize) -> Vec<&'static str> {
    let mut out = Vec::new();
    if !check.tagged {
        out.push("untagged");
    }
    if !check.lang {
        out.push("lang");
    }
    if !check.title {
        out.push("title");
    }
    if check.ua_part.is_none() {
        out.push("identification");
    }
    if missing_alt > 0 {
        out.push("alt");
    }
    out
}

/// What tagpdf says of a picture without a text in place of it.
pub const MISSING_ALT: &str = "Alternative text for graphic is missing";

/// What does not go with the standard, by code (`version`, `metadata`,
/// `colour`, `fonts`, `transparency`, `encrypted`, `javascript`).
pub fn problems(check: &Check, standard: Standard) -> Vec<&'static str> {
    let (part, conformance) = standard.part();
    let mut out = Vec::new();
    let allowed = if part == 1 { 1.4 } else { 1.7 };
    if check
        .version
        .parse::<f32>()
        .is_ok_and(|v| v > allowed + 0.001)
    {
        out.push("version");
    }
    if check.part != Some(part)
        || check
            .conformance
            .as_deref()
            .is_none_or(|c| !c.eq_ignore_ascii_case(&conformance.to_string()))
    {
        out.push("metadata");
    }
    if !check.output_intent {
        out.push("colour");
    }
    if check.not_embedded > 0 {
        out.push("fonts");
    }
    if part == 1 && check.transparency {
        out.push("transparency");
    }
    if check.encrypted {
        out.push("encrypted");
    }
    if check.javascript {
        out.push("javascript");
    }
    out
}

/// Looks at a PDF: its objects, those of its compressed streams too.
pub fn check(pdf: &Path) -> std::io::Result<Check> {
    let data = std::fs::read(pdf)?;
    Ok(check_bytes(&data))
}

/// The objects of a PDF by their number: written as they are, and those
/// kept in its compressed object streams.
fn objects(data: &[u8]) -> std::collections::HashMap<u32, Vec<u8>> {
    let mut out = std::collections::HashMap::new();
    let object = Regex::new(r"(?s-u)(\d+)\s+\d+\s+obj\b(.*?)\bendobj").unwrap();
    for c in object.captures_iter(data) {
        let Some(n) = std::str::from_utf8(&c[1]).ok().and_then(|n| n.parse().ok()) else {
            continue;
        };
        out.insert(n, c[2].to_vec());
    }
    let streams: Vec<Vec<u8>> = out
        .values()
        .filter(|body| Regex::new(r"/Type\s*/ObjStm").unwrap().is_match(body))
        .cloned()
        .collect();
    let number = |body: &[u8], key: &str| -> Option<usize> {
        let re = Regex::new(&format!(r"/{key}\s+(\d+)")).unwrap();
        std::str::from_utf8(&re.captures(body)?[1])
            .ok()?
            .parse()
            .ok()
    };
    for body in streams {
        let (Some(count), Some(first)) = (number(&body, "N"), number(&body, "First")) else {
            continue;
        };
        let Some(content) = inflate(&body) else {
            continue;
        };
        let head = String::from_utf8_lossy(&content[..first.min(content.len())]).into_owned();
        let pairs: Vec<usize> = head
            .split_whitespace()
            .filter_map(|t| t.parse().ok())
            .collect();
        for k in 0..count.min(pairs.len() / 2) {
            let (n, at) = (pairs[2 * k], first + pairs[2 * k + 1]);
            let to = if k + 1 < count {
                pairs.get(2 * k + 3).map_or(content.len(), |o| first + o)
            } else {
                content.len()
            };
            if at <= to && to <= content.len() {
                out.entry(n as u32)
                    .or_insert_with(|| content[at..to].to_vec());
            }
        }
    }
    out
}

/// The content of the stream of an object, uncompressed.
fn inflate(body: &[u8]) -> Option<Vec<u8>> {
    let start = Regex::new(r"stream\r?\n").unwrap().find(body)?.end();
    let len = memchr::memmem::find(&body[start..], b"endstream")?;
    let mut out = Vec::new();
    flate2::read::ZlibDecoder::new(&body[start..start + len])
        .take(64 * 1024 * 1024)
        .read_to_end(&mut out)
        .ok()?;
    Some(out)
}

fn check_bytes(data: &[u8]) -> Check {
    let version = data
        .strip_prefix(b"%PDF-")
        .map(|rest| {
            String::from_utf8_lossy(
                &rest[..rest
                    .iter()
                    .position(|b| b.is_ascii_whitespace())
                    .unwrap_or(3)
                    .min(4)],
            )
            .into_owned()
        })
        .unwrap_or_default();
    let objects = objects(data);
    // The text of the file, and of every stream it compresses (the
    // metadata, the content of the pages).
    let mut text: Vec<u8> = data.to_vec();
    for body in objects.values() {
        if let Some(inner) = inflate(body) {
            text.push(b'\n');
            text.extend_from_slice(&inner);
        }
        text.push(b'\n');
        text.extend_from_slice(body);
    }
    let find = |re: &str| Regex::new(re).unwrap();
    let part = find(r#"pdfaid:part(?:>|\s*=\s*["'])\s*(\d)"#)
        .captures(&text)
        .and_then(|c| std::str::from_utf8(&c[1]).ok()?.parse().ok());
    let conformance = find(r#"pdfaid:conformance(?:>|\s*=\s*["'])\s*([A-Za-z])"#)
        .captures(&text)
        .map(|c| String::from_utf8_lossy(&c[1]).into_owned());
    let output_intent =
        find(r"/OutputIntents").is_match(&text) && find(r"/GTS_PDFA").is_match(&text);
    // Each font of a file format names its descriptor, and the descriptor
    // its file (Type 3 fonts are drawn in the PDF itself, a Type 0 font is
    // a wrapper of its descendant).
    let font = find(r"/Type\s*/Font\b");
    let file_format = find(r"/Subtype\s*/(?:Type1|MMType1|TrueType|CIDFontType0|CIDFontType2)\b");
    let descriptor = find(r"/FontDescriptor\s+(\d+)\s+\d+\s+R");
    let base = find(r"/BaseFont\s*/([^\s/<>\[\]()]+)");
    let embedded = find(r"/FontFile[23]?\s");
    let mut fonts = 0;
    let mut missing = std::collections::BTreeSet::new();
    let mut numbers: Vec<&u32> = objects.keys().collect();
    numbers.sort();
    for n in numbers {
        let body = &objects[n];
        // The dictionary of the object, not the content of its stream.
        let dict = &body[..memchr::memmem::find(body, b"stream").unwrap_or(body.len())];
        if !font.is_match(dict) || !file_format.is_match(dict) {
            continue;
        }
        fonts += 1;
        let file = descriptor
            .captures(dict)
            .and_then(|c| std::str::from_utf8(&c[1]).ok()?.parse::<u32>().ok())
            .and_then(|d| objects.get(&d))
            .is_some_and(|d| embedded.is_match(d));
        if !file {
            let name = base
                .captures(dict)
                .map(|c| String::from_utf8_lossy(&c[1]).into_owned())
                .unwrap_or_else(|| format!("{n}"));
            missing.insert(name);
        }
    }
    let transparency = find(r"/S\s*/Transparency|/SMask\s+\d|/(?:ca|CA)\s+0?\.\d").is_match(&text);
    let encrypted = find(r"/Encrypt\s").is_match(data);
    let javascript = find(r"/JavaScript\b|/JS\s*[(<\d]").is_match(&text);
    let tagged = find(r"/StructTreeRoot\s+\d+\s+\d+\s+R").is_match(&text)
        // Written in the catalog, or in an object of its own it points to.
        && find(r"/MarkInfo\s*(?:<<|\d+\s+\d+\s+R)").is_match(&text)
        && find(r"/Marked\s+true").is_match(&text);
    let lang = find(r"/Lang\s*[(<]").is_match(&text);
    let title = find(r"(?s-u)<dc:title>.*?<rdf:li[^>]*>[^<\s]").is_match(&text)
        && find(r"/DisplayDocTitle\s+true").is_match(&text);
    let ua_part = find(r#"pdfuaid:part(?:>|\s*=\s*["'])\s*(\d)"#)
        .captures(&text)
        .and_then(|c| std::str::from_utf8(&c[1]).ok()?.parse().ok());
    Check {
        version,
        part,
        conformance,
        output_intent,
        fonts,
        not_embedded: missing.len(),
        missing: missing.into_iter().collect(),
        transparency,
        encrypted,
        javascript,
        tagged,
        lang,
        title,
        ua_part,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_language_and_the_line_given_to_the_engine() {
        let fr =
            "\\documentclass{article}\n\\usepackage[english,french]{babel}\n\\begin{document}\n";
        assert_eq!(language_tag(fr), Some("fr-FR"));
        assert_eq!(
            language_tag("\\usepackage[french,main=english]{babel}"),
            Some("en-US")
        );
        assert_eq!(
            language_tag("\\usepackage{polyglossia}\n\\setmainlanguage{german}"),
            Some("de-DE")
        );
        assert_eq!(language_tag("\\documentclass{article}"), None);
        assert_eq!(
            metadata(Standard::A2b, fr),
            "\\DocumentMetadata{pdfstandard=a-2b, pdfversion=1.7, lang=fr-FR}"
        );
        assert_eq!(
            metadata(Standard::A1b, ""),
            "\\DocumentMetadata{pdfstandard=a-1b, pdfversion=1.4}"
        );
        assert!(has_metadata(
            "\\DocumentMetadata{pdfstandard=a-2b}\n\\documentclass{article}"
        ));
        assert!(!has_metadata(
            "% \\DocumentMetadata{}\n\\documentclass{article}\n\\DocumentMetadata"
        ));
        assert_eq!(
            kernel_date("\\edef\\fmtversion\n   {2021-11-15}"),
            Some((2021, 11, 15))
        );
        assert_eq!(kernel_date("\\edef\\fmtversion{x}"), None);
        // Accessible: tagged, PDF/UA-2; with a PDF/A, PDF/A-3b and PDF/UA-1; a language always.
        assert_eq!(
            metadata_for(None, true, fr),
            "\\DocumentMetadata{tagging=on, pdfstandard=ua-2, lang=fr-FR}"
        );
        assert_eq!(
            metadata_for(Some(Standard::A2b), true, ""),
            "\\DocumentMetadata{tagging=on, pdfstandard={a-3b,ua-1}, pdfversion=1.7, lang=en-US}"
        );
    }

    #[test]
    fn an_accessible_pdf_is_told() {
        let pdf = b"%PDF-2.0\n1 0 obj << /Type /Catalog /StructTreeRoot 2 0 R /MarkInfo << /Marked true >> /Lang (fr-FR) /ViewerPreferences << /DisplayDocTitle true >> >> endobj\n<x:xmpmeta><dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">Essai</rdf:li></rdf:Alt></dc:title><pdfuaid:part>2</pdfuaid:part></x:xmpmeta>";
        let c = check_bytes(pdf);
        assert!(c.tagged && c.lang && c.title);
        assert_eq!(c.ua_part, Some(2));
        assert!(accessible_problems(&c, 0).is_empty());
        assert_eq!(accessible_problems(&c, 2), vec!["alt"]);
        let bare = check_bytes(b"%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj");
        assert_eq!(
            accessible_problems(&bare, 0),
            vec!["untagged", "lang", "title", "identification"]
        );
    }

    #[test]
    fn what_a_pdf_holds_is_told() {
        let pdf = b"%PDF-1.7\n1 0 obj << /Type /Catalog /OutputIntents [2 0 R] >> endobj\n2 0 obj << /S /GTS_PDFA1 >> endobj\n3 0 obj << /Type /Font /Subtype /Type1 /FontDescriptor 4 0 R >> endobj\n4 0 obj << /Type /FontDescriptor /FontFile 5 0 R >> endobj\n<x:xmpmeta><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></x:xmpmeta>";
        let c = check_bytes(pdf);
        assert_eq!(c.version, "1.7");
        assert_eq!((c.part, c.conformance.as_deref()), (Some(2), Some("B")));
        assert!(c.output_intent);
        assert_eq!((c.fonts, c.not_embedded), (1, 0));
        assert!(problems(&c, Standard::A2b).is_empty());
        assert_eq!(problems(&c, Standard::A1b), vec!["version", "metadata"]);
        // A font of the reader (Helvetica, without its file), transparency.
        let bare = b"%PDF-2.0\n1 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n2 0 obj << /ca 0.5 >> endobj";
        let c = check_bytes(bare);
        assert_eq!(c.not_embedded, 1);
        assert_eq!(c.missing, vec!["Helvetica"]);
        assert!(c.transparency);
        assert_eq!(
            problems(&c, Standard::A1b),
            vec!["version", "metadata", "colour", "fonts", "transparency"]
        );
    }

    /// The three engines make a tagged PDF (PDF/UA-2, and PDF/A-3b with
    /// PDF/UA-1 when a PDF/A goes with it); a picture without a text in
    /// place of it is told.
    #[test]
    #[ignore = "needs a TeX distribution"]
    fn documents_are_made_accessible() {
        use crate::build::{BuildEvent, DocumentFacts, RunContext, plan, run};
        use crate::i18n::Lang;
        use crate::settings::{BuildSettings, EngineChoice};
        use std::sync::atomic::AtomicBool;
        let Some(dist) = crate::tex::detect(&[]).into_iter().next() else {
            println!("no TeX distribution: nothing checked");
            return;
        };
        if !tagging_supported(&dist) {
            println!("LaTeX older than June 2025: no tagging, nothing checked");
            return;
        }
        let picture = std::process::Command::new(dist.bin_dir.join("kpsewhich"))
            .arg("example-image-a.png")
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
            .filter(|p| !p.is_empty())
            .expect("example-image-a.png");
        let doc = |alt: &str| {
            format!(
                "\\documentclass{{article}}\n\\usepackage{{iftex}}\n\\ifPDFTeX\\usepackage[T1]{{fontenc}}\\fi\n\\usepackage[french]{{babel}}\n\\usepackage{{amsmath, graphicx, hyperref}}\n\\title{{Essai accessible}}\n\\author{{Camille Martin}}\n\\begin{{document}}\n\\maketitle\n\\section{{Un}}\nTexte, $a^2 + b^2 = c^2$, une liste~:\n\\begin{{itemize}}\\item un\\item deux\\end{{itemize}}\n\\begin{{equation}}\\int_0^1 x\\,dx = \\frac{{1}}{{2}}\\end{{equation}}\n\\includegraphics[width=3cm{alt}]{{photo.png}}\n\\begin{{tabular}}{{ll}}a & 1\\\\ b & 2\\\\\\end{{tabular}}\n\\end{{document}}\n"
            )
        };
        for engine in [
            EngineChoice::Pdflatex,
            EngineChoice::Lualatex,
            EngineChoice::Xelatex,
        ] {
            for (archive, alt) in [
                (None, ", alt={Un carré gris}"),
                (Some(Standard::A2b), ", alt={Un carré gris}"),
                (None, ""),
            ] {
                let text = doc(alt);
                let dir = tempfile::tempdir().unwrap();
                let base = dunce::canonicalize(dir.path()).unwrap();
                std::fs::copy(&picture, base.join("photo.png")).unwrap();
                let root = base.join("main.tex");
                std::fs::write(&root, &text).unwrap();
                let settings = BuildSettings {
                    engine,
                    out_dir: "build".to_owned(),
                    precompile_preamble: false,
                    figure_cache: false,
                    ..BuildSettings::default()
                };
                let mut p = plan(
                    &root,
                    &settings,
                    Some(&dist),
                    &DocumentFacts::default(),
                    Lang::En,
                )
                .unwrap();
                let standard = archive.map(|_| ACCESSIBLE_ARCHIVE);
                p.prefix = Some(prefix_for(standard, true, &text));
                let cancel = AtomicBool::new(false);
                let source = |path: &Path| std::fs::read_to_string(path).ok();
                let ctx = RunContext {
                    dist: &dist,
                    settings: &settings,
                    cancel: &cancel,
                    lang: Lang::En,
                    source: &source,
                    packages: None,
                    background: false,
                    live: false,
                };
                let outcome = run(&p, &ctx, &mut |_: BuildEvent| {});
                assert!(
                    outcome.success,
                    "{engine:?} {archive:?}: {:?}",
                    outcome.diagnostics
                );
                let missing_alt = outcome
                    .diagnostics
                    .iter()
                    .filter(|d| d.message.contains(MISSING_ALT))
                    .count();
                let c = check(&p.pdf).unwrap();
                let found = accessible_problems(&c, missing_alt);
                let expected: Vec<&str> = if alt.is_empty() { vec!["alt"] } else { vec![] };
                assert_eq!(found, expected, "{engine:?} {archive:?} {alt:?}: {c:?}");
                assert_eq!(
                    c.ua_part,
                    Some(if archive.is_some() { 1 } else { 2 }),
                    "{engine:?} {archive:?}"
                );
                if let Some(standard) = standard {
                    assert_eq!(
                        problems(&c, standard),
                        Vec::<&str>::new(),
                        "{engine:?}: {c:?}"
                    );
                }
                // With veraPDF (`VERAPDF`): the same, for PDF/UA and for the PDF/A.
                if let Ok(vera) = std::env::var("VERAPDF") {
                    let flavours: Vec<&str> = match standard {
                        Some(s) => vec!["ua1", &s.key()[2..]],
                        None => vec!["ua2"],
                    };
                    for flavour in flavours {
                        let out = std::process::Command::new(&vera)
                            .args(["--flavour", flavour, "--format", "text"])
                            .arg(&p.pdf)
                            .output()
                            .unwrap();
                        let said = String::from_utf8_lossy(&out.stdout);
                        assert!(
                            said.starts_with("PASS"),
                            "{engine:?} {archive:?} {alt:?} {flavour}: veraPDF {said}"
                        );
                    }
                }
            }
        }
    }

    /// The three engines make what the standard asks for, with the line given before the document.
    #[test]
    #[ignore = "needs a TeX distribution"]
    fn documents_are_made_pdf_a() {
        use crate::build::{BuildEvent, DocumentFacts, RunContext, plan, run};
        use crate::i18n::Lang;
        use crate::settings::{BuildSettings, EngineChoice};
        use std::sync::atomic::AtomicBool;
        let Some(dist) = crate::tex::detect(&[]).into_iter().next() else {
            println!("no TeX distribution: nothing checked");
            return;
        };
        if !supported(&dist) {
            println!("LaTeX older than June 2022: no PDF/A, nothing checked");
            return;
        }
        let doc = "\\documentclass{article}\n\\usepackage{iftex}\n\\ifPDFTeX\\usepackage[T1]{fontenc}\\fi\n\\usepackage[french]{babel}\n\\usepackage{tikz}\n\\usepackage{hyperref}\n\\hypersetup{pdftitle={Étude}, pdfauthor={Camille Martin}}\n\\begin{document}\n\\section{Un}\\label{s}\nTexte, $x^2$, $\\displaystyle\\int_0^1 \\sum_{k} x^k\\,dx$ et un renvoi~\\ref{s}.\n\\begin{tikzpicture}\\fill[blue, opacity=0.5] (0,0) rectangle (1,1);\\end{tikzpicture}\n\\end{document}\n";
        for engine in [
            EngineChoice::Pdflatex,
            EngineChoice::Lualatex,
            EngineChoice::Xelatex,
        ] {
            for standard in [Standard::A2b, Standard::A1b, Standard::A2u, Standard::A3b] {
                let dir = tempfile::tempdir().unwrap();
                let root = dunce::canonicalize(dir.path()).unwrap().join("main.tex");
                std::fs::write(&root, doc).unwrap();
                let settings = BuildSettings {
                    engine,
                    out_dir: "build".to_owned(),
                    precompile_preamble: false,
                    figure_cache: false,
                    ..BuildSettings::default()
                };
                let mut p = plan(
                    &root,
                    &settings,
                    Some(&dist),
                    &DocumentFacts::default(),
                    Lang::En,
                )
                .unwrap();
                p.prefix = Some(prefix(standard, doc));
                let cancel = AtomicBool::new(false);
                let source = |path: &Path| std::fs::read_to_string(path).ok();
                let ctx = RunContext {
                    dist: &dist,
                    settings: &settings,
                    cancel: &cancel,
                    lang: Lang::En,
                    source: &source,
                    packages: None,
                    background: false,
                    live: false,
                };
                let outcome = run(&p, &ctx, &mut |_: BuildEvent| {});
                assert!(
                    outcome.success,
                    "{engine:?} {standard:?}: {:?} {:?}",
                    outcome.diagnostics, outcome.steps
                );
                let c = check(&p.pdf).unwrap();
                let found = problems(&c, standard);
                // PDF/A-1 refuses the transparency of the picture: it is said.
                let expected: Vec<&str> = if standard == Standard::A1b {
                    vec!["transparency"]
                } else {
                    vec![]
                };
                assert_eq!(found, expected, "{engine:?} {standard:?}: {c:?}");
                // With veraPDF (`VERAPDF`, the path of its command): it says the same.
                if let Ok(vera) = std::env::var("VERAPDF") {
                    let out = std::process::Command::new(&vera)
                        .args(["--flavour", &standard.key()[2..], "--format", "text"])
                        .arg(&p.pdf)
                        .output()
                        .unwrap();
                    let said = String::from_utf8_lossy(&out.stdout);
                    assert_eq!(
                        said.starts_with("PASS"),
                        found.is_empty(),
                        "{engine:?} {standard:?}: veraPDF {said}"
                    );
                }
                assert!(c.fonts > 0, "{engine:?}: {c:?}");
            }
        }
    }
}
