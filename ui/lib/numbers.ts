// How the numbers of a document are written: the French way (0,5 · 1 000)
// or the English way (0.5 · 1,000). What RayTeX writes for a document
// (function plots, tables of variations, probability trees) follows its
// language, unless it says otherwise on a line of its own at its top
// (`% !RayTeX numbers = french`), written from Maths › Number conventions.
//
// That window also writes again, the way chosen, what is already there: the
// number format of the plots (pgfplots), the decimal marks of the formulas
// of the pictures (and of the text, if asked), the locale of siunitx. Only
// what says a number to the reader changes: lengths, coordinates and the
// expressions of the curves keep their point, as TeX reads them.

import { pictureKind } from "./picturekind.ts";
import { mask, preambleEnd } from "./preamble.ts";
import { codeRegions, documentLanguage } from "./spelling.ts";

export type Convention = "french" | "english";

/** How each way writes a number, for the window. */
export const EXAMPLES: Record<Convention, string> = { french: "0,5 · 1 000", english: "0.5 · 1,000" };

const MARK = /^[ \t]*%[ \t]*![ \t]*RayTeX[ \t]+numbers[ \t]*=[ \t]*(french|english)\b[^\n]*(?:\n|$)/m;

/** The way the document asks for, on its line `% !RayTeX numbers = …`; null when it does not. */
export function chosenConvention(text: string): Convention | null {
  return (MARK.exec(text.slice(0, preambleEnd(text)))?.[1] as Convention | undefined) ?? null;
}

/** The way of the language of the document: French for a French one. */
export function languageConvention(text: string): Convention {
  return documentLanguage(text)?.startsWith("fr") ? "french" : "english";
}

/** The way the numbers of the document are written. */
export function conventionOf(text: string): Convention {
  return chosenConvention(text) ?? languageConvention(text);
}

/** The document with its line `% !RayTeX numbers = …` for `choice`, or without it (`null`: its language decides). */
export function withChoice(text: string, choice: Convention | null): string {
  const line = choice ? `% !RayTeX numbers = ${choice}\n` : "";
  const m = MARK.exec(text.slice(0, preambleEnd(text)));
  if (m) return text.slice(0, m.index) + line + text.slice(m.index + m[0].length);
  return line + text;
}

// ------------------------------------------------------------ decimal marks

const UNIT = /^\s*(?:pt|cm|mm|em|ex|in|bp|pc|sp|dd|cc|mu|fil|\\[A-Za-z])/;
/** A number given to a command as a size or a factor, not one said to the reader: its first argument… */
const MEASURE = /\\(?:scalebox|rotatebox|resizebox|raisebox|fontsize|rule|hspace|vspace|kern|mkern|hskip|vskip|linethickness)\*?\s*(?:\[[^\]]*\])?\s*\{?\s*$/;
/** …or its second one (`\rule{0.4pt}{1.2ex}`, `\setlength{\x}{0.5cm}`). */
const SECOND_MEASURE = /\\(?:resizebox|fontsize|rule|setlength|addtolength)\*?\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}\s*\{?\s*$/;

/**
 * The decimal marks of a formula written `to` that way: `0.5` and `0{,}5`
 * (the comma of a formula, without the space of a list); a length (`0.5cm`,
 * `0.5\textwidth`) or the factor of a command (`\scalebox{0.8}`) is left as
 * TeX reads it. A bare comma is a list (`f(1,2)`), never read as a mark.
 */
export function decimals(math: string, to: Convention): string {
  const re = to === "french" ? /(\d)\.(\d+)/g : /(\d)\{,\}(\d+)/g;
  return math.replace(re, (all: string, a: string, b: string, at: number) => {
    const after = math.slice(at + all.length);
    // What comes before the number (its other digits taken off).
    const before = math.slice(Math.max(0, at - 40), at).replace(/\d+$/, "");
    if (UNIT.test(after) || MEASURE.test(before) || SECOND_MEASURE.test(before)) return all;
    return `${a}${to === "french" ? "{,}" : "."}${b}`;
  });
}

/** Where the formulas of a text are: `$…$`, `$$…$$`, `\(…\)`, `\[…\]` and the environments of mathematics. */
export function formulas(text: string): { from: number; to: number }[] {
  const code = mask(text);
  const out: { from: number; to: number }[] = [];
  const env = /^\\begin\{(equation|align|gather|multline|flalign|alignat|eqnarray|math|displaymath)(\*?)\}/;
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "\\") {
      const next = code[i + 1];
      if (next === "(" || next === "[") {
        const close = code.indexOf(next === "(" ? "\\)" : "\\]", i + 2);
        if (close < 0) break;
        out.push({ from: i + 2, to: close });
        i = close + 2;
        continue;
      }
      const m = env.exec(code.slice(i, i + 40));
      if (m) {
        const end = code.indexOf(`\\end{${m[1]}${m[2]}}`, i + m[0].length);
        if (end < 0) break;
        out.push({ from: i + m[0].length, to: end });
        i = end;
        continue;
      }
      i += 2;
      continue;
    }
    if (c === "$") {
      const double = code[i + 1] === "$";
      const open = i + (double ? 2 : 1);
      let j = open;
      while (j < code.length && !(code[j] === "$" && code[j - 1] !== "\\")) j++;
      if (j >= code.length) break;
      out.push({ from: open, to: j });
      i = j + (double ? 2 : 1);
      continue;
    }
    i++;
  }
  return out;
}

