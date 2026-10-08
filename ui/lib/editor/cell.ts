// One cell of the grid editor: a one-line LaTeX editor with the colours,
// completion, macros and formatting shortcuts of the main editor. Enter,
// the arrows at the edges and Tab in the last cell move between cells.

import { acceptCompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView, type KeyBinding, keymap } from "@codemirror/view";
import type { Macro } from "../types";
import { latexCompletion } from "./completion";
import { completionPrefix, docPath } from "./context";
import { deleteDollarPair, handleDollar } from "./dollar";
import { latex } from "./latex";
import { expandTrigger, insertBody } from "./macros";
import { findFormula } from "./math-preview";
import { wrapCommand, wrapMath } from "./structure";
import { tooltipTheme } from "./theme";

/** Where the focus goes from a cell. */
export type CellMove = "next" | "previous" | "up" | "down" | "newRow" | "insert";

export interface CellOptions {
  /** Document the grid belongs to (completion of its labels, citations, macros). */
  path: string;
  /** Cells of a matrix are in a formula. */
  math: boolean;
  macros: () => Macro[];
  completion: boolean;
  /** Moves the focus; false when there is nowhere to go (the key then does its usual job). */
  move: (to: CellMove) => boolean;
  /** Text pasted: true when it filled several cells. */
  paste: (text: string) => boolean;
  change: (text: string) => void;
}

export function cellExtensions(o: CellOptions): Extension[] {
  const inMath = (view: EditorView) => (pos: number) => o.math || !!findFormula(view.state.doc, pos);
  const collapsed = (v: EditorView) => v.state.selection.main.empty;
  const bindings: KeyBinding[] = [
    { key: "Mod-Enter", run: () => o.move("insert") },
    { key: "Enter", run: () => o.move("next") || true },
    { key: "Shift-Enter", run: () => o.move("previous") || true },
    { key: "Tab", run: acceptCompletion },
    { key: "Tab", run: (v) => !!expandTrigger(v, o.macros(), inMath(v)) },
    { key: "Tab", run: () => o.move("newRow") },
    { key: "ArrowUp", run: () => o.move("up") },
    { key: "ArrowDown", run: () => o.move("down") },
    { key: "ArrowRight", run: (v) => collapsed(v) && v.state.selection.main.head === v.state.doc.length && o.move("next") },
    { key: "ArrowLeft", run: (v) => collapsed(v) && v.state.selection.main.head === 0 && o.move("previous") },
    { key: "Mod-b", run: (v) => wrapCommand(v, "textbf") },
    { key: "Mod-i", run: (v) => wrapCommand(v, "textit") },
    { key: "Mod-u", run: (v) => wrapCommand(v, "underline") },
    { key: "Mod-e", run: (v) => wrapCommand(v, "emph") },
    { key: "Mod-Shift-m", run: (v) => (o.math ? false : wrapMath(v)) },
  ];
  for (const m of o.macros()) {
    if (!m.key) continue;
    bindings.push({
      key: m.key,
      run: (v) => {
        if (m.math && !inMath(v)(v.state.selection.main.head)) return false;
        insertBody(v, m.body);
        return true;
      },
    });
  }
  return [
    latex(),
    docPath.of(o.path),
    completionPrefix.of(o.math ? "\\[" : ""),
    o.completion ? latexCompletion() : [],
    closeBrackets(),
    o.math ? [] : [EditorView.inputHandler.of((view, from, to, text) => handleDollar(view, from, to, text)), keymap.of([{ key: "Backspace", run: deleteDollarPair }])],
    history(),
    Prec.high(keymap.of(bindings)),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
    // One line: a line break would end the row.
    EditorState.transactionFilter.of((tr) => (tr.docChanged && tr.newDoc.lines > 1 ? [] : tr)),
    EditorView.domEventHandlers({
      paste: (e) => {
        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (!o.paste(text)) return false;
        e.preventDefault();
        return true;
      },
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) o.change(u.state.doc.toString());
    }),
    tooltipTheme,
    EditorView.theme({
      "&": {
        minWidth: "0",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-input)",
        color: "var(--text)",
        fontSize: "13px",
      },
      "&.cm-focused": { outline: "none", borderColor: "var(--accent)", boxShadow: "0 0 0 2px var(--accent-soft)" },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        fontVariantLigatures: "none",
        lineHeight: "1.5",
        overflowX: "auto",
        scrollbarWidth: "none",
      },
      ".cm-content": { padding: "6px 8px", caretColor: "var(--accent)" },
      ".cm-line": { padding: "0", textAlign: "var(--cell-align, left)" },
    }),
  ];
}
