#!/usr/bin/env node
// The notes of a version as its release carries them (the GitHub release and
// the update file read by installed copies): written from ui/lib/whatsnew.ts.
//
//   node --experimental-strip-types scripts/release-notes.mjs 0.4.2
//
// Fails when the version has no notes, so that the release workflow falls
// back to a plain line instead of publishing an empty one.

import { notesOf, releaseBody } from "../ui/lib/whatsnew.ts";

const version = (process.argv[2] ?? "").replace(/^v/, "");
const notes = version ? notesOf(version) : null;
if (!notes) {
  console.error(`No notes for version "${version}" in ui/lib/whatsnew.ts`);
  process.exit(1);
}
process.stdout.write(releaseBody(notes));
