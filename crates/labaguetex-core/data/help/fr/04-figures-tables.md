# Figures et tableaux

## Insérer une image

Le plus simple : **collez une image** (capture d'écran…) directement dans l'éditeur, ou **glissez un fichier** depuis le Finder / l'Explorateur. labaguetex l'enregistre dans `figures/`, insère la figure complète et ajoute `\usepackage{graphicx}` si besoin.

Vous pouvez aussi utiliser *Insérer › Image depuis un fichier…*, ou écrire :

```latex
\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.8\linewidth]{figures/courbe}
  \caption{Évolution de la température.}
  \label{fig:courbe}
\end{figure}
```

- `[htbp]` laisse LaTeX placer la figure au mieux (*here, top, bottom, page*). Ne luttez pas contre ce placement : c'est lui qui donne des pages équilibrées.
- L'extension du fichier est facultative ; formats acceptés : PDF, PNG, JPG (EPS avec `latex`).
- Survolez `\includegraphics{…}` pour voir un aperçu de l'image.

## Plusieurs images côte à côte

```latex
\usepackage{subcaption}

\begin{figure}[htbp]
  \centering
  \begin{subfigure}{0.48\linewidth}
    \includegraphics[width=\linewidth]{figures/a}
    \caption{Avant.}
  \end{subfigure}\hfill
  \begin{subfigure}{0.48\linewidth}
    \includegraphics[width=\linewidth]{figures/b}
    \caption{Après.}
  \end{subfigure}
  \caption{Comparaison.}
  \label{fig:comparaison}
\end{figure}
```

## Tableaux

```latex
\usepackage{booktabs}

\begin{table}[htbp]
  \centering
  \caption{Résultats des mesures.}
  \label{tab:mesures}
  \begin{tabular}{lcr}
    \toprule
    Échantillon & Masse (g) & Durée (s) \\
    \midrule
    A & 12,4 & 3,1 \\
    B & 15,0 & 2,8 \\
    \bottomrule
  \end{tabular}
\end{table}
```

- Chaque lettre de `{lcr}` définit une colonne : **l**eft, **c**enter, **r**ight ; `p{4cm}` crée une colonne à largeur fixe avec retour à la ligne.
- `&` sépare les cellules, `\\` termine une ligne.
- `booktabs` (`\toprule`, `\midrule`, `\bottomrule`) donne des tableaux nets : évitez les traits verticaux.
- Pour aligner des nombres sur la virgule, utilisez les colonnes `S` du package `siunitx`.

Le raccourci `tab` (extrait) insère un tableau complet.

## Légendes et renvois

La légende d'une figure se place **sous** l'image, celle d'un tableau **au-dessus**. Mettez toujours `\label` **après** `\caption`, sinon le numéro est faux.

```latex
La figure~\ref{fig:courbe} et le tableau~\ref{tab:mesures} montrent…
```

## Dessiner avec TikZ

```latex
\usepackage{tikz}

\begin{tikzpicture}
  \draw[->] (0,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
  \draw[thick, blue] (0,0) parabola (2,1.8);
\end{tikzpicture}
```

Le modèle **Figure TikZ** crée un projet `standalone` idéal pour préparer un schéma à part.
