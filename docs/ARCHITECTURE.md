# Architecture

labaguetex is split into an **engine** that knows everything about LaTeX and has no user interface, and **front ends** that use it: a desktop application and a command-line tool.

```
┌────────────────────────── ui/ (Svelte 5, TypeScript) ──────────────────────────┐
│ CodeMirror 6 editor · pdf.js viewer · panels · stores (ui/lib/state)           │
└───────────────▲──────────────────────────────────────────────┬─────────────────┘
                │ events (build:*, tex:status, job:*, fs:changed)│ typed IPC (ui/lib/ipc.ts)
┌───────────────┴──────────────── labaguetex-desktop (Tauri 2) ▼─────────────────┐
│ commands/* (async, run on the blocking pool) · AppState · file watcher          │
└───────────────────────────────────────▲──────────────────────────────────────────┘
                                        │ plain Rust calls
┌─────────────────────────────── labaguetex-core ─────────────────────────────────┐
│ workspace · syntax · completion · lint · navigation · build · log · synctex      │
│ tex (distributions, texmf index, package analysis, managers, CTAN) · kb · help   │
└──────────────────────────────────────────────────────────────────────────────────┘
                     ▲ also used by labaguetex-cli (`baguette`)
```

## labaguetex-core

Pure Rust, synchronous, no global state: every function receives what it needs. It is tested on its own (`cargo test -p labaguetex-core`); tests that need a TeX installation or the network are marked `#[ignore]`.

| Module | Role |
|---|---|
| `text` | Line index and conversions between byte offsets and positions. Positions exchanged with the interface are **0-based line + UTF-16 column**, like LSP and CodeMirror. |
| `syntax` | Fast scanner producing a document index: commands, environments, sections, labels, references, citations, includes, packages, definitions, math spans, magic comments. `context` finds what the cursor is in (command name, argument of `\ref`, option list…). |
| `workspace` | Open documents (editor text overrides disk), project root detection (`% !TEX root`, `\input` graph, `labaguetex.toml`), outline, labels, citations, project search, aux data from the last build. |
| `kb` | Knowledge base embedded at compile time from `data/packages/*.json`: bilingual documentation of common commands, environments, symbols and options. |
| `tex` | `discovery` finds distributions (TeX Live, MacTeX, TinyTeX, MiKTeX, Tectonic, system TeX Live, custom folders, login-shell `PATH`). `texmf` indexes every installed file (`ls-R`, TEXMFHOME, MiKTeX roots, Tectonic bundles). `packages` analyses **any** `.sty`/`.cls` source to extract commands, environments and options (with a cache). `manager` builds install/update plans (tlmgr, MiKTeX, dnf/zypper) with user-mode or elevation. `ctan` reads the CTAN catalogue. |
| `completion` | Completion lists for every context, merging the kernel, the knowledge base, analysed packages and the project. Items are narrowed to what is typed before crossing the IPC bridge. |
| `lint` | Checks that do not need a build (references, duplicates, missing files/packages, engine requirements, typography…). Each rule has an id and can be disabled. |
| `navigation` | Hover, go to definition (including package sources), references, rename, formula under the cursor. |
| `build` | Build plans and the smart driver (with `build::preamble`: pdfLaTeX preambles dumped into formats with mylatexformat in the background, keyed by the preamble, the local files it reads and the distribution; unsafe preambles skipped, failed passes redone without the format): engine choice, bibliography / index / glossary tools run only when their inputs changed (hashes in `build/.labaguetex-build.json`), reruns until stable, latexmk / single pass / custom steps, cancellation. `refine` locates the exact token of an error. |
| `log` | TeX log parser (file stack, `file:line:error` and classic formats, warnings, bad boxes, missing files, rerun requests) and BibTeX / Biber logs; `hints` turns messages into explanations and fixes using `data/errors.json`. |
| `synctex` | Native SyncTeX parser (`.synctex.gz`), forward and inverse search. |
| `aux` | Label numbers, citations and the table of contents written by the last build. |
| `preview` | Small `standalone` documents compiled next to the project (TikZ drawings, font samples): the project's preamble without what breaks previews, errors mapped to the lines of the snippet, bounding box of the first TikZ picture (for the coordinate grid). |
| `tikz`, `images`, `fonts` | Gallery of TikZ drawings (`data/tikz.json`); LaTeX-safe file names and SVG → PDF conversion (svg2pdf, pure Rust); system fonts and font files (fontdb), OpenType `MATH` detection, fontspec code, LaTeX font packages (`data/fonts.json`). |
| `templates`, `help`, `settings`, `i18n`, `process`, `wordcount`, `bib` | Templates (empty projects, templates applied to an open project, example values for thumbnails compiled by `preview::compile_document`), help centre, settings files (versioned and migrated), messages, process spawning (streaming, process-tree kill, elevation), word count, BibTeX parsing. |

