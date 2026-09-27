// Drawings of the TikZ whiteboard: shapes in centimetres, the TikZ code
// they produce, and the reading of that code back into shapes. Statements
// the whiteboard cannot draw are kept verbatim ("code" shapes), and so are
// the options it does not know: going from the code to the drawing and
// back never loses anything.
//
// No local imports: tested directly by Node (`npm test`).

export interface Point {
  x: number;
  y: number;
}

export type LineWidth = "ultra thin" | "very thin" | "thin" | "semithick" | "thick" | "very thick" | "ultra thick";
export type Dash = "dashed" | "dotted" | "densely dashed" | "loosely dashed" | "densely dotted" | "loosely dotted" | "dash dot";
export type Arrow = "->" | "<-" | "<->" | "-Stealth" | "Stealth-" | "Stealth-Stealth" | "|->" | "|<->|";
export type NodePosition = "" | "above" | "below" | "left" | "right" | "above left" | "above right" | "below left" | "below right";
export type NodeShape = "" | "rectangle" | "circle" | "ellipse";

export interface Style {
  /** Line colour (xcolor expression); null: the default (black). */
  stroke: string | null;
  /** No line at all (only the filling). */
  noStroke: boolean;
  fill: string | null;
  width: LineWidth | null;
  dash: Dash | null;
  arrow: Arrow | null;
  rounded: boolean;
  opacity: number | null;
  /** Options kept as they are (unknown to the whiteboard). */
  extra: string[];
}

interface Base {
  id: string;
}

export type Shape =
  | (Base & { kind: "path"; points: Point[]; closed: boolean; style: Style })
  | (Base & { kind: "rect"; from: Point; to: Point; style: Style })
  | (Base & { kind: "circle"; center: Point; r: number; style: Style })
  | (Base & { kind: "ellipse"; center: Point; rx: number; ry: number; style: Style })
  | (Base & {
      kind: "node";
      at: Point;
      text: string;
      style: Style;
      position: NodePosition;
      shape: NodeShape;
      /** Node drawn with a border (`draw`). */
      boxed: boolean;
      /** Text colour. */
      textColor: string | null;
      /** `\small`, `\large`… */
      font: string | null;
      name: string | null;
    })
  | (Base & { kind: "code"; code: string });

export interface Drawing {
  shapes: Shape[];
  /** Options of the picture (`[scale=2]`), kept as they are. */
  options: string;
}

