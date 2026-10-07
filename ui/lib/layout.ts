// The layout of the pages of a document: its margins (the geometry
// package) and its page styles (fancyhdr), read from the preamble and
// written back to it. Pure functions: text in, text out. The editor
// applies the result as a single undoable change.

import { addPackages, loadedPackages, mask, preambleEnd } from "./preamble.ts";
import type { Diagnostic } from "./types";

// ----------------------------------------------------------------- lengths

export type Unit = "cm" | "mm" | "in" | "pt";
export const UNITS: Unit[] = ["cm", "mm", "in", "pt"];

/** TeX points in one of each unit. */
const POINTS: Record<string, number> = {
  pt: 1,
  mm: 72.27 / 25.4,
  cm: 72.27 / 2.54,
  in: 72.27,
  bp: 72.27 / 72,
  pc: 12,
  dd: 1238 / 1157,
  cc: (12 * 1238) / 1157,
  sp: 1 / 65536,
};
/** Decimals worth reading in each unit (a tenth of a millimetre). */
const DIGITS: Record<Unit, number> = { cm: 2, mm: 1, in: 3, pt: 1 };
const LENGTH = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(pt|mm|cm|in|bp|pc|dd|cc|sp)$/;
const NUMBER = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/** A plain length (`2.5cm`, `1in`) in TeX points; null for anything else (`0.1\paperwidth`). */
export function toPt(length: string): number | null {
  const m = LENGTH.exec(length.trim());
  return m ? Number(m[1].replace(",", ".")) * POINTS[m[2]] : null;
}