/** The decimal marks of every formula of `text` written `way`. */
function formulasWritten(text: string, way: Convention): { text: string; changed: number } {
  let changed = 0;
  let out = "";
  let at = 0;
  for (const f of formulas(text)) {
    const before = text.slice(f.from, f.to);
    const after = decimals(before, way);
    if (after !== before) changed++;
    out += text.slice(at, f.from) + after;
    at = f.to;
  }
  return { text: out + text.slice(at), changed };
}

// ------------------------------------------------------- options of a list

/** Keys of pgf that set how numbers are printed. */
const FORMAT_KEYS = ["use comma", "use period", "1000 sep", "dec sep", "set decimal separator", "set thousands separator"];
/** The French way for pgfplots: a comma, and a thin space between thousands (`use comma` alone puts a point there). */
const FRENCH_FORMAT = ["/pgf/number format/use comma", "/pgf/number format/1000 sep={\\,}"];

function isFormat(item: string): boolean {
  const m = /^\/pgf\/number format\/([^=]+?)\s*(?:=|$)/.exec(item.trim());
  return !!m && FORMAT_KEYS.includes(m[1].trim());
}

/** The items of a list of options, as written (their spaces kept), cut at the commas outside braces. */
function rawItems(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/**
 * A list of options with the number format of pgf taken out and, `add`,
 * the French one put at its end, written as the list is (one a line, a
 * comma after the last…). Null when it does not change.
 */
function withFormat(list: string, add: string[]): string | null {
  const items = rawItems(list);
  const trailing = items.length > 1 && !items[items.length - 1].trim() ? items.pop()! : null;
  const kept = items.filter((i) => i.trim() && !isFormat(i));
  if (kept.length === items.filter((i) => i.trim()).length && !add.length) return null;
  const lead = /^\s*/.exec(items.find((i) => i.trim()) ?? " ")![0] || " ";
  const first = /^\s*/.exec(items[0] ?? "")![0];
  const end = trailing === null ? /\s*$/.exec(items[items.length - 1] ?? "")![0] : "";
  const body = kept.map((i, n) => (n === 0 ? first + i.trim() : /^\s*/.exec(i)![0] + i.trim()));
  for (const a of add) body.push((body.length ? lead : first) + a);
  const out = body.join(",") + (trailing !== null ? `,${trailing}` : end);
  return out === list ? null : out;
}

/** Offset of the `]` closing the `[` at `open`, or -1. */
function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return ch === "]" ? i : -1;
    }
  }
  return -1;
}

const AXES = /\\begin\s*\{(axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis)\}/g;

