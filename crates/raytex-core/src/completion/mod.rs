//! Context-aware completion.
//!
//! The editor sends the text around the cursor; [`complete`] works out the
//! context (see [`crate::syntax::context`]) and proposes:
//!
//! * commands from the project's own definitions, the curated knowledge
//!   base, **and every package actually loaded** (learned from their
//!   sources), ranked by mode (math/text), loaded packages and usage;
//! * environments with ready-to-fill snippets (`\end` included);
//! * labels with their real number and caption, citations searchable by
//!   author/title, installed packages and classes, package options, files,
//!   colors, TikZ libraries, glossary entries, `@` shortcuts, magic comments.
//!
//! Documentation is fetched lazily for the highlighted item ([`info`]).

pub mod data;
pub mod hints;
pub mod keys;

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::i18n::Lang;
use crate::kb::{KERNEL, Mode, kb};
use crate::settings::{CompletionSettings, Macro};
use crate::syntax::context::{ArgumentKind, CursorContext, FileKind, cursor_context};
use crate::syntax::{IncludeKind, LabelKind};
use crate::text::utf16_len;
use crate::workspace::Workspace;

/// A completion request.
#[derive(Debug, Clone, Copy)]
pub struct CompletionRequest<'a> {
    /// File being edited.
    pub file: &'a Path,
    /// Text before the cursor (a few KiB are enough).
    pub before: &'a str,
    /// Text after the cursor (a line or two).
    pub after: &'a str,
    /// Explicitly requested (Ctrl+Space) rather than triggered by typing.
    pub explicit: bool,
    /// Language of details and documentation.
    pub lang: Lang,
    /// Settings.
    pub settings: &'a CompletionSettings,
    /// User macros.
    pub macros: &'a [Macro],
}

/// Kind of a completion item (drives the icon).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    /// A command.
    Command,
    /// An environment.
    Environment,
    /// A label key.
    Label,
    /// A citation key.
    Citation,
    /// A package.
    Package,
    /// A document class.
    Class,
    /// A file.
    File,
    /// A color.
    Color,
    /// A built-in snippet.
    Snippet,
    /// A user macro.
    Macro,
    /// A math symbol.
    Symbol,
    /// An option or key.
    Option,
    /// A keyword (magic comments, placements).
    Keyword,
    /// A glossary entry.
    Glossary,
}

/// One proposal.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionItem {
    /// Text shown and matched.
    pub label: String,
    /// Kind.
    pub kind: ItemKind,
    /// Short detail shown next to the label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// Text inserted.
    pub apply: String,
    /// `apply` uses snippet fields (`${1:x}`).
    pub snippet: bool,
    /// Ranking boost (-99…99).
    pub boost: i8,
    /// Key for [`info`] (lazy documentation).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info: Option<String>,
    /// Unicode rendering of a symbol.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glyph: Option<String>,
    /// Package to add to the preamble when this item is chosen.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_package: Option<String>,
    /// Hex color (swatch).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Faster way to type it (`@a` for `\alpha`), shown to make the `@`
    /// shortcuts known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
}

impl CompletionItem {
    fn new(label: impl Into<String>, kind: ItemKind, apply: impl Into<String>) -> Self {
        let apply = apply.into();
        Self {
            label: label.into(),
            kind,
            detail: None,
            snippet: apply.contains("${"),
            apply,
            boost: 0,
            info: None,
            glyph: None,
            add_package: None,
            color: None,
            shortcut: None,
        }
    }

    fn detail(mut self, d: impl Into<String>) -> Self {
        let d = d.into();
        self.detail = (!d.is_empty()).then_some(d);
        self
    }

    fn boost(mut self, b: i32) -> Self {
        self.boost = b.clamp(-99, 99) as i8;
        self
    }

    fn info(mut self, key: impl Into<String>) -> Self {
        self.info = Some(key.into());
        self
    }
}

/// The answer to a completion request.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionList {
    /// UTF-16 units before the cursor replaced by the completion.
    pub from: u32,
    /// UTF-16 units after the cursor also replaced (e.g. an existing `}`).
    pub to_after: u32,
    /// While the typed text matches this regex, the editor may reuse the list.
    pub valid_for: Option<String>,
    /// Whether the editor should filter the items itself.
    pub filter: bool,
    /// Only the best items were sent: ask again after each keystroke.
    pub incomplete: bool,
    /// Proposals.
    pub items: Vec<CompletionItem>,
}

impl CompletionList {
    fn new(partial: &str, items: Vec<CompletionItem>) -> Self {
        Self {
            from: utf16_len(partial) as u32,
            to_after: 0,
            valid_for: None,
            filter: true,
            incomplete: false,
            items,
        }
    }

    fn valid_for(mut self, re: &str) -> Self {
        self.valid_for = Some(re.to_owned());
        self
    }
}

/// Computes completions at the cursor.
pub fn complete(ws: &Workspace, req: &CompletionRequest<'_>) -> Option<CompletionList> {
    if !req.settings.enabled {
        return None;
    }
    let ctx = cursor_context(req.before, req.after);
    let is_command = matches!(ctx, CursorContext::Command { .. });
    let c = Completer {
        ws,
        req,
        root: ws.root_for(req.file),
    };
    let list = match ctx {
        CursorContext::Command { partial, in_math } => c.commands(&partial, in_math),
        CursorContext::AtShortcut { partial, in_math } if req.settings.at_shortcuts => {
            c.at_shortcuts(&partial, in_math)
        }
        CursorContext::Argument {
            command,
            kind,
            partial,
            open_environment,
            closed,
        } => c.argument(&command, kind, &partial, open_environment, closed)?,
        CursorContext::Word { partial, in_math } if req.explicit && req.settings.snippets => {
            c.words(&partial, in_math)
        }
        CursorContext::MagicComment { partial } => c.magic(&partial),
        _ => return None,
    };
    let mut list = list;
    narrow(&mut list, req.before);
    for item in &mut list.items {
        // Values of keys are suggestions to keep (`title={Références}`).
        if item.snippet && item.kind != ItemKind::Macro && item.kind != ItemKind::Option {
            item.apply = empty_brace_fields(&item.apply);
        }
        if is_command && req.settings.at_shortcuts {
            // The shortcut of the user for this command first, then the
            // one RayTeX has.
            item.shortcut = item.label.strip_prefix('\\').and_then(|name| {
                req.macros
                    .iter()
                    .find(|m| at_key(m).is_some() && data::command_of(&m.body) == Some(name))
                    .map(|m| m.trigger.clone())
                    .or_else(|| data::at_shortcut_of(name).map(|k| format!("@{k}")))
            });
        }
    }
    (!list.items.is_empty()).then_some(list)
}

/// The key of a macro that is an `@` shortcut: its trigger without the `@`,
/// when it is a short word without spaces (`@v`, `@vec`).
pub fn at_key(m: &Macro) -> Option<&str> {
    let key = m.trigger.strip_prefix('@')?;
    let short = (1..=crate::syntax::context::AT_SHORTCUT_MAX).contains(&key.chars().count());
    (short && !key.contains(|c: char| c.is_whitespace() || "\\@{}$".contains(c))).then_some(key)
}

/// A snippet as it is shown next to its shortcut: fields become `…`.
fn preview(body: &str) -> String {
    static FIELD: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"\$\{\d+(?::([^}]*))?\}").unwrap());
    FIELD
        .replace_all(body, |c: &regex::Captures<'_>| {
            c.get(1)
                .map(|m| m.as_str())
                .filter(|t| !t.is_empty())
                .unwrap_or("…")
                .to_owned()
        })
        .into_owned()
}

/// What the free argument at the cursor expects (none when it has a list of
/// proposals, or is not an argument).
pub fn argument_hint(ws: &Workspace, req: &CompletionRequest<'_>) -> Option<hints::ArgumentHint> {
    if !req.settings.enabled {
        return None;
    }
    let CursorContext::Argument {
        kind: ArgumentKind::Keys(target),
        ..
    } = cursor_context(req.before, req.after)
    else {
        return None;
    };
    Completer {
        ws,
        req,
        root: ws.root_for(req.file),
    }
    .hint(&target)
}

