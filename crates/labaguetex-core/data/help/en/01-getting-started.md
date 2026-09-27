# Getting started

Welcome to **labaguetex**, the LaTeX editor designed for learning as well as for working fast. This guide takes you from installation to your first PDF in five minutes.

## 1. A TeX distribution

LaTeX turns your `.tex` files into PDF with a *TeX distribution* (TeX Live, MacTeX, MiKTeX, TinyTeX, Tectonic…). labaguetex detects all of them automatically.

- The status bar, bottom left, shows the distribution in use.
- If none is found, the **setup assistant** opens: it suggests the right distribution for your system, shows the exact commands and runs them for you.

> You can reopen the assistant at any time: click the distribution name in the status bar.

## 2. Create a project

Click **New project** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>N</kbd>) and pick a template: article, report, thesis, slides, exam, exercise sheet, CV, letter…

Fill in the title, author and location: labaguetex creates the folder, fills in the template and opens it. Every template compiles without errors from the start.

Already have files? **Open folder** is enough: labaguetex finds the main file (the one with `\documentclass`) by itself.

## 3. Write

The editor helps at every keystroke:

- type `\`: commands appear, with their documentation;
- type `\begin{`: pick an environment, its `\end{…}` is added;
- inside a formula, the **math preview** appears under the cursor;
- hover a command, a label or a citation to see what it does or refers to.

## 4. Build

Press <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> or click **Build**. The PDF appears on the right and updates after every build, keeping your position.

By default, labaguetex rebuilds on every save (see *Settings › Compilation*). It picks the right engine and only runs Biber, BibTeX or the index when needed.

## 5. Fix errors

Problems appear while you type (underlined) and after building, in the **Problems** panel:

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
