# Changelog

All notable changes to RayTeX are documented here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] — Unreleased

First version.

### Errors and fixes
- Every error and warning gets a suggestion (a catalogue of about 110 LaTeX, package, BibTeX and Biber messages, in French and English, plus an explanation for the others) and, for the common ones, a fix computed from the sources: misspelt commands, environments, labels, citation keys and option keys; missing packages and TikZ libraries; unclosed braces, formulas and environments; `_`, `^`, `&`, `#` in text; table columns and rows; float placement and oversized images; `\newcommand` arguments; misplaced `\usepackage`; option clashes; babel, fancyhdr, pgfplots, natbib and hyperref warnings; cleveref with French babel.
- **Fix all** in the Problems panel (first suggested fix of each problem shown, duplicates and conflicting edits skipped, then a build) and **Alt+Enter** in the editor for the fixes at the cursor. Diagnostics and fixes follow the edits made since the build.
- Errors reported inside a package (`geometry.sty:1005`) are moved to the `\usepackage` line and option that cause them.
- Tested with the local TeX distribution on about 110 documents made of common commands and common mistakes: each one is reported, explained and fixed, and a document using the most common commands and environments compiles without any warning (`crates/raytex-core/tests/common_mistakes.rs`).
- The application is now called **RayTeX**, with a new logo (the letters of the \\LaTeX logo, whose X is two crossed rays of light); the command line is `raytex`. The folders and files of the versions named LaBagueTex follow on first start: projects folder (`Documents/RayTeX`), settings, session and cache, and each project's `labaguetex.toml` (renamed `raytex.toml` when the project opens).

### Windows
- The repository can be checked out on Windows: the module `aux.rs` (AUX is a name Windows reserves) is now `auxfile.rs`, and the CI checks that every file name is valid on Windows; line endings are kept by `.gitattributes`.
- Characters typed with AltGr (Ctrl + Alt for the page: `{ [ @ \\ €` on AZERTY) are never taken for Ctrl + Alt shortcuts.
- A file opened from Explorer while RayTeX runs goes to the running window (single instance, Windows and Linux).
- MiKTeX's own window asking to install each missing file never appears: every engine run tells MiKTeX what to do. Builds and the previews of formulas, TikZ and fonts install missing packages silently when *Install missing packages automatically* is on (the default); template thumbnails never install anything. When MiKTeX cannot install by itself (setting off, TeX Live), RayTeX lists the packages a document loads but the distribution lacks, in one notice with an **Install** button; the installed files are read again after MiKTeX installed some.
- MiKTeX is named after its version (`MiKTeX 25.12`, not the version of pdfTeX); TeX Live's `tlmgr.bat` is found; package documentation falls back on `mthelp`; a missing Biber comes with an Install button; an engine that stops without writing its log (a distribution to finish setting up or to update) shows its own message.
- The title bar is part of RayTeX's top bar: on Windows the system bar is gone and RayTeX draws the minimize, maximize and close buttons (still usable over dialogs); the empty parts of the bar move the window and a double click maximizes it. On macOS the close, minimize and zoom buttons sit in the top bar. The window state no longer brings back the system bar.
- Projects in folders whose path has a space, an accent or a Windows short name (`C:\Users\Jean Dupont\…`, `RUNNER~1`) build with MiKTeX: the engine runs without `TEXINPUTS`, which made MiKTeX rewrite the root file as a full path that TeX misread. Paths no longer carry the `\\?\` prefix of Windows. The *modern article* template loads its Libertinus fonts by file name, which MiKTeX finds.
- `npm test` works from Node 22.12 (Node 23.5 needed an option to run TypeScript).
- CI: integration tests with MiKTeX on Windows (packages installed on the fly), next to TeX Live on Linux; [docs/WINDOWS.md](docs/WINDOWS.md) explains how to build, test and check MiKTeX on Windows.

### Writing and layout
- **Grid editor** for matrices and tables (buttons *Matrix* and *Table* of the format bar: choose the size, then fill the cells). Enter goes to the next cell (Shift+Enter back), Tab in the last cell adds a row, arrows move between cells, Ctrl/⌘+Enter inserts; cells pasted from a spreadsheet (or LaTeX `&` / `\\`) fill the grid. Matrices: delimiters `( ) [ ] { } | | ‖ ‖`, none or small, with a live preview; inserted in `\[ … \]` outside a formula, amsmath added. Tables: alignment of each column, booktabs, grid or no rules, header row, optional floating table with caption and label; booktabs added.
- Each cell of the grid editor is a small LaTeX editor: colours, completion (commands, labels, citations, `@` shortcuts), macros (trigger + Tab, shortcuts), Ctrl/⌘+B, I, U, E and Ctrl/⌘+Shift+M, `$…$` pairs. An `&` typed in a cell is the character (`\&` in the code); the `&` of an environment inside a cell (`cases`) stay as they are. Spreadsheet values get `%`, `#`, `_` escaped. Tables have a live preview too (formulas, bold, italics, rules, `\multicolumn`), and both previews use the macros of the document. Escape inside a cell closes the completion or the snippet field, not the window.
- Chips also after `\includegraphics{…}` (the image dialog opens on that picture: file, width, placement, caption, label; Update rewrites it, a figure holding other material is edited command only, options other than a width are kept) and after `\begin{tikzpicture}` (the TikZ studio opens on it).
- A chip after `\begin{pmatrix}` (and the other matrices), `\begin{tabular}{…}` and `\begin{array}{…}` reopens the environment in the grid editor; Update rewrites it in place, keeping its indentation, option and column specification (`@{}`, `S`… are kept while the number of columns does not change).
- The editor shows the characters as typed: `->`, `=>`, `<--` are no longer drawn as arrows.
- Symbols clicked one after another go into the same formula (`$\theta\xi$`), the cursor staying after it; the symbols panel inserts the backslash of the command (it wrote `$theta$`).
- Several files selected in the project tree (Shift + click for a range, Ctrl / ⌘ + click to add or remove, Shift + arrows, Ctrl / ⌘ + A), dragged into a folder or the text, opened, inserted or moved to the trash together (one confirmation).
- Files opened from the Finder (double click, *Open with*, dropped on the icon) or passed on the command line: a `.tex` opens in light mode, or in its project when it belongs to one; at start-up it takes the place of the last session. Quitting with ⌘Q asks about unsaved files like closing the window. The macOS bundle is signed ad hoc (it opens on another Mac instead of being reported as damaged).
- Formatting bar: a narrower font box, and the texts of **Image**, **Table** and **Diagram** stay visible (alignment and link buttons go first when the window is narrow).
- Projects folder (`Documents/RayTeX` by default, set in the settings) where new projects go; the start screen and a **My projects** window list them with a preview of their PDF, search, order, rename and trash, plus recent projects and files.
- Light mode: a `.tex` file opened on its own is edited and built without creating anything next to it (builds in the cache, PDF exported where you like); features that need a folder offer to make a project (name and place), copying the file and what it uses.
- Fonts from the formatting bar: a font box showing the document's font and a **Document fonts** menu (main, sans-serif, code, maths — change or reset each), fonts for passages applied to the selection (`\newfontfamily\fontName`), a clearer role chooser in the font window.
- Colours follow the document: with xcolor, its 19 colours, the 68 `dvipsnames` and the SVG colours (the option added without clashing with TikZ or Beamer), search, the document's `\definecolor` colours and a custom colour.
- TikZ studio with a **whiteboard** by default: shapes drawn with the mouse (line, arrow, rectangle, circle, ellipse, polygon, text with maths) on a fine grid (0.25 cm, adjustable, snapping, can be hidden; axes optional), style and coordinates panel, undo/redo, the LaTeX rendering alongside; drawing and code kept in step both ways, unknown statements kept as code.
- Console and problems: text selectable and copyable (copy across the virtualised output, select all, copy all problems, context menu).
- Fix: on AZERTY keyboards, ⌘Z closed the tab (the physical key was matched as ⌘W).
- Speed: precompiled preambles for pdfLaTeX (prepared in the background, 35–60 % faster passes, fallback when unsafe), large windows loaded on demand, template thumbnails three at a time, a shorter pause before live builds (600 ms).
- Formatting bar (undo / redo, heading style, size, bold, italic, underline, monospace, colour, alignment, lists, formula, equation, image, table picker, TikZ, link, footnote, reference, citation, @ macros) and a **See all** panel with every command and its shortcut; **View** menu replacing the panel toggles; close buttons on the PDF preview and the console.
- New projects start empty (name, optional author, location); a **Templates** side panel shows first-page thumbnails compiled once and cached, and applies a template to the main file as one undoable change (other files added, engine recorded).
- Empty files offer ways to start (template, minimal document, slides, section, chapter, inclusion in the main file, bibliography entries).
- Live compilation by default (settings written by older versions are migrated); the console no longer opens by itself; automatic and requested builds are told apart even when queued.
- Undo / redo from anywhere (`Mod-Z`, `Mod-Shift-Z`, `Mod-Y`); `$` pairs only where a formula can start; linked `\begin` / `\end` names; completion leaves braces empty; `@` shortcuts shown next to commands and in a drawn grid.

