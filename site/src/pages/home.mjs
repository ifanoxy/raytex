import { heading, latex } from "../util.mjs";

/** The editor of the hero: a document is typed, an error appears, is explained and fixed. */
function demo({ T, icon }) {
  const doc = T(
    [
      "\\documentclass{article}",
      "\\usepackage{amsmath}",
      "\\begin{document}",
      "\\section{Introduction}",
      "Let $f(x) = \\frac{1}{x}$ be",
      "an \\textbff{important} map.",
      "\\end{document}",
    ],
    [
      "\\documentclass{article}",
      "\\usepackage[french]{babel}",
      "\\begin{document}",
      "\\section{Introduction}",
      "Soit $f(x) = \\frac{1}{x}$,",
      "une fonction \\textbff{clé}.",
      "\\end{document}",
    ],
  );
  const lines = doc
    .map((line, i) => {
      // The misspelt command: its extra "f" disappears when fixed.
      const html = latex(line).replace(
        '<span class="c-cmd">\\textbff</span>',
        '<span class="err-token"><span class="c-cmd">\\textbf<span class="fix-extra">f</span></span></span>',
      );
      return `<div class="code-line"><span class="ln">${i + 1}</span><span class="txt" data-n="${line.length}">${html}</span></div>`;
    })
    .join("");
  return `<div class="demo" data-demo aria-label="${T("Animation: RayTeX explains an error and fixes it", "Animation : RayTeX explique une erreur et la corrige")}" role="img">
  <div class="demo-titlebar"><span class="dots"><i></i><i></i><i></i></span><span class="demo-title">main.tex — RayTeX</span></div>
  <div class="demo-toolbar">
    <span class="demo-build">${icon("play", 13)} ${T("Build", "Compiler")}</span>
    <span class="demo-live"><i></i> Live</span>
    <span class="demo-status">
      <span class="st st-typing">${T("Editing…", "Édition…")}</span>
      <span class="st st-error">${icon("alert-circle", 13)} ${T("1 error", "1 erreur")}</span>
      <span class="st st-building"><span class="spin"></span> ${T("Compiling…", "Compilation…")}</span>
      <span class="st st-built">${icon("check", 13)} ${T("Compiled in 0.4 s", "Compilé en 0,4 s")}</span>
    </span>
  </div>
  <div class="demo-body">
    <div class="demo-editor">
      <div class="code">${lines}</div>
      <div class="demo-problem">
        <div class="problem-head">${icon("alert-circle", 15)} <strong>${T("Undefined control sequence", "Commande inconnue")}</strong><span class="problem-loc">main.tex:6</span></div>
        <p>${T("<code>\\textbff</code> is not a known command. Did you mean <code>\\textbf</code>?", "<code>\\textbff</code> n'existe pas. Vouliez-vous dire <code>\\textbf</code> ?")}</p>
        <span class="demo-fix">${icon("wand", 13)} ${T("Replace with \\textbf", "Remplacer par \\textbf")}</span>
      </div>
    </div>
    <div class="demo-pdf" aria-hidden="true">
      <div class="paper">
        <p class="paper-h"><b>1&nbsp;&nbsp;Introduction</b></p>
        <p class="paper-p">${T(
          'Let <i>f</i>(<i>x</i>) = <span class="frac"><span>1</span><span><i>x</i></span></span> be an <b>important</b> map.',
          'Soit <i>f</i>(<i>x</i>) = <span class="frac"><span>1</span><span><i>x</i></span></span>, une fonction <b>clé</b>.',
        )}</p>
        <div class="paper-lines"><i></i><i></i><i></i><i style="width:62%"></i></div>
        <p class="paper-n">1</p>
      </div>
    </div>
  </div>
</div>`;
}