/// Empties the snippet fields written between braces: `\section{${1:title}}`
/// becomes `\section{${1}}`, so completion creates the braces and the user
/// types the value. Defaults between brackets (`[${1:htbp}]`) are real
/// values and are kept.
pub fn empty_brace_fields(snippet: &str) -> String {
    let bytes = snippet.as_bytes();
    let mut out = String::with_capacity(snippet.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' && bytes.get(i + 1) == Some(&b'{') {
            let digits = bytes[i + 2..]
                .iter()
                .take_while(|b| b.is_ascii_digit())
                .count();
            let body = i + 2 + digits + 1;
            if digits > 0 && bytes.get(body - 1) == Some(&b':') {
                // End of the field: the brace closing it (escaped braces skipped).
                let (mut depth, mut j, mut end) = (0, body, None);
                while j < bytes.len() {
                    match bytes[j] {
                        b'\\' => j += 1,
                        b'{' => depth += 1,
                        b'}' if depth == 0 => {
                            end = Some(j);
                            break;
                        }
                        b'}' => depth -= 1,
                        _ => {}
                    }
                    j += 1;
                }
                if let Some(end) = end {
                    let default = &snippet[body..end];
                    let opened = out.ends_with('{') || out.ends_with("{\\");
                    let closed = bytes.get(end + 1) == Some(&b'}');
                    // A name of what to write (`[${1:term}]`) is not inserted
                    // either: the hint above the cursor says it.
                    let in_brackets = out.ends_with('[') && bytes.get(end + 1) == Some(&b']');
                    if (opened && closed || in_brackets && hints::is_placeholder_name(default))
                        && !default.contains("${")
                    {
                        out.push_str(&snippet[i..body - 1]);
                        out.push('}');
                        i = end + 1;
                        continue;
                    }
                }
            }
        }
        let ch = snippet[i..].chars().next().expect("char boundary");
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// A snippet as plain text: `${1:0.8}\\linewidth` gives `0.8\\linewidth`.
fn snippet_text(snippet: &str) -> String {
    regex::Regex::new(r"\$\{\d+(?::([^{}]*))?\}")
        .map(|re| re.replace_all(snippet, "$1").into_owned())
        .unwrap_or_else(|_| snippet.to_owned())
}

/// Most items sent for one request: the editor shows about a hundred, and
/// thousands of package commands would only cost time on the IPC bridge.
const MAX_ITEMS: usize = 1500;

/// Keeps the items the editor could match with what is already typed
/// (its characters in order, like the editor's fuzzy matcher), and only
/// the best ones when there are too many.
fn narrow(list: &mut CompletionList, before: &str) {
    if !list.filter {
        return;
    }
    let mut typed_len = 0;
    let mut start = before.len();
    for (i, ch) in before.char_indices().rev() {
        if typed_len >= list.from as usize {
            break;
        }
        typed_len += ch.len_utf16();
        start = i;
    }
    let typed: Vec<char> = before[start..]
        .chars()
        .flat_map(char::to_lowercase)
        .collect();
    if typed.len() > 1 {
        list.items.retain(|item| matches_typed(&typed, &item.label));
    }
    if list.items.len() > MAX_ITEMS {
        let prefix: String = typed.iter().collect();
        list.items.sort_by_cached_key(|item| {
            (
                !item.label.to_lowercase().starts_with(&prefix),
                -i32::from(item.boost),
            )
        });
        list.items.truncate(MAX_ITEMS);
        list.incomplete = true;
    }
}

/// Whether `typed` (lowercase) appears in order in `label`, ignoring case.
fn matches_typed(needle: &[char], haystack: &str) -> bool {
    let mut it = needle.iter().peekable();
    for c in haystack.chars().flat_map(char::to_lowercase) {
        match it.peek() {
            Some(&&n) if n == c => {
                it.next();
            }
            None => return true,
            _ => {}
        }
    }
    it.peek().is_none()
}

struct Completer<'a> {
    ws: &'a Workspace,
    req: &'a CompletionRequest<'a>,
    root: PathBuf,
}

fn usage_boost(count: u32) -> i32 {
    ((count as f32 + 1.0).ln() * 5.0).min(25.0) as i32
}

/// Snippet arguments `{${1}}{${2}}` for `args` mandatory arguments.
fn arg_snippet(args: u8, first_optional: bool, start: usize) -> String {
    let mandatory = if first_optional {
        args.saturating_sub(1)
    } else {
        args
    };
    (0..mandatory as usize)
        .map(|i| format!("{{${{{}}}}}", start + i))
        .collect()
}

impl Completer<'_> {
    fn lang(&self) -> Lang {
        self.req.lang
    }

    fn t<'s>(&self, fr: &'s str, en: &'s str) -> &'s str {
        self.req.lang.pick(fr, en)
    }

    fn loaded(&self) -> (Option<String>, Vec<String>, HashSet<String>) {
        let (class, packages) = self.ws.loaded_packages(&self.root);
        let loaded = kb().loaded_closure(class.as_deref(), packages.iter().map(String::as_str));
        (class, packages, loaded)
    }

    // ------------------------------------------------------------ commands

    fn commands(&self, partial: &str, in_math: bool) -> CompletionList {
        let kb = kb();
        let (class, packages, mut loaded) = self.loaded();
        let (usage, env_usage) = self.ws.usage(&self.root);
        let mut items = Vec::with_capacity(1500);
        let mut seen: HashSet<String> = HashSet::new();
        let file_name = |p: &Path| {
            p.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default()
        };

        // The project's own commands first.
        for (def, loc) in self.ws.command_definitions(&self.root) {
            if def.name.contains('@') || !seen.insert(def.name.clone()) {
                continue;
            }
            let apply = format!(
                "\\{}{}",
                def.name,
                arg_snippet(def.args, def.first_optional, 1)
            );
            let count = usage.get(&def.name).copied().unwrap_or(0);
            items.push(
                CompletionItem::new(format!("\\{}", def.name), ItemKind::Command, apply)
                    .detail(file_name(&loc.file))
                    .boost(20 + usage_boost(count) + if def.math && !in_math { -15 } else { 0 })
                    .info(format!("user:{}", def.name)),
            );
        }

        // Commands learned from the loaded packages' sources.
        let analyzer = self
            .ws
            .packages()
            .filter(|_| self.req.settings.learn_from_packages);
        let learned = analyzer
            .map(|a| a.closure(class.as_deref(), packages.iter().map(String::as_str)))
            .unwrap_or_default();
        for info in &learned {
            loaded.insert(info.name.clone());
        }

        // Curated knowledge base (documented, with snippets).
        for cmd in kb.commands() {
            if seen.contains(&cmd.name) {
                continue;
            }
            let Some(best) = kb.command(&cmd.name, Some(&loaded)) else {
                continue;
            };
            seen.insert(best.name.clone());
            let is_loaded = best.package == KERNEL || loaded.contains(&best.package);
            let mut boost = if is_loaded { 10 } else { -12 };
            boost += match (best.mode, in_math) {
                (Mode::Math, true) => 8,
                (Mode::Math, false) => -30,
                (Mode::Text, true) => -25,
                (Mode::Preamble, _) => -4,
                _ => 0,
            };
            boost += usage_boost(usage.get(&best.name).copied().unwrap_or(0));
            let mut item = CompletionItem::new(
                format!("\\{}", best.name),
                ItemKind::Command,
                format!("\\{}", best.snippet),
            )
            .info(format!("cmd:{}:{}", best.package, best.name));
            if best.glyph.is_some() {
                item.kind = ItemKind::Symbol;
                item.glyph = best.glyph.clone();
            }
            let pkg_label = if best.package == KERNEL {
                String::new()
            } else {
                best.package.clone()
            };
            if !is_loaded && self.req.settings.auto_add_package {
                item.add_package = Some(best.package.clone());
                item = item.detail(format!(
                    "{pkg_label} {}",
                    self.t("(ajoute le package)", "(adds the package)")
                ));
            } else {
                item = item.detail(pkg_label);
            }
            items.push(item.boost(boost));
        }

        for info in &learned {
            for c in &info.commands {
                if !seen.insert(c.name.clone()) {
                    continue;
                }
                let apply = format!("\\{}{}", c.name, arg_snippet(c.args, c.first_optional, 1));
                let mut boost = 4 + usage_boost(usage.get(&c.name).copied().unwrap_or(0));
                if c.math && !in_math {
                    boost -= 20;
                }
                items.push(
                    CompletionItem::new(format!("\\{}", c.name), ItemKind::Command, apply)
                        .detail(info.name.clone())
                        .boost(boost)
                        .info(format!("learned:{}:{}", info.name, c.name)),
                );
            }
        }

        // Commands used in the project but unknown otherwise.
        for (name, count) in &usage {
            if name.len() > 1 && !name.contains('@') && seen.insert(name.clone()) {
                items.push(
                    CompletionItem::new(
                        format!("\\{name}"),
                        ItemKind::Command,
                        format!("\\{name}"),
                    )
                    .detail(self.t("utilisée dans le projet", "used in the project"))
                    .boost(usage_boost(*count) - 5),
                );
            }
        }

        // "\begin{…}" shortcuts for the most relevant environments.
        for env in self
            .environment_items(true, &env_usage, &loaded, &learned, None)
            .into_iter()
            .take(80)
        {
            let mut env = env;
            env.label = format!("\\begin{{{}}}", env.label);
            env.apply = format!("\\begin{{{}", env.apply);
            env.boost = (env.boost as i32 - if in_math { 25 } else { 15 }).clamp(-99, 99) as i8;
            items.push(env);
        }

        // User macros with a trigger starting with a backslash.
        for m in self.req.macros {
            if let Some(name) = m.trigger.strip_prefix('\\') {
                items.push(
                    CompletionItem::new(format!("\\{name}"), ItemKind::Macro, m.body.clone())
                        .detail(m.name.clone())
                        .boost(30),
                );
            }
        }
        CompletionList::new(&format!("\\{partial}"), items).valid_for(r"^\\[a-zA-Z@*]*$")
    }

    // -------------------------------------------------------- environments

    /// Environment items; `apply` is `name}…\end{name}` (the caller adds `\begin{` when needed).
    fn environment_items(
        &self,
        with_body: bool,
        usage: &std::collections::HashMap<String, u32>,
        loaded: &HashSet<String>,
        learned: &[std::sync::Arc<crate::tex::PackageInfo>],
        rest_of_line_empty: Option<bool>,
    ) -> Vec<CompletionItem> {
        let kb = kb();
        let body = with_body && rest_of_line_empty.unwrap_or(true);
        let wrap = |name: &str, args: &str, inner: &str| -> String {
            if body {
                format!("{name}}}{args}\n{inner}\n\\end{{{name}}}")
            } else {
                format!("{name}}}{args}")
            }
        };
        let mut items = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        for (def, loc) in self.ws.environment_definitions(&self.root) {
            if !seen.insert(def.name.clone()) {
                continue;
            }
            let args = arg_snippet(def.args, def.theorem_title.is_some(), 1);
            let next = args.matches("${").count() + 1;
            let detail = def.theorem_title.clone().unwrap_or_else(|| {
                loc.file
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default()
            });
            items.push(
                CompletionItem::new(
                    def.name.clone(),
                    ItemKind::Environment,
                    wrap(&def.name, &args, &format!("\t${{{next}}}")),
                )
                .detail(detail)
                .boost(25 + usage_boost(usage.get(&def.name).copied().unwrap_or(0))),
            );
        }
        for env in kb.environments() {
            if seen.contains(&env.name) {
                continue;
            }
            let Some(best) = kb.environment(&env.name, Some(loaded)) else {
                continue;
            };
            seen.insert(best.name.clone());
            let is_loaded = best.package == KERNEL || loaded.contains(&best.package);
            let mut item = CompletionItem::new(
                best.name.clone(),
                ItemKind::Environment,
                wrap(&best.name, &best.snippet_args, &best.snippet_body),
            )
            .info(format!("env:{}:{}", best.package, best.name))
            .boost(
                if is_loaded { 10 } else { -12 }
                    + usage_boost(usage.get(&best.name).copied().unwrap_or(0)),
            );
            let pkg = if best.package == KERNEL {
                String::new()
            } else {
                best.package.clone()
            };
            if !is_loaded && self.req.settings.auto_add_package {
                item.add_package = Some(best.package.clone());
                item = item.detail(format!(
                    "{pkg} {}",
                    self.t("(ajoute le package)", "(adds the package)")
                ));
            } else {
                item = item.detail(pkg);
            }
            items.push(item);
        }
        for info in learned {
            for e in &info.environments {
                if !seen.insert(e.name.clone()) {
                    continue;
                }
                let args = arg_snippet(e.args, false, 1);
                let next = args.matches("${").count() + 1;
                items.push(
                    CompletionItem::new(
                        e.name.clone(),
                        ItemKind::Environment,
                        wrap(&e.name, &args, &format!("\t${{{next}}}")),
                    )
                    .detail(info.name.clone())
                    .boost(4 + usage_boost(usage.get(&e.name).copied().unwrap_or(0)))
                    .info(format!("learned-env:{}:{}", info.name, e.name)),
                );
            }
        }
        for (name, count) in usage {
            if seen.insert(name.clone()) {
                items.push(
                    CompletionItem::new(
                        name.clone(),
                        ItemKind::Environment,
                        wrap(name, "", "\t${1}"),
                    )
                    .boost(usage_boost(*count)),
                );
            }
        }
        items.sort_by(|a, b| b.boost.cmp(&a.boost).then_with(|| a.label.cmp(&b.label)));
        items
    }

    // ----------------------------------------------------------- arguments

    fn argument(
        &self,
        command: &str,
        kind: ArgumentKind,
        partial: &str,
        open_environment: Option<String>,
        closed: bool,
    ) -> Option<CompletionList> {
        let lang = self.lang();
        let key_re = r"^[^,{}\[\]\s]*$";
        let mut list = match kind {
            ArgumentKind::BeginEnvironment | ArgumentKind::EndEnvironment => {
                let begin = kind == ArgumentKind::BeginEnvironment;
                let (class, packages, mut loaded) = self.loaded();
                let learned = self
                    .ws
                    .packages()
                    .filter(|_| self.req.settings.learn_from_packages)
                    .map(|a| a.closure(class.as_deref(), packages.iter().map(String::as_str)))
                    .unwrap_or_default();
                for info in &learned {
                    loaded.insert(info.name.clone());
                }
                let (_, env_usage) = self.ws.usage(&self.root);
                // Existing text after the closing brace means we are renaming: no body.
                let after_brace = self.req.after.split_once('}').map(|(_, r)| r).unwrap_or("");
                let rest_empty = !closed
                    || after_brace
                        .split('\n')
                        .next()
                        .is_none_or(|l| l.trim().is_empty());
                let mut items =
                    self.environment_items(begin, &env_usage, &loaded, &learned, Some(rest_empty));
                if !begin {
                    for it in &mut items {
                        it.apply = format!("{}}}", it.label);
                        it.snippet = false;
                    }
                    if let Some(open) = &open_environment {
                        items.retain(|i| &i.label != open);
                        items.insert(
                            0,
                            CompletionItem::new(
                                open.clone(),
                                ItemKind::Environment,
                                format!("{open}}}"),
                            )
                            .detail(self.t("environnement ouvert", "open environment"))
                            .boost(99),
                        );
                    }
                }
                let mut list = CompletionList::new(partial, items).valid_for(r"^[a-zA-Z*@-]*$");
                if closed {
                    // Replace the existing closing brace (and any partial name after the cursor).
                    let tail: String = self
                        .req
                        .after
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '*')
                        .collect();
                    list.to_after = utf16_len(&tail) as u32 + 1;
                }
                list
            }
            ArgumentKind::Reference(cmd) => {
                let theorem_titles: std::collections::HashMap<String, String> = self
                    .ws
                    .environment_definitions(&self.root)
                    .into_iter()
                    .filter_map(|(d, _)| d.theorem_title.clone().map(|t| (d.name.clone(), t)))
                    .collect();
                let items = self
                    .ws
                    .labels(&self.root)
                    .into_iter()
                    .map(|l| {
                        let kind_name = label_kind_name(&l.kind, lang, &theorem_titles);
                        let number = l
                            .resolved
                            .as_ref()
                            .map(|r| format!(" {}", r.number))
                            .unwrap_or_default();
                        let context = l
                            .context
                            .as_ref()
                            .map(|c| format!(" — {c}"))
                            .unwrap_or_default();
                        let boost = match (&l.kind, cmd.as_str()) {
                            (LabelKind::Equation, "eqref") => 20,
                            (LabelKind::Equation, _) => -2,
                            _ => 0,
                        };
                        CompletionItem::new(l.name.clone(), ItemKind::Label, l.name.clone())
                            .detail(format!("{kind_name}{number}{context}"))
                            .boost(boost)
                            .info(format!("label:{}", l.name))
                    })
                    .collect();
                CompletionList::new(partial, items).valid_for(key_re)
            }
            ArgumentKind::Citation => self.citations(partial),
            ArgumentKind::Package | ArgumentKind::Class => {
                self.packages(partial, kind == ArgumentKind::Class)
            }
            ArgumentKind::PackageOptions { package, class } => {
                let package = package?;
                // Packages configured by keys (geometry, hyperref…): their keys and values.
                let key_sets: Vec<(usize, &keys::KeySet)> = keys::sets()
                    .iter()
                    .enumerate()
                    .filter(|(_, s)| !class && s.options_of.contains(&package))
                    .collect();
                let from_keys = if key_sets.is_empty() {
                    None
                } else {
                    self.key_items(&key_sets, partial)
                };
                if partial.contains('=') {
                    return from_keys;
                }
                let mut items = from_keys.map(|l| l.items).unwrap_or_default();
                let kbp = if class {
                    kb().class(&package)
                } else {
                    kb().package(&package)
                };
                let mut seen = HashSet::new();
                if let Some(p) = kbp {
                    for o in &p.options {
                        if seen.insert(o.name.clone()) {
                            items.push(
                                CompletionItem::new(
                                    o.name.clone(),
                                    ItemKind::Option,
                                    o.name.clone(),
                                )
                                .detail(o.doc.get(lang).to_owned())
                                .boost(10),
                            );
                        }
                    }
                }
                if matches!(package.as_str(), "babel" | "polyglossia") {
                    for l in data::LANGUAGES {
                        if seen.insert((*l).to_owned()) {
                            items.push(CompletionItem::new(*l, ItemKind::Option, *l));
                        }
                    }
                }
                if let Some(a) = self.ws.packages() {
                    for o in &a.analyze(&package, class).options {
                        if seen.insert(o.clone()) && !items.iter().any(|i| &i.label == o) {
                            items.push(CompletionItem::new(o.clone(), ItemKind::Option, o.clone()));
                        }
                    }
                }
                CompletionList::new(partial, items).valid_for(r"^[^,=\]\s]*$")
            }
            ArgumentKind::File(kind) => self.files(command, kind, partial),
            ArgumentKind::Color => {
                let mut items: Vec<CompletionItem> = data::BASE_COLORS
                    .iter()
                    .map(|(n, hex)| {
                        let mut i = CompletionItem::new(*n, ItemKind::Color, *n).boost(5);
                        i.color = Some((*hex).to_owned());
                        i
                    })
                    .collect();
                let dvips = self.ws.project_documents(&self.root).iter().any(|d| {
                    d.index
                        .packages
                        .iter()
                        .any(|p| p.name == "xcolor" && p.options.iter().any(|o| o == "dvipsnames"))
                });
                if dvips {
                    items.extend(data::DVIPS_COLORS.iter().map(|(n, hex)| {
                        let mut i = CompletionItem::new(*n, ItemKind::Color, *n);
                        i.color = Some((*hex).to_owned());
                        i
                    }));
                }
                for doc in self.ws.project_documents(&self.root) {
                    for c in &doc.index.colors {
                        items.push(
                            CompletionItem::new(c.name.clone(), ItemKind::Color, c.name.clone())
                                .detail(self.t("défini dans le projet", "defined in the project"))
                                .boost(20),
                        );
                    }
                }
                CompletionList::new(partial, items).valid_for(r"^[a-zA-Z!0-9-]*$")
            }
            ArgumentKind::TikzLibrary => {
                let items = data::TIKZ_LIBRARIES
                    .iter()
                    .map(|l| CompletionItem::new(*l, ItemKind::Option, *l))
                    .collect();
                CompletionList::new(partial, items).valid_for(r"^[a-zA-Z0-9.]*$")
            }
            ArgumentKind::Glossary => {
                let mut items = Vec::new();
                for doc in self.ws.project_documents(&self.root) {
                    for g in &doc.index.glossary {
                        items.push(
                            CompletionItem::new(g.key.clone(), ItemKind::Glossary, g.key.clone())
                                .detail(g.description.clone()),
                        );
                    }
                }
                CompletionList::new(partial, items).valid_for(key_re)
            }
            ArgumentKind::Placement => {
                let items = data::PLACEMENTS
                    .iter()
                    .enumerate()
                    .map(|(i, (p, en, fr))| {
                        CompletionItem::new(*p, ItemKind::Keyword, *p)
                            .detail(lang.pick(fr, en))
                            .boost(10 - i as i32)
                    })
                    .collect();
                CompletionList::new(partial, items)
            }
            ArgumentKind::Keys(target) => {
                let sets = self.key_sets(&target);
                if sets.is_empty() {
                    return None;
                }
                self.key_items(&sets, partial)?
            }
        };
        if list.items.is_empty() {
            return None;
        }
        list.items
            .dedup_by(|a, b| a.label == b.label && a.kind == b.kind);
        Some(list)
    }

    /// Key sets of an argument (`\\includegraphics[1]`) whose package is loaded.
    fn key_sets(&self, target: &str) -> Vec<(usize, &'static keys::KeySet)> {
        let (class, _, loaded) = self.loaded();
        let available = |package: &str| {
            package == "latex"
                || match package.strip_prefix("class:") {
                    Some(c) => class.as_deref() == Some(c),
                    None => loaded.contains(package),
                }
        };
        keys::sets()
            .iter()
            .enumerate()
            .filter(|(_, s)| s.targets.iter().any(|t| t == target) && available(&s.package))
            .collect()
    }

    /// What the free argument `target` (`\\item[1]`, `minipage{1}`) expects.
    fn hint(&self, target: &str) -> Option<hints::ArgumentHint> {
        if !self.key_sets(target).is_empty() {
            return None;
        }
        let at = target.find(['[', '{'])?;
        let (head, rest) = target.split_at(at);
        let open = rest.chars().next()?;
        let position: usize = rest[1..rest.len() - 1].parse().ok()?;
        let lang = self.lang();
        let (_, _, loaded) = self.loaded();
        if let Some(name) = head.strip_prefix('\\') {
            if let Some((def, _)) = self
                .ws
                .command_definitions(&self.root)
                .into_iter()
                .find(|(d, _)| d.name == name)
            {
                let args: String = (1..=def.args)
                    .map(|i| {
                        if i == 1 && def.first_optional {
                            "[#1]".to_owned()
                        } else {
                            format!("{{#{i}}}")
                        }
                    })
                    .collect();
                let mut h = hints::hint(head, &args, open, position, target, lang)?;
                h.doc = match lang {
                    Lang::Fr => format!("Argument {} de \\{name}, défini dans le projet.", h.name),
                    Lang::En => format!("Argument {} of \\{name}, defined in the project.", h.name),
                };
                return Some(h);
            }
            let kb = kb();
            let cmd = kb
                .commands_named(name)
                .find(|c| c.package == KERNEL || loaded.contains(&c.package))
                .or_else(|| kb.commands_named(name).next())?;
            hints::hint(head, &cmd.args, open, position, target, lang)
        } else {
            let env = kb().environment(head, Some(&loaded))?;
            hints::hint(
                &format!("\\begin{{{head}}}"),
                &env.args,
                open,
                position,
                target,
                lang,
            )
        }
    }

    /// Keys of `sets` (documented first, then those read from the
    /// packages), or the values of the key typed before `=`.
    fn key_items(&self, sets: &[(usize, &keys::KeySet)], partial: &str) -> Option<CompletionList> {
        let lang = self.lang();
        if let Some((key, value)) = partial.split_once('=') {
            let key = key.trim();
            let k = sets
                .iter()
                .flat_map(|(_, s)| &s.keys)
                .find(|k| k.name == key)?;
            let items: Vec<CompletionItem> = k
                .values
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    CompletionItem::new(v.name(), ItemKind::Keyword, v.name())
                        .detail(v.doc(lang))
                        .boost(40 - i as i32)
                })
                .collect();
            return (!items.is_empty())
                .then(|| CompletionList::new(value.trim_start(), items).valid_for(r"^[^,\]}]*$"));
        }
        let mut seen = HashSet::new();
        let mut items = Vec::new();
        for (index, set) in sets.iter() {
            for (j, k) in set.keys.iter().enumerate() {
                if !seen.insert(k.name.clone()) {
                    continue;
                }
                let apply = match &k.value {
                    Some(v) => format!("{}={v}", k.name),
                    None if !k.values.is_empty() => format!("{}=", k.name),
                    None => k.name.clone(),
                };
                items.push(
                    CompletionItem::new(k.name.clone(), ItemKind::Option, apply)
                        .detail(k.doc(lang))
                        .boost(60 - j as i32)
                        .info(format!("key:{index}:{}", k.name)),
                );
            }
        }
        if self.req.settings.learn_from_packages
            && let Some(analyzer) = self.ws.packages()
        {
            for (index, set) in sets {
                for name in keys::learned(*index, |f| analyzer.index().find(f)) {
                    if seen.insert(name.clone()) {
                        items.push(
                            CompletionItem::new(name.clone(), ItemKind::Option, name.clone())
                                .detail(set.package.clone())
                                .boost(-60)
                                .info(format!("keylearned:{}:{name}", set.package)),
                        );
                    }
                }
            }
        }
        Some(CompletionList::new(partial, items).valid_for(r"^[^,=\]}]*$"))
    }

    fn citations(&self, partial: &str) -> CompletionList {
        let needle = partial.to_lowercase();
        let words: Vec<&str> = needle.split_whitespace().collect();
        let mut scored: Vec<(i32, CompletionItem)> = self
            .ws
            .citations(&self.root)
            .into_iter()
            .filter_map(|c| {
                let s = &c.summary;
                let key = s.key.to_lowercase();
                let haystack = format!("{} {} {} {} {}", key, s.authors, s.title, s.year, s.venue)
                    .to_lowercase();
                let score = if words.is_empty() {
                    0
                } else if key.starts_with(&needle) {
                    100
                } else if words.iter().all(|w| haystack.contains(w)) {
                    50
                } else {
                    return None;
                };
                let detail = match (s.authors.is_empty(), s.year.is_empty()) {
                    (false, false) => format!("{} ({}) — {}", s.authors, s.year, s.title),
                    (false, true) => format!("{} — {}", s.authors, s.title),
                    _ => s.title.clone(),
                };
                Some((
                    score,
                    CompletionItem::new(s.key.clone(), ItemKind::Citation, s.key.clone())
                        .detail(crate::text::ellipsize(&detail, 90))
                        .info(format!("cite:{}", s.key)),
                ))
            })
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.label.cmp(&b.1.label)));
        let mut list = CompletionList::new(partial, scored.into_iter().map(|(_, i)| i).collect());
        list.filter = false;
        list
    }

    fn packages(&self, partial: &str, class: bool) -> CompletionList {
        let lang = self.lang();
        let kb = kb();
        let installed: Vec<String> = self
            .ws
            .packages()
            .map(|a| {
                if class {
                    a.index().classes()
                } else {
                    a.index().packages()
                }
            })
            .unwrap_or_default();
        let installed_set: HashSet<&str> = installed.iter().map(String::as_str).collect();
        let mut items: Vec<(i32, CompletionItem)> = Vec::new();
        let needle = partial.to_lowercase();
        let score = |name: &str| -> Option<i32> {
            let n = name.to_lowercase();
            if needle.is_empty() {
                Some(0)
            } else if n == needle {
                Some(300)
            } else if n.starts_with(&needle) {
                Some(200 - n.len() as i32)
            } else if n.contains(&needle) {
                Some(100 - n.len() as i32)
            } else if is_subsequence(&needle, &n) {
                Some(10 - n.len() as i32)
            } else {
                None
            }
        };
        let mut seen = HashSet::new();
        for p in kb.packages().iter().filter(|p| p.class == class) {
            let Some(s) = score(&p.name) else { continue };
            seen.insert(p.name.clone());
            let not_installed =
                !installed_set.is_empty() && !installed_set.contains(p.name.as_str());
            let mut detail = p.description.get(lang).to_owned();
            if not_installed {
                detail = format!("{} {detail}", self.t("(non installé)", "(not installed)"));
            }
            items.push((
                s + 40 - if not_installed { 30 } else { 0 },
                CompletionItem::new(
                    p.name.clone(),
                    if class {
                        ItemKind::Class
                    } else {
                        ItemKind::Package
                    },
                    p.name.clone(),
                )
                .detail(crate::text::ellipsize(&detail, 100))
                .info(format!(
                    "pkg:{}:{}",
                    if class { "class" } else { "package" },
                    p.name
                )),
            ));
        }
        for name in &installed {
            if seen.contains(name) {
                continue;
            }
            let Some(s) = score(name) else { continue };
            items.push((
                s,
                CompletionItem::new(
                    name.clone(),
                    if class {
                        ItemKind::Class
                    } else {
                        ItemKind::Package
                    },
                    name.clone(),
                )
                .detail(self.t("installé", "installed"))
                .info(format!(
                    "pkg:{}:{name}",
                    if class { "class" } else { "package" }
                )),
            ));
        }
        items.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.label.cmp(&b.1.label)));
        items.truncate(300);
        let mut list = CompletionList::new(partial, items.into_iter().map(|(_, i)| i).collect());
        list.filter = false;
        list
    }

    fn files(&self, command: &str, kind: FileKind, partial: &str) -> CompletionList {
        let base = self
            .root
            .parent()
            .unwrap_or(&self.ws.root_dir)
            .to_path_buf();
        let exts: &[&str] = match kind {
            FileKind::Tex => &["tex"],
            FileKind::Graphics => &[
                "pdf", "png", "jpg", "jpeg", "eps", "svg", "gif", "bmp", "tif", "tiff",
            ],
            FileKind::Bib => &["bib"],
            FileKind::Any => &[],
        };
        let strip_ext = matches!(
            command,
            "include"
                | "input"
                | "subfile"
                | "includeonly"
                | "bibliography"
                | "import"
                | "subimport"
        );
        let graphics_paths: Vec<String> = self
            .ws
            .project_documents(&self.root)
            .iter()
            .flat_map(|d| d.index.graphics_paths.clone())
            .collect();
        let mut items = Vec::new();
        let walker = ignore::WalkBuilder::new(&self.ws.root_dir)
            .hidden(true)
            .max_depth(Some(8))
            .build();
        for entry in walker.flatten().take(5000) {
            let path = entry.path();
            if !entry.file_type().is_some_and(|t| t.is_file()) {
                continue;
            }
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !exts.is_empty() && !exts.contains(&ext.as_str()) {
                continue;
            }
            if path == self.req.file {
                continue;
            }
            if path.components().any(|c| c.as_os_str() == "build") && kind != FileKind::Any {
                continue;
            }
            let mut rel = relative(&base, path);
            for gp in &graphics_paths {
                if kind == FileKind::Graphics
                    && let Some(r) = rel.strip_prefix(gp.trim_start_matches("./"))
                {
                    rel = r.to_owned();
                }
            }
            if strip_ext && let Some(stem) = rel.strip_suffix(&format!(".{ext}")) {
                rel = stem.to_owned();
            }
            items.push(
                CompletionItem::new(rel.clone(), ItemKind::File, rel)
                    .info(format!("file:{}", path.to_string_lossy())),
            );
        }
        items.sort_by(|a, b| a.label.cmp(&b.label));
        CompletionList::new(partial, items).valid_for(r"^[^,{}\s]*$")
    }

    // ---------------------------------------------------- other contexts

    fn at_shortcuts(&self, partial: &str, in_math: bool) -> CompletionList {
        let glyph_of = |body: &str| {
            data::command_of(body)
                .or_else(|| body.strip_prefix('\\'))
                .and_then(|name| kb().command(name, None))
                .and_then(|c| c.glyph.clone())
        };
        // The shortcuts of the user (macros whose trigger starts with `@`)
        // come first, and take the place of those of RayTeX with the same
        // key. A macro of formulas is only offered in a formula.
        let mut items: Vec<CompletionItem> = self
            .req
            .macros
            .iter()
            .filter(|m| at_key(m).is_some() && (in_math || !m.math))
            .map(|m| {
                let mut item =
                    CompletionItem::new(m.trigger.clone(), ItemKind::Macro, m.body.clone())
                        .detail(if m.name.is_empty() || m.name == m.body {
                            preview(&m.body)
                        } else {
                            m.name.clone()
                        })
                        .boost(30);
                item.glyph = glyph_of(&m.body);
                item
            })
            .collect();
        // A key of the user hides the one of RayTeX everywhere, also where
        // its own macro is not offered (a macro of formulas, in text).
        let own: Vec<&str> = self.req.macros.iter().filter_map(at_key).collect();
        items.extend(
            data::AT_SHORTCUTS
                .iter()
                .filter(|(k, _)| !own.contains(k))
                .map(|(k, v)| {
                    let mut item = CompletionItem::new(format!("@{k}"), ItemKind::Symbol, *v)
                        .detail(preview(v));
                    item.glyph = glyph_of(v);
                    item
                }),
        );
        CompletionList::new(&format!("@{partial}"), items).valid_for(r"^@[^\s\\@{}$]{0,12}$")
    }

    fn words(&self, partial: &str, in_math: bool) -> CompletionList {
        let lang = self.lang();
        let mut items = Vec::new();
        for m in self.req.macros {
            if !m.trigger.is_empty() && !m.trigger.starts_with('\\') {
                items.push(
                    CompletionItem::new(m.trigger.clone(), ItemKind::Macro, m.body.clone())
                        .detail(m.name.clone())
                        .boost(if m.math == in_math { 20 } else { 0 }),
                );
            }
        }
        for s in data::snippets() {
            items.push(
                CompletionItem::new(s.trigger.clone(), ItemKind::Snippet, s.body.clone())
                    .detail(s.name.get(lang).to_owned())
                    .boost(if s.math == in_math { 10 } else { -10 })
                    .info(format!("snippet:{}", s.trigger)),
            );
        }
        CompletionList::new(partial, items).valid_for(r"^[\w*]*$")
    }

    fn magic(&self, partial: &str) -> CompletionList {
        let mut items = Vec::new();
        for (label, detail) in [
            (" !TEX program = pdflatex", "pdfLaTeX"),
            (" !TEX program = xelatex", "XeLaTeX"),
            (" !TEX program = lualatex", "LuaLaTeX"),
            (" !TEX root = ", self.t("fichier principal", "main file")),
            (
                " !TEX spellcheck = fr",
                self.t("langue du correcteur", "spell-check language"),
            ),
            (" !BIB program = biber", "Biber"),
            (" !BIB program = bibtex", "BibTeX"),
        ] {
            items.push(CompletionItem::new(label.trim(), ItemKind::Keyword, label).detail(detail));
        }
        CompletionList::new(partial, items)
    }
}

