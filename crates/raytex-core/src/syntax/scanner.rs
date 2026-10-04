//! Single-pass, fault-tolerant structural scanner.
//!
//! The scanner walks the bytes once, jumping directly between the few bytes
//! that matter (`\`, `%`, `$`, `{`, `}`, newline). Command arguments are read
//! with a small [`Cursor`] that never allocates. Arguments that may contain
//! further structure (section titles, captions) are only *peeked*, so labels
//! or citations nested inside them are still discovered; opaque arguments
//! (keys, paths, macro bodies, verbatim) are consumed.

use std::collections::HashSet;

use super::plain::to_plain;
use super::*;
use crate::text::{ellipsize, squash_whitespace};

/// Scanner configuration.
#[derive(Debug, Clone, Copy, Default)]
pub struct ScanOptions {
    /// Treat `@` as a letter (package and class files).
    pub at_letter: bool,
    /// Also scan inside macro bodies, to find definitions nested in other
    /// definitions (packages install commands this way, e.g. TikZ's `\draw`).
    pub descend_definitions: bool,
}

/// Scans a `.tex` document.
pub fn scan(text: &str) -> DocumentIndex {
    scan_with(text, ScanOptions::default())
}

/// Scans `text` with explicit options.
pub fn scan_with(text: &str, options: ScanOptions) -> DocumentIndex {
    let mut scanner = Scanner {
        text,
        bytes: text.as_bytes(),
        pos: 0,
        at_letter: options.at_letter,
        descend: options.descend_definitions,
        idx: DocumentIndex::default(),
        envs: Vec::new(),
        braces: Vec::new(),
        math: None,
        env_dollar: false,
        last_section: None,
        theorems: HashSet::new(),
    };
    scanner.run();
    scanner.finish()
}

/// Maximum length of a "short" argument (keys, titles, paths).
const SHORT_ARG: usize = 4096;
/// Maximum length of a "long" argument (macro bodies).
const LONG_ARG: usize = 256 * 1024;

/// Bytes the main loop must stop at.
static INTERESTING: [bool; 256] = {
    let mut t = [false; 256];
    t[b'\\' as usize] = true;
    t[b'%' as usize] = true;
    t[b'$' as usize] = true;
    t[b'{' as usize] = true;
    t[b'}' as usize] = true;
    t[b'\n' as usize] = true;
    t
};

#[derive(Debug)]
struct EnvFrame {
    name: String,
    begin: Span,
    content_start: usize,
    math: bool,
    labels: Vec<usize>,
    caption: Option<String>,
    title: Option<String>,
    left_right: i32,
    blank_line_reported: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Delim {
    Dollar,
    DoubleDollar,
    Paren,
    Bracket,
}

#[derive(Debug)]
struct MathFrame {
    delim: Delim,
    open: Span,
    content_start: usize,
    left_right: i32,
    nested_dollar: bool,
}

struct Scanner<'a> {
    text: &'a str,
    bytes: &'a [u8],
    pos: usize,
    at_letter: bool,
    descend: bool,
    idx: DocumentIndex,
    envs: Vec<EnvFrame>,
    braces: Vec<usize>,
    math: Option<MathFrame>,
    /// `$` toggled inside a math environment (e.g. inside `\text{…}`).
    env_dollar: bool,
    last_section: Option<usize>,
    theorems: HashSet<String>,
}

impl<'a> Scanner<'a> {
    fn run(&mut self) {
        let len = self.bytes.len();
        while self.pos < len {
            match self.bytes[self.pos] {
                b'\\' => self.backslash(),
                b'%' => self.comment(),
                b'$' => self.dollar(),
                b'{' => {
                    self.braces.push(self.pos);
                    self.pos += 1;
                }
                b'}' => {
                    if self.braces.pop().is_none() {
                        self.problem(self.pos..self.pos + 1, ProblemKind::UnmatchedCloseBrace);
                    }
                    self.pos += 1;
                }
                b'\n' => self.newline(),
                _ => {
                    self.pos += 1;
                    while self.pos < len && !INTERESTING[self.bytes[self.pos] as usize] {
                        self.pos += 1;
                    }
                }
            }
        }
    }

    fn finish(mut self) -> DocumentIndex {
        if let Some(m) = self.math.take() {
            self.problem(m.open, ProblemKind::UnclosedMath);
        }
        while let Some(frame) = self.envs.pop() {
            self.problem(
                frame.begin.clone(),
                ProblemKind::UnclosedEnvironment(frame.name.clone()),
            );
            self.close_frame(frame, None);
        }
        for open in self.braces.iter().rev().take(20) {
            self.idx.problems.push(Problem {
                span: *open..*open + 1,
                kind: ProblemKind::UnclosedBrace,
            });
        }
        self.idx.problems.sort_by_key(|p| p.span.start);
        self.idx.environments.sort_by_key(|e| e.begin.start);
        self.idx.math.sort_by_key(|m| m.start);
        self.idx
    }

    fn problem(&mut self, span: Span, kind: ProblemKind) {
        self.idx.problems.push(Problem { span, kind });
    }

