#!/usr/bin/env node
// Builds the RayTeX website into site/dist: every page in English (at the
// root) and in French (under fr/), the assets, the sitemap and, when a
// GitHub token is given, the list of published releases (releases.json).
//
//   node site/build.mjs                 build
//   GITHUB_TOKEN=… node site/build.mjs  build with the releases baked in
//   SITE_URL=https://example.org        address of the site (canonical links,
//                                       sitemap); default: GitHub Pages
//
// No dependency: pages are functions returning HTML (site/src/pages).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REPO, page as layout, notFound } from "./src/layout.mjs";
import { PAGES } from "./src/pages/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "dist");
const SITE_URL = (process.env.SITE_URL || `https://${REPO.split("/")[0]}.github.io/${REPO.split("/")[1]}`).replace(/\/$/, "");
const BASE = new URL(`${SITE_URL}/`).pathname;
const LANGS = ["en", "fr"];
const prefix = (lang) => (lang === "en" ? "" : `${lang}/`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ------------------------------------------------------------------ pages
const version = JSON.parse(readFileSync(join(root, "crates/raytex-desktop/tauri.conf.json"), "utf8")).version;
const urls = [];
for (const p of PAGES) {
  for (const lang of LANGS) {
    const path = `${prefix(lang)}${p.path}`;
    const html = layout(p, { lang, path, siteUrl: SITE_URL, version, prefix });
    const file = join(out, path, "index.html");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    urls.push({ path, alternates: Object.fromEntries(LANGS.map((l) => [l, `${prefix(l)}${p.path}`])) });
  }
}
writeFileSync(join(out, "404.html"), notFound({ base: BASE, siteUrl: SITE_URL, version }));

// ----------------------------------------------------------------- assets
cpSync(join(here, "assets"), join(out, "assets"), { recursive: true });
cpSync(join(root, "assets/logo.svg"), join(out, "assets/img/logo.svg"));
cpSync(join(root, "assets/logo/logo-mark-dark.svg"), join(out, "assets/img/logo-mark-dark.svg"));
cpSync(join(root, "assets/logo/logo-mark-light.svg"), join(out, "assets/img/logo-mark-light.svg"));
for (const lang of LANGS) cpSync(join(root, "docs/screenshots", lang), join(out, "assets/screenshots", lang), { recursive: true });
writeFileSync(join(out, ".nojekyll"), "");

// ---------------------------------------------------------------- sitemap
const xml = urls
  .map(
    (u) =>
      `  <url><loc>${SITE_URL}/${u.path}</loc>${Object.entries(u.alternates)
        .map(([l, p]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}/${p}"/>`)
        .join("")}</url>`,
  )
  .join("\n");
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${xml}\n</urlset>\n`,
);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

// --------------------------------------------------------------- releases
// Baked in so that visitors never meet GitHub's rate limit; without a token
// the pages ask GitHub's API themselves.
const token = process.env.GITHUB_TOKEN;
if (token) {
  const releases = [];
  for (let n = 1; n <= 10; n++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${n}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.html+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!res.ok) throw new Error(`GitHub API: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  const published = releases
    .filter((r) => !r.draft)
    .map((r) => ({
      tag: r.tag_name,
      name: r.name,
      date: r.published_at,
      prerelease: r.prerelease,
      url: r.html_url,
      notes: r.body_html ?? "",
      assets: r.assets.map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url, digest: a.digest ?? null })),
    }));
  writeFileSync(join(out, "releases.json"), JSON.stringify(published));
  console.log(`releases.json: ${published.length} published release(s)`);
} else if (existsSync(join(out, "releases.json"))) {
  rmSync(join(out, "releases.json"));
}

console.log(`site built in ${out} (${urls.length} pages, ${SITE_URL})`);