/// Localized name of a label kind.
pub fn label_kind_name(
    kind: &LabelKind,
    lang: Lang,
    theorems: &std::collections::HashMap<String, String>,
) -> String {
    match kind {
        LabelKind::Section => lang.pick("Section", "Section").into(),
        LabelKind::Figure => lang.pick("Figure", "Figure").into(),
        LabelKind::Table => lang.pick("Tableau", "Table").into(),
        LabelKind::Equation => lang.pick("Équation", "Equation").into(),
        LabelKind::Theorem(env) => theorems.get(env).cloned().unwrap_or_else(|| {
            let mut c = env.chars();
            c.next()
                .map(|f| f.to_uppercase().chain(c).collect())
                .unwrap_or_default()
        }),
        LabelKind::Item => lang.pick("Élément", "Item").into(),
        LabelKind::Listing => lang.pick("Listing", "Listing").into(),
        LabelKind::Algorithm => lang.pick("Algorithme", "Algorithm").into(),
        LabelKind::Frame => lang.pick("Diapositive", "Slide").into(),
        LabelKind::Other => lang.pick("Label", "Label").into(),
    }
}

fn is_subsequence(needle: &str, hay: &str) -> bool {
    let mut it = hay.chars();
    needle.chars().all(|c| it.any(|h| h == c))
}

