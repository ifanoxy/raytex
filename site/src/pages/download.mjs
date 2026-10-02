export default {
  id: "download",
  path: "download/",
  title: { en: "Download", fr: "Télécharger" },
  description: {
    en: "Download RayTeX for Windows, macOS (Apple silicon and Intel) or Linux (AppImage, .deb, .rpm). Free and open source; every version is available.",
    fr: "Téléchargez RayTeX pour Windows, macOS (Apple silicon et Intel) ou Linux (AppImage, .deb, .rpm). Libre et gratuit ; toutes les versions sont disponibles.",
  },
  body({ T, icon, url, GITHUB, tex }) {
    const platform = (id, ic, name, sub) => `<article class="dl-platform" id="${id}" data-dl-platform="${id}">
      <header>${icon(ic, 24)}<div><h2>${name}</h2><p>${sub}</p></div><span class="badge detected-badge">${icon("check", 12)} ${T("Your system", "Votre système")}</span></header>
      <div class="dl-files" data-dl-files="${id}"><div class="skeleton"></div><div class="skeleton"></div></div>
    </article>`;
    const code = (text) => `<div class="code-copy"><code>${text}</code><button type="button" class="copy-btn" data-copy="${text.replace(/"/g, "&quot;")}" aria-label="${T("Copy", "Copier")}">${icon("copy", 15)}</button></div>`;
    const os = (ic, name) => `${icon(ic, 16)} ${name}`;

    return `${tex.chapter("B", T("Installation", "Installation"), {
      epigraph: [
        T("The best time to install LaTeX was twenty years ago. The second best time is now.", "Le meilleur moment pour installer LaTeX, c'était il y a vingt ans. Le deuxième meilleur moment, c'est maintenant."),
        T("a TeXnician's proverb", "proverbe de TeXnicien"),
      ],
      lead: T(
        "RayTeX is free, for Windows, macOS and Linux. The files are hosted on GitHub, where every version stays available; the one that suits your computer is suggested first.",
        "RayTeX est gratuit, pour Windows, macOS et Linux. Les fichiers sont hébergés sur GitHub, où chaque version reste disponible ; celui qui convient à votre ordinateur est proposé en premier.",
      ),
    })}

${tex.section(T("Your system", "Votre système"), "system")}
<div class="dl-hero" data-dl-hero data-reveal>
  <div class="dl-hero-text">
    <p class="eyebrow" data-dl-detected>${T("Your system", "Votre système")}</p>
    <h2 data-dl-title>${T("Looking for the latest version…", "Recherche de la dernière version…")}</h2>
    <p class="muted" data-dl-subtitle></p>
  </div>
  <div class="dl-hero-actions">
    <a class="fbox-link big" href="#platforms" data-download-primary>${icon("download", 18)}<span data-download-label>${T("Download", "Télécharger")}</span></a>
    <span class="muted small" data-download-meta></span>
  </div>
</div>

<div class="dl-toolbar" data-reveal>
  <label class="version-picker">${icon("layers", 16)} <span>${T("Version", "Version")}</span>
    <select data-version-select aria-label="${T("Version", "Version")}"><option>…</option></select>
  </label>
  <a class="link-arrow" data-version-notes href="${url("releases/")}">${T("Release notes", "Notes de version")} ${icon("arrow-right", 15)}</a>
  <a class="link-arrow" data-version-sums href="#verify" hidden>${icon("shield", 15)} SHA256SUMS.txt</a>
  <a class="link-arrow" href="${GITHUB}/releases">${icon("github", 15)} ${T("All files on GitHub", "Tous les fichiers sur GitHub")}</a>
</div>
<div class="dl-state" data-dl-state hidden></div>

<div class="dl-grid" id="platforms" data-reveal>
  ${platform("windows", "windows", "Windows", T("Windows 10 and 11, 64-bit", "Windows 10 et 11, 64 bits"))}
  ${platform("macos", "apple", "macOS", T("macOS 11 Big Sur or later", "macOS 11 Big Sur ou plus récent"))}
  ${platform("linux", "linux", "Linux", T("64-bit distributions", "Distributions 64 bits"))}
</div>

${tex.section(T("After downloading", "Après le téléchargement"), "after")}
${tex.note(T("a warning at first launch? normal: RayTeX is not signed yet", "un avertissement au premier lancement ? normal : RayTeX n'est pas encore signé"), { arrow: "left", tilt: -3 })}
<div class="notes" data-reveal>
  <details open><summary data-open="${T("unfold", "déplier")}" data-close="${T("fold", "replier")}">${os("windows", "Windows")}</summary>
    <p>${T("Run the installer. RayTeX is not signed yet: if SmartScreen stops it, click <b>More info</b>, then <b>Run anyway</b>. WebView2, which RayTeX uses to draw its window, is installed with it if it is missing.", "Lancez l'installateur. RayTeX n'est pas encore signé : si SmartScreen l'arrête, cliquez sur <b>Informations complémentaires</b>, puis sur <b>Exécuter quand même</b>. WebView2, qui sert à RayTeX à dessiner sa fenêtre, s'installe avec lui s'il manque.")}</p>
  </details>
  <details><summary data-open="${T("unfold", "déplier")}" data-close="${T("fold", "replier")}">${os("apple", "macOS")}</summary>
    <p>${T("Open the disk image and drag RayTeX into <b>Applications</b>. The first time, right-click RayTeX and choose <b>Open</b> (the application is not notarized yet), or run:", "Ouvrez l'image disque et glissez RayTeX dans <b>Applications</b>. La première fois, faites un clic droit sur RayTeX et choisissez <b>Ouvrir</b> (l'application n'est pas encore notarisée), ou lancez :")}</p>
    ${code("xattr -dr com.apple.quarantine /Applications/RayTeX.app")}
    <p>${T("Not sure which Mac you have? Apple menu → <b>About This Mac</b>: “Chip Apple M…” means Apple silicon, “Processor Intel” means Intel.", "Vous ne savez pas quel Mac vous avez ? Menu Pomme → <b>À propos de ce Mac</b> : « Puce Apple M… » signifie Apple silicon, « Processeur Intel » signifie Intel.")}</p>
  </details>
  <details><summary data-open="${T("unfold", "déplier")}" data-close="${T("fold", "replier")}">${os("linux", "Linux")}</summary>
    <p>${T("The AppImage runs on any distribution:", "L'AppImage fonctionne sur toutes les distributions :")}</p>
    ${code("chmod +x RayTeX_*.AppImage && ./RayTeX_*.AppImage")}
    <p class="noindent">${T("Or install the package of your distribution:", "Ou installez le paquet de votre distribution :")}</p>
    ${code("sudo apt install ./RayTeX_*_amd64.deb")}
    ${code("sudo dnf install ./RayTeX-*.x86_64.rpm")}
  </details>
  <details><summary data-open="${T("unfold", "déplier")}" data-close="${T("fold", "replier")}">${os("packages", T("A TeX distribution", "Une distribution TeX"))}</summary>
    <p>${T("RayTeX compiles with the TeX distribution of your computer (TeX Live, MiKTeX, MacTeX, TinyTeX or Tectonic). If it finds none, its setup assistant installs one and shows the exact commands before running them.", "RayTeX compile avec la distribution TeX de votre ordinateur (TeX Live, MiKTeX, MacTeX, TinyTeX ou Tectonic). S'il n'en trouve aucune, son assistant en installe une et montre les commandes exactes avant de les lancer.")}</p>
  </details>
  <details><summary data-open="${T("unfold", "déplier")}" data-close="${T("fold", "replier")}">${os("terminal", T("Build from source", "Compiler depuis les sources"))}</summary>
    <p>${T("With Rust 1.88+ and Node.js 22.12+ (and the Tauri prerequisites of your system):", "Avec Rust 1.88+ et Node.js 22.12+ (et les prérequis Tauri de votre système) :")}</p>
    ${code(`git clone ${GITHUB}.git && cd raytex && npm install && npm run app:build`)}
  </details>
</div>
<p data-reveal>${T("Next versions come by themselves: at start, RayTeX offers the new one when there is one, with its notes.", "Les versions suivantes viennent toutes seules : au démarrage, RayTeX propose la nouvelle quand il y en a une, avec ses notes.")}</p>

${tex.section(T("Verify a file", "Vérifier un fichier"), "verify")}
${tex.theorem(
  T("Proposition", "Proposition"),
  T("integrity", "intégrité"),
  T("The file you downloaded is exactly the one that was published, built from the public source code.", "Le fichier que vous avez téléchargé est exactement celui qui a été publié, compilé depuis le code source public."),
  `${T("Three checks, from the quickest to the most complete.", "Trois vérifications, de la plus rapide à la plus complète.")}
  ${tex.enumerate([
    `${T("<i>Its fingerprint.</i> Each file of the list above has its SHA-256 fingerprint (the button next to its size). Compute the one of your file and compare:", "<i>Son empreinte.</i> Chaque fichier de la liste ci-dessus a son empreinte SHA-256 (le bouton à côté de sa taille). Calculez celle de votre fichier et comparez :")}
      <span class="code-label">Windows</span>${code(T("certutil -hashfile FILE SHA256", "certutil -hashfile FICHIER SHA256"))}
      <span class="code-label">macOS, Linux</span>${code(T("shasum -a 256 FILE", "shasum -a 256 FICHIER"))}`,
    `${T("<i>Every fingerprint at once.</i> Each version also contains <code>SHA256SUMS.txt</code>, the list of the fingerprints of all its files. In the folder of the download:", "<i>Toutes les empreintes d'un coup.</i> Chaque version contient aussi <code>SHA256SUMS.txt</code>, la liste des empreintes de tous ses fichiers. Dans le dossier du téléchargement :")}
      ${code("sha256sum --ignore-missing -c SHA256SUMS.txt")}`,
    `${T(`<i>Its origin.</i> GitHub certifies that each file was built by the release workflow of the <a href="${GITHUB}">public repository</a>, from the source of that version (with the <a href="https://cli.github.com">GitHub command line</a>):`, `<i>Son origine.</i> GitHub certifie que chaque fichier a été compilé par le processus de publication du <a href="${GITHUB}">dépôt public</a>, depuis les sources de cette version (avec la <a href="https://cli.github.com">ligne de commande GitHub</a>) :`)}
      ${code(T("gh attestation verify FILE --repo ifanoxy/raytex", "gh attestation verify FICHIER --repo ifanoxy/raytex"))}`,
  ])}
  ${T("If the three agree, the file is the published one.", "Si les trois concordent, le fichier est bien celui publié.")}`,
)}
${tex.note(T("click the square at the end of the proof", "cliquez sur le carré à la fin de la démonstration"), { arrow: "up", tilt: 2 })}`;
  },
};
