// Shortcuts learned from what is typed: a command typed in full, letter by
// letter, again and again, gets an offer of an `@` shortcut (one of RayTeX
// that writes it, or a new one). Once per command, never twice, and not
// for the commands that have their own tool, key or snippet.
// No local imports: tested directly by Node (`npm test`).

/** Typed this many times before an offer. */
export const OFFER_AFTER = 6;

/** Commands with a tool, a key or a snippet of their own, and the shortest ones. */
const LEFT_OUT = new Set([
  "begin", "end", "item", "label", "ref", "eqref", "pageref", "cite", "citep", "citet", "section", "subsection", "subsubsection", "chapter",
  "paragraph", "part", "textbf", "textit", "emph", "underline", "texttt", "input", "include", "includegraphics", "caption", "centering",
  "usepackage", "documentclass", "newcommand", "renewcommand", "hline", "toprule", "midrule", "bottomrule", "newline", "newpage", "clearpage",
  "noindent", "vspace", "hspace", "footnote", "maketitle", "tableofcontents", "left", "right", "quad", "qquad", "text", "mathrm",
  "hfill", "vfill", "smallskip", "medskip", "bigskip", "linewidth", "textwidth", "today", "LaTeX", "TeX",
]);

/** Whether a command typed in full is worth a shortcut. */
export function worthShortcut(name: string): boolean {
  return name.length >= 4 && !LEFT_OUT.has(name);
}

/** What has been typed, and what was offered (kept on this computer). */
export interface LearnedState {
  counts: Record<string, number>;
  offered: string[];
}

/** One more time `name` was typed; true when it is time to offer a shortcut. */
export function typedOnce(state: LearnedState, name: string): boolean {
  if (!worthShortcut(name) || state.offered.includes(name)) return false;
  state.counts[name] = (state.counts[name] ?? 0) + 1;
  return state.counts[name] >= OFFER_AFTER;
}

/**
 * A shortcut of RayTeX that writes `\name`, alone or with fields for its
 * arguments, if any (`@N` writes `\mathbb{N}`, not `\mathbb` itself).
 */
export function existingShortcut(name: string, shortcuts: readonly [string, string][]): string | null {
  const alone = new RegExp(`^\\\\${name}(?:\\{\\$\\{\\d+(?::[^}]*)?\\}\\})*$`);
  const found = shortcuts.find(([, body]) => alone.test(body));
  return found ? found[0] : null;
}

/** A key for a new shortcut of `name`: its first letters, as few as are free. */
export function newKey(name: string, taken: ReadonlySet<string>): string {
  const letters = name.replace(/^(math|text)(?=[a-z]{2})/, "").toLowerCase();
  for (let n = 2; n <= Math.min(letters.length, 6); n++) {
    const key = letters.slice(0, n);
    if (!taken.has(key)) return key;
  }
  for (let i = 2; i < 100; i++) {
    const key = `${letters.slice(0, 2)}${i}`;
    if (!taken.has(key)) return key;
  }
  return letters;
}

/** The body of the new shortcut: the command, its argument as a field when it was given one. */
export function shortcutBody(name: string, withArgument: boolean): string {
  return withArgument ? `\\${name}{\${1}}` : `\\${name}`;
}
