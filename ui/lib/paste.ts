// What a paste becomes in a LaTeX file. Formatted text (Word, Google Docs,
// LibreOffice, a web page) comes as LaTeX: bold, italic, headings, lists,
// links, formulas. A table (a spreadsheet, a table of Word) opens in the
// table window, a lone formula is written as a formula. Anything else is
// pasted as it is: LaTeX code, plain text, code copied from an editor.
// No local imports but `.ts` ones: tested directly by Node (`npm test`).

import { pastedCells } from "./grid.ts";
import { localName, type MNode, parseMarkup, styleOf, textOf } from "./markup.ts";
import { formulasIn, mathmlToLatex, ommlToLatex } from "./mathconv.ts";

export type Pasted =
  /** Formatted text written in LaTeX; `plain` is what an ordinary paste would give. */
  | { kind: "latex"; latex: string; packages: string[]; plain: string }
  /** A table, cell by cell (for the table window). */
  | { kind: "table"; cells: string[][] }
  /** One formula, without its delimiters. */
  | { kind: "math"; latex: string; display: boolean };

/** What to paste, or null for an ordinary paste. */
export function smartPaste(html: string, plain: string, inMath = false): Pasted | null {
  // MathML given as text (Word, when told to copy MathML).
  const asText = plain.trim();
  if (/^<(?:[a-z]+:)?math[\s>]/i.test(asText)) {
    const formula = formulasIn(parseMarkup(asText))[0];
    if (formula) return mathOf(formula);
  }
  // A spreadsheet: tabs between cells, a line per row.
  const rows = asText.split("\n").filter((r) => r.trim());
  if (!inMath && asText.includes("\t") && rows.length >= 2 && rows.some((r) => r.split("\t").length >= 2)) {
    const cells = pastedCells(plain);
    if (cells && cells.length >= 2) return { kind: "table", cells };
  }
  if (!html.trim()) return null;
  const root = fragment(parseMarkup(html));
  const formulas = [...formulasIn(root), ...wordFormulas(root)];
  // One formula and nothing else.
  if (formulas.length === 1 && !textOutside(root).trim()) return mathOf(formulas[0]);
  if (inMath) return null;
  // LaTeX code copied from a page, or code from an editor: as it is.
  if (/\\[a-zA-Z]{2,}/.test(plain) && !formulas.length) return null;
  if (codeLike(root)) return null;
  const table = onlyTable(root);
  if (table) {
    const cells = tableCells(table);
    if (cells.length >= 1 && cells[0].length >= 1 && (cells.length > 1 || cells[0].length > 1)) return { kind: "table", cells };
  }
  const cx: Context = { packages: new Set(), formatted: 0 };
  const latex = blocksOf(root, cx).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cx.formatted || !latex) return null;
  return { kind: "latex", latex, packages: [...cx.packages], plain };
}

function mathOf(m: MNode): Pasted {
  const f = localName(m.tag) === "math" ? mathmlToLatex(m) : ommlToLatex(m);
  return { kind: "math", latex: f.latex, display: f.display };
}

/** What the clipboard marks as copied (`<!--StartFragment-->…<!--EndFragment-->`), or the body. */
function fragment(root: MNode): MNode {
  const body = find(root, (n) => n.tag === "body") ?? root;
  const start = findPath(body, (n) => n.tag === "#comment" && n.text.trim() === "StartFragment");
  if (!start) return body;
  // The nodes between the two comments, in their parent.
  const [parent, index] = start;
  const end = parent.children.findIndex((n, i) => i > index && n.tag === "#comment" && n.text.trim() === "EndFragment");
  return { tag: "#root", attrs: {}, text: "", children: parent.children.slice(index + 1, end < 0 ? undefined : end) };
}

function find(n: MNode, test: (n: MNode) => boolean): MNode | null {
  if (test(n)) return n;
  for (const c of n.children) {
    const f = find(c, test);
    if (f) return f;
  }
  return null;
}

function findPath(n: MNode, test: (n: MNode) => boolean): [MNode, number] | null {
  for (let i = 0; i < n.children.length; i++) {
    if (test(n.children[i])) return [n, i];
    const f = findPath(n.children[i], test);
    if (f) return f;
  }
  return null;
}