    fn cursor(&self) -> Cursor<'a> {
        Cursor {
            text: self.text,
            pos: self.pos,
        }
    }

    fn slice(&self, span: &Span) -> &'a str {
        &self.text[span.clone()]
    }

    fn in_math(&self) -> bool {
        self.math.is_some() || self.envs.last().is_some_and(|f| f.math)
    }

    // ----------------------------------------------------------------- lexing

    fn newline(&mut self) {
        self.pos += 1;
        let mut p = self.pos;
        while p < self.bytes.len() && matches!(self.bytes[p], b' ' | b'\t' | b'\r') {
            p += 1;
        }
        let blank = p >= self.bytes.len() || self.bytes[p] == b'\n';
        if !blank {
            return;
        }
        // A blank line ends the paragraph: inline and display math cannot cross it.
        if let Some(m) = self.math.take() {
            self.problem(m.open, ProblemKind::UnclosedMath);
        } else if let Some(frame) = self.envs.last_mut()
            && frame.math
            && !frame.blank_line_reported
            && p < self.bytes.len()
        {
            frame.blank_line_reported = true;
            let span = self.pos..p;
            self.problem(span, ProblemKind::UnclosedMath);
        }
    }

    fn comment(&mut self) {
        let start = self.pos;
        let end =
            memchr::memchr(b'\n', &self.bytes[start..]).map_or(self.bytes.len(), |i| start + i);
        let body = &self.text[start + 1..end];
        self.magic_comment(body);
        for tag in ["TODO", "FIXME", "XXX"] {
            if let Some(i) = body.find(tag) {
                let before_ok = i == 0 || !body.as_bytes()[i - 1].is_ascii_alphanumeric();
                let after = &body[i + tag.len()..];
                let after_ok = !after.starts_with(|c: char| c.is_ascii_alphanumeric());
                if before_ok && after_ok {
                    let note = after.trim_start_matches([':', ' ', '\t']).trim();
                    let span = start + 1 + i..end;
                    self.idx.todos.push(Todo {
                        tag: tag.to_owned(),
                        text: note.to_owned(),
                        span,
                    });
                    break;
                }
            }
        }
        self.pos = end;
    }

    fn magic_comment(&mut self, body: &str) {
        let body = body.trim_start();
        let Some(rest) = body.strip_prefix('!') else {
            return;
        };
        let rest = rest.trim_start();
        let (is_bib, rest) = if let Some(r) = strip_prefix_ci(rest, "tex") {
            (false, r)
        } else if let Some(r) = strip_prefix_ci(rest, "bib") {
            (true, r)
        } else {
            return;
        };
        let Some((key, value)) = rest.split_once('=') else {
            return;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim().to_owned();
        if value.is_empty() {
            return;
        }
        let magic = &mut self.idx.magic;
        match (is_bib, key.as_str()) {
            (false, "root") => magic.root = Some(value),
            (false, "program" | "ts-program") => magic.program = Some(value.to_ascii_lowercase()),
            (true, "program" | "ts-program") => {
                magic.bib_program = Some(value.to_ascii_lowercase())
            }
            (false, "spellcheck") => magic.spellcheck = Some(value),
            _ => {}
        }
    }

    fn dollar(&mut self) {
        let start = self.pos;
        let double = self.bytes.get(start + 1) == Some(&b'$');
        match &mut self.math {
            None => {
                if self.envs.last().is_some_and(|f| f.math) {
                    // `$` inside a math environment: text-in-math (`\text{$x$}`).
                    self.env_dollar = !self.env_dollar;
                    self.pos += 1;
                    return;
                }
                let (delim, width) = if double {
                    (Delim::DoubleDollar, 2)
                } else {
                    (Delim::Dollar, 1)
                };
                self.open_math(delim, start..start + width);
            }
            Some(m) if m.delim == Delim::Dollar && !m.nested_dollar => {
                self.close_math(start..start + 1);
            }
            Some(m) if m.delim == Delim::DoubleDollar && double && !m.nested_dollar => {
                self.close_math(start..start + 2);
            }
            Some(m) => {
                m.nested_dollar = !m.nested_dollar;
                self.pos += 1;
            }
        }
    }

    fn open_math(&mut self, delim: Delim, open: Span) {
        if self.in_math() {
            self.problem(open.clone(), ProblemKind::NestedMath);
        }
        self.pos = open.end;
        if self.math.is_none() {
            self.math = Some(MathFrame {
                delim,
                content_start: open.end,
                open,
                left_right: 0,
                nested_dollar: false,
            });
        }
    }

    fn close_math(&mut self, close: Span) {
        if let Some(m) = self.math.take() {
            if m.left_right != 0 {
                self.problem(m.open.clone(), ProblemKind::LeftRightMismatch);
            }
            self.idx.math.push(m.content_start..close.start);
        }
        self.pos = close.end;
    }

    fn backslash(&mut self) {
        let start = self.pos;
        let len = self.bytes.len();
        self.pos += 1;
        if self.pos >= len {
            return;
        }
        let c = self.bytes[self.pos];
        if is_letter(c, self.at_letter) {
            let name_start = self.pos;
            while self.pos < len && is_letter(self.bytes[self.pos], self.at_letter) {
                self.pos += 1;
            }
            let text = self.text;
            let name = &text[name_start..self.pos];
            bump(&mut self.idx.command_usage, name);
            self.command(start, name);
            return;
        }
        match c {
            b'(' => self.open_math(Delim::Paren, start..start + 2),
            b'[' => self.open_math(Delim::Bracket, start..start + 2),
            b')' | b']' => {
                let expected = if c == b')' {
                    Delim::Paren
                } else {
                    Delim::Bracket
                };
                if self.math.as_ref().is_some_and(|m| m.delim == expected) {
                    self.close_math(start..start + 2);
                } else {
                    self.problem(start..start + 2, ProblemKind::UnmatchedMathClose);
                    self.pos = start + 2;
                }
            }
            _ => self.pos += utf8_width(c),
        }
    }

    // --------------------------------------------------------------- commands

    fn command(&mut self, start: usize, name: &'a str) {
        match name {
            "begin" => self.begin(start),
            "end" => self.end(start),
            "documentclass" => self.document_class(),
            "usepackage" | "RequirePackage" | "RequirePackageWithOptions" => {
                self.use_package(start)
            }
            "part" | "chapter" | "addchap" | "section" | "addsec" | "subsection"
            | "subsubsection" | "paragraph" | "subparagraph" => self.section(start, name),
            "frametitle" => self.frame_title(),
            "label" => self.label(),
            "caption" | "captionof" => self.caption(name),
            "hyperref" => self.hyperref(),
            "crefrange" | "Crefrange" | "cpagerefrange" | "Cpagerefrange" => {
                self.keys(name, 2, false)
            }
            "bibitem" => self.bibitem(),
            "input" | "include" | "subfile" | "subfileinclude" | "InputIfFileExists"
            | "includestandalone" => self.input(name),
            "import" | "subimport" | "inputfrom" | "subinputfrom" | "includefrom"
            | "subincludefrom" => self.import(name),
            "includegraphics" | "includesvg" => self.graphics(name),
            "includepdf" | "lstinputlisting" | "verbatiminput" | "VerbatimInput"
            | "LVerbatimInput" | "BVerbatimInput" => self.other_file(name, 0),
            "inputminted" => self.other_file(name, 1),
            "bibliography" => self.bibliography(),
            "addbibresource" | "addglobalbib" | "addsectionbib" => self.bib_resource(name),
            "graphicspath" => self.graphicspath(),
            "newcommand"
            | "renewcommand"
            | "providecommand"
            | "DeclareRobustCommand"
            | "newrobustcmd"
            | "renewrobustcmd"
            | "providerobustcmd" => self.new_command(false),
            "DeclareMathOperator" => self.new_command(true),
            "NewDocumentCommand"
            | "RenewDocumentCommand"
            | "ProvideDocumentCommand"
            | "DeclareDocumentCommand"
            | "NewExpandableDocumentCommand" => self.document_command(),
            "def" | "gdef" | "edef" | "xdef" => self.def(),
            "let" => self.let_(),
            "newif" => self.new_if(),
            "newenvironment" | "renewenvironment" | "provideenvironment" => self.new_environment(),
            "NewDocumentEnvironment"
            | "RenewDocumentEnvironment"
            | "DeclareDocumentEnvironment" => self.document_environment(),
            "newtheorem" => self.new_theorem(),
            "declaretheorem" => self.declare_theorem(),
            "newacronym" | "newabbreviation" => self.new_acronym(),
            "newglossaryentry" | "longnewglossaryentry" => self.new_glossary_entry(),
            "DeclareAcronym" => self.declare_acronym(),
            "definecolor" | "providecolor" | "colorlet" => self.define_color(name),
            "usetikzlibrary" | "usepgfplotslibrary" | "tcbuselibrary" => self.tikz_library(),
            "todo" | "missingfigure" => self.todo(name),
            "verb" | "Verb" => self.verb(),
            "lstinline" | "mintinline" | "mint" => self.inline_code(name),
            "url" | "nolinkurl" | "path" => self.raw_argument(),
            "href" => self.raw_argument(),
            "iffalse" => self.skip_iffalse(),
            "DeclareOption"
            | "DeclareVoidOption"
            | "DeclareStringOption"
            | "DeclareBoolOption"
            | "DeclareComplementaryOption"
            | "DeclareOptionBeamer"
            | "DeclareOptionX" => self.declare_option(false),
            "define@key" | "define@boolkey" | "define@choicekey" => self.declare_option(true),
            "ProvidesPackage"
            | "ProvidesClass"
            | "ProvidesFile"
            | "ProvidesExplPackage"
            | "ProvidesExplClass" => self.provides(name),
            "LoadClass" | "LoadClassWithOptions" => self.load_class(),
            "DeclareMathSymbol" | "DeclareMathDelimiter" => self.declared_symbol(true, Some("")),
            "DeclareMathAccent" | "DeclareMathAlphabet" | "DeclareSymbolFontAlphabet" => {
                self.declared_symbol(true, Some("{}"))
            }
            "DeclareMathRadical" | "DeclarePairedDelimiter" | "DeclarePairedDelimiterX" => {
                self.declared_symbol(true, None)
            }
            "DeclareTextSymbol" | "DeclareTextSymbolDefault" => {
                self.declared_symbol(false, Some(""))
            }
            "DeclareTextAccent" => self.declared_symbol(false, Some("{}")),
            "DeclareTextCommand" | "DeclareTextCommandDefault" => self.declared_symbol(false, None),
            "makeatletter" => self.at_letter = true,
            "makeatother" => self.at_letter = false,
            "left" => self.left_right(1),
            "right" => self.left_right(-1),
            _ if is_reference_command(name) => self.keys(name, 1, false),
            _ if is_citation_command(name) => self.citation(name),
            _ => {}
        }
    }

    fn document_class(&mut self) {
        let mut cur = self.cursor();
        let options = cur.optional(SHORT_ARG);
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        let options = options.map(|o| {
            split_list(self.text, o)
                .into_iter()
                .map(|(s, _)| s)
                .collect()
        });
        let span = trimmed(self.text, name);
        self.idx.document_class = Some(ClassUse {
            name: self.slice(&span).to_owned(),
            options: options.unwrap_or_default(),
            span,
        });
        self.pos = cur.pos;
    }

    fn use_package(&mut self, start: usize) {
        let mut cur = self.cursor();
        let options = cur.optional(SHORT_ARG);
        let Some(names) = cur.group(SHORT_ARG) else {
            return;
        };
        cur.optional(SHORT_ARG); // release date
        let options: Vec<String> = options
            .map(|o| {
                split_list(self.text, o)
                    .into_iter()
                    .map(|(s, _)| s)
                    .collect()
            })
            .unwrap_or_default();
        for (name, span) in split_list(self.text, names) {
            self.idx.packages.push(PackageUse {
                name,
                options: options.clone(),
                span,
                command_span: start..cur.pos,
            });
        }
        self.pos = cur.pos;
    }

    fn section(&mut self, start: usize, name: &str) {
        let Some(kind) = SectionKind::from_command(name) else {
            return;
        };
        let mut cur = self.cursor();
        let starred = cur.star();
        cur.optional(SHORT_ARG);
        let Some(title) = cur.group(SHORT_ARG) else {
            return;
        };
        let title = ellipsize(&to_plain(self.slice(&title)), 120);
        self.idx.sections.push(Section {
            kind,
            title,
            starred,
            span: start..cur.pos,
        });
        self.last_section = Some(self.idx.sections.len() - 1);
        // The title is not consumed: labels or citations inside it are scanned normally.
    }

    fn frame_title(&mut self) {
        let mut cur = self.cursor();
        cur.overlay();
        cur.optional(SHORT_ARG);
        let Some(title) = cur.group(SHORT_ARG) else {
            return;
        };
        let title = ellipsize(&to_plain(self.slice(&title)), 120);
        let in_frame = self.envs.iter().rev().any(|f| f.name == "frame");
        if let Some(section) = self.idx.sections.last_mut()
            && in_frame
            && section.kind == SectionKind::Frame
            && section.title.is_empty()
        {
            section.title = title;
        }
    }

    fn label(&mut self) {
        let mut cur = self.cursor();
        let Some(group) = cur.group(SHORT_ARG) else {
            return;
        };
        let span = trimmed(self.text, group);
        let name = self.slice(&span);
        self.pos = cur.pos;
        if name.is_empty() || name.contains('#') {
            return;
        }
        let (kind, frame) = self.label_kind();
        let context = match (&kind, frame) {
            (LabelKind::Section, _) => self
                .last_section
                .map(|i| self.idx.sections[i].title.clone()),
            _ => None,
        };
        self.idx.labels.push(LabelDef {
            name: name.to_owned(),
            span,
            kind,
            context,
        });
        if let Some(i) = frame {
            let label = self.idx.labels.len() - 1;
            self.envs[i].labels.push(label);
        }
    }

    fn label_kind(&self) -> (LabelKind, Option<usize>) {
        for (i, frame) in self.envs.iter().enumerate().rev() {
            if let Some(kind) = env_label_kind(&frame.name, &self.theorems) {
                return (kind, Some(i));
            }
        }
        if self.last_section.is_some() {
            (LabelKind::Section, None)
        } else {
            (LabelKind::Other, None)
        }
    }

    fn caption(&mut self, name: &str) {
        let mut cur = self.cursor();
        if name == "captionof" {
            cur.star();
            if cur.group(SHORT_ARG).is_none() {
                return;
            }
        }
        cur.optional(SHORT_ARG);
        let Some(text) = cur.group(SHORT_ARG) else {
            return;
        };
        let caption = ellipsize(&to_plain(self.slice(&text)), 120);
        let frame = self.envs.iter_mut().rev().find(|f| {
            env_label_kind(&f.name, &HashSet::new()).is_some_and(|k| {
                matches!(
                    k,
                    LabelKind::Figure
                        | LabelKind::Table
                        | LabelKind::Listing
                        | LabelKind::Algorithm
                )
            })
        });
        let frame = match frame {
            Some(f) => Some(f),
            None => self.envs.last_mut(),
        };
        if let Some(frame) = frame
            && frame.caption.is_none()
        {
            frame.caption = Some(caption);
        }
    }

    fn hyperref(&mut self) {
        let mut cur = self.cursor();
        if let Some(opt) = cur.optional(SHORT_ARG) {
            for (name, span) in split_list(self.text, opt) {
                self.idx.references.push(KeyUse {
                    name,
                    span,
                    command: "hyperref".into(),
                });
            }
        }
    }

    /// Reads `groups` mandatory arguments made of comma-separated keys.
    fn keys(&mut self, command: &str, groups: usize, citation: bool) {
        let mut cur = self.cursor();
        cur.star();
        cur.optional(SHORT_ARG);
        cur.optional(SHORT_ARG);
        for _ in 0..groups {
            let Some(group) = cur.group(SHORT_ARG) else {
                break;
            };
            for (name, span) in split_list(self.text, group) {
                if name.contains('#') || name == "*" {
                    continue;
                }
                let key = KeyUse {
                    name,
                    span,
                    command: command.to_owned(),
                };
                if citation {
                    self.idx.citations.push(key)
                } else {
                    self.idx.references.push(key)
                }
            }
            self.pos = cur.pos;
        }
    }

    fn citation(&mut self, command: &str) {
        if !command.ends_with("cites") {
            return self.keys(command, 1, true);
        }
        // Multi-citations: \cites(pre)(post)[pre][post]{k1}[pre][post]{k2}…
        let mut cur = self.cursor();
        cur.paren_group();
        cur.paren_group();
        loop {
            cur.optional(SHORT_ARG);
            cur.optional(SHORT_ARG);
            let Some(group) = cur.group(SHORT_ARG) else {
                break;
            };
            for (name, span) in split_list(self.text, group) {
                self.idx.citations.push(KeyUse {
                    name,
                    span,
                    command: command.to_owned(),
                });
            }
            self.pos = cur.pos;
        }
    }

    fn bibitem(&mut self) {
        let mut cur = self.cursor();
        cur.optional(SHORT_ARG);
        let Some(group) = cur.group(SHORT_ARG) else {
            return;
        };
        let span = trimmed(self.text, group);
        self.idx.bibitems.push(NamedSpan {
            name: self.slice(&span).to_owned(),
            span,
        });
        self.pos = cur.pos;
    }

    fn push_include(&mut self, kind: IncludeKind, span: Span, dir: Option<String>, command: &str) {
        let path = self.slice(&span).trim();
        if path.is_empty() || path.contains('#') {
            return;
        }
        self.idx.includes.push(Include {
            kind,
            path: path.to_owned(),
            dir,
            span,
            command: command.to_owned(),
        });
    }

    fn input(&mut self, command: &str) {
        let mut cur = self.cursor();
        if command == "includestandalone" {
            cur.optional(SHORT_ARG);
        }
        let span = match cur.group(SHORT_ARG) {
            Some(g) => trimmed(self.text, g),
            // TeX primitive syntax: `\input file`
            None if command == "input" => match cur.bare_word() {
                Some(w) => w,
                None => return,
            },
            None => return,
        };
        let kind = match command {
            "include" => IncludeKind::Include,
            "subfile" | "subfileinclude" => IncludeKind::Subfile,
            "includestandalone" => IncludeKind::Other,
            _ => IncludeKind::Input,
        };
        self.push_include(kind, span, None, command);
        self.pos = cur.pos;
    }

    fn import(&mut self, command: &str) {
        let mut cur = self.cursor();
        cur.star();
        let Some(dir) = cur.group(SHORT_ARG) else {
            return;
        };
        let Some(file) = cur.group(SHORT_ARG) else {
            return;
        };
        let dir = self.slice(&dir).trim().to_owned();
        self.push_include(
            IncludeKind::Import,
            trimmed(self.text, file),
            Some(dir),
            command,
        );
        self.pos = cur.pos;
    }

    fn graphics(&mut self, command: &str) {
        let mut cur = self.cursor();
        cur.star();
        cur.optional(SHORT_ARG);
        cur.optional(SHORT_ARG);
        let Some(file) = cur.group(SHORT_ARG) else {
            return;
        };
        self.push_include(
            IncludeKind::Graphics,
            trimmed(self.text, file),
            None,
            command,
        );
        self.pos = cur.pos;
    }

    fn other_file(&mut self, command: &str, skip_groups: usize) {
        let mut cur = self.cursor();
        cur.optional(SHORT_ARG);
        for _ in 0..skip_groups {
            if cur.group(SHORT_ARG).is_none() {
                return;
            }
        }
        let Some(file) = cur.group(SHORT_ARG) else {
            return;
        };
        self.push_include(IncludeKind::Other, trimmed(self.text, file), None, command);
        self.pos = cur.pos;
    }

    fn bibliography(&mut self) {
        let mut cur = self.cursor();
        let Some(group) = cur.group(SHORT_ARG) else {
            return;
        };
        for (_, span) in split_list(self.text, group) {
            self.push_include(IncludeKind::Bibliography, span, None, "bibliography");
        }
        self.pos = cur.pos;
    }

    fn bib_resource(&mut self, command: &str) {
        let mut cur = self.cursor();
        cur.optional(SHORT_ARG);
        let Some(group) = cur.group(SHORT_ARG) else {
            return;
        };
        self.push_include(
            IncludeKind::BibResource,
            trimmed(self.text, group),
            None,
            command,
        );
        self.pos = cur.pos;
    }

    fn graphicspath(&mut self) {
        let mut cur = self.cursor();
        let Some(outer) = cur.group(SHORT_ARG) else {
            return;
        };
        let mut inner = Cursor {
            text: self.text,
            pos: outer.start,
        };
        while inner.pos < outer.end {
            match inner.group(SHORT_ARG) {
                Some(g) => self
                    .idx
                    .graphics_paths
                    .push(self.slice(&g).trim().to_owned()),
                None => break,
            }
        }
        self.pos = cur.pos;
    }

    fn new_command(&mut self, math: bool) {
        let mut cur = self.cursor();
        cur.star();
        let Some(name) = cur.command_name() else {
            return;
        };
        let (args, first_optional, body) = if math {
            (0, false, cur.group(SHORT_ARG))
        } else {
            let args = cur
                .optional(SHORT_ARG)
                .and_then(|s| self.slice(&s).trim().parse::<u8>().ok());
            let default = cur.optional(LONG_ARG);
            (args.unwrap_or(0), default.is_some(), cur.group(LONG_ARG))
        };
        let Some(body) = body else { return };
        self.pos = self.after_definition(&name, cur.pos);
        let signature = counted_signature(args, first_optional);
        self.push_command(name, args, first_optional, &body, math, Some(signature));
    }

    /// Where to continue after a definition: after its body, or inside it
    /// when descending into definitions.
    fn after_definition(&self, name: &Span, end: usize) -> usize {
        if self.descend { name.end } else { end }
    }

    fn push_command(
        &mut self,
        name: Span,
        args: u8,
        first_optional: bool,
        body: &Span,
        math: bool,
        signature: Option<String>,
    ) {
        let body = squash_whitespace(self.slice(body));
        let definition = ellipsize(&body, 80);
        let body = if body.len() > 4096 {
            String::new()
        } else {
            body
        };
        self.idx.command_defs.push(CommandDef {
            name: self.slice(&name).to_owned(),
            args,
            first_optional,
            definition,
            body,
            math,
            signature,
            span: name,
        });
    }

    fn document_command(&mut self) {
        let mut cur = self.cursor();
        let Some(name) = cur.command_name() else {
            return;
        };
        let Some(spec) = cur.group(SHORT_ARG) else {
            return;
        };
        let Some(body) = cur.group(LONG_ARG) else {
            return;
        };
        let (args, first_optional) = xparse_arity(self.slice(&spec));
        let signature = xparse_signature(self.slice(&spec));
        self.pos = self.after_definition(&name, cur.pos);
        self.push_command(name, args, first_optional, &body, false, signature);
    }

    fn def(&mut self) {
        let mut cur = self.cursor();
        let Some(name) = cur.command_name() else {
            return;
        };
        // Parameter text up to the body: `#1#2` or delimited parameters.
        let params_start = cur.pos;
        let limit = (params_start + 64).min(self.bytes.len());
        let Some(brace) = self.bytes[params_start..limit]
            .iter()
            .position(|&b| b == b'{')
        else {
            return;
        };
        let params = &self.text[params_start..params_start + brace];
        let args = params.matches('#').count().min(9) as u8;
        cur.pos = params_start + brace;
        let Some(body) = cur.group(LONG_ARG) else {
            return;
        };
        self.pos = self.after_definition(&name, cur.pos);
        // `#1#2`: arguments in braces. Anything else delimits them.
        let plain = params
            .chars()
            .all(|c| c == '#' || c.is_ascii_digit() || c.is_whitespace());
        let signature = plain.then(|| counted_signature(args, false));
        self.push_command(name, args, false, &body, false, signature);
    }

    fn let_(&mut self) {
        let mut cur = self.cursor();
        let Some(name) = cur.command_name() else {
            return;
        };
        cur.skip_ws();
        if cur.peek() == Some(b'=') {
            cur.pos += 1;
        }
        cur.skip_ws();
        let target_start = cur.pos;
        if cur.peek() == Some(b'\\') {
            cur.pos += 1;
            while cur.peek().is_some_and(|b| is_letter(b, true)) {
                cur.pos += 1;
            }
        }
        let target = target_start..cur.pos;
        self.push_command(name, 0, false, &target, false, None);
        self.pos = cur.pos;
    }

    fn new_if(&mut self) {
        let mut cur = self.cursor();
        let Some(name) = cur.command_name() else {
            return;
        };
        let full = self.slice(&name);
        let Some(base) = full.strip_prefix("if") else {
            return;
        };
        self.idx.command_defs.push(CommandDef {
            name: full.to_owned(),
            args: 0,
            first_optional: false,
            definition: "\\newif".into(),
            body: String::new(),
            math: false,
            signature: Some(String::new()),
            span: name.clone(),
        });
        for suffix in ["true", "false"] {
            self.idx.command_defs.push(CommandDef {
                name: format!("{base}{suffix}"),
                args: 0,
                first_optional: false,
                definition: format!("\\newif\\{full}"),
                body: String::new(),
                math: false,
                signature: Some(String::new()),
                span: name.clone(),
            });
        }
        self.pos = cur.pos;
    }

    fn new_environment(&mut self) {
        let mut cur = self.cursor();
        cur.star();
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        let args = cur
            .optional(SHORT_ARG)
            .and_then(|s| self.slice(&s).trim().parse::<u8>().ok());
        let default = cur.optional(LONG_ARG);
        if cur.group(LONG_ARG).is_none() || cur.group(LONG_ARG).is_none() {
            return;
        }
        let args = args.unwrap_or(0);
        let signature = counted_signature(args, default.is_some());
        self.push_environment(trimmed(self.text, name), args, None, Some(signature));
        self.pos = cur.pos;
    }

    fn document_environment(&mut self) {
        let mut cur = self.cursor();
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        let Some(spec) = cur.group(SHORT_ARG) else {
            return;
        };
        if cur.group(LONG_ARG).is_none() || cur.group(LONG_ARG).is_none() {
            return;
        }
        let (args, _) = xparse_arity(self.slice(&spec));
        let signature = xparse_signature(self.slice(&spec));
        self.push_environment(trimmed(self.text, name), args, None, signature);
        self.pos = cur.pos;
    }

    fn push_environment(
        &mut self,
        span: Span,
        args: u8,
        theorem_title: Option<String>,
        signature: Option<String>,
    ) {
        let name = self.slice(&span).to_owned();
        if name.is_empty() || name.contains('#') {
            return;
        }
        if theorem_title.is_some() {
            self.theorems.insert(name.clone());
        }
        self.idx.environment_defs.push(EnvironmentDef {
            name,
            args,
            theorem_title,
            signature,
            span,
        });
    }

    fn new_theorem(&mut self) {
        let mut cur = self.cursor();
        cur.star();
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        cur.optional(SHORT_ARG);
        let Some(title) = cur.group(SHORT_ARG) else {
            return;
        };
        cur.optional(SHORT_ARG);
        let title = to_plain(self.slice(&title));
        self.push_environment(trimmed(self.text, name), 1, Some(title), Some("[]".into()));
        self.pos = cur.pos;
    }

    fn declare_theorem(&mut self) {
        let mut cur = self.cursor();
        let options = cur.optional(SHORT_ARG);
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        cur.optional(SHORT_ARG);
        let span = trimmed(self.text, name);
        let explicit = options.and_then(|o| {
            split_list(self.text, o).into_iter().find_map(|(item, _)| {
                let (k, v) = item.split_once('=')?;
                matches!(k.trim(), "name" | "title")
                    .then(|| v.trim().trim_matches(['{', '}']).to_owned())
            })
        });
        let title = explicit.unwrap_or_else(|| capitalize(self.slice(&span)));
        self.push_environment(span, 1, Some(title), Some("[]".into()));
        self.pos = cur.pos;
    }

    fn new_acronym(&mut self) {
        let mut cur = self.cursor();
        cur.optional(SHORT_ARG);
        let Some(key) = cur.group(SHORT_ARG) else {
            return;
        };
        let Some(short) = cur.group(SHORT_ARG) else {
            return;
        };
        let Some(long) = cur.group(SHORT_ARG) else {
            return;
        };
        let description = format!(
            "{} — {}",
            to_plain(self.slice(&short)),
            to_plain(self.slice(&long))
        );
        let span = trimmed(self.text, key);
        let key = self.slice(&span).to_owned();
        self.idx.glossary.push(GlossaryEntry {
            key,
            description,
            acronym: true,
            span,
        });
        self.pos = cur.pos;
    }

    fn new_glossary_entry(&mut self) {
        let mut cur = self.cursor();
        let Some(key) = cur.group(SHORT_ARG) else {
            return;
        };
        let Some(fields) = cur.group(LONG_ARG) else {
            return;
        };
        let fields = self.slice(&fields);
        let description = keyval(fields, "description")
            .or_else(|| keyval(fields, "name"))
            .map(|v| ellipsize(&to_plain(v), 100))
            .unwrap_or_default();
        let span = trimmed(self.text, key);
        let key = self.slice(&span).to_owned();
        self.idx.glossary.push(GlossaryEntry {
            key,
            description,
            acronym: false,
            span,
        });
        self.pos = cur.pos;
    }

    fn declare_acronym(&mut self) {
        let mut cur = self.cursor();
        let Some(key) = cur.group(SHORT_ARG) else {
            return;
        };
        let Some(fields) = cur.group(LONG_ARG) else {
            return;
        };
        let fields = self.slice(&fields);
        let short = keyval(fields, "short").map(to_plain).unwrap_or_default();
        let long = keyval(fields, "long").map(to_plain).unwrap_or_default();
        let span = trimmed(self.text, key);
        let key = self.slice(&span).to_owned();
        let description = format!("{short} — {long}");
        self.idx.glossary.push(GlossaryEntry {
            key,
            description,
            acronym: true,
            span,
        });
        self.pos = cur.pos;
    }

    fn define_color(&mut self, command: &str) {
        let mut cur = self.cursor();
        if command != "colorlet" {
            cur.optional(SHORT_ARG);
        }
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        let span = trimmed(self.text, name);
        self.idx.colors.push(NamedSpan {
            name: self.slice(&span).to_owned(),
            span,
        });
    }

    fn tikz_library(&mut self) {
        let mut cur = self.cursor();
        let Some(group) = cur.group(SHORT_ARG) else {
            return;
        };
        for (name, _) in split_list(self.text, group) {
            self.idx.tikz_libraries.push(name);
        }
        self.pos = cur.pos;
    }

    fn todo(&mut self, command: &str) {
        let mut cur = self.cursor();
        cur.optional(SHORT_ARG);
        let Some(text) = cur.group(SHORT_ARG) else {
            return;
        };
        let note = ellipsize(&to_plain(self.slice(&text)), 200);
        self.idx.todos.push(Todo {
            tag: command.to_owned(),
            text: note,
            span: text,
        });
    }

    fn verb(&mut self) {
        let len = self.bytes.len();
        if self.pos < len && self.bytes[self.pos] == b'*' {
            self.pos += 1;
        }
        let Some(&delim) = self.bytes.get(self.pos) else {
            return;
        };
        if delim.is_ascii_alphabetic() || delim.is_ascii_whitespace() {
            return;
        }
        let close = if delim == b'{' { b'}' } else { delim };
        let from = self.pos + 1;
        let line_end = memchr::memchr(b'\n', &self.bytes[from..]).map_or(len, |i| from + i);
        self.pos =
            memchr::memchr(close, &self.bytes[from..line_end]).map_or(line_end, |i| from + i + 1);
    }

    fn inline_code(&mut self, command: &str) {
        let mut cur = self.cursor();
        cur.optional(SHORT_ARG);
        if command != "lstinline" && cur.group(SHORT_ARG).is_none() {
            return; // language argument of minted
        }
        cur.skip_ws();
        if cur.peek() == Some(b'{') {
            if cur.raw_group().is_some() {
                self.pos = cur.pos;
            }
        } else {
            self.pos = cur.pos;
            self.verb();
        }
    }

    fn raw_argument(&mut self) {
        let mut cur = self.cursor();
        if cur.raw_group().is_some() {
            self.pos = cur.pos;
        }
    }

    fn skip_iffalse(&mut self) {
        let mut depth = 1usize;
        let mut p = self.pos;
        let len = self.bytes.len();
        while p < len {
            match self.bytes[p] {
                b'%' => p = memchr::memchr(b'\n', &self.bytes[p..]).map_or(len, |i| p + i),
                b'\\' => {
                    let s = p + 1;
                    let mut e = s;
                    while e < len && self.bytes[e].is_ascii_alphabetic() {
                        e += 1;
                    }
                    let word = &self.text[s..e];
                    if word == "fi" {
                        depth -= 1;
                        if depth == 0 {
                            self.pos = e;
                            return;
                        }
                    } else if is_tex_conditional(word) {
                        depth += 1;
                    }
                    p = e.max(s + 1);
                }
                _ => p += 1,
            }
        }
    }

    fn declare_option(&mut self, keyval: bool) {
        let mut cur = self.cursor();
        cur.star();
        cur.optional(SHORT_ARG);
        cur.overlay(); // xkeyval <family>
        if keyval {
            cur.optional(SHORT_ARG); // prefix
            if cur.group(SHORT_ARG).is_none() {
                return; // family
            }
        }
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        let name = self.slice(&name).trim();
        if name.is_empty() || name == "*" || name.contains(['\\', '#', '@']) {
            return;
        }
        let option = if keyval {
            format!("{name}=")
        } else {
            name.to_owned()
        };
        if !self.idx.declared_options.contains(&option) {
            self.idx.declared_options.push(option);
        }
    }

    fn provides(&mut self, command: &str) {
        let mut cur = self.cursor();
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        let name = self.slice(&name).trim().to_owned();
        let info = if command.starts_with("ProvidesExpl") {
            // {name}{date}{version}{description}
            let parts: Vec<String> = (0..3)
                .filter_map(|_| cur.group(SHORT_ARG))
                .map(|g| self.slice(&g).trim().to_owned())
                .collect();
            parts.join(" ")
        } else {
            cur.optional(SHORT_ARG)
                .map(|o| squash_whitespace(self.slice(&o)))
                .unwrap_or_default()
        };
        if self.idx.provides.is_none() {
            let class = command.contains("Class");
            self.idx.provides = Some(Provides { name, info, class });
        }
    }

    fn load_class(&mut self) {
        let mut cur = self.cursor();
        cur.optional(SHORT_ARG);
        let Some(name) = cur.group(SHORT_ARG) else {
            return;
        };
        if self.idx.load_class.is_none() {
            self.idx.load_class = Some(self.slice(&name).trim().to_owned());
        }
    }

    fn declared_symbol(&mut self, math: bool, signature: Option<&str>) {
        let mut cur = self.cursor();
        cur.star();
        let Some(name) = cur.command_name() else {
            return;
        };
        let empty = name.end..name.end;
        self.push_command(name, 0, false, &empty, math, signature.map(str::to_owned));
    }

    fn left_right(&mut self, delta: i32) {
        if let Some(m) = &mut self.math {
            m.left_right += delta;
        } else if let Some(frame) = self.envs.iter_mut().rev().find(|f| f.math) {
            frame.left_right += delta;
        }
    }

    // ----------------------------------------------------------- environments

    fn begin(&mut self, start: usize) {
        let mut cur = self.cursor();
        let Some(group) = cur.group(SHORT_ARG) else {
            return;
        };
        let span = trimmed(self.text, group);
        let name = self.slice(&span);
        if name.is_empty() {
            return;
        }
        bump(&mut self.idx.environment_usage, name);
        let begin = start..cur.pos;
        if name == "document" {
            self.idx.begin_document = Some(start);
        }

        if is_verbatim_environment(name) {
            let needle = format!("\\end{{{name}}}");
            let found = memchr::memmem::find(&self.bytes[cur.pos..], needle.as_bytes());
            let end = found.map(|i| cur.pos + i..cur.pos + i + needle.len());
            if end.is_none() {
                self.problem(
                    begin.clone(),
                    ProblemKind::UnclosedEnvironment(name.to_owned()),
                );
            }
            self.pos = end.as_ref().map_or(self.bytes.len(), |e| e.end);
            self.idx.environments.push(EnvironmentSpan {
                name: name.to_owned(),
                begin,
                end,
            });
            return;
        }

        let math = is_math_environment(name);
        if math && self.in_math() {
            self.problem(begin.clone(), ProblemKind::NestedMath);
        }
        let mut title = None;
        if name == "frame" {
            let mut args = cur;
            args.overlay();
            args.optional(SHORT_ARG);
            args.overlay();
            let frame_title = if args.next_is(b'{') {
                args.group(SHORT_ARG)
                    .map(|t| ellipsize(&to_plain(self.slice(&t)), 120))
            } else {
                None
            };
            self.idx.sections.push(Section {
                kind: SectionKind::Frame,
                title: frame_title.unwrap_or_default(),
                starred: false,
                span: begin.clone(),
            });
        } else if env_label_kind(name, &self.theorems)
            .is_some_and(|k| matches!(k, LabelKind::Theorem(_)))
        {
            let mut args = cur;
            title = args.optional(SHORT_ARG).map(|t| to_plain(self.slice(&t)));
        }
        self.pos = cur.pos;
        self.envs.push(EnvFrame {
            name: name.to_owned(),
            begin,
            content_start: cur.pos,
            math,
            labels: Vec::new(),
            caption: None,
            title,
            left_right: 0,
            blank_line_reported: false,
        });
    }

    fn end(&mut self, start: usize) {
        let mut cur = self.cursor();
        let Some(group) = cur.group(SHORT_ARG) else {
            return;
        };
        let span = trimmed(self.text, group);
        let name = self.slice(&span);
        let end = start..cur.pos;
        self.pos = cur.pos;
        if name == "document" {
            self.idx.has_end_document = true;
        }
        let Some(i) = self.envs.iter().rposition(|f| f.name == name) else {
            self.problem(end, ProblemKind::UnmatchedEnd(name.to_owned()));
            return;
        };
        while self.envs.len() > i + 1 {
            let frame = self.envs.pop().unwrap();
            self.problem(
                frame.begin.clone(),
                ProblemKind::UnclosedEnvironment(frame.name.clone()),
            );
            self.close_frame(frame, None);
        }
        let frame = self.envs.pop().unwrap();
        if let Some(m) = &self.math
            && m.open.start > frame.begin.start
        {
            let open = m.open.clone();
            self.math = None;
            self.problem(open, ProblemKind::UnclosedMath);
        }
        self.close_frame(frame, Some(end));
    }

    fn close_frame(&mut self, frame: EnvFrame, end: Option<Span>) {
        let content_end = end.as_ref().map_or(self.bytes.len(), |e| e.start);
        let mut context = frame.caption.clone().or(frame.title.clone());
        if frame.math {
            self.env_dollar = false;
            if frame.left_right != 0 {
                self.problem(frame.begin.clone(), ProblemKind::LeftRightMismatch);
            }
            if content_end >= frame.content_start {
                self.idx.math.push(frame.content_start..content_end);
                if context.is_none() {
                    let body = strip_labels(&self.text[frame.content_start..content_end]);
                    context = Some(ellipsize(&squash_whitespace(&body), 60));
                }
            }
        }
        if let Some(context) = context {
            for &label in &frame.labels {
                let label = &mut self.idx.labels[label];
                if label.context.is_none() {
                    label.context = Some(context.clone());
                }
            }
        }
        self.idx.environments.push(EnvironmentSpan {
            name: frame.name,
            begin: frame.begin,
            end,
        });
    }
}

