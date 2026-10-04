//! The cause of a compiler error, looked for in the source whatever the
//! message says.
//!
//! TeX reports where it stopped and what it expected next; its message
//! rarely names the mistake, and one mistake gives many messages. Here,
//! what is written at that place is checked against what LaTeX allows
//! there: the mode a command or an environment needs (text or formula), the
//! arguments its signature asks for, the values an argument takes, and the
//! structure around it (formulas, groups, environments, as the live checks
//! see them). What a command or an environment needs is asked to
//! [`super::known`]: the knowledge base, the definitions of the project and
//! the source of every package the document loads. So these rules hold for
//! the macros of the user and for any installed package, without anything
//! written here.
//!
//! A cause is only reported when the source shows it: the diagnostic is
//! then placed on the text to change and its advice says what is wrong.

use std::sync::LazyLock;

use regex::Regex;

use super::known::Learned;
use super::latex::{
    At, Sources, Src, advise, at, did_you_mean, edits, find_on_line, inside_display,
    percent_hides_brace, place,
};
use super::numeric::command_start;
use super::text::{closest, group_end, group_start, mask};
use crate::completion::hints::{argument_name, signature_groups};
use crate::completion::keys;
use crate::diagnostics::{Diagnostic, FileEdit, Fix, Hint};
use crate::i18n::Lang;
use crate::kb::{Mode, kb};
use crate::text::Span;

type Check = fn(&mut Diagnostic, &mut Sources<'_>, &Here<'_>) -> Option<Vec<Fix>>;

/// Looks for the cause of `d` in the sources. Returns its fixes; the cause
/// is said in the advice of the diagnostic, placed on the text at fault.
pub(super) fn explain(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Option<Vec<Fix>> {
    run(
        d,
        s,
        lang,
        &[
            unknown_name,
            unknown_key,
            key_value_misspelled,
            stored_text,
            in_collected_body,
            verb_unclosed,
            empty_script,
            left_right_across_cells,
            dollar_in_formula,
            display_closed_by_one_dollar,
            delimiter_expected,
            text_in_formula,
            text_command_in_formula,
            path_in_text,
            lost_dollar,
            call_at_point,
            group_closed_in_environment,
            float_in_box,
            nested_too_deep,
            environment_begin,
            blank_line_in_argument,
            structure,
            value_misspelled_elsewhere,
            named_by_the_message,
        ],
    )
}

/// The same for the messages that only tell how TeX went on (a `$`, a
/// brace or an `\endgroup` it added or met): what is wrong in the structure
/// of the paragraph is their cause, and is looked at first.
pub(super) fn explain_structure(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    run(
        d,
        s,
        lang,
        &[
            stored_text,
            in_collected_body,
            empty_script,
            left_right_across_cells,
            dollar_in_formula,
            display_closed_by_one_dollar,
            group_closed_in_environment,
            lost_dollar,
            structure,
            text_in_formula,
        ],
    )
}

/// An `\end{name}` that has no `\begin{name}`, a few lines below the place
/// TeX stopped at: what is written there is read outside the environment
/// it was meant for, and that is what TeX complains about.
pub(super) fn explain_missing_begin(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    run(d, s, lang, &[begin_missing])
}

fn begin_missing(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    use crate::syntax::ProblemKind as Kind;
    // The next `\end` without `\begin`, with no blank line in between.
    let (end, name) = h
        .src
        .index
        .problems
        .iter()
        .filter(|p| p.span.start >= h.line.start)
        .find_map(|p| match &p.kind {
            Kind::UnmatchedEnd(name) if name != "document" => Some((p.span.clone(), name)),
            _ => None,
        })?;
    let between = &h.text[h.line.start..end.start];
    if between.contains("\n\n") || between.matches('\n').count() > 40 {
        return None;
    }
    let line = h.at.line + 1;
    found(
        d,
        h,
        end,
        (
            &format!("`\\begin{{{name}}}` manquant"),
            &format!("`\\begin{{{name}}}` is missing"),
        ),
        (
            &format!(
                "Ce `\\end{{{name}}}` n'a pas de `\\begin{{{name}}}` : ce qui est écrit au-dessus (ligne {line}) est lu hors de l'environnement."
            ),
            &format!(
                "This `\\end{{{name}}}` has no `\\begin{{{name}}}`: what is written above (line {line}) is read outside the environment."
            ),
        ),
    );
    d.swallows = true;
    Some(Vec::new())
}

/// Verbatim text that is never ended takes the rest of the file with it:
/// whatever TeX reports after its `\begin` comes from there.
pub(super) fn explain_swallowed(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    run(d, s, lang, &[swallowed])
}

fn swallowed(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    use crate::syntax::ProblemKind as Kind;
    let span = h.src.index.problems.iter().find_map(|p| match &p.kind {
        Kind::UnclosedEnvironment(name) if crate::syntax::is_verbatim_environment(name) => {
            Some(p.span.clone())
        }
        _ => None,
    })?;
    if span.start > h.line.end {
        return None;
    }
    let live = crate::lint::structure(&h.src.path, &h.src.text, h.lang)
        .into_iter()
        .find(|p| p.range.is_some_and(|r| h.src.offset(r.start) == span.start))?;
    place(d, h.src, span);
    d.swallows = true;
    d.hint = Some(Hint {
        title: live.message,
        explanation: String::new(),
        advice: Some(
            h.fr_en(
                "TeX a lu jusqu'à la fin du fichier en cherchant ce qui ferme ceci.",
                "TeX read to the end of the file looking for what closes this.",
            )
            .to_owned(),
        ),
    });
    Some(live.fixes)
}

/// The line above ends with a command that lacks an argument: TeX takes
/// what this line starts with for it, and whatever it reports here comes
/// from there.
pub(super) fn explain_argument_above(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    run(d, s, lang, &[argument_above])
}

fn argument_above(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if h.at.line == 0 || h.text[h.line.clone()].trim_start().starts_with(['{', '[']) {
        return None;
    }
    let (above, written) = h.src.line(h.at.line - 1);
    let end = above.start + written.trim_end().len();
    let start = command_start(h.text, above.start, end)?;
    let call = read_call(h.text, &h.known, start)?;
    if call.environment || call.missing().is_none() || call.end != end {
        return None;
    }
    d.swallows = true;
    Some(missing_argument(d, h, &call, None))
}

/// The braces of the line TeX stopped at, when one of them closes nothing
/// or is never closed.
pub(super) fn explain_braces_of_the_line(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    run(d, s, lang, &[braces_of_the_line])
}

fn braces_of_the_line(d: &mut Diagnostic, s: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    use crate::syntax::ProblemKind as Kind;
    h.src
        .index
        .problems
        .iter()
        .any(|p| {
            matches!(p.kind, Kind::UnmatchedCloseBrace | Kind::UnclosedBrace)
                && h.line.start <= p.span.start
                && p.span.start <= h.line.end
        })
        .then(|| structure(d, s, h))
        .flatten()
}

/// A path written in text (`C:\Users\nom`): each of its `\` gives an unknown
/// command, and none of them is a misspelled name.
pub(super) fn explain_path(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    run(d, s, lang, &[path_in_text])
}

/// The cause of what LaTeX only warns about: a warning gives a line and no
/// place in it, so the whole line is read.
pub(super) fn explain_warning(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    run(d, s, lang, &[text_in_formula, text_command_in_formula])
}

/// Whether a message only tells how TeX went on.
pub(super) fn is_symptom(code: &str, message: &str) -> bool {
    matches!(
        code,
        "missing-dollar"
            | "display-math-end"
            | "bad-math-delimiter"
            | "math-accent"
            | "command-invalid-math"
            | "missing-brace"
            | "extra-brace"
            | "missing-open-brace"
            | "extra-endgroup"
    ) || (code.is_empty() && (message.starts_with("Missing \\") || message.starts_with("Extra \\")))
}

fn run(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang, checks: &[Check]) -> Option<Vec<Fix>> {
    let Some(at) = at(d, s) else {
        return unplaced(d, s, lang);
    };
    let src = at.src.clone();
    let text = mask(&src.text);
    let (line, _) = src.line(at.line);
    let here = Here {
        src: &src,
        text: &text,
        line: line.clone(),
        point: at.point().clamp(line.start, line.end),
        at: &at,
        lang,
        known: s.learned(),
    };
    checks.iter().find_map(|check| check(d, s, &here))
}

/// Names the mistake found: the title of the problem becomes the mistake
/// (the message of TeX, a symptom, stays shown under it), and its advice
/// says what is wrong with the text the problem is placed on.
fn found(d: &mut Diagnostic, h: &Here<'_>, span: Span, title: (&str, &str), advice: (&str, &str)) {
    place(d, h.src, span);
    d.hint = Some(Hint {
        title: h.fr_en(title.0, title.1).to_owned(),
        explanation: String::new(),
        advice: Some(h.fr_en(advice.0, advice.1).to_owned()),
    });
}

/// Where TeX stopped.
struct Here<'a> {
    src: &'a Src,
    /// The text of the file, comments blanked.
    text: &'a str,
    /// The line of the error.
    line: Span,
    /// The error point, in that line.
    point: usize,
    at: &'a At,
    lang: Lang,
    /// What the document can use: the knowledge base, its own definitions
    /// and those of the packages it loads.
    known: std::rc::Rc<Learned>,
}

impl Here<'_> {
    fn fr_en<'s>(&self, fr: &'s str, en: &'s str) -> &'s str {
        self.lang.pick(fr, en)
    }

    /// Whether `offset` is in a formula.
    fn in_math(&self, offset: usize) -> bool {
        self.src
            .index
            .math
            .iter()
            .any(|m| m.start <= offset && offset <= m.end)
            || inside_display(self.src, offset)
    }

    /// One-based line of `offset`.
    fn line_number(&self, offset: usize) -> usize {
        self.src.line_of(offset) + 1
    }
}

fn is_math_environment(name: &str) -> bool {
    crate::syntax::is_math_environment(name) || kb().environment(name, None).is_some_and(|e| e.math)
}

// ------------------------------------------------------------- names

static NO_COUNTER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"No counter '([^']+)' defined").unwrap());
static NO_LIBRARY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"I did not find the tikz library '([^']+)'").unwrap());
static NO_SHAPE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"No shape named `([^']+)' is known").unwrap());
static NEW_COUNTER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\new(?:counter|theorem)\*?\s*\{([^}]+)\}").unwrap());
static NODE_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:\\node|\\coordinate|\bnode|\bcoordinate)\s*(?:\[[^\]]*\])?\s*\(([^()]+)\)")
        .unwrap()
});

const COUNTERS: &[&str] = &[
    "part",
    "chapter",
    "section",
    "subsection",
    "subsubsection",
    "paragraph",
    "subparagraph",
    "page",
    "equation",
    "figure",
    "table",
    "footnote",
    "mpfootnote",
    "enumi",
    "enumii",
    "enumiii",
    "enumiv",
    "secnumdepth",
    "tocdepth",
];

/// A message that names something LaTeX does not know (a counter, a TikZ
/// library, a node): the name is shown where it is written, with the
/// closest name that exists.
fn unknown_name(d: &mut Diagnostic, s: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let message = d.message.clone();
    let (name, known): (String, Vec<String>) = if let Some(m) = NO_COUNTER.captures(&message) {
        let mut known: Vec<String> = COUNTERS.iter().map(|c| (*c).to_owned()).collect();
        for src in s.srcs() {
            known.extend(
                NEW_COUNTER
                    .captures_iter(&src.text)
                    .map(|c| c[1].to_owned()),
            );
        }
        (m[1].to_owned(), known)
    } else if let Some(m) = NO_LIBRARY.captures(&message) {
        (m[1].to_owned(), values_of("\\usetikzlibrary{1}"))
    } else {
        let m = NO_SHAPE.captures(&message)?;
        let picture = h
            .src
            .environment_at(h.point, &["tikzpicture"])
            .map_or(0..h.text.len(), |e| {
                e.begin.start..e.end.as_ref().map_or(h.text.len(), |x| x.end)
            });
        let known = NODE_NAME
            .captures_iter(&h.text[picture])
            .map(|c| c[1].trim().to_owned())
            .collect();
        (m[1].to_owned(), known)
    };
    let span = find_on_line(h.src, h.at.line, &name, Some(h.point))?;
    place(d, h.src, span.clone());
    let best = closest(&name, known.iter().map(String::as_str), 3).filter(|b| *b != name)?;
    did_you_mean(d, h.lang, best);
    Some(edits(
        format!(
            "{} {name} {} {best}",
            h.fr_en("Remplacer", "Replace"),
            h.fr_en("par", "with")
        ),
        vec![h.src.edit(span, best)],
    ))
}

static UNKNOWN_KEY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"Error: (\S+) undefined\.?$",
        r"|[`']([^'`]+)' undefined in famil",
        r"|The key '([^']+)' is unknown",
        r"|I do not know the key '([^']+)'",
        r"|Undefined key [`']([^']+)'",
        r"|Unknown key [`']([^']+)'",
        r"|Unknown option [`']([^']+)'",
    ))
    .unwrap()
});

