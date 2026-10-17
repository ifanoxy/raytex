// A Beamer deck as the slides mode sees it: its frames (where each one is
// in the text, its title, its options, its notes), the sections between
// them, the pages of the PDF each frame gives (from the `.nav` file Beamer
// writes, steps of reveals included), and what is done to frames, written
// back as text: added from a layout, duplicated, deleted, moved, its title
// and notes changed.
//
// No local imports: tested directly by Node (`npm test`).

export interface Frame {
  /** Where the whole frame is: from `\begin{frame}` to the end of `\end{frame}`. */
  from: number;
  to: number;
  /** Where its body is: after its header (overlay, options, title, subtitle), up to `\end{frame}`. */
  bodyFrom: number;
  bodyTo: number;
  /** Its title (`{…}` after the options, or `\frametitle{…}`) and subtitle. */
  title: string;
  subtitle: string;
  /** Its options as written (`fragile`, `plain`…). */
  options: string;
  /** The notes of the speaker (`\note{…}`), in the frame or right after it. */
  notes: Note[];
  /** It shows the title page (`\titlepage`, `\maketitle`). */
  titlePage: boolean;
  /** The section it belongs to (the last `\section` before it), or "". */
  section: string;
  /** Its line in the text (from 1). */
  line: number;
}

export interface Note {
  from: number;
  to: number;
  /** What is in its braces. */
  text: string;
}

export interface Deck {
  /** The document is of the class beamer. */
  beamer: boolean;
  frames: Frame[];
}

/** The text with its comments blanked (offsets kept). */
export function mask(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      out += text.slice(i, i + 2);
      i++;
    } else if (c === "%") {
      const nl = text.indexOf("\n", i);
      const end = nl < 0 ? text.length : nl;
      out += " ".repeat(end - i);
      i = end - 1;
    } else out += c;
  }
  return out;
}

/** The end of the group opened at `open` (`{`, `[` or `<`), or -1. */
function groupEnd(code: string, open: number): number {
  const pairs: Record<string, string> = { "{": "}", "[": "]", "<": ">" };
  const o = code[open];
  const c = pairs[o];
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === "\\") i++;
    else if (ch === o) depth++;
    else if (ch === c && --depth === 0) return i + 1;
    // A brace group inside options is passed over whole.
    else if (o !== "{" && ch === "{") {
      const end = groupEnd(code, i);
      if (end < 0) return -1;
      i = end - 1;
    }
  }
  return -1;
}

function skipSpaces(code: string, i: number): number {
  while (i < code.length && /\s/.test(code[i])) i++;
  return i;
}

function lineOf(text: string, at: number): number {
  let n = 1;
  for (let i = text.indexOf("\n"); i >= 0 && i < at; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

const NOTE = /\\note\s*(?:\[[^\]]*\])?\s*\{/g;

/** The notes found in `code` between `from` and `to`. */
function notesIn(text: string, code: string, from: number, to: number): Note[] {
  const out: Note[] = [];
  const re = new RegExp(NOTE.source, "g");
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) && m.index < to) {
    const open = m.index + m[0].length - 1;
    const end = groupEnd(code, open);
    if (end < 0 || end > to) break;
    out.push({ from: m.index, to: end, text: text.slice(open + 1, end - 1).trim() });
    re.lastIndex = end;
  }
  return out;
}

