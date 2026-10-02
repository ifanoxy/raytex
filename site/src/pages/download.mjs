export default {
  id: "download",
  path: "download/",
  title: { en: "Download", fr: "Télécharger" },
  description: {
    en: "Download RayTeX for Windows, macOS (Apple silicon and Intel) or Linux (AppImage, .deb, .rpm), and install it in three steps. Free and open source; every version is available.",
    fr: "Téléchargez RayTeX pour Windows, macOS (Apple silicon et Intel) ou Linux (AppImage, .deb, .rpm), et installez-le en trois étapes. Libre et gratuit ; toutes les versions sont disponibles.",
  },
  body({ T, icon, url, GITHUB, tex }) {
    const code = (text) => `<div class="code-copy"><code>${text}</code><button type="button" class="copy-btn" data-copy="${text.replace(/"/g, "&quot;")}" aria-label="${T("Copy", "Copier")}">${icon("copy", 15)}</button></div>`;
    const file = (os, sample) => `<code class="filename" data-dl-filename="${os}">${sample}</code>`;
    // A step: its number circled by hand, a title, what to do.
    const step = (n, title, body) => `<li class="step" data-reveal>
      <span class="step-num" aria-hidden="true"><span class="hand">${n}</span><svg viewBox="0 0 52 52"><path class="draw-me" d="M27 4 C 12 3, 4 14, 5 27 C 6 41, 17 49, 29 47 C 42 45, 49 35, 47 22 C 45 11, 36 4, 22 6"/></svg></span>
      <div class="step-body"><h3>${title}</h3>${body}</div>
    </li>`;
    const download = (os) => `<div class="dl-main">
        <a class="fbox-link big solid" data-dl-main="${os}" href="${GITHUB}/releases/latest">${icon("download", 18)}<span data-dl-main-label>${T("Download", "Télécharger")}</span></a>
        <span class="dl-main-meta" data-dl-main-meta="${os}"></span>
      </div>
      ${os === "macos" ? `<p class="dl-alt" data-dl-alt="macos" hidden></p><p class="step-aside hand">${T("which Mac? Apple menu → About This Mac: an “Apple M…” chip or an Intel processor", "quel Mac ? menu Pomme → À propos de ce Mac : puce « Apple M… » ou processeur Intel")}</p>` : ""}
      <details class="dl-more"><summary data-open="${T("see them", "les voir")}" data-close="${T("hide", "masquer")}">${T("Other formats", "Autres formats")}</summary><div class="dl-files" data-dl-files="${os}"><div class="skeleton"></div></div></details>`;
    const write = step(
      3,
      T("Write", "Écrire"),
      `<p>${T(
        `Open RayTeX. If LaTeX is not on your computer yet, its assistant offers the distribution that suits it and ${tex.hl("shows each command before running it")}. Then <b>New project</b>, a template, and your first PDF.`,
        `Ouvrez RayTeX. Si LaTeX n'est pas encore sur votre ordinateur, son assistant propose la distribution qui lui convient et ${tex.hl("montre chaque commande avant de la lancer")}. Ensuite <b>Nouveau projet</b>, un modèle, et votre premier PDF.`,
      )}</p><p class="step-aside hand ink-green">${T("the next versions install themselves", "les versions suivantes s'installent toutes seules")}</p>`,
    );
    const panel = (os, install) => `<div class="os-panel" role="tabpanel" id="panel-${os}" aria-labelledby="tab-${os}" data-os-panel="${os}"${os === "windows" ? "" : " hidden"}>
  <ol class="steps">
    ${step(1, T("Download", "Télécharger"), download(os))}
    ${step(2, T("Install", "Installer"), install)}
    ${write}
  </ol>
</div>`;
    const tab = (os, ic, name) =>
      `<button type="button" role="tab" class="os-tab" id="tab-${os}" aria-controls="panel-${os}" aria-selected="${os === "windows"}" data-os-tab="${os}">${icon(ic, 20)}<span>${name}</span><span class="os-you hand">${T("your system", "votre système")}</span></button>`;

    return `${tex.chapter("B", T("Installation", "Installation"), {
      stamp: [T("Free", "Gratuit"), "green", -7],
      lead: T(
        `Three steps, two minutes. RayTeX is ${tex.underline("free", "green")}, for Windows, macOS and Linux; the file that suits your computer comes first.`,
        `Trois étapes, deux minutes. RayTeX est ${tex.underline("gratuit", "green")}, pour Windows, macOS et Linux ; le fichier qui convient à votre ordinateur vient en premier.`,
      ),
    })}

${tex.section(T("Choose, download, install", "Choisir, télécharger, installer"), "system")}
<div class="os-tabs" role="tablist" aria-label="${T("System", "Système")}" data-reveal>
  ${tab("windows", "windows", "Windows")}
  ${tab("macos", "apple", "macOS")}
  ${tab("linux", "linux", "Linux")}
</div>
<p class="dl-version" data-dl-version>${T("Looking for the latest version…", "Recherche de la dernière version…")}</p>
<p class="dl-mobile hand ink-red" data-dl-mobile hidden>${T("RayTeX runs on computers: choose the system of the one you will install it on.", "RayTeX s'installe sur un ordinateur : choisissez le système de celui que vous utiliserez.")}</p>
<div class="dl-state" data-dl-state hidden></div>

${panel(
  "windows",
  `${tex.enumerate(
    [
      T(`Open the downloaded file, ${file("windows", "RayTeX_x64-setup.exe")}, from your <b>Downloads</b> folder.`, `Ouvrez le fichier téléchargé, ${file("windows", "RayTeX_x64-setup.exe")}, depuis votre dossier <b>Téléchargements</b>.`),
      T(
        `Windows says “Windows protected your PC”? Click ${tex.hl("<b>More info</b>")}, then ${tex.hl("<b>Run anyway</b>")}.`,
        `Windows affiche « Windows a protégé votre ordinateur » ? Cliquez sur ${tex.hl("<b>Informations complémentaires</b>")}, puis sur ${tex.hl("<b>Exécuter quand même</b>")}.`,
      ),
      T("Follow the installer: RayTeX is then in the Start menu. WebView2, which draws its window, comes with it if it is missing.", "Suivez l'installateur : RayTeX est ensuite dans le menu Démarrer. WebView2, qui dessine sa fenêtre, s'installe avec lui s'il manque."),
    ],
    "arabic",
  )}<p class="step-aside hand ink-red">${T("a warning? normal: RayTeX is not signed yet", "un avertissement ? normal : RayTeX n'est pas encore signé")}</p>`,
)}
${panel(
  "macos",
  `${tex.enumerate(
    [
      T(`Open ${file("macos", "RayTeX.dmg")} and drag RayTeX into the <b>Applications</b> folder.`, `Ouvrez ${file("macos", "RayTeX.dmg")} et glissez RayTeX dans le dossier <b>Applications</b>.`),
      T(
        `The first time, macOS may refuse to open it (it is not notarized yet): ${tex.hl("<b>System Settings → Privacy &amp; Security → Open Anyway</b>")}. Or, in the Terminal:`,
        `La première fois, macOS peut refuser de l'ouvrir (il n'est pas encore notarisé) : ${tex.hl("<b>Réglages Système → Confidentialité et sécurité → Ouvrir quand même</b>")}. Ou, dans le Terminal :`,
      ) + code("xattr -dr com.apple.quarantine /Applications/RayTeX.app"),
      T("RayTeX is then in Launchpad and in Applications.", "RayTeX est ensuite dans le Launchpad et dans Applications."),
    ],
    "arabic",
  )}`,
)}
${panel(
  "linux",
  `${tex.enumerate(
    [
      T(`Make ${file("linux", "RayTeX.AppImage")} executable and run it — it works on any distribution:`, `Rendez ${file("linux", "RayTeX.AppImage")} exécutable et lancez-la — elle fonctionne sur toutes les distributions :`) +
        code("chmod +x RayTeX_*.AppImage && ./RayTeX_*.AppImage"),
      T("Or install the package of your distribution (in <i>Other formats</i>):", "Ou installez le paquet de votre distribution (dans <i>Autres formats</i>) :") +
        `<span class="code-label">Debian, Ubuntu, Mint</span>${code("sudo apt install ./RayTeX_*_amd64.deb")}<span class="code-label">Fedora, openSUSE</span>${code("sudo dnf install ./RayTeX-*.x86_64.rpm")}`,
    ],
    "arabic",
  )}`,
)}

