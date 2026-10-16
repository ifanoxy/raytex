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
| Rechercher dans le fichier | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>F</kbd> |
| Remplacer dans le fichier | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>R</kbd> |
| Rechercher dans le projet | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> |
| Remplacer dans le projet | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>R</kbd> |

**Dans le fichier**, une carte s'ouvre en haut à droite de l'éditeur : les occurrences sont surlignées et comptées (*2 sur 5*), <kbd>Entrée</kbd> va à la suivante, <kbd>⇧</kbd> + <kbd>Entrée</kbd> à la précédente, <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>Entrée</kbd> les sélectionne toutes. *Aa* respecte la casse, *ab* ne garde que les mots entiers, *.\** lit une expression régulière. Dans le champ de remplacement, <kbd>Entrée</kbd> remplace l'occurrence sélectionnée et <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Entrée</kbd> toutes.

**Dans le projet**, le panneau *Recherche* regroupe les résultats par fichier ; avec le remplacement, chaque ligne montre ce qu'elle deviendra, et se remplace seule, avec son fichier ou avec toutes les autres (`$1` reprend un groupe d'une expression régulière).

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

Les **menus** de la barre du haut rangent toutes les commandes, chacune avec son raccourci : **Format** (gras, italique…, puis *Style de la ligne*, *Taille du texte*, *Couleur du texte* et *Alignement* dans des sous-menus, listes, commentaires), **Insertion** (image, figure, tableau, code, TikZ, lien, note, renvoi, citation, étiquette, [sujet et corrigé](16-subject-answer-key.md), nouvelle commande), **Maths** (formules, fraction, racine, somme, intégrale, matrice, courbes, tableaux de variations, arbres de probabilités, symboles), **Page** (page de titre, marges, styles de page, saut de page, table des matières) et **@** (les raccourcis @ les plus utiles). Un clic ouvre un menu, passer sur les autres les ouvre ; au clavier, les flèches s'y déplacent, Entrée choisit, Échap ferme, et la première lettre d'une entrée y va. Le texte garde sa sélection pendant ce temps. La palette de commandes trouve aussi ces entrées par leur nom (*Grand*, *Fraction*, *Saut de page*…).

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

## Coller et écrire plus vite

- **Coller du texte mis en forme** (Word, Google Docs, LibreOffice, une page web) l'écrit en LaTeX : gras, italique, souligné, titres, listes, liens (`hyperref` est ajouté), exposants. Une notice propose aussitôt **Texte brut** pour coller le texte tel quel. Du code LaTeX copié sur une page, ou du code copié dans un éditeur, est collé tel quel.
- **Les formules** d'une page web (MathML, ou le TeX qu'elles portent, comme sur Wikipédia) et les **équations de Word** deviennent une formule LaTeX, entre `$…$` dans le texte, telle quelle dans une formule.
- **Un tableau** collé (Excel, LibreOffice Calc, un tableau de Word ou d'une page) s'ouvre dans la fenêtre des tableaux, cellule par cellule ; dans une formule, il devient une matrice.
- **`&`, `_` et `#` tapés dans du texte**, et `%` après un nombre (`50 %`), s'écrivent `\&`, `\_`, `\#`, `\%`. Jamais dans une formule, un tableau ou un alignement (pour `&`), le nom d'une étiquette, d'un fichier ou d'un lien, une définition de commande, un commentaire, le préambule, du TikZ ou du code. **Annuler** une fois remet le caractère tel quel.
- **Une sélection** s'entoure en tapant `(`, `[`, `{` ou `$`.
- **Une commande tapée souvent en entier** (`\mathbb`, `\varepsilon`…) : RayTeX propose une fois un raccourci `@` qui l'écrit, ou en crée un d'un clic.

Ces aides se désactivent une à une dans *Réglages › Éditeur*.

## Enregistrement

L'enregistrement automatique est activé par défaut. Un point dans l'onglet signale des modifications non enregistrées ; à la fermeture, RayTeX propose d'enregistrer. Les fichiers qui ne sont pas en UTF-8 sont convertis à l'enregistrement.

## L'orthographe

*Réglages › Éditeur › Correcteur orthographique* (ou *Activer ou désactiver le correcteur orthographique* dans la palette de commandes) souligne d'un trait rose ondulé les mots que le dictionnaire ne connaît pas.

**Le dictionnaire se télécharge une fois, quand vous le demandez.** RayTeX n'en contient aucun. Quand vous activez le correcteur pour une langue qu'il n'a pas encore, une fenêtre dit ce qui sera téléchargé (le dictionnaire de cette langue, sa taille) et d'où (`github.com/LibreOffice/dictionaries`, le dépôt des dictionnaires de LibreOffice) : **Télécharger** ou **Pas maintenant**. Sans votre accord, rien n'est téléchargé ; rien d'autre n'est envoyé. Ensuite le correcteur fonctionne sans connexion.

- **La langue** est celle du document : celle qu'il donne à babel (`\usepackage[french]{babel}` ; avec plusieurs langues, la dernière, ou celle de `main=`), à polyglossia (`\setdefaultlanguage`), ou à une ligne `% !TEX spellcheck = fr_FR`. Elle s'affiche en bas de la fenêtre ; un clic dessus en choisit une autre pour le projet, ou propose le dictionnaire quand il manque.
- **Seul le texte est vérifié** : pas les commandes, les formules, les étiquettes et les clés, les noms de fichiers, le préambule (sauf le titre), les schémas TikZ ni les listings. Les sigles (`CNRS`), les noms à majuscule intérieure (`LaTeX`) et ce qui touche un chiffre sont laissés de côté.
- **Les passages dans une autre langue** (`\foreignlanguage{english}{…}`, l'environnement `otherlanguage`, `\textenglish{…}`) sont vérifiés avec le dictionnaire de cette langue s'il est installé, et laissés tranquilles sinon.
- **Clic droit sur un mot souligné** : les corrections que le dictionnaire propose, et *Ajouter au dictionnaire* pour un nom propre ou un terme de votre domaine. Les mots ajoutés valent dans toutes les langues.

*Réglages › Éditeur* liste les dictionnaires installés (la croix en retire un) et les mots ajoutés, et permet d'en ajouter d'autres : français, anglais (américain, britannique…), allemand, espagnol, italien, portugais, néerlandais, catalan, polonais, suédois, danois, norvégien, tchèque, russe, grec.
