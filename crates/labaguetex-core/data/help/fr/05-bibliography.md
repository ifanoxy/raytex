# Bibliographie

LaBagueTex lit vos fichiers `.bib`, complète les clés de citation, affiche l'entrée complète au survol et lance Biber ou BibTeX uniquement quand c'est nécessaire.

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

## Citer dans LaBagueTex

- Tapez `\cite{` : les références s'affichent avec auteurs, année et titre ; tapez un nom d'auteur ou un mot du titre pour filtrer.
- Survolez une clé pour voir la référence complète.
- La vue **Structure › Bibliographie** liste toutes les entrées ; un clic insère `\cite{…}`.

## Compilation

LaBagueTex détecte seul `biber` ou `bibtex`, et ne les relance que si les citations ou le `.bib` ont changé. Les erreurs de Biber et BibTeX (champ manquant, clé en double…) apparaissent dans le panneau **Problèmes** avec la ligne du `.bib` en cause.

Une citation affichée **[?]** ou en gras signifie qu'elle n'est pas encore résolue : compilez à nouveau, ou vérifiez la clé.
