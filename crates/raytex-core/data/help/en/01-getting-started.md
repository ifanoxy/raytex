# Getting started

Welcome to **RayTeX**, the LaTeX editor designed for learning as well as for working fast. This guide takes you from installation to your first PDF in five minutes.

## 1. A TeX distribution

LaTeX turns your `.tex` files into PDF with a *TeX distribution* (TeX Live, MacTeX, MiKTeX, TinyTeX, Tectonic…). RayTeX detects all of them automatically.

- The status bar, bottom left, shows the distribution in use.
- If none is found, the **setup assistant** opens: it suggests the right distribution for your system, shows the exact commands and runs them for you.

> You can reopen the assistant at any time: click the distribution name in the status bar.

## 2. Create a project

Click **New project** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>N</kbd>) and give it a name: it goes to the **projects folder** (`Documents/RayTeX`), which the start screen shows with a preview of each project. The project opens **empty**: an empty `main.tex`, nothing else.

Just a `.tex` file to edit? **Open a .tex file** opens it in **light mode**, without making a project or files next to it (see [Projects](08-projects.md)).

To start:

- the **Templates** panel, on the left, shows each template by its first page: article, report, thesis, slides, exam, exercise sheet, CV, letter… A click puts it in your document (the title is the project's name). <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> gives your text back;
- or choose in the card shown on the empty file: *Minimal document*, *Slides*…;
- or simply start writing.

Every template compiles without errors from the start.

Already have files? **Open folder** is enough: RayTeX finds the main file (the one with `\documentclass`) by itself.

## 3. Write

The **formatting bar**, under the top bar, works like a word processor's: style of the line (normal text, section, subsection…), size, bold, italic, underline, colour, alignment, lists, formulas, image, table, drawing. **See all** opens every command, with its shortcut.

The editor also helps at every keystroke:

- type `\`: commands appear, with their documentation;
- type `\begin{`: pick an environment, its `\end{…}` is added;
- inside a formula, the **math preview** appears under the cursor, and the **@ shortcuts** type symbols in two keys: `@a` gives `\alpha`, `@/` a fraction, `@R` gives `\mathbb{R}` (full list: the **Macros** button);
- hover a command, a label or a citation to see what it does or refers to.

## 4. Build

Nothing to do: compilation is **live**. As soon as you pause typing, the document is built and the PDF, on the right, updates while keeping your position. The **Live** badge of the top bar reminds you of it; a click turns it off (the document is then built on each save).

You can also build yourself: <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> or the **Build** button. RayTeX picks the right engine and only runs Biber, BibTeX or the index when needed.

## 5. Fix errors

Problems appear while you type (underlined), and the top bar shows the number of errors of the last build. The console does not open by itself: click that number, or **Show problems** in the notification, to open the **Problems** panel:

- each error gives the exact file and line: click to go there;
- a plain-language explanation tells you *why*;
- when possible, a button fixes it for you (add a package, install it, fix a typo…).

## 6. Move between source and PDF

- **Double-click in the PDF**: the editor jumps to the matching line.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>J</kbd>: the PDF shows where the cursor is.

## Going further

- [LaTeX basics](02-latex-basics.md)
- [Mathematics](03-math.md)
- [Figures and tables](04-figures-tables.md)
- The **command palette** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>P</kbd>) gives access to every action.
