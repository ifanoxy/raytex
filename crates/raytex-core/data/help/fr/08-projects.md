# Projets

Un projet RayTeX est simplement un **dossier**. Il contient vos fichiers `.tex`, `.bib`, vos images, et éventuellement un fichier de réglages `raytex.toml`.

## Le dossier des projets et « Mes projets »

Tous les nouveaux projets sont rangés dans un même dossier, propre à RayTeX : `Documents/RayTeX` par défaut, modifiable dans *Réglages › Général › Dossier des projets*.

L'écran d'accueil, et **Mes projets…** (menu du projet, en haut à gauche) quand un projet est ouvert, montrent :

- **Ouverts récemment** : les projets et les fichiers ouverts dernièrement, où qu'ils soient ; un clic les rouvre comme ils avaient été ouverts ;
- **Tous mes projets** : chaque projet du dossier, avec l'aperçu de la première page de son PDF, son nom et sa dernière modification ; une recherche et un tri (derniers modifiés, par nom). Clic droit : ouvrir, afficher dans le Finder ou l'Explorateur, renommer, mettre à la corbeille (sauf le projet ouvert).

Un projet situé ailleurs s'ouvre avec **Ouvrir un dossier…** ; il apparaît ensuite dans les récents.

## Mode léger : un fichier seul

**Ouvrir un fichier .tex** (ou déposer un `.tex` sur la fenêtre, ou double-cliquer dessus dans le Finder ou l'Explorateur, ou *Ouvrir avec › RayTeX*) l'ouvre **sans créer de projet** : vous le modifiez et le compilez normalement, mais **rien n'est créé à côté de lui**. Les fichiers de compilation vont dans le cache de l'application, et **Exporter le PDF** l'enregistre où vous voulez (à côté du `.tex` par défaut). Le badge *Mode léger* le rappelle dans la barre du haut.

Les fichiers qu'il inclut (`\input`) et sa bibliographie sont lus et modifiables. Ce qui a besoin d'un dossier — ajouter des images, des fichiers de police, des fichiers ou des dossiers, un modèle, un schéma dans un fichier séparé — propose d'abord de **créer un projet** : un nom et un emplacement (le dossier des projets par défaut). Le projet reçoit une copie du fichier et de tout ce qu'il utilise (fichiers inclus, bibliographie, images) ; le fichier d'origine n'est pas modifié. L'action demandée continue ensuite dans le nouveau projet.

## Découper un long document

Pour un mémoire ou une thèse, un fichier par chapitre :

```latex
% main.tex
\documentclass{report}
\begin{document}
\include{chapitres/introduction}
\include{chapitres/methodes}
\end{document}
```

- `\input{fichier}` insère le fichier tel quel ;
- `\include{fichier}` commence une nouvelle page et permet `\includeonly{…}` pour compiler seulement certains chapitres.

RayTeX suit les inclusions : autocomplétion des étiquettes de tous les chapitres, plan complet, recherche dans tout le projet, renommage d'une étiquette partout.

## Fichiers et dossiers

Dans l'arborescence :

- clic droit : nouveau fichier ou dossier, renommer, mettre à la corbeille, copier le chemin, insérer une référence au fichier dans le document ;
- glisser-déposer pour déplacer ; déposer des fichiers du système pour les importer ;
- <kbd>F2</kbd> renomme l'élément sélectionné.

**Sélectionner plusieurs fichiers** : <kbd>⇧</kbd>/<kbd>Maj</kbd> + clic sélectionne tout jusqu'au fichier cliqué, <kbd>⌘</kbd> (Mac) ou <kbd>Ctrl</kbd> + clic ajoute ou retire un fichier ; au clavier, <kbd>⇧</kbd> + flèches étend la sélection et <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd> sélectionne tout (<kbd>Échap</kbd> désélectionne). La sélection se glisse d'un bloc dans un dossier ou dans le texte ; son menu (clic droit) ouvre les fichiers, insère les images ou les fichiers dans le document, les met à la corbeille après une seule confirmation (aussi avec <kbd>Suppr</kbd>) et copie leurs chemins. Le bandeau sous l'arborescence indique combien d'éléments sont sélectionnés.

Un fichier `.tex` d'un projet RayTeX ouvert depuis le Finder ou l'Explorateur ouvre ce projet ; un dossier s'ouvre comme projet.

Les modifications faites par d'autres programmes (git, synchronisation, autre éditeur) sont détectées : les fichiers ouverts sont rechargés, ou vous êtes prévenu s'ils avaient des modifications non enregistrées.

## Réglages du projet (raytex.toml)

*Réglages › Ce projet* écrit un fichier `raytex.toml` à la racine du projet. Il voyage avec le projet (git, archive) et s'impose à vos réglages généraux :

```toml
[project]
name = "Mémoire"
main = "main.tex"

[build]
engine = "lualatex"
bib_tool = "biber"
out_dir = "build"
shell_escape = false

[lint]
disabled_rules = ["nbsp-ref"]
```

## Sessions

À la réouverture, RayTeX restaure le dernier projet, ses onglets et le fichier actif (désactivable dans *Réglages › Général*).

## Modèles personnels

Le panneau **Modèles** (barre de gauche) montre chaque modèle par une image de sa première page, compilée une fois avec votre distribution puis gardée en cache. Un clic remplace le texte du fichier principal par le modèle (une seule annulation le rend) ; les autres fichiers du modèle (bibliographie, chapitres) sont ajoutés sans écraser ceux qui existent, et le moteur requis (LuaLaTeX pour certains modèles) est noté dans `raytex.toml`.

*Fichier › Enregistrer le projet comme modèle…* ajoute votre projet à la section **Mes modèles** : parfait pour réutiliser votre en-tête de cours ou la mise en page imposée par votre laboratoire. Clic droit sur un de vos modèles pour le supprimer.