/// A key (`name=value`) that what takes it does not know, whatever the
/// package that reads the keys (keyval, xkeyval, kvsetkeys, pgfkeys, the
/// keys of LaTeX3): it is shown where it is written, with the closest key
/// of the command or of the package that takes it.
fn unknown_key(d: &mut Diagnostic, s: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let message = d.message.clone();
    let m = UNKNOWN_KEY.captures(&message)?;
    let path = (1..m.len()).find_map(|i| m.get(i))?.as_str();
    // `/tikz/colr`, `siunitx/round-mod`: the key is the last part.
    let key = path.rsplit('/').next()?.trim_matches(['`', '\'', ' ']);
    if key.is_empty() || key.starts_with('\\') {
        return None;
    }
    let span = written_key(h, key)?;
    // The names of the keys: some are listed with a value (`version=4`).
    let mut known: Vec<String> = keys_taken_at(s, h, span.start)
        .iter()
        .map(|k| k.split('=').next().unwrap_or(k).trim().to_owned())
        .collect();
    known.sort_unstable();
    known.dedup();
    place(d, h.src, span.clone());
    let best = closest(key, known.iter().map(String::as_str), 2)?;
    did_you_mean(d, h.lang, best);
    Some(edits(
        format!(
            "{} {key} {} {best}",
            h.fr_en("Remplacer", "Replace"),
            h.fr_en("par", "with")
        ),
        vec![h.src.edit(span, best)],
    ))
}

/// Where `key` is written as a key, at or before the place TeX stopped: in
/// the list that ends there, which may start some lines above.
fn written_key(h: &Here<'_>, key: &str) -> Option<Span> {
    let start = paragraph_start(h.text, h.line.start);
    let region = &h.text[start..h.line.end];
    let whole = |i: usize| {
        let before = region[..i].trim_end().chars().next_back();
        let after = region[i + key.len()..].trim_start().chars().next();
        before.is_none_or(|c| matches!(c, '[' | '{' | ','))
            && after.is_none_or(|c| matches!(c, '=' | ',' | ']' | '}'))
    };
    let all: Vec<usize> = region
        .match_indices(key)
        .map(|(i, _)| i)
        .filter(|&i| whole(i))
        .collect();
    let point = h.point - start;
    let i = all
        .iter()
        .rev()
        .find(|&&i| i < point)
        .or(all.first())
        .copied()?;
    Some(start + i..start + i + key.len())
}

/// The keys known where one is written at `at`: those of the command or of
/// the environment whose argument it is in, or the options of the package
/// or the class it is given to. The knowledge base lists the usual ones;
/// the others are read in the source of the package.
fn keys_taken_at(s: &mut Sources<'_>, h: &Here<'_>, at: usize) -> Vec<String> {
    match key_owner(h, at) {
        Some(KeyOwner::Options { name, class }) => {
            let mut out = s.options_of(&name, class);
            for (index, set) in keys::sets().iter().enumerate() {
                if set.options_of.contains(&name) {
                    out.extend(set.keys.iter().map(|k| k.name.clone()));
                    out.extend(s.learned_keys(index));
                }
            }
            out
        }
        Some(KeyOwner::Sets(sets)) => {
            let mut out = Vec::new();
            for index in sets {
                out.extend(keys::sets()[index].keys.iter().map(|k| k.name.clone()));
                out.extend(s.learned_keys(index));
            }
            out
        }
        None => Vec::new(),
    }
}

/// What takes the keys of a list.
enum KeyOwner {
    /// `\usepackage[…]{name}`, `\documentclass[…]{name}`.
    Options { name: String, class: bool },
    /// A command or an environment: the key sets (of `keys.json`) that name it.
    Sets(Vec<usize>),
}

/// What takes the key written at `at`: the bracket or the brace it is in,
/// then what is written before it.
fn key_owner(h: &Here<'_>, at: usize) -> Option<KeyOwner> {
    let b = h.text.as_bytes();
    let mut depth = 0i32;
    let mut open = None;
    let floor = paragraph_start(h.text, h.line.start);
    for i in (floor..at).rev() {
        match b[i] {
            b']' | b'}' => depth += 1,
            b'[' | b'{' if depth == 0 => {
                open = Some(i);
                break;
            }
            b'[' | b'{' => depth -= 1,
            _ => {}
        }
    }
    let open = open?;
    let bracket = b[open] as char;
    let head = h.text[floor..open].trim_end();
    if let Some(command) = ["\\usepackage", "\\RequirePackage", "\\documentclass"]
        .iter()
        .find(|c| head.ends_with(*c))
    {
        let close = h.text[open..].find(']').map(|i| open + i + 1);
        let name = close
            .filter(|&c| b.get(c) == Some(&b'{'))
            .and_then(|c| group_end(h.text, c).map(|end| h.text[c + 1..end - 1].trim()))?;
        return Some(KeyOwner::Options {
            name: name.to_owned(),
            class: *command == "\\documentclass",
        });
    }
    // `\command[…]`, `\command{…}`, `\begin{name}[…]`: the sets that name
    // it, whatever the rank of the argument.
    static OWNER: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
            r"(?:\\begin\s*\{([^{}]+)\}|(\\[A-Za-z@]+)\*?)\s*(?:\[[^\]]*\]|\{[^{}]*\}|\([^)]*\))*$",
        )
        .unwrap()
    });
    let m = OWNER.captures(head)?;
    let owner = m.get(1).or(m.get(2)).map_or("", |x| x.as_str());
    let sets = keys::sets()
        .iter()
        .enumerate()
        .filter(|(_, set)| {
            set.targets.iter().any(|t| {
                t.strip_prefix(owner)
                    .is_some_and(|rest| rest.trim_start_matches('*').starts_with(bracket))
            })
        })
        .map(|(index, _)| index)
        .collect();
    Some(KeyOwner::Sets(sets))
}

static KEY_VALUE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"([A-Za-z][A-Za-z -]*?)\s*=\s*([^,\]\}=\s][^,\]\}]*)").unwrap());

/// A key whose values are listed (`language=`, `numbers=`, `backend=`),
/// written with a value close to one of them. The list of a key is not
/// always whole: a value is only called wrong where TeX stopped on the
/// list, and only for the one that looks like a known value.
fn key_value_misspelled(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let start = paragraph_start(h.text, h.line.start);
    let region = &h.text[start..h.line.end];
    let pairs: Vec<regex::Captures<'_>> = KEY_VALUE.captures_iter(region).collect();
    for pair in pairs.iter().rev() {
        let (key, value) = (pair.get(1)?, pair.get(2)?);
        let Some(KeyOwner::Sets(sets)) = key_owner(h, start + key.start()) else {
            continue;
        };
        let written = value.as_str().trim();
        let known: Vec<&str> = sets
            .iter()
            .flat_map(|&i| keys::sets()[i].keys.iter())
            .filter(|k| k.name == key.as_str().trim())
            .flat_map(|k| k.values.iter().map(|v| v.name()))
            .collect();
        if known.is_empty() || known.iter().any(|v| v.eq_ignore_ascii_case(written)) {
            continue;
        }
        // The values listed for a key are examples: only a plain word can
        // be read as another one typed wrong (`lfet` for `left`), not
        // something written on purpose (`(\roman*)`).
        let word = |v: &str| v.chars().all(|c| c.is_alphanumeric() || c == '-');
        let Some(best) =
            closest(written, known.iter().copied(), 2).filter(|best| word(written) && word(best))
        else {
            continue;
        };
        let at = start + value.start()..start + value.start() + written.len();
        let name = key.as_str().trim();
        found(
            d,
            h,
            at.clone(),
            ("Valeur inconnue", "Unknown value"),
            (
                &format!("`{name}` ne connaît pas `{written}`. Vouliez-vous écrire `{best}` ?"),
                &format!("`{name}` does not know `{written}`. Did you mean `{best}`?"),
            ),
        );
        return Some(edits(
            format!(
                "{} {written} {} {best}",
                h.fr_en("Remplacer", "Replace"),
                h.fr_en("par", "with")
            ),
            vec![h.src.edit(at, best)],
        ));
    }
    None
}

/// The values an argument takes, when the knowledge base lists them all
/// (`\pagestyle{1}`): a value that is not one of them is then a mistake.
fn values_of(target: &str) -> Vec<String> {
    keys::sets()
        .iter()
        .filter(|set| set.exact && set.targets.iter().any(|t| t == target))
        .flat_map(|set| set.keys.iter().map(|k| k.name.clone()))
        .collect()
}

// ----------------------------------------------------------- formulas

/// Commands whose argument is text again, inside a formula.
fn switches_to_text(name: &str) -> bool {
    name.starts_with("text")
        || matches!(
            name,
            "mbox"
                | "hbox"
                | "fbox"
                | "makebox"
                | "parbox"
                | "intertext"
                | "shortintertext"
                | "tag"
        )
}

/// `$` characters of `body` that open or close a formula (not `\$`, and
/// not inside the text of `\text{…}`).
fn dollars(text: &str, body: Span) -> Vec<usize> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = body.start;
    while i < body.end {
        match b[i] {
            b'\\' => {
                let len = text[i + 1..]
                    .bytes()
                    .take_while(u8::is_ascii_alphabetic)
                    .count();
                let name = &text[i + 1..i + 1 + len];
                let after = i + 1 + len.max(1);
                if len > 0
                    && switches_to_text(name)
                    && b.get(after) == Some(&b'{')
                    && let Some(end) = group_end(text, after)
                {
                    i = end;
                } else {
                    i = after;
                }
            }
            b'$' => {
                out.push(i);
                i += 1;
            }
            _ => i += 1,
        }
    }
    out
}

/// A `$` inside an environment or a `\[ … \]` that is a formula already.
fn dollar_in_formula(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let env = h
        .src
        .index
        .environments
        .iter()
        .filter(|e| is_math_environment(&e.name))
        .filter(|e| e.begin.start <= h.point && e.end.as_ref().is_none_or(|x| h.point <= x.end))
        .max_by_key(|e| e.begin.start);
    let (body, name) = match env {
        Some(e) => (
            e.begin.end..e.end.as_ref().map_or(h.line.end, |x| x.start),
            format!("`{}`", e.name),
        ),
        None => {
            let before = &h.text[..h.point];
            let open = before.rfind("\\[")?;
            if before.rfind("\\]").is_some_and(|close| close > open) {
                return None;
            }
            let close = h.text[h.point..]
                .find("\\]")
                .map_or(h.line.end, |i| h.point + i);
            (open + 2..close, "`\\[ … \\]`".to_owned())
        }
    };
    let all = dollars(h.text, body);
    let first = *all.first()?;
    // TeX stops at the first one, or right after it.
    if first > h.point {
        return None;
    }
    found(
        d,
        h,
        first..first + 1,
        ("`$` dans une formule", "`$` inside a formula"),
        (
            &format!("Ce `$` est dans {name}, qui est déjà une formule : il n'en faut pas ici."),
            &format!("This `$` is inside {name}, which is a formula already: none is needed here."),
        ),
    );
    Some(edits(
        h.fr_en("Retirer les $ de la formule", "Remove the $ of the formula")
            .into(),
        all.iter().map(|&i| h.src.edit(i..i + 1, "")).collect(),
    ))
}

/// Start of the paragraph that holds `offset`.
fn paragraph_start(text: &str, offset: usize) -> usize {
    let mut start = text[..offset].rfind('\n').map_or(0, |i| i + 1);
    while start > 0 {
        let prev = text[..start - 1].rfind('\n').map_or(0, |i| i + 1);
        if text[prev..start - 1].trim().is_empty() {
            break;
        }
        start = prev;
    }
    start
}

/// `$$ … $`: a formula opened with two dollars, closed with one. In a
/// line of text it is the `$$` that has a `$` too many; alone on its
/// lines, it is the `$` that lacks one.
fn display_closed_by_one_dollar(
    d: &mut Diagnostic,
    _: &mut Sources<'_>,
    h: &Here<'_>,
) -> Option<Vec<Fix>> {
    use crate::syntax::ProblemKind as Kind;
    let start = paragraph_start(h.text, h.line.start);
    // The `$$` of this paragraph the live checks find left open.
    let open = h
        .src
        .index
        .problems
        .iter()
        .filter(|p| matches!(p.kind, Kind::UnclosedMath) && &h.text[p.span.clone()] == "$$")
        .map(|p| p.span.start)
        .find(|&p| start <= p && p <= h.line.end)?;
    let (single, inline) = super::text::display_closed_by_one(h.text, open)?;
    let title = (
        "Formule `$$` fermée par un seul `$`",
        "`$$` formula closed by a single `$`",
    );
    if inline {
        found(
            d,
            h,
            open..open + 2,
            title,
            (
                "Cette formule est ouverte par `$$` et fermée par un seul `$` : dans une ligne de texte, une formule s'ouvre et se ferme par un seul `$`.",
                "This formula is opened with `$$` and closed by a single `$`: in a line of text, a formula is opened and closed by a single `$`.",
            ),
        );
    } else {
        let line = h.line_number(open);
        found(
            d,
            h,
            single..single + 1,
            title,
            (
                &format!(
                    "La formule ouverte par `$$` ligne {line} est fermée ici par un seul `$`."
                ),
                &format!(
                    "The formula opened with `$$` on line {line} is closed here by a single `$`."
                ),
            ),
        );
    }
    d.swallows = true;
    let one = edits(
        h.fr_en(
            "Ouvrir la formule avec un seul $",
            "Open the formula with a single $",
        )
        .into(),
        vec![h.src.edit(open..open + 2, "$")],
    );
    let two = edits(
        h.fr_en("Fermer la formule avec $$", "Close the formula with $$")
            .into(),
        vec![h.src.insert(single, "$")],
    );
    Some(if inline {
        one.into_iter().chain(two).collect()
    } else {
        two.into_iter().chain(one).collect()
    })
}

