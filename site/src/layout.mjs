// The frame of every page: head, navigation bar, footer, and the texts the
// scripts of the site need (downloads, releases).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { icon } from "./icons.mjs";
import { texContext } from "./tex.mjs";

// The style and the script carry the hash of their content, so that a new
// version of the site is never shown with the previous ones from the cache.
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "../assets");
const stamp = (file) => createHash("sha256").update(readFileSync(join(ASSETS, file))).digest("hex").slice(0, 10);
const CSS_V = stamp("site.css");
const JS_V = stamp("site.js");

export const REPO = "ifanoxy/raytex";
export const GITHUB = `https://github.com/${REPO}`;
export const YEAR = new Date().getFullYear();

/** Escapes text for HTML. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const NAV = [
  ["features", "features/", "Features", "Fonctionnalités"],
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
    none: "None for this version.",
    recommended: "Recommended",
    copy: "Copy",
    copied: "Copied",
    sha: "SHA-256",
    detected: "Your system",
    files: "{n} files",
    otherFiles: "Other files",
    version: "Version",
    versionLine: "Version {v}, released on {date}",
    macOther: { "dmg-x64": "A Mac with an Intel processor?", "dmg-arm64": "A Mac with an Apple chip (M1, M2…)?" },
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
    none: "Aucun pour cette version.",
    recommended: "Recommandé",
    copy: "Copier",
    copied: "Copié",
    sha: "SHA-256",
    detected: "Votre système",
    files: "{n} fichiers",
    otherFiles: "Autres fichiers",
    version: "Version",
    versionLine: "Version {v}, publiée le {date}",
    macOther: { "dmg-x64": "Un Mac avec un processeur Intel ?", "dmg-arm64": "Un Mac avec une puce Apple (M1, M2…) ?" },
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

// Paper by day unless the reader turned the page to night (the button).
const THEME_SCRIPT = `(function(){var t,d=document.documentElement;try{t=localStorage.getItem("raytex-theme")}catch(e){}d.dataset.theme=t==="dark"?"dark":"light";d.classList.add("js")})();`;

// From one page of the site to the next (site.css). Where the browser plays
// transitions between documents, both pages are seen at once: this script,
// before the first paint of the new page, chooses the way (to the title
// page: the book arrives, its sheet named "book"; to an earlier page: back),
// from the page number of the old one (kept by site.js when it goes).
// Elsewhere site.js turns the old page, and this script makes the new one
// arrive ("raytex-turn").
const TURN_SCRIPT = `(function(){var d=document.documentElement,n=+d.dataset.pageno||0;try{if(n===1&&!sessionStorage.getItem("raytex-visited")&&!matchMedia("(prefers-reduced-motion: reduce)").matches)d.classList.add("opening")}catch(x){}addEventListener("pagereveal",function(e){if(!e.viewTransition)return;var f=0;try{f=+sessionStorage.getItem("raytex-from")||0}catch(x){}var c=n===1?"vt-book":f&&n&&n<f?"vt-back":"";if(!c)return;var p=document.getElementById("sheet");if(c==="vt-book"&&p)p.style.viewTransitionName="book";d.classList.add(c);var off=function(){d.classList.remove(c);if(p)p.style.viewTransitionName=""};e.viewTransition.finished.then(off,off)});try{var t=sessionStorage.getItem("raytex-turn");if(t){sessionStorage.removeItem("raytex-turn");d.classList.add(t==="back"?"arriving-back":t==="book"?"arriving-book":"arriving")}}catch(x){}})();`;

// What is on screen when a page first shows is there at once, so that a page
// never appears as a blank sheet; site.js still writes its handwriting.
const AT_LOAD_SCRIPT = `(function(){var h=innerHeight;document.querySelectorAll("#sheet [data-reveal]").forEach(function(e){if(e.classList.contains("stamp"))return;var r=e.getBoundingClientRect();if(r.top<h&&r.bottom>0)e.classList.add("at-load")})})();`;

/** Icons the scripts insert (download lists). */
const SCRIPT_ICONS = Object.fromEntries(["windows", "apple", "linux", "download", "copy", "github"].map((n) => [n, icon(n, n === "copy" ? 13 : 16)]));

/** The page numbers, like those of a printed document (the table of contents shows them). */
export const FOLIO = { home: 1, features: 2, download: 3, releases: 4, guide: 5, faq: 6, about: 7, legal: 8, privacy: 9, license: 10 };
/** The same, by the path of the page (site.js: which way the page turns). */
const FOLIOS = Object.fromEntries(Object.entries(FOLIO).map(([id, n]) => [id === "home" ? "" : `${id}/`, n]));

