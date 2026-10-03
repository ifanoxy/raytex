// Diagnostics from the linter (live, per file) and from the last build.

import type { Diagnostic, Position, Range } from "../types";
import { comparablePath } from "../utils";

/** Key of a file in maps and comparisons (see `comparablePath`). */
export const pathKey = (p: string) => comparablePath(p);

/** Where a position of a file is after a change (`assoc`: side it sticks to). */
export type PositionMap = (p: Position, assoc: -1 | 1) => Position;

const before = (a: Position, b: Position) => a.line < b.line || (a.line === b.line && a.character < b.character);
const empty = (r: Range) => r.start.line === r.end.line && r.start.character === r.end.character;

/** Moves a range; null when the text it covered is gone. */
function mapRange(r: Range, map: PositionMap): Range | null {
  if (empty(r)) {
    const at = map(r.start, -1);
    return { start: at, end: at };
  }
  const start = map(r.start, 1);
  const end = map(r.end, -1);
  return before(start, end) ? { start, end } : null;
}

/**
 * Keeps a diagnostic on its text after a change of the file `key`: its
 * range and the ranges of its fixes follow the text; a fix whose text was
 * replaced is dropped (it would apply to something else).
 */
export function mapDiagnostic(d: Diagnostic, key: string, map: PositionMap) {
  const inFile = !!d.file && pathKey(d.file) === key;
  if (inFile && d.range) {
    const r = mapRange(d.range, map);
    if (r) d.range = r;
    else {
      const at = map(d.range.start, 1);
      d.range = { start: at, end: at };
      d.fixes = [];
    }
    d.line = d.range.start.line + 1;
  } else if (inFile && d.line) {
    const first = map({ line: d.line - 1, character: 0 }, 1).line + 1;
    if (d.endLine) d.endLine = map({ line: d.endLine - 1, character: 0 }, 1).line + 1;
    d.line = first;
  }
  d.fixes = d.fixes.filter((f) => {
    if (f.kind === "replace" && inFile) {
      const r = mapRange(f.range, map);
      if (!r) return false;
      f.range = r;
    }
    if (f.kind === "edits") {
      for (const e of f.edits) {
        if (pathKey(e.file) !== key) continue;
        const r = mapRange(e.range, map);
        if (!r) return false;
        e.range = r;
      }
    }
    return true;
  });
}

type Listener = (path: string) => void;

class DiagnosticsStore {
  /** Live diagnostics, per file. */
  lint = $state<Record<string, Diagnostic[]>>({});
  /** Diagnostics of the last compilation. */
  build = $state<Diagnostic[]>([]);
  private listeners: Listener[] = [];

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  private notify(paths: Iterable<string>) {
    for (const p of paths) for (const l of this.listeners) l(p);
  }

  setLint(path: string, diags: Diagnostic[]) {
    this.lint[pathKey(path)] = diags;
    this.notify([pathKey(path)]);
  }

  clearLint(path: string) {
    delete this.lint[pathKey(path)];
  }

  setBuild(diags: Diagnostic[]) {
    const touched = new Set<string>();
    for (const d of this.build) if (d.file) touched.add(pathKey(d.file));
    for (const d of diags) if (d.file) touched.add(pathKey(d.file));
    this.build = diags;
    this.notify(touched);
  }

  /** A file changed: its diagnostics (and the fixes touching it) follow the text. */
  mapFile(key: string, map: PositionMap) {
    for (const d of this.build) mapDiagnostic(d, key, map);
    for (const list of Object.values(this.lint)) for (const d of list) mapDiagnostic(d, key, map);
  }

  /** Forgets one diagnostic (its fix was applied). */
  dismiss(d: Diagnostic) {
    const touched = new Set<string>();
    if (this.build.includes(d)) {
      this.build = this.build.filter((x) => x !== d);
      if (d.file) touched.add(pathKey(d.file));
    }
    for (const [key, list] of Object.entries(this.lint)) {
      if (list.includes(d)) {
        this.lint[key] = list.filter((x) => x !== d);
        touched.add(key);
      }
    }
    this.notify(touched);
  }

  /**
   * Whether a live problem is already said by a problem of the build: the
   * engine gives a compiler error the cause the live checks found, at the
   * same place. One of the two is enough.
   */
  private said(d: Diagnostic): boolean {
    const { file, range } = d;
    if (!file || !range) return false;
    const key = pathKey(file);
    // A problem of structure (a brace, a formula) is the same mistake as
    // the error of its line whose cause was found.
    const structure = d.source === "syntax";
    return this.build.some((b) => {
      if (b.severity !== "error" || !b.file || !b.range || pathKey(b.file) !== key) return false;
      if (b.range.start.line !== range.start.line) return false;
      return b.range.start.character === range.start.character || (structure && !!b.hint?.advice);
    });
  }

  /** The live problems to show for a file. */
  private live(key: string): Diagnostic[] {
    return (this.lint[key] ?? []).filter((d) => !this.said(d));
  }

  forFile(path: string): { lint: Diagnostic[]; build: Diagnostic[] } {
    const key = pathKey(path);
    return {
      lint: this.live(key),
      build: this.build.filter((d) => d.file && pathKey(d.file) === key),
    };
  }

  /** Everything, grouped by file (general problems first). */
  get grouped(): { file: string | null; items: Diagnostic[] }[] {
    const groups = new Map<string, Diagnostic[]>();
    const general: Diagnostic[] = [];
    const add = (d: Diagnostic) => {
      if (!d.file) return general.push(d);
      const k = pathKey(d.file);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(d);
    };
    this.build.forEach(add);
    for (const key of Object.keys(this.lint)) this.live(key).forEach(add);
    const rank = { error: 0, warning: 1, info: 2, hint: 3 } as const;
    const out: { file: string | null; items: Diagnostic[] }[] = [];
    if (general.length) out.push({ file: null, items: general });
    for (const [file, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      items.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.line ?? 0) - (b.line ?? 0));
      out.push({ file, items });
    }
    return out;
  }

  get counts() {
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    const count = (d: Diagnostic) => {
      if (d.severity === "error") errors++;
      else if (d.severity === "warning") warnings++;
      else infos++;
    };
    this.build.forEach(count);
    for (const key of Object.keys(this.lint)) this.live(key).forEach(count);
    return { errors, warnings, infos };
  }
}

export const diagnostics = new DiagnosticsStore();
