// Probability trees: events on branches growing to the right, the
// probability of each branch written on it (`0,3`, `1/3`, `p`), the one
// left out of two worked out (`1 - p`), each node checked to add up to 1,
// and the probability of each path written at its end if asked. Written as
// a TikZ tree (`grow'=right`), read back from it.
//
// No local imports: tested directly by Node (`npm test`).

export interface TreeNode {
  id: string;
  /** The event, as LaTeX writes it (`A`, `\overline{A}`). */
  label: string;
  /** The probability of the branch leading to it, as typed (`0,3`, `1/3`, `p`); empty: worked out, or none. */
  prob: string;
  children: TreeNode[];
}

export interface Tree {
  /** The start of the tree (its label is usually empty). */
  root: TreeNode;
  /** The probability of each path, written at its end. */
  products: boolean;
  /** From one level to the next, in cm. */
  levelDistance: number;
  /** Between two ends of branches, in cm. */
  leafDistance: number;
  /** Options of the picture RayTeX does not set, kept as they were. */
  extra: string[];
}

let next = 0;
const newId = () => `n${++next}`;

export function node(label: string, prob = "", children: TreeNode[] = []): TreeNode {
  return { id: newId(), label, prob, children };
}

/** Two events and their contraries, as a textbook starts. */
export function emptyTree(): Tree {
  const second = () => [node("B", ""), node("\\overline{B}")];
  return {
    root: node("", "", [node("A", "", second()), node("\\overline{A}", "", second())]),
    products: false,
    levelDistance: 2.8,
    leafDistance: 1.2,
    extra: [],
  };
}

// ------------------------------------------------------------ probabilities

/** An exact number: a fraction with a sign, and whether it was written as a decimal. */
interface Exact {
  num: number;
  den: number;
  decimal: boolean;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
function exact(num: number, den: number, decimal: boolean): Exact {
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g, decimal };
}

/** A probability as a number: `0,3`, `0.25`, `1/3`, `\frac{1}{3}`, `1`; null when it is a letter (`p`). */
export function parseProb(text: string): Exact | null {
  const s = text
    .trim()
    .replace(/\s+/g, "")
    .replace(/\{,\}/g, ",")
    .replace(/^\\[dt]?frac\{(\d+)\}\{(\d+)\}$/, "$1/$2");
  let m = /^(\d+)(?:[.,](\d+))?$/.exec(s);
  if (m) {
    const decimals = m[2] ?? "";
    return exact(Number(m[1] + decimals), 10 ** decimals.length, true);
  }
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m && Number(m[2]) > 0) return exact(Number(m[1]), Number(m[2]), false);
  return null;
}

