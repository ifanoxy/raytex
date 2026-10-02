import assert from "node:assert/strict";
import { test } from "node:test";
import { noteLines } from "./updates.ts";

test("release notes become short plain lines", () => {
  const body = "## Fixes\n\n- **Saving** on Windows: [details](https://x)\n- `\\textbf` completion\n\n---\n\nAll the changes: [CHANGELOG.md](https://y).";
  assert.deepEqual(noteLines(body), ["Fixes", "• Saving on Windows: details", "• \\textbf completion", "All the changes: CHANGELOG.md."]);
  assert.deepEqual(noteLines(null), []);
  assert.equal(noteLines("a\nb\nc\nd", 2).at(-1), "…");
});
