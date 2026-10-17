import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTool } from "./inline.ts";

test("the tools of a text: written around the words, taken off again", () => {
  const bold = applyTool("Un mot ici", 3, 6, "bold");
  assert.deepEqual(bold, { value: "Un \\textbf{mot} ici", start: 11, end: 14 });
  assert.deepEqual(applyTool(bold.value, bold.start, bold.end, "bold"), { value: "Un mot ici", start: 3, end: 6 });
  // Nothing chosen: the command, the caret inside.
  assert.deepEqual(applyTool("a ", 2, 2, "alert"), { value: "a \\alert{}", start: 9, end: 9 });
  // A colour, then another one in its place, then taken off.
  const red = applyTool("x y", 2, 3, "color", "red");
  assert.equal(red.value, "x \\textcolor{red}{y}");
  const blue = applyTool(red.value, red.start, red.end, "color", "blue");
  assert.equal(blue.value, "x \\textcolor{blue}{y}");
  assert.equal(applyTool(blue.value, blue.start, blue.end, "color", "blue").value, "x y");
  assert.equal(applyTool("E", 0, 1, "math").value, "$E$");
  // A link: the address chosen, to be typed.
  const link = applyTool("le site", 3, 7, "link");
  assert.equal(link.value, "le \\href{https://}{site}");
  assert.equal(link.value.slice(link.start, link.end), "https://");
});
