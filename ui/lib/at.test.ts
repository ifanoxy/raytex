// Tests of the `@` shortcuts of the user: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { atBody, atKey, atPreview, cleanAtKey, mergeShortcuts, validAtKey } from "./at.ts";

test("a key is a short word without spaces", () => {
  for (const key of ["v", "vec", "->", "é", "x2", "123456789012"]) assert.equal(validAtKey(key), true, key);
  for (const key of ["", "a b", "a\\b", "@a", "{", "$", "1234567890123"]) assert.equal(validAtKey(key), false, key);
  assert.equal(atKey({ trigger: "@vec" }), "vec");
  assert.equal(atKey({ trigger: "vec" }), null);
  assert.equal(atKey({ trigger: "@" }), null);
  assert.equal(atKey({ trigger: "@a b" }), null);
  assert.equal(cleanAtKey("  @@v "), "v");
});

test("a command typed with empty braces gets fields", () => {
  assert.equal(atBody("\\vec{}"), "\\vec{${1}}");
  assert.equal(atBody(" \\frac{}{} "), "\\frac{${1}}{${2}}");
  assert.equal(atBody("\\mathbb{R}"), "\\mathbb{R}");
  // Fields already written are kept as they are.
  assert.equal(atBody("\\sum_{${1:i}}^{}"), "\\sum_{${1:i}}^{}");
  // Shown to a person, a field is its text or three dots.
  assert.equal(atPreview("\\vec{${1}}"), "\\vec{…}");
  assert.equal(atPreview("\\sum_{${1:i}=1}^{${2:n}} ${0}"), "\\sum_{i=1}^{n} …");
});

test("the shortcuts of the user come first and replace those of RayTeX", () => {
  const builtin: [string, string][] = [
    ["a", "\\alpha"],
    ["b", "\\beta"],
  ];
  const macros = [
    { trigger: "@v", body: "\\vec{${1}}" },
    { trigger: "ff", body: "\\frac{${1}}{${2}}" },
    { trigger: "@a", body: "\\aleph" },
  ];
  const all = mergeShortcuts(builtin, macros);
  assert.deepEqual(
    all.map((s) => [s.key, s.body, !!s.own]),
    [
      ["v", "\\vec{${1}}", true],
      ["a", "\\aleph", true],
      ["b", "\\beta", false],
    ],
  );
  assert.equal(all[0].own, macros[0]);
});