function head({ title, description, lang, canonical, alternates, rel, siteUrl, extra = "" }) {
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script>${THEME_SCRIPT}${TURN_SCRIPT}</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="theme-color" content="#fbfaf6" />
<meta name="color-scheme" content="light" />
${canonical ? `<link rel="canonical" href="${canonical}" />` : ""}
${alternates ?? ""}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="RayTeX" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${siteUrl}/assets/img/og.png" />
<meta property="og:locale" content="${lang === "fr" ? "fr_FR" : "en_US"}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="${rel}assets/img/ray.svg" type="image/svg+xml" />
<link rel="icon" href="${rel}assets/img/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="${rel}assets/img/apple-touch-icon.png" />
${["lm-roman-regular", "lm-roman-bold", "lm-roman-italic", "lm-roman-caps", "lm-roman17-regular"].map((f) => `<link rel="preload" href="${rel}assets/fonts/${f}.woff" as="font" type="font/woff" crossorigin />`).join("\n")}
<link rel="preload" href="${rel}assets/fonts/caveat-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${rel}assets/katex/katex.min.css" />
<link rel="stylesheet" href="${rel}assets/site.css?v=${CSS_V}" />
<link rel="expect" href="#sheet" blocking="render" />
${extra}
<script src="${rel}assets/site.js?v=${JS_V}" defer></script>`;
}

/** A whole page. `p` is a page module, `path` its place in the site. */
export function page(p, { lang, path, siteUrl, version, prefix }) {
  const depth = path.split("/").filter(Boolean).length;
  const rel = "../".repeat(depth);
  const other = lang === "en" ? "fr" : "en";
  const url = (to, l = lang) => `${rel}${prefix(l)}${to}` || "./";
  const T = (en, fr) => (lang === "fr" ? fr : en);
  const tex = texContext(lang);
  const ctx = { lang, T, url, rel, asset: (a) => `${rel}assets/${a}`, icon, esc, version, GITHUB, REPO, YEAR, tex, FOLIO };

  const title = p.id === "home" ? T("RayTeX, the next-generation open-source LaTeX IDE", "RayTeX, l'IDE LaTeX nouvelle génération, open source") : `${T(p.title.en, p.title.fr)} · RayTeX`;
  const description = T(p.description.en, p.description.fr);
  const alternates = ["en", "fr"].map((l) => `<link rel="alternate" hreflang="${l}" href="${siteUrl}/${prefix(l)}${p.path}" />`).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${siteUrl}/${p.path}" />`;
  // Every page in the reader's language: the one chosen with the switch, or
  // else the first of the browser's languages that the site speaks (English
  // otherwise). Robots stay on the page they asked for.
  const redirect = `<script>(function(){try{if(/bot|crawl|spider|slurp|lighthouse|preview/i.test(navigator.userAgent))return;var w=localStorage.getItem("raytex-lang");if(!w){var l=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||"en"];w="en";for(var i=0;i<l.length;i++){var c=String(l[i]).slice(0,2).toLowerCase();if(c==="fr"||c==="en"){w=c;break}}}if(w!=="${lang}"&&(w==="fr"||w==="en"))location.replace("${url(p.path, other)}"+location.search+location.hash)}catch(e){}})();</script>`;
  const body = p.body(ctx);

  const nav = NAV.map(([id, to, en, fr]) => `<a href="${url(to)}"${id === p.id ? ' aria-current="page"' : ""}>${T(en, fr)}</a>`).join("");

  return `<!doctype html>
<html lang="${lang}" data-pageno="${FOLIO[p.id] ?? ""}">
<head>
${head({ title, description, lang, canonical: `${siteUrl}/${path}`, alternates, rel, siteUrl, extra: redirect })}
</head>
<body data-page="${p.id}">
<a class="skip" href="#main">${T("Skip to content", "Aller au contenu")}</a>
${p.intro ? p.intro(ctx) : ""}
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="${url("")}" aria-label="RayTeX, ${T("home", "accueil")}">
      <img class="brand-light" src="${rel}assets/img/logo-mark-light.svg" alt="RayTeX" width="132" height="44" />
      <img class="brand-dark" src="${rel}assets/img/logo-mark-dark.svg" alt="" width="132" height="44" />
    </a>
    <nav class="main-nav" id="main-nav" aria-label="${T("Main", "Principale")}">${nav}</nav>
    <div class="topbar-actions">
      <a class="tool" href="${url(p.path, other)}" hreflang="${other}" lang="${other}" data-lang-switch="${other}" title="${T("Version française", "English version")}">${other.toUpperCase()}</a>
      <button class="tool" type="button" data-theme-toggle title="${T("Paper by day, paper by night", "Papier de jour, papier de nuit")}" aria-label="${T("Light or dark theme", "Thème clair ou sombre")}">${icon("sun", 16, "when-dark")}${icon("moon", 16, "when-light")}</button>
      <a class="fbox-link solid" href="${url("download/")}"${p.id === "download" ? ' aria-current="page"' : ""}>${icon("download", 15)}<span>${T("Download", "Télécharger")}</span></a>
      <button class="tool menu-btn" type="button" data-menu aria-expanded="false" aria-controls="main-nav" aria-label="${T("Menu", "Menu")}"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
<main id="main" tabindex="-1">
  <article class="paper${p.id === "home" ? " paper-home" : ""}" id="sheet">
    <div class="runninghead" aria-hidden="true"><span>RayTeX</span><span>${p.id === "home" ? T("the next-generation LaTeX IDE", "l'IDE LaTeX nouvelle génération") : T(p.title.en, p.title.fr)}</span></div>
${body}
${tex.footnotes()}
    <button type="button" class="folio" data-folio title="${T("Page", "Page")} ${FOLIO[p.id] ?? ""}">${FOLIO[p.id] ?? ""}</button>
  </article>
  <script>${AT_LOAD_SCRIPT}</script>
</main>
${footer(ctx, p, other)}
<script>window.RAYTEX=${JSON.stringify({ repo: REPO, lang, rel, texts: SCRIPT_TEXTS[lang], icons: SCRIPT_ICONS, folios: FOLIOS })}</script>
</body>
</html>
`;
}

