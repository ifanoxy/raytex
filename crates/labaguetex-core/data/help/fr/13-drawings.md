# Schémas TikZ

TikZ dessine des schémas, graphes, figures géométriques et diagrammes directement en LaTeX : même police, mêmes couleurs que le document, et un résultat vectoriel, net à toutes les tailles. Le **studio TikZ** de labaguetex le rend accessible sans connaître la syntaxe par cœur.

## Ouvrir le studio

- Bouton **Schéma TikZ** de la barre d'outils, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>, ou *Insérer › Studio de schémas TikZ*.
- Curseur **dans un schéma existant** : le bouton devient *Modifier le schéma* et le studio s'ouvre sur ce dessin.
- Un fichier `.tikz` du projet : clic droit › *Modifier dans le studio TikZ*.

## Partir d'un modèle

La galerie propose plus de vingt schémas prêts à l'emploi, classés par thème : axes et grille, courbes (pgfplots), diagramme en barres, nuage de points, organigramme, arbre de probabilités, carte mentale, frise chronologique, diagramme de Venn, triangle avec angles, cercle trigonométrique, vecteurs, circuit électrique (circuitikz), forces sur un plan incliné, automate, graphe pondéré, réseau de neurones, diagramme commutatif (tikz-cd), droite graduée, matrice annotée.

Chaque modèle compile tel quel, en français comme en anglais.

## Modifier le code

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

labaguetex ajoute au préambule ce dont le schéma a besoin : `\usepackage{tikz}` (ou pgfplots, circuitikz, tikz-cd), les `\usetikzlibrary`, et la bibliothèque `babel` quand le document est en français (elle évite les conflits avec la ponctuation française).

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
