// Structure-aware editing: folding, indentation, environment closing,
// list continuation and formatting commands.

import { foldService, indentService, indentUnit, getIndentUnit } from "@codemirror/language";
import { EditorSelection, type EditorState, type Extension, Text } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";

const SECTION_LEVEL: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

const SECTION_RE = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*[[{]/;
const BEGIN_RE = /\\begin\{([^}]+)\}/;

function stripComment(text: string): string {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "%") {
      let bs = 0;
      for (let j = i - 1; j >= 0 && text[j] === "\\"; j--) bs++;
      if (bs % 2 === 0) return text.slice(0, i);
    }
  }
  return text;
}

/** Line number of the `\end{env}` matching a `\begin{env}` on `lineNo`, or null. */
function findEnvEnd(doc: Text, lineNo: number, env: string, maxLines = 5000): number | null {
  const open = `\\begin{${env}}`;
  const close = `\\end{${env}}`;
  let depth = 0;
  const last = Math.min(doc.lines, lineNo + maxLines);
  for (let n = lineNo; n <= last; n++) {
    const text = stripComment(doc.line(n).text);
    let i = 0;
    while (i < text.length) {
      const o = text.indexOf(open, i);
      const c = text.indexOf(close, i);
      if (o < 0 && c < 0) break;
      if (o >= 0 && (c < 0 || o < c)) {
        depth++;
        i = o + open.length;
      } else {
        depth--;
        if (depth === 0) return n;
        i = c + close.length;
      }
    }
  }
  return null;
}

const latexFolding = foldService.of((state, lineStart) => {
  const doc = state.doc;
  const line = doc.lineAt(lineStart);
  const text = stripComment(line.text);
  const env = BEGIN_RE.exec(text);
  if (env && env[1] !== "document") {
    const end = findEnvEnd(doc, line.number, env[1]);
    if (end && end > line.number + 0) {
      if (end === line.number) return null;
      const endLine = doc.line(end);
      const to = endLine.from + endLine.text.indexOf("\\end") - 0;
      return to > line.to ? { from: line.to, to: Math.max(line.to, to) } : null;
    }
  }
  const section = SECTION_RE.exec(text);
  if (section) {
    const level = SECTION_LEVEL[section[1]];
    const last = Math.min(doc.lines, line.number + 8000);
    let n = line.number + 1;
    for (; n <= last; n++) {
      const t = doc.line(n).text;
      const m = SECTION_RE.exec(t);
      if ((m && SECTION_LEVEL[m[1]] <= level) || /^\s*\\(end\{document\}|appendix\b|printbibliography|bibliography\{|backmatter)/.test(t)) break;
    }
    let endLine = n - 1;
    while (endLine > line.number && !doc.line(endLine).text.trim()) endLine--;
    if (endLine > line.number) return { from: line.to, to: doc.line(endLine).to };
  }
  return null;
});

function indentWidth(text: string, tabSize: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w++;
    else if (ch === "\t") w += tabSize - (w % tabSize);
    else break;
  }
  return w;
}

const latexIndent = indentService.of((cx, pos) => {
  const doc = cx.state.doc;
  const line = doc.lineAt(pos);
  let n = line.number - 1;
  while (n >= 1 && !doc.line(n).text.trim()) n--;
  if (n < 1) return 0;
  const prev = stripComment(doc.line(n).text);
  let indent = indentWidth(prev, cx.state.tabSize);
  const opens = (prev.match(/\\begin\{(?!document\})[^}]*\}/g) ?? []).length;
  const closes = (prev.match(/\\end\{(?!document\})[^}]*\}/g) ?? []).length;
  if (opens > closes) indent += cx.unit;
  const after = cx.textAfterPos(pos);
  if (/^\s*\\end\{(?!document\})/.test(after)) indent -= cx.unit;
  return Math.max(0, indent);
});