/** The frames of a document, in order. */
export function parseDeck(text: string): Deck {
  const code = mask(text);
  const beamer = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{\s*beamer\s*\}/.test(code);
  const begin = code.indexOf("\\begin{document}");
  const start = begin < 0 ? 0 : begin;
  const frames: Frame[] = [];
  const sections: { at: number; name: string }[] = [];
  for (const m of code.slice(start).matchAll(/\\section\*?\s*(?:\[[^\]]*\])?\s*\{/g)) {
    const open = start + m.index! + m[0].length - 1;
    const end = groupEnd(code, open);
    if (end > 0) sections.push({ at: start + m.index!, name: text.slice(open + 1, end - 1).trim() });
  }
  const re = /\\begin\s*\{frame\}/g;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const from = m.index;
    const endAt = code.indexOf("\\end{frame}", from);
    if (endAt < 0) break;
    const to = endAt + "\\end{frame}".length;
    // The header: <overlay> [options] {title} {subtitle}, spaces between them.
    let i = from + m[0].length;
    let options = "";
    let title = "";
    let subtitle = "";
    for (let round = 0; round < 4; round++) {
      const j = skipSpaces(code, i);
      const ch = code[j];
      if (ch === "<" && round === 0) {
        const e = groupEnd(code, j);
        if (e < 0) break;
        i = e;
      } else if (ch === "[" && !options && !title) {
        const e = groupEnd(code, j);
        if (e < 0) break;
        options = text.slice(j + 1, e - 1).trim();
        i = e;
      } else if (ch === "{" && !subtitle) {
        const e = groupEnd(code, j);
        if (e < 0 || e > endAt) break;
        if (!title) title = text.slice(j + 1, e - 1).trim();
        else subtitle = text.slice(j + 1, e - 1).trim();
        i = e;
        if (subtitle) break;
      } else break;
    }
    const bodyFrom = i;
    const body = code.slice(bodyFrom, endAt);
    const command = (name: string) => {
      const c = new RegExp(`\\\\${name}\\s*(?:<[^>]*>)?\\s*(?:\\[[^\\]]*\\])?\\s*\\{`).exec(body);
      if (!c) return "";
      const open = bodyFrom + c.index + c[0].length - 1;
      const e = groupEnd(code, open);
      return e > 0 ? text.slice(open + 1, e - 1).trim() : "";
    };
    if (!title) title = command("frametitle");
    if (!subtitle) subtitle = command("framesubtitle");
    // Notes in the frame, and those written right after it, before what comes next.
    const nextBegin = code.indexOf("\\begin{frame}", to);
    const nextSection = sections.find((s) => s.at >= to)?.at ?? -1;
    const limits = [nextBegin, nextSection, code.indexOf("\\end{document}", to)].filter((x) => x >= 0);
    const after = limits.length ? Math.min(...limits) : code.length;
    // After it: the notes that follow it with nothing else between.
    const following: Note[] = [];
    let gapFrom = to;
    for (const n of notesIn(text, code, to, after)) {
      if (code.slice(gapFrom, n.from).trim()) break;
      following.push(n);
      gapFrom = n.to;
    }
    const notes = [...notesIn(text, code, bodyFrom, endAt), ...following];
    frames.push({
      from,
      to,
      bodyFrom,
      bodyTo: endAt,
      title,
      subtitle,
      options,
      notes,
      titlePage: /\\(?:titlepage|maketitle)(?![A-Za-z@])/.test(body),
      section: [...sections].reverse().find((s) => s.at < from)?.name ?? "",
      line: lineOf(text, from),
    });
    re.lastIndex = to;
  }
  return { beamer, frames };
}

