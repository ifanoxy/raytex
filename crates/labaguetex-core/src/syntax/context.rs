//! Cursor context: what is being typed at the cursor?
//!
//! The editor sends the text before the cursor (a window of a few KiB) and a
//! little text after it. From that we determine whether the user is typing a
//! command name, an environment name, a label key inside `\ref{…}`, a file
//! path inside `\includegraphics{…}`, and so on — and whether the cursor is
//! in math mode.

/// What kind of argument the cursor is in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArgumentKind {
    /// `\begin{…}`
    BeginEnvironment,
    /// `\end{…}`
    EndEnvironment,
    /// `\ref{…}` and friends; the payload is the command name.
    Reference(String),
    /// `\cite{…}` and friends.
    Citation,
    /// `\usepackage{…}`
    Package,
    /// `\documentclass{…}`
    Class,
    /// Options of `\usepackage[…]{pkg}` / `\documentclass[…]{class}`.
    PackageOptions {
        /// Package (or class) name, if already typed after the options.
        package: Option<String>,
        /// Whether it is a document class.
        class: bool,
    },
    /// A file path.
    File(FileKind),
    /// `\color{…}`, `\textcolor{…}`…
    Color,
    /// `\usetikzlibrary{…}`
    TikzLibrary,
    /// `\gls{…}`, `\acrshort{…}`…
    Glossary,
    /// Float placement: `\begin{figure}[…]`.
    Placement,
    /// Key-value options of `\includegraphics[…]`.
    GraphicsOptions,
    /// Any other argument (no special completion).
    Other,
}

/// Kind of file expected in a path argument.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FileKind {
    /// `.tex` sources (`\input`, `\include`).
    Tex,
    /// Images (`\includegraphics`).
    Graphics,
    /// `.bib` databases.
    Bib,
    /// Anything.
    Any,
}

/// The syntactic context at the cursor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CursorContext {
    /// Typing a command name after `\`. `partial` excludes the backslash.
    Command {
        /// Letters typed so far.
        partial: String,
        /// Whether the cursor is in math mode.
        in_math: bool,
    },
    /// Typing an `@x` math shortcut.
    AtShortcut {
        /// Text after `@`.
        partial: String,
    },
    /// Inside a command argument.
    Argument {
        /// Command owning the argument (`begin` for environments).
        command: String,
        /// What the argument contains.
        kind: ArgumentKind,
        /// Text of the current item typed so far (after the last comma).
        partial: String,
        /// Innermost unclosed environment (useful for `\end{…}`).
        open_environment: Option<String>,
        /// Whether a closing `}` (or `]`) already follows the cursor.
        closed: bool,
    },
    /// Typing a plain word (snippet triggers).
    Word {
        /// Letters typed so far.
        partial: String,
        /// Whether the cursor is in math mode.
        in_math: bool,
    },
    /// Inside a `% !TEX` magic comment.
    MagicComment {
        /// Text of the comment after `%`.
        partial: String,
    },
    /// Inside an ordinary comment or nowhere interesting.
    None,
}

/// Determines the context at the end of `before`, with `after` following the cursor.
pub fn cursor_context(before: &str, after: &str) -> CursorContext {
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    let line = &before[line_start..];
    if let Some(comment) = comment_start(line) {
        let text = &line[comment + 1..];
        if text.trim_start().starts_with('!') {
            return CursorContext::MagicComment {
                partial: text.to_owned(),
            };
        }
        return CursorContext::None;
    }

    // `\name|`
    let letters = trailing(before, |c| c.is_ascii_alphabetic() || c == '@');
    let head = &before[..before.len() - letters.len()];
    if head.ends_with('\\') && !is_escaped(head, head.len() - 1) {
        return CursorContext::Command {
            partial: letters.to_owned(),
            in_math: in_math(before),
        };
    }
    // `@x` shortcuts: `@` followed by up to two non-space characters.
    if let Some(at) = line.rfind('@') {
        let partial = &line[at + 1..];
        let prev = line[..at].chars().last();
        if partial.chars().count() <= 2
            && !partial.contains(|c: char| c.is_whitespace() || c == '\\' || c == '@')
            && prev.is_none_or(|c| !c.is_alphanumeric() && c != '\\')
        {
            return CursorContext::AtShortcut {
                partial: partial.to_owned(),
            };
        }
    }

    if let Some(ctx) = argument_context(before, after) {
        return ctx;
    }

    let word = trailing(before, |c| c.is_alphanumeric());
    if !word.is_empty() {
        return CursorContext::Word {
            partial: word.to_owned(),
            in_math: in_math(before),
        };
    }
    CursorContext::None
}