/** Whether a fraction can be written as a decimal (its denominator has only 2 and 5). */
function finite(den: number): boolean {
  let d = den;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

/** An exact number as typed back: a decimal (with a comma in French) or a fraction. */
function show(x: Exact, comma: boolean): string {
  if (x.den === 1) return String(x.num);
  if (x.decimal && finite(x.den)) {
    let k = 0;
    while (!Number.isInteger((x.num * 10 ** k) / x.den) && k < 12) k++;
    const value = ((x.num * 10 ** k) / x.den).toString().padStart(k + 1, "0");
    const text = `${value.slice(0, value.length - k)}.${value.slice(value.length - k)}`;
    return comma ? text.replace(".", ",") : text;
  }
  return `${x.num}/${x.den}`;
}

/** The other probability of two: `0,3` → `0,7`, `1/3` → `2/3`, `p` → `1-p`, `1-p` → `p`. */
export function complement(prob: string, comma: boolean): string {
  const x = parseProb(prob);
  if (x) return x.num > x.den ? "" : show(exact(x.den - x.num, x.den, x.decimal), comma);
  const s = prob.trim();
  if (!s) return "";
  const back = /^1\s*-\s*(.+)$/.exec(s);
  if (back && !/[-+]/.test(back[1])) return back[1].replace(/^\((.*)\)$/, "$1");
  return /^[A-Za-z0-9.,]+$|^\\[A-Za-z]+$/.test(s) ? `1-${s}` : `1-(${s})`;
}

/** The probabilities of the branches of a node, the one left empty of two worked out from the other. */
export function branchProbs(n: TreeNode, comma: boolean): string[] {
  const typed = n.children.map((c) => c.prob.trim());
  if (typed.length === 2) {
    if (!typed[0] && typed[1]) typed[0] = complement(typed[1], comma);
    else if (typed[0] && !typed[1]) typed[1] = complement(typed[0], comma);
  }
  return typed;
}

/** The sum of the branches of a node when they are all numbers and do not make 1; null otherwise. */
export function wrongSum(n: TreeNode, comma: boolean): string | null {
  if (!n.children.length) return null;
  const all = branchProbs(n, comma).map(parseProb);
  if (all.some((x) => !x)) return null;
  const den = all.reduce((d, x) => (d * x!.den) / gcd(d, x!.den), 1);
  const num = all.reduce((s, x) => s + (x!.num * den) / x!.den, 0);
  return num === den ? null : show(exact(num, den, all.every((x) => x!.decimal)), comma);
}

/** The probability of a path (the product of its branches), when all are numbers. */
export function pathProduct(probs: string[]): Exact | null {
  let out: Exact = { num: 1, den: 1, decimal: true };
  for (const p of probs) {
    const x = parseProb(p);
    if (!x) return null;
    out = exact(out.num * x.num, out.den * x.den, out.decimal && x.decimal);
  }
  return out;
}

/** A probability as LaTeX writes it: `0{,}3`, `\frac{1}{3}`, `1-p`. */
export function probLatex(prob: string, comma: boolean): string {
  const s = prob.trim();
  const x = parseProb(s);
  if (x && !x.decimal && x.den !== 1) {
    const m = /^(\d+)\/(\d+)$/.exec(s.replace(/\s+/g, ""));
    const [a, b] = m ? [m[1], m[2]] : [String(x.num), String(x.den)];
    return `\\frac{${a}}{${b}}`;
  }
  const text = comma ? s.replace(/(\d)\.(\d)/g, "$1,$2") : s.replace(/(\d),(\d)/g, "$1.$2");
  return text.replace(/(\d),(\d)/g, "$1{,}$2");
}

function exactLatex(x: Exact, comma: boolean): string {
  const s = show(x, comma);
  return s.includes("/") ? `\\frac{${x.num}}{${x.den}}` : s.replace(",", "{,}");
}

// --------------------------------------------------------------- the code

/** How many ends of branches there are under a node. */
function leaves(n: TreeNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1;
}

/** How deep the tree goes. */
function depth(n: TreeNode): number {
  return n.children.length ? 1 + Math.max(...n.children.map(depth)) : 0;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** The events of a path, joined: `A \cap \overline{B}`. */
const intersection = (labels: string[]) => labels.join(" \\cap ");

/** The TikZ picture of the tree (`comma`: numbers written the French way). */
export function treeCode(tree: Tree, comma = false): string {
  const levels = depth(tree.root);
  // Each level spreads its nodes by the widest of them: nothing overlaps.
  const spread: number[] = [];
  const walk = (n: TreeNode, level: number) => {
    for (const c of n.children) {
      spread[level] = Math.max(spread[level] ?? 0, leaves(c));
      walk(c, level + 1);
    }
  };
  walk(tree.root, 1);
  const options = [
    "grow'=right",
    `level distance=${round(tree.levelDistance)}cm`,
    ...Array.from({ length: levels }, (_, i) => `level ${i + 1}/.style={sibling distance=${round(tree.leafDistance * (spread[i + 1] ?? 1))}cm}`),
    ...tree.extra,
  ];
  const math = (label: string) => (label.trim() ? `$${label.trim()}$` : "");
  const lines: string[] = [comma ? "% Arbre de probabilités (RayTeX)" : "% Probability tree (RayTeX)", `\\begin{tikzpicture}[${options.join(", ")}]`, `  \\node {${math(tree.root.label)}}`];
  const write = (n: TreeNode, indent: string, path: string[], probs: string[]) => {
    const probsOf = branchProbs(n, comma);
    n.children.forEach((c, i) => {
      const prob = probsOf[i];
      const labels = [...path, c.label];
      const product = !c.children.length && tree.products ? pathProduct([...probs, prob]) : null;
      const label = product ? `[label={right:{$P(${intersection(labels)}) = ${exactLatex(product, comma)}$}}]` : "";
      // The upper half of the branches have their probability above them, the others below.
      const side = i < n.children.length / 2 ? "above" : "below";
      const edge = prob ? `edge from parent node[${side}] {$${probLatex(prob, comma)}$}` : "";
      const head = `child { node${label} {${math(c.label)}}`;
      if (!c.children.length) lines.push(`${indent}${head}${edge ? ` ${edge}` : ""} }`);
      else {
        lines.push(`${indent}${head}`);
        write(c, `${indent}  `, labels, [...probs, prob]);
        lines.push(`${indent}  ${edge ? `${edge} ` : ""}}`);
      }
    });
  };
  write(tree.root, "    ", [], []);
  lines[lines.length - 1] += ";";
  lines.push("\\end{tikzpicture}");
  return lines.join("\n");
}

// ---------------------------------------------------------- reading back

/** The end of the group opened at `open` (a `{` or a `[`), or -1. */
function groupEnd(text: string, open: number): number {
  const [o, c] = text[open] === "[" ? ["[", "]"] : ["{", "}"];
  let depthNow = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === o) depthNow++;
    else if (ch === c && --depthNow === 0) return i + 1;
  }
  return -1;
}

