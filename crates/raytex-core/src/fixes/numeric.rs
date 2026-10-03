//! Numbers and lengths TeX could not read: "Missing number", "Illegal unit
//! of measure", "Number too big", "Dimension too large".
//!
//! TeX reports these where it stopped reading, which is after the whole
//! command (`\vspace{abc}` ⇥): the line is known, the value at fault is not.
//! It is one of the numbers and lengths the commands of the line expect.
//! Each of them is read the way TeX reads it; the one that explains the
//! message is the place of the problem, and what is wrong with it is said.
//! When none explains it, nothing is guessed: the command TeX stopped after
//! is shown, without advice.

use std::sync::LazyLock;

use regex::Regex;

use super::latex::{At, CONSEQUENCE, Sources, Src, TABULARS, at, column_spec, edits, place};
use super::text::{group_end, mask};
use crate::diagnostics::{Diagnostic, Fix};
use crate::i18n::Lang;
use crate::text::Span;

/// What a place of a command expects.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    /// A length: `1cm`, `0.5\linewidth`.
    Length,
    /// A length, or `*`, `!`, `=` (`\resizebox`, `\multirow`).
    Auto,
    /// A whole number.
    Number,
    /// A decimal number (a factor, an angle).
    Factor,
    /// A font size: a number, with or without unit.
    Size,
    /// Two column numbers: `2-3`.
    Columns,
}