export default {
  id: "home",
  path: "",
  title: { en: "Home", fr: "Accueil" },
  description: {
    en: "RayTeX is a free, open-source LaTeX editor for Windows, macOS and Linux: live preview, completion that knows every package, and every error explained with its fix.",
    fr: "RayTeX est un éditeur LaTeX libre et gratuit pour Windows, macOS et Linux : aperçu en direct, complétion qui connaît chaque package, et chaque erreur expliquée avec sa correction.",
  },
  body(ctx) {
    const { T, url, asset, icon, lang, GITHUB } = ctx;
    const feature = (ic, title, text, cls = "") =>
      `<article class="card feature ${cls}" data-reveal data-spotlight><span class="feature-icon">${icon(ic, 22)}</span><h3>${title}</h3><p>${text}</p></article>`;
    const shot = (id, label) => `<button type="button" role="tab" data-shot="${id}" aria-selected="${id === "editor"}">${label}</button>`;
    const problem = (kind, title, text, fix) =>
      `<div class="problem ${kind}" data-reveal><div class="problem-head">${icon(kind === "error" ? "alert-circle" : "alert-triangle", 15)} <strong>${title}</strong></div><p>${text}</p>${fix ? `<span class="problem-fix">${icon("wand", 13)} ${fix}</span>` : ""}</div>`;
    const stat = (n, suffix, label) => `<div class="stat" data-reveal><strong><span data-count="${n}">${n}</span>${suffix}</strong><span>${label}</span></div>`;
    const platform = (id, ic, name, formats) =>
      `<a class="card platform" href="${url("download/")}#${id}" data-reveal data-spotlight data-platform="${id}">${icon(ic, 30)}<h3>${name}</h3><p>${formats}</p><span class="more">${T("Download", "Télécharger")} ${icon("arrow-right", 15)}</span></a>`;

    return `
<section class="hero">
  <div class="container hero-grid">
    <div class="hero-text">
      <p class="eyebrow" data-reveal><span class="pill">${T("Free & open source", "Libre et gratuit")}</span> Windows · macOS · Linux</p>
      <h1 data-reveal>${T("Write LaTeX.", "Écrivez en LaTeX.")}<br /><span class="gradient-text">${T("Understand every error.", "Comprenez chaque erreur.")}</span></h1>
      <p class="lead" data-reveal>${T(
        "RayTeX compiles as you type, completes the commands of every package you load, and explains each error in plain words — with the fix one click away.",
        "RayTeX compile pendant que vous écrivez, complète les commandes de chaque package chargé et explique chaque erreur avec des mots simples — la correction à un clic.",
      )}</p>
      <div class="hero-actions" data-reveal>
        <a class="btn btn-primary btn-lg" href="${url("download/")}" data-download-primary>${icon("download", 19)}<span data-download-label>${T("Download RayTeX", "Télécharger RayTeX")}</span></a>
        <a class="btn btn-ghost btn-lg" href="${GITHUB}">${icon("github", 19)} GitHub</a>
      </div>
      <p class="hero-meta" data-reveal><span data-download-meta>${T("Free · no account · no telemetry", "Gratuit · sans compte · sans télémétrie")}</span> · <a href="${url("download/")}">${T("Other systems", "Autres systèmes")}</a></p>
    </div>
    <div class="hero-visual" data-reveal>
      <img class="hero-ray float" src="${asset("img/logo.svg")}" alt="" width="132" height="132" />
      ${demo(ctx)}
    </div>
  </div>
</section>

<section class="strip" aria-label="${T("Supported TeX distributions", "Distributions TeX prises en charge")}">
  <div class="container strip-inner" data-reveal>
    <span class="strip-label">${T("Works with every TeX distribution", "Fonctionne avec toutes les distributions TeX")}</span>
    <ul class="chips"><li>TeX Live</li><li>MiKTeX</li><li>MacTeX</li><li>TinyTeX</li><li>Tectonic</li></ul>
  </div>
</section>

<section class="section">
  <div class="container">
    ${heading(T("See it", "Aperçu"), T("Everything in one window", "Tout dans une seule fenêtre"), T("The source, the PDF that follows it, the problems and their fixes, a formatting bar like a word processor's.", "La source, le PDF qui la suit, les problèmes et leurs corrections, une barre de mise en forme comme dans un traitement de texte."))}
    <div class="showcase" data-reveal>
      <div class="tabs" role="tablist">
        ${shot("editor", T("Editor and live PDF", "Éditeur et PDF en direct"))}
        ${shot("problems", T("Problems explained", "Problèmes expliqués"))}
        ${shot("tikz", T("TikZ studio", "Studio TikZ"))}
      </div>
      <div class="window-frame">
        <img data-shot-img="editor" class="active" src="${asset(`screenshots/${lang}/editor.png`)}" width="1400" height="813" alt="${T("The editor, the live PDF and the @ shortcuts panel", "L'éditeur, le PDF en direct et le panneau des raccourcis @")}" />
        <img data-shot-img="problems" loading="lazy" src="${asset(`screenshots/${lang}/problems.png`)}" width="1400" height="813" alt="${T("Problems explained, with their fixes", "Les problèmes expliqués, avec leurs corrections")}" />
        <img data-shot-img="tikz" loading="lazy" src="${asset(`screenshots/${lang}/tikz.png`)}" width="1400" height="813" alt="${T("The TikZ studio: draw with the mouse, the code writes itself", "Le studio TikZ : dessinez à la souris, le code s'écrit tout seul")}" />
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    ${heading(T("Features", "Fonctionnalités"), T("Made for learning, fast for experts", "Pensé pour apprendre, rapide pour les experts"))}
    <div class="bento">
      ${feature("bolt", T("Live preview", "Aperçu en direct"), T("The document is compiled after each pause in typing and the PDF follows, at the same place. SyncTeX both ways: double-click in the PDF to reach the source.", "Le document est compilé à chaque pause dans la frappe et le PDF suit, au même endroit. SyncTeX dans les deux sens : double-cliquez dans le PDF pour aller à la source."), "wide")}
      ${feature("lightbulb", T("Errors explained", "Erreurs expliquées"), T("About 110 LaTeX, package and BibTeX messages explained in plain words, and the common ones fixed in one click — or all at once.", "Environ 110 messages de LaTeX, des packages et de BibTeX expliqués simplement, et les plus courants corrigés en un clic — ou tous d'un coup."))}
      ${feature("sparkles", T("Completion that knows your packages", "Une complétion qui connaît vos packages"), T("Commands and environments read from the source of every package you load, about 520 documented option keys, labels, citations, files and colours.", "Commandes et environnements lus dans la source de chaque package chargé, environ 520 clés d'options documentées, labels, citations, fichiers et couleurs."))}
      ${feature("draw", T("TikZ studio", "Studio TikZ"), T("Draw with the mouse on a grid and the TikZ code writes itself — or start from 22 ready drawings: plots, trees, circuits, automata…", "Dessinez à la souris sur une grille et le code TikZ s'écrit tout seul — ou partez de 22 dessins prêts : courbes, arbres, circuits, automates…"))}
      ${feature("matrix", T("Tables and matrices", "Tableaux et matrices"), T("Fill them cell by cell, paste from a spreadsheet, see the result as you go. A chip in the code reopens the editor.", "Remplissez-les case par case, collez depuis un tableur, voyez le résultat au fur et à mesure. Une pastille dans le code rouvre l'éditeur."))}
      ${feature("packages", T("Any TeX distribution", "Toutes les distributions TeX"), T("TeX Live, MiKTeX, MacTeX, TinyTeX or Tectonic: detected, or installed with a guide. Missing packages are installed with the right tool.", "TeX Live, MiKTeX, MacTeX, TinyTeX ou Tectonic : détectée, ou installée avec un guide. Les packages manquants s'installent avec le bon outil."), "wide")}
    </div>
    <p class="center" data-reveal><a class="btn btn-ghost" href="${url("features/")}">${T("All the features", "Toutes les fonctionnalités")} ${icon("arrow-right", 16)}</a></p>
  </div>
</section>

<section class="section split-section">
  <div class="container split">
    <div class="split-text" data-reveal>
      <p class="eyebrow">${T("Errors that make sense", "Des erreurs qui ont du sens")}</p>
      <h2>${T("From “Undefined control sequence” to “did you mean…?”", "De « Undefined control sequence » à « vouliez-vous dire… ? »")}</h2>
      <p class="lead">${T("RayTeX reads the log for you: each problem points to its line and column, says what went wrong and how to fix it.", "RayTeX lit le journal pour vous : chaque problème pointe sa ligne et sa colonne, dit ce qui ne va pas et comment le corriger.")}</p>
      <ul class="checks">
        <li>${icon("check", 17)}<span>${T("Misspelt commands, environments, labels and citation keys", "Commandes, environnements, labels et clés de citation mal orthographiés")}</span></li>
        <li>${icon("check", 17)}<span>${T("Missing packages added — or installed", "Packages manquants ajoutés — ou installés")}</span></li>
        <li>${icon("check", 17)}<span>${T("Unclosed braces, formulas and environments", "Accolades, formules et environnements non fermés")}</span></li>
        <li>${icon("check", 17)}<span>${T("<kbd>Alt</kbd> + <kbd>Enter</kbd> for the fixes at the cursor, <b>Fix all</b> for the whole document", "<kbd>Alt</kbd> + <kbd>Entrée</kbd> pour les corrections sous le curseur, <b>Tout corriger</b> pour tout le document")}</span></li>
      </ul>
    </div>
    <div class="problems-visual">
      ${problem("error", T("Environment itemise undefined", "Environnement itemise inconnu"), T("There is no environment <code>itemise</code>. Did you mean <code>itemize</code>?", "L'environnement <code>itemise</code> n'existe pas. Vouliez-vous dire <code>itemize</code> ?"), T("Replace with itemize", "Remplacer par itemize"))}
      ${problem("error", T("Package not loaded", "Package non chargé"), T("<code>\\SI</code> comes from the package <code>siunitx</code>, which the document does not load.", "<code>\\SI</code> vient du package <code>siunitx</code>, que le document ne charge pas."), T("Add \\usepackage{siunitx}", "Ajouter \\usepackage{siunitx}"))}
      ${problem("warning", T("Reference undefined", "Référence indéfinie"), T("The label <code>fig:resuts</code> does not exist; <code>fig:results</code> does.", "Le label <code>fig:resuts</code> n'existe pas ; <code>fig:results</code> existe."), T("Replace with fig:results", "Remplacer par fig:results"))}
    </div>
  </div>
</section>

<section class="section">
  <div class="container stats">
    ${stat(16, "", T("templates, in English and French", "modèles, en français et en anglais"))}
    ${stat(22, "", T("ready TikZ drawings", "dessins TikZ prêts"))}
    ${stat(520, "+", T("documented option keys", "clés d'options documentées"))}
    ${stat(110, "+", T("errors explained", "erreurs expliquées"))}
    ${stat(0, "", T("accounts, ads or telemetry", "compte, publicité ou télémétrie"))}
  </div>
</section>

<section class="section">
  <div class="container">
    ${heading(T("Download", "Téléchargement"), T("On your system", "Sur votre système"), T("Installers built for each system, hosted on GitHub. Your system is detected; any other is one click away.", "Des installateurs pour chaque système, hébergés sur GitHub. Votre système est détecté ; les autres sont à un clic."))}
    <div class="platforms">
      ${platform("windows", "windows", "Windows", T("Windows 10 and 11 · .exe installer or .msi", "Windows 10 et 11 · installateur .exe ou .msi"))}
      ${platform("macos", "apple", "macOS", T("macOS 11 or later · Apple silicon and Intel", "macOS 11 ou plus récent · Apple silicon et Intel"))}
      ${platform("linux", "linux", "Linux", T("AppImage, .deb and .rpm", "AppImage, .deb et .rpm"))}
    </div>
  </div>
</section>

<section class="section">
  <div class="container open-source card" data-reveal data-spotlight>
    <div>
      <p class="eyebrow">${T("Open source", "Open source")}</p>
      <h2>${T("Free, open, and your documents stay yours", "Libre, ouvert, et vos documents restent à vous")}</h2>
      <p class="lead">${T("RayTeX is written in Rust, under the MIT or Apache 2.0 license. No account, no telemetry: your documents never leave your computer.", "RayTeX est écrit en Rust, sous licence MIT ou Apache 2.0. Sans compte ni télémétrie : vos documents ne quittent jamais votre ordinateur.")}</p>
    </div>
    <div class="open-source-actions">
      <a class="btn btn-primary" href="${GITHUB}">${icon("github", 18)} ${T("Source code", "Code source")}</a>
      <a class="btn btn-ghost" href="${url("about/")}">${T("Contribute", "Contribuer")} ${icon("arrow-right", 16)}</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container narrow">
    ${heading("FAQ", T("Questions people ask", "Les questions fréquentes"))}
    <div class="faq-list">
      <details data-reveal><summary>${T("Is RayTeX really free?", "RayTeX est-il vraiment gratuit ?")}</summary><p>${T("Yes. It is open-source software under the MIT or Apache 2.0 license: free to use, study, share and change, for any purpose.", "Oui. C'est un logiciel libre sous licence MIT ou Apache 2.0 : libre d'utilisation, d'étude, de partage et de modification, pour tout usage.")}</p></details>
      <details data-reveal><summary>${T("Do I need to install LaTeX first?", "Faut-il d'abord installer LaTeX ?")}</summary><p>${T("RayTeX needs a TeX distribution to compile. If none is found, its setup assistant installs one for you and shows the exact commands first.", "RayTeX a besoin d'une distribution TeX pour compiler. S'il n'en trouve aucune, son assistant en installe une pour vous et montre d'abord les commandes exactes.")}</p></details>
      <details data-reveal><summary>${T("Does it work offline?", "Fonctionne-t-il hors ligne ?")}</summary><p>${T("Yes. The network is only used to browse the CTAN catalogue and to install packages, when you ask for it.", "Oui. Le réseau ne sert qu'à parcourir le catalogue CTAN et à installer des packages, quand vous le demandez.")}</p></details>
    </div>
    <p class="center" data-reveal><a class="btn btn-ghost" href="${url("faq/")}">${T("All the questions", "Toutes les questions")} ${icon("arrow-right", 16)}</a></p>
  </div>
</section>

<section class="section cta-band">
  <div class="container" data-reveal>
    <img src="${asset("img/logo.svg")}" alt="" width="88" height="88" class="float" />
    <h2>${T("Ready to write?", "Prêt à écrire ?")}</h2>
    <p class="lead">${T("Download RayTeX, open a template, and see your first PDF in seconds.", "Téléchargez RayTeX, ouvrez un modèle et voyez votre premier PDF en quelques secondes.")}</p>
    <div class="hero-actions center">
      <a class="btn btn-primary btn-lg" href="${url("download/")}" data-download-primary>${icon("download", 19)}<span data-download-label>${T("Download RayTeX", "Télécharger RayTeX")}</span></a>
      <a class="btn btn-ghost btn-lg" href="${url("guide/")}">${icon("book", 19)} ${T("Getting started", "Prise en main")}</a>
    </div>
  </div>
</section>`;
  },
};
