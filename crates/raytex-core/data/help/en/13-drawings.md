# TikZ drawings

TikZ draws diagrams, graphs, geometric figures and charts directly in LaTeX: same fonts, same colours as the document, and a vector result, sharp at any size. The **TikZ studio** of RayTeX makes it accessible without knowing the syntax: you draw with the mouse, the code writes itself.

## Opening the studio

- **TikZ drawing** button of the toolbar, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>, or *Insert › TikZ drawing studio*.
- Cursor **inside an existing drawing**: the button becomes *Edit drawing* and the studio opens on that drawing.
- A `.tikz` file of the project: right-click › *Edit in the TikZ studio*.

## Drawing on the whiteboard

The studio opens on the **Drawing** tab: a whiteboard with a grid, drawn on with the mouse. The TikZ code writes itself, and the exact LaTeX rendering shows at the bottom right, always whole; its upper edge is dragged to give it more or less room.

| Tool | Key | Gesture |
|---|---|---|
| Selection | <kbd>V</kbd> | click a shape to choose it (<kbd>⇧</kbd> to add one); **a drag on the paper** draws a rectangle that selects what it touches; a drag on a shape moves it |
| Line, arrow | <kbd>L</kbd>, <kbd>A</kbd> | drag from one point to the other |
| Rectangle | <kbd>R</kbd> | drag from one corner to the other |
| Circle, ellipse | <kbd>C</kbd>, <kbd>E</kbd> | drag from the centre |
| Polygon | <kbd>P</kbd> | click each vertex; double-click or <kbd>Enter</kbd> to finish, click the first point to close |
| Text | <kbd>T</kbd> | click then write; `$…$` for maths; double-click to change it. With the selection tool, a double-click on the paper writes a text there |

Once a shape is drawn, the selection tool comes back: the shape is selected, ready to be moved or styled. The **pin**, under the tools, keeps the chosen tool to draw several shapes in a row.

- **Moving the view**: <kbd>Space</kbd> + drag, the middle button, or the wheel; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + wheel to zoom. When the studio opens and when you come back from another tab, the view frames what is drawn by itself; the *Show the whole drawing* button does it again on demand.
- **Resizing**: the handles of a shape; with several shapes selected, the corners of the box make them grow together, keeping their proportions.
- **Duplicating**: <kbd>Alt</kbd> + drag on a shape leaves a copy of it; the *Duplicate* button of the selection bar or <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd>; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>C</kbd> then <kbd>V</kbd> copies and pastes, also from one picture to another.
- **The selection bar**, at the top of the board as soon as something is selected: duplicate, bring to front or send to back, keep as a set, delete. The right button offers the same actions.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> undoes, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> redoes, the arrow keys move, <kbd>Del</kbd> removes.

### The style, on the right

The panel on the right shows what matters most: the colour and the thickness of the **line**, the arrows of a line, the colour of the **filling**, and for a text what it says and its frame. **Advanced**, on the right of each group, unfolds the rest: dashes or dots, rounded corners, opacity, a colour written by hand (`red!50!black`), the position and the size of a text, the exact coordinates in centimetres. Without a selection, the chosen style goes to the next shapes.

The **grid** is set from its button, under the tools: show it, snap to it, show axes, and its step (0.1 · 0.25 · 0.5 · 1 cm).

### Sets

A **set** is a group of shapes kept under a name, to draw it again with one click: a sensor, a block of a diagram, axes the way you like them.

They have a **shelf of their own, under the paper**:

1. Select the shapes, then **Keep the selection** on the shelf (or *Keep as a set* in the selection bar or under the right button).
2. Give it a name.
3. A click on its picture draws it in the middle of the view, selected, ready to be placed.

Your sets are kept with the settings of RayTeX: they serve in all your pictures and all your projects. A click on the name changes it, the cross removes it. The title of the shelf folds it.

The drawing and the code stay in step: the **Code** tab shows the code of the drawing, which can be changed by hand; back on the drawing, the shapes follow. The statements the whiteboard cannot draw (`\foreach`, `plot`, linked nodes…) are kept as they are.

## Starting from a model

The **Templates** tab offers more than twenty ready-made drawings, sorted by theme: axes and grid, curves (pgfplots), bar chart, scatter plot, flowchart, probability tree, mind map, timeline, Venn diagram, triangle with angles, unit circle, vectors, electric circuit (circuitikz), forces on a slope, automaton, weighted graph, neural network, commutative diagram (tikz-cd), number line, annotated matrix.

Every model compiles as is, in English and in French.

## Editing the code

In the **Code** tab:


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

RayTeX adds what the drawing needs to the preamble: `\usepackage{tikz}` (or pgfplots, circuitikz, tikz-cd), the `\usetikzlibrary` lines, and the `babel` library when the document uses babel (it avoids conflicts with active punctuation, in French for instance).

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
