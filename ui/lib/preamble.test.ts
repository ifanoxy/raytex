// Tests of the preamble edits: `npm test` (Node's built-in test runner).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addLines,
  addPackages,
  addTikzLibraries,
  commentOutPackages,
  graphicsPaths,
  hasPackage,
  loadedPackages,
  setStatement,
} from "./preamble.ts";

const doc = `\\documentclass{article}
\\usepackage[T1]{fontenc}
% \\usepackage{tikz}
\\usepackage{amsmath, graphicx}
\\graphicspath{{figures/}{./img/}}

\\begin{document}
\\usepackage{fake}
\\end{document}
`;

test("packages of the preamble only, comments ignored", () => {
  assert.deepEqual(loadedPackages(doc).map((p) => p.names), [["fontenc"], ["amsmath", "graphicx"]]);
  assert.equal(hasPackage(doc, "tikz"), false);
  assert.equal(hasPackage(doc, "fake"), false);
  assert.deepEqual(graphicsPaths(doc), ["figures/", "img/"]);
});

test("addPackages inserts after the last package, once", () => {
  const out = addPackages(doc, [{ name: "tikz" }, { name: "graphicx" }, { name: "float", options: "section" }]);
  assert.match(out, /\\usepackage\{amsmath, graphicx\}\n\\usepackage\{tikz\}\n\\usepackage\[section\]\{float\}\n\\graphicspath/);
  assert.equal(addPackages(out, [{ name: "tikz" }]), out);
});

test("new packages go before hyperref", () => {
  const src = "\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage[hidelinks]{hyperref}\n\\usepackage{cleveref}\n\\begin{document}\n";
  const out = addPackages(src, [{ name: "tikz" }]);
  assert.equal(out, "\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{tikz}\n\\usepackage[hidelinks]{hyperref}\n\\usepackage{cleveref}\n\\begin{document}\n");
  const first = "\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\n";
  assert.equal(addPackages(first, [{ name: "tikz" }]), "\\documentclass{article}\n\\usepackage{tikz}\n\\usepackage{hyperref}\n\\begin{document}\n");
});

test("TikZ libraries are merged into an existing \\usetikzlibrary", () => {
  let out = addPackages(doc, [{ name: "tikz" }]);
  out = addTikzLibraries(out, ["positioning", "arrows.meta"]);
  assert.match(out, /\\usepackage\{tikz\}\n\\usetikzlibrary\{positioning,arrows\.meta\}/);
  out = addTikzLibraries(out, ["arrows.meta", "calc"]);
  assert.match(out, /\\usetikzlibrary\{positioning,arrows\.meta,calc\}/);
  assert.equal(addTikzLibraries(out, ["calc"]), out);
});

test("addLines skips lines already present", () => {
  const withPlots = addPackages(doc, [{ name: "pgfplots" }]);
  const out = addLines(withPlots, ["\\pgfplotsset{compat=1.18}"], "pgfplots");
  assert.match(out, /\\usepackage\{pgfplots\}\n\\pgfplotsset\{compat=1\.18\}/);
  assert.equal(addLines(out, ["\\pgfplotsset{compat=1.17}"], "pgfplots"), out);
});

test("setStatement replaces a multi-line font command", () => {
  const src = `\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{Old}[\n  Path = fonts/,\n  BoldFont = Old-Bold.otf\n]\n\\setmainfontx{keep}\n\\begin{document}\n`;
  const out = setStatement(src, "\\setmainfont", "\\setmainfont{New}");
  assert.equal(out, `\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{New}\n\\setmainfontx{keep}\n\\begin{document}\n`);
  const added = setStatement(doc, "\\setsansfont", "\\setsansfont{Fira Sans}", "fontenc");
  assert.match(added, /\\usepackage\[T1\]\{fontenc\}\n\\setsansfont\{Fira Sans\}\n/);
});

test("commentOutPackages keeps the other packages of the line", () => {
  const out = commentOutPackages(doc, ["fontenc", "amsmath"], "fontspec");
  assert.match(out, /% \\usepackage\[T1\]\{fontenc\} % fontspec/);
  assert.match(out, /\\usepackage\{graphicx\}\n% \\usepackage\{amsmath\} % fontspec/);
  assert.equal(hasPackage(out, "fontenc"), false);
  assert.equal(hasPackage(out, "graphicx"), true);
});