### Images, drawings and fonts
- *Insert images* dialog: files, clipboard, drag and drop or project images; folder and safe names; width, placement, caption, label; sub-figures; SVG → vector PDF, WebP/GIF/HEIC/BMP/TIFF → PNG.
- TikZ studio: gallery of 22 bilingual drawings, element and style palette, live preview with the document's preamble, centimetre grid and click-to-insert coordinates, insertion at the cursor or in a `.tikz` file, automatic packages and libraries, in-place editing.
- Fonts dialog: system fonts and font files through fontspec (with engine switch), LaTeX font packages for every engine, compiled previews.
- Preview service compiling small standalone documents next to the project; preamble edits keep hyperref last.

### Engine
- Detection of TeX Live, MacTeX, TinyTeX, MiKTeX, Tectonic, system TeX Live and custom folders; index of every installed file.
- Analysis of any package or class source (commands, environments, options) for completion; bilingual knowledge base for common packages; CTAN catalogue.
- Guided installation of distributions and packages (tlmgr, MiKTeX, system package managers), in user mode when possible.
- Smart build driver (engine choice, bibliography / index / glossary tools only when needed, reruns until stable), latexmk, single pass and custom steps.
- Log parsers for TeX, BibTeX and Biber with exact positions, explanations and fixes; lint while typing.
- Native SyncTeX, navigation (definition, references, rename), word count, 16 templates in English and French.
- `raytex` command-line tool.

### Application
- Editor with context-aware completion, live math preview, hovers, snippets, macros, folding, multiple cursors, Vim mode.
- PDF viewer with SyncTeX, problems / output / installations panels, command palette, project search, outline, packages browser, help centre, settings, setup assistant, light and dark themes, English and French interface.
