# Compilation

Compiler, c'est transformer vos fichiers `.tex` en PDF. RayTeX le fait vite, au bon moment, et vous explique chaque problème.

## Lancer une compilation

- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Entrée</kbd>, ou le bouton **Compiler**.
- **En direct** (réglage par défaut) : après chaque pause dans la frappe. Le badge *En direct* de la barre du haut l'indique et, pendant une compilation automatique, tourne sans toucher au bouton **Compiler**. Cliquez dessus, ou utilisez le menu du bouton **Compiler**, pour passer à une compilation à chaque enregistrement ; *Réglages › Compilation › Compiler automatiquement* propose aussi *Jamais* et le délai de la pause.
- **Sur un long document** (une passe du compilateur de plus d'une seconde et demie), la compilation en direct s'allège d'elle-même. Elle ne fait d'abord qu'**une passe** : la page montre ce que vous venez d'écrire deux fois plus vite quand vos lignes décalent les pages suivantes ; les renvois, la table des matières et la bibliographie sont remis d'aplomb par une compilation complémentaire, lancée seule dès que vous laissez le texte tranquille un instant (et tout de suite par **Compiler** ou par un export). Si vous reprenez la frappe pendant une compilation, elle est abandonnée au profit du nouveau texte au lieu d'être menée au bout pour rien, sauf si elle allait finir. Et la pause attendue avant de compiler s'allonge un peu avec la durée d'une passe.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>.</kbd> arrête une compilation en cours.

Les fichiers modifiés sont enregistrés avant chaque compilation.

## Un chapitre seul ou tout le document

Quand vous ouvrez un fichier annexe, un chapitre inclus par `\input`, `\include` ou `\subfile`, RayTeX vous demande une fois par projet ce qu'il faut compiler pendant que vous l'écrivez :

- **Ce fichier seul** : le PDF ne montre que ce fichier, avec le préambule du document. C'est bien plus rapide sur un long document, et le chapitre reste tel qu'il est dans le document : son numéro, ceux de ses sections, figures et équations, ses numéros de page, ses renvois vers les autres fichiers et ses citations. Une ligne au-dessus du PDF le rappelle, avec un bouton pour revenir à **Tout le document**.
- **Tout le document** : le document principal est compilé, comme pour le fichier principal.

Le choix se change dans le menu du bouton **Compiler** (*Fichier annexe : ce fichier seul* ou *tout le document*). Revenir au fichier principal montre de nouveau tout le document, et un export du PDF compile toujours le document entier.

Pour connaître ces numéros, RayTeX compile d'abord le document entier une fois, dans un dossier à part, puis seulement le fichier tant que vous n'y touchez pas ailleurs : quand un autre fichier change, ce relevé est refait à la compilation suivante. Le PDF du document entier n'est jamais touché. Les commandes définies dans les autres fichiers sont connues aussi ; une commande que le chapitre utilise mais qu'il ne définit pas, et qui vient d'un autre fichier, fonctionne donc. Un fichier inclus par `\import` est lu depuis son propre dossier, comme dans le document. Cela ne concerne pas les fichiers lus par le préambule, qui sont toujours compilés avec tout le document.

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

**Figures TikZ déjà dessinées** (pdfLaTeX, XeLaTeX, LuaLaTeX) : une figure TikZ ou pgfplots est dessinée à chaque compilation, même quand vous écrivez ailleurs. Après une compilation, RayTeX dessine en arrière-plan chaque nouvelle figure sur une page à part ; les compilations suivantes la reprennent telle quelle, au pixel près (0,54 s au lieu de 0,92 s pour un article avec une courbe pgfplots et quatre dessins). Une figure est redessinée dès que son texte change, ou un fichier qu'elle lit (données, image), le préambule, une définition du document (`\newcommand`, `\tikzset`…), ou ce qui l'entoure (largeur, police, couleur, langue). Les figures qui dépendent de la page ou du reste du document (renvois, citations, compteurs, `remember picture`, `overlay`, nombres aléatoires) sont toujours dessinées. **L'export du PDF redessine toutes les figures.** Réglage : *Réglages › Compilation › Garder les figures TikZ déjà dessinées*.

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
- *Exporter le PDF…* le copie où vous voulez. Si le document a changé depuis sa dernière compilation, ou s'il est en train de compiler, il est compilé d'abord, et **une fenêtre à part** (une vraie fenêtre, à côté de la fenêtre principale) suit l'export en détail : ses étapes l'une après l'autre avec leur durée, le fichier que le compilateur est en train de lire, la page en cours, une barre de progression avec le pourcentage et une estimation du temps restant, et tout ce que le compilateur écrit. Elle se ferme d'elle-même quand le PDF est écrit, sauf si vous cochez *Laisser cette fenêtre ouverte à la fin* ; fermée avant, l'export continue ; *Annuler* l'abandonne. Le PDF n'est jamais copié pendant que le compilateur l'écrit. Si la compilation se termine avec des erreurs, rien n'est exporté sans votre accord : la fenêtre les montre, ou exporte le PDF tel quel.
- **Un PDF plus léger** : quand le document contient des images (PNG, JPEG), *Exporter le PDF…* demande d'abord comment : *Images d'origine* (le PDF tel qu'il est), *Images allégées*, *Images légères*, ou *Ne pas dépasser* une taille en Mo. Chaque choix affiche à peu près ce que pèsera le PDF. Le document est alors compilé à part, dans une copie du projet, avec des copies allégées des images : **vos images et votre projet ne sont pas modifiés**. Avec une taille maximale, RayTeX choisit la compression la plus douce qui suffit, vérifie le poids du PDF obtenu et compresse davantage s'il dépasse encore ; si la limite ne peut pas être tenue, il le dit avec le poids obtenu.
- L'option *Copier le PDF à côté du fichier principal* le fait à chaque compilation.

## Programmes externes (shell escape)

Certains packages (`minted`, `svg`, `gnuplottex`…) doivent lancer des programmes pendant la compilation. C'est désactivé par défaut pour votre sécurité. RayTeX vous propose de l'activer pour un projet lorsque c'est nécessaire.
