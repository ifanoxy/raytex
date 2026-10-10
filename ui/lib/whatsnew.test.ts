// The notes of the versions: what is shown, when, and the text the release carries.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compareVersions, NOTES, noteParts, notesBefore, notesOf, parseReleaseBody, releaseBody, tellsAtStart } from "./whatsnew.ts";

const current = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version as string;

test("the current version has its notes, in both languages", () => {
  const notes = notesOf(current);
  assert.ok(notes, `ui/lib/whatsnew.ts has no entry for ${current}: write what this version brings before releasing it`);
  for (const lang of ["en", "fr"] as const) {
    assert.ok(notes[lang].points.length >= 1 && notes[lang].points.length <= 6, `${lang}: a summary is a few points`);
    assert.ok(notes[lang].details.length >= 1 && notes[lang].details.every((s) => s.title && s.items.length), `${lang}: details`);
  }
});

test("every version says the same things in both languages, the latest first", () => {
  for (const n of NOTES) {
    assert.match(n.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(n.en.points.length, n.fr.points.length, n.version);
    assert.deepEqual(n.en.details.map((s) => s.items.length), n.fr.details.map((s) => s.items.length), n.version);
    // No long dash in what is published.
    assert.ok(!JSON.stringify(n).includes("—"), n.version);
  }
  for (let i = 1; i < NOTES.length; i++) assert.equal(compareVersions(NOTES[i - 1].version, NOTES[i].version), 1);
});

test("versions are compared by their numbers", () => {
  assert.equal(compareVersions("0.4.10", "0.4.2"), 1);
  assert.equal(compareVersions("v0.4.2", "0.4.2"), 0);
  assert.equal(compareVersions("0.4", "0.4.1"), -1);
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), 0);
  assert.deepEqual(notesBefore("0.4.2").map((n) => n.version), ["0.4.1", "0.4.0"]);
  assert.equal(notesOf("9.9.9"), null);
});

test("the first start after an update tells what is new, once", () => {
  // Updated from a version that kept no trace of itself: RayTeX was used before.
  assert.equal(tellsAtStart("0.4.2", null, true), true);
  assert.equal(tellsAtStart("0.4.2", "0.4.1", false), true);
  // A first installation, the same version again, a version without notes.
  assert.equal(tellsAtStart("0.4.2", null, false), false);
  assert.equal(tellsAtStart("0.4.2", "0.4.2", true), false);
  assert.equal(tellsAtStart("0.4.1", "0.4.2", true), false);
  assert.equal(tellsAtStart("9.9.9", "0.4.2", true), false);
});

test("the notes of a release are read back as they were written", () => {
  const notes = notesOf("0.4.2")!;
  const body = releaseBody(notes);
  assert.ok(body.startsWith("## What's new\n\n- A TikZ whiteboard"));
  assert.ok(body.includes("\n---\n\n## Nouveautés\n\n- Un tableau blanc TikZ"));
  assert.deepEqual(parseReleaseBody(body, "en"), notes.en);
  assert.deepEqual(parseReleaseBody(body, "fr"), notes.fr);
  // The text of an older release, or none: not notes of this kind.
  assert.equal(parseReleaseBody("See CHANGELOG.md for the changes of this version.", "fr"), null);
  assert.equal(parseReleaseBody("", "en"), null);
  // Notes in English only are shown rather than nothing.
  assert.deepEqual(parseReleaseBody("## What's new\n- One thing\n", "fr"), { points: ["One thing"], details: [] });
});

test("code in a line of notes", () => {
  assert.deepEqual(noteParts("Tab after `fig` writes a figure"), [
    { text: "Tab after ", code: false },
    { text: "fig", code: true },
    { text: " writes a figure", code: false },
  ]);
  assert.deepEqual(noteParts("plain"), [{ text: "plain", code: false }]);
});
