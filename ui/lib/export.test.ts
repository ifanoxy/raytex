import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveName, byRole, defaultOptions, type ExportFile } from "./export.ts";

test("an archive is named after the project", () => {
  assert.equal(archiveName("Mémoire de master", false), "memoire-de-master.zip");
  assert.equal(archiveName("Mémoire de master", true), "memoire-de-master-submission.zip");
  assert.equal(archiveName("  ", false), "document.zip");
});

test("a submission removes comments and joins the .bib files unless told otherwise", () => {
  assert.deepEqual(defaultOptions(true), { submission: true, stripComments: true, singleFile: false, includeBib: true, includePdf: false });
  assert.deepEqual(defaultOptions(false), { submission: false, stripComments: false, singleFile: false, includeBib: false, includePdf: false });
});

test("files are listed by kind, the main file first", () => {
  const file = (name: string, role: ExportFile["role"]): ExportFile => ({ source: `/p/${name}`, name, size: 1, role });
  const groups = byRole([file("a.png", "picture"), file("main.tex", "main"), file("ch.tex", "source"), file("b.png", "picture")]);
  assert.deepEqual(
    groups.map((g) => [g.role, g.files.map((f) => f.name)]),
    [
      ["main", ["main.tex"]],
      ["source", ["ch.tex"]],
      ["picture", ["a.png", "b.png"]],
    ],
  );
});
