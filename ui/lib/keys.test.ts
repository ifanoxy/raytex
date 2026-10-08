// Tests of shortcut matching (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { forgetLayout, learnLayout, matchesKey, specFromEvent, typingKey } from "./keys.ts";

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

test("Windows and Linux: characters typed with AltGr (Ctrl + Alt) are never shortcuts", () => {
  // AZERTY: AltGr+4 gives {, AltGr+E gives €; Polish: AltGr+S gives ś.
  assert.equal(matchesKey(ev("{", "Digit4", { ctrl: true, alt: true }), "Mod-Alt-4", false), false);
  assert.equal(matchesKey(ev("€", "KeyE", { ctrl: true, alt: true }), "Mod-Alt-e", false), false);
  assert.equal(matchesKey(ev("ś", "KeyS", { ctrl: true, alt: true }), "Mod-Alt-s", false), false);
  assert.equal(matchesKey(ev("Dead", "Digit7", { ctrl: true, alt: true }), "Mod-Alt-7", false), false);
  // Real Ctrl + Alt shortcuts still work.
  assert.equal(matchesKey(ev("s", "KeyS", { ctrl: true, alt: true }), "Mod-Alt-s", false), true);
  assert.equal(matchesKey(ev("p", "KeyP", { ctrl: true, alt: true }), "Mod-Alt-p", false), true);
  // macOS: ⌥ characters with ⌘ keep their physical key.
  assert.equal(matchesKey(ev("π", "KeyP", { meta: true, alt: true }), "Mod-Alt-p", true), true);
});

test("a recorded shortcut is the one that is matched afterwards", () => {
  forgetLayout();
  const record = (e: ReturnType<typeof ev>, mac: boolean) => {
    const spec = specFromEvent(e, mac);
    assert.ok(spec, "a shortcut");
    assert.equal(matchesKey(e, spec!, mac), true, spec!);
    return spec;
  };
  // Plain combinations, on macOS and elsewhere.
  assert.equal(record(ev("m", "KeyM", { meta: true, shift: true }), true), "Mod-Shift-m");
  assert.equal(record(ev("M", "KeyM", { ctrl: true, shift: true }), false), "Mod-Shift-m");
  assert.equal(record(ev("k", "KeyK", { ctrl: true }), true), "Ctrl-k");
  assert.equal(record(ev("F5", "F5"), true), "F5");
  assert.equal(record(ev(" ", "Space", { ctrl: true }), false), "Mod-Space");
  // A modifier alone is not a shortcut.
  for (const key of ["Meta", "Alt", "Shift", "Control"]) assert.equal(specFromEvent(ev(key, `${key}Left`, { meta: true }), true), null);
});

test("macOS: with ⌥, the key is named, not the character it writes", () => {
  forgetLayout();
  // ⌥N writes a dead tilde, ⌥E a dead accent: the event says "Dead".
  assert.equal(specFromEvent(ev("Dead", "KeyN", { alt: true }), true), "Alt-n");
  assert.equal(specFromEvent(ev("Dead", "KeyE", { alt: true, meta: true }), true), "Mod-Alt-e");
  // ⌥M writes µ.
  assert.equal(specFromEvent(ev("µ", "KeyM", { alt: true }), true), "Alt-m");
  assert.equal(matchesKey(ev("µ", "KeyM", { alt: true }), "Alt-m", true), true);
  assert.equal(matchesKey(ev("Dead", "KeyN", { alt: true }), "Alt-n", true), true);
  // The digits of an AZERTY keyboard, which need Shift.
  assert.equal(specFromEvent(ev("1", "Digit1", { meta: true, shift: true }), true), "Mod-Shift-1");
});

test("AZERTY: with ⌥, the key keeps the letter printed on it once it was typed", () => {
  forgetLayout();
  // The key A of an AZERTY keyboard is at the place of Q: ⌥A writes æ.
  const optionA = ev("æ", "KeyQ", { alt: true });
  // Before anything was typed, only the place is known.
  assert.equal(specFromEvent(optionA, true), "Alt-q");
  learnLayout(ev("a", "KeyQ"));
  learnLayout(ev("q", "KeyA"));
  assert.equal(specFromEvent(optionA, true), "Alt-a");
  // Both ways of naming it match the key press: a shortcut recorded before
  // the letter was known goes on working.
  assert.equal(matchesKey(optionA, "Alt-a", true), true);
  assert.equal(matchesKey(optionA, "Alt-q", true), true);
  // Keys pressed with ⌥ teach nothing: they write other characters.
  learnLayout(ev("z", "KeyQ", { alt: true }));
  assert.equal(specFromEvent(optionA, true), "Alt-a");
  forgetLayout();
});

test("a key that writes text is not a shortcut", () => {
  for (const spec of ["Tab", "Shift-Tab", "Enter", "a", "Shift-a", "Space", "ArrowDown", "-"]) assert.equal(typingKey(spec), true, spec);
  for (const spec of ["Mod-Tab", "Alt-n", "Mod-Shift-p", "Ctrl-Space", "F5", "Shift-F12", "Mod--", ""]) assert.equal(typingKey(spec), false, spec);
});
