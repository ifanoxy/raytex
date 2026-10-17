// The body of a slide in blocks, as the Interface of the slides mode shows
// it: text, a list (its items and how they appear), a picture, columns, a
// formula, a table, a box (block, alertblock, exampleblock), code, a pause,
// and what Beamer draws by itself (the title page, the table of contents).
// What is not one of those is kept as LaTeX. A block changed is written
// back alone: the rest of the slide stays as it was written.
//
// Local imports with their extension: tested directly by Node (`npm test`).

import { type Frame, mask } from "./deck.ts";

export type BlockKind = "text" | "list" | "image" | "columns" | "formula" | "table" | "box" | "code" | "pause" | "special" | "raw";

export interface ListItem {
  text: string;
  /** Its overlay (`1-`, `+-`), when it has one. */
  overlay: string;
}

export interface Block {
  kind: BlockKind;
  /** Where it is in the text of the document. */
  from: number;
  to: number;
  /** What it says: a text, a formula, code, LaTeX kept as it is, the body of a box. */
  text: string;
  /** A list: numbered, its items, the overlay of the whole list (`<+->`: one item a click). */
  ordered?: boolean;
  items?: ListItem[];
  listOverlay?: string;
  /** A picture: its file, its width (share of the text, `0.7`), its caption. */
  path?: string;
  width?: string;
  caption?: string;
  /** Columns: the width (share of the text) and the text of each. */
  columns?: { width: string; text: string }[];
  /** A formula: numbered or not. */
  numbered?: boolean;
  /** A box: its environment and its title. */
  env?: string;
  title?: string;
  /** What Beamer draws by itself: `titlepage`, `tableofcontents`, `sectionpage`… */
  special?: string;
  /**
   * When it is shown: its overlay (`2-`: from step 2 on, `2`: at step 2
   * only), set around it (`\begin{uncoverenv}<2->`), by a command
   * (`\uncover<2->{…}`), or on it (`\begin{block}<2->`, `\includegraphics<2->`).
   */
  reveal?: Reveal;
  /** Set apart on its line: centred, to the right, to the left (`\begin{center}`, `flushright`, `flushleft`). */
  align?: "center" | "right" | "left";
  /** Its size, when it is not the normal one (`\begin{large}`…). */
  size?: string;
}

export interface Reveal {
  form: "env" | "command" | "spec";
  /** The environment or the command (`uncoverenv`, `onlyenv`, `uncover`…); "" on it. */
  name: string;
  overlay: string;
}

const LISTS = ["itemize", "enumerate", "description"];
const FORMULAS = ["equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "displaymath"];
const BOXES = ["block", "alertblock", "exampleblock"];
const CODES = ["lstlisting", "verbatim", "minted"];
const SPECIALS = ["titlepage", "maketitle", "tableofcontents", "sectionpage", "subsectionpage", "partpage"];
const REVEAL_ENVS = ["uncoverenv", "visibleenv", "onlyenv", "invisibleenv"];
const REVEAL_COMMANDS = ["uncover", "visible", "only", "onslide", "invisible"];
const ALIGNS: Record<string, "center" | "right" | "left"> = { center: "center", flushright: "right", flushleft: "left" };
const ALIGN_ENVS = { center: "center", right: "flushright", left: "flushleft" } as const;
/** The sizes of text, from the smallest; `normalsize` is none. */
export const SIZES = ["tiny", "scriptsize", "footnotesize", "small", "normalsize", "large", "Large", "LARGE", "huge", "Huge"];

/** The end of the group opened at `open` (`{` or `[`), or -1. */
function groupEnd(code: string, open: number): number {
  const close = code[open] === "[" ? "]" : "}";
  const o = code[open];
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === "\\") i++;
    else if (c === o) depth++;
    else if (c === close && --depth === 0) return i + 1;
  }
  return -1;
}

/** The end of the environment begun at `at` (`\begin{name}`), nested ones of the same name passed over. */
function envEnd(code: string, at: number, name: string): number {
  const esc = name.replace(/[*]/g, "\\*");
  const re = new RegExp(`\\\\(begin|end)\\s*\\{${esc}\\}`, "g");
  re.lastIndex = at;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1] === "begin") depth++;
    else if (--depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** The items of a list body (`\item<1-> text`). */
function listItems(text: string, code: string, from: number, to: number): ListItem[] {
  const out: ListItem[] = [];
  const re = /\\item(?![A-Za-z@])\s*(?:<([^>]*)>)?\s*(?:\[[^\]]*\])?/g;
  const starts: { at: number; end: number; overlay: string }[] = [];
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  // Items of this list only, not of a list inside an item.
  let depth = 0;
  let scan = from;
  while ((m = re.exec(code)) && m.index < to) {
    const between = code.slice(scan, m.index);
    depth += (between.match(/\\begin\s*\{(?:itemize|enumerate|description)\}/g)?.length ?? 0) - (between.match(/\\end\s*\{(?:itemize|enumerate|description)\}/g)?.length ?? 0);
    scan = m.index;
    if (depth === 0) starts.push({ at: m.index, end: m.index + m[0].length, overlay: m[1] ?? "" });
  }
  starts.forEach((s, i) => out.push({ overlay: s.overlay, text: dedent(text.slice(s.end, starts[i + 1]?.at ?? to)) }));
  return out;
}

