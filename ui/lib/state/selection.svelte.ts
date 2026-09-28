// Files selected in the project tree: a click selects one, Shift + click a
// range, Ctrl / Cmd + click adds or removes one.

import { pathKey } from "./diagnostics.svelte";

class FileSelection {
  paths = $state<string[]>([]);
  /** Where Shift + click ranges start. */
  private anchor: string | null = null;

  has(path: string): boolean {
    const key = pathKey(path);
    return this.paths.some((p) => pathKey(p) === key);
  }

  get count(): number {
    return this.paths.length;
  }

  only(path: string) {
    this.paths = [path];
    this.anchor = path;
  }

  toggle(path: string) {
    const key = pathKey(path);
    this.paths = this.has(path) ? this.paths.filter((p) => pathKey(p) !== key) : [...this.paths, path];
    this.anchor = path;
  }

  /** From the anchor to `path` in `order` (the rows shown); `add` keeps the current selection. */
  range(path: string, order: string[], add = false) {
    const keys = order.map(pathKey);
    const to = keys.indexOf(pathKey(path));
    const from = this.anchor ? keys.indexOf(pathKey(this.anchor)) : -1;
    if (to < 0) return;
    const [a, b] = from < 0 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
    const span = order.slice(a, b + 1);
    this.paths = add ? [...this.paths, ...span.filter((p) => !this.has(p))] : span;
    if (from < 0) this.anchor = path;
  }

  all(order: string[]) {
    this.paths = [...order];
  }

  clear() {
    this.paths = [];
    this.anchor = null;
  }

  /** Selected paths without those inside a selected folder (for deleting or moving). */
  roots(): string[] {
    const keys = this.paths.map(pathKey);
    return this.paths.filter((p) => {
      const k = pathKey(p);
      return !keys.some((o) => o !== k && k.startsWith(`${o}/`));
    });
  }
}

export const fileSelection = new FileSelection();
