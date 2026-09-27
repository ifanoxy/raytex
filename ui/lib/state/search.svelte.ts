// Project-wide search and "find references" results.

import * as ipc from "../ipc";
import type { Location, SearchMatch } from "../types";
import { editor } from "./editor.svelte";
import { pathKey } from "./diagnostics.svelte";
import { ui } from "./ui.svelte";

class SearchStore {
  query = $state("");
  replacement = $state("");
  regex = $state(false);
  caseSensitive = $state(false);
  results = $state<SearchMatch[]>([]);
  /** Set when showing references instead of text matches. */
  title = $state<string | null>(null);
  running = $state(false);
  error = $state<string | null>(null);
  /** Incremented to ask the panel to focus its input. */
  focusRequest = $state(0);

  get grouped(): { file: string; items: SearchMatch[] }[] {
    const groups = new Map<string, SearchMatch[]>();
    for (const m of this.results) {
      const k = pathKey(m.location.file);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(m);
    }
    return [...groups.entries()].map(([, items]) => ({ file: items[0].location.file, items }));
  }

  async run() {
    this.title = null;
    this.error = null;
    if (!this.query) {
      this.results = [];
      return;
    }
    this.running = true;
    try {
      await editor.flush();
      this.results = await ipc.search(this.query, this.regex, this.caseSensitive);
    } catch (e) {
      this.error = String(e);
      this.results = [];
    } finally {
      this.running = false;
    }
  }

  /** Shows a list of locations (references) in the search panel. */
  async showLocations(title: string, locations: Location[]) {
    const cache = new Map<string, string[]>();
    const lineOf = async (file: string, line: number) => {
      const key = pathKey(file);
      if (!cache.has(key)) {
        const text = editor.textOf(file) ?? (await ipc.readTextFile(file).then((f) => f.text).catch(() => ""));
        cache.set(key, text.split("\n"));
      }
      return cache.get(key)![line] ?? "";
    };
    const results: SearchMatch[] = [];
    for (const location of locations) results.push({ location, lineText: await lineOf(location.file, location.range.start.line) });
    this.title = title;
    this.results = results;
    ui.sidebar = "search";
    ui.sidebarVisible = true;
    ui.saveLayout();
  }

  /** Replaces every match (open files stay undoable). */
  async replaceAll(): Promise<number> {
    const edits = this.results.map((m) => ({ file: m.location.file, range: m.location.range, newText: this.replacement }));
    if (!edits.length) return 0;
    await editor.applyEdits(edits);
    const n = edits.length;
    await this.run();
    return n;
  }

  focus() {
    ui.sidebar = "search";
    ui.sidebarVisible = true;
    ui.saveLayout();
    this.focusRequest++;
  }
}

export const searchStore = new SearchStore();
