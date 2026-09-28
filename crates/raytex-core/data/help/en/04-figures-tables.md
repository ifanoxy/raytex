# Figures and tables

## Inserting an image

Click **Image** in the toolbar (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>I</kbd>), **paste an image** (a screenshot…) into the editor, or **drag files** from Finder / Explorer. The *Insert images* window opens:

- **the images**: chosen on the computer, pasted, dropped, or already in the project;
- **the folder** of the project to copy them to (`figures/` by default) and **the name** of each file, made safe for LaTeX (no spaces, no accents);
- **the layout**: a figure with a caption (numbered, with a label for `\ref`) or an image in the text;
- **the width**, in percent of the text width, with a preview of the page;
- **the position**: automatic (recommended), exactly here, top or bottom of a page.

Several images become **sub-figures** side by side, each with its caption. Formats LaTeX cannot read are converted: an **SVG** becomes a PDF that stays vector, WebP, GIF, HEIC, BMP or TIFF become PNG. The packages needed (`graphicx`, `subcaption`, `float`) are added to the preamble, and the cursor lands on the caption, ready to type.

The code produced looks like this:

```latex
\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.8\linewidth]{figures/curve}
  \caption{Temperature over time.}
  \label{fig:curve}
\end{figure}
```

- `[htbp]` lets LaTeX place the figure where it fits best (*here, top, bottom, page*). Don't fight it: it gives balanced pages.
- The file extension is optional; accepted formats: PDF, PNG, JPG (EPS with `latex`).
- Hover `\includegraphics{…}` to preview the image.

## Several images side by side

```latex
\usepackage{subcaption}

\begin{figure}[htbp]
  \centering
  \begin{subfigure}{0.48\linewidth}
    \includegraphics[width=\linewidth]{figures/a}
    \caption{Before.}
  \end{subfigure}\hfill
  \begin{subfigure}{0.48\linewidth}
    \includegraphics[width=\linewidth]{figures/b}
    \caption{After.}
  \end{subfigure}
  \caption{Comparison.}
  \label{fig:comparison}
\end{figure}
```

## Tables

```latex
\usepackage{booktabs}

\begin{table}[htbp]
  \centering
  \caption{Measurements.}
  \label{tab:measurements}
  \begin{tabular}{lcr}
    \toprule
    Sample & Mass (g) & Time (s) \\
    \midrule
    A & 12.4 & 3.1 \\
    B & 15.0 & 2.8 \\
    \bottomrule
  \end{tabular}
\end{table}
```

- Each letter of `{lcr}` defines a column: **l**eft, **c**entre, **r**ight; `p{4cm}` makes a fixed-width column with line wrapping.
- `&` separates cells, `\\` ends a row.
- `booktabs` (`\toprule`, `\midrule`, `\bottomrule`) gives clean tables: avoid vertical rules.
- To align numbers on the decimal point, use the `S` columns of `siunitx`.

The `tab` snippet inserts a complete table.

## Captions and references

A figure caption goes **below** the image, a table caption **above** it. Always put `\label` **after** `\caption`, otherwise the number is wrong.

```latex
Figure~\ref{fig:curve} and table~\ref{tab:measurements} show…
```

## Drawing with TikZ

The **TikZ studio** (*TikZ drawing* button of the toolbar) creates a drawing with a live preview: see [TikZ drawings](13-drawings.md).

```latex
\usepackage{tikz}

\begin{tikzpicture}
  \draw[->] (0,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
  \draw[thick, blue] (0,0) parabola (2,1.8);
\end{tikzpicture}
```

The **TikZ figure** template creates a `standalone` project, ideal to prepare a drawing on its own.
