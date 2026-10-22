// Tests of the path helpers: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { inFolder, relative } from "./utils.ts";

test("a path is in a folder, itself included, not in one of a longer name", () => {
  assert.ok(inFolder("/u/doc/these/main.tex", "/u/doc/these"));
  assert.ok(inFolder("/u/doc/these/main.tex", "/u/doc/these/"));
  assert.ok(inFolder("/u/doc/these", "/u/doc/these"));
  assert.ok(!inFolder("/u/doc/these-2/main.tex", "/u/doc/these"));
  assert.ok(!inFolder("/u/doc/main.tex", "/u/doc/these"));
  assert.ok(!inFolder("/u/doc/main.tex", null));
  assert.ok(!inFolder(null, "/u/doc"));
});

test("Windows paths are compared with either slash", () => {
  assert.ok(inFolder("C:\\Users\\a\\these\\main.tex", "C:/Users/a/these"));
  assert.equal(relative("C:\\Users\\a\\these", "C:\\Users\\a\\these\\ch\\un.tex"), "ch/un.tex");
});
