# Presentations (beamer)

The `beamer` class creates PDF slides. The **Slides** template gives you a ready-made one.

## Structure

```latex
\documentclass{beamer}
\usetheme{Madrid}

\title{My talk}
\author{Alex Smith}
\date{\today}

\begin{document}
\begin{frame}
  \titlepage
\end{frame}

\begin{frame}{Outline}
  \tableofcontents
\end{frame}

\section{Introduction}
\begin{frame}{Why this topic?}
  \begin{itemize}
    \item<1-> First argument
    \item<2-> Second argument
  \end{itemize}
\end{frame}
\end{document}
```

Each `frame` is a slide. The `frame` snippet inserts one.

## Step by step

- `\pause`: what follows appears on the next step.
- `\item<2->`: the item appears from step 2.
- `\only<2>{…}`, `\uncover<3->{…}`: fine control.

## Themes

`\usetheme{…}`: `Madrid`, `Berlin`, `metropolis` (modern and clean), `Boadilla`… `\usecolortheme{…}` changes the colours.

## Columns and images

```latex
\begin{frame}{Results}
  \begin{columns}
    \column{0.5\textwidth}
      Text on the left.
    \column{0.5\textwidth}
      \includegraphics[width=\linewidth]{figures/curve}
  \end{columns}
\end{frame}
```

## Source code on a slide

A slide containing verbatim code must be declared `fragile`: `\begin{frame}[fragile]`.
