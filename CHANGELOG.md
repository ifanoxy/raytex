# Changelog

All notable changes to labaguetex are documented here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] — Unreleased

First version.

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
