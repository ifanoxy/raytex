// User macros (snippets with a trigger word or a shortcut), shared by the
// main editor and the cells of the grid editor.

import { snippet } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { escapeSnippet } from "../utils";
import { expansion, type Triggered, triggerAt } from "./trigger";

/**
 * Inserts a snippet in place of the selection; `${SELECTION}` in the body
 * stands for the selected text.
 */
export function insertBody(view: EditorView, template: string) {
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);
  const literal = escapeSnippet(selected);
  let body = template;
  // Placeholders cannot contain braces: such a selection is inserted as plain text.
  if (/[{}]/.test(selected)) body = body.replace(/\$\{\d+:\$\{SELECTION\}\}/g, () => literal);
  body = body.replaceAll("${SELECTION}", () => literal);
  snippet(body)(view, { label: "" }, sel.from, sel.to);
}

/**
 * Writes what the trigger just typed stands for (Tab): a macro of the
 * user, or a snippet of RayTeX. `inMath` tells whether a position is in a
 * formula: the content of a formula typed in text goes between `$…$`.
 * Returns what was written, or null.
 */
export function expandTrigger<T extends Triggered>(view: EditorView, items: T[], inMath: (pos: number) => boolean): T | null {
  if (!items.length) return null;
  const sel = view.state.selection.main;
  if (!sel.empty) return null;
  const line = view.state.doc.lineAt(sel.head);
  const item = triggerAt(line.text.slice(0, sel.head - line.from), items);
  if (!item) return null;
  snippet(expansion(item, inMath(sel.head)))(view, { label: item.trigger }, sel.head - item.trigger.length, sel.head);
  return item;
}
