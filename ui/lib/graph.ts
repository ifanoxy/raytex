// The graph studio: curves of functions of x, their tangents, points,
// lines and areas, on axes, written as a pgfplots picture. Everything the
// picture shows is worked out here (ranges, ticks, pieces of a curve
// around a pole), so that the preview drawn at once and the picture LaTeX
// draws are the same. Each line of the picture says in a comment what it
// is (`% f(x) = x^2 - 1`, `% A(1, f(1))`), which is how a picture written
// by the studio is read back and opened again.

import { derivative, evaluate, type Expr, formatNumber, isConstant, toLatex, toPgf, tryParse } from "./mathexpr.ts";

export type LineStyle = "solid" | "dashed" | "dotted";
export type Width = "thin" | "thick" | "very thick";
export type AxisLines = "middle" | "box" | "left";
export type Grid = "none" | "major" | "both";
export type Legend = "north east" | "north west" | "south east" | "south west" | "outer north east";
export type LabelPlace = "above right" | "above left" | "below right" | "below left" | "above" | "below" | "left" | "right";

/** A colour of xcolor, and what it looks like on screen. */
export interface Colour {
  tex: string;
  css: string;
}

/** Colours offered: those of xcolor, read the same by LaTeX and on screen. */
export const COLOURS: Colour[] = [
  { tex: "blue", css: "#0000ff" },
  { tex: "red", css: "#ff0000" },
  { tex: "green!50!black", css: "#008000" },
  { tex: "orange", css: "#ff8000" },
  { tex: "violet", css: "#800080" },
  { tex: "teal", css: "#008080" },
  { tex: "magenta", css: "#ff00ff" },
  { tex: "black", css: "#000000" },
  { tex: "gray", css: "#808080" },
];

/** What a colour looks like (one of xcolor's names, or a grey for others). */
export function cssOf(tex: string): string {
  return COLOURS.find((c) => c.tex === tex)?.css ?? (/^[a-z]+$/.test(tex) ? tex : "#555555");
}

export interface Curve {
  id: string;
  /** f, g, h… */
  name: string;
  /** As it was typed (`x^2 - 2x + 1`). */
  expr: string;
  colour: string;
  style: LineStyle;
  width: Width;
  /** Where it is drawn (empty: the whole axis). */
  from: string;
  to: string;
  label: "none" | "legend" | "curve";
  /** LaTeX of the label, in a formula (`\mathcal{C}_f`). */
  text: string;
}

export interface Tangent {
  id: string;
  /** The curve (its id). */
  of: string;
  /** The abscissa (`1`, `pi/2`). */
  at: string;
  colour: string;
  style: LineStyle;
  /** Length along x. */
  span: string;
  /** The point of contact is marked. */
  point: boolean;
  text: string;
}

export interface Point {
  id: string;
  /** A, B… */
  name: string;
  x: string;
  /** Its ordinate, or the curve it is on (its id) in `of`. */
  y: string;
  of: string | null;
  colour: string;
  /** Dashed lines down to the axes. */
  projections: boolean;
  place: LabelPlace;
}

export interface Line {
  id: string;
  /** `x = a` (vertical) or `y = b` (horizontal). */
  kind: "x" | "y";
  at: string;
  colour: string;
  style: LineStyle;
  text: string;
}

export interface Area {
  id: string;
  /** The curve over it, and the other curve, or none for the axis. */
  of: string;
  and: string | null;
  from: string;
  to: string;
  colour: string;
}

export interface Axes {
  xmin: string;
  xmax: string;
  /** Empty: worked out from the curves. */
  ymin: string;
  ymax: string;
  lines: AxisLines;
  grid: Grid;
  xlabel: string;
  ylabel: string;
  /** Same unit on both axes. */
  equal: boolean;
  /** cm. */
  width: number;
  height: number;
  /** Between two ticks (empty: worked out). */
  xstep: string;
  ystep: string;
  legend: Legend;
}

export interface Graph {
  axes: Axes;
  curves: Curve[];
  tangents: Tangent[];
  points: Point[];
  lines: Line[];
  areas: Area[];
  /** Options of the axis the studio does not know, kept as they are. */
  options: string[];
  /** Lines of the picture the studio does not know, kept as they are. */
  extra: string[];
}

let counter = 0;
const id = () => `g${++counter}`;

const NAMES = ["f", "g", "h", "k", "p", "q", "r", "u", "v", "w"];
const POINTS = ["A", "B", "C", "D", "E", "F", "M", "N", "P", "Q"];

export function emptyGraph(): Graph {
  return {
    axes: { xmin: "-5", xmax: "5", ymin: "", ymax: "", lines: "middle", grid: "major", xlabel: "x", ylabel: "y", equal: false, width: 10, height: 7, xstep: "", ystep: "", legend: "north west" },
    curves: [],
    tangents: [],
    points: [],
    lines: [],
    areas: [],
    options: [],
    extra: [],
  };
}