/** The pages of each frame, first and last (from 1), read from the `.nav` file of a build. */
export function framePages(nav: string): [number, number][] {
  return [...nav.matchAll(/\\beamer@framepages\s*\{(\d+)\}\s*\{(\d+)\}/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

/** The pages of frame `index`: from the `.nav` when it has as many frames, else one page a frame. */
export function pagesOf(pages: [number, number][], count: number, index: number): [number, number] {
  if (pages.length === count && pages[index]) return pages[index];
  return [index + 1, index + 1];
}

// ------------------------------------------------------------ layouts

/** What a new slide holds, ready to fill. */
export type Layout = "title-content" | "title-only" | "two-columns" | "image" | "section" | "blank";
export const LAYOUTS: Layout[] = ["title-content", "two-columns", "image", "title-only", "section", "blank"];

const WORDS = {
  fr: { title: "Titre de la diapositive", point: "Premier point", second: "Deuxième point", left: "À gauche", right: "À droite", section: "Nouvelle partie", caption: "Légende" },
  en: { title: "Title of the slide", point: "First point", second: "Second point", left: "On the left", right: "On the right", section: "New part", caption: "Caption" },
};

/** The text of a new frame (`\t` for each level of indentation). */
export function layoutCode(layout: Layout, lang: "fr" | "en"): string {
  const w = WORDS[lang];
  switch (layout) {
    case "title-content":
      return `\\begin{frame}{${w.title}}\n\t\\begin{itemize}\n\t\t\\item ${w.point}\n\t\t\\item ${w.second}\n\t\\end{itemize}\n\\end{frame}`;
    case "two-columns":
      return `\\begin{frame}{${w.title}}\n\t\\begin{columns}\n\t\t\\begin{column}{0.48\\textwidth}\n\t\t\t${w.left}\n\t\t\\end{column}\n\t\t\\begin{column}{0.48\\textwidth}\n\t\t\t${w.right}\n\t\t\\end{column}\n\t\\end{columns}\n\\end{frame}`;
    case "image":
      return `\\begin{frame}{${w.title}}\n\t\\begin{figure}\n\t\t\\centering\n\t\t\\includegraphics[width=0.7\\textwidth]{example-image}\n\t\t\\caption{${w.caption}}\n\t\\end{figure}\n\\end{frame}`;
    case "title-only":
      return `\\begin{frame}{${w.title}}\n\\end{frame}`;
    case "section":
      return `\\section{${w.section}}\n\\begin{frame}\n\t\\sectionpage\n\\end{frame}`;
    case "blank":
      return `\\begin{frame}[plain]\n\\end{frame}`;
  }
}

// --------------------------------------------------------- operations

/** A change of the text: what is replaced, and where the slide of interest is then. */
export interface DeckEdit {
  from: number;
  to: number;
  insert: string;
  /** The index of the frame to select after it. */
  select: number;
}

/** Where a frame starts its line (with what indents it), and the end of its line. */
function lineBounds(text: string, from: number, to: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  const nl = text.indexOf("\n", to);
  return { start: /^\s*$/.test(text.slice(start, from)) ? start : from, end: nl < 0 ? text.length : nl + 1 };
}

/** The whole of frame `i` with the notes after it, on its own lines. */
function span(text: string, frame: Frame): { start: number; end: number } {
  const last = frame.notes.filter((n) => n.from > frame.to).reduce((e, n) => Math.max(e, n.to), frame.to);
  return lineBounds(text, frame.from, last);
}

/** A new frame after frame `after` (-1: before the first; the deck empty: before `\end{document}`). */
export function insertFrame(text: string, deck: Deck, after: number, layout: Layout, lang: "fr" | "en"): DeckEdit | null {
  const code = `${layoutCode(layout, lang)}\n`;
  if (!deck.frames.length) {
    const end = text.indexOf("\\end{document}");
    if (end < 0) return null;
    return { from: end, to: end, insert: `${code}\n`, select: 0 };
  }
  if (after < 0) {
    const first = span(text, deck.frames[0]);
    return { from: first.start, to: first.start, insert: `${code}\n`, select: 0 };
  }
  const at = span(text, deck.frames[Math.min(after, deck.frames.length - 1)]).end;
  return { from: at, to: at, insert: `\n${code}`, select: after + 1 };
}

/** A copy of frame `i`, right after it. */
export function duplicateFrame(text: string, deck: Deck, i: number): DeckEdit | null {
  const frame = deck.frames[i];
  if (!frame) return null;
  const s = span(text, frame);
  const copy = text.slice(s.start, s.end);
  return { from: s.end, to: s.end, insert: `\n${copy.endsWith("\n") ? copy : `${copy}\n`}`, select: i + 1 };
}

/** Frame `i` taken out, with its notes and the blank line before it. */
export function deleteFrame(text: string, deck: Deck, i: number): DeckEdit | null {
  const frame = deck.frames[i];
  if (!frame) return null;
  const s = span(text, frame);
  let start = s.start;
  if (text.slice(Math.max(0, start - 2), start) === "\n\n") start--;
  return { from: start, to: s.end, insert: "", select: Math.max(0, Math.min(i, deck.frames.length - 2)) };
}

/** Frame `i` moved to the place `to` (the index it has once moved). */
export function moveFrame(text: string, deck: Deck, i: number, to: number): { text: string; select: number } | null {
  const frame = deck.frames[i];
  if (!frame || to === i || to < 0 || to >= deck.frames.length) return null;
  const s = span(text, frame);
  const block = text.slice(s.start, s.end);
  // Taken out with the blank line before it, then put back before or after the frame it meets.
  let cutStart = s.start;
  if (text.slice(Math.max(0, cutStart - 2), cutStart) === "\n\n") cutStart--;
  const without = text.slice(0, cutStart) + text.slice(s.end);
  const shift = (x: number) => (x >= s.end ? x - (s.end - cutStart) : x);
  const target = deck.frames[to];
  const t = span(text, target);
  const body = block.endsWith("\n") ? block : `${block}\n`;
  if (to < i) {
    const at = shift(t.start);
    return { text: `${without.slice(0, at)}${body}\n${without.slice(at)}`, select: to };
  }
  const at = shift(t.end);
  return { text: `${without.slice(0, at)}\n${body}${without.slice(at)}`, select: to };
}

/** The notes of frame `i` set to `notes` (one `\note{…}` at the end of its body; none when empty). */
export function setNotes(text: string, deck: Deck, i: number, notes: string): DeckEdit | null {
  const frame = deck.frames[i];
  if (!frame) return null;
  const wanted = notes.trim();
  if (frame.notes.length) {
    // The first note holds them all, the others go.
    const first = frame.notes[0];
    const others = frame.notes.slice(1);
    let out = text;
    for (const n of [...others].reverse()) {
      const b = lineBounds(out, n.from, n.to);
      out = out.slice(0, b.start) + out.slice(b.end);
    }
    const b = lineBounds(out, first.from, first.to);
    const replaced = wanted ? out.slice(0, first.from) + `\\note{${wanted}}` + out.slice(first.to) : out.slice(0, b.start) + out.slice(b.end);
    return { from: 0, to: text.length, insert: replaced, select: i };
  }
  if (!wanted) return null;
  const indent = /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", frame.from - 1) + 1))![0];
  return { from: frame.bodyTo, to: frame.bodyTo, insert: `${text.slice(frame.bodyTo - 1, frame.bodyTo) === "\n" ? "" : "\n"}${indent}\t\\note{${wanted}}\n${indent}`, select: i };
}

/** The title of frame `i` set to `title` (where it is written, else after the options). */
export function setTitle(text: string, deck: Deck, i: number, title: string): DeckEdit | null {
  const frame = deck.frames[i];
  if (!frame) return null;
  const code = mask(text);
  const header = code.slice(frame.from, frame.bodyFrom);
  const t = title.trim();
  // In the header: the first brace group of it.
  const open = header.indexOf("{", "\\begin{frame}".length);
  if (open >= 0 && frame.title && text.slice(frame.from + open + 1, frame.from + groupEnd(header, open) - 1).trim() === frame.title) {
    const o = frame.from + open;
    const e = frame.from + groupEnd(header, open);
    return { from: o, to: e, insert: `{${t}}`, select: i };
  }
  const ft = /\\frametitle\s*\{/.exec(code.slice(frame.bodyFrom, frame.bodyTo));
  if (ft) {
    const o = frame.bodyFrom + ft.index + ft[0].length - 1;
    const e = groupEnd(code, o);
    return { from: o, to: e, insert: `{${t}}`, select: i };
  }
  return { from: frame.bodyFrom, to: frame.bodyFrom, insert: `{${t}}`, select: i };
}
