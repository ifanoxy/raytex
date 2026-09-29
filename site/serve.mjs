#!/usr/bin/env node
// Serves site/dist like GitHub Pages does (under /raytex/, 404.html for
// missing pages), after building it. `--mock` also serves sample releases,
// to see the download lists before any version is published.
//
//   node site/serve.mjs [--mock] [--port 4173]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]) || 4173;
const mock = args.includes("--mock");
const BASE = "/raytex/";

const build = () => {
  try {
    execFileSync(process.execPath, [join(here, "build.mjs")], { stdio: "inherit", env: { ...process.env, GITHUB_TOKEN: "" } });
  } catch {
    /* the error is printed; the previous build stays */
  }
};
build();
// Built again when a page or an asset changes (reload the page to see it).
let timer;
for (const dir of ["src", "assets"]) watch(join(here, dir), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(build, 150);
});

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };

function sampleReleases() {
  const files = (v) =>
    [
      [`RayTeX_${v}_x64-setup.exe`, 9.8],
      [`RayTeX_${v}_x64_en-US.msi`, 11.2],
      [`RayTeX_${v}_aarch64.dmg`, 14.1],
      [`RayTeX_${v}_x64.dmg`, 14.6],
      [`RayTeX_${v}_amd64.AppImage`, 86.3],
      [`RayTeX_${v}_amd64.deb`, 12.4],
      [`RayTeX-${v}-1.x86_64.rpm`, 12.5],
      [`RayTeX_aarch64.app.tar.gz`, 13.9],
    ].map(([name, mb]) => ({ name, size: Math.round(mb * 1048576), url: `https://example.invalid/${name}`, digest: "sha256:3b0f5c0a9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a" }));
  return [
    { tag: "v0.2.0-beta.1", name: "RayTeX 0.2.0 beta 1", date: "2026-10-20T10:00:00Z", prerelease: true, url: "https://github.com/ifanoxy/raytex/releases", notes: "<p>Sample pre-release (local preview only).</p>", assets: files("0.2.0-beta.1") },
    { tag: "v0.1.1", name: "RayTeX 0.1.1", date: "2026-10-12T10:00:00Z", prerelease: false, url: "https://github.com/ifanoxy/raytex/releases", notes: "<h2>Fixes</h2><ul><li>Sample release notes (local preview only).</li><li>Saving while TeX reads the file on Windows.</li></ul>", assets: files("0.1.1") },
    { tag: "v0.1.0", name: "RayTeX 0.1.0", date: "2026-10-01T10:00:00Z", prerelease: false, url: "https://github.com/ifanoxy/raytex/releases", notes: "<p>First version.</p>", assets: files("0.1.0") },
  ];
}

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(302, { Location: BASE });
    return res.end();
  }
  const rel = decodeURIComponent(url.pathname.slice(BASE.length));
  if (mock && rel === "releases.json") {
    res.writeHead(200, { "Content-Type": TYPES[".json"] });
    return res.end(JSON.stringify(sampleReleases()));
  }
  let file = normalize(join(dist, rel));
  if (!file.startsWith(dist)) {
    res.writeHead(403);
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith("/")) {
      res.writeHead(301, { Location: `${url.pathname}/` });
      return res.end();
    }
    file = join(file, "index.html");
  }
  const found = existsSync(file);
  res.writeHead(found ? 200 : 404, { "Content-Type": (found ? TYPES[extname(file)] : TYPES[".html"]) || "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(readFileSync(found ? file : join(dist, "404.html")));
}).listen(port, () => console.log(`RayTeX site: http://localhost:${port}${BASE}${mock ? " (sample releases)" : ""}`));
