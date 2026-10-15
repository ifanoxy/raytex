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
  wholeWord = $state(false);
  /** The row of replacement is shown. */
  showReplace = $state(false);
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
      this.results = await ipc.search(this.query, this.regex, this.caseSensitive, this.wholeWord);
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

  /** What a match becomes: the replacement, its groups (`$1`) filled in for an expression. */
  replacementFor(m: SearchMatch): string {
    const r = m.location.range;
    if (!this.regex || r.start.line !== r.end.line) return this.replacement;
    const matched = m.lineText.slice(r.start.character, r.end.character);
    try {
      return matched.replace(new RegExp(this.query, this.caseSensitive ? "" : "i"), this.replacement);
    } catch {
      return this.replacement;
    }
  }

  /** Replaces these matches (open files stay undoable), then searches again. */
  async replaceMatches(matches: SearchMatch[]): Promise<number> {
    const edits = matches.map((m) => ({ file: m.location.file, range: m.location.range, newText: this.replacementFor(m) }));
    if (!edits.length) return 0;
    await editor.applyEdits(edits);
    await this.run();
    return edits.length;
  }

  /** Replaces every match. */
  replaceAll(): Promise<number> {
    return this.replaceMatches(this.results);
  }

  /** The panel in front, its field in focus; `replace`: with its row of replacement. */
  focus(replace = false) {
    ui.sidebar = "search";
    ui.sidebarVisible = true;
    ui.saveLayout();
    if (replace) this.showReplace = true;
    this.focusRequest++;
  }
}

export const searchStore = new SearchStore();