// ------------------------------------------------------------------ cursor

/// Reads command arguments starting at `pos`. Copyable, so callers can
/// look ahead without committing.
#[derive(Debug, Clone, Copy)]
struct Cursor<'a> {
    text: &'a str,
    pos: usize,
}

impl Cursor<'_> {
    fn bytes(&self) -> &[u8] {
        self.text.as_bytes()
    }

    fn peek(&self) -> Option<u8> {
        self.bytes().get(self.pos).copied()
    }

    fn next_is(&self, b: u8) -> bool {
        let mut c = *self;
        c.skip_ws();
        c.peek() == Some(b)
    }

    /// Skips spaces, a single line break and comments (not a blank line).
    fn skip_ws(&mut self) {
        let bytes = self.text.as_bytes();
        let mut newlines = 0;
        while let Some(&b) = bytes.get(self.pos) {
            match b {
                b' ' | b'\t' | b'\r' => self.pos += 1,
                b'\n' => {
                    newlines += 1;
                    if newlines > 1 {
                        return;
                    }
                    self.pos += 1;
                }
                b'%' => {
                    self.pos = memchr::memchr(b'\n', &bytes[self.pos..])
                        .map_or(bytes.len(), |i| self.pos + i + 1);
                }
                _ => return,
            }
        }
    }

    fn star(&mut self) -> bool {
        let save = self.pos;
        self.skip_ws();
        if self.peek() == Some(b'*') {
            self.pos += 1;
            true
        } else {
            self.pos = save;
            false
        }
    }

    fn delimited(&mut self, open: u8, close: u8, limit: usize) -> Option<Span> {
        let save = self.pos;
        self.skip_ws();
        if self.peek() != Some(open) {
            self.pos = save;
            return None;
        }
        match match_delimited(self.bytes(), self.pos, open, close, limit) {
            Some(end) => {
                let inner = self.pos + 1..end;
                self.pos = end + 1;
                Some(inner)
            }
            None => {
                self.pos = save;
                None
            }
        }
    }

    fn group(&mut self, limit: usize) -> Option<Span> {
        self.delimited(b'{', b'}', limit)
    }

    fn optional(&mut self, limit: usize) -> Option<Span> {
        self.delimited(b'[', b']', limit)
    }

    fn paren_group(&mut self) -> Option<Span> {
        self.delimited(b'(', b')', SHORT_ARG)
    }

    fn overlay(&mut self) -> bool {
        self.delimited(b'<', b'>', 64).is_some()
    }

    /// `{…}` whose content is taken literally (URLs, inline code).
    fn raw_group(&mut self) -> Option<Span> {
        let save = self.pos;
        self.skip_ws();
        if self.peek() != Some(b'{') {
            self.pos = save;
            return None;
        }
        let bytes = self.text.as_bytes();
        let mut depth = 0usize;
        let limit = (self.pos + SHORT_ARG).min(bytes.len());
        for i in self.pos..limit {
            match bytes[i] {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        let inner = self.pos + 1..i;
                        self.pos = i + 1;
                        return Some(inner);
                    }
                }
                b'\n' if bytes.get(i + 1) == Some(&b'\n') => break,
                _ => {}
            }
        }
        self.pos = save;
        None
    }

    /// `\name` or `{\name}`; returns the span of `name`.
    fn command_name(&mut self) -> Option<Span> {
        let save = self.pos;
        self.skip_ws();
        let braced = self.peek() == Some(b'{');
        if braced {
            self.pos += 1;
            self.skip_ws();
        }
        if self.peek() != Some(b'\\') {
            self.pos = save;
            return None;
        }
        self.pos += 1;
        let start = self.pos;
        while self.peek().is_some_and(|b| is_letter(b, true)) {
            self.pos += 1;
        }
        if self.pos == start {
            // Control symbol such as `\,`.
            match self.peek() {
                Some(b) if !b.is_ascii_whitespace() => self.pos += utf8_width(b),
                _ => {
                    self.pos = save;
                    return None;
                }
            }
        }
        let name = start..self.pos;
        if braced {
            self.skip_ws();
            if self.peek() != Some(b'}') {
                self.pos = save;
                return None;
            }
            self.pos += 1;
        }
        Some(name)
    }

    /// A whitespace-delimited word (for `\input file`).
    fn bare_word(&mut self) -> Option<Span> {
        let bytes = self.text.as_bytes();
        while self.peek().is_some_and(|b| b == b' ' || b == b'\t') {
            self.pos += 1;
        }
        let start = self.pos;
        while let Some(&b) = bytes.get(self.pos) {
            if b.is_ascii_whitespace() || matches!(b, b'\\' | b'%' | b'{' | b'}') {
                break;
            }
            self.pos += 1;
        }
        (self.pos > start).then_some(start..self.pos)
    }
}

