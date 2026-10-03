# Data files: knowledge base, templates, help, errors

Everything in `crates/raytex-core/data/` is embedded in the binaries at compile time by `crates/raytex-core/build.rs`. Adding or editing a file never requires touching Rust code: rebuild and it is there.

Every user-facing text is bilingual: `{ "en": "…", "fr": "…" }`. A missing language falls back to the other one, but please provide both.

## Knowledge base: `data/packages/<name>.json`

RayTeX supports **every** package: the commands, environments and options of any installed package are read from its source code when a document loads it. The knowledge base only **adds** what a source file cannot tell: clear documentation, argument names, snippets, symbols with their glyph. Document a package here when it is widely used or its commands deserve an explanation.

```json
{
  "name": "siunitx",
  "class": false,
  "description": { "en": "Numbers and SI units, correctly typeset.", "fr": "Nombres et unités SI, correctement composés." },
  "loads": ["expl3"],
  "options": [
    { "name": "locale", "doc": { "en": "Regional conventions (FR, DE, UK…).", "fr": "Conventions régionales (FR, DE, UK…)." } }
  ],
  "commands": [
    {
      "name": "qty",
      "args": "{number}{unit}",
      "snippet": "qty{${1:9.81}}{${2:\\metre\\per\\second\\squared}}",
      "mode": "any",
      "doc": { "en": "Quantity with its unit.", "fr": "Grandeur avec son unité." },
      "example": "\\qty{9.81}{\\metre\\per\\second\\squared}"
    }
  ],
  "environments": [
    { "name": "align", "math": true, "mode": "text", "body": "${1:a} &= ${2:b}", "doc": { "en": "…", "fr": "…" } }
  ],
  "symbols": [
    { "category": "unit", "mode": "any", "items": [["metre", "m"], ["second", "s"]] }
  ]
}
```

| Field | Meaning |
|---|---|
| `name` | Package (or class) name, as in `\usepackage{…}`. |
| `class` | `true` for a document class (`article.json`, `beamer.json`…). |
| `description` | One sentence shown in completion, hovers and the Packages view. |
| `loads` | Packages it loads itself (their commands become available too). |
| `options` | Options with a short explanation. A plain string is accepted for an undocumented option. |
| `commands[].name` | Without the backslash. |
| `commands[].args` | Signature shown to the user: `[optional]{mandatory}`. |
| `commands[].snippet` | Text inserted after the backslash, in CodeMirror snippet syntax: `${1:placeholder}`, `${2}`, `${0}` (final cursor). Defaults to the name plus one field per mandatory argument. |
| `commands[].mode` | `any` (default), `text`, `math` or `preamble`: controls ranking in completion. |
| `commands[].glyph`, `category` | Symbol shown in completion and in the symbol palette. |
| `environments[].math` | The body is in math mode (`align`, `pmatrix`…). |
| `environments[].body` | Text inserted between `\begin` and `\end` (snippet syntax). |
| `symbols` | Groups of `[command, glyph]` pairs for the symbol palette, with a `category` (see `latex.json` for existing ones). |
| `example` | Optional usage example shown in documentation. |

The kernel lives in `latex.json`. Tests (`cargo test -p raytex-core kb`) check that every file parses.

## Templates: `data/templates/<id>/`

A template is a folder containing the files of a new project and a `template.toml`:

```toml
category = "student"          # general, student, teacher, researcher
order = 3                     # position in the gallery
main = "main.tex"
engine = "pdflatex"           # optional
tags = ["report", "biblatex"]

[name]
en = "Report / dissertation (multi-file)"
fr = "Rapport / mémoire (multi-fichiers)"

[description]
en = "A report split into chapter files, with…"
fr = "Un rapport découpé en fichiers de chapitres, avec…"
```

Placeholders replaced in every text file when a project is created:

| Placeholder | Value |
|---|---|
| `{{title}}`, `{{author}}`, `{{institution}}` | What the user typed |
| `{{date}}`, `{{year}}` | Today |
| `{{babel}}` | `french`, `english`… (document language) |
| `{{lang}}` | `fr`, `en` |
| `{{fr:texte|en:text}}` | Text in the document language |

`{{{title}}}` is a LaTeX brace followed by a placeholder: `\title{{{title}}}` becomes `\title{My title}`.

Every template must build **without errors or warnings** in both languages: `cargo test -p raytex-core --release -- --ignored every_template_compiles` checks it with the installed distribution. Users can also save their own projects as templates from the application.

