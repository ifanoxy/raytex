//! Word counting for LaTeX documents (like `texcount`, built in).
//!
//! Counts the words of the text (not of commands, comments, math or code),
//! plus headings, formulas, figures and tables.

use serde::Serialize;

use crate::syntax::{
    DocumentIndex, context::comment_start, is_math_environment, is_verbatim_environment,
};

/// Statistics of a document.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordCount {
    /// Words of the body text (headings included).
    pub words: usize,
    /// Characters of those words.
    pub characters: usize,
    /// Sectioning commands.
    pub headings: usize,
    /// Inline formulas.
    pub inline_math: usize,
    /// Display formulas.
    pub display_math: usize,
    /// Figures.
    pub figures: usize,
    /// Tables.
    pub tables: usize,
    /// Citations.
    pub citations: usize,
}

impl std::ops::AddAssign for WordCount {
    fn add_assign(&mut self, o: Self) {
        self.words += o.words;
        self.characters += o.characters;
        self.headings += o.headings;
        self.inline_math += o.inline_math;
        self.display_math += o.display_math;
        self.figures += o.figures;
        self.tables += o.tables;
        self.citations += o.citations;
    }
}

/// Commands whose arguments are not prose.
const SKIP_ARGS: &[&str] = &[
    "label",
    "ref",
    "eqref",
    "pageref",
    "cref",
    "Cref",
    "autoref",
    "cite",
    "citep",
    "citet",
    "parencite",
    "textcite",
    "autocite",
    "nocite",
    "includegraphics",
    "input",
    "include",
    "usepackage",
    "documentclass",
    "begin",
    "end",
    "bibliography",
    "bibliographystyle",
    "addbibresource",
    "vspace",
    "hspace",
    "setlength",
    "newcommand",
    "renewcommand",
    "def",
    "url",
    "href",
    "graphicspath",
    "setcounter",
    "addtocounter",
    "color",
    "textcolor",
    "definecolor",
    "newenvironment",
    "includepdf",
    "hypersetup",
    "geometry",
    "pagestyle",
    "thispagestyle",
    "pagenumbering",
    "rule",
    "index",
    "newtheorem",
    "usetikzlibrary",
    "tikzset",
    "pgfplotsset",
    "sisetup",
];

