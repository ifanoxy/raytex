# LaTeX basics

LaTeX separates **content** (what you write) from **form** (the layout). You describe the structure of the document; LaTeX takes care of the typography.

## A minimal document

```latex
\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[english]{babel}

\title{My first document}
\author{Alex Smith}

\begin{document}
\maketitle

Hello! This is a paragraph.

An empty line starts a new paragraph.
\end{document}
```

- `\documentclass{…}` picks the kind of document: `article`, `report` (chapters), `book`, `beamer` (slides)…
- The **preamble** (before `\begin{document}`) loads packages and configures the document.
- The **body** holds the text.

## Commands and environments

A **command** starts with `\`: `\textbf{bold}`, `\emph{emphasis}`. Mandatory arguments go in `{}`, optional ones in `[]`.

An **environment** wraps a block:

```latex
\begin{itemize}
  \item First point
  \item Second point
\end{itemize}
```

> Tip: type `\begin{` and pick the environment; LaBagueTex adds the matching `\end{…}`.

## Structure

```latex
\section{Introduction}
\subsection{Context}
\subsubsection{Details}
\paragraph{Note.} A titled paragraph.
```

With `report` or `book`, `\chapter{…}` is available. Starred versions (`\section*{…}`) are not numbered. The **Structure** view in the sidebar shows this outline, with the real numbers after a build.

## Text formatting

| Effect | Command |
|---|---|
| **Bold** | `\textbf{…}` (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>B</kbd>) |
| *Italic* | `\textit{…}` (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>I</kbd>) |
| Emphasis | `\emph{…}` (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>E</kbd>) |
| Monospace | `\texttt{…}` |
| Small caps | `\textsc{…}` |
| Footnote | `\footnote{…}` |

## Lists

```latex
\begin{enumerate}
  \item First
  \item Second
\end{enumerate}

\begin{description}
  \item[Term] Its definition.
\end{description}
```

In a list, <kbd>Enter</kbd> adds an `\item`; on an empty `\item`, <kbd>Enter</kbd> leaves the list.

## Cross-references

Give a **label** to what you want to refer to, then reference it:

```latex
\section{Method}\label{sec:method}
As explained in section~\ref{sec:method}, page~\pageref{sec:method}…
```

`~` is a non-breaking space: it keeps the number from starting a line on its own. Type `\ref{`: LaBagueTex lists every label of the project, with its number.

## Special characters

The characters `# $ % & _ { } ~ ^ \` have a special meaning. To print them: `\# \$ \% \& \_ \{ \}`, `\textasciitilde`, `\textasciicircum`, `\textbackslash`.

`%` starts a **comment**: the rest of the line is ignored.

## Languages

`babel` sets the hyphenation and typographic rules of your language: `\usepackage[english]{babel}`, `[french]`, `[ngerman]`… For proper quotation marks in any language, use `csquotes` and `\enquote{…}`.
