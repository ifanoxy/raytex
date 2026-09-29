// Matrices and tables as grids of cells: read from LaTeX and written back.
// Used by the grid editor (GridEditor.svelte) and by the chip shown after
// `\begin{pmatrix}` or `\begin{tabular}{…}` in the editor.
//
// No local imports: tested directly by Node (`npm test`).

export type GridKind = "matrix" | "table";
/** Rules of a table: booktabs (`\toprule`…), every line and column, or none. */
export type TableStyle = "booktabs" | "lines" | "plain";

/** Matrix environments of amsmath (a star, from mathtools, is accepted). */
export const MATRIX_ENVS = ["pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "matrix", "smallmatrix"];
/** Table environments (column specification in braces). */
export const TABLE_ENVS = ["tabular", "array"];

export interface Grid {
  kind: GridKind;
  /** `pmatrix`, `bmatrix`…, `tabular` or `array`. */
  env: string;
  /** Rows of cells, all of the same length. */
  cells: string[][];
  /** Tables: type of each column (`l`, `c`, `r`, `p{3cm}`…). */
  columns: string[];
  style: TableStyle;
  /** Tables: a rule under the first row. */
  header: boolean;
  /** Optional argument kept as is (`[t]` of tabular, `[r]` of `pmatrix*`). */
  option: string;
  /**
   * Column specification that cannot be rebuilt from `columns` (`@{}`,
   * `>{…}`, siunitx's `S`…): kept while the number of columns stays `rawCount`.
   */
  rawSpec: string | null;
  rawCount: number;
}

export interface EnvHead {
  name: string;
  kind: GridKind;
  /** Offset of `\begin`. */
  from: number;
  /** Offset after `\begin{name}[option]{spec}`. */
  argsEnd: number;
  option: string;
  spec: string | null;
}

export interface EnvRange {
  head: EnvHead;
  /** Offset after `\end{name}`. */
  to: number;
  bodyFrom: number;
  bodyTo: number;
}

function skipSpaces(text: string, i: number): number {
  while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
  return i;
}

/** End (exclusive) of the `{…}` or `[…]` group opened at `i`, or -1. */
function groupEnd(text: string, i: number): number {
  const square = text[i] === "[";
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (ch === "\\") {
      j++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) return -1;
      if (!square && depth === 0) return j + 1;
    } else if (square && ch === "]" && depth === 0) return j + 1;
  }
  return -1;
}

/** Whether offset `i` is in a comment (`%` earlier on its line). */
export function commented(text: string, i: number): boolean {
  const start = text.lastIndexOf("\n", i - 1) + 1;
  for (let j = start; j < i; j++) {
    if (text[j] === "\\") j++;
    else if (text[j] === "%") return true;
  }
  return false;
}

function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      for (let j = 0; j < line.length; j++) {
        if (line[j] === "\\") j++;
        else if (line[j] === "%") return line.slice(0, j);
      }
      return line;
    })
    .join("\n");
}

/** Kind of an environment name, or null for other environments. */
export function gridKind(name: string): GridKind | null {
  if (MATRIX_ENVS.includes(name.replace(/\*$/, ""))) return "matrix";
  if (TABLE_ENVS.includes(name)) return "table";
  return null;
}

/** `\begin{name}[option]{spec}` of a matrix or table starting at `from`. */
export function envHead(text: string, from: number): EnvHead | null {
  const m = /^\\begin\s*\{([A-Za-z]+\*?)\}/.exec(text.slice(from, from + 60));
  if (!m) return null;
  const name = m[1];
  const kind = gridKind(name);
  if (!kind) return null;
  let end = from + m[0].length;
  let option = "";
  // Only tables and starred matrices take an option: `[` after `\begin{pmatrix}` is a cell.
  let j = skipSpaces(text, end);
  if (text[j] === "[" && (kind === "table" || name.endsWith("*"))) {
    const e = groupEnd(text, j);
    if (e < 0) return null;
    option = text.slice(j, e);
    end = e;
    j = skipSpaces(text, end);
  }
  let spec: string | null = null;
  if (kind === "table") {
    if (text[j] !== "{") return null;
    const e = groupEnd(text, j);
    if (e < 0) return null;
    spec = text.slice(j + 1, e - 1);
    end = e;
  }
  return { name, kind, from, argsEnd: end, option, spec };
}

