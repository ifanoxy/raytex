import { pageHead } from "../util.mjs";

export default {
  id: "download",
  path: "download/",
  title: { en: "Download", fr: "Télécharger" },
  description: {
    en: "Download RayTeX for Windows, macOS (Apple silicon and Intel) or Linux (AppImage, .deb, .rpm). Free and open source; every version is available.",
    fr: "Téléchargez RayTeX pour Windows, macOS (Apple silicon et Intel) ou Linux (AppImage, .deb, .rpm). Libre et gratuit ; toutes les versions sont disponibles.",
  },
  body({ T, icon, url, GITHUB }) {
    const platform = (id, ic, name, sub) => `<article class="card dl-platform" id="${id}" data-dl-platform="${id}" data-reveal>
      <header>${icon(ic, 28)}<div><h2>${name}</h2><p>${sub}</p></div><span class="badge detected-badge">${icon("check", 13)} ${T("Your system", "Votre système")}</span></header>
      <div class="dl-files" data-dl-files="${id}"><div class="skeleton"></div><div class="skeleton"></div></div>
    </article>`;
    const code = (text) => `<div class="code-copy"><code>${text}</code><button type="button" class="copy-btn" data-copy="${text.replace(/"/g, "&quot;")}" aria-label="${T("Copy", "Copier")}">${icon("copy", 15)}</button></div>`;

    return `${pageHead(
      T("Download", "Téléchargement"),
      T("Download RayTeX", "Télécharger RayTeX"),
      T("Free, for Windows, macOS and Linux. The files are hosted on GitHub, where every version stays available.", "Gratuit, pour Windows, macOS et Linux. Les fichiers sont hébergés sur GitHub, où chaque version reste disponible."),
    )}
<section class="section tight">
  <div class="container">
    <div class="card dl-hero" data-dl-hero data-reveal data-spotlight>
      <div class="dl-hero-text">
        <p class="eyebrow" data-dl-detected>${T("Your system", "Votre système")}</p>
        <h2 data-dl-title>${T("Looking for the latest version…", "Recherche de la dernière version…")}</h2>
        <p class="muted" data-dl-subtitle></p>
      </div>
      <div class="dl-hero-actions">
        <a class="btn btn-primary btn-lg" href="#platforms" data-download-primary>${icon("download", 19)}<span data-download-label>${T("Download", "Télécharger")}</span></a>
        <span class="muted small" data-download-meta></span>
      </div>
    </div>

    <div class="dl-toolbar" data-reveal>
      <label class="version-picker">${icon("layers", 16)} <span>${T("Version", "Version")}</span>
        <select data-version-select aria-label="${T("Version", "Version")}"><option>…</option></select>
      </label>
      <a class="link-arrow" data-version-notes href="${url("releases/")}">${T("Release notes", "Notes de version")} ${icon("arrow-right", 15)}</a>
      <a class="link-arrow" href="${GITHUB}/releases">${icon("github", 15)} ${T("All files on GitHub", "Tous les fichiers sur GitHub")}</a>
    </div>
    <div class="dl-state" data-dl-state hidden></div>

    <div class="dl-grid" id="platforms">
      ${platform("windows", "windows", "Windows", T("Windows 10 and 11, 64-bit", "Windows 10 et 11, 64 bits"))}
      ${platform("macos", "apple", "macOS", T("macOS 11 Big Sur or later", "macOS 11 Big Sur ou plus récent"))}
      ${platform("linux", "linux", "Linux", T("64-bit distributions", "Distributions 64 bits"))}
    </div>
  </div>
</section>

<section class="section">
  <div class="container narrow">
    <h2 class="h3" data-reveal>${T("After downloading", "Après le téléchargement")}</h2>
    <div class="notes" data-reveal>
      <details open><summary>${icon("windows", 17)} Windows</summary>
        <p>${T("Run the installer. RayTeX is not signed yet: if SmartScreen stops it, click <b>More info</b>, then <b>Run anyway</b>. WebView2, which RayTeX uses to draw its window, is installed with it if it is missing.", "Lancez l'installateur. RayTeX n'est pas encore signé : si SmartScreen l'arrête, cliquez sur <b>Informations complémentaires</b>, puis sur <b>Exécuter quand même</b>. WebView2, qui sert à RayTeX à dessiner sa fenêtre, s'installe avec lui s'il manque.")}</p>
      </details>
      <details><summary>${icon("apple", 17)} macOS</summary>
        <p>${T("Open the disk image and drag RayTeX into <b>Applications</b>. The first time, right-click RayTeX and choose <b>Open</b> (the application is not notarized yet), or run:", "Ouvrez l'image disque et glissez RayTeX dans <b>Applications</b>. La première fois, faites un clic droit sur RayTeX et choisissez <b>Ouvrir</b> (l'application n'est pas encore notarisée), ou lancez :")}</p>
        ${code("xattr -dr com.apple.quarantine /Applications/RayTeX.app")}
        <p>${T("Not sure which Mac you have? Apple menu → <b>About This Mac</b>: “Chip Apple M…” means Apple silicon, “Processor Intel” means Intel.", "Vous ne savez pas quel Mac vous avez ? Menu Pomme → <b>À propos de ce Mac</b> : « Puce Apple M… » signifie Apple silicon, « Processeur Intel » signifie Intel.")}</p>
      </details>
      <details><summary>${icon("linux", 17)} Linux</summary>
        <p>${T("The AppImage runs on any distribution:", "L'AppImage fonctionne sur toutes les distributions :")}</p>
        ${code("chmod +x RayTeX_*.AppImage && ./RayTeX_*.AppImage")}
        <p>${T("Or install the package of your distribution:", "Ou installez le paquet de votre distribution :")}</p>
        ${code("sudo apt install ./RayTeX_*_amd64.deb")}
        ${code("sudo dnf install ./RayTeX-*.x86_64.rpm")}
      </details>
      <details><summary>${icon("packages", 17)} ${T("A TeX distribution", "Une distribution TeX")}</summary>
        <p>${T("RayTeX compiles with the TeX distribution of your computer (TeX Live, MiKTeX, MacTeX, TinyTeX or Tectonic). If it finds none, its setup assistant installs one and shows the exact commands before running them.", "RayTeX compile avec la distribution TeX de votre ordinateur (TeX Live, MiKTeX, MacTeX, TinyTeX ou Tectonic). S'il n'en trouve aucune, son assistant en installe une et montre les commandes exactes avant de les lancer.")}</p>
      </details>
      <details><summary>${icon("terminal", 17)} ${T("Build from source", "Compiler depuis les sources")}</summary>
        <p>${T("With Rust 1.88+ and Node.js 22.12+ (and the Tauri prerequisites of your system):", "Avec Rust 1.88+ et Node.js 22.12+ (et les prérequis Tauri de votre système) :")}</p>
        ${code(`git clone ${GITHUB}.git && cd raytex && npm install && npm run app:build`)}
      </details>
    </div>
    <p class="muted small" data-reveal>${T(
      'Checking a download: each file has its SHA-256 fingerprint (the copy button next to it); compare it with <code>certutil -hashfile FILE SHA256</code> on Windows or <code>shasum -a 256 FILE</code> on macOS and Linux.',
      "Vérifier un téléchargement : chaque fichier a son empreinte SHA-256 (le bouton de copie à côté) ; comparez-la avec <code>certutil -hashfile FICHIER SHA256</code> sous Windows ou <code>shasum -a 256 FICHIER</code> sous macOS et Linux.",
    )}</p>
  </div>
</section>`;
  },
};
