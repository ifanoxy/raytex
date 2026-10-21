// A PDF still being written is told from a whole one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { wholePdf } from "./written.ts";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

test("a whole PDF ends with %%EOF, a line end after it or not", () => {
  assert.ok(wholePdf(bytes("%PDF-1.5\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n9\n%%EOF\n")));
  assert.ok(wholePdf(bytes("%PDF-1.7\n...\n%%EOF")));
});

test("a PDF cut while it is written, or nothing, is not whole", () => {
  assert.ok(!wholePdf(bytes("%PDF-1.5\n1 0 obj\n<< /Type /Page")));
  assert.ok(!wholePdf(bytes("")));
});
