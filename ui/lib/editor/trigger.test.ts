// Tests of the trigger of a macro: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { triggerAt } from "./trigger.ts";

const macro = (trigger: string, math = false) => ({ name: trigger, trigger, key: "", body: "x", math });
const macros = [macro("ff", true), macro("al"), macro("@vv", true), macro("->")];
const text = () => false;
const formula = () => true;

test("the trigger is found at the end of what is typed", () => {
  assert.equal(triggerAt("Soit al", macros, text)?.trigger, "al");
  assert.equal(triggerAt("al", macros, text)?.trigger, "al");
  assert.equal(triggerAt("$x = ff", macros, formula)?.trigger, "ff");
  assert.equal(triggerAt("\\sqrt{ff", macros, formula)?.trigger, "ff");
  assert.equal(triggerAt("a->", macros, text)?.trigger, "->");
  assert.equal(triggerAt("$@vv", macros, formula)?.trigger, "@vv");
});

test("the trigger is a whole word", () => {
  assert.equal(triggerAt("canal", macros, text), null);
  assert.equal(triggerAt("x2al", macros, text), null);
  assert.equal(triggerAt("al ", macros, text), null);
});

test("the name of a command being typed is not a trigger", () => {
  assert.equal(triggerAt("\\al", macros, text), null);
  assert.equal(triggerAt("$\\ff", macros, formula), null);
});

test("a macro of formulas is left alone in text", () => {
  assert.equal(triggerAt("Soit ff", macros, text), null);
  assert.equal(triggerAt("Soit @vv", macros, text), null);
});

test("an empty trigger never matches", () => {
  assert.equal(triggerAt("Soit ", [macro("")], text), null);
});