/** The environment starting at `from`, up to its `\end{name}`. */
export function envRange(text: string, from: number): EnvRange | null {
  const head = envHead(text, from);
  if (!head) return null;
  const name = head.name.replace("*", "\\*");
  const re = new RegExp(`\\\\(begin|end)\\s*\\{${name}\\}`, "g");
  re.lastIndex = head.argsEnd;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (commented(text, m.index)) continue;
    depth += m[1] === "begin" ? 1 : -1;
    if (depth === 0) return { head, to: m.index + m[0].length, bodyFrom: head.argsEnd, bodyTo: m.index };
  }
  return null;
}

/** Offset of the `\begin` of the innermost matrix or table containing `pos`. */
export function gridAt(text: string, pos: number): number | null {
  const re = /\\begin\s*\{([A-Za-z]+\*?)\}/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index <= pos) {
    if (gridKind(m[1]) && !commented(text, m.index)) starts.push(m.index);
  }
  for (let i = starts.length - 1; i >= 0; i--) {
    const r = envRange(text, starts[i]);
    if (r && pos <= r.to) return starts[i];
  }
  return null;
}

/**
 * Splits at `\\` (rows) or `&` (cells) outside braces. A `\\` takes its
 * optional `[length]` along, like LaTeX.
 */
function splitTop(text: string, rows: boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  // Environments inside a cell (`cases`, a nested `tabular`) keep their `&` and `\\`.
  let envs = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      envs += envStep(text, i);
      if (rows && depth === 0 && envs === 0 && text[i + 1] === "\\") {
        parts.push(text.slice(start, i));
        let j = i + 2;
        const k = skipSpaces(text, j);
        if (text[k] === "[") {
          const e = groupEnd(text, k);
          if (e > 0) j = e;
        }
        start = j;
        i = j - 1;
        continue;
      }
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (!rows && ch === "&" && depth === 0 && envs === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** +1 at `\\begin{`, -1 at `\\end{`, 0 elsewhere (`i` is on a backslash). */
function envStep(text: string, i: number): number {
  if (text.startsWith("begin", i + 1) && /^\\begin\s*\{/.test(text.slice(i, i + 12))) return 1;
  if (text.startsWith("end", i + 1) && /^\\end\s*\{/.test(text.slice(i, i + 10))) return -1;
  return 0;
}

/**
 * A cell as shown in the grid: `\\&` becomes `&` (the character). The `&` of
 * an environment inside the cell stay as they are.
 */
export function cellText(latex: string): string {
  let out = "";
  let envs = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === "\\") {
      envs += envStep(latex, i);
      if (latex[i + 1] === "&" && envs === 0) out += "&";
      else out += latex.slice(i, i + 2);
      i++;
    } else out += ch;
  }
  return out;
}

/** A cell written in the code: an `&` typed in the grid is the character, `\\&`. */
export function cellLatex(text: string): string {
  let out = "";
  let envs = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      envs += envStep(text, i);
      out += text.slice(i, i + 2);
      i++;
    } else if (ch === "&" && envs === 0) out += "\\&";
    else out += ch;
  }
  return out;
}

const RULES = /\\(?:hline|toprule|midrule|bottomrule|addlinespace(?:\[[^\]]*\])?|cline\s*\{[^}]*\}|cmidrule(?:\([^)]*\))?\s*\{[^}]*\})/g;

/** Columns taken by a cell (`\multicolumn{2}…` takes two). */
function spanOf(cell: string): number {
  const m = /^\\multicolumn\s*\{\s*(\d+)\s*\}/.exec(cell);
  return m ? Math.max(1, Number(m[1])) : 1;
}

function rowSpan(row: string[]): number {
  return row.reduce((n, c) => n + spanOf(c), 0);
}