/// Byte index of an unescaped `%` in `line`, if any.
pub fn comment_start(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    (0..bytes.len()).find(|&i| bytes[i] == b'%' && !is_escaped(line, i))
}

/// Whether the byte at `i` is preceded by an odd number of backslashes.
fn is_escaped(s: &str, i: usize) -> bool {
    let bytes = s.as_bytes();
    let mut n = 0;
    let mut j = i;
    while j > 0 && bytes[j - 1] == b'\\' {
        n += 1;
        j -= 1;
    }
    n % 2 == 1
}

fn trailing(s: &str, pred: impl Fn(char) -> bool) -> &str {
    let start = s
        .char_indices()
        .rev()
        .take_while(|&(_, c)| pred(c))
        .last()
        .map_or(s.len(), |(i, _)| i);
    &s[start..]
}

/// Finds the innermost unclosed `{` or `[` before the cursor (ignoring
/// comments) and identifies the command it belongs to.
fn argument_context(before: &str, after: &str) -> Option<CursorContext> {
    let bytes = before.as_bytes();
    let (open, open_char) = unmatched_opener(before)?;
    let inner = &before[open + 1..];
    let partial = inner
        .rsplit(',')
        .next()
        .unwrap_or("")
        .trim_start()
        .to_owned();

    // Walk back over previous arguments to the command name.
    let mut i = open;
    let mut groups_before = 0usize;
    let mut optionals_before = 0usize;
    loop {
        let mut newlines = 0;
        while i > 0 && matches!(bytes[i - 1], b' ' | b'\t' | b'\n' | b'\r') {
            newlines += usize::from(bytes[i - 1] == b'\n');
            i -= 1;
        }
        if newlines > 1 {
            return None;
        }
        if i == 0 {
            return None;
        }
        match bytes[i - 1] {
            b'}' => {
                i = matching_backwards(bytes, i - 1, b'{', b'}')?;
                groups_before += 1;
            }
            b']' => {
                i = matching_backwards(bytes, i - 1, b'[', b']')?;
                optionals_before += 1;
            }
            b'>' => i = matching_backwards(bytes, i - 1, b'<', b'>')?,
            b'*' => i -= 1,
            _ => break,
        }
        if groups_before + optionals_before > 6 {
            return None;
        }
    }
    let name_end = i;
    while i > 0 && (bytes[i - 1].is_ascii_alphabetic() || bytes[i - 1] == b'@') {
        i -= 1;
    }
    if i == 0 || bytes[i - 1] != b'\\' || i == name_end || is_escaped(before, i - 1) {
        return None;
    }
    let command = &before[i..name_end];
    let first_group_text = || -> Option<String> {
        let rest = &before[name_end..open];
        let s = rest.find('{')?;
        let e = rest[s..].find('}')? + s;
        Some(rest[s + 1..e].trim().to_owned())
    };

    let kind = if open_char == b'{' {
        match (command, groups_before) {
            ("begin", 0) => ArgumentKind::BeginEnvironment,
            ("end", 0) => ArgumentKind::EndEnvironment,
            ("usepackage" | "RequirePackage", 0) => ArgumentKind::Package,
            ("documentclass", 0) => ArgumentKind::Class,
            ("input" | "include" | "subfile" | "includeonly" | "subfileinclude", 0) => {
                ArgumentKind::File(FileKind::Tex)
            }
            ("import" | "subimport" | "inputfrom" | "subinputfrom", 1) => {
                ArgumentKind::File(FileKind::Tex)
            }
            ("includegraphics" | "includesvg" | "includepdf", 0) => {
                ArgumentKind::File(FileKind::Graphics)
            }
            ("bibliography" | "addbibresource" | "addglobalbib", 0) => {
                ArgumentKind::File(FileKind::Bib)
            }
            ("lstinputlisting" | "verbatiminput" | "VerbatimInput" | "includestandalone", 0) => {
                ArgumentKind::File(FileKind::Any)
            }
            ("inputminted", 1) => ArgumentKind::File(FileKind::Any),
            (
                "color" | "pagecolor" | "colorbox" | "textcolor" | "fcolorbox" | "colorlet"
                | "rowcolor" | "cellcolor" | "columncolor",
                0,
            ) => ArgumentKind::Color,
            ("fcolorbox", 1) => ArgumentKind::Color,
            ("usetikzlibrary" | "usepgfplotslibrary", 0) => ArgumentKind::TikzLibrary,
            (
                "gls" | "Gls" | "glspl" | "Glspl" | "GLS" | "acrshort" | "acrlong" | "acrfull"
                | "ac" | "acs" | "acl" | "acf" | "glsentrytext" | "glsdesc" | "acp" | "Ac",
                0,
            ) => ArgumentKind::Glossary,
            (cmd, 0) if super::scanner::is_citation_command(cmd) => ArgumentKind::Citation,
            (cmd, n) if cmd.ends_with("cites") && n < 8 => ArgumentKind::Citation,
            (cmd, 0) if super::scanner::is_reference_command(cmd) => {
                ArgumentKind::Reference(cmd.to_owned())
            }
            ("crefrange" | "Crefrange" | "cpagerefrange", 0 | 1) => {
                ArgumentKind::Reference(command.to_owned())
            }
            _ => ArgumentKind::Other,
        }
    } else {
        match command {
            "usepackage" | "documentclass" | "RequirePackage" if groups_before == 0 => {
                let package = after
                    .find(']')
                    .and_then(|e| after[e + 1..].trim_start().strip_prefix('{'))
                    .and_then(|rest| rest.find('}').map(|end| rest[..end].trim().to_owned()))
                    .filter(|p| !p.is_empty() && !p.contains(','));
                ArgumentKind::PackageOptions {
                    package,
                    class: command == "documentclass",
                }
            }
            "begin" if groups_before == 1 => match first_group_text().as_deref() {
                Some(
                    "figure" | "figure*" | "table" | "table*" | "wrapfigure" | "sidewaysfigure",
                ) => ArgumentKind::Placement,
                _ => ArgumentKind::Other,
            },
            "includegraphics" => ArgumentKind::GraphicsOptions,
            "hyperref" => ArgumentKind::Reference("hyperref".into()),
            _ => ArgumentKind::Other,
        }
    };
    let close = if open_char == b'{' { '}' } else { ']' };
    let closed = after
        .chars()
        .find(|c| !c.is_alphanumeric() && !":-_./, ".contains(*c))
        == Some(close);
    Some(CursorContext::Argument {
        command: command.to_owned(),
        kind,
        partial,
        open_environment: innermost_environment(before),
        closed,
    })
}

