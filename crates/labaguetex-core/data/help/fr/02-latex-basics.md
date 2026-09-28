# Les bases de LaTeX

LaTeX sépare le **fond** (ce que vous écrivez) de la **forme** (la mise en page). Vous décrivez la structure du document, LaTeX s'occupe de la typographie.

## Un document minimal

```latex
\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}

\title{Mon premier document}
\author{Camille Martin}

\begin{document}
\maketitle

Bonjour ! Ceci est un paragraphe.

Une ligne vide commence un nouveau paragraphe.
\end{document}
```

- `\documentclass{…}` choisit le type de document : `article`, `report` (chapitres), `book`, `beamer` (diapositives)…
- Le **préambule** (avant `\begin{document}`) charge les packages et règle le document.
- Le **corps** contient le texte.

## Commandes et environnements

Une **commande** commence par `\` : `\textbf{gras}`, `\emph{mis en valeur}`. Les arguments obligatoires sont entre `{}`, les facultatifs entre `[]`.

Un **environnement** entoure un bloc :

```latex
\begin{itemize}
  \item Premier point
  \item Second point
\end{itemize}
```

> Astuce : tapez `\begin{` puis choisissez l'environnement ; LaBagueTex ajoute le `\end{…}` correspondant.

## Structurer le texte

```latex
\section{Introduction}
\subsection{Contexte}
\subsubsection{Détails}
\paragraph{Remarque.} Un paragraphe titré.
```

Avec `report` ou `book`, `\chapter{…}` est disponible. Les versions étoilées (`\section*{…}`) ne sont pas numérotées. La vue **Structure** de la barre latérale affiche ce plan, avec les numéros réels après compilation.

## Mise en forme du texte

| Effet | Commande |
|---|---|
| **Gras** | `\textbf{…}` (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>B</kbd>) |
| *Italique* | `\textit{…}` (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>I</kbd>) |
| Mise en valeur | `\emph{…}` (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>E</kbd>) |
| Chasse fixe | `\texttt{…}` |
| Petites capitales | `\textsc{…}` |
| Note de bas de page | `\footnote{…}` |

## Listes

```latex
\begin{enumerate}
  \item Premier
  \item Second
\end{enumerate}

\begin{description}
  \item[Terme] Sa définition.
\end{description}
```

Dans une liste, <kbd>Entrée</kbd> ajoute un `\item` ; sur un `\item` vide, <kbd>Entrée</kbd> sort de la liste.

## Renvois

Donnez une **étiquette** à ce que vous voulez citer, puis faites-y référence :

```latex
\section{Méthode}\label{sec:methode}
Comme expliqué en section~\ref{sec:methode}, page~\pageref{sec:methode}…
```

Le `~` est une espace insécable : il évite que le numéro se retrouve seul en début de ligne. Tapez `\ref{` : LaBagueTex propose toutes les étiquettes du projet, avec leur numéro.

## Caractères spéciaux

Les caractères `# $ % & _ { } ~ ^ \` ont un sens particulier. Pour les écrire : `\# \$ \% \& \_ \{ \}`, `\textasciitilde`, `\textasciicircum`, `\textbackslash`.

Le `%` commence un **commentaire** : la fin de la ligne est ignorée.

## Le français

Avec `\usepackage[french]{babel}`, LaTeX applique la typographie française : espaces avant `: ; ! ?`, guillemets `\og … \fg{}`, césure. Pour des guillemets automatiques, utilisez `csquotes` et `\enquote{…}`.
