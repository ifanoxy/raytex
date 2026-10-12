// The weight of a PDF with lighter pictures: estimates and the step for a limit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { estimate, megabytes, stepFor } from "./pdfweight.ts";

// A PDF of 42 MB: 40 MB of pictures, 2 MB of text and drawings.
const weights = { pictures: 12, original: 40_000_000, steps: [16_000_000, 9_000_000, 7_000_000, 4_000_000, 2_500_000, 1_600_000, 1_000_000, 700_000], pdf: 42_000_000 };

test("what the pictures lose is taken off the PDF", () => {
  assert.equal(estimate(weights, 1), 11_000_000);
  assert.equal(estimate(weights, 3), 6_000_000);
  assert.equal(estimate(weights, 7), 2_700_000);
  // No step of that number, or a PDF that was not weighed: nothing is said.
  assert.equal(estimate(weights, 8), null);
  assert.equal(estimate({ ...weights, pdf: null }, 1), null);
  // A PDF lighter than its pictures (several of them are not in it any more): never less than the pictures.
  assert.equal(estimate({ ...weights, pdf: 30_000_000 }, 3), 4_000_000);
});

test("the lightest touch that keeps the PDF under a limit", () => {
  assert.deepEqual(stepFor(weights, 50_000_000), { step: 0, within: true });
  assert.deepEqual(stepFor(weights, 10_000_000), { step: 2, within: true });
  assert.deepEqual(stepFor(weights, 6_000_000), { step: 3, within: true });
  assert.deepEqual(stepFor(weights, 2_700_000), { step: 7, within: true });
  // The text alone is heavier: the heaviest step, and it is said.
  assert.deepEqual(stepFor(weights, 1_500_000), { step: 7, within: false });
  assert.deepEqual(stepFor({ ...weights, pdf: null }, 10_000_000), { step: 7, within: false });
});

test("a size typed in megabytes", () => {
  assert.equal(megabytes("10"), 10_000_000);
  assert.equal(megabytes(" 7,5 "), 7_500_000);
  assert.equal(megabytes("2.5"), 2_500_000);
  assert.equal(megabytes(""), null);
  assert.equal(megabytes("0"), null);
  assert.equal(megabytes("dix"), null);
  assert.equal(megabytes("-3"), null);
});
