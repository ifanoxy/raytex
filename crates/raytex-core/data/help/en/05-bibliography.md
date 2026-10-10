# Bibliography

RayTeX reads your `.bib` files, completes citation keys, shows the full entry on hover and runs Biber or BibTeX only when needed.

## The .bib file

Each reference has a **type**, a **key** and fields:

```bibtex
@book{knuth1984,
  author    = {Knuth, Donald E.},
  title     = {The {\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984},
}

@article{lamport1986,
  author  = {Lamport, Leslie},
  title   = {{LaTeX}: A Document Preparation System},
  journal = {Addison-Wesley},
  year    = {1986},
}
```

Tip: most sites (Google Scholar, publishers, Zotero) export BibTeX directly.

## With biblatex (recommended)

```latex
\usepackage[backend=biber, style=authoryear]{biblatex}
\addbibresource{references.bib}

\begin{document}
According to \textcite{knuth1984}, … \parencite{lamport1986}.

\printbibliography
\end{document}
```

- Common styles: `numeric`, `authoryear`, `alphabetic`, `apa`, `ieee`.
- `\cite`, `\parencite` (in parentheses), `\textcite` (in the text), `\footcite` (in a footnote).

## With BibTeX (classic)

```latex
\bibliographystyle{plain}
\bibliography{references}
```

Use `natbib` for `\citet` / `\citep`. Journals often require their own `.bst` file.

## Citing in RayTeX

- Type `\cite{`: references appear with authors, year and title; type an author name or a word of the title to filter.
- Hover a key to see the complete reference.
- The **Structure › References** view lists every entry; a click inserts `\cite{…}`.

## The Bibliography panel

The book icon, in the bar on the left, opens the bibliography of the project: every entry of your `.bib` files with its key, its title, its authors and the number of times it is cited.

- **Cite**: the quote of an entry writes `\cite{key}` at the cursor.
- **Edit**: a click opens the entry in a form. The usual fields of its kind are in sight, the others behind *Advanced*; what is written in the file is kept as it is (braces, macros such as `jan`).
- **Add**: the `+` opens an empty form. Paste a DOI, an arXiv identifier or a BibTeX entry copied from a site, then *Fill in*: the fields are filled and a key is suggested (`knuth1984`). For a DOI or an arXiv identifier, RayTeX asks doi.org or arxiv.org for the reference, only when you click *Fill in*.
- **Not cited**: the entries the document cites nowhere (none with `\nocite{*}`).
- **To check**: duplicate keys, and works entered twice (same DOI, or same title and year).

In a project without a `.bib` file, the first entry makes `references.bib` next to the main file; the document still has to name it (`\addbibresource{references.bib}` or `\bibliography{references}`, see above).

## Building

RayTeX detects `biber` or `bibtex` by itself and only reruns them when citations or the `.bib` changed. Biber and BibTeX errors (missing field, duplicate key…) appear in the **Problems** panel with the offending `.bib` line.

A citation shown as **[?]** or in bold is not resolved yet: build again, or check the key.
