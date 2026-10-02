import { ray } from "../figures.mjs";

export default {
  id: "about",
  path: "about/",
  title: { en: "About and contributing", fr: "À propos et contribuer" },
  description: {
    en: "Why RayTeX exists, how it is made, and how to take part: bugs, ideas, translations, explanations of errors, templates and code.",
    fr: "Pourquoi RayTeX existe, comment il est fait, et comment y participer : bugs, idées, traductions, explications d'erreurs, modèles et code.",
  },
  body({ T, GITHUB, tex }) {
    const axiom = (title, text) => tex.theorem(T("Axiom", "Axiome"), title, text);
    const tech = [
      ["Rust", T("the engine: log parser, completion, build driver, SyncTeX", "le moteur : analyse des journaux, complétion, pilote de compilation, SyncTeX")],
      ["Tauri", T("the desktop application, light and native", "l'application de bureau, légère et native")],
      ["Svelte", T("the interface", "l'interface")],
      ["CodeMirror", T("the editor", "l'éditeur")],
      ["pdf.js", T("the PDF viewer", "le lecteur PDF")],
      ["KaTeX", T("the live maths preview (and the formulas of this site)", "l'aperçu des formules (et les formules de ce site)")],
    ];
    return `${tex.chapter("F", T("About and contributing", "À propos et contribuer"), {
      stamp: [T("Hand-made", "Fait main"), "violet", 7],
      epigraph: [T("A ray is a Bézier curve that learnt to swim.", "Une raie, c'est une courbe de Bézier qui a appris à nager."), T("the logo", "le logo")],
      lead: T(
        "LaTeX gives beautiful documents, but its error messages scare beginners and slow everyone down. RayTeX was made so that every error is understood, and most are fixed in one click.",
        "LaTeX donne de beaux documents, mais ses messages d'erreur effraient les débutants et ralentissent tout le monde. RayTeX est né pour que chaque erreur soit comprise, et la plupart corrigées en un clic.",
      ),
    })}

${tex.section(T("What guides it", "Ce qui le guide"), "principles")}
<p data-reveal>${T("Four axioms; everything else is derived from them.", "Quatre axiomes ; tout le reste s'en déduit.")}</p>
${axiom(T("explain, don't blame", "expliquer, pas accuser"), T("Every message in plain words, in English and French, with the fix when there is one.", "Chaque message avec des mots simples, en français et en anglais, avec la correction quand il y en a une."))}
${axiom(T("fast for those who know", "rapide pour ceux qui savent"), T("Live compilation, completion from every package, shortcuts for everything.", "Compilation en direct, complétion de chaque package, des raccourcis pour tout."))}
${tex.note(T("independent, but not incompatible", "indépendants, mais pas incompatibles"), { arrow: "left", tilt: -3 })}
${axiom(T("yours", "à vous"), T("Your documents stay on your computer; no account, no telemetry; free and open source.", "Vos documents restent sur votre ordinateur ; pas de compte, pas de télémétrie ; libre et gratuit."))}
${axiom(T("any setup", "toute configuration"), T("Whatever the system and the TeX distribution, RayTeX adapts and helps install what is missing.", "Quels que soient le système et la distribution TeX, RayTeX s'adapte et aide à installer ce qui manque."))}

${tex.section(T("Why “RayTeX”?", "Pourquoi « RayTeX » ?"), "name")}
<p data-reveal>${T(
  "A manta ray — the <em>Ray</em> — gliding with the <span class='texlogo'>T<span>e</span>X</span> logo: something light and calm moving through a sea of commands. The wordmark is typeset by LaTeX itself, in Latin Modern.",
  "Une raie manta — <em>ray</em> en anglais — qui glisse avec le logo <span class='texlogo'>T<span>e</span>X</span> : quelque chose de léger et de calme au milieu d'un océan de commandes. Le logotype est composé par LaTeX lui-même, en Latin Modern.",
)}</p>
${tex.figure(`<div class="ray-figure">${ray()}</div>`, T("<i>Mobula texensis</i>, observed gliding over a <code>.tex</code> file.", "<i>Mobula texensis</i>, observée planant au-dessus d'un fichier <code>.tex</code>."), "figure-tikz")}

${tex.section(T("How it is made", "Comment il est fait"), "made")}
${tex.table([T("Component", "Composant"), T("Role", "Rôle")], tech.map(([n, d]) => [`<b>${n}</b>`, d]), T("The building blocks of RayTeX.", "Les briques de RayTeX."))}
<p data-reveal>${T(
  `The engine is a Rust library with no interface (it also powers the <code>raytex</code> command line); the application is tested on Linux, macOS and Windows, with TeX Live and MiKTeX, down to real scenarios run in the application itself. The details are in the <a href="${GITHUB}/blob/main/docs/ARCHITECTURE.md">architecture document</a>.`,
  `Le moteur est une bibliothèque Rust sans interface (elle sert aussi à la ligne de commande <code>raytex</code>) ; l'application est testée sous Linux, macOS et Windows, avec TeX Live et MiKTeX, jusqu'à de vrais scénarios joués dans l'application elle-même. Les détails sont dans le <a href="${GITHUB}/blob/main/docs/ARCHITECTURE.md">document d'architecture</a>.`,
)}</p>

${tex.section(T("Everyone can help", "Tout le monde peut aider"), "contributing")}
<p data-reveal>${T("No need to write Rust: a clear bug report, a better explanation or a template helps as much.", "Pas besoin d'écrire du Rust : un rapport de bug clair, une meilleure explication ou un modèle aident tout autant.")}</p>
${tex.note(T("every contribution counts — even a typo", "chaque contribution compte — même une coquille"), { arrow: "left", tilt: -2 })}
${tex.description([
  [`<a href="${GITHUB}/issues/new/choose">${T("Report a bug", "Signaler un bug")}</a>`, T("The steps, your system and your distribution.", "Les étapes, votre système et votre distribution.")],
  [`<a href="${GITHUB}/issues/new/choose">${T("Suggest an idea", "Proposer une idée")}</a>`, T("A feature, a shortcut, a missing template?", "Une fonctionnalité, un raccourci, un modèle manquant ?")],
  [`<a href="${GITHUB}/blob/main/CONTRIBUTING.md">${T("Improve the texts", "Améliorer les textes")}</a>`, T("Translations, explanations of errors, help guides: plain data files, no build needed.", "Traductions, explications d'erreurs, guides d'aide : de simples fichiers de données, sans rien compiler.")],
  [`<a href="${GITHUB}/blob/main/CONTRIBUTING.md">${T("Send code", "Envoyer du code")}</a>`, T("Rust, Svelte, tests: the contribution guide explains everything.", "Rust, Svelte, tests : le guide de contribution explique tout.")],
])}
<p data-reveal>${T(
  `Taking part means following the <a href="${GITHUB}/blob/main/CODE_OF_CONDUCT.md">code of conduct</a>. Security problems are reported <a href="${GITHUB}/security/policy">privately</a>.`,
  `Participer, c'est respecter le <a href="${GITHUB}/blob/main/CODE_OF_CONDUCT.md">code de conduite</a>. Les problèmes de sécurité se signalent <a href="${GITHUB}/security/policy">en privé</a>.`,
)}</p>`;
  },
};
