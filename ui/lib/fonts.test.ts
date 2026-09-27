// Tests of reading and editing the fonts of a document (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { documentFonts, extraFontUses, fontCommand, fontDisplayName, removeExtraFont, resetSlot, type KnownFontPackage } from "./fonts.ts";

const known: KnownFontPackage[] = [
  { package: "libertinus", name: "Libertinus", kind: "serif", math: true },
  { package: "roboto", name: "Roboto", kind: "sans", math: false },
  { package: "inconsolata", name: "Inconsolata", kind: "mono", math: false },
  { package: "newpxtext,newpxmath", name: "Palatino (New PX)", kind: "serif", math: true },
];

test("defaults and font packages", () => {
  const plain = documentFonts("\\documentclass{article}\n\\begin{document}\n\\end{document}", known);
  assert.equal(plain.main.name, "Computer Modern Roman");
  assert.equal(plain.main.source, "default");
  const doc = "\\documentclass{article}\n\\usepackage{libertinus}\n\\usepackage[sfdefault]{roboto}\n% \\usepackage{inconsolata}\n\\begin{document}\n\\usepackage{inconsolata}\n";
  const f = documentFonts(doc, known);
  assert.equal(f.main.name, "Roboto", "sfdefault makes the sans font the main one");
  assert.equal(f.sans.package, "roboto");
  assert.equal(f.math.name, "Libertinus");
  assert.equal(f.mono.source, "default", "comments and the body are ignored");
});

test("fontspec fonts and extra fonts", () => {
  const doc = [
    "\\usepackage{fontspec}",
    "\\setmainfont{Georgia}",
    "\\setsansfont{Demo-Regular.otf}[",
    "  Path = fonts/,",
    "  BoldFont = Demo-Bold.otf",
    "]",
    "\\newfontfamily\\fontTitle{Playfair Display}[Scale=1.1]",
    "\\begin{document}",
    "{\\fontTitle Bonjour} et {\\fontTitle encore}",
  ].join("\n");
  const f = documentFonts(doc, known);
  assert.equal(f.main.name, "Georgia");
  assert.equal(f.sans.name, "Demo");
  assert.equal(f.mono.name, "Latin Modern Mono");
  assert.deepEqual(f.extra, [{ command: "fontTitle", name: "Playfair Display" }]);
  assert.equal(extraFontUses(doc, "fontTitle"), 2);

  const noSans = resetSlot(doc, "sans", known, "");
  assert.ok(!noSans.includes("setsansfont") && !noSans.includes("BoldFont"), noSans);
  assert.ok(noSans.includes("\\setmainfont{Georgia}\n\\newfontfamily"));
  const noExtra = removeExtraFont(doc, "fontTitle");
  assert.ok(!noExtra.includes("newfontfamily") && noExtra.includes("{\\fontTitle Bonjour}"));
});

test("resetting a package font comments it out", () => {
  const doc = "\\usepackage[T1]{fontenc}\n\\usepackage{libertinus}\n\\begin{document}\n";
  const out = resetSlot(doc, "main", known, "replaced");
  assert.equal(out, "\\usepackage[T1]{fontenc}\n% \\usepackage{libertinus} % replaced\n\\begin{document}\n");
  assert.equal(documentFonts(out, known).main.source, "default");
});

test("names", () => {
  assert.equal(fontDisplayName("Source Serif 4"), "Source Serif 4");
  assert.equal(fontDisplayName("EBGaramond-Regular.otf"), "EBGaramond");
  assert.equal(fontCommand("Playfair Display"), "fontPlayfairDisplay");
  assert.equal(fontCommand("Times", ["fontTimes"]), "fontTimesB");
  assert.equal(fontCommand("Crimson Pro"), "fontCrimsonPro");
  assert.equal(fontCommand("123"), "fontExtra");
});
