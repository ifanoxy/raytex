// Small chips after `\begin{pmatrix}`, `\begin{tabular}{…}`,
// `\begin{tikzpicture}` and `\includegraphics{…}` that open the matching
// editor (grid editor, TikZ studio, image dialog) on that piece of code.

import type { Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { commented, envHead, gridKind } from "../grid";
import { figureGroupAt, firstPictureOf } from "../images";
import { listingAt } from "../listing";

export type ChipKind = "matrix" | "table" | "tikz" | "graph" | "variations" | "tree" | "image" | "code";

export interface ChipOptions {
  /** `count`: pictures the chip stands for, when they are several written together. */
  label: (kind: ChipKind, count: number) => string;
  title: (kind: ChipKind, count: number) => string;
  /** Opens the editor on the code starting at `from` (`\begin` or `\includegraphics`). */
  open: (view: EditorView, kind: ChipKind, from: number) => void;
}

const ICONS: Record<ChipKind, string> = {
  matrix: '<path d="M7 4H5v16h2M17 4h2v16h-2"/><circle cx="9.5" cy="9" r="1"/><circle cx="14.5" cy="9" r="1"/><circle cx="9.5" cy="15" r="1"/><circle cx="14.5" cy="15" r="1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  tikz: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>',
  graph: '<path d="M4 3v17h17"/><path d="M6.5 16c2.5-8 5.5-8 7.5-3s3.5 3 6-6"/>',
  tree: '<circle cx="4" cy="12" r="1.5"/><path d="M5.5 11 12 6M5.5 13l6.5 5M13.5 5.5 20 3.5M13.5 6.5 20 8.5M13.5 17.5l6.5-2M13.5 18.5l6.5 2"/>',
  variations: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/><path d="m11 17 3-4 3 2 2-3"/>',
};

/** What starts a listing: its environment, or the command that reads it from a file. */
const LISTING = ["\\begin{lstlisting}", "\\lstinputlisting"];

/** Several pictures written together. */
const IMAGES = '<rect x="3" y="7" width="14" height="13" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v10"/><circle cx="8" cy="12" r="1.5"/><path d="M17 17l-4-4-7 7"/>';

const TIKZ = /^(tikzpicture|tikzcd|circuitikz)$/;
/** How far around a picture its group is looked for. */
const GROUP_REACH = 4000;

class Chip extends WidgetType {
  constructor(
    readonly kind: ChipKind,
    readonly options: ChipOptions,
    /** Pictures it stands for (1: a picture on its own). */
    readonly count = 1,
  ) {
    super();
  }

  eq(other: Chip) {
    return other.kind === this.kind && other.count === this.count;
  }

  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-code-chip";
    el.title = this.options.title(this.kind, this.count);
    el.setAttribute("role", "button");
    if (this.count > 1) el.dataset.count = String(this.count);
    el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.count > 1 ? IMAGES : ICONS[this.kind]}</svg>`;
    el.append(this.options.label(this.kind, this.count));
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // The chip sits after the arguments: its command is the last one before it.
      const pos = view.posAtDOM(el);
      const start = Math.max(0, pos - 1000);
      const before = view.state.doc.sliceString(start, pos);
      const i =
        this.kind === "code"
          ? Math.max(...LISTING.map((head) => before.lastIndexOf(head)))
          : this.kind === "graph" || this.kind === "variations" || this.kind === "tree"
            ? before.lastIndexOf("\\begin{tikzpicture}")
            : before.lastIndexOf(this.kind === "image" ? "\\includegraphics" : "\\begin");
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

/** What a picture is, from what it holds: curves (pgfplots), a table of variations (tkz-tab), a probability tree (a TikZ tree growing right), or a drawing. */
function pictureKind(text: string): ChipKind {
  const end = text.indexOf("\\end{tikzpicture}");
  const inside = end < 0 ? text : text.slice(0, end);
  if (/\\begin\s*\{axis\}/.test(inside)) return "graph";
  if (/\\tkzTabInit\b/.test(inside)) return "variations";
  if (/grow'\s*=\s*right/.test(inside) && /\bchild\s*\{/.test(inside)) return "tree";
  return "tikz";
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
    const re = /\\begin\s*\{([A-Za-z]+\*?)\}|\\includegraphics\b|(\\lstinputlisting)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && from + m.index < to) {
      if (commented(text, m.index)) continue;
      let kind: ChipKind | null = null;
      let end = -1;
      let count = 1;
      if (m[2] || m[1] === "lstlisting") {
        // After its options: the code itself is left alone.
        const at = from + m.index;
        const found = listingAt(doc.sliceString(at, Math.min(doc.length, at + 20_000)), 0);
        if (found) out.push(Decoration.widget({ widget: new Chip("code", options), side: 1 }).range(at + found.codeEnd));
        continue;
      }
      if (!m[1]) {
        kind = "image";
        end = graphicsEnd(text, m.index);
        // Pictures written together have one chip, on the first of them.
        const at = from + m.index;
        const start = Math.max(0, at - GROUP_REACH);
        const around = doc.sliceString(start, Math.min(doc.length, at + GROUP_REACH));
        const group = end > 0 ? figureGroupAt(around, at - start) : null;
        if (group) {
          if (firstPictureOf(around, group) !== at - start) continue;
          count = group.images.length;
        }
      } else if (TIKZ.test(m[1])) {
        kind = m[1] === "tikzpicture" ? pictureKind(doc.sliceString(from + m.index, Math.min(doc.length, from + m.index + 20_000))) : "tikz";
        end = tikzEnd(text, m.index);
      } else {
        kind = gridKind(m[1]);
        end = kind ? (envHead(text, m.index)?.argsEnd ?? -1) : -1;
      }
      if (kind && end > 0) out.push(Decoration.widget({ widget: new Chip(kind, options, count), side: 1 }).range(from + end));
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