static SIZED_DELIMITER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\(left|right|middle|[bB]igg?[lrm]?)\b\s*(\\[A-Za-z]+|\\.|[^\s\\])?").unwrap()
});

const DELIMITER_COMMANDS: &[&str] = &[
    "\\{",
    "\\}",
    "\\|",
    "\\langle",
    "\\rangle",
    "\\lfloor",
    "\\rfloor",
    "\\lceil",
    "\\rceil",
    "\\lbrace",
    "\\rbrace",
    "\\lbrack",
    "\\rbrack",
    "\\lvert",
    "\\rvert",
    "\\lVert",
    "\\rVert",
    "\\vert",
    "\\Vert",
    "\\backslash",
    "\\uparrow",
    "\\downarrow",
    "\\updownarrow",
    "\\Uparrow",
    "\\Downarrow",
    "\\Updownarrow",
    "\\lgroup",
    "\\rgroup",
    "\\lmoustache",
    "\\rmoustache",
    "\\ulcorner",
    "\\urcorner",
    "\\llcorner",
    "\\lrcorner",
];

/// `\left`, `\right` or `\big…` followed by something that is not a
/// delimiter.
fn delimiter_expected(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if !d.message.contains("Missing delimiter") {
        return None;
    }
    let before = &h.text[h.line.start..h.line.end];
    let m = SIZED_DELIMITER
        .captures_iter(before)
        .filter(|m| m.get(0).unwrap().start() < h.point - h.line.start)
        .filter(|m| {
            m.get(2).is_none_or(|t| {
                let t = t.as_str();
                !(DELIMITER_COMMANDS.contains(&t) || "()[]|/.<>".contains(t))
            })
        })
        .last()?;
    let command = format!("\\{}", &m[1]);
    let token = m.get(2)?;
    found(
        d,
        h,
        h.line.start + token.start()..h.line.start + token.end(),
        ("Délimiteur attendu", "Delimiter expected"),
        (
            &format!(
                "`{command}` doit être suivi d'un délimiteur (`(`, `[`, `\\{{`, `|`, ou `.` pour aucun), et non de `{}`.",
                token.as_str()
            ),
            &format!(
                "`{command}` must be followed by a delimiter (`(`, `[`, `\\{{`, `|`, or `.` for none), not by `{}`.",
                token.as_str()
            ),
        ),
    );
    Some(Vec::new())
}

static INVALID_IN_MATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Command (\\\S+) invalid in math mode").unwrap());

/// A command of text that LaTeX refuses in a formula.
fn text_command_in_formula(
    d: &mut Diagnostic,
    _: &mut Sources<'_>,
    h: &Here<'_>,
) -> Option<Vec<Fix>> {
    let command = INVALID_IN_MATH.captures(&d.message)?[1].to_owned();
    let span = find_on_line(h.src, h.at.line, &command, Some(h.point))?;
    if !h.in_math(span.start) {
        return None;
    }
    found(
        d,
        h,
        span,
        (
            "Commande de texte dans une formule",
            "Text command in a formula",
        ),
        (
            &format!(
                "`{command}` ne fonctionne que dans du texte, et celui-ci est dans une formule."
            ),
            &format!("`{command}` only works in text, and this one is in a formula."),
        ),
    );
    Some(Vec::new())
}

// ------------------------------------------------ text in a formula

/// Letters with an accent: the accent of text LaTeX reads for them (`É` is
/// `\'E`), the accent of formulas, the letters and what they are without it.
const ACCENTS: &[(&str, &str, &str, &str)] = &[
    (
        "\\'",
        "\\acute",
        "áéíóúýÁÉÍÓÚÝćńśźĆŃŚŹ",
        "aeiouyAEIOUYcnszCNSZ",
    ),
    ("\\`", "\\grave", "àèìòùÀÈÌÒÙ", "aeiouAEIOU"),
    ("\\^", "\\hat", "âêîôûÂÊÎÔÛ", "aeiouAEIOU"),
    ("\\\"", "\\ddot", "äëïöüÿÄËÏÖÜŸ", "aeiouyAEIOUY"),
    ("\\~", "\\tilde", "ãñõÃÑÕ", "anoANO"),
    ("\\c", "", "çÇşŞţŢ", "cCsStT"),
    ("\\r", "\\mathring", "åÅůŮ", "aAuU"),
    ("\\v", "\\check", "čšžřěňďťČŠŽŘĚŇĎŤ", "cszrendtCSZRENDT"),
    ("\\k", "", "ąęĄĘ", "aeAE"),
    ("\\H", "", "őűŐŰ", "ouOU"),
    ("\\u", "\\breve", "ăğĂĞ", "agAG"),
    ("\\.", "\\dot", "żŻėĖ", "zZeE"),
    ("\\=", "\\bar", "āēīōūĀĒĪŌŪ", "aeiouAEIOU"),
];

/// Other characters of text: the command LaTeX reads for them and how they
/// are written in a formula, when they have a form there.
const TEXT_CHARACTERS: &[(char, &str, &str)] = &[
    ('ß', "\\ss", ""),
    ('æ', "\\ae", ""),
    ('Æ', "\\AE", ""),
    ('œ', "\\oe", ""),
    ('Œ', "\\OE", ""),
    ('ø', "\\o", ""),
    ('Ø', "\\O", ""),
    ('ł', "\\l", ""),
    ('Ł', "\\L", ""),
    ('°', "\\textdegree", "^\\circ"),
    ('€', "\\texteuro", ""),
    ('×', "\\texttimes", "\\times"),
    ('÷', "\\textdiv", "\\div"),
    ('±', "\\textpm", "\\pm"),
    ('µ', "\\textmu", "\\mu"),
    ('·', "\\textperiodcentered", "\\cdot"),
    ('¬', "\\textlnot", "\\neg"),
    ('¹', "\\textonesuperior", "^1"),
    ('²', "\\texttwosuperior", "^2"),
    ('³', "\\textthreesuperior", "^3"),
    ('…', "\\textellipsis", "\\dots"),
    ('£', "\\textsterling", "\\pounds"),
    ('§', "\\textsection", "\\S"),
    ('©', "\\textcopyright", ""),
    ('«', "\\guillemetleft", ""),
    ('»', "\\guillemetright", ""),
    ('–', "\\textendash", ""),
    ('—', "\\textemdash", ""),
];

/// Commands whose argument is not typeset as a formula: text, or a name.
fn not_formula(name: &str) -> bool {
    switches_to_text(name)
        || matches!(
            name,
            "label" | "ref" | "eqref" | "pageref" | "cref" | "Cref" | "cite" | "begin" | "end"
        )
}

/// A character or an accent of text written in a formula.
struct TextInFormula {
    span: Span,
    /// The command of text LaTeX reads there (`\'` for `é`), when known.
    command: Option<&'static str>,
    /// How it is written in a formula (`\acute{e}`), when it has a form there.
    math: Option<String>,
    /// An accent (not another character of text).
    accent: bool,
    /// Written as a command (`\'e`), not as a character.
    typed: bool,
}

/// The letter under an accent of formulas: `i` and `j` lose their dot.
fn under_accent(letter: &str) -> String {
    match letter {
        "i" => "\\imath".into(),
        "j" => "\\jmath".into(),
        other => other.to_owned(),
    }
}

/// What is text in the formulas of the line: characters with an accent,
/// characters of text, accents written as commands (`\'e`).
fn text_in_formulas(h: &Here<'_>) -> Vec<TextInFormula> {
    let line = &h.text[h.line.clone()];
    let b = h.text.as_bytes();
    // Arguments that are text again (`\text{…}`) or a name (`\label{…}`).
    let excluded: Vec<Span> = COMMAND
        .find_iter(line)
        .filter_map(|m| {
            let name = m.as_str()[1..].trim_end_matches('*');
            let after = h.line.start + m.end();
            (not_formula(name) && b.get(after) == Some(&b'{'))
                .then(|| group_end(h.text, after))
                .flatten()
                .map(|end| after..end)
        })
        .collect();
    let formula = |offset: usize| {
        h.in_math(offset) && !excluded.iter().any(|e| e.start <= offset && offset < e.end)
    };
    let mut out = Vec::new();
    let mut chars = line.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        let at = h.line.start + i;
        if c == '\\' {
            let Some(&(_, next)) = chars.peek() else {
                break;
            };
            chars.next();
            // `\'e`, `\c{c}`: the accent and the letter it is put on.
            let accent = ACCENTS.iter().find(|(command, ..)| {
                command[1..].starts_with(next)
                    && !(next.is_ascii_alphabetic()
                        && b.get(at + 2).is_some_and(u8::is_ascii_alphabetic))
            });
            let Some((command, math, ..)) = accent else {
                // A command: its name is not text.
                while next.is_ascii_alphabetic()
                    && chars.peek().is_some_and(|(_, c)| c.is_ascii_alphabetic())
                {
                    chars.next();
                }
                continue;
            };
            let open = skip_blank(h.text, at + 2);
            let (letter, end) = if b.get(open) == Some(&b'{') {
                match group_end(h.text, open) {
                    Some(end) => (h.text[open + 1..end - 1].trim().to_owned(), end),
                    None => continue,
                }
            } else {
                match h.text[open..].chars().next() {
                    Some(l) if l.is_alphabetic() => (l.to_string(), open + l.len_utf8()),
                    _ => continue,
                }
            };
            if !formula(at) || end > h.line.end {
                continue;
            }
            out.push(TextInFormula {
                span: at..end,
                command: Some(command),
                math: (!math.is_empty() && !letter.is_empty())
                    .then(|| format!("{math}{{{}}}", under_accent(&letter))),
                accent: true,
                typed: true,
            });
            while chars.peek().is_some_and(|(j, _)| h.line.start + j < end) {
                chars.next();
            }
            continue;
        }
        if c.is_ascii() || !formula(at) {
            continue;
        }
        let span = at..at + c.len_utf8();
        let accent = ACCENTS.iter().find_map(|(command, math, letters, bases)| {
            let n = letters.chars().position(|l| l == c)?;
            let base = bases.chars().nth(n)?.to_string();
            Some((*command, *math, base))
        });
        if let Some((command, math, base)) = accent {
            out.push(TextInFormula {
                span,
                command: Some(command),
                math: (!math.is_empty()).then(|| format!("{math}{{{}}}", under_accent(&base))),
                accent: true,
                typed: false,
            });
        } else if let Some((_, command, math)) = TEXT_CHARACTERS.iter().find(|(l, ..)| *l == c) {
            out.push(TextInFormula {
                span,
                command: Some(command),
                math: (!math.is_empty()).then(|| (*math).to_owned()),
                accent: false,
                typed: false,
            });
        } else if c.is_alphabetic() {
            out.push(TextInFormula {
                span,
                command: None,
                math: None,
                accent: false,
                typed: false,
            });
        }
    }
    out
}

/// The word (letters only) around `span`, when it is more than `span`.
fn word_around(text: &str, line: &Span, span: &Span) -> Option<Span> {
    let before = text[line.start..span.start]
        .chars()
        .rev()
        .take_while(|c| c.is_alphabetic())
        .map(char::len_utf8)
        .sum::<usize>();
    let after = text[span.end..line.end]
        .chars()
        .take_while(|c| c.is_alphabetic())
        .map(char::len_utf8)
        .sum::<usize>();
    let start = span.start - before;
    // Letters right after a `\` are the name of a command.
    let command = start > line.start && text.as_bytes()[start - 1] == b'\\';
    (before + after > 0 && !command).then(|| start..span.end + after)
}

