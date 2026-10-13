# Figures and tables

## Inserting an image

Click **Image** in the toolbar (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>I</kbd>), **paste an image** (a screenshot…) into the editor, or **drag files** from Finder / Explorer. The *Insert images* window opens:

- **the images**: chosen on the computer, pasted, dropped, or already in the project;
- **the folder** of the project to copy them to (`figures/` by default) and **the name** of each file, made safe for LaTeX (no spaces, no accents);
- **the layout**: a figure with a caption (numbered, with a label for `\ref`) or an image in the text;
- **the width**, in percent of the text width, with a preview of the page;
- **the position**: automatic (recommended), exactly here, top or bottom of a page;
- **the weight of the images** copied into the project: *Original*, *Lighter* or *Light*. Each image shows what it weighs and what it will weigh. A photograph is made smaller (2400 or 1600 pixels wide at most) and written as a JPEG, even when it was a PNG; a drawing, a screenshot or an image with transparency stays a PNG, without loss; PDF, EPS and SVG are not touched. The image you chose is never changed, and the choice is kept for the next times.

Several images become **sub-figures** side by side, each with its caption: drag them by their handle (or up and down arrows) to change their order, the sketch of the page shows them at their place. In the code they have **one chip**, *2 images*: a click opens the window again on all of them, with their order, their captions and their layout. Formats LaTeX cannot read are converted: an **SVG** becomes a PDF that stays vector, WebP, GIF, HEIC, BMP or TIFF become PNG. The packages needed (`graphicx`, `subcaption`, `float`) are added to the preamble, and the cursor lands on the caption, ready to type.

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

## Code in the document

*Insert code…* (in *See all* or the command palette; with text selected, it becomes the code) opens a window with the code and, right under it, that code compiled by LaTeX (cut to it, as wide as a line of your document); its settings are on the right:

- **the language**, among about forty: Python, C, Java, JavaScript, TypeScript, Rust, Go, SQL, Bash, LaTeX… Those the `listings` package does not know (JavaScript, Rust, Go, JSON, YAML…) are defined in the preamble when you use them;
- **the indentation**: *2 spaces*, *4 spaces* or *Tabs* writes the code again level by level. Code pasted from the middle of a file comes back to the margin, without the spaces at the end of its lines; tabs and spaces that are mixed are pointed out;
- **the style of code in the whole document**: *Light* (colours on a pale ground), *Plain* (black and white, prints anywhere) or *Dark*, line numbers, line wrapping, the frame and the size of the text. It is written once in the preamble, and every listing of the document follows it;
- **the caption** and its label for `\ref`.

LaTeX measures how many characters a line of your document holds: the window says how many lines are too long, and offers to wrap them or a smaller text before they run into the margin. Accented letters (a comment in French) work with every engine. In a `beamer` presentation, the frame gets the `fragile` option code needs.

Behind *Advanced*: the width of a tab, reading the code from a file of the project (`\lstinputlisting`, the document then follows the file), and other options for this code alone (`firstnumber=10`).

In the editor, the **Code** chip after `\begin{lstlisting}` opens the window again on that code.
