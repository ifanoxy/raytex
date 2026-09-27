// Tests of the colours offered by the formatting bar (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_COLORS, customColorName, documentColors, DVIPS_COLORS, expressionCss, modelCss, SVG_COLORS, withXcolorOption } from "./colors.ts";
import { addPackageOption } from "./preamble.ts";

test("colour lists", () => {
  assert.equal(BASE_COLORS.length, 19);
  assert.equal(DVIPS_COLORS.length, 68);
  assert.ok(SVG_COLORS.length > 140);
  assert.ok(SVG_COLORS.some((c) => c.name === "DarkSlateGray" && c.css === "darkslategray"));
});

test("colours of a document", () => {
  const doc = [
    "\\documentclass{article}",
    "\\usepackage[dvipsnames, table]{xcolor}",
    "\\definecolor{marque}{HTML}{3A7BC2}",
    "\\definecolor{doux}{rgb}{1, 0.5, 0}",
    "\\colorlet{pale}{red!30}",
    "% \\definecolor{cache}{HTML}{000000}",
    "\\begin{document}",
    "\\definecolor{corps}{HTML}{111111}",
  ].join("\n");
  const c = documentColors(doc);
  assert.equal(c.xcolor, true);
  assert.deepEqual(c.options, ["dvipsnames", "table"]);
  assert.deepEqual(c.defined, [
    { name: "marque", css: "#3a7bc2" },
    { name: "doux", css: "#ff8000" },
    { name: "pale", css: "#ffb3b3" },
  ]);
  assert.equal(documentColors("\\usepackage{tikz}").xcolor, true);
  assert.equal(documentColors("\\usepackage{amsmath}").xcolor, false);
});

test("xcolor expressions and models", () => {
  assert.equal(expressionCss("blue!50!black", BASE_COLORS), "#000080");
  assert.equal(expressionCss("unknown", BASE_COLORS), null);
  assert.equal(modelCss("cmyk", "0,1,1,0"), "#ff0000");
  assert.equal(modelCss("gray", "0.5"), "#808080");
  assert.equal(customColorName("#3a7bc2"), "color3A7BC2");
});

test("package options", () => {
  assert.equal(addPackageOption("\\usepackage{xcolor}\n\\begin{document}", "xcolor", "dvipsnames"), "\\usepackage[dvipsnames]{xcolor}\n\\begin{document}");
  assert.equal(addPackageOption("\\usepackage[table]{xcolor}", "xcolor", "svgnames"), "\\usepackage[table,svgnames]{xcolor}");
  assert.equal(addPackageOption("\\usepackage[dvipsnames]{xcolor}", "xcolor", "dvipsnames"), "\\usepackage[dvipsnames]{xcolor}");
  assert.equal(addPackageOption("\\usepackage{amsmath,xcolor}", "xcolor", "dvipsnames"), "\\usepackage{amsmath}\n\\usepackage[dvipsnames]{xcolor}");
  assert.equal(addPackageOption("\\documentclass{article}\n\\begin{document}", "xcolor", "dvipsnames"), "\\documentclass{article}\n\\usepackage[dvipsnames]{xcolor}\n\\begin{document}");
});

test("xcolor options without option clash", () => {
  const add = (text: string) => addPackageOption(text, "xcolor", "dvipsnames");
  const plain = "\\documentclass{article}\n\\usepackage{xcolor}\n\\usepackage{tikz}\n\\begin{document}";
  assert.equal(withXcolorOption(plain, "dvipsnames", add), "\\documentclass{article}\n\\usepackage[dvipsnames]{xcolor}\n\\usepackage{tikz}\n\\begin{document}");
  // TikZ loads xcolor first: the option goes before \documentclass.
  const tikz = "\\documentclass{article}\n\\usepackage{tikz}\n\\usepackage{xcolor}\n\\begin{document}";
  const out = withXcolorOption(tikz, "dvipsnames", add);
  assert.ok(out.startsWith("\\PassOptionsToPackage{dvipsnames}{xcolor}\n\\documentclass{article}"), out);
  assert.equal(withXcolorOption(out, "dvipsnames", add), out, "only once");
  assert.ok(withXcolorOption(out, "svgnames", add).startsWith("\\PassOptionsToPackage{dvipsnames,svgnames}{xcolor}"));
  const beamer = "\\documentclass{beamer}\n\\begin{document}";
  assert.ok(withXcolorOption(beamer, "svgnames", add).startsWith("\\PassOptionsToPackage{svgnames}{xcolor}\n\\documentclass{beamer}"));
  // Nothing loads xcolor: it is added with the option.
  assert.ok(withXcolorOption("\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}", "dvipsnames", add).includes("\\usepackage[dvipsnames]{xcolor}"));
});