/** A new curve, with the first name and colour not taken. */
export function newCurve(g: Graph, expr = ""): Curve {
  const name = NAMES.find((n) => !g.curves.some((c) => c.name === n)) ?? `f${g.curves.length + 1}`;
  return { id: id(), name, expr, colour: freeColour(g), style: "solid", width: "thick", from: "", to: "", label: "curve", text: `\\mathcal{C}_${name}` };
}

export function newTangent(_g: Graph, of: string): Tangent {
  return { id: id(), of, at: "1", colour: "red", style: "dashed", span: "", point: true, text: "" };
}

export function newPoint(g: Graph, of: string | null): Point {
  const name = POINTS.find((n) => !g.points.some((p) => p.name === n)) ?? `P_{${g.points.length + 1}}`;
  return { id: id(), name, x: "1", y: of ? "" : "1", of, colour: "black", projections: true, place: "above right" };
}

export function newLine(kind: "x" | "y"): Line {
  return { id: id(), kind, at: kind === "x" ? "1" : "1", colour: "gray", style: "dashed", text: "" };
}

export function newArea(of: string): Area {
  return { id: id(), of, and: null, from: "0", to: "1", colour: "blue" };
}

function freeColour(g: Graph): string {
  return (COLOURS.find((c) => !g.curves.some((k) => k.colour === c.tex)) ?? COLOURS[0]).tex;
}

// -------------------------------------------------------------- the numbers

/** A number written in a field (`2`, `-1,5`, `pi/2`); null when it is not one. */
export function numberOf(text: string): number | null {
  const e = tryParse(text);
  if (!e || !isConstant(e)) return null;
  const v = evaluate(e, 0);
  return Number.isFinite(v) ? v : null;
}

/** The expression of a curve (an `f(x) =` typed before it is left out), or null. */
export function exprOf(c: Curve): Expr | null {
  return tryParse(c.expr.replace(/^\s*[a-zA-Z]\s*\(\s*x\s*\)\s*=/, ""));
}

/** A step of 1, 2 or 5 times a power of ten, for about `ticks` ticks over `span`. */
export function niceStep(span: number, ticks = 8): number {
  if (!(span > 0)) return 1;
  const raw = span / ticks;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10;
  return nice * power;
}

/** The x range: the one written, or −5 to 5. */
export function xRange(g: Graph): [number, number] {
  const a = numberOf(g.axes.xmin);
  const b = numberOf(g.axes.xmax);
  if (a !== null && b !== null && a < b) return [a, b];
  if (a !== null && b === null) return [a, a + 10];
  if (a === null && b !== null) return [b - 10, b];
  return [-5, 5];
}

/** Where a curve is drawn: its own bounds, inside the axis. */
function curveRange(c: Curve, [xmin, xmax]: [number, number]): [number, number] {
  const a = numberOf(c.from);
  const b = numberOf(c.to);
  return [a !== null ? Math.max(xmin, a) : xmin, b !== null ? Math.min(xmax, b) : xmax];
}

const SAMPLES = 600;

/** Values of `e` at evenly spaced x over [a, b]. */
function sample(e: Expr, a: number, b: number, n = SAMPLES): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    out.push({ x, y: evaluate(e, x) });
  }
  return out;
}

/** Where `e` stops being defined, between a defined x and one that is not (bisection). */
function edge(e: Expr, inside: number, outside: number): number {
  let a = inside;
  let b = outside;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (Number.isFinite(evaluate(e, m))) a = m;
    else b = m;
  }
  // A round number when it is one (0, 1, -2…).
  const r = Math.round(a * 1e6) / 1e6;
  return Math.abs(r - a) < 1e-7 ? r : a;
}

/**
 * The pieces of x over which a curve is drawn: where it is defined, cut at
 * its poles (1/x is drawn left and right of 0, not across).
 */
export function pieces(e: Expr, a: number, b: number): [number, number][] {
  const points = sample(e, a, b);
  const finite = points.filter((p) => Number.isFinite(p.y)).map((p) => p.y);
  if (!finite.length) return [];
  const sorted = [...finite].sort((p, q) => p - q);
  const spread = Math.max(1e-9, sorted[Math.floor(sorted.length * 0.95)] - sorted[Math.floor(sorted.length * 0.05)]) || 1;
  // Near a pole the values grow without end: a piece stops where they
  // leave this bound (TeX cannot draw a point a thousand pages away).
  const limit = 1000 * spread + 1;
  const tame = (inside: number, at: number) => {
    if (Math.abs(evaluate(e, at)) <= limit) return at;
    let [a, b] = [inside, at];
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2;
      if (Math.abs(evaluate(e, m)) <= limit) a = m;
      else b = m;
    }
    return a;
  };
  const out: [number, number][] = [];
  let start: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const ok = Number.isFinite(p.y);
    if (ok && start === null) start = i === 0 ? p.x : tame(p.x, edge(e, p.x, points[i - 1].x));
    if (start !== null) {
      const next = points[i + 1];
      const nextOk = next && Number.isFinite(next.y);
      // A pole: the sign changes by a jump far larger than the curve.
      const pole = nextOk && Math.sign(p.y) !== Math.sign(next.y) && Math.min(Math.abs(p.y), Math.abs(next.y)) > 2 * spread;
      if (!next || !nextOk || pole) {
        const end = !next ? p.x : pole ? p.x : tame(p.x, edge(e, p.x, next.x));
        if (end - start > (b - a) * 1e-6) out.push([start, end]);
        start = null;
      }
    }
  }
  return out;
}

