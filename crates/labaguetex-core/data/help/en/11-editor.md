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

Choosing a command from a package that is not loaded adds the matching `\usepackage`. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Space</kbd> opens suggestions at any time.

## Checking while typing

Without building, labaguetex reports: unbalanced braces and environments, unknown references and citations, duplicate labels, missing files and images, missing or misordered packages, obsolete commands, small typographic mistakes (non-breaking space before `\ref`, ellipsis…). Rules are chosen in *Settings › Checks*.

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

## Editing

- Multiple cursors: <kbd>⌥</kbd>/<kbd>Alt</kbd> + click; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd> selects the next occurrence.
- Folding of sections and environments (arrows in the gutter).
- <kbd>Enter</kbd> after `\begin{…}` closes the environment; in a list, adds an `\item`.
- Paste or drop an image: the *Insert images* window opens (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>I</kbd>); see [Figures and tables](04-figures-tables.md).
- Drawings: the TikZ studio (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>); see [TikZ drawings](13-drawings.md).
- System spell checker (*Settings › Editor*).
- Vim mode (*Settings › Editor*): `:w` saves.

## Saving

Auto-save is on by default. A dot on a tab marks unsaved changes; when closing, labaguetex offers to save. Files that are not UTF-8 are converted when saved.
