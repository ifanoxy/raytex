// One mistake seen by several checks is shown once.
import assert from "node:assert/strict";
import { test } from "node:test";
import { oneEach } from "./problems.ts";
import type { Diagnostic, Fix } from "./types";

const at = (line: number, from: number, to: number) => ({ start: { line, character: from }, end: { line, character: to } });

function problem(severity: Diagnostic["severity"], source: Diagnostic["source"], message: string, range: Diagnostic["range"], fixes: Fix[]): Diagnostic {
  return { severity, source, code: null, message, file: "/p/main.tex", range, line: range ? range.start.line + 1 : null, endLine: null, contextBefore: null, contextAfter: null, raw: null, hint: null, fixes };
}

const replace = (word: string): Fix => ({ kind: "edits", title: `Remplacer par ${word}`, edits: [{ file: "/p/main.tex", range: at(2, 11, 15), text: word }] });

test("a key mistyped, said by LaTeX, by Biber and by the live checks: once", () => {
  const list = [
    problem("warning", "latex", "Citation `knut' undefined", at(2, 11, 15), [replace("knuth")]),
    problem("warning", "biber", "I didn't find a database entry for knut", at(2, 11, 15), [replace("knuth")]),
    problem("warning", "lint", "Citation inconnue", at(2, 11, 15), [replace("knuth")]),
  ];
  assert.deepEqual(oneEach(list).map((d) => d.source), ["latex"]);
});

test("the most serious one stays, wherever it comes in the list", () => {
  const close: Fix = { kind: "edits", title: "Fermer l'accolade", edits: [{ file: "/p/main.tex", range: at(2, 18, 18), text: "}" }] };
  const list = [problem("warning", "syntax", "Accolade jamais fermée", at(2, 16, 17), [close]), problem("error", "latex", "File ended while scanning use of \\textbf", at(2, 9, 17), [close])];
  assert.deepEqual(oneEach(list).map((d) => d.source), ["latex"]);
});

test("one fix for two places, or two fixes for one place: all stay", () => {
  const siunitx: Fix = { kind: "addPackage", package: "siunitx" };
  const two = [problem("error", "latex", "Undefined control sequence", at(2, 16, 19), [siunitx]), problem("error", "latex", "Undefined control sequence", at(2, 23, 29), [siunitx])];
  assert.equal(oneEach(two).length, 2);
  const different = [problem("error", "latex", "Undefined control sequence", at(2, 16, 19), [siunitx]), problem("info", "lint", "Style", at(2, 16, 19), [replace("x")])];
  assert.equal(oneEach(different).length, 2);
  // Without a fix, nothing tells they are the same mistake.
  const bare = [problem("error", "latex", "A", at(2, 1, 4), []), problem("error", "latex", "A", at(2, 1, 4), [])];
  assert.equal(oneEach(bare).length, 2);
});

test("a problem known by its line only meets the problems of that line", () => {
  const fix: Fix = { kind: "addPackage", package: "amsmath" };
  const line = { ...problem("error", "latex", "Environment align undefined", null, [fix]), line: 3 };
  const list = [line, problem("info", "lint", "align nécessite amsmath", at(2, 0, 13), [fix]), problem("info", "lint", "ailleurs", at(7, 0, 4), [fix])];
  assert.deepEqual(oneEach(list).map((d) => d.message), ["Environment align undefined", "ailleurs"]);
});

test("a reference never defined, said by LaTeX and by the live checks: once; two by LaTeX on a line: both", () => {
  const coded = (source: Diagnostic["source"], message: string, range: Diagnostic["range"], line?: number): Diagnostic => ({ ...problem("warning", source, message, range, []), code: "undefined-reference", ...(line ? { line } : {}) });
  const list = [coded("latex", "Reference `a' undefined", at(4, 5, 6)), coded("lint", "Label non défini : « a »", at(4, 5, 6))];
  assert.deepEqual(oneEach(list).map((d) => d.source), ["latex"]);
  const two = [coded("latex", "Reference `a' undefined", null, 5), coded("latex", "Reference `b' undefined", null, 5)];
  assert.equal(oneEach(two).length, 2);
});
