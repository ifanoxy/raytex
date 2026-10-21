// The window of the problems of a line, shown when the pointer rests on its
// mark in the gutter. CodeMirror's own one is tied to the element of the mark:
// when the problems are given again (after each check or build) that element
// is made anew and the window, still tied to the old one, fell to the top left
// corner. This one is tied to the line, stays while the pointer is on it (its
// text can be chosen and copied) and changes only when the problems of its
// line change.

import { type Diagnostic, forEachDiagnostic, lintGutter, setDiagnosticsEffect } from "@codemirror/lint";
import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { EditorView, type Tooltip, ViewPlugin, showTooltip } from "@codemirror/view";

interface Tip {
  /** Start of the line. */
  pos: number;
  /** What its problems say, to know when they change. */
  key: string;
  tooltip: Tooltip;
}

const setTip = StateEffect.define<Tip | null>();

function onLine(state: EditorView["state"], lineFrom: number): { d: Diagnostic; from: number; to: number }[] {
  const out: { d: Diagnostic; from: number; to: number }[] = [];
  forEachDiagnostic(state, (d, from, to) => {
    if (from <= state.doc.length && state.doc.lineAt(from).from === lineFrom) out.push({ d, from, to });
  });
  return out;
}

const keyOf = (list: { d: Diagnostic }[]) => list.map(({ d }) => `${d.severity}\u0000${d.message}`).join("\u0001");

const AWAY = { left: 0, right: 0, top: -1e5, bottom: -1e5 };

/**
 * Where the mark of the line at `pos` is drawn (computed, never read from an
 * element that may be gone); out of sight when the line is scrolled away.
 */
function markRect(view: EditorView, pos: number) {
  const gutter = view.dom.querySelector<HTMLElement>(".cm-gutter-lint");
  if (!gutter || pos > view.state.doc.length) return null;
  const g = gutter.getBoundingClientRect();
  const block = view.lineBlockAt(pos);
  const top = view.documentTop + block.top;
  const bottom = top + Math.min(block.height, view.defaultLineHeight);
  const seen = view.scrollDOM.getBoundingClientRect();
  if (bottom <= seen.top || top >= seen.bottom) return null;
  return { left: g.left, right: g.right, top, bottom };
}

function render(view: EditorView, list: { d: Diagnostic }[]): HTMLElement {
  const ul = document.createElement("ul");
  ul.className = "cm-tooltip-lint lbt-gutter-tip";
  for (const { d } of list) {
    const li = document.createElement("li");
    li.className = `cm-diagnostic cm-diagnostic-${d.severity}`;
    const text = document.createElement("span");
    text.className = "cm-diagnosticText";
    text.append(d.renderMessage ? d.renderMessage(view) : d.message);
    li.append(text);
    for (const action of d.actions ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-diagnosticAction";
      button.textContent = action.name;
      button.onmousedown = (e) => {
        e.preventDefault();
        // The problem as it is now (the one drawn may have been given again since).
        const line = view.state.doc.lineAt(Math.min(view.state.field(tipField)?.pos ?? 0, view.state.doc.length));
        const now = onLine(view.state, line.from).find((x) => x.d.message === d.message && x.d.actions?.some((a) => a.name === action.name));
        const act = now?.d.actions?.find((a) => a.name === action.name);
        if (now && act) act.apply(view, now.from, now.to);
      };
      li.append(button);
    }
    if (d.source) {
      const source = document.createElement("div");
      source.className = "cm-diagnosticSource";
      source.textContent = d.source;
      li.append(source);
    }
    ul.append(li);
  }
  return ul;
}

function makeTip(pos: number, list: { d: Diagnostic }[]): Tip {
  return {
    pos,
    key: keyOf(list),
    tooltip: {
      pos,
      above: false,
      // In the gutter, which CodeMirror counts out of the text: shown there all the same.
      clip: false,
      create: (view) => ({ dom: render(view, list), getCoords: (p: number) => markRect(view, p) ?? AWAY }),
    },
  };
}