/// Finds the closing delimiter matching the one at `open_pos`.
///
/// Escapes and comments are honoured. Braces nested inside brackets are
/// skipped as units. Returns `None` when unclosed within `limit` bytes or,
/// for short arguments, when a blank line is crossed.
fn match_delimited(
    bytes: &[u8],
    open_pos: usize,
    open: u8,
    close: u8,
    limit: usize,
) -> Option<usize> {
    let end = (open_pos + limit).min(bytes.len());
    let mut depth = 0usize;
    let mut braces = 0usize;
    let mut i = open_pos;
    while i < end {
        let b = bytes[i];
        match b {
            b'\\' => {
                i += 2;
                continue;
            }
            b'%' => {
                i = memchr::memchr(b'\n', &bytes[i..end]).map_or(end, |k| i + k);
                continue;
            }
            b'\n' if limit <= SHORT_ARG => {
                let mut j = i + 1;
                while j < end && matches!(bytes[j], b' ' | b'\t' | b'\r') {
                    j += 1;
                }
                if j < end && bytes[j] == b'\n' {
                    return None;
                }
            }
            _ => {}
        }
        if open != b'{' && (b == b'{' || b == b'}') {
            if b == b'{' {
                braces += 1;
            } else {
                braces = braces.saturating_sub(1);
            }
        } else if braces == 0 {
            if b == open {
                depth += 1;
            } else if b == close {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(i);
                }
            }
        }
        i += 1;
    }
    None
}

