#!/usr/bin/env node
// Runs the Tauri CLI with cargo on the PATH (`npm run app:dev`,
// `npm run app:build`).
//
// A program started outside a terminal (an IDE opened from the Dock) and a
// shell set up without Rust do not have cargo on their PATH: rustup from
// Homebrew stays out of it. Tauri then stops on "failed to run 'cargo
// metadata' … No such file or directory". When cargo is not on the PATH,
// the folder where rustup puts it is added.
//
//   node scripts/tauri.mjs dev
//   node scripts/tauri.mjs build --bundles app

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const has = (dir) => !!dir && existsSync(join(dir, cargo));
const path = (process.env.PATH ?? "").split(delimiter);

if (!path.some(has)) {
  const usual = [process.env.CARGO_HOME && join(process.env.CARGO_HOME, "bin"), join(homedir(), ".cargo", "bin"), "/opt/homebrew/opt/rustup/bin", "/usr/local/opt/rustup/bin"];
  const found = usual.find(has);
  if (!found) {
    console.error("cargo was not found. Install Rust (https://rustup.rs), or add the folder of cargo to the PATH.");
    process.exit(1);
  }
  process.env.PATH = [...path, found].join(delimiter);
}

// The CLI reads its arguments in process.argv, as if it had been started
// itself: no second process, so stopping this one stops everything.
await import(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
