// User macros (snippets with a trigger word or a shortcut), shared by the
// main editor and the cells of the grid editor.

import { snippet } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { Macro } from "../types";
import { escapeSnippet } from "../utils";

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
 * Expands the macro whose trigger was just typed (Tab). `inMath` tells
 * whether a position is in a formula (math macros only apply there).
 */
export function expandTrigger(view: EditorView, macros: Macro[], inMath: (pos: number) => boolean): boolean {
  if (!macros.length) return false;
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const line = view.state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  for (const m of macros) {
    if (!m.trigger || !before.endsWith(m.trigger)) continue;
    const start = sel.head - m.trigger.length;
    const prev = before[before.length - m.trigger.length - 1];
    // The trigger must be a whole word (or start after a space / brace).
    if (prev && /[A-Za-z0-9]/.test(prev) && /^[A-Za-z0-9]/.test(m.trigger)) continue;
    if (m.math && !inMath(sel.head)) continue;
    snippet(m.body.replaceAll("${SELECTION}", ""))(view, { label: m.trigger }, start, sel.head);
    return true;
  }
  return false;
}