// ------------------------------------------------------------------ helpers

/// TeX primitive conditionals (which all need a matching `\\fi`).
fn is_tex_conditional(word: &str) -> bool {
    matches!(
        word,
        "if" | "ifcat"
            | "ifnum"
            | "ifdim"
            | "ifodd"
            | "ifvmode"
            | "ifhmode"
            | "ifmmode"
            | "ifinner"
            | "ifvoid"
            | "ifhbox"
            | "ifvbox"
            | "ifx"
            | "ifeof"
            | "iftrue"
            | "iffalse"
            | "ifcase"
            | "ifdefined"
            | "ifcsname"
            | "iffontchar"
            | "ifincsname"
            | "ifpdfprimitive"
    )
}

fn is_letter(b: u8, at_letter: bool) -> bool {
    b.is_ascii_alphabetic() || (at_letter && b == b'@')
}

fn utf8_width(first: u8) -> usize {
    match first {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        _ => 4,
    }
}

fn bump(map: &mut std::collections::HashMap<String, u32>, key: &str) {
    if let Some(count) = map.get_mut(key) {
        *count += 1;
    } else {
        map.insert(key.to_owned(), 1);
    }
}

fn strip_prefix_ci<'s>(s: &'s str, prefix: &str) -> Option<&'s str> {
    let head = s.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix)
        .then(|| &s[prefix.len()..])
}