function round(value: number, digits: number): string {
  const s = value.toFixed(digits);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Points written in `unit`, rounded to what is worth reading (`2.5cm`). */
export function fromPt(pt: number, unit: Unit): string {
  return `${round(pt / POINTS[unit], DIGITS[unit])}${unit}`;
}

/**
 * What a field shows for a length: its number in `unit` (`1in` → `2.54`).
 * What is not a plain length is shown as it is written.
 */
export function shownLength(length: string, unit: Unit): string {
  const pt = toPt(length);
  return pt === null ? length : round(pt / POINTS[unit], DIGITS[unit]);
}

/**
 * What was typed in a field, as a length: a number takes the unit of the
 * field (`2,5` → `2.5cm`), a length keeps its own (`1in`), anything else
 * is kept as typed (`0.1\paperwidth`).
 */
export function typedLength(input: string, unit: Unit): string {
  const text = input.trim();
  if (NUMBER.test(text)) return `${round(Number(text.replace(",", ".")), 4)}${unit}`;
  const m = LENGTH.exec(text);
  return m ? `${round(Number(m[1].replace(",", ".")), 4)}${m[2]}` : text;
}

/** Whether a field holds something TeX can read as a length. */
export function validLength(value: string): boolean {
  const text = value.trim();
  return !text || toPt(text) !== null || /\\[A-Za-z]+/.test(text);
}

// ----------------------------------------------------------------- options

/** `a=1, b={x,y}, c` → `["a=1", "b={x,y}", "c"]` (the commas inside braces are kept). */
export function splitOptions(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function keyValue(option: string): [string, string | null] {
  const eq = option.indexOf("=");
  return eq < 0 ? [option.trim(), null] : [option.slice(0, eq).trim(), option.slice(eq + 1).trim()];
}

function unbraced(value: string): string {
  return value.startsWith("{") && value.endsWith("}") ? value.slice(1, -1).trim() : value;
}

const isTrue = (value: string | null) => value === null || value.toLowerCase() !== "false";

// ---------------------------------------------------------------- the class

export interface DocumentClass {
  name: string;
  options: string[];
  /** Paper named in the options (`a4paper`), or "". */
  paper: string;
  landscape: boolean;
  twoside: boolean;
}

const PAPER = /^(?:[abc][0-6]j?|ansi[a-e]|letter|legal|executive)paper$/;
/** Classes whose pages are two-sided unless `oneside` is said. */
const TWO_SIDED = ["book", "scrbook", "memoir", "amsbook"];

/** The class of the document and what its options say of the page. */
export function readClass(text: string): DocumentClass {
  const m = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(mask(text));
  const options = m ? splitOptions(m[1] ?? "") : [];
  const name = m ? m[2].trim() : "";
  let paper = "";
  for (const o of options) {
    const [key, value] = keyValue(o);
    if (PAPER.test(key)) paper = key;
    // KOMA-Script: `paper=a4`, `paper=landscape`.
    else if (key === "paper" && value && PAPER.test(`${value}paper`)) paper = `${value}paper`;
  }
  const twoside = options.includes("twoside") || (TWO_SIDED.includes(name) && !options.includes("oneside"));
  return { name, options, paper, landscape: options.includes("landscape") || options.includes("paper=landscape"), twoside };
}

// ----------------------------------------------------------------- margins

export interface Margins {
  /** `a4paper`, `letterpaper`…, `custom` with the two sizes below, or "" when nothing says it. */
  paper: string;
  paperWidth: string;
  paperHeight: string;
  landscape: boolean;
  twoside: boolean;
  /** Lengths as they are written (`2.5cm`), "" when geometry works them out. */
  top: string;
  bottom: string;
  /** The inner margin of a two-sided document. */
  left: string;
  /** The outer margin of a two-sided document. */
  right: string;
  bindingOffset: string;
  headHeight: string;
  headSep: string;
  footSkip: string;
  includeHead: boolean;
  includeFoot: boolean;
  marginParWidth: string;
  marginParSep: string;
  /** Options of geometry kept as they are written (`showframe`, `textwidth=15cm`). */
  other: string[];
  /**
   * geometry is there for `\newgeometry` alone: the page is the one of the
   * class as long as nothing else is said.
   */
  pass: boolean;
}

export const PAPERS = ["a4paper", "a5paper", "a3paper", "b5paper", "letterpaper", "legalpaper", "executivepaper"];

export function emptyMargins(cls: DocumentClass): Margins {
  return {
    paper: cls.paper,
    paperWidth: "",
    paperHeight: "",
    landscape: cls.landscape,
    twoside: cls.twoside,
    top: "",
    bottom: "",
    left: "",
    right: "",
    bindingOffset: "",
    headHeight: "",
    headSep: "",
    footSkip: "",
    includeHead: false,
    includeFoot: false,
    marginParWidth: "",
    marginParSep: "",
    other: [],
    pass: false,
  };
}

/** `2cm` → both; `{2cm,3cm}` → one each. */
function pair(value: string): [string, string] {
  const parts = splitOptions(unbraced(value));
  return parts.length >= 2 ? [parts[0], parts[1]] : [parts[0] ?? "", parts[0] ?? ""];
}

function applyOption(m: Margins, option: string) {
  const [key, raw] = keyValue(option);
  const value = raw === null ? "" : unbraced(raw);
  switch (key) {
    case "paper":
    case "papername":
      m.paper = value;
      return;
    case "paperwidth":
      m.paper = "custom";
      m.paperWidth = value;
      return;
    case "paperheight":
      m.paper = "custom";
      m.paperHeight = value;
      return;
    case "papersize":
      m.paper = "custom";
      [m.paperWidth, m.paperHeight] = pair(raw ?? "");
      return;
    case "landscape":
      m.landscape = isTrue(raw);
      return;
    case "portrait":
      m.landscape = !isTrue(raw);
      return;
    case "twoside":
      m.twoside = isTrue(raw);
      return;
    case "left":
    case "lmargin":
    case "inner":
      m.left = value;
      return;
    case "right":
    case "rmargin":
    case "outer":
      m.right = value;
      return;
    case "top":
    case "tmargin":
      m.top = value;
      return;
    case "bottom":
    case "bmargin":
      m.bottom = value;
      return;
    case "margin": {
      const [h, v] = pair(raw ?? "");
      m.left = m.right = h;
      m.top = m.bottom = v;
      return;
    }
    case "hmargin":
      [m.left, m.right] = pair(raw ?? "");
      return;
    case "vmargin":
      [m.top, m.bottom] = pair(raw ?? "");
      return;
    case "bindingoffset":
      m.bindingOffset = value;
      return;
    case "headheight":
    case "head":
      m.headHeight = value;
      return;
    case "headsep":
      m.headSep = value;
      return;
    case "footskip":
    case "foot":
      m.footSkip = value;
      return;
    case "includehead":
      m.includeHead = isTrue(raw);
      return;
    case "includefoot":
      m.includeFoot = isTrue(raw);
      return;
    case "includeheadfoot":
      m.includeHead = m.includeFoot = isTrue(raw);
      return;
    case "marginparwidth":
    case "marginpar":
      m.marginParWidth = value;
      return;
    case "marginparsep":
      m.marginParSep = value;
      return;
    case "pass":
      m.pass = isTrue(raw);
      return;
  }
  if (raw === null && PAPER.test(key)) {
    m.paper = key;
    return;
  }
  // Said again, an option replaces what it said before.
  m.other = [...m.other.filter((o) => keyValue(o)[0] !== key), option];
}

interface Statement {
  from: number;
  to: number;
  /** What is between the braces of its last argument. */
  body: string;
}

/**
 * Where a command that starts at `from` ends: after its `groups` arguments
 * in braces (a command name stands for one: `\setlength\headheight{…}`),
 * with the arguments in brackets between them. The arguments may be on the
 * next lines, not after a blank one.
 */
function commandEnd(code: string, from: number, command: string, groups: number): number {
  let i = from + command.length;
  let read = 0;
  while (read < groups) {
    let j = i;
    while (j < code.length && /\s/.test(code[j]) && !(code[j] === "\n" && /^[ \t]*\n/.test(code.slice(j + 1)))) j++;
    if (code[j] === "\\" && /[A-Za-z@]/.test(code[j + 1] ?? "")) {
      j++;
      while (j < code.length && /[A-Za-z@]/.test(code[j])) j++;
      i = j;
      read++;
      continue;
    }
    if (code[j] !== "{" && code[j] !== "[") break;
    const end = groupEnd(code, j);
    if (end < 0) break;
    if (code[j] === "{") read++;
    i = end + 1;
  }
  return i;
}

/** Every `\command{…}` of the preamble, comments left aside. */
function statements(text: string, command: string, groups = 1): Statement[] {
  const code = mask(text).slice(0, preambleEnd(text));
  const out: Statement[] = [];
  let from = 0;
  while ((from = code.indexOf(command, from)) >= 0) {
    const after = from + command.length;
    if (/[A-Za-z@]/.test(code[after] ?? "")) {
      from = after;
      continue;
    }
    const to = commandEnd(code, from, command, groups);
    out.push({ from, to, body: to > after && code[to - 1] === "}" ? group(code, matching(code, to - 1)) : "" });
    from = Math.max(to, after);
  }
  return out;
}

/** Offset of the `{` that the `}` at `close` closes. */
function matching(code: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (i > 0 && code[i - 1] === "\\") continue;
    if (code[i] === "}") depth++;
    else if (code[i] === "{" && --depth === 0) return i;
  }
  return close;
}

/** What is inside the group that opens at `open`. */
function group(code: string, open: number): string {
  const end = groupEnd(code, open);
  return end < 0 ? "" : code.slice(open + 1, end);
}

/** Offset of the `}` (or `]`) that closes the group opening at `open`, or -1. */
function groupEnd(code: string, open: number): number {
  const o = code[open];
  const c = o === "[" ? "]" : "}";
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "\\") i++;
    else if (code[i] === o) depth++;
    else if (code[i] === c && --depth === 0) return i;
  }
  return -1;
}