/// What is wrong with a value. Spans are in the text that was checked.
#[derive(Debug, Clone, PartialEq)]
enum Verdict {
    /// Nothing, or nothing that can be told (a macro, a calculation).
    Fine,
    /// Nothing is written.
    Empty,
    /// Words where a number is expected.
    NotNumber,
    /// A number (its span) without unit.
    NoUnit(Span),
    /// A unit (its span) TeX does not know.
    BadUnit(Span),
    /// A value (its span) beyond what TeX accepts; for a length, the largest
    /// value in its unit.
    TooLarge(Span, Option<(f64, &'static str)>),
}

/// Units with a fixed size, in points.
const UNITS: &[(&str, f64)] = &[
    ("pt", 1.0),
    ("pc", 12.0),
    ("in", 72.27),
    ("bp", 72.27 / 72.0),
    ("cm", 72.27 / 2.54),
    ("mm", 72.27 / 25.4),
    ("dd", 1238.0 / 1157.0),
    ("cc", 12.0 * 1238.0 / 1157.0),
    ("sp", 1.0 / 65536.0),
];
/// Units whose size depends on the font or the engine.
const OTHER_UNITS: &[&str] = &["em", "ex", "mu", "px", "nd", "nc", "fi"];
const MAX_PT: f64 = 16383.99999;
const MAX_NUMBER: u128 = 2_147_483_647;

/// Reads `text` as TeX reads a value of `kind`.
fn check(text: &str, kind: Kind) -> Verdict {
    let t = text.trim();
    if t.is_empty() {
        return Verdict::Empty;
    }
    if kind == Kind::Auto && matches!(t, "*" | "!" | "=") {
        return Verdict::Fine;
    }
    if kind == Kind::Columns {
        let words = t
            .split('-')
            .any(|p| p.trim().starts_with(char::is_alphabetic));
        return if words {
            Verdict::NotNumber
        } else {
            Verdict::Fine
        };
    }
    let b = text.as_bytes();
    let mut i = text.len() - text.trim_start().len();
    while i < b.len() && matches!(b[i], b'+' | b'-' | b' ') {
        i += 1;
    }
    let rest = &text[i..];
    let Some(first) = rest.chars().next() else {
        return Verdict::NotNumber;
    };
    if first.is_alphabetic() {
        return Verdict::NotNumber;
    }
    if !(first.is_ascii_digit() || first == '.' || first == ',') {
        return Verdict::Fine;
    }
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    let mut end = digits;
    // In a number, TeX takes `,` for a decimal separator like `.`.
    let decimal = rest[end..].starts_with(['.', ',']);
    if decimal {
        end += 1 + rest[end + 1..]
            .bytes()
            .take_while(u8::is_ascii_digit)
            .count();
    }
    let number = i..i + end;
    match kind {
        Kind::Number => {
            let too_big = !decimal
                && rest[..digits]
                    .parse::<u128>()
                    .map_or(digits > 0, |n| n > MAX_NUMBER);
            if too_big {
                Verdict::TooLarge(number, None)
            } else {
                Verdict::Fine
            }
        }
        Kind::Factor | Kind::Columns => Verdict::Fine,
        Kind::Length | Kind::Auto | Kind::Size => {
            let after = rest[end..].trim_start();
            let unit_start = i + end + (rest[end..].len() - after.len());
            if after.is_empty() {
                return if kind == Kind::Size {
                    Verdict::Fine
                } else {
                    Verdict::NoUnit(number)
                };
            }
            if !after.starts_with(char::is_alphabetic) {
                // A length macro (`0.5\linewidth`) or a calculation.
                return Verdict::Fine;
            }
            let word_len = after
                .char_indices()
                .find(|(_, c)| !c.is_alphabetic())
                .map_or(after.len(), |(k, _)| k);
            let word = &after[..word_len];
            let lower = word.to_ascii_lowercase();
            let unit = lower.strip_prefix("true").unwrap_or(&lower);
            let Some(two) = unit.get(..2) else {
                return Verdict::BadUnit(unit_start..unit_start + word_len);
            };
            if let Some((name, pt)) = UNITS.iter().find(|(u, _)| *u == two) {
                let value: f64 = rest[..end].replace(',', ".").parse().unwrap_or(0.0);
                return if value * pt > MAX_PT {
                    let unit_end = unit_start + (word_len - unit.len()) + 2;
                    Verdict::TooLarge(number.start..unit_end, Some((MAX_PT / pt, name)))
                } else {
                    Verdict::Fine
                };
            }
            if OTHER_UNITS.contains(&two) {
                return Verdict::Fine;
            }
            Verdict::BadUnit(unit_start..unit_start + word_len)
        }
    }
}

/// Who expects a value.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Owner {
    /// `\vspace`.
    Command(String),
    /// `\begin{minipage}`.
    Environment(String),
    /// The option `width` of `\includegraphics`.
    Key(String, String),
    /// A `p{…}` column of a table.
    Column(char),
    /// The bracket after `\\`.
    LineBreak,
}

impl Owner {
    /// The owner as the subject of a sentence.
    fn subject(&self, lang: Lang) -> String {
        match self {
            Owner::Command(c) => format!("`\\{c}`"),
            Owner::Environment(e) => format!("`\\begin{{{e}}}`"),
            Owner::Key(k, c) => lang
                .pick(
                    &format!("L'option `{k}` de `\\{c}`"),
                    &format!("The `{k}` option of `\\{c}`"),
                )
                .to_owned(),
            Owner::Column(c) => lang
                .pick(
                    &format!("La colonne `{c}{{…}}` du tableau"),
                    &format!("The `{c}{{…}}` column of the table"),
                )
                .to_owned(),
            Owner::LineBreak => "`\\\\[…]`".to_owned(),
        }
    }
}

/// A place where a command of the line expects a number or a length.
#[derive(Debug, Clone)]
struct Slot {
    /// What is written there (inside the braces).
    value: Span,
    /// What to show when nothing is written: the braces themselves.
    shell: Span,
    kind: Kind,
    owner: Owner,
    /// In a list of options, the comma right after the value when what
    /// follows looks like the end of a decimal length (`width=2,5cm`).
    comma: Option<usize>,
}

/// Where the numbers and lengths of a command are: one letter per argument,
/// in order. `m` an argument that is not looked at, `o` an optional one,
/// `L` a length, `l` an optional length, `N` a number, `n` an optional
/// number, `F` a factor, `A` a length or `*`, `S` a font size, `C` two
/// column numbers, `p` an optional argument in parentheses, `K` an optional
/// list of `key=value` options.
const COMMANDS: &[(&str, &str)] = &[
    ("vspace", "L"),
    ("hspace", "L"),
    ("addvspace", "L"),
    ("enlargethispage", "L"),
    ("rule", "lLL"),
    ("setlength", "mL"),
    ("addtolength", "mL"),
    ("parbox", "oloLm"),
    ("makebox", "lom"),
    ("framebox", "lom"),
    ("raisebox", "Lllm"),
    ("setcounter", "mN"),
    ("addtocounter", "mN"),
    ("multicolumn", "Nmm"),
    ("multirow", "oNoAm"),
    ("linebreak", "n"),
    ("nolinebreak", "n"),
    ("pagebreak", "n"),
    ("nopagebreak", "n"),
    ("footnote", "n"),
    ("footnotemark", "n"),
    ("footnotetext", "n"),
    ("newcommand", "mn"),
    ("renewcommand", "mn"),
    ("providecommand", "mn"),
    ("newenvironment", "mn"),
    ("renewenvironment", "mn"),
    ("fontsize", "SS"),
    ("scalebox", "F"),
    ("rotatebox", "oF"),
    ("resizebox", "AA"),
    ("includegraphics", "K"),
    ("stretch", "F"),
    ("setstretch", "F"),
    ("linethickness", "L"),
    ("tabularnewline", "l"),
    ("cline", "C"),
    ("cmidrule", "pC"),
];

/// The same for what follows `\begin{name}`.
const ENVIRONMENTS: &[(&str, &str)] = &[
    ("minipage", "oloL"),
    ("subfigure", "oL"),
    ("subtable", "oL"),
    ("wrapfigure", "nmlL"),
    ("wraptable", "nmlL"),
    ("multicols", "N"),
    ("tabular*", "L"),
    ("tabularx", "L"),
    ("tabulary", "L"),
    ("spacing", "F"),
    ("column", "L"),
];

/// Options that are numbers or lengths.
const KEYS: &[(&str, Kind)] = &[
    ("width", Kind::Length),
    ("height", Kind::Length),
    ("totalheight", Kind::Length),
    ("scale", Kind::Factor),
    ("angle", Kind::Factor),
    ("page", Kind::Number),
];

/// Primitives whose value is written right after them, without braces.
const BARE: &[(&str, Kind)] = &[
    ("hskip", Kind::Length),
    ("vskip", Kind::Length),
    ("kern", Kind::Length),
    ("mkern", Kind::Length),
    ("mskip", Kind::Length),
    ("raise", Kind::Length),
    ("lower", Kind::Length),
    ("penalty", Kind::Number),
];

/// Registers set with `=` (`\parindent=1em`).
const REGISTERS: &[(&str, Kind)] = &[
    ("parindent", Kind::Length),
    ("parskip", Kind::Length),
    ("baselineskip", Kind::Length),
    ("textwidth", Kind::Length),
    ("textheight", Kind::Length),
    ("columnsep", Kind::Length),
    ("tabcolsep", Kind::Length),
    ("arraycolsep", Kind::Length),
    ("fboxsep", Kind::Length),
    ("fboxrule", Kind::Length),
    ("hsize", Kind::Length),
    ("leftskip", Kind::Length),
    ("rightskip", Kind::Length),
    ("hangindent", Kind::Length),
    ("unitlength", Kind::Length),
    ("topmargin", Kind::Length),
    ("oddsidemargin", Kind::Length),
    ("evensidemargin", Kind::Length),
    ("headheight", Kind::Length),
    ("headsep", Kind::Length),
    ("footskip", Kind::Length),
    ("itemsep", Kind::Length),
    ("parsep", Kind::Length),
    ("topsep", Kind::Length),
    ("hoffset", Kind::Length),
    ("voffset", Kind::Length),
    ("marginparwidth", Kind::Length),
    ("extrarowheight", Kind::Length),
    ("arrayrulewidth", Kind::Length),
    ("tolerance", Kind::Number),
    ("hyphenpenalty", Kind::Number),
    ("widowpenalty", Kind::Number),
    ("clubpenalty", Kind::Number),
];

/// End (exclusive) of the group opened at `open` by `[` or `(`.
fn delimited_end(text: &str, open: usize, close: u8) -> Option<usize> {
    let b = text.as_bytes();
    let mut i = open + 1;
    while i < b.len() {
        match b[i] {
            b'\\' => i += 1,
            b'{' => i = group_end(text, i)?.saturating_sub(1),
            b'\n'
                if text[i + 1..]
                    .trim_start_matches([' ', '\t'])
                    .starts_with('\n') =>
            {
                return None;
            }
            c if c == close => return Some(i + 1),
            _ => {}
        }
        i += 1;
    }
    None
}

fn skip_spaces(text: &str, mut i: usize) -> usize {
    let b = text.as_bytes();
    while i < b.len() && matches!(b[i], b' ' | b'\t') {
        i += 1;
    }
    // One end of line is a space; a blank line ends the command.
    if i < b.len() && (b[i] == b'\n' || b[i] == b'\r') {
        let mut j = i + 1;
        if b[i] == b'\r' && b.get(j) == Some(&b'\n') {
            j += 1;
        }
        while j < b.len() && matches!(b[j], b' ' | b'\t') {
            j += 1;
        }
        if j < b.len() && !matches!(b[j], b'\n' | b'\r') {
            return j;
        }
    }
    i
}

/// The options of a `[key=value, …]` list (`inner` is inside the brackets)
/// that are numbers or lengths.
fn option_slots(text: &str, inner: Span, command: &str, out: &mut Vec<Slot>) {
    let b = text.as_bytes();
    let mut items: Vec<Span> = Vec::new();
    let (mut start, mut depth) = (inner.start, 0);
    for i in inner.clone() {
        match b[i] {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            b',' if depth == 0 => {
                items.push(start..i);
                start = i + 1;
            }
            _ => {}
        }
    }
    items.push(start..inner.end);
    static REST_OF_LENGTH: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^\s*\d+\s*(?:[a-z]{2}\b|\\)").unwrap());
    for (n, item) in items.iter().enumerate() {
        let Some(eq) = text[item.clone()].find('=') else {
            continue;
        };
        let key = text[item.start..item.start + eq].trim();
        let Some((_, kind)) = KEYS.iter().find(|(k, _)| *k == key) else {
            continue;
        };
        let value = item.start + eq + 1..item.end;
        let comma = items
            .get(n + 1)
            .filter(|next| REST_OF_LENGTH.is_match(&text[(*next).clone()]))
            .map(|_| item.end);
        out.push(Slot {
            shell: value.clone(),
            value,
            kind: *kind,
            owner: Owner::Key(key.to_owned(), command.to_owned()),
            comma,
        });
    }
}

/// The values of the arguments that follow a command, read with its
/// `pattern` from `from`. Returns where the arguments end.
fn argument_slots(
    text: &str,
    from: usize,
    pattern: &str,
    owner: &Owner,
    out: &mut Vec<Slot>,
) -> usize {
    let mut i = from;
    for arg in pattern.chars() {
        let start = skip_spaces(text, i);
        let rest = &text[start..];
        let optional = matches!(arg, 'o' | 'l' | 'n' | 'K' | 'p');
        let (inner, end) = if arg == 'p' {
            if !rest.starts_with('(') {
                continue;
            }
            match delimited_end(text, start, b')') {
                Some(end) => (start + 1..end - 1, end),
                None => return i,
            }
        } else if optional {
            if !rest.starts_with('[') {
                continue;
            }
            match delimited_end(text, start, b']') {
                Some(end) => (start + 1..end - 1, end),
                None => return i,
            }
        } else if rest.starts_with('{') {
            match group_end(text, start) {
                Some(end) => (start + 1..end - 1, end),
                None => return i,
            }
        } else if arg == 'm' && rest.starts_with('\\') {
            // `\setlength\parindent{…}`: a command name without braces.
            let n = rest[1..]
                .bytes()
                .take_while(|c| c.is_ascii_alphabetic() || *c == b'@')
                .count()
                .max(1);
            (start..start + 1 + n, start + 1 + n)
        } else {
            return i;
        };
        i = end;
        let kind = match arg {
            'L' | 'l' => Kind::Length,
            'N' | 'n' => Kind::Number,
            'F' => Kind::Factor,
            'A' => Kind::Auto,
            'S' => Kind::Size,
            'C' => Kind::Columns,
            'K' => {
                if let Owner::Command(c) = owner {
                    option_slots(text, inner, c, out);
                }
                continue;
            }
            _ => continue,
        };
        out.push(Slot {
            value: inner.clone(),
            shell: inner.start - 1..inner.end + 1,
            kind,
            owner: owner.clone(),
            comma: None,
        });
    }
    i
}

/// The widths of the `p{…}`, `m{…}` and `b{…}` columns of a specification.
fn column_slots(text: &str, spec: Span, out: &mut Vec<Slot>) {
    let b = text.as_bytes();
    let mut i = spec.start;
    while i < spec.end {
        match b[i] {
            b'@' | b'!' | b'>' | b'<' => {
                i = group_end(text, skip_spaces(text, i + 1)).unwrap_or(i + 1);
            }
            b'{' => i = group_end(text, i).unwrap_or(i + 1),
            c @ (b'p' | b'm' | b'b') => {
                let open = skip_spaces(text, i + 1);
                let Some(end) = group_end(text, open) else {
                    i += 1;
                    continue;
                };
                out.push(Slot {
                    value: open + 1..end - 1,
                    shell: i..end,
                    kind: Kind::Length,
                    owner: Owner::Column(c as char),
                    comma: None,
                });
                i = end;
            }
            _ => i += 1,
        }
    }
}

/// Every place of `region` (in the text without its comments) where a
/// command expects a number or a length, in the order of the text.
fn slots(text: &str, region: Span) -> Vec<Slot> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = region.start;
    while i < region.end {
        if b[i] != b'\\' {
            i += 1;
            continue;
        }
        if b.get(i + 1) == Some(&b'\\') {
            // `\\[1ex]`: the space after the line. TeX looks for the bracket
            // past the spaces and the end of the line.
            let mut j = i + 2;
            if b.get(j) == Some(&b'*') {
                j += 1;
            }
            let open = skip_spaces(text, j);
            if b.get(open) == Some(&b'[')
                && let Some(end) = delimited_end(text, open, b']')
            {
                out.push(Slot {
                    value: open + 1..end - 1,
                    shell: open..end,
                    kind: Kind::Length,
                    owner: Owner::LineBreak,
                    comma: None,
                });
            }
            i += 2;
            continue;
        }
        let len = text[i + 1..]
            .bytes()
            .take_while(|c| c.is_ascii_alphabetic() || *c == b'@')
            .count();
        if len == 0 {
            i += 2;
            continue;
        }
        let name = &text[i + 1..i + 1 + len];
        let mut after = i + 1 + len;
        if b.get(after) == Some(&b'*') {
            after += 1;
        }
        if name == "begin" {
            let open = skip_spaces(text, after);
            if let Some(end) = group_end(text, open) {
                let env = text[open + 1..end - 1].trim();
                if let Some((_, pattern)) = ENVIRONMENTS.iter().find(|(e, _)| *e == env) {
                    let owner = Owner::Environment(env.to_owned());
                    argument_slots(text, end, pattern, &owner, &mut out);
                }
            }
        } else if let Some((_, pattern)) = COMMANDS.iter().find(|(c, _)| *c == name) {
            let owner = Owner::Command(name.to_owned());
            argument_slots(text, after, pattern, &owner, &mut out);
        } else {
            let bare = BARE.iter().find(|(c, _)| *c == name);
            let register = REGISTERS.iter().find(|(c, _)| *c == name);
            let mut start = skip_spaces(text, after);
            let assigned = b.get(start) == Some(&b'=');
            if assigned {
                start = skip_spaces(text, start + 1);
            }
            let kind = match (bare, register) {
                (Some((_, k)), _) => Some(*k),
                (None, Some((_, k))) if assigned => Some(*k),
                _ => None,
            };
            // A value written as a word; a macro or a group is not read.
            let word = text[start..]
                .char_indices()
                .find(|(_, c)| c.is_whitespace() || matches!(c, '\\' | '{' | '}' | '$' | '&'))
                .map_or(text.len() - start, |(k, _)| k);
            if let Some(kind) = kind
                && word > 0
            {
                out.push(Slot {
                    value: start..start + word,
                    shell: start..start + word,
                    kind,
                    owner: Owner::Command(name.to_owned()),
                    comma: None,
                });
            }
        }
        i = after;
    }
    out
}