/** The y range: the one written, or one that holds the curves. */
export function yRange(g: Graph): [number, number] {
  const a = numberOf(g.axes.ymin);
  const b = numberOf(g.axes.ymax);
  if (a !== null && b !== null && a < b) return [a, b];
  const xs = xRange(g);
  const values: number[] = [];
  for (const c of g.curves) {
    const e = exprOf(c);
    if (!e) continue;
    const [lo, hi] = curveRange(c, xs);
    for (const [p, q] of pieces(e, lo, hi)) for (const s of sample(e, p, q, 200)) if (Number.isFinite(s.y)) values.push(s.y);
  }
  for (const p of g.points) {
    const y = pointY(g, p);
    if (y !== null) values.push(y);
  }
  for (const l of g.lines) {
    const v = numberOf(l.at);
    if (l.kind === "y" && v !== null) values.push(v);
  }
  let lo: number;
  let hi: number;
  if (!values.length) {
    [lo, hi] = [-5, 5];
  } else {
    // Steep curves near a pole do not stretch the axis: the values in the
    // middle 96 % are kept, and 0 when it is close.
    const sorted = [...values].sort((p, q) => p - q);
    lo = sorted[Math.floor((sorted.length - 1) * 0.02)];
    hi = sorted[Math.ceil((sorted.length - 1) * 0.98)];
    if (lo > 0 && lo < (hi - lo) * 0.5) lo = 0;
    if (hi < 0 && -hi < (hi - lo) * 0.5) hi = 0;
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const margin = (hi - lo) * 0.05;
    lo -= margin;
    hi += margin;
  }
  const step = niceStep(hi - lo);
  const round = (v: number, f: (n: number) => number) => Number(formatNumber(f(v / step) * step, 6));
  return [a ?? round(lo, Math.floor), b ?? round(hi, Math.ceil)];
}

/** Steps between ticks on x and y. */
export function steps(g: Graph): [number, number] {
  const [x0, x1] = xRange(g);
  const [y0, y1] = yRange(g);
  const sx = numberOf(g.axes.xstep);
  const sy = numberOf(g.axes.ystep);
  const auto = niceStep(Math.max(x1 - x0, y1 - y0));
  return [sx && sx > 0 ? sx : g.axes.equal ? auto : niceStep(x1 - x0), sy && sy > 0 ? sy : g.axes.equal ? auto : niceStep(y1 - y0)];
}

/** The ordinate of a point: written, or on its curve. */
export function pointY(g: Graph, p: Point): number | null {
  const x = numberOf(p.x);
  if (p.of) {
    const c = g.curves.find((k) => k.id === p.of);
    const e = c && exprOf(c);
    if (!e || x === null) return null;
    const y = evaluate(e, x);
    return Number.isFinite(y) ? y : null;
  }
  return numberOf(p.y);
}

/** The tangent as a line y = m x + c, and where it touches; null when there is none. */
export function tangentLine(g: Graph, t: Tangent): { m: number; c: number; x: number; y: number; from: number; to: number } | null {
  const curve = g.curves.find((k) => k.id === t.of);
  const e = curve && exprOf(curve);
  const x = numberOf(t.at);
  if (!e || x === null) return null;
  const y = evaluate(e, x);
  const m = evaluate(derivative(e), x);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  const [x0, x1] = xRange(g);
  const span = numberOf(t.span) ?? (x1 - x0) / 3;
  return { m, c: y - m * x, x, y, from: x - span / 2, to: x + span / 2 };
}

/** What is wrong with the graph, item by item (by id), for the fields to say so. */
export function problems(g: Graph): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of g.curves) {
    if (!c.expr.trim()) out.set(c.id, "empty");
    else if (!exprOf(c)) out.set(c.id, "unreadable");
    else {
      const [lo, hi] = curveRange(c, xRange(g));
      if (!pieces(exprOf(c)!, lo, hi).length) out.set(c.id, "undefined");
    }
  }
  for (const t of g.tangents) if (!tangentLine(g, t)) out.set(t.id, numberOf(t.at) === null ? "unreadable" : "undefined");
  for (const p of g.points) if (numberOf(p.x) === null || pointY(g, p) === null) out.set(p.id, "unreadable");
  for (const l of g.lines) if (numberOf(l.at) === null) out.set(l.id, "unreadable");
  for (const a of g.areas) if (numberOf(a.from) === null || numberOf(a.to) === null) out.set(a.id, "unreadable");
  return out;
}

// ------------------------------------------------------------- the picture

const n = (v: number) => formatNumber(v, 6);

function styleOf(style: LineStyle): string[] {
  return style === "dashed" ? ["dashed"] : style === "dotted" ? ["dotted"] : [];
}