/** The plots of `code` with the number format of `way`: each axis says it, as the graph studio writes it. */
function axesWritten(code: string, way: Convention): { text: string; changed: number } {
  const add = way === "french" ? FRENCH_FORMAT : [];
  let out = "";
  let at = 0;
  let changed = 0;
  const masked = mask(code);
  for (const m of masked.matchAll(AXES)) {
    const head = m.index + m[0].length;
    const open = /^\s*\[/.exec(masked.slice(head));
    if (!open) {
      if (!add.length) continue;
      out += code.slice(at, head) + `[${add.join(", ")}]`;
      at = head;
      changed++;
      continue;
    }
    const from = head + open[0].length - 1;
    const close = closingBracket(code, from);
    if (close < 0) continue;
    const list = withFormat(code.slice(from + 1, close), add);
    if (list === null) continue;
    out += code.slice(at, from + 1) + list;
    at = close;
    changed++;
  }
  return { text: out + code.slice(at), changed };
}

// ----------------------------------------------------------------- siunitx

/** `\usepackage[…]{siunitx}` or `\sisetup{…}`: their options, where they are. */
function siunitxLists(code: string): { from: number; to: number; setup: boolean }[] {
  const out: { from: number; to: number; setup: boolean }[] = [];
  for (const m of code.matchAll(/\\usepackage\s*\[([^\]]*)\]\s*\{siunitx\}/g)) {
    const from = m.index + m[0].indexOf("[") + 1;
    out.push({ from, to: from + m[1].length, setup: false });
  }
  for (const m of code.matchAll(/\\sisetup\s*\{/g)) {
    const from = m.index + m[0].length;
    let depth = 1;
    let i = from;
    for (; i < code.length && depth; i++) {
      if (code[i] === "\\") i++;
      else if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
    }
    if (!depth) out.push({ from, to: i - 1, setup: true });
  }
  return out.sort((a, b) => a.from - b.from);
}

/**
 * The preamble of `text` with the locale of siunitx for `way` (`FR`, else
 * `UK` or `US` as the language says), where it is set or, for the French
 * way, after the package; a decimal mark set by hand goes (the locale says
 * it). Null when siunitx is not loaded or nothing changes.
 */
function siunitxWritten(text: string, way: Convention): string | null {
  const end = preambleEnd(text);
  const code = mask(text.slice(0, end));
  const loaded = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{siunitx\}/.exec(code);
  if (!loaded) return null;
  const locale = way === "french" ? "FR" : documentLanguage(text) === "en-GB" ? "UK" : "US";
  let out = text;
  let found = false;
  for (const list of siunitxLists(code).reverse()) {
    const items = rawItems(text.slice(list.from, list.to));
    let touched = false;
    const kept = items.flatMap((item) => {
      const key = /^\s*([A-Za-z-]+)\s*=/.exec(item)?.[1];
      if (key === "locale") {
        found = true;
        touched = true;
        return [item.replace(/(=\s*\{?\s*)[A-Za-z]+/, `$1${locale}`)];
      }
      if (key === "output-decimal-marker") {
        touched = true;
        return [];
      }
      return [item];
    });
    if (touched) out = out.slice(0, list.from) + kept.join(",").replace(/^,\s*/, "") + out.slice(list.to);
  }
  if (!found && way === "french") {
    const at = loaded.index + loaded[0].length;
    const line = out.indexOf("\n", at);
    const where = line < 0 ? out.length : line;
    out = `${out.slice(0, where)}\n\\sisetup{locale = ${locale}}${out.slice(where)}`;
  }
  return out === text ? null : out;
}

// -------------------------------------------------------------- a document

/** What was written again in a file, by kind. */
export interface Rewritten {
  plots: number;
  tables: number;
  trees: number;
  drawings: number;
  formulas: number;
  siunitx: boolean;
}

export const nothingRewritten = (): Rewritten => ({ plots: 0, tables: 0, trees: 0, drawings: 0, formulas: 0, siunitx: false });

/**
 * A file of the document written `way`: the number format of its plots
 * and the decimal marks of the formulas of its pictures; with `text`, those
 * of the formulas of its text too (not of its preamble, nor of a listing);
 * in its preamble, pgfplots where it sets a number format for every plot,
 * and the locale of siunitx.
 */
export function rewrite(source: string, way: Convention, opts: { text?: boolean } = {}): { text: string; done: Rewritten } {
  const done = nothingRewritten();
  const masked = mask(source);
  const edits: { from: number; to: number; insert: string }[] = [];
  const pictures: { from: number; to: number }[] = [];
  for (const m of masked.matchAll(/\\begin\s*\{tikzpicture\}/g)) {
    const end = masked.indexOf("\\end{tikzpicture}", m.index);
    if (end < 0) break;
    const p = { from: m.index, to: end + "\\end{tikzpicture}".length };
    pictures.push(p);
    const before = source.slice(p.from, p.to);
    const after = formulasWritten(axesWritten(before, way).text, way).text;
    if (after === before) continue;
    edits.push({ ...p, insert: after });
    const kind = pictureKind(before);
    if (kind === "graph") done.plots++;
    else if (kind === "variations") done.tables++;
    else if (kind === "tree") done.trees++;
    else done.drawings++;
  }
  if (opts.text) {
    const code = codeRegions(source);
    const within = (at: number, list: { from: number; to: number }[]) => list.some((r) => at >= r.from && at < r.to);
    for (const f of formulas(source)) {
      if (within(f.from, pictures) || within(f.from, code)) continue;
      const before = source.slice(f.from, f.to);
      const after = decimals(before, way);
      if (after === before) continue;
      edits.push({ ...f, insert: after });
      done.formulas++;
    }
  }
  let out = source;
  for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  // Settings of the preamble: pgfplots for every plot, siunitx.
  const preamble = preambleEnd(out);
  if (preamble < out.length) {
    const head = out.slice(0, preamble);
    let set = "";
    let from = 0;
    for (const m of mask(head).matchAll(/\\pgfplotsset\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const close = closingBrace(head, open);
      if (close < 0) continue;
      const list = head.slice(open + 1, close);
      // Only a number format already set there is written again (none is added).
      if (!rawItems(list).some(isFormat)) continue;
      const again = withFormat(list, way === "french" ? FRENCH_FORMAT : []);
      if (again === null) continue;
      set += head.slice(from, open + 1) + again;
      from = close;
      done.plots++;
    }
    out = set + out.slice(from);
    const si = siunitxWritten(out, way);
    if (si !== null) {
      out = si;
      done.siunitx = true;
    }
  }
  return { text: out, done };
}

/** Offset of the `}` closing the `{` at `open`, or -1. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Whether nothing was written again. */
export function isNothing(r: Rewritten): boolean {
  return !r.plots && !r.tables && !r.trees && !r.drawings && !r.formulas && !r.siunitx;
}

/** What two files did, added. */
export function added(a: Rewritten, b: Rewritten): Rewritten {
  return { plots: a.plots + b.plots, tables: a.tables + b.tables, trees: a.trees + b.trees, drawings: a.drawings + b.drawings, formulas: a.formulas + b.formulas, siunitx: a.siunitx || b.siunitx };
}