/** The blocks of the body of a slide, in order. */
export function frameBlocks(text: string, frame: Frame): Block[] {
  return bodyBlocks(text, mask(text), frame.bodyFrom, frame.bodyTo);
}

/** The blocks between `from` and `end`: a body, or what is shown at some steps only. */
function bodyBlocks(text: string, code: string, from: number, end: number): Block[] {
  const out: Block[] = [];
  let i = from;
  let textFrom = -1;
  const flushText = (upTo: number) => {
    if (textFrom < 0) return;
    const raw = text.slice(textFrom, upTo);
    if (raw.trim()) {
      const lead = raw.length - raw.trimStart().length;
      const from = textFrom + lead;
      out.push({ kind: "text", from, to: from + raw.trim().length, text: dedent(raw) });
    }
    textFrom = -1;
  };
  while (i < end) {
    const rest = code.slice(i, end);
    const ws = /^\s*/.exec(rest)![0].length;
    // A blank line ends a text.
    if (/\n[ \t]*\n/.test(rest.slice(0, ws))) flushText(i);
    i += ws;
    if (i >= end) break;
    const here = code.slice(i, Math.min(end, i + 200));
    const begin = /^\\begin\s*\{([^}]+)\}/.exec(here);
    const command = /^\\([A-Za-z]+)(?![A-Za-z@])/.exec(here);
    let block: Block | null = null;
    let next = -1;
    if (begin) {
      const name = begin[1].trim();
      const e = envEnd(code, i, name);
      if (e > 0 && e <= end) {
        next = e;
        const inner = (o = 0) => [i + begin[0].length + o, e - `\\end{${name}}`.length] as const;
        const spec = /^\s*<([^>]*)>/.exec(code.slice(i + begin[0].length, e));
        if (REVEAL_ENVS.includes(name)) {
          // What is shown at some steps only: the block inside, when it is one.
          const [a, b] = inner(spec?.[0].length ?? 0);
          const one = bodyBlocks(text, code, a, b);
          block = one.length === 1 && !one[0].reveal ? { ...one[0], from: i, to: e, reveal: { form: "env", name, overlay: spec?.[1] ?? "" } } : { kind: "raw", from: i, to: e, text: dedent(text.slice(i, e)) };
        } else if (LISTS.includes(name)) {
          let [a] = inner();
          const b = inner()[1];
          const ov = /^\s*\[\s*<([^>]*)>\s*\]/.exec(code.slice(a, b));
          if (ov) a += ov[0].length;
          block = { kind: "list", from: i, to: e, text: "", ordered: name === "enumerate", items: listItems(text, code, a, b), listOverlay: ov?.[1] ?? "" };
        } else if (name === "columns") {
          const cols: { width: string; text: string }[] = [];
          for (const c of code.slice(i, e).matchAll(/\\begin\s*\{column\}\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
            const at = i + c.index!;
            const ce = envEnd(code, at, "column");
            if (ce < 0) break;
            const w = /^([\d.]*)\s*\\(?:textwidth|linewidth|columnwidth)$/.exec(c[1].trim());
            cols.push({ width: w ? w[1] || "1" : c[1].trim(), text: dedent(text.slice(at + c[0].length, ce - "\\end{column}".length)) });
          }
          block = { kind: "columns", from: i, to: e, text: "", columns: cols };
        } else if (FORMULAS.includes(name)) {
          const [a, b] = inner();
          block = { kind: "formula", from: i, to: e, text: dedent(text.slice(a, b)), numbered: !name.endsWith("*") && name !== "displaymath", env: name };
        } else if (BOXES.includes(name)) {
          let [a] = inner(spec?.[0].length ?? 0);
          const b = inner()[1];
          let title = "";
          const t = /^\s*\{/.exec(code.slice(a, b));
          if (t) {
            const open = a + t[0].length - 1;
            const te = groupEnd(code, open);
            if (te > 0) {
              title = text.slice(open + 1, te - 1).trim();
              a = te;
            }
          }
          block = { kind: "box", from: i, to: e, text: dedent(text.slice(a, b)), env: name, title, ...(spec ? { reveal: { form: "spec" as const, name: "", overlay: spec[1] } } : {}) };
        } else if (CODES.includes(name)) {
          block = { kind: "code", from: i, to: e, text: text.slice(i, e), env: name };
        } else if (name === "figure" || name === "center") {
          const body = code.slice(i, e);
          const g = /\\includegraphics\s*(?:<([^>]*)>)?\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(body);
          const others = body.replace(/\\begin\s*\{(?:figure|center)\}(?:\[[^\]]*\])?|\\end\s*\{(?:figure|center)\}|\\centering|\\includegraphics\s*(?:<[^>]*>)?\s*(?:\[[^\]]*\])?\s*\{[^}]*\}|\\caption\s*\{[^}]*\}|\\label\s*\{[^}]*\}/g, "").trim();
          if (g && !others) {
            const cap = /\\caption\s*\{/.exec(body);
            let caption = "";
            if (cap) {
              const open = i + cap.index + cap[0].length - 1;
              const ce = groupEnd(code, open);
              if (ce > 0) caption = text.slice(open + 1, ce - 1).trim();
            }
            block = { kind: "image", from: i, to: e, text: "", path: g[3].trim(), width: widthOf(g[2] ?? ""), caption, env: name, ...specOf(g[1]) };
          } else if (/\\begin\s*\{tabular/.test(body)) block = { kind: "table", from: i, to: e, text: dedent(text.slice(i, e)), env: name };
          else block = name === "center" ? wrapped(text, code, i, e, inner(), { align: "center" }) : { kind: "raw", from: i, to: e, text: dedent(text.slice(i, e)) };
        } else if (name === "flushright" || name === "flushleft") {
          block = wrapped(text, code, i, e, inner(), { align: ALIGNS[name] });
        } else if (SIZES.includes(name) && name !== "normalsize") {
          block = wrapped(text, code, i, e, inner(), { size: name });
        } else if (name === "table" || name.startsWith("tabular")) {
          block = { kind: "table", from: i, to: e, text: dedent(text.slice(i, e)), env: name };
        } else block = { kind: "raw", from: i, to: e, text: dedent(text.slice(i, e)) };
      }
    } else if (here.startsWith("\\[")) {
      const e = code.indexOf("\\]", i);
      if (e > 0 && e < end) {
        next = e + 2;
        block = { kind: "formula", from: i, to: next, text: dedent(text.slice(i + 2, e)), numbered: false, env: "\\[" };
      }
    } else if (command) {
      const name = command[1];
      if (name === "frametitle" || name === "framesubtitle" || name === "note") {
        // The title and the notes are set apart.
        const open = code.indexOf("{", i);
        const ge = open >= 0 ? groupEnd(code, open) : -1;
        if (ge > 0 && ge <= end) {
          flushText(i);
          i = ge;
          continue;
        }
      } else if (name === "pause") {
        next = i + command[0].length;
        block = { kind: "pause", from: i, to: next, text: "" };
      } else if (SPECIALS.includes(name)) {
        next = i + command[0].length;
        block = { kind: "special", from: i, to: next, text: "", special: name };
      } else if (name === "includegraphics") {
        const g = /^\\includegraphics\s*(?:<([^>]*)>)?\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(code.slice(i, end));
        if (g) {
          next = i + g[0].length;
          block = { kind: "image", from: i, to: next, text: "", path: g[3].trim(), width: widthOf(g[2] ?? ""), caption: "", ...specOf(g[1]) };
        }
      } else if (REVEAL_COMMANDS.includes(name)) {
        // `\uncover<2->{…}` alone on its line: the block inside, shown at some steps only.
        const m = /^\\[A-Za-z]+\s*<([^>]*)>\s*\{/.exec(code.slice(i, end));
        const open = m ? i + m[0].length - 1 : -1;
        const ge = open >= 0 ? groupEnd(code, open) : -1;
        const nl = code.indexOf("\n", ge);
        if (m && ge > 0 && ge <= end && !code.slice(ge, nl < 0 || nl > end ? end : nl).trim()) {
          const one = bodyBlocks(text, code, open + 1, ge - 1);
          if (one.length === 1 && !one[0].reveal) {
            next = ge;
            block = { ...one[0], from: i, to: ge, reveal: { form: "command", name, overlay: m[1] } };
          }
        }
      }
    }
    if (block) {
      flushText(i);
      out.push(block);
      i = next;
      continue;
    }
    // Text, up to the end of its line.
    if (textFrom < 0) textFrom = i;
    const nl = code.indexOf("\n", i);
    i = nl < 0 || nl > end ? end : nl;
  }
  flushText(end);
  return out;
}

