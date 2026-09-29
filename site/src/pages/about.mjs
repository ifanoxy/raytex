import { pageHead } from "../util.mjs";

export default {
  id: "about",
  path: "about/",
  title: { en: "About and contributing", fr: "À propos et contribuer" },
  description: {
    en: "Why RayTeX exists, how it is made, and how to take part: bugs, ideas, translations, explanations of errors, templates and code.",
    fr: "Pourquoi RayTeX existe, comment il est fait, et comment y participer : bugs, idées, traductions, explications d'erreurs, modèles et code.",
  },
  body({ T, icon, GITHUB }) {
    const way = (ic, title, text, href, link) =>
      `<a class="card link-card" href="${href}" data-reveal data-spotlight>${icon(ic, 22)}<h3>${title}</h3><p>${text}</p><span class="more">${link} ${icon("arrow-right", 15)}</span></a>`;
    const tech = [
      ["Rust", T("the engine: log parser, completion, build driver, SyncTeX", "le moteur : analyse des journaux, complétion, pilote de compilation, SyncTeX")],
      ["Tauri", T("the desktop application, light and native", "l'application de bureau, légère et native")],
      ["Svelte", T("the interface", "l'interface")],
      ["CodeMirror", T("the editor", "l'éditeur")],
      ["pdf.js", T("the PDF viewer", "le lecteur PDF")],
      ["KaTeX", T("the live maths preview", "l'aperçu des formules")],
    ];
    return `${pageHead(
      T("About", "À propos"),
      T("A LaTeX editor that teaches as it helps", "Un éditeur LaTeX qui apprend en aidant"),
      T("LaTeX gives beautiful documents, but its error messages scare beginners and slow everyone down. RayTeX was made so that every error is understood and most are fixed in one click.", "LaTeX donne de beaux documents, mais ses messages d'erreur effraient les débutants et ralentissent tout le monde. RayTeX est né pour que chaque erreur soit comprise, et la plupart corrigées en un clic."),
    )}
<section class="section tight">
  <div class="container narrow prose" data-reveal>
    <h2>${T("What guides it", "Ce qui le guide")}</h2>
    <ul>
      <li>${T("<b>Explain, don't blame.</b> Every message in plain words, in English and French, with the fix when there is one.", "<b>Expliquer, pas accuser.</b> Chaque message avec des mots simples, en français et en anglais, avec la correction quand il y en a une.")}</li>
      <li>${T("<b>Fast for those who know.</b> Live compilation, completion from every package, shortcuts for everything.", "<b>Rapide pour ceux qui savent.</b> Compilation en direct, complétion de chaque package, des raccourcis pour tout.")}</li>
      <li>${T("<b>Yours.</b> Your documents stay on your computer; no account, no telemetry; free and open source.", "<b>À vous.</b> Vos documents restent sur votre ordinateur ; pas de compte, pas de télémétrie ; libre et gratuit.")}</li>
      <li>${T("<b>Any setup.</b> Whatever the system and the TeX distribution, RayTeX adapts and helps install what is missing.", "<b>Toute configuration.</b> Quels que soient le système et la distribution TeX, RayTeX s'adapte et aide à installer ce qui manque.")}</li>
    </ul>
    <h2>${T("Why “RayTeX”?", "Pourquoi « RayTeX » ?")}</h2>
    <p>${T("A manta ray — the <em>Ray</em> — gliding with the \\TeX logo, typeset by LaTeX itself: something light and calm moving through a sea of commands.", "Une raie manta — <em>ray</em> en anglais — qui glisse avec le logo \\TeX, composé par LaTeX lui-même : quelque chose de léger et de calme au milieu d'un océan de commandes.")}</p>
    <h2>${T("How it is made", "Comment il est fait")}</h2>
    <ul class="tech">${tech.map(([n, d]) => `<li><b>${n}</b> — ${d}</li>`).join("")}</ul>
    <p>${T(`The engine is a Rust library with no interface (it also powers the <code>raytex</code> command line); the application is tested on Linux, macOS and Windows, with TeX Live and MiKTeX, down to real scenarios run in the application itself. The details are in the <a href="${GITHUB}/blob/main/docs/ARCHITECTURE.md">architecture document</a>.`, `Le moteur est une bibliothèque Rust sans interface (elle sert aussi à la ligne de commande <code>raytex</code>) ; l'application est testée sous Linux, macOS et Windows, avec TeX Live et MiKTeX, jusqu'à de vrais scénarios joués dans l'application elle-même. Les détails sont dans le <a href="${GITHUB}/blob/main/docs/ARCHITECTURE.md">document d'architecture</a>.`)}</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head" data-reveal><p class="eyebrow">${T("Contributing", "Contribuer")}</p><h2>${T("Everyone can help", "Tout le monde peut aider")}</h2><p class="lead">${T("No need to write Rust: a clear bug report, a better explanation or a template helps as much.", "Pas besoin d'écrire du Rust : un rapport de bug clair, une meilleure explication ou un modèle aident tout autant.")}</p></div>
    <div class="link-cards four">
      ${way("bug", T("Report a bug", "Signaler un bug"), T("The steps, your system and your distribution.", "Les étapes, votre système et votre distribution."), `${GITHUB}/issues/new/choose`, T("Open an issue", "Ouvrir un ticket"))}
      ${way("lightbulb", T("Suggest an idea", "Proposer une idée"), T("A feature, a shortcut, a missing template?", "Une fonctionnalité, un raccourci, un modèle manquant ?"), `${GITHUB}/issues/new/choose`, T("Suggest", "Proposer"))}
      ${way("globe", T("Improve the texts", "Améliorer les textes"), T("Translations, explanations of errors, help guides: plain data files, no build needed.", "Traductions, explications d'erreurs, guides d'aide : de simples fichiers de données, sans rien compiler."), `${GITHUB}/blob/main/CONTRIBUTING.md`, T("How to", "Comment faire"))}
      ${way("code", T("Send code", "Envoyer du code"), T("Rust, Svelte, tests: the contribution guide explains everything.", "Rust, Svelte, tests : le guide de contribution explique tout."), `${GITHUB}/blob/main/CONTRIBUTING.md`, T("Contributing guide", "Guide de contribution"))}
    </div>
    <p class="muted small center" data-reveal>${T(`Taking part means following the <a href="${GITHUB}/blob/main/CODE_OF_CONDUCT.md">code of conduct</a>. Security problems are reported <a href="${GITHUB}/security/policy">privately</a>.`, `Participer, c'est respecter le <a href="${GITHUB}/blob/main/CODE_OF_CONDUCT.md">code de conduite</a>. Les problèmes de sécurité se signalent <a href="${GITHUB}/security/policy">en privé</a>.`)}</p>
  </div>
</section>`;
  },
};
