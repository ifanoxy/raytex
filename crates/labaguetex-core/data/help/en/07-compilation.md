# Compilation

Building turns your `.tex` files into a PDF. labaguetex does it fast, at the right time, and explains every problem.

## Starting a build

- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd>, or the **Build** button.
- **Live** (default): after each pause in typing. The *Live* badge of the top bar shows it and, during an automatic build, spins without touching the **Build** button. Click it, or use the menu of the **Build** button, to build on each save instead; *Settings › Compilation › Build automatically* also offers *Never* and the length of the pause.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>.</kbd> stops a running build.

Modified files are saved before each build. If you build from a chapter included with `\input`, the main document is built.

## Which file is built?

The **main file** (★ in the file tree and the toolbar) is the one containing `\documentclass`. If there are several, choose it in the toolbar or with right-click › *Set as main file*.

An included file can also name its root on its first line:

```latex
% !TEX root = ../main.tex
```

## Which engine?

Unless you forced an engine (in the general or project settings), labaguetex picks:

1. the engine of the magic comment of the main file, if any:
   ```latex
   % !TEX program = lualatex
   ```
2. **Tectonic** when it is the distribution in use;
3. **LuaLaTeX** if the document loads `fontspec` or `unicode-math` (system and OpenType fonts);
4. otherwise **pdfLaTeX**.

The engine is shown at the bottom right of the window and in the **Output** panel; hover it to see why it was chosen.

## What happens during a build

The built-in method (recommended):

1. runs the engine;
2. runs **Biber** or **BibTeX** only if citations or the `.bib` changed, then **makeindex**, **makeglossaries**, **nomencl** when the document needs them;
3. reruns the engine until cross-references are stable (at most 5 passes).

Auxiliary files (`.aux`, `.log`, `.toc`…) go to the `build/` folder: your project stays clean. The **Output** panel shows the raw output of every step.

**Precompiled preamble** (pdfLaTeX): after a first build, labaguetex prepares in the background a “precompiled” version of the preamble (with `mylatexformat`). The next builds start directly at `\begin{document}`: often twice as fast (0.6 s instead of 1.3 s with TikZ and pgfplots), with the same PDF. The preamble is prepared again as soon as it changes. Documents that write files in their preamble (indexes, glossaries, `minted`…) are built normally. Setting: *Settings › Compilation › Precompile the preamble*.

Other methods: **latexmk**, **a single pass**, or your **custom steps** (with the placeholders `%DOC%`, `%DOCFILE%`, `%OUTDIR%`, `%DIR%`, `%ENGINE%`).

## Reading errors

The console (**Problems** and **Output** panels) never opens by itself: errors are underlined in the text, their number shows in red in the top bar and, when you started the build yourself, a notification offers **Show problems**. Close the console with its cross; bring it back with the **View** menu or <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>J</kbd>.

All the text of the panels can be selected and copied: drag over the compiler output (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd> selects all of it) or over a message; **Copy all** copies the shown problems (`file:line: message`), and right-clicking a problem offers to copy its message, with or without its location.

The **Problems** panel groups errors by file:

- the TeX message, turned into a clear explanation;
- the exact position (line and column), underlined in the editor;
- the context shown by TeX, with the point where it stopped;
- **one-click fixes**: add or install a package, fix a misspelt command, switch engines, create a missing file…

Warnings (undefined references, overfull boxes) are shown separately and can be filtered.

## The PDF

- The PDF reloads after each build **without losing your position**.
- Double-click in the PDF → matching source line; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>J</kbd> → cursor position in the PDF.
- Zoom: <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + wheel, pinch, or the zoom menu.
- *Export PDF…* copies it wherever you want; *Copy the PDF next to the main file* does it after every build.

## External programs (shell escape)

Some packages (`minted`, `svg`, `gnuplottex`…) need to run programs while building. This is off by default for your safety. labaguetex offers to enable it for a project when needed.