/** The block an environment of alignment or size holds, set so (raw when it holds several, or one set already). */
function wrapped(text: string, code: string, from: number, to: number, [a, b]: readonly [number, number], set: Pick<Block, "align" | "size">): Block {
  const one = bodyBlocks(text, code, a, b);
  const inner = one[0];
  // Written around it in this order: what shows it at some steps, its alignment, its size.
  const free = one.length === 1 && inner.kind !== "pause" && !inner.reveal && !inner.align && !(set.size && inner.size);
  return free ? { ...inner, from, to, ...set } : { kind: "raw", from, to, text: dedent(text.slice(from, to)) };
}

/** The overlay written on a block (`<2->`), as when it is shown. */
function specOf(overlay: string | undefined): { reveal?: Reveal } {
  return overlay === undefined ? {} : { reveal: { form: "spec", name: "", overlay } };
}

/** The width of a picture as a share of the text (`0.7`), from its options; `""` when they say something else. */
function widthOf(options: string): string {
  const w = /(?:^|,)\s*width\s*=\s*([\d.]*)\s*\\(?:textwidth|linewidth|columnwidth)\s*(?:,|$)/.exec(options);
  return w ? w[1] || "1" : "";
}

/** The lines after the first brought back to the left: their shared indentation taken off. */
export function dedent(s: string): string {
  const lines = s.trim().split("\n");
  const lead = (l: string) => /^[ \t]*/.exec(l)![0].length;
  const rest = lines.slice(1).filter((l) => l.trim());
  const cut = rest.length ? Math.min(...rest.map(lead)) : 0;
  return [lines[0], ...lines.slice(1).map((l) => l.slice(Math.min(cut, lead(l))).trimEnd())].join("\n");
}

