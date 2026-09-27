# Figures and tables

## Inserting an image

The easiest way: **paste an image** (a screenshot…) straight into the editor, or **drag a file** from Finder / Explorer. labaguetex saves it in `figures/`, inserts a complete figure and adds `\usepackage{graphicx}` if needed.

You can also use *Insert › Image from a file…*, or write:

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

```latex
\usepackage{tikz}

\begin{tikzpicture}
  \draw[->] (0,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
  \draw[thick, blue] (0,0) parabola (2,1.8);
\end{tikzpicture}
```

The **TikZ figure** template creates a `standalone` project, ideal to prepare a drawing on its own.
