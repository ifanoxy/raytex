// Live preview of the formula under the cursor, rendered with KaTeX.
//
// The formula is found locally (instant, always in sync with the text);
// the project's own macros (\R, \norm…) come from the engine and are
// passed to KaTeX so previews match the document.

import { type EditorState, StateEffect, StateField, type Text } from "@codemirror/state";
import { EditorView, type Tooltip, ViewPlugin, type ViewUpdate, showTooltip } from "@codemirror/view";
import * as ipc from "../ipc";
import { docPath, hooks } from "./context";

interface Formula {
  from: number;
  to: number;
  latex: string;
  display: boolean;
}

const MATH_ENVS = /^(equation|align|gather|multline|flalign|alignat|eqnarray|displaymath|math)\*?$/;

function unescaped(text: string, i: number): boolean {
  let n = 0;
  for (let j = i - 1; j >= 0 && text[j] === "\\"; j--) n++;
  return n % 2 === 0;
}

/** Finds the formula containing `pos`, looking only at the surrounding paragraph. */
export function findFormula(doc: Text, pos: number): Formula | null {
  const lineNo = doc.lineAt(pos).number;
  let start = lineNo;
  while (start > 1 && lineNo - start < 60 && doc.line(start - 1).text.trim()) start--;
  let end = lineNo;
  while (end < doc.lines && end - lineNo < 60 && doc.line(end + 1).text.trim()) end++;
  const from = doc.line(start).from;
  const text = doc.sliceString(from, doc.line(end).to);
  const rel = pos - from;

  // Math environments.
  const envRe = /\\begin\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = envRe.exec(text))) {
    if (!MATH_ENVS.test(m[1])) continue;
    const close = `\\end{${m[1]}}`;
    const endIdx = text.indexOf(close, m.index);
    if (endIdx < 0) continue;
    if (m.index <= rel && rel <= endIdx + close.length) {
      const env = m[1];
      const body = text.slice(m.index + m[0].length, endIdx);
      const latex = /^(equation|displaymath|math)\*?$/.test(env) ? body : text.slice(m.index, endIdx + close.length);
      return { from: from + m.index, to: from + endIdx + close.length, latex, display: true };
    }
  }

  // Delimited math.
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "%" && unescaped(text, i)) {
      const nl = text.indexOf("\n", i);
      if (nl < 0) break;
      i = nl + 1;
      continue;
    }
    let open = "";
    let close = "";
    if (ch === "$" && unescaped(text, i)) {
      open = text[i + 1] === "$" ? "$$" : "$";
      close = open;
    } else if (ch === "\\" && (text[i + 1] === "[" || text[i + 1] === "(") && unescaped(text, i)) {
      open = text.slice(i, i + 2);
      close = text[i + 1] === "[" ? "\\]" : "\\)";
    }
    if (!open) {
      i++;
      continue;
    }
    let j = i + open.length;
    let found = -1;
    while (j < text.length) {
      const k = text.indexOf(close, j);
      if (k < 0) break;
      if (unescaped(text, k)) {
        found = k;
        break;
      }
      j = k + 1;
    }
    if (found < 0) return null;
    if (i <= rel && rel <= found + close.length) {
      return {
        from: from + i,
        to: from + found + close.length,
        latex: text.slice(i + open.length, found),
        display: open === "$$" || open === "\\[",
      };
    }
    i = found + close.length;
  }
  return null;
}

function cleanForPreview(latex: string): string {
  return latex
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/\\(nonumber|notag)\b/g, "")
    .replace(/%[^\n]*/g, "");
}

let katexModule: typeof import("katex") | null = null;
async function katex() {
  if (!katexModule) {
    await import("katex/dist/katex.min.css");
    katexModule = await import("katex");
  }
  return katexModule;
}

/** HTML of a small formula (snippet fields shown as boxes), for lists of symbols. */
export async function mathHtml(latex: string): Promise<string> {
  const k = await katex();
  const tex = latex.replace(/\$\{\d+(?::[^}]*)?\}/g, "\\square").replace(/\\\\([{}])/g, "\\$1");
  return k.renderToString(tex, { throwOnError: false, displayMode: false });
}

/** HTML of a displayed formula (grid editor preview), with the macros of the document `path`. */
export async function displayHtml(latex: string, path?: string | null): Promise<string> {
  const k = await katex();
  return k.renderToString(latex, { throwOnError: false, displayMode: true, strict: "ignore", macros: macrosOf(path) });
}

/** HTML of text-mode LaTeX (a table cell): formulas, `\\textbf`, `\\emph`…, with the macros of `path`. */
export async function textHtml(latex: string, path?: string | null): Promise<string> {
  const k = await katex();
  return k.renderToString(`\\text{${latex}}`, { throwOnError: false, strict: "ignore", macros: macrosOf(path) });
}

const macrosByPath = new Map<string, Record<string, string>>();

/** A copy of the macros of a document (KaTeX adds the ones a formula defines). */
function macrosOf(path?: string | null): Record<string, string> {
  return { ...((path && macrosByPath.get(path)) || {}) };
}

/** Refreshes the macros of a document (called after each synchronisation). */
export async function refreshMacros(path: string) {
  try {
    macrosByPath.set(path, await ipc.mathMacros(path));
  } catch {
    /* no project */
  }
}

const setPreview = StateEffect.define<Tooltip | null>();

const previewField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setPreview)) return e.value;
    if (value && tr.docChanged) return { ...value, pos: tr.changes.mapPos(value.pos) };
    return value;
  },
  provide: (f) => showTooltip.from(f),
});

function render(state: EditorState, f: Formula, k: typeof import("katex")): Tooltip {
  const macros = { ...(macrosByPath.get(state.facet(docPath)) ?? {}) };
  return {
    pos: f.to,
    above: false,
    strictSide: false,
    arrow: false,
    create() {
      const dom = document.createElement("div");
      dom.className = "lbt-math-preview";
      try {
        k.default.render(cleanForPreview(f.latex), dom, {
          displayMode: f.display,
          throwOnError: false,
          errorColor: "var(--error)",
          macros,
          trust: false,
          strict: "ignore",
          output: "htmlAndMathml",
        });
      } catch (e) {
        dom.textContent = String(e);
      }
      return { dom };
    },
  };
}

const previewPlugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null;
    last = "";
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      if (!u.selectionSet && !u.docChanged && !u.focusChanged) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.refresh(), u.docChanged ? 220 : 90);
    }
    async refresh() {
      const view = this.view;
      const state = view.state;
      const sel = state.selection.main;
      const f = hooks.settings().mathPreview && view.hasFocus && sel.empty ? findFormula(state.doc, sel.head) : null;
      const key = f ? `${f.from}:${f.latex}:${f.display}` : "";
      if (key === this.last) return;
      this.last = key;
      if (!f || !f.latex.trim()) {
        if (state.field(previewField)) view.dispatch({ effects: setPreview.of(null) });
        return;
      }
      const k = await katex();
      if (this.view.state !== state) return; // stale
      view.dispatch({ effects: setPreview.of(render(state, f, k)) });
    }
    destroy() {
      if (this.timer) clearTimeout(this.timer);
    }
  },
);

export function mathPreview() {
  return [
    previewField,
    previewPlugin,
    EditorView.baseTheme({
      ".lbt-math-preview": {
        padding: "10px 14px",
        maxWidth: "min(720px, 80vw)",
        overflowX: "auto",
        fontSize: "16px",
        color: "var(--text)",
      },
      ".lbt-math-preview .katex-display": { margin: "0" },
    }),
  ];
}
