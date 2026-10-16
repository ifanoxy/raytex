// Tables of variations and of signs (the tkz-tab package): the values of
// x, a line of signs or of variations under them, written as tkz-tab
// draws them and read back from a picture of the document. A table can be
// filled from a function: its derivative, the zeros, the forbidden values
// and the limits are worked out, the values written exactly when they are
// simple (2, 1/3, π/2, √2), rounded otherwise.

import { derivative, evaluate, type Expr, formatNumber, tryParse } from "./mathexpr.ts";

/** At a value of x: nothing, a zero, a forbidden value (double bar), a bar. */
export type Mark = "" | "z" | "d" | "t";
/** Over an interval: a sign, nothing, or hatched (not defined). */
export type Sign = "" | "+" | "-" | "h";
/** A value of a line of variations: high, low, or none (the arrow goes on). */
export type Pos = "+" | "-" | "R";

export interface SignRow {
  id: string;
  kind: "sign";
  /** LaTeX, in a formula (`f'(x)`). */
  label: string;
  height: number;
  /** One per value of x. */
  marks: Mark[];
  /** One per interval. */
  signs: Sign[];
}

export interface VarCell {
  pos: Pos;
  /** LaTeX, in a formula. */
  value: string;
  /** A forbidden value: a double bar, a limit on each side. */
  forbidden: boolean;
  right: "+" | "-";
  rightValue: string;
}

export interface VarRow {
  id: string;
  kind: "var";
  label: string;
  height: number;
  /** One per value of x. */
  cells: VarCell[];
}

export type Row = SignRow | VarRow;

export interface Table {
  /** LaTeX of the variable (`x`). */
  variable: string;
  /** LaTeX of each value of x (`-\infty`, `0`, `+\infty`). */
  values: string[];
  rows: Row[];
  /** Width of the column of names, space between two values (tkz-tab's lgt and espcl). */
  lgt: number;
  espcl: number;
  /** Options of `\tkzTabInit` the studio does not know, kept. */
  options: string[];
  /** Lines of the picture the studio does not know, kept. */
  extra: string[];
}

let counter = 0;
const id = () => `t${++counter}`;

export const cell = (pos: Pos = "R", value = ""): VarCell => ({ pos, value, forbidden: false, right: "+", rightValue: "" });

export function signRow(n: number, label = "f'(x)"): SignRow {
  return { id: id(), kind: "sign", label, height: 1, marks: Array(n).fill(""), signs: Array(Math.max(0, n - 1)).fill("+") };
}

export function varRow(n: number, label = "f(x)"): VarRow {
  return { id: id(), kind: "var", label, height: 2, cells: Array.from({ length: n }, (_, i) => cell(i === 0 ? "-" : i === n - 1 ? "+" : "R")) };
}

export function emptyTable(): Table {
  const values = ["-\\infty", "+\\infty"];
  return { variable: "x", values, rows: [signRow(2), varRow(2)], lgt: 2, espcl: 2, options: [], extra: [] };
}

/** A value of x added after the one at `index` (its interval cut in two). */
export function addValue(t: Table, index: number, value = ""): Table {
  const at = index + 1;
  const values = [...t.values.slice(0, at), value, ...t.values.slice(at)];
  const rows = t.rows.map((r): Row => {
    if (r.kind === "sign") {
      const sign = r.signs[index] ?? "+";
      return { ...r, marks: [...r.marks.slice(0, at), "z", ...r.marks.slice(at)], signs: [...r.signs.slice(0, at), sign, ...r.signs.slice(at)] };
    }
    return { ...r, cells: [...r.cells.slice(0, at), cell(), ...r.cells.slice(at)] };
  });
  return { ...t, values, rows };
}

/** The value of x at `index` taken out (with its intervals made one). */
export function removeValue(t: Table, index: number): Table {
  if (t.values.length <= 2) return t;
  const values = t.values.filter((_, i) => i !== index);
  const rows = t.rows.map((r): Row => {
    if (r.kind === "sign") {
      const signs = [...r.signs];
      signs.splice(Math.min(index, signs.length - 1), 1);
      return { ...r, marks: r.marks.filter((_, i) => i !== index), signs };
    }
    return { ...r, cells: r.cells.filter((_, i) => i !== index) };
  });
  return { ...t, values, rows };
}

