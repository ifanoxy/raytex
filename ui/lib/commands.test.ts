// Tests of the helpers of the command manager: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { signature, specFromSelection } from "./commands.ts";

test("a signature shows one mark per argument", () => {
  assert.equal(signature({ name: "R", kind: "command", args: 0, firstOptional: false }), "\\R");
  assert.equal(signature({ name: "norme", kind: "command", args: 1, firstOptional: false }), "\\norme{·}");
  assert.equal(signature({ name: "cadre", kind: "command", args: 2, firstOptional: true }), "\\cadre[·]{·}");
  assert.equal(signature({ name: "boite", kind: "environment", args: 1, firstOptional: false }), "\\begin{boite}{·}");
  assert.equal(signature({ name: "lemme", kind: "theorem", args: 0, firstOptional: false }), "\\begin{lemme}");
});

test("a selection becomes the definition of a new command", () => {
  assert.deepEqual(specFromSelection("  \\mathbb{R}^n "), { kind: "command", body: "\\mathbb{R}^n" });
  assert.deepEqual(specFromSelection("$\\vec{u} \\cdot \\vec{v}$"), { kind: "command", body: "\\vec{u} \\cdot \\vec{v}" });
  assert.deepEqual(specFromSelection("\\(a + b\\)"), { kind: "command", body: "a + b" });
  assert.deepEqual(specFromSelection("   "), {});
});
