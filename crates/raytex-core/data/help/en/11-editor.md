# The editor in depth

## Completion

Suggestions follow the context:

- after `\`: commands of the LaTeX kernel, of **every loaded package** (read from its source) and of your project; in math mode, symbols first, with their glyph;
- in `\begin{…}`: environments; the `\end{…}` and typical content are added;
- in `\ref{…}`, `\eqref{…}`, `\cref{…}`: labels, with their number;
- in `\cite{…}`: references, with authors, year and title;
- in `\usepackage{…}`, `\documentclass{…}`: installed packages and classes;
- in `\includegraphics{…}`, `\input{…}`: project files;
- in `[…]` options: known options.

Choosing a command creates its braces, **empty**: the cursor is in the first one, <kbd>Tab</kbd> goes to the next. Choosing a command from a package that is not loaded adds the matching `\usepackage`. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Space</kbd> opens suggestions at any time.

When an **@ shortcut** exists, it is shown next to the command: `\alpha` shows `@a`. In a formula, typing `@a` is enough.

## Checking while typing

Without building, RayTeX reports: unbalanced braces and environments, unknown references and citations, duplicate labels, missing files and images, missing or misordered packages, obsolete commands, small typographic mistakes (non-breaking space before `\ref`, ellipsis…). Rules are chosen in *Settings › Checks*.

## Documentation on hover

Hover a command, an environment or a package: its documentation appears. On a label: its number and page. On a citation: the full reference. On `\includegraphics`: the image.

## Navigation

| Action | Shortcut |
|---|---|
| Go to definition (label, citation, command, file) | <kbd>F12</kbd> or <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + click |
| Find all references | <kbd>⇧</kbd> + <kbd>F12</kbd> |
| Rename everywhere | <kbd>F2</kbd> |
| Go to a file | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>P</kbd> |
| Go to a section (`@`) or a label (`#`) | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>P</kbd> then `@` or `#` |
| Go to a line | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>L</kbd> |
| Next problem | <kbd>F8</kbd> |
| Find in the file | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>F</kbd> |
| Replace in the file | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>R</kbd> |
| Search the project | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> |
| Replace in the project | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>R</kbd> |

**In the file**, a card opens at the top right of the editor: the matches are highlighted and counted (*2 of 5*), <kbd>Enter</kbd> goes to the next one, <kbd>⇧</kbd> + <kbd>Enter</kbd> to the previous one, <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>Enter</kbd> selects them all. *Aa* matches case, *ab* keeps whole words only, *.\** reads a regular expression. In the replacement field, <kbd>Enter</kbd> replaces the selected match and <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> all of them.

**In the project**, the *Search* panel groups the results by file; with replacement, each line shows what it will become, and is replaced alone, with its file or with all the others (`$1` brings back a group of a regular expression).

## Formatting bar

Under the top bar, like in a word processor (every button acts on the selection, or on the cursor line):

| Button | Effect |
|---|---|
| Undo, Redo | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd>; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> or <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Y</kbd> |
| Style | the line becomes a part, a chapter, a section… or normal text again; the menu shows the style of the cursor line |
| Size | `{\large …}`, `{\small …}`…; choosing *Normal* removes the size |
| Bold, italic, underline, monospace | `\textbf`, `\textit`, `\underline`, `\texttt` |
| Font | the font of the document; its menu sets the font of each use and fonts for passages (see [Fonts](14-fonts.md)) |
| Colour | `\textcolor{red}{…}` (adds `xcolor`); choosing another colour replaces it. With `xcolor` loaded, the menu offers its 19 colours, the 68 `dvipsnames` colours and the SVG colours (the option is added when needed, without clashing with TikZ or Beamer), a search by name, the colours the document defines and a colour of your choice (`\definecolor`) |
| Alignment | `flushleft`, `center`, `flushright` environments; choosing again changes the alignment of the block |
| Lists | each selected line becomes an `\item`; on a list, changes its kind |
| Formula, equation | `$…$` around the selection; `equation` environment |
| Image, Table, TikZ drawing | image window; a grid to choose the size of the table (empty cells, `booktabs` added); TikZ studio |
| Link, footnote, reference, citation | `\href`, `\footnote`, `\ref`, `\cite` |
| Macros | the list of @ shortcuts |

The **menus** of the top bar hold every command, each with its shortcut: **Format** (bold, italic…, then *Line style*, *Text size*, *Text colour* and *Alignment* in submenus, lists, comments), **Insert** (image, figure, table, code, TikZ, link, footnote, reference, citation, label, [subject and answer key](16-subject-answer-key.md), new command), **Maths** (formulas, fraction, root, sum, integral, matrix, function plots, tables of variations, probability trees, symbols), **Page** (title page, margins, page styles, page break, table of contents) and **@** (the most useful @ shortcuts). A click opens a menu, passing over the others opens them; with the keyboard, the arrows move in them, Enter chooses, Escape closes, and the first letter of an entry goes to it. The text keeps its selection meanwhile. The command palette also finds these entries by their name (*Large*, *Fraction*, *Page break*…).

