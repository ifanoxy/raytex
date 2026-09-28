# Projects

A LaBagueTex project is simply a **folder**. It holds your `.tex` and `.bib` files, your images, and optionally a settings file, `labaguetex.toml`.

## The projects folder and “My projects”

Every new project goes to the same folder, LaBagueTex's own: `Documents/LaBagueTex` by default, changed in *Settings › General › Projects folder*.

The start screen, and **My projects…** (project menu, top left) while a project is open, show:

- **Recently opened**: the projects and files opened lately, wherever they are; a click opens them again as they were opened;
- **All my projects**: each project of the folder, with a preview of the first page of its PDF, its name and its last change; a search and an order (latest changes, by name). Right-click: open, show in Finder or Explorer, rename, move to the trash (except the open project).

A project located elsewhere opens with **Open folder…**; it then shows among the recent ones.

## Light mode: a file on its own

**Open a .tex file** (or drop a `.tex` on the window, double-click it in the Finder or Explorer, or *Open with › LaBagueTex*) opens it **without making a project**: you edit and build it as usual, but **nothing is created next to it**. Build files go to the application's cache, and **Export PDF** saves the PDF wherever you like (next to the `.tex` by default). The *Light mode* badge reminds you of it in the top bar.

The files it includes (`\input`) and its bibliography are read and can be edited. What needs a folder — adding images, font files, files or folders, a template, a drawing in its own file — first offers to **make a project**: a name and a place (the projects folder by default). The project gets a copy of the file and of everything it uses (included files, bibliography, images); the original file is not changed. The requested action then goes on in the new project.

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

LaBagueTex follows inclusions: label completion across all chapters, complete outline, project-wide search, renaming a label everywhere.

## Files and folders

In the file tree:

- right-click: new file or folder, rename, move to trash, copy the path, insert a reference to the file in the document;
- drag and drop to move; drop files from your system to import them;
- <kbd>F2</kbd> renames the selected item.

**Selecting several files**: <kbd>⇧</kbd>/<kbd>Shift</kbd> + click selects everything up to the clicked file, <kbd>⌘</kbd> (Mac) or <kbd>Ctrl</kbd> + click adds or removes a file; with the keyboard, <kbd>⇧</kbd> + arrows extends the selection and <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd> selects everything (<kbd>Esc</kbd> clears it). The selection is dragged as one into a folder or into the text; its menu (right-click) opens the files, inserts the images or files into the document, moves them to the trash after a single confirmation (also with <kbd>Delete</kbd>) and copies their paths. The bar below the tree says how many items are selected.

A `.tex` file of a LaBagueTex project opened from the Finder or Explorer opens that project; a folder opens as a project.

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

When starting, LaBagueTex reopens the last project, its tabs and the active file (can be disabled in *Settings › General*).

## Personal templates

The **Templates** panel (left bar) shows each template by a picture of its first page, compiled once with your distribution and then cached. A click replaces the text of the main file with the template (one undo gives it back); the other files of the template (bibliography, chapters) are added without overwriting existing ones, and the engine it needs (LuaLaTeX for some templates) is recorded in `labaguetex.toml`.

*File › Save project as template…* adds your project to the **My templates** section: perfect to reuse your course header or the layout required by your lab. Right-click one of your templates to delete it.
