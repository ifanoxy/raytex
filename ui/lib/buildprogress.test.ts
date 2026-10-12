// The progress of a build: pages counted in the output, time left.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProgress, pagesIn, roundedRemaining } from "./buildprogress.ts";

test("pages are counted as the engine ships them", () => {
  assert.equal(pagesIn("[1{/usr/local/texlive/2025/texmf-var/fonts/map/pdftex/updmap/pdftex.map}] [2] [3 <./figures/a.png>]"), 3);
  assert.equal(pagesIn("(./chapitres/intro.tex [12]"), 1);
  assert.equal(pagesIn("[4\n"), 1);
  // Numbering that starts again is one more page all the same.
  assert.equal(pagesIn("[1] [2] [1] [2]"), 4);
  // Not pages: empty boxes of a warning, an option, an index.
  assert.equal(pagesIn("Overfull \\hbox (3.2pt too wide) in paragraph at lines 4--5 [][]"), 0);
  assert.equal(pagesIn("\\usepackage[utf8]{inputenc} a[i] x[12a]"), 0);
  assert.equal(pagesIn(""), 0);
});

test("nothing is said without a build to compare with", () => {
  assert.deepEqual(buildProgress(null, { step: 0, stepMs: 500, pages: 3 }), { fraction: null, remainingMs: null });
  assert.deepEqual(buildProgress({ steps: [], pages: 10 }, { step: 0, stepMs: 500, pages: 3 }), { fraction: null, remainingMs: null });
});

test("one pass, judged by its pages", () => {
  const last = { steps: [{ name: "pdfLaTeX", durationMs: 4000 }], pages: 20 };
  // A quarter of the pages after one second: three more seconds at that pace.
  const p = buildProgress(last, { step: 0, stepMs: 1000, pages: 5 });
  assert.equal(p.fraction, 0.25);
  assert.equal(p.remainingMs, 3000);
  // A slower computer than last time: the pace of this build is what counts.
  assert.equal(buildProgress(last, { step: 0, stepMs: 4000, pages: 10 }).remainingMs, 4000);
  // More pages than last time: nearly done, never done.
  const over = buildProgress(last, { step: 0, stepMs: 5000, pages: 24 });
  assert.equal(over.fraction, 0.98);
  assert.ok(over.remainingMs! < 200);
});

test("several steps, each with the time it took last time", () => {
  const last = {
    steps: [
      { name: "pdfLaTeX", durationMs: 3000 },
      { name: "Biber", durationMs: 1000 },
      { name: "pdfLaTeX (2)", durationMs: 3000 },
      { name: "pdfLaTeX (3)", durationMs: 3000 },
    ],
    pages: 30,
  };
  // The start: everything is left.
  assert.deepEqual(buildProgress(last, { step: 0, stepMs: 0, pages: 0 }), { fraction: 0, remainingMs: 10_000 });
  // Biber writes no page: the clock tells.
  const biber = buildProgress(last, { step: 1, stepMs: 500, pages: 0 });
  assert.equal(biber.fraction, 0.35);
  assert.equal(biber.remainingMs, 6500);
  // Half of the last pass.
  const end = buildProgress(last, { step: 3, stepMs: 1500, pages: 15 });
  assert.equal(end.fraction, 0.85);
  assert.equal(end.remainingMs, 1500);
  // A step that takes longer than last time, without pages to count: no time is promised.
  assert.deepEqual(buildProgress(last, { step: 1, stepMs: 2500, pages: 0 }), { fraction: 0.398, remainingMs: null });
});

test("a pass more than last time is counted as an average one", () => {
  const last = { steps: [{ name: "pdfLaTeX", durationMs: 2000 }], pages: 10 };
  const p = buildProgress(last, { step: 1, stepMs: 1000, pages: 5 });
  assert.equal(p.fraction, 0.75);
  assert.equal(p.remainingMs, 1000);
});

test("a time left is said in round numbers", () => {
  assert.deepEqual(roundedRemaining(300), { n: 1, unit: "s" });
  assert.deepEqual(roundedRemaining(3400), { n: 3, unit: "s" });
  assert.deepEqual(roundedRemaining(12_400), { n: 10, unit: "s" });
  assert.deepEqual(roundedRemaining(43_000), { n: 45, unit: "s" });
  assert.deepEqual(roundedRemaining(58_000), { n: 1, unit: "min" });
  assert.deepEqual(roundedRemaining(200_000), { n: 3, unit: "min" });
});
