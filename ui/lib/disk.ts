// Telling a file changed by another program from the echo of RayTeX's own
// saves. The watcher reports every change of the project folder, RayTeX's
// writes included, and on macOS it reports them late: by then the text of
// the editor has moved on, and comparing it with the disk says nothing.
// No local imports: tested directly by Node (`npm test`).

/** A short print of a text: its length and a 32-bit FNV-1a hash. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

/** A text RayTeX wrote to a file, and when. */
export interface Written {
  print: string;
  at: number;
}

/** How long a write is remembered: the watcher is never that late. */
export const WRITTEN_FOR_MS = 20_000;

/** Remembers a write (the last ones only, and not for long). */
export function remember(written: Written[], text: string, now: number): Written[] {
  const print = fingerprint(text);
  const recent = written.filter((w) => now - w.at < WRITTEN_FOR_MS && w.print !== print);
  return [...recent.slice(-3), { print, at: now }];
}

/**
 * What a change of an open file on disk means:
 * - `same`: the disk holds what the editor shows;
 * - `own`: the disk holds what RayTeX wrote a moment ago (the report comes
 *   late, the text was changed since): nothing happened;
 * - `reload`: another program changed the file, and the editor has nothing
 *   unsaved: it takes the new text;
 * - `conflict`: another program changed the file, and the editor has
 *   unsaved changes: the user chooses.
 */
export type DiskChange = "same" | "own" | "reload" | "conflict";

export function diskChange(o: { disk: string; buffer: string; dirty: boolean; written: readonly Written[]; now: number }): DiskChange {
  if (o.disk === o.buffer) return "same";
  const print = fingerprint(o.disk);
  if (o.written.some((w) => w.print === print && o.now - w.at < WRITTEN_FOR_MS)) return "own";
  return o.dirty ? "conflict" : "reload";
}