/** Column types of a specification; `simple` when it can be written back from them. */
export function parseSpec(spec: string): { columns: string[]; simple: boolean; lines: boolean } {
  const columns: string[] = [];
  let simple = true;
  let lines = false;
  let i = 0;
  while (i < spec.length) {
    const ch = spec[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "|") {
      lines = true;
      i++;
    } else if (ch === "l" || ch === "c" || ch === "r") {
      columns.push(ch);
      i++;
    } else if ((ch === "p" || ch === "m" || ch === "b") && spec[i + 1] === "{") {
      const e = groupEnd(spec, i + 1);
      if (e < 0) return { columns, simple: false, lines };
      columns.push(spec.slice(i, e));
      i = e;
    } else if (ch === "*" && spec[i + 1] === "{") {
      const e1 = groupEnd(spec, i + 1);
      const e2 = e1 > 0 && spec[e1] === "{" ? groupEnd(spec, e1) : -1;
      if (e2 < 0) return { columns, simple: false, lines };
      const n = Number(spec.slice(i + 2, e1 - 1).trim());
      const inner = parseSpec(spec.slice(e1 + 1, e2 - 1));
      if (!inner.simple || !(n > 0)) simple = false;
      lines ||= inner.lines;
      for (let k = 0; k < n && k < 100; k++) columns.push(...inner.columns);
      i = e2;
    } else if ((ch === "@" || ch === "!" || ch === ">" || ch === "<") && spec[i + 1] === "{") {
      simple = false;
      const e = groupEnd(spec, i + 1);
      i = e < 0 ? spec.length : e;
    } else {
      // A column type of a package (siunitx's S, tabularx's X…).
      simple = false;
      if (/[A-Za-z]/.test(ch)) columns.push(ch);
      i++;
    }
  }
  return { columns, simple, lines };
}

/** Reads the matrix or table whose `\begin` is at `from`. */
export function parseGrid(text: string, from = 0): Grid | null {
  const r = envRange(text, from);
  if (!r) return null;
  const { head } = r;
  const body = stripComments(text.slice(r.bodyFrom, r.bodyTo)).replace(/\\tabularnewline\b/g, "\\\\");
  const rawRows = splitTop(body, true);
  const header = rawRows.length > 1 && /^\\(midrule|hline|cmidrule)\b/.test(rawRows[1].trimStart());
  const rows = rawRows.map((row) => row.replace(RULES, ""));
  while (rows.length > 1 && !rows[rows.length - 1].trim()) rows.pop();
  const cells = rows.map((row) => splitTop(row, false).map((c) => cellText(c.trim().replace(/\s*\n\s*/g, " "))));
  const spec = head.spec !== null ? parseSpec(head.spec) : null;
  const width = Math.max(1, spec?.columns.length ?? 0, ...cells.map(rowSpan));
  const count = Math.max(width, ...cells.map((row) => row.length));
  for (const row of cells) while (row.length < count) row.push("");

  const booktabs = /\\(toprule|midrule|bottomrule)\b/.test(body);
  const style: TableStyle = booktabs ? "booktabs" : /\\hline\b/.test(body) || spec?.lines ? "lines" : "plain";
  const columns = Array.from({ length: count }, (_, i) => spec?.columns[i] ?? "c");
  return {
    kind: head.kind,
    env: head.name,
    cells,
    columns,
    style,
    header,
    option: head.option,
    rawSpec: spec && !spec.simple ? head.spec : null,
    rawCount: count,
  };
}

/** A new grid of `rows` × `cols` empty cells. */
export function newGrid(kind: GridKind, rows: number, cols: number): Grid {
  return {
    kind,
    env: kind === "matrix" ? "pmatrix" : "tabular",
    cells: Array.from({ length: Math.max(1, rows) }, () => Array.from({ length: Math.max(1, cols) }, () => "")),
    columns: Array.from({ length: Math.max(1, cols) }, (_, i) => (i === 0 ? "l" : "c")),
    style: "booktabs",
    header: true,
    option: "",
    rawSpec: null,
    rawCount: 0,
  };
}