/** Word's equations: OMML in its conditional comments (`<!--[if gte msEquation 12]>…`). */
function wordFormulas(root: MNode): MNode[] {
  const out: MNode[] = [];
  const walk = (n: MNode) => {
    if (n.tag === "#comment" && /^\[if gte msEquation/i.test(n.text)) {
      const inner = n.text.replace(/^\[if[^\]]*\]>/i, "").replace(/<!\[endif\]$/i, "");
      out.push(...formulasIn(parseMarkup(inner)));
    }
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** The text of a fragment but its formulas and their pictures. */
function textOutside(n: MNode): string {
  let out = "";
  let skip = false;
  for (const c of n.children) {
    if (c.tag === "#marker") {
      if (/^if !msEquation/i.test(c.text) || /^if !vml/i.test(c.text)) skip = true;
      else if (/^endif/i.test(c.text)) skip = false;
      continue;
    }
    if (skip || c.tag === "#comment") continue;
    const name = localName(c.tag);
    if (name === "math" || name === "omath" || name === "omathpara") continue;
    out += c.tag === "#text" ? c.text : textOutside(c);
  }
  return out.replace(/[\s ​]/g, "");
}

/** Code: in `<pre>`/`<code>`, or set in a monospaced font for most of its text. */
function codeLike(root: MNode): boolean {
  const total = textOf(root).replace(/\s/g, "").length;
  if (!total) return false;
  let mono = 0;
  const walk = (n: MNode, inMono: boolean) => {
    const font = styleOf(n, "font-family") ?? n.attrs.face ?? "";
    const here = inMono || n.tag === "pre" || n.tag === "code" || /mono|courier|consolas|menlo|monaco/i.test(font);
    if (n.tag === "#text") {
      if (here) mono += n.text.replace(/\s/g, "").length;
      return;
    }
    n.children.forEach((c) => walk(c, here));
  };
  walk(root, false);
  return mono / total > 0.8;
}

/** The table, when the fragment is a table and nothing else. */
function onlyTable(root: MNode): MNode | null {
  const table = find(root, (n) => n.tag === "table");
  if (!table) return null;
  const all = textOf(root).replace(/\s/g, "").length;
  const inTable = textOf(table).replace(/\s/g, "").length;
  return inTable >= all * 0.9 ? table : null;
}

function tableCells(table: MNode): string[][] {
  const rows: string[][] = [];
  const walk = (n: MNode) => {
    if (n.tag === "tr") {
      const row: string[] = [];
      for (const c of n.children) {
        if (c.tag !== "td" && c.tag !== "th") continue;
        const cx: Context = { packages: new Set(), formatted: 0 };
        row.push(inlineOf(c, cx).replace(/\s*\n\s*/g, " ").trim());
        for (let k = 1; k < Number(c.attrs.colspan ?? 1); k++) row.push("");
      }
      if (row.length) rows.push(row);
      return;
    }
    if (n.tag === "table" && n !== table) return;
    n.children.forEach(walk);
  };
  walk(table);
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
}

// ------------------------------------------------------------ text

interface Context {
  packages: Set<string>;
  /** How many marks of formatting or structure were written. */
  formatted: number;
}

type Flag = "b" | "i" | "u" | "tt" | "sup" | "sub";
const ORDER: Flag[] = ["b", "i", "u", "tt", "sup", "sub"];
const COMMAND: Record<Flag, string> = {
  b: "\\textbf",
  i: "\\emph",
  u: "\\underline",
  tt: "\\texttt",
  sup: "\\textsuperscript",
  sub: "\\textsubscript",
};

interface Run {
  latex: string;
  flags: Set<Flag>;
}

const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "blockquote", "pre", "hr", "section", "article", "header", "footer", "main", "figure", "dl"]);

/** Text written for LaTeX: its special characters escaped, its spaces gathered. */
export function escapeText(text: string): string {
  return text
    .replace(/[​­﻿]/g, "")
    .replace(/[\\{}$&#%_~^]/g, (c) =>
      c === "\\" ? "\\textbackslash{}" : c === "~" ? "\\textasciitilde{}" : c === "^" ? "\\textasciicircum{}" : `\\${c}`,
    )
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/ /g, "~");
}

/** The flags an element sets or clears, by its tag and by its style. */
function flagsOf(n: MNode, flags: Set<Flag>): Set<Flag> {
  const out = new Set(flags);
  const tag = localName(n.tag);
  if (tag === "b" || tag === "strong") out.add("b");
  if (tag === "i" || tag === "em" || tag === "cite" || tag === "dfn" || tag === "var") out.add("i");
  if (tag === "u" || tag === "ins") out.add("u");
  if (tag === "code" || tag === "tt" || tag === "kbd" || tag === "samp") out.add("tt");
  if (tag === "sup") out.add("sup");
  if (tag === "sub") out.add("sub");
  const weight = styleOf(n, "font-weight");
  if (weight) {
    if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) out.add("b");
    else if (weight === "normal" || weight === "lighter" || Number(weight) > 0) out.delete("b");
  }
  const style = styleOf(n, "font-style");
  if (style === "italic" || style === "oblique") out.add("i");
  else if (style === "normal") out.delete("i");
  const decoration = styleOf(n, "text-decoration") ?? styleOf(n, "text-decoration-line");
  if (decoration?.includes("underline")) out.add("u");
  else if (decoration === "none") out.delete("u");
  const align = styleOf(n, "vertical-align");
  if (align === "super") out.add("sup");
  else if (align === "sub") out.add("sub");
  return out;
}