/** The direction of the arrow of an interval of a line of variations: up, down, or none. */
export function arrow(r: VarRow, interval: number): "up" | "down" | null {
  const from = r.cells[interval];
  const to = r.cells[interval + 1];
  if (!from || !to) return null;
  const start = from.forbidden ? (from.right === "+" ? "+" : "-") : from.pos;
  const end = to.pos;
  if (start === "R" || end === "R") return start === "-" || end === "+" ? "up" : start === "+" || end === "-" ? "down" : null;
  return start === end ? null : start === "-" ? "up" : "down";
}

// -------------------------------------------------------------- the picture

const math = (v: string) => (v.trim() ? `$${v.trim()}$` : "{}");

/** The tkz-tab picture of the table. */
export function tableCode(t: Table): string {
  const options = [...(t.lgt !== 2 ? [`lgt=${formatNumber(t.lgt, 2)}`] : []), ...(t.espcl !== 2 ? [`espcl=${formatNumber(t.espcl, 2)}`] : []), ...t.options];
  const names = [`${math(t.variable)} / 1`, ...t.rows.map((r) => `${math(r.label)} / ${formatNumber(r.height, 2)}`)].join(", ");
  const lines = [`\\tkzTabInit${options.length ? `[${options.join(", ")}]` : ""}{${names}}{${t.values.map(math).join(", ")}}`];
  for (const r of t.rows) {
    if (r.kind === "sign") {
      const items: string[] = [];
      r.marks.forEach((m, i) => {
        items.push(m);
        if (i < r.signs.length) items.push(r.signs[i]);
      });
      lines.push(`\\tkzTabLine{${items.join(", ")}}`);
    } else {
      const n = r.cells.length;
      const items = r.cells.map((c, i) => {
        if (!c.forbidden) return c.pos === "R" ? "R/" : `${c.pos}/ ${math(c.value)}`;
        if (i === 0) return `D${c.right}/ / ${math(c.rightValue)}`;
        const left = c.pos === "R" ? "+" : c.pos;
        if (i === n - 1) return `${left}D/ ${math(c.value)} /`;
        return `${left}D${c.right}/ ${math(c.value)} / ${math(c.rightValue)}`;
      });
      lines.push(`\\tkzTabVar{${items.join(", ")}}`);
    }
  }
  lines.push(...t.extra);
  return `\\begin{tikzpicture}\n${lines.join("\n")}\n\\end{tikzpicture}`;
}

// --------------------------------------------------------- reading it back

/** Items of a list split at the commas outside braces and formulas. */
function items(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inMath = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "$") inMath = !inMath;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "," && depth === 0 && !inMath) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

/** The content of the `{…}` starting at `i`, and the index after it. */
function group(text: string, i: number): [string, number] | null {
  while (/\s/.test(text[i] ?? "")) i++;
  if (text[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "\\") {
      j++;
      continue;
    }
    if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) return [text.slice(i + 1, j), j + 1];
  }
  return null;
}

/** `$…$` or `{…}` taken off. */
function unmath(text: string): string {
  return text
    .trim()
    .replace(/^\{(.*)\}$/s, "$1")
    .trim()
    .replace(/^\$(.*)\$$/s, "$1")
    .trim();
}

function readVar(item: string, last: boolean): VarCell {
  const [head, ...rest] = item.split("/");
  const h = head.trim();
  const values = rest.map(unmath);
  const m = /^([+-]?)D([+-]?)$/.exec(h);
  if (m) {
    const c = cell((m[1] || "+") as Pos, values[0] ?? "");
    c.forbidden = true;
    c.right = (m[2] || "+") as "+" | "-";
    // `D+/ / $v$`: the value on the right; `+D/ $v$ /`: on the left.
    c.rightValue = m[1] ? (values[1] ?? "") : (values[1] ?? values[0] ?? "");
    if (!m[1]) c.value = "";
    if (!m[2] && last) c.rightValue = "";
    return c;
  }
  if (h === "R") return cell("R");
  const pos: Pos = h.startsWith("-") ? "-" : h.startsWith("+") ? "+" : "R";
  return cell(pos, values[0] ?? "");
}