/// Counts the words of one file.
pub fn count(text: &str, index: &DocumentIndex) -> WordCount {
    let mut wc = WordCount {
        headings: index.sections.len(),
        citations: index.citations.len(),
        ..Default::default()
    };
    // Spans to ignore: preamble, comments, verbatim, math.
    let mut skip: Vec<std::ops::Range<usize>> = Vec::new();
    if let Some(begin) = index.begin_document {
        skip.push(0..begin);
    }
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        if let Some(c) = comment_start(line) {
            skip.push(offset + c..offset + line.len());
        }
        offset += line.len();
    }
    for env in &index.environments {
        let base = env.name.trim_end_matches('*');
        match base {
            "figure" | "wrapfigure" | "sidewaysfigure" => wc.figures += 1,
            "table" | "wraptable" | "sidewaystable" | "longtable" => wc.tables += 1,
            _ => {}
        }
        if is_verbatim_environment(&env.name)
            || matches!(base, "tikzpicture" | "axis" | "tabular" | "array")
        {
            skip.push(env.begin.start..env.end.as_ref().map_or(text.len(), |e| e.end));
        }
        if is_math_environment(&env.name) {
            wc.display_math += 1;
        }
    }
    for m in &index.math {
        let before = &text[..m.start];
        if before.ends_with('$') && !before.ends_with("$$") || before.ends_with("\\(") {
            wc.inline_math += 1;
        } else if before.ends_with("$$") || before.ends_with("\\[") {
            wc.display_math += 1;
        }
        skip.push(m.clone());
    }
    skip.sort_by_key(|s| s.start);

    let mut skip_idx = 0;
    let mut in_word = false;
    let mut word_chars = 0;
    let mut skip_groups = 0u32;
    let mut skip_base = 0u32;
    let mut depth = 0u32;
    let mut skip_until_depth: Option<u32> = None;
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut k = 0;
    let end_word = |in_word: &mut bool, word_chars: &mut usize, wc: &mut WordCount| {
        if *in_word {
            wc.words += 1;
            wc.characters += *word_chars;
        }
        *in_word = false;
        *word_chars = 0;
    };
    while k < chars.len() {
        let (pos, c) = chars[k];
        while skip_idx < skip.len() && skip[skip_idx].end <= pos {
            skip_idx += 1;
        }
        if skip_idx < skip.len() && skip[skip_idx].start <= pos {
            end_word(&mut in_word, &mut word_chars, &mut wc);
            let end = skip[skip_idx].end;
            while k < chars.len() && chars[k].0 < end {
                k += 1;
            }
            continue;
        }
        match c {
            '\\' => {
                end_word(&mut in_word, &mut word_chars, &mut wc);
                let start = k + 1;
                let mut e = start;
                while e < chars.len() && chars[e].1.is_ascii_alphabetic() {
                    e += 1;
                }
                if e == start {
                    k += 2; // control symbol
                    continue;
                }
                let name: String = chars[start..e].iter().map(|(_, c)| *c).collect();
                if skip_until_depth.is_none() {
                    // A new command ends the arguments of the previous one.
                    skip_groups = if SKIP_ARGS.contains(&name.as_str()) {
                        2
                    } else {
                        0
                    };
                    skip_base = depth;
                }
                k = e;
                continue;
            }
            '{' => {
                end_word(&mut in_word, &mut word_chars, &mut wc);
                depth += 1;
                if skip_groups > 0 && skip_until_depth.is_none() {
                    skip_until_depth = Some(depth);
                }
            }
            '}' => {
                end_word(&mut in_word, &mut word_chars, &mut wc);
                if skip_until_depth == Some(depth) {
                    skip_until_depth = None;
                    skip_groups = skip_groups.saturating_sub(1);
                }
                depth = depth.saturating_sub(1);
            }
            '[' if skip_groups > 0 && skip_until_depth.is_none() => {
                // Optional argument of a skipped command.
                while k < chars.len() && chars[k].1 != ']' {
                    k += 1;
                }
            }
            _ if skip_until_depth.is_some() => {}
            c if c.is_alphanumeric() || (in_word && (c == '\'' || c == '’' || c == '-')) => {
                if !in_word {
                    in_word = true;
                }
                word_chars += 1;
                if skip_groups > 0 && depth == skip_base {
                    skip_groups = 0;
                }
            }
            _ => {
                end_word(&mut in_word, &mut word_chars, &mut wc);
                if !c.is_whitespace() && skip_groups > 0 && skip_until_depth.is_none() {
                    skip_groups = 0;
                }
            }
        }
        k += 1;
    }
    end_word(&mut in_word, &mut word_chars, &mut wc);
    wc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_prose_only() {
        let text = "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\section{Deux mots}\\label{sec:x}\nL'étude porte-parole de $x^2$ et \\textbf{gras} \\cite{a}. % commentaire ignoré\n\\begin{equation} a = b \\end{equation}\n\\begin{figure}\\includegraphics{f}\\caption{Une légende}\\end{figure}\n\\end{document}\n";
        let idx = crate::syntax::scan(text);
        let wc = count(text, &idx);
        // Deux mots | L'étude porte-parole de et gras | Une légende
        assert_eq!(wc.words, 2 + 5 + 2, "{wc:?}");
        assert_eq!(wc.headings, 1);
        assert_eq!(wc.inline_math, 1);
        assert_eq!(wc.display_math, 1);
        assert_eq!(wc.figures, 1);
        assert_eq!(wc.citations, 1);
    }
}