/// A letter with an accent, a character of text or an accent of text, in a
/// formula: LaTeX reads a command of text there (`É` is `\'E`), warns that
/// it is "invalid in math mode", and the character is not typeset as one of
/// the formula.
fn text_in_formula(d: &mut Diagnostic, s: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let named = INVALID_IN_MATH
        .captures(&d.message)
        .map(|m| m[1].to_owned());
    if named.is_none() && d.code.as_deref() != Some("math-accent") {
        return None;
    }
    let all = text_in_formulas(h);
    // An error stops right after the character; a warning only gives the line.
    let error = d.severity == crate::diagnostics::Severity::Error;
    let reached: Vec<&TextInFormula> = all
        .iter()
        .filter(|c| !error || c.span.end <= h.point)
        .collect();
    let pick = |fits: &dyn Fn(&TextInFormula) -> bool| {
        let mut fitting = reached.iter().copied().filter(|c| fits(c));
        if error {
            fitting.last()
        } else {
            fitting.next()
        }
    };
    let found_one = match &named {
        Some(name) => pick(&|c| c.command == Some(name.as_str())).or_else(|| {
            // A character this table does not know, when nothing else on the
            // line can be what the message names.
            let written = find_on_line(h.src, h.at.line, name, None).is_some();
            (!written && reached.len() == 1 && reached[0].command.is_none()).then(|| reached[0])
        }),
        None => pick(&|c| c.accent),
    }?;
    let written = h.src.text[found_one.span.clone()].to_owned();
    let loaded = s.loaded();
    let text = if ["amsmath", "amstext", "mathtools"]
        .iter()
        .any(|p| loaded.contains(*p))
    {
        "\\text"
    } else {
        "\\textrm"
    };
    let word = (!found_one.typed)
        .then(|| word_around(h.text, &h.line, &found_one.span))
        .flatten();
    let replace = |span: Span, new: String| Fix::Edits {
        title: format!("{} {new}", h.fr_en("Écrire", "Write")),
        edits: vec![h.src.edit(span, new)],
    };
    let mut fixes = Vec::new();
    if let Some(word) = &word {
        let whole = h.src.text[word.clone()].to_owned();
        fixes.push(replace(word.clone(), format!("{text}{{{whole}}}")));
        let (title, fr, en) = if found_one.accent {
            (
                (
                    "Texte accentué dans une formule",
                    "Accented text in a formula",
                ),
                "une formule ne compose pas les lettres accentuées",
                "a formula does not typeset accented letters",
            )
        } else {
            (
                ("Texte dans une formule", "Text in a formula"),
                "une formule ne la compose pas",
                "a formula does not typeset it",
            )
        };
        found(
            d,
            h,
            word.clone(),
            title,
            (
                &format!(
                    "`{written}` est une lettre de texte : {fr}. Le mot `{whole}` se met dans `{text}{{…}}`."
                ),
                &format!(
                    "`{written}` is a letter of text: {en}. The word `{whole}` goes in `{text}{{…}}`."
                ),
            ),
        );
        return Some(fixes);
    }
    if let Some(math) = &found_one.math {
        fixes.push(replace(found_one.span.clone(), math.clone()));
    }
    if !found_one.typed {
        fixes.push(replace(
            found_one.span.clone(),
            format!("{text}{{{written}}}"),
        ));
    }
    let (fr, en) = match (&found_one.math, found_one.accent) {
        (Some(math), true) => (
            format!("Dans une formule, cet accent s'écrit `{math}`."),
            format!("In a formula, this accent is written `{math}`."),
        ),
        (Some(math), false) => (
            format!("Dans une formule, il s'écrit `{math}`."),
            format!("In a formula, it is written `{math}`."),
        ),
        (None, _) => (
            format!("Du texte se met dans `{text}{{…}}`."),
            format!("Text goes in `{text}{{…}}`."),
        ),
    };
    let (title, what) = if found_one.typed {
        (
            (
                "Accent de texte dans une formule",
                "Text accent in a formula",
            ),
            (
                format!(
                    "`{}` est un accent de texte : une formule ne le compose pas.",
                    found_one.command.unwrap_or_default()
                ),
                format!(
                    "`{}` is an accent of text: a formula does not typeset it.",
                    found_one.command.unwrap_or_default()
                ),
            ),
        )
    } else if found_one.accent {
        (
            (
                "Lettre accentuée dans une formule",
                "Accented letter in a formula",
            ),
            (
                format!(
                    "`{written}` est une lettre de texte : une formule ne compose pas les lettres accentuées."
                ),
                format!(
                    "`{written}` is a letter of text: a formula does not typeset accented letters."
                ),
            ),
        )
    } else {
        (
            (
                "Caractère de texte dans une formule",
                "Text character in a formula",
            ),
            (
                format!("`{written}` est un caractère de texte : une formule ne le compose pas."),
                format!("`{written}` is a character of text: a formula does not typeset it."),
            ),
        )
    };
    found(
        d,
        h,
        found_one.span.clone(),
        title,
        (&format!("{} {fr}", what.0), &format!("{} {en}", what.1)),
    );
    Some(fixes)
}

/// What `\maketitle` typesets is written before it, in `\title{…}`,
/// `\author{…}` and `\date{…}`: TeX reports a character it cannot read
/// there on the line of `\maketitle`.
fn stored_text(d: &mut Diagnostic, s: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if !h.text[h.line.start..h.point]
        .trim_end()
        .ends_with("\\maketitle")
    {
        return None;
    }
    let wanted: &[u8] = match d.code.as_deref() {
        Some("misplaced-alignment-tab") => b"&",
        Some("hash-in-text") => b"#",
        Some("missing-dollar") => b"_^",
        _ => return None,
    };
    let used = h.at.line + 1;
    for src in s.srcs() {
        let text = mask(&src.text);
        let b = text.as_bytes();
        for command in ["\\title", "\\author", "\\date"] {
            // `&` separates the authors: it has a meaning of its own there.
            if command == "\\author" && wanted == b"&" {
                continue;
            }
            for (start, _) in text.match_indices(command) {
                let mut open = start + command.len();
                if b.get(open) == Some(&b'[') {
                    open = text[open..].find(']').map_or(open, |i| open + i + 1);
                }
                if b.get(open) != Some(&b'{') {
                    continue;
                }
                let Some(end) = group_end(&text, open) else {
                    continue;
                };
                // The first of the characters, outside a formula.
                let (mut i, mut math, mut at) = (open + 1, false, None);
                while i < end - 1 {
                    match b[i] {
                        b'\\' => i += 1,
                        b'$' => math = !math,
                        c if !math && wanted.contains(&c) => {
                            at = Some(i);
                            break;
                        }
                        _ => {}
                    }
                    i += 1;
                }
                let Some(at) = at else { continue };
                let c = b[at] as char;
                let escaped = if c == '^' {
                    "\\^{}".to_owned()
                } else {
                    format!("\\{c}")
                };
                place(d, &src, at..at + 1);
                d.hint = Some(Hint {
                    title: h
                        .fr_en("Caractère spécial dans du texte", "Special character in text")
                        .to_owned(),
                    explanation: String::new(),
                    advice: Some(
                        h.fr_en(
                            &format!(
                                "Ce `{c}` est dans `{command}{{…}}`, que `\\maketitle` compose ligne {used} : dans du texte, il s'écrit `{escaped}`."
                            ),
                            &format!(
                                "This `{c}` is in `{command}{{…}}`, which `\\maketitle` typesets on line {used}: in text, it is written `{escaped}`."
                            ),
                        )
                        .to_owned(),
                    ),
                });
                return Some(edits(
                    format!("{} {escaped}", h.fr_en("Écrire", "Write")),
                    vec![src.edit(at..at + 1, escaped)],
                ));
            }
        }
    }
    None
}

/// `\verb|…` without its second `|` on the line.
fn verb_unclosed(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let name = if d.message.contains("\\verb ended by end of line") {
        "\\verb"
    } else if d.message.contains("lstinline ended by EOL") {
        "\\lstinline"
    } else {
        return None;
    };
    let line = &h.text[h.line.clone()];
    let start = line
        .match_indices(name)
        .map(|(i, _)| i)
        .filter(|&i| !line[i + name.len()..].starts_with(|c: char| c.is_ascii_alphabetic()))
        .last()?;
    let mut after = start + name.len();
    if line[after..].starts_with('*') {
        after += 1;
    }
    let delimiter = line[after..].chars().next()?;
    if line[after + delimiter.len_utf8()..].contains(delimiter) {
        return None;
    }
    found(
        d,
        h,
        h.line.start + start..h.line.start + line.trim_end().len(),
        (
            &format!("`{name}` jamais fermé"),
            &format!("`{name}` never closed"),
        ),
        (
            &format!(
                "Ce `{name}{delimiter}` s'arrête au `{delimiter}` suivant, et il n'y en a pas d'autre sur la ligne."
            ),
            &format!(
                "This `{name}{delimiter}` stops at the next `{delimiter}`, and there is no other one on the line."
            ),
        ),
    );
    Some(Vec::new())
}

/// Environments that read their whole body before typesetting it: TeX
/// reports what is wrong in the body on the line of their `\end`.
const COLLECTED: &[&str] = &[
    "frame",
    "tabularx",
    "tabular*",
    "tcolorbox",
    "align",
    "gather",
];

/// `_` or `^` in the text of an environment that collects its body (a
/// `frame` of beamer): the error is reported at its `\end`, far from the
/// character.
fn in_collected_body(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if d.code.as_deref() != Some("missing-dollar") {
        return None;
    }
    let env = h
        .src
        .index
        .environments
        .iter()
        .filter(|e| COLLECTED.contains(&e.name.as_str()) && !is_math_environment(&e.name))
        .find(|e| {
            e.end
                .as_ref()
                .is_some_and(|end| h.src.line_of(end.start) == h.at.line && end.end <= h.point)
        })?;
    let body = env.begin.end..env.end.as_ref()?.start;
    // The formulas written with environments are left out.
    let token = (body.start..body.end)
        .filter(|&i| matches!(h.text.as_bytes()[i], b'_' | b'^'))
        .find(|&i| !h.in_math(i) && h.text.as_bytes()[i - 1] != b'\\')?;
    let written = h.src.text[token..token + 1].to_owned();
    let used = h.at.line + 1;
    // One `$` too few in its paragraph.
    let alone = h
        .src
        .index
        .problems
        .iter()
        .filter(|p| {
            matches!(p.kind, crate::syntax::ProblemKind::UnclosedMath)
                && &h.text[p.span.clone()] == "$"
        })
        .map(|p| p.span.start)
        .find(|&p| {
            body.start <= p && p < body.end && !has_blank_line(&h.text[token.min(p)..token.max(p)])
        });
    if let Some(last) = alone {
        if let Some(fixes) = explain_lost_dollar(d, h, last) {
            return Some(fixes);
        }
        // It is in the formula that `$` opens and nothing closes.
        if last < token {
            let live = crate::lint::structure(&h.src.path, &h.src.text, h.lang)
                .into_iter()
                .find(|p| p.range.is_some_and(|r| h.src.offset(r.start) == last));
            found(
                d,
                h,
                last..last + 1,
                ("Formule jamais fermée", "Formula never closed"),
                (
                    "La formule ouverte par ce `$` n'est pas refermée avant la fin du paragraphe.",
                    "The formula opened by this `$` is not closed before the end of the paragraph.",
                ),
            );
            d.swallows = true;
            return Some(live.map(|p| p.fixes).unwrap_or_default());
        }
    }
    found(
        d,
        h,
        token..token + 1,
        (
            "Élément de formule dans du texte",
            "Something of formulas in text",
        ),
        (
            &format!(
                "`{written}` n'existe que dans une formule, et celui-ci est dans le texte de `{}` (TeX ne le signale qu'à son `\\end`, ligne {used}).",
                env.name
            ),
            &format!(
                "`{written}` only exists in a formula, and this one is in the text of `{}` (TeX only reports it at its `\\end`, line {used}).",
                env.name
            ),
        ),
    );
    let line = h.src.line(h.src.line_of(token)).0;
    Some(super::latex::script_fixes(
        h.src,
        &line,
        token + 1,
        &h.known,
        h.lang,
    ))
}

/// `_` or `^` with nothing after it (`$x_$`).
fn empty_script(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if d.code.as_deref() != Some("missing-open-brace") {
        return None;
    }
    let before = h.text[h.line.start..h.point].trim_end();
    let before = before
        .strip_suffix("$$")
        .or_else(|| before.strip_suffix('$'))
        .or_else(|| before.strip_suffix('}'))
        .or_else(|| before.strip_suffix("\\]"))
        .unwrap_or(before)
        .trim_end();
    let script = before
        .chars()
        .next_back()
        .filter(|c| matches!(c, '_' | '^'))?;
    let at = h.line.start + before.len() - 1;
    let (fr, en) = if script == '_' {
        ("indice", "subscript")
    } else {
        ("exposant", "superscript")
    };
    found(
        d,
        h,
        at..at + 1,
        (
            &format!("{} vide", if script == '_' { "Indice" } else { "Exposant" }),
            &format!("Empty {en}"),
        ),
        (
            &format!("Ce `{script}` n'est suivi de rien : un {fr} s'écrit `{script}{{…}}`."),
            &format!("Nothing follows this `{script}`: a {en} is written `{script}{{…}}`."),
        ),
    );
    Some(Vec::new())
}