/// Trims whitespace inside `span`.
fn trimmed(text: &str, span: Span) -> Span {
    let s = &text[span.clone()];
    let start = span.start + (s.len() - s.trim_start().len());
    let end = span.end - (s.len() - s.trim_end().len());
    start..end.max(start)
}

/// Splits a comma-separated list, dropping comments and whitespace.
pub(crate) fn split_list(text: &str, span: Span) -> Vec<(String, Span)> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut item_start = span.start;
    let mut i = span.start;
    let push = |from: usize, to: usize, out: &mut Vec<(String, Span)>| {
        let sp = trimmed(text, from..to);
        if !sp.is_empty() {
            out.push((text[sp.clone()].to_owned(), sp));
        }
    };
    while i < span.end {
        match bytes[i] {
            b',' => {
                push(item_start, i, &mut out);
                item_start = i + 1;
            }
            b'%' => {
                push(item_start, i, &mut out);
                i = memchr::memchr(b'\n', &bytes[i..span.end]).map_or(span.end, |k| i + k);
                item_start = i;
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    push(item_start, span.end, &mut out);
    out
}

/// `n` arguments as they are written: `[]{}{}` when the first is optional.
fn counted_signature(args: u8, first_optional: bool) -> String {
    (0..args)
        .map(|i| if i == 0 && first_optional { "[]" } else { "{}" })
        .collect()
}

/// The arguments an xparse specification describes, as they are written
/// (`[]{}`); `None` when one of them has delimiters of its own.
fn xparse_signature(spec: &str) -> Option<String> {
    let mut out = String::new();
    let mut depth = 0usize;
    let mut chars = spec.chars();
    while let Some(c) = chars.next() {
        match c {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            _ if depth > 0 || c.is_whitespace() => {}
            'm' | 'v' => out.push_str("{}"),
            'o' | 'O' => out.push_str("[]"),
            // A star, embellishments, the body of an environment, and what
            // only changes how an argument is read: nothing in braces.
            's' | 'e' | 'E' | 'b' | '+' | '!' | '>' => {}
            // `t` takes the token that follows it.
            't' => {
                chars.find(|c| !c.is_whitespace());
            }
            _ => return None,
        }
    }
    Some(out)
}

/// Number of arguments described by an xparse argument specification.
fn xparse_arity(spec: &str) -> (u8, bool) {
    let mut count = 0u8;
    let mut first_optional = None;
    let mut depth = 0usize;
    for c in spec.chars() {
        match c {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            _ if depth > 0 => {}
            'm' | 'r' | 'R' | 'v' | 'b' | 'l' | 'u' => {
                count += 1;
                first_optional.get_or_insert(false);
            }
            'o' | 'O' | 'd' | 'D' | 'g' | 'G' | 's' | 't' | 'e' | 'E' => {
                count += 1;
                first_optional.get_or_insert(true);
            }
            _ => {}
        }
    }
    (count.min(9), first_optional.unwrap_or(false))
}

fn keyval<'s>(fields: &'s str, key: &str) -> Option<&'s str> {
    let mut depth = 0usize;
    let bytes = fields.as_bytes();
    let mut item_start = 0;
    for i in 0..=bytes.len() {
        let at_end = i == bytes.len();
        let b = if at_end { b',' } else { bytes[i] };
        match b {
            b'{' => depth += 1,
            b'}' => depth = depth.saturating_sub(1),
            b',' if depth == 0 => {
                let item = &fields[item_start..i];
                if let Some((k, v)) = item.split_once('=')
                    && k.trim() == key
                {
                    let v = v.trim();
                    let v = v
                        .strip_prefix('{')
                        .and_then(|v| v.strip_suffix('}'))
                        .unwrap_or(v);
                    return Some(v);
                }
                item_start = i + 1;
            }
            _ => {}
        }
    }
    None
}

