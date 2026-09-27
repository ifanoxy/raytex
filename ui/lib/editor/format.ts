// Formatting commands of the ribbon (heading style, text size, colour,
// alignment, lists, tables), written as text transformations.
//
// No local imports: tested directly by Node (`npm test`).

import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// ------------------------------------------------------------ headings

/** Sectioning commands, from the highest level. */
export const HEADINGS = ["part", "chapter", "section", "subsection", "subsubsection", "paragraph"] as const;
export type Heading = (typeof HEADINGS)[number];

const HEADING_RE = /^(\s*)\\(part|chapter|section|subsection|subsubsection|paragraph)(\*?)\s*\{/;

/** Index just after the brace closing the group opened at `open` (or -1). */
function groupEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/** Heading command of a line (`section`), or null for normal text. */
export function headingOf(line: string): Heading | null {
  const m = HEADING_RE.exec(line);
  return m ? (m[2] as Heading) : null;
}

/**
 * A line turned into a heading of `level` (or back into normal text when
 * `level` is null). Returns the new line and the cursor offset in it.
 */
export function headingLine(line: string, level: Heading | null): { text: string; cursor: number } {
  const m = HEADING_RE.exec(line);
  if (m) {
    const open = m[0].length - 1;
    const end = groupEnd(line, open);
    const title = end > 0 ? line.slice(open + 1, end - 1) : line.slice(open + 1);
    const rest = end > 0 ? line.slice(end) : "";
    if (!level) return { text: m[1] + title + rest, cursor: m[1].length + title.length };
    const head = `${m[1]}\\${level}${m[3]}{`;
    return { text: `${head}${title}}${rest}`, cursor: head.length + title.length };
  }
  if (!level) return { text: line, cursor: line.length };
  const indent = /^\s*/.exec(line)![0];
  const title = line.slice(indent.length).trimEnd();
  const head = `${indent}\\${level}{`;
  return { text: `${head}${title}}`, cursor: head.length + title.length };
}

/** Applies a heading level to the lines of the main selection. */
export function setHeading(view: EditorView, level: Heading | null): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const first = state.doc.lineAt(sel.from);
  const last = state.doc.lineAt(sel.to);
  const changes = [];
  // Cursor at the end of the first title (the first line does not move).
  let cursor = sel.head;
  for (let n = first.number; n <= last.number; n++) {
    const line = state.doc.line(n);
    if (!line.text.trim() && first.number !== last.number) continue;
    const out = headingLine(line.text, level);
    if (out.text !== line.text) changes.push({ from: line.from, to: line.to, insert: out.text });
    if (n === first.number) cursor = line.from + out.cursor;
  }
  if (!changes.length) return false;
  view.dispatch({ changes, selection: EditorSelection.cursor(cursor), userEvent: "input.format", scrollIntoView: true });
  return true;
}

// --------------------------------------------------------- text size

/** Size commands, from the smallest. */
export const SIZES = ["tiny", "scriptsize", "footnotesize", "small", "normalsize", "large", "Large", "LARGE", "huge", "Huge"] as const;
export type Size = (typeof SIZES)[number];

const SIZE_GROUP_RE = new RegExp(`\\{\\\\(${SIZES.join("|")})\\s$`);

/**
 * Text size: wraps the selection in `{\large …}`, or changes the size of
 * the group it is already wrapped in (`normalsize` removes the group).
 */
export function setSize(view: EditorView, size: Size): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const before = state.sliceDoc(Math.max(0, range.from - 16), range.from);
    const m = SIZE_GROUP_RE.exec(before);
    const closes = state.sliceDoc(range.to, range.to + 1) === "}";
    if (m && closes) {
      const start = range.from - m[0].length;
      if (size === "normalsize") {
        return {
          changes: [
            { from: start, to: range.from },
            { from: range.to, to: range.to + 1 },
          ],
          range: EditorSelection.range(start, range.to - m[0].length),
        };
      }
      const open = `{\\${size} `;
      return {
        changes: { from: start, to: range.from, insert: open },
        range: EditorSelection.range(start + open.length, range.to - m[0].length + open.length),
      };
    }
    if (size === "normalsize") return { range };
    const open = `{\\${size} `;
    const text = state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: `${open}${text}}` },
      range: EditorSelection.range(range.from + open.length, range.from + open.length + text.length),
    };
  });
  view.dispatch(state.update(tr, { userEvent: "input.format", scrollIntoView: true }));
  return true;
}

// ------------------------------------------------------------- colour