/** Splits options at the commas that are not in braces. */
function splitOptions(text: string): string[] {
  const out: string[] = [];
  let depthNow = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depthNow++;
    else if (ch === "}") depthNow--;
    else if (ch === "," && depthNow === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

const unmath = (s: string) => s.trim().replace(/^\$(.*)\$$/s, "$1").trim();

/** A probability as LaTeX wrote it, as it is typed: `0{,}3` → `0,3`, `\frac{1}{3}` → `1/3`. */
function typedProb(latex: string): string {
  return unmath(latex)
    .replace(/\{,\}/g, ",")
    .replace(/^\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}$/, "$1/$2");
}

/** A tree as `treeCode` writes it (or by hand, written the same way), or null. */
export function readTree(code: string): Tree | null {
  const begin = /\\begin\s*\{tikzpicture\}\s*/.exec(code);
  if (!begin) return null;
  let i = begin.index + begin[0].length;
  const tree: Tree = { root: node(""), products: false, levelDistance: 2.8, leafDistance: 1.2, extra: [] };
  let grows = false;
  if (code[i] === "[") {
    const end = groupEnd(code, i);
    if (end < 0) return null;
    for (const o of splitOptions(code.slice(i + 1, end - 1))) {
      const level = /^level distance\s*=\s*([\d.]+)\s*cm$/.exec(o);
      const sibling = /^level\s+(\d+)\/\.style\s*=\s*\{\s*sibling distance\s*=\s*([\d.]+)\s*cm\s*\}$/.exec(o);
      if (/^grow'\s*=\s*right$/.test(o)) grows = true;
      else if (level) tree.levelDistance = Number(level[1]);
      else if (!sibling) tree.extra.push(o);
    }
    i = end;
  }
  if (!grows) return null;
  const rootMatch = /^\s*\\node\s*(?:\([^)]*\))?\s*(?:\[[^\]]*\])?\s*(?:\([^)]*\))?\s*\{/.exec(code.slice(i));
  if (!rootMatch) return null;
  const open = i + rootMatch[0].length - 1;
  const close = groupEnd(code, open);
  if (close < 0) return null;
  tree.root.label = unmath(code.slice(open + 1, close - 1));
  /** Reads the `child {…}` from `from`: where they stop, or -1 when one cannot be read. */
  const children = (from: number, until: number, parent: TreeNode): number => {
    let at = from;
    for (;;) {
      const m = /^\s*child\s*\{/.exec(code.slice(at, until));
      if (!m) return at;
      const bodyOpen = at + m[0].length - 1;
      const bodyEnd = groupEnd(code, bodyOpen);
      if (bodyEnd < 0 || bodyEnd > until) return -1;
      const child = node("");
      // node[options] (name) {label}
      const head = /^\s*node\s*(\[)?/.exec(code.slice(bodyOpen + 1, bodyEnd));
      if (!head) return -1;
      let j = bodyOpen + 1 + head[0].length;
      if (head[1]) {
        const optEnd = groupEnd(code, j - 1);
        if (optEnd < 0) return -1;
        if (/\blabel\s*=/.test(code.slice(j, optEnd - 1))) tree.products = true;
        j = optEnd;
      }
      const name = /^\s*(?:\([^)]*\))?\s*\{/.exec(code.slice(j, bodyEnd));
      if (!name) return -1;
      const labelOpen = j + name[0].length - 1;
      const labelEnd = groupEnd(code, labelOpen);
      if (labelEnd < 0) return -1;
      child.label = unmath(code.slice(labelOpen + 1, labelEnd - 1));
      // Its branches, then the probability of its own.
      const after = children(labelEnd, bodyEnd - 1, child);
      if (after < 0) return -1;
      const edge = /^\s*edge from parent\s*node\s*(?:\[[^\]]*\])?\s*\{/.exec(code.slice(after, bodyEnd - 1));
      if (edge) {
        const probOpen = after + edge[0].length - 1;
        const probEnd = groupEnd(code, probOpen);
        if (probEnd < 0) return -1;
        child.prob = typedProb(code.slice(probOpen + 1, probEnd - 1));
      }
      parent.children.push(child);
      at = bodyEnd;
    }
  };
  if (children(close, code.length, tree.root) < 0 || !tree.root.children.length) return null;
  // The space between the ends, from the deepest level.
  const levels = depth(tree.root);
  const deepest = new RegExp(`level\\s+${levels}\\/\\.style\\s*=\\s*\\{\\s*sibling distance\\s*=\\s*([\\d.]+)\\s*cm`).exec(code);
  if (deepest) tree.leafDistance = Number(deepest[1]);
  // The probabilities worked out are not typed: one of two left empty again.
  const untype = (n: TreeNode) => {
    if (n.children.length === 2) {
      const [a, b] = n.children;
      if (a.prob && b.prob && complement(a.prob, a.prob.includes(",") || b.prob.includes(",")) === b.prob) b.prob = "";
    }
    n.children.forEach(untype);
  };
  untype(tree.root);
  return tree;
}

// ------------------------------------------------------------ editing

/** The node of `id` and its parent. */
export function find(tree: Tree, id: string): { node: TreeNode; parent: TreeNode | null } | null {
  const walk = (n: TreeNode, parent: TreeNode | null): { node: TreeNode; parent: TreeNode | null } | null => {
    if (n.id === id) return { node: n, parent };
    for (const c of n.children) {
      const f = walk(c, n);
      if (f) return f;
    }
    return null;
  };
  return walk(tree.root, null);
}

/** The nodes in the order they are shown, with their depth. */
export function rows(tree: Tree): { node: TreeNode; parent: TreeNode; depth: number }[] {
  const out: { node: TreeNode; parent: TreeNode; depth: number }[] = [];
  const walk = (n: TreeNode, d: number) => {
    for (const c of n.children) {
      out.push({ node: c, parent: n, depth: d });
      walk(c, d + 1);
    }
  };
  walk(tree.root, 0);
  return out;
}

/** The event and its contrary: `A` ↔ `\overline{A}`. */
export function contrary(label: string): string {
  const m = /^\\overline\s*\{(.*)\}$/.exec(label.trim());
  return m ? m[1] : `\\overline{${label.trim()}}`;
}

/** A level more: under each end, an event and its contrary (the next letter). */
export function addLevel(tree: Tree): void {
  const used = new Set(rows(tree).map((r) => r.node.label.replace(/^\\overline\s*\{(.*)\}$/, "$1")));
  const letter = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((l) => !used.has(l)) ?? "X";
  const walk = (n: TreeNode) => {
    if (!n.children.length) n.children = [node(letter), node(contrary(letter))];
    else n.children.forEach(walk);
  };
  walk(tree.root);
}

/** The same events, in the same order, under every node of a level as under the first of it. */
export function sameEvents(tree: Tree): void {
  const byLevel: TreeNode[][] = [];
  const walk = (n: TreeNode, d: number) => {
    (byLevel[d] ??= []).push(n);
    n.children.forEach((c) => walk(c, d + 1));
  };
  walk(tree.root, 0);
  for (const nodes of byLevel) {
    const model = nodes.find((n) => n.children.length);
    if (!model) continue;
    for (const n of nodes) {
      if (n === model || !n.children.length) continue;
      model.children.forEach((c, i) => {
        if (n.children[i]) n.children[i].label = c.label;
        else n.children.push(node(c.label, "", []));
      });
      n.children.length = model.children.length;
    }
  }
}
