//! Mistakes made by machine, by the thousand, to measure how often RayTeX
//! says something wrong about a mistake.
//!
//! Sound documents are damaged one mistake at a time (a letter of a command
//! dropped, a brace removed, a package forgotten, a character of text in the
//! wrong place…): the mistake and its lines are known. Each damaged document
//! is compiled like the application does, and what RayTeX says is judged
//! without anybody reading it:
//!
//! - a problem that says a cause (an advice, a live check) must be on the
//!   lines of the mistake, unless its fix repairs the document;
//! - for a misspelled name, what is offered must be the name that was there;
//! - a fix must leave a document that compiles.
//!
//! A problem that only shows the message of TeX where TeX stopped says
//! nothing wrong: it is counted apart ("plain"). The share of documents
//! with a wrong indication must stay under [`MISLEADING_MAX`].
//!
//! ```text
//! cargo test -p raytex-core --release --test mutations -- --ignored --nocapture
//! ```
//!
//! `LBT_MUTATIONS=all` runs every case (thousands, some minutes); a number
//! runs that many, spread over the kinds of mistake (600 by default).
//! `LBT_SEED=<number>` draws other places and other typing mistakes than
//! the usual ones (a lot nobody tuned the rules on),
//! `LBT_KIND=<text>` keeps the kinds whose name contains the text, and
//! `LBT_REPORT=<file>` writes every case that is not right, with what was
//! said; `LBT_SAMPLE=<n>` adds one case in `n` of the others to it, so that
//! what the judge cannot check (whether a sentence at the right place says
//! the right thing) can be read.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use regex::Regex;

use raytex_core::build::{self, BuildEvent, DocumentFacts, RunContext, refine};
use raytex_core::diagnostics::{Diagnostic, Fix, Severity, Source};
use raytex_core::fixes;
use raytex_core::i18n::Lang;
use raytex_core::lint::{self, LintOptions};
use raytex_core::log;
use raytex_core::settings::BuildSettings;
use raytex_core::tex::{Distribution, PackageAnalyzer, TexmfIndex};
use raytex_core::workspace::Workspace;

/// The largest share of damaged documents (among those that give a
/// problem) for which RayTeX may say something wrong.
const MISLEADING_MAX: f64 = 0.005;

// ------------------------------------------------------------------ bases

const ARTICLE: &str = r"\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{booktabs}
\usepackage{hyperref}

\title{Un document ordinaire}
\author{Camille Martin}
\date{2026}

\begin{document}
\maketitle

\section{Introduction}\label{sec:intro}
Ce document sert de base aux essais.
Il contient du texte, des listes et des tableaux.
Voir la section~\ref{sec:resultats} pour la suite.

\subsection{Listes}
\begin{itemize}
  \item Un premier point ;
  \item un second, avec du \textbf{gras} et de l'\emph{italique} ;
  \item un dernier.
\end{itemize}
\begin{enumerate}
  \item Premier ;
  \item second.
\end{enumerate}

\section{Mesures}\label{sec:resultats}
Le tableau~\ref{tab:mesures} donne les mesures.
\begin{table}[htbp]
  \centering
  \caption{Mesures}\label{tab:mesures}
  \begin{tabular}{lrr}
    \toprule
    Essai & Valeur & Erreur \\
    \midrule
    A & 12 & 3 \\
    B & 15 & 2 \\
    \bottomrule
  \end{tabular}
\end{table}

Une formule dans le texte, $a^2 + b^2 = c^2$, et une autre : $\alpha \leq \beta$.
\begin{equation}\label{eq:somme}
  \sum_{i=1}^{n} i = \frac{n(n+1)}{2}
\end{equation}
Selon la relation~\eqref{eq:somme}, la somme est connue.

\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.5\textwidth]{example-image}
  \caption{Une image}\label{fig:image}