/** The table a picture holds, when it is one of tkz-tab; null otherwise. */
export function readTable(code: string): Table | null {
  const init = /\\tkzTabInit\s*/.exec(code);
  if (!init) return null;
  let i = init.index + init[0].length;
  const options: string[] = [];
  let lgt = 2;
  let espcl = 2;
  if (code[i] === "[") {
    const close = code.indexOf("]", i);
    if (close < 0) return null;
    for (const o of items(code.slice(i + 1, close))) {
      const [k, v] = o.split("=").map((s) => s.trim());
      if (k === "lgt" && Number(v) > 0) lgt = Number(v);
      else if (k === "espcl" && Number(v) > 0) espcl = Number(v);
      else if (o) options.push(o);
    }
    i = close + 1;
  }
  const names = group(code, i);
  if (!names) return null;
  const values = group(code, names[1]);
  if (!values) return null;
  const heads = items(names[0]).map((h) => {
    const [label, height] = h.split("/");
    return { label: unmath(label ?? ""), height: Number(height) || 1 };
  });
  const xs = items(values[0]).map(unmath);
  const n = xs.length;
  const t: Table = { variable: heads[0]?.label ?? "x", values: xs, rows: [], lgt, espcl, options, extra: [] };
  let row = 1;
  // What follows the head: its lines, in order.
  const body = code.slice(values[1], code.lastIndexOf("\\end{tikzpicture}") >= 0 ? code.lastIndexOf("\\end{tikzpicture}") : code.length);
  const re = /\\(tkzTab[A-Za-z]+)\s*(\[[^\]]*\])?/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(body))) {
    const g = group(body, m.index + m[0].length);
    if (!g) break;
    // All its arguments (`\tkzTabVal{1}{2}{0.5}{$\alpha$}{$0$}`).
    for (let next = group(body, g[1]); next && m[1] !== "tkzTabLine" && m[1] !== "tkzTabVar"; next = group(body, g[1])) g[1] = next[1];
    const whole = body.slice(m.index, g[1]);
    const head = heads[row] ?? { label: "", height: m[1] === "tkzTabVar" ? 2 : 1 };
    if (m[1] === "tkzTabLine" && !m[2]) {
      const list = items(g[0]);
      const marks: Mark[] = [];
      const signs: Sign[] = [];
      list.forEach((it, k) => {
        if (k % 2 === 0) marks.push((["z", "d", "t"].includes(it) ? it : "") as Mark);
        else signs.push((["+", "-", "h"].includes(it) ? it : "") as Sign);
      });
      while (marks.length < n) marks.push("");
      while (signs.length < n - 1) signs.push("");
      t.rows.push({ id: id(), kind: "sign", label: head.label, height: head.height, marks: marks.slice(0, n), signs: signs.slice(0, n - 1) });
      row++;
    } else if (m[1] === "tkzTabVar" && !m[2]) {
      const list = items(g[0]);
      const cells = list.slice(0, n).map((it, k) => readVar(it, k === n - 1));
      while (cells.length < n) cells.push(cell());
      t.rows.push({ id: id(), kind: "var", label: head.label, height: head.height, cells });
      row++;
    } else {
      t.extra.push(whole.trim());
    }
    consumed = g[1];
    re.lastIndex = g[1];
  }
  // Other lines of the picture are kept.
  const rest = body
    .slice(consumed)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  t.extra.push(...rest);
  // Names announced without their line: lines of signs, empty.
  for (; row < heads.length; row++) t.rows.push({ ...signRow(n, heads[row].label), signs: Array(n - 1).fill("") });
  return t;
}

// ------------------------------------------------- filling from a function

