# Polices

La police donne son caractère au document. labaguetex propose trois façons de la choisir, dans *Mise en forme › Polices…* ou la palette de commandes.

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

labaguetex vérifie que LaTeX trouve bien la police (aperçu compilé), ajoute fontspec, peut commenter `fontenc` et `inputenc` (inutiles avec fontspec) et fait compiler le document avec LuaLaTeX.

> Vos co-auteurs doivent avoir la même police installée. Pour partager le projet, préférez les fichiers de police.

## Fichiers de police

Ajoutez des fichiers `.ttf` ou `.otf` (téléchargés sur Google Fonts, Adobe Fonts…) : labaguetex les copie dans le dossier `fonts/` du projet et les nomme dans le préambule, style par style :

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
- Pour revenir à la police par défaut, supprimez (ou commentez) la ligne `\setmainfont` ou le `\usepackage` de la police.