/** The runs of an inline content, its formatting as flags. */
function runsOf(n: MNode, flags: Set<Flag>, cx: Context, out: Run[]) {
  let skip = false;
  for (const c of n.children) {
    if (c.tag === "#marker") {
      // Word: the picture of an equation, the bullet of a list item.
      if (/^if !(msEquation|supportLists|vml)/i.test(c.text)) skip = true;
      else if (/^endif/i.test(c.text)) skip = false;
      continue;
    }
    if (skip) continue;
    if (c.tag === "#comment") {
      for (const f of wordFormulas({ tag: "#root", attrs: {}, text: "", children: [c] })) out.push({ latex: formulaText(f, cx), flags: new Set() });
      continue;
    }
    if (c.tag === "#text") {
      out.push({ latex: escapeText(c.text), flags });
      continue;
    }
    const tag = localName(c.tag);
    if (tag === "math" || tag === "omath" || tag === "omathpara") {
      out.push({ latex: formulaText(c, cx), flags: new Set() });
      continue;
    }
    if (tag === "br") {
      out.push({ latex: "\\\\\n", flags: new Set() });
      continue;
    }
    if (tag === "img" || tag === "script" || tag === "style") continue;
    if (styleOf(c, "mso-list") === "ignore" || styleOf(c, "display") === "none") continue;
    if (tag === "a" && c.attrs.href && !/^(javascript|file):/i.test(c.attrs.href)) {
      const href = c.attrs.href;
      const inner: Run[] = [];
      runsOf(c, new Set(), cx, inner);
      const text = render(inner, cx).trim();
      cx.packages.add("hyperref");
      cx.formatted++;
      const url = href.replace(/[%#\\]/g, (ch) => `\\${ch}`);
      out.push({ latex: textOf(c).trim() === href ? `\\url{${url}}` : `\\href{${url}}{${text}}`, flags });
      continue;
    }
    runsOf(c, flagsOf(c, flags), cx, out);
  }
}

/** Runs written, the commands of their formatting opened and closed as little as possible. */
function render(runs: Run[], cx: Context): string {
  let out = "";
  const open: Flag[] = [];
  for (const run of runs) {
    if (!run.latex) continue;
    // Spaces only: they take no formatting.
    const target = run.latex.trim() ? run.flags : new Set(open);
    const keep = open.findIndex((f) => !target.has(f));
    if (keep >= 0) {
      out += "}".repeat(open.length - keep);
      open.length = keep;
    }
    for (const f of ORDER) {
      if (target.has(f) && !open.includes(f)) {
        open.push(f);
        out += `${COMMAND[f]}{`;
        cx.formatted++;
      }
    }
    out += run.latex;
  }
  out += "}".repeat(open.length);
  // A space at the end of a command goes after it (`\textbf{mot }` → `\textbf{mot} `).
  return out.replace(/ ((?:\})+)/g, "$1 ").replace(/(\\[a-zA-Z]+\{) /g, " $1");
}

function inlineOf(n: MNode, cx: Context): string {
  const runs: Run[] = [];
  runsOf(n, flagsOf(n, new Set()), cx, runs);
  return render(runs, cx)
    .replace(/^(?:\\\\\n)+|(?:\\\\\n)+$/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function formulaText(m: MNode, cx: Context): string {
  const f = localName(m.tag) === "math" ? mathmlToLatex(m) : ommlToLatex(m);
  cx.formatted++;
  if (/\\(binom|text|boxed|overset|underset)\b|\\begin\{aligned\}/.test(f.latex)) cx.packages.add("amsmath");
  return f.display ? `\n\\[\n${f.latex}\n\\]\n` : `$${f.latex}$`;
}

const HEADINGS: Record<string, string> = {
  h1: "section",
  h2: "subsection",
  h3: "subsubsection",
  h4: "paragraph",
  h5: "paragraph",
  h6: "paragraph",
};

/** A paragraph of Word that is an item of a list: its level, and whether it is numbered. */
function wordItem(n: MNode): { level: number; numbered: boolean } | null {
  const list = styleOf(n, "mso-list");
  if (!list && !/MsoListParagraph/i.test(n.attrs.class ?? "")) return null;
  const level = Number(/level(\d+)/.exec(list ?? "")?.[1] ?? 1);
  // The bullet Word writes before the text (in a part shown only without lists).
  let bullet = "";
  let inside = false;
  const walk = (c: MNode) => {
    if (c.tag === "#marker") {
      if (/^if !supportLists/i.test(c.text)) inside = true;
      else if (/^endif/i.test(c.text)) inside = false;
      return;
    }
    if (c.tag === "#text" && (inside || false)) bullet += c.text;
    if (styleOf(c, "mso-list") === "ignore") bullet += textOf(c);
    c.children.forEach(walk);
  };
  n.children.forEach(walk);
  return { level, numbered: /^\s*\(?[0-9a-zA-Z]{1,3}[.)]/.test(bullet) };
}

function listOf(items: { latex: string; level: number; numbered: boolean }[], cx: Context, depth = 0): string {
  const env = items[0]?.numbered ? "enumerate" : "itemize";
  const pad = "\t".repeat(depth);
  const lines = [`${pad}\\begin{${env}}`];
  let i = 0;
  while (i < items.length) {
    const level = items[0].level;
    const it = items[i];
    if (it.level > level) {
      const nested: typeof items = [];
      while (i < items.length && items[i].level > level) nested.push(items[i++]);
      lines.push(listOf(nested, cx, depth + 1));
      continue;
    }
    lines.push(`${pad}\t\\item ${it.latex}`);
    i++;
  }
  lines.push(`${pad}\\end{${env}}`);
  cx.formatted++;
  return lines.join("\n");
}

/** The blocks (paragraphs, headings, lists…) of a container. */
function blocksOf(n: MNode, cx: Context): string[] {
  const out: string[] = [];
  let pending: MNode = { tag: "#root", attrs: {}, text: "", children: [] };
  let wordList: { latex: string; level: number; numbered: boolean }[] = [];
  const flushText = () => {
    const text = inlineOf(pending, cx);
    if (text) out.push(text);
    pending = { tag: "#root", attrs: {}, text: "", children: [] };
  };
  const flushList = () => {
    if (wordList.length) out.push(listOf(wordList, cx));
    wordList = [];
  };
  for (const c of n.children) {
    const tag = localName(c.tag);
    const block = BLOCK.has(tag) || tag === "omathpara";
    // An inline element that holds paragraphs (Google Docs wraps all it
    // copies in a `<b>` that is not bold): what it holds counts.
    if (!block && c.children.some((k) => BLOCK.has(localName(k.tag)))) {
      flushText();
      flushList();
      out.push(...blocksOf(c, cx));
      continue;
    }
    if (!block) {
      if (c.tag === "#text" && !c.text.trim() && !pending.children.length) continue;
      flushList();
      pending.children.push(c);
      continue;
    }
    flushText();
    const item = tag === "p" ? wordItem(c) : null;
    if (item) {
      wordList.push({ latex: inlineOf(c, cx), ...item });
      continue;
    }
    flushList();
    if (tag in HEADINGS) {
      const title = inlineOf(c, { packages: cx.packages, formatted: 0 });
      if (title) {
        out.push(`\\${HEADINGS[tag]}{${title}}`);
        cx.formatted++;
      }
    } else if (tag === "ul" || tag === "ol") {
      out.push(htmlList(c, cx, 0));
    } else if (tag === "table") {
      const cells = tableCells(c);
      if (cells.length) {
        const width = cells[0].length;
        out.push(`\\begin{tabular}{${"l".repeat(width)}}\n${cells.map((r) => `\t${r.join(" & ")} \\\\`).join("\n")}\n\\end{tabular}`);
        cx.formatted++;
      }
    } else if (tag === "blockquote") {
      out.push(`\\begin{quote}\n${blocksOf(c, cx).join("\n\n")}\n\\end{quote}`);
      cx.formatted++;
    } else if (tag === "pre") {
      out.push(`\\begin{verbatim}\n${textOf(c).replace(/\n+$/, "")}\n\\end{verbatim}`);
      cx.formatted++;
    } else if (tag === "hr") {
      continue;
    } else if (tag === "omathpara") {
      out.push(formulaText(c, cx).trim());
    } else if (c.children.some((k) => BLOCK.has(localName(k.tag)))) {
      out.push(...blocksOf(c, cx));
    } else {
      const text = inlineOf(c, cx);
      if (text) out.push(text);
    }
  }
  flushText();
  flushList();
  return out;
}

function htmlList(n: MNode, cx: Context, depth: number): string {
  const env = n.tag === "ol" ? "enumerate" : "itemize";
  const pad = "\t".repeat(depth);
  const lines = [`${pad}\\begin{${env}}`];
  for (const li of n.children.filter((c) => c.tag === "li")) {
    const nested = li.children.filter((c) => c.tag === "ul" || c.tag === "ol");
    const own: MNode = { ...li, children: li.children.filter((c) => !nested.includes(c)) };
    lines.push(`${pad}\t\\item ${blocksOf(own, cx).join(" ")}`.trimEnd());
    for (const sub of nested) lines.push(htmlList(sub, cx, depth + 1));
  }
  lines.push(`${pad}\\end{${env}}`);
  cx.formatted++;
  return lines.join("\n");
}