${tex.section(T("Every version", "Toutes les versions"), "versions")}
<p data-reveal>${T("Need a particular version? Choose it: the buttons above follow.", "Besoin d'une version précise ? Choisissez-la : les boutons ci-dessus suivent.")}</p>
<div class="dl-toolbar" data-reveal>
  <label class="version-picker">${icon("layers", 16)} <span>${T("Version", "Version")}</span>
    <select data-version-select aria-label="${T("Version", "Version")}"><option>…</option></select>
  </label>
  <a class="link-arrow" data-version-notes href="${url("releases/")}">${T("Release notes", "Notes de version")} ${icon("arrow-right", 15)}</a>
  <a class="link-arrow" data-version-sums href="#verify" hidden>${icon("shield", 15)} SHA256SUMS.txt</a>
  <a class="link-arrow" href="${GITHUB}/releases">${icon("github", 15)} ${T("All files on GitHub", "Tous les fichiers sur GitHub")}</a>
</div>

${tex.section(T("Verify a file", "Vérifier un fichier"), "verify")}
${tex.note(T("optional — for the careful", "facultatif — pour les prudents"), { arrow: "left", tilt: -3 })}
${tex.theorem(
  T("Proposition", "Proposition"),
  T("integrity", "intégrité"),
  T("The file you downloaded is exactly the one that was published, built from the public source code.", "Le fichier que vous avez téléchargé est exactement celui qui a été publié, compilé depuis le code source public."),
  `${T("Three checks, from the quickest to the most complete.", "Trois vérifications, de la plus rapide à la plus complète.")}
  ${tex.enumerate([
    `${T("<i>Its fingerprint.</i> Each file of <i>Other formats</i> has its SHA-256 fingerprint (the button next to its size). Compute the one of your file and compare:", "<i>Son empreinte.</i> Chaque fichier des <i>Autres formats</i> a son empreinte SHA-256 (le bouton à côté de sa taille). Calculez celle de votre fichier et comparez :")}
      <span class="code-label">Windows</span>${code(T("certutil -hashfile FILE SHA256", "certutil -hashfile FICHIER SHA256"))}
      <span class="code-label">macOS, Linux</span>${code(T("shasum -a 256 FILE", "shasum -a 256 FICHIER"))}`,
    `${T("<i>Every fingerprint at once.</i> Each version also contains <code>SHA256SUMS.txt</code>, the list of the fingerprints of all its files. In the folder of the download:", "<i>Toutes les empreintes d'un coup.</i> Chaque version contient aussi <code>SHA256SUMS.txt</code>, la liste des empreintes de tous ses fichiers. Dans le dossier du téléchargement :")}
      ${code("sha256sum --ignore-missing -c SHA256SUMS.txt")}`,
    `${T(`<i>Its origin.</i> GitHub certifies that each file was built by the release workflow of the <a href="${GITHUB}">public repository</a>, from the source of that version (with the <a href="https://cli.github.com">GitHub command line</a>):`, `<i>Son origine.</i> GitHub certifie que chaque fichier a été compilé par le processus de publication du <a href="${GITHUB}">dépôt public</a>, depuis les sources de cette version (avec la <a href="https://cli.github.com">ligne de commande GitHub</a>) :`)}
      ${code(T("gh attestation verify FILE --repo ifanoxy/raytex", "gh attestation verify FICHIER --repo ifanoxy/raytex"))}`,
  ])}
  ${T("If the three agree, the file is the published one.", "Si les trois concordent, le fichier est bien celui publié.")}`,
)}

${tex.section(T("From the source", "Depuis les sources"), "source")}
<p data-reveal>${T("With Rust 1.88+ and Node.js 22.12+ (and the Tauri prerequisites of your system):", "Avec Rust 1.88+ et Node.js 22.12+ (et les prérequis Tauri de votre système) :")}</p>
<div data-reveal>${code(`git clone ${GITHUB}.git && cd raytex && npm install && npm run app:build`)}</div>`;
  },
};
