# Mise en page

Les marges, l'en-tête, le pied de page, un filigrane, les paragraphes : la fenêtre **Mise en page** les règle avec des champs, et montre le résultat sur de vraies pages, compilées avec la classe et le préambule de votre projet, avant de rien écrire dans le document. Ouvrez-la depuis le menu **Page**, ou par la palette de commandes (*Marges du document…*, *Styles de page…*).

Chaque groupe montre l'essentiel ; **Avancé**, à droite de son titre, déplie le reste.

## Les marges

L'onglet **Marges** lit ce que le préambule dit déjà (`\usepackage[…]{geometry}`, `\geometry{…}`, les options de la classe).

| Groupe | L'essentiel | Avancé |
|---|---|---|
| **Marges** | Des marges toutes faites, et les quatre marges autour d'un dessin de la page | Hauteur de l'en-tête, distances en-tête → texte et texte → pied, notes de marge, autres options de `geometry`, le code |
| **Papier** | Format, orientation, unité | Recto verso (marges *intérieure* et *extérieure*), reliure |

Un champ laissé vide est calculé par LaTeX : sa valeur s'affiche en gris. Ces valeurs, comme la taille de la zone de texte sous le dessin, ne sont pas estimées : c'est TeX qui les mesure sur la page de l'aperçu. Écrivez un nombre dans l'unité choisie (`2,5`), ou une longueur complète (`1in`, `0.1\paperwidth`).

- **Appliquer au document** écrit tout au même endroit du préambule, en une seule modification annulable :

  ```latex
  \usepackage{geometry}
  \geometry{top=2.5cm, bottom=2.5cm, left=3.5cm, right=2cm}
  ```

- **À partir d'ici** écrit `\newgeometry{…}` à l'endroit du curseur : ces marges commencent là, sur une nouvelle page, et le reste du document garde les siennes.
- **Marges du document à partir d'ici** écrit `\restoregeometry`.

## Les styles de page

Un **style de page** est ce qui se répète sur les pages. L'onglet **Styles de page** liste ceux que le document définit (`\fancypagestyle`) et en crée de nouveaux.

| Groupe | L'essentiel | Avancé |
|---|---|---|
| **En-tête**, **Pied de page** | Trois champs : gauche, centre, droite | Trait (épaisseur, couleur, écart, absent des pages de figures), police de la bande (taille, style, couleur), débord dans les marges |
| **Filigrane** | Un texte et son intensité, ou une image et son opacité | Couleur, taille, angle, position sur la page, devant le texte, image pleine page (un fond) |
| **Titres, base, code** | | Comment le titre du chapitre et de la section est repris, le style dont celui-ci part, du LaTeX en plus, le code du style |

Le **`+`** au bout de chaque champ y écrit ce qu'un champ peut contenir : numéro de page, « page 2 / 9 », titre du chapitre ou de la section, date, **image** (un logo, choisi dans vos fichiers : une image qui n'est pas dans le projet est copiée dans son dossier d'images, `figures/` par défaut, comme l'image d'un filigrane ou le logo d'une page de titre), gras, italique, couleur, retour à la ligne, et pour aller plus loin le nombre de pages, le premier ou le dernier titre de la page, un contenu absent des pages de figures.

Quand le texte d'un champ dépasse sa case, une double flèche apparaît à côté du `+` : elle ouvre le champ dans une zone plus grande, sous les trois cases (<kbd>Échap</kbd> la referme).

Dans un document recto verso, **Pages paires** choisit entre *Identiques*, *En miroir* (ce qui est à l'extérieur reste à l'extérieur) et *Différentes* (les pages paires ont leurs propres champs).

Si l'en-tête est plus haut que la place que la page lui garde (une image, deux lignes), l'aperçu le dit et un clic lui donne la hauteur que LaTeX demande.

> Presque tout `fancyhdr` a son réglage. Pour le reste (`\fancyheadwidth`, `\fancycenter`…), écrivez-le dans *LaTeX en plus pour ce style* : il est gardé tel quel, comme tout ce qu'un style écrit à la main contient que la fenêtre ne montre pas.

## Donner un style aux pages voulues