/** The indentation of a level in a text: a tab, or the spaces its lines are indented by. */
export function indentUnit(text: string): string {
  let tabs = 0;
  let spaces = 0;
  let least = 8;
  for (const line of text.split("\n", 2000)) {
    const lead = /^[ \t]*/.exec(line)![0];
    if (!lead || !line.trim()) continue;
    if (lead[0] === "\t") tabs++;
    else {
      spaces++;
      if (lead.length >= 2) least = Math.min(least, lead.length);
    }
  }
  return tabs >= spaces ? "\t" : " ".repeat(Math.min(least, 4));
}

/**
 * The LaTeX of a block, to be written where a line begins with `indent`
 * (put before each line but the first), `unit` for a level deeper.
 */
export function blockCode(b: Block, indent = "", unit = "\t"): string {
  const r = b.reveal;
  const around = (env: string, spec: string, inner: Block) => `\\begin{${env}}${spec}\n${indent}${unit}${blockCode(inner, indent + unit, unit)}\n${indent}\\end{${env}}`;
  if (r?.form === "env") return around(r.name, `<${r.overlay}>`, { ...b, reveal: undefined });
  if (r?.form === "command") return `\\${r.name}<${r.overlay}>{${blockCode({ ...b, reveal: undefined }, indent, unit)}}`;
  if (b.align && !(b.kind === "image" && b.align === "center")) return around(ALIGN_ENVS[b.align], "", { ...b, align: undefined });
  if (b.size && b.size !== "normalsize") return around(b.size, "", { ...b, size: undefined });
  return bareCode(b, indent, unit);
}

