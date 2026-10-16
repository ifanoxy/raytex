// Paragraphs: how one starts (its first line set in, or a space before it,
// or both), whether the first one after a heading is set in too, and what
// the text does by hand that goes against it: a `\noindent` that does
// nothing, a blank line after a formula (the sentence that goes on starts
// a new paragraph, set in), a `\\` that ends a paragraph. Read from the
// preamble and the text, written back.
//
// Local imports with their extension: tested directly by Node (`npm test`).

import { addPackages, loadedPackages, mask, preambleEnd } from "./preamble.ts";

/** `indent`: the first line set in (LaTeX's way); `skip`: a space between paragraphs; `both`. */
export type ParStyle = "indent" | "skip" | "both";

export interface Paragraphs {
  style: ParStyle;
  /** The indent of a first line (`1.5em`); empty: the class's. */
  indent: string;
  /** The space between paragraphs (`6pt`); empty: half a line. */
  skip: string;
  /** The first paragraph after a heading is set in too (the French way). */
  first: boolean;
  /** The language decides it (babel french) rather than a package. */
  french: boolean;
}

/** The preamble with its comments blanked (offsets kept). */
function preamble(text: string): string {
  return mask(text).slice(0, preambleEnd(text));
}

function lastMatch(code: string, re: RegExp): RegExpMatchArray | null {
  let found: RegExpMatchArray | null = null;
  for (const m of code.matchAll(re)) found = m;
  return found;
}

const SET_LENGTH = (name: string) => new RegExp(`\\\\setlength\\s*\\{?\\\\${name}\\}?\\s*\\{([^}]*)\\}|\\\\${name}\\s*=\\s*([^\\s%\\\\]+)`, "g");
const FRENCH_SETUP = /\\french(?:b)?setup\s*\{([^}]*)\}/g;

/** Whether the document is written in French with babel (or polyglossia). */
function isFrench(code: string): boolean {
  return /\\usepackage\s*\[[^\]]*\bfrench\b[^\]]*\]\s*\{babel\}|\\documentclass\s*\[[^\]]*\bfrench\b[^\]]*\]|\\set(?:default|main)language\s*(?:\[[^\]]*\])?\s*\{french\}/.test(code);
}

/** The value of a key of a list (`skip=6pt`), `""` when it is given without one, null when absent. */
function keyOf(options: string, key: string): string | null {
  for (const o of options.split(",")) {
    const [k, ...v] = o.split("=");
    if (k.trim() === key) return v.join("=").trim();
  }
  return null;
}

const isZero = (length: string) => /^\s*-?0+(?:\.0*)?\s*(?:pt|em|ex|cm|mm|in|bp|sp)?\s*$/.test(length);

/** How the paragraphs of the document are set, as its preamble says. */
export function readParagraphs(text: string): Paragraphs {
  const code = preamble(text);
  const french = isFrench(code);
  const parskip = loadedPackages(text).find((p) => p.names.includes("parskip"));
  const setIndent = lastMatch(code, SET_LENGTH("parindent"));
  const setSkip = lastMatch(code, SET_LENGTH("parskip"));
  const indentSet = setIndent ? (setIndent[1] ?? setIndent[2]).trim() : "";
  let style: ParStyle = "indent";
  let indent = indentSet;
  let skip = "";
  if (parskip) {
    const i = keyOf(parskip.options, "indent");
    style = i === null || isZero(i) ? "skip" : "both";
    indent = i && i !== "\\parindent" ? i : indentSet;
    skip = keyOf(parskip.options, "skip") ?? "";
  } else if (setSkip && !isZero(setSkip[1] ?? setSkip[2])) {
    skip = (setSkip[1] ?? setSkip[2]).trim();
    style = indentSet && isZero(indentSet) ? "skip" : "both";
  }
  if (style === "skip" && isZero(indent)) indent = "";
  let first: boolean;
  if (french) {
    first = true;
    for (const m of code.matchAll(FRENCH_SETUP)) {
      // In order: the last key said wins (StandardLayout sets IndentFirst false).
      for (const o of m[1].split(",")) {
        const [k, v] = o.split("=").map((s) => s.trim());
        if (k === "IndentFirst") first = v !== "false";
        if (k === "StandardLayout" && v !== "false") first = false;
      }
    }
  } else first = loadedPackages(text).some((p) => p.names.includes("indentfirst"));
  return { style, indent, skip, first, french };
}

const splice = (text: string, from: number, to: number, insert: string) => text.slice(0, from) + insert + text.slice(to);

/** Removes a statement: its whole line when it is alone on it. */
function removeAt(text: string, from: number, to: number): string {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  const nl = text.indexOf("\n", to);
  const end = nl < 0 ? text.length : nl;
  if (!text.slice(start, from).trim() && !text.slice(to, end).trim()) return splice(text, start, Math.min(text.length, end + 1), "");
  return splice(text, from, to, "");
}

