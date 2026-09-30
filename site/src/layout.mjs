// The frame of every page: head, navigation bar, footer, and the texts the
// scripts of the site need (downloads, releases).

import { icon } from "./icons.mjs";

export const REPO = "ifanoxy/raytex";
export const GITHUB = `https://github.com/${REPO}`;
export const YEAR = new Date().getFullYear();

/** Escapes text for HTML. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const NAV = [
  ["features", "features/", "Features", "Fonctionnalités"],
  ["download", "download/", "Download", "Télécharger"],
  ["releases", "releases/", "Versions", "Versions"],
  ["guide", "guide/", "Guide", "Guide"],
  ["faq", "faq/", "FAQ", "FAQ"],
];

/** Texts used by site.js (downloads, releases, copy buttons…). */
const SCRIPT_TEXTS = {
  en: {
    downloadFor: "Download for {os}",
    downloadAll: "All downloads",
    latest: "Latest",
    prerelease: "Pre-release",
    released: "Released on {date}",
    notes: "Release notes",
    noRelease: "No version has been published yet.",
    noReleaseHint: "The first version is on its way: follow the project on GitHub, or build RayTeX from its source.",
    loadFailed: "The list of versions could not be loaded.",
    loadFailedHint: "All the files are on GitHub:",
    onGithub: "Open the releases on GitHub",
    noFile: "No file for this system in this version.",
    recommended: "Recommended",
    copy: "Copy",
    copied: "Copied",
    sha: "SHA-256",
    detected: "Your system",
    files: "{n} files",
    otherFiles: "Other files",
    version: "Version",
    os: { windows: "Windows", macos: "macOS", linux: "Linux", mobile: "a computer", unknown: "your computer" },
    arch: { arm64: "Apple silicon", x64: "Intel" },
    kinds: {
      exe: ["Installer (.exe)", "The usual installer, for most people."],
      msi: ["MSI package", "For deployment in schools and companies."],
      "dmg-arm64": ["Apple silicon (.dmg)", "Macs with an M1, M2, M3, M4… chip."],
      "dmg-x64": ["Intel (.dmg)", "Macs with an Intel processor."],
      dmg: ["Disk image (.dmg)", "For every Mac."],
      appimage: ["AppImage", "Any distribution: make it executable and run it."],
      deb: ["Debian package (.deb)", "Debian, Ubuntu, Linux Mint, Pop!_OS…"],
      rpm: ["RPM package (.rpm)", "Fedora, openSUSE, RHEL…"],
    },
    mobile: "RayTeX runs on computers (Windows, macOS, Linux). Choose the system of the computer you will install it on.",
  },
  fr: {
    downloadFor: "Télécharger pour {os}",
    downloadAll: "Tous les téléchargements",
    latest: "Dernière",
    prerelease: "Préversion",
    released: "Publiée le {date}",
    notes: "Notes de version",
    noRelease: "Aucune version n'a encore été publiée.",
    noReleaseHint: "La première version arrive : suivez le projet sur GitHub, ou compilez RayTeX depuis ses sources.",
    loadFailed: "La liste des versions n'a pas pu être chargée.",
    loadFailedHint: "Tous les fichiers sont sur GitHub :",
    onGithub: "Ouvrir les versions sur GitHub",
    noFile: "Aucun fichier pour ce système dans cette version.",
    recommended: "Recommandé",
    copy: "Copier",
    copied: "Copié",
    sha: "SHA-256",
    detected: "Votre système",
    files: "{n} fichiers",
    otherFiles: "Autres fichiers",
    version: "Version",
    os: { windows: "Windows", macos: "macOS", linux: "Linux", mobile: "un ordinateur", unknown: "votre ordinateur" },
    arch: { arm64: "Apple silicon", x64: "Intel" },
    kinds: {
      exe: ["Installateur (.exe)", "L'installateur habituel, pour la plupart des gens."],
      msi: ["Paquet MSI", "Pour les déploiements en établissement ou en entreprise."],
      "dmg-arm64": ["Apple silicon (.dmg)", "Mac avec une puce M1, M2, M3, M4…"],
      "dmg-x64": ["Intel (.dmg)", "Mac avec un processeur Intel."],
      dmg: ["Image disque (.dmg)", "Pour tous les Mac."],
      appimage: ["AppImage", "Toutes les distributions : rendez-la exécutable et lancez-la."],
      deb: ["Paquet Debian (.deb)", "Debian, Ubuntu, Linux Mint, Pop!_OS…"],
      rpm: ["Paquet RPM (.rpm)", "Fedora, openSUSE, RHEL…"],
    },
    mobile: "RayTeX fonctionne sur ordinateur (Windows, macOS, Linux). Choisissez le système de l'ordinateur sur lequel vous l'installerez.",
  },
};

