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

/** A place over more lines than this is compared with every problem kept (there are few). */
const WIDE = 50;

interface Kept {
  d: Diagnostic;
  place: Range;
  fixes: Set<string>;
}

/**
 * The problems of one file with the repeats left out: of the problems that
 * are at the same place (their ranges meet) and offer a same fix, or that
 * the compiler and the live checks name alike, the most serious one stays
 * (the first one given, between two of the same severity). Two mistakes
 * that a same fix mends at two places (two commands of one package) both
 * stay. Each problem is compared with the ones of its lines only.
 */
export function oneEach(list: Diagnostic[]): Diagnostic[] {
  const order = list.map((d, i) => ({ d, i })).sort((a, b) => RANK[a.d.severity] - RANK[b.d.severity] || a.i - b.i);
  const byLine = new Map<number, Kept[]>();
  const wide: Kept[] = [];
  const keep = new Set<Diagnostic>();
  for (const { d } of order) {
    const place = placeOf(d);
    if (!place) {
      keep.add(d);
      continue;
    }
    const fixes = new Set(d.fixes.map((f) => JSON.stringify(f)));
    const same = (k: Kept) =>
      meet(k.place, place) &&
      ([...fixes].some((f) => k.fixes.has(f)) ||
        // The same mistake named alike by the compiler and by the live checks (a reference never defined).
        (!!d.code && d.code === k.d.code && LIVE.has(d.source) !== LIVE.has(k.d.source)));
    const [first, last] = [place.start.line, place.end.line];
    const broad = last - first > WIDE;
    let repeat = wide.some(same);
    if (!repeat && broad) repeat = [...byLine.values()].some((ks) => ks.some(same));
    for (let l = first; !repeat && !broad && l <= last; l++) repeat = !!byLine.get(l)?.some(same);
    if (repeat) continue;
    keep.add(d);
    const k: Kept = { d, place, fixes };
    if (broad) wide.push(k);
    else for (let l = first; l <= last; l++) (byLine.get(l) ?? byLine.set(l, []).get(l)!).push(k);
  }
  return list.filter((d) => keep.has(d));
}