static READ_AGAIN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<to be read again>\s*\n\s*(\S+)").unwrap());

/// How a value is quoted in a sentence.
fn quote(value: &str) -> String {
    let flat: String = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let flat = flat.replace('`', "'");
    if flat.chars().count() > 40 {
        format!("{}…", flat.chars().take(40).collect::<String>())
    } else {
        flat
    }
}

/// What a kind of value is called, and how to say a text is not one.
fn expected(kind: Kind, lang: Lang) -> (&'static str, &'static str) {
    match kind {
        Kind::Length | Kind::Auto | Kind::Size => lang_pair(
            lang,
            (
                "une longueur (un nombre et une unité, comme `1cm`)",
                "n'en est pas une",
            ),
            ("a length (a number and a unit, like `1cm`)", "is not one"),
        ),
        Kind::Number => lang_pair(
            lang,
            ("un nombre entier", "n'en est pas un"),
            ("a whole number", "is not one"),
        ),
        Kind::Factor => lang_pair(
            lang,
            ("un nombre (comme `0.5`)", "n'en est pas un"),
            ("a number (like `0.5`)", "is not one"),
        ),
        Kind::Columns => lang_pair(
            lang,
            ("deux numéros de colonnes (comme `2-3`)", "n'en donne pas"),
            ("two column numbers (like `2-3`)", "does not give them"),
        ),
    }
}