static QUOTED_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[`']([^'`\s]{2,})'").unwrap());

/// What a package names in its message, shown where it is written on the
/// line. Nothing is said of the cause: only the place is known.
fn named_by_the_message(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if !d.message.contains(" Error: ") {
        return None;
    }
    let message = d.message.clone();
    let name = &QUOTED_NAME.captures(&message)?[1];
    let span = find_on_line(h.src, h.at.line, name, Some(h.point))?;
    place(d, h.src, span);
    None
}

/// Environments whose body is made of cells (`&`) and rows (`\\`): each
/// cell is a group of its own.
const CELLS: &[&str] = &[
    "align",
    "alignat",
    "aligned",
    "alignedat",
    "flalign",
    "gather",
    "gathered",
    "multline",
    "split",
    "eqnarray",
    "array",
    "cases",
    "matrix",
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix",
];

/// `\left` in one cell of an alignment and its `\right` in another: each
/// cell is a group, and the pair must be whole in it.
fn left_right_across_cells(
    d: &mut Diagnostic,
    _: &mut Sources<'_>,
    h: &Here<'_>,
) -> Option<Vec<Fix>> {
    if !d.message.contains("\\right") && !d.message.contains("\\left") {
        return None;
    }
    let env = h
        .src
        .index
        .environments
        .iter()
        .filter(|e| CELLS.contains(&e.name.trim_end_matches('*')))
        .filter(|e| e.begin.start <= h.point && e.end.as_ref().is_none_or(|x| h.point <= x.end))
        .max_by_key(|e| e.begin.start)?;
    let body = env.begin.end..env.end.as_ref().map_or(h.text.len(), |e| e.start);
    // The cells: between `&` and `\\`.
    let b = h.text.as_bytes();
    let mut cells: Vec<Span> = Vec::new();
    let (mut start, mut i) = (body.start, body.start);
    while i < body.end {
        match b[i] {
            b'\\' if b.get(i + 1) == Some(&b'\\') => {
                cells.push(start..i);
                i += 2;
                start = i;
            }
            b'\\' => i += 2,
            b'&' => {
                cells.push(start..i);
                i += 1;
                start = i;
            }
            _ => i += 1,
        }
    }
    cells.push(start..body.end);
    let whole = |cell: &Span, name: &str| -> Vec<usize> {
        h.text[cell.clone()]
            .match_indices(name)
            .map(|(k, _)| cell.start + k)
            .filter(|&k| !h.text[k + name.len()..].starts_with(|c: char| c.is_ascii_alphabetic()))
            .collect()
    };
    let (n, lefts) = cells
        .iter()
        .enumerate()
        .map(|(n, cell)| (n, whole(cell, "\\left"), whole(cell, "\\right")))
        .find(|(_, lefts, rights)| lefts.len() > rights.len())
        .map(|(n, lefts, _)| (n, lefts))?;
    // The cell where the pair is closed: the next one with a `\right` more.
    let closing = cells[n + 1..]
        .iter()
        .find(|cell| whole(cell, "\\right").len() > whole(cell, "\\left").len())?;
    let left = *lefts.last()?;
    found(
        d,
        h,
        left..left + "\\left".len(),
        (
            "`\\left` et `\\right` dans deux cases",
            "`\\left` and `\\right` in two cells",
        ),
        (
            "Ce `\\left` et son `\\right` ne sont pas dans la même case : dans un alignement, chaque case (entre `&` et `\\\\`) est un groupe à part. `\\right.` ferme la paire sans rien tracer, et `\\left.` la rouvre.",
            "This `\\left` and its `\\right` are not in the same cell: in an alignment, each cell (between `&` and `\\\\`) is a group of its own. `\\right.` closes the pair without drawing anything, and `\\left.` opens it again.",
        ),
    );
    // The pair left open makes TeX misread what follows.
    d.swallows = true;
    let end = cells[n].start + h.text[cells[n].clone()].trim_end().len();
    let begin = closing.start
        + (h.text[closing.clone()].len() - h.text[closing.clone()].trim_start().len());
    Some(edits(
        h.fr_en(
            "Fermer avec \\right. et rouvrir avec \\left.",
            "Close with \\right. and open again with \\left.",
        )
        .into(),
        vec![
            h.src.insert(end, " \\right."),
            h.src.insert(begin, "\\left. "),
        ],
    ))
}

/// What is read as it is written, and cannot be in a frame of beamer that
/// is read in one piece.
const VERBATIM: &[&str] = &[
    "\\begin{verbatim}",
    "\\begin{Verbatim}",
    "\\begin{lstlisting}",
    "\\begin{minted}",
    "\\verb",
    "\\lstinline",
    "\\mintinline",
];

/// In beamer, a frame that holds verbatim text needs the `fragile` option:
/// without it TeX reads to the end of the file looking for the end of the
/// verbatim text.
pub(super) fn fragile_frame(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    lang: Lang,
) -> Option<Vec<Fix>> {
    if !matches!(
        d.code.as_deref(),
        Some("file-ended" | "runaway-argument" | "paragraph-ended" | "verb-in-argument")
    ) || s.document_class().as_deref() != Some("beamer")
    {
        return None;
    }
    for src in s.srcs() {
        for env in src.index.environments.iter().filter(|e| e.name == "frame") {
            let Some(end) = &env.end else { continue };
            let body = &src.text[env.begin.end..end.start];
            let Some(what) = VERBATIM.iter().find(|v| body.contains(*v)) else {
                continue;
            };
            // `\begin{frame}<overlay>[options]{title}`.
            let mut i = body.len() - body.trim_start_matches([' ', '\t']).len();
            if body[i..].starts_with('<') {
                i += body[i..].find('>').map_or(0, |k| k + 1);
            }
            let options = body[i..]
                .starts_with('[')
                .then(|| body[i..].find(']').map(|k| &body[i + 1..i + k]))
                .flatten();
            if options.is_some_and(|o| o.contains("fragile")) {
                continue;
            }
            place(d, &src, env.begin.clone());
            d.hint = Some(Hint {
                title: lang
                    .pick(
                        "Frame sans l'option fragile",
                        "Frame without the fragile option",
                    )
                    .to_owned(),
                explanation: String::new(),
                advice: Some(
                    lang.pick(
                        &format!(
                            "Ce `frame` contient `{what}` : dans beamer, un frame qui contient du texte verbatim demande l'option `[fragile]`."
                        ),
                        &format!(
                            "This `frame` holds `{what}`: in beamer, a frame that holds verbatim text needs the `[fragile]` option."
                        ),
                    )
                    .to_owned(),
                ),
            });
            let at = env.begin.end + i;
            let edit = match options {
                Some(_) => src.insert(at + 1, "fragile,"),
                None => src.insert(at, "[fragile]"),
            };
            return Some(edits(
                lang.pick("Ajouter l'option [fragile]", "Add the [fragile] option")
                    .into(),
                vec![edit],
            ));
        }
    }
    None
}

/// What the source leaves open (an environment, a brace, a formula), for an
/// error TeX reports at the end of the file, without a place.
fn left_open(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Option<Vec<Fix>> {
    use crate::syntax::ProblemKind as Kind;
    for src in s.srcs() {
        // TeX names what it was reading: verbatim text, the body of a frame,
        // the argument of a command. What is left open must be that.
        let reading_verbatim = d.message.contains("verbatim");
        let reading_frame = d.message.contains("beamer@");
        let Some(problem) = src.index.problems.iter().find(|p| match &p.kind {
            Kind::UnclosedEnvironment(n) if reading_verbatim => {
                n.to_ascii_lowercase().contains("verbatim")
            }
            Kind::UnclosedEnvironment(n) if reading_frame => n == "frame",
            Kind::UnclosedEnvironment(n) => n != "document" && d.message.contains(n.as_str()),
            Kind::UnclosedBrace | Kind::UnclosedMath => !reading_verbatim && !reading_frame,
            _ => false,
        }) else {
            continue;
        };
        let span = problem.span.clone();
        let live = crate::lint::structure(&src.path, &src.text, lang)
            .into_iter()
            .find(|p| p.range.is_some_and(|r| src.offset(r.start) == span.start))?;
        place(d, &src, span);
        d.swallows = true;
        d.hint = Some(Hint {
            title: live.message,
            explanation: String::new(),
            advice: Some(
                lang.pick(
                    "TeX a lu jusqu'à la fin du fichier en cherchant ce qui ferme ceci.",
                    "TeX read to the end of the file looking for what closes this.",
                )
                .to_owned(),
            ),
        });
        return Some(live.fixes);
    }
    None
}

static SCANNED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:scanning use of|before) \\@*([A-Za-z]+)").unwrap());

