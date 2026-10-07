// Tests of what a change on disk means for an open file: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { diskChange, fingerprint, remember, WRITTEN_FOR_MS, type Written } from "./disk.ts";

test("a fingerprint tells two texts apart", () => {
  assert.equal(fingerprint("abc"), fingerprint("abc"));
  assert.notEqual(fingerprint("abc"), fingerprint("abd"));
  assert.notEqual(fingerprint("ab"), fingerprint("abc"));
  assert.equal(fingerprint(""), "0:811c9dc5");
});

test("the echo of a save is not a change by another program", () => {
  let written: Written[] = [];
  // RayTeX saves "v1"; the user goes on typing; the watcher reports late.
  written = remember(written, "v1", 1000);
  assert.equal(diskChange({ disk: "v1", buffer: "v1 and more", dirty: true, written, now: 1800 }), "own");
  // A second save is on its way: the disk already holds it.
  written = remember(written, "v1 and more", 2000);
  assert.equal(diskChange({ disk: "v1 and more", buffer: "v1 and more!", dirty: true, written, now: 2100 }), "own");
  // The report of the first save comes after the second one.
  assert.equal(diskChange({ disk: "v1", buffer: "v1 and more!", dirty: true, written, now: 2200 }), "own");
  // Nothing changed.
  assert.equal(diskChange({ disk: "x", buffer: "x", dirty: false, written: [], now: 0 }), "same");
});

test("a change by another program is one", () => {
  const written = remember([], "v1", 1000);
  assert.equal(diskChange({ disk: "from git", buffer: "v1", dirty: false, written, now: 1500 }), "reload");
  assert.equal(diskChange({ disk: "from git", buffer: "v1 typed", dirty: true, written, now: 1500 }), "conflict");
  // What RayTeX wrote long ago and comes back (a checkout) is a change too.
  assert.equal(diskChange({ disk: "v1", buffer: "v2 typed", dirty: true, written, now: 1000 + WRITTEN_FOR_MS + 1 }), "conflict");
});

test("only the last writes are remembered", () => {
  let written: Written[] = [];
  for (let i = 0; i < 10; i++) written = remember(written, `v${i}`, 1000 + i);
  assert.equal(written.length, 4);
  assert.equal(written.at(-1)!.print, fingerprint("v9"));
  // The same text written twice is kept once, with its last time.
  written = remember(written, "v9", 5000);
  assert.equal(written.filter((w) => w.print === fingerprint("v9")).length, 1);
  assert.equal(written.at(-1)!.at, 5000);
  // Old ones are dropped.
  assert.equal(remember(written, "new", 5000 + WRITTEN_FOR_MS - 1).length, 2);
  assert.equal(remember(written, "new", 5000 + WRITTEN_FOR_MS).length, 1);
});