/** The margins the preamble sets: the options of geometry, then each `\geometry{…}`. */
export function readMargins(text: string): Margins {
  const m = emptyMargins(readClass(text));
  for (const p of loadedPackages(text)) {
    if (p.names.includes("geometry")) splitOptions(p.options).forEach((o) => applyOption(m, o));
  }
  for (const s of statements(text, "\\geometry")) splitOptions(s.body).forEach((o) => applyOption(m, o));
  return m;
}

/** Whether the preamble says anything of the margins. */
export function usesGeometry(text: string): boolean {
  return loadedPackages(text).some((p) => p.names.includes("geometry"));
}

function layoutOptions(m: Margins): string[] {
  const out: string[] = [];
  const add = (key: string, value: string) => {
    if (value.trim()) out.push(`${key}=${value.trim()}`);
  };
  const [left, right] = m.twoside ? ["inner", "outer"] : ["left", "right"];
  const all = [m.top, m.bottom, m.left, m.right].map((v) => v.trim());
  if (all[0] && all.every((v) => v === all[0])) add("margin", all[0]);
  else {
    add("top", m.top);
    add("bottom", m.bottom);
    add(left, m.left);
    add(right, m.right);
  }
  add("bindingoffset", m.bindingOffset);
  add("headheight", m.headHeight);
  add("headsep", m.headSep);
  add("footskip", m.footSkip);
  if (m.includeHead) out.push("includehead");
  if (m.includeFoot) out.push("includefoot");
  add("marginparwidth", m.marginParWidth);
  add("marginparsep", m.marginParSep);
  return out;
}

/** The options that give `m`, without what the class already says. */
export function geometryOptions(m: Margins, cls: DocumentClass): string[] {
  const out: string[] = [];
  if (m.paper === "custom") {
    if (m.paperWidth.trim()) out.push(`paperwidth=${m.paperWidth.trim()}`);
    if (m.paperHeight.trim()) out.push(`paperheight=${m.paperHeight.trim()}`);
  } else if (m.paper && m.paper !== cls.paper) out.push(m.paper);
  if (m.landscape !== cls.landscape) out.push(m.landscape ? "landscape" : "portrait");
  if (m.twoside !== cls.twoside) out.push(m.twoside ? "twoside" : "twoside=false");
  return [...out, ...layoutOptions(m), ...m.other];
}

function command(name: string, options: string[]): string {
  const line = `\\${name}{${options.join(", ")}}`;
  return line.length <= 96 ? line : `\\${name}{\n${options.map((o) => `  ${o},\n`).join("")}}`;
}

/** `\geometry{…}` for `m`, or "" when nothing is set. */
export function geometryCode(m: Margins, cls: DocumentClass): string {
  const options = geometryOptions(m, cls);
  return options.length ? command("geometry", options) : "";
}

/**
 * `\newgeometry{…}` for the pages that follow: the margins only (the paper
 * and its orientation hold for the whole document).
 */
export function newGeometryCode(m: Margins): string {
  const options = layoutOptions(m);
  return options.length ? command("newgeometry", options) : "";
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf("\n", offset - 1) + 1;
}

function lineEnd(text: string, offset: number): number {
  const nl = text.indexOf("\n", offset);
  return nl < 0 ? text.length : nl;
}

/** Removes `[from, to)`, and its line when nothing else is on it. */
function cut(text: string, from: number, to: number): string {
  const start = lineStart(text, from);
  const end = lineEnd(text, to);
  if (!text.slice(start, from).trim() && !text.slice(to, end).trim()) return text.slice(0, start) + text.slice(Math.min(end + 1, text.length));
  return text.slice(0, from) + text.slice(to);
}

/** Removes every `\command…` statement of the preamble. */
function cutStatements(text: string, name: string): string {
  for (const s of statements(text, name).reverse()) text = cut(text, s.from, s.to);
  return text;
}

/** Offset of the end of the line of the last package (where what uses them can go), or null. */
function afterPackages(text: string): number | null {
  const packages = loadedPackages(text);
  if (packages.length) return lineEnd(text, packages[packages.length - 1].to);
  const code = mask(text);
  const cls = code.indexOf("\\documentclass");
  if (cls < 0 || cls >= preambleEnd(text)) return null;
  return lineEnd(text, commandEnd(code, cls, "\\documentclass", 1));
}

