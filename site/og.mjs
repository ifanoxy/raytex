#!/usr/bin/env node
// Renders the picture shown when the site is shared (assets/img/og.png,
// 1200 × 630) from src/img/og.svg, with the logos embedded. Needs
// rsvg-convert (librsvg): `node site/og.mjs`.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let svg = readFileSync(join(here, "src/img/og.svg"), "utf8");
// librsvg only reads files next to the picture: the logos go inside it.
svg = svg.replace(/xlink:href="([^"]+\.svg)"/g, (_, ref) => {
  const data = readFileSync(join(here, "src/img", ref)).toString("base64");
  return `xlink:href="data:image/svg+xml;base64,${data}"`;
});
const tmp = join(mkdtempSync(join(tmpdir(), "raytex-og-")), "og.svg");
writeFileSync(tmp, svg);
execFileSync("rsvg-convert", [tmp, "-o", join(here, "assets/img/og.png")], { stdio: "inherit" });
console.log("written: site/assets/img/og.png");
