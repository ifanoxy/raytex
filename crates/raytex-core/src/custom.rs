//! The commands and the environments a project defines by itself
//! (`\newcommand`, `\DeclareMathOperator`, `\newenvironment`,
//! `\newtheorem`…): listed with where they are defined and how many times
//! they are used, and written from a few fields (a name, a number of
//! arguments, a definition) so that nobody has to remember the syntax.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::fixes::known::Learned;
use crate::i18n::Lang;
use crate::kb::{KERNEL, Mode, kb};
use crate::syntax;
use crate::text::Span;
use crate::workspace::{Location, Workspace};

/// What a definition makes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CustomKind {
    /// `\newcommand`, `\def`, `\NewDocumentCommand`…
    Command,
    /// `\DeclareMathOperator`: a name set upright in formulas (`\argmax`).
    Operator,
    /// `\newenvironment`.
    Environment,
    /// `\newtheorem`.
    Theorem,
}

/// A command or an environment the project defines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomCommand {
    /// Its name, without backslash.
    pub name: String,
    /// What it is.
    pub kind: CustomKind,
    /// Number of arguments.
    pub args: u8,
    /// Whether the first argument is optional.
    pub first_optional: bool,
    /// What it is defined as: the body of a command, the title of a theorem.
    pub definition: String,
    /// Whether it only works in a formula.
    pub math: bool,
    /// How it is written, as a snippet (`\norme{${1}}`).
    pub usage: String,
    /// A text that tries it (`$\norme{a}$`).
    pub sample: String,
    /// Where it is defined (its name).
    pub location: Location,
    /// The definition as it is written, whole.
    pub source: String,
    /// Whether it is written in the preamble of the root document: a
    /// preview made of that preamble has it already.
    pub in_preamble: bool,
    /// How many times the project uses it.
    pub uses: usize,
}

/// What a new definition is made of.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSpec {
    /// What to define.
    pub kind: Option<CustomKind>,
    /// Its name, with or without backslash.
    pub name: String,
    /// Number of arguments.
    #[serde(default)]
    pub args: u8,
    /// Default value of the first argument, which makes it optional.
    #[serde(default)]
    pub default: Option<String>,
    /// The definition: the body of a command (`#1` is the first argument),
    /// the text of an operator, the title of a theorem, what an environment
    /// starts with.
    #[serde(default)]
    pub body: String,
    /// What an environment ends with.
    #[serde(default)]
    pub end: String,
}

/// A definition ready to be added to a preamble, with what was found wrong
/// in what it is made of.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandDraft {
    /// The name, cleaned (no backslash).
    pub name: String,
    /// The lines of the preamble.
    pub code: String,
    /// How it is written, as a snippet.
    pub usage: String,
    /// A text that tries it.
    pub sample: String,
    /// Whether it only works in a formula.
    pub math: bool,
    /// The packages the definition needs.
    pub packages: Vec<String>,
    /// What prevents adding it.
    pub problems: Vec<String>,
    /// What is worth knowing and prevents nothing.
    pub notes: Vec<String>,
}