/// The `[` of an optional argument that no `]` closes (`\item[a) texte`),
/// for the command TeX names when it reaches the end of the file.
fn unclosed_bracket(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Option<Vec<Fix>> {
    let name = SCANNED.captures(&d.message)?[1].to_owned();
    let call = format!("\\{name}[");
    for src in s.srcs() {
        let text = mask(&src.text);
        for (start, _) in text.match_indices(&call) {
            let open = start + call.len() - 1;
            let end = text[open..].find("\n\n").map_or(text.len(), |i| open + i);
            if text[open..end].contains(']') {
                continue;
            }
            place(d, &src, open..open + 1);
            d.swallows = true;
            d.hint = Some(Hint {
                title: lang
                    .pick("Crochet jamais fermé", "Bracket never closed")
                    .to_owned(),
                explanation: String::new(),
                advice: Some(
                    lang.pick(
                        &format!(
                            "Ce `[` ouvre l'argument optionnel de `\\{name}`, et aucun `]` ne le ferme."
                        ),
                        &format!(
                            "This `[` opens the optional argument of `\\{name}`, and no `]` closes it."
                        ),
                    )
                    .to_owned(),
                ),
            });
            return Some(Vec::new());
        }
    }
    None
}

/// A path of Windows written in text: its `\` are read as commands.
fn path_in_text(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if d.code.as_deref() != Some("undefined-control-sequence") {
        return None;
    }
    let token = h.at.token.clone();
    let b = h.text.as_bytes();
    if b.get(token.start) != Some(&b'\\') || token.start == h.line.start {
        return None;
    }
    let glued = b[token.start - 1].is_ascii_alphanumeric() || b[token.start - 1] == b':';
    // The word around the command: no space in it, at least two `\`.
    let start = h.text[h.line.start..token.start]
        .rfind(char::is_whitespace)
        .map_or(h.line.start, |i| h.line.start + i + 1);
    let end = h.text[token.start..h.line.end]
        .find(char::is_whitespace)
        .map_or(h.line.end, |i| token.start + i);
    let word = h.src.text[start..end].to_owned();
    if !glued || word.matches('\\').count() < 2 || word.contains(['{', '}', '$']) {
        return None;
    }
    found(
        d,
        h,
        start..end,
        ("Chemin écrit dans le texte", "Path written in text"),
        (
            &format!(
                "`{word}` est un chemin : LaTeX lit chacun de ses `\\` comme le début d'une commande."
            ),
            &format!("`{word}` is a path: LaTeX reads each of its `\\` as the start of a command."),
        ),
    );
    Some(edits(
        h.fr_en(
            "Écrire le chemin tel quel (\\texttt{\\detokenize{…}})",
            "Write the path as it is (\\texttt{\\detokenize{…}})",
        )
        .into(),
        vec![
            h.src
                .edit(start..end, format!("\\texttt{{\\detokenize{{{word}}}}}")),
        ],
    ))
}

// ------------------------------------------------- commands and arguments

/// A command or `\begin{name}` with the arguments written after it, read
/// with its signature of the knowledge base.
struct Call {
    /// `\frac` or `\begin{tabular}`.
    head: String,
    /// How the knowledge base names its arguments (`tabular` for an
    /// environment, `\frac` for a command).
    target: String,
    start: usize,
    /// End of the head.
    head_end: usize,
    /// The arguments of the signature: optional or not, their name, and
    /// what is written for each (inside the braces).
    args: Vec<(bool, String, Option<Span>)>,
    /// End of what is written.
    end: usize,
    mode: Mode,
    /// Whether an environment opens a formula.
    math: bool,
    environment: bool,
    /// For a macro of the project that needs a formula: the command of its
    /// definition that does.
    because: Option<String>,
}

fn read_call(text: &str, known: &Learned, start: usize) -> Option<Call> {
    let b = text.as_bytes();
    let len = text[start + 1..]
        .bytes()
        .take_while(|c| c.is_ascii_alphabetic() || *c == b'@')
        .count();
    if b.get(start) != Some(&b'\\') || len == 0 {
        return None;
    }
    let name = &text[start + 1..start + 1 + len];
    let mut i = start + 1 + len;
    if b.get(i) == Some(&b'*') {
        i += 1;
    }
    let (head, target, found, environment) = if name == "begin" {
        let open = skip_blank(text, i);
        let end = group_end(text, open)?;
        let env = text[open + 1..end - 1].trim().to_owned();
        let found = known.environment(&env)?;
        i = end;
        (format!("\\begin{{{env}}}"), env, found, true)
    } else {
        let found = known.command(name)?;
        (format!("\\{name}"), format!("\\{name}"), found, false)
    };
    // Arguments that cannot be told are not looked at.
    let signature = found.args.clone().unwrap_or_default();
    let (mode, math) = (found.mode, found.math);
    let head_end = i;
    let mut args = Vec::new();
    let mut complete = true;
    for (open, param) in signature_groups(&signature) {
        let optional = open == '[';
        if open == '<' {
            continue;
        }
        let at = skip_blank(text, i);
        let written = if !complete {
            None
        } else if optional {
            (b.get(at) == Some(&b'['))
                .then(|| text[at..].find(']').map(|e| at + 1..at + e))
                .flatten()
        } else if b.get(at) == Some(&b'{') {
            group_end(text, at).map(|e| at + 1..e - 1)
        } else {
            complete = false;
            None
        };
        if let Some(span) = &written {
            i = span.end + 1;
        }
        args.push((optional, param, written));
    }
    Some(Call {
        head,
        target,
        start,
        head_end,
        args,
        end: i,
        mode,
        math,
        environment,
        because: found.because,
    })
}

/// After spaces and one end of line.
fn skip_blank(text: &str, mut i: usize) -> usize {
    let b = text.as_bytes();
    let mut newline = false;
    while i < b.len() {
        match b[i] {
            b' ' | b'\t' | b'\r' => i += 1,
            b'\n' if !newline => {
                newline = true;
                i += 1;
            }
            _ => break,
        }
    }
    i
}

/// Whether what follows `i` ends the place where an argument could be.
fn nothing_follows(text: &str, i: usize) -> bool {
    let i = skip_blank(text, i);
    let rest = &text[i..];
    rest.is_empty()
        || rest.starts_with('\n')
        || ["}", "$", "\\\\", "&", "\\end", "\\]", "\\)", "]", "\\item"]
            .iter()
            .any(|c| rest.starts_with(c))
}

/// The name of an argument in the language of the user: `{largeur}`.
fn shown_name(target: &str, position: usize, name: &str, optional: bool, lang: Lang) -> String {
    let key = if optional {
        format!("{target}[{position}]")
    } else {
        format!("{target}{{{position}}}")
    };
    let (local, _) = argument_name(&key, name, lang);
    // An argument read in a definition has no name.
    let local = if local.is_empty() {
        "…".to_owned()
    } else {
        local
    };
    if optional {
        format!("[{local}]")
    } else {
        format!("{{{local}}}")
    }
}

impl Call {
    /// The first mandatory argument that is not written, with its position
    /// among the mandatory ones.
    fn missing(&self) -> Option<(usize, &str)> {
        self.args
            .iter()
            .filter(|(optional, _, _)| !optional)
            .enumerate()
            .find(|(_, (_, _, written))| written.is_none())
            .map(|(i, (_, name, _))| (i + 1, name.as_str()))
    }

    fn mandatory(&self) -> usize {
        self.args
            .iter()
            .filter(|(optional, _, _)| !optional)
            .count()
    }

    /// The signature with the names of the user's language.
    fn signature(&self, lang: Lang) -> String {
        let (mut m, mut o) = (0, 0);
        self.args
            .iter()
            .map(|(optional, name, _)| {
                let position = if *optional {
                    o += 1;
                    o
                } else {
                    m += 1;
                    m
                };
                shown_name(&self.target, position, name, *optional, lang)
            })
            .collect()
    }
}

/// Says that an argument of `call` is not written; `taken` is what follows
/// the call and was read in its place.
fn missing_argument(
    d: &mut Diagnostic,
    h: &Here<'_>,
    call: &Call,
    taken: Option<&str>,
) -> Vec<Fix> {
    let Some((position, name)) = call.missing() else {
        return Vec::new();
    };
    let head = &call.head;
    let n = call.mandatory();
    let signature = call.signature(h.lang);
    // An argument read in a definition has no name: its rank is said.
    let (fr, en) = if name.is_empty() && n > 1 {
        (
            format!("son {position}ᵉ argument"),
            format!("its argument {position}"),
        )
    } else if name.is_empty() {
        ("son argument".to_owned(), "its argument".to_owned())
    } else {
        let argument = shown_name(&call.target, position, name, false, h.lang);
        if n == 1 {
            (
                format!("son argument `{argument}`"),
                format!("its argument `{argument}`"),
            )
        } else {
            (
                format!("l'argument `{argument}`"),
                format!("the argument `{argument}`"),
            )
        }
    };
    let fr = fr.replace("son 1ᵉ ", "son 1ᵉʳ ");
    let (after_fr, after_en) = match taken {
        Some(next) => (
            format!(" `{next}`, écrit à sa place, a été lu comme cet argument."),
            format!(" `{next}`, written in its place, was read as this argument."),
        ),
        None => (String::new(), String::new()),
    };
    found(
        d,
        h,
        call.start..call.end,
        ("Argument manquant", "Missing argument"),
        (
            &format!("`{head}` s'écrit `{head}{signature}` : il manque {fr}.{after_fr}"),
            &format!("`{head}` is written `{head}{signature}`: {en} is missing.{after_en}"),
        ),
    );
    Vec::new()
}

/// What the command TeX stopped at or after needs, and does not have here:
/// the formula it only exists in, an argument its signature asks for, a
/// plain name where it builds one, a value it knows.
fn call_at_point(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let before = &h.text[h.line.start..h.point];
    // TeX stops after the command, or after what closes the place it is in
    // (`\frac{1}$`: the `$` is read while the second argument is looked for).
    let mut ends: Vec<(usize, usize)> = ["", "$$", "$", "\\]", "\\)", "\\\\", "&"]
        .iter()
        .filter_map(|closer| before.trim_end().strip_suffix(closer))
        .map(|rest| (h.line.start, h.line.start + rest.trim_end().len()))
        .collect();
    // At the end of a paragraph, it stops on the blank line: the command is
    // at the end of the line above.
    if before.trim().is_empty() && h.at.line > 0 {
        let (prev, text) = h.src.line(h.at.line - 1);
        ends.push((prev.start, prev.start + text.trim_end().len()));
    }
    for (line_start, end) in ends {
        if let Some(start) = command_start(h.text, line_start, end)
            && let Some(call) = read_call(h.text, &h.known, start)
            && let Some(fixes) = explain_call(d, h, &call)
        {
            return Some(fixes);
        }
    }
    // An argument that is not written is taken from what follows: the
    // command TeX stopped after was read as the argument of the one before
    // it (`\fontsize{12}\selectfont`).
    let commands: Vec<regex::Match<'_>> = COMMAND.find_iter(before).collect();
    if let [.., previous, last] = commands.as_slice()
        && last.end() == before.trim_end().len()
        && let Some(call) = read_call(h.text, &h.known, h.line.start + previous.start())
        && call.missing().is_some()
        && skip_blank(h.text, call.end) == h.line.start + last.start()
    {
        return Some(missing_argument(d, h, &call, Some(last.as_str())));
    }
    // The command whose arguments TeX is still reading (`\sqrt{` ⇥ `2}`).
    let last = COMMAND.find_iter(before).last()?;
    let between = &before[last.end()..];
    if !(between.is_empty() || between.starts_with(['{', '['])) {
        return None;
    }
    let call = read_call(h.text, &h.known, h.line.start + last.start())?;
    explain_call(d, h, &call)
}

static COMMAND: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\\[A-Za-z@]+\*?").unwrap());

/// Arguments that are text to print (a name, a file or a key is not).
const TEXT_ARGUMENTS: &[&str] = &[
    "text",
    "content",
    "title",
    "caption",
    "short",
    "term",
    "note",
    "body",
    "quote",
    "author",
    "date",
    "description",
];

/// The first thing of `span` that only exists in a formula (`_`, `^`, a
/// command of formulas), outside the formulas written there.
fn math_in_text(h: &Here<'_>, span: Span) -> Option<Span> {
    let b = h.text.as_bytes();
    let mut i = span.start;
    let mut math = false;
    while i < span.end {
        match b[i] {
            b'$' => {
                math = !math;
                i += 1;
            }
            b'\\' => {
                let len = h.text[i + 1..]
                    .bytes()
                    .take_while(u8::is_ascii_alphabetic)
                    .count();
                let name = &h.text[i + 1..i + 1 + len];
                if matches!(b.get(i + 1), Some(b'(' | b'[')) {
                    math = true;
                } else if matches!(b.get(i + 1), Some(b')' | b']')) {
                    math = false;
                } else if !math && len > 0 && h.known.math_only(name) {
                    return Some(i..i + 1 + len);
                }
                // The text of `\ensuremath{…}` is a formula.
                if name == "ensuremath"
                    && let Some(end) = group_end(h.text, i + 1 + len)
                {
                    i = end;
                } else {
                    i += 1 + len.max(1);
                }
            }
            b'_' | b'^' if !math => return Some(i..i + 1),
            _ => i += 1,
        }
    }
    None
}

fn explain_call(d: &mut Diagnostic, h: &Here<'_>, call: &Call) -> Option<Vec<Fix>> {
    let head = &call.head;
    // The name a definition gives is not a use of the command.
    let defined_here = h
        .src
        .index
        .command_defs
        .iter()
        .any(|c| c.span.start <= call.start + 1 && call.start < c.span.end);
    // A command or an environment of formulas, written in text.
    if call.mode == Mode::Math && !call.math && !h.in_math(call.start) && !defined_here {
        let (from, to, open, close) = if call.environment {
            let end = h
                .src
                .index
                .environments
                .iter()
                .find(|e| e.begin.start == call.start)
                .and_then(|e| e.end.as_ref())
                .map_or(call.end, |e| e.end);
            (call.start, end, "\\[\n", "\n\\]")
        } else {
            // With what is written beside it and belongs to the formula.
            let line = h.src.line(h.src.line_of(call.start)).0;
            let mode = |name: &str| h.known.command(name).map(|k| k.mode);
            match call.end <= line.end {
                true => {
                    let (formula, closed) =
                        super::text::formula_around(h.text, &line, call.start, call.end, &mode);
                    let close = if closed { "" } else { "$" };
                    (formula.start, formula.end, "$", close)
                }
                false => (call.start, call.end, "$", "$"),
            }
        };
        let (fr, en) = match &call.because {
            // A macro of the project: what it is made of needs a formula.
            Some(inner) => (
                format!(
                    "`{head}` est défini avec `{inner}`, qui n'existe que dans une formule, et celui-ci est dans du texte."
                ),
                format!(
                    "`{head}` is defined with `{inner}`, which only exists in a formula, and this one is in text."
                ),
            ),
            None => (
                format!("`{head}` n'existe que dans une formule, et celui-ci est dans du texte."),
                format!("`{head}` only exists in a formula, and this one is in text."),
            ),
        };
        found(
            d,
            h,
            call.start..call.head_end,
            if call.environment {
                (
                    "Environnement de formule dans du texte",
                    "Formula environment in text",
                )
            } else {
                (
                    "Commande de formule dans du texte",
                    "Formula command in text",
                )
            },
            (&fr, &en),
        );
        let (first, last) = (
            open.trim(),
            if call.environment { close.trim() } else { "$" },
        );
        let mut list = vec![h.src.insert(from, open)];
        if !close.is_empty() {
            list.push(h.src.insert(to, close));
        }
        return Some(edits(
            format!(
                "{} {first} … {last}",
                h.fr_en("Mettre dans une formule :", "Put in a formula:"),
            ),
            list,
        ));
    }
    // An argument of the signature that is not written.
    if call.missing().is_some() && (call.environment || nothing_follows(h.text, call.end)) {
        return Some(missing_argument(d, h, call, None));
    }
    for (index, (optional, name, written)) in call.args.iter().enumerate() {
        let Some(span) = written else { continue };
        let value = &h.src.text[span.clone()];
        // Text to print that holds what only exists in a formula.
        if TEXT_ARGUMENTS.contains(&name.as_str())
            && call.mode != Mode::Math
            && !h.in_math(call.start)
            && let Some(token) = math_in_text(h, span.clone())
        {
            let written = h.src.text[token.clone()].to_owned();
            let fixes = match written.as_str() {
                "_" => edits(
                    h.fr_en("Écrire \\_", "Write \\_").into(),
                    vec![h.src.edit(token.clone(), "\\_")],
                ),
                _ => Vec::new(),
            };
            found(
                d,
                h,
                token,
                (
                    "Élément de formule dans du texte",
                    "Something of formulas in text",
                ),
                (
                    &format!(
                        "`{written}` n'existe que dans une formule, et celui-ci est dans le texte de `{head}`."
                    ),
                    &format!(
                        "`{written}` only exists in a formula, and this one is in the text of `{head}`."
                    ),
                ),
            );
            return Some(fixes);
        }
        // A name (a label, a key of citation, a counter) is plain text.
        if matches!(name.as_str(), "label" | "citation" | "counter" | "key")
            && let Some(i) = h.text[span.clone()].find('\\')
            && h.text[span.start + i + 1..].starts_with(|c: char| c.is_ascii_alphabetic())
        {
            let len = h.text[span.start + i + 1..]
                .bytes()
                .take_while(u8::is_ascii_alphabetic)
                .count();
            let command = span.start + i..span.start + i + 1 + len;
            let written = h.src.text[command.clone()].to_owned();
            let (fr, en) = command_in_name(head, &written);
            found(d, h, command, COMMAND_IN_NAME, (&fr, &en));
            return Some(Vec::new());
        }
        // One of the values the knowledge base lists, misspelled.
        let position = call.args[..=index]
            .iter()
            .filter(|(o, _, _)| o == optional)
            .count();
        let target = if *optional {
            format!("{}[{position}]", call.target)
        } else {
            format!("{}{{{position}}}", call.target)
        };
        let known = values_of(&target);
        let written = value.trim();
        if !known.is_empty()
            && !written.is_empty()
            && !written.contains(['=', ',', '\\', '{'])
            && !known.iter().any(|k| k == written)
            && let Some(best) = closest(written, known.iter().map(String::as_str), 2)
        {
            let lead = value.len() - value.trim_start().len();
            let at = span.start + lead..span.start + lead + written.len();
            found(
                d,
                h,
                at.clone(),
                ("Valeur inconnue", "Unknown value"),
                (
                    &format!("`{head}` ne connaît pas `{written}`. Vouliez-vous écrire `{best}` ?"),
                    &format!("`{head}` does not know `{written}`. Did you mean `{best}`?"),
                ),
            );
            return Some(edits(
                format!(
                    "{} {written} {} {best}",
                    h.fr_en("Remplacer", "Replace"),
                    h.fr_en("par", "with")
                ),
                vec![h.src.edit(at, best)],
            ));
        }
    }
    None
}

const COMMAND_IN_NAME: (&str, &str) = ("Commande dans un nom", "Command inside a name");

fn command_in_name(head: &str, command: &str) -> (String, String) {
    (
        format!(
            "L'argument de `{head}` est un nom : il ne peut pas contenir la commande `{command}`."
        ),
        format!("The argument of `{head}` is a name: it cannot hold the command `{command}`."),
    )
}

/// The environment around the error, when its `\begin` is just above: an
/// argument it asks for is not written, or it only exists in a formula.
fn environment_begin(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let env = h
        .src
        .index
        .environments
        .iter()
        .filter(|e| e.name != "document" && e.begin.start < h.point)
        .filter(|e| e.end.as_ref().is_none_or(|x| h.point <= x.end))
        .max_by_key(|e| e.begin.start)?;
    if h.at.line > h.src.line_of(env.begin.start) + 2 {
        return None;
    }
    let call = read_call(h.text, &h.known, env.begin.start)?;
    explain_call(d, h, &call)
}

// ------------------------------------------------- groups and environments

static BEGIN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\\(begin|end)\s*\{([^}]*)\}").unwrap());