function footer({ T, url, icon, YEAR }, p, other) {
  const link = (href, text) => `<a href="${href}">${text}</a>`;
  return `<footer class="colophon">
  <div class="colophon-inner">
    <p class="colophon-title">${T("Colophon", "Colophon")}</p>
    <p>${T(
      "This site is typeset in Latin Modern, the font of LaTeX, with handwritten notes in the margin. RayTeX is free and open-source software.",
      "Ce site est composé en Latin Modern, la police de LaTeX, avec des notes manuscrites dans la marge. RayTeX est un logiciel libre et gratuit.",
    )}</p>
    <p class="colophon-links">
      ${link(url("features/"), T("Features", "Fonctionnalités"))} · ${link(url("download/"), T("Download", "Télécharger"))} · ${link(url("releases/"), T("Versions", "Versions"))} · ${link(url("guide/"), T("Getting started", "Prise en main"))} · ${link(url("faq/"), "FAQ")} · ${link(url("about/"), T("About and contributing", "À propos et contribuer"))}
    </p>
    <p class="colophon-links">
      ${link(url("legal/"), T("Legal notice", "Mentions légales"))} · ${link(url("privacy/"), T("Privacy", "Confidentialité"))} · ${link(url("license/"), T("License", "Licence"))} · ${link(GITHUB, `${icon("github", 13)} GitHub`)} · ${link(`${GITHUB}/issues/new/choose`, T("Report a problem", "Signaler un problème"))}
    </p>
    <p class="colophon-small">© ${YEAR} ${T("The RayTeX contributors", "Les contributeurs de RayTeX")} · ${T("MIT or Apache 2.0 license", "Licence MIT ou Apache 2.0")} · <a href="${url(p.path, other)}" hreflang="${other}" lang="${other}" data-lang-switch="${other}">${other === "fr" ? "Français" : "English"}</a></p>
  </div>
</footer>`;
}

/** The page GitHub Pages shows for a missing address (any depth: absolute links). TeX stops on it. */
export function notFound({ base, siteUrl, version }) {
  return `<!doctype html>
<html lang="en">
<head>
${head({ title: "Page not found · RayTeX", description: "This page does not exist.", lang: "en", rel: base, siteUrl })}
</head>
<body data-page="404">
<main id="main" class="texstop">
  <article class="paper paper-terminal" id="sheet" data-terminal data-home-en="${base}" data-home-fr="${base}fr/">
    <pre class="terminal"><span class="t-dim">This is RayTeX, Version ${version} (preloaded format=site)</span>
<span class="t-dim">(./<span data-path></span></span>
<span class="t-err">! Undefined control sequence.</span>
<span>l.404 \\page</span><span class="t-err" data-path-word></span>
<span data-lang-block="en">
<span class="t-dim">The page you asked for does not exist (or has moved).</span>
<span class="t-dim">Type &lt;return&gt; to go back home, H for help, or X to quit.</span></span><span data-lang-block="fr" hidden>
<span class="t-dim">La page demandée n'existe pas (ou a changé de place).</span>
<span class="t-dim">Tapez &lt;Entrée&gt; pour revenir à l'accueil, H pour l'aide, ou X pour quitter.</span></span>
<span class="t-prompt">? </span><span class="t-input" data-input></span><span class="t-caret"></span></pre>
    <p class="terminal-actions"><a class="fbox-link" data-home href="${base}">${icon("home", 15)}<span data-lang-block="en">Home</span><span data-lang-block="fr" hidden>Accueil</span></a></p>
  </article>
</main>
<script>(function(){var fr=/\\/fr\\//.test(location.pathname)||/^fr\\b/i.test(navigator.language||"");if(fr){document.documentElement.lang="fr";document.title="Page introuvable · RayTeX";document.querySelectorAll('[data-lang-block="en"]').forEach(function(e){e.hidden=true});document.querySelectorAll('[data-lang-block="fr"]').forEach(function(e){e.hidden=false});document.querySelector("[data-home]").href="${base}fr/"}})();</script>
<script>window.RAYTEX=${JSON.stringify({ repo: REPO, lang: "en", rel: base, texts: SCRIPT_TEXTS.en, icons: SCRIPT_ICONS, folios: FOLIOS })}</script>
</body>
</html>
`;
}