/** Colours offered by the ribbon (xcolor names, understood without options). */
export const COLORS: { name: string; css: string }[] = [
  { name: "black", css: "#000000" },
  { name: "darkgray", css: "#404040" },
  { name: "gray", css: "#808080" },
  { name: "red", css: "#ff0000" },
  { name: "orange", css: "#ff8000" },
  { name: "olive", css: "#808000" },
  { name: "teal", css: "#008080" },
  { name: "blue", css: "#0000ff" },
  { name: "violet", css: "#800080" },
  { name: "magenta", css: "#ff00ff" },
  { name: "brown", css: "#bf8040" },
  { name: "cyan", css: "#00ffff" },
];

const COLOR_OPEN_RE = /\\textcolor\{([^{}]*)\}\{$/;

/** Colours the selection (`\textcolor{red}{…}`), or changes the colour it already has. */
export function setColor(view: EditorView, color: string): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const before = state.sliceDoc(Math.max(0, range.from - 40), range.from);
    const m = COLOR_OPEN_RE.exec(before);
    if (m && state.sliceDoc(range.to, range.to + 1) === "}") {
      const nameFrom = range.from - m[0].length + "\\textcolor{".length;
      const delta = color.length - m[1].length;
      return {
        changes: { from: nameFrom, to: nameFrom + m[1].length, insert: color },
        range: EditorSelection.range(range.from + delta, range.to + delta),
      };
    }
    const open = `\\textcolor{${color}}{`;
    const text = state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: `${open}${text}}` },
      range: EditorSelection.range(range.from + open.length, range.from + open.length + text.length),
    };
  });
  view.dispatch(state.update(tr, { userEvent: "input.format", scrollIntoView: true }));
  return true;
}

// ---------------------------------------------------------- alignment

