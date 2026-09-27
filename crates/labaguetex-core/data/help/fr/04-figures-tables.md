# Figures et tableaux

## Insérer une image

Cliquez sur **Image** dans la barre d'outils (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>I</kbd>), **collez une image** (capture d'écran…) dans l'éditeur, ou **glissez des fichiers** depuis le Finder / l'Explorateur. La fenêtre *Insérer des images* s'ouvre :

- **les images** : choisies sur l'ordinateur, collées, déposées, ou déjà présentes dans le projet ;
- **le dossier** du projet où les copier (`figures/` par défaut) et **le nom** de chaque fichier, rendu sûr pour LaTeX (sans espace ni accent) ;
- **la disposition** : figure avec légende (numérotée, avec étiquette pour `\ref`) ou image dans le texte ;
- **la largeur**, en pourcentage de la largeur du texte, avec un aperçu de la page ;
- **la position** : automatique (conseillé), ici exactement, en haut ou en bas d'une page.

Plusieurs images deviennent des **sous-figures** côte à côte, chacune avec sa légende. Les formats que LaTeX ne lit pas sont convertis : un **SVG** devient un PDF qui reste vectoriel, WebP, GIF, HEIC, BMP ou TIFF deviennent des PNG. Les packages nécessaires (`graphicx`, `subcaption`, `float`) sont ajoutés au préambule, et le curseur se place sur la légende, prête à être tapée.

Le code produit ressemble à ceci :

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

Le **studio TikZ** (bouton *Schéma TikZ* de la barre d'outils) crée un schéma avec un aperçu en direct : voir [Schémas TikZ](13-drawings.md).

```latex
\usepackage{tikz}

\begin{tikzpicture}
  \draw[->] (0,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
  \draw[thick, blue] (0,0) parabola (2,1.8);
\end{tikzpicture}
```

Le modèle **Figure TikZ** crée un projet `standalone` idéal pour préparer un schéma à part.
