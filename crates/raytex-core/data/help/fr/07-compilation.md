# Compilation

Compiler, c'est transformer vos fichiers `.tex` en PDF. RayTeX le fait vite, au bon moment, et vous explique chaque problème.

## Lancer une compilation

- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Entrée</kbd>, ou le bouton **Compiler**.
- **En direct** (réglage par défaut) : après chaque pause dans la frappe. Le badge *En direct* de la barre du haut l'indique et, pendant une compilation automatique, tourne sans toucher au bouton **Compiler**. Cliquez dessus, ou utilisez le menu du bouton **Compiler**, pour passer à une compilation à chaque enregistrement ; *Réglages › Compilation › Compiler automatiquement* propose aussi *Jamais* et le délai de la pause.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>.</kbd> arrête une compilation en cours.

Les fichiers modifiés sont enregistrés avant chaque compilation. Si vous compilez depuis un chapitre inclus par `\input`, c'est le document principal qui est compilé.

## Quel fichier est compilé ?

Le **fichier principal** (étoile ★ dans l'arborescence et la barre d'outils) est celui qui contient `\documentclass`. S'il y en a plusieurs, choisissez-le dans la barre d'outils ou par clic droit › *Définir comme fichier principal*.

Un fichier inclus peut aussi indiquer sa racine sur sa première ligne :

```latex
% !TEX root = ../main.tex
```

## Quel moteur ?

Si vous n'avez pas imposé de moteur (dans les réglages généraux ou ceux du projet), RayTeX choisit :

1. le moteur du commentaire magique du fichier principal, s'il existe :
   ```latex
   % !TEX program = lualatex
   ```
2. **Tectonic** si c'est la distribution utilisée ;
3. **LuaLaTeX** si le document charge `fontspec` ou `unicode-math` (polices système, OpenType) ;
4. sinon **pdfLaTeX**.

Le moteur choisi s'affiche en bas à droite de la fenêtre et dans le panneau **Sortie** ; survolez-le pour connaître la raison du choix.

## Ce qui se passe pendant la compilation

La méthode intégrée (recommandée) :

1. lance le moteur ;
2. lance **Biber** ou **BibTeX** seulement si les citations ou le `.bib` ont changé, puis **makeindex**, **makeglossaries**, **nomencl** si le document en a besoin ;
3. relance le moteur tant que les renvois ne sont pas stables (5 passes au maximum).

Les fichiers auxiliaires (`.aux`, `.log`, `.toc`…) sont rangés dans le dossier `build/` : votre projet reste propre. Le panneau **Sortie** affiche la sortie brute de chaque étape.

**Préambule précompilé** (pdfLaTeX) : après une première compilation, RayTeX prépare en arrière-plan une version « précompilée » du préambule (avec `mylatexformat`). Les compilations suivantes commencent directement à `\begin{document}` : souvent deux fois plus rapides (0,6 s au lieu de 1,3 s avec TikZ et pgfplots), le PDF est identique. Le préambule est préparé à nouveau dès qu'il change. Les documents qui écrivent des fichiers dans leur préambule (index, glossaires, `minted`…) sont compilés normalement. Réglage : *Réglages › Compilation › Précompiler le préambule*.

Autres méthodes : **latexmk**, **une seule passe**, ou vos **étapes personnalisées** (avec les variables `%DOC%`, `%DOCFILE%`, `%OUTDIR%`, `%DIR%`, `%ENGINE%`).

## Lire les erreurs

La console (panneaux **Problèmes** et **Sortie**) ne s'ouvre jamais d'elle-même : les erreurs sont soulignées dans le texte, leur nombre s'affiche en rouge dans la barre du haut et, quand vous avez lancé la compilation vous-même, une notification propose **Voir les problèmes**. Fermez la console avec sa croix ; rouvrez-la par le menu **Affichage** ou <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>J</kbd>.

Tout le texte des panneaux se sélectionne et se copie : glissez sur la sortie du compilateur (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd> la sélectionne en entier) ou sur un message ; **Tout copier** copie les problèmes affichés (`fichier:ligne : message`), et le clic droit sur un problème propose de copier son message, avec ou sans son emplacement.