/// `path` relative to `base`, with `/` separators (`../` when outside).
pub fn relative(base: &Path, path: &Path) -> String {
    let base: Vec<_> = base.components().collect();
    let target: Vec<_> = path.components().collect();
    let common = base.iter().zip(&target).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<String> =
        std::iter::repeat_n("..".to_owned(), base.len() - common).collect();
    parts.extend(
        target[common..]
            .iter()
            .map(|c| c.as_os_str().to_string_lossy().into_owned()),
    );
    parts.join("/")
}

// --------------------------------------------------------------- docs

/// Lazy documentation (markdown) for an item's `info` key.
pub fn info(ws: &Workspace, file: &Path, key: &str, lang: Lang) -> Option<String> {
    let root = ws.root_for(file);
    let (kind, rest) = key.split_once(':')?;
    match kind {
        "cmd" => {
            let (pkg, name) = rest.split_once(':')?;
            let cmd = kb().commands_named(name).find(|c| c.package == pkg)?;
            Some(kb().command_markdown(cmd, lang))
        }
        "env" => {
            let (pkg, name) = rest.split_once(':')?;
            let env = kb().environment(name, Some(&HashSet::from([pkg.to_owned()])))?;
            Some(kb().environment_markdown(env, lang))
        }
        "key" => {
            let (index, name) = rest.split_once(':')?;
            let set = keys::sets().get(index.parse::<usize>().ok()?)?;
            let key = set.keys.iter().find(|k| k.name == name)?;
            let mut md = format!("**`{name}`**");
            match &key.value {
                Some(v) => md.push_str(&format!(" `={}`", snippet_text(v))),
                None if !key.values.is_empty() => md.push_str(" `=…`"),
                None => {}
            }
            md.push_str(&format!("\n\n{}", key.doc(lang)));
            if !key.values.is_empty() {
                md.push_str(&format!("\n\n**{}**\n", lang.pick("Valeurs", "Values")));
                for v in &key.values {
                    let doc = v.doc(lang);
                    md.push_str(&format!(
                        "\n- `{}`{}",
                        v.name(),
                        if doc.is_empty() {
                            String::new()
                        } else {
                            format!(" — {doc}")
                        }
                    ));
                }
            }
            let package = set.package.strip_prefix("class:").unwrap_or(&set.package);
            if package != "latex" {
                md.push_str(&format!(
                    "\n\n*{} [{package}](https://ctan.org/pkg/{package})*",
                    lang.pick("Clé du package", "Key of the package")
                ));
            }
            Some(md)
        }
        "keylearned" => {
            let (package, name) = rest.split_once(':')?;
            Some(format!(
                "**`{name}`**\n\n{} `{package}` {}\n\n[{}](https://ctan.org/pkg/{package})",
                lang.pick("Clé déclarée par le package", "Key declared by the"),
                lang.pick("(lue dans sa source).", "package (read from its source)."),
                lang.pick(
                    "Documentation du package sur CTAN",
                    "Package documentation on CTAN"
                )
            ))
        }
        "learned" | "learned-env" => {
            let (pkg, name) = rest.split_once(':')?;
            let what = if kind == "learned" {
                format!("`\\{name}`")
            } else {
                format!("`\\begin{{{name}}}`")
            };
            Some(format!(
                "{what}\n\n{} `{pkg}` {}\n\n[{}](https://ctan.org/pkg/{pkg})",
                lang.pick("Défini par le package", "Defined by the"),
                lang.pick("(analyse de sa source).", "package (read from its source)."),
                lang.pick(
                    "Documentation du package sur CTAN",
                    "Package documentation on CTAN"
                )
            ))
        }
        "user" => {
            let (def, loc) = ws
                .command_definitions(&root)
                .into_iter()
                .find(|(d, _)| d.name == rest)?;
            let file = loc.file.file_name()?.to_string_lossy().into_owned();
            Some(format!(
                "`\\{}`{}\n\n```latex\n{}\n```\n\n*{} {file}, {} {}*",
                def.name,
                if def.args > 0 {
                    format!(
                        " — {} {}",
                        def.args,
                        lang.pick("argument(s)", "argument(s)")
                    )
                } else {
                    String::new()
                },
                def.definition,
                lang.pick("Défini dans", "Defined in"),
                lang.pick("ligne", "line"),
                loc.range.start.line + 1
            ))
        }
        "label" => {
            let l = ws.labels(&root).into_iter().find(|l| l.name == rest)?;
            let theorems = std::collections::HashMap::new();
            let mut md = format!(
                "**{}** `{}`",
                label_kind_name(&l.kind, lang, &theorems),
                l.name
            );
            if let Some(r) = &l.resolved {
                md.push_str(&format!(
                    " — {} {}, {} {}",
                    lang.pick("n°", "no."),
                    r.number,
                    lang.pick("page", "page"),
                    r.page
                ));
            }
            if let Some(c) = &l.context {
                md.push_str(&format!("\n\n{c}"));
            }
            let file = l.location.file.file_name()?.to_string_lossy().into_owned();
            md.push_str(&format!("\n\n*{file}:{}*", l.location.range.start.line + 1));
            Some(md)
        }
        "cite" => {
            for f in ws.bib_files(&root) {
                let doc = ws.document(&f)?;
                if let Some(e) = doc.bib.as_ref()?.get(rest) {
                    let mut md = format!("**{}** — @{}\n\n", e.key, e.kind);
                    for (k, v) in &e.fields {
                        if matches!(k.as_str(), "abstract" | "file" | "keywords") {
                            continue;
                        }
                        md.push_str(&format!(
                            "- **{k}**: {}\n",
                            crate::syntax::plain::to_plain(v)
                        ));
                    }
                    return Some(md);
                }
            }
            None
        }
        "pkg" => {
            let (what, name) = rest.split_once(':')?;
            let class = what == "class";
            let kbp = if class {
                kb().class(name)
            } else {
                kb().package(name)
            };
            let mut md = format!("**{name}**\n\n");
            if let Some(p) = kbp {
                md.push_str(p.description.get(lang));
                md.push_str("\n\n");
            }
            if let Some(a) = ws.packages() {
                let info = a.analyze(name, class);
                if let Some(d) = &info.description {
                    md.push_str(&format!("*{d}*\n\n"));
                }
                if info.installed {
                    md.push_str(&format!(
                        "{} {} {}, {} {}\n\n",
                        lang.pick("Installé —", "Installed —"),
                        info.commands.len(),
                        lang.pick("commandes", "commands"),
                        info.environments.len(),
                        lang.pick("environnements", "environments")
                    ));
                } else {
                    md.push_str(lang.pick(
                        "**Non installé.** Installez-le depuis le panneau Packages.\n\n",
                        "**Not installed.** Install it from the Packages panel.\n\n",
                    ));
                }
            }
            md.push_str(&format!("[CTAN](https://ctan.org/pkg/{name})"));
            Some(md)
        }
        "snippet" => {
            let s = data::snippets().iter().find(|s| s.trigger == rest)?;
            Some(format!(
                "**{}**\n\n```latex\n{}\n```",
                s.name.get(lang),
                s.body
            ))
        }
        "file" => Some(format!("`{rest}`")),
        _ => None,
    }
}