const THEME_SCRIPT = `(function(){var t,d=document.documentElement;try{t=localStorage.getItem("raytex-theme")}catch(e){}d.dataset.theme=t||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");d.classList.add("js")})();`;

/** Icons the scripts insert (download lists). */
const SCRIPT_ICONS = Object.fromEntries(["windows", "apple", "linux", "download", "copy", "github"].map((n) => [n, icon(n, n === "copy" ? 13 : 16)]));

function head({ title, description, lang, canonical, alternates, rel, siteUrl, extra = "" }) {
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="theme-color" content="#0e1220" />
<meta name="color-scheme" content="dark light" />
${canonical ? `<link rel="canonical" href="${canonical}" />` : ""}
${alternates ?? ""}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="RayTeX" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${siteUrl}/assets/img/og.png" />
<meta property="og:locale" content="${lang === "fr" ? "fr_FR" : "en_US"}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="${rel}assets/img/logo.svg" type="image/svg+xml" />
<link rel="icon" href="${rel}assets/img/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="${rel}assets/img/apple-touch-icon.png" />
<link rel="preload" href="${rel}assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${rel}assets/site.css" />
<script>${THEME_SCRIPT}</script>
${extra}
<script src="${rel}assets/site.js" defer></script>`;
}

/** A whole page. `p` is a page module, `path` its place in the site. */
export function page(p, { lang, path, siteUrl, version, prefix }) {
  const depth = path.split("/").filter(Boolean).length;
  const rel = "../".repeat(depth);
  const other = lang === "en" ? "fr" : "en";
  const url = (to, l = lang) => `${rel}${prefix(l)}${to}` || "./";
  const T = (en, fr) => (lang === "fr" ? fr : en);
  const ctx = { lang, T, url, rel, asset: (a) => `${rel}assets/${a}`, icon, esc, version, GITHUB, REPO, YEAR };

  const title = p.id === "home" ? T("RayTeX — the next-generation, open-source LaTeX IDE", "RayTeX — l'IDE LaTeX nouvelle génération, open source") : `${T(p.title.en, p.title.fr)} — RayTeX`;
  const description = T(p.description.en, p.description.fr);
  const alternates = ["en", "fr"].map((l) => `<link rel="alternate" hreflang="${l}" href="${siteUrl}/${prefix(l)}${p.path}" />`).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${siteUrl}/${p.path}" />`;
  // French readers arriving on the English home page go to theirs, once.
  const redirect =
    p.id === "home" && lang === "en"
      ? `<script>try{if(!localStorage.getItem("raytex-lang")&&/^fr\\b/i.test(navigator.language||""))location.replace("fr/")}catch(e){}</script>`
      : "";
  const body = p.body(ctx);

  const nav = NAV.map(([id, to, en, fr]) => `<a href="${url(to)}"${id === p.id ? ' aria-current="page"' : ""}>${T(en, fr)}</a>`).join("");

  return `<!doctype html>
<html lang="${lang}">
<head>
${head({ title, description, lang, canonical: `${siteUrl}/${path}`, alternates, rel, siteUrl, extra: redirect })}
</head>
<body data-page="${p.id}">
<a class="skip" href="#main">${T("Skip to content", "Aller au contenu")}</a>
<div class="backdrop" aria-hidden="true"><div class="glow glow-a"></div><div class="glow glow-b"></div><div class="grid-lines"></div></div>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${url("")}" aria-label="RayTeX — ${T("home", "accueil")}">
      <img class="brand-dark" src="${rel}assets/img/logo-mark-dark.svg" alt="RayTeX" width="116" height="40" />
      <img class="brand-light" src="${rel}assets/img/logo-mark-light.svg" alt="" width="116" height="40" />
    </a>
    <nav class="main-nav" id="main-nav" aria-label="${T("Main", "Principale")}">${nav}</nav>
    <div class="header-actions">
      <a class="icon-btn" href="${url(p.path, other)}" hreflang="${other}" lang="${other}" data-lang-switch="${other}" title="${T("Version française", "English version")}">${other.toUpperCase()}</a>
      <button class="icon-btn" type="button" data-theme-toggle title="${T("Light or dark theme", "Thème clair ou sombre")}" aria-label="${T("Light or dark theme", "Thème clair ou sombre")}">${icon("sun", 17, "when-dark")}${icon("moon", 17, "when-light")}</button>
      <a class="icon-btn" href="${GITHUB}" title="GitHub" aria-label="GitHub">${icon("github", 18)}</a>
      <a class="btn btn-primary btn-sm header-cta" href="${url("download/")}">${icon("download", 16)}<span>${T("Download", "Télécharger")}</span></a>
      <button class="icon-btn menu-btn" type="button" data-menu aria-expanded="false" aria-controls="main-nav" aria-label="${T("Menu", "Menu")}"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
${footer(ctx, p, other)}
<script>window.RAYTEX=${JSON.stringify({ repo: REPO, lang, rel, texts: SCRIPT_TEXTS[lang], icons: SCRIPT_ICONS })}</script>
</body>
</html>
`;
}