/** A value written exactly when it is simple (`2`, `\frac{1}{3}`, `\frac{\pi}{2}`, `\sqrt{2}`), rounded otherwise. */
export function niceValue(v: number, comma = false): { text: string; exact: boolean } {
  if (v === Number.POSITIVE_INFINITY) return { text: "+\\infty", exact: true };
  if (v === Number.NEGATIVE_INFINITY) return { text: "-\\infty", exact: true };
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const close = (x: number) => Math.abs(a - x) < 1e-7 * Math.max(1, a);
  if (close(Math.round(a))) return { text: Math.round(a) === 0 ? "0" : `${sign}${Math.round(a)}`, exact: true };
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(a * q);
    if (close(p / q) && gcd(p, q) === 1) return { text: `${sign}\\frac{${p}}{${q}}`, exact: true };
  }
  for (let q = 1; q <= 12; q++) {
    const p = Math.round((a * q) / Math.PI);
    if (p > 0 && close((p * Math.PI) / q) && gcd(p, q) === 1) {
      const top = p === 1 ? "\\pi" : `${p}\\pi`;
      return { text: q === 1 ? `${sign}${top}` : `${sign}\\frac{${top}}{${q}}`, exact: true };
    }
  }
  const square = Math.round(a * a);
  if (square > 1 && square <= 200 && close(Math.sqrt(square)) && !Number.isInteger(Math.sqrt(square))) return { text: `${sign}\\sqrt{${square}}`, exact: true };
  if (close(Math.E)) return { text: `${sign}\\mathrm{e}`, exact: true };
  const rounded = formatNumber(v, 2);
  return { text: comma ? rounded.replace(".", "{,}") : rounded, exact: false };
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}

/** What was found of a function over an interval. */
export interface Study {
  table: Table;
  /** Some values are rounded. */
  rounded: boolean;
}

export type StudyProblem = "unreadable" | "undefined" | "tooMany" | "notOneInterval";

const BIG = 1e6;
const SAMPLES = 20000;
/** Over an infinite interval, what is looked at closely. */
const WINDOW = 50;

/**
 * The limit of f at x (from the left `-1`, the right `1`, or at an
 * infinity), from its values ever closer: they settle (a number), or keep
 * going one way without settling (an infinity, however slowly: ln x at 0).
 */
function limit(e: Expr, x: number, side: -1 | 1): number {
  const at = (k: number) => (Number.isFinite(x) ? x + side * Math.pow(10, -k) * Math.max(1, Math.abs(x)) : Math.sign(x) * Math.pow(10, k));
  const v: number[] = [];
  for (let k = 2; k <= 13; k++) v.push(evaluate(e, at(k)));
  const last = v[v.length - 1];
  if (last === Number.POSITIVE_INFINITY || last === Number.NEGATIVE_INFINITY) return last;
  if (v.slice(-4).some((y) => !Number.isFinite(y))) return Number.NaN;
  const d1 = v[v.length - 2] - v[v.length - 3];
  const d2 = last - v[v.length - 2];
  if (Math.abs(last) > BIG && Math.sign(d2) === Math.sign(last)) return last > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  // Settled: the steps shrink to nothing.
  if (Math.abs(d2) < 1e-6 * Math.max(1, Math.abs(last))) return round(last);
  // Steps that do not shrink, always the same way: no end.
  if (Math.sign(d1) === Math.sign(d2) && Math.abs(d2) >= 0.5 * Math.abs(d1)) return d2 > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return Number.NaN;
}

/** Rounding noise taken off (1e-12 → 0, 2.0000000001 → 2). */
function round(v: number): number {
  const r = Number(v.toPrecision(9));
  return Math.abs(r) < 1e-7 ? 0 : r;
}

/** Points where `g` is 0 over [lo, hi] (sign changes, and touches of 0). */
function zeros(g: Expr, lo: number, hi: number): number[] {
  const out: number[] = [];
  let px = lo;
  let py = evaluate(g, lo);
  for (let i = 1; i <= SAMPLES; i++) {
    const x = lo + ((hi - lo) * i) / SAMPLES;
    const y = evaluate(g, x);
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (y === 0) out.push(x);
      else if (Math.sign(y) !== Math.sign(py) && py !== 0) {
        let [a, b] = [px, x];
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2;
          const v = evaluate(g, m);
          if (Math.sign(v) === Math.sign(evaluate(g, a))) a = m;
          else b = m;
        }
        const z = (a + b) / 2;
        // A sign change of a small value: a zero (a jump of a pole is not one).
        if (Math.abs(evaluate(g, z)) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(y))) out.push(z);
      }
    }
    px = x;
    py = y;
  }
  return out;
}