fn strip_labels(body: &str) -> String {
    let mut out = String::with_capacity(body.len());
    let mut rest = body;
    while let Some(i) = rest.find("\\label{") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 7..];
        rest = after.find('}').map_or("", |j| &after[j + 1..]);
    }
    out.push_str(rest);
    out.replace("\\nonumber", "").replace("\\notag", "")
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    c.next()
        .map(|f| f.to_uppercase().chain(c).collect())
        .unwrap_or_default()
}

/// Commands whose argument is a list of label keys.
pub fn is_reference_command(name: &str) -> bool {
    matches!(
        name,
        "ref"
            | "eqref"
            | "pageref"
            | "autoref"
            | "Autoref"
            | "nameref"
            | "Nameref"
            | "vref"
            | "Vref"
            | "vpageref"
            | "cref"
            | "Cref"
            | "cpageref"
            | "Cpageref"
            | "labelcref"
            | "labelcpageref"
            | "namecref"
            | "nameCref"
            | "lcnamecref"
            | "namecrefs"
            | "nameCrefs"
            | "fref"
            | "Fref"
            | "zcref"
            | "zref"
            | "subref"
            | "ref*"
            | "cref*"
            | "Cref*"
            | "autopageref"
            | "prettyref"
            | "thmref"
            | "tref"
    )
}

/// Commands whose argument is a list of citation keys.
pub fn is_citation_command(name: &str) -> bool {
    matches!(
        name,
        "cite"
            | "citep"
            | "citet"
            | "citealp"
            | "citealt"
            | "citeauthor"
            | "citeyear"
            | "citeyearpar"
            | "Citep"
            | "Citet"
            | "Citealp"
            | "Citealt"
            | "Citeauthor"
            | "citenum"
            | "citetext"
            | "parencite"
            | "Parencite"
            | "textcite"
            | "Textcite"
            | "autocite"
            | "Autocite"
            | "footcite"
            | "footcitetext"
            | "smartcite"
            | "Smartcite"
            | "supercite"
            | "fullcite"
            | "footfullcite"
            | "nocite"
            | "citetitle"
            | "citeurl"
            | "citedate"
            | "citefield"
            | "volcite"
            | "Volcite"
            | "pvolcite"
            | "fvolcite"
            | "tvolcite"
            | "avolcite"
            | "notecite"
            | "Notecite"
            | "pnotecite"
            | "Pnotecite"
            | "fnotecite"
            | "citeA"
            | "citeN"
            | "shortcite"
            | "citeonline"
            | "cites"
            | "Cites"
            | "parencites"
            | "Parencites"
            | "textcites"
            | "Textcites"
            | "autocites"
            | "Autocites"
            | "footcites"
            | "smartcites"
            | "Smartcites"
            | "supercites"
            | "footcitetexts"
    )
}

/// Environments whose body is not LaTeX.
pub fn is_verbatim_environment(name: &str) -> bool {
    matches!(
        name,
        "verbatim"
            | "verbatim*"
            | "Verbatim"
            | "Verbatim*"
            | "BVerbatim"
            | "LVerbatim"
            | "lstlisting"
            | "minted"
            | "comment"
            | "filecontents"
            | "filecontents*"
            | "luacode"
            | "luacode*"
            | "pycode"
            | "sagesilent"
            | "sageblock"
            | "tcblisting"
            | "codebox"
            | "pyconsole"
            | "asy"
            | "gnuplot"
            | "spverbatim"
            | "alltt*"
            | "Sinput"
            | "Soutput"
            | "lstlisting*"
    )
}

/// Environments that put LaTeX in display math mode.
pub fn is_math_environment(name: &str) -> bool {
    let base = name.strip_suffix('*').unwrap_or(name);
    matches!(
        base,
        "equation"
            | "align"
            | "gather"
            | "multline"
            | "flalign"
            | "alignat"
            | "eqnarray"
            | "math"
            | "displaymath"
            | "dmath"
            | "dgroup"
            | "darray"
            | "dseries"
            | "IEEEeqnarray"
            | "empheq"
            | "xalignat"
            | "xxalignat"
    )
}