/** Whether a curve uses angles (the axis then reads them in radians). */
function usesTrig(e: Expr): boolean {
  switch (e.kind) {
    case "call":
      return ["sin", "cos", "tan", "asin", "acos", "atan"].includes(e.fn) || usesTrig(e.arg);
    case "neg":
      return usesTrig(e.arg);
    case "op":
      return usesTrig(e.left) || usesTrig(e.right);
    default:
      return false;
  }
}

/** Packages and libraries the picture needs. */
export function needs(g: Graph): { packages: string[]; libraries: string[] } {
  return { packages: ["pgfplots"], libraries: g.areas.some((a) => a.and) ? ["fillbetween"] : [] };
}

/** The French way: a comma in numbers. */
export function writesFrench(source: string): boolean {
  return /\\usepackage\s*\[[^\]]*\bfrench\b[^\]]*\]\s*\{babel\}|\\set(?:default|main)language\s*(?:\[[^\]]*\])?\s*\{french\}|\\usepackage\s*\{french\}/.test(source);
}

/** The pgfplots picture of the graph. */
export function graphCode(g: Graph, comma = false): string {
  const [x0, x1] = xRange(g);
  const [y0, y1] = yRange(g);
  const [sx, sy] = steps(g);
  const curves = g.curves.map((c) => ({ c, e: exprOf(c) })).filter((k): k is { c: Curve; e: Expr } => !!k.e);
  const legend = curves.some(({ c }) => c.label === "legend" && c.text.trim());
  const options: string[] = [];
  if (g.axes.lines !== "box") options.push(`axis lines=${g.axes.lines}`);
  options.push(`xmin=${n(x0)}, xmax=${n(x1)}, ymin=${n(y0)}, ymax=${n(y1)}`);
  options.push(`xtick distance=${n(sx)}, ytick distance=${n(sy)}`);
  if (g.axes.grid === "major") options.push("grid=major");
  if (g.axes.grid === "both") options.push("grid=both, minor tick num=1");
  const labels = [g.axes.xlabel.trim() && `xlabel={$${g.axes.xlabel.trim()}$}`, g.axes.ylabel.trim() && `ylabel={$${g.axes.ylabel.trim()}$}`].filter(Boolean);
  if (labels.length) options.push(labels.join(", "));
  if (labels.length && g.axes.lines === "middle") {
    // At the ends of the axes, as in a textbook.
    options.push("xlabel style={at={(ticklabel* cs:1)}, anchor=west}, ylabel style={at={(ticklabel* cs:1)}, anchor=south}");
  }
  options.push(g.axes.equal ? `width=${n(g.axes.width)}cm, axis equal image` : `width=${n(g.axes.width)}cm, height=${n(g.axes.height)}cm`);
  if (curves.some(({ e }) => usesTrig(e))) options.push("trig format plots=rad");
  // Points far out of the axis (near a pole) are left out, not drawn.
  const span = y1 - y0;
  options.push(`samples=200, unbounded coords=jump, restrict y to domain=${n(y0 - 5 * span)}:${n(y1 + 5 * span)}`);
  if (legend) options.push(g.axes.legend === "outer north east" ? "legend pos=outer north east" : `legend pos=${g.axes.legend}`);
  if (comma) options.push("/pgf/number format/use comma");
  options.push(...g.options);

  const lines: string[] = [];
  const style = (colour: string, ls: LineStyle, extra: string[] = []) => [colour, ...styleOf(ls), ...extra].join(", ");
  for (const { c, e } of curves) {
    const [lo, hi] = curveRange(c, [x0, x1]);
    const parts = pieces(e, lo, hi);
    const pgf = toPgf(e);
    // In a picture with a legend, a curve without one takes no place in it.
    const own = c.label === "legend" && !!c.text.trim();
    // The name of the curve where it is in sight, towards its right end.
    const at = c.label === "curve" && c.text.trim() ? labelPlace(e, parts, [x0, x1], [y0, y1]) : null;
    parts.forEach(([p, q], i) => {
      const node = at && at.piece === i ? ` node[pos=${n(at.pos)}, above left] {$${c.text.trim()}$}` : "";
      const opts = style(c.colour, c.style, [c.width, `domain=${n(p)}:${n(q)}`, ...(i > 0 || (legend && !own) ? ["forget plot"] : [])]);
      lines.push(`\\addplot[${opts}] {${pgf}}${node}; % ${c.name}(x) = ${i === 0 ? c.expr.trim().replace(/^\s*[a-zA-Z]\s*\(\s*x\s*\)\s*=\s*/, "") : "…"}`);
      if (i === 0 && c.label === "legend" && c.text.trim()) lines.push(`\\addlegendentry{$${c.text.trim()}$}`);
    });
  }
  for (const t of g.tangents) {
    const line = tangentLine(g, t);
    const curve = g.curves.find((k) => k.id === t.of);
    if (!line || !curve) continue;
    const node = t.text.trim() ? ` node[pos=1, right] {$${t.text.trim()}$}` : "";
    const fx = `${curve.name}(${t.at.trim()})`;
    lines.push(`\\addplot[${style(t.colour, t.style, ["thick", `domain=${n(line.from)}:${n(line.to)}`, "forget plot"])}] {${linear(line.m, line.c)}}${node}; % y = ${curve.name}'(${t.at.trim()})(x - ${t.at.trim()}) + ${fx}`);
    if (t.point) lines.push(`\\fill[${t.colour}] (${n(line.x)},${n(line.y)}) circle[radius=1.6pt];`);
  }
  for (const l of g.lines) {
    const v = numberOf(l.at);
    if (v === null) continue;
    const ends = l.kind === "x" ? `(${n(v)},${n(y0)}) (${n(v)},${n(y1)})` : `(${n(x0)},${n(v)}) (${n(x1)},${n(v)})`;
    const node = l.text.trim() ? ` node[pos=1, ${l.kind === "x" ? "below right" : "above left"}] {$${l.text.trim()}$}` : "";
    lines.push(`\\addplot[${style(l.colour, l.style, ["forget plot"])}] coordinates {${ends}}${node}; % ${l.kind} = ${l.at.trim()}`);
  }
  g.areas.forEach((a, i) => {
    const f = curves.find(({ c }) => c.id === a.of);
    const other = a.and ? curves.find(({ c }) => c.id === a.and) : null;
    const lo = numberOf(a.from);
    const hi = numberOf(a.to);
    if (!f || lo === null || hi === null || (a.and && !other)) return;
    const domain = `domain=${n(Math.min(lo, hi))}:${n(Math.max(lo, hi))}`;
    const fill = `fill=${a.colour}, fill opacity=0.2`;
    if (other) {
      const [p, q] = [`RTXarea${i + 1}a`, `RTXarea${i + 1}b`];
      lines.push(`\\addplot[draw=none, name path=${p}, ${domain}, forget plot] {${toPgf(f.e)}};`);
      lines.push(`\\addplot[draw=none, name path=${q}, ${domain}, forget plot] {${toPgf(other.e)}};`);
      lines.push(`\\addplot[${fill}, forget plot] fill between[of=${p} and ${q}]; % ∫_${a.from.trim()}^${a.to.trim()} (${f.c.name}(x) - ${other.c.name}(x)) dx`);
    } else {
      lines.push(`\\addplot[${fill}, draw=none, ${domain}, forget plot] {${toPgf(f.e)}} \\closedcycle; % ∫_${a.from.trim()}^${a.to.trim()} ${f.c.name}(x) dx`);
    }
  });
  for (const p of g.points) {
    const x = numberOf(p.x);
    const y = pointY(g, p);
    if (x === null || y === null) continue;
    const curve = p.of ? g.curves.find((k) => k.id === p.of) : null;
    const yText = curve ? `${curve.name}(${p.x.trim()})` : p.y.trim();
    const name = p.name.trim();
    const node = name ? ` node[${p.place}] {$${name}$}` : "";
    lines.push(`\\addplot[only marks, mark=*, mark size=1.6pt, ${p.colour}, forget plot] coordinates {(${n(x)},${n(y)})}${node}; % ${name || "P"}(${p.x.trim()}, ${yText})`);
    if (p.projections) {
      // Down to the axes (to the edges when they are not in sight).
      const ax = g.axes.lines === "middle" && y0 <= 0 && 0 <= y1 ? 0 : y0;
      const ay = g.axes.lines === "middle" && x0 <= 0 && 0 <= x1 ? 0 : x0;
      lines.push(`\\draw[${p.colour}, densely dashed, thin] (${n(x)},${n(ax)}) |- (${n(ay)},${n(y)});`);
    }
  }
  lines.push(...g.extra);
  return `\\begin{tikzpicture}\n\\begin{axis}[\n  ${options.join(",\n  ")},\n]\n${lines.join("\n")}\n\\end{axis}\n\\end{tikzpicture}`;
}