### Data (`crates/labaguetex-core/data`)

Everything under `data/` is embedded by `build.rs`; adding a file never requires touching Rust code. See [knowledge-base.md](knowledge-base.md).

## labaguetex-desktop

A thin Tauri 2 shell around the engine.

- **`state.rs`**: `AppState` holds settings, the session, the TeX state (distributions, texmf index, package analyser), the open project (`Workspace` + file watcher), the build control and running jobs. Locks are short and never held across I/O.
- **`commands/`**: every IPC command is `async` and runs engine work on Tauri's blocking pool, so the interface never freezes. Paths coming from the interface are checked (`writable_path`) before writing.
- **Events**: `build:started`, `build:step`, `build:output` (batched every 60 ms), `build:finished`; `tex:status`; `job:output`, `job:finished`; `fs:changed` (debounced file watcher, ignoring the application's own writes).
- **Builds** are coalesced: a build requested while another runs is queued, only the latest request runs next.
- **Installations** use typed requests (`JobRequest`); the interface never sends shell commands. Plans are shown to the user before running.
- **Security**: strict CSP, minimal capabilities, asset protocol limited to the open project and built PDFs.
- **Background**: the web view is never throttled or unloaded when the window is hidden (`backgroundThrottling: disabled`), so unsaved work and running builds are never interrupted.

## ui/

Svelte 5 (runes) + TypeScript, built by Vite.

- `lib/ipc.ts` and `lib/types.ts`: typed access to every command and event; keep them in sync with the Rust structures.
- `lib/state/*.svelte.ts`: stores. `editor` owns **one** CodeMirror `EditorView` and one `EditorState` per open file (switching tabs swaps states: memory stays low and switching is instant). It syncs changes to the engine (debounced), applies diagnostics, saves, reloads external changes and handles navigation and pasted images. `project`, `build`, `viewer`, `search`, `tex`, `diagnostics`, `ui`, `app` hold the rest.
- `lib/editor/*`: CodeMirror extensions (LaTeX/BibTeX highlighting, structure and folding, completion, hover, math preview, theme, navigation).
- `lib/editor/{format,dollar,linked-envs}.ts`: formatting commands of the ribbon (headings, sizes, colours, alignment, lists, tables), `$` typing and linked environment names; pure enough to be tested with `npm test`.
- `components/layout/{Toolbar,FormatBar,AllTools}.svelte`: top bar (project, build, View menu), formatting bar and its "See all" panel. `components/sidebar/Templates.svelte` and `lib/state/templates.svelte.ts`: templates with thumbnails (first page compiled by the engine's `template_thumbnail`, rendered by pdf.js). `components/editor/EmptyStart.svelte`: suggestions shown over empty files.
- `lib/fonts.ts`, `lib/colors.ts`, `lib/keys.ts`, `lib/tikz/model.ts`: fonts and colours of a document (read from its preamble, edits that change them), shortcut matching (layout-aware: AZERTY letters are never taken for the US key at the same place), and the TikZ whiteboard model (shapes ⇄ TikZ code, unknown statements kept); tested with `npm test`. `components/views/tikz/{Whiteboard,ShapeProps}.svelte`: the whiteboard and its panel. `components/layout/{FontMenu,ColorMenu}.svelte`: menus of the formatting bar.
- Large windows (settings, help, image, font, TikZ studio…) are loaded on demand by `App.svelte`, and prepared while the application is idle.
- `lib/preamble.ts`: pure functions editing the preamble (add packages before hyperref, merge `\usetikzlibrary`, replace font commands, comment out packages), applied by `editor.transformRoot` as one undoable change; tested with `npm test`.
- `components/views/{ImageDialog,TikzStudio,FontDialog}.svelte`: the image, drawing and font tools; `components/common/PdfPreview.svelte` shows their compiled previews.
- `lib/actions.ts`: the registry of every command, used by the palette, menus and customisable shortcuts.
- `lib/locales/{en,fr}.ts`: interface texts; TypeScript checks that both have the same keys.
- `components/`: layout, sidebar views, editor area, PDF viewer, bottom panel, dialogs and full-screen views.
- `dev/mocks.ts` (browser development with a simulated engine) and `dev/selftest.ts` (end-to-end check of the real application, `LABAGUETEX_SELFTEST=<project> npm run app:dev`) are development-only and never bundled.

## Design principles

- **Every package counts**: nothing is limited to a hard-coded list; the knowledge base only adds documentation on top of what is read from the installed sources.
- **Precise positions**: diagnostics carry exact ranges; fixes are text edits, never guesses.
- **Nothing runs behind the user's back**: installation commands are shown before they run; shell escape is off unless enabled per project.
- **Fast by construction**: incremental document indexes, one editor view, visible-pages-only PDF rendering, batched events, work off the main thread.
- **Bilingual**: every user-facing text exists in English and French.