/// Include kinds that point at files (re-exported for the desktop crate).
pub fn is_file_include(kind: IncludeKind) -> bool {
    !matches!(kind, IncludeKind::Other)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::log::normalize;

    #[test]
    fn narrowing_keeps_fuzzy_matches_only() {
        let (_d, ws, main) = ws();
        let s = CompletionSettings::default();
        let all = complete(&ws, &req(&main, "\\", "", &s)).unwrap();
        let sec = complete(&ws, &req(&main, "x \\sec", "", &s)).unwrap();
        assert!(sec.items.len() < all.items.len());
        assert!(sec.items.iter().any(|i| i.label == "\\section"));
        assert!(
            sec.items.iter().any(|i| i.label == "\\subsection"),
            "fuzzy matches are kept"
        );
        assert!(
            sec.items
                .iter()
                .all(|i| matches_typed(&['\\', 's', 'e', 'c'], &i.label))
        );
        assert!(matches_typed(&['n', 'o'], "\\NoRm"));
        assert!(!matches_typed(&['o', 'n'], "no"));
    }

    fn ws() -> (tempfile::TempDir, Workspace, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        std::fs::create_dir_all(p.join("figures")).unwrap();
        std::fs::write(p.join("figures/plot.png"), [0u8; 4]).unwrap();
        std::fs::write(
            p.join("main.tex"),
            "\\documentclass{article}\n\\usepackage{amsmath}\n\\newcommand{\\norm}[1]{\\lVert#1\\rVert}\n\\newtheorem{thm}{Théorème}\n\\addbibresource{refs.bib}\n\\begin{document}\n\\section{Intro}\\label{sec:intro}\n\\begin{equation}E=mc^2\\label{eq:e}\\end{equation}\n\\end{document}\n",
        )
        .unwrap();
        std::fs::write(p.join("refs.bib"), "@book{knuth84, author={Knuth, Donald}, title={The TeXbook}, year=1984}\n@article{lamport, author={Lamport, Leslie}, title={LaTeX}, year=1986}\n").unwrap();
        let ws = Workspace::open(p);
        let main = normalize(&p.join("main.tex"));
        (dir, ws, main)
    }

    fn req<'a>(
        file: &'a Path,
        before: &'a str,
        after: &'a str,
        settings: &'a CompletionSettings,
    ) -> CompletionRequest<'a> {
        CompletionRequest {
            file,
            before,
            after,
            explicit: false,
            lang: Lang::Fr,
            settings,
            macros: &[],
        }
    }

    #[test]
    fn commands_are_ranked_by_context() {
        let (_d, ws, main) = ws();
        let s = CompletionSettings::default();
        let typed = complete(&ws, &req(&main, "texte $x + \\al", "", &s)).unwrap();
        assert_eq!(typed.from, 3);
        assert!(typed.items.iter().any(|i| i.label == "\\alpha"));
        let list = complete(&ws, &req(&main, "texte $x + \\", "", &s)).unwrap();
        let alpha = list.items.iter().find(|i| i.label == "\\alpha").unwrap();
        assert_eq!(alpha.glyph.as_deref(), Some("α"));
        let norm = list.items.iter().find(|i| i.label == "\\norm").unwrap();
        assert_eq!(norm.apply, "\\norm{${1}}");
        let mathbb = list.items.iter().find(|i| i.label == "\\mathbb").unwrap();
        assert_eq!(mathbb.add_package.as_deref(), Some("amsfonts"));
        let section = list.items.iter().find(|i| i.label == "\\section").unwrap();
        assert!(
            alpha.boost > section.boost,
            "math symbols first in math mode"
        );
        assert!(list.items.iter().any(|i| i.label == "\\begin{itemize}"));
    }

    #[test]
    fn keys_and_values_of_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        std::fs::write(
            p.join("main.tex"),
            "\\documentclass{article}\n\\usepackage{graphicx,enumitem,hyperref}\n\\begin{document}\n\\end{document}\n",
        )
        .unwrap();
        let ws = Workspace::open(p);
        let main = normalize(&p.join("main.tex"));
        let s = CompletionSettings::default();
        let labels = |before: &str, after: &str| -> Vec<String> {
            complete(&ws, &req(&main, before, after, &s))
                .map(|l| l.items.into_iter().map(|i| i.label).collect())
                .unwrap_or_default()
        };
        let list = complete(
            &ws,
            &req(&main, "\\includegraphics[angle=90, wi", "]{a}", &s),
        )
        .unwrap();
        let width = list.items.iter().find(|i| i.label == "width").unwrap();
        assert_eq!(width.apply, "width=${1:0.8}\\linewidth");
        assert!(width.detail.as_deref().unwrap().contains("Largeur"));
        assert!(
            info(&ws, &main, width.info.as_deref().unwrap(), Lang::Fr)
                .unwrap()
                .contains("width")
        );
        // After `=`: the values of the key.
        assert!(labels("\\begin{itemize}[label=", "]").contains(&"\\arabic*.".to_owned()));
        assert!(labels("\\hypersetup{colorlinks, link", "}").contains(&"linkcolor".to_owned()));
        assert!(labels("\\hypersetup{linkcolor=", "}").contains(&"blue".to_owned()));
        // Options of a package configured by keys.
        let geometry = labels("\\usepackage[margin=2cm, to", "]{geometry}");
        assert!(geometry.contains(&"top".to_owned()), "{geometry:?}");
        // Keys of a package that is not loaded are not offered.
        assert!(labels("\\sisetup{", "}").is_empty());
        // Positional values of kernel arguments.
        assert!(labels("\\begin{minipage}[", "]{3cm}").contains(&"t".to_owned()));
    }

    #[test]
    fn environments_insert_body_and_end() {
        let (_d, ws, main) = ws();
        let s = CompletionSettings::default();
        let list = complete(&ws, &req(&main, "\\begin{it", "}\n", &s)).unwrap();
        assert_eq!(list.to_after, 1);
        let item = list.items.iter().find(|i| i.label == "itemize").unwrap();
        assert_eq!(item.apply, "itemize}\n\t\\item ${1}\n\\end{itemize}");
        let all = complete(&ws, &req(&main, "\\begin{", "}\n", &s)).unwrap();
        let thm = all.items.iter().find(|i| i.label == "thm").unwrap();
        assert_eq!(thm.detail.as_deref(), Some("Théorème"));
        let end = complete(&ws, &req(&main, "\\begin{center}\ntext\n\\end{", "", &s)).unwrap();
        assert_eq!(end.items[0].label, "center");
        assert_eq!(end.items[0].apply, "center}");
    }

    #[test]
    fn labels_citations_files() {
        let (_d, ws, main) = ws();
        let s = CompletionSettings::default();
        let refs = complete(&ws, &req(&main, "voir \\eqref{", "}", &s)).unwrap();
        let eq = refs.items.iter().find(|i| i.label == "eq:e").unwrap();
        assert!(eq.detail.as_deref().unwrap().starts_with("Équation"));
        assert!(eq.boost > 0);
        let cites = complete(&ws, &req(&main, "\\cite{lamp", "}", &s)).unwrap();
        assert_eq!(cites.items[0].label, "lamport");
        let by_author = complete(&ws, &req(&main, "\\cite{knuth tex", "}", &s)).unwrap();
        assert_eq!(by_author.items[0].label, "knuth84");
        let files = complete(
            &ws,
            &req(&main, "\\includegraphics[width=3cm]{fig", "}", &s),
        )
        .unwrap();
        assert_eq!(files.items[0].label, "figures/plot.png");
        let opts = complete(&ws, &req(&main, "\\usepackage[fre", "]{babel}", &s)).unwrap();
        assert!(opts.items.iter().any(|i| i.label == "french"));
        let pkgs = complete(&ws, &req(&main, "\\usepackage{amsm", "}", &s)).unwrap();
        assert_eq!(pkgs.items[0].label, "amsmath");
    }

    #[test]
    fn info_docs() {
        let (_d, ws, main) = ws();
        let doc = info(&ws, &main, "cmd:latex:frac", Lang::Fr).unwrap();
        assert!(doc.contains("Fraction"));
        let cite = info(&ws, &main, "cite:knuth84", Lang::En).unwrap();
        assert!(cite.contains("The TeXbook"));
        let user = info(&ws, &main, "user:norm", Lang::En).unwrap();
        assert!(user.contains("main.tex"));
    }

    #[test]
    fn hints_of_free_arguments() {
        let (_d, ws, main) = ws();
        let s = CompletionSettings::default();
        let hint = |before: &str, after: &str| argument_hint(&ws, &req(&main, before, after, &s));
        let item = hint("\\begin{description}\n\\item[", "] x").unwrap();
        assert_eq!(item.name, "terme");
        assert!(item.parts[1].active);
        let section = hint("\\section{Introduction et ", "}").unwrap();
        assert_eq!(section.name, "titre");
        // A command of the project: its arguments by number.
        let norm = hint("$\\norm{", "}$").unwrap();
        assert_eq!(norm.name, "#1");
        assert!(norm.doc.contains("projet"));
        // Arguments with proposals have no hint.
        assert!(hint("\\ref{", "}").is_none());
        assert!(hint("\\begin{minipage}[", "]{3cm}").is_none());
        assert!(hint("texte", "").is_none());
    }

    #[test]
    fn fields_between_braces_start_empty() {
        assert_eq!(empty_brace_fields("section{${1:title}}"), "section{${1}}");
        assert_eq!(
            empty_brace_fields("newcommand{\\${1:name}}{${2:definition}}"),
            "newcommand{\\${1}}{${2}}"
        );
        assert_eq!(
            empty_brace_fields(
                "begin{figure}[${1:htbp}]\n\t\\includegraphics[width=${2:0.8}\\linewidth]{${3:file}}"
            ),
            "begin{figure}[${1:htbp}]\n\t\\includegraphics[width=${2:0.8}\\linewidth]{${3}}"
        );
        assert_eq!(
            empty_brace_fields("\\sum_{${1:i=1}}^{${2:n}} ${3}"),
            "\\sum_{${1}}^{${2}} ${3}"
        );
        assert_eq!(empty_brace_fields("x{${1:a\\{b\\}}}é"), "x{${1}}é");
        assert_eq!(empty_brace_fields("item ${1:text}"), "item ${1:text}");
        // Names of what to write in brackets are left out too (the hint says them).
        assert_eq!(
            empty_brace_fields("\\item[${1:term}] ${2}"),
            "\\item[${1}] ${2}"
        );
        assert_eq!(
            empty_brace_fields("{${1:${SELECTION}}}"),
            "{${1:${SELECTION}}}"
        );
    }

    #[test]
    fn the_at_shortcuts_of_the_user_are_completed() {
        let (_d, ws, main) = ws();
        let s = CompletionSettings::default();
        let macro_ = |trigger: &str, body: &str, math: bool| Macro {
            name: String::new(),
            trigger: trigger.into(),
            key: String::new(),
            body: body.into(),
            math,
        };
        let macros = [
            macro_("@v", "\\vec{${1}}", true),
            macro_("@prod", "\\prod_{${1:i}=1}^{${2:n}}", true),
            // The same key as a shortcut of RayTeX: it takes its place.
            macro_("@a", "\\aleph", false),
            // Not `@` shortcuts: a word, a key with a space.
            macro_("ff", "\\frac{${1}}{${2}}", true),
            macro_("@a b", "x", false),
        ];
        let ask = |before: &'static str| {
            let mut r = req(&main, before, "", &s);
            r.macros = &macros;
            complete(&ws, &r)
        };
        // In a formula: those of the user first, then those of RayTeX.
        let all = ask("$ @").unwrap();
        let labels: Vec<&str> = all.items.iter().map(|i| i.label.as_str()).collect();
        assert!(
            labels.contains(&"@v") && labels.contains(&"@prod"),
            "{labels:?}"
        );
        assert!(labels.contains(&"@b"), "those of RayTeX stay");
        assert!(!labels.contains(&"ff") && !labels.contains(&"@a b"));
        assert_eq!(labels.iter().filter(|l| **l == "@a").count(), 1);
        let a = all.items.iter().find(|i| i.label == "@a").unwrap();
        assert_eq!(a.apply, "\\aleph");
        let v = all.items.iter().find(|i| i.label == "@v").unwrap();
        assert_eq!(
            (v.apply.as_str(), v.detail.as_deref()),
            ("\\vec{${1}}", Some("\\vec{…}"))
        );
        let prod = all.items.iter().find(|i| i.label == "@prod").unwrap();
        assert_eq!(prod.detail.as_deref(), Some("\\prod_{i=1}^{n}"));
        // A word after `@` narrows the list to it.
        let typed = ask("$ @pro").unwrap();
        assert!(typed.items.iter().any(|i| i.label == "@prod"));
        assert!(!typed.items.iter().any(|i| i.label == "@v"));
        // In text, a macro of formulas is not offered; the others are.
        let text = ask("Soit @").unwrap();
        assert!(!text.items.iter().any(|i| i.label == "@v"));
        assert!(
            text.items
                .iter()
                .any(|i| i.label == "@a" && i.apply == "\\aleph")
        );
        // Next to the command it writes, in the list of commands.
        let commands = ask("$ \\ve").unwrap();
        let vec = commands.items.iter().find(|i| i.label == "\\vec").unwrap();
        assert_eq!(vec.shortcut.as_deref(), Some("@v"));
        // Turned off with the shortcuts of RayTeX.
        let off = CompletionSettings {
            at_shortcuts: false,
            ..CompletionSettings::default()
        };
        let mut r = req(&main, "$ @", "", &off);
        r.macros = &macros;
        assert!(complete(&ws, &r).is_none());
    }

    #[test]
    fn at_shortcuts_are_shown_next_to_commands() {
        assert_eq!(data::at_shortcut_of("alpha"), Some("a"));
        assert_eq!(data::at_shortcut_of("frac"), Some("/"));
        assert_eq!(data::at_shortcut_of("sqrt"), Some("2"));
        assert_eq!(data::at_shortcut_of("mathbb"), None);
        assert_eq!(data::at_shortcut_of("left"), None);
    }
}
