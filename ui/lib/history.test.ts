import assert from "node:assert/strict";
import { test } from "node:test";
import { byDay, changedPart, changesProblem, counts, dayName, type DiffLine, type Moment, rows, sizeLabel } from "./history.ts";

/** A comparison from `-removed`, `+added` and ` same` lines. */
function lines(...marked: string[]): DiffLine[] {
  let before = 0;
  let after = 0;
  return marked.map((m) => {
    const kind = m[0] === "-" ? "removed" : m[0] === "+" ? "added" : "same";
    return { kind, text: m.slice(1), before: kind === "added" ? null : ++before, after: kind === "removed" ? null : ++after };
  });
}

const shown = (r: ReturnType<typeof rows>) => r.map((x) => (x.type === "gap" ? `…${x.count}` : `${x.line.kind[0]}${x.line.text}`));

test("moments are grouped by day, and a day has a name", () => {
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();
  const moment = (time: number): Moment => ({ id: String(time), time, reason: "save", files: 1, changed: [] });
  const now = at(2026, 10, 11, 15);
  const days = byDay([moment(at(2026, 10, 11, 14)), moment(at(2026, 10, 11, 9)), moment(at(2026, 10, 10, 23)), moment(at(2026, 9, 2, 8))]);
  assert.deepEqual(days.map((d) => d.moments.length), [2, 1, 1]);
  assert.deepEqual(days.map((d) => dayName(d.day, now)), ["today", "yesterday", "date"]);
});

test("a comparison shows what changed with a few lines around", () => {
  const all = lines(" a", " b", " c", " d", " e", "-f", "+F", " g", " h", " i", " j", " k");
  assert.deepEqual(shown(rows(all, 2)), ["…3", "sd", "se", "rf", "aF", "sg", "sh", "…3"]);
  // Two changes close to each other are one block.
  const near = lines("-a", " b", " c", "+d");
  assert.deepEqual(shown(rows(near, 1)), ["ra", "sb", "sc", "ad"]);
  // Nothing changed: nothing to show.
  assert.deepEqual(rows(lines(" a", " b")), []);
  assert.deepEqual(counts(all), { added: 1, removed: 1 });
});

test("the part of a line that changed is marked", () => {
  const part = changedPart("Le chat mange une souris.", "Le chat attrape une souris.");
  assert.deepEqual(part, { before: { from: 8, to: 13 }, after: { from: 8, to: 15 } });
  // Too little in common: nothing to say.
  assert.equal(changedPart("abc", "xyz"), null);
  assert.equal(changedPart("\\section{Introduction}", "Un tout autre paragraphe, bien plus long que le titre."), null);
  // A replacement line for line gets its marks, an unequal one does not.
  const pair = rows(lines("-Le chat mange une souris.", "+Le chat attrape une souris."));
  assert.deepEqual(pair.map((r) => r.type === "line" && r.span), [{ from: 8, to: 13 }, { from: 8, to: 15 }]);
  const unequal = rows(lines("-Le chat mange une souris.", "+Le chat attrape une souris.", "+Et il la mange."));
  assert.ok(unequal.every((r) => r.type === "line" && !r.span));
  // Text only added at the end of a line: nothing is marked in the old one.
  const grown = rows(lines("-Une phrase", "+Une phrase plus longue"));
  assert.deepEqual(grown.map((r) => r.type === "line" && r.span), [undefined, { from: 10, to: 22 }]);
});

test("a size is written as it is read", () => {
  assert.equal(sizeLabel(840, "fr"), "840 o");
  assert.equal(sizeLabel(12_300, "fr"), "12 Ko");
  assert.equal(sizeLabel(1_500_000, "fr"), "1,4 Mo");
  assert.equal(sizeLabel(1_500_000, "en"), "1.4 MB");
});

test("what stopped the PDF of the changes is told apart", () => {
  assert.equal(changesProblem("cancelled"), null);
  assert.deepEqual(changesProblem("no-latexdiff"), { kind: "no-latexdiff", detail: "" });
  assert.deepEqual(changesProblem("no-main"), { kind: "no-main", detail: "" });
  assert.deepEqual(changesProblem("build: Undefined control sequence."), { kind: "build", detail: "Undefined control sequence." });
  assert.deepEqual(changesProblem("latexdiff:Can't locate Algorithm/Diff.pm"), { kind: "latexdiff", detail: "Can't locate Algorithm/Diff.pm" });
  assert.deepEqual(changesProblem("disk full"), { kind: "other", detail: "disk full" });
});
