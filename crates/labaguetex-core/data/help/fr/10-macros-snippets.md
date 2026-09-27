# Macros et extraits

Écrire moins, plus vite : les **extraits** insèrent des blocs complets, les **macros** sont vos propres raccourcis.

## Les extraits

Tapez un déclencheur puis choisissez-le dans les suggestions :

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

Une fois inséré, <kbd>Tab</kbd> passe au champ suivant, <kbd>⇧</kbd> + <kbd>Tab</kbd> revient au précédent. La vue **Extraits et macros** les liste tous.

## Vos macros

*Réglages › Macros* : chaque macro a un nom, un **déclencheur** (texte suivi de <kbd>Tab</kbd>), un **raccourci clavier** facultatif et un **corps** :

```text
Déclencheur : ff        (mode mathématique uniquement)
Corps       : \frac{${1:a}}{${2:b}}${0}
```

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

labaguetex les reconnaît aussitôt : autocomplétion avec le bon nombre d'arguments, aperçu mathématique, <kbd>F12</kbd> pour aller à leur définition, <kbd>F2</kbd> pour les renommer dans tout le projet.

## Raccourcis de mise en forme

| Action | Raccourci |
|---|---|
| Gras, italique, mise en valeur | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>B</kbd>, <kbd>I</kbd>, <kbd>E</kbd> |
| Souligner | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>U</kbd> |
| Formule en ligne | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>M</kbd> |
| Entourer d'un environnement | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>W</kbd> |
| Commenter | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>/</kbd> |

Tous les raccourcis se modifient dans *Réglages › Raccourcis*.