/** Takes a package out of the preamble (out of a list it shares, else its line). */
function removePackage(text: string, name: string): string {
  const pkg = loadedPackages(text).find((p) => p.names.includes(name));
  if (!pkg) return text;
  if (pkg.names.length === 1) return removeAt(text, pkg.from, pkg.to);
  const code = `\\usepackage${pkg.options ? `[${pkg.options}]` : ""}{${pkg.names.filter((n) => n !== name).join(",")}}`;
  return splice(text, pkg.from, pkg.to, code);
}

/** Takes out every `\setlength{\name}{…}` (and `\name=…`) of the preamble. */
function removeLength(text: string, name: string): string {
  const found = [...preamble(text).matchAll(SET_LENGTH(name))].reverse();
  return found.reduce((out, m) => removeAt(out, m.index!, m.index! + m[0].length), text);
}

/** Adds a line at the end of the preamble, just before `\begin{document}`. */
function addLine(text: string, line: string): string {
  const end = preambleEnd(text);
  if (end >= text.length) return text;
  const before = text.slice(0, end).replace(/\s*$/, "");
  return `${before}\n${line}\n\n${text.slice(end)}`;
}

/** The preamble with the paragraphs set as `p` says (what set them before is taken out). */
export function writeParagraphs(text: string, p: Paragraphs): string {
  const was = readParagraphs(text);
  if (was.style === p.style && was.indent === p.indent.trim() && was.skip === p.skip.trim() && was.first === p.first) return text;
  let out = removeLength(removeLength(removePackage(text, "parskip"), "parskip"), "parindent");
  const indent = p.indent.trim();
  const skip = p.skip.trim();
  if (p.style === "indent") {
    if (indent) out = addLine(out, `\\setlength{\\parindent}{${indent}}`);
  } else {
    const options = [skip ? `skip=${skip}` : "", p.style === "both" ? (indent ? `indent=${indent}` : "indent") : ""].filter(Boolean).join(", ");
    out = addPackages(out, [{ name: "parskip", options }]);
  }
  // The first paragraph after a heading.
  const code = preamble(out);
  if (isFrench(code)) {
    const setups = [...code.matchAll(FRENCH_SETUP)];
    const now = readParagraphs(out).first;
    if (now !== p.first) {
      const last = setups[setups.length - 1];
      if (last) {
        // The key last of the list, where it wins.
        const keys = last[1].split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("IndentFirst"));
        const inner = [...keys, `IndentFirst=${p.first}`].join(", ");
        const open = last.index! + last[0].indexOf("{") + 1;
        out = splice(out, open, open + last[1].length, inner);
      } else out = addLine(out, `\\frenchsetup{IndentFirst=${p.first}}`);
    }
  } else if (p.first) out = addPackages(out, [{ name: "indentfirst" }]);
  else out = removePackage(out, "indentfirst");
  return out;
}

/** What the text does by hand to its paragraphs. */
export type IssueKind = "noindent" | "blank-after-math" | "break-paragraph";

export interface ParIssue {
  kind: IssueKind;
  /** What is taken out to set it right. */
  from: number;
  to: number;
  /** Its line (from 1). */
  line: number;
  /** A `\noindent` that does nothing where it is (it can go); the others are kept. */
  useless: boolean;
}