/**
 * Where the name of a curve goes: the piece and the fraction of it (pgf
 * places a node at a fraction of a plot), the rightmost place well inside
 * the axis.
 */
function labelPlace(e: Expr, parts: [number, number][], [x0, x1]: [number, number], [y0, y1]: [number, number]): { piece: number; pos: number } | null {
  const margin = (y1 - y0) * 0.1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const [p, q] = parts[i];
    for (let k = 40; k >= 0; k--) {
      const x = p + ((q - p) * k) / 40;
      const y = evaluate(e, x);
      if (x <= x1 - (x1 - x0) * 0.08 && y > y0 + margin && y < y1 - margin) return { piece: i, pos: Math.max(0.05, Math.min(1, (x - p) / (q - p))) };
    }
  }
  return parts.length ? { piece: 0, pos: 0.5 } : null;
}

/** m x + c, for pgfplots. */
function linear(m: number, c: number): string {
  const slope = Math.abs(m) < 1e-12 ? "" : m === 1 ? "x" : m === -1 ? "-x" : `${n(m)}*x`;
  if (!slope) return n(c);
  if (Math.abs(c) < 1e-12) return slope;
  return `${slope} ${c < 0 ? "-" : "+"} ${n(Math.abs(c))}`;
}

/** The equation of a tangent, in LaTeX (`y = 2x - 1`). */
export function tangentLatex(g: Graph, t: Tangent, comma = false): string | null {
  const line = tangentLine(g, t);
  if (!line) return null;
  const e = tryParse(linear(Number(n(line.m)), Number(n(line.c))).replace(/\*/g, ""));
  return e ? `y = ${toLatex(e, comma)}` : null;
}

