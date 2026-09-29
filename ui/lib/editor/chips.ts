// Small chips after `\begin{pmatrix}`, `\begin{tabular}{…}`,
// `\begin{tikzpicture}` and `\includegraphics{…}` that open the matching
// editor (grid editor, TikZ studio, image dialog) on that piece of code.

import type { Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { commented, envHead, gridKind } from "../grid";

export type ChipKind = "matrix" | "table" | "tikz" | "image";

export interface ChipOptions {
  label: (kind: ChipKind) => string;
  title: (kind: ChipKind) => string;
  /** Opens the editor on the code starting at `from` (`\begin` or `\includegraphics`). */
  open: (view: EditorView, kind: ChipKind, from: number) => void;
}

const ICONS: Record<ChipKind, string> = {
  matrix: '<path d="M7 4H5v16h2M17 4h2v16h-2"/><circle cx="9.5" cy="9" r="1"/><circle cx="14.5" cy="9" r="1"/><circle cx="9.5" cy="15" r="1"/><circle cx="14.5" cy="15" r="1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  tikz: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
};

const TIKZ = /^(tikzpicture|tikzcd|circuitikz)$/;

class Chip extends WidgetType {
  constructor(
    readonly kind: ChipKind,
    readonly options: ChipOptions,
  ) {
    super();
  }

  eq(other: Chip) {
    return other.kind === this.kind;
  }

  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-code-chip";
    el.title = this.options.title(this.kind);
    el.setAttribute("role", "button");
    el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[this.kind]}</svg>`;
    el.append(this.options.label(this.kind));
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // The chip sits after the arguments: its command is the last one before it.
      const pos = view.posAtDOM(el);
      const start = Math.max(0, pos - 1000);
      const i = view.state.doc.sliceString(start, pos).lastIndexOf(this.kind === "image" ? "\\includegraphics" : "\\begin");
      if (i >= 0) this.options.open(view, this.kind, start + i);
    });
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

/** End of the `[…]` (optional) and `{…}` of `\includegraphics` starting at `i`, or -1. */
function graphicsEnd(text: string, i: number): number {
  const m = /^\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{[^{}\n]*\}/.exec(text.slice(i, i + 600));
  return m ? i + m[0].length : -1;
}

/** End of `\begin{tikzpicture}[…]` starting at `i`. */
function tikzEnd(text: string, i: number): number {
  const m = /^\\begin\s*\{[A-Za-z]+\}(?:\s*\[[^\]]*\])?/.exec(text.slice(i, i + 600));
  return m ? i + m[0].length : -1;
}

function chips(view: EditorView, options: ChipOptions): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    // A little further than the visible end: the arguments may go on.
    const text = doc.sliceString(from, Math.min(doc.length, to + 600));
    const re = /\\begin\s*\{([A-Za-z]+\*?)\}|\\includegraphics\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && from + m.index < to) {
      if (commented(text, m.index)) continue;
      let kind: ChipKind | null = null;
      let end = -1;
      if (!m[1]) {
        kind = "image";
        end = graphicsEnd(text, m.index);
      } else if (TIKZ.test(m[1])) {
        kind = "tikz";
        end = tikzEnd(text, m.index);
      } else {
        kind = gridKind(m[1]);
        end = kind ? (envHead(text, m.index)?.argsEnd ?? -1) : -1;
      }
      if (kind && end > 0) out.push(Decoration.widget({ widget: new Chip(kind, options), side: 1 }).range(from + end));
    }
  }
  return Decoration.set(out, true);
}

export function codeChips(options: ChipOptions) {
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
      ".cm-code-chip": {
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
      ".cm-code-chip:hover": { background: "color-mix(in srgb, var(--accent) 26%, transparent)" },
    }),
  ];
}
