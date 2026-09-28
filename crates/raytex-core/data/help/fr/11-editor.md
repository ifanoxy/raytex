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

Choisir une commande crée ses accolades, **vides** : le curseur est dans la première, <kbd>Tab</kbd> passe à la suivante. Choisir une commande d'un package non chargé ajoute le `\usepackage` correspondant. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Espace</kbd> ouvre les suggestions à tout moment.

Quand un **raccourci @** existe, il est affiché à côté de la commande : `\alpha` montre `@a`. Dans une formule, taper `@a` suffit.

## Vérification pendant la frappe

Sans compiler, RayTeX signale : accolades et environnements mal fermés, renvois et citations inconnus, étiquettes en double, fichiers et images introuvables, packages manquants ou mal ordonnés, commandes obsolètes, petites fautes typographiques (espace insécable avant `\ref`, points de suspension…). Les règles se choisissent dans *Réglages › Vérifications*.

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

## Barre de mise en forme

Sous la barre du haut, comme dans un traitement de texte (tous les boutons agissent sur la sélection, ou sur la ligne du curseur) :

| Bouton | Effet |
|---|---|
| Annuler, Rétablir | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> ou <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Y</kbd> |
| Style | la ligne devient une partie, un chapitre, une section… ou redevient du texte normal ; le menu indique le style de la ligne du curseur |
| Taille | `{\large …}`, `{\small …}`… ; choisir *Normal* retire la taille |
| Gras, italique, souligné, chasse fixe | `\textbf`, `\textit`, `\underline`, `\texttt` |
| Police | la police du document ; son menu règle la police de chaque usage et les polices pour un passage (voir [Polices](14-fonts.md)) |
| Couleur | `\textcolor{red}{…}` (ajoute `xcolor`) ; rechoisir une couleur la remplace. Quand `xcolor` est chargé, le menu propose ses 19 couleurs, les 68 couleurs `dvipsnames` et les couleurs SVG (l'option est ajoutée au besoin, sans conflit avec TikZ ou Beamer), une recherche par nom, les couleurs définies par le document et une couleur au choix (`\definecolor`) |
| Alignement | environnements `flushleft`, `center`, `flushright` ; rechoisir change l'alignement du bloc |
| Listes | chaque ligne sélectionnée devient un `\item` ; sur une liste, change son type |
| Formule, équation | `$…$` autour de la sélection ; environnement `equation` |
| Image, Tableau, Schéma TikZ | fenêtre d'images ; grille pour choisir la taille du tableau (cellules vides, `booktabs` ajouté) ; studio TikZ |
| Lien, note, renvoi, citation | `\href`, `\footnote`, `\ref`, `\cite` |
| Macros | la liste des raccourcis @ |
| Tout voir | toutes les commandes de mise en forme et d'insertion, groupées, avec leur raccourci |

Le menu **Affichage** (en haut à droite) montre ou masque cette barre, le panneau latéral, l'aperçu PDF et la console ; l'aperçu et la console se ferment aussi par leur croix.

## Édition

- Annuler : <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd>, même quand le curseur n'est pas dans le texte (après un clic dans la barre ou le PDF). Rétablir : <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> ou <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Y</kbd>.
- `$` : ouvre une paire `$…$` là où une formule peut commencer (après une espace, en début de ligne) ; après du texte, ou pour fermer une formule, un seul `$` est écrit (celui qui ferme déjà la formule est simplement franchi).
- Modifier le nom d'un `\begin{…}` modifie aussi son `\end{…}` (et inversement) ; une seule annulation défait les deux.
- Un fichier vide propose de quoi commencer : modèle, document minimal, diaporama ; pour un chapitre, une section ou l'inclusion dans le document principal ; pour un `.bib`, les entrées courantes.
- Plusieurs curseurs : <kbd>⌥</kbd>/<kbd>Alt</kbd> + clic ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd> sélectionne l'occurrence suivante.
- Repli des sections et environnements (flèches dans la marge).
- <kbd>Entrée</kbd> après `\begin{…}` ferme l'environnement ; dans une liste, ajoute un `\item`.
- Collez ou déposez une image : la fenêtre *Insérer des images* s'ouvre (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>I</kbd>) ; voir [Figures et tableaux](04-figures-tables.md).
- Schémas : le studio TikZ (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>T</kbd>) ; voir [Schémas TikZ](13-drawings.md).
- Correcteur orthographique du système (*Réglages › Éditeur*).
- Mode Vim (*Réglages › Éditeur*) : `:w` enregistre.

## Enregistrement

L'enregistrement automatique est activé par défaut. Un point dans l'onglet signale des modifications non enregistrées ; à la fermeture, RayTeX propose d'enregistrer. Les fichiers qui ne sont pas en UTF-8 sont convertis à l'enregistrement.
