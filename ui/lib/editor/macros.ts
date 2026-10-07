// User macros (snippets with a trigger word or a shortcut), shared by the
// main editor and the cells of the grid editor.

import { snippet } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { Macro } from "../types";
import { escapeSnippet } from "../utils";
import { triggerAt } from "./trigger";

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
  const m = triggerAt(line.text.slice(0, sel.head - line.from), macros, () => inMath(sel.head));
  if (!m) return false;
  snippet(m.body.replaceAll("${SELECTION}", ""))(view, { label: m.trigger }, sel.head - m.trigger.length, sel.head);
  return true;
}
