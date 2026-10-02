import { ctaEnd } from "../util.mjs";

export default {
  id: "guide",
  path: "guide/",
  title: { en: "Getting started", fr: "Prise en main" },
  description: {
    en: "Install RayTeX and a TeX distribution, create your first project, write, compile and fix errors: the essentials in a few minutes.",
    fr: "Installer RayTeX et une distribution TeX, créer un premier projet, écrire, compiler et corriger les erreurs : l'essentiel en quelques minutes.",
  },
  body({ T, icon, url, GITHUB, tex }) {
    const key = (k) => k.split(" + ").map((x) => `<kbd>${x}</kbd>`).join(" + ");
    const shortcuts = [
      ["Ctrl/⌘ + Enter", T("Compile", "Compiler")],
      ["Ctrl/⌘ + S", T("Save", "Enregistrer")],
      ["Ctrl/⌘ + P", T("Open a file of the project", "Ouvrir un fichier du projet")],
      ["Ctrl/⌘ + Shift + P", T("Every command (palette)", "Toutes les commandes (palette)")],
      ["Ctrl/⌘ + Shift + F", T("Search the project", "Chercher dans le projet")],
      ["Alt + Enter", T("Fixes at the cursor", "Corrections sous le curseur")],
      ["Ctrl/⌘ + Alt + J", T("Show the cursor's place in the PDF", "Montrer la position du curseur dans le PDF")],
      [T("Double-click in the PDF", "Double-clic dans le PDF"), T("Go to the source", "Aller à la source")],
    ];
    const sample = T(
      "\\section{Results}\nThe error is $\\varepsilon < 10^{-3}$\n(see Figure~\\ref{fig:plot}).",
      "\\section{Résultats}\nL'erreur vaut $\\varepsilon < 10^{-3}$\n(voir la figure~\\ref{fig:courbe}).",
    );
    const output = `<div class="pdf-out" aria-hidden="true"><h4><span>1</span>${T("Results", "Résultats")}</h4><p>${T(
      `The error is ${tex.math("\\varepsilon < 10^{-3}")} (see Figure 2).`,
      `L'erreur vaut ${tex.math("\\varepsilon < 10^{-3}")} (voir la figure 2).`,
    )}</p></div>`;

    return `${tex.chapter("D", T("Getting started", "Prise en main"), {
      stamp: [T("Step by step", "Pas à pas"), "violet", -6],
      epigraph: [
        T("To learn LaTeX, write. To like it, stop seeing the errors.", "Pour apprendre LaTeX, il suffit d'écrire. Pour l'aimer, il suffit de ne plus voir les erreurs."),
        T("the ray", "la raie"),
      ],
      lead: T("From the download to your first PDF in six steps, then the habits that save time.", "Du téléchargement à votre premier PDF en six étapes, puis les réflexes qui font gagner du temps."),
    })}

${tex.section(T("Install RayTeX", "Installer RayTeX"), "install")}
<p data-reveal>${T(
  `Download the installer of your system from the <a href="${url("download/")}">download page</a> and run it. The builds are not signed yet: Windows and macOS ask you to confirm the first time (the download page says how).`,
  `Téléchargez l'installateur de votre système depuis la <a href="${url("download/")}">page de téléchargement</a> et lancez-le. Les versions ne sont pas encore signées : Windows et macOS vous demandent une confirmation la première fois (la page de téléchargement explique comment).`,
)}</p>

${tex.section(T("Get a TeX distribution", "Obtenir une distribution TeX"), "distribution")}
${tex.note(T("nothing to do if LaTeX is already there", "rien à faire si LaTeX est déjà là"), { arrow: "left", tilt: -3 })}
<p data-reveal>${T(
  "RayTeX compiles with the TeX distribution of your computer. At first start it looks for TeX Live, MacTeX, MiKTeX, TinyTeX or Tectonic. If there is none, the setup assistant proposes the right one for your system and shows each command before running it.",
  "RayTeX compile avec la distribution TeX de votre ordinateur. Au premier lancement, il cherche TeX Live, MacTeX, MiKTeX, TinyTeX ou Tectonic. S'il n'y en a aucune, l'assistant propose celle qui convient à votre système et montre chaque commande avant de la lancer.",
)}</p>
<p data-reveal>${T("With MiKTeX, missing packages are installed silently during builds (a setting you can turn off).", "Avec MiKTeX, les packages manquants s'installent sans rien demander pendant les compilations (un réglage que vous pouvez désactiver).")}</p>