/// A `}` that closes a group while an environment opened inside it is
/// still open.
fn group_closed_in_environment(
    d: &mut Diagnostic,
    _: &mut Sources<'_>,
    h: &Here<'_>,
) -> Option<Vec<Fix>> {
    let before = h.text[h.line.start..h.point].trim_end();
    if !before.ends_with('}') {
        return None;
    }
    let close = h.line.start + before.len() - 1;
    let open = group_start(h.text, close)?;
    let mut stack: Vec<&str> = Vec::new();
    for m in BEGIN.captures_iter(&h.text[open + 1..close]) {
        let name = m.get(2).unwrap().as_str();
        if &m[1] == "begin" {
            stack.push(name);
        } else if stack.last() == Some(&name) {
            stack.pop();
        }
    }
    let name = stack.last()?;
    found(
        d,
        h,
        close..close + 1,
        (
            "Groupe fermé avant son environnement",
            "Group closed before its environment",
        ),
        (
            &format!(
                "Cette `}}` ferme le groupe ouvert ligne {} alors que `\\begin{{{name}}}` est encore ouvert : `\\end{{{name}}}` doit venir avant elle.",
                h.line_number(open)
            ),
            &format!(
                "This `}}` closes the group opened on line {} while `\\begin{{{name}}}` is still open: `\\end{{{name}}}` must come before it.",
                h.line_number(open)
            ),
        ),
    );
    Some(Vec::new())
}

const FLOATS: &[&str] = &["figure", "table", "figure*", "table*"];
const BOXES: &[&str] = &[
    "minipage",
    "figure",
    "table",
    "figure*",
    "table*",
    "tabular",
    "tabularx",
    "framed",
    "mdframed",
    "tcolorbox",
    "multicols",
];

/// The innermost environment among `names` that holds `offset`.
fn inside<'a>(
    h: &'a Here<'_>,
    names: &[&str],
    offset: usize,
) -> Option<&'a crate::syntax::EnvironmentSpan> {
    h.src
        .index
        .environments
        .iter()
        .filter(|e| names.contains(&e.name.as_str()))
        .filter(|e| e.begin.start < offset && e.end.as_ref().is_none_or(|x| offset <= x.end))
        .max_by_key(|e| e.begin.start)
}

/// A float written inside a box or another float, where LaTeX cannot move it.
fn float_in_box(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    let float = inside(h, FLOATS, h.point)?;
    let around = inside(h, BOXES, float.begin.start)?;
    // An environment that is left open holds everything after it: what is
    // "inside" it is then not said to be.
    if float.end.is_none() || around.end.is_none() {
        return None;
    }
    found(
        d,
        h,
        float.begin.clone(),
        ("Flottant dans une boîte", "Float in a box"),
        (
            &format!(
                "Ce `{}` est dans `{}` (ligne {}) : un flottant ne peut pas être placé dans une boîte ou dans un autre flottant.",
                float.name,
                around.name,
                h.line_number(around.begin.start)
            ),
            &format!(
                "This `{}` is inside `{}` (line {}): a float cannot be put in a box or in another float.",
                float.name,
                around.name,
                h.line_number(around.begin.start)
            ),
        ),
    );
    Some(Vec::new())
}

const LISTS: &[&str] = &["itemize", "enumerate", "description"];

/// Lists nested deeper than LaTeX allows: the one that is too many.
fn nested_too_deep(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    if !d.message.contains("Too deeply nested") {
        return None;
    }
    let before = &h.text[h.line.start..h.point];
    let begin = h.line.start + before.rfind("\\begin")?;
    let depth = h
        .src
        .index
        .environments
        .iter()
        .filter(|e| LISTS.contains(&e.name.as_str()))
        .filter(|e| e.begin.start <= begin && e.end.as_ref().is_none_or(|x| begin < x.end))
        .count();
    place(d, h.src, begin..h.point);
    advise(
        d,
        h.lang,
        &format!("Cette liste est la {depth}ᵉ imbriquée ; LaTeX s'arrête à quatre du même type."),
        &format!("This list is nested {depth} deep; LaTeX stops at four of the same kind."),
    );
    Some(Vec::new())
}

static BLANK_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n[ \t]*\n").unwrap());

/// A blank line inside the argument of a command that takes one paragraph.
fn blank_line_in_argument(
    d: &mut Diagnostic,
    _: &mut Sources<'_>,
    h: &Here<'_>,
) -> Option<Vec<Fix>> {
    if !d.message.starts_with("Paragraph ended before") {
        return None;
    }
    let from = h.src.line(h.at.line.saturating_sub(40)).0.start;
    // The nearest group that is still open at the error and holds a blank line.
    let b = h.text.as_bytes();
    let (open, end) = (from..h.point)
        .rev()
        .filter(|&i| b[i] == b'{' && (i == 0 || b[i - 1] != b'\\'))
        .filter_map(|i| group_end(h.text, i).map(|end| (i, end)))
        .find(|(i, end)| h.point <= *end && BLANK_LINE.is_match(&h.text[*i..*end]))?;
    let blank = open + BLANK_LINE.find(&h.text[open..end])?.start() + 1;
    let start =
        command_start(h.text, h.src.line(h.src.line_of(open)).0.start, open).unwrap_or(open);
    let head = h.src.text[start..open].to_owned();
    found(
        d,
        h,
        start..open + 1,
        (
            "Ligne vide dans un argument",
            "Blank line inside an argument",
        ),
        (
            &format!(
                "L'argument de `{head}` contient une ligne vide (ligne {}) : cette commande n'accepte qu'un seul paragraphe.",
                h.line_number(blank)
            ),
            &format!(
                "The argument of `{head}` holds a blank line (line {}): this command accepts one paragraph only.",
                h.line_number(blank)
            ),
        ),
    );
    Some(Vec::new())
}

/// The last resort: a command of the project whose argument takes one of a
/// few values, written with a value that is close to one of them. Its
/// effect comes later (`\pagenumbering{romain}` fails when a page is
/// printed), where nothing in the source shows it.
fn value_misspelled_elsewhere(
    d: &mut Diagnostic,
    s: &mut Sources<'_>,
    h: &Here<'_>,
) -> Option<Vec<Fix>> {
    // Only where every value is listed: elsewhere the list is a proposal,
    // and a value that is not in it is not a mistake.
    for set in keys::sets().iter().filter(|set| set.exact) {
        for target in set
            .targets
            .iter()
            .filter(|t| t.starts_with('\\') && t.ends_with("{1}"))
        {
            let name = target.trim_end_matches("{1}");
            for src in s.srcs() {
                let text = mask(&src.text);
                for (at, _) in text.match_indices(name) {
                    let open = at + name.len();
                    let Some(end) = group_end(&text, open) else {
                        continue;
                    };
                    let written = text[open + 1..end - 1].trim();
                    if written.is_empty()
                        || written.contains(['=', ',', '\\', '{'])
                        || set.keys.iter().any(|k| k.name == written)
                    {
                        continue;
                    }
                    let known = set.keys.iter().map(|k| k.name.as_str());
                    let Some(best) = closest(written, known, 2) else {
                        continue;
                    };
                    let lead = open
                        + 1
                        + (text[open + 1..end - 1].len()
                            - text[open + 1..end - 1].trim_start().len());
                    let span = lead..lead + written.len();
                    place(d, &src, span.clone());
                    d.hint = Some(Hint {
                        title: h.fr_en("Valeur inconnue", "Unknown value").to_owned(),
                        explanation: String::new(),
                        advice: Some(
                            h.fr_en(
                                &format!("`{name}` ne connaît pas `{written}`. Vouliez-vous écrire `{best}` ?"),
                                &format!("`{name}` does not know `{written}`. Did you mean `{best}`?"),
                            )
                            .to_owned(),
                        ),
                    });
                    return Some(edits(
                        format!(
                            "{} {written} {} {best}",
                            h.fr_en("Remplacer", "Replace"),
                            h.fr_en("par", "with")
                        ),
                        vec![src.edit(span, best)],
                    ));
                }
            }
        }
    }
    None
}

// ------------------------------------------------------------ structure

/// Whether a blank line is between the first and the last line of `text`.
fn has_blank_line(text: &str) -> bool {
    let lines: Vec<&str> = text.split('\n').collect();
    lines.len() > 2
        && lines[1..lines.len() - 1]
            .iter()
            .any(|l| l.trim().is_empty())
}

/// One `$` too few in the paragraph TeX stopped in: every `$` after the
/// missing one is read the other way round, and what TeX reports from
/// there on comes from it.
fn lost_dollar(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    use crate::syntax::ProblemKind as Kind;
    let first = paragraph_start(h.text, h.line.start);
    // The `$` left alone at the end of this paragraph.
    let last = h
        .src
        .index
        .problems
        .iter()
        .filter(|p| matches!(p.kind, Kind::UnclosedMath) && &h.text[p.span.clone()] == "$")
        .map(|p| p.span.start)
        .find(|&p| p >= first)?;
    if h.line.start < last && has_blank_line(&h.text[h.line.start..last]) {
        return None;
    }
    explain_lost_dollar(d, h, last)
}

