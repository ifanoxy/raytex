#!/usr/bin/env node
// End-to-end check of the real application with a TeX distribution:
// runs the development build (`tauri dev`) once per group of scenes of
// ui/dev/selftest.ts on a fresh copy of tests/e2e/rapport, takes a
// screenshot at each scene and stops at the verdict.
//
//   node scripts/e2e.mjs                    # workflow, fixes, files, projects, media
//   node scripts/e2e.mjs fixes files        # some groups
//   E2E_OUT=out node scripts/e2e.mjs        # where logs and screenshots go
//
// macOS and Windows (screenshots of the whole screen). Exit code 1 when a
// group fails.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const groups = process.argv.slice(2).length ? process.argv.slice(2) : ["workflow", "fixes", "files", "projects", "media"];
const out = resolve(process.env.E2E_OUT ?? join(root, "e2e-output"));
const windows = process.platform === "win32";
// Compiling the application the first time can be long (25 min on a CI
// runner): the time of the scenes only counts once it runs.
const BUILD_TIMEOUT_MS = Number(process.env.E2E_BUILD_TIMEOUT_MS ?? 60 * 60_000);
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 20 * 60_000);

mkdirSync(out, { recursive: true });

// E2E_WINDOW=1 (macOS): pictures of the window of RayTeX alone, its rounded
// corners transparent and nothing of the screen in front of it.
let windowNumber = null;
function rayTeXWindow() {
  if (windowNumber) return windowNumber;
  const tool = join(tmpdir(), "raytex-window-id");
  if (!existsSync(tool)) spawnSync("swiftc", ["-O", join(root, "scripts/window-id.swift"), "-o", tool], { stdio: "ignore" });
  const found = spawnSync(tool, ["raytex"], { encoding: "utf8" }).stdout?.trim();
  windowNumber = found || null;
  return windowNumber;
}

function screenshot(file) {
  if (process.env.E2E_WINDOW && process.platform === "darwin") {
    for (let attempt = 0; attempt < 4 && !existsSync(file); attempt++) {
      if (attempt) spawnSync("sleep", ["0.6"]);
      const id = rayTeXWindow();
      if (id) spawnSync("screencapture", ["-x", "-o", `-l${id}`, file], { stdio: "ignore" });
    }
    if (!existsSync(file)) console.log(`no picture of the window for ${file}: allow your terminal to record the screen (System Settings → Privacy & Security → Screen & System Audio Recording)`);
    return;
  }
  if (windows) {
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms,System.Drawing",
      "$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds",
      "$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height",
      "$g = [System.Drawing.Graphics]::FromImage($bmp)",
      "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)",
      `$bmp.Save('${file.replace(/'/g, "''")}')`,
    ].join("; ");
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  } else if (process.platform === "darwin") {
    spawnSync("screencapture", ["-x", file], { stdio: "ignore" });
  }
}

function killTree(child) {
  if (!child.pid) return;
  if (windows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

async function run(group) {
  const work = join(tmpdir(), `raytex-e2e-${group}-${Date.now()}`);
  const project = join(work, "rapport");
  const assets = join(work, "assets");
  const config = join(work, "config");
  cpSync(join(root, "tests/e2e/rapport"), project, { recursive: true });
  cpSync(join(root, "tests/e2e/assets"), assets, { recursive: true });
  mkdirSync(config, { recursive: true });
  // E2E_LANG=en runs the scenes in English (the language of the CI runners).
  const lang = process.env.E2E_LANG ? `[general]\nlanguage = "${process.env.E2E_LANG}"\n` : "";
  writeFileSync(join(config, "settings.toml"), `${lang}[build]\nautoBuild = "onSave"\n`);
  const logFile = join(out, `${group}.log`);
  writeFileSync(logFile, "");

  // Cargo and TeX where they are usually installed, for a shell whose PATH
  // does not have them (rustup in ~/.cargo or from Homebrew, MacTeX).
  const usual = [join(homedir(), ".cargo", "bin"), "/opt/homebrew/opt/rustup/bin", "/opt/homebrew/bin", "/Library/TeX/texbin"].filter((d) => existsSync(d));
  const path = (process.env.PATH ?? "").split(delimiter);
  const env = {
    ...process.env,
    PATH: [...path, ...usual.filter((d) => !path.includes(d))].join(delimiter),
    RAYTEX_CONFIG_DIR: config,
    RAYTEX_SELFTEST: project,
    RAYTEX_SELFTEST_SCENES: group,
    RAYTEX_SELFTEST_ASSETS: assets,
  };
  const child = spawn(windows ? "npx.cmd" : "npx", ["tauri", "dev"], { cwd: root, env, detached: !windows, shell: windows });
  const seen = new Set();
  let verdict = null;
  const started = Date.now();

  let running = null;
  const onData = (chunk) => {
    const text = chunk.toString();
    appendFileSync(logFile, text);
    const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
    if (!running && (/Running `[^`]*raytex-app/.test(plain) || plain.includes("selftest:"))) running = Date.now();
    for (const m of text.matchAll(/scene: ([a-z0-9-]+)/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      screenshot(join(out, `${group}-${m[1]}.png`));
    }
    const end = new RegExp(`${group} scenes (PASSED|FAILED)|selftest: FAILED`).exec(text);
    if (end && !verdict) verdict = end[1] ?? "FAILED";
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  await new Promise((done) => {
    const timer = setInterval(() => {
      const late = running ? Date.now() - running > TIMEOUT_MS : Date.now() - started > BUILD_TIMEOUT_MS;
      if (verdict || late) {
        clearInterval(timer);
        setTimeout(() => {
          killTree(child);
          done();
        }, verdict ? 1500 : 0);
      }
    }, 500);
    child.on("exit", () => {
      clearInterval(timer);
      done();
    });
  });
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (e) {
    // A TeX run still ending holds a file (Windows): the folder stays.
    console.log(`${group}: ${work} not removed (${e.code ?? e})`);
  }
  // Without a verdict: the application never ran (its build failed: the
  // last lines say why), or the scenes did not end in time.
  const result = verdict ?? (running ? "TIMEOUT" : "NOT STARTED");
  console.log(`${group}: ${result} (${Math.round((Date.now() - started) / 1000)} s, ${seen.size} scenes) — ${logFile}`);
  if (!verdict && !running) {
    const tail = readFileSync(logFile, "utf8").trim().split("\n").slice(-6).join("\n");
    console.log(`The application did not start:\n${tail}`);
  }
  return result === "PASSED";
}

let ok = true;
for (const g of groups) ok = (await run(g)) && ok;
process.exit(ok ? 0 : 1);