// ---------------------------------------------------------- reading it back

/** The groups of `[…]` and `{…}` of a text, from `i`: [start, end] of each one's content. */
function bracketed(text: string, i: number, open: string, close: string): [number, number] | null {
  if (text[i] !== open) return null;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (ch === "\\") {
      j++;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return ch === close ? [i + 1, j] : null;
    }
  }
  return null;
}

/** Options `a=b, c, d={e, f}` split at the commas outside braces. */
export function splitOptions(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

/** `$…$` taken off (and braces around it). */
function unmath(text: string): string {
  return text
    .trim()
    .replace(/^\{(.*)\}$/s, "$1")
    .trim()
    .replace(/^\$(.*)\$$/s, "$1")
    .trim();
}

/** Statements of the body of an axis, each with the comment of its last line. */
function statements(body: string): { code: string; comment: string }[] {
  const out: { code: string; comment: string }[] = [];
  let code = "";
  let depth = 0;
  for (const raw of body.split("\n")) {
    const at = commentAt(raw);
    const part = at < 0 ? raw : raw.slice(0, at);
    const comment = at < 0 ? "" : raw.slice(at + 1).trim();
    code += (code ? "\n" : "") + part;
    for (let i = 0; i < part.length; i++) {
      if (part[i] === "\\") i++;
      else if ("{[".includes(part[i])) depth++;
      else if ("}]".includes(part[i])) depth--;
    }
    const done = depth <= 0 && (/;\s*$/.test(part) || /^\s*\\addlegendentry\b/.test(code) || !code.trim());
    if (done) {
      if (code.trim()) out.push({ code: code.trim(), comment });
      code = "";
      depth = 0;
    }
  }
  if (code.trim()) out.push({ code: code.trim(), comment: "" });
  return out;
}

/** Where a comment starts in a line (an unescaped %), or -1. */
function commentAt(line: string): number {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "%") return i;
  }
  return -1;
}

/** The options of `\addplot[…]` or `\draw[…]`, and what follows them. */
function head(code: string): { options: string[]; rest: string } | null {
  const m = /^\\(?:addplot|draw|fill)\+?\s*/.exec(code);
  if (!m) return null;
  let i = m[0].length;
  if (code[i] !== "[") return { options: [], rest: code.slice(i) };
  const r = bracketed(code, i, "[", "]");
  if (!r) return null;
  i = r[1] + 1;
  return { options: splitOptions(code.slice(r[0], r[1])), rest: code.slice(i).trim() };
}

/** A colour of xcolor written as an option (`blue`, `green!50!black`). */
const COLOUR_WORD = /^(?:red|green|blue|cyan|magenta|yellow|black|gray|white|darkgray|lightgray|brown|lime|olive|orange|pink|purple|teal|violet)(?:![0-9]+(?:!(?:red|green|blue|cyan|magenta|yellow|black|gray|white|darkgray|lightgray|brown|lime|olive|orange|pink|purple|teal|violet))?)*$/;

const STYLE_WORDS = new Set(["solid", "dashed", "dotted", "densely dashed", "loosely dashed", "densely dotted", "loosely dotted"]);
const WIDTHS = new Set(["thin", "thick", "very thick", "ultra thick", "semithick", "very thin", "ultra thin"]);

/** Colour, style and width among options. */
function looks(options: string[]): { colour: string | null; style: LineStyle; width: Width; domain: [string, string] | null; rest: string[] } {
  let colour: string | null = null;
  let style: LineStyle = "solid";
  let width: Width = "thick";
  let domain: [string, string] | null = null;
  const rest: string[] = [];
  for (const o of options) {
    if (STYLE_WORDS.has(o)) style = o.includes("dash") ? "dashed" : o.includes("dot") ? "dotted" : "solid";
    else if (WIDTHS.has(o)) width = o === "thin" || o === "very thin" || o === "ultra thin" ? "thin" : o === "very thick" || o === "ultra thick" ? "very thick" : "thick";
    else if (/^domain\s*=/.test(o)) {
      const [a, b] = o.replace(/^domain\s*=\s*/, "").split(":");
      domain = [a?.trim() ?? "", b?.trim() ?? ""];
    } else if (/^color\s*=/.test(o)) colour = o.replace(/^color\s*=\s*/, "");
    else if (COLOUR_WORD.test(o) && colour === null) colour = o;
    else rest.push(o);
  }
  return { colour, style, width, domain, rest };
}

