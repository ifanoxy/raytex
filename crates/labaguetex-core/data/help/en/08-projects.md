# Projects

A labaguetex project is simply a **folder**. It holds your `.tex` and `.bib` files, your images, and optionally a settings file, `labaguetex.toml`.

## Splitting a long document

For a thesis, one file per chapter:

```latex
% main.tex
\documentclass{report}
\begin{document}
\include{chapters/introduction}
\include{chapters/methods}
\end{document}
```

- `\input{file}` inserts the file as is;
- `\include{file}` starts a new page and allows `\includeonly{…}` to build only some chapters.

labaguetex follows inclusions: label completion across all chapters, complete outline, project-wide search, renaming a label everywhere.

## Files and folders

In the file tree:

- right-click: new file or folder, rename, move to trash, copy the path, insert a reference to the file in the document;
- drag and drop to move; drop files from your system to import them;
- <kbd>F2</kbd> renames the selected item.

Changes made by other programs (git, sync, another editor) are detected: open files are reloaded, or you are warned if they had unsaved changes.

## Project settings (labaguetex.toml)

*Settings › This project* writes a `labaguetex.toml` file at the root of the project. It travels with the project (git, archive) and overrides your general settings:

```toml
[project]
name = "Thesis"
main = "main.tex"

[build]
engine = "lualatex"
bib_tool = "biber"
out_dir = "build"
shell_escape = false

[lint]
disabled_rules = ["nbsp-ref"]
```

## Sessions

When starting, labaguetex reopens the last project, its tabs and the active file (can be disabled in *Settings › General*).

## Personal templates

*File › Save project as template…* adds your project to the **My templates** gallery: perfect to reuse your course header or the layout required by your lab.