/// The commands and environments the project of `root` defines, in the
/// order of the document.
pub fn list(ws: &Workspace, root: &Path) -> Vec<CustomCommand> {
    let docs = ws.project_documents(root);
    let learned = Learned::new(docs.iter().map(|d| &d.index), &[]);
    let texts: Vec<String> = docs
        .iter()
        .map(|d| crate::fixes::text::mask(&d.text))
        .collect();
    let root = crate::log::normalize(root);
    let in_preamble = |doc: &crate::workspace::Document, at: usize| {
        doc.path == root && at < crate::fixes::text::preamble_end(&doc.text)
    };
    let mut out = Vec::new();
    for doc in &docs {
        for def in &doc.index.command_defs {
            // The inside of a package is not something a document writes.
            if def.name.contains('@') || def.name.is_empty() {
                continue;
            }
            let math = def.math
                || learned
                    .command(&def.name)
                    .is_some_and(|k| k.mode == Mode::Math);
            let defined = docs
                .iter()
                .flat_map(|d| &d.index.command_defs)
                .filter(|c| c.name == def.name)
                .count();
            let written: usize = texts.iter().map(|t| occurrences(t, &def.name)).sum();
            out.push(CustomCommand {
                name: def.name.clone(),
                kind: if def.math {
                    CustomKind::Operator
                } else {
                    CustomKind::Command
                },
                args: def.args,
                first_optional: def.first_optional,
                definition: if def.body.is_empty() {
                    def.definition.clone()
                } else {
                    def.body.clone()
                },
                math,
                usage: command_usage(&def.name, def.args, def.first_optional),
                sample: command_sample(&def.name, def.args, def.first_optional, math),
                location: Location {
                    file: doc.path.clone(),
                    range: doc.range(&def.span),
                },
                source: doc.text[statement(&doc.text, &def.span)].to_owned(),
                in_preamble: in_preamble(doc, def.span.start),
                uses: written.saturating_sub(defined),
            });
        }
        for def in &doc.index.environment_defs {
            if def.name.contains('@') || def.name.is_empty() {
                continue;
            }
            let begin = format!("\\begin{{{}}}", def.name);
            out.push(CustomCommand {
                name: def.name.clone(),
                kind: if def.theorem_title.is_some() {
                    CustomKind::Theorem
                } else {
                    CustomKind::Environment
                },
                args: def.args,
                first_optional: false,
                definition: def.theorem_title.clone().unwrap_or_default(),
                math: false,
                usage: environment_usage(&def.name, def.args),
                sample: environment_sample(&def.name, def.args),
                location: Location {
                    file: doc.path.clone(),
                    range: doc.range(&def.span),
                },
                source: doc.text[statement(&doc.text, &def.span)].to_owned(),
                in_preamble: in_preamble(doc, def.span.start),
                uses: texts.iter().map(|t| t.matches(&begin).count()).sum(),
            });
        }
    }
    out
}

