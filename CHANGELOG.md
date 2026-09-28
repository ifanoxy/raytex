# Changelog

All notable changes to LaBagueTex are documented here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] — Unreleased

First version.

### Errors and fixes
- Every error and warning gets a suggestion (a catalogue of about 110 LaTeX, package, BibTeX and Biber messages, in French and English, plus an explanation for the others) and, for the common ones, a fix computed from the sources: misspelt commands, environments, labels, citation keys and option keys; missing packages and TikZ libraries; unclosed braces, formulas and environments; `_`, `^`, `&`, `#` in text; table columns and rows; float placement and oversized images; `\newcommand` arguments; misplaced `\usepackage`; option clashes; babel, fancyhdr, pgfplots, natbib and hyperref warnings; cleveref with French babel.
- **Fix all** in the Problems panel (first suggested fix of each problem shown, duplicates and conflicting edits skipped, then a build) and **Alt+Enter** in the editor for the fixes at the cursor. Diagnostics and fixes follow the edits made since the build.
- Errors reported inside a package (`geometry.sty:1005`) are moved to the `\usepackage` line and option that cause them.
- Tested with the local TeX distribution on about 110 documents made of common commands and common mistakes: each one is reported, explained and fixed, and a document using the most common commands and environments compiles without any warning (`crates/labaguetex-core/tests/common_mistakes.rs`).
- The application is now called **LaBagueTex**; the projects folder `Documents/labaguetex` is renamed `Documents/LaBagueTex` on first start.

### Writing and layout
- Projects folder (`Documents/LaBagueTex` by default, set in the settings) where new projects go; the start screen and a **My projects** window list them with a preview of their PDF, search, order, rename and trash, plus recent projects and files.
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
- `baguette` command-line tool.

### Application
- Editor with context-aware completion, live math preview, hovers, snippets, macros, folding, multiple cursors, Vim mode.
- PDF viewer with SyncTeX, problems / output / installations panels, command palette, project search, outline, packages browser, help centre, settings, setup assistant, light and dark themes, English and French interface.
