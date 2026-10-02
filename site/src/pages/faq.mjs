export default {
  id: "faq",
  path: "faq/",
  title: { en: "FAQ", fr: "FAQ" },
  description: {
    en: "Answers about RayTeX: price, systems, TeX distributions, offline use, privacy, updates, Overleaf projects, bugs and contributing.",
    fr: "Réponses sur RayTeX : prix, systèmes, distributions TeX, usage hors ligne, confidentialité, mises à jour, projets Overleaf, bugs et contributions.",
  },
  body({ T, url, GITHUB, tex }) {
    // The chapter first: the exercises are numbered within it (E.1, E.2…).
    const head = tex.chapter("E", T("Frequently asked questions", "Questions fréquentes"), {
      stamp: [T("Corrected", "Corrigé"), "red", -9],
      epigraph: [T("There are no silly questions, only overfull boxes.", "Il n'y a pas de question bête, seulement des boîtes trop pleines."), T("the ray", "la raie")],
      lead: T("Set as exercises, with their solutions — folded, as at the end of a good textbook.", "Présentées en exercices, avec leurs solutions — repliées, comme à la fin d'un bon manuel."),
    });
    const ex = (q, a, open = false) => tex.exercise(q, a, open).replace("<summary>", `<summary data-open="${T("see the solution", "voir la solution")}" data-close="${T("hide", "masquer")}">`);
    const groups = [
      [
        T("Using RayTeX", "Utiliser RayTeX"),
        "use",
        [
          ex(T("Is RayTeX free?", "RayTeX est-il gratuit ?"), T(`${tex.hl("Yes, completely.", "green")} It is open-source software under the MIT or Apache 2.0 license (your choice): free to use, share and change, for personal, school or professional work.`, `${tex.hl("Oui, entièrement.", "green")} C'est un logiciel libre sous licence MIT ou Apache 2.0 (au choix) : libre d'utilisation, de partage et de modification, pour un usage personnel, scolaire ou professionnel.`), true),
          ex(T("Which systems does it run on?", "Sur quels systèmes fonctionne-t-il ?"), T("Windows 10 and 11 (64-bit), macOS 11 Big Sur or later (Apple silicon and Intel) and 64-bit Linux (AppImage, .deb, .rpm). There is no mobile version.", "Windows 10 et 11 (64 bits), macOS 11 Big Sur ou plus récent (Apple silicon et Intel) et Linux 64 bits (AppImage, .deb, .rpm). Il n'y a pas de version mobile.")),
          ex(T("Do I need to install LaTeX?", "Faut-il installer LaTeX ?"), T("RayTeX is the editor; compiling needs a TeX distribution (TeX Live, MiKTeX, MacTeX, TinyTeX or Tectonic). If none is installed, RayTeX's setup assistant installs one, showing the commands first. Tectonic is the lightest; TeX Live and MiKTeX are the most complete.", "RayTeX est l'éditeur ; la compilation a besoin d'une distribution TeX (TeX Live, MiKTeX, MacTeX, TinyTeX ou Tectonic). S'il n'y en a aucune, l'assistant de RayTeX en installe une en montrant d'abord les commandes. Tectonic est la plus légère ; TeX Live et MiKTeX sont les plus complètes.")),
          ex(T("Does it work without Internet?", "Fonctionne-t-il sans Internet ?"), T("Yes. Writing, compiling and reading the PDF happen on your computer. The network is only used to browse the CTAN catalogue, to install packages or a distribution, and to look for a new version at start (which can be turned off).", "Oui. L'écriture, la compilation et la lecture du PDF se font sur votre ordinateur. Le réseau ne sert qu'à parcourir le catalogue CTAN, à installer des packages ou une distribution, et à chercher une nouvelle version au démarrage (ce qui se désactive).")),
          ex(T("Can I open my Overleaf projects?", "Puis-je ouvrir mes projets Overleaf ?"), T("Yes: in Overleaf, <b>Menu → Download → Source</b> gives a zip of the project. Unzip it and open the folder in RayTeX — it is ordinary LaTeX.", "Oui : dans Overleaf, <b>Menu → Télécharger → Source</b> donne un zip du projet. Décompressez-le et ouvrez le dossier dans RayTeX — c'est du LaTeX ordinaire.")),
          ex(T("Which languages?", "Quelles langues ?"), T("The interface, the explanations of errors, the templates and the help are in English and French. Documents can be written in any language LaTeX supports (babel, polyglossia).", "L'interface, les explications des erreurs, les modèles et l'aide sont en français et en anglais. Les documents peuvent être écrits dans toutes les langues que LaTeX prend en charge (babel, polyglossia).")),
        ],
      ],
      [
        T("Installing and updating", "Installer et mettre à jour"),
        "install",
        [
          ex(T("Why does Windows or macOS warn me?", "Pourquoi Windows ou macOS m'avertit-il ?"), T(`The builds are not signed with a paid certificate yet, so the system asks for a confirmation the first time. The <a href="${url("download/")}">download page</a> explains what to click, and how to <a href="${url("download/")}#verify">verify a file</a> (fingerprint and origin).`, `Les versions ne sont pas encore signées avec un certificat payant, le système demande donc une confirmation la première fois. La <a href="${url("download/")}">page de téléchargement</a> explique où cliquer, et comment <a href="${url("download/")}#verify">vérifier un fichier</a> (empreinte et origine).`)),
          ex(T("Apple silicon or Intel?", "Apple silicon ou Intel ?"), T("Apple menu → <b>About This Mac</b>. “Chip Apple M1/M2/M3/M4…” means Apple silicon; “Processor Intel…” means Intel. The site guesses it, but cannot always tell.", "Menu Pomme → <b>À propos de ce Mac</b>. « Puce Apple M1/M2/M3/M4… » signifie Apple silicon ; « Processeur Intel… » signifie Intel. Le site essaie de le deviner, mais ne le peut pas toujours.")),
          ex(T("How do I update?", "Comment mettre à jour ?"), T(`RayTeX does it: at start, it asks GitHub whether a new version exists and, if so, shows its notes — <b>Update now</b>, <b>Later</b> or <b>Skip this version</b>. Your settings, projects and templates are kept. (Version 0.1.0 does not do it yet: install the next one by hand, once.) The <a href="${url("releases/")}">versions page</a> lists what changed.`, `RayTeX s'en charge : au démarrage, il demande à GitHub si une nouvelle version existe et, si oui, montre ses notes — <b>Mettre à jour</b>, <b>Plus tard</b> ou <b>Ignorer cette version</b>. Vos réglages, projets et modèles sont conservés. (La version 0.1.0 ne le fait pas encore : installez la suivante à la main, une fois.) La <a href="${url("releases/")}">page des versions</a> liste ce qui a changé.`)),
          ex(T("Can I get an older version?", "Puis-je obtenir une ancienne version ?"), T(`Yes: pick it in the version list of the <a href="${url("download/")}">download page</a>, or on the <a href="${url("releases/")}">versions page</a>.`, `Oui : choisissez-la dans la liste des versions de la <a href="${url("download/")}">page de téléchargement</a>, ou sur la <a href="${url("releases/")}">page des versions</a>.`)),
          ex(T("How do I uninstall it?", "Comment le désinstaller ?"), T("Like any application: <b>Settings → Apps</b> on Windows, drag it to the Trash on macOS, your package manager on Linux. Your projects stay in <code>Documents/RayTeX</code>.", "Comme toute application : <b>Paramètres → Applications</b> sous Windows, glissez-la dans la Corbeille sous macOS, votre gestionnaire de paquets sous Linux. Vos projets restent dans <code>Documents/RayTeX</code>.")),
        ],
      ],
      [
        T("Privacy and project", "Confidentialité et projet"),
        "project",
        [
          ex(T("Does RayTeX collect data?", "RayTeX collecte-t-il des données ?"), T(`${tex.hl("No.", "green")} No account, no telemetry, no statistics: your documents never leave your computer. See the <a href="${url("privacy/")}">privacy policy</a>.`, `${tex.hl("Non.", "green")} Pas de compte, pas de télémétrie, pas de statistiques : vos documents ne quittent jamais votre ordinateur. Voir la <a href="${url("privacy/")}">politique de confidentialité</a>.`)),
          ex(T("I found a bug. What do I do?", "J'ai trouvé un bug. Que faire ?"), T(`Open an issue on <a href="${GITHUB}/issues/new/choose">GitHub</a> with the steps to reproduce it, your system and your TeX distribution. For a security problem, use a <a href="${GITHUB}/security/advisories/new">private report</a> instead.`, `Ouvrez un ticket sur <a href="${GITHUB}/issues/new/choose">GitHub</a> avec les étapes pour le reproduire, votre système et votre distribution TeX. Pour un problème de sécurité, faites plutôt un <a href="${GITHUB}/security/advisories/new">signalement privé</a>.`)),
          ex(T("How can I help?", "Comment aider ?"), T(`Report bugs, suggest ideas, improve the translations, the explanations of errors or the templates, or send code: see <a href="${url("about/")}">About and contributing</a>.`, `Signalez des bugs, proposez des idées, améliorez les traductions, les explications d'erreurs ou les modèles, ou envoyez du code : voir <a href="${url("about/")}">À propos et contribuer</a>.`)),
          ex(T("Is there anything hidden in this site?", "Ce site cache-t-il quelque chose ?"), T("Perhaps. A hint: TeX's own name, typed on the keyboard. And the console of your browser talks.", "Peut-être. Un indice : le nom de TeX lui-même, tapé au clavier. Et la console de votre navigateur parle.")),
        ],
      ],
    ];
    return `${head}
${groups.map(([title, id, items], i) => `${tex.section(title, id)}${i === 0 ? tex.note(T("solutions at the back of the book… or one click away", "solutions en fin d'ouvrage… ou à un clic"), { arrow: "left", tilt: -3 }) : ""}<div class="exercises">${items.join("")}</div>`).join("\n")}
<p class="center" data-reveal>${T(`Another question? Ask it on <a href="${GITHUB}/issues">GitHub</a>.`, `Une autre question ? Posez-la sur <a href="${GITHUB}/issues">GitHub</a>.`)}</p>`;
  },
};
