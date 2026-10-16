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
| Curve | <kbd>B</kbd> | click the points it goes through; double-click or <kbd>Enter</kbd> to finish, click the first point to close it. It is the smooth curve of TikZ (`plot[smooth]`): the board draws it as LaTeX will |
| Text | <kbd>T</kbd> | click then write; `$…$` for maths; double-click to change it. With the selection tool, a double-click on the paper writes a text there |
| Link | <kbd>K</kbd> | drag from one text to another: an arrow joins them, from border to border, and **follows them** when they are moved |

Once a shape is drawn, the selection tool comes back: the shape is selected, ready to be moved or styled. The **pin**, under the tools, keeps the chosen tool to draw several shapes in a row.

- **Moving the view**: <kbd>Space</kbd> + drag, the middle button, or the wheel; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + wheel to zoom. When the studio opens and when you come back from another tab, the view frames what is drawn by itself; the *Show the whole drawing* button does it again on demand.
- **Aligning**: what is moved snaps to the sides and the middle of the other shapes when it is close to them, and a pink line shows it. With <kbd>⌘</kbd>/<kbd>Ctrl</kbd> held, it does not snap.
- **Links** join texts (framed or not, round or rectangular). In the code, each linked text gets a name (`n1`, `n2`…) and the link is written `\draw[->] (n1) -- (n2);`: TikZ draws it from border to border. Selected, a link has its group on the right: straight or bent to one side, and a text set on it. Deleting a text deletes its links.
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

**Export** writes your sets in a file (`.json`), for another computer or for someone else; **Import** adds those of such a file to yours: a set you already have is not added twice, and a name that is taken gets a number.

The drawing and the code stay in step: the **Code** tab shows the code of the drawing, which can be changed by hand; back on the drawing, the shapes follow. The statements the whiteboard cannot draw (`\foreach`, plots of functions, styles of your own…) are kept as they are.

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

## Function plots

The plot button of the formatting bar (or the *Maths* menu, or the command palette: *Function plots*) opens the graph studio: RayTeX writes the plot with pgfplots.

- **Functions** are written as on paper: `x^2 - 2x + 1`, `2sin(x)`, `e^(-x)`, `ln(x)/x`, `|x - 1|`, `√x`. Each has its colour, its line (solid, dashed, dotted), its width, its interval and its name, on the curve (`\mathcal{C}_f`) or in a legend. A curve is cut where it is not defined and at its poles: `1/x` is drawn on both sides of 0, `√x` from 0.
- **Tangents**: to a curve at a point, worked out from the derivative, with their equation shown (`y = 2x - 2`), the point of contact and a name.
- **Points**: on a curve (`A`, at x = 2 on `f`) or by their coordinates, with dashed lines to the axes.
- **Lines** `x = a` (a vertical asymptote) or `y = b`, and **areas** under a curve or between two curves, from one abscissa to another.
- **Axes**: the range of x and of y (that of y follows the curves by itself), axes through the origin (as in textbooks), a box, or left and bottom, a grid, the same unit on both axes; in *Advanced*, the names of the axes, the ticks and the size.

The rendering of LaTeX follows as you type. A French document writes its numbers with a comma. Each line of the drawing says in a comment what it draws (`% f(x) = x^2 - 1`): the **Plot** chip after `\begin{tikzpicture}` opens the plot again in the studio, and what was added to it by hand is kept.

## Tables of variations and of signs

The button next to it (*Table of variations or of signs*) opens a grid laid out as the table (package `tkz-tab`):

- **The values of x** at the top, in LaTeX (`-\infty`, `\frac{1}{2}`); the **+** between two values adds one, the cross of a value takes it out.
- **A line of signs**: a click on an interval changes its sign (+, −, nothing, hatched); a click under a value puts there a zero, a forbidden value (double bar) or a bar.
- **A line of variations**: each value is high or low (the arrow is drawn between them), or without a value; the double bar of a forbidden value gives a limit on each side.
- **From a function**: write `f(x)` and the interval, then **Variations** (sign of the derivative and variations) or **Signs**. RayTeX works out the derivative, its zeros, the forbidden values and the limits; simple values are written exactly (`2`, `\frac{1}{3}`, `\frac{\pi}{2}`, `\sqrt{3}`), others are rounded, and it says so. Everything stays editable.

The **Table** chip after `\begin{tikzpicture}` opens it again.

## Probability trees

*Maths › Probability tree…* (or the command palette) opens the tree studio: one line a branch, set in by its level, with its event (`A`, or `\overline{A}`: the **Ā** button gives the complement) and its probability (`0.3`, `1/3`, `p`).

- Of two branches, a probability left empty is worked out: `1 − p` (`0.7`, `2/3`, `1-p`), shown in grey.
- Each node is checked: branches that do not make 1 are said.
- **Probability of each path at its end** writes `P(A ∩ B) = 0.12` at the end of each path, worked out exactly (as a fraction when there is one in it).
- **One level more** adds an event and its complement at the end of each branch; **Same events at each level** copies those of the first branch of a level.

The tree is written with TikZ, growing right (`grow'=right`), the probabilities above the upper branches and below the lower ones, numbers written the French way in a French document. The **Tree** chip opens it again in the studio.

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
