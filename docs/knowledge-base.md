# Data files: knowledge base, templates, help, errors

Everything in `crates/labaguetex-core/data/` is embedded in the binaries at compile time by `crates/labaguetex-core/build.rs`. Adding or editing a file never requires touching Rust code: rebuild and it is there.

Every user-facing text is bilingual: `{ "en": "…", "fr": "…" }`. A missing language falls back to the other one, but please provide both.

## Knowledge base: `data/packages/<name>.json`

labaguetex supports **every** package: the commands, environments and options of any installed package are read from its source code when a document loads it. The knowledge base only **adds** what a source file cannot tell: clear documentation, argument names, snippets, symbols with their glyph. Document a package here when it is widely used or its commands deserve an explanation.

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

The kernel lives in `latex.json`. Tests (`cargo test -p labaguetex-core kb`) check that every file parses.

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

Every template must build **without errors or warnings** in both languages: `cargo test -p labaguetex-core --release -- --ignored every_template_compiles` checks it with the installed distribution. Users can also save their own projects as templates from the application.

## Help guides: `data/help/<lang>/NN-id.md`

Markdown (GitHub flavour: tables, task lists). `NN` orders the guides, `id` is used in links: `[Mathematics](03-math.md)`. The first `# ` heading is the title. Raw HTML is escaped, except `<kbd>…</kbd>` for keys. Every guide must exist in every language with the same file name; a test checks it, as well as links between guides.

Code blocks get **Copy** and **Insert** buttons in the help centre.

## Error explanations: `data/errors.json`

Each entry explains a LaTeX, BibTeX or Biber message:

```json
{
  "id": "undefined-control-sequence",
  "match": "^Undefined control sequence",
  "title": { "en": "Unknown command", "fr": "Commande inconnue" },
  "explanation": { "en": "The command at the end of the highlighted text does not exist…", "fr": "…" }
}
```

`match` is a regular expression tested against the message. The explanation is Markdown and appears in the Problems panel and in *Help › Errors*. Fixes (add a package, install it, replace a misspelt command…) are computed by the engine (`log/hints.rs`).

## Snippets: `data/snippets.json`

```json
{ "trigger": "fig", "name": { "en": "Figure with image", "fr": "Figure avec image" },
  "body": "\\begin{figure}[${1:htbp}]\n\t\\centering\n\t…\n\\end{figure}", "package": "graphicx", "math": false }
```

`package` is added to the preamble when the snippet is used; `math` limits the snippet to math mode. Tabs in the body become one indentation level.