/** Points where `e` is not defined or jumps to infinity over (lo, hi): its poles. */
function poles(e: Expr, lo: number, hi: number): number[] {
  const out: number[] = [];
  let py = evaluate(e, lo);
  let px = lo;
  for (let i = 1; i < SAMPLES; i++) {
    const x = lo + ((hi - lo) * i) / SAMPLES;
    const y = evaluate(e, x);
    if (!Number.isFinite(y)) {
      const after = evaluate(e, x + (hi - lo) / SAMPLES);
      if (Number.isFinite(py) && Number.isFinite(after)) out.push(x);
    } else if (Number.isFinite(py) && Math.sign(y) !== Math.sign(py) && Math.min(Math.abs(y), Math.abs(py)) > 100) {
      let [a, b] = [px, x];
      for (let k = 0; k < 80; k++) {
        const m = (a + b) / 2;
        if (Math.sign(evaluate(e, m)) === Math.sign(evaluate(e, a))) a = m;
        else b = m;
      }
      out.push((a + b) / 2);
    }
    px = x;
    py = y;
  }
  return out;
}

/** A value of x as it was found: a round number when it is one. */
function snap(v: number): number {
  const r = Number(niceValueNumber(v));
  return Number.isFinite(r) ? r : v;
}

function niceValueNumber(v: number): number {
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(v * q);
    if (Math.abs(v - p / q) < 1e-7) return p / q;
  }
  return v;
}

/**
 * The table of a function over [from, to] (`-\infty`, `+\infty` or numbers):
 * `variations` gives the signs of f′ and the variations of f, `signs` the
 * signs of f. A problem when it cannot be done.
 */
