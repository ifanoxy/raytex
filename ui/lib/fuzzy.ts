// Fuzzy matching for the command palette and quick open.

export interface FuzzyResult {
  score: number;
  /** Indices of the matched characters (for highlighting). */
  indices: number[];
}

const SEPARATOR = /[\s/\\._\-:()[\]{}]/;

/** Subsequence match with bonuses for word starts and consecutive characters. */
export function fuzzy(query: string, text: string): FuzzyResult | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  // Exact substring: best case.
  const at = s.indexOf(q);
  if (at >= 0) {
    const start = at === 0 || SEPARATOR.test(s[at - 1]);
    return { score: 1000 - at + (start ? 200 : 0) - s.length * 0.5, indices: Array.from({ length: q.length }, (_, i) => at + i) };
  }
  const indices: number[] = [];
  let score = 0;
  let prev = -2;
  let j = 0;
  for (let i = 0; i < s.length && j < q.length; i++) {
    if (s[i] !== q[j]) continue;
    let bonus = 1;
    if (i === 0 || SEPARATOR.test(s[i - 1]) || (text[i] >= "A" && text[i] <= "Z")) bonus += 8;
    if (prev === i - 1) bonus += 5;
    score += bonus;
    indices.push(i);
    prev = i;
    j++;
  }
  if (j < q.length) return null;
  return { score: score - s.length * 0.2, indices };
}

/** Splits `text` into highlighted and plain parts. */
export function highlight(text: string, indices: number[]): { text: string; hit: boolean }[] {
  const set = new Set(indices);
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else parts.push({ text: text[i], hit });
  }
  return parts;
}
