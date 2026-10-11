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
/** How a link goes from one node to the other: straight, or bent to one side. */
export type Bend = "" | "left" | "right";

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
  | (Base & {
      kind: "path";
      points: Point[];
      closed: boolean;
      style: Style;
      /** A curve through the points (`plot[smooth]`) instead of straight lines. */
      smooth?: boolean;
    })
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
  /** A line from one named node to another: it follows them when they move. */
  | (Base & {
      kind: "link";
      /** Names of the nodes it joins. */
      from: string;
      to: string;
      style: Style;
      bend: Bend;
      /** A text on the line; empty for none. */
      label: string;
      labelPosition: NodePosition;
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
  if (s.arrow && (kind === "path" || kind === "link")) out.push(s.arrow);
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
      if (shape.smooth) return `${head} plot[smooth${shape.closed ? " cycle" : ""}] coordinates {${shape.points.map(pt).join(" ")}};`;
      return `${head} ${shape.points.map(pt).join(" -- ")}${shape.closed ? " -- cycle" : ""};`;
    }
    case "link": {
      const way = shape.bend ? `to[bend ${shape.bend}]` : "--";
      const label = shape.label.trim() ? ` node${opts(shape.labelPosition ? [shape.labelPosition] : [])} {${shape.label.trim()}}` : "";
      return `\\draw${opts(styleOptions(shape.style, "path"))} (${shape.from}) ${way}${label} (${shape.to});`;
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
  if (fillCommand) {
    s.noStroke = true;
    // `\\fill` without a colour fills in black.
    s.fill ??= "black";
  }
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
  // A curve through points; with a tension of its own it is kept as code.
  if ((m = new RegExp(String.raw`^plot\s*\[\s*smooth(\s+cycle)?\s*\]\s*coordinates\s*\{((?:\s*${c})+)\s*\}$`).exec(rest))) {
    const points = coords(m[2]);
    if (points.length >= 2) return { id: newId(), kind: "path", points, closed: !!m[1], style, smooth: true };
  }
  // A line between two named nodes.
  if (cmd[1] === "draw" && (m = new RegExp(String.raw`^\((${NAME})\)\s*(?:--|to\s*\[\s*bend (left|right)\s*\])\s*(?:node\s*(?:\[([^\]]*)\])?\s*\{([\s\S]*)\}\s*)?\((${NAME})\)$`).exec(rest))) {
    const position = (m[3] ?? "").trim();
    const label = m[4] ?? "";
    if ((!position || POSITIONS.includes(position as NodePosition)) && balancedBraces(label)) {
      return { id: newId(), kind: "link", from: m[1], to: m[5], style, bend: (m[2] ?? "") as Bend, label: label.trim(), labelPosition: position as NodePosition };
    }
  }
  return null;
}

/** The name of a node: a letter, then letters, digits, `_` and `-`. */
const NAME = String.raw`[A-Za-z][\w-]*`;

function balancedBraces(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

/** A link stands only between nodes that are there: one whose end is missing (a node the whiteboard does not draw) is kept as its code. */
export function settleLinks(shapes: Shape[]): Shape[] {
  const names = new Set(shapes.flatMap((s) => (s.kind === "node" && s.name ? [s.name] : [])));
  return shapes.map((s) => (s.kind === "link" && !(names.has(s.from) && names.has(s.to)) ? { id: s.id, kind: "code", code: shapeCode(s) } : s));
}

/**
 * A picture read back into shapes. Statements the whiteboard cannot draw
 * become "code" shapes (kept in place). Returns null when the text is not
 * a single `tikzpicture`.
 */
export function parseDrawing(code: string): Drawing | null {
  const m = /^\s*\\begin\{tikzpicture\}\s*(?:\[([^\]]*)\])?([\s\S]*?)\\end\{tikzpicture\}\s*$/.exec(code);
  if (!m) return null;
  const shapes: Shape[] = settleLinks(statements(m[2]).map((st) => parseStatement(st) ?? { id: newId(), kind: "code", code: st }));
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
    case "link":
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

/** The view of a whiteboard: pixels per centimetre, and where (0, 0) is on the screen. */
export interface BoardView {
  scale: number;
  ox: number;
  oy: number;
}

/** Room left around what a whiteboard frames, in pixels (its bar, the labels of the nodes). */
const FIT_MARGIN = 48;

/**
 * The view that shows `shapes` whole in the middle of a board of `width` ×
 * `height` pixels, as large as they fit (a small drawing is not blown up
 * past 120 px a centimetre). An empty drawing shows its first 8 × 5 cm.
 */
export function fitView(shapes: Shape[], width: number, height: number): BoardView {
  const box = bounds(shapes) ?? { minX: 0, minY: 0, maxX: 8, maxY: 5 };
  const room = (px: number) => Math.max(px - 2 * FIT_MARGIN, px / 2);
  const across = room(width) / Math.max(box.maxX - box.minX, 1e-6);
  const down = room(height) / Math.max(box.maxY - box.minY, 1e-6);
  const scale = Math.max(8, Math.min(120, across, down));
  return {
    scale,
    ox: width / 2 - ((box.minX + box.maxX) / 2) * scale,
    oy: height / 2 + ((box.minY + box.maxY) / 2) * scale,
  };
}

/** The box of one shape (a node as its point); null for what is kept as code. */
export function shapeBounds(shape: Shape): { minX: number; minY: number; maxX: number; maxY: number } | null {
  return bounds([shape]);
}

/**
 * Whether a shape is touched by the rectangle from `a` to `b` (a selection
 * drawn with the mouse): their boxes cross.
 */
export function touches(shape: Shape, a: Point, b: Point): boolean {
  const box = shapeBounds(shape);
  if (!box) return false;
  const [minX, maxX] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
  const [minY, maxY] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
  return box.minX <= maxX && box.maxX >= minX && box.minY <= maxY && box.maxY >= minY;
}

/** Copies of shapes, moved by (dx, dy), each with a new identifier. */
export function copies(shapes: Shape[], dx = 0, dy = 0): Shape[] {
  return shapes.map((s) => ({ ...moved(JSON.parse(JSON.stringify(s)) as Shape, dx, dy), id: newId() }));
}

/** A shape made `f` times larger around `origin` (a node keeps its text size). */
export function scaled(shape: Shape, origin: Point, f: number): Shape {
  const m = (p: Point) => ({ x: origin.x + (p.x - origin.x) * f, y: origin.y + (p.y - origin.y) * f });
  const k = Math.abs(f);
  switch (shape.kind) {
    case "path":
      return { ...shape, points: shape.points.map(m) };
    case "rect":
      return { ...shape, from: m(shape.from), to: m(shape.to) };
    case "circle":
      return { ...shape, center: m(shape.center), r: shape.r * k };
    case "ellipse":
      return { ...shape, center: m(shape.center), rx: shape.rx * k, ry: shape.ry * k };
    case "node":
      return { ...shape, at: m(shape.at) };
    case "link":
    case "code":
      return shape;
  }
}

/** Coordinates rounded to what TikZ code is written with. */
export function tidy(shape: Shape): Shape {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const p = (q: Point) => ({ x: r(q.x), y: r(q.y) });
  switch (shape.kind) {
    case "path":
      return { ...shape, points: shape.points.map(p) };
    case "rect":
      return { ...shape, from: p(shape.from), to: p(shape.to) };
    case "circle":
      return { ...shape, center: p(shape.center), r: r(shape.r) };
    case "ellipse":
      return { ...shape, center: p(shape.center), rx: r(shape.rx), ry: r(shape.ry) };
    case "node":
      return { ...shape, at: p(shape.at) };
    case "link":
    case "code":
      return shape;
  }
}

// ------------------------------------------------------------------- sets

/** Shapes kept under a name, to be drawn again in any picture. */
export interface ShapeSet {
  id: string;
  name: string;
  /** The TikZ statements of its shapes, the lower left corner of their box at (0, 0). */
  code: string;
}

/** The statements of shapes, one by line. */
export function shapesCode(shapes: Shape[]): string {
  return shapes.map(shapeCode).join("\n");
}

/** The shapes of statements; what the whiteboard cannot draw is kept as code. */
export function shapesFromCode(code: string): Shape[] {
  return settleLinks(statements(code).map((st) => parseStatement(st) ?? { id: newId(), kind: "code", code: st }));
}

/** The code of a set made of `shapes`: moved so that the lower left corner of their box is at (0, 0). */
export function setCode(shapes: Shape[]): string {
  const box = bounds(shapes);
  return shapesCode(box ? shapes.map((s) => tidy(moved(s, -box.minX, -box.minY))) : shapes);
}

/** The shapes of a set, new ones each time, the centre of their box at `at`. */
export function setShapes(set: Pick<ShapeSet, "code">, at: Point, step = 0): Shape[] {
  const shapes = shapesFromCode(set.code);
  const box = bounds(shapes);
  if (!box) return shapes;
  const dx = snap(at.x - (box.minX + box.maxX) / 2, step);
  const dy = snap(at.y - (box.minY + box.maxY) / 2, step);
  return shapes.map((s) => tidy(moved(s, dx, dy)));
}

/** A name for a new set that no other one has: `base`, `base 2`, `base 3`… */
export function freeSetName(base: string, sets: Pick<ShapeSet, "name">[]): string {
  const taken = new Set(sets.map((s) => s.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
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

// ------------------------------------------------------------------ curves

/**
 * How far the handles of a smooth curve reach, as a share of the distance
 * between the two neighbours of a point: what `plot[smooth]` uses (pgf
 * multiplies its tension, 0.5 unless told otherwise, by 0.2775). Checked
 * against the curve TikZ draws.
 */
const SMOOTH = 0.13875;

/** A piece of a curve: a cubic Bézier from the end of the piece before. */
export interface CurveTo {
  c1: Point;
  c2: Point;
  to: Point;
}

/**
 * The curve `plot[smooth]` draws through `points` (`smooth cycle` when
 * `closed`), from its first point: at each point the curve runs parallel to
 * the line between its neighbours; an open curve leaves its ends straight.
 */
export function smoothCurve(points: Point[], closed: boolean): CurveTo[] {
  const n = points.length;
  if (n < 2) return [];
  const at = (i: number) => points[((i % n) + n) % n];
  const handle = (i: number, sign: number): Point => {
    // The ends of an open curve have no neighbour on one side: no handle.
    if (!closed && (i === 0 || i === n - 1)) return points[i];
    const [before, after] = [at(i - 1), at(i + 1)];
    return { x: points[i].x + sign * SMOOTH * (after.x - before.x), y: points[i].y + sign * SMOOTH * (after.y - before.y) };
  };
  if (n === 2 && closed) return [{ c1: points[0], c2: points[1], to: points[1] }];
  const out: CurveTo[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) out.push({ c1: handle(i, 1), c2: handle((i + 1) % n, -1), to: at(i + 1) });
  return out;
}

// --------------------------------------------------------------- alignment

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A line showing that what is moved is aligned with another shape. */
export interface Guide {
  /** `x`: a vertical line at x = `at`; `y`: a horizontal one. */
  axis: "x" | "y";
  at: number;
  /** Where the line starts and ends, along the other axis. */
  from: number;
  to: number;
}

/**
 * What to add to the position of the box being moved for one of its sides
 * or its middle to line up with a side or the middle of another box, when
 * that is less than `tolerance` away, with the lines that show it.
 */
export function alignment(moving: Box, others: Box[], tolerance: number): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const along = (axis: "x" | "y"): number => {
    const [lo, hi, olo, ohi] = axis === "x" ? (["minX", "maxX", "minY", "maxY"] as const) : (["minY", "maxY", "minX", "maxX"] as const);
    const marks = (b: Box) => [b[lo], (b[lo] + b[hi]) / 2, b[hi]];
    let best: number | null = null;
    for (const o of others) {
      for (const mine of marks(moving)) {
        for (const theirs of marks(o)) {
          const d = theirs - mine;
          if (Math.abs(d) <= tolerance && (best === null || Math.abs(d) < Math.abs(best))) best = d;
        }
      }
    }
    if (best === null) return 0;
    const shift = best;
    const seen = new Set<number>();
    for (const o of others) {
      for (const mine of marks(moving)) {
        for (const theirs of marks(o)) {
          if (Math.abs(theirs - (mine + shift)) > 1e-6) continue;
          const key = Math.round(theirs * 1e4);
          const from = Math.min(moving[olo], o[olo]);
          const to = Math.max(moving[ohi], o[ohi]);
          const same = guides.find((g) => g.axis === axis && Math.round(g.at * 1e4) === key);
          if (same) {
            same.from = Math.min(same.from, from);
            same.to = Math.max(same.to, to);
          } else if (!seen.has(key)) {
            seen.add(key);
            guides.push({ axis, at: theirs, from, to });
          }
        }
      }
    }
    return shift;
  };
  const dx = along("x");
  const dy = along("y");
  // The lines go as far as the box once it is moved along the other axis too.
  for (const g of guides) {
    const shift = g.axis === "x" ? dy : dx;
    const [lo, hi] = g.axis === "x" ? [moving.minY + shift, moving.maxY + shift] : [moving.minX + shift, moving.maxX + shift];
    g.from = Math.min(g.from, lo);
    g.to = Math.max(g.to, hi);
  }
  return { dx, dy, guides };
}

// ------------------------------------------------------------------- links

/** The names the nodes of `shapes` have. */
export function nodeNames(shapes: Shape[]): string[] {
  return shapes.flatMap((s) => (s.kind === "node" && s.name ? [s.name] : []));
}

/** A name no node has: `n1`, `n2`… */
export function freeNodeName(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(`n${n}`)) return `n${n}`;
}

/**
 * The shapes with a link from the node `fromId` to the node `toId`: the
 * nodes are given a name when they have none, and the link is put at the
 * end. Null when they are not two different nodes.
 */
export function linked(shapes: Shape[], fromId: string, toId: string, style: Style): { shapes: Shape[]; link: Shape } | null {
  const a = shapes.find((s) => s.id === fromId);
  const b = shapes.find((s) => s.id === toId);
  if (a?.kind !== "node" || b?.kind !== "node" || a.id === b.id) return null;
  const names = new Set(nodeNames(shapes));
  const named = new Map<string, string>();
  for (const node of [a, b]) {
    const name = node.name ?? freeNodeName(names);
    names.add(name);
    named.set(node.id, name);
  }
  const link: Shape = { id: newId(), kind: "link", from: named.get(a.id)!, to: named.get(b.id)!, style, bend: "", label: "", labelPosition: "above" };
  return { shapes: [...shapes.map((s) => (s.kind === "node" && named.has(s.id) ? { ...s, name: named.get(s.id)! } : s)), link], link };
}

/** The shapes without the links that lost one of their nodes. */
export function withoutLooseLinks(shapes: Shape[]): Shape[] {
  const names = new Set(nodeNames(shapes));
  return shapes.filter((s) => s.kind !== "link" || (names.has(s.from) && names.has(s.to)));
}

/**
 * Shapes about to be added to `existing` (a copy, a set): their nodes get
 * names no other node has, their links follow, and a link whose nodes are
 * not all among them is left out.
 */
export function uniqueNames(existing: Shape[], added: Shape[]): Shape[] {
  const taken = new Set(nodeNames(existing));
  const renamed = new Map<string, string>();
  const out = added.map((s) => {
    if (s.kind !== "node" || !s.name) return s;
    // The first node of that name among those added keeps it when it is free.
    const name = taken.has(s.name) || renamed.has(s.name) ? freeNodeName(taken) : s.name;
    if (!renamed.has(s.name)) renamed.set(s.name, name);
    taken.add(name);
    return name === s.name ? s : { ...s, name };
  });
  return out.flatMap((s): Shape[] => {
    if (s.kind !== "link") return [s];
    const from = renamed.get(s.from);
    const to = renamed.get(s.to);
    return from && to ? [{ ...s, from, to }] : [];
  });
}

// --------------------------------------------------------- sets, as a file

/** The sets as a file to give to someone else, or to another computer. */
export function setsFile(sets: Pick<ShapeSet, "name" | "code">[]): string {
  return `${JSON.stringify({ raytex: "tikz-sets", version: 1, sets: sets.map(({ name, code }) => ({ name, code })) }, null, 2)}\n`;
}

/** The sets of a file written by [`setsFile`]; null when the text is not one. */
export function setsFromFile(text: string): Pick<ShapeSet, "name" | "code">[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const file = data as { raytex?: unknown; sets?: unknown };
  if (!file || file.raytex !== "tikz-sets" || !Array.isArray(file.sets)) return null;
  const out: Pick<ShapeSet, "name" | "code">[] = [];
  for (const set of file.sets as { name?: unknown; code?: unknown }[]) {
    if (typeof set?.name !== "string" || typeof set.code !== "string" || !set.name.trim() || !set.code.trim()) return null;
    out.push({ name: set.name.trim(), code: set.code });
  }
  return out;
}

/** The sets with those of a file added: one that is there already (the same shapes) is not added twice, and a name that is taken gets a number. */
export function mergeSets(existing: ShapeSet[], incoming: Pick<ShapeSet, "name" | "code">[]): { sets: ShapeSet[]; added: number } {
  const sets = [...existing];
  let added = 0;
  for (const set of incoming) {
    if (sets.some((s) => s.code.trim() === set.code.trim())) continue;
    sets.push({ id: newId(), name: freeSetName(set.name, sets), code: set.code });
    added++;
  }
  return { sets, added };
}
