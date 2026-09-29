// Tests of the image helpers: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { figureAt, figureCode, safeStem, targetExtension } from "./images.ts";

test("names follow the engine's rules", () => {
  assert.equal(safeStem("Capture d’écran 2026-09-27 à 10.12.33"), "capture-d-ecran-2026-09-27-a-10-12-33");
  assert.equal(safeStem("Œuvre (finale)"), "oeuvre-finale");
  assert.equal(safeStem("???"), "image");
  assert.equal(targetExtension("svg"), "pdf");
  assert.equal(targetExtension("webp"), "png");
  assert.equal(targetExtension("jpeg"), "jpg");
  assert.equal(targetExtension("", "image/png"), "png");
});

test("one image in a figure", () => {
  const code = figureCode({ paths: ["figures/plot"], captions: [], labels: [], mode: "figure", width: 80, placement: "htbp", caption: "A plot.", label: "fig:plot", columns: 2 });
  assert.equal(code, "\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{figures/plot}\n\t\\caption{A plot.}\n\t\\label{fig:plot}\n\\end{figure}");
});

test("sub-figures in rows", () => {
  const code = figureCode({ paths: ["a", "b", "c"], captions: ["A", "", "C"], labels: ["fig:a", "", ""], mode: "figure", width: 80, placement: "H", caption: "All.", label: "", columns: 2 });
  assert.match(code, /^\\begin\{figure\}\[H\]/);
  assert.equal((code.match(/\\begin\{subfigure\}\[b\]\{0\.48\\linewidth\}/g) ?? []).length, 3);
  assert.match(code, /\\end\{subfigure\}\n\t\\hfill\n\t\\begin\{subfigure\}/);
  assert.match(code, /\\end\{subfigure\}\n\t\\par\\medskip\n\t\\begin\{subfigure\}/);
  assert.ok(!code.includes("\\label{}"));
});

test("inline images and full width", () => {
  assert.equal(
    figureCode({ paths: ["x", "y"], captions: [], labels: [], mode: "inline", width: 100, placement: "", caption: "", label: "", columns: 1 }),
    "\\includegraphics[width=\\linewidth]{x}\\hfill\n\\includegraphics[width=\\linewidth]{y}",
  );
});

test("a figure of the document is read back for the image dialog", () => {
  const fig = "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.7\\linewidth]{figures/courbe}\n  \\caption{Profil de {la} température.}\n  \\label{fig:courbe}\n\\end{figure}";
  const text = `Texte\n${fig}\nSuite`;
  const f = figureAt(text, text.indexOf("\\includegraphics"))!;
  assert.equal(f.mode, "figure");
  assert.equal(text.slice(f.from, f.to), fig);
  assert.deepEqual([f.path, f.width, f.placement, f.caption, f.label], ["figures/courbe", 70, "htbp", "Profil de {la} température.", "fig:courbe"]);
  // Anything else in the figure: only the command is edited.
  const busy = fig.replace("\\centering", "\\centering\\small Source : INSEE.");
  const g = figureAt(busy, busy.indexOf("\\includegraphics"))!;
  assert.equal(g.mode, "inline");
  assert.equal(busy.slice(g.from, g.to), "\\includegraphics[width=0.7\\linewidth]{figures/courbe}");
  // Options other than a width of the line are kept.
  const h = figureAt("\\includegraphics[scale=0.5, angle=90]{a.png}", 0)!;
  assert.equal(h.width, null);
  assert.equal(h.options, "scale=0.5, angle=90");
  assert.equal(figureAt("\\includegraphics{b}", 0)!.width, null);
  assert.equal(figureAt("\\includegraphics[width=\\textwidth]{b}", 0)!.width, 100);
});
