// Tests of the image helpers: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { figureAt, figureCode, figureGroupAt, firstPictureOf, safeStem, splitAlt, targetExtension } from "./images.ts";

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

test("a figure of several images is read back as one group", () => {
  const options = { paths: ["figures/a", "figures/b", "figures/c"], captions: ["Avant", "", "Après {x}"], labels: ["fig:a", "", "fig:c"], mode: "figure" as const, width: 80, placement: "H", caption: "Les trois essais.", label: "fig:essais", columns: 2 };
  const fig = figureCode(options);
  const text = `Texte avant.\n${fig}\nTexte après.`;
  // From any of its pictures, the same group: the whole figure.
  for (const path of options.paths) {
    const g = figureGroupAt(text, text.indexOf(`\\includegraphics[width=\\linewidth]{${path}}`))!;
    assert.equal(text.slice(g.from, g.to), fig);
    assert.equal(g.mode, "figure");
    assert.deepEqual(g.images, [
      { path: "figures/a", caption: "Avant", label: "fig:a", alt: "" },
      { path: "figures/b", caption: "", label: "", alt: "" },
      { path: "figures/c", caption: "Après {x}", label: "fig:c", alt: "" },
    ]);
    assert.deepEqual([g.columns, g.placement, g.caption, g.label], [2, "H", "Les trois essais.", "fig:essais"]);
    assert.equal(firstPictureOf(text, g), text.indexOf("\\includegraphics"));
    // Written again from what was read, it is the same code.
    assert.equal(figureCode({ ...options, paths: g.images.map((i) => i.path), captions: g.images.map((i) => i.caption), labels: g.images.map((i) => i.label), columns: g.columns, placement: g.placement, caption: g.caption, label: g.label }), fig);
  }
  // Pictures per row: where the first row ends, or what their width allows.
  for (const [n, columns] of [[2, 2], [3, 3], [4, 4], [4, 2], [3, 1], [2, 1]] as const) {
    const code = figureCode({ ...options, paths: options.paths.concat("figures/d").slice(0, n), captions: [], labels: [], columns });
    assert.equal(figureGroupAt(code, code.indexOf("\\includegraphics"))!.columns, columns, `${n} images, ${columns} per row`);
  }
  // Indented with spaces, with a comment: still the group.
  const spaced = fig.replace(/\t/g, "    ").replace("\\hfill", "\\hfill % côte à côte");
  assert.equal(figureGroupAt(spaced, spaced.indexOf("\\includegraphics"))!.images.length, 3);
});

test("what the dialog did not write is left alone", () => {
  const fig = figureCode({ paths: ["a", "b"], captions: [], labels: [], mode: "figure", width: 80, placement: "htbp", caption: "Deux.", label: "", columns: 2 });
  // Something else in the figure, or in one of its sub-figures: not a group to rewrite.
  const noted = fig.replace("\\caption{Deux.}", "\\caption{Deux.}\n\t\\footnotesize Source : INSEE.");
  assert.equal(figureGroupAt(noted, noted.indexOf("\\includegraphics")), null);
  const framed = fig.replace("\\includegraphics[width=\\linewidth]{a}", "\\fbox{\\includegraphics[width=\\linewidth]{a}}");
  assert.equal(figureGroupAt(framed, framed.indexOf("\\includegraphics")), null);
  // A picture on its own, in a figure or not.
  const one = figureCode({ paths: ["a"], captions: [], labels: [], mode: "figure", width: 60, placement: "htbp", caption: "Une.", label: "", columns: 2 });
  assert.equal(figureGroupAt(one, one.indexOf("\\includegraphics")), null);
  assert.equal(figureGroupAt("Voir \\includegraphics{a} et plus loin \\includegraphics{b}.", 5), null);
  assert.equal(figureGroupAt("pas une image", 0), null);
});

test("images side by side are one group", () => {
  const run = figureCode({ paths: ["x", "y", "z"], captions: [], labels: [], mode: "inline", width: 30, placement: "", caption: "", label: "", columns: 1 });
  const text = `\\begin{center}\n${run}\n\\end{center}`;
  const g = figureGroupAt(text, text.indexOf("\\includegraphics[width=0.3\\linewidth]{y}"))!;
  assert.equal(g.mode, "inline");
  assert.equal(text.slice(g.from, g.to), run);
  assert.deepEqual(g.images.map((i) => i.path), ["x", "y", "z"]);
  assert.deepEqual([g.width, g.options], [30, null]);
  // In a figure written by hand: the pictures only, the rest of the figure is not touched.
  const byHand = "\\begin{figure}\n\\centering\n\\includegraphics[height=3cm]{a}\\hfill\\includegraphics[height=3cm]{b}\n\\caption{Deux images} \\small Source.\n\\end{figure}";
  const h = figureGroupAt(byHand, byHand.indexOf("\\includegraphics"))!;
  assert.equal(byHand.slice(h.from, h.to), "\\includegraphics[height=3cm]{a}\\hfill\\includegraphics[height=3cm]{b}");
  assert.deepEqual([h.width, h.options], [null, "height=3cm"]);
  // Each with its own size: they are not rewritten as one.
  const mixed = "\\includegraphics[width=2cm]{a}\\hfill\\includegraphics[width=5cm]{b}";
  assert.equal(figureGroupAt(mixed, 0), null);
  // Next to each other without `\hfill`: two pictures, not a group.
  assert.equal(figureGroupAt("\\includegraphics{a} \\includegraphics{b}", 0), null);
});

test("the text in place of a picture (alt) is read, kept apart from its width, and written back", () => {
  assert.deepEqual(splitAlt("width=0.5\\linewidth, alt={Un graphique, en barres}"), { alt: "Un graphique, en barres", rest: "width=0.5\\linewidth" });
  assert.deepEqual(splitAlt("alt=Courbe, scale=2"), { alt: "Courbe", rest: "scale=2" });
  assert.deepEqual(splitAlt("width=3cm"), { alt: "", rest: "width=3cm" });
  const doc = "\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth, alt={Le montage}]{figures/a}\n\t\\caption{Montage}\n\\end{figure}";
  const f = figureAt(doc, doc.indexOf("\\includegraphics"))!;
  assert.equal(f.width, 80);
  assert.equal(f.alt, "Le montage");
  const code = figureCode({ paths: ["figures/a"], captions: [""], labels: [""], mode: "figure", width: 80, placement: "htbp", caption: "Montage", label: "", columns: 1, alts: ["Le montage"] });
  assert.ok(code.includes("\\includegraphics[width=0.8\\linewidth, alt={Le montage}]{figures/a}"));
  const two = figureCode({ paths: ["a", "b"], captions: ["", ""], labels: ["", ""], mode: "figure", width: 80, placement: "htbp", caption: "Deux", label: "", columns: 2, alts: ["", "Le second"] });
  assert.ok(two.includes("\\includegraphics[width=\\linewidth]{a}") && two.includes("\\includegraphics[width=\\linewidth, alt={Le second}]{b}"));
  const group = figureGroupAt(two, two.indexOf("\\includegraphics"))!;
  assert.deepEqual(group.images.map((i) => i.alt), ["", "Le second"]);
  const side = "\\includegraphics[width=0.4\\linewidth, alt={Un}]{a}\\hfill\n\\includegraphics[width=0.4\\linewidth]{b}";
  const g = figureGroupAt(side, 0)!;
  assert.equal(g.width, 40);
  assert.deepEqual(g.images.map((i) => i.alt), ["Un", ""]);
});
