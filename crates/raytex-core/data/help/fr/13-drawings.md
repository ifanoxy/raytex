# Schémas TikZ

TikZ dessine des schémas, graphes, figures géométriques et diagrammes directement en LaTeX : même police, mêmes couleurs que le document, et un résultat vectoriel, net à toutes les tailles. Le **studio TikZ** de RayTeX le rend accessible sans connaître la syntaxe : on dessine à la souris, le code s'écrit tout seul.

## Ouvrir le studio

- Bouton **Schéma TikZ** de la barre d'outils, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>, ou *Insertion › Studio de schémas TikZ*.
- Curseur **dans un schéma existant** : le bouton devient *Modifier le schéma* et le studio s'ouvre sur ce dessin.
- Un fichier `.tikz` du projet : clic droit › *Modifier dans le studio TikZ*.

## Dessiner sur le tableau blanc

Le studio s'ouvre sur l'onglet **Dessin** : un tableau blanc quadrillé, sur lequel on dessine à la souris. Le code TikZ s'écrit tout seul, et le rendu LaTeX exact s'affiche en bas à droite, toujours en entier ; son bord supérieur se fait glisser pour lui donner plus ou moins de place.

| Outil | Touche | Geste |
|---|---|---|
| Sélection | <kbd>V</kbd> | cliquer une forme pour la choisir (<kbd>⇧</kbd> pour en ajouter) ; **glisser sur le papier** trace un rectangle qui sélectionne ce qu'il touche ; glisser une forme la déplace |
| Ligne, flèche | <kbd>L</kbd>, <kbd>A</kbd> | glisser d'un point à l'autre |
| Rectangle | <kbd>R</kbd> | glisser d'un coin à l'autre |
| Cercle, ellipse | <kbd>C</kbd>, <kbd>E</kbd> | glisser depuis le centre |
| Polygone | <kbd>P</kbd> | cliquer chaque sommet ; double-clic ou <kbd>Entrée</kbd> pour finir, clic sur le premier point pour fermer |
| Courbe | <kbd>B</kbd> | cliquer les points par où elle passe ; double-clic ou <kbd>Entrée</kbd> pour finir, clic sur le premier point pour la fermer. C'est la courbe lisse de TikZ (`plot[smooth]`) : le tableau la dessine comme LaTeX la dessinera |
| Texte | <kbd>T</kbd> | cliquer puis écrire ; `$…$` pour les maths ; double-clic pour modifier. Avec l'outil de sélection, un double-clic sur le papier écrit un texte à cet endroit |
| Lien | <kbd>K</kbd> | glisser d'un texte à un autre : une flèche les relie, de bord à bord, et **les suit** quand on les déplace |

Une fois une forme dessinée, l'outil de sélection revient : elle est sélectionnée, prête à être déplacée ou mise en forme. La **punaise**, sous les outils, garde l'outil choisi pour dessiner plusieurs formes de suite.

- **Déplacer la vue** : <kbd>Espace</kbd> + glisser, le bouton du milieu, ou la molette ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + molette pour zoomer. À l'ouverture du studio et au retour depuis un autre onglet, la vue se cadre toute seule sur ce qui est dessiné ; le bouton *Voir tout le dessin* le refait à la demande.
- **Aligner** : ce que l'on déplace s'aimante aux bords et au milieu des autres formes quand il en est proche, et une ligne rose le montre. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> enfoncé, il ne s'aimante pas.
- **Les liens** relient des textes (encadrés ou non, ronds ou rectangulaires). Dans le code, chaque texte relié reçoit un nom (`n1`, `n2`…) et le lien s'écrit `\draw[->] (n1) -- (n2);` : c'est TikZ qui le trace de bord à bord. Sélectionné, un lien a son groupe à droite : droit ou courbé d'un côté, et un texte posé dessus. Supprimer un texte supprime ses liens.
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

**Exporter** écrit vos ensembles dans un fichier (`.json`), pour un autre ordinateur ou pour quelqu'un d'autre ; **Importer** ajoute ceux d'un tel fichier aux vôtres : un ensemble que vous avez déjà n'est pas ajouté deux fois, et un nom déjà pris reçoit un numéro.

Le dessin et le code restent liés : l'onglet **Code** montre le code du dessin, que l'on peut modifier à la main ; en revenant au dessin, les formes suivent. Les instructions que le tableau blanc ne sait pas dessiner (`\foreach`, les tracés de fonctions, les styles à vous…) sont gardées telles quelles.

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