/// Position of the innermost unclosed `{` or `[` on the last few lines.
fn unmatched_opener(before: &str) -> Option<(usize, u8)> {
    let bytes = before.as_bytes();
    let mut braces = 0usize;
    let mut brackets = 0usize;
    let mut end = before.len();
    let mut lines = 0;
    loop {
        let line_start = before[..end].rfind('\n').map_or(0, |i| i + 1);
        let line = &before[line_start..end];
        if lines > 0 && line.trim().is_empty() {
            return None; // blank line: arguments cannot cross paragraphs here
        }
        let effective_end = comment_start(line).map_or(end, |c| line_start + c);
        let mut i = effective_end;
        while i > line_start {
            i -= 1;
            let b = bytes[i];
            if !matches!(b, b'{' | b'}' | b'[' | b']') || is_escaped(before, i) {
                continue;
            }
            match b {
                b'}' => braces += 1,
                b']' => brackets += 1,
                b'{' if braces == 0 => return Some((i, b'{')),
                b'{' => braces -= 1,
                b'[' if brackets == 0 && braces == 0 => return Some((i, b'[')),
                b'[' => brackets = brackets.saturating_sub(1),
                _ => {}
            }
        }
        lines += 1;
        if line_start == 0 || lines > 12 {
            return None;
        }
        end = line_start - 1;
    }
}

/// Given the index of a closing delimiter, returns the index of its opener.
fn matching_backwards(bytes: &[u8], close_idx: usize, open: u8, close: u8) -> Option<usize> {
    let mut depth = 0usize;
    let mut i = close_idx + 1;
    let limit = close_idx.saturating_sub(2048);
    while i > limit {
        i -= 1;
        let b = bytes[i];
        if b == close {
            depth += 1;
        } else if b == open {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        } else if b == b'\n' && i > 0 && bytes[i - 1] == b'\n' {
            return None;
        }
    }
    None
}

/// Innermost `\begin{…}` not closed before the end of `before`.
pub fn innermost_environment(before: &str) -> Option<String> {
    open_environments(before).pop()
}