export function study(text: string, from: string, to: string, kind: "variations" | "signs", comma = false): Study | StudyProblem {
  const named = /^\s*([a-zA-Z])\s*\(\s*x\s*\)\s*=\s*/.exec(text);
  const name = named?.[1] ?? "f";
  const e = tryParse(named ? text.slice(named[0].length) : text);
  if (!e) return "unreadable";
  const bound = (s: string, fallback: number) => {
    const v = s.trim().replace(/\\infty|∞|inf(?:ini)?/i, "Infinity").replace(/^\+/, "");
    if (/^-?Infinity$/.test(v)) return v.startsWith("-") ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    const c = tryParse(s);
    const n = c ? evaluate(c, 0) : Number.NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  let a = bound(from, Number.NEGATIVE_INFINITY);
  let b = bound(to, Number.POSITIVE_INFINITY);
  if (!(a < b)) return "undefined";
  const lo = Number.isFinite(a) ? a : Math.min(-WINDOW, b - 2 * WINDOW);
  const hi = Number.isFinite(b) ? b : Math.max(WINDOW, a + 2 * WINDOW);

  // Where f is defined: one interval of [lo, hi], maybe with poles.
  const step = (hi - lo) / SAMPLES;
  const defined: boolean[] = [];
  for (let i = 0; i <= SAMPLES; i++) defined.push(Number.isFinite(evaluate(e, lo + step * i)));
  const first = defined.indexOf(true);
  const last = defined.lastIndexOf(true);
  if (first < 0) return "undefined";
  // A gap of more than a sample or two inside: two intervals (not a table of one).
  let gap = 0;
  for (let i = first; i <= last; i++) {
    gap = defined[i] ? 0 : gap + 1;
    if (gap > 3) return "notOneInterval";
  }
  const edge = (inside: number, outside: number) => {
    let [p, q] = [inside, outside];
    for (let k = 0; k < 80; k++) {
      const m = (p + q) / 2;
      if (Number.isFinite(evaluate(e, m))) p = m;
      else q = m;
    }
    return snap(round(q));
  };
  // The interval starts or ends where f stops being defined (ln x: at 0).
  let openStart = false;
  let openEnd = false;
  if (first > 0) {
    a = edge(lo + step * first, lo + step * (first - 1));
    openStart = true;
  }
  if (last < SAMPLES) {
    b = edge(lo + step * last, lo + step * (last + 1));
    openEnd = true;
  }
  const lo2 = Number.isFinite(a) ? a : lo;
  const hi2 = Number.isFinite(b) ? b : hi;
  const g = kind === "variations" ? derivative(e) : e;
  const forbidden = poles(e, lo2, hi2)
    .map((x) => snap(round(x)))
    .filter((x) => x > lo2 && x < hi2);
  const inner = zeros(g, lo2 + 1e-9, hi2 - 1e-9).map((x) => snap(round(x)));
  const events = [...new Set([...forbidden, ...inner.filter((z) => !forbidden.some((p) => Math.abs(p - z) < 1e-6))])]
    .filter((x) => x > lo2 + 1e-9 && x < hi2 - 1e-9)
    .sort((p, q) => p - q)
    .filter((x, i, all) => i === 0 || x - all[i - 1] > 1e-6);
  if (events.length > 8) return "tooMany";
  const xs = [a, ...events, b];
  const n = xs.length;
  const isPole = (x: number) => forbidden.some((p) => Math.abs(p - x) < 1e-6);
  let rounded = false;
  const show = (v: number) => {
    const nv = niceValue(v, comma);
    if (!nv.exact) rounded = true;
    return nv.text;
  };
  // The sign of g over each interval, at a point inside it.
  const inside = (i: number) => {
    const p = Number.isFinite(xs[i]) ? xs[i] : xs[i + 1] - Math.max(1, Math.abs(xs[i + 1]));
    const q = Number.isFinite(xs[i + 1]) ? xs[i + 1] : xs[i] + Math.max(1, Math.abs(xs[i]));
    return (p + q) / 2;
  };
  const signs: Sign[] = [];
  for (let i = 0; i < n - 1; i++) {
    const v = evaluate(g, inside(i));
    signs.push(Number.isFinite(v) && v !== 0 ? (v > 0 ? "+" : "-") : "");
  }
  const marks: Mark[] = xs.map((x, i) => {
    if (i === 0) return openStart ? "d" : "";
    if (i === n - 1) return openEnd ? "d" : "";
    return isPole(x) ? "d" : "z";
  });
  const t: Table = { variable: "x", values: xs.map(show), rows: [], lgt: 2, espcl: 2, options: [], extra: [] };
  if (kind === "signs") {
    t.rows.push({ id: id(), kind: "sign", label: `${name}(x)`, height: 1, marks, signs });
    return { table: t, rounded };
  }
  // The signs of the derivative are those of the slopes: its line, then the variations.
  t.rows.push({ id: id(), kind: "sign", label: `${name}'(x)`, height: 1, marks, signs });
  const cells: VarCell[] = xs.map((x, i) => {
    const before = signs[i - 1];
    const after = signs[i];
    if (i === 0) {
      if (openStart) {
        const c = cell("+");
        c.forbidden = true;
        c.right = after === "+" ? "-" : "+";
        c.rightValue = show(limit(e, x, 1));
        return c;
      }
      return cell(after === "+" ? "-" : "+", show(Number.isFinite(x) ? limit(e, x, 1) : limit(e, x, 1)));
    }
    if (i === n - 1) {
      if (openEnd) {
        const c = cell(before === "+" ? "+" : "-", show(limit(e, x, -1)));
        c.forbidden = true;
        return c;
      }
      return cell(before === "+" ? "+" : "-", show(limit(e, x, -1)));
    }
    if (isPole(x)) {
      const c = cell(before === "+" ? "+" : "-", show(limit(e, x, -1)));
      c.forbidden = true;
      c.right = after === "+" ? "-" : "+";
      c.rightValue = show(limit(e, x, 1));
      return c;
    }
    if (before === after) return cell("R");
    return cell(before === "+" ? "+" : "-", show(round(evaluate(e, x))));
  });
  t.rows.push({ id: id(), kind: "var", label: `${name}(x)`, height: 2, cells });
  return { table: t, rounded };
}
