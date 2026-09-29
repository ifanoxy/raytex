import { pageHead } from "../util.mjs";

export default {
  id: "faq",
  path: "faq/",
  title: { en: "FAQ", fr: "FAQ" },
  description: {
    en: "Answers about RayTeX: price, systems, TeX distributions, offline use, privacy, updates, Overleaf projects, bugs and contributing.",
    fr: "Réponses sur RayTeX : prix, systèmes, distributions TeX, usage hors ligne, confidentialité, mises à jour, projets Overleaf, bugs et contributions.",
  },
  body({ T, url, GITHUB }) {
    const qa = (q, a, open = false) => `<details data-reveal${open ? " open" : ""}><summary>${q}</summary>${a}</details>`;
    const groups = [
      [
        T("Using RayTeX", "Utiliser RayTeX"),
        [
          qa(T("Is RayTeX free?", "RayTeX est-il gratuit ?"), `<p>${T("Yes, completely. It is open-source software under the MIT or Apache 2.0 license (your choice): free to use, share and change, for personal, school or professional work.", "Oui, entièrement. C'est un logiciel libre sous licence MIT ou Apache 2.0 (au choix) : libre d'utilisation, de partage et de modification, pour un usage personnel, scolaire ou professionnel.")}</p>`, true),
          qa(T("Which systems does it run on?", "Sur quels systèmes fonctionne-t-il ?"), `<p>${T("Windows 10 and 11 (64-bit), macOS 11 Big Sur or later (Apple silicon and Intel) and 64-bit Linux (AppImage, .deb, .rpm). There is no mobile version.", "Windows 10 et 11 (64 bits), macOS 11 Big Sur ou plus récent (Apple silicon et Intel) et Linux 64 bits (AppImage, .deb, .rpm). Il n'y a pas de version mobile.")}</p>`),
          qa(T("Do I need to install LaTeX?", "Faut-il installer LaTeX ?"), `<p>${T("RayTeX is the editor; compiling needs a TeX distribution (TeX Live, MiKTeX, MacTeX, TinyTeX or Tectonic). If none is installed, RayTeX's setup assistant installs one, showing the commands first. Tectonic is the lightest; TeX Live and MiKTeX are the most complete.", "RayTeX est l'éditeur ; la compilation a besoin d'une distribution TeX (TeX Live, MiKTeX, MacTeX, TinyTeX ou Tectonic). S'il n'y en a aucune, l'assistant de RayTeX en installe une en montrant d'abord les commandes. Tectonic est la plus légère ; TeX Live et MiKTeX sont les plus complètes.")}</p>`),
          qa(T("Does it work without Internet?", "Fonctionne-t-il sans Internet ?"), `<p>${T("Yes. Writing, compiling and reading the PDF happen on your computer. The network is only used to browse the CTAN catalogue and to install packages or a distribution.", "Oui. L'écriture, la compilation et la lecture du PDF se font sur votre ordinateur. Le réseau ne sert qu'à parcourir le catalogue CTAN et à installer des packages ou une distribution.")}</p>`),
          qa(T("Can I open my Overleaf projects?", "Puis-je ouvrir mes projets Overleaf ?"), `<p>${T("Yes: in Overleaf, <b>Menu → Download → Source</b> gives a zip of the project. Unzip it and open the folder in RayTeX — it is ordinary LaTeX.", "Oui : dans Overleaf, <b>Menu → Télécharger → Source</b> donne un zip du projet. Décompressez-le et ouvrez le dossier dans RayTeX — c'est du LaTeX ordinaire.")}</p>`),
          qa(T("Which languages?", "Quelles langues ?"), `<p>${T("The interface, the explanations of errors, the templates and the help are in English and French. Documents can be written in any language LaTeX supports (babel, polyglossia).", "L'interface, les explications des erreurs, les modèles et l'aide sont en français et en anglais. Les documents peuvent être écrits dans toutes les langues que LaTeX prend en charge (babel, polyglossia).")}</p>`),
        ],
      ],
      [
        T("Installing and updating", "Installer et mettre à jour"),
        [
          qa(T("Why does Windows or macOS warn me?", "Pourquoi Windows ou macOS m'avertit-il ?"), `<p>${T(`The builds are not signed with a paid certificate yet, so the system asks for a confirmation the first time. The <a href="${url("download/")}">download page</a> explains what to click. Each file comes with its SHA-256 fingerprint to check it.`, `Les versions ne sont pas encore signées avec un certificat payant, le système demande donc une confirmation la première fois. La <a href="${url("download/")}">page de téléchargement</a> explique où cliquer. Chaque fichier a son empreinte SHA-256 pour le vérifier.`)}</p>`),
          qa(T("Apple silicon or Intel?", "Apple silicon ou Intel ?"), `<p>${T("Apple menu → <b>About This Mac</b>. “Chip Apple M1/M2/M3/M4…” means Apple silicon; “Processor Intel…” means Intel. The site guesses it, but cannot always tell.", "Menu Pomme → <b>À propos de ce Mac</b>. « Puce Apple M1/M2/M3/M4… » signifie Apple silicon ; « Processeur Intel… » signifie Intel. Le site essaie de le deviner, mais ne le peut pas toujours.")}</p>`),
          qa(T("How do I update?", "Comment mettre à jour ?"), `<p>${T(`Download the new version and install it over the old one: settings, projects and templates are kept. The <a href="${url("releases/")}">versions page</a> lists what changed.`, `Téléchargez la nouvelle version et installez-la par-dessus l'ancienne : réglages, projets et modèles sont conservés. La <a href="${url("releases/")}">page des versions</a> liste ce qui a changé.`)}</p>`),
          qa(T("Can I get an older version?", "Puis-je obtenir une ancienne version ?"), `<p>${T(`Yes: pick it in the version list of the <a href="${url("download/")}">download page</a>, or on the <a href="${url("releases/")}">versions page</a>.`, `Oui : choisissez-la dans la liste des versions de la <a href="${url("download/")}">page de téléchargement</a>, ou sur la <a href="${url("releases/")}">page des versions</a>.`)}</p>`),
          qa(T("How do I uninstall it?", "Comment le désinstaller ?"), `<p>${T("Like any application: <b>Settings → Apps</b> on Windows, drag it to the Trash on macOS, your package manager on Linux. Your projects stay in <code>Documents/RayTeX</code>.", "Comme toute application : <b>Paramètres → Applications</b> sous Windows, glissez-la dans la Corbeille sous macOS, votre gestionnaire de paquets sous Linux. Vos projets restent dans <code>Documents/RayTeX</code>.")}</p>`),
        ],
      ],
      [
        T("Privacy and project", "Confidentialité et projet"),
        [
          qa(T("Does RayTeX collect data?", "RayTeX collecte-t-il des données ?"), `<p>${T(`No. No account, no telemetry, no statistics: your documents never leave your computer. See the <a href="${url("privacy/")}">privacy policy</a>.`, `Non. Pas de compte, pas de télémétrie, pas de statistiques : vos documents ne quittent jamais votre ordinateur. Voir la <a href="${url("privacy/")}">politique de confidentialité</a>.`)}</p>`),
          qa(T("I found a bug. What do I do?", "J'ai trouvé un bug. Que faire ?"), `<p>${T(`Open an issue on <a href="${GITHUB}/issues/new/choose">GitHub</a> with the steps to reproduce it, your system and your TeX distribution. For a security problem, use a <a href="${GITHUB}/security/advisories/new">private report</a> instead.`, `Ouvrez un ticket sur <a href="${GITHUB}/issues/new/choose">GitHub</a> avec les étapes pour le reproduire, votre système et votre distribution TeX. Pour un problème de sécurité, faites plutôt un <a href="${GITHUB}/security/advisories/new">signalement privé</a>.`)}</p>`),
          qa(T("How can I help?", "Comment aider ?"), `<p>${T(`Report bugs, suggest ideas, improve the translations, the explanations of errors or the templates, or send code: see <a href="${url("about/")}">About and contributing</a>.`, `Signalez des bugs, proposez des idées, améliorez les traductions, les explications d'erreurs ou les modèles, ou envoyez du code : voir <a href="${url("about/")}">À propos et contribuer</a>.`)}</p>`),
        ],
      ],
    ];
    return `${pageHead(T("FAQ", "FAQ"), T("Frequently asked questions", "Questions fréquentes"))}
<section class="section tight">
  <div class="container narrow">
    ${groups.map(([title, items]) => `<h2 class="h3 faq-group" data-reveal>${title}</h2><div class="faq-list">${items.join("")}</div>`).join("")}
    <p class="muted center" data-reveal>${T(`Another question? Ask it on <a href="${GITHUB}/issues">GitHub</a>.`, `Une autre question ? Posez-la sur <a href="${GITHUB}/issues">GitHub</a>.`)}</p>
  </div>
</section>`;
  },
};
