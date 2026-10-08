// Tests of what Tab writes after a trigger: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { expansion, triggerAt } from "./trigger.ts";

const item = (trigger: string, math = false, body = "x") => ({ trigger, body, math });
const items = [item("ff", true), item("al"), item("@vv", true), item("->"), item("fig"), item("subfig"), item("eq"), item("eq*")];

test("the trigger is found at the end of what is typed", () => {
  assert.equal(triggerAt("Soit al", items)?.trigger, "al");
  assert.equal(triggerAt("al", items)?.trigger, "al");
  assert.equal(triggerAt("$x = ff", items)?.trigger, "ff");
  assert.equal(triggerAt("\\sqrt{ff", items)?.trigger, "ff");
  assert.equal(triggerAt("a->", items)?.trigger, "->");
  assert.equal(triggerAt("$@vv", items)?.trigger, "@vv");
  assert.equal(triggerAt("Soit ff", items)?.trigger, "ff");
});

test("the trigger is a whole word", () => {
  assert.equal(triggerAt("canal", items), null);
  assert.equal(triggerAt("x2al", items), null);
  assert.equal(triggerAt("al ", items), null);
  assert.equal(triggerAt("subfig", items)?.trigger, "subfig");
  assert.equal(triggerAt("eq*", items)?.trigger, "eq*");
  assert.equal(triggerAt("eq", items)?.trigger, "eq");
});

test("the name of a command being typed is not a trigger", () => {
  assert.equal(triggerAt("\\al", items), null);
  assert.equal(triggerAt("$\\ff", items), null);
});

test("the first one wins among equals, the longest one otherwise", () => {
  const own = { trigger: "eq", body: "mine", math: false };
  assert.equal(triggerAt("eq", [own, ...items])?.body, "mine");
  assert.equal(triggerAt("eq*", [own, ...items])?.trigger, "eq*");
  assert.equal(triggerAt("Soit ", [item("")]), null);
});

test("a formula written in text goes between dollars", () => {
  const frac = item("ff", true, "\\frac{${1:a}}{${2:b}}${0}");
  assert.equal(expansion(frac, true), "\\frac{${1:a}}{${2:b}}${0}");
  assert.equal(expansion(frac, false), "$\\frac{${1:a}}{${2:b}}${0}$");
  assert.equal(expansion(item("b", false, "\\textbf{${1:${SELECTION}}}"), false), "\\textbf{${1:}}");
  // A body that opens a brace is not taken for a field.
  assert.equal(expansion(item("g", true, "{a}"), false), "$\\{a}$");
});
