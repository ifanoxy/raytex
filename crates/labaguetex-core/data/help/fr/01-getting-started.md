# Premiers pas

Bienvenue dans **labaguetex**, l'éditeur LaTeX pensé pour apprendre comme pour travailler vite. Ce guide vous emmène de l'installation à votre premier PDF en cinq minutes.

## 1. Une distribution TeX

LaTeX transforme vos fichiers `.tex` en PDF grâce à une *distribution TeX* (TeX Live, MacTeX, MiKTeX, TinyTeX, Tectonic…). labaguetex les détecte toutes automatiquement.

- La barre d'état, en bas à gauche, indique la distribution utilisée.
- Si aucune n'est trouvée, l'**assistant d'installation** s'ouvre : il propose la distribution adaptée à votre système, affiche les commandes exactes et les lance pour vous.

> Vous pouvez rouvrir l'assistant à tout moment : cliquez sur le nom de la distribution dans la barre d'état.

## 2. Créer un projet

Cliquez sur **Nouveau projet** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>N</kbd>) et choisissez un modèle : article, rapport, mémoire, diaporama, examen, fiche d'exercices, CV, lettre…

Renseignez le titre, l'auteur et l'emplacement : labaguetex crée le dossier, remplit le modèle et l'ouvre. Chaque modèle compile sans erreur dès le départ.

Vous avez déjà des fichiers ? **Ouvrir un dossier** suffit : labaguetex trouve seul le fichier principal (celui qui contient `\documentclass`).

## 3. Écrire

L'éditeur vous aide à chaque frappe :

- tapez `\` : les commandes apparaissent, avec leur documentation ;
- tapez `\begin{` : choisissez un environnement, le `\end{…}` est ajouté ;
- dans une formule, l'**aperçu mathématique** s'affiche sous le curseur ;
- survolez une commande, une étiquette ou une citation pour voir ce qu'elle fait ou désigne.

## 4. Compiler

Appuyez sur <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Entrée</kbd> ou cliquez sur **Compiler**. Le PDF s'affiche à droite et se met à jour à chaque compilation, sans perdre votre position.

Par défaut, labaguetex recompile à chaque enregistrement (réglable dans *Réglages › Compilation*). Il choisit le bon moteur et ne lance Biber, BibTeX ou l'index que lorsque c'est utile.

## 5. Corriger les erreurs

Les problèmes apparaissent pendant la frappe (soulignés) et après la compilation, dans le panneau **Problèmes** :

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