/// The whole definition whose name is at `name`: from the command that
/// defines (`\newcommand`, `\def`…) to the end of its last argument.
fn statement(text: &str, name: &Span) -> Span {
    let bytes = text.as_bytes();
    // Back to the command that defines: over the `\` and the `{` of the name.
    let mut start = name.start;
    while start > 0 && matches!(bytes[start - 1], b'\\' | b'{' | b' ' | b'*') {
        start -= 1;
    }
    let letters = bytes[..start]
        .iter()
        .rev()
        .take_while(|b| b.is_ascii_alphabetic())
        .count();
    let start = if letters > 0 && start > letters && bytes[start - letters - 1] == b'\\' {
        start - letters - 1
    } else {
        name.start
    };
    // Forward over its arguments: groups, and the parameters of `\def`.
    let mut end = name.end;
    if bytes.get(end) == Some(&b'}') {
        end += 1;
    }
    loop {
        let mut next = end;
        while matches!(bytes.get(next), Some(b' ' | b'\t' | b'#' | b'0'..=b'9')) {
            next += 1;
        }
        // An argument may start on the next line, not after a blank one.
        if bytes.get(next) == Some(&b'\n') {
            let line = next + 1;
            let indent = bytes[line..]
                .iter()
                .take_while(|b| matches!(b, b' ' | b'\t'))
                .count();
            if matches!(bytes.get(line + indent), Some(b'{' | b'[')) {
                next = line + indent;
            }
        }
        let close = match bytes.get(next) {
            Some(b'{') => b'}',
            Some(b'[') => b']',
            _ => break,
        };
        let open = bytes[next];
        let (mut depth, mut i) = (0usize, next);
        while i < bytes.len() {
            match bytes[i] {
                b'\\' => i += 1,
                b if b == open => depth += 1,
                b if b == close => {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                _ => {}
            }
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        end = i + 1;
    }
    start..end.max(name.end)
}

/// How many times `\name` is written in `text`, as a whole name.
fn occurrences(text: &str, name: &str) -> usize {
    let needle = format!("\\{name}");
    let bytes = text.as_bytes();
    text.match_indices(&needle)
        .filter(|(i, _)| {
            let escaped = *i > 0 && bytes[*i - 1] == b'\\';
            let longer = bytes
                .get(*i + needle.len())
                .is_some_and(|b| b.is_ascii_alphabetic() || *b == b'@');
            !escaped && !longer
        })
        .count()
}

fn command_usage(name: &str, args: u8, first_optional: bool) -> String {
    let mut out = format!("\\{name}");
    for i in 1..=args {
        if i == 1 && first_optional {
            continue;
        }
        out.push_str(&format!("{{${{{i}}}}}"));
    }
    out
}

/// Letters for the arguments of a formula, words for those of text.
fn sample_argument(i: u8, math: bool) -> String {
    if math {
        char::from(b'a' + (i - 1) % 26).to_string()
    } else if i == 1 {
        "texte".to_owned()
    } else {
        format!("texte {i}")
    }
}

fn command_sample(name: &str, args: u8, first_optional: bool, math: bool) -> String {
    let mut call = format!("\\{name}");
    for i in 1..=args {
        if i == 1 && first_optional {
            continue;
        }
        call.push_str(&format!("{{{}}}", sample_argument(i, math)));
    }
    if math { format!("${call}$") } else { call }
}

fn environment_usage(name: &str, args: u8) -> String {
    let mut out = format!("\\begin{{{name}}}");
    for i in 1..=args {
        out.push_str(&format!("{{${{{i}}}}}"));
    }
    out.push_str(&format!("\n\t${{{}}}\n\\end{{{name}}}", args + 1));
    out
}

fn environment_sample(name: &str, args: u8) -> String {
    let mut out = format!("\\begin{{{name}}}");
    for i in 1..=args {
        out.push_str(&format!("{{{}}}", sample_argument(i, false)));
    }
    out.push_str(&format!("\nDu texte.\n\\end{{{name}}}"));
    out
}

/// Writes the definition `spec` describes and checks it against the
/// project of `root`: a name LaTeX can take, that nothing defines yet, and
/// a definition that uses the arguments it declares.
pub fn draft(
    ws: Option<&Workspace>,
    root: Option<&Path>,
    spec: &CommandSpec,
    lang: Lang,
) -> CommandDraft {
    let kind = spec.kind.unwrap_or(CustomKind::Command);
    let environment = matches!(kind, CustomKind::Environment | CustomKind::Theorem);
    let name = spec.name.trim().trim_start_matches('\\').trim().to_owned();
    let shown = if environment {
        format!("`{name}`")
    } else {
        format!("`\\{name}`")
    };
    let args = match kind {
        CustomKind::Command | CustomKind::Environment => spec.args,
        CustomKind::Operator | CustomKind::Theorem => 0,
    };
    let default = spec
        .default
        .as_deref()
        .filter(|_| matches!(kind, CustomKind::Command | CustomKind::Environment))
        .filter(|d| !d.is_empty());
    let body = spec.body.trim();
    let end = spec.end.trim();
    let mut problems = Vec::new();
    let mut notes = Vec::new();
    let say = |list: &mut Vec<String>, fr: String, en: String| {
        list.push(match lang {
            Lang::Fr => fr,
            Lang::En => en,
        });
    };

    // The name.
    let letters = |n: &str| !n.is_empty() && n.chars().all(|c| c.is_ascii_alphabetic());
    let valid = if environment {
        !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '*')
    } else {
        letters(&name)
    };
    if name.is_empty() {
        say(
            &mut problems,
            "Donnez un nom.".into(),
            "Give it a name.".into(),
        );
    } else if !valid && environment {
        say(
            &mut problems,
            "Le nom d'un environnement est fait de lettres et de chiffres, sans espace ni accent."
                .into(),
            "The name of an environment is made of letters and digits, without spaces or accents."
                .into(),
        );
    } else if !valid {
        say(
            &mut problems,
            "Le nom d'une commande n'est fait que de lettres : ni chiffre, ni espace, ni accent."
                .into(),
            "The name of a command is made of letters only: no digit, no space, no accent.".into(),
        );
    }

    // Nothing defines it yet.
    let docs = match (ws, root) {
        (Some(ws), Some(root)) => ws.project_documents(root),
        _ => Vec::new(),
    };
    if valid {
        let own = docs.iter().find_map(|d| {
            let span = if environment {
                d.index
                    .environment_defs
                    .iter()
                    .find(|e| e.name == name)
                    .map(|e| &e.span)
            } else {
                d.index
                    .command_defs
                    .iter()
                    .find(|c| c.name == name)
                    .map(|c| &c.span)
            }?;
            let file = d
                .path
                .file_name()
                .map(|f| f.to_string_lossy().into_owned())
                .unwrap_or_default();
            Some((file, d.range(span).start.line + 1))
        });
        let loaded = |package: &str| {
            package == KERNEL
                || docs.iter().any(|d| {
                    d.index.packages.iter().any(|p| p.name == package)
                        || d.index
                            .document_class
                            .as_ref()
                            .is_some_and(|c| c.name == package)
                })
        };
        let described: Vec<&str> = if environment {
            kb().environment_providers(&name)
        } else {
            kb().command_providers(&name)
        };
        if let Some((file, line)) = own {
            say(
                &mut problems,
                format!("{shown} est déjà défini dans le projet ({file}, ligne {line})."),
                format!("{shown} is already defined in the project ({file}, line {line})."),
            );
        } else if described.contains(&KERNEL) {
            say(
                &mut problems,
                format!("{shown} existe déjà dans LaTeX : choisissez un autre nom."),
                format!("{shown} already exists in LaTeX: choose another name."),
            );
        } else if let Some(package) = described.iter().find(|p| loaded(p)) {
            say(
                &mut problems,
                format!(
                    "{shown} est déjà défini par le package `{package}`, que le document charge : choisissez un autre nom."
                ),
                format!(
                    "{shown} is already defined by the `{package}` package, which the document loads: choose another name."
                ),
            );
        } else if let Some(package) = described.first() {
            say(
                &mut notes,
                format!(
                    "{shown} est aussi le nom d'une commande du package `{package}` : les deux ne pourront pas être utilisés ensemble."
                ),
                format!(
                    "{shown} is also the name of a command of the `{package}` package: both cannot be used together."
                ),
            );
        }
    }

    // The arguments and what uses them.
    if spec.args > 9 {
        say(
            &mut problems,
            "Une commande a neuf arguments au plus.".into(),
            "A command takes nine arguments at most.".into(),
        );
    }
    if default.is_some() && args == 0 {
        say(
            &mut problems,
            "Une valeur par défaut est celle du premier argument : il en faut au moins un.".into(),
            "A default value is the one of the first argument: at least one is needed.".into(),
        );
    }
    let used = parameters(body)
        .into_iter()
        .chain(parameters(end))
        .collect::<Vec<u8>>();
    if matches!(kind, CustomKind::Command | CustomKind::Environment) {
        if let Some(most) = used.iter().copied().max().filter(|m| *m > args) {
            let (fr, en) = match args {
                0 => ("aucun argument".to_owned(), "no argument".to_owned()),
                1 => (
                    "un seul argument".to_owned(),
                    "one argument only".to_owned(),
                ),
                n => (format!("{n} arguments"), format!("{n} arguments")),
            };
            say(
                &mut problems,
                format!("La définition utilise `#{most}`, et {shown} a {fr}."),
                format!("The definition uses `#{most}`, and {shown} has {en}."),
            );
        }
        for i in (1..=args.min(9)).filter(|i| !used.contains(i)) {
            say(
                &mut notes,
                format!("L'argument `#{i}` n'est pas utilisé dans la définition."),
                format!("The argument `#{i}` is not used in the definition."),
            );
        }
    }
    if !balanced(body) || !balanced(end) || default.is_some_and(|d| !balanced(d)) {
        say(
            &mut problems,
            "Les accolades de la définition ne sont pas équilibrées.".into(),
            "The braces of the definition are not balanced.".into(),
        );
    }
    if body.is_empty() && kind != CustomKind::Environment {
        let (fr, en) = match kind {
            CustomKind::Operator => (
                "Écrivez le nom que l'opérateur affiche (`argmax`).",
                "Write the name the operator prints (`argmax`).",
            ),
            CustomKind::Theorem => (
                "Écrivez le titre que l'énoncé affiche (`Théorème`).",
                "Write the title the statement prints (`Theorem`).",
            ),
            _ => ("La définition est vide.", "The definition is empty."),
        };
        say(&mut problems, fr.into(), en.into());
    }

    // The lines of the preamble.
    let count = if args > 0 {
        format!("[{args}]")
    } else {
        String::new()
    };
    let optional = default.map_or(String::new(), |d| format!("[{d}]"));
    let code = match kind {
        CustomKind::Command => format!("\\newcommand{{\\{name}}}{count}{optional}{{{body}}}"),
        CustomKind::Operator => format!("\\DeclareMathOperator{{\\{name}}}{{{body}}}"),
        CustomKind::Environment => {
            format!("\\newenvironment{{{name}}}{count}{optional}{{{body}}}{{{end}}}")
        }
        CustomKind::Theorem => format!("\\newtheorem{{{name}}}{{{body}}}"),
    };
    let packages = match kind {
        CustomKind::Operator => vec!["amsmath".to_owned()],
        _ => Vec::new(),
    };

    // Whether it only works in a formula: read like the definitions of the
    // project are.
    let math = match kind {
        CustomKind::Operator => true,
        CustomKind::Command if valid => {
            let own = syntax::scan(&code);
            let indexes = docs.iter().map(|d| &d.index).chain(std::iter::once(&own));
            Learned::new(indexes, &[])
                .command(&name)
                .is_some_and(|k| k.mode == Mode::Math)
        }
        _ => false,
    };
    let first_optional = default.is_some();
    let (usage, sample) = if environment {
        (
            environment_usage(&name, args),
            environment_sample(&name, args),
        )
    } else {
        (
            command_usage(&name, args, first_optional),
            command_sample(&name, args, first_optional, math),
        )
    };
    CommandDraft {
        name,
        code,
        usage,
        sample,
        math,
        packages,
        problems,
        notes,
    }
}

/// The parameters (`#1`…`#9`) a definition uses.
fn parameters(body: &str) -> Vec<u8> {
    let bytes = body.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            // `\#` is the character.
            b'\\' => i += 1,
            b'#' => {
                if let Some(d) = bytes
                    .get(i + 1)
                    .filter(|d| d.is_ascii_digit() && **d != b'0')
                {
                    out.push(d - b'0');
                }
            }
            _ => {}
        }
        i += 1;
    }
    out
}