/** `node[…] {$…$}` after a plot: its text. */
function nodeText(rest: string): string {
  const m = /\bnode\s*(?:\[[^\]]*\])?\s*\{/.exec(rest);
  if (!m) return "";
  const r = bracketed(rest, m.index + m[0].length - 1, "{", "}");
  return r ? unmath(rest.slice(r[0], r[1])) : "";
}

function nodePlace(rest: string): LabelPlace {
  const m = /\bnode\s*\[([^\]]*)\]/.exec(rest);
  const place = m?.[1].trim();
  return place && ["above right", "above left", "below right", "below left", "above", "below", "left", "right"].includes(place) ? (place as LabelPlace) : "above right";
}

/**
 * The graph a picture holds, when it is an axis of pgfplots; null otherwise.
 * What the studio does not know is kept as it is (options and lines).
 */
export function readGraph(code: string): Graph | null {
  const begin = /\\begin\s*\{axis\}\s*/.exec(code);
  const end = code.lastIndexOf("\\end{axis}");
  if (!begin || end < begin.index || !/\\begin\s*\{tikzpicture\}/.test(code)) return null;
  // Something else in the picture, out of the axis: not one of ours.
  const before = code.slice(code.indexOf("\\begin{tikzpicture}") + "\\begin{tikzpicture}".length, begin.index).replace(/^\s*\[[^\]]*\]/, "");
  const after = code.slice(end + "\\end{axis}".length, code.lastIndexOf("\\end{tikzpicture}"));
  if (before.trim() || after.trim()) return null;
  const g = emptyGraph();
  g.axes.ymin = "";
  g.axes.ymax = "";
  g.axes.xlabel = "";
  g.axes.ylabel = "";
  g.axes.grid = "none";
  g.axes.lines = "box";
  let i = begin.index + begin[0].length;
  if (code[i] === "[") {
    const r = bracketed(code, i, "[", "]");
    if (!r) return null;
    readAxis(g, splitOptions(code.slice(r[0], r[1])));
    i = r[1] + 1;
  }
  const byName = new Map<string, Curve>();
  const domains = new Map<string, [number, number]>();
  let last: { kind: "tangent" | "point" | "curve"; item: Tangent | Point | Curve } | null = null;
  for (const { code: s, comment } of statements(code.slice(i, end))) {
    const h = head(s);
    let m: RegExpExecArray | null;
    if (/^\\addlegendentry\b/.test(s)) {
      const r = bracketed(s, s.indexOf("{"), "{", "}");
      const text = r ? unmath(s.slice(r[0], r[1])) : "";
      if (last?.kind === "curve" && text) {
        const c = last.item as Curve;
        c.label = "legend";
        c.text = text;
      }
      if (text || last?.kind !== "curve") last = null;
      continue;
    }
    if (h && /^\\addplot/.test(s) && (m = /^([a-zA-Z])\(x\) = (.*)$/.exec(comment))) {
      if (m[2] === "…") {
        // A piece after a pole: the curve goes on to its end.
        const c = byName.get(m[1]);
        const b = numberOf(looks(h.options).domain?.[1] ?? "");
        const read = c && domains.get(c.id);
        if (read && b !== null) read[1] = b;
        const text = nodeText(h.rest);
        if (c && text) {
          c.label = "curve";
          c.text = text;
        }
        continue;
      }
      const l = looks(h.options);
      const c: Curve = { ...newCurve(g, m[2]), name: m[1], colour: l.colour ?? "blue", style: l.style, width: l.width, label: "none", text: "" };
      const text = nodeText(h.rest);
      if (text) {
        c.label = "curve";
        c.text = text;
      }
      const [a, b] = l.domain ? [numberOf(l.domain[0]), numberOf(l.domain[1])] : [null, null];
      if (a !== null && b !== null) domains.set(c.id, [a, b]);
      g.curves.push(c);
      byName.set(c.name, c);
      last = { kind: "curve", item: c };
      continue;
    }
    if (h && /^\\addplot/.test(s) && (m = /^y = ([a-zA-Z])'\((.+?)\)\(x - .+?\) \+ \1\(.+\)$/.exec(comment))) {
      const curve = byName.get(m[1]);
      const domain = looks(h.options).domain;
      if (curve) {
        const l = looks(h.options);
        const t: Tangent = { ...newTangent(g, curve.id), at: m[2], colour: l.colour ?? "red", style: l.style, point: false, text: nodeText(h.rest) };
        const span = domain ? (numberOf(domain[1]) ?? 0) - (numberOf(domain[0]) ?? 0) : null;
        const [x0, x1] = xRange(g);
        if (span !== null && Math.abs(span - (x1 - x0) / 3) > 1e-6) t.span = n(span);
        g.tangents.push(t);
        last = { kind: "tangent", item: t };
        continue;
      }
    }
    if (h && /^\\fill/.test(s) && last?.kind === "tangent" && /circle/.test(h.rest)) {
      (last.item as Tangent).point = true;
      continue;
    }
    if (h && /^\\addplot/.test(s) && (m = /^([xy]) = (.+)$/.exec(comment))) {
      const l = looks(h.options);
      g.lines.push({ ...newLine(m[1] as "x" | "y"), at: m[2], colour: l.colour ?? "gray", style: l.style, text: nodeText(h.rest) });
      last = null;
      continue;
    }
    if (h && /^\\addplot/.test(s) && (m = /^∫_(.+?)\^(.+?) (?:\(([a-zA-Z])\(x\) - ([a-zA-Z])\(x\)\)|([a-zA-Z])\(x\)) dx$/.exec(comment))) {
      const of = byName.get(m[3] ?? m[5]);
      const and = m[4] ? byName.get(m[4]) : null;
      const fill = h.options.find((o) => /^fill\s*=/.test(o))?.replace(/^fill\s*=\s*/, "");
      if (of && (!m[4] || and)) {
        g.areas.push({ ...newArea(of.id), and: and?.id ?? null, from: m[1], to: m[2], colour: fill ?? "blue" });
        last = null;
        continue;
      }
    }
    if (h && /^\\addplot/.test(s) && h.options.some((o) => /^name path=RTXarea/.test(o))) continue;
    if (h && /^\\addplot/.test(s) && (m = /^(.*)\((.+), (.+)\)$/.exec(comment)) && h.options.includes("only marks")) {
      const l = looks(h.options);
      const on = /^([a-zA-Z])\((.+)\)$/.exec(m[3].trim());
      const curve = on ? byName.get(on[1]) : null;
      const p: Point = { ...newPoint(g, curve?.id ?? null), name: nodeText(h.rest) || (m[1] === "P" ? "" : m[1]), x: m[2], y: curve ? "" : m[3], colour: l.colour ?? "black", projections: false, place: nodePlace(h.rest) };
      g.points.push(p);
      last = { kind: "point", item: p };
      continue;
    }
    if (h && /^\\draw/.test(s) && last?.kind === "point" && /\|-/.test(h.rest)) {
      (last.item as Point).projections = true;
      continue;
    }
    // Not one of the studio's: kept as it is.
    g.extra.push(comment ? `${s} % ${comment}` : s);
    last = null;
  }
  settle(g, domains);
  return g;
}

