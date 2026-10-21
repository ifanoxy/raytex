// One mistake, one problem: a mistake is often seen by several checks
// (the compiler, Biber, the live checks of the editor), each with the same
// fix. A citation key mistyped is said by LaTeX and by Biber, a brace never
// closed by the compiler and by the live syntax check. Shown once.

import type { Diagnostic, Position, Range } from "./types";

const RANK = { error: 0, warning: 1, info: 2, hint: 3 } as const;

/** The checks of the editor (the others read what a build wrote). */
const LIVE = new Set<Diagnostic["source"]>(["lint", "syntax"]);

const before = (a: Position, b: Position) => a.line < b.line || (a.line === b.line && a.character < b.character);

/** Where a problem is: its range, or its whole line(s) when only a line is known. */
function placeOf(d: Diagnostic): Range | null {
  if (d.range) return d.range;
  if (!d.line) return null;
  const end = d.endLine && d.endLine > d.line ? d.endLine : d.line;
  return { start: { line: d.line - 1, character: 0 }, end: { line: end - 1, character: Number.MAX_SAFE_INTEGER } };
}

/** Whether two places share at least a point. */
function meet(a: Range, b: Range): boolean {
  return !before(a.end, b.start) && !before(b.end, a.start);
}

/**
 * The problems of one file with the repeats left out: of the problems that
 * are at the same place (their ranges meet) and offer a same fix (or that
 * the compiler and the live checks name alike), the most serious one stays (the first one given, between two of the same
 * severity). Two mistakes that a same fix mends at two places (two
 * commands of one package) both stay.
 */
export function oneEach(list: Diagnostic[]): Diagnostic[] {
  const order = list.map((d, i) => ({ d, i })).sort((a, b) => RANK[a.d.severity] - RANK[b.d.severity] || a.i - b.i);
  const kept: { d: Diagnostic; place: Range | null; fixes: Set<string> }[] = [];
  for (const { d } of order) {
    const place = placeOf(d);
    const fixes = new Set(d.fixes.map((f) => JSON.stringify(f)));
    const repeat =
      !!place &&
      kept.some(
        (k) =>
          k.place &&
          meet(k.place, place) &&
          ([...fixes].some((f) => k.fixes.has(f)) ||
            // The same mistake named alike by the compiler and by the live checks (a reference never defined).
            (!!d.code && d.code === k.d.code && LIVE.has(d.source) !== LIVE.has(k.d.source))),
      );
    if (!repeat) kept.push({ d, place, fixes });
  }
  const keep = new Set(kept.map((k) => k.d));
  return list.filter((d) => keep.has(d));
}
