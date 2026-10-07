# Mise en page

Les marges, l'en-tête, le pied de page, un filigrane : la fenêtre **Mise en page** les règle avec des champs, et montre le résultat sur de vraies pages, compilées avec la classe et le préambule de votre projet, avant de rien écrire dans le document. Ouvrez-la depuis **Tout voir › Page**, ou par la palette de commandes (*Marges du document…*, *Styles de page…*).

## Les marges

L'onglet **Marges** lit ce que le préambule dit déjà (`\usepackage[…]{geometry}`, `\geometry{…}`, les options de la classe) et le présente en clair :

- des **marges toutes faites** : normales (2,5 cm), étroites, modérées, larges, reliure, ou celles de LaTeX par défaut ;
- le **papier** (A4, A5, Letter…, ou un format à vous), l'**orientation** et le **recto verso**, où les marges deviennent *intérieure* et *extérieure* ;
- les quatre marges, autour d'un dessin de la page ;
- l'**en-tête et le pied** : la hauteur gardée pour l'en-tête, sa distance au texte, celle du texte au pied ;
- la **reliure** (le papier qu'elle prend) et les **notes de marge** ;
- les autres options de `geometry`, gardées telles que vous les écrivez.

Un champ laissé vide est calculé par LaTeX : sa valeur s'affiche en gris. Ces valeurs, comme la taille de la zone de texte sous le dessin, ne sont pas estimées : c'est TeX qui les mesure sur la page de l'aperçu. Écrivez un nombre dans l'unité choisie (`2,5`), ou une longueur complète (`1in`, `0.1\paperwidth`).

À droite, les pages sont tracées avec leurs cadres : le texte, l'en-tête, le pied, les notes.

- **Appliquer au document** écrit tout au même endroit du préambule, en une seule modification annulable :

  ```latex
  \usepackage{geometry}
  \geometry{top=2.5cm, bottom=2.5cm, left=3.5cm, right=2cm}
  ```

  Ce qui était dit à plusieurs endroits y est rassemblé.
- **À partir d'ici** écrit `\newgeometry{…}` à l'endroit du curseur : ces marges commencent là, sur une nouvelle page (une page de titre, un tableau très large, une annexe), et le reste du document garde les siennes.
- **Marges du document à partir d'ici** écrit `\restoregeometry` : les pages suivantes retrouvent les marges du document.

## Les styles de page

Un **style de page** est ce qui se répète sur les pages : l'en-tête, le pied de page, leurs traits, un filigrane. L'onglet **Styles de page** liste ceux que le document définit (`\fancypagestyle`) et en crée de nouveaux :

- trois champs pour l'**en-tête**, trois pour le **pied** : gauche, centre, droite. Les boutons sous les champs y écrivent le numéro de page, « page 2 / 9 », le titre du chapitre ou de la section en cours, la date, une image ;
- l'épaisseur du **trait** sous l'en-tête et au-dessus du pied (0 pour aucun) ;
- **Miroir sur les pages paires**, pour un document recto verso : ce qui est à l'extérieur reste à l'extérieur ;
- un **filigrane** : un texte en travers de la page (BROUILLON, CONFIDENTIEL) dont vous réglez la couleur, l'intensité, la taille et l'angle, ou une image.

L'aperçu montre deux pages dans ce style. Si l'en-tête est plus haut que la place que la page lui garde, RayTeX le dit et un clic lui donne la hauteur que LaTeX demande.

## Donner un style aux pages voulues

Sous le code du style, **Donner « … » à** :

| Bouton | Ce qu'il fait |
|---|---|
| **Tout le document** | `\pagestyle{nom}` dans le préambule. Un second clic le retire. |
| **Pages de titre et de chapitre** | Ces pages ont leur propre style (`plain`) : elles prennent le vôtre à la place. |
| **À partir d'ici** | `\pagestyle{nom}` à l'endroit du curseur : cette page et les suivantes. |
| **Cette page seulement** | `\thispagestyle{nom}` à l'endroit du curseur. |
| **Pages … à …** | Par les numéros des pages dans le PDF (la première est la 1). |

Pour revenir à un style de LaTeX à partir d'un endroit, les boutons `plain` (numéro seul), `empty` (rien) et `headings` (titres en haut) écrivent le `\pagestyle` correspondant au curseur.

> Une page qui ouvre un chapitre garde le style que son chapitre lui donne, même si son numéro est dans une plage : utilisez *Pages de titre et de chapitre* pour celles-là.

**Enregistrer le style** écrit sa définition dans le préambule, avec les packages qu'il lui faut (`fancyhdr`, et `eso-pic`, `graphicx`, `xcolor`, `lastpage` selon ce qu'il contient). **Supprimer le style** retire aussi ce qui l'utilisait dans le préambule ; *Annuler* dans l'éditeur le fait revenir.

Un style écrit à la main est relu de la même façon ; ce que la fenêtre ne sait pas représenter (une longueur, des pages paires différentes) est gardé tel quel dans la définition.