function footer({ T, url, rel, icon, YEAR }, p, other) {
  const col = (title, links) => `<div class="footer-col"><h2>${title}</h2><ul>${links.map(([href, text]) => `<li><a href="${href}">${text}</a></li>`).join("")}</ul></div>`;
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <img class="brand-dark" src="${rel}assets/img/logo-mark-dark.svg" alt="RayTeX" width="128" height="44" />
      <img class="brand-light" src="${rel}assets/img/logo-mark-light.svg" alt="" width="128" height="44" />
      <p>${T("A modern LaTeX editor for students, teachers and researchers. Free and open source.", "Un éditeur LaTeX moderne pour les étudiants, les enseignants et les chercheurs. Libre et gratuit.")}</p>
      <a class="footer-gh" href="${GITHUB}">${icon("github", 16)} ${REPO}</a>
    </div>
    ${col(T("Product", "Produit"), [
      [url("features/"), T("Features", "Fonctionnalités")],
      [url("download/"), T("Download", "Télécharger")],
      [url("releases/"), T("Versions", "Versions")],
      [url("guide/"), T("Getting started", "Prise en main")],
      [url("faq/"), "FAQ"],
    ])}
    ${col(T("Project", "Projet"), [
      [url("about/"), T("About and contributing", "À propos et contribuer")],
      [`${GITHUB}/issues/new/choose`, T("Report a problem", "Signaler un problème")],
      [`${GITHUB}/blob/main/CHANGELOG.md`, T("Changelog", "Journal des modifications")],
      [`${GITHUB}/security/policy`, T("Security", "Sécurité")],
    ])}
    ${col(T("Legal", "Informations légales"), [
      [url("legal/"), T("Legal notice", "Mentions légales")],
      [url("privacy/"), T("Privacy", "Confidentialité")],
      [url("license/"), T("License", "Licence")],
    ])}
  </div>
  <div class="container footer-bottom">
    <span>© ${YEAR} ${T("The RayTeX contributors", "Les contributeurs de RayTeX")} · ${T("MIT or Apache 2.0 license", "Licence MIT ou Apache 2.0")}</span>
    <a href="${url(p.path, other)}" hreflang="${other}" lang="${other}" data-lang-switch="${other}">${icon("globe", 15)} ${other === "fr" ? "Français" : "English"}</a>
  </div>
</footer>`;
}

/** The page GitHub Pages shows for a missing address (any depth: absolute links). */
export function notFound({ base, siteUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
${head({ title: "Page not found — RayTeX", description: "This page does not exist.", lang: "en", rel: base, siteUrl })}
</head>
<body data-page="404">
<div class="backdrop" aria-hidden="true"><div class="glow glow-a"></div><div class="glow glow-b"></div><div class="grid-lines"></div></div>
<main id="main" class="not-found">
  <img src="${base}assets/img/logo.svg" alt="" width="120" height="120" class="float" />
  <p class="eyebrow">404</p>
  <div data-lang-block="en">
    <h1>This page swam away.</h1>
    <p class="lead">The address may be wrong, or the page has moved.</p>
    <p class="actions"><a class="btn btn-primary" href="${base}">${icon("home", 17)} Home</a> <a class="btn btn-ghost" href="${base}download/">${icon("download", 17)} Download</a></p>
  </div>
  <div data-lang-block="fr" hidden>
    <h1>Cette page s'est éloignée à la nage.</h1>
    <p class="lead">L'adresse est peut-être erronée, ou la page a changé de place.</p>
    <p class="actions"><a class="btn btn-primary" href="${base}fr/">${icon("home", 17)} Accueil</a> <a class="btn btn-ghost" href="${base}fr/download/">${icon("download", 17)} Télécharger</a></p>
  </div>
</main>
<script>(function(){var fr=/\\/fr\\//.test(location.pathname)||/^fr\\b/i.test(navigator.language||"");if(fr){document.documentElement.lang="fr";document.title="Page introuvable — RayTeX";document.querySelector('[data-lang-block="en"]').hidden=true;document.querySelector('[data-lang-block="fr"]').hidden=false}})();</script>
<script>window.RAYTEX=${JSON.stringify({ repo: REPO, lang: "en", rel: base, texts: SCRIPT_TEXTS.en, icons: SCRIPT_ICONS })}</script>
</body>
</html>
`;
}