/// What a label inside environment `name` refers to.
fn env_label_kind(name: &str, theorems: &HashSet<String>) -> Option<LabelKind> {
    let base = name.strip_suffix('*').unwrap_or(name);
    Some(match base {
        "figure" | "subfigure" | "wrapfigure" | "SCfigure" | "sidewaysfigure" | "marginfigure" => {
            LabelKind::Figure
        }
        "table" | "subtable" | "wraptable" | "longtable" | "sidewaystable" | "SCtable"
        | "margintable" | "xltabular" => LabelKind::Table,
        "enumerate" => LabelKind::Item,
        "lstlisting" | "listing" | "minted" => LabelKind::Listing,
        "algorithm" | "algorithm2e" => LabelKind::Algorithm,
        "frame" => LabelKind::Frame,
        _ if is_math_environment(base) || base == "subequations" => LabelKind::Equation,
        _ if theorems.contains(name) || is_theorem_like(base) => {
            LabelKind::Theorem(base.to_owned())
        }
        _ => return None,
    })
}

fn is_theorem_like(name: &str) -> bool {
    matches!(
        name,
        "theorem"
            | "lemma"
            | "proposition"
            | "corollary"
            | "definition"
            | "remark"
            | "example"
            | "exercise"
            | "conjecture"
            | "claim"
            | "fact"
            | "notation"
            | "property"
            | "problem"
            | "question"
            | "hypothesis"
            | "axiom"
            | "observation"
            | "assumption"
            | "theoreme"
            | "thm"
            | "lem"
            | "prop"
            | "cor"
            | "defn"
            | "definit"
            | "rem"
            | "ex"
            | "exo"
            | "exercice"
            | "lemme"
            | "corollaire"
            | "remarque"
            | "exemple"
            | "propriete"
            | "methode"
            | "rappel"
            | "conjecture*"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(v: &[KeyUse]) -> Vec<&str> {
        v.iter().map(|k| k.name.as_str()).collect()
    }

    #[test]
    fn preamble_and_structure() {
        let src = r"% !TEX program = XeLaTeX
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath, % maths
  graphicx}
\newcommand{\R}{\mathbb{R}}
\newcommand\norm[1]{\left\lVert#1\right\rVert}
\DeclareMathOperator{\tr}{tr}
\newtheorem{thm}{Théorème}[section]
\begin{document}
\section{Intro à \emph{\LaTeX}}\label{sec:intro}
See \cref{sec:intro, fig:x} and \cite[p.~3]{knuth84,lamport}.
\begin{figure}[h]
  \includegraphics[width=\linewidth]{img/plot}
  \label{fig:x}\caption{A plot}
\end{figure}
\begin{equation}
  E = mc^2 \label{eq:e}
\end{equation}
\begin{thm}[Pythagore]\label{thm:p} $a^2+b^2=c^2$ \end{thm}
\input{chapters/one}
\bibliography{refs,more}
\end{document}
";
        let idx = scan(src);
        assert!(idx.problems.is_empty(), "{:?}", idx.problems);
        assert_eq!(idx.magic.program.as_deref(), Some("xelatex"));
        let class = idx.document_class.as_ref().unwrap();
        assert_eq!(class.name, "article");
        assert_eq!(class.options, ["11pt", "a4paper"]);
        let pkgs: Vec<_> = idx.packages.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(pkgs, ["inputenc", "amsmath", "graphicx"]);
        assert_eq!(idx.packages[0].options, ["utf8"]);
        assert_eq!(idx.sections.len(), 1);
        assert_eq!(idx.sections[0].title, "Intro à LaTeX");

        let labels: Vec<_> = idx
            .labels
            .iter()
            .map(|l| (l.name.as_str(), &l.kind, l.context.as_deref()))
            .collect();
        assert_eq!(
            labels[0],
            ("sec:intro", &LabelKind::Section, Some("Intro à LaTeX"))
        );
        assert_eq!(labels[1], ("fig:x", &LabelKind::Figure, Some("A plot")));
        assert_eq!(labels[2], ("eq:e", &LabelKind::Equation, Some("E = mc^2")));
        assert_eq!(
            labels[3],
            (
                "thm:p",
                &LabelKind::Theorem("thm".into()),
                Some("Pythagore")
            )
        );

        assert_eq!(names(&idx.references), ["sec:intro", "fig:x"]);
        assert_eq!(names(&idx.citations), ["knuth84", "lamport"]);
        let defs: Vec<_> = idx
            .command_defs
            .iter()
            .map(|d| (d.name.as_str(), d.args, d.math))
            .collect();
        assert_eq!(defs, [("R", 0, false), ("norm", 1, false), ("tr", 0, true)]);
        assert_eq!(
            idx.environment_defs[0].theorem_title.as_deref(),
            Some("Théorème")
        );
        let inc: Vec<_> = idx
            .includes
            .iter()
            .map(|i| (i.kind, i.path.as_str()))
            .collect();
        assert_eq!(
            inc,
            [
                (IncludeKind::Graphics, "img/plot"),
                (IncludeKind::Input, "chapters/one"),
                (IncludeKind::Bibliography, "refs"),
                (IncludeKind::Bibliography, "more"),
            ]
        );
        assert!(idx.is_root_candidate());
        assert!(idx.has_end_document);
        assert_eq!(idx.math.len(), 2);
    }

    #[test]
    fn structural_problems() {
        let idx = scan("\\begin{itemize}\n\\item a }\n\\end{enumerate}\n$x\n\nend");
        let kinds: Vec<_> = idx.problems.iter().map(|p| p.kind.clone()).collect();
        assert_eq!(
            kinds,
            [
                ProblemKind::UnclosedEnvironment("itemize".into()),
                ProblemKind::UnmatchedCloseBrace,
                ProblemKind::UnmatchedEnd("enumerate".into()),
                ProblemKind::UnclosedMath,
            ]
        );
    }

    #[test]
    fn mismatched_environment_nesting() {
        let idx = scan("\\begin{a}\\begin{b}\\end{a}");
        assert_eq!(idx.problems.len(), 1);
        assert_eq!(
            idx.problems[0].kind,
            ProblemKind::UnclosedEnvironment("b".into())
        );
        assert_eq!(idx.environments.len(), 2);
    }

    #[test]
    fn verbatim_comments_and_escapes_are_ignored() {
        let src = "\\begin{verbatim}\n\\begin{x} { $ \n\\end{verbatim}\n\\verb|}{$| 50\\% \\{ \\$ % } \\label{nope}\n\\url{http://a.b/%7E{x}}\\iffalse \\label{no} \\fi";
        let idx = scan(src);
        assert!(idx.problems.is_empty(), "{:?}", idx.problems);
        assert!(idx.labels.is_empty());
    }

    #[test]
    fn math_problems() {
        let idx = scan("\\[ \\left( x \\] and \\begin{equation} a \\[ b \\] \\end{equation}");
        let kinds: Vec<_> = idx.problems.iter().map(|p| p.kind.clone()).collect();
        assert_eq!(
            kinds,
            [ProblemKind::LeftRightMismatch, ProblemKind::NestedMath]
        );

        let idx = scan("\\begin{align}\n a &= b\n\n c \\end{align}");
        assert_eq!(idx.problems.len(), 1);
        assert_eq!(idx.problems[0].kind, ProblemKind::UnclosedMath);

        let idx = scan("\\[ x = 1 \\text{ if $y$} \\] $$a$$ \\(b\\)");
        assert!(idx.problems.is_empty(), "{:?}", idx.problems);
        assert_eq!(idx.math.len(), 3);
    }

    #[test]
    fn beamer_frames_and_todos() {
        let src = "\\begin{frame}{Titre}\n\\end{frame}\n\\begin{frame}\n\\frametitle{Autre}\n\\end{frame} % TODO: relire\n\\todo{ajouter figure}";
        let idx = scan(src);
        let titles: Vec<_> = idx.sections.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(titles, ["Titre", "Autre"]);
        assert_eq!(idx.todos.len(), 2);
        assert_eq!(idx.todos[0].text, "relire");
        assert_eq!(idx.todos[1].text, "ajouter figure");
    }

    #[test]
    fn definitions_do_not_break_structure() {
        let src = "\\newenvironment{bc}{\\begin{center}}{\\end{center}}\n\\def\\foo#1#2{#1\\label{#2}}\n\\newcommand{\\bad}{\\begin{itemize}}";
        let idx = scan(src);
        assert!(idx.problems.is_empty(), "{:?}", idx.problems);
        assert!(idx.labels.is_empty());
        assert_eq!(idx.command_defs[0].name, "foo");
        assert_eq!(idx.command_defs[0].args, 2);
        assert_eq!(idx.environment_defs[0].name, "bc");
    }

    #[test]
    fn multi_citations_and_glossaries() {
        let src = "\\textcites[1]{a}[2]{b,c}\\newacronym{cpu}{CPU}{Central Processing Unit}\\newglossaryentry{x}{name=X,description={Une lettre}}";
        let idx = scan(src);
        assert_eq!(names(&idx.citations), ["a", "b", "c"]);
        assert_eq!(idx.glossary[0].description, "CPU — Central Processing Unit");
        assert_eq!(idx.glossary[1].description, "Une lettre");
    }
}