The **View** menu (top right) shows or hides this bar, the side panel, the PDF preview and the console; the preview and the console also close with their cross.

## Editing

- Undo: <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd>, even when the cursor is not in the text (after a click in the bar or the PDF). Redo: <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> or <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Y</kbd>.
- `$`: opens a `$…$` pair where a formula can start (after a space, at the start of a line); after text, or to close a formula, a single `$` is typed (the one already closing the formula is simply stepped over).
- Renaming a `\begin{…}` also renames its `\end{…}` (and the other way round); one undo reverts both.
- An empty file offers ways to start: template, minimal document, slides; for a chapter, a section or its inclusion in the main document; for a `.bib`, the common entries.
- Multiple cursors: <kbd>⌥</kbd>/<kbd>Alt</kbd> + click; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd> selects the next occurrence.
- Folding of sections and environments (arrows in the gutter).
- <kbd>Enter</kbd> after `\begin{…}` closes the environment; in a list, adds an `\item`.
- Paste or drop an image: the *Insert images* window opens (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>I</kbd>); see [Figures and tables](04-figures-tables.md).
- Drawings: the TikZ studio (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>); see [TikZ drawings](13-drawings.md).
- System spell checker (*Settings › Editor*).
- Vim mode (*Settings › Editor*): `:w` saves.

## Pasting and writing faster

- **Pasting formatted text** (Word, Google Docs, LibreOffice, a web page) writes it in LaTeX: bold, italic, underline, headings, lists, links (`hyperref` is added), superscripts. A notice offers **Plain text** at once to paste the text as it is. LaTeX code copied from a page, or code copied from an editor, is pasted as it is.
- **The formulas** of a web page (MathML, or the TeX they carry, as on Wikipedia) and **Word's equations** become a LaTeX formula, between `$…$` in text, as it is inside a formula.
- **A table** pasted (Excel, LibreOffice Calc, a table of Word or of a page) opens in the table window, cell by cell; inside a formula it becomes a matrix.
- **`&`, `_` and `#` typed in text**, and `%` after a number (`50 %`), are written `\&`, `\_`, `\#`, `\%`. Never in a formula, a table or an alignment (for `&`), the name of a label, a file or a link, the definition of a command, a comment, the preamble, TikZ or code. **Undo** once puts the character back as it was.
- **A selection** is wrapped by typing `(`, `[`, `{` or `$`.
- **A command often typed in full** (`\mathbb`, `\varepsilon`…): RayTeX offers once an `@` shortcut that writes it, or creates one in a click.

Each of these aids can be turned off in *Settings › Editor*.

## Saving

Auto-save is on by default. A dot on a tab marks unsaved changes; when closing, RayTeX offers to save. Files that are not UTF-8 are converted when saved.

## Spelling

*Settings › Editor › Spell checker* (or *Turn the spell checker on or off* in the command palette) underlines with a pink wavy line the words the dictionary does not know.

**The dictionary is downloaded once, when you ask for it.** RayTeX holds none. When you turn the checker on for a language it does not have yet, a window says what will be downloaded (the dictionary of that language, its size) and from where (`github.com/LibreOffice/dictionaries`, the repository of the dictionaries of LibreOffice): **Download** or **Not now**. Without your agreement, nothing is downloaded; nothing else is sent. After that the checker works without a connection.

- **The language** is the one of the document: the one it gives to babel (`\usepackage[french]{babel}`; with several languages, the last one, or the one of `main=`), to polyglossia (`\setdefaultlanguage`), or to a line `% !TEX spellcheck = fr_FR`. It is shown at the bottom of the window; a click on it chooses another one for the project, or offers the dictionary when it is missing.
- **Only text is checked**: not commands, formulas, labels and keys, file names, the preamble (but for the title), TikZ pictures or listings. Acronyms (`CNRS`), names with a capital inside (`LaTeX`) and what touches a digit are left out.
- **Passages in another language** (`\foreignlanguage{english}{…}`, the `otherlanguage` environment, `\textenglish{…}`) are checked with the dictionary of that language when it is installed, and left alone otherwise.
- **A right click on an underlined word**: the corrections the dictionary offers, and *Add to the dictionary* for a proper name or a term of your field. The words added are right in every language.

*Settings › Editor* lists the installed dictionaries (the cross removes one) and the words added, and lets you add others: French, English (American, British…), German, Spanish, Italian, Portuguese, Dutch, Catalan, Polish, Swedish, Danish, Norwegian, Czech, Russian, Greek.
