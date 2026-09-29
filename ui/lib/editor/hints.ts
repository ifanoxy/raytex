// What a free argument expects, above the cursor: `\item[terme]` and
// "terme — texte libre affiché à la place de la puce…". Asked to the engine
// (completion::hints) when the cursor is in an argument that has no list of
// proposals; nothing is inserted in the text.

import { type EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView, showTooltip, type Tooltip, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import * as ipc from "../ipc";
import type { ArgumentHint } from "../types";
import { completionPrefix, docPath } from "./context";

const setHint = StateEffect.define<Tooltip | null>();

const hintField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHint)) return e.value;
    if (value && tr.docChanged) return { ...value, pos: tr.changes.mapPos(value.pos) };
    return value;
  },
  provide: (f) => showTooltip.from(f),
});

/** Whether a `{` or `[` is still open before the cursor (on the last lines). */
function inArgument(before: string): boolean {
  let braces = 0;
  let brackets = 0;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (c === "\\") i++;
    else if (c === "%") {
      const nl = before.indexOf("\n", i);
      if (nl < 0) break;
      i = nl;
    } else if (c === "\n" && before[i + 1] === "\n") {
      braces = brackets = 0;
    } else if (c === "{") braces++;
    else if (c === "}") braces = Math.max(0, braces - 1);
    else if (c === "[") brackets++;
    else if (c === "]") brackets = Math.max(0, brackets - 1);
  }
  return braces > 0 || brackets > 0;
}

function render(hint: ArgumentHint): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-arg-hint";
  const signature = document.createElement("div");
  signature.className = "cm-arg-hint-signature";
  for (const part of hint.parts) {
    const span = document.createElement("span");
    if (part.active) span.className = "cm-arg-hint-active";
    span.textContent = part.text;
    signature.append(span);
  }
  const doc = document.createElement("div");
  doc.className = "cm-arg-hint-doc";
  const name = document.createElement("strong");
  name.textContent = hint.name;
  doc.append(name, ` — ${hint.doc}`);
  dom.append(signature, doc);
  return dom;
}

const asker = ViewPlugin.fromClass(
  class {
    timer = 0;
    token = 0;
    constructor(readonly view: EditorView) {}

    update(u: ViewUpdate) {
      if (!u.docChanged && !u.selectionSet && !u.focusChanged) return;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.ask(), 140);
    }

    hide(state: EditorState) {
      if (state.field(hintField)) this.view.dispatch({ effects: setHint.of(null) });
    }

    async ask() {
      const view = this.view;
      const state = view.state;
      const sel = state.selection.main;
      const path = state.facet(docPath);
      const token = ++this.token;
      if (!path || !sel.empty || !view.hasFocus) return this.hide(state);
      const pos = sel.head;
      const before = state.doc.sliceString(Math.max(0, pos - 3000), pos);
      if (!inArgument(before.slice(-600))) return this.hide(state);
      const after = state.doc.sliceString(pos, Math.min(state.doc.length, pos + 300));
      const hint = await ipc.argumentHint(path, state.facet(completionPrefix) + before, after).catch(() => null);
      if (token !== this.token || view.state.selection.main.head !== pos) return;
      if (!hint) return this.hide(view.state);
      view.dispatch({
        effects: setHint.of({ pos, above: true, strictSide: true, arrow: false, create: () => ({ dom: render(hint) }) }),
      });
    }

    destroy() {
      window.clearTimeout(this.timer);
    }
  },
);

export function argumentHints() {
  return [
    hintField,
    asker,
    EditorView.baseTheme({
      ".cm-arg-hint": {
        maxWidth: "440px",
        padding: "5px 9px 6px",
        fontFamily: "var(--font-ui)",
        fontSize: "12px",
        lineHeight: "1.45",
      },
      ".cm-arg-hint-signature": {
        fontFamily: "var(--font-mono)",
        fontSize: "11.5px",
        color: "var(--text-muted)",
        fontVariantLigatures: "none",
      },
      ".cm-arg-hint-active": { color: "var(--accent)", fontWeight: "700" },
      ".cm-arg-hint-doc": { color: "var(--text)" },
      ".cm-arg-hint-doc strong": { color: "var(--accent)" },
    }),
  ];
}
