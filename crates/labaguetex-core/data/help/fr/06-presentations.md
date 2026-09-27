# Présentations (beamer)

La classe `beamer` crée des diaporamas PDF. Le modèle **Diaporama** en fournit un prêt à l'emploi.

## Structure

```latex
\documentclass{beamer}
\usetheme{Madrid}
\usepackage[french]{babel}

\title{Mon exposé}
\author{Camille Martin}
\date{\today}

\begin{document}
\begin{frame}
  \titlepage
\end{frame}

\begin{frame}{Plan}
  \tableofcontents
\end{frame}

\section{Introduction}
\begin{frame}{Pourquoi ce sujet ?}
  \begin{itemize}
    \item<1-> Premier argument
    \item<2-> Deuxième argument
  \end{itemize}
\end{frame}
\end{document}
```

Chaque `frame` est une diapositive. L'extrait `frame` en insère une.

## Apparition progressive

- `\pause` : la suite apparaît à la diapositive suivante.
- `\item<2->` : l'élément apparaît à partir de la 2e étape.
- `\only<2>{…}`, `\uncover<3->{…}` : contrôle fin.

## Thèmes

`\usetheme{…}` : `Madrid`, `Berlin`, `metropolis` (moderne et sobre), `Boadilla`… `\usecolortheme{…}` change les couleurs.

## Colonnes et images

```latex
\begin{frame}{Résultats}
  \begin{columns}
    \column{0.5\textwidth}
      Texte à gauche.
    \column{0.5\textwidth}
      \includegraphics[width=\linewidth]{figures/courbe}
  \end{columns}
\end{frame}
```

## Code source dans une diapositive

Une diapositive contenant du code verbatim doit être déclarée `fragile` : `\begin{frame}[fragile]`.
