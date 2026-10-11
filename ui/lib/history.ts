// The local history of a project (kept by the engine, history.rs): what the
// window shows of it. Moments by day, a comparison folded around what
// changed, and the part of a line that is not what it was.

/** The `history` section of the settings: light by default. */
export interface HistorySettings {
  /** Keep moments of the projects. */
  enabled: boolean;
  /** At most one moment every so many minutes while the project changes. */
  intervalMinutes: number;
  /** Moments older than this many days are dropped. */
  keepDays: number;
}

declare module "./types" {
  interface Settings {
    history: HistorySettings;
  }
}

export const HISTORY_DEFAULTS: HistorySettings = { enabled: true, intervalMinutes: 10, keepDays: 30 };
/** The choices offered in the settings. */
export const INTERVALS = [5, 10, 30, 60];
export const KEEP_DAYS = [7, 30, 90, 365];

/** A moment of the history. */
export interface Moment {
  id: string;
  /** Milliseconds since 1970. */
  time: number;
  /** Why it was taken: `open`, `save`, `manual`, `before-restore`. */
  reason: string;
  /** Number of files it holds. */
  files: number;
  /** The files that were not what they were at the moment before. */
  changed: string[];
}

export type ChangeStatus = "changed" | "added" | "removed";

/** A file that is not what it was at a moment. */
export interface Change {
  /** Path in the project, with `/`. */
  path: string;
  status: ChangeStatus;
}

export interface DiffLine {
  kind: "same" | "removed" | "added";
  text: string;
  /** Its number in the text before, and after (from 1). */
  before: number | null;
  after: number | null;
}

/** A file then and now. */
export interface Comparison {
  /** Its text at the moment (null when it did not exist). */
  then: string | null;
  /** Whether it exists now. */
  exists: boolean;
  lines: DiffLine[];
}

export interface HistoryView {
  /** The project has a history (not a file opened on its own). */
  available: boolean;
  /** The moments, the latest first. */
  moments: Moment[];
  /** Size on disk, in bytes. */
  size: number;
}

/** Midnight (local time) of the day of `time`. */
export function dayOf(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The moments grouped by day, as they come (the latest first). */
export function byDay(moments: Moment[]): { day: number; moments: Moment[] }[] {
  const out: { day: number; moments: Moment[] }[] = [];
  for (const m of moments) {
    const day = dayOf(m.time);
    const last = out[out.length - 1];
    if (last?.day === day) last.moments.push(m);
    else out.push({ day, moments: [m] });
  }
  return out;
}

/** How a day is named: `today`, `yesterday`, or its date. */
export function dayName(day: number, now: number): "today" | "yesterday" | "date" {
  const today = dayOf(now);
  if (day === today) return "today";
  // Not a subtraction of 24 hours: a day of a clock change is not 24 hours long.
  const before = new Date(today);
  before.setDate(before.getDate() - 1);
  return day === before.getTime() ? "yesterday" : "date";
}

/** The part of a line that differs from the line it replaces. */
export interface Span {
  from: number;
  to: number;
}

/** A row of a comparison as it is shown. */
export type Row =
  | { type: "line"; line: DiffLine; span?: Span }
  /** Lines that did not change, folded. */
  | { type: "gap"; count: number };

/**
 * What differs between a line and the one that replaces it: the words
 * between their common start and common end. Null when they have too little in
 * common for it to say anything.
 */
export function changedPart(before: string, after: string): { before: Span; after: Span } | null {
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  // Whole words: `mange` → `attrape`, not `mang` → `attrap`.
  const word = (c: string | undefined) => !!c && /[\p{L}\p{N}_\\]/u.test(c);
  while (start > 0 && word(before[start - 1]) && (word(before[start]) || word(after[start]))) start--;
  while (end > 0 && word(before[before.length - end]) && (word(before[before.length - end - 1]) || word(after[after.length - end - 1]))) end--;
  const common = start + end;
  if (common < 4 || common * 3 < Math.max(before.length, after.length)) return null;
  return { before: { from: start, to: before.length - end }, after: { from: start, to: after.length - end } };
}

/**
 * The comparison as it is shown: the lines that changed with `context`
 * lines around them, the rest folded. Lines removed and then added in equal
 * number are replacements: the part that differs is marked in each.
 */
export function rows(lines: DiffLine[], context = 3): Row[] {
  const spans = new Map<number, Span>();
  for (let i = 0; i < lines.length; ) {
    if (lines[i].kind !== "removed") {
      i++;
      continue;
    }
    let removed = i;
    while (removed < lines.length && lines[removed].kind === "removed") removed++;
    let added = removed;
    while (added < lines.length && lines[added].kind === "added") added++;
    if (removed - i === added - removed) {
      for (let k = 0; k < removed - i; k++) {
        const part = changedPart(lines[i + k].text, lines[removed + k].text);
        if (!part) continue;
        spans.set(i + k, part.before);
        spans.set(removed + k, part.after);
      }
    }
    i = added;
  }

  const shown = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) shown[k] = true;
  });
  const out: Row[] = [];
  let hidden = 0;
  lines.forEach((line, i) => {
    if (!shown[i]) {
      hidden++;
      return;
    }
    if (hidden) out.push({ type: "gap", count: hidden });
    hidden = 0;
    const span = spans.get(i);
    out.push(span && span.to > span.from ? { type: "line", line, span } : { type: "line", line });
  });
  if (hidden && out.length) out.push({ type: "gap", count: hidden });
  return out;
}

/** How many lines were added and removed. */
export function counts(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "added") added++;
    else if (l.kind === "removed") removed++;
  }
  return { added, removed };
}

/** A size as it is read: `840 o`, `12 Ko`, `1,4 Mo` (`B`, `KB`, `MB` in English). */
export function sizeLabel(bytes: number, lang: "fr" | "en"): string {
  const units = lang === "fr" ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
