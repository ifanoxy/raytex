import { test } from "node:test";
import assert from "node:assert/strict";
import { autoClosed } from "./pairs.ts";

test("the bracket closed while typing an @ shortcut is replaced with it", () => {
  assert.equal(autoClosed("@[", "]"), true);
  assert.equal(autoClosed("@{", "}"), true);
  assert.equal(autoClosed("@(", ")"), true);
  assert.equal(autoClosed("@[", "}"), false);
  assert.equal(autoClosed("@a", ")"), false);
  assert.equal(autoClosed("@|", "|"), false);
});
