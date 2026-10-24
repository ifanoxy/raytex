import { test } from "node:test";
import assert from "node:assert/strict";
import { onPixels, pixelSize } from "./pixels.ts";

const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-9;

test("a canvas falls on whole pixels of the screen, at any density", () => {
  for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.25, 3]) {
    for (const width of [100, 410.37, 513.6, 799.99]) {
      const px = pixelSize(width, width * 1.41, ratio);
      assert.ok(Number.isInteger(px.width) && Number.isInteger(px.height));
      assert.ok(whole(px.cssWidth * ratio) && whole(px.cssHeight * ratio), `${width} at ${ratio}`);
      // Never more than half a pixel of the screen from the size asked.
      assert.ok(Math.abs(px.cssWidth - width) <= 0.5 / ratio + 1e-9);
      // The page drawn over the whole canvas.
      assert.ok(Math.abs(width * px.transform[0] - px.width) < 1e-9);
      assert.ok(Math.abs(width * 1.41 * px.transform[3] - px.height) < 1e-9);
    }
  }
});

test("the size before: a canvas cut down to whole pixels, stretched over a box that is not", () => {
  // What the previews did: canvas floor(410.37 × 1.25) = 512 pixels over a
  // box of 410.37 CSS pixels = 512.96 pixels of the screen, so resampled.
  const ratio = 1.25;
  const width = 410.37;
  assert.notEqual(Math.floor(width * ratio), width * ratio);
  const px = pixelSize(width, 100, ratio);
  assert.equal(px.cssWidth * ratio, px.width);
});

test("a length is brought to whole pixels of the screen", () => {
  assert.equal(onPixels(410.37, 1), 410);
  assert.equal(onPixels(410.37, 1.25) * 1.25, 513);
  assert.equal(onPixels(410.37, 2), 410.5);
  assert.equal(onPixels(410.37, 0), 410);
});