fn lang_pair<T>(lang: Lang, fr: T, en: T) -> T {
    match lang {
        Lang::Fr => fr,
        Lang::En => en,
    }
}

/// A number written the way the language writes it (`575,83` or `575.83`).
fn decimal(value: f64, lang: Lang) -> String {
    let rounded = (value * 100.0).floor() / 100.0;
    let text = if rounded.fract() == 0.0 {
        format!("{rounded:.0}")
    } else {
        format!("{rounded:.2}")
    };
    match lang {
        Lang::Fr => text.replace('.', ","),
        Lang::En => text,
    }
}

/// Finds the number or the length of the line that explains `d`, moves
/// the diagnostic on it and says what is wrong with it.
pub(super) fn numbers(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Vec<Fix> {
    let Some(at) = at(d, s) else {
        return Vec::new();
    };
    let code = d.code.clone().unwrap_or_default();
    let src = at.src.clone();
    let text = mask(&src.text);
    let wanted = |v: &Verdict| match code.as_str() {
        "missing-number" => matches!(v, Verdict::Empty | Verdict::NotNumber),
        "illegal-unit" => matches!(v, Verdict::NoUnit(_) | Verdict::BadUnit(_)),
        "dimension-too-large" => matches!(v, Verdict::TooLarge(_, Some(_))),
        "number-too-big" => matches!(v, Verdict::TooLarge(_, None)),
        _ => false,
    };
    // At the `\\end` of an environment whose `\\begin` has the value at fault:
    // the environment reads it again there. It is the same mistake.
    let (line, _) = src.line(at.line);
    let point = at.point().clamp(line.start, line.end);
    if let Some(env) = src.index.environments.iter().find(|e| {
        e.end
            .as_ref()
            .is_some_and(|x| x.start < point && point <= x.end)
    }) && let Some((_, pattern)) = ENVIRONMENTS.iter().find(|(e, _)| *e == env.name)
    {
        let mut at_begin = Vec::new();
        let owner = Owner::Environment(env.name.clone());
        argument_slots(&text, env.begin.end, pattern, &owner, &mut at_begin);
        if at_begin
            .iter()
            .any(|slot| check(&text[slot.value.clone()], slot.kind) != Verdict::Fine)
        {
            d.code = Some(CONSEQUENCE.into());
            return Vec::new();
        }
    }
    // The first character TeX could not read, when the log gives it.
    let read_again = d
        .raw
        .as_deref()
        .and_then(|raw| READ_AGAIN.captures(raw))
        .map(|m| m[1].to_owned())
        .filter(|t| !t.starts_with('\\'))
        .and_then(|t| t.chars().next());
    let found = candidates(&src, &text, &at)
        .into_iter()
        .rev()
        .find_map(|slot| {
            let verdict = check(&text[slot.value.clone()], slot.kind);
            if !wanted(&verdict) {
                return None;
            }
            if verdict == Verdict::NotNumber
                && let Some(c) = read_again
                && !text[slot.value.clone()]
                    .trim_start_matches([' ', '+', '-'])
                    .starts_with(c)
            {
                return None;
            }
            Some((slot, verdict))
        });
    let Some((slot, verdict)) = found else {
        return unexplained(d, &src, &text, &at, &code, lang);
    };
    let value = &src.text[slot.value.clone()];
    let subject = slot.owner.subject(lang);
    let (what, is_not) = expected(slot.kind, lang);
    let attend = lang.pick("attend", "expects");
    let in_value = |span: &Span| slot.value.start + span.start..slot.value.start + span.end;
    match verdict {
        Verdict::Empty | Verdict::NotNumber if slot.owner == Owner::LineBreak => {
            place(d, &src, slot.shell.clone());
            d.advise(lang.pick(
                &format!(
                    "Le crochet qui suit `\\\\` est lu comme l'espace à ajouter après la ligne, et `{}` n'est pas une longueur. Si ce crochet fait partie du texte, écrivez `{{}}` devant lui.",
                    quote(value)
                ),
                &format!(
                    "The bracket that follows `\\\\` is read as the space to add after the line, and `{}` is not a length. If this bracket is part of the text, write `{{}}` before it.",
                    quote(value)
                ),
            ));
            edits(
                lang.pick("Écrire {} devant le crochet", "Write {} before the bracket")
                    .into(),
                vec![src.insert(slot.shell.start, "{}")],
            )
        }
        Verdict::Empty => {
            place(d, &src, slot.shell.clone());
            d.advise(format!(
                "{subject} {attend} {what}, {}",
                lang.pick("mais rien n'est écrit.", "but nothing is written.")
            ));
            Vec::new()
        }
        Verdict::NotNumber => {
            place(d, &src, trimmed(&src.text, slot.value.clone()));
            d.advise(format!(
                "{subject} {attend} {what}, {} `{}` {is_not}.",
                lang.pick("et", "and"),
                quote(value)
            ));
            Vec::new()
        }
        Verdict::NoUnit(number) => {
            let number = in_value(&number);
            let written = &src.text[number.clone()];
            if let Some(comma) = slot.comma {
                // `width=2,5cm`: the comma ends the option.
                let rest_end = src.text[comma + 1..]
                    .find([',', ']'])
                    .map_or(comma + 1, |k| comma + 1 + k);
                let rest = src.text[comma + 1..rest_end].trim();
                place(d, &src, number.start..rest_end);
                d.advise(lang.pick(
                    &format!(
                        "Dans une liste d'options, la virgule sépare les options : `{written},{rest}` est lu `{written}`, sans unité. Écrivez `{written}.{rest}`."
                    ),
                    &format!(
                        "In a list of options, the comma separates the options: `{written},{rest}` is read `{written}`, without unit. Write `{written}.{rest}`."
                    ),
                ));
                return edits(
                    format!("{} {written}.{rest}", lang.pick("Écrire", "Write")),
                    vec![src.edit(comma..comma + 1, ".")],
                );
            }
            place(d, &src, number.clone());
            d.advise(format!(
                "{subject} {attend} {}, {} `{written}` {}",
                lang.pick("une longueur", "a length"),
                lang.pick("et", "and"),
                lang.pick(
                    "n'a pas d'unité (`cm`, `mm`, `pt`, `em`…).",
                    "has no unit (`cm`, `mm`, `pt`, `em`…)."
                )
            ));
            add_unit(&src, number.end, lang)
        }
        Verdict::BadUnit(unit) => {
            let unit = in_value(&unit);
            let written = src.text[unit.clone()].to_owned();
            place(d, &src, unit);
            d.advise(lang.pick(
                &format!(
                    "`{written}` n'est pas une unité que TeX connaît (`pt`, `cm`, `mm`, `in`, `em`, `ex`…)."
                ),
                &format!(
                    "`{written}` is not a unit TeX knows (`pt`, `cm`, `mm`, `in`, `em`, `ex`…)."
                ),
            ));
            Vec::new()
        }
        Verdict::TooLarge(span, max) => {
            let span = in_value(&span);
            let written = src.text[span.clone()].to_owned();
            place(d, &src, span);
            d.advise(too_large(&written, max, lang));
            Vec::new()
        }
        Verdict::Fine => Vec::new(),
    }
}

fn trimmed(text: &str, span: Span) -> Span {
    let s = &text[span.clone()];
    let start = span.start + (s.len() - s.trim_start().len());
    let end = span.end - (s.len() - s.trim_end().len());
    if end > start { start..end } else { span }
}

fn too_large(written: &str, max: Option<(f64, &'static str)>, lang: Lang) -> String {
    match max {
        Some((max, unit)) => lang
            .pick(
                &format!(
                    "`{written}` dépasse la plus grande longueur que TeX accepte ({} {unit}).",
                    decimal(max, lang)
                ),
                &format!(
                    "`{written}` is larger than the largest length TeX accepts ({} {unit}).",
                    decimal(max, lang)
                ),
            )
            .to_owned(),
        None => lang
            .pick(
                &format!(
                    "`{written}` dépasse le plus grand nombre entier que TeX accepte (2 147 483 647)."
                ),
                &format!(
                    "`{written}` is larger than the largest whole number TeX accepts (2,147,483,647)."
                ),
            )
            .to_owned(),
    }
}

fn add_unit(src: &Src, end: usize, lang: Lang) -> Vec<Fix> {
    ["cm", "em", "pt"]
        .iter()
        .map(|u| Fix::Edits {
            title: format!("{} {u}", lang.pick("Ajouter l'unité", "Add the unit")),
            edits: vec![src.insert(end, *u)],
        })
        .collect()
}

/// The places to look at for a diagnostic at `at`: what the commands of its
/// line expect before the error point, the bracket of a `\\` that ends the
/// line before, and the column widths of the table it is in.
fn candidates(src: &Src, text: &str, at: &At) -> Vec<Slot> {
    let (line, _) = src.line(at.line);
    let point = at.point().clamp(line.start, line.end);
    let mut out = Vec::new();
    if let Some(env) = src.environment_at(point, TABULARS)
        && let Some(spec) = column_spec(src, env)
    {
        column_slots(text, spec, &mut out);
    }
    // `\\` at the end of the line before, its bracket at the start of this one.
    if text[line.start..point].trim_start().starts_with('[')
        && let Some(prev) = (0..at.line).rev().map(|l| src.line(l).0).next()
        && let Some(i) = text[prev.clone()]
            .trim_end()
            .strip_suffix("\\\\")
            .map(str::len)
    {
        out.extend(
            slots(text, prev.start + i..point)
                .into_iter()
                .filter(|s| s.owner == Owner::LineBreak),
        );
    }
    out.extend(
        slots(text, line.start..point)
            .into_iter()
            .filter(|s| s.value.start <= point),
    );
    out
}

static BIG_NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\d{10,}").unwrap());
static LENGTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\d+(?:[.,]\d+)?\s*(?:true)?(?:pt|pc|in|bp|cm|mm|dd|cc|sp)\b").unwrap()
});

