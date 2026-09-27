// Tests of shortcut matching (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesKey } from "./keys.ts";

const ev = (key: string, code: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

test("AZERTY: ⌘Z is undo, never close (the Z key is where US keyboards have W)", () => {
  const cmdZ = ev("z", "KeyW", { meta: true });
  assert.equal(matchesKey(cmdZ, "Mod-z", true), true);
  assert.equal(matchesKey(cmdZ, "Mod-w", true), false);
  const cmdW = ev("w", "KeyZ", { meta: true });
  assert.equal(matchesKey(cmdW, "Mod-w", true), true);
  assert.equal(matchesKey(cmdW, "Mod-z", true), false);
  // ⌘A (select all) on AZERTY is on the US Q key.
  assert.equal(matchesKey(ev("a", "KeyQ", { meta: true }), "Mod-q", true), false);
});

test("physical keys still help when the character is not a letter", () => {
  // macOS: ⌘⌥I produces a dead key.
  assert.equal(matchesKey(ev("Dead", "KeyI", { meta: true, alt: true }), "Mod-Alt-i", true), true);
  assert.equal(matchesKey(ev("ˆ", "KeyI", { meta: true, alt: true }), "Mod-Alt-i", true), true);
  // AZERTY digits without Shift produce symbols.
  assert.equal(matchesKey(ev("&", "Digit1", { ctrl: true }), "Mod-1", false), true);
});

test("modifiers and Shift", () => {
  assert.equal(matchesKey(ev("Z", "KeyZ", { meta: true, shift: true }), "Mod-Shift-z", true), true);
  assert.equal(matchesKey(ev("z", "KeyZ", { meta: true }), "Mod-Shift-z", true), false);
  assert.equal(matchesKey(ev("y", "KeyY", { ctrl: true }), "Mod-y", false), true);
  assert.equal(matchesKey(ev("y", "KeyY", { meta: true }), "Mod-y", false), false);
  // Punctuation: Shift is not checked (it may be needed to type it).
  assert.equal(matchesKey(ev(".", "Period", { meta: true, shift: true }), "Mod-.", true), true);
});
