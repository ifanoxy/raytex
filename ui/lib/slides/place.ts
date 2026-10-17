// Where the blocks of a slide are on its page. SyncTeX cannot tell: Beamer
// reads the whole body of a frame before setting it (to set it again at
// each step), so all of it is recorded at the line of `\end{frame}`. The
// words of each block are looked for among the texts drawn on the page
// instead; a block without words (a picture, a formula) takes the space
// left between the blocks around it.
//
// Local imports with their extension: tested directly by Node (`npm test`).

import type { Block } from "./blocks.ts";

/** A text drawn on the page, in points from its top left corner. */
export interface PageText {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The words of a text, as compared: without accents, ligatures or case, two letters at least. */
export function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

/** What a piece of LaTeX shows as words (commands, environments, options and overlays left out). */
export function shownWords(latex: string): string[] {
  const plain = latex
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\\(?:begin|end)\s*\{[^}]*\}(?:\s*\{[\d.]*\\(?:textwidth|linewidth|columnwidth)\})?/g, " ")
    .replace(/\\(?:includegraphics|label|ref|eqref|cite|url|input|vspace\*?|hspace\*?|textcolor|color|setlength)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, " ")
    .replace(/\\item\s*<[^>]*>/g, " ")
    .replace(/\[<[^>]*>\]/g, " ")
    .replace(/\\[A-Za-z@]+\*?/g, " ");
  return words(plain);
}

/** The words of a block, as its slide shows them. */
export function blockWords(b: Block): string[] {
  switch (b.kind) {
    case "list":
      return shownWords((b.items ?? []).map((it) => it.text).join(" "));
    case "columns":
      return shownWords((b.columns ?? []).map((c) => c.text).join(" "));
    case "box":
      return shownWords(`${b.title ?? ""} ${b.text}`);
    case "image":
      return shownWords(b.caption ?? "");
    case "pause":
    case "special":
      return [];
    default:
      return shownWords(b.text);
  }
}

const union = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
};

/**
 * Where each block is on the page (`null`: nowhere to be seen, a pause),
 * from the texts drawn on it; `title` is the title of the slide, whose
 * texts are no block's.
 */
export function placeBlocks(texts: PageText[], blocks: Block[], title: string, page: { width: number; height: number }): (Box | null)[] {
  const sets = blocks.map((b) => new Set(blockWords(b)));
  const titleSet = new Set(words(title));
  // How rare a word is among the blocks: a word of one block only says more.
  const holders = (w: string) => sets.filter((s) => s.has(w)).length + (titleSet.has(w) ? 1 : 0);
  // The band of the theme at the bottom of the page (author, date, number) is no block's.
  const shown = texts.filter((t) => t.str.trim() && t.y + t.height / 2 < page.height * 0.94);
  const owner = new Array<number>(shown.length).fill(-1);
  /** The blocks a text could be of, as much as one another. */
  const doubt: number[][] = shown.map(() => []);
  const titleTexts: PageText[] = [];
  shown.forEach((t, k) => {
    const ws = words(t.str);
    if (!ws.length) return;
    const score = (set: Set<string>) => ws.reduce((n, w) => n + (set.has(w) ? 1 / holders(w) : 0), 0);
    const found = (set: Set<string>) => ws.filter((w) => set.has(w)).length / ws.length;
    let best: number[] = [];
    let bestScore = 0;
    sets.forEach((set, i) => {
      if (found(set) < 0.5) return;
      const s = score(set);
      if (s > bestScore + 1e-9) {
        best = [i];
        bestScore = s;
      } else if (Math.abs(s - bestScore) < 1e-9) best.push(i);
    });
    if (titleSet.size && found(titleSet) >= 0.5 && score(titleSet) >= bestScore) titleTexts.push(t);
    else if (best.length === 1) owner[k] = best[0];
    else doubt[k] = best;
  });
  // A text that could be of two blocks goes with the nearest one seen.
  const placedOf = (i: number) => shown.filter((_, k) => owner[k] === i);
  shown.forEach((t, k) => {
    if (doubt[k].length < 2) return;
    let nearest = Infinity;
    for (const i of doubt[k]) {
      for (const o of placedOf(i)) {
        const d = Math.abs(o.y - t.y);
        if (d < nearest) {
          nearest = d;
          owner[k] = i;
        }
      }
    }
  });
  const out: (Box | null)[] = blocks.map((_, i) => {
    const mine = shown.filter((_, k) => owner[k] === i);
    return mine.length ? union(mine) : null;
  });
  // Blocks without words: the space between the blocks seen around them.
  const placed = out.filter((b): b is Box => !!b);
  const left = placed.length ? Math.min(...placed.map((b) => b.x)) : page.width * 0.06;
  const right = placed.length ? Math.max(...placed.map((b) => b.x + b.width)) : page.width * 0.94;
  const top = titleTexts.length ? union(titleTexts).y + union(titleTexts).height + 4 : page.height * 0.14;
  const bottom = page.height * 0.92;
  for (let i = 0; i < blocks.length; i++) {
    if (out[i] || blocks[i].kind === "pause") continue;
    let j = i;
    while (j < blocks.length && !out[j]) j++;
    // Blocks i to j - 1 have no place: they share the space between i - 1 and j.
    const before = out.slice(0, i).filter((b): b is Box => !!b);
    const from = before.length ? Math.max(...before.map((b) => b.y + b.height)) + 2 : top;
    const to = j < blocks.length ? out[j]!.y - 2 : bottom;
    const empty = blocks.slice(i, j).map((b, k) => (b.kind === "pause" ? -1 : k)).filter((k) => k >= 0);
    if (to - from > 8) {
      const share = (to - from) / empty.length;
      empty.forEach((k, n) => (out[i + k] = { x: left, y: from + n * share, width: Math.max(right - left, page.width * 0.3), height: share }));
    }
    i = j - 1;
  }
  return out;
}

/** The block at a point of the page: the one it is in, else the nearest one above or below. */
export function blockAt(boxes: (Box | null)[], x: number, y: number): number {
  let best = -1;
  let bestArea = Infinity;
  boxes.forEach((b, i) => {
    if (!b || x < b.x - 4 || x > b.x + b.width + 4 || y < b.y - 4 || y > b.y + b.height + 4) return;
    const area = b.width * b.height;
    if (area < bestArea) {
      best = i;
      bestArea = area;
    }
  });
  if (best >= 0) return best;
  let nearest = Infinity;
  boxes.forEach((b, i) => {
    if (!b) return;
    const d = y < b.y ? b.y - y : y > b.y + b.height ? y - b.y - b.height : 0;
    if (d < nearest && d < 24) {
      nearest = d;
      best = i;
    }
  });
  return best;
}