/** The LaTeX of a block itself, an overlay on it kept. */
function bareCode(b: Block, indent: string, unit: string): string {
  const spec = b.reveal?.form === "spec" ? `<${b.reveal.overlay}>` : "";
  // The lines of a text on lines of their own, `depth` levels in.
  const lines = (s: string, depth = 1) =>
    dedent(s)
      .split("\n")
      .map((l) => (l.trim() ? `${indent}${unit.repeat(depth)}${l}` : ""))
      .join("\n");
  // A text where it begins, its lines after the first at its indentation.
  const flow = (s: string, at = indent) =>
    dedent(s)
      .split("\n")
      .map((l, k) => (k === 0 || !l.trim() ? l : `${at}${l}`))
      .join("\n");
  const one = `${indent}${unit}`;
  switch (b.kind) {
    case "code":
      return b.text.trim();
    case "text":
    case "raw":
    case "table":
      return flow(b.text);
    case "pause":
      return "\\pause";
    case "special":
      return `\\${b.special}`;
    case "list": {
      const env = b.ordered ? "enumerate" : "itemize";
      const head = `\\begin{${env}}${b.listOverlay ? `[<${b.listOverlay}>]` : ""}`;
      const items = (b.items ?? []).map((it) => `${one}\\item${it.overlay ? `<${it.overlay}>` : ""} ${flow(it.text, one)}`.trimEnd());
      return [head, ...items, `${indent}\\end{${env}}`].join("\n");
    }
    case "image": {
      const width = b.width ? `width=${b.width}\\textwidth` : "width=0.7\\textwidth";
      const graphic = `\\includegraphics${spec}[${width}]{${b.path ?? ""}}`;
      if (!b.caption && b.env !== "figure") return b.env === "center" ? `\\begin{center}\n${one}${graphic}\n${indent}\\end{center}` : graphic;
      return [`\\begin{figure}`, `${one}\\centering`, `${one}${graphic}`, ...(b.caption ? [`${one}\\caption{${b.caption}}`] : []), `${indent}\\end{figure}`].join("\n");
    }
    case "columns": {
      const cols = (b.columns ?? []).flatMap((c) => [`${one}\\begin{column}{${c.width || "0.48"}\\textwidth}`, ...(c.text.trim() ? [lines(c.text, 2)] : []), `${one}\\end{column}`]);
      return ["\\begin{columns}", ...cols, `${indent}\\end{columns}`].join("\n");
    }
    case "formula": {
      const grouped = /align|gather|multline/.test(b.env ?? "");
      if (!b.numbered && !grouped) return `\\[\n${lines(b.text)}\n${indent}\\]`;
      const base = grouped ? (b.env ?? "align").replace("*", "") : "equation";
      const env = b.numbered ? base : `${base}*`;
      return `\\begin{${env}}\n${lines(b.text)}\n${indent}\\end{${env}}`;
    }
    case "box":
      return `\\begin{${b.env ?? "block"}}${spec}{${b.title ?? ""}}\n${lines(b.text)}\n${indent}\\end{${b.env ?? "block"}}`;
  }
}

/** The step a block is shown from, and whether at that step only; null when shown always or otherwise. */
export function revealStep(b: Block): { step: number; only: boolean } | null {
  const m = /^\s*(\d+)\s*(-?)\s*$/.exec(b.reveal?.overlay ?? "");
  return m ? { step: Number(m[1]), only: !m[2] } : null;
}

/**
 * A block shown from step `step` on (at that step only when `only`), or
 * always (`step` 1 or less): around it (`uncoverenv`, the room it takes
 * kept at the steps before), or on a box or a picture.
 */
export function setReveal(b: Block, step: number, only = false): Block {
  if (step <= 1 && !only) return { ...b, reveal: undefined };
  const overlay = only ? `${step}` : `${step}-`;
  if (b.reveal) return { ...b, reveal: { ...b.reveal, overlay } };
  return { ...b, reveal: b.kind === "box" || b.kind === "image" ? { form: "spec", name: "", overlay } : { form: "env", name: "uncoverenv", overlay } };
}

/** A list shows one point a click: `[<+->]`, or each point from the next step (`<1->`, `<2->`…). */
export function oneByOne(b: Block): boolean {
  const items = b.items ?? [];
  return b.listOverlay === "+-" || (items.length > 1 && items.every((it, k) => it.overlay === `${k + 1}-` || (k === 0 && it.overlay === "")));
}

/** A list made to show one point a click, or all at once (the overlays of its points taken out). */
export function setOneByOne(b: Block, on: boolean): Block {
  return { ...b, listOverlay: on ? "+-" : "", items: b.items?.map((it) => ({ ...it, overlay: "" })) };
}

/** A block of a kind, ready to fill. */
export function newBlock(kind: BlockKind, lang: "fr" | "en", variant = ""): Block {
  const fr = lang === "fr";
  const base = { from: 0, to: 0, text: "" };
  switch (kind) {
    case "list":
      return { ...base, kind, ordered: variant === "ordered", items: [{ text: fr ? "Premier point" : "First point", overlay: "" }, { text: fr ? "Deuxième point" : "Second point", overlay: "" }], listOverlay: "" };
    case "image":
      return { ...base, kind, path: variant || "example-image", width: "0.7", caption: "", env: "center" };
    case "columns":
      if (variant === "3") return { ...base, kind, columns: [fr ? "Un" : "One", fr ? "Deux" : "Two", fr ? "Trois" : "Three"].map((text) => ({ width: "0.31", text })) };
      return { ...base, kind, columns: [{ width: "0.48", text: fr ? "À gauche" : "On the left" }, { width: "0.48", text: fr ? "À droite" : "On the right" }] };
    case "formula":
      return { ...base, kind, text: "E = mc^2", numbered: false, env: "\\[" };
    case "table":
      return { ...base, kind, text: `\\begin{tabular}{ll}\n\t${fr ? "Nom & Valeur" : "Name & Value"} \\\\\n\ta & 1 \\\\\n\\end{tabular}` };
    case "box":
      if (variant === "alertblock") return { ...base, kind, env: variant, title: fr ? "Attention" : "Warning", text: fr ? "Le point délicat." : "The tricky point." };
      if (variant === "exampleblock") return { ...base, kind, env: variant, title: fr ? "Exemple" : "Example", text: fr ? "Un cas concret." : "A concrete case." };
      return { ...base, kind, env: "block", title: fr ? "À retenir" : "Remember", text: fr ? "Ce qu'il faut retenir." : "What to remember." };
    case "code":
      return { ...base, kind, text: "\\begin{verbatim}\nprint(42)\n\\end{verbatim}", env: "verbatim" };
    case "pause":
      return { ...base, kind };
    default:
      return { ...base, kind: "text", text: fr ? "Un paragraphe de texte." : "A paragraph of text." };
  }
}