/// Whether every brace of `text` is closed, and none closes nothing.
fn balanced(text: &str) -> bool {
    let bytes = text.as_bytes();
    let (mut depth, mut i) = (0i32, 0);
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
        i += 1;
    }
    depth == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(files: &[(&str, &str)]) -> (tempfile::TempDir, Workspace, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        for (name, text) in files {
            std::fs::write(dir.path().join(name), text).unwrap();
        }
        let ws = Workspace::open(dir.path());
        let root = ws.root_for(&dir.path().join(files[0].0));
        (dir, ws, root)
    }

    const MAIN: &str = "\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\norme}[1]{\\left\\lVert #1 \\right\\rVert}\n\\newcommand{\\cadre}[2][noir]{\\fbox{#2}}\n\\DeclareMathOperator{\\argmax}{argmax}\n\\newenvironment{encadre}[1]{\\textbf{#1}}{}\n\\newtheorem{lemme}{Lemme}\n\\makeatletter\\newcommand{\\interne@x}{x}\\makeatother\n\\begin{document}\nSoit $x \\in \\R$ et $y \\in \\R$, de norme $\\norme{x}$. % \\R en commentaire\n\\input{partie}\n\\end{document}\n";
    const PART: &str = "\\newcommand{\\vect}[1]{\\overrightarrow{#1}}\n\\begin{lemme}\nOn a $\\vect{u} \\in \\R^2$ et \\cadre{un mot}.\n\\end{lemme}\n\\begin{lemme}\nEt $\\argmax f$.\n\\end{lemme}\n";

    #[test]
    fn the_definitions_of_a_project_are_listed_with_their_uses() {
        let (_dir, ws, root) = project(&[("main.tex", MAIN), ("partie.tex", PART)]);
        let all = list(&ws, &root);
        let names: Vec<&str> = all.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(
            names,
            ["R", "norme", "cadre", "argmax", "encadre", "lemme", "vect"]
        );
        let get = |name: &str| all.iter().find(|c| c.name == name).unwrap();
        // The uses of the whole project, without the definition nor comments.
        assert_eq!(
            (get("R").uses, get("norme").uses, get("vect").uses),
            (3, 1, 1)
        );
        assert_eq!((get("lemme").uses, get("encadre").uses), (2, 0));
        // What each is, and how it is written.
        assert_eq!(get("argmax").kind, CustomKind::Operator);
        assert_eq!(get("lemme").kind, CustomKind::Theorem);
        assert_eq!(get("lemme").definition, "Lemme");
        assert!(get("R").math && get("norme").math && get("argmax").math);
        assert!(!get("cadre").math);
        assert_eq!(get("norme").usage, "\\norme{${1}}");
        assert_eq!(get("norme").sample, "$\\norme{a}$");
        assert_eq!(get("cadre").usage, "\\cadre{${2}}");
        assert_eq!(get("cadre").sample, "\\cadre{texte 2}");
        assert_eq!(
            get("encadre").usage,
            "\\begin{encadre}{${1}}\n\t${2}\n\\end{encadre}"
        );
        // Where: the file and the line of the name.
        assert!(get("vect").location.file.ends_with("partie.tex"));
        assert_eq!(get("norme").location.range.start.line, 3);
        // The definition as it is written, and whether the preamble has it.
        assert_eq!(get("R").source, "\\newcommand{\\R}{\\mathbb{R}}");
        assert_eq!(
            get("cadre").source,
            "\\newcommand{\\cadre}[2][noir]{\\fbox{#2}}"
        );
        assert_eq!(
            get("encadre").source,
            "\\newenvironment{encadre}[1]{\\textbf{#1}}{}"
        );
        assert_eq!(get("lemme").source, "\\newtheorem{lemme}{Lemme}");
        assert_eq!(
            get("vect").source,
            "\\newcommand{\\vect}[1]{\\overrightarrow{#1}}"
        );
        assert!(get("R").in_preamble && !get("vect").in_preamble);
    }

    fn spec(kind: CustomKind, name: &str, args: u8, body: &str) -> CommandSpec {
        CommandSpec {
            kind: Some(kind),
            name: name.into(),
            args,
            body: body.into(),
            ..CommandSpec::default()
        }
    }

    #[test]
    fn a_definition_is_read_whole() {
        let whole = |text: &str, name: &str| {
            let at = text.find(name).unwrap();
            text[statement(text, &(at..at + name.len()))].to_owned()
        };
        // On several lines, with `\def`, without braces around the name.
        let long = "x \\newcommand{\\long}[1]{%\n  \\textbf{#1}%\n}\ny";
        assert_eq!(
            whole(long, "long"),
            "\\newcommand{\\long}[1]{%\n  \\textbf{#1}%\n}"
        );
        assert_eq!(
            whole("\\def\\paire#1#2{(#1, #2)} z", "paire"),
            "\\def\\paire#1#2{(#1, #2)}"
        );
        assert_eq!(
            whole("\\newcommand\\court{x}\n\n{y}", "court"),
            "\\newcommand\\court{x}"
        );
        assert_eq!(
            whole("\\newcommand*{\\etoile}\n  {a}", "etoile"),
            "\\newcommand*{\\etoile}\n  {a}"
        );
        // Never past what is written.
        assert_eq!(
            whole("\\newcommand{\\ouvert}{x", "ouvert"),
            "\\newcommand{\\ouvert}"
        );
    }

    #[test]
    fn a_definition_is_written_from_its_fields() {
        let (_dir, ws, root) = project(&[("main.tex", MAIN), ("partie.tex", PART)]);
        let make = |s: &CommandSpec| draft(Some(&ws), Some(&root), s, Lang::Fr);
        let d = make(&spec(
            CustomKind::Command,
            "\\prodscal",
            2,
            "\\langle #1, #2 \\rangle",
        ));
        assert_eq!(
            d.code,
            "\\newcommand{\\prodscal}[2]{\\langle #1, #2 \\rangle}"
        );
        assert_eq!(d.usage, "\\prodscal{${1}}{${2}}");
        assert_eq!(d.sample, "$\\prodscal{a}{b}$");
        assert!(
            d.math && d.problems.is_empty() && d.notes.is_empty(),
            "{d:?}"
        );
        // A command of text, with an optional first argument.
        let mut s = spec(CustomKind::Command, "remarque", 2, "\\textbf{#1 :} #2");
        s.default = Some("Note".into());
        let d = make(&s);
        assert_eq!(
            d.code,
            "\\newcommand{\\remarque}[2][Note]{\\textbf{#1 :} #2}"
        );
        assert_eq!(d.sample, "\\remarque{texte 2}");
        assert!(!d.math && d.problems.is_empty());
        // A macro made of a macro of the project that needs a formula.
        assert!(make(&spec(CustomKind::Command, "plan", 0, "\\R^2")).math);
        // The other kinds.
        let d = make(&spec(CustomKind::Operator, "rang", 0, "rg"));
        assert_eq!(d.code, "\\DeclareMathOperator{\\rang}{rg}");
        assert_eq!(
            (d.sample.as_str(), d.packages.as_slice()),
            ("$\\rang$", ["amsmath".to_owned()].as_slice())
        );
        let d = make(&spec(CustomKind::Theorem, "definition", 0, "Définition"));
        assert_eq!(d.code, "\\newtheorem{definition}{Définition}");
        assert_eq!(
            d.sample,
            "\\begin{definition}\nDu texte.\n\\end{definition}"
        );
        let mut s = spec(
            CustomKind::Environment,
            "boite",
            1,
            "\\begin{center}\\textbf{#1}\\par",
        );
        s.end = "\\end{center}".into();
        let d = make(&s);
        assert_eq!(
            d.code,
            "\\newenvironment{boite}[1]{\\begin{center}\\textbf{#1}\\par}{\\end{center}}"
        );
        assert!(d.problems.is_empty(), "{d:?}");
    }

    #[test]
    fn what_cannot_be_added_is_said() {
        let (_dir, ws, root) = project(&[("main.tex", MAIN), ("partie.tex", PART)]);
        let problems = |s: &CommandSpec| draft(Some(&ws), Some(&root), s, Lang::Fr).problems;
        let one = |s: &CommandSpec, part: &str| {
            let p = problems(s);
            assert!(
                p.len() == 1 && p[0].contains(part),
                "{p:?} does not say {part}"
            );
        };
        one(
            &spec(CustomKind::Command, "norme2", 1, "#1"),
            "que de lettres",
        );
        one(&spec(CustomKind::Command, "", 0, "x"), "Donnez un nom");
        one(
            &spec(CustomKind::Command, "norme", 1, "#1"),
            "déjà défini dans le projet (main.tex, ligne 4)",
        );
        one(
            &spec(CustomKind::Command, "vect", 1, "#1"),
            "partie.tex, ligne 1",
        );
        one(
            &spec(CustomKind::Command, "textbf", 1, "#1"),
            "existe déjà dans LaTeX",
        );
        one(
            &spec(CustomKind::Command, "text", 1, "#1"),
            "package `amsmath`, que le document charge",
        );
        one(
            &spec(CustomKind::Environment, "itemize", 0, ""),
            "existe déjà dans LaTeX",
        );
        one(
            &spec(CustomKind::Theorem, "lemme", 0, "Lemme"),
            "déjà défini dans le projet",
        );
        one(
            &spec(CustomKind::Command, "double", 1, "#1 #2"),
            "utilise `#2`, et `\\double` a un seul argument",
        );
        one(
            &spec(CustomKind::Command, "ouvert", 0, "\\textbf{x"),
            "accolades",
        );
        one(
            &spec(CustomKind::Command, "vide", 0, " "),
            "définition est vide",
        );
        one(
            &spec(CustomKind::Operator, "rang", 0, ""),
            "nom que l'opérateur affiche",
        );
        let mut s = spec(CustomKind::Command, "defaut", 0, "x");
        s.default = Some("a".into());
        one(&s, "au moins un");
        // What prevents nothing is a note: an argument nobody uses, a name
        // a package that is not loaded has too.
        let d = draft(
            Some(&ws),
            Some(&root),
            &spec(CustomKind::Command, "inutile", 2, "#1"),
            Lang::Fr,
        );
        assert!(d.problems.is_empty());
        assert_eq!(
            d.notes,
            ["L'argument `#2` n'est pas utilisé dans la définition."]
        );
        let d = draft(
            Some(&ws),
            Some(&root),
            &spec(CustomKind::Command, "qty", 1, "#1"),
            Lang::En,
        );
        assert!(
            d.problems.is_empty() && d.notes[0].contains("package"),
            "{d:?}"
        );
        // `\#` is a character, not a parameter.
        assert!(problems(&spec(CustomKind::Command, "diese", 0, "\\#1")).is_empty());
        // Without a project, the definition is still written and checked.
        let d = draft(
            None,
            None,
            &spec(CustomKind::Command, "seul", 1, "\\emph{#1}"),
            Lang::En,
        );
        assert_eq!(d.code, "\\newcommand{\\seul}[1]{\\emph{#1}}");
        assert!(d.problems.is_empty());
    }
}
