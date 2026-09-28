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

Without building, LaBagueTex reports: unbalanced braces and environments, unknown references and citations, duplicate labels, missing files and images, missing or misordered packages, obsolete commands, small typographic mistakes (non-breaking space before `\ref`, ellipsis…). Rules are chosen in *Settings › Checks*.

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
| Search the project | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> |

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
| See all | every formatting and insertion command, grouped, with its shortcut |

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

## Saving

Auto-save is on by default. A dot on a tab marks unsaved changes; when closing, LaBagueTex offers to save. Files that are not UTF-8 are converted when saved.