/** Enter after `\begin{env}`: inserts the matching `\end{env}`. */
function closeEnvironment(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const after = line.text.slice(sel.head - line.from);
  const m = /\\begin\{([^}]+)\}(?:\s*(?:\[[^\]]*\]|\{[^}]*\}|<[^>]*>))*\s*$/.exec(stripComment(before));
  if (!m || after.trim()) return false;
  const env = m[1];
  if (env === "document" && /\\end\{document\}/.test(state.doc.sliceString(sel.head))) return false;
  const indent = /^\s*/.exec(line.text)![0];
  const end = findEnvEnd(state.doc, line.number, env);
  // An \end found later but less indented belongs to an enclosing environment.
  if (end !== null && /^\s*/.exec(state.doc.line(end).text)![0].length >= indent.length) return false;
  const unit = getIndentUnit(state) === 0 ? "" : state.facet(indentUnit);
  const first = `\n${indent}${unit}`;
  const insert = `${first}\n${indent}\\end{${env}}`;
  view.dispatch({
    changes: { from: sel.head, insert },
    selection: { anchor: sel.head + first.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

/** Enter on an `\item` line continues the list; on an empty `\item` it ends it. */
function continueList(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to) return false;
  const m = /^(\s*)\\item(\[[^\]]*\])?(\s*)(.*)$/.exec(line.text);
  if (!m) return false;
  if (!m[4].trim() && !m[2]) {
    // Empty item: remove it and leave the list.
    view.dispatch({ changes: { from: line.from, to: line.to, insert: m[1] }, userEvent: "delete" });
    return true;
  }
  const insert = `\n${m[1]}\\item `;
  view.dispatch({ changes: { from: sel.head, insert }, selection: { anchor: sel.head + insert.length }, scrollIntoView: true, userEvent: "input" });
  return true;
}

export function enterKeymap(opts: { closeEnvironments: () => boolean }): KeyBinding[] {
  return [
    {
      key: "Enter",
      run: (view) => (opts.closeEnvironments() && closeEnvironment(view)) || continueList(view),
    },
  ];
}

export function latexStructure(): Extension {
  return [latexFolding, latexIndent];
}

// ------------------------------------------------------------ formatting

/** Wraps the selections in `\cmd{…}` (or inserts `\cmd{}` with the cursor inside). */
export function wrapCommand(view: EditorView, cmd: string): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const open = `\\${cmd}{`;
    if (range.empty) {
      return {
        changes: { from: range.from, insert: `${open}}` },
        range: EditorSelection.cursor(range.from + open.length),
      };
    }
    const text = state.sliceDoc(range.from, range.to);
    // Toggle off when the selection is already wrapped.
    const beforeOpen = state.sliceDoc(Math.max(0, range.from - open.length), range.from);
    const afterClose = state.sliceDoc(range.to, range.to + 1);
    if (beforeOpen === open && afterClose === "}") {
      return {
        changes: [
          { from: range.from - open.length, to: range.from },
          { from: range.to, to: range.to + 1 },
        ],
        range: EditorSelection.range(range.from - open.length, range.to - open.length),
      };
    }
    return {
      changes: { from: range.from, to: range.to, insert: `${open}${text}}` },
      range: EditorSelection.range(range.from + open.length, range.from + open.length + text.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
}

/** Wraps the selected lines in an environment. */
export function wrapEnvironment(view: EditorView, env: string): boolean {
  const { state } = view;
  const range = state.selection.main;
  const from = state.doc.lineAt(range.from);
  const to = state.doc.lineAt(range.to);
  const indent = /^\s*/.exec(from.text)![0];
  const unit = state.facet(indentUnit);
  const body = state
    .sliceDoc(from.from, to.to)
    .split("\n")
    .map((l) => (l.trim() ? unit + l : l))
    .join("\n");
  const insert = `${indent}\\begin{${env}}\n${body || indent + unit}\n${indent}\\end{${env}}`;
  view.dispatch({
    changes: { from: from.from, to: to.to, insert },
    selection: { anchor: from.from + indent.length + `\\begin{${env}}\n`.length + (body ? 0 : indent.length + unit.length) },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

/** Wraps the selection in inline math `$…$`. */
export function wrapMath(view: EditorView): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: `$${text}$` },
      range: range.empty ? EditorSelection.cursor(range.from + 1) : EditorSelection.range(range.from + 1, range.to + 1),
    };
  });
  view.dispatch(state.update(tr, { userEvent: "input" }));
  return true;
}

/** Position (offset) where a `\usepackage` line should be inserted in a preamble. */
export function preambleInsertOffset(doc: Text): number | null {
  let lastUse = -1;
  let classLine = -1;
  let begin = -1;
  for (let n = 1; n <= Math.min(doc.lines, 2000); n++) {
    const t = stripComment(doc.line(n).text);
    if (/\\documentclass/.test(t)) classLine = n;
    if (/\\(usepackage|RequirePackage)\b/.test(t)) lastUse = n;
    if (/\\begin\{document\}/.test(t)) {
      begin = n;
      break;
    }
  }
  const after = lastUse > 0 ? lastUse : classLine;
  if (after > 0 && (begin < 0 || after < begin)) return doc.line(after).to;
  return null;
}

/** Whether `state`'s document already loads `pkg`. */
export function loadsPackage(state: EditorState, pkg: string): boolean {
  const re = new RegExp(`\\\\(usepackage|RequirePackage)\\s*(\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${pkg.replace(/[-.]/g, "\\$&")}\\b[^}]*\\}`);
  return re.test(state.doc.sliceString(0, Math.min(state.doc.length, 50000)));
}