${tex.section(T("Create a project", "Créer un projet"), "project")}
<p data-reveal>${T(
  "<b>New project</b>: give it a name, it is created in your projects folder (<code>Documents/RayTeX</code>). The <b>Templates</b> panel shows each template by its first page — article, report, thesis, slides, CV… — and puts it in the document in one click (undo brings the blank page back).",
  "<b>Nouveau projet</b> : donnez-lui un nom, il est créé dans votre dossier de projets (<code>Documents/RayTeX</code>). Le panneau <b>Modèles</b> montre chaque modèle par sa première page — article, rapport, thèse, diaporama, CV… — et le place dans le document en un clic (annuler rend la page blanche).",
)}</p>
<p data-reveal>${T(
  "Already have a <code>.tex</code> file? Open it directly: RayTeX edits it and exports its PDF without creating anything next to it.",
  "Vous avez déjà un fichier <code>.tex</code> ? Ouvrez-le directement : RayTeX le modifie et exporte son PDF sans rien créer à côté.",
)}</p>

${tex.section(T("Write", "Écrire"), "write")}
${tex.note(T("in a formula, @e gives ε and @/ a fraction", "dans une formule, @e donne ε et @/ une fraction"), { arrow: "left", tilt: -2 })}
<p data-reveal>${T(
  `Type as usual: ${tex.hl("completion proposes the commands of the packages you load")}, with their documentation. The formatting bar does the rest — styles, lists, formulas, images, tables, drawings.`,
  `Tapez comme d'habitude : ${tex.hl("la complétion propose les commandes des packages chargés")}, avec leur documentation. La barre de mise en forme fait le reste — styles, listes, formules, images, tableaux, dessins.`,
)}</p>
${tex.figure(`<div class="srcpdf">${tex.listing(sample, "main.tex")}${output}</div>`, T("The source, and the PDF that follows it.", "La source, et le PDF qui la suit."))}

${tex.section(T("Compile and read the PDF", "Compiler et lire le PDF"), "compile")}
<p data-reveal>${T(
  `The document is compiled ${tex.underline("after each pause in typing", "violet", true)}, and the PDF stays at the same place. Double-click in the PDF to jump to the source; <kbd>Ctrl/⌘</kbd> + <kbd>Alt</kbd> + <kbd>J</kbd> goes the other way.`,
  `Le document est compilé ${tex.underline("à chaque pause dans la frappe", "violet", true)}, et le PDF reste au même endroit. Double-cliquez dans le PDF pour aller à la source ; <kbd>Ctrl/⌘</kbd> + <kbd>Alt</kbd> + <kbd>J</kbd> fait le chemin inverse.`,
)}</p>

${tex.section(T("Fix the errors", "Corriger les erreurs"), "fix")}
<p data-reveal>${T(
  `Problems are underlined in the text and counted in the top bar. Each one says what is wrong in plain words; <kbd>Alt</kbd> + <kbd>Enter</kbd> offers its fixes — ${tex.fix("\\begin{itemise}", "itemize")} — and <b>Fix all</b> in the Problems panel corrects everything it can at once.`,
  `Les problèmes sont soulignés dans le texte et comptés dans la barre du haut. Chacun dit ce qui ne va pas avec des mots simples ; <kbd>Alt</kbd> + <kbd>Entrée</kbd> propose ses corrections — ${tex.fix("\\begin{itemise}", "itemize")} — et <b>Tout corriger</b> dans le panneau Problèmes corrige d'un coup tout ce qui peut l'être.`,
)}</p>

${tex.section(T("Shortcuts worth knowing", "Les raccourcis à connaître"), "shortcuts")}
${tex.table(
  [T("Keys", "Touches"), T("Action", "Action")],
  shortcuts.map(([k, v]) => [k.includes("+") ? key(k) : k, v]),
  T("Every shortcut can be changed in the settings; the palette lists them all.", "Chaque raccourci se change dans les réglages ; la palette les liste tous."),
)}

${tex.sectionStar(T("See also", "Voir aussi"), "more")}
${tex.itemize([
  `<a href="${url("features/")}">${T("Every feature", "Toutes les fonctionnalités")}</a> — ${T("images, TikZ studio, fonts, macros, projects (appendix A).", "images, studio TikZ, polices, macros, projets (annexe A).")}`,
  `<a href="${url("faq/")}">${T("Frequently asked questions", "Questions fréquentes")}</a> — ${T("distributions, offline use, privacy, updates (appendix E).", "distributions, hors ligne, confidentialité, mises à jour (annexe E).")}`,
  `<a href="${GITHUB}#command-line">${T("The command line", "La ligne de commande")}</a> — <code>raytex build</code>, <code>lint</code>, <code>doctor</code>, <code>new</code>…`,
])}
${ctaEnd({ T, url, icon }, T("let's go!", "c'est parti !"))}`;
  },
};