const tipField = StateField.define<Tip | null>({
  create: () => null,
  update(tip, tr) {
    for (const e of tr.effects) if (e.is(setTip)) return e.value;
    if (!tip) return tip;
    if (tr.docChanged) {
      const line = tr.startState.doc.lineAt(tip.pos);
      if (tr.changes.touchesRange(line.from, line.to)) return null;
      const pos = tr.changes.mapPos(tip.pos);
      tip = { ...tip, pos, tooltip: { ...tip.tooltip, pos } };
    }
    if (tr.effects.some((e) => e.is(setDiagnosticsEffect))) {
      const list = onLine(tr.state, tip.pos);
      if (!list.length) return null;
      // The same problems: the same window (what is chosen in it stays).
      if (keyOf(list) !== tip.key) return makeTip(tip.pos, list);
    }
    return tip;
  },
  provide: (f) => showTooltip.from(f, (tip) => tip?.tooltip ?? null),
});

const hoverPlugin = (hoverTime: number) =>
  ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined;
      constructor(readonly view: EditorView) {
        view.dom.addEventListener("mouseover", this.over);
        // A window left open in the state of a tab shown again: closed like the others.
        if (view.state.field(tipField, false)) this.track();
      }
      over = (e: MouseEvent) => {
        const cell = (e.target as HTMLElement).closest?.<HTMLElement>(".cm-gutter-lint .cm-gutterElement");
        if (!cell?.querySelector(".cm-lint-marker")) return;
        clearTimeout(this.timer);
        const leave = (out: MouseEvent) => {
          if (cell.contains(out.relatedTarget as Node)) return;
          clearTimeout(this.timer);
          cell.removeEventListener("mouseout", leave);
        };
        cell.addEventListener("mouseout", leave);
        this.timer = setTimeout(() => {
          cell.removeEventListener("mouseout", leave);
          if (cell.isConnected) this.show(cell);
        }, hoverTime);
      };
      show(cell: HTMLElement) {
        const { view } = this;
        const line = view.lineBlockAtHeight(cell.getBoundingClientRect().top + 5 - view.documentTop);
        const list = onLine(view.state, line.from);
        if (!list.length) return;
        const current = view.state.field(tipField);
        if (current?.pos !== line.from || current.key !== keyOf(list)) view.dispatch({ effects: setTip.of(makeTip(line.from, list)) });
        this.track();
      }
      /** Closed once the pointer leaves the mark and the window (not while text is being chosen in it). */
      track() {
        window.removeEventListener("mousemove", this.move);
        window.addEventListener("mousemove", this.move);
      }
      move = (e: MouseEvent) => {
        const tip = this.view.state.field(tipField);
        if (!tip) return window.removeEventListener("mousemove", this.move);
        if (e.buttons) return;
        const r = markRect(this.view, tip.pos);
        const m = 10;
        if (r && e.clientX > r.left - m && e.clientX < r.right + m && e.clientY > r.top - m && e.clientY < r.bottom + m) return;
        if ((e.target as HTMLElement).closest?.(".lbt-gutter-tip")) return;
        window.removeEventListener("mousemove", this.move);
        this.view.dispatch({ effects: setTip.of(null) });
      };
      destroy() {
        clearTimeout(this.timer);
        this.view.dom.removeEventListener("mouseover", this.over);
        window.removeEventListener("mousemove", this.move);
      }
    },
  );

/** The gutter of the problems, with its window (`hoverTime`: the rest of the pointer before it opens). */
export function problemsGutter(hoverTime = 250): Extension {
  return [
    // CodeMirror's window left out: nothing to show in it.
    lintGutter({ hoverTime, tooltipFilter: () => [] }),
    tipField,
    hoverPlugin(hoverTime),
    EditorView.theme({
      ".lbt-gutter-tip, .cm-tooltip-hover .cm-tooltip-lint": { userSelect: "text", WebkitUserSelect: "text", cursor: "auto" },
    }),
  ];
}
