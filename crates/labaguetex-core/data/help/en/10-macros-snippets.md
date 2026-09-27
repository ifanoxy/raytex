# Macros and snippets

Type less, faster: **@ shortcuts** type symbols in two keys, **snippets** insert complete blocks, **macros** are your own shortcuts.

## @ shortcuts

In a formula, type `@` then a key: the command writes itself.

| Type | Get | Type | Get |
|---|---|---|---|
| `@a`, `@b`, `@g`, `@l`, `@p` | `\alpha`, `\beta`, `\gamma`, `\lambda`, `\pi` | `@G`, `@D`, `@S`, `@W` | `\Gamma`, `\Delta`, `\Sigma`, `\Omega` |
| `@/` | `\frac{}{}` | `@2` | `\sqrt{}` |
| `@8` | `\infty` | `@6` | `\partial` |
| `@R`, `@N`, `@Z`, `@C` | `\mathbb{R}`… | `@I` | `\int_{}^{}` |
| `@<`, `@>` | `\leq`, `\geq` | `@->`, `@=>` | `\to`, `\implies` |
| `@(`, `@[`, `@\|` | `\left( … \right)`… | `@^`, `@_`, `@V` | `\hat{}`, `\bar{}`, `\vec{}` |

To discover them: the **@ Macros** button of the formatting bar opens the full list, with each symbol drawn (a click inserts it); **See all** shows the most useful ones; and when you type a command that has a shortcut, suggestions show it next to it (`\alpha` → `@a`). They can be turned off in *Settings › Completion*.

## Snippets

Type a trigger and pick it in the suggestions:

| Trigger | Inserts |
|---|---|
| `doc` | a minimal document |
| `fig`, `subfig` | a figure, two sub-figures |
| `tab`, `tabular` | a table |
| `item`, `enum`, `desc` | a list |
| `eq`, `eq*`, `ali` | an equation, aligned equations |
| `cases`, `mat` | cases, a matrix |
| `thm`, `defn`, `proof` | theorem, definition, proof |
| `sec`, `ssec`, `chap` | a heading with its label |
| `frame`, `cols` | a slide, columns |
| `tikz`, `plot` | a TikZ picture, a function plot |
| `code`, `algo` | code, an algorithm |
| `si`, `ce` | a quantity with its unit, a chemical formula |

Once inserted, <kbd>Tab</kbd> moves to the next field, <kbd>⇧</kbd> + <kbd>Tab</kbd> to the previous one. The **@ macros & snippets** view lists them all.

## Your macros

*Settings › Macros*: each macro has a name, a **trigger** (text followed by <kbd>Tab</kbd>), an optional **keyboard shortcut** and a **body**:

```text
Trigger: ff        (math mode only)
Body   : \frac{${1:a}}{${2:b}}${0}
```

In the body:

- `${1:text}`, `${2}`… are fields, visited with <kbd>Tab</kbd>;
- `${0}` is the final cursor position;
- `${SELECTION}` receives the selected text (ideal to wrap: `\textcolor{red}{${SELECTION}}`).

## Your LaTeX commands

For what must appear in the document, prefer a LaTeX command in the preamble:

```latex
\newcommand{\vect}[1]{\boldsymbol{#1}}
\newcommand{\R}{\mathbb{R}}
```

labaguetex recognises them at once: completion with the right number of arguments, math preview, <kbd>F12</kbd> to go to their definition, <kbd>F2</kbd> to rename them across the project.

## Formatting shortcuts

| Action | Shortcut |
|---|---|
| Bold, italic, emphasis | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>B</kbd>, <kbd>I</kbd>, <kbd>E</kbd> |
| Underline | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>U</kbd> |
| Inline math | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>M</kbd> |
| Wrap in an environment | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>W</kbd> |
| Comment | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>/</kbd> |
| Bulleted list, numbered list | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>8</kbd>, <kbd>7</kbd> |
| Undo, redo | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd>; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> or <kbd>Y</kbd> |

Every shortcut can be changed in *Settings › Shortcuts*.