/** The same grid with `rows` × `cols` cells (new cells are empty). */
export function resize(g: Grid, rows: number, cols: number): Grid {
  rows = Math.max(1, Math.min(100, rows));
  cols = Math.max(1, Math.min(40, cols));
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => g.cells[r]?.[c] ?? ""));
  const columns = Array.from({ length: cols }, (_, c) => g.columns[c] ?? "c");
  return { ...g, cells, columns };
}

/** Without the empty rows and columns at the end (at least one cell is kept). */
export function trimmed(g: Grid): Grid {
  let rows = g.cells.length;
  while (rows > 1 && g.cells[rows - 1].every((c) => !c.trim())) rows--;
  let cols = g.cells[0]?.length ?? 1;
  while (cols > 1 && g.cells.slice(0, rows).every((row) => !row[cols - 1]?.trim())) cols--;
  return resize(g, rows, cols);
}

/** Column specification written in `\begin{tabular}{…}`. */
export function specOf(g: Grid): string {
  const n = g.cells[0]?.length ?? 0;
  if (g.rawSpec !== null && n === g.rawCount) return g.rawSpec;
  const cols = Array.from({ length: n }, (_, i) => g.columns[i] ?? "c");
  return g.style === "lines" ? `|${cols.join("|")}|` : cols.join("");
}

/**
 * LaTeX of the grid. The first line is `\begin{…}` without indentation;
 * the next ones start with `indent`, the cells with one `unit` more.
 */
export function gridToLatex(g: Grid, indent = "", unit = "\t"): string {
  const width = g.cells[0]?.length ?? 1;
  // Cells covered by a `\multicolumn` are left out.
  const rows = g.cells.map((row) => {
    const out: string[] = [];
    let span = 0;
    for (const cell of row) {
      if (span >= width) break;
      out.push(cellLatex(cell.trim()));
      span += spanOf(cell.trim());
    }
    return out;
  });
  const widths: number[] = [];
  for (const row of rows) {
    if (row.length !== width) continue;
    row.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, c.length)));
  }
  const line = (row: string[]) =>
    row
      .map((c, i) => (row.length === width && i < row.length - 1 ? c.padEnd(widths[i] ?? 0) : c))
      .join(" & ")
      .trimEnd();
  const inner = indent + unit;
  const out = [`\\begin{${g.env}}${g.option}${g.kind === "table" ? `{${specOf(g)}}` : ""}`];
  if (g.kind === "matrix") {
    rows.forEach((row, i) => out.push(`${inner}${line(row)}${i < rows.length - 1 ? " \\\\" : ""}`));
  } else {
    const rule = (name: string) => out.push(`${inner}\\${name}`);
    if (g.style === "booktabs") rule("toprule");
    else if (g.style === "lines") rule("hline");
    rows.forEach((row, i) => {
      out.push(`${inner}${line(row)} \\\\`);
      if (g.style === "lines") rule("hline");
      else if (g.header && i === 0 && rows.length > 1) rule(g.style === "booktabs" ? "midrule" : "hline");
    });
    if (g.style === "booktabs") rule("bottomrule");
  }
  out.push(`${indent}\\end{${g.env}}`);
  return out.join("\n");
}

/**
 * Cells pasted from a spreadsheet (tabs and lines) or from LaTeX (`&` and
 * `\\`); null for ordinary text.
 */
export function pastedCells(text: string): string[][] | null {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (clean.includes("\t")) return clean.split("\n").map((l) => l.split("\t").map((c) => plainData(c.trim())));
  if (/&|\\\\/.test(clean)) {
    const rows = splitTop(clean.replace(RULES, ""), true);
    while (rows.length > 1 && !rows[rows.length - 1].trim()) rows.pop();
    return rows.map((r) => splitTop(r, false).map((c) => cellText(c.trim())));
  }
  if (clean.includes("\n")) return clean.split("\n").map((l) => [l.trim()]);
  return null;
}

/** A spreadsheet value: `%`, `#` and `_` written for LaTeX (`50 %` stays a percentage). */
function plainData(value: string): string {
  if (/[\\$]/.test(value)) return value;
  return value.replace(/[%#_]/g, (c) => `\\${c}`);
}
