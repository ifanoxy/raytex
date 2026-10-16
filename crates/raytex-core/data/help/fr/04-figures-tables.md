# Figures et tableaux

## Insérer une image

Cliquez sur **Image** dans la barre d'outils (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>I</kbd>), **collez une image** (capture d'écran…) dans l'éditeur, ou **glissez des fichiers** depuis le Finder / l'Explorateur. La fenêtre *Insérer des images* s'ouvre :

- **les images** : choisies sur l'ordinateur, collées, déposées, ou déjà présentes dans le projet ;
- **le dossier** du projet où les copier (`figures/` par défaut) et **le nom** de chaque fichier, rendu sûr pour LaTeX (sans espace ni accent) ;
- **la disposition** : figure avec légende (numérotée, avec étiquette pour `\ref`) ou image dans le texte ;
- **la largeur**, en pourcentage de la largeur du texte, avec un aperçu de la page ;
- **la position** : automatique (conseillé), ici exactement, en haut ou en bas d'une page ;
- **le poids des images** copiées dans le projet : *D'origine*, *Allégé* ou *Léger*. Chaque image affiche ce qu'elle pèse et ce qu'elle pèsera. Une photo est réduite (2400 ou 1600 pixels de large au plus) et écrite en JPEG, même si elle était en PNG ; un schéma, une capture d'écran ou une image transparente restent en PNG, sans perte ; PDF, EPS et SVG ne sont pas touchés. L'image que vous avez choisie n'est jamais modifiée, et le choix est retenu pour les fois suivantes.

Plusieurs images deviennent des **sous-figures** côte à côte, chacune avec sa légende : glissez-les par leur poignée (ou flèches haut et bas) pour changer leur ordre, l'aperçu de la page les montre à leur place. Dans le code, elles n'ont qu'**une pastille**, *2 images* : un clic rouvre la fenêtre sur toutes, avec leur ordre, leurs légendes et leur disposition. Les formats que LaTeX ne lit pas sont convertis : un **SVG** devient un PDF qui reste vectoriel, WebP, GIF, HEIC, BMP ou TIFF deviennent des PNG. Les packages nécessaires (`graphicx`, `subcaption`, `float`) sont ajoutés au préambule, et le curseur se place sur la légende, prête à être tapée.

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
  \begin{tabular}{lcr}
    \toprule
    Échantillon & Masse (g) & Durée (s) \\
    \midrule
    A & 12,4 & 3,1 \\
    B & 15,0 & 2,8 \\
    \bottomrule
  \end{tabular}
  \caption{Résultats des mesures.}
  \label{tab:mesures}
\end{table}
```

- Chaque lettre de `{lcr}` définit une colonne : **l**eft, **c**enter, **r**ight ; `p{4cm}` crée une colonne à largeur fixe avec retour à la ligne.
- `&` sépare les cellules, `\\` termine une ligne.
- `booktabs` (`\toprule`, `\midrule`, `\bottomrule`) donne des tableaux nets : évitez les traits verticaux.
- Pour aligner des nombres sur la virgule, utilisez les colonnes `S` du package `siunitx`.

Le raccourci `tab` (extrait) insère un tableau complet.

## Légendes et renvois

RayTeX place la légende **sous** l'image ou le tableau (certaines normes la veulent au-dessus d'un tableau : déplacez alors ces deux lignes). Mettez toujours `\label` **après** `\caption`, sinon le numéro est faux.

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

## Du code dans le document

*Insérer du code…* (dans le menu *Insertion* ou la palette de commandes ; avec du texte sélectionné, il devient le code) ouvre une fenêtre avec le code et, juste dessous, ce code compilé par LaTeX (cadré sur lui, à la largeur d'une ligne de votre document) ; ses réglages sont à droite :

- **le langage**, parmi une quarantaine : Python, C, Java, JavaScript, TypeScript, Rust, Go, SQL, Bash, LaTeX… Ceux que le paquet `listings` ne connaît pas (JavaScript, Rust, Go, JSON, YAML…) sont définis dans le préambule quand vous les utilisez ;
- **l'indentation** : *2 espaces*, *4 espaces* ou *Tabulations* réécrit le code niveau par niveau. Un code collé depuis le milieu d'un fichier revient à la marge, sans les espaces en fin de ligne ; des tabulations et des espaces mélangés sont signalés ;
- **le style du code dans tout le document** : *Clair* (couleurs sur fond pâle), *Sobre* (noir et blanc, s'imprime partout) ou *Sombre*, les numéros de ligne, le retour à la ligne, le cadre et la taille du texte. Il est écrit une seule fois dans le préambule, et tous les codes du document le suivent ;
- **la légende** et son étiquette pour `\ref`.

LaTeX mesure combien de caractères tient une ligne de votre document : la fenêtre dit combien de lignes sont trop longues, et propose le retour à la ligne ou un texte plus petit avant qu'elles ne dépassent dans la marge. Les lettres accentuées (un commentaire en français) passent avec tous les moteurs. Dans une présentation `beamer`, la diapositive reçoit l'option `fragile` dont le code a besoin.

Derrière *Avancé* : la largeur d'une tabulation, lire le code dans un fichier du projet (`\lstinputlisting`, le document suit alors le fichier), et d'autres options pour ce code seul (`firstnumber=10`).

Dans l'éditeur, la pastille **Code** après `\begin{lstlisting}` rouvre la fenêtre sur ce code.
