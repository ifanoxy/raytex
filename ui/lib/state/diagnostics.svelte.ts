// Diagnostics from the linter (live, per file) and from the last build.

import type { Diagnostic } from "../types";

export const pathKey = (p: string) => p.replace(/\\/g, "/");

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

  forFile(path: string): { lint: Diagnostic[]; build: Diagnostic[] } {
    const key = pathKey(path);
    return {
      lint: this.lint[key] ?? [],
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
    for (const list of Object.values(this.lint)) list.forEach(add);
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
    for (const list of Object.values(this.lint)) list.forEach(count);
    return { errors, warnings, infos };
  }
}

export const diagnostics = new DiagnosticsStore();