## Courbes de fonctions

Le bouton des courbes de la barre de mise en forme (ou le menu *Maths*, ou la palette de commandes : *Courbes de fonctions*) ouvre l'atelier des courbes : RayTeX écrit le graphique avec pgfplots.

- **Les fonctions** s'écrivent comme sur papier : `x^2 - 2x + 1`, `2sin(x)`, `e^(-x)`, `ln(x)/x`, `|x - 1|`, `√x`, `1,5x`. Chacune a sa couleur, son trait (plein, tirets, pointillés), son épaisseur, son intervalle et son nom, placé sur la courbe (`\mathcal{C}_f`) ou dans une légende. Une courbe est coupée là où elle n'est pas définie et à ses pôles : `1/x` est tracée de part et d'autre de 0, `√x` à partir de 0.
- **Les tangentes** : à une courbe en un point, calculées par la dérivée, avec leur équation affichée (`y = 2x - 2`), le point de contact et un nom.
- **Les points** : sur une courbe (`A`, d'abscisse 2 sur `f`) ou par leurs coordonnées, avec des pointillés vers les axes.
- **Les droites** `x = a` (une asymptote verticale) ou `y = b`, et **les aires** sous une courbe ou entre deux courbes, d'une abscisse à une autre.
- **Les axes** : l'intervalle de x et de y (celui de y se règle tout seul sur les courbes), des axes par l'origine (comme dans les manuels), un cadre, ou à gauche et en bas, une grille, un repère orthonormé ; dans *Avancé*, les noms des axes, les graduations et la taille.

Le rendu de LaTeX s'affiche à mesure. Un document en français a ses nombres avec une virgule. Chaque ligne du dessin dit en commentaire ce qu'elle trace (`% f(x) = x^2 - 1`) : la pastille **Courbes** après `\begin{tikzpicture}` rouvre le graphique dans l'atelier, et ce qui y a été ajouté à la main est gardé.

## Tableaux de variations et de signes

Le bouton voisin (*Tableau de variations ou de signes*) ouvre une grille disposée comme le tableau (package `tkz-tab`) :

- **Les valeurs de x** en haut, écrites en LaTeX (`-\infty`, `\frac{1}{2}`) ; le **+** entre deux valeurs en ajoute une, la croix d'une valeur la retire.
- **Une ligne de signes** : un clic sur un intervalle change son signe (+, −, rien, hachuré) ; un clic sous une valeur y met un zéro, une valeur interdite (double barre) ou une barre.
- **Une ligne de variations** : chaque valeur est en haut ou en bas (la flèche se dessine entre elles), ou sans valeur ; la double barre d'une valeur interdite donne une limite de chaque côté.
- **À partir d'une fonction** : écrivez `f(x)` et l'intervalle, puis **Variations** (signe de la dérivée et variations) ou **Signes**. RayTeX calcule la dérivée, ses zéros, les valeurs interdites et les limites ; les valeurs simples sont écrites exactement (`2`, `\frac{1}{3}`, `\frac{\pi}{2}`, `\sqrt{3}`), les autres arrondies, et il le dit. Tout reste modifiable.

La pastille **Tableau** après `\begin{tikzpicture}` le rouvre.

## Arbres de probabilités

Le menu *Maths › Arbre de probabilités…* (ou la palette de commandes) ouvre l'atelier des arbres : une ligne par branche, en retrait selon son niveau, avec son événement (`A`, ou `\overline{A}` : le bouton **Ā** donne le contraire) et sa probabilité (`0,3`, `1/3`, `p`).

- Sur deux branches, une probabilité laissée vide est calculée : `1 − p` (`0,7`, `2/3`, `1-p`), montrée en gris.
- Chaque nœud est vérifié : des branches qui ne font pas 1 sont signalées.
- **Probabilité de chaque chemin au bout** écrit `P(A ∩ B) = 0,12` au bout de chaque chemin, calculé exactement (en fraction si une fraction s'y trouve).
- **Un niveau de plus** ajoute un événement et son contraire au bout de chaque branche ; **Mêmes événements à chaque niveau** recopie ceux de la première branche d'un niveau.

L'arbre est écrit avec TikZ, qui pousse vers la droite (`grow'=right`), les probabilités au-dessus des branches du haut et au-dessous de celles du bas, les nombres à la française dans un document en français. La puce **Arbre** le rouvre dans l'atelier.

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