| Bouton | Ce qu'il fait |
|---|---|
| **Tout le document** | `\pagestyle{nom}` dans le préambule. Un second clic le retire. |
| **Pages de titre et de chapitre** | Ces pages ont leur propre style (`plain`) : elles prennent le vôtre à la place. |
| **À partir d'ici** | `\pagestyle{nom}` à l'endroit du curseur : cette page et les suivantes. |
| **Cette page seulement** | `\thispagestyle{nom}` à l'endroit du curseur. |
| *Avancé* : **Pages … à …** | Par les numéros des pages dans le PDF (la première est la 1). |
| *Avancé* : `plain`, `empty`, `headings` | Un style de LaTeX à partir du curseur. |

> Une page qui ouvre un chapitre garde le style que son chapitre lui donne, même si son numéro est dans une plage : utilisez *Pages de titre et de chapitre* pour celles-là.

**Enregistrer le style** écrit sa définition dans le préambule, avec les packages qu'il lui faut. **Supprimer le style** retire aussi ce qui l'utilisait ; *Annuler* dans l'éditeur le fait revenir.

## Les paragraphes

L'onglet **Paragraphes** (aussi *Page › Paragraphes et retraits…*) règle le début des paragraphes, vu sur une page compilée avec votre préambule :

| Choix | Ce qui est écrit |
|---|---|
| **Retrait** | la première ligne en retrait, à la manière de LaTeX ; un retrait donné écrit `\setlength{\parindent}{…}` |
| **Espace** | un espace entre les paragraphes, sans retrait : `\usepackage[skip=…]{parskip}` (vide : une demi-ligne) |
| **Les deux** | `\usepackage[skip=…, indent]{parskip}` |
| Premier paragraphe après un titre en retrait | l'usage français : `\frenchsetup{IndentFirst=…}` avec babel en français ; le package `indentfirst` sinon |

Ce qui réglait les paragraphes avant (un autre `\setlength`, un `parskip`) est retiré : il n'en reste qu'un réglage.

Sous les réglages, **Dans** *fichier* dit ce que le fichier ouvert fait à la main contre ses paragraphes, ligne par ligne (un clic y va) :

- les `\noindent` : ceux qui ne font rien là où ils sont (pas de retrait à retirer : après un titre sans retrait, ou avec l'espace entre paragraphes) peuvent partir d'un clic ; ceux qui retirent un retrait voulu restent ;
- les lignes vides après une formule, devant une phrase qui continue (`où`, `avec`…) : la ligne vide commence un nouveau paragraphe, en retrait ; sans elle, la phrase continue ;
- les `\\` qui finissent un paragraphe : une ligne vide suffit, le `\\` ajoute une ligne trop courte (*Underfull \hbox*).

## La page de titre

Le menu **Page › Page de titre…** (ou la palette de commandes) ouvre une fenêtre qui écrit la page de titre à votre place : vous remplissez des champs, la page s'affiche à côté, compilée avec la classe et le préambule de votre projet.

- **Quatre mises en page**, à choisir sur leur dessin : *Classique* (le `\maketitle` de LaTeX, au-dessus du texte dans un article), *Centrée*, *Rapport* (établissement en haut, auteurs à gauche et encadrants à droite) et *Moderne* (alignée à gauche le long d'un filet).
- **Texte** : titre, sous-titre, auteurs (un par ligne), date (aujourd'hui, aucune, ou celle que vous écrivez).
- **Établissement** : université ou école, formation, type de document (« Mémoire de master »), encadrants, logo. Sous *Avancé* : la largeur du logo, ce qui est écrit au-dessus des encadrants, la couleur des filets.

**Écrire la page de titre** la met dans le fichier principal, à la place du titre qu'il avait (`\maketitle` ou une autre page de titre), avec les packages qu'il faut ; une seule annulation la retire. Rouvrez la fenêtre pour la modifier : elle retrouve ses champs.

Le code écrit est du LaTeX ordinaire, que vous pouvez retoucher : chaque ligne dit ce qu'elle est dans un commentaire (`% titre`, `% auteur`), et c'est à ces commentaires que la fenêtre reconnaît ses champs. Les caractères `&`, `%`, `#` et `_` sont écrits comme LaTeX les veut (`\&`…) ; le reste est gardé tel quel, commandes comprises (`\LaTeX`, `\\` pour passer à la ligne dans un titre).

Avec la classe `beamer`, la fenêtre règle `\title`, `\subtitle`, `\author`, `\institute` et `\date`, et la diapositive de titre.
