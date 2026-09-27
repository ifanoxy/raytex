# L'éditeur en détail

## Autocomplétion

Les suggestions s'adaptent au contexte :

- après `\` : les commandes du noyau LaTeX, de **chaque package chargé** (lu dans sa source) et de votre projet ; en mode mathématique, les symboles d'abord, avec leur glyphe ;
- dans `\begin{…}` : les environnements ; le `\end{…}` et le contenu type sont ajoutés ;
- dans `\ref{…}`, `\eqref{…}`, `\cref{…}` : les étiquettes, avec leur numéro ;
- dans `\cite{…}` : les références, avec auteurs, année et titre ;
- dans `\usepackage{…}`, `\documentclass{…}` : les packages et classes installés ;
- dans `\includegraphics{…}`, `\input{…}` : les fichiers du projet ;
- dans les options `[…]` : les options connues.

Choisir une commande d'un package non chargé ajoute le `\usepackage` correspondant. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Espace</kbd> ouvre les suggestions à tout moment.

## Vérification pendant la frappe

Sans compiler, labaguetex signale : accolades et environnements mal fermés, renvois et citations inconnus, étiquettes en double, fichiers et images introuvables, packages manquants ou mal ordonnés, commandes obsolètes, petites fautes typographiques (espace insécable avant `\ref`, points de suspension…). Les règles se choisissent dans *Réglages › Vérifications*.

## Documentation au survol

Survolez une commande, un environnement ou un package : sa documentation s'affiche. Sur une étiquette : son numéro et sa page. Sur une citation : la référence complète. Sur `\includegraphics` : l'image.

## Naviguer

| Action | Raccourci |
|---|---|
| Aller à la définition (étiquette, citation, commande, fichier) | <kbd>F12</kbd> ou <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + clic |
| Trouver toutes les références | <kbd>⇧</kbd> + <kbd>F12</kbd> |
| Renommer partout | <kbd>F2</kbd> |
| Aller à un fichier | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>P</kbd> |
| Aller à une section (`@`) ou une étiquette (`#`) | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>P</kbd> puis `@` ou `#` |
| Aller à une ligne | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>L</kbd> |
| Problème suivant | <kbd>F8</kbd> |
| Rechercher dans le projet | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> |

## Édition

- Plusieurs curseurs : <kbd>⌥</kbd>/<kbd>Alt</kbd> + clic ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd> sélectionne l'occurrence suivante.
- Repli des sections et environnements (flèches dans la marge).
- <kbd>Entrée</kbd> après `\begin{…}` ferme l'environnement ; dans une liste, ajoute un `\item`.
- Collez une image : elle est enregistrée dans `figures/` et insérée.
- Correcteur orthographique du système (*Réglages › Éditeur*).
- Mode Vim (*Réglages › Éditeur*) : `:w` enregistre.

## Enregistrement

L'enregistrement automatique est activé par défaut. Un point dans l'onglet signale des modifications non enregistrées ; à la fermeture, labaguetex propose d'enregistrer. Les fichiers qui ne sont pas en UTF-8 sont convertis à l'enregistrement.