/// Stack of environments opened (and not closed) in `before`.
pub fn open_environments(before: &str) -> Vec<String> {
    let mut stack: Vec<String> = Vec::new();
    for line in before.lines() {
        let line = match comment_start(line) {
            Some(c) => &line[..c],
            None => line,
        };
        let mut rest = line;
        while let Some(i) = rest.find('\\') {
            rest = &rest[i + 1..];
            let (is_begin, tail) = if let Some(t) = rest.strip_prefix("begin") {
                (true, t)
            } else if let Some(t) = rest.strip_prefix("end") {
                (false, t)
            } else {
                continue;
            };
            let tail = tail.trim_start();
            let Some(tail) = tail.strip_prefix('{') else {
                continue;
            };
            let Some(close) = tail.find('}') else {
                continue;
            };
            let name = tail[..close].trim();
            if is_begin {
                stack.push(name.to_owned());
            } else if let Some(pos) = stack.iter().rposition(|n| n == name) {
                stack.truncate(pos);
            }
            rest = &tail[close + 1..];
        }
    }
    stack
}

/// Whether the end of `text` is in math mode.
///
/// Scans from the start of the current paragraph, tracking `$`, `$$`,
/// `\(`, `\[`, math environments and text-mode escapes such as `\text{…}`.
pub fn in_math(text: &str) -> bool {
    // Math environments may span the window start; check them first.
    let envs = open_environments(text);
    let env_math = envs
        .iter()
        .rposition(|e| super::scanner::is_math_environment(e) || is_inner_math_environment(e));
    let start = paragraph_start(text);
    let bytes = text.as_bytes();
    // Stack of brace depths at which a text-mode command started (`\text{`).
    let mut text_groups: Vec<usize> = Vec::new();
    let mut depth = 0usize;
    let mut inline: Option<u8> = None; // b'$' or b'D' ($$) or b'(' or b'['
    let mut i = start;
    while i < bytes.len() {
        match bytes[i] {
            b'%' => {
                i = memchr::memchr(b'\n', &bytes[i..]).map_or(bytes.len(), |k| i + k);
                continue;
            }
            b'\\' => {
                let next = bytes.get(i + 1).copied();
                match next {
                    Some(b'(') | Some(b'[') if inline.is_none() => inline = next,
                    Some(b')') if inline == Some(b'(') => inline = None,
                    Some(b']') if inline == Some(b'[') => inline = None,
                    Some(c) if c.is_ascii_alphabetic() => {
                        let s = i + 1;
                        let mut e = s;
                        while e < bytes.len() && bytes[e].is_ascii_alphabetic() {
                            e += 1;
                        }
                        let name = &text[s..e];
                        let math_now = inline.is_some() || env_math.is_some();
                        if math_now && is_text_command(name) && bytes.get(e) == Some(&b'{') {
                            text_groups.push(depth + 1);
                        }
                        i = e;
                        continue;
                    }
                    _ => {}
                }
                i += 2;
                continue;
            }
            b'$' if !text_groups.is_empty() => {
                // `$…$` nested in `\text{…}`: does not change the outer mode.
            }
            b'$' => {
                let double = bytes.get(i + 1) == Some(&b'$');
                {
                    match inline {
                        None if double => {
                            inline = Some(b'D');
                            i += 1;
                        }
                        None => inline = Some(b'$'),
                        Some(b'D') if double => {
                            inline = None;
                            i += 1;
                        }
                        Some(b'$') => inline = None,
                        _ => {}
                    }
                }
            }
            b'{' => depth += 1,
            b'}' => {
                if text_groups.last() == Some(&depth) {
                    text_groups.pop();
                }
                depth = depth.saturating_sub(1);
            }
            _ => {}
        }
        i += 1;
    }
    if !text_groups.is_empty() {
        return false;
    }
    inline.is_some() || env_math.is_some()
}

fn paragraph_start(text: &str) -> usize {
    let bytes = text.as_bytes();
    let mut i = bytes.len();
    while i > 0 {
        i -= 1;
        if bytes[i] == b'\n' {
            let mut j = i;
            while j > 0 && matches!(bytes[j - 1], b' ' | b'\t' | b'\r') {
                j -= 1;
            }
            if j > 0 && bytes[j - 1] == b'\n' {
                return i + 1;
            }
        }
    }
    0
}

