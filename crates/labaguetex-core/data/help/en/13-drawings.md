# TikZ drawings

TikZ draws diagrams, graphs, geometric figures and charts directly in LaTeX: same fonts, same colours as the document, and a vector result, sharp at any size. The **TikZ studio** of labaguetex makes it accessible without knowing the syntax by heart.

## Opening the studio

- **TikZ drawing** button of the toolbar, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>, or *Insert › TikZ drawing studio*.
- Cursor **inside an existing drawing**: the button becomes *Edit drawing* and the studio opens on that drawing.
- A `.tikz` file of the project: right-click › *Edit in the TikZ studio*.

## Starting from a model

The gallery offers more than twenty ready-made drawings, sorted by theme: axes and grid, curves (pgfplots), bar chart, scatter plot, flowchart, probability tree, mind map, timeline, Venn diagram, triangle with angles, unit circle, vectors, electric circuit (circuitikz), forces on a slope, automaton, weighted graph, neural network, commutative diagram (tikz-cd), number line, annotated matrix.

Every model compiles as is, in English and in French.

## Editing the code

- The **Node, Point, Line, Arrow, Rectangle, Circle, Curve, Axes, Function, Loop…** buttons insert the element at the cursor; <kbd>Tab</kbd> moves from one field to the next.
- The **colour swatches** and **styles** (thickness, dashes, arrows, filling) are added to the options in brackets.
- Completion knows the commands of TikZ and of your packages.
- The TikZ **libraries** in use are listed under the code; add one with *+ library*.

## The live preview

At every pause in typing, the drawing is compiled with the preamble of your document (colours, macros, fonts):

- errors appear under the preview, with the line concerned; a click takes you there;
- the **grid** shows the centimetres of the figure;
- **a click on the drawing inserts the coordinates** of that point in the code, for example `(1.5,2)`.

## Inserting

- **At the cursor**, or **in its own file** (`figures/schema.tikz`, included with `\input`): handy for large drawings.
- **In a figure with a caption**: the drawing is centred, numbered and gets a label for `\ref`.

labaguetex adds what the drawing needs to the preamble: `\usepackage{tikz}` (or pgfplots, circuitikz, tikz-cd), the `\usetikzlibrary` lines, and the `babel` library when the document uses babel (it avoids conflicts with active punctuation, in French for instance).

## Going further

```latex
\begin{tikzpicture}[thick]
  \draw[->] (0,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
  \foreach \x in {0.5, 1, ..., 2.5}
    \fill[blue] (\x, {0.3*\x*\x}) circle (1.5pt);
\end{tikzpicture}
```

The complete TikZ documentation (*TikZ and PGF Manual*) opens from *Packages › tikz › Documentation*.
