// A small chip after `\begin{pmatrix}` or `\begin{tabular}{…}` that opens
// the grid editor on that environment.

import type { Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { commented, envHead, type GridKind, gridKind } from "../grid";

export interface GridChipOptions {
  label: (kind: GridKind) => string;
  title: (kind: GridKind) => string;
  /** Opens the editor on the environment whose `\begin` is at `from`. */
  open: (view: EditorView, from: number) => void;
}

const ICONS: Record<GridKind, string> = {
  matrix: '<path d="M7 4H5v16h2M17 4h2v16h-2"/><circle cx="9.5" cy="9" r="1"/><circle cx="14.5" cy="9" r="1"/><circle cx="9.5" cy="15" r="1"/><circle cx="14.5" cy="15" r="1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
};

class Chip extends WidgetType {
  constructor(
    readonly kind: GridKind,
    readonly options: GridChipOptions,
  ) {
    super();
  }

  eq(other: Chip) {
    return other.kind === this.kind;
  }

  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-grid-chip";
    el.title = this.options.title(this.kind);
    el.setAttribute("role", "button");
    el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[this.kind]}</svg>`;
    el.append(this.options.label(this.kind));
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // The chip sits after the arguments: its `\begin` is the last one before it.
      const pos = view.posAtDOM(el);
      const start = Math.max(0, pos - 400);
      const i = view.state.doc.sliceString(start, pos).lastIndexOf("\\begin");
      if (i >= 0) this.options.open(view, start + i);
    });
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

function chips(view: EditorView, options: GridChipOptions): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    // A little further than the visible end: the arguments may go on.
    const text = doc.sliceString(from, Math.min(doc.length, to + 400));
    const re = /\\begin\s*\{([A-Za-z]+\*?)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && from + m.index < to) {
      const kind = gridKind(m[1]);
      if (!kind || commented(text, m.index)) continue;
      const head = envHead(text, m.index);
      if (head) out.push(Decoration.widget({ widget: new Chip(kind, options), side: 1 }).range(from + head.argsEnd));
    }
  }
  return Decoration.set(out, true);
}

export function gridChips(options: GridChipOptions) {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = chips(view, options);
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.viewportChanged) this.decorations = chips(u.view, options);
        }
      },
      { decorations: (v) => v.decorations },
    ),
    EditorView.baseTheme({
      ".cm-grid-chip": {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "8px",
        padding: "0 7px",
        borderRadius: "9px",
        border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
        background: "var(--accent-soft)",
        color: "var(--accent)",
        fontFamily: "var(--font-ui)",
        fontSize: "0.78em",
        fontWeight: "600",
        lineHeight: "1.55",
        verticalAlign: "1px",
        cursor: "pointer",
        userSelect: "none",
      },
      ".cm-grid-chip:hover": { background: "color-mix(in srgb, var(--accent) 26%, transparent)" },
    }),
  ];
}