/**
 * Sets the margins of the document: geometry is loaded without options and
 * one `\geometry{…}` after it says everything (what the preamble said in
 * several places is gathered there). With nothing to say, geometry goes.
 */
export function writeMargins(text: string, m: Margins): string {
  if (preambleEnd(text) >= text.length) return text;
  const code = geometryCode(m, readClass(text));
  text = cutStatements(text, "\\geometry");
  const pkg = loadedPackages(text).find((p) => p.names.includes("geometry"));
  if (pkg && pkg.names.length === 1) {
    // Pages of the document may still ask for margins of their own.
    if (!code && m.pass) return `${text.slice(0, pkg.from)}\\usepackage[pass]{geometry}${text.slice(pkg.to)}`;
    if (!code) return cut(text, pkg.from, pkg.to);
    text = `${text.slice(0, pkg.from)}\\usepackage{geometry}${text.slice(pkg.to)}`;
  } else if (!code) return text;
  else if (!pkg) text = addPackages(text, [{ name: "geometry" }]);
  const loaded = loadedPackages(text).find((p) => p.names.includes("geometry"));
  if (!loaded) return text;
  const at = lineEnd(text, loaded.to);
  return `${text.slice(0, at)}\n${code}${text.slice(at)}`;
}

/**
 * Loads geometry for `\newgeometry` in a document that leaves its margins
 * to the class: with `pass`, the page stays the one of the class.
 */
export function ensureGeometry(text: string): string {
  return usesGeometry(text) ? text : addPackages(text, [{ name: "geometry", options: "pass" }]);
}

