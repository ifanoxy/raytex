# Premiers pas

Bienvenue dans **RayTeX**, l'éditeur LaTeX pensé pour apprendre comme pour travailler vite. Ce guide vous emmène de l'installation à votre premier PDF en cinq minutes.

## 1. Une distribution TeX

LaTeX transforme vos fichiers `.tex` en PDF grâce à une *distribution TeX* (TeX Live, MacTeX, MiKTeX, TinyTeX, Tectonic…). RayTeX les détecte toutes automatiquement.

- La barre d'état, en bas à gauche, indique la distribution utilisée.
- Si aucune n'est trouvée, l'**assistant d'installation** s'ouvre : il propose la distribution adaptée à votre système, affiche les commandes exactes et les lance pour vous.

> Vous pouvez rouvrir l'assistant à tout moment : cliquez sur le nom de la distribution dans la barre d'état.

## 2. Créer un projet

Cliquez sur **Nouveau projet** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>N</kbd>) et donnez-lui un nom : il est rangé dans le **dossier des projets** (`Documents/RayTeX`), que l'écran d'accueil présente avec l'aperçu de chaque projet. Le projet s'ouvre **vierge** : un fichier `main.tex` vide, et rien d'autre.

Juste un fichier `.tex` à modifier ? **Ouvrir un fichier .tex** l'ouvre en **mode léger**, sans créer de projet ni de fichiers à côté (voir [Projets](08-projects.md)).

Pour démarrer :

- le panneau **Modèles**, à gauche, montre chaque modèle par sa première page : article, rapport, mémoire, diaporama, examen, fiche d'exercices, CV, lettre… Un clic le place dans votre document (le titre est celui du projet). <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> vous rend votre texte ;
- ou choisissez dans la carte affichée sur le fichier vide : *Document minimal*, *Diaporama*… ;
- ou commencez simplement à écrire.

Chaque modèle compile sans erreur dès le départ.

Vous avez déjà des fichiers ? **Ouvrir un dossier** suffit : RayTeX trouve seul le fichier principal (celui qui contient `\documentclass`).

## 3. Écrire

La **barre de mise en forme**, sous la barre du haut, fonctionne comme dans un traitement de texte : style de la ligne (texte normal, section, sous-section…), taille, gras, italique, souligné, couleur, alignement, listes, formules, image, tableau, schéma. **Tout voir** ouvre toutes les commandes, avec leur raccourci.

L'éditeur vous aide aussi à chaque frappe :

- tapez `\` : les commandes apparaissent, avec leur documentation ;
- tapez `\begin{` : choisissez un environnement, le `\end{…}` est ajouté ;
- dans une formule, l'**aperçu mathématique** s'affiche sous le curseur, et les **raccourcis @** écrivent les symboles en deux touches : `@a` donne `\alpha`, `@/` une fraction, `@R` donne `\mathbb{R}` (liste complète : bouton **Macros**) ;
- survolez une commande, une étiquette ou une citation pour voir ce qu'elle fait ou désigne.

## 4. Compiler

Rien à faire : la compilation est **en direct**. Dès que vous marquez une pause dans la frappe, le document est compilé et le PDF, à droite, se met à jour sans perdre votre position. Le badge **En direct** de la barre du haut le rappelle ; un clic dessus la désactive (le document est alors compilé à chaque enregistrement).

Vous pouvez aussi compiler vous-même : <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Entrée</kbd> ou le bouton **Compiler**. RayTeX choisit le bon moteur et ne lance Biber, BibTeX ou l'index que lorsque c'est utile.

## 5. Corriger les erreurs

Les problèmes apparaissent pendant la frappe (soulignés), et la barre du haut indique le nombre d'erreurs de la dernière compilation. La console ne s'ouvre pas d'elle-même : cliquez sur ce nombre, ou sur **Voir les problèmes** dans la notification, pour ouvrir le panneau **Problèmes** :

- chaque erreur indique le fichier et la ligne exacts, cliquez pour y aller ;
- une explication en français dit *pourquoi* ;
- quand c'est possible, un bouton corrige pour vous (ajouter un package, l'installer, corriger une faute de frappe…).

## 6. Naviguer entre le source et le PDF

- **Double-cliquez dans le PDF** : l'éditeur va à la ligne correspondante.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>J</kbd> : le PDF montre l'endroit où se trouve le curseur.

## Pour aller plus loin

- [Les bases de LaTeX](02-latex-basics.md)
- [Mathématiques](03-math.md)
- [Figures et tableaux](04-figures-tables.md)
- La **palette de commandes** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>P</kbd>) donne accès à toutes les actions.
