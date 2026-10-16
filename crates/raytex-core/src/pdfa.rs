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

/// What is given to the engine before the document.
pub fn metadata(standard: Standard, root: &str) -> String {
    let mut keys = vec![
        format!("pdfstandard={}", standard.key()),
        format!("pdfversion={}", standard.pdf_version()),
    ];
    if let Some(lang) = language_tag(root) {
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
}

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
        let doc = "\\documentclass{article}\n\\usepackage{iftex}\n\\ifPDFTeX\\usepackage[T1]{fontenc}\\fi\n\\usepackage[french]{babel}\n\\usepackage{tikz}\n\\usepackage{hyperref}\n\\hypersetup{pdftitle={Étude}, pdfauthor={Camille Martin}}\n\\begin{document}\n\\section{Un}\\label{s}\nTexte, $x^2$ et un renvoi~\\ref{s}.\n\\begin{tikzpicture}\\fill[blue, opacity=0.5] (0,0) rectangle (1,1);\\end{tikzpicture}\n\\end{document}\n";
        for engine in [
            EngineChoice::Pdflatex,
            EngineChoice::Lualatex,
            EngineChoice::Xelatex,
        ] {
            for standard in [Standard::A2b, Standard::A1b, Standard::A3b] {
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
                p.prefix = Some(metadata(standard, doc));
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
                    "{engine:?} {standard:?}: {:?}",
                    outcome.diagnostics
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
                assert!(c.fonts > 0, "{engine:?}: {c:?}");
            }
        }
    }
}
