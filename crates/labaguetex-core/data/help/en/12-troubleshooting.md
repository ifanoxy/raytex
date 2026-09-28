# Troubleshooting

## "No TeX distribution found"

- Install a distribution with the assistant (*Settings › TeX distribution*).
- Installed somewhere else? Add the folder containing `pdflatex` under *Additional folders*, then **Detect again**.
- An installation just finished? Click **Detect again**: no need to restart labaguetex.

## "File `xyz.sty' not found"

The package is not installed. Click **Install** in the Problems panel, or look it up in *Packages › CTAN*. With MiKTeX, missing packages can be installed automatically while building.

## "Undefined control sequence"

The reported command does not exist: a typo (`\textbff`), or a package that is not loaded. LaBagueTex suggests the closest command or the package to add.

## References "??" and citations "[?]"

Numbers are known after a complete build. Build again; if it persists, the label or key does not exist (see the warnings).

## "Missing $ inserted"

A math symbol (`_`, `^`, `\alpha`…) is used outside a formula. Wrap it in `$…$`, or escape the character: `\_`.

## It builds, but the layout looks odd

- **Overfull \hbox**: a line sticks out into the margin. Rephrase, allow a word to be hyphenated (`long\-word`), or load `microtype`.
- Figures "float away": that is normal, LaTeX optimises their placement. Use `[htbp]` and references rather than "below".

## Building is slow

- The first pass of a document with a bibliography and an index is the longest; later ones only rerun what is needed.
- TikZ and large images slow things down: prepare complex figures in `standalone` projects and include the PDF.
- Set *Build automatically* to "When saving" rather than "After a pause in typing".

## The PDF does not update

Look at the **Problems** panel: a fatal error prevents the PDF from being produced. The **Output** panel shows the complete compiler output, and *Open the log file* opens the `.log`.

## Resetting

- *Settings › Settings file* opens the settings folder.
- *Clean build files* removes the auxiliary files of the `build/` folder (useful after an error in an `.aux` file).

## Reporting a problem

LaBagueTex is free and open source: report a bug or suggest an improvement on the project repository, ideally with a small document that reproduces the problem.
