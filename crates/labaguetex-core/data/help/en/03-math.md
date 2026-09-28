# Mathematics

Mathematics is where LaTeX shines. LaBagueTex shows a **live preview** of the formula under the cursor, using your own macros.

## Inline and display formulas

```latex
The relation $E = mc^2$ is famous.

\[
  \int_0^1 x^2 \, dx = \frac{1}{3}
\]
```

- `$…$`: formula inside the text (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>M</kbd> wraps the selection).
- `\[ … \]`: centred, unnumbered formula. Avoid `$$ … $$`, which is obsolete in LaTeX.

## Numbered equations

```latex
\begin{equation}
  \nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}
  \label{eq:gauss}
\end{equation}
From equation~\eqref{eq:gauss}…
```

Load `amsmath` (`\usepackage{amsmath}`): nearly every mathematical document needs it.

## Aligning several lines

```latex
\begin{align}
  f(x) &= (x+1)^2 \\
       &= x^2 + 2x + 1
\end{align}
```

`&` marks the alignment point, `\\` starts a new line. `align*` removes the numbers; `\nonumber` removes the number of a single line.

## The essentials

| Result | Code |
|---|---|
| Subscript, superscript | `x_i`, `x^2`, `x_{i,j}^{2n}` |
| Fraction | `\frac{a}{b}` |
| Root | `\sqrt{x}`, `\sqrt[3]{x}` |
| Sum, integral | `\sum_{k=1}^{n}`, `\int_a^b` |
| Limit | `\lim_{x \to 0}` |
| Greek | `\alpha`, `\beta`, `\Gamma`, `\pi` |
| Sets | `\mathbb{R}`, `\in`, `\subset`, `\cup` |
| Arrows | `\to`, `\Rightarrow`, `\iff`, `\mapsto` |
| Stretchy brackets | `\left( \frac{a}{b} \right)` |
| Text in a formula | `\text{if } x > 0` |

The **Symbols** view of the sidebar holds hundreds of symbols: a click inserts one (wrapped in `$…$` when needed, and the required package is added).

## @ shortcuts

In math mode, type `@` followed by a letter: `@a` → `\alpha`, `@b` → `\beta`, `@R` → `\mathbb{R}`, `@8` → `\infty`… The full list is in *Snippets & macros › @ shortcuts*.

## Matrices and cases

```latex
\[
  A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
  \qquad
  |x| = \begin{cases} x & \text{if } x \geq 0 \\ -x & \text{otherwise} \end{cases}
\]
```

## Theorems

```latex
\usepackage{amsthm}
\newtheorem{theorem}{Theorem}[section]
\newtheorem{definition}[theorem]{Definition}

\begin{theorem}[Pythagoras]\label{thm:pythagoras}
  In a right triangle, $a^2 + b^2 = c^2$.
\end{theorem}
\begin{proof}
  …
\end{proof}
```

## Your own commands

```latex
\newcommand{\R}{\mathbb{R}}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
\DeclareMathOperator{\rank}{rank}
```

LaBagueTex learns them immediately: they appear in completion and the preview uses them.
