#!/usr/bin/env node
// End-to-end check of the real application with a TeX distribution:
// runs the development build (`tauri dev`) once per group of scenes of
// ui/dev/selftest.ts on a fresh copy of tests/e2e/rapport, takes a
// screenshot at each scene and stops at the verdict.
//
//   node scripts/e2e.mjs                    # workflow, fixes, files, projects, media
//   node scripts/e2e.mjs fixes files        # some groups
//   E2E_OUT=out node scripts/e2e.mjs        # where logs and screenshots go
//   E2E_SHOTS=0 node scripts/e2e.mjs        # no screenshots (they are of the whole screen)
//   E2E_BUILT=1 node scripts/e2e.mjs        # the built application, not the development one
//
// The built application reads its pages from the program itself, under
// the security policy of tauri.conf.json: what that policy refuses (a
// style, in 0.4.0) is only seen there. It is built once, in debug, with
// the self-test in it (`vite build --mode selftest`).
//
// When the port of the development server is taken (the application is
// open in development next to this run), the scenes use another one.
//
// macOS and Windows (screenshots of the whole screen). Exit code 1 when a
// group fails.

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
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
// The screenshots are of the whole screen: on a personal computer they
// show whatever else is open, and can be turned off.
const SHOTS = process.env.E2E_SHOTS !== "0";
const BUILT = process.env.E2E_BUILT === "1";

mkdirSync(out, { recursive: true });

function screenshot(file) {
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

/** Whether nothing listens on `port` (on either loopback address, as vite checks). */
function free(port) {
  const on = (host) =>
    new Promise((done) => {
      const server = createServer();
      server.once("error", () => done(false));
      server.once("listening", () => server.close(() => done(true)));
      server.listen(port, host);
    });
  return on("127.0.0.1").then((a) => a && on("::1").catch(() => true));
}

/** The port of the development server: the usual one, or the next free one. */
async function devPort() {
  for (let port = 1420; port < 1520; port += 10) if (await free(port)) return port;
  return 1420;
}

let app = null;

/** The application built once for the scenes: in debug, with the self-test, its pages inside. */
function builtApp(env) {
  if (app) return app;
  const override = join(tmpdir(), `raytex-e2e-build-${Date.now()}.json`);
  writeFileSync(override, JSON.stringify({ build: { beforeBuildCommand: { script: "npm run build -- --mode selftest", cwd: "../.." } } }));
  console.log("Building the application…");
  const done = spawnSync(windows ? "npx.cmd" : "npx", ["tauri", "build", "--debug", "--no-bundle", "--config", override], { cwd: root, env, shell: windows, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  rmSync(override, { force: true });
  const output = `${done.stdout ?? ""}${done.stderr ?? ""}`;
  appendFileSync(join(out, "build.log"), output);
  // Tauri names the program after the product, and says where it is.
  const at = /Built application at: (.+)/.exec(output.replace(/\x1b\[[0-9;]*m/g, ""));
  if (done.status !== 0 || !at || !existsSync(at[1].trim())) {
    console.log(`The application could not be built:\n${output.trim().split("\n").slice(-8).join("\n")}`);
    process.exit(1);
  }
  app = at[1].trim();
  return app;
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
  let child;
  if (BUILT) {
    child = spawn(builtApp(env), [], { cwd: root, env, detached: !windows });
  } else {
    const port = await devPort();
    const args = ["tauri", "dev"];
    if (port !== 1420) {
      const override = join(work, "tauri.dev.json");
      writeFileSync(override, JSON.stringify({ build: { devUrl: `http://localhost:${port}`, beforeDevCommand: `npm run dev -- --port ${port}` } }));
      args.push("--config", override);
    }
    child = spawn(windows ? "npx.cmd" : "npx", args, { cwd: root, env, detached: !windows, shell: windows });
  }
  const seen = new Set();
  let verdict = null;
  const started = Date.now();

  let running = null;
  const onData = (chunk) => {
    const text = chunk.toString();
    appendFileSync(logFile, text);
    const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
    if (!running && (BUILT || /Running `[^`]*raytex-app/.test(plain) || plain.includes("selftest:"))) running = Date.now();
    for (const m of text.matchAll(/scene: ([a-z0-9-]+)/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      if (SHOTS) screenshot(join(out, `${group}-${m[1]}.png`));
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