export const ALIGNMENTS = ["flushleft", "center", "flushright"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

const ALIGN_BEGIN_RE = /^\s*\\begin\{(flushleft|center|flushright)\}\s*$/;
const ALIGN_END_RE = /^\s*\\end\{(flushleft|center|flushright)\}\s*$/;

/**
 * The alignment block around lines `first…last` of `lines` (0-based): the
 * indices of its `\begin` and `\end` lines, or null.
 */
export function alignmentAround(lines: string[], first: number, last: number): { begin: number; end: number; env: Alignment } | null {
  let depth = 0;
  for (let i = first - 1; i >= 0 && first - i < 400; i--) {
    if (ALIGN_END_RE.test(lines[i])) depth++;
    const b = ALIGN_BEGIN_RE.exec(lines[i]);
    if (b && depth-- === 0) {
      const env = b[1] as Alignment;
      let d = 0;
      for (let j = last + 1; j < lines.length && j - last < 400; j++) {
        if (ALIGN_BEGIN_RE.test(lines[j])) d++;
        const e = ALIGN_END_RE.exec(lines[j]);
        if (e && d-- === 0) return e[1] === env ? { begin: i, end: j, env } : null;
      }
      return null;
    }
  }
  return null;
}

/**
 * Lines `first…last` aligned with `env`, or back to justified text (null):
 * an enclosing alignment block is changed or removed, otherwise the lines
 * are wrapped in a new one. Returns the replaced line range and new text.
 */
export function alignLines(lines: string[], first: number, last: number, env: Alignment | null, unit: string): { from: number; to: number; text: string[] } | null {
  const block = alignmentAround(lines, first, last);
  if (block) {
    if (block.env === env) return null;
    if (env) {
      return {
        from: block.begin,
        to: block.end,
        text: [
          lines[block.begin].replace(block.env, env),
          ...lines.slice(block.begin + 1, block.end),
          lines[block.end].replace(block.env, env),
        ],
      };
    }
    const inner = lines.slice(block.begin + 1, block.end).map((l) => (l.startsWith(unit) ? l.slice(unit.length) : l));
    return { from: block.begin, to: block.end, text: inner };
  }
  if (!env) return null;
  const indent = /^\s*/.exec(lines[first])![0];
  const body = lines.slice(first, last + 1).map((l) => (l.trim() ? unit + l : l));
  return { from: first, to: last, text: [`${indent}\\begin{${env}}`, ...body, `${indent}\\end{${env}}`] };
}

/** Aligns the selected lines (see [`alignLines`]). */
export function setAlignment(view: EditorView, env: Alignment | null, unit: string): boolean {
  const { state } = view;
  const doc = state.doc;
  const sel = state.selection.main;
  const firstNo = doc.lineAt(sel.from).number;
  const lastNo = doc.lineAt(sel.to).number;
  // Lines around the selection (enough to find an enclosing block).
  const lo = Math.max(1, firstNo - 400);
  const hi = Math.min(doc.lines, lastNo + 400);
  const lines: string[] = [];
  for (let n = lo; n <= hi; n++) lines.push(doc.line(n).text);
  const out = alignLines(lines, firstNo - lo, lastNo - lo, env, unit);
  if (!out) return false;
  const from = doc.line(out.from + lo).from;
  const to = doc.line(out.to + lo).to;
  const insert = out.text.join("\n");
  const set = state.changes({ from, to, insert });
  const wasEmpty = !state.sliceDoc(sel.from, sel.to) && !doc.lineAt(sel.from).text.trim();
  const cursor = wasEmpty && env ? from + out.text[0].length + 1 + out.text[1].length : set.mapPos(sel.head, 1);
  view.dispatch({ changes: set, selection: EditorSelection.cursor(cursor), userEvent: "input.format", scrollIntoView: true });
  return true;
}

// ---------------------------------------------------------------- lists

export type ListEnv = "itemize" | "enumerate";

/**
 * Lines turned into a list: each non-empty line becomes an `\item`. Lines
 * that are already items keep their text.
 */
export function listBlock(lines: string[], env: ListEnv, unit: string): string[] {
  const indent = /^\s*/.exec(lines.find((l) => l.trim()) ?? "")![0];
  const items = lines
    .filter((l) => l.trim())
    .map((l) => {
      const text = l.trim().replace(/^\\item\s*/, "");
      return `${indent}${unit}\\item ${text}`;
    });
  if (!items.length) items.push(`${indent}${unit}\\item `);
  return [`${indent}\\begin{${env}}`, ...items, `${indent}\\end{${env}}`];
}

const LIST_BEGIN_RE = /^\s*\\begin\{(itemize|enumerate)\}/;
const LIST_END_RE = /^\s*\\end\{(itemize|enumerate)\}/;

/** Bulleted or numbered list: converts the selected lines, or switches the type of the list around the cursor. */
export function setList(view: EditorView, env: ListEnv, unit: string): boolean {
  const { state } = view;
  const doc = state.doc;
  const sel = state.selection.main;
  const first = doc.lineAt(sel.from);
  const last = doc.lineAt(sel.to);
  // Inside a list of the other kind (cursor on an item): switch its type.
  if (/^\s*\\item\b/.test(first.text)) {
    let depth = 0;
    for (let n = first.number - 1; n >= Math.max(1, first.number - 400); n--) {
      const text = doc.line(n).text;
      if (LIST_END_RE.test(text)) depth++;
      const b = LIST_BEGIN_RE.exec(text);
      if (b && depth-- === 0) {
        if (b[1] === env) return false;
        let d = 0;
        for (let k = n + 1; k <= Math.min(doc.lines, n + 2000); k++) {
          const t = doc.line(k).text;
          if (LIST_BEGIN_RE.test(t)) d++;
          const e = LIST_END_RE.exec(t);
          if (e && d-- === 0) {
            const bl = doc.line(n);
            const el = doc.line(k);
            const bi = bl.from + bl.text.indexOf(b[1]);
            const ei = el.from + el.text.indexOf(e[1]);
            view.dispatch({
              changes: [
                { from: bi, to: bi + b[1].length, insert: env },
                { from: ei, to: ei + e[1].length, insert: env },
              ],
              userEvent: "input.format",
            });
            return true;
          }
        }
        return false;
      }
    }
  }
  const lines: string[] = [];
  for (let n = first.number; n <= last.number; n++) lines.push(doc.line(n).text);
  const block = listBlock(lines, env, unit);
  const insert = block.join("\n");
  // Cursor at the end of the first item.
  const cursor = first.from + block[0].length + 1 + block[1].length;
  view.dispatch({ changes: { from: first.from, to: last.to, insert }, selection: EditorSelection.cursor(cursor), userEvent: "input.format", scrollIntoView: true });
  return true;
}

// --------------------------------------------------------------- tables

/**
 * Snippet of a `rows × cols` table (booktabs rules, first row as header):
 * every cell is an empty field, then the caption.
 */
export function tableSnippet(rows: number, cols: number): string {
  let field = 1;
  const row = () =>
    Array.from({ length: cols }, () => `\${${field++}}`).join(" & ") + " \\\\";
  const head = row();
  const body = Array.from({ length: Math.max(0, rows - 1) }, row);
  const caption = `\${${field++}}`;
  return [
    "\\begin{table}[htbp]",
    "\t\\centering",
    `\t\\caption{${caption}}`,
    `\t\\label{tab:\${${field++}}}`,
    `\t\\begin{tabular}{${"l".repeat(cols)}}`,
    "\t\t\\toprule",
    `\t\t${head}`,
    ...(body.length ? ["\t\t\\midrule", ...body.map((r) => `\t\t${r}`)] : []),
    "\t\t\\bottomrule",
    "\t\\end{tabular}",
    "\\end{table}",
  ].join("\n");
}
