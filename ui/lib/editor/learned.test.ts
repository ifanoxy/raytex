// A command typed in full again and again gets one offer of a shortcut.
import assert from "node:assert/strict";
import { test } from "node:test";
import { existingShortcut, type LearnedState, newKey, OFFER_AFTER, shortcutBody, typedOnce, worthShortcut } from "./learned.ts";

test("offered after a few times, once", () => {
  const state: LearnedState = { counts: {}, offered: [] };
  for (let i = 1; i < OFFER_AFTER; i++) assert.equal(typedOnce(state, "mathbb"), false);
  assert.equal(typedOnce(state, "mathbb"), true);
  state.offered.push("mathbb");
  assert.equal(typedOnce(state, "mathbb"), false);
});

test("short commands and those with their own tool are left out", () => {
  assert.equal(worthShortcut("pi"), false);
  assert.equal(worthShortcut("section"), false);
  assert.equal(worthShortcut("textbf"), false);
  assert.equal(worthShortcut("varepsilon"), true);
  const state: LearnedState = { counts: {}, offered: [] };
  for (let i = 0; i < 20; i++) assert.equal(typedOnce(state, "begin"), false);
});

test("a shortcut of RayTeX that writes it, or a new key", () => {
  const builtin: [string, string][] = [["a", "\\alpha"], ["/", "\\frac{${1}}{${2}}"], ["N", "\\mathbb{N}"]];
  assert.equal(existingShortcut("frac", builtin), "/");
  assert.equal(existingShortcut("alpha", builtin), "a");
  assert.equal(existingShortcut("mathbb", builtin), null);
  assert.equal(newKey("mathbb", new Set()), "bb");
  assert.equal(newKey("varepsilon", new Set(["va"])), "var");
  assert.equal(newKey("overline", new Set()), "ov");
  assert.equal(shortcutBody("mathbb", true), "\\mathbb{${1}}");
  assert.equal(shortcutBody("infty", false), "\\infty");
});