\end{figure}
La figure~\ref{fig:image} montre une image\footnote{Une note de bas de page.}.
Un mot en \textcolor{red}{rouge} et un lien vers \url{https://ctan.org}.
\vspace{1cm}

\noindent Fin du document.
\end{document}
";

const MATH: &str = r"\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb,amsthm}
\newtheorem{theoreme}{Proposition}
\newcommand{\R}{\mathbb{R}}
\newcommand{\norme}[1]{\left\lVert #1 \right\rVert}
\newcommand{\paire}[2]{(#1, #2)}
\DeclareMathOperator{\argmax}{argmax}
\begin{document}
\section{Analyse}
Soit $f \colon \R \to \R$ une fonction et $x \in \R$ un nombre.
On note $\norme{x}$ la norme de $x$ et $\paire{a}{b}$ un couple.
\begin{theoreme}
  Pour tout $x \in \R$, on a $x^2 \geq 0$.
\end{theoreme}
\begin{proof}
  Le calcul est direct.
\end{proof}
\begin{align}
  a &= b + c \\
  d &= \frac{e}{f} + \sqrt{g}
\end{align}
\begin{equation*}
  M = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}, \qquad
  |x| = \begin{cases} x & \text{si } x \geq 0 \\ -x & \text{sinon} \end{cases}
\end{equation*}
On a aussi $\left( \frac{a}{b} \right)^2$ et $\lim_{n \to \infty} u_n = \argmax_{x} f(x)$.
\[
  \int_0^1 x^2 \, dx = \frac{1}{3}, \qquad \vec{u} \cdot \vec{v} = 0
\]
Fin de la partie.
\end{document}
";

const PACKAGES: &str = r"\documentclass[a4paper,12pt]{article}
\usepackage[T1]{fontenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{graphicx}
\usepackage[dvipsnames]{xcolor}
\usepackage{enumitem}
\usepackage{caption}
\usepackage{siunitx}
\usepackage{listings}
\usepackage[colorlinks=true,linkcolor=blue]{hyperref}
\captionsetup{labelfont=bf,font=small}
\lstset{language=Python,basicstyle=\ttfamily,numbers=left}
\setlength{\parindent}{0pt}
\setlength{\parskip}{6pt}
\begin{document}
\section{Mesures}
Une longueur de \SI{3.5}{\metre} et une masse de \num{12.5}.
\begin{enumerate}[label=\alph*)]
  \item Premier point ;
  \item second point.
\end{enumerate}
\begin{figure}[htbp]
  \centering
  \includegraphics[width=4cm,height=3cm]{example-image}
  \caption{Une image}
\end{figure}
\begin{lstlisting}[language=Python]
print(1)
\end{lstlisting}
Un mot en \textcolor{ForestGreen}{vert} puis \hspace{1cm} un espace.

\rule{3cm}{0.4pt}

\begin{minipage}{0.4\textwidth}
  Une bo\^ite de texte.
\end{minipage}
\parbox{3cm}{Une autre.}
\vspace{5mm}

Fin de la page.
\end{document}
";

const REPORT: &str = r"\documentclass[11pt]{report}
\usepackage[T1]{fontenc}
\usepackage{amsmath}
\usepackage{graphicx}
\begin{document}
\tableofcontents
\chapter{Introduction}\label{chap:intro}
Ce rapport a deux chapitres.
Le premier pose le cadre.
\section{Contexte}
Un texte avec une citation :
\begin{quote}
  Une phrase que tout le monde connaît.
\end{quote}
\begin{description}
  \item[Terme] Sa définition ;
  \item[Autre] une autre définition.
\end{description}
\begin{verbatim}
du code tel quel
\end{verbatim}
\chapter{Travail}\label{chap:travail}
Voir le chapitre~\ref{chap:intro} pour le cadre.
\section{Calcul}
On calcule $x = 2y$ puis
\[
  y = \frac{x}{2}.
\]
\begin{center}
  Un texte centré.
\end{center}
\noindent Un texte \textit{en italique}, \texttt{en machine} et \underline{souligné}.
\end{document}
";

const UNCOMMON: &str = r"\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{marginnote}
\usepackage{fancybox}
\usepackage{paralist}
\usepackage{units}
\usepackage{stmaryrd}
\usepackage{multicol}
\begin{document}
Un texte\marginnote{une note} avec une \shadowbox{boîte} et une \doublebox{autre}.
\begin{compactitem}
  \item Un point ;
  \item un autre.
\end{compactitem}
Une vitesse de \unitfrac[3]{km}{h} et un intervalle $\llbracket 1, n \rrbracket$.
\begin{multicols}{2}
  Du texte sur deux colonnes, assez long pour être coupé en deux parties égales.
\end{multicols}
Fin de ce document.
\end{document}
";

const TIKZ: &str = r"\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning}
\begin{document}
Un dessin simple.
\begin{tikzpicture}[node distance=2cm]
  \node[draw, circle] (a) at (0,0) {A};
  \node[draw, rectangle, right=of a] (b) {B};
  \draw[->, thick] (a) -- (b);
  \draw[-{Stealth}, red] (0,-1) -- (2,-1) node[midway, below] {axe};
  \fill[blue!30] (3,0) circle (0.5);
\end{tikzpicture}
Fin du dessin.
\end{document}
";

const BEAMER: &str = r"\documentclass{beamer}
\title{Un diaporama}
\author{A. Martin}
\date{2026}
\begin{document}
\begin{frame}
  \titlepage
\end{frame}
\begin{frame}{Plan}
  \begin{itemize}
    \item Premier point
    \item Second point
  \end{itemize}
\end{frame}
\begin{frame}[fragile]{Code}
\begin{verbatim}
x = 1
\end{verbatim}
\end{frame}
\begin{frame}{Formule}
  \begin{block}{Relation}
    On a $a^2 + b^2 = c^2$.
  \end{block}
\end{frame}
\end{document}
";

const FRENCH: &str = r"\documentclass[11pt,french]{article}
\usepackage[T1]{fontenc}
\usepackage{babel}
\usepackage{csquotes}
\usepackage{enumitem}
\usepackage{amsmath}
\begin{document}
\section{Sujet}
Il a dit : \enquote{bonjour à tous} ; puis il est parti.
Le texte contient des accents, des guillemets et des listes.
\begin{itemize}[noitemsep]
  \item Un point ;
  \item un autre point.
\end{itemize}
\begin{description}
  \item[Mot] Sa définition.
\end{description}
Une note\footnote{Le texte de la note.} et une formule $E = mc^2$ au milieu.
\begin{center}
  \textsc{Un titre} en petites capitales.
\end{center}
\paragraph{Remarque.} Le dernier paragraphe est court.

Fin du texte.
\end{document}
";

const TABLES: &str = r"\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{array}
\usepackage{tabularx}
\usepackage{multirow}
\usepackage{booktabs}
\begin{document}
Un premier tableau simple.

\begin{tabular}{|l|c|r|}
  \hline
  Nom & Valeur & Total \\
  \hline
  A & 1 & 10 \\
  B & 2 & 20 \\
  \hline
\end{tabular}

Un tableau plus large.

\noindent
\begin{tabularx}{\textwidth}{lX}
  \toprule
  Titre & Description longue du contenu \\
  \midrule
  Un & Le premier de la liste \\
  \multicolumn{2}{c}{Une ligne sur deux colonnes} \\
  \bottomrule
\end{tabularx}

\begin{tabular}{ll}
  \multirow{2}{*}{Groupe} & premier \\
                          & second \\
\end{tabular}

Fin des tableaux.
\end{document}
";

// Three documents written after the rules were: lessons, science and a
// book, with blank lines between paragraphs as people write them.

const COURSE: &str = r"\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{enumitem}
\usepackage{fancyhdr}
\usepackage{hyperref}

\newtheorem{definition}{Définition}
\newtheorem{lemme}{Lemme}
\newcommand{\N}{\mathbb{N}}
\newcommand{\abs}[1]{\left| #1 \right|}

\setlength{\headheight}{14pt}
\pagestyle{fancy}
\fancyhead[L]{Cours}
\fancyhead[R]{\thepage}

\title{Suites numériques}
\author{Un auteur}
\date{2026}

\begin{document}
\maketitle

\section{Définitions}\label{sec-def}

Une suite est une application de $\N$ dans un ensemble. On note $u_n$ son terme général.

\begin{definition}\label{def-borne}
  Une suite $(u_n)$ est bornée s'il existe $M \geq 0$ tel que $\abs{u_n} \leq M$ pour tout $n \in \N$.
\end{definition}

La définition~\ref{def-borne} sert dans toute la section~\ref{sec-def}, page~\pageref{sec-def}.

\begin{lemme}
  Toute suite convergente est bornée.
\end{lemme}

\begin{proof}
  On applique la définition avec $\varepsilon = 1$ et on obtient
  \begin{equation}\label{eq-majoration}
    \abs{u_n} \leq \abs{u_n - \ell} + \abs{\ell} \leq 1 + \abs{\ell}.
  \end{equation}
  L'inégalité~\eqref{eq-majoration} donne le résultat.
\end{proof}

\section{Exemples}

Les exemples qui suivent illustrent ces notions.

\begin{enumerate}[label=(\roman*)]
  \item La suite $u_n = \frac{1}{n+1}$ tend vers $0$.
  \item La suite $v_n = (-1)^n$ est bornée et ne converge pas.
\end{enumerate}

On retiendra que
\[
  \lim_{n \to +\infty} \frac{1}{n+1} = 0
  \quad\text{et}\quad
  \sum_{k=0}^{n} 2^k = 2^{n+1} - 1.
\]

Voir \url{https://example.org} pour la suite du cours.
\end{document}
";

const SCIENCE: &str = r"\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{graphicx}
\usepackage{subcaption}
\usepackage{siunitx}
\usepackage[version=4]{mhchem}
\usepackage{pgfplots}
\pgfplotsset{compat=1.16}
\usepackage{longtable}
\usepackage{booktabs}

\begin{document}

\section{Réaction}

La combustion du méthane s'écrit \ce{CH4 + 2 O2 -> CO2 + 2 H2O}.
Elle libère \qty{890}{\kilo\joule\per\mole} à \qty{25}{\celsius}.

\begin{figure}[htbp]
  \centering
  \begin{subfigure}{0.45\textwidth}
    \centering
    \includegraphics[width=\linewidth]{example-image-a}
    \caption{Avant}\label{fig:avant}
  \end{subfigure}
  \hfill
  \begin{subfigure}{0.45\textwidth}
    \centering
    \includegraphics[width=\linewidth]{example-image-b}
    \caption{Après}\label{fig:apres}
  \end{subfigure}
  \caption{Deux états du système}\label{fig:etats}
\end{figure}

Les figures~\ref{fig:avant} et~\ref{fig:apres} composent la figure~\ref{fig:etats}.

Les mesures sont faites trois fois de suite.

\begin{figure}[htbp]
  \centering
  \begin{tikzpicture}
    \begin{axis}[xlabel={Temps}, ylabel={Masse}, width=8cm, height=5cm]
      \addplot[blue, mark=*] coordinates {(0,1) (1,2) (2,4) (3,8)};
      \addplot[red, domain=0:3, samples=20] {x^2};
    \end{axis}
  \end{tikzpicture}
  \caption{Une courbe}\label{fig:courbe}
\end{figure}

\begin{longtable}{lrr}
  \toprule
  Espèce & Masse & Volume \\
  \midrule
  \endhead
  Eau & 18 & 1.0 \\
  Méthane & 16 & 0.7 \\
  \bottomrule
\end{longtable}

La courbe de la figure~\ref{fig:courbe} est obtenue avec \num{20} points.
\end{document}
";

const BOOK: &str = r"\documentclass[11pt,oneside]{book}
\usepackage[T1]{fontenc}
\usepackage{microtype}
\usepackage{csquotes}
\usepackage{xcolor}
\usepackage[most]{tcolorbox}
\usepackage{algpseudocode}
\usepackage{multirow}

\newtcolorbox{remarque}{colback=yellow!10, colframe=orange!80!black, title=Remarque}
\newcommand{\motcle}[1]{\textbf{#1}}

\begin{document}
\frontmatter
\tableofcontents

\mainmatter
\part{Fondations}

\chapter{Premiers pas}\label{ch:debut}

Ce chapitre présente les \motcle{algorithmes} de base. \enquote{Un bon départ} compte beaucoup.

\begin{remarque}
  Le contenu de cette boîte peut tenir sur plusieurs lignes, avec du \emph{texte mis en valeur}.
\end{remarque}

\section{Recherche}

\begin{algorithmic}[1]
  \State $i \gets 0$
  \While{$i < n$}
    \If{$t[i] = x$}
      \State \Return $i$
    \EndIf
    \State $i \gets i + 1$
  \EndWhile
\end{algorithmic}

\begin{center}
  \begin{tabular}{|l|c|c|}
    \hline
    \multirow{2}{*}{Méthode} & \multicolumn{2}{c|}{Coût} \\
    \cline{2-3}
     & Moyen & Pire \\
    \hline
    Linéaire & $n/2$ & $n$ \\
    \hline
  \end{tabular}
\end{center}

Le chapitre~\ref{ch:debut} commence page~\pageref{ch:debut}\footnote{Une note, avec une \emph{nuance}.}.

\backmatter
\chapter{Conclusion}

Un dernier mot pour finir ce livre.
\end{document}
";

struct Base {
    name: &'static str,
    text: &'static str,
    /// How many of each kind of mistake at most (the slow ones get fewer).
    share: usize,
}

const BASES: &[Base] = &[
    Base {
        name: "article",
        text: ARTICLE,
        share: 90,
    },
    Base {
        name: "math",
        text: MATH,
        share: 90,
    },
    Base {
        name: "packages",
        text: PACKAGES,
        share: 80,
    },
    Base {
        name: "report",
        text: REPORT,
        share: 80,
    },
    Base {
        name: "french",
        text: FRENCH,
        share: 70,
    },
    Base {
        name: "tables",
        text: TABLES,
        share: 70,
    },
    Base {
        name: "uncommon",
        text: UNCOMMON,
        share: 60,
    },
    Base {
        name: "tikz",
        text: TIKZ,
        share: 30,
    },
    Base {
        name: "beamer",
        text: BEAMER,
        share: 25,
    },
    Base {
        name: "cours",
        text: COURSE,
        share: 60,
    },
    Base {
        name: "science",
        text: SCIENCE,
        share: 50,
    },
    Base {
        name: "livre",
        text: BOOK,
        share: 50,
    },
];

// ------------------------------------------------------------------ cases

/// A damaged document and what is known of its mistake.
#[derive(Clone)]
struct Case {
    kind: &'static str,
    base: &'static str,
    text: String,
    /// Lines (0-based, inclusive) of the mistake in `text`.
    lines: (usize, usize),
    /// For a misspelled name: the sound text a fix must give back, and the
    /// name that was written.
    restore: Option<(&'static str, String)>,
    /// When the mistake has no place of its own (a package that is not
    /// loaded): what an advice elsewhere must name.
    names: Option<String>,
}

/// A small generator of numbers, the same on every machine.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }

    /// At most `n` of `items`, in their order.
    fn sample<T: Clone>(&mut self, items: &[T], n: usize) -> Vec<T> {
        if items.len() <= n {
            return items.to_vec();
        }
        let mut picked: Vec<usize> = (0..items.len()).collect();
        for i in 0..n {
            let j = i + self.below(items.len() - i);
            picked.swap(i, j);
        }
        picked.truncate(n);
        picked.sort_unstable();
        picked.into_iter().map(|i| items[i].clone()).collect()
    }
}

fn line_of(text: &str, offset: usize) -> usize {
    text[..offset.min(text.len())].matches('\n').count()
}

/// How far from a mistake, in lines, a cause may still be said to be at
/// its place: TeX reports some of them on the line that follows.
const NEAR: usize = 2;

/// The lines of the paragraph that holds `offset` (between blank lines),
/// and no more than `NEAR` lines away from it: a document written without
/// blank lines is not one paragraph.
fn paragraph(text: &str, offset: usize) -> (usize, usize) {
    let lines: Vec<&str> = text.split('\n').collect();
    let at = line_of(text, offset).min(lines.len() - 1);
    let (mut first, mut last) = (at, at);
    while first > 0 && at - first < NEAR && !lines[first - 1].trim().is_empty() {
        first -= 1;
    }
    while last + 1 < lines.len() && last - at < NEAR && !lines[last + 1].trim().is_empty() {
        last += 1;
    }
    (first, last)
}

fn replaced(text: &str, from: usize, to: usize, new: &str) -> String {
    format!("{}{new}{}", &text[..from], &text[to..])
}

/// A name with one typing mistake: a letter dropped, two swapped, or one
/// typed twice.
fn misspelled(name: &str, rng: &mut Rng) -> Option<String> {
    let c: Vec<char> = name.chars().collect();
    if c.len() < 3 {
        return None;
    }
    let i = 1 + rng.below(c.len() - 1);
    let mut out = c.clone();
    match rng.below(3) {
        0 => {
            out.remove(i);
        }
        1 => {
            let j = if i + 1 < c.len() { i + 1 } else { i - 1 };
            out.swap(i, j);
        }
        _ => out.insert(i, c[i]),
    }
    let out: String = out.into_iter().collect();
    (out != name).then_some(out)
}

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).unwrap()
}

/// The body of the document: after `\begin{document}`.
fn body_start(text: &str) -> usize {
    text.find("\\begin{document}").map_or(0, |i| i + 16)
}

/// Lines of plain prose in the body (no command, no formula), as spans.
fn prose(text: &str) -> Vec<(usize, usize)> {
    let plain = re(r"(?m)^[A-ZÀ-Ý][^\\$&%#_{}~^\n]*[.;:]$");
    let from = body_start(text);
    let verbatim = re(r"(?s)\\begin\{(verbatim|lstlisting)\}.*?\\end\{(verbatim|lstlisting)\}");
    let hidden: Vec<(usize, usize)> = verbatim
        .find_iter(text)
        .map(|m| (m.start(), m.end()))
        .collect();
    plain
        .find_iter(&text[from..])
        .map(|m| (from + m.start(), from + m.end()))
        .filter(|(s, _)| !hidden.iter().any(|(a, b)| a <= s && s < b))
        .collect()
}

/// The lines of a mistake in the command at `s..e`: its line, and for
/// `\begin` or `\end` the whole environment (its other end is part of the
/// mistake).
fn lines_of_command(t: &str, s: usize, e: usize) -> (usize, usize) {
    let line = line_of(t, s);
    if matches!(&t[s..e], "begin" | "end")
        && let Some(name) = re(r"^\{([A-Za-z*]+)\}").captures(&t[e..])
    {
        let other = if &t[s..e] == "begin" {
            t[e..]
                .find(&format!("\\end{{{}}}", &name[1]))
                .map(|i| e + i)
        } else {
            t[..s].rfind(&format!("\\begin{{{}}}", &name[1]))
        };
        if let Some(other) = other {
            let o = line_of(t, other);
            return (line.min(o), line.max(o));
        }
    }
    (line, line)
}

/// Every damaged document, in a fixed order.
fn corpus() -> Vec<Case> {
    // `LBT_SEED` draws other places and other typing mistakes.
    let seed = std::env::var("LBT_SEED")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15 ^ seed.wrapping_mul(0xD6E8_FEB8_6659_FD93));
    let mut out = Vec::new();
    for base in BASES {
        let t = base.text;
        let n = base.share;
        let case = |kind: &'static str, text: String, lines: (usize, usize)| Case {
            kind,
            base: base.name,
            text,
            lines,
            restore: None,
            names: None,
        };

        // --- A command misspelled.
        let commands: Vec<(usize, usize)> = re(r"\\([A-Za-z]{3,})")
            .captures_iter(t)
            .map(|c| (c.get(1).unwrap().start(), c.get(1).unwrap().end()))
            .collect();
        for (s, e) in rng.sample(&commands, n * 2) {
            let Some(typo) = misspelled(&t[s..e], &mut rng) else {
                continue;
            };
            let mut c = case(
                "command-misspelled",
                replaced(t, s, e, &typo),
                lines_of_command(t, s, e),
            );
            c.restore = Some((t, format!("\\{}", &t[s..e])));
            out.push(c);
        }

        // --- An environment misspelled: at its \begin, at its \end, at both.
        let begins: Vec<(usize, usize, String)> = re(r"\\begin\{([A-Za-z]+\*?)\}")
            .captures_iter(t)
            .map(|c| {
                let m = c.get(1).unwrap();
                (m.start(), m.end(), m.as_str().to_owned())
            })
            .filter(|(_, _, name)| name != "document")
            .collect();
        for (s, e, name) in rng.sample(&begins, n) {
            let closing = format!("\\end{{{name}}}");
            let Some(end) = t[e..].find(&closing).map(|i| e + i + 5) else {
                continue;
            };
            let Some(typo) = misspelled(name.trim_end_matches('*'), &mut rng) else {
                continue;
            };
            let typo = format!("{typo}{}", if name.ends_with('*') { "*" } else { "" });
            let lines = (line_of(t, s), line_of(t, end));
            let which = rng.below(3);
            let mut text = t.to_owned();
            if which != 0 {
                text = replaced(&text, end, end + name.len(), &typo);
            }
            if which != 1 {
                text = replaced(&text, s, e, &typo);
            }
            let mut c = case("environment-misspelled", text, lines);
            c.restore = Some((t, name.clone()));
            out.push(c);
        }

        // --- Braces: one that closes removed, one that opens removed, one added.
        let groups: Vec<(usize, usize)> = re(r"\\[A-Za-z]+\*?(?:\[[^\]\n]*\])?\{[^{}\n]*\}")
            .find_iter(t)
            .map(|m| (m.start(), m.end()))
            .filter(|(s, _)| !t[*s..].starts_with("\\begin") && !t[*s..].starts_with("\\end"))
            .collect();
        for (s, e) in rng.sample(&groups, n) {
            out.push(case(
                "brace-not-closed",
                replaced(t, e - 1, e, ""),
                paragraph(t, s),
            ));
        }
        for (s, e) in rng.sample(&groups, n / 2) {
            let open = s + t[s..e].find('{').unwrap();
            out.push(case(
                "brace-not-opened",
                replaced(t, open, open + 1, " "),
                paragraph(t, s),
            ));
        }
        let lines_of_prose = prose(t);
        for (s, e) in rng.sample(&lines_of_prose, n / 3) {
            let words: Vec<usize> = t[s..e].match_indices(' ').map(|(i, _)| s + i).collect();
            if words.is_empty() {
                continue;
            }
            let at = words[rng.below(words.len())];
            let line = line_of(t, at);
            out.push(case(
                "brace-too-many",
                replaced(t, at, at, "}"),
                (line, line),
            ));
        }

        // --- Formulas: a `$` removed.
        let formulas: Vec<(usize, usize)> = re(r"\$[^$\n]+\$")
            .find_iter(t)
            .map(|m| (m.start(), m.end()))
            .collect();
        for (s, e) in rng.sample(&formulas, n / 2) {
            let (kind, at): (&'static str, usize) = if rng.below(2) == 0 {
                ("formula-not-opened", s)
            } else {
                ("formula-not-closed", e - 1)
            };
            out.push(case(kind, replaced(t, at, at + 1, ""), paragraph(t, s)));
        }

        // --- The last argument of a command removed.
        let calls: Vec<(usize, usize)> = re(r"\\[A-Za-z]+(?:\{[^{}\n]*\}){2,}")
            .find_iter(t)
            .map(|m| (m.start(), m.end()))
            .collect();
        for (s, e) in rng.sample(&calls, n / 2) {
            let last = s + t[s..e].rfind('{').unwrap();
            out.push(case(
                "argument-missing",
                replaced(t, last, e, ""),
                paragraph(t, s),
            ));
        }

        // --- An environment that loses its \end, or its \begin.
        for (s, e, name) in rng.sample(&begins, n / 2) {
            let closing = format!("\\end{{{name}}}");
            let Some(end) = t[e..].find(&closing).map(|i| e + i) else {
                continue;
            };
            if rng.below(2) == 0 {
                out.push(case(
                    "end-missing",
                    replaced(t, end, end + closing.len(), ""),
                    (line_of(t, s), line_of(t, end)),
                ));
            } else {
                let opening = s - "\\begin{".len();
                out.push(case(
                    "begin-missing",
                    replaced(t, opening, e + 1, ""),
                    (line_of(t, s), line_of(t, end)),
                ));
            }
        }

        // --- A character that means something to TeX, typed in text.
        for (s, e) in rng.sample(&lines_of_prose, n) {
            let letters: Vec<usize> = t[s..e]
                .char_indices()
                .filter(|(i, c)| *i > 2 && c.is_ascii_lowercase())
                .map(|(i, _)| s + i)
                .collect();
            if letters.is_empty() {
                continue;
            }
            let at = letters[rng.below(letters.len())];
            let (kind, what): (&'static str, &str) = match rng.below(4) {
                0 => ("underscore-in-text", "_"),
                1 => ("ampersand-in-text", " & "),
                2 => ("hash-in-text", " #"),
                _ => ("caret-in-text", "^"),
            };
            let line = line_of(t, at);
            out.push(case(kind, replaced(t, at, at, what), (line, line)));
        }

        // --- A package that is not loaded any more, or misspelled.
        let packages: Vec<(usize, usize)> =
            re(r"(?m)^\\usepackage(?:\[[^\]\n]*\])?\{([^}\n]+)\}\n")
                .captures_iter(t)
                .map(|c| (c.get(0).unwrap().start(), c.get(0).unwrap().end()))
                .collect();
        for (s, e) in &packages {
            let open = s + t[*s..*e].rfind('{').unwrap() + 1;
            let names: Vec<&str> = t[open..e - 2].split(',').collect();
            for name in &names {
                let name = name.trim();
                let text = if names.len() == 1 {
                    replaced(t, *s, *e, "")
                } else {
                    t.replacen(&format!("{name},"), "", 1)
                        .replacen(&format!(",{name}}}"), "}", 1)
                };
                let mut c = case("package-not-loaded", text, (usize::MAX, usize::MAX));
                c.names = Some(name.to_owned());
                out.push(c);
                if let Some(typo) = misspelled(name, &mut rng) {
                    let at = open + t[open..*e].find(name).unwrap();
                    let line = line_of(t, at);
                    let mut c = case(
                        "package-misspelled",
                        replaced(t, at, at + name.len(), &typo),
                        (line, line),
                    );
                    c.restore = Some((t, name.to_owned()));
                    out.push(c);
                }
            }
        }

        // --- Keys: a key misspelled, a length that loses its unit.
        let keys: Vec<(usize, usize)> = re(r"[\[{,]\s*([A-Za-z]{4,})=")
            .captures_iter(t)
            .map(|c| (c.get(1).unwrap().start(), c.get(1).unwrap().end()))
            .collect();
        for (s, e) in rng.sample(&keys, n / 2) {
            let Some(typo) = misspelled(&t[s..e], &mut rng) else {
                continue;
            };
            let line = line_of(t, s);
            let mut c = case("key-misspelled", replaced(t, s, e, &typo), (line, line));
            c.restore = Some((t, t[s..e].to_owned()));
            out.push(c);
        }
        let lengths: Vec<(usize, usize)> = re(r"[={]\d+(?:\.\d+)?(cm|mm|pt)[,}\]]")
            .captures_iter(t)
            .map(|c| (c.get(1).unwrap().start(), c.get(1).unwrap().end()))
            .collect();
        for (s, e) in rng.sample(&lengths, n / 2) {
            let line = line_of(t, s);
            out.push(case(
                "length-without-unit",
                replaced(t, s, e, ""),
                (line, line),
            ));
            out.push(case(
                "unit-misspelled",
                replaced(t, s, e, "cn"),
                (line, line),
            ));
        }

        // --- A reference to a label that is misspelled.
        let refs: Vec<(usize, usize)> = re(r"\\(?:eq)?ref\{([^}\n]+)\}")
            .captures_iter(t)
            .map(|c| (c.get(1).unwrap().start(), c.get(1).unwrap().end()))
            .collect();
        for (s, e) in &refs {
            let Some(typo) = misspelled(&t[*s..*e], &mut rng) else {
                continue;
            };
            let line = line_of(t, *s);
            let mut c = case(
                "reference-misspelled",
                replaced(t, *s, *e, &typo),
                (line, line),
            );
            c.restore = Some((t, t[*s..*e].to_owned()));
            out.push(c);
        }

        // --- Lists: the first \item removed; an \item outside any list.
        for m in
            re(r"\\begin\{(?:itemize|enumerate)\}(?:\[[^\]\n]*\])?\n\s*(\\item )").captures_iter(t)
        {
            let item = m.get(1).unwrap();
            let list = paragraph(t, item.start());
            out.push(case(
                "item-missing",
                replaced(t, item.start(), item.end(), ""),
                list,
            ));
        }
        for (s, _) in rng.sample(&lines_of_prose, 3) {
            let line = line_of(t, s);
            out.push(case(
                "item-outside-a-list",
                replaced(t, s, s, "\\item "),
                (line, line),
            ));
        }

        // --- Tables: a cell too many, a row not ended before a rule.
        for m in re(r"(?m)^\s*[^\\\n]*&[^\\\n]*(\\\\)\n").captures_iter(t) {
            let end = m.get(1).unwrap();
            let table = paragraph(t, end.start());
            out.push(case(
                "cell-too-many",
                replaced(t, end.start(), end.start(), "& x "),
                table,
            ));
        }
        for m in re(r"(\\\\)\n\s*\\(?:midrule|bottomrule|hline)").captures_iter(t) {
            let end = m.get(1).unwrap();
            out.push(case(
                "row-not-ended",
                replaced(t, end.start(), end.end(), ""),
                paragraph(t, end.start()),
            ));
        }

        // --- Formulas: \right removed, two subscripts, a letter with an accent.
        for m in re(r"\\right(?:\\[A-Za-z]+|[)\].|])").find_iter(t) {
            if t[..m.start()].contains("\\newcommand") && line_of(t, m.start()) < 10 {
                continue;
            }
            out.push(case(
                "right-missing",
                replaced(t, m.start(), m.end(), ""),
                paragraph(t, m.start()),
            ));
        }
        for (s, e) in rng.sample(&formulas, n / 4) {
            if let Some(i) = t[s..e].find('_') {
                let at = s + i;
                let line = line_of(t, at);
                out.push(case(
                    "subscript-twice",
                    replaced(t, at, at, "_a"),
                    (line, line),
                ));
            }
            let line = line_of(t, s);
            out.push(case(
                "accent-in-formula",
                replaced(t, e - 1, e - 1, " é"),
                (line, line),
            ));
        }

        // --- The document itself: no \begin{document}, no \end{document},
        // text or a package where they cannot be.
        if let Some(i) = t.find("\\begin{document}\n") {
            let mut c = case(
                "begin-document-missing",
                replaced(t, i, i + 17, ""),
                (usize::MAX, usize::MAX),
            );
            c.names = Some("document".into());
            out.push(c);
            let line = line_of(t, i);
            out.push(case(
                "text-in-the-preamble",
                replaced(t, i, i, "Bonjour tout le monde.\n"),
                (line, line),
            ));
            out.push(case(
                "package-after-begin-document",
                replaced(t, i + 17, i + 17, "\\usepackage{verbatim}\n"),
                (line + 1, line + 1),
            ));
        }
        if let Some(i) = t.find("\\end{document}") {
            let mut c = case(
                "end-document-missing",
                replaced(t, i, i + 14, ""),
                (usize::MAX, usize::MAX),
            );
            c.names = Some("document".into());
            out.push(c);
        }

        // --- An option of the class misspelled.
        if let Some(m) = re(r"\\documentclass\[([^\]\n]+)\]").captures(t) {
            for option in m[1].split(',') {
                let at = m.get(1).unwrap().start() + m[1].find(option).unwrap();
                if let Some(typo) = misspelled(option, &mut rng) {
                    let mut c = case(
                        "class-option-misspelled",
                        replaced(t, at, at + option.len(), &typo),
                        (0, 0),
                    );
                    c.restore = Some((t, option.to_owned()));
                    out.push(c);
                }
            }
        }

        // --- An \end with the name of another environment.
        for (s, e, name) in rng.sample(&begins, n / 3) {
            let closing = format!("\\end{{{name}}}");
            let Some(end) = t[e..].find(&closing).map(|i| e + i + 5) else {
                continue;
            };
            let other = if name == "center" { "quote" } else { "center" };
            let mut c = case(
                "end-of-another-environment",
                replaced(t, end, end + name.len(), other),
                (line_of(t, s), line_of(t, end)),
            );
            c.restore = Some((t, name.clone()));
            out.push(c);
        }

        // --- An environment nobody defines, well written at both ends.
        for (s, e, name) in rng.sample(&begins, n / 6) {
            let closing = format!("\\end{{{name}}}");
            let Some(end) = t[e..].find(&closing).map(|i| e + i + 5) else {
                continue;
            };
            let text = replaced(t, end, end + name.len(), "encadrement");
            out.push(case(
                "environment-nobody-defines",
                replaced(&text, s, e, "encadrement"),
                (line_of(t, s), line_of(t, end)),
            ));
        }

        // --- A command written with a capital.
        for (s, e) in rng.sample(&commands, n / 3) {
            if !t[s..e].starts_with(|c: char| c.is_ascii_lowercase()) {
                continue;
            }
            let capital = format!("{}{}", t[s..s + 1].to_uppercase(), &t[s + 1..e]);
            let mut c = case(
                "command-with-a-capital",
                replaced(t, s, e, &capital),
                lines_of_command(t, s, e),
            );
            c.restore = Some((t, format!("\\{}", &t[s..e])));
            out.push(c);
        }

        // --- A `%` that hides the brace that closes.
        for (s, e) in rng.sample(&groups, n / 4) {
            if e - s < 12 {
                continue;
            }
            out.push(case(
                "percent-hides-the-brace",
                replaced(t, e - 1, e - 1, " % "),
                paragraph(t, s),
            ));
        }

        // --- A formula opened with `$$` and closed with `$`; a formula that
        // loses both its `$`.
        for (s, e) in rng.sample(&formulas, n / 3) {
            out.push(case(
                "display-closed-by-one-dollar",
                replaced(t, s, s, "$"),
                paragraph(t, s),
            ));
            if t[s..e].contains(['\\', '^', '_']) {
                let text = replaced(t, e - 1, e, "");
                out.push(case(
                    "formula-without-dollars",
                    replaced(&text, s, s + 1, ""),
                    paragraph(t, s),
                ));
            }
        }

        // --- A line break where there is no line to end.
        for (s, _) in rng.sample(&lines_of_prose, 3) {
            if s < 2 || &t[s - 2..s] != "\n\n" {
                continue;
            }
            let line = line_of(t, s);
            out.push(case(
                "line-break-without-a-line",
                replaced(t, s, s, "\\\\\n"),
                (line, line + 1),
            ));
        }

        // --- A table that loses the description of its columns.
        for m in re(r"\\begin\{tabular\}(\{[^{}\n]*\})").captures_iter(t) {
            let spec = m.get(1).unwrap();
            out.push(case(
                "columns-not-described",
                replaced(t, spec.start(), spec.end(), ""),
                paragraph(t, spec.start()),
            ));
        }

        // --- What another class brings, used in this one.
        if t.starts_with("\\documentclass") && t[..t.find('\n').unwrap()].contains("{article}") {
            for (s, _) in rng.sample(&lines_of_prose, 2) {
                let line = line_of(t, s);
                out.push(case(
                    "command-of-another-class",
                    replaced(t, s, s, "\\chapter{Un titre}\n"),
                    (line, line),
                ));
            }
        }

        // --- An image that does not exist, a color nobody defined.
        for m in re(r"\{(example-image)\}").captures_iter(t) {
            let name = m.get(1).unwrap();
            let line = line_of(t, name.start());
            out.push(case(
                "image-not-found",
                replaced(t, name.start(), name.end(), "image-absente"),
                (line, line),
            ));
        }
        for m in re(r"\\textcolor\{([A-Za-z]+)\}").captures_iter(t) {
            let name = m.get(1).unwrap();
            let line = line_of(t, name.start());
            out.push(case(
                "color-nobody-defined",
                replaced(t, name.start(), name.end(), "couleurmaison"),
                (line, line),
            ));
        }

        // --- A label written twice; a label that is not there any more.
        let labels: Vec<(usize, usize)> = re(r"\\label\{[^}\n]+\}")
            .find_iter(t)
            .map(|m| (m.start(), m.end()))
            .collect();
        // The second one is written after a line of prose: two labels in one
        // equation are another mistake.
        let after_prose = lines_of_prose.last().map(|(_, e)| *e);
        if let (Some((s, e)), Some(last)) =
            (labels.first(), after_prose.or(labels.last().map(|l| l.1)))
            && labels.len() > 1
        {
            let last = &last;
            out.push(case(
                "label-twice",
                replaced(t, *last, *last, &t[*s..*e]),
                (line_of(t, *s), line_of(t, *last)),
            ));
        }
        for (s, e) in &labels {
            let name = t[*s + 7..*e - 1].to_owned();
            if !t.contains(&format!("ref{{{name}}}")) {
                continue;
            }
            let mut c = case(
                "label-removed",
                replaced(t, *s, *e, ""),
                (usize::MAX, usize::MAX),
            );
            c.names = Some(name);
            out.push(c);
        }

        // --- An option of a package misspelled; the same package twice,
        // with other options.
        for m in re(r"\\usepackage\[([a-z0-9]{4,})\]\{([a-z]+)\}").captures_iter(t) {
            let option = m.get(1).unwrap();
            if let Some(typo) = misspelled(option.as_str(), &mut rng) {
                let line = line_of(t, option.start());
                let mut c = case(
                    "package-option-misspelled",
                    replaced(t, option.start(), option.end(), &typo),
                    (line, line),
                );
                c.restore = Some((t, option.as_str().to_owned()));
                out.push(c);
            }
        }
        if let Some(m) = re(r"(?m)^\\usepackage\{(graphicx|xcolor|geometry)\}\n").captures(t) {
            let end = m.get(0).unwrap().end();
            let line = line_of(t, end);
            out.push(case(
                "package-twice-with-options",
                replaced(t, end, end, &format!("\\usepackage[draft]{{{}}}\n", &m[1])),
                (line - 1, line),
            ));
        }

        // --- Definitions: a command that exists, a parameter that does not.
        if let Some(i) = t.find("\\begin{document}\n") {
            let line = line_of(t, i);
            out.push(case(
                "command-defined-twice",
                replaced(t, i, i, "\\newcommand{\\alpha}{a}\n"),
                (line, line),
            ));
            out.push(case(
                "parameter-not-declared",
                replaced(t, i, i, "\\newcommand{\\double}{#1 #1}\n"),
                (line, line),
            ));
            out.push(case(
                "definition-of-an-unknown-command",
                replaced(t, i, i, "\\renewcommand{\\inconnue}{a}\n"),
                (line, line),
            ));
        }

        // --- TikZ: a path that does not end, a library that is not loaded.
        for m in
            re(r"(?m)^\s*\\(?:node|draw|fill)[^\n]*(;)\n\s*\\(?:node|draw|fill)").captures_iter(t)
        {
            let end = m.get(1).unwrap();
            let line = line_of(t, end.start());
            out.push(case(
                "path-not-ended",
                replaced(t, end.start(), end.end(), ""),
                (line, line + 1),
            ));
        }
        // One library at a time: a document has one mistake.
        if let Some(m) = re(r"(?m)^\\usetikzlibrary\{([^}\n]*)\}\n").captures(t) {
            let (line, list) = (m.get(0).unwrap(), m.get(1).unwrap());
            let libraries: Vec<&str> = list.as_str().split(',').collect();
            for skipped in 0..libraries.len() {
                let kept: Vec<&str> = libraries
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| *i != skipped)
                    .map(|(_, l)| *l)
                    .collect();
                let text = match kept.is_empty() {
                    true => replaced(t, line.start(), line.end(), ""),
                    false => replaced(t, list.start(), list.end(), &kept.join(",")),
                };
                let mut c = case("library-not-loaded", text, (usize::MAX, usize::MAX));
                c.names = Some("biblioth".into());
                out.push(c);
            }
        }

        // --- beamer: a frame with verbatim text that is not fragile.
        if let Some(i) = t.find("[fragile]") {
            out.push(case(
                "frame-not-fragile",
                replaced(t, i, i + 9, ""),
                paragraph(t, i),
            ));
        }

        // --- Mistakes written by hand, put in several places of the document.
        if !matches!(base.name, "tikz" | "beamer") {
            snippets(base, &lines_of_prose, &mut rng, &mut out);
        }
    }
    out
}

/// Mistakes people make, each on one line, to put in a paragraph, in a
/// list, in a note, in a box or in a table. `true`: the line can be the
/// argument of a command.
const SNIPPETS: &[(&str, &str, bool)] = &[
    ("underscore", "Un fichier nommé mon_fichier ici.", true),
    ("exponent", "Une aire de 3 m^2 ici.", true),
    ("ampersand", "Recherche & développement.", true),
    ("hash", "Le numéro #12 ici.", false),
    ("fraction-in-text", "Soit \\frac{1}{2} la moitié.", true),
    ("greek-in-text", "Soit \\alpha un angle.", true),
    ("fraction-one-argument", "Soit $\\frac{1}$ ici.", true),
    ("brace-open", "Un mot \\textbf{gras ici.", false),
    ("brace-close", "Un mot en gras} ici.", false),
    ("windows-path", "Le dossier C:\\Users\\nom\\doc ici.", true),
    ("unknown-command", "Une \\commandeinconnue ici.", true),
    ("command-typo", "Un \\textbff{mot} ici.", true),
    ("unknown-label", "Voir \\ref{sec:inconnue} ici.", true),
    ("rule-one-argument", "Une règle \\rule{2cm} ici.", true),
    ("verb-open", "Le code \\verb|a+b ici.", false),
    ("square-root-open", "Soit $x = \\sqrt{2$ ici.", false),
    ("counter-word", "\\setcounter{page}{abc} Suite.", false),
    ("counter-typo", "\\stepcounter{sectoin} Suite.", false),
    (
        "environment-end-typo",
        "\\begin{center} texte \\end{centre}",
        false,
    ),
    (
        "list-without-item",
        "\\begin{itemize} texte sans puce \\end{itemize}",
        false,
    ),
    ("rule-outside-table", "\\hline", false),
    ("display-one-dollar", "Soit $$ a = b $ ici.", false),
    ("note-open", "Une note\\footnote{sans fin ici.", false),
    (
        "level-that-does-not-exist",
        "\\subsubsubsection{Titre}",
        false,
    ),
    (
        "dollar-in-equation",
        "\\begin{equation} a = b $ c $ \\end{equation}",
        false,
    ),
    ("left-alone", "Soit $\\left( a + b$ ici.", true),
    ("unit-typo", "Un espace \\hspace{2cmm} ici.", true),
    ("existing-command", "\\newcommand{\\alpha}{x} Suite.", false),
    (
        "renew-unknown",
        "\\renewcommand{\\inexistante}{x} Suite.",
        false,
    ),
    (
        "too-many-columns",
        "\\begin{tabular}{ll} a & b & c \\\\ \\end{tabular}",
        false,
    ),
    (
        "table-without-columns",
        "\\begin{tabular} a & b \\\\ \\end{tabular}",
        false,
    ),
    (
        "box-without-width",
        "\\begin{minipage} texte \\end{minipage}",
        false,
    ),
    ("page-style-typo", "\\pagestyle{emtpy} Suite.", false),
    ("numbering-typo", "\\pagenumbering{romain} Suite.", false),
    ("empty-subscript", "Soit $x_$ ici.", true),
    ("accent-in-formula", "Soit $x_{début}$ ici.", true),
    ("double-subscript", "Soit $a_i_j$ ici.", true),
    (
        "item-bracket-open",
        "\\begin{itemize} \\item[a) texte \\end{itemize}",
        false,
    ),
];

/// A place where a line can go: what comes before and after it.
const PLACES: &[(&str, &str, &str, bool)] = &[
    ("paragraph", "", "", false),
    (
        "list",
        "\\begin{itemize}\n  \\item ",
        "\n\\end{itemize}",
        false,
    ),
    ("center", "\\begin{center}\n", "\n\\end{center}", false),
    ("quote", "\\begin{quote}\n", "\n\\end{quote}", false),
    ("bold", "Du texte \\textbf{", "} encore.", true),
    ("note", "Du texte\\footnote{", "} encore.", true),
    (
        "table",
        "\\begin{tabular}{l}\n",
        " \\\\\n\\end{tabular}",
        true,
    ),
    (
        "box",
        "\\begin{minipage}{5cm}\n",
        "\n\\end{minipage}",
        false,
    ),
];

fn snippets(base: &Base, prose: &[(usize, usize)], rng: &mut Rng, out: &mut Vec<Case>) {
    let t = base.text;
    for (name, line, argument) in SNIPPETS {
        for (place, before, after, in_argument) in PLACES {
            if *in_argument && !argument {
                continue;
            }
            // After a line of prose, as a paragraph of its own.
            let (_, end) = prose[rng.below(prose.len())];
            let block = format!("\n\n{before}{line}{after}\n");
            let first = line_of(t, end) + 2;
            let last = first + block.trim().matches('\n').count();
            let kind: &'static str = Box::leak(format!("written:{name}/{place}").into_boxed_str());
            out.push(Case {
                kind,
                base: base.name,
                text: replaced(t, end, end, &block),
                lines: (first, last),
                restore: None,
                names: None,
            });
        }
    }
}

// --------------------------------------------------------------- building

struct Built {
    diagnostics: Vec<Diagnostic>,
    success: bool,
    /// Time RayTeX spent reading the log and looking for causes.
    engine: Duration,
}

/// Compiles like the application does, then adds the live checks.
fn compile(dist: &Distribution, analyzer: &Arc<PackageAnalyzer>, main: &Path) -> Built {
    let dir = main.parent().unwrap();
    let ws = Workspace::open(dir);
    let root = ws.root_for(main);
    let docs = ws.project_documents(&root);
    let facts = DocumentFacts::from_indexes(docs.iter().map(|d| &d.index));
    let settings = BuildSettings {
        show_badboxes: false,
        precompile_preamble: false,
        ..ws.config.effective_build(&BuildSettings::default())
    };
    let plan = build::plan(&root, &settings, Some(dist), &facts, Lang::Fr).expect("plan");
    let cancel = AtomicBool::new(false);
    let source = |p: &Path| std::fs::read_to_string(p).ok();
    let packages = || Some(analyzer.clone());
    let ctx = RunContext {
        dist,
        settings: &settings,
        cancel: &cancel,
        lang: Lang::Fr,
        source: &source,
        packages: Some(&packages),
        background: false,
    };
    let outcome = build::run(&plan, &ctx, &mut |_: BuildEvent| {});
    // The part of RayTeX in that time: the log read again, and the causes
    // looked for again.
    let started = Instant::now();
    if let Ok(bytes) = std::fs::read(&plan.log) {
        let text = String::from_utf8_lossy(&bytes);
        let mut report = log::parse_log(&text, &plan.root_dir, &plan.root, Lang::Fr);
        refine::refine_all(
            &mut report.diagnostics,
            &plan.root,
            &source,
            Some(&packages),
            Lang::Fr,
        );
    }
    let engine = started.elapsed();
    let mut diagnostics = outcome.diagnostics;
    let opts = LintOptions {
        lang: Lang::Fr,
        style_hints: false,
        installed: Some(analyzer.index()),
        ..Default::default()
    };
    let files: Vec<PathBuf> = ws.documents().map(|d| d.path.clone()).collect();
    diagnostics.extend(files.iter().flat_map(|f| lint::lint(&ws, f, &opts)));
    Built {
        diagnostics,
        success: outcome.success,
        engine,
    }
}

fn compile_text(dist: &Distribution, analyzer: &Arc<PackageAnalyzer>, text: &str) -> Built {
    let dir = tempfile::tempdir().unwrap();
    let main = dir.path().join("main.tex");
    std::fs::write(&main, text).unwrap();
    compile(dist, analyzer, &main)
}

// ----------------------------------------------------------------- judging

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Verdict {
    /// The mistake changes nothing TeX or RayTeX reports.
    Silent,
    /// TeX's messages only, where TeX stopped: nothing wrong is said.
    Plain,
    /// The cause is said, at the place of the mistake.
    Explained,
    /// The cause is right, but its fix does not repair the document.
    FixFails,
    /// Something wrong is said.
    Misleading,
}

fn problems(built: &Built) -> impl Iterator<Item = &Diagnostic> {
    built
        .diagnostics
        .iter()
        .filter(|d| d.severity <= Severity::Warning)
}

fn advice(d: &Diagnostic) -> Option<&str> {
    d.hint.as_ref().and_then(|h| h.advice.as_deref())
}

/// Whether a problem says something of its own about the cause.
fn claims(d: &Diagnostic) -> bool {
    advice(d).is_some() || matches!(d.source, Source::Syntax | Source::Lint)
}

fn one_line(d: &Diagnostic) -> String {
    let place = d.range.map_or("-".to_owned(), |r| {
        format!("{}:{}", r.start.line + 1, r.start.character + 1)
    });
    format!(
        "{:?}/{:?} {place} {} ⇒ {}",
        d.severity,
        d.source,
        d.message,
        advice(d).unwrap_or("(no advice)")
    )
}

/// The text after the first automatic fix of `d`, if it has one.
fn fixed(d: &Diagnostic, text: &str) -> Option<String> {
    let fix = d
        .fixes
        .iter()
        .find(|f| fixes::is_automatic(f) && !matches!(f, Fix::Rebuild | Fix::CreateFile { .. }))?;
    let file = d.file.clone()?;
    let read = |_: &Path| Some(text.to_owned());
    let changes = fixes::apply(fix, d, &file, &read).ok()?;
    changes.into_iter().next().map(|(_, t)| t)
}

fn judge(
    dist: &Distribution,
    analyzer: &Arc<PackageAnalyzer>,
    case: &Case,
    built: &Built,
) -> (Verdict, String) {
    if built.success && problems(built).next().is_none() {
        return (Verdict::Silent, String::new());
    }
    let here = |d: &Diagnostic| {
        d.range.is_some_and(|r| {
            (r.start.line as usize) <= case.lines.1 && case.lines.0 <= r.end.line as usize
        })
    };
    let mut verdict = Verdict::Plain;
    let mut why = String::new();
    let mut checked_fix = false;
    for d in problems(built).filter(|d| claims(d)) {
        let text = advice(d).unwrap_or(&d.message);
        let new = fixed(d, &case.text);
        // A misspelled name: what is offered must be the name that was there.
        if let Some((sound, name)) = &case.restore {
            let offered = re(r"Vouliez-vous écrire `([^`]+)`")
                .captures(text)
                .map(|m| m[1].to_owned());
            let wrong_name = offered
                .as_ref()
                .is_some_and(|o| o != name && o.trim_start_matches('\\') != name.as_str());
            let wrong_fix =
                here(d) && new.as_ref().is_some_and(|n| n != *sound) && offered.is_some();
            // Unless what is offered repairs the document another way (the
            // name of a definition was damaged: its uses can take it).
            if wrong_name || wrong_fix {
                // Every use is offered the same name: all of them are taken,
                // from the last one up so that the places stay right.
                let mut uses: Vec<&Diagnostic> = problems(built)
                    .filter(|x| advice(x).is_some_and(|a| Some(a) == advice(d)))
                    .filter(|x| x.range.is_some())
                    .collect();
                uses.sort_by_key(|x| x.range.map(|r| (r.start.line, r.start.character)));
                uses.dedup_by_key(|x| x.range.map(|r| (r.start.line, r.start.character)));
                let all = uses
                    .iter()
                    .rev()
                    .try_fold(case.text.clone(), |text, x| fixed(x, &text));
                let repairs = [new.clone(), all].iter().flatten().any(|n| {
                    !compile_text(dist, analyzer, n)
                        .diagnostics
                        .iter()
                        .any(|x| x.severity == Severity::Error)
                });
                if !repairs {
                    return (
                        Verdict::Misleading,
                        format!("offers another name than `{name}`: {}", one_line(d)),
                    );
                }
                verdict = verdict.max(Verdict::Explained);
                continue;
            }
        }
        let named = case
            .names
            .as_ref()
            .is_some_and(|n| text.contains(n.as_str()) || d.message.contains(n.as_str()));
        // A reference to a label the damaged document does not have any
        // more is rightly said, wherever it is.
        let label_gone = d.code.as_deref() == Some("undefined-reference")
            && re(r"« ([^»]+) »|`([^']+)'")
                .captures(&d.message)
                .is_some_and(|m| {
                    let name = m.get(1).or(m.get(2)).unwrap().as_str().trim();
                    // A label behind a `%` is in a comment.
                    !case.text.lines().any(|l| {
                        let code = l.split_once('%').map_or(l, |(code, _)| code);
                        code.contains(&format!("\\label{{{name}}}"))
                    })
                });
        if label_gone {
            continue;
        }
        if here(d) || named {
            if matches!(d.source, Source::Latex | Source::Bibtex | Source::Biber) {
                verdict = verdict.max(Verdict::Explained);
            }
            // Its fix must leave a document that compiles.
            if let Some(new) = new.filter(|_| !checked_fix && case.restore.is_none()) {
                checked_fix = true;
                let after = compile_text(dist, analyzer, &new);
                let errors: Vec<&Diagnostic> = after
                    .diagnostics
                    .iter()
                    .filter(|x| x.severity == Severity::Error)
                    .collect();
                if !errors.is_empty() && verdict < Verdict::FixFails {
                    verdict = Verdict::FixFails;
                    let title = d
                        .fixes
                        .iter()
                        .find(|f| fixes::is_automatic(f))
                        .map(|f| fixes::title(f, Lang::Fr))
                        .unwrap_or_default();
                    why = format!(
                        "after « {title} » of [{}]: {}",
                        one_line(d),
                        one_line(errors[0])
                    );
                }
            }
            continue;
        }
        // Said elsewhere: right only if its fix repairs the document.
        let repaired = new.is_some_and(|new| {
            let after = compile_text(dist, analyzer, &new);
            !after
                .diagnostics
                .iter()
                .any(|x| x.severity == Severity::Error)
        });
        if repaired {
            verdict = verdict.max(Verdict::Explained);
            continue;
        }
        return (
            Verdict::Misleading,
            format!("a cause is said away from the mistake: {}", one_line(d)),
        );
    }
    (verdict, why)
}

// ------------------------------------------------------------------- tests

fn distribution() -> Distribution {
    raytex_core::tex::detect(&[])
        .into_iter()
        .next()
        .expect("no TeX distribution")
}

/// The sound documents compile without a problem: what a damaged one
/// reports comes from its mistake.
#[test]
#[ignore = "depends on the local TeX installation"]
fn bases_are_sound() {
    let dist = distribution();
    let analyzer = Arc::new(PackageAnalyzer::new(Arc::new(TexmfIndex::build(&dist))));
    for base in BASES {
        let built = compile_text(&dist, &analyzer, base.text);
        let found: Vec<String> = problems(&built).map(one_line).collect();
        assert!(
            built.success && found.is_empty(),
            "{}: {found:#?}",
            base.name
        );
    }
}

#[test]
#[ignore = "depends on the local TeX installation"]
fn mistakes_made_by_machine_are_not_explained_wrongly() {
    let dist = distribution();
    let analyzer = Arc::new(PackageAnalyzer::new(Arc::new(TexmfIndex::build(&dist))));
    let mut cases = corpus();
    let total = cases.len();
    if let Ok(kind) = std::env::var("LBT_KIND") {
        cases.retain(|c| c.kind.contains(&kind) || c.base == kind);
    }
    let wanted = std::env::var("LBT_MUTATIONS").unwrap_or_else(|_| "600".into());
    if let Ok(n) = wanted.parse::<usize>()
        && n < cases.len()
    {
        // Spread over the whole corpus, the same ones each time.
        let step = cases.len() as f64 / n as f64;
        cases = (0..n)
            .map(|i| cases[(i as f64 * step) as usize].clone())
            .collect();
    }
    println!("{} damaged documents out of {total}", cases.len());

    let sample = std::env::var("LBT_SAMPLE")
        .ok()
        .and_then(|n| n.parse::<usize>().ok())
        .filter(|n| *n > 0);
    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<(usize, Verdict, String, Duration)>> = Mutex::new(Vec::new());
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get());
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    let Some(case) = cases.get(i) else { break };
                    let built = compile_text(&dist, &analyzer, &case.text);
                    let (verdict, why) = judge(&dist, &analyzer, case, &built);
                    let said: Vec<String> = problems(&built).map(one_line).collect();
                    // Those that are not right, and one in `LBT_SAMPLE` of
                    // the others, to be read by a person.
                    let sampled =
                        sample.is_some_and(|n| i.is_multiple_of(n)) && verdict >= Verdict::Plain;
                    let detail = if verdict >= Verdict::FixFails || sampled {
                        format!("{why}\n    {}", said.join("\n    "))
                    } else {
                        String::new()
                    };
                    results
                        .lock()
                        .unwrap()
                        .push((i, verdict, detail, built.engine));
                }
            });
        }
    });
    let mut results = results.into_inner().unwrap();
    results.sort_by_key(|r| r.0);

    // By kind of mistake (the place of a written mistake is not a kind).
    let mut table: BTreeMap<&str, [usize; 5]> = BTreeMap::new();
    let mut report = String::new();
    for (i, verdict, detail, _) in &results {
        let case = &cases[*i];
        let kind = case.kind.split('/').next().unwrap();
        table.entry(kind).or_default()[*verdict as usize] += 1;
        if !detail.is_empty() {
            let (first, last) = case.lines;
            let shown: Vec<&str> = case
                .text
                .split('\n')
                .skip(first.min(usize::MAX - 1))
                .take(last.saturating_sub(first).min(6) + 1)
                .collect();
            report.push_str(&format!(
                "\n{verdict:?} — {} in {} (lines {}–{})\n  {}\n  {detail}\n",
                case.kind,
                case.base,
                first.wrapping_add(1),
                last.wrapping_add(1),
                shown.join("\n  ")
            ));
        }
    }
    println!(
        "\n{:<38} {:>6} {:>6} {:>9} {:>9} {:>10}",
        "kind", "silent", "plain", "explained", "fix fails", "misleading"
    );
    let mut sum = [0usize; 5];
    for (kind, counts) in &table {
        println!(
            "{kind:<38} {:>6} {:>6} {:>9} {:>9} {:>10}",
            counts[0], counts[1], counts[2], counts[3], counts[4]
        );
        for (total, n) in sum.iter_mut().zip(counts) {
            *total += n;
        }
    }
    let reported = sum[1] + sum[2] + sum[3] + sum[4];
    let share = |n: usize| 100.0 * n as f64 / reported.max(1) as f64;
    println!(
        "{:<38} {:>6} {:>6} {:>9} {:>9} {:>10}",
        "total", sum[0], sum[1], sum[2], sum[3], sum[4]
    );
    println!(
        "\n{reported} documents report a problem: {:.1} % explained at the place of the mistake, {:.1} % with the message of TeX alone, {:.2} % with a fix that does not repair, {:.2} % misleading.",
        share(sum[2]),
        share(sum[1]),
        share(sum[3]),
        share(sum[4])
    );
    let mut times: Vec<Duration> = results.iter().map(|r| r.3).collect();
    times.sort();
    if !times.is_empty() {
        println!(
            "Time RayTeX takes to read a log and look for the causes: median {:?}, 95 % under {:?}, longest {:?}.",
            times[times.len() / 2],
            times[times.len() * 95 / 100],
            times[times.len() - 1]
        );
    }
    if let Ok(path) = std::env::var("LBT_REPORT") {
        std::fs::write(path, &report).unwrap();
    } else if !report.is_empty() {
        println!("{report}");
    }
    // The search for a cause never fails on a fault of its own.
    let faults = refine::FAULTS.load(Ordering::Relaxed);
    assert_eq!(faults, 0, "the search for a cause failed {faults} time(s)");
    let misleading = sum[4] as f64 / reported.max(1) as f64;
    assert!(
        misleading <= MISLEADING_MAX,
        "{:.2} % of the damaged documents get a wrong indication (at most {:.1} %)",
        100.0 * misleading,
        100.0 * MISLEADING_MAX
    );
}
