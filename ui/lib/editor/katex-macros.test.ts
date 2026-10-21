// The commands of a project drawn by KaTeX as LaTeX draws them.
import assert from "node:assert/strict";
import { test } from "node:test";
import katex from "katex";
import { katexMacros, type MathMacro } from "./katex-macros.ts";

const PROJECT: MathMacro[] = [
  { name: "\\R", body: "\\ensuremath{\\mathbb{R}}\\xspace", args: 0 },
  { name: "\\vect", body: "\\vec{#1}_{#2}", args: 2, default: "u" },
  { name: "\\paire", body: "(#1, #2)", args: 3 },
  { name: "\\Tr", body: "\\operatorname{Tr}", args: 0 },
  { name: "\\abs", body: "", args: 1, paired: ["\\lvert", "\\rvert"] },
  { name: "\\N", body: "\\mathds{N}", args: 0 },
];

/** The formula drawn with the macros of the project, and the same one written out by hand. */
function same(withMacros: string, byHand: string) {
  const draw = (tex: string, macros: object) => katex.renderToString(tex, { throwOnError: true, strict: "ignore", output: "html", macros: { ...macros } });
  assert.equal(draw(withMacros, katexMacros(PROJECT)), draw(byHand, {}));
}

test("a command without arguments, and the ones of packages KaTeX does not know", () => {
  same("x \\in \\R", "x \\in \\mathbb{R}");
  same("\\N", "\\mathbb{N}");
});

test("an optional first argument: given or not", () => {
  same("\\vect{i}", "\\vec{u}_{i}");
  same("\\vect[v]{\\alpha x}", "\\vec{v}_{\\alpha x}");
  same("\\vect [w] {2}", "\\vec{w}_{2}");
});

test("every argument it is defined with is taken, even one its body leaves out", () => {
  same("\\paire{a}{b}{c} + 1", "(a, b) + 1");
});

test("a paired delimiter, its sizes and its star", () => {
  same("\\abs{x}", "\\mathopen{\\lvert} x \\mathclose{\\rvert}");
  same("\\abs*{\\frac12}", "\\left\\lvert \\frac12 \\right\\rvert");
  same("\\abs[\\big]{x}", "\\bigl\\lvert x \\bigr\\rvert");
  same("\\Tr A", "\\operatorname{Tr} A");
});
