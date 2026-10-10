# Bibliographie

RayTeX lit vos fichiers `.bib`, complète les clés de citation, affiche l'entrée complète au survol et lance Biber ou BibTeX uniquement quand c'est nécessaire.

## Le fichier .bib

Chaque référence a un **type**, une **clé** et des champs :

```bibtex
@book{knuth1984,
  author    = {Knuth, Donald E.},
  title     = {The {\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984},
}

@article{lamport1986,
  author  = {Lamport, Leslie},
  title   = {{LaTeX}: A Document Preparation System},
  journal = {Addison-Wesley},
  year    = {1986},
}
```

Astuce : la plupart des sites (Google Scholar, HAL, éditeurs, Zotero) exportent directement au format BibTeX.

## Avec biblatex (recommandé)

```latex
\usepackage[backend=biber, style=authoryear]{biblatex}
\addbibresource{references.bib}

\begin{document}
Selon \textcite{knuth1984}, … \parencite{lamport1986}.

\printbibliography
\end{document}
```

- Styles courants : `numeric`, `authoryear`, `alphabetic`, `apa`, `ieee`.
- `\cite`, `\parencite` (entre parenthèses), `\textcite` (dans le texte), `\footcite` (en note).

## Avec BibTeX (classique)

```latex
\bibliographystyle{plain}
\bibliography{references}
```

Utilisez `natbib` pour `\citet` / `\citep`. Les revues imposent souvent leur fichier `.bst`.

## Citer dans RayTeX

- Tapez `\cite{` : les références s'affichent avec auteurs, année et titre ; tapez un nom d'auteur ou un mot du titre pour filtrer.
- Survolez une clé pour voir la référence complète.
- La vue **Structure › Bibliographie** liste toutes les entrées ; un clic insère `\cite{…}`.

## Le panneau Bibliographie

L'icône du livre, dans la barre de gauche, ouvre la bibliographie du projet : chaque entrée de vos fichiers `.bib` avec sa clé, son titre, ses auteurs et le nombre de fois où elle est citée.

- **Citer** : le guillemet d'une entrée écrit `\cite{clé}` au curseur.
- **Modifier** : un clic ouvre l'entrée dans un formulaire. Les champs habituels de son type sont en vue, les autres derrière *Avancé* ; ce qui est écrit dans le fichier est gardé tel quel (accolades, macros comme `jan`).
- **Ajouter** : le `+` ouvre un formulaire vide. Collez-y un DOI, un identifiant arXiv ou une entrée BibTeX copiée d'un site, puis *Remplir* : les champs se remplissent et une clé est proposée (`knuth1984`). Pour un DOI ou un identifiant arXiv, RayTeX demande la référence à doi.org ou à arxiv.org, seulement quand vous cliquez sur *Remplir*.
- **Non citées** : les entrées que le document ne cite nulle part (aucune avec `\nocite{*}`).
- **À vérifier** : les clés en double, et les œuvres saisies deux fois (même DOI, ou même titre et même année).

Dans un projet sans fichier `.bib`, la première entrée crée `references.bib` à côté du fichier principal ; il reste à l'indiquer au document (`\addbibresource{references.bib}` ou `\bibliography{references}`, voir plus haut).

## Compilation

RayTeX détecte seul `biber` ou `bibtex`, et ne les relance que si les citations ou le `.bib` ont changé. Les erreurs de Biber et BibTeX (champ manquant, clé en double…) apparaissent dans le panneau **Problèmes** avec la ligne du `.bib` en cause.

Une citation affichée **[?]** ou en gras signifie qu'elle n'est pas encore résolue : compilez à nouveau, ou vérifiez la clé.
