# Polices

La police donne son caractère au document. La **case police** de la barre de mise en forme (comme dans un traitement de texte) montre la police du document ; un clic ouvre le menu **Polices du document** :

- une ligne par usage — **texte principal**, **sans empattement** (titres de certaines classes, `\textsf`), **code** (`\texttt`), **maths** — avec la police actuelle : un clic pour en choisir une autre, la croix pour revenir à la police par défaut ;
- les **polices pour un passage** : une police ajoutée pour quelques mots, un titre, une citation. Sélectionnez le texte, puis *Choisir une police pour la sélection…* ; ensuite, *Appliquer* met n'importe quelle sélection dans cette police (`{\fontGeorgia …}`), le crayon la change et la corbeille la supprime.

Plusieurs polices se combinent ainsi naturellement : une police principale, une autre pour les titres, une pour le code, et autant de polices de passage que voulu. La fenêtre de choix propose trois sources :

## Polices LaTeX (tous les moteurs)

Des packages de la distribution TeX, qui fonctionnent aussi avec pdfLaTeX : Latin Modern, Libertinus, Palatino (newpx), Times (newtx), EB Garamond, Charter, Utopia, Kp-Fonts, STIX Two, Source Sans, Fira Sans, Roboto, Helvetica, Inconsolata, Source Code Pro… Plusieurs fournissent aussi les mathématiques assorties.

La fenêtre affiche un **aperçu compilé** (texte, gras, italique, formule) et ajoute le bon `\usepackage` ; un autre package de police du même type est commenté pour éviter les conflits. Si le package n'est pas installé, installez-le depuis la vue **Packages**.

## Polices de l'ordinateur

Toutes les polices installées sur votre système sont utilisables grâce à **fontspec** (XeLaTeX ou LuaLaTeX) :

```latex
\usepackage{fontspec}
\setmainfont{Georgia}
```

Choisissez l'usage : texte principal, texte sans empattement, code, mathématiques (polices OpenType Math seulement, avec `unicode-math`), ou une **nouvelle commande** pour quelques mots (`\newfontfamily\titre{…}` puis `{\titre Mon titre}`).

LaBagueTex vérifie que LaTeX trouve bien la police (aperçu compilé), ajoute fontspec, peut commenter `fontenc` et `inputenc` (inutiles avec fontspec) et fait compiler le document avec LuaLaTeX.

> Vos co-auteurs doivent avoir la même police installée. Pour partager le projet, préférez les fichiers de police.

## Fichiers de police

Ajoutez des fichiers `.ttf` ou `.otf` (téléchargés sur Google Fonts, Adobe Fonts…) : LaBagueTex les copie dans le dossier `fonts/` du projet et les nomme dans le préambule, style par style :

```latex
\setmainfont{sourceserif4-regular.otf}[
  Path = fonts/,
  BoldFont = sourceserif4-bold.otf,
  ItalicFont = sourceserif4-italic.otf,
  BoldItalicFont = sourceserif4-bolditalic.otf
]
```

Le document compile alors partout, même sur un ordinateur où la police n'est pas installée.

## Bon à savoir

- La première compilation LuaLaTeX avec une police du système peut être plus longue : LuaLaTeX prépare la liste des polices une fois pour toutes.
- Pour revenir à la police par défaut : la croix du menu **Polices du document** (elle retire la ligne `\setmainfont…` ou commente le `\usepackage` de la police).
