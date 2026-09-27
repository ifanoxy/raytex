//! Converts short LaTeX fragments (titles, captions, BibTeX fields) into
//! readable plain text: `Intro à \emph{\LaTeX}~\cite{x}` → `Intro à LaTeX`.

use crate::text::squash_whitespace;

/// Commands whose (first mandatory) argument is dropped entirely.
const DROP_ARGUMENT: &[&str] = &[
    "label",
    "index",
    "footnote",
    "footnotemark",
    "cite",
    "citep",
    "citet",
    "parencite",
    "textcite",
    "autocite",
    "ref",
    "eqref",
    "cref",
    "Cref",
    "autoref",
    "pageref",
    "glossary",
    "todo",
    "hspace",
    "vspace",
    "hspace*",
    "vspace*",
    "phantom",
    "hphantom",
    "vphantom",
    "includegraphics",
    "thanks",
    "protect",
    "color",
    "setlength",
    "addtolength",
];

/// Converts a LaTeX fragment to plain text.
pub fn to_plain(latex: &str) -> String {
    let mut out = String::with_capacity(latex.len());
    let chars: Vec<char> = latex.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' => {
                i += 1;
                let Some(&next) = chars.get(i) else { break };
                if next.is_ascii_alphabetic() {
                    let start = i;
                    while i < chars.len() && chars[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                    let name: String = chars[start..i].iter().collect();
                    if i < chars.len() && chars[i] == '*' {
                        i += 1;
                    }
                    if let Some(accented) = accent(&name, &chars, &mut i) {
                        out.push(accented);
                        continue;
                    }
                    if DROP_ARGUMENT.contains(&name.as_str()) {
                        skip_optional(&chars, &mut i);
                        skip_group(&chars, &mut i);
                        continue;
                    }
                    out.push_str(replacement(&name));
                    // A control word swallows the following spaces.
                    if replacement(&name).is_empty() {
                        while i < chars.len() && chars[i] == ' ' {
                            i += 1;
                        }
                    }
                } else {
                    i += 1;
                    match next {
                        '\\' | ',' | ';' | ':' | '!' | ' ' | '/' => out.push(' '),
                        '\'' | '`' | '^' | '"' | '~' | '=' | '.' => {
                            let base = take_accent_base(&chars, &mut i);
                            out.push(compose(next, base).unwrap_or(base));
                        }
                        other => out.push(other),
                    }
                }
            }
            '{' | '}' => i += 1,
            '~' => {
                out.push(' ');
                i += 1;
            }
            '%' => {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            }
            '-' if chars.get(i + 1) == Some(&'-') => {
                if chars.get(i + 2) == Some(&'-') {
                    out.push('—');
                    i += 3;
                } else {
                    out.push('–');
                    i += 2;
                }
            }
            '`' if chars.get(i + 1) == Some(&'`') => {
                out.push('“');
                i += 2;
            }
            '\'' if chars.get(i + 1) == Some(&'\'') => {
                out.push('”');
                i += 2;
            }
            _ => {
                out.push(c);
                i += 1;
            }
        }
    }
    squash_whitespace(&out)
}

fn replacement(name: &str) -> &'static str {
    match name {
        "LaTeX" => "LaTeX",
        "LaTeXe" => "LaTeX2ε",
        "TeX" => "TeX",
        "XeLaTeX" => "XeLaTeX",
        "LuaLaTeX" => "LuaLaTeX",
        "BibTeX" => "BibTeX",
        "ldots" | "dots" | "textellipsis" => "…",
        "og" => "« ",
        "fg" => " »",
        "textendash" => "–",
        "textemdash" => "—",
        "S" => "§",
        "P" => "¶",
        "oe" => "œ",
        "OE" => "Œ",
        "ae" => "æ",
        "AE" => "Æ",
        "ss" => "ß",
        "o" => "ø",
        "O" => "Ø",
        "aa" => "å",
        "AA" => "Å",
        "l" => "ł",
        "L" => "Ł",
        "i" => "i",
        "j" => "j",
        "euro" | "texteuro" => "€",
        "textdegree" | "degree" => "°",
        "copyright" | "textcopyright" => "©",
        "textregistered" => "®",
        "texttrademark" => "™",
        "quad" | "qquad" | "newline" | "linebreak" | "par" | "enspace" | "thinspace" => " ",
        "today" => "",
        _ => "",
    }
}