/** Display formulas: a blank line after one starts a new paragraph. */
const DISPLAY_END = /(?:\\end\s*\{(?:equation|align|gather|multline|flalign|alignat|eqnarray|displaymath|math)\*?\}|\\\]|\$\$)[ \t]*(?:%[^\n]*)?\n(?:[ \t]*\n)+[ \t]*(?=[a-zà-öø-ÿ,.;:)])/g;
/** Environments where `\\` ends a row, not a paragraph. */
const ROWS = /^(?:tabular\*?|tabularx|tabulary|longtable\*?|array|matrix|[pbBvV]matrix|smallmatrix|cases\*?|align\*?|aligned|alignat\*?|gather\*?|gathered|multline\*?|split|flalign\*?|eqnarray\*?|center|flushleft|flushright|verse|quote|quotation|tikzpicture|picture|minipage|tblr|longtblr|NiceTabular|NiceArray)$/;
const HEADING = /\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{/g;

/** Where the body of a text starts: after `\begin{document}`, or at its start (a file brought in). */
function bodyStart(text: string): number {
  const end = preambleEnd(text);
  return end < text.length ? end + "\\begin{document}".length : 0;
}

function lineOf(text: string, at: number): number {
  let n = 1;
  for (let i = text.indexOf("\n"); i >= 0 && i < at; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

/** The end of the group opened at `open` (a `{`), or -1. */
function groupEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/** The ranges of the environments where `\\` ends a row. */
function rowRanges(code: string): [number, number][] {
  const out: [number, number][] = [];
  const stack: { name: string; at: number }[] = [];
  for (const m of code.matchAll(/\\(begin|end)\s*\{([^}]+)\}/g)) {
    const name = m[2].trim();
    if (m[1] === "begin") stack.push({ name, at: m.index! });
    else {
      const i = stack.map((s) => s.name).lastIndexOf(name);
      if (i < 0) continue;
      const open = stack[i];
      stack.length = i;
      if (ROWS.test(name)) out.push([open.at, m.index! + m[0].length]);
    }
  }
  return out;
}

/** What a text (a whole document, or a file of one) does by hand to its paragraphs, as `p` sets them. */
export function paragraphIssues(text: string, p: Paragraphs): ParIssue[] {
  const code = mask(text);
  const start = bodyStart(text);
  const body = code.slice(start);
  const out: ParIssue[] = [];
  const at = (offset: number) => start + offset;
  // The end of each heading: a \noindent right after it is useless when no first paragraph is set in.
  const headingEnds: number[] = [];
  for (const m of body.matchAll(HEADING)) {
    const end = groupEnd(body, m.index! + m[0].length - 1);
    if (end > 0) headingEnds.push(end);
  }
  for (const m of body.matchAll(/\\noindent(?![A-Za-z@])\s?/g)) {
    const before = body.slice(0, m.index!);
    const afterHeading = headingEnds.some((e) => e <= m.index! && /^(?:\s|\\label\s*\{[^}]*\})*$/.test(before.slice(e)));
    const useless = (p.style === "skip" && !p.indent) || (afterHeading && !p.first);
    out.push({ kind: "noindent", from: at(m.index!), to: at(m.index! + m[0].length), line: lineOf(text, at(m.index!)), useless });
  }
  for (const m of body.matchAll(DISPLAY_END)) {
    // The blank lines between the formula and the text that goes on.
    const from = at(m.index! + m[0].indexOf("\n") + 1);
    out.push({ kind: "blank-after-math", from, to: at(m.index! + m[0].lastIndexOf("\n") + 1), line: lineOf(text, from), useless: true });
  }
  const rows = rowRanges(body);
  for (const m of body.matchAll(/\\\\\*?(?:\s*\[[^\]\n]*\])?[ \t]*\n(?:[ \t]*\n)+/g)) {
    if (rows.some(([a, b]) => m.index! > a && m.index! < b)) continue;
    const cmd = /^\\\\\*?(?:\s*\[[^\]\n]*\])?[ \t]*/.exec(m[0])![0];
    out.push({ kind: "break-paragraph", from: at(m.index!), to: at(m.index! + cmd.length), line: lineOf(text, at(m.index!)), useless: true });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The text with `issues` set right: each taken out, from the end so that the offsets hold. */
export function fixIssues(text: string, issues: ParIssue[]): string {
  return [...issues].sort((a, b) => b.from - a.from).reduce((out, i) => splice(out, i.from, i.to, ""), text);
}

const SAMPLE = {
  fr: {
    heading: "Un titre",
    one: "Le premier paragraphe après le titre. Un paragraphe est un bloc de phrases qui se suivent ; LaTeX le met en page d'un seul tenant, et commence le suivant à la ligne vide.",
    two: "Un deuxième paragraphe commence ici, après une ligne vide dans le source. Il se poursuit sur plusieurs lignes, puis donne une formule :",
    after: "où $c$ est l'hypoténuse : la phrase continue après la formule, sans ligne vide dans le source, donc sans nouveau paragraphe.",
    three: "Un troisième paragraphe, enfin, pour voir comment les paragraphes se suivent : en retrait, séparés par un espace, ou les deux.",
  },
  en: {
    heading: "A heading",
    one: "The first paragraph after the heading. A paragraph is a block of sentences that follow each other; LaTeX sets it in one piece, and starts the next one at the blank line.",
    two: "A second paragraph starts here, after a blank line in the source. It goes on over several lines, then gives a formula:",
    after: "where $c$ is the hypotenuse: the sentence goes on after the formula, with no blank line in the source, so no new paragraph.",
    three: "A third paragraph, last, to see how paragraphs follow each other: set in, apart, or both.",
  },
};

/**
 * A document with the preamble of `text` and a page of paragraphs (a
 * heading, a formula, the sentence going on after it), printing the indent
 * and the space between paragraphs as TeX sets them (in points).
 */
export function paragraphsPreview(text: string, lang: "fr" | "en"): string {
  const s = SAMPLE[lang];
  const body = `\\section{${s.heading}}\n${s.one}\n\n${s.two}\n\\begin{equation*}\n  a^2 + b^2 = c^2\n\\end{equation*}\n${s.after}\n\n${s.three}`;
  return `${text.slice(0, preambleEnd(text)).trimEnd()}\n\\begin{document}\n\\typeout{RTXMEASURE:\\the\\parindent:\\the\\dimexpr\\parskip\\relax}\n${body}\n\\end{document}\n`;
}
