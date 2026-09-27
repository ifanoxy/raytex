// Linked environment names: editing the name of `\begin{…}` also edits the
// matching `\end{…}` (and the other way round), in the same transaction, so
// one undo reverts both.
//
// No local imports: tested directly by Node (`npm test`).

import { EditorState, type Extension, type Text, type Transaction, type TransactionSpec } from "@codemirror/state";

/** Lines searched for the partner of an environment. */
const MAX_LINES = 5000;

interface NameSpan {
  kind: "begin" | "end";
  name: string;
  /** Offsets of the name (inside the braces). */
  from: number;
  to: number;
}

/** Offset of the first unescaped `%` of a line (or its length). */
function commentStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "%") return i;
  }
  return text.length;
}

/** `\begin{name}` / `\end{name}` whose name contains the range `from…to` (document offsets). */
export function nameSpanAt(doc: Text, from: number, to: number): NameSpan | null {
  const line = doc.lineAt(from);
  if (to > line.to) return null;
  const text = line.text.slice(0, commentStart(line.text));
  const re = /\\(begin|end)\s*\{([^{}\n]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const nameFrom = line.from + m.index + m[0].indexOf("{") + 1;
    const nameTo = nameFrom + m[2].length;
    if (from >= nameFrom && to <= nameTo) return { kind: m[1] as "begin" | "end", name: m[2], from: nameFrom, to: nameTo };
  }
  return null;
}

/** Every `\begin{name}` / `\end{name}` of a line, with the offsets of the name. */
function tokens(doc: Text, n: number, name: string): { kind: "begin" | "end"; from: number; to: number }[] {
  const line = doc.line(n);
  if (!line.text.includes(name) && name) return [];
  const text = line.text.slice(0, commentStart(line.text));
  const out: { kind: "begin" | "end"; from: number; to: number }[] = [];
  const re = /\\(begin|end)\s*\{([^{}\n]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[2] !== name) continue;
    const from = line.from + m.index + m[0].indexOf("{") + 1;
    out.push({ kind: m[1] as "begin" | "end", from, to: from + m[2].length });
  }
  return out;
}

/** The name span of the environment matching `span` (same name, nesting respected). */
export function partnerOf(doc: Text, span: NameSpan): { from: number; to: number } | null {
  const start = doc.lineAt(span.from).number;
  if (span.kind === "begin") {
    let depth = 0;
    for (let n = start; n <= Math.min(doc.lines, start + MAX_LINES); n++) {
      for (const tok of tokens(doc, n, span.name)) {
        if (tok.from < span.from) continue;
        if (tok.kind === "begin") depth++;
        else if (--depth === 0) return tok;
      }
    }
  } else {
    let depth = 0;
    for (let n = start; n >= Math.max(1, start - MAX_LINES); n--) {
      for (const tok of tokens(doc, n, span.name).reverse()) {
        if (tok.from > span.from) continue;
        if (tok.kind === "end") depth++;
        else if (--depth === 0) return tok;
      }
    }
  }
  return null;
}

/** The change to add to `tr` so that the partner of an edited name follows it. */
export function linkedChange(tr: Transaction): TransactionSpec | null {
  if (!tr.docChanged || !(tr.isUserEvent("input") || tr.isUserEvent("delete"))) return null;
  if (tr.isUserEvent("input.complete") && tr.startState.selection.ranges.length > 1) return null;
  let edit: { fromA: number; toA: number; fromB: number; toB: number } | null = null;
  let count = 0;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    count++;
    edit = { fromA, toA, fromB, toB };
  });
  if (count !== 1 || !edit) return null;
  const { fromA, toA, fromB, toB } = edit as { fromA: number; toA: number; fromB: number; toB: number };
  const span = nameSpanAt(tr.startState.doc, fromA, toA);
  if (!span) return null;
  // New name: the old one with the edit applied; it must stay a plain name.
  const newTo = span.to + (toB - fromB) - (toA - fromA);
  if (newTo < span.from) return null;
  const name = tr.newDoc.sliceString(span.from, newTo);
  if (name === span.name || /[{}\\%\n]/.test(name)) return null;
  const partner = partnerOf(tr.startState.doc, span);
  if (!partner) return null;
  return { changes: { from: partner.from, to: partner.to, insert: name } };
}

/** The extension: user edits of an environment name are mirrored on its partner. */
export function linkedEnvironments(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const extra = linkedChange(tr);
    return extra ? [tr, extra] : tr;
  });
}
