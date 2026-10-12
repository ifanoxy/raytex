// Where a build stands: the pages its engine wrote so far, and how long is
// left, judged from the build of the same document before it. Nothing here
// is exact (a build may need one pass more than the last one): it is said
// as an estimate, and not said at all when nothing tells.

export interface StepTime {
  name: string;
  durationMs: number;
}

/** What the build before this one took. */
export interface BuildReference {
  steps: StepTime[];
  /** Pages of the document it made. */
  pages: number | null;
}

/** Where the running build is. */
export interface BuildPosition {
  /** Steps finished before the running one. */
  step: number;
  /** Time spent in the running step. */
  stepMs: number;
  /** Pages the running step wrote so far. */
  pages: number;
}

export interface BuildProgress {
  /** Share of the build that is done, from 0 to 1; null when nothing tells. */
  fraction: number | null;
  /** Time left; null when nothing tells, or when the build runs past what was expected. */
  remainingMs: number | null;
}

/**
 * Pages an engine says it wrote in a piece of its output: it prints the
 * number of each page between brackets as it ships it (`[1{…pdftex.map}]
 * [2] [3 <./figure.png>]`). They are counted, not read: numbering starts
 * again in the middle of a document.
 */
export function pagesIn(text: string): number {
  return text.match(/\[\d+(?=[\]{<\s]|$)/gm)?.length ?? 0;
}

const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));

/** Progress of a build at `at`, from the build before it. */
export function buildProgress(reference: BuildReference | null, at: BuildPosition): BuildProgress {
  const steps = reference?.steps.filter((s) => s.durationMs > 0) ?? [];
  if (!steps.length) return { fraction: null, remainingMs: null };
  const mean = steps.reduce((sum, s) => sum + s.durationMs, 0) / steps.length;
  // A build with more steps than the last one: each one more is counted as an average one.
  const expected = (i: number) => steps[i]?.durationMs ?? mean;
  const count = Math.max(steps.length, at.step + 1);
  let total = 0;
  let before = 0;
  let after = 0;
  for (let i = 0; i < count; i++) {
    total += expected(i);
    if (i < at.step) before += expected(i);
    if (i > at.step) after += expected(i);
  }
  const current = expected(at.step);
  // Pages tell better than the clock, which runs slower on a busy computer.
  const byPages = reference?.pages && at.pages > 0 ? at.pages / reference.pages : null;
  const within = clamp(byPages ?? at.stepMs / current, 0, 0.98);
  const fraction = clamp((before + within * current) / total, 0, 0.99);
  if (byPages === null && at.stepMs >= current) return { fraction, remainingMs: null };
  // At the pace of this step once it has shown one, at that of the last build before.
  const pace = byPages !== null && within > 0.1 ? at.stepMs / within : current;
  return { fraction, remainingMs: Math.max(0, Math.round((1 - within) * pace + after)) };
}

/** A time left, rounded as one says it: `3` s, `10` s, `1` min. */
export function roundedRemaining(ms: number): { n: number; unit: "s" | "min" } {
  const s = ms / 1000;
  if (s < 10) return { n: Math.max(1, Math.round(s)), unit: "s" };
  if (s < 55) return { n: Math.round(s / 5) * 5, unit: "s" };
  return { n: Math.max(1, Math.round(s / 60)), unit: "min" };
}
