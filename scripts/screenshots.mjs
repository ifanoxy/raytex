#!/usr/bin/env node
// The screenshots of the website and the README, taken in the real
// application (macOS, a TeX distribution installed): runs the "shots"
// scenes of ui/dev/selftest.ts through scripts/e2e.mjs (the window at
// 1400 x 813, light and dark, French and English), each a picture of the
// window of RayTeX alone (rounded corners transparent, no other window or
// notification of the system in front of it), and writes them at
// 1400 x 813 into docs/screenshots/{en,fr}/{editor,tikz,problems}-{light,dark}.png.
//
//   node scripts/screenshots.mjs

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") {
  console.error("screenshots.mjs runs on macOS (screencapture, sips).");
  process.exit(1);
}
const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "raytex-shots-"));
const run = spawnSync(process.execPath, [join(root, "scripts/e2e.mjs"), "shots"], { env: { ...process.env, E2E_OUT: out, E2E_WINDOW: "1" }, stdio: "inherit" });

let written = 0;
for (const file of readdirSync(out)) {
  const m = /^shots-(editor|tikz|problems)-(fr|en)-(light|dark)\.png$/.exec(file);
  if (!m) continue;
  const [, name, lang, theme] = m;
  const dir = join(root, "docs/screenshots", lang);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${name}-${theme}.png`);
  const sips = (...args) => spawnSync("sips", args, { stdio: "ignore" }).status === 0;
  const ok = sips("-z", "813", "1400", join(out, file), "--out", dest);
  if (ok) written++;
  console.log(`${ok ? "written" : "FAILED"}: ${dest}`);
}
if (written && !run.status) rmSync(out, { recursive: true, force: true });
console.log(`${written} screenshot(s)${run.status ? ` (the scenes reported a failure: see ${out})` : ""}`);
process.exit(written && !run.status ? 0 : 1);