function readAxis(g: Graph, options: string[]) {
  for (const o of options) {
    const [key, ...rest] = o.split("=");
    const k = key.trim();
    const v = rest.join("=").trim();
    switch (k) {
      case "axis lines":
        g.axes.lines = v === "middle" || v === "center" ? "middle" : v === "left" ? "left" : "box";
        break;
      case "xmin":
        g.axes.xmin = v;
        break;
      case "xmax":
        g.axes.xmax = v;
        break;
      case "ymin":
        g.axes.ymin = v;
        break;
      case "ymax":
        g.axes.ymax = v;
        break;
      case "xtick distance":
        g.axes.xstep = v;
        break;
      case "ytick distance":
        g.axes.ystep = v;
        break;
      case "grid":
        g.axes.grid = v === "major" ? "major" : v === "both" || v === "minor" ? "both" : "none";
        break;
      case "minor tick num":
        break;
      case "xlabel":
        g.axes.xlabel = unmath(v);
        break;
      case "ylabel":
        g.axes.ylabel = unmath(v);
        break;
      case "xlabel style":
      case "ylabel style":
        break;
      case "width":
        g.axes.width = Number.parseFloat(v) || 10;
        break;
      case "height":
        g.axes.height = Number.parseFloat(v) || 7;
        break;
      case "axis equal image":
      case "axis equal":
        g.axes.equal = true;
        break;
      case "trig format plots":
      case "samples":
      case "unbounded coords":
      case "restrict y to domain":
      case "/pgf/number format/use comma":
        break;
      case "legend pos":
        g.axes.legend = (["north east", "north west", "south east", "south west", "outer north east"].includes(v) ? v : "north west") as Legend;
        break;
      default:
        g.options.push(o);
    }
  }
}

/**
 * What was worked out when the picture was written is left to be worked
 * out again (the range of y, the steps, the bounds of a curve that are
 * those of its axis): it follows the curves when they change.
 */
function settle(g: Graph, domains: Map<string, [number, number]>) {
  for (const c of g.curves) {
    const read = domains.get(c.id);
    const e = exprOf(c);
    if (!read || !e) continue;
    const whole = pieces(e, ...xRange(g));
    const [lo, hi] = whole.length ? [whole[0][0], whole[whole.length - 1][1]] : xRange(g);
    if (Math.abs(read[0] - lo) > 1e-6) c.from = n(read[0]);
    if (Math.abs(read[1] - hi) > 1e-6) c.to = n(read[1]);
  }
  const auto = yRange({ ...g, axes: { ...g.axes, ymin: "", ymax: "" } });
  if (numberOf(g.axes.ymin) === auto[0] && numberOf(g.axes.ymax) === auto[1]) {
    g.axes.ymin = "";
    g.axes.ymax = "";
  }
  const [sx, sy] = steps({ ...g, axes: { ...g.axes, xstep: "", ystep: "" } });
  if (numberOf(g.axes.xstep) === sx) g.axes.xstep = "";
  if (numberOf(g.axes.ystep) === sy) g.axes.ystep = "";
}
