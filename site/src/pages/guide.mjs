import { latex, pageHead } from "../util.mjs";

export default {
  id: "guide",
  path: "guide/",
  title: { en: "Getting started", fr: "Prise en main" },
  description: {
    en: "Install RayTeX and a TeX distribution, create your first project, write, compile and fix errors: the essentials in a few minutes.",
    fr: "Installer RayTeX et une distribution TeX, créer un premier projet, écrire, compiler et corriger les erreurs : l'essentiel en quelques minutes.",
  },
  body({ T, icon, url, GITHUB }) {
    const step = (n, title, content) => `<li class="step" data-reveal><span class="step-n">${n}</span><div><h2>${title}</h2>${content}</div></li>`;
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
      "\\section{Results}\nThe error is $\\varepsilon < 10^{-3}$ (see Figure~\\ref{fig:plot}).",
      "\\section{Résultats}\nL'erreur vaut $\\varepsilon < 10^{-3}$ (voir la figure~\\ref{fig:courbe}).",
    );

    return `${pageHead(
      T("Guide", "Guide"),
      T("Getting started with RayTeX", "Prendre en main RayTeX"),
      T("From the download to your first PDF, and the habits that save time.", "Du téléchargement à votre premier PDF, et les réflexes qui font gagner du temps."),
    )}
<section class="section tight">
  <div class="container narrow">
    <ol class="steps">
      ${step(1, T("Install RayTeX", "Installer RayTeX"), `<p>${T(`Download the installer of your system from the <a href="${url("download/")}">download page</a> and run it. The builds are not signed yet: Windows and macOS ask you to confirm the first time (the download page says how).`, `Téléchargez l'installateur de votre système depuis la <a href="${url("download/")}">page de téléchargement</a> et lancez-le. Les versions ne sont pas encore signées : Windows et macOS vous demandent une confirmation la première fois (la page de téléchargement explique comment).`)}</p>`)}
      ${step(2, T("Get a TeX distribution", "Obtenir une distribution TeX"), `<p>${T("RayTeX compiles with the TeX distribution of your computer. At first start it looks for TeX Live, MacTeX, MiKTeX, TinyTeX or Tectonic. If there is none, the setup assistant proposes the right one for your system and shows each command before running it.", "RayTeX compile avec la distribution TeX de votre ordinateur. Au premier lancement, il cherche TeX Live, MacTeX, MiKTeX, TinyTeX ou Tectonic. S'il n'y en a aucune, l'assistant propose celle qui convient à votre système et montre chaque commande avant de la lancer.")}</p><p class="muted">${T("With MiKTeX, missing packages are installed silently during builds (a setting you can turn off).", "Avec MiKTeX, les packages manquants s'installent sans rien demander pendant les compilations (un réglage que vous pouvez désactiver).")}</p>`)}
      ${step(3, T("Create a project", "Créer un projet"), `<p>${T("<b>New project</b>: give it a name, it is created in your projects folder (<code>Documents/RayTeX</code>). The <b>Templates</b> panel shows each template by its first page — article, report, thesis, slides, CV… — and puts it in the document in one click (undo brings the blank page back).", "<b>Nouveau projet</b> : donnez-lui un nom, il est créé dans votre dossier de projets (<code>Documents/RayTeX</code>). Le panneau <b>Modèles</b> montre chaque modèle par sa première page — article, rapport, thèse, diaporama, CV… — et le place dans le document en un clic (annuler rend la page blanche).")}</p><p>${T("Already have a <code>.tex</code> file? Open it directly: RayTeX edits it and exports its PDF without creating anything next to it.", "Vous avez déjà un fichier <code>.tex</code> ? Ouvrez-le directement : RayTeX le modifie et exporte son PDF sans rien créer à côté.")}</p>`)}
      ${step(4, T("Write", "Écrire"), `<p>${T("Type as usual: completion proposes the commands of the packages you load, with their documentation. The formatting bar does the rest — styles, lists, formulas, images, tables, drawings.", "Tapez comme d'habitude : la complétion propose les commandes des packages chargés, avec leur documentation. La barre de mise en forme fait le reste — styles, listes, formules, images, tableaux, dessins.")}</p><pre class="code-block"><code>${latex(sample)}</code></pre><p class="muted">${T("In a formula, type <code>@</code> then a letter: <code>@e</code> → <code>\\varepsilon</code>, <code>@/</code> → a fraction.", "Dans une formule, tapez <code>@</code> puis une lettre : <code>@e</code> → <code>\\varepsilon</code>, <code>@/</code> → une fraction.")}</p>`)}
      ${step(5, T("Compile and read the PDF", "Compiler et lire le PDF"), `<p>${T("The document is compiled after each pause in typing, and the PDF stays at the same place. Double-click in the PDF to jump to the source; <kbd>Ctrl/⌘</kbd> + <kbd>Alt</kbd> + <kbd>J</kbd> goes the other way.", "Le document est compilé à chaque pause dans la frappe, et le PDF reste au même endroit. Double-cliquez dans le PDF pour aller à la source ; <kbd>Ctrl/⌘</kbd> + <kbd>Alt</kbd> + <kbd>J</kbd> fait le chemin inverse.")}</p>`)}
      ${step(6, T("Fix the errors", "Corriger les erreurs"), `<p>${T("Problems are underlined in the text and counted in the top bar. Each one says what is wrong in plain words; <kbd>Alt</kbd> + <kbd>Enter</kbd> offers its fixes, and <b>Fix all</b> in the Problems panel corrects everything it can at once.", "Les problèmes sont soulignés dans le texte et comptés dans la barre du haut. Chacun dit ce qui ne va pas avec des mots simples ; <kbd>Alt</kbd> + <kbd>Entrée</kbd> propose ses corrections, et <b>Tout corriger</b> dans le panneau Problèmes corrige d'un coup tout ce qui peut l'être.")}</p>`)}
    </ol>
  </div>
</section>

<section class="section">
  <div class="container narrow">
    <h2 class="h3" data-reveal>${T("Shortcuts worth knowing", "Les raccourcis à connaître")}</h2>
    <div class="table-wrap" data-reveal>
      <table class="shortcuts"><tbody>
        ${shortcuts.map(([k, v]) => `<tr><td>${k.includes("+") ? key(k) : k}</td><td>${v}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <p class="muted small" data-reveal>${T("Every shortcut can be changed in the settings; the palette lists them all.", "Chaque raccourci se change dans les réglages ; la palette les liste tous.")}</p>
  </div>
</section>

<section class="section">
  <div class="container narrow">
    <h2 class="h3" data-reveal>${T("Going further", "Aller plus loin")}</h2>
    <div class="link-cards">
      <a class="card link-card" href="${url("features/")}" data-reveal data-spotlight>${icon("sparkles", 22)}<h3>${T("All the features", "Toutes les fonctionnalités")}</h3><p>${T("Images, TikZ studio, fonts, macros, projects…", "Images, studio TikZ, polices, macros, projets…")}</p></a>
      <a class="card link-card" href="${url("faq/")}" data-reveal data-spotlight>${icon("help", 22)}<h3>FAQ</h3><p>${T("Distributions, offline use, privacy, updates…", "Distributions, hors ligne, confidentialité, mises à jour…")}</p></a>
      <a class="card link-card" href="${GITHUB}#command-line" data-reveal data-spotlight>${icon("terminal", 22)}<h3>${T("Command line", "Ligne de commande")}</h3><p>${T("<code>raytex build</code>, <code>lint</code>, <code>doctor</code>, <code>new</code>…", "<code>raytex build</code>, <code>lint</code>, <code>doctor</code>, <code>new</code>…")}</p></a>
    </div>
  </div>
</section>`;
  },
};
