export default {
  id: "features",
  path: "features/",
  title: { en: "Features", fr: "Fonctionnalités" },
  description: {
    en: "Everything RayTeX does: live preview, completion from every package, errors explained and fixed, TikZ studio, tables, images, fonts, templates and any TeX distribution.",
    fr: "Tout ce que fait RayTeX : aperçu en direct, complétion de chaque package, erreurs expliquées et corrigées, studio TikZ, tableaux, images, polices, modèles et toutes les distributions TeX.",
  },
  body({ T, icon, url, tex }) {
    const items = (list) => tex.description(list);
    return `${tex.chapter("A", T("Every feature", "Toutes les fonctionnalités"), {
      epigraph: [T("It compiles while I type? Then I'm going to sleep.", "Il compile pendant que j'écris ? Alors je vais dormir."), T("a PhD student, 3 a.m.", "un doctorant, 3 h du matin")],
      lead: T(
        "A LaTeX editor that helps beginners learn and lets experts go fast. This appendix lists what RayTeX does, part by part; Table A.1 sums it up in numbers.",
        "Un éditeur LaTeX qui aide les débutants à apprendre et laisse les experts aller vite. Cette annexe liste ce que fait RayTeX, partie par partie ; le tableau A.1 le résume en chiffres.",
      ),
    })}
${tex.table(
  [T("What", "Quoi"), T("How many", "Combien")],
  [
    [T("LaTeX, package, BibTeX and Biber messages explained", "Messages de LaTeX, des packages, de BibTeX et de Biber expliqués"), "≈ 110"],
    [T("Option keys documented (graphicx, hyperref, geometry, TikZ…)", "Clés d'options documentées (graphicx, hyperref, geometry, TikZ…)"), "≈ 520"],
    [T("Drawings to start from in the TikZ studio", "Dessins pour démarrer dans le studio TikZ"), "22"],
    [T("Templates, in English and French", "Modèles, en français et en anglais"), "16"],
    [T("Faster passes with the precompiled preamble", "Passes plus rapides avec le préambule précompilé"), "35–60 %"],
    [T("Accounts, telemetry, cookies", "Comptes, télémétrie, cookies"), "0"],
  ],
  T("RayTeX in numbers.", "RayTeX en chiffres."),
  "lr",
)}

${tex.section(T("Writing", "Écriture"), "writing")}
${tex.note(T("write as in a word processor, keep the power of LaTeX", "écrire comme dans un traitement de texte, garder la puissance de LaTeX"), { arrow: "left", tilt: -3 })}
${items([
  [T("A formatting bar", "Une barre de mise en forme"), T("Heading style, text size, bold, italic, colour, alignment, lists, formulas, images, tables, drawings, links and references — and <b>See all</b> for every command with its shortcut.", "Style de titre, taille du texte, gras, italique, couleur, alignement, listes, formules, images, tableaux, dessins, liens et références — et <b>Tout voir</b> pour chaque commande avec son raccourci.")],
  [T("Completion from every package", "La complétion de chaque package"), T("Commands and environments of the LaTeX kernel, of every package the document loads (read from its source) and of your own <code>\\newcommand</code>s; labels with their number, citations with authors and title, files, options, colours.", "Commandes et environnements du noyau LaTeX, de chaque package chargé (lus dans sa source) et de vos propres <code>\\newcommand</code> ; labels avec leur numéro, citations avec auteurs et titre, fichiers, options, couleurs.")],
  [T("Arguments documented", "Des arguments documentés"), T("Keys and values of <code>\\includegraphics[…]</code>, <code>\\hypersetup{…}</code>, <code>\\geometry{…}</code>, siunitx, listings, tcolorbox, TikZ, beamer…, with what each one does.", "Clés et valeurs de <code>\\includegraphics[…]</code>, <code>\\hypersetup{…}</code>, <code>\\geometry{…}</code>, siunitx, listings, tcolorbox, TikZ, beamer…, avec ce que fait chacune.")],
  [T("@ shortcuts for maths", "Raccourcis @ pour les maths"), T(`In a formula, <code>@a</code> gives ${tex.math("\\alpha")} and <code>@/</code> a fraction; snippets and personal macros with their own triggers and keys.`, `Dans une formule, <code>@a</code> donne ${tex.math("\\alpha")} et <code>@/</code> une fraction ; extraits et macros personnelles avec leurs propres déclencheurs et touches.`)],
  [T("Live maths preview", "Aperçu des formules"), T("Formulas are drawn as you type them, with your own macros; documentation on hover, image previews.", "Les formules s'affichent pendant que vous les tapez, avec vos macros ; documentation au survol, aperçu des images.")],
  [T("Navigate and rename", "Naviguer et renommer"), T("Go to definition, find references, rename a label, a citation key or a command across the whole project.", "Aller à la définition, trouver les références, renommer un label, une clé de citation ou une commande dans tout le projet.")],
])}

${tex.section(T("Understanding errors", "Comprendre les erreurs"), "errors")}
<p data-reveal>${T("The console never opens by itself: problems are underlined where they are, and each one is explained.", "La console ne s'ouvre jamais d'elle-même : les problèmes sont soulignés là où ils sont, et chacun est expliqué.")}</p>
${tex.listing(T("! Missing $ inserted.\n<inserted text>\nl.12 The index x_", "! Missing $ inserted.\n<inserted text>\nl.12 L'indice x_"), T("What LaTeX says", "Ce que dit LaTeX"))}
${tex.note(T("RayTeX: “<code>_</code> only works in a formula — write <code>$x_i$</code>”", "RayTeX : « <code>_</code> ne marche que dans une formule — écrivez <code>$x_i$</code> »"), { arrow: "left", tilt: -2 })}
${items([
  [T("Every message explained", "Chaque message expliqué"), T("About 110 LaTeX, package, BibTeX and Biber messages explained in plain words, in English and French, and an explanation for the others.", "Environ 110 messages de LaTeX, des packages, de BibTeX et de Biber expliqués simplement, en français et en anglais, et une explication pour les autres.")],
  [T("Fixes computed from your sources", "Des corrections tirées de vos sources"), T("Misspelt commands, environments, labels and keys; missing packages and TikZ libraries; unclosed braces and formulas; <code>_ ^ &amp; #</code> in text; table columns; float placement…", "Commandes, environnements, labels et clés mal orthographiés ; packages et bibliothèques TikZ manquants ; accolades et formules non fermées ; <code>_ ^ &amp; #</code> dans le texte ; colonnes de tableau ; placement des flottants…")],
  [T("One key, or all at once", "Une touche, ou tout d'un coup"), T("<kbd>Alt</kbd> + <kbd>Enter</kbd> fixes what is under the cursor; <b>Fix all</b> applies the first fix of each problem, then compiles.", "<kbd>Alt</kbd> + <kbd>Entrée</kbd> corrige ce qui est sous le curseur ; <b>Tout corriger</b> applique la première correction de chaque problème, puis compile.")],
  [T("Checked while typing", "Vérifié pendant la frappe"), T("Undefined references and citations, duplicate labels, unbalanced braces, missing files, obsolete commands and typography — before any compilation.", "Références et citations indéfinies, labels en double, accolades déséquilibrées, fichiers manquants, commandes obsolètes et typographie — avant toute compilation.")],
])}

${tex.section(T("Building and PDF", "Compilation et PDF"), "building")}
<p data-reveal>${T("Compiled as you write, the PDF at the same place. The time between a keystroke and the page that shows it is, roughly,", "Compilé pendant que vous écrivez, le PDF au même endroit. Le temps entre une frappe et la page qui la montre est, à peu près,")}</p>
${tex.eq(String.raw`T_{\text{${T("page", "page")}}} = \underbrace{t_{\text{pause}}}_{\approx\,0{,}5\ \mathrm{s}} + \underbrace{t_{\text{${T("pass", "passe")}}}}_{\text{${T("precompiled preamble", "préambule précompilé")}}} + \underbrace{t_{\text{${T("drawing", "dessin")}}}}_{\text{${T("visible pages only", "pages visibles seulement")}}}`)}
${items([
  [T("Live by default", "En direct par défaut"), T("A build after each pause in typing, or on <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd>, or on save.", "Une compilation à chaque pause dans la frappe, ou avec <kbd>Ctrl/⌘</kbd> + <kbd>Entrée</kbd>, ou à l'enregistrement.")],
  [T("A smart build driver", "Un pilote de compilation malin"), T("Biber, BibTeX, makeindex and glossaries only when their inputs changed, reruns until references are stable; or latexmk, or your own steps.", "Biber, BibTeX, makeindex et glossaries seulement quand leurs entrées ont changé, relances jusqu'à des références stables ; ou latexmk, ou vos propres étapes.")],
  [T("Faster passes", "Des passes plus rapides"), T("The preamble is precompiled in the background (pdfLaTeX): passes 35–60 % faster. The right engine is chosen for you.", "Le préambule est précompilé en arrière-plan (pdfLaTeX) : des passes 35 à 60 % plus rapides. Le bon moteur est choisi pour vous.")],
  [T("Built-in PDF viewer", "Lecteur PDF intégré"), T("Only the visible pages are drawn, reloads keep your place, text selection, dark mode; SyncTeX both ways.", "Seules les pages visibles sont dessinées, les rechargements gardent votre position, sélection du texte, mode sombre ; SyncTeX dans les deux sens.")],
])}

${tex.section(T("Images, drawings, tables and fonts", "Images, dessins, tableaux et polices"), "visual")}
${tex.note(T("the hard parts of LaTeX, made visual", "les parties difficiles de LaTeX, rendues visuelles"), { arrow: "left", tilt: 2 })}
${items([
  [T("Insert images", "Insérer des images"), T("Choose, paste or drop images: LaTeX-safe names, width with a page preview, caption, label, sub-figures. SVG becomes vector PDF; WebP, HEIC, GIF… become PNG.", "Choisissez, collez ou déposez des images : noms sûrs pour LaTeX, largeur avec aperçu de la page, légende, label, sous-figures. Le SVG devient un PDF vectoriel ; WebP, HEIC, GIF… deviennent PNG.")],
  [T("TikZ studio", "Studio TikZ"), T("A whiteboard to draw with the mouse — the code follows the drawing both ways — and 22 drawings to start from, with a live preview compiled with your preamble.", "Un tableau blanc pour dessiner à la souris — le code suit le dessin dans les deux sens — et 22 dessins pour démarrer, avec un aperçu compilé avec votre préambule.")],
  [T("Tables and matrices", "Tableaux et matrices"), T("Filled cell by cell (<kbd>Enter</kbd> goes to the next), pasted from a spreadsheet, with LaTeX formatting and macros in the cells.", "Remplis case par case (<kbd>Entrée</kbd> passe à la suivante), collés depuis un tableur, avec mise en forme LaTeX et macros dans les cases.")],
  [T("Fonts", "Polices"), T("Any font of your computer (fontspec, LuaLaTeX) or LaTeX font packages that work with pdfLaTeX, each with a compiled preview.", "N'importe quelle police de votre ordinateur (fontspec, LuaLaTeX) ou les packages de polices LaTeX qui fonctionnent avec pdfLaTeX, chacun avec un aperçu compilé.")],
])}
${tex.eq(String.raw`\begin{pmatrix} a_{11} & a_{12} & \cdots & a_{1n} \\ a_{21} & a_{22} & \cdots & a_{2n} \\ \vdots & \vdots & \ddots & \vdots \\ a_{m1} & a_{m2} & \cdots & a_{mn} \end{pmatrix} \xrightarrow{\ \text{Tab},\ \text{${T("Enter", "Entrée")}}\ } \texttt{\textbackslash begin\{pmatrix\}}\ldots`)}

${tex.section(T("Any distribution, every package", "Toutes les distributions, tous les packages"), "tex")}
${items([
  [T("Detected or installed", "Détectée ou installée"), T("TeX Live, MacTeX, MiKTeX, TinyTeX, Tectonic and the TeX Live of Linux systems; a guided installation shows the commands before running them.", "TeX Live, MacTeX, MiKTeX, TinyTeX, Tectonic et le TeX Live des systèmes Linux ; une installation guidée montre les commandes avant de les lancer.")],
  [T("Missing packages", "Packages manquants"), T("Installed with the right tool (tlmgr, MiKTeX, dnf, zypper…), in user mode when possible, as administrator only when needed.", "Installés avec le bon outil (tlmgr, MiKTeX, dnf, zypper…), en mode utilisateur quand c'est possible, en administrateur seulement si nécessaire.")],
  [T("The CTAN catalogue", "Le catalogue CTAN"), T("Browse installed packages and the whole CTAN catalogue, with their documentation.", "Parcourez les packages installés et tout le catalogue CTAN, avec leur documentation.")],
])}

${tex.section(T("Projects", "Projets"), "projects")}
${tex.note(T("start in seconds, keep things tidy", "démarrer en quelques secondes, garder tout en ordre"), { arrow: "left", tilt: -2 })}
${items([
  [T("16 templates", "16 modèles"), T("Article, report, thesis, research article, slides, poster, course notes, exam, exercise sheet, homework, lab report, letter, CV, TikZ figure… in English and French, all compiling without warnings.", "Article, rapport, thèse, article de recherche, diaporama, poster, notes de cours, examen, feuille d'exercices, devoir, compte rendu de TP, lettre, CV, figure TikZ… en français et en anglais, tous compilés sans avertissement.")],
  [T("My projects", "Mes projets"), T("A projects folder with a preview of each PDF, search and recent files; auxiliary files kept in <code>build/</code>.", "Un dossier de projets avec l'aperçu de chaque PDF, une recherche et les fichiers récents ; les fichiers auxiliaires rangés dans <code>build/</code>.")],
  [T("Light mode", "Mode léger"), T("Open a single <code>.tex</code> file, edit it and export its PDF without creating anything next to it.", "Ouvrez un seul fichier <code>.tex</code>, modifiez-le et exportez son PDF sans rien créer à côté.")],
  [T("Updates", "Mises à jour"), T("At start, RayTeX offers the new version when there is one — its notes, <b>Update now</b>, <b>Later</b> or <b>Skip</b>.", "Au démarrage, RayTeX propose la nouvelle version quand il y en a une — ses notes, <b>Mettre à jour</b>, <b>Plus tard</b> ou <b>Ignorer</b>.")],
  [T("Help centre", "Centre d'aide"), T("Guides, command reference, symbol palette, common errors, shortcuts — in English and French.", "Guides, référence des commandes, palette de symboles, erreurs courantes, raccourcis — en français et en anglais.")],
])}
<p class="cta center" data-reveal><a class="fbox-link big" href="${url("download/")}" data-download-primary>${icon("download", 18)}<span data-download-label>${T("Download RayTeX", "Télécharger RayTeX")}</span></a></p>`;
  },
};