/** The indentation of the line a position is on. */
export function indentAt(text: string, at: number): string {
  return /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", at - 1) + 1))![0];
}

/** A change of the text, and the block to select after it. */
export interface BlockEdit {
  from: number;
  to: number;
  insert: string;
  select: number;
}

/** A block written in place of the one it was. */
export function replaceBlock(text: string, blocks: Block[], i: number, next: Block): BlockEdit {
  const b = blocks[i];
  return { from: b.from, to: b.to, insert: blockCode(next, indentAt(text, b.from), indentUnit(text)), select: i };
}

/** What is between two blocks one after the other: a line, a blank line between two texts (else they are one). */
const gap = (a: Block | undefined, b: Block | undefined) => (a?.kind === "text" && b?.kind === "text" ? "\n\n" : "\n");

/** A block added after block `after` (-1: first), on a line of its own. */
export function insertBlock(text: string, frame: Frame, blocks: Block[], after: number, given: Block): BlockEdit {
  const anchor = blocks[after];
  // A plain table is written at the indentation of the document.
  const grid = given.kind === "table" ? tableGrid(given.text) : null;
  const block = grid ? { ...given, text: gridCode(grid, indentUnit(text)) } : given;
  // After a block: at the end of its line; else at the start of the body (after the title).
  const at = anchor ? anchor.to : blocks[0] ? blocks[0].from : frame.bodyTo;
  const unit = indentUnit(text);
  const indent = anchor ? indentAt(text, anchor.from) : blocks[0] ? indentAt(text, blocks[0].from) : `${indentAt(text, frame.from)}${unit}`;
  const code = blockCode(block, indent, unit);
  if (anchor) return { from: at, to: at, insert: `${gap(anchor, block)}${indent}${code}`, select: after + 1 };
  if (blocks[0]) return { from: at, to: at, insert: `${code}${gap(block, blocks[0])}${indent}`, select: 0 };
  // An empty slide: before `\end{frame}`, on its own line.
  const before = text.slice(0, at).replace(/[ \t]*$/, "");
  const lineStart = before.length;
  return { from: lineStart, to: at, insert: `${before.endsWith("\n") ? "" : "\n"}${indent}${code}\n${indentAt(text, frame.from)}`, select: 0 };
}

/** Block `i` taken out, with its line when it is alone on it. */
export function deleteBlock(text: string, blocks: Block[], i: number): BlockEdit {
  const b = blocks[i];
  const start = text.lastIndexOf("\n", b.from - 1) + 1;
  const nl = text.indexOf("\n", b.to);
  const end = nl < 0 ? text.length : nl + 1;
  const alone = !text.slice(start, b.from).trim() && !text.slice(b.to, nl < 0 ? text.length : nl).trim();
  return alone ? { from: start, to: end, insert: "", select: Math.max(0, i - 1) } : { from: b.from, to: b.to, insert: "", select: Math.max(0, i - 1) };
}

/** Block `i` swapped with the one before (`-1`) or after (`1`): the two written in each other's place. */
export function moveBlock(text: string, blocks: Block[], i: number, by: -1 | 1): BlockEdit | null {
  const j = i + by;
  if (j < 0 || j >= blocks.length) return null;
  const [a, b] = by < 0 ? [blocks[j], blocks[i]] : [blocks[i], blocks[j]];
  const first = text.slice(a.from, a.to);
  const second = text.slice(b.from, b.to);
  const between = text.slice(a.to, b.from);
  return { from: a.from, to: b.to, insert: `${second}${between}${first}`, select: j };
}