/// Handles `\c{c}`, `\c c` and word accents such as `\H{o}`.
fn accent(name: &str, chars: &[char], i: &mut usize) -> Option<char> {
    let mark = match name {
        "c" => 'c',
        "H" => 'H',
        "v" => 'v',
        "u" => 'u',
        "k" => 'k',
        "r" => 'r',
        _ => return None,
    };
    let save = *i;
    while *i < chars.len() && chars[*i] == ' ' {
        *i += 1;
    }
    let base = take_accent_base(chars, i);
    match compose(mark, base) {
        Some(c) => Some(c),
        None => {
            *i = save;
            None
        }
    }
}

fn take_accent_base(chars: &[char], i: &mut usize) -> char {
    let braced = chars.get(*i) == Some(&'{');
    if braced {
        *i += 1;
    }
    if chars.get(*i) == Some(&'\\') {
        *i += 1; // dotless \i and \j
    }
    let base = chars.get(*i).copied().unwrap_or(' ');
    *i += 1;
    if braced {
        while *i < chars.len() && chars[*i] != '}' {
            *i += 1;
        }
        *i = (*i + 1).min(chars.len());
    }
    base
}

/// Composes an accent mark with a base letter.
fn compose(mark: char, base: char) -> Option<char> {
    let table: &[(char, &str, &str)] = &[
        ('\'', "aeiouyAEIOUYcnsz", "áéíóúýÁÉÍÓÚÝćńśź"),
        ('`', "aeiouAEIOU", "àèìòùÀÈÌÒÙ"),
        ('^', "aeiouAEIOU", "âêîôûÂÊÎÔÛ"),
        ('"', "aeiouyAEIOU", "äëïöüÿÄËÏÖÜ"),
        ('~', "anoANO", "ãñõÃÑÕ"),
        ('c', "cCsStT", "çÇşŞţŢ"),
        ('H', "oOuU", "őŐűŰ"),
        ('v', "csznrCSZNRe", "čšžňřČŠŽŇŘě"),
        ('u', "agAG", "ăğĂĞ"),
        ('k', "aeAE", "ąęĄĘ"),
        ('r', "auAU", "åůÅŮ"),
        ('=', "aeiouAEIOU", "āēīōūĀĒĪŌŪ"),
        ('.', "zZeE", "żŻėĖ"),
    ];
    let (_, bases, composed) = table.iter().find(|(m, _, _)| *m == mark)?;
    let pos = bases.chars().position(|b| b == base)?;
    composed.chars().nth(pos)
}

fn skip_optional(chars: &[char], i: &mut usize) {
    if chars.get(*i) == Some(&'[') {
        let mut depth = 0;
        while *i < chars.len() {
            match chars[*i] {
                '[' => depth += 1,
                ']' => {
                    depth -= 1;
                    if depth == 0 {
                        *i += 1;
                        return;
                    }
                }
                _ => {}
            }
            *i += 1;
        }
    }
}

fn skip_group(chars: &[char], i: &mut usize) {
    while *i < chars.len() && chars[*i] == ' ' {
        *i += 1;
    }
    if chars.get(*i) != Some(&'{') {
        return;
    }
    let mut depth = 0;
    while *i < chars.len() {
        match chars[*i] {
            '\\' => *i += 1,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    *i += 1;
                    return;
                }
            }
            _ => {}
        }
        *i += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::to_plain;

    #[test]
    fn converts_common_constructs() {
        assert_eq!(to_plain(r"Intro à \emph{\LaTeX}~\cite{x}"), "Intro à LaTeX");
        assert_eq!(
            to_plain(r"L'\'etude de \og la m\`ethode\fg{}"),
            "L'étude de « la mèthode »"
        );
        assert_eq!(
            to_plain(r"Fran\c{c}ais -- \textbf{gras}\footnote{note}\label{a}"),
            "Français – gras"
        );
        assert_eq!(to_plain(r"$x^2$ \& 50\%"), "$x^2$ & 50%");
        assert_eq!(to_plain(r"\c c\'{\i}"), "çí");
    }
}
