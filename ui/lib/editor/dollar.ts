// Typing `$`: a pair `$|$` is only inserted where a formula can start (after
// a space, a bracket or at the start of a line). After text, or to close
// an open formula, a single `$` is typed (or the closing one is stepped
// over), so it is never doubled by mistake.
//
// No local imports: tested directly by Node (`npm test`).

import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Characters after which a formula can start. */
const OPENERS = new Set(["", " ", "\t", "\n", "(", "[", "{", "~", "'", " ", "«", " "]);
/** Characters before which the pair can be closed right away. */
const CLOSERS = new Set(["", " ", "\t", "\n", ".", ",", ";", ":", "!", "?", ")", "]", "}", " ", "»", " "]);

/** Number of unescaped, uncommented `$` in `text`. */
function dollarCount(text: string): number {
  let n = 0;
  let comment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") comment = false;
    if (comment) continue;
    if (ch === "\\") {
      i++; // escaped character (`\$`, `\%`, `\\`)
      continue;
    }
    if (ch === "%") comment = true;
    else if (ch === "$") n++;
  }
  return n;
}

/** Whether the cursor after `before` is inside an inline formula `$…`. */
export function insideDollarMath(before: string): boolean {
  return dollarCount(before) % 2 === 1;
}

/**
 * What typing `$` does, given the paragraph text before the cursor and the
 * text after it: insert a pair, a single `$`, or step over the next `$`.
 */
export function dollarAction(before: string, after: string): "pair" | "single" | "skip" {
  // `\$` is a literal dollar sign.
  const backslashes = /\\*$/.exec(before)![0].length;
  if (backslashes % 2 === 1) return "single";
  if (insideDollarMath(before)) return after.startsWith("$") ? "skip" : "single";
  const prev = before.slice(-1);
  const next = after.slice(0, 1);
  return OPENERS.has(prev) && CLOSERS.has(next) ? "pair" : "single";
}

/** Text of the paragraph before `pos` (bounded), and a little after. */
function around(view: EditorView, pos: number): { before: string; after: string } {
  const doc = view.state.doc;
  let start = doc.lineAt(pos).from;
  // Back to the start of the paragraph (a blank line), at most 60 lines.
  for (let n = doc.lineAt(pos).number - 1, i = 0; n >= 1 && i < 60; n--, i++) {
    const line = doc.line(n);
    if (!line.text.trim()) break;
    start = line.from;
  }
  return { before: doc.sliceString(start, pos), after: doc.sliceString(pos, Math.min(doc.length, pos + 2)) };
}

/** Input handler for `$` (returns false to let the default insertion happen). */
export function handleDollar(view: EditorView, from: number, to: number, text: string): boolean {
  if (text !== "$" || view.state.readOnly || view.composing) return false;
  const { state } = view;
  // Only when the input replaces the main selection (not IME or paste).
  const main = state.selection.main;
  if (state.selection.ranges.length > 1 || main.from !== from || main.to !== to) return false;
  if (from !== to) {
    // Selection: wrap it.
    const inner = state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: `$${inner}$` },
      selection: EditorSelection.range(from + 1, to + 1),
      userEvent: "input.type",
    });
    return true;
  }
  const { before, after } = around(view, from);
  const action = dollarAction(before, after);
  if (action === "skip") {
    view.dispatch({ selection: EditorSelection.cursor(from + 1), userEvent: "select" });
  } else if (action === "pair") {
    view.dispatch({ changes: { from, insert: "$$" }, selection: EditorSelection.cursor(from + 1), userEvent: "input.type" });
  } else {
    view.dispatch({ changes: { from, insert: "$" }, selection: EditorSelection.cursor(from + 1), userEvent: "input.type" });
  }
  return true;
}

/** Backspace between an empty pair `$|$` removes both signs. */
export function deleteDollarPair(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return false;
  const pos = sel.head;
  if (state.sliceDoc(pos - 1, pos + 1) !== "$$") return false;
  const { before } = around(view, pos - 1);
  if (insideDollarMath(before) || /\\$/.test(before)) return false;
  view.dispatch({ changes: { from: pos - 1, to: pos + 1 }, userEvent: "delete.backward" });
  return true;
}