/** A table as a grid of cells, when it is a plain one (no merged cells). */
export interface Grid {
  /** Its columns as written (`lcr`, `|l|c|`). */
  spec: string;
  /** Its rows: the rules written before each (`\hline`, `\midrule`) and its cells. */
  rows: { rule: string; cells: string[] }[];
  /** The rules after its last row. */
  end: string;
  /** Around it: `center`, or nothing. */
  center: boolean;
}

/** Splits at a separator out of braces (and not escaped). */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      if (sep === "\\\\" && s[i + 1] === "\\" && depth === 0) {
        out.push(s.slice(from, i));
        from = i + 2;
      }
      i++;
    } else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  out.push(s.slice(from));
  return out;
}

const RULE = /^\s*((?:\\(?:hline|toprule|midrule|bottomrule)(?![A-Za-z])\s*)*)/;

/** The grid of a table, or null when it is not a plain one. */
export function tableGrid(code: string): Grid | null {
  // A table with comments is kept as it is written.
  if (mask(code) !== code) return null;
  let body = code.trim();
  const center = /^\\begin\s*\{center\}([\s\S]*)\\end\s*\{center\}$/.exec(body);
  if (center) body = center[1].trim();
  const m = /^\\begin\s*\{tabular\}\s*\{([^{}]*)\}([\s\S]*)\\end\s*\{tabular\}$/.exec(body);
  if (!m || /\\(?:multicolumn|multirow|cline|cmidrule|begin|end)(?![A-Za-z])/.test(m[2])) return null;
  const parts = splitTop(m[2], "\\\\");
  const rows: Grid["rows"] = [];
  let end = "";
  parts.forEach((part, k) => {
    const rule = RULE.exec(part)![1].trim();
    const rest = part.slice(RULE.exec(part)![0].length).trim();
    if (k === parts.length - 1 && !rest) end = rule;
    else rows.push({ rule, cells: splitTop(rest, "&").map((c) => c.trim()) });
  });
  return { spec: m[1].trim(), rows, end, center: !!center };
}

/** The LaTeX of a grid. */
export function gridCode(g: Grid, unit = "\t"): string {
  const width = Math.max(1, ...g.rows.map((r) => r.cells.length));
  const lines = g.rows.flatMap((r) => [
    ...(r.rule ? [`${unit}${r.rule}`] : []),
    `${unit}${Array.from({ length: width }, (_, k) => r.cells[k] ?? "")
      .join(" & ")
      .trimEnd()} \\\\`,
  ]);
  const table = [`\\begin{tabular}{${g.spec}}`, ...lines, ...(g.end ? [`${unit}${g.end}`] : []), "\\end{tabular}"];
  return g.center ? ["\\begin{center}", ...table.map((l) => `${unit}${l}`), "\\end{center}"].join("\n") : table.join("\n");
}

/** A column added to a grid (centred), or its last one taken out. */
export function gridColumns(g: Grid, by: 1 | -1): Grid {
  if (by > 0) {
    const spec = g.spec.endsWith("|") ? `${g.spec}c|` : `${g.spec}c`;
    return { ...g, spec, rows: g.rows.map((r) => ({ ...r, cells: [...r.cells, ""] })) };
  }
  const letters = [...g.spec.matchAll(/[lcrXp]/g)];
  if (letters.length <= 1) return g;
  const last = letters[letters.length - 1];
  const after = g.spec.slice(last.index! + 1).replace(/^\{[^}]*\}/, "");
  const spec = (g.spec.slice(0, last.index!) + after).replace(/\|\|$/, "|");
  return { ...g, spec, rows: g.rows.map((r) => ({ ...r, cells: r.cells.slice(0, letters.length - 1) })) };
}

// ------------------------------------------------- set apart, moved, copied

/** How a block is set on its line: a picture centred by its own environment, a table by its grid, the others by theirs. */
export function alignOf(b: Block): "center" | "right" | "left" {
  if (b.kind === "image" && (b.env === "center" || b.env === "figure")) return "center";
  if (b.kind === "table" && !b.align && tableGrid(b.text)?.center) return "center";
  return b.align ?? "left";
}

/** A block set centred, to the right or to the left (its own way for a picture and a table). */
export function setAlign(b: Block, align: "center" | "right" | "left", unit = "\t"): Block {
  if (b.kind === "image") {
    if (align === "center") return { ...b, align: undefined, env: b.caption ? "figure" : "center" };
    return { ...b, env: b.caption ? "figure" : undefined, align: align === "right" ? "right" : undefined };
  }
  const g = b.kind === "table" ? tableGrid(b.text) : null;
  if (g && align !== "right") return { ...b, align: undefined, text: gridCode({ ...g, center: align === "center" }, unit) };
  return { ...b, align: align === "left" ? undefined : align };
}

