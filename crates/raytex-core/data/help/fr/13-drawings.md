# Schémas TikZ

TikZ dessine des schémas, graphes, figures géométriques et diagrammes directement en LaTeX : même police, mêmes couleurs que le document, et un résultat vectoriel, net à toutes les tailles. Le **studio TikZ** de RayTeX le rend accessible sans connaître la syntaxe : on dessine à la souris, le code s'écrit tout seul.

## Ouvrir le studio

- Bouton **Schéma TikZ** de la barre d'outils, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>, ou *Insérer › Studio de schémas TikZ*.
- Curseur **dans un schéma existant** : le bouton devient *Modifier le schéma* et le studio s'ouvre sur ce dessin.
- Un fichier `.tikz` du projet : clic droit › *Modifier dans le studio TikZ*.

## Dessiner sur le tableau blanc

Le studio s'ouvre sur l'onglet **Dessin** : un tableau blanc quadrillé, sur lequel on dessine à la souris. Le code TikZ s'écrit tout seul, et le rendu LaTeX exact s'affiche en bas à droite.

| Outil | Touche | Geste |
|---|---|---|
| Sélection | <kbd>V</kbd> | cliquer une forme pour la choisir (<kbd>⇧</kbd> pour en ajouter), la glisser pour la déplacer, tirer ses poignées pour la redimensionner ; glisser le fond déplace la vue |
| Ligne, flèche | <kbd>L</kbd>, <kbd>A</kbd> | glisser d'un point à l'autre |
| Rectangle | <kbd>R</kbd> | glisser d'un coin à l'autre |
| Cercle, ellipse | <kbd>C</kbd>, <kbd>E</kbd> | glisser depuis le centre |
| Polygone | <kbd>P</kbd> | cliquer chaque sommet ; double-clic ou <kbd>Entrée</kbd> pour finir, clic sur le premier point pour fermer |
| Texte | <kbd>T</kbd> | cliquer puis écrire ; `$…$` pour les maths ; double-clic pour modifier |

- **Grille** : fine par défaut (0,25 cm), réglable (0,1 · 0,25 · 0,5 · 1 cm), et les points s'y aimantent ; elle se masque, l'aimantation se coupe, et un **repère** (axes gradués) peut s'afficher, dans le panneau de droite.
- **Style** : couleur du trait, remplissage, épaisseur, tirets ou pointillés, flèches, coins arrondis, opacité ; pour un texte, sa position, un cadre (boîte ou cercle) et sa taille. Sans sélection, le style choisi s'applique aux prochaines formes.
- **Coordonnées** exactes, en centimètres, pour ajuster une forme au millimètre.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> annule, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> rétablit, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd> duplique, les flèches du clavier déplacent, <kbd>Suppr</kbd> efface ; molette pour se déplacer, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + molette pour zoomer.

Le dessin et le code restent liés : l'onglet **Code** montre le code du dessin, que l'on peut modifier à la main ; en revenant au dessin, les formes suivent. Les instructions que le tableau blanc ne sait pas dessiner (`\foreach`, `plot`, nœuds reliés…) sont gardées telles quelles et listées dans le panneau.

## Partir d'un modèle

L'onglet **Modèles** propose plus de vingt schémas prêts à l'emploi, classés par thème : axes et grille, courbes (pgfplots), diagramme en barres, nuage de points, organigramme, arbre de probabilités, carte mentale, frise chronologique, diagramme de Venn, triangle avec angles, cercle trigonométrique, vecteurs, circuit électrique (circuitikz), forces sur un plan incliné, automate, graphe pondéré, réseau de neurones, diagramme commutatif (tikz-cd), droite graduée, matrice annotée.

Chaque modèle compile tel quel, en français comme en anglais.

## Modifier le code

Dans l'onglet **Code** :


- Les boutons **Nœud, Point, Segment, Flèche, Rectangle, Cercle, Courbe, Axes, Fonction, Boucle…** insèrent l'élément à la position du curseur ; <kbd>Tab</kbd> passe d'un champ à l'autre.
- Les **pastilles de couleur** et les **styles** (épaisseur, pointillés, flèches, remplissage) s'ajoutent aux options entre crochets.
- L'autocomplétion connaît les commandes de TikZ et de vos packages.
- Les **bibliothèques** TikZ utilisées sont listées sous le code ; ajoutez-en une avec *+ bibliothèque*.

## L'aperçu en direct

À chaque pause dans la frappe, le schéma est compilé avec le préambule de votre document (couleurs, macros, polices) :

- les erreurs s'affichent sous l'aperçu, avec la ligne en cause ; un clic y amène ;
- la **grille** montre les centimètres de la figure ;
- **un clic sur le dessin insère les coordonnées** de ce point dans le code, par exemple `(1.5,2)`.

## Insérer

- **À la position du curseur**, ou **dans un fichier séparé** (`figures/schema.tikz`, inclus par `\input`) : pratique pour les gros schémas.
- **Dans une figure avec légende** : le schéma est centré, numéroté et reçoit une étiquette pour `\ref`.

RayTeX ajoute au préambule ce dont le schéma a besoin : `\usepackage{tikz}` (ou pgfplots, circuitikz, tikz-cd), les `\usetikzlibrary`, et la bibliothèque `babel` quand le document est en français (elle évite les conflits avec la ponctuation française).

## Pour aller plus loin

```latex
\begin{tikzpicture}[thick]
  \draw[->] (0,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
  \foreach \x in {0.5, 1, ..., 2.5}
    \fill[blue] (\x, {0.3*\x*\x}) circle (1.5pt);
\end{tikzpicture}
```

La documentation complète de TikZ (*TikZ and PGF Manual*) s'ouvre depuis *Packages › tikz › Documentation*.