## Help guides: `data/help/<lang>/NN-id.md`

Markdown (GitHub flavour: tables, task lists). `NN` orders the guides, `id` is used in links: `[Mathematics](03-math.md)`. The first `# ` heading is the title. Raw HTML is escaped, except `<kbd>…</kbd>` for keys. Every guide must exist in every language with the same file name; a test checks it, as well as links between guides.

Code blocks get **Copy** and **Insert** buttons in the help centre.

## Error explanations: `data/errors.json`

Each entry says what a LaTeX, BibTeX or Biber message means:

```json
{
  "id": "missing-number",
  "match": "^Missing number, treated as zero",
  "title": { "en": "A number was expected", "fr": "Un nombre était attendu" },
  "explanation": { "en": "TeX expected a number or a length at this place and read something else; it used zero instead.", "fr": "…" },
  "more": { "en": "Usual causes: a length that is empty or made of words (`\\vspace{}`), a `[` right after `\\\\`…", "fr": "…" }
}
```

`match` is a regular expression tested against the message; the first entry that matches wins. Texts are Markdown.

- `explanation` is shown in the Problems panel under every problem with this message, so it must hold for all of them: what the message means, in plain words, and nothing about a cause it cannot know ("often", "probably", "check that…").
- `more` (optional) lists the usual causes and remedies. It is only shown in *Help › Errors*, after the explanation.

The cause of a problem in a given document is not written here, and is not tied to a message: the engine looks for it in the source (`fixes/cause.rs`), where TeX stopped, with what this knowledge base says of the commands and environments written there:

- their `mode`: a command or an environment of formulas written in text, and the reverse;
- their `args`: an argument of the signature that is not written, and what an argument expects by its name (`{width}`, `{length}`: a length; `{number}`: a number; `{label}`, `{counter}`: a name without command);
- the values of an argument listed in `data/keys.json` (`\pagestyle{1}`): a value close to one of them is a typo;
- the structure of the paragraph as the live checks see it (braces, formulas, environments).

So a command described here gets its mistakes explained without anything else: the problem is placed on the word or the argument to change, its title names the mistake and its *advice* (the light bulb) says what is wrong, with a fix when there is one. A problem whose cause is not found keeps its explanation and gets no advice.

To check a new kind of mistake, add a case to `tests/common_mistakes.rs` (`forum_cases`: a document, the text that must be shown and what the advice must say; the message TeX gives is not part of the case). They run with a real TeX distribution: `cargo test -p raytex-core --release --test common_mistakes -- --ignored causes_are_found --nocapture` (`LBT_PROBE=1` prints what is found instead of checking).

## TikZ gallery: `data/tikz.json`

```json
{ "id": "flowchart", "category": "diagrams",
  "name": { "en": "Flowchart", "fr": "Organigramme" },
  "description": { "en": "…", "fr": "…" },
  "packages": ["tikz"], "libraries": ["shapes.geometric", "arrows.meta", "positioning"],
  "preamble": "", "code": "\\begin{tikzpicture}…{{fr:Début|en:Start}}…\\end{tikzpicture}" }
```

`category` is one of `basics`, `functions`, `diagrams`, `geometry`, `science`, `cs`, `math`. Texts inside the drawing use `{{fr:…|en:…}}`. `preamble` holds extra lines (`\pgfplotsset{compat=1.18}`). Every drawing must compile in both languages: `cargo test -p raytex-core --release -- --ignored every_tikz_template_compiles`.

## LaTeX font packages: `data/fonts.json`

```json
{ "id": "libertinus", "name": "Libertinus", "package": "libertinus", "options": "", "kind": "serif",
  "math": true, "fontspec": "Libertinus Serif", "extra": "", "description": { "en": "…", "fr": "…" } }
```

`kind` is `serif`, `sans` or `mono`; `package` may list several packages (`newpxtext,newpxmath`); `extra` is an additional preamble line. `every_tex_font_compiles` checks them all with pdfLaTeX.

## Snippets: `data/snippets.json`

```json
{ "trigger": "fig", "name": { "en": "Figure with image", "fr": "Figure avec image" },
  "body": "\\begin{figure}[${1:htbp}]\n\t\\centering\n\t…\n\\end{figure}", "package": "graphicx", "math": false }
```

`package` is added to the preamble when the snippet is used; `math` limits the snippet to math mode. Tabs in the body become one indentation level.