/** A block a size larger (`by` 1) or smaller (-1). */
export function stepSize(b: Block, by: 1 | -1): Block {
  const at = SIZES.indexOf(b.size ?? "normalsize");
  const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, (at < 0 ? 4 : at) + by))];
  return { ...b, size: next === "normalsize" ? undefined : next };
}

/** The one change that turns `before` into `after` (what they begin and end with left alone). */
export function editBetween(before: string, after: string, select: number): BlockEdit {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end), select };
}

const applied = (text: string, e: { from: number; to: number; insert: string }) => text.slice(0, e.from) + e.insert + text.slice(e.to);

/** Block `i` written a second time, right after it. */
export function duplicateBlock(text: string, blocks: Block[], i: number): BlockEdit {
  const b = blocks[i];
  return { from: b.to, to: b.to, insert: `${gap(b, b)}${indentAt(text, b.from)}${text.slice(b.from, b.to)}`, select: i + 1 };
}

/** Block `from` moved before block `to` (`blocks.length`: after the last one). */
export function moveBlockTo(text: string, blocks: Block[], from: number, to: number): BlockEdit | null {
  if (to === from || to === from + 1 || !blocks[from]) return null;
  const b = blocks[from];
  const cut = deleteBlock(text, blocks, from);
  const piece = text.slice(b.from, b.to);
  const without = applied(text, cut);
  const shift = (p: number) => (p >= cut.to ? p - (cut.to - cut.from) : p);
  let out: string;
  if (to < blocks.length) {
    const at = shift(blocks[to].from);
    out = `${without.slice(0, at)}${piece}${gap(b, blocks[to])}${indentAt(text, blocks[to].from)}${without.slice(at)}`;
  } else {
    const last = blocks[blocks.length - 1];
    const at = shift(last.to);
    out = `${without.slice(0, at)}${gap(last, b)}${indentAt(text, last.from)}${piece}${without.slice(at)}`;
  }
  return editBetween(text, out, to > from ? to - 1 : to);
}

/** A columns block with `block` added at the end of its column `k`. */
export function addToColumn(b: Block, k: number, block: Block, unit = "\t"): Block {
  return { ...b, columns: b.columns?.map((c, n) => (n === k ? { ...c, text: addToText(c.text, block, unit) } : c)) };
}

/** Block `i` taken from where it is and put at the end of column `k` of block `j`. */
export function moveToColumn(text: string, blocks: Block[], i: number, j: number, k: number, unit = "\t"): BlockEdit | null {
  if (i === j || !blocks[i] || blocks[j]?.kind !== "columns") return null;
  const into = replaceBlock(text, blocks, j, addToColumn(blocks[j], k, blocks[i], unit));
  const out = [deleteBlock(text, blocks, i), into].sort((x, y) => y.from - x.from).reduce(applied, text);
  return editBetween(text, out, i < j ? j - 1 : j);
}

// ------------------------------------------------ blocks inside a block

/** The blocks of a text of its own (the body of a box, a column), its places counted from its start. */
export function textBlocks(text: string): Block[] {
  return bodyBlocks(text, mask(text), 0, text.length);
}

/** A text of its own with its block `j` changed (the body of a box, a column): written in it alone. */
export function editInText(text: string, j: number, edit: (b: Block) => Block | null): string {
  const blocks = textBlocks(text);
  const b = blocks[j];
  if (!b) return text;
  const next = edit(b);
  if (!next) {
    const cut = deleteBlock(text, blocks, j);
    return dedent(applied(text, cut));
  }
  return applied(text, replaceBlock(text, blocks, j, next));
}

/** A text of its own with `block` added at its end. */
export function addToText(text: string, block: Block, unit = "\t"): string {
  const code = blockCode(block, "", unit);
  return text.trim() ? `${text.trimEnd()}${gap(textBlocks(text).at(-1), block)}${code}` : code;
}

/** Block `i` cut in two blocks (`first` in its place, `second` after it), as one change. */
export function splitBlock(text: string, blocks: Block[], i: number, first: Block, second: Block, unit = "\t"): BlockEdit {
  const b = blocks[i];
  const indent = indentAt(text, b.from);
  return { from: b.from, to: b.to, insert: `${blockCode(first, indent, unit)}${gap(first, second)}${indent}${blockCode(second, indent, unit)}`, select: i + 1 };
}

/** A text of its own with its block `j` cut in two blocks. */
export function splitInText(text: string, j: number, first: Block, second: Block): string {
  const blocks = textBlocks(text);
  return blocks[j] ? applied(text, splitBlock(text, blocks, j, first, second, indentUnit(text))) : text;
}
