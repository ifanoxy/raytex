# Macros et extraits

Écrire moins, plus vite : les **raccourcis @** écrivent les symboles en deux touches, les **extraits** insèrent des blocs complets, les **macros** sont vos propres raccourcis.

## Les raccourcis @

Dans une formule, tapez `@` puis une touche : la commande s'écrit toute seule.

| Tapez | Obtenez | Tapez | Obtenez |
|---|---|---|---|
| `@a`, `@b`, `@g`, `@l`, `@p` | `\alpha`, `\beta`, `\gamma`, `\lambda`, `\pi` | `@G`, `@D`, `@S`, `@W` | `\Gamma`, `\Delta`, `\Sigma`, `\Omega` |
| `@/` | `\frac{}{}` | `@2` | `\sqrt{}` |
| `@8` | `\infty` | `@6` | `\partial` |
| `@R`, `@N`, `@Z`, `@C` | `\mathbb{R}`… | `@I` | `\int_{}^{}` |
| `@<`, `@>` | `\leq`, `\geq` | `@->`, `@=>` | `\to`, `\implies` |
| `@(`, `@[`, `@\|` | `\left( … \right)`… | `@^`, `@_`, `@V` | `\hat{}`, `\bar{}`, `\vec{}` |

Pour les découvrir : le bouton **Macros** de la barre de mise en forme ouvre la liste complète, avec chaque symbole dessiné (un clic l'insère) ; **Tout voir** montre les plus utiles ; et quand vous tapez une commande qui a un raccourci, les suggestions l'affichent à côté (`\alpha` → `@a`). Ils se désactivent dans *Réglages › Autocomplétion*.

### Vos propres raccourcis @

Dans la vue **Macros @ et extraits**, le `+` en haut de la vue ouvre **Nouveau raccourci @**, qui en crée un en deux champs : la ou les touches (`v`, `vec`, `->`… douze caractères au plus, sans espace) et ce qu'il écrit (`\vec{}` : les accolades vides deviennent des champs où le curseur se place). Il apparaît aussitôt dans les suggestions quand vous tapez `@`, avant ceux de RayTeX, et à côté de sa commande (`\vec` → `@v`). Un raccourci qui reprend une touche de RayTeX le remplace. Décochez *Dans les formules seulement* pour un raccourci de texte.

Ce sont des macros dont le déclencheur commence par `@` : vous les retrouvez, avec un corps de plusieurs lignes si vous voulez, dans *Réglages › Macros*.

## Les extraits

Tapez un déclencheur puis <kbd>Tab</kbd> : `doc` puis <kbd>Tab</kbd> écrit un document minimal. Ils sont aussi dans les suggestions (<kbd>Ctrl</kbd> + <kbd>Espace</kbd>) et dans la vue **Macros @ et extraits**.

| Déclencheur | Insère |
|---|---|
| `doc` | un document minimal |
| `fig`, `subfig` | une figure, deux sous-figures |
| `tab`, `tabular` | un tableau |
| `item`, `enum`, `desc` | une liste |
| `eq`, `eq*`, `ali` | une équation, des équations alignées |
| `cases`, `mat` | des cas, une matrice |
| `thm`, `defn`, `proof` | théorème, définition, démonstration |
| `sec`, `ssec`, `chap` | un titre avec son étiquette |
| `frame`, `cols` | une diapositive, des colonnes |
| `tikz`, `plot` | une figure TikZ, un graphe de fonction |
| `code`, `algo` | du code, un algorithme |
| `si`, `ce` | une grandeur avec unité, une formule chimique |

Une fois inséré, <kbd>Tab</kbd> passe au champ suivant, <kbd>⇧</kbd> + <kbd>Tab</kbd> revient au précédent. La vue **Macros @ et extraits** les liste tous.

## Vos macros

*Réglages › Macros* : chaque macro a un nom, un **déclencheur** (texte suivi de <kbd>Tab</kbd>), un **raccourci clavier** facultatif et un **corps**. Ce que vous écrivez est enregistré à mesure, sans rien à valider :

```text
Déclencheur : ff        (mode mathématique uniquement)
Corps       : \frac{${1:a}}{${2:b}}${0}
```

Tapez le déclencheur dans le document puis <kbd>Tab</kbd> : le corps le remplace. Une macro *maths uniquement* tapée dans du texte s'écrit entre `$…$`. Quand la liste des suggestions est ouverte, <kbd>Tab</kbd> choisit d'abord la suggestion. Vos macros passent avant les extraits de RayTeX qui ont le même déclencheur.

Le raccourci clavier est facultatif. Cliquez sur son bouton puis tapez les touches, avec <kbd>Ctrl</kbd>, <kbd>⌘</kbd> ou <kbd>Alt</kbd> (ou une touche F) : une touche qui sert à écrire, comme <kbd>Tab</kbd> ou une lettre seule, n'est pas retenue. <kbd>Échap</kbd> annule, <kbd>⌫</kbd> le retire. Un triangle signale un raccourci déjà pris par une commande de RayTeX, qui passerait avant la macro. Sur Mac, <kbd>⌥</kbd> + une lettre fonctionne aussi, même quand la touche écrit un accent.

Dans le corps :

- `${1:texte}`, `${2}`… sont les champs, parcourus avec <kbd>Tab</kbd> ;
- `${0}` est la position finale du curseur ;
- `${SELECTION}` reçoit le texte sélectionné (idéal pour « entourer » : `\textcolor{red}{${SELECTION}}`).

## Vos commandes LaTeX

Pour ce qui doit apparaître dans le document, préférez une commande LaTeX dans le préambule :

```latex
\newcommand{\vect}[1]{\boldsymbol{#1}}
\newcommand{\R}{\mathbb{R}}
```

RayTeX les reconnaît aussitôt : autocomplétion avec le bon nombre d'arguments, aperçu mathématique, <kbd>F12</kbd> pour aller à leur définition, <kbd>F2</kbd> pour les renommer dans tout le projet.

La vue **Commandes du projet** (l'icône `{\}` de la barre latérale) les liste toutes, pour le projet entier ou pour le fichier ouvert : leur nom avec ses arguments, ce qu'elles écrivent, où elles sont définies et combien de fois elles servent. Un clic va à la définition ; au survol, **Insérer** écrit la commande à l'endroit du curseur et **Essayer** l'ouvre dans l'atelier.

### Créer une commande sans retenir la syntaxe

**Nouvelle commande** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd>, ou le `+` de la vue) ouvre l'atelier :

1. choisissez ce que vous définissez : une **commande**, un **opérateur** de formule (`\argmax`), un **environnement** ou un **théorème** ;
2. donnez son nom, son nombre d'arguments (le premier peut être facultatif, avec une valeur par défaut) et ce qu'elle écrit, où `#1`, `#2`… désignent les arguments ;
3. à droite, l'**essai** compile un petit texte qui l'utilise, avec le préambule de votre projet : vous voyez le résultat avant de toucher au document ;
4. **Ajouter au préambule** écrit la définition après les autres, dans le document principal ; **Ajouter et insérer** écrit aussi la commande là où se trouve le curseur.

Si du texte est sélectionné quand vous ouvrez l'atelier, il devient la définition : sélectionnez `\mathbb{R}^n`, donnez un nom, c'est fait. L'atelier signale ce qui empêcherait la commande de fonctionner : un nom déjà pris par LaTeX, par un package chargé ou par le projet, un `#3` pour une commande à deux arguments, des accolades non fermées.

## Raccourcis de mise en forme

| Action | Raccourci |
|---|---|
| Gras, italique, mise en valeur | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>B</kbd>, <kbd>I</kbd>, <kbd>E</kbd> |
| Souligner | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>U</kbd> |
| Formule en ligne | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>M</kbd> |
| Entourer d'un environnement | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>W</kbd> |
| Commenter | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>/</kbd> |
| Liste à puces, liste numérotée | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>8</kbd>, <kbd>7</kbd> |
| Annuler, rétablir | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> ou <kbd>Y</kbd> |

Tous les raccourcis se modifient dans *Réglages › Raccourcis*.
