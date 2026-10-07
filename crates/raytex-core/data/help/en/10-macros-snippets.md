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

To discover them: the **Macros** button of the formatting bar opens the full list, with each symbol drawn (a click inserts it); **See all** shows the most useful ones; and when you type a command that has a shortcut, suggestions show it next to it (`\alpha` → `@a`). They can be turned off in *Settings › Completion*.

### Your own @ shortcuts

In the **@ macros & snippets** view, the `+` at the top of the view opens **New @ shortcut**, which makes one from two fields: its key or keys (`v`, `vec`, `->`… twelve characters at most, without spaces) and what it writes (`\vec{}`: empty braces become fields where the cursor lands). It shows at once in the suggestions when you type `@`, before those of RayTeX, and next to its command (`\vec` → `@v`). A shortcut that takes a key of RayTeX replaces it. Untick *In formulas only* for a shortcut of text.

They are macros whose trigger starts with `@`: you find them, with a body of several lines if you want, in *Settings › Macros*.

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

*Settings › Macros*: each macro has a name, a **trigger** (text followed by <kbd>Tab</kbd>), an optional **keyboard shortcut** and a **body**. What you write is saved as you type, with nothing to confirm:

```text
Trigger: ff        (math mode only)
Body   : \frac{${1:a}}{${2:b}}${0}
```

Type the trigger in the document then <kbd>Tab</kbd>: the body replaces it. A macro for *math mode only* is written in a formula only; elsewhere, <kbd>Tab</kbd> indents as usual. When the list of suggestions is open, <kbd>Tab</kbd> picks the suggestion first.

For the keyboard shortcut, click its button then press the keys: <kbd>Esc</kbd> cancels, <kbd>⌫</kbd> removes it. A triangle marks a shortcut a command of RayTeX already has, which would run before the macro. On a Mac, <kbd>⌥</kbd> + a letter works too, also when the key writes an accent.

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

RayTeX recognises them at once: completion with the right number of arguments, math preview, <kbd>F12</kbd> to go to their definition, <kbd>F2</kbd> to rename them across the project.

The **Commands of the project** view (the `{\}` icon of the sidebar) lists them all, for the whole project or for the open file: their name with its arguments, what they write, where they are defined and how many times they are used. A click goes to the definition; on hover, **Insert** writes the command at the cursor and **Try** opens it in the studio.

### Making a command without remembering the syntax

**New command** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd>, or the `+` of the view) opens the studio:

1. choose what you define: a **command**, a formula **operator** (`\argmax`), an **environment** or a **theorem**;
2. give its name, its number of arguments (the first one can be optional, with a default value) and what it writes, where `#1`, `#2`… stand for the arguments;
3. on the right, the **trial** compiles a small text that uses it, with the preamble of your project: you see the result before touching the document;
4. **Add to the preamble** writes the definition after the others, in the main document; **Add and insert** also writes the command where the cursor is.

If some text is selected when you open the studio, it becomes the definition: select `\mathbb{R}^n`, give a name, done. The studio tells what would keep the command from working: a name LaTeX, a loaded package or the project already uses, a `#3` in a command with two arguments, braces that are not closed.

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