/// Says which `$` the paragraph that ends with the `$` at `last` lacks.
fn explain_lost_dollar(d: &mut Diagnostic, h: &Here<'_>, last: usize) -> Option<Vec<Fix>> {
    use super::text::LostDollar;
    let mode = |name: &str| h.known.command(name).map(|k| k.mode);
    // Where TeX added a `$` by itself, what is written only exists in a
    // formula, whatever is known of it.
    let seen = (d.code.as_deref() == Some("missing-dollar") && h.at.token.len() < h.line.len())
        .then_some(h.at.token.start);
    let lost = super::text::lost_dollar(h.text, last, &mode, seen)?;
    // What TeX reports before it has another cause.
    let token = match &lost {
        LostDollar::Opening { token, .. } | LostDollar::Unknown { token } => token.start,
        LostDollar::Closing { open, .. } => *open,
        LostDollar::Unpaired { dollar } => *dollar,
    };
    if h.line.end < token {
        return None;
    }
    let line = |at: usize| h.src.line_of(at) + 1;
    d.swallows = true;
    Some(match lost {
        LostDollar::Opening { token, at } => {
            found(
                d,
                h,
                token,
                ("Formule jamais ouverte", "Formula never opened"),
                (
                    "Ce qui est écrit ici est une formule, et le `$` qui l'ouvre manque : celui qui la suit ouvre une formule au lieu de la fermer.",
                    "What is written here is a formula, and the `$` that opens it is missing: the one after it opens a formula instead of closing it.",
                ),
            );
            edits(
                h.fr_en("Ouvrir la formule avec $", "Open the formula with $")
                    .into(),
                vec![h.src.insert(at, "$")],
            )
        }
        LostDollar::Closing { open, next, at } => {
            found(
                d,
                h,
                open..open + 1,
                ("Formule jamais fermée", "Formula never closed"),
                (
                    &format!(
                        "La formule ouverte par ce `$` n'est pas refermée : le `$` suivant (ligne {}) ouvre la formule d'après, et TeX le lit comme sa fermeture.",
                        line(next)
                    ),
                    &format!(
                        "The formula opened by this `$` is not closed: the next `$` (line {}) opens the formula after it, and TeX reads it as its end.",
                        line(next)
                    ),
                ),
            );
            at.map_or_else(Vec::new, |at| {
                edits(
                    h.fr_en("Fermer la formule avec $", "Close the formula with $")
                        .into(),
                    vec![h.src.insert(at, "$")],
                )
            })
        }
        LostDollar::Unpaired { dollar } => {
            found(
                d,
                h,
                dollar..dollar + 1,
                (
                    "Un `$` manque dans ce paragraphe",
                    "A `$` is missing in this paragraph",
                ),
                (
                    "Ce `$` est lu comme le début d'une formule, et ce qui le suit n'en est pas une : celui qui va avec lui manque, avant lui s'il ferme une formule, après lui s'il en ouvre une.",
                    "This `$` is read as the start of a formula, and what follows it is not one: the `$` that goes with it is missing, before it if it closes a formula, after it if it opens one.",
                ),
            );
            Vec::new()
        }
        LostDollar::Unknown { token } => {
            found(
                d,
                h,
                token,
                (
                    "Un `$` manque dans ce paragraphe",
                    "A `$` is missing in this paragraph",
                ),
                (
                    &format!(
                        "Ce paragraphe compte un nombre impair de `$` : ce qui est écrit ici n'existe que dans une formule et se trouve lu comme du texte, et le dernier `$` (ligne {}) ouvre une formule que rien ne ferme.",
                        line(last)
                    ),
                    &format!(
                        "This paragraph has an odd number of `$`: what is written here only exists in a formula and is read as text, and the last `$` (line {}) opens a formula that nothing closes.",
                        line(last)
                    ),
                ),
            );
            Vec::new()
        }
    })
}

/// What the live checks find wrong in the structure of the paragraph
/// (a brace, a formula or an environment that is not closed, or closed
/// twice): it is the cause of what TeX reports there.
fn structure(d: &mut Diagnostic, _: &mut Sources<'_>, h: &Here<'_>) -> Option<Vec<Fix>> {
    use crate::syntax::ProblemKind as Kind;
    // TeX reports the end of a paragraph on the blank line that follows it.
    let blank = h.text[h.line.clone()].trim().is_empty();
    let last = if blank && h.line.start > 0 {
        h.line.start - 1
    } else {
        h.point
    };
    let first = paragraph_start(h.text, last);
    let problems = &h.src.index.problems;
    // The first problem of the paragraph is the one TeX trips on.
    let mut problem = problems
        .iter()
        // A document that is not ended has a message of its own.
        .filter(|p| !matches!(&p.kind, Kind::UnclosedEnvironment(n) if n == "document"))
        .filter(|p| first <= p.span.start && p.span.start <= last.max(h.line.end))
        .min_by_key(|p| p.span.start)?;
    // What closes without an opening comes with what was opened and not
    // closed just above (a blank line between `\[` and `\]`).
    if matches!(
        problem.kind,
        Kind::UnmatchedMathClose | Kind::UnmatchedEnd(_) | Kind::UnmatchedCloseBrace
    ) && let Some(open) = problems
        .iter()
        .filter(|p| {
            matches!(
                p.kind,
                Kind::UnclosedMath | Kind::UnclosedEnvironment(_) | Kind::UnclosedBrace
            )
        })
        .filter(|p| p.span.start < problem.span.start)
        .filter(|p| h.src.line_of(problem.span.start) - h.src.line_of(p.span.start) <= 15)
        .max_by_key(|p| p.span.start)
        && !matches!(&open.kind, Kind::UnclosedEnvironment(n) if n == "document")
    {
        problem = open;
    }
    let span = problem.span.clone();
    // The live checks give the problem its name and its fix.
    let live = crate::lint::structure(&h.src.path, &h.src.text, h.lang)
        .into_iter()
        .find(|p| p.range.is_some_and(|r| h.src.offset(r.start) == span.start));
    let (title, mut fixes) =
        live.map_or_else(|| (d.message.clone(), Vec::new()), |p| (p.message, p.fixes));
    let written = h.src.text[span.clone()].to_owned();
    // One `$` too few in the paragraph: which one is read in what is
    // written before this one.
    if matches!(problem.kind, Kind::UnclosedMath)
        && written == "$"
        && let Some(fixes) = explain_lost_dollar(d, h, span.start)
    {
        return Some(fixes);
    }
    // A formula closed further down, after a blank line: the blank line is
    // the mistake.
    let closer = problems
        .iter()
        .filter(|p| matches!(p.kind, Kind::UnmatchedMathClose))
        .filter(|p| p.span.start > span.start)
        .filter(|p| {
            matches!(
                (written.as_str(), &h.src.text[p.span.clone()]),
                ("\\[", "\\]") | ("\\(", "\\)")
            )
        })
        .filter(|p| has_blank_line(&h.text[span.end..p.span.start]))
        .find(|p| h.src.line_of(p.span.start) - h.src.line_of(span.start) <= 15);
    let blank_line = matches!(problem.kind, Kind::UnclosedMath)
        && (written.trim().is_empty()
            || closer.is_some()
            || fixes.iter().any(|f| {
                matches!(f, Fix::Edits { title, .. } if title.contains("ligne vide") || title.contains("blank line"))
            }));
    if let Some(closer) = closer.filter(|_| matches!(problem.kind, Kind::UnclosedMath)) {
        let lines: Vec<FileEdit> = (h.src.line_of(span.end)..h.src.line_of(closer.span.start))
            .filter(|&l| h.src.line(l).1.trim().is_empty())
            .map(|l| h.src.delete(h.src.line(l).0))
            .collect();
        if !lines.is_empty() {
            fixes = edits(
                h.fr_en(
                    "Supprimer la ligne vide de la formule",
                    "Delete the blank line of the formula",
                )
                .into(),
                lines,
            );
        }
    }
    let advice: (String, String) = match &problem.kind {
        Kind::UnclosedMath if blank_line => (
            "Une ligne vide coupe cette formule : elle termine le paragraphe, et TeX ferme la formule avec lui.".into(),
            "A blank line cuts this formula: it ends the paragraph, and TeX closes the formula with it.".into(),
        ),
        // `10$`: a price, not a formula.
        Kind::UnclosedMath
            if written == "$" && h.text[..span.start].ends_with(|c: char| c.is_ascii_digit()) =>
        {
            fixes = edits(
                h.fr_en("Écrire \\$", "Write \\$").into(),
                vec![h.src.edit(span.clone(), "\\$")],
            );
            (
                "Ce `$` ouvre une formule qui n'est jamais fermée. Pour écrire le signe dollar, utilisez `\\$`.".into(),
                "This `$` opens a formula that is never closed. To print the dollar sign, write `\\$`.".into(),
            )
        }
        Kind::UnclosedMath => (
            format!("La formule ouverte par ce `{written}` n'est pas refermée avant la fin du paragraphe."),
            format!("The formula opened by this `{written}` is not closed before the end of the paragraph."),
        ),
        Kind::UnmatchedMathClose => (
            format!("Ce `{written}` ne ferme aucune formule."),
            format!("This `{written}` closes no formula."),
        ),
        Kind::NestedMath => (
            format!("Ce `{written}` ouvre une formule à l'intérieur d'une formule déjà ouverte."),
            format!("This `{written}` opens a formula inside a formula that is open already."),
        ),
        Kind::LeftRightMismatch => (
            "`\\left` et `\\right` ne sont pas appariés dans cette formule (`\\right.` ferme sans rien afficher).".into(),
            "`\\left` and `\\right` are not paired in this formula (`\\right.` closes without printing anything).".into(),
        ),
        Kind::UnclosedBrace => {
            // `\textbf{50% de réduction}`: the `%` hides the end of the line.
            match percent_hides_brace(&h.src.text, span.start) {
                Some(at) => {
                    // Only in text is a `%` a percent sign.
                    fixes = if super::text::takes_text(&h.src.text, span.start) {
                        edits(
                            h.fr_en("Écrire \\%", "Write \\%").into(),
                            vec![h.src.edit(at..at + 1, "\\%")],
                        )
                    } else {
                        Vec::new()
                    };
                    (
                        "Le `%` de cette ligne met la fin de la ligne en commentaire, avec la `}` qui ferme cette accolade. Un pourcentage s'écrit `\\%`.".into(),
                        "The `%` of this line turns the end of the line into a comment, with the `}` that closes this brace. A percent sign is written `\\%`.".into(),
                    )
                }
                None => (
                    "Cette `{` n'est jamais refermée.".into(),
                    "This `{` is never closed.".into(),
                ),
            }
        }
        Kind::UnmatchedCloseBrace => (
            "Cette `}` ne ferme aucune `{`.".into(),
            "This `}` closes no `{`.".into(),
        ),
        Kind::UnclosedEnvironment(name) => (
            format!("`\\begin{{{name}}}` n'est jamais fermé par `\\end{{{name}}}`."),
            format!("`\\begin{{{name}}}` is never closed by `\\end{{{name}}}`."),
        ),
        Kind::UnmatchedEnd(name) => (
            format!("Ce `\\end{{{name}}}` ne ferme aucun `\\begin{{{name}}}`."),
            format!("This `\\end{{{name}}}` closes no `\\begin{{{name}}}`."),
        ),
    };
    found(d, h, span, (&title, &title), (&advice.0, &advice.1));
    d.swallows = matches!(
        problem.kind,
        Kind::UnclosedBrace | Kind::UnclosedMath | Kind::UnclosedEnvironment(_)
    );
    Some(fixes)
}

// ------------------------------------------------------- without a place

/// An error TeX reports without a line of the document (while it reads its
/// auxiliary file): a name that holds a command is looked for in the project.
fn unplaced(d: &mut Diagnostic, s: &mut Sources<'_>, lang: Lang) -> Option<Vec<Fix>> {
    // TeX reached the end of the file while reading something: what is
    // left open in the sources is where it started.
    if matches!(
        d.code.as_deref(),
        Some("file-ended" | "runaway-argument" | "paragraph-ended")
    ) && let Some(fixes) = fragile_frame(d, s, lang)
        .or_else(|| unclosed_bracket(d, s, lang))
        .or_else(|| left_open(d, s, lang))
    {
        return Some(fixes);
    }
    if !d.message.contains("\\endcsname") && !d.message.contains("\\csname") {
        return None;
    }
    for src in s.srcs() {
        let named = src
            .index
            .labels
            .iter()
            .map(|l| (&l.name, &l.span, "\\label"))
            .chain(
                src.index
                    .references
                    .iter()
                    .map(|r| (&r.name, &r.span, "\\ref")),
            )
            .chain(
                src.index
                    .citations
                    .iter()
                    .map(|c| (&c.name, &c.span, "\\cite")),
            );
        for (name, span, head) in named {
            let Some(i) = name.find('\\') else { continue };
            if !name[i + 1..].starts_with(|c: char| c.is_ascii_alphabetic()) {
                continue;
            }
            let len = name[i + 1..]
                .bytes()
                .take_while(u8::is_ascii_alphabetic)
                .count();
            let command = name[i..i + 1 + len].to_owned();
            let at = src.text[span.clone()]
                .find(&command)
                .map_or(span.clone(), |k| {
                    span.start + k..span.start + k + command.len()
                });
            place(d, &src, at);
            let (fr, en) = command_in_name(head, &command);
            d.hint = Some(Hint {
                title: lang.pick(COMMAND_IN_NAME.0, COMMAND_IN_NAME.1).to_owned(),
                explanation: String::new(),
                advice: Some(lang.pick(&fr, &en).to_owned()),
            });
            return Some(Vec::new());
        }
    }
    None
}
