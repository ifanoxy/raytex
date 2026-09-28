# Mathématiques

Les mathématiques sont le point fort de LaTeX. RayTeX affiche un **aperçu en direct** de la formule sous le curseur, avec vos propres macros.

## Formules en ligne et centrées

```latex
La relation $E = mc^2$ est célèbre.

\[
  \int_0^1 x^2 \, dx = \frac{1}{3}
\]
```

- `$…$` : formule dans le texte (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>M</kbd> entoure la sélection).
- `\[ … \]` : formule centrée, non numérotée. Évitez `$$ … $$`, obsolète en LaTeX.

## Équations numérotées

```latex
\begin{equation}
  \nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}
  \label{eq:gauss}
\end{equation}
D'après l'équation~\eqref{eq:gauss}…
```

Chargez `amsmath` (`\usepackage{amsmath}`) : presque tous les documents mathématiques en ont besoin.

## Aligner plusieurs lignes

```latex
\begin{align}
  f(x) &= (x+1)^2 \\
       &= x^2 + 2x + 1
\end{align}
```

`&` marque le point d'alignement, `\\` passe à la ligne. `align*` supprime les numéros ; `\nonumber` retire le numéro d'une seule ligne.

## L'essentiel

| Résultat | Code |
|---|---|
| Indice, exposant | `x_i`, `x^2`, `x_{i,j}^{2n}` |
| Fraction | `\frac{a}{b}` |
| Racine | `\sqrt{x}`, `\sqrt[3]{x}` |
| Somme, intégrale | `\sum_{k=1}^{n}`, `\int_a^b` |
| Limite | `\lim_{x \to 0}` |
| Grec | `\alpha`, `\beta`, `\Gamma`, `\pi` |
| Ensembles | `\mathbb{R}`, `\in`, `\subset`, `\cup` |
| Flèches | `\to`, `\Rightarrow`, `\iff`, `\mapsto` |
| Parenthèses adaptées | `\left( \frac{a}{b} \right)` |
| Texte dans une formule | `\text{si } x > 0` |

La vue **Symboles** de la barre latérale présente des centaines de symboles : un clic les insère (entourés de `$…$` si besoin, et le package nécessaire est ajouté).

## Raccourcis @

En mode mathématique, tapez `@` suivi d'une lettre : `@a` → `\alpha`, `@b` → `\beta`, `@R` → `\mathbb{R}`, `@8` → `\infty`… La liste complète est dans *Extraits et macros › Raccourcis @*.

## Matrices et cas

```latex
\[
  A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
  \qquad
  |x| = \begin{cases} x & \text{si } x \geq 0 \\ -x & \text{sinon} \end{cases}
\]
```

## Théorèmes

```latex
\usepackage{amsthm}
\newtheorem{theoreme}{Théorème}[section]
\newtheorem{definition}[theoreme]{Définition}

\begin{theoreme}[Pythagore]\label{thm:pythagore}
  Dans un triangle rectangle, $a^2 + b^2 = c^2$.
\end{theoreme}
\begin{proof}
  …
\end{proof}
```

## Vos propres commandes

```latex
\newcommand{\R}{\mathbb{R}}
\newcommand{\norme}[1]{\left\lVert #1 \right\rVert}
\DeclareMathOperator{\rang}{rang}
```

RayTeX les apprend immédiatement : elles apparaissent dans l'autocomplétion et l'aperçu les utilise.