Le panneau **Problèmes** regroupe les erreurs par fichier :

- le message de TeX, traduit en une explication claire, et sous chaque problème une **suggestion** (💡) qui dit quoi faire ;
- la position exacte (ligne et colonne), soulignée dans l'éditeur. Une erreur signalée à l'intérieur d'un package (`geometry.sty`, `babel.sty`…) est ramenée sur votre ligne `\usepackage`, sur l'option en cause ;
- le contexte montré par TeX, avec le point où il s'est arrêté ;
- des **corrections en un clic**, calculées à partir de votre texte.

Quelques exemples de corrections proposées :

| Problème | Correction |
|---|---|
| `\textbff{…}`, `\sectoin`, une macro à vous mal écrite | Remplacer par `\textbf`, `\section`, votre macro |
| `\mathbb`, `\includegraphics`, `\toprule`, `align`… sans leur package | Ajouter `\usepackage{amssymb}`, `graphicx`, `booktabs`, `amsmath`… |
| `\begin{itemise}`, `\end{enumerate}` qui ferme un `itemize`, environnement jamais fermé | Renommer `\begin` et `\end` ensemble, fermer l'environnement |
| Accolade ou formule jamais fermée, ligne vide dans une formule | Fermer l'accolade ou la formule, supprimer la ligne vide |
| `mon_fichier`, `x^2` ou `\alpha` dans le texte, `&` ou `#` seuls | Écrire `mon\_fichier`, `$x^2$`, `$\alpha$`, `\&`, `\#` |
| Tableau : colonne en trop, `\hline` après une ligne non terminée | Ajouter une colonne à `{ll}`, terminer la ligne par `\\` |
| Figure `[h]`, `[H]` sans `float`, image trop grande ou introuvable | `[htbp]`, charger `float`, adapter l'image, utiliser le fichier au nom proche |
| Référence, citation ou clé d'option mal écrite (`sec:intr`, `knut`, `widht`, `marging`) | Le label, la clé, l'option qui existent |
| TikZ : `;` oublié, `right=of`, flèche `Stealth`, forme `diamond` | Ajouter le `;`, la bibliothèque `positioning`, `arrows.meta`, `shapes.geometric` |
| `\newcommand` qui existe déjà ou sans `[1]`, `\usepackage` après `\begin{document}` | `\renewcommand`, déclarer les arguments, déplacer dans le préambule |
| Avertissements de `babel`, `fancyhdr`, `pgfplots`, `hyperref`… | Nom de langue actuel, `\headheight`, `compat=`, `\texorpdfstring` |

**Tout corriger** applique la correction proposée de chaque problème affiché (celle en surbrillance), puis recompile. Une correction déjà faite par une autre est comptée une seule fois, et celles qui toucheraient le même texte attendent le tour suivant. Les installations de packages, l'activation des programmes externes et les réglages de mise en page globaux ne sont jamais appliqués sans vous. Chaque correction s'annule comme une saisie (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd>).

Dans l'éditeur, <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>Entrée</kbd> sur un texte souligné ouvre les corrections du problème à cet endroit. Les positions suivent vos modifications : une correction s'applique au bon endroit même si vous avez écrit depuis la dernière compilation.

Les avertissements (renvois indéfinis, boîtes trop pleines) sont affichés séparément et filtrables.

## Le PDF

- Le PDF se recharge après chaque compilation **sans perdre votre position**.
- Double-clic dans le PDF → ligne source correspondante ; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>J</kbd> → position du curseur dans le PDF.
- Zoom : <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + molette, pincement, ou le menu de zoom.
- *Exporter le PDF…* le copie où vous voulez ; l'option *Copier le PDF à côté du fichier principal* le fait à chaque compilation.

## Programmes externes (shell escape)

Certains packages (`minted`, `svg`, `gnuplottex`…) doivent lancer des programmes pendant la compilation. C'est désactivé par défaut pour votre sécurité. RayTeX vous propose de l'activer pour un projet lorsque c'est nécessaire.