fn is_text_command(name: &str) -> bool {
    matches!(
        name,
        "text"
            | "textrm"
            | "textit"
            | "textbf"
            | "textsf"
            | "texttt"
            | "textup"
            | "textnormal"
            | "mbox"
            | "hbox"
            | "intertext"
            | "shortintertext"
            | "operatorname"
            | "label"
            | "tag"
    )
}

fn is_inner_math_environment(name: &str) -> bool {
    matches!(
        name,
        "array"
            | "matrix"
            | "pmatrix"
            | "bmatrix"
            | "Bmatrix"
            | "vmatrix"
            | "Vmatrix"
            | "smallmatrix"
            | "cases"
            | "dcases"
            | "aligned"
            | "gathered"
            | "split"
            | "alignedat"
            | "subarray"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arg_kind(before: &str, after: &str) -> (ArgumentKind, String) {
        match cursor_context(before, after) {
            CursorContext::Argument { kind, partial, .. } => (kind, partial),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn commands_and_shortcuts() {
        assert_eq!(
            cursor_context("Text \\sec", ""),
            CursorContext::Command {
                partial: "sec".into(),
                in_math: false
            }
        );
        assert_eq!(
            cursor_context("$x + \\al", ""),
            CursorContext::Command {
                partial: "al".into(),
                in_math: true
            }
        );
        assert_eq!(
            cursor_context("a \\\\sec", ""),
            CursorContext::Word {
                partial: "sec".into(),
                in_math: false
            }
        );
        assert_eq!(
            cursor_context("$ @a", ""),
            CursorContext::AtShortcut {
                partial: "a".into()
            }
        );
        assert_eq!(
            cursor_context("mail@ex", ""),
            CursorContext::Word {
                partial: "ex".into(),
                in_math: false
            }
        );
        assert_eq!(cursor_context("% \\sec", ""), CursorContext::None);
        assert!(matches!(
            cursor_context("% !TEX pro", ""),
            CursorContext::MagicComment { .. }
        ));
    }

    #[test]
    fn arguments() {
        assert_eq!(
            arg_kind("\\begin{ite", "}"),
            (ArgumentKind::BeginEnvironment, "ite".into())
        );
        assert_eq!(
            arg_kind("\\cite[p.~5]{knuth, lam", "}"),
            (ArgumentKind::Citation, "lam".into())
        );
        assert_eq!(
            arg_kind("\\eqref{eq:", ""),
            (ArgumentKind::Reference("eqref".into()), "eq:".into())
        );
        assert_eq!(
            arg_kind("\\includegraphics[width=0.5\\linewidth]{fig/a", "}"),
            (ArgumentKind::File(FileKind::Graphics), "fig/a".into())
        );
        assert_eq!(
            arg_kind("\\usepackage[fr", "]{babel}"),
            (
                ArgumentKind::PackageOptions {
                    package: Some("babel".into()),
                    class: false
                },
                "fr".into()
            )
        );
        assert_eq!(
            arg_kind("\\begin{figure}[h", "]"),
            (ArgumentKind::Placement, "h".into())
        );
        assert_eq!(
            arg_kind("\\textcolor{re", ""),
            (ArgumentKind::Color, "re".into())
        );
        assert_eq!(
            arg_kind("\\section{Intro \\emph{x} and y", "}"),
            (ArgumentKind::Other, "Intro \\emph{x} and y".into())
        );
        assert!(matches!(
            cursor_context("\\begin{a}\n\n{x", ""),
            CursorContext::Word { .. }
        ));
    }

    #[test]
    fn end_environment_suggests_innermost() {
        let ctx = cursor_context("\\begin{document}\n\\begin{itemize}\n\\item a\n\\end{", "");
        match ctx {
            CursorContext::Argument {
                kind: ArgumentKind::EndEnvironment,
                open_environment,
                ..
            } => {
                assert_eq!(open_environment.as_deref(), Some("itemize"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn math_detection() {
        assert!(in_math("text $a + b"));
        assert!(!in_math("text $a$ b"));
        assert!(in_math("\\begin{align}\n x &= "));
        assert!(!in_math("\\begin{align}\n x \\end{align} y"));
        assert!(!in_math("$x \\text{if "));
        assert!(in_math("$x \\text{if} y"));
        assert!(in_math("\\[ a"));
        assert!(!in_math("$a$\n\nnew paragraph $b$ c"));
        assert!(in_math("\\begin{equation}\\begin{pmatrix} a"));
        assert!(!in_math("50\\$ and more"));
        assert!(in_math("\\textbf{$x"));
        assert!(in_math("$x \\text{if $y$} z"));
    }
}
