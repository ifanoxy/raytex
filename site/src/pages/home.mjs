import { bezier, construction, heatPlot, introDrawing, pageLayout, ray } from "../figures.mjs";
import { ctaEnd, latex } from "../util.mjs";

export default {
  id: "home",
  path: "",
  title: { en: "Home", fr: "Accueil" },
  description: {
    en: "RayTeX is the next-generation LaTeX IDE: open source and free, for Windows, macOS and Linux. Live preview, completion that knows every package, and every error explained with its fix.",
    fr: "RayTeX est l'IDE LaTeX nouvelle génération : open source et gratuit, pour Windows, macOS et Linux. Aperçu en direct, complétion qui connaît chaque package, et chaque erreur expliquée avec sa correction.",
  },
  /** The opening of the site (site.js): the source of this page written at
   *  full speed on a sheet as high as the screen, which scrolls as it goes;
   *  then the ray drawn with compass and curves, inked, the title typeset;
   *  then this page arrives like a book. Once per visit, from the title page. */
  intro({ T, lang }) {
    const source = T(
      String.raw`% raytex.tex: the title page of RayTeX
\documentclass[11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern, amsmath, amssymb, amsthm}
\usepackage{tikz, booktabs, hyperref}
\usetikzlibrary{calc, positioning}

\title{Ray\TeX}
\author{Open source, free, for Windows, macOS and Linux}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
  RayTeX compiles as you type, completes the commands of every
  package you load, draws your figures, fills your tables, and
  \emph{explains each error in plain words}.
\end{abstract}

\tableofcontents

\section{Introduction}\label{sec:intro}
LaTeX makes the most beautiful documents there are: theses,
articles, courses, slides. It also has a reputation for being
hard\footnote{A well-deserved reputation.}.
\begin{equation}
  \text{LaTeX} + \text{RayTeX} = \text{LaTeX} - \text{the pain}
\end{equation}

\section{Errors that finally make sense}\label{sec:errors}
\begin{theorem}[explained errors]
  Every LaTeX error has an explanation in plain words.
\end{theorem}
\begin{proof}
  \verb|\textbff| becomes \verb|\textbf|: one click.
\end{proof}
\begin{itemize}
  \item misspelt commands, environments, labels and keys;
  \item missing packages, installed with the right tool;
  \item and \textbf{Fix all}, for the whole document at once.
\end{itemize}

\section{Write, and see the PDF}\label{sec:live}
\[ \Delta t_{\text{build}} \approx 1{,}5\ \mathrm{s} \]

\section{Drawings, tables and matrices}\label{sec:draw}
\begin{tikzpicture}
  \draw (0,0) -- (4,-0.3) -- (2,2.4) -- cycle;
  \draw[violet] (2.03,0.55) circle (2.04);
\end{tikzpicture}
\[ \frac{\partial u}{\partial t} = \alpha\,\Delta u \]

\section{The page, without its preamble}\label{sec:page}
Margins, headers, footers and a watermark, set with fields.

\section{Everywhere, with your LaTeX}\label{sec:everywhere}
\begin{description}
  \item[Windows, macOS, Linux] a light native application;
  \item[Any TeX distribution] TeX Live, MiKTeX, MacTeX, Tectonic.
\end{description}

\section{Free and open}\label{sec:free}
\[ B(t) = \sum_{k=0}^{3} \binom{3}{k}\, t^k (1-t)^{3-k} P_k \]

\begin{thebibliography}{9}
  \bibitem{knuth} D. E. Knuth, \emph{The \TeX book}, 1984.
  \bibitem{lamport} L. Lamport, \emph{\LaTeX}, 1986.
\end{thebibliography}
\end{document}`,
      String.raw`% raytex.tex : la page de titre de RayTeX
\documentclass[11pt]{article}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage{lmodern, amsmath, amssymb, amsthm}
\usepackage{tikz, booktabs, hyperref}

\title{Ray\TeX}
\author{Open source, gratuit, pour Windows, macOS et Linux}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
  RayTeX compile pendant que vous écrivez, complète les commandes
  de chaque package chargé, dessine vos figures, remplit vos
  tableaux, et \emph{explique chaque erreur avec des mots simples}.
\end{abstract}

\tableofcontents

\section{Introduction}\label{sec:intro}
LaTeX fait les plus beaux documents qui soient : thèses, articles,
cours, diaporamas. Il a aussi la réputation d'être
difficile\footnote{Réputation méritée.}.
\begin{equation}
  \text{LaTeX} + \text{RayTeX} = \text{LaTeX} - \text{la douleur}
\end{equation}

\section{Des erreurs enfin compréhensibles}\label{sec:erreurs}
\begin{theorem}[erreurs expliquées]
  Toute erreur de LaTeX admet une explication en mots simples.
\end{theorem}
\begin{proof}
  \verb|\textbff| devient \verb|\textbf| : un clic.
\end{proof}
\begin{itemize}
  \item commandes, environnements, labels et clés mal orthographiés ;
  \item packages manquants, installés avec le bon outil ;
  \item et \textbf{Tout corriger}, pour tout le document d'un coup.
\end{itemize}

\section{Écrire, et voir le PDF}\label{sec:direct}
\[ \Delta t_{\text{compilation}} \approx 1{,}5\ \mathrm{s} \]

\section{Dessins, tableaux et matrices}\label{sec:dessins}
\begin{tikzpicture}
  \draw (0,0) -- (4,-0.3) -- (2,2.4) -- cycle;
  \draw[violet] (2.03,0.55) circle (2.04);
\end{tikzpicture}
\[ \frac{\partial u}{\partial t} = \alpha\,\Delta u \]

\section{La page, sans son préambule}\label{sec:page}
Marges, en-têtes, pieds de page et filigrane, réglés par des champs.

\section{Partout, avec votre LaTeX}\label{sec:partout}
\begin{description}
  \item[Windows, macOS, Linux] une application native et légère ;
  \item[Toute distribution TeX] TeX Live, MiKTeX, MacTeX, Tectonic.
\end{description}

\section{Libre et ouvert}\label{sec:libre}
\[ B(t) = \sum_{k=0}^{3} \binom{3}{k}\, t^k (1-t)^{3-k} P_k \]

\begin{thebibliography}{9}
  \bibitem{knuth} D. E. Knuth, \emph{The \TeX book}, 1984.
  \bibitem{lamport} L. Lamport, \emph{\LaTeX}, 1986.
\end{thebibliography}
\end{document}`,
    ).split("\n");
    const letters = (word, cls = "") => [...word].map((c) => `<span class="il ${cls}">${c}</span>`).join("");
    return `<div class="intro" data-intro aria-hidden="true">
  <div class="intro-code">
    <p class="intro-file"><span>raytex.tex</span><span class="intro-status" data-intro-status>${T("✓ compiled · 0 errors · 1 page", "✓ compilé · 0 erreur · 1 page")}</span></p>
    <pre data-intro-pre><code>${source.map((l) => `<span class="row" hidden><span class="ln"></span><span class="tl" data-n="${l.length}">${latex(l) || " "}</span></span>`).join("")}</code></pre>
  </div>
  <div class="intro-page">
    ${introDrawing(lang)}
    <p class="intro-title">${letters("Ray")}<span class="intro-tex">${letters("T")}${letters("E", "tex-e")}${letters("X")}</span></p>
    <p class="intro-sub">${T("The next-generation LaTeX IDE", "L'IDE LaTeX nouvelle génération")}</p>
    <span class="stamp stamp-red intro-stamp" style="--tilt: -10deg">Open source</span>
  </div>
  <button type="button" class="intro-skip" data-intro-skip tabindex="-1">${T("Skip", "Passer")} <span aria-hidden="true">▸▸</span></button>
</div>`;
  },

  body(ctx) {
    const { T, url, asset, icon, lang, GITHUB, tex } = ctx;
    // The picture of the application in the theme of the page (light or dark).
    const shot = (name, alt) =>
      ["light", "dark"].map((t) => `<img class="shot shot-${t}" src="${asset(`screenshots/${lang}/${name}-${t}.png`)}" width="1400" height="813" alt="${alt}" loading="lazy" />`).join("");
    const painNote = T("A well-deserved reputation: “Undefined control sequence” does not say much.", "Réputation méritée : « Undefined control sequence » ne dit pas grand-chose.");
    const surprise = T(
      "No ray was harmed in the typesetting of this site. This document also hides a few surprises: try typing \\TeX.",
      "Aucune raie n'a été maltraitée pendant la composition de ce site. Ce document cache aussi quelques surprises : essayez de taper \\TeX.",
    );

    // Counted once (T evaluates both languages).
    const fnPain = tex.footnote(painNote);
    const fnSurprise = () => tex.footnote(surprise);

    return `
<header class="titlepage">
  <button type="button" class="ray-hero" data-ray aria-label="${T("The ray of RayTeX", "La raie de RayTeX")}">${ray()}</button>
  <div class="title-line"><h1 class="doc-title" data-reveal>Ray<span class="texlogo">T<span>e</span>X</span></h1>${tex.stamp(T("Open source", "Open source"), { tilt: -11, cls: "stamp-title" })}</div>
  <p class="doc-subtitle" data-reveal>${T(`The ${tex.hl("next-generation", "violet")} LaTeX IDE`, `L'IDE LaTeX ${tex.hl("nouvelle génération", "violet")}`)}${tex.star()}</p>
  <p class="doc-author" data-reveal>${T("Open source, free, for Windows, macOS and Linux", "Open source, gratuit, pour Windows, macOS et Linux")}</p>
  <p class="doc-date" data-reveal><span data-today title="\\today">${T("October 2026", "octobre 2026")}</span></p>

  <div class="abstract" data-reveal>
    <p class="abstract-title">${T("Abstract", "Résumé")}</p>
    <p>${T(
      `RayTeX compiles as you type, completes the commands of every package you load, draws your figures, fills your tables, and ${tex.hl("explains each error in plain words")}, with its fix one click away. It keeps all the power of LaTeX and takes away what made it painful.`,
      `RayTeX compile pendant que vous écrivez, complète les commandes de chaque package chargé, dessine vos figures, remplit vos tableaux, et ${tex.hl("explique chaque erreur avec des mots simples")}, sa correction à un clic. Il garde toute la puissance de LaTeX et retire ce qui le rendait pénible.`,
    )}</p>
  </div>

  <div class="cta" data-reveal>
    <span class="cta-button"><a class="fbox-link big solid" href="${url("download/")}" data-download-primary>${icon("download", 18)}<span data-download-label>${T("Download RayTeX", "Télécharger RayTeX")}</span></a>${tex.note(T("free, forever", "gratuit, pour toujours"), { arrow: "left", tilt: -4, color: "green" })}</span>
    <p class="cta-meta"><span data-download-meta>${T("MIT or Apache 2.0 · no account · no telemetry", "MIT ou Apache 2.0 · sans compte · sans télémétrie")}</span> · <a href="${url("download/")}">${T("other systems", "autres systèmes")}</a> · <a href="${GITHUB}">GitHub</a></p>
  </div>
</header>

${tex.toc([
  ["1", T("Introduction", "Introduction"), "#intro", "1"],
  ["2", T("Errors that finally make sense", "Des erreurs enfin compréhensibles"), "#erreurs", "1"],
  ["3", T("Write, and see the PDF", "Écrire, et voir le PDF"), "#direct", "1"],
  ["4", T("Drawings, tables and matrices", "Dessins, tableaux et matrices"), "#dessins", "1"],
  ["5", T("The page, without its preamble", "La page, sans son préambule"), "#page", "1"],
  ["6", T("Everywhere, with your LaTeX", "Partout, avec votre LaTeX"), "#partout", "1"],
  ["7", T("Free and open", "Libre et ouvert"), "#libre", "1"],
  ["A", T("Every feature", "Toutes les fonctionnalités"), url("features/"), "2"],
  ["B", T("Installation", "Installation"), url("download/"), "3"],
  ["C", T("Every version", "Toutes les versions"), url("releases/"), "4"],
  ["D", T("Getting started", "Prise en main"), url("guide/"), "5"],
  ["E", T("Frequently asked questions", "Questions fréquentes"), url("faq/"), "6"],
])}

<section class="doc-section">
${tex.section(T("Introduction", "Introduction"), "intro")}
${tex.note(T("proved in section 2", "démontré en section 2"), { arrow: "left", tilt: 3 })}
<p data-reveal>${T(
  `LaTeX makes the most beautiful documents there are: theses, articles, courses, slides. It also has a ${tex.squiggle("reputation for being hard")}${fnPain}: cryptic error messages, builds to run again, packages to install by hand, figures to describe in code.`,
  `LaTeX fait les plus beaux documents qui soient : thèses, articles, cours, diaporamas. Il a aussi la ${tex.squiggle("réputation d'être difficile")}${fnPain} : messages d'erreur cryptiques, compilations à relancer, packages à installer à la main, figures à décrire en code.`,
)}</p>
<p data-reveal>${T("RayTeX is a LaTeX editor built to remove that difficulty without hiding LaTeX:", "RayTeX est un éditeur LaTeX conçu pour retirer cette difficulté sans cacher LaTeX :")}</p>
${tex.eq(String.raw`\text{LaTeX} + \htmlClass{tx-violet}{\text{RayTeX}} \;=\; \text{LaTeX} - \htmlClass{strike}{\text{${T("the pain", "la douleur")}}}`)}
<p data-reveal>${T(
  `Everything stays standard LaTeX (your files open anywhere), but writing becomes ${tex.underline("immediate", "violet", true)}: the PDF follows what you type, the errors explain themselves, the figures draw themselves.`,
  `Tout reste du LaTeX standard (vos fichiers s'ouvrent partout), mais l'écriture devient ${tex.underline("immédiate", "violet", true)} : le PDF suit ce que vous tapez, les erreurs s'expliquent, les figures se dessinent.`,
)}</p>
</section>

<section class="doc-section">
${tex.section(T("Errors that finally make sense", "Des erreurs enfin compréhensibles"), "erreurs")}
${tex.theorem(
  T("Theorem", "Théorème"),
  T("explained errors", "erreurs expliquées"),
  T(`Every LaTeX error has an explanation in plain words, and the common ones ${tex.hl("a fix in one click", "green")}.`, `Toute erreur de LaTeX admet une explication en mots simples, et les plus courantes ${tex.hl("une correction en un clic", "green")}.`),
  T(
    `Take the message LaTeX gives for a typing slip. ${tex.listing("! Undefined control sequence.\nl.7 Du texte en \\textbff{gras}")} RayTeX reads the log, finds the misspelt command and offers ${tex.fix("\\textbff", "\\textbf")}: one click, or <kbd>Alt</kbd>+<kbd>Enter</kbd>. It does not stop at a list of messages: whatever TeX says, the cause is looked for in your document, from what each command of each package you load expects, and the problem is put on the word to change.`,
    `Prenons le message que LaTeX donne pour une faute de frappe. ${tex.listing("! Undefined control sequence.\nl.7 Du texte en \\textbff{gras}")} RayTeX lit le journal, trouve la commande mal orthographiée et propose ${tex.fix("\\textbff", "\\textbf")} : un clic, ou <kbd>Alt</kbd>+<kbd>Entrée</kbd>. Il ne s'arrête pas à une liste de messages : quoi que dise TeX, la cause est cherchée dans votre document, d'après ce qu'attend chaque commande de chaque package chargé, et le problème est posé sur le mot à changer.`,
  ),
)}
${tex.note(T("click the little square ;)", "cliquez sur le petit carré ;)"), { arrow: "corner", tilt: -3 })}
${tex.checklist([
  T("misspelt commands, environments, labels and citation keys;", "commandes, environnements, labels et clés de citation mal orthographiés ;"),
  T("missing packages added, or installed with the right tool;", "packages manquants ajoutés, ou installés avec le bon outil ;"),
  T("unclosed braces, formulas and environments;", "accolades, formules et environnements non fermés ;"),
  T(`and ${tex.boxed("<b>Fix all</b>")}, for the whole document at once.`, `et ${tex.boxed("<b>Tout corriger</b>")}, pour tout le document d'un coup.`),
])}
${tex.figure(shot("problems", T("Problems explained, with their fixes", "Les problèmes expliqués, avec leurs corrections")), T("The <i>Problems</i> panel: each error explained, its fix one click away.", "Le panneau <i>Problèmes</i> : chaque erreur expliquée, sa correction à un clic."))}
</section>

<section class="doc-section">
${tex.section(T("Write, and see the PDF", "Écrire, et voir le PDF"), "direct")}
<p data-reveal>${T(
  "No more “compile, wait, look for your page”: the document is compiled after each pause in typing, and the PDF stays where you are. A double-click in the PDF takes you to the line that wrote it. In practice,",
  "Fini « compiler, attendre, chercher sa page » : le document est compilé à chaque pause dans la frappe, et le PDF reste où vous êtes. Un double-clic dans le PDF vous emmène à la ligne qui l'a écrit. En pratique,",
)}</p>
${tex.note(T("without clicking anything!", "sans rien cliquer !"), { arrow: "left", tilt: -2, color: "red" })}
${tex.eq(String.raw`\htmlClass{hbox}{\Delta t_{\text{${T("build", "compilation")}}} \approx 1{,}5\ \mathrm{s}}`)}
${tex.figure(shot("editor", T("The editor, the live PDF and the @ shortcuts panel", "L'éditeur, le PDF en direct et le panneau des raccourcis @")), T("The source on the left, the PDF that follows it on the right.", "La source à gauche, le PDF qui la suit à droite."))}
${tex.subsection(T("Completion that knows your packages", "Une complétion qui connaît vos packages"))}
<p data-reveal>${T(
  `RayTeX reads the source of every package your document loads: their commands, their environments and ${tex.circled("about 520", "green")} documented option keys come up as you type. In a formula, <code>@a</code> gives ${tex.math("\\alpha")} and <code>@/</code> a fraction.`,
  `RayTeX lit la source de chaque package que charge votre document : leurs commandes, leurs environnements et ${tex.circled("environ 520", "green")} clés d'options documentées apparaissent pendant la frappe. Dans une formule, <code>@a</code> donne ${tex.math("\\alpha")} et <code>@/</code> une fraction.`,
)}</p>
${tex.subsection(T("Shortcuts and commands of your own", "Vos raccourcis, vos commandes"))}
<p data-reveal>${T(
  `A few letters then <kbd>Tab</kbd> write a whole block: <code>fig</code> a figure, <code>eq</code> an equation, <code>doc</code> the minimal document. The <code>@</code> shortcuts can be yours: a key (<code>@v</code>) and what it writes (<code>\\vec{}</code>). And the commands your project defines have their own panel, with ${tex.underline("what each one writes and where it is used", "violet")}; a studio makes a new one from its name, its arguments and its definition, says what would keep it from working, and tries it before it is added to the preamble.`,
  `Quelques lettres puis <kbd>Tab</kbd> écrivent un bloc entier : <code>fig</code> une figure, <code>eq</code> une équation, <code>doc</code> le document minimal. Les raccourcis <code>@</code> peuvent être les vôtres : une touche (<code>@v</code>) et ce qu'elle écrit (<code>\\vec{}</code>). Et les commandes que définit votre projet ont leur panneau, avec ${tex.underline("ce que chacune écrit et où elle sert", "violet")} ; un studio en crée une à partir de son nom, de ses arguments et de sa définition, dit ce qui l'empêcherait de marcher, et l'essaie avant de l'ajouter au préambule.`,
)}</p>
</section>

<section class="doc-section">
${tex.section(T("Drawings, tables and matrices", "Dessins, tableaux et matrices"), "dessins")}
${tex.subsection(T("Geometry with the mouse", "La géométrie à la souris"))}
<p data-reveal>${T(
  `In the TikZ studio, you draw on a grid and ${tex.hl("the code writes itself", "pink")}; edit the code, and the drawing follows. Shapes are selected with a rectangle, resized together, copied with <kbd>Alt</kbd> and a drag; the ones you draw often are kept as <b>sets</b>, drawn again with one click in any picture of any project. Twenty-two drawings are ready to start from: plots, trees, circuits, automata, graphs.`,
  `Dans le studio TikZ, vous dessinez sur une grille et ${tex.hl("le code s'écrit tout seul", "pink")} ; modifiez le code, le dessin suit. Les formes se sélectionnent au rectangle, se redimensionnent ensemble, se copient avec <kbd>Alt</kbd> et un glisser ; celles que vous dessinez souvent se gardent en <b>ensembles</b>, redessinés d'un clic dans n'importe quel schéma de n'importe quel projet. Vingt-deux dessins sont prêts pour démarrer : courbes, arbres, circuits, automates, graphes.`,
)}</p>
${tex.figure(construction(lang), T("The circumscribed circle of a triangle: the perpendicular bisectors meet at its centre <i>O</i>.", "Le cercle circonscrit à un triangle : les médiatrices se coupent en son centre <i>O</i>."), "figure-tikz")}
${tex.listing("\\begin{tikzpicture}\n  \\draw (0,0) -- (4,-0.3) -- (2,2.4) -- cycle;\n  \\draw[violet] (2.03,0.55) circle (2.04);\n\\end{tikzpicture}", T("What the studio writes", "Ce que le studio écrit"))}
${tex.subsection(T("Tables and matrices, cell by cell", "Tableaux et matrices, case par case"))}
<p data-reveal>${T(
  "Tables and matrices are filled cell by cell (<kbd>Enter</kbd> goes to the next), pasted from a spreadsheet, with LaTeX in the cells. Here is, as a matrix, what works where:",
  "Tableaux et matrices se remplissent case par case (<kbd>Entrée</kbd> passe à la suivante), se collent depuis un tableur, avec du LaTeX dans les cases. Voici, sous forme de matrice, ce qui marche où :",
)}</p>
${tex.note(T("full rank: everything works everywhere ✓", "rang maximal : tout marche partout ✓"), { arrow: "left", tilt: -3, color: "green" })}
${tex.eq(String.raw`\begin{array}{l|ccc} & \textsf{Windows} & \textsf{macOS} & \textsf{Linux} \\ \hline \text{${T("Live build", "Compilation en direct")}} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} \\ \text{${T("Errors explained", "Erreurs expliquées")}} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} \\ \text{${T("TikZ studio", "Studio TikZ")}} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} \\ \text{${T("Any TeX distribution", "Toute distribution TeX")}} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} & \htmlClass{tx-green}{\checkmark} \end{array}`)}
${tex.subsection(T("Plots, as in pgfplots", "Des courbes, comme avec pgfplots"))}
<p data-reveal>${T("The heat equation, which the example project of RayTeX studies,", "L'équation de la chaleur, qu'étudie le projet d'exemple de RayTeX,")}</p>
${tex.eq(String.raw`\frac{\partial u}{\partial t} = \alpha\,\Delta u, \qquad u(x,t) = \frac{1}{\sqrt{4\pi\alpha t}}\, e^{-x^2/(4\alpha t)}`)}
${tex.figure(heatPlot(lang), T("The temperature spreads with time: the solution at three instants.", "La température s'étale avec le temps : la solution à trois instants."), "figure-tikz")}
</section>

<section class="doc-section">
${tex.section(T("The page, without its preamble", "La page, sans son préambule"), "page")}
${tex.note(T("geometry and fancyhdr, without their manuals", "geometry et fancyhdr, sans leurs manuels"), { arrow: "left", tilt: -3 })}
<p data-reveal>${T(
  `Margins, headers and footers are where a preamble grows long. In RayTeX they are ${tex.hl("set with fields", "violet")} and seen on real pages, compiled with the class and the preamble of your project, before anything is written in the document.`,
  `Les marges, les en-têtes et les pieds de page sont l'endroit où un préambule s'allonge. Dans RayTeX ils se ${tex.hl("règlent par des champs", "violet")} et se voient sur de vraies pages, compilées avec la classe et le préambule de votre projet, avant que rien ne soit écrit dans le document.`,
)}</p>
${tex.figure(pageLayout(lang), T("A page as the window sets it: its margins, a header, a footer and a watermark.", "Une page telle que la fenêtre la règle : ses marges, un en-tête, un pied de page et un filigrane."), "figure-tikz")}
<dl class="description" data-reveal>
  <dt>${T("Margins", "Les marges")}</dt>
  <dd>${T("Ready-made margins or your own, the paper, the orientation, two-sided pages, the binding; what your preamble already says is read and shown. For the whole document, or from the cursor on.", "Des marges toutes faites ou les vôtres, le papier, l'orientation, le recto verso, la reliure ; ce que dit déjà votre préambule est lu et affiché. Pour tout le document, ou à partir du curseur.")}</dd>
  <dt>${T("Page styles", "Les styles de page")}</dt>
  <dd>${T("A header and a footer in three fields each: page number, “page 2 / 9”, title of the chapter, date, a logo. A watermark across the page, a text or an image.", "Un en-tête et un pied de page en trois champs chacun : numéro de page, « page 2 / 9 », titre du chapitre, date, un logo. Un filigrane en travers de la page, un texte ou une image.")}</dd>
  <dt>${T("On the pages you want", "Sur les pages que vous voulez")}</dt>
  <dd>${T("The whole document, the title and chapter pages, from the cursor on, one page, or pages by their numbers; the packages a style needs are loaded with it.", "Tout le document, les pages de titre et de chapitre, à partir du curseur, une seule page, ou des pages par leurs numéros ; les packages dont un style a besoin sont chargés avec lui.")}</dd>
</dl>
</section>

<section class="doc-section">
${tex.section(T("Everywhere, with your LaTeX", "Partout, avec votre LaTeX"), "partout")}
${tex.sticky(T("…and in French or English!", "…et en français ou en anglais !"), { tilt: 3 })}
<dl class="description" data-reveal>
  <dt>${icon("windows", 16)} Windows, ${icon("apple", 16)} macOS, ${icon("linux", 16)} Linux</dt>
  <dd>${T("A light native application (written in Rust), the same everywhere.", "Une application native et légère (écrite en Rust), la même partout.")}</dd>
  <dt>${T("Any TeX distribution", "Toute distribution TeX")}</dt>
  <dd>${T("TeX Live, MiKTeX, MacTeX, TinyTeX or Tectonic: detected, or installed with a guide that shows each command first. Missing packages are installed with the right tool.", "TeX Live, MiKTeX, MacTeX, TinyTeX ou Tectonic : détectée, ou installée avec un guide qui montre d'abord chaque commande. Les packages manquants s'installent avec le bon outil.")}</dd>
  <dt>${T("Your documents stay yours", "Vos documents restent à vous")}</dt>
  <dd>${T(`Offline, no account, no telemetry: ${tex.underline("nothing leaves your computer", "green")}.`, `Hors ligne, sans compte, sans télémétrie : ${tex.underline("rien ne quitte votre ordinateur", "green")}.`)}</dd>
</dl>
</section>

<section class="doc-section">
${tex.section(T("Free and open", "Libre et ouvert"), "libre")}
<p data-reveal>${T(
  `Every line of RayTeX is public, under the MIT or Apache 2.0 license: ${tex.hl("read it, change it, share it")}. The logo itself is made of curves, ${tex.circled("Bézier", "red")} curves, like the wings of a ray:`,
  `Chaque ligne de RayTeX est publique, sous licence MIT ou Apache 2.0 : ${tex.hl("lisez-la, modifiez-la, partagez-la")}. Le logo lui-même est fait de courbes, des courbes de ${tex.circled("Bézier", "red")}, comme les ailes d'une raie :`,
)}</p>
${tex.eq(String.raw`B(t) = \sum_{k=0}^{3} \binom{3}{k}\, t^k (1-t)^{3-k}\, \htmlClass{tx-violet}{P_k}, \qquad t \in [0,1]`)}
${tex.figure(bezier(lang), T("A cubic Bézier curve and its four control points.", "Une courbe de Bézier cubique et ses quatre points de contrôle."), "figure-tikz")}
${tex.sectionStar(T("References", "Références"), "refs")}
<ol class="bibliography" data-reveal>
  <li><span class="bib-key">[1]</span> <i>RayTeX</i>, ${T("source code", "code source")}. <a href="${GITHUB}">github.com/ifanoxy/raytex</a>.</li>
  <li><span class="bib-key">[2]</span> D. E. Knuth, <i>The TeXbook</i>. Addison-Wesley, 1984.</li>
  <li><span class="bib-key">[3]</span> L. Lamport, <i>LaTeX: A Document Preparation System</i>. Addison-Wesley, 1986.</li>
  <li><span class="bib-key">[4]</span> ${T("Built with", "Construit avec")} Tauri, Svelte, CodeMirror, pdf.js ${T("and", "et")} KaTeX.</li>
</ol>
<p data-reveal>${T(`Want to take part? See <a href="${url("about/")}">About and contributing</a>.`, `Envie de participer ? Voir <a href="${url("about/")}">À propos et contribuer</a>.`)}</p>
</section>

<section class="doc-section conclusion">
${tex.sectionStar(T("Conclusion", "Conclusion"), "conclusion")}
<p data-reveal>${((fn) => T(
  `Download RayTeX, open a template, and see your first PDF in seconds${fn}.`,
  `Téléchargez RayTeX, ouvrez un modèle, et voyez votre premier PDF en quelques secondes${fn}.`,
))(fnSurprise())}</p>
</section>
${ctaEnd(ctx, T("your turn!", "à vous de jouer !"))}`;
  },
};