/** Sets the height of the header alone (what fancyhdr asks for when its text is taller). */
export function setHeadHeight(text: string, height: string): string {
  if (usesGeometry(text)) return writeMargins(text, { ...readMargins(text), headHeight: height });
  const line = `\\setlength{\\headheight}{${height}}`;
  const old = statements(text, "\\setlength", 2).find((s) => /^\\setlength\s*\{?\\headheight/.test(mask(text).slice(s.from, s.to)));
  if (old) return text.slice(0, old.from) + line + text.slice(old.to);
  const at = afterPackages(text);
  return at === null ? text : `${text.slice(0, at)}\n${line}${text.slice(at)}`;
}

export interface MarginPreset {
  id: "normal" | "narrow" | "moderate" | "wide" | "binding";
  top: string;
  bottom: string;
  left: string;
  right: string;
}

export const MARGIN_PRESETS: MarginPreset[] = [
  { id: "normal", top: "2.5cm", bottom: "2.5cm", left: "2.5cm", right: "2.5cm" },
  { id: "narrow", top: "1.27cm", bottom: "1.27cm", left: "1.27cm", right: "1.27cm" },
  { id: "moderate", top: "2.54cm", bottom: "2.54cm", left: "1.91cm", right: "1.91cm" },
  { id: "wide", top: "2.54cm", bottom: "2.54cm", left: "5.08cm", right: "5.08cm" },
  { id: "binding", top: "2.5cm", bottom: "2.5cm", left: "3.5cm", right: "2cm" },
];

// ------------------------------------------------------- what TeX measures

/**
 * Written at the start of a preview: TeX prints the lengths of the page
 * as it really sets them, whatever sets them (the class, geometry, a
 * length of the preamble).
 */
export const MEASURE =
  "\\typeout{RTXMEASURE:\\the\\paperwidth:\\the\\paperheight:\\the\\textwidth:\\the\\textheight:\\the\\oddsidemargin:\\the\\evensidemargin:\\the\\topmargin:\\the\\headheight:\\the\\headsep:\\the\\footskip:\\the\\marginparwidth:\\the\\marginparsep:\\the\\hoffset:\\the\\voffset}";

/** The page as TeX sets it, in points. */
export interface Metrics {
  paperWidth: number;
  paperHeight: number;
  textWidth: number;
  textHeight: number;
  /** From the edge of the paper to the text, on an odd page. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Left margin of an even page (the outer one of a two-sided document). */
  evenLeft: number;
  headHeight: number;
  headSep: number;
  footSkip: number;
  marginParWidth: number;
  marginParSep: number;
}

export function metrics(values: number[] | null | undefined): Metrics | null {
  if (!values || values.length < 14 || values.some((v) => !Number.isFinite(v))) return null;
  const [paperWidth, paperHeight, textWidth, textHeight, odd, even, topMargin, headHeight, headSep, footSkip, marginParWidth, marginParSep, hoffset, voffset] = values;
  const inch = 72.27;
  const left = inch + hoffset + odd;
  const top = inch + voffset + topMargin + headHeight + headSep;
  return {
    paperWidth,
    paperHeight,
    textWidth,
    textHeight,
    left,
    right: paperWidth - left - textWidth,
    top,
    bottom: paperHeight - top - textHeight,
    evenLeft: inch + hoffset + even,
    headHeight,
    headSep,
    footSkip,
    marginParWidth,
    marginParSep,
  };
}

// ------------------------------------------------------------- page styles

export interface Slots {
  left: string;
  center: string;
  right: string;
}

export interface Watermark {
  /** The text across the page; "" with an image. */
  text: string;
  /** An image file in place of the text. */
  image: string;
  /** Degrees, counterclockwise. */
  angle: number;
  /** A text: times the size of the text of the document. An image: share of the width of the page. */
  size: number;
  /** A colour of xcolor (`black`, `red`…), for a text. */
  color: string;
  /** How much of the colour, 1 to 100. */
  strength: number;
}

export interface PageStyle {
  name: string;
  head: Slots;
  foot: Slots;
  /** On a two-sided document, left and right swap on the even pages. */
  mirror: boolean;
  /** Thickness of the rule under the header, above the footer (`0.4pt`; `0pt` for none). */
  headRule: string;
  footRule: string;
  watermark: Watermark | null;
  /** What the style holds that is not understood here, kept as it is. */
  extra: string[];
}

/** Names LaTeX and fancyhdr define: used, not edited here. */
export const BUILTIN_STYLES = ["plain", "empty", "headings", "fancy"];

export function emptyStyle(name: string): PageStyle {
  return {
    name,
    head: { left: "", center: "", right: "" },
    foot: { left: "", center: "\\thepage", right: "" },
    mirror: false,
    headRule: "0.4pt",
    footRule: "0pt",
    watermark: null,
    extra: [],
  };
}

export function textWatermark(text: string): Watermark {
  return { text, image: "", angle: 45, size: 7, color: "black", strength: 12 };
}

export function imageWatermark(image: string): Watermark {
  return { text: "", image, angle: 0, size: 0.6, color: "black", strength: 12 };
}

/** A name LaTeX accepts for a page style: letters only. */
export function validStyleName(name: string): boolean {
  return /^[A-Za-z]+$/.test(name);
}

function number(value: number, digits = 2): string {
  return round(Number.isFinite(value) ? value : 0, digits);
}

/** What draws the watermark on the page being made (it is written in the header, which every page of the style sets). */
export function watermarkCode(w: Watermark): string {
  const inner = w.image
    ? `\\includegraphics[width=${number(w.size)}\\paperwidth]{${w.image}}`
    : `\\scalebox{${number(w.size)}}{\\textcolor{${w.color}!${number(Math.min(100, Math.max(1, w.strength)), 0)}}{${w.text}}}`;
  return `\\AddToShipoutPictureBG*{\\AtPageCenter{\\makebox(0,0){\\rotatebox{${number(w.angle, 1)}}{${inner}}}}}`;
}

/** Reads a group after `prefix` at `at`: what is inside, and where it ends. */
function after(code: string, at: number, prefix: string): [string, number] | null {
  if (!code.startsWith(prefix, at)) return null;
  const open = at + prefix.length;
  if (code[open] !== "{") return null;
  const end = groupEnd(code, open);
  return end < 0 ? null : [code.slice(open + 1, end), end + 1];
}

/** The watermark `code` starts with (as `watermarkCode` writes it), and what follows it. */
export function readWatermark(code: string): [Watermark, string] | null {
  const whole = after(code, 0, "\\AddToShipoutPictureBG*");
  const centre = whole && after(whole[0], 0, "\\AtPageCenter");
  const box = centre && after(centre[0], 0, "\\makebox(0,0)");
  const angle = box && after(box[0], 0, "\\rotatebox");
  const turned = angle && box && after(box[0], angle[1], "");
  if (!whole || !angle || !turned) return null;
  const rest = code.slice(whole[1]);
  const image = /^\\includegraphics\[width=([\d.]+)\\paperwidth\]\{([^{}]*)\}$/.exec(turned[0]);
  if (image) return [{ ...imageWatermark(image[2]), angle: Number(angle[0]), size: Number(image[1]) }, rest];
  const scale = after(turned[0], 0, "\\scalebox");
  const scaled = scale && after(turned[0], scale[1], "");
  const color = scaled && after(scaled[0], 0, "\\textcolor");
  const text = color && scaled && after(scaled[0], color[1], "");
  const spec = color && /^([A-Za-z]+)!(\d+)$/.exec(color[0]);
  if (!scale || !text || !spec) return null;
  return [{ text: text[0], image: "", angle: Number(angle[0]), size: Number(scale[0]), color: spec[1], strength: Number(spec[2]) }, rest];
}

/** `\fancypagestyle{name}{…}` for `s`. */
export function styleCode(s: PageStyle): string {
  const where = s.mirror ? { left: "LO,RE", center: "C", right: "RO,LE" } : { left: "L", center: "C", right: "R" };
  const lines = ["\\fancyhf{}"];
  const centre = (s.watermark ? watermarkCode(s.watermark) : "") + s.head.center.trim();
  for (const [slot, content] of [
    ["left", s.head.left.trim()],
    ["center", centre],
    ["right", s.head.right.trim()],
  ] as const) {
    if (content) lines.push(`\\fancyhead[${where[slot]}]{${content}}`);
  }
  for (const slot of ["left", "center", "right"] as const) {
    if (s.foot[slot].trim()) lines.push(`\\fancyfoot[${where[slot]}]{${s.foot[slot].trim()}}`);
  }
  lines.push(`\\renewcommand{\\headrulewidth}{${s.headRule.trim() || "0pt"}}`);
  lines.push(`\\renewcommand{\\footrulewidth}{${s.footRule.trim() || "0pt"}}`);
  lines.push(...s.extra);
  return `\\fancypagestyle{${s.name}}{%\n${lines.map((l) => `  ${l}%\n`).join("")}}`;
}

/** The commands of a block of code, each with its arguments. */
function commands(code: string): string[] {
  const out: string[] = [];
  let i = 0;
  const space = () => {
    while (i < code.length && /\s/.test(code[i])) i++;
  };
  const word = () => {
    const from = i++;
    if (/[A-Za-z@]/.test(code[i] ?? "")) while (i < code.length && /[A-Za-z@]/.test(code[i])) i++;
    else i++;
    return code.slice(from, i);
  };
  for (;;) {
    space();
    if (i >= code.length) return out;
    const from = i;
    if (code[i] === "{") {
      // A group of its own is kept whole.
      const end = groupEnd(code, i);
      i = end < 0 ? code.length : end + 1;
      out.push(code.slice(from, i).trim());
      continue;
    }
    if (code[i] !== "\\") {
      // Something that is not a command: up to the next one.
      while (i < code.length && code[i] !== "\\" && code[i] !== "{") i++;
      out.push(code.slice(from, i).trim());
      continue;
    }
    const name = word();
    if (/^\\(?:renewcommand|newcommand|providecommand|def|gdef|let|setlength|addtolength)\*?$/.test(name)) {
      if (code[i] === "*") i++;
      const save = i;
      space();
      if (code[i] === "\\") {
        word();
        if (name === "\\let") {
          space();
          if (code[i] === "=") i++;
          space();
          if (code[i] === "\\") word();
        }
      } else i = save;
    }
    for (;;) {
      const save = i;
      space();
      if (code[i] === "*" && i === save) {
        i++;
        continue;
      }
      if (code[i] !== "{" && code[i] !== "[" && code[i] !== "(") {
        i = save;
        break;
      }
      if (code[i] === "(") {
        const close = code.indexOf(")", i);
        if (close < 0) {
          i = save;
          break;
        }
        i = close + 1;
        continue;
      }
      const end = groupEnd(code, i);
      if (end < 0) {
        i = code.length;
        break;
      }
      i = end + 1;
    }
    out.push(code.slice(from, i).trim());
  }
}

type Cells = Record<string, string>;
const PLACES = ["LO", "CO", "RO", "LE", "CE", "RE"];

/** `[LE,RO]` → the places it names (`L`, `C`, `R` with `O`dd or `E`ven), for the header or the footer. */
function places(spec: string | null, part: "H" | "F"): string[] {
  if (spec === null) return PLACES;
  const out: string[] = [];
  for (const token of spec.split(",")) {
    const t = token.trim().toUpperCase();
    if (!t) continue;
    const parts = [...t].filter((c) => c === "H" || c === "F");
    if (parts.length && !parts.includes(part)) continue;
    const sides = [...t].filter((c) => "LCR".includes(c));
    const pages = [...t].filter((c) => c === "E" || c === "O");
    for (const side of sides.length ? sides : ["L", "C", "R"]) {
      for (const page of pages.length ? pages : ["O", "E"]) out.push(side + page);
    }
  }
  return out;
}

/** The style a `\fancypagestyle{name}{body}` defines. */
export function parseStyle(name: string, body: string): PageStyle {
  // Rules that are not said are those of fancyhdr.
  const s = emptyStyle(name);
  s.foot.center = "";
  const head: Cells = {};
  const foot: Cells = {};
  for (const c of commands(mask(body))) {
    const fancy = /^\\fancy(head|foot|hf)\s*(?:\[([^\]]*)\])?\s*\{/.exec(c);
    if (fancy) {
      const content = c.slice(fancy[0].length, c.lastIndexOf("}")).trim();
      const spec = fancy[2] ?? null;
      if (fancy[1] !== "foot") for (const p of places(spec, "H")) head[p] = content;
      if (fancy[1] !== "head") for (const p of places(spec, "F")) foot[p] = content;
      continue;
    }
    const old = /^\\([lcr])(head|foot)\s*(?:\[[^\]]*\])?\s*\{/.exec(c);
    if (old) {
      const content = c.slice(old[0].length, c.lastIndexOf("}")).trim();
      const cells = old[2] === "head" ? head : foot;
      cells[`${old[1].toUpperCase()}O`] = cells[`${old[1].toUpperCase()}E`] = content;
      continue;
    }
    const rule = /^\\(?:renewcommand|def)\s*\{?\\(head|foot)rulewidth\}?\s*\{([^{}]*)\}$/.exec(c);
    if (rule) {
      if (rule[1] === "head") s.headRule = rule[2].trim();
      else s.footRule = rule[2].trim();
      continue;
    }
    if (c) s.extra.push(c);
  }
  const get = (cells: Cells, place: string) => cells[place] ?? "";
  const same = (cells: Cells) => ["L", "C", "R"].every((x) => get(cells, `${x}O`) === get(cells, `${x}E`));
  const swapped = (cells: Cells) => get(cells, "LO") === get(cells, "RE") && get(cells, "RO") === get(cells, "LE") && get(cells, "CO") === get(cells, "CE");
  s.mirror = !(same(head) && same(foot)) && swapped(head) && swapped(foot);
  s.head = { left: get(head, "LO"), center: get(head, "CO"), right: get(head, "RO") };
  s.foot = { left: get(foot, "LO"), center: get(foot, "CO"), right: get(foot, "RO") };
  if (!s.mirror) {
    // Even pages that are neither the same nor mirrored are kept as they are written.
    for (const [part, cells] of [
      ["head", head],
      ["foot", foot],
    ] as const) {
      for (const x of ["L", "C", "R"]) {
        if (get(cells, `${x}E`) !== get(cells, `${x}O`)) s.extra.push(`\\fancy${part}[${x}E]{${get(cells, `${x}E`)}}`);
      }
    }
  }
  const mark = readWatermark(s.head.center);
  if (mark) {
    s.watermark = mark[0];
    s.head.center = mark[1].trim();
  }
  return s;
}

interface StyleBlock extends Statement {
  name: string;
}

function styleBlocks(text: string): StyleBlock[] {
  const code = mask(text);
  return statements(text, "\\fancypagestyle", 2).flatMap((s) => {
    const m = /^\\fancypagestyle\s*\{([^{}]*)\}/.exec(code.slice(s.from, s.to));
    return m ? [{ ...s, name: m[1].trim() }] : [];
  });
}

/** The page styles the preamble defines with `\fancypagestyle`. */
export function readStyles(text: string): PageStyle[] {
  return styleBlocks(text).map((b) => parseStyle(b.name, text.slice(matching(mask(text), b.to - 1) + 1, b.to - 1)));
}

/** The packages the code of a style needs. */
export function stylePackages(s: PageStyle): string[] {
  const code = styleCode(s);
  const out = ["fancyhdr"];
  if (s.watermark) out.push("eso-pic");
  if (/\\(?:includegraphics|rotatebox|scalebox)\b/.test(code)) out.push("graphicx");
  if (/\\(?:textcolor|color)\b/.test(code)) out.push("xcolor");
  if (/\{LastPage\}/.test(code)) out.push("lastpage");
  return out;
}

function insertLine(text: string, at: number, line: string, blank = false): string {
  return `${text.slice(0, at)}\n${blank ? "\n" : ""}${line}${text.slice(at)}`;
}

/** Writes the definition of a style: in place of the one of the same name, else after the others. */
export function saveStyle(text: string, s: PageStyle): string {
  if (preambleEnd(text) >= text.length) return text;
  text = addPackages(text, stylePackages(s).map((name) => ({ name })));
  const code = styleCode(s);
  const blocks = styleBlocks(text);
  const old = blocks.find((b) => b.name === s.name);
  if (old) return text.slice(0, old.from) + code + text.slice(old.to);
  if (blocks.length) return insertLine(text, lineEnd(text, blocks[blocks.length - 1].to), code, true);
  const at = afterPackages(text);
  return at === null ? text : insertLine(text, at, code, true);
}

const OPENING = /\\makeatletter\s*\\let\\ps@plain\\ps@([A-Za-z]+)\s*\\makeatother/;
const RANGE =
  /\\AddToHook\{shipout\/after\}\{\\ifnum\\ReadonlyShipoutCounter>(-?\d+) \\ifnum\\ReadonlyShipoutCounter<(\d+) \\thispagestyle\{([A-Za-z]+)\}\\fi\\fi\}(?:\\AtBeginDocument\{\\thispagestyle\{[A-Za-z]+\}\})?(?:[ \t]*%[^\n]*)?/g;

export interface PageRange {
  /** Pages of the PDF, the first one being 1. */
  from: number;
  to: number;
  name: string;
}

/** Where the styles are used, as far as the preamble says. */
export interface StyleUse {
  /** `\pagestyle{…}` of the preamble: the style of the whole document. */
  document: string | null;
  /** The style given to the pages that open (title, chapters) in place of `plain`. */
  opening: string | null;
  ranges: PageRange[];
}

export function readUse(text: string): StyleUse {
  const code = mask(text).slice(0, preambleEnd(text));
  const whole = statements(text, "\\pagestyle");
  const opening = OPENING.exec(code);
  const ranges: PageRange[] = [];
  // The comment at the end of the line is not in the masked text.
  for (const m of text.slice(0, code.length).matchAll(RANGE)) {
    if (code.startsWith("\\AddToHook", m.index)) ranges.push({ from: Number(m[1]) + 2, to: Number(m[2]), name: m[3] });
  }
  return { document: whole.length ? whole[whole.length - 1].body.trim() : null, opening: opening ? opening[1] : null, ranges };
}

/** Where a line that uses the style `name` can go: after its definition, else after the packages. */
function afterStyle(text: string, name: string): number | null {
  const block = styleBlocks(text).find((b) => b.name === name);
  return block ? lineEnd(text, block.to) : afterPackages(text);
}

/** The style of the whole document: `\pagestyle{name}` in the preamble, or none with null. */
export function useStyle(text: string, name: string | null): string {
  if (preambleEnd(text) >= text.length) return text;
  text = cutStatements(text, "\\pagestyle");
  if (!name) return text;
  if (name === "fancy") text = addPackages(text, [{ name: "fancyhdr" }]);
  const at = afterStyle(text, name);
  return at === null ? text : insertLine(text, at, `\\pagestyle{${name}}`);
}

/** The style of the pages that open (title, chapters), which LaTeX sets with `plain`; null gives `plain` back. */
export function useOpening(text: string, name: string | null): string {
  const end = preambleEnd(text);
  if (end >= text.length) return text;
  const m = OPENING.exec(mask(text).slice(0, end));
  if (m) text = cut(text, m.index, m.index + m[0].length);
  if (!name || name === "plain") return text;
  const at = afterStyle(text, name);
  return at === null ? text : insertLine(text, at, `\\makeatletter\\let\\ps@plain\\ps@${name}\\makeatother`);
}

/**
 * The line that gives a style to the pages `from` to `to` of the PDF. The
 * style of a page is chosen when the page before it is finished: a page
 * that opens a chapter keeps the style its chapter gives it.
 */
export function rangeCode(r: PageRange): string {
  const first = r.from <= 1 ? `\\AtBeginDocument{\\thispagestyle{${r.name}}}` : "";
  const pages = r.from === r.to ? `page ${r.from}` : `pages ${r.from}-${r.to}`;
  return `\\AddToHook{shipout/after}{\\ifnum\\ReadonlyShipoutCounter>${r.from - 2} \\ifnum\\ReadonlyShipoutCounter<${r.to} \\thispagestyle{${r.name}}\\fi\\fi}${first} % ${pages}: ${r.name}`;
}

export function addRange(text: string, r: PageRange): string {
  if (preambleEnd(text) >= text.length || r.to < r.from || r.from < 1) return text;
  const at = afterStyle(text, r.name);
  return at === null ? text : insertLine(text, at, rangeCode(r));
}

/** Removes the `index`-th range (in the order `readUse` gives them). */
export function removeRange(text: string, index: number): string {
  const code = mask(text).slice(0, preambleEnd(text));
  const found = [...text.slice(0, code.length).matchAll(RANGE)].filter((m) => code.startsWith("\\AddToHook", m.index));
  const m = found[index];
  return m ? cut(text, m.index, m.index + m[0].length) : text;
}

/** Removes a style and what uses it in the preamble. */
export function removeStyle(text: string, name: string): string {
  const use = readUse(text);
  for (let i = use.ranges.length - 1; i >= 0; i--) if (use.ranges[i].name === name) text = removeRange(text, i);
  if (use.opening === name) text = useOpening(text, null);
  if (use.document === name) text = useStyle(text, null);
  const block = styleBlocks(text).find((b) => b.name === name);
  if (!block) return text;
  const at = lineStart(text, block.from);
  text = cut(text, block.from, block.to);
  // The blank line that came before it goes with it.
  const head = text.slice(0, at);
  return /\n\n$/.test(head) ? head.slice(0, -1) + text.slice(at) : text;
}

/** What goes in a header or a footer besides text. */
export const SLOT_FIELDS = [
  { id: "page", code: "\\thepage" },
  { id: "pageOf", code: "\\thepage\\ / \\pageref{LastPage}" },
  { id: "chapter", code: "\\nouppercase{\\leftmark}" },
  { id: "section", code: "\\nouppercase{\\rightmark}" },
  { id: "date", code: "\\today" },
  { id: "bold", code: "\\textbf{}" },
  { id: "small", code: "\\small " },
  { id: "image", code: "\\includegraphics[height=1cm]{}" },
] as const;

// ---------------------------------------------------------------- previews

const FILLER: Record<"fr" | "en", string> = {
  fr: "Ce texte sert de remplissage pour voir la page, ses marges et la place du texte. Il ne dit rien de particulier, mais il occupe les lignes comme le ferait un vrai paragraphe du document, avec des phrases courtes et des phrases plus longues, pour que le bloc de texte se voie bien sur la feuille et que ses bords soient nets.",
  en: "This text is here to fill the page and show its margins and where the text goes. It says nothing in particular, but it takes up the lines as a real paragraph of the document would, with short sentences and longer ones, so that the block of text shows well on the sheet and its edges are clear.",
};

function filler(lang: "fr" | "en", paragraphs: number, note = ""): string {
  return Array.from({ length: paragraphs }, (_, i) => FILLER[lang] + (i === 1 ? note : "")).join("\n\n");
}

/** Two pages of text, with a note in the margin, to look at the margins. */
export function marginsSample(lang: "fr" | "en"): string {
  const note = `\\marginpar{\\footnotesize ${lang === "fr" ? "Note de marge" : "Margin note"}}`;
  return `${filler(lang, 8, note)}\n\\newpage\n${filler(lang, 8)}`;
}

/** Two pages of text set in the style `name`, with a chapter and a section for its headers. */
export function styleSample(name: string, lang: "fr" | "en"): string {
  const [chapter, section] = lang === "fr" ? ["Titre du chapitre", "Titre de la section"] : ["Title of the chapter", "Title of the section"];
  return `\\pagestyle{${name}}\n\\markboth{${chapter}}{${section}}\n${filler(lang, 8)}\n\\newpage\n${filler(lang, 8)}`;
}

/**
 * A document with the preamble of `text` and `body` in place of its own:
 * what a preview compiles. `extra` is added at the end of the preamble.
 */
export function previewSource(text: string, body: string, extra = ""): string {
  return `${text.slice(0, preambleEnd(text)).trimEnd()}\n${extra}\\begin{document}\n${MEASURE}\n${body}\n\\end{document}\n`;
}

/** What fancyhdr asks for when the header is taller than its place: the height to give it. */
export function headHeightAsked(message: string): string | null {
  const m = /\\headheight is too small.*?Make it at least ([\d.]+)pt/s.exec(message);
  return m ? `${Math.ceil(Number(m[1]) * 10) / 10}pt` : null;
}

/** What the preview needs to show the result. */
export interface PagePreview {
  pdf: string | null;
  measures: number[] | null;
  diagnostics: Diagnostic[];
  durationMs: number;
  engine: string;
}
