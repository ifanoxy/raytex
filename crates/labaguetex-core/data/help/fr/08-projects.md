# Projets

Un projet labaguetex est simplement un **dossier**. Il contient vos fichiers `.tex`, `.bib`, vos images, et éventuellement un fichier de réglages `labaguetex.toml`.

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

labaguetex suit les inclusions : autocomplétion des étiquettes de tous les chapitres, plan complet, recherche dans tout le projet, renommage d'une étiquette partout.

## Fichiers et dossiers

Dans l'arborescence :

- clic droit : nouveau fichier ou dossier, renommer, mettre à la corbeille, copier le chemin, insérer une référence au fichier dans le document ;
- glisser-déposer pour déplacer ; déposer des fichiers du système pour les importer ;
- <kbd>F2</kbd> renomme l'élément sélectionné.

Les modifications faites par d'autres programmes (git, synchronisation, autre éditeur) sont détectées : les fichiers ouverts sont rechargés, ou vous êtes prévenu s'ils avaient des modifications non enregistrées.

## Réglages du projet (labaguetex.toml)

*Réglages › Ce projet* écrit un fichier `labaguetex.toml` à la racine du projet. Il voyage avec le projet (git, archive) et s'impose à vos réglages généraux :

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

À la réouverture, labaguetex restaure le dernier projet, ses onglets et le fichier actif (désactivable dans *Réglages › Général*).

## Modèles personnels

*Fichier › Enregistrer le projet comme modèle…* ajoute votre projet à la galerie **Mes modèles** : parfait pour réutiliser votre en-tête de cours ou la mise en page imposée par votre laboratoire.
