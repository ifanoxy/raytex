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
| Sélection | <kbd>V</kbd> | cliquer une forme pour la choisir (<kbd>⇧</kbd> pour en ajouter) ; **glisser sur le papier** trace un rectangle qui sélectionne ce qu'il touche ; glisser une forme la déplace |
| Ligne, flèche | <kbd>L</kbd>, <kbd>A</kbd> | glisser d'un point à l'autre |
| Rectangle | <kbd>R</kbd> | glisser d'un coin à l'autre |
| Cercle, ellipse | <kbd>C</kbd>, <kbd>E</kbd> | glisser depuis le centre |
| Polygone | <kbd>P</kbd> | cliquer chaque sommet ; double-clic ou <kbd>Entrée</kbd> pour finir, clic sur le premier point pour fermer |
| Texte | <kbd>T</kbd> | cliquer puis écrire ; `$…$` pour les maths ; double-clic pour modifier. Avec l'outil de sélection, un double-clic sur le papier écrit un texte à cet endroit |

Une fois une forme dessinée, l'outil de sélection revient : elle est sélectionnée, prête à être déplacée ou mise en forme. La **punaise**, sous les outils, garde l'outil choisi pour dessiner plusieurs formes de suite.

- **Déplacer la vue** : <kbd>Espace</kbd> + glisser, le bouton du milieu, ou la molette ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + molette pour zoomer.
- **Redimensionner** : les poignées d'une forme ; avec plusieurs formes sélectionnées, les coins du cadre les agrandissent ensemble, en gardant leurs proportions.
- **Dupliquer** : <kbd>Alt</kbd> + glisser une forme en laisse une copie ; le bouton *Dupliquer* de la barre de sélection ou <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd> ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>C</kbd> puis <kbd>V</kbd> copie et colle, aussi d'un schéma à l'autre.
- **La barre de sélection**, en haut du tableau dès que quelque chose est sélectionné : dupliquer, mettre devant ou derrière, garder comme ensemble, supprimer. Le clic droit propose les mêmes actions.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> annule, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> rétablit, les flèches du clavier déplacent, <kbd>Suppr</kbd> efface.

### Le style, à droite

Le panneau de droite montre l'essentiel : la couleur et l'épaisseur du **trait**, les flèches d'une ligne, la couleur du **remplissage**, et pour un texte son contenu et son cadre. **Avancé**, à droite de chaque groupe, déplie le reste : tirets ou pointillés, coins arrondis, opacité, une couleur écrite à la main (`red!50!black`), la position et la taille d'un texte, les coordonnées exactes en centimètres. Sans sélection, le style choisi s'applique aux prochaines formes.

La **grille** se règle depuis son bouton, sous les outils : l'afficher, s'y aimanter, montrer un repère, et son pas (0,1 · 0,25 · 0,5 · 1 cm).

### Les ensembles

Un **ensemble** est un groupe de formes gardé sous un nom, pour le redessiner d'un clic : un capteur, un bloc de schéma, un repère à votre façon.

Ils ont leur propre **étagère, sous le papier** :

1. Sélectionnez les formes, puis **Garder la sélection** sur l'étagère (ou *Garder comme ensemble* dans la barre de sélection ou au clic droit).
2. Donnez-lui un nom.
3. Un clic sur sa vignette le dessine au milieu de la vue, sélectionné, prêt à être placé.

Vos ensembles sont gardés avec les réglages de RayTeX : ils servent dans tous vos schémas et tous vos projets. Un clic sur le nom le change, la croix le supprime. Le titre de l'étagère la replie.

Le dessin et le code restent liés : l'onglet **Code** montre le code du dessin, que l'on peut modifier à la main ; en revenant au dessin, les formes suivent. Les instructions que le tableau blanc ne sait pas dessiner (`\foreach`, `plot`, nœuds reliés…) sont gardées telles quelles.

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