/// No command of the line explains the message. A value written on the
/// line may still be beyond what TeX accepts; otherwise the command TeX
/// stopped after is shown, and nothing is said about the cause.
fn unexplained(
    d: &mut Diagnostic,
    src: &Src,
    text: &str,
    at: &At,
    code: &str,
    lang: Lang,
) -> Vec<Fix> {
    let (line, _) = src.line(at.line);
    let point = at.point().clamp(line.start, line.end);
    let before = &text[line.start..point];
    match code {
        "number-too-big" => {
            let big = BIG_NUMBER
                .find_iter(before)
                .filter(|m| m.as_str().parse::<u128>().map_or(true, |n| n > MAX_NUMBER))
                .last();
            if let Some(m) = big {
                let written = m.as_str().to_owned();
                place(d, src, line.start + m.start()..line.start + m.end());
                d.advise(too_large(&written, None, lang));
                return Vec::new();
            }
        }
        "dimension-too-large" => {
            let large =
                LENGTH
                    .find_iter(before)
                    .filter_map(|m| match check(m.as_str(), Kind::Length) {
                        Verdict::TooLarge(span, max) => {
                            Some((m.start() + span.start..m.start() + span.end, max))
                        }
                        _ => None,
                    });
            if let Some((span, max)) = large.last() {
                let span = line.start + span.start..line.start + span.end;
                let written = src.text[span.clone()].to_owned();
                place(d, src, span);
                d.advise(too_large(&written, max, lang));
                return Vec::new();
            }
        }
        "illegal-unit" => return unit_before(src, at, lang),
        _ => {}
    }
    // The whole command TeX stopped after, rather than its last brace.
    if before.ends_with(['}', ']'])
        && let Some(start) = command_start(text, line.start, point)
    {
        place(d, src, start..point);
    }
    Vec::new()
}