let counter = 0;
/** A new shape identifier. */
export function newId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter.toString(36)}`;
}

export function emptyStyle(): Style {
  return { stroke: null, noStroke: false, fill: null, width: null, dash: null, arrow: null, rounded: false, opacity: null, extra: [] };
}

// ---------------------------------------------------------------- writing

/** `1.25` → `1.25`, `2.0` → `2`, `-0.30000001` → `-0.3`. */
export function num(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

const pt = (p: Point) => `(${num(p.x)},${num(p.y)})`;

/** The options of a shape, in TikZ order: colour, filling, width, dash, arrows, others. */
export function styleOptions(s: Style, kind: Shape["kind"]): string[] {
  const out: string[] = [];
  if (s.stroke && !s.noStroke) out.push(kind === "node" ? `draw=${s.stroke}` : s.stroke);
  if (s.fill) out.push(`fill=${s.fill}`);
  if (s.width) out.push(s.width);
  if (s.dash) out.push(s.dash);
  if (s.arrow && kind === "path") out.push(s.arrow);
  if (s.rounded) out.push("rounded corners");
  if (s.opacity !== null && s.opacity < 1) out.push(`opacity=${num(s.opacity)}`);
  out.push(...s.extra);
  return out;
}

function command(s: Style): string {
  return s.noStroke && s.fill ? "\\fill" : "\\draw";
}

function opts(list: string[]): string {
  return list.length ? `[${list.join(", ")}]` : "";
}

/** The TikZ statement of a shape. */
export function shapeCode(shape: Shape): string {
  switch (shape.kind) {
    case "code":
      return shape.code;
    case "path": {
      const style = styleOptions(shape.style, "path");
      const fillOnly = shape.style.noStroke && shape.style.fill;
      const list = fillOnly ? style.filter((o) => !o.startsWith("fill=")) : style;
      const head = fillOnly ? `\\fill[${[shape.style.fill, ...list].join(", ")}]` : `${command(shape.style)}${opts(list)}`;
      return `${head} ${shape.points.map(pt).join(" -- ")}${shape.closed ? " -- cycle" : ""};`;
    }
    case "rect":
    case "circle":
    case "ellipse": {
      const style = styleOptions(shape.style, shape.kind);
      const fillOnly = shape.style.noStroke && shape.style.fill;
      const list = fillOnly ? style.filter((o) => !o.startsWith("fill=")) : style;
      const head = fillOnly ? `\\fill[${[shape.style.fill, ...list].join(", ")}]` : `\\draw${opts(list)}`;
      const body =
        shape.kind === "rect"
          ? `${pt(shape.from)} rectangle ${pt(shape.to)}`
          : shape.kind === "circle"
            ? `${pt(shape.center)} circle (${num(shape.r)})`
            : `${pt(shape.center)} ellipse (${num(shape.rx)} and ${num(shape.ry)})`;
      return `${head} ${body};`;
    }
    case "node": {
      const list: string[] = [];
      if (shape.boxed) list.push(shape.style.stroke ? `draw=${shape.style.stroke}` : "draw");
      if (shape.shape) list.push(shape.shape);
      if (shape.style.fill) list.push(`fill=${shape.style.fill}`);
      if (shape.textColor) list.push(`text=${shape.textColor}`);
      if (shape.position) list.push(shape.position);
      if (shape.font) list.push(`font=${shape.font}`);
      if (shape.boxed && shape.style.width) list.push(shape.style.width);
      if (shape.boxed && shape.style.dash) list.push(shape.style.dash);
      if (shape.style.rounded) list.push("rounded corners");
      list.push(...shape.style.extra);
      return `\\node${opts(list)}${shape.name ? ` (${shape.name})` : ""} at ${pt(shape.at)} {${shape.text}};`;
    }
  }
}

/** The whole picture. */
export function drawingCode(d: Drawing): string {
  const lines = d.shapes.map((s) => shapeCode(s).split("\n").map((l) => `  ${l}`).join("\n"));
  return [`\\begin{tikzpicture}${d.options ? `[${d.options}]` : ""}`, ...lines, "\\end{tikzpicture}"].join("\n");
}

// ---------------------------------------------------------------- reading

const WIDTHS: LineWidth[] = ["ultra thin", "very thin", "thin", "semithick", "thick", "very thick", "ultra thick"];
const DASHES: Dash[] = ["dashed", "dotted", "densely dashed", "loosely dashed", "densely dotted", "loosely dotted", "dash dot"];
const ARROWS: Arrow[] = ["->", "<-", "<->", "-Stealth", "Stealth-", "Stealth-Stealth", "|->", "|<->|"];
const POSITIONS: NodePosition[] = ["above", "below", "left", "right", "above left", "above right", "below left", "below right"];
/** Keys that are not colours when written alone. */
const NOT_COLORS = new Set(["draw", "fill", "rounded corners", "sharp corners", "help lines", "circle", "rectangle", "ellipse", "smooth", "cycle", "transparent"]);

/** Splits `a, b={c,d}, e` at top-level commas. */
export function splitOptions(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const isColor = (o: string) => /^[A-Za-z][A-Za-z0-9]*(!\d+(\.\d+)?(![A-Za-z][A-Za-z0-9]*)?)*$/.test(o) && !NOT_COLORS.has(o) && !WIDTHS.includes(o as LineWidth) && !DASHES.includes(o as Dash);

/** Style of a path statement's options. */
export function parseStyle(options: string[], fillCommand = false): Style {
  const s = emptyStyle();
  for (const o of options) {
    const kv = /^([a-z ]+?)\s*=\s*(.+)$/.exec(o);
    if (WIDTHS.includes(o as LineWidth)) s.width = o as LineWidth;
    else if (DASHES.includes(o as Dash)) s.dash = o as Dash;
    else if (ARROWS.includes(o as Arrow)) s.arrow = o as Arrow;
    else if (o === "rounded corners") s.rounded = true;
    else if (kv && kv[1] === "fill") s.fill = kv[2].trim();
    else if (kv && kv[1] === "draw" && isColor(kv[2].trim())) s.stroke = kv[2].trim();
    else if (kv && kv[1] === "opacity" && Number.isFinite(Number(kv[2]))) s.opacity = Number(kv[2]);
    else if (o === "draw") continue;
    else if (isColor(o) && fillCommand && !s.fill) s.fill = o;
    else if (isColor(o) && !s.stroke) s.stroke = o;
    else s.extra.push(o);
  }
  if (fillCommand) s.noStroke = true;
  return s;
}

const NUM = String.raw`(-?\d*\.?\d+)(?:\s*cm)?`;
const COORD = String.raw`\(\s*${NUM}\s*,\s*${NUM}\s*\)`;
const coordRe = new RegExp(COORD, "g");

function coords(text: string): Point[] {
  return [...text.matchAll(coordRe)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

/** Statements of a picture body (split at top-level `;`), with comments removed. */
export function statements(body: string): string[] {
  const clean = body
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\") i++;
        else if (line[i] === "%") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "\\") {
      cur += ch + (clean[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    cur += ch;
    if (ch === ";" && depth === 0) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Leading `[options]` of a statement tail, and the rest. */
function leadingOptions(text: string): { options: string[]; rest: string } {
  const t = text.trimStart();
  if (!t.startsWith("[")) return { options: [], rest: t };
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "[" || t[i] === "{") depth++;
    else if (t[i] === "]" || t[i] === "}") depth--;
    if (depth === 0) return { options: splitOptions(t.slice(1, i)), rest: t.slice(i + 1).trim() };
  }
  return { options: [], rest: t };
}

/** A shape from one statement, or null when the whiteboard cannot draw it. */
export function parseStatement(statement: string): Shape | null {
  const st = statement.replace(/;\s*$/, "").trim();
  const cmd = /^\\(draw|fill|filldraw|path|node)\b/.exec(st);
  if (!cmd) return null;
  const { options, rest } = leadingOptions(st.slice(cmd[0].length));
  if (cmd[1] === "node") {
    const m = new RegExp(String.raw`^(?:\(([A-Za-z][\w-]*)\)\s*)?at\s*${COORD}\s*\{([\s\S]*)\}$`).exec(rest);
    if (!m) return null;
    const style = emptyStyle();
    let boxed = false;
    let shape: NodeShape = "";
    let position: NodePosition = "";
    let textColor: string | null = null;
    let font: string | null = null;
    for (const o of options) {
      const kv = /^([a-z ]+?)\s*=\s*(.+)$/.exec(o);
      if (o === "draw") boxed = true;
      else if (kv && kv[1] === "draw") {
        boxed = true;
        style.stroke = kv[2].trim();
      } else if (o === "circle" || o === "rectangle" || o === "ellipse") shape = o;
      else if (POSITIONS.includes(o as NodePosition)) position = o as NodePosition;
      else if (kv && kv[1] === "fill") style.fill = kv[2].trim();
      else if (kv && kv[1] === "text") textColor = kv[2].trim();
      else if (kv && kv[1] === "font") font = kv[2].trim();
      else if (WIDTHS.includes(o as LineWidth)) style.width = o as LineWidth;
      else if (DASHES.includes(o as Dash)) style.dash = o as Dash;
      else if (o === "rounded corners") style.rounded = true;
      else style.extra.push(o);
    }
    // Braces of the text must be balanced (the whole tail was captured).
    let depth = 0;
    for (const ch of m[4]) {
      if (ch === "{") depth++;
      else if (ch === "}" && --depth < 0) return null;
    }
    return { id: newId(), kind: "node", at: { x: Number(m[2]), y: Number(m[3]) }, text: m[4], style, boxed, shape, position, textColor, font, name: m[1] ?? null };
  }
  if (cmd[1] === "path") return null;
  const fillCommand = cmd[1] === "fill";
  const style = parseStyle(options, fillCommand);
  if (cmd[1] === "filldraw") {
    if (!style.fill && style.stroke) {
      style.fill = style.stroke;
      style.stroke = null;
    }
  }
  const c = COORD;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(String.raw`^${c}\s*rectangle\s*${c}$`).exec(rest))) {
    return { id: newId(), kind: "rect", from: { x: Number(m[1]), y: Number(m[2]) }, to: { x: Number(m[3]), y: Number(m[4]) }, style };
  }
  if ((m = new RegExp(String.raw`^${c}\s*circle\s*(?:\(\s*${NUM}\s*\)|\[\s*radius\s*=\s*${NUM}\s*\])$`).exec(rest))) {
    return { id: newId(), kind: "circle", center: { x: Number(m[1]), y: Number(m[2]) }, r: Number(m[3] ?? m[4]), style };
  }
  if ((m = new RegExp(String.raw`^${c}\s*ellipse\s*\(\s*${NUM}\s+and\s+${NUM}\s*\)$`).exec(rest))) {
    return { id: newId(), kind: "ellipse", center: { x: Number(m[1]), y: Number(m[2]) }, rx: Number(m[3]), ry: Number(m[4]), style };
  }
  if (new RegExp(String.raw`^${c}(\s*--\s*${c})+(\s*--\s*cycle)?$`).test(rest)) {
    const points = coords(rest);
    return { id: newId(), kind: "path", points, closed: /--\s*cycle$/.test(rest), style };
  }
  return null;
}

/**
 * A picture read back into shapes. Statements the whiteboard cannot draw
 * become "code" shapes (kept in place). Returns null when the text is not
 * a single `tikzpicture`.
 */
export function parseDrawing(code: string): Drawing | null {
  const m = /^\s*\\begin\{tikzpicture\}\s*(?:\[([^\]]*)\])?([\s\S]*?)\\end\{tikzpicture\}\s*$/.exec(code);
  if (!m) return null;
  const shapes: Shape[] = statements(m[2]).map((st) => parseStatement(st) ?? { id: newId(), kind: "code", code: st });
  return { shapes, options: (m[1] ?? "").trim() };
}

/** Shapes of the drawing that are kept as code (not drawn). */
export function codeShapes(d: Drawing): number {
  return d.shapes.filter((s) => s.kind === "code").length;
}

// ---------------------------------------------------------------- geometry

/** Rounds to the grid. */
export function snap(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v;
}

export function snapPoint(p: Point, step: number): Point {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}

/** Moves a shape by (dx, dy). */
export function moved(shape: Shape, dx: number, dy: number): Shape {
  const m = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  switch (shape.kind) {
    case "path":
      return { ...shape, points: shape.points.map(m) };
    case "rect":
      return { ...shape, from: m(shape.from), to: m(shape.to) };
    case "circle":
    case "ellipse":
      return { ...shape, center: m(shape.center) };
    case "node":
      return { ...shape, at: m(shape.at) };
    case "code":
      return shape;
  }
}

/** Bounding box of the drawn shapes (nodes as their anchor point). */
export function bounds(shapes: Shape[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const pts: Point[] = [];
  for (const s of shapes) {
    if (s.kind === "path") pts.push(...s.points);
    else if (s.kind === "rect") pts.push(s.from, s.to);
    else if (s.kind === "circle") pts.push({ x: s.center.x - s.r, y: s.center.y - s.r }, { x: s.center.x + s.r, y: s.center.y + s.r });
    else if (s.kind === "ellipse") pts.push({ x: s.center.x - s.rx, y: s.center.y - s.ry }, { x: s.center.x + s.rx, y: s.center.y + s.ry });
    else if (s.kind === "node") pts.push(s.at);
  }
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** Line widths in points (TikZ values). */
export const WIDTH_PT: Record<LineWidth, number> = {
  "ultra thin": 0.1,
  "very thin": 0.2,
  thin: 0.4,
  semithick: 0.6,
  thick: 0.8,
  "very thick": 1.2,
  "ultra thick": 1.6,
};

export { ARROWS, DASHES, POSITIONS, WIDTHS };
