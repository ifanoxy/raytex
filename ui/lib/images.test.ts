// Tests of the image helpers: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { figureCode, safeStem, targetExtension } from "./images.ts";

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