static NUMBER_BEFORE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(-?\d+(?:\.\d+)?)\s*\}?\s*$").unwrap());

/// A number right before the error point, in a command that is not known:
/// the unit is still what it lacks.
fn unit_before(src: &Src, at: &At, lang: Lang) -> Vec<Fix> {
    let (span, line) = src.line(at.line);
    let upto = &line[..at.point().clamp(span.start, span.end) - span.start];
    let Some(m) = NUMBER_BEFORE.captures(upto) else {
        return Vec::new();
    };
    add_unit(src, span.start + m.get(1).unwrap().end(), lang)
}

/// Start of the command whose arguments end at `end`: `\cmd[…]{…}{…}`.
fn command_start(text: &str, line_start: usize, end: usize) -> Option<usize> {
    let b = text.as_bytes();
    let mut i = end;
    loop {
        while i > line_start && matches!(b[i - 1], b' ' | b'\t') {
            i -= 1;
        }
        if i <= line_start {
            return None;
        }
        match b[i - 1] {
            b'}' => i = super::text::group_start(text, i - 1)?,
            b']' => i = line_start + text[line_start..i - 1].rfind('[')?,
            b'*' => i -= 1,
            c if c.is_ascii_alphabetic() || c == b'@' => {
                while i > line_start && (b[i - 1].is_ascii_alphabetic() || b[i - 1] == b'@') {
                    i -= 1;
                }
                return (i > line_start && b[i - 1] == b'\\').then(|| i - 1);
            }
            _ => return None,
        }
        if i < line_start {
            return None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_are_read_like_tex_reads_them() {
        use Kind::*;
        use Verdict::*;
        assert_eq!(check("1cm", Length), Fine);
        assert_eq!(check(" -2.5 em ", Length), Fine);
        assert_eq!(check("2,5cm", Length), Fine);
        assert_eq!(check("0.5\\linewidth", Length), Fine);
        assert_eq!(check("\\fill", Length), Fine);
        assert_eq!(check("1cm plus 2pt", Length), Fine);
        assert_eq!(check("10PT", Length), Fine);
        assert_eq!(check("1truecm", Length), Fine);
        assert_eq!(check("", Length), Empty);
        assert_eq!(check("  ", Number), Empty);
        assert_eq!(check("abc", Length), NotNumber);
        assert_eq!(check("deux", Number), NotNumber);
        assert_eq!(check("2", Length), NoUnit(0..1));
        assert_eq!(check(" 12.5 ", Length), NoUnit(1..5));
        assert_eq!(check("2", Size), Fine);
        assert_eq!(check("3 centimetres", Length), BadUnit(2..13));
        assert_eq!(check("3 c", Length), BadUnit(2..3));
        assert_eq!(check("*", Auto), Fine);
        assert_eq!(check("12", Number), Fine);
        assert_eq!(check("\\value{page}", Number), Fine);
        assert_eq!(check("99999999999", Number), TooLarge(0..11, None));
        assert_eq!(check("2147483647", Number), Fine);
        assert!(
            matches!(check("99999cm", Length), TooLarge(span, Some((_, "cm"))) if span == (0..7))
        );
        assert_eq!(check("575cm", Length), Fine);
        assert_eq!(check("2-3", Columns), Fine);
        assert_eq!(check("a-b", Columns), NotNumber);
    }

    fn found(text: &str) -> Vec<(String, Kind, Owner)> {
        slots(text, 0..text.len())
            .into_iter()
            .map(|s| (text[s.value].to_owned(), s.kind, s.owner))
            .collect()
    }

    #[test]
    fn the_numbers_of_a_line_are_found() {
        let cmd = |c: &str| Owner::Command(c.to_owned());
        assert_eq!(
            found("Avant.\\vspace{abc} Après."),
            [("abc".to_owned(), Kind::Length, cmd("vspace"))]
        );
        assert_eq!(
            found("\\rule[1pt]{abc}{2pt}"),
            [
                ("1pt".to_owned(), Kind::Length, cmd("rule")),
                ("abc".to_owned(), Kind::Length, cmd("rule")),
                ("2pt".to_owned(), Kind::Length, cmd("rule")),
            ]
        );
        assert_eq!(
            found("\\setlength\\parindent{1em}\\setcounter{page}{x}"),
            [
                ("1em".to_owned(), Kind::Length, cmd("setlength")),
                ("x".to_owned(), Kind::Number, cmd("setcounter")),
            ]
        );
        assert_eq!(
            found("\\begin{minipage}[t]{large}"),
            [(
                "large".to_owned(),
                Kind::Length,
                Owner::Environment("minipage".to_owned())
            )]
        );
        assert_eq!(
            found("\\includegraphics[width=large, angle=90]{a}"),
            [
                (
                    "large".to_owned(),
                    Kind::Length,
                    Owner::Key("width".to_owned(), "includegraphics".to_owned())
                ),
                (
                    "90".to_owned(),
                    Kind::Factor,
                    Owner::Key("angle".to_owned(), "includegraphics".to_owned())
                ),
            ]
        );
        assert_eq!(
            found("a & b \\\\ [note] c"),
            [("note".to_owned(), Kind::Length, Owner::LineBreak)]
        );
        assert_eq!(
            found("A\\kern abc B \\parindent=2 \\hskip\\parindent"),
            [
                ("abc".to_owned(), Kind::Length, cmd("kern")),
                ("2".to_owned(), Kind::Length, cmd("parindent")),
            ]
        );
        // A register that is read, not set.
        assert!(
            found("\\hspace{\\parindent} x")
                .iter()
                .all(|s| s.2 != cmd("parindent"))
        );
    }
}
