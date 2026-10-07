// Matching keyboard events with shortcuts written in CodeMirror notation
// (`Mod-Shift-z`). No local imports: tested directly by Node (`npm test`).

/** The parts of the event the matching needs (a KeyboardEvent has them). */
export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

interface ParsedKey {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parseKey(spec: string, mac: boolean): ParsedKey {
  const parts = spec.split(/-(?!$)/);
  const key = parts.pop()!;
  const k: ParsedKey = { ctrl: false, meta: false, alt: false, shift: false, key: key.length === 1 ? key.toLowerCase() : key };
  for (const p of parts) {
    if (p === "Mod") {
      if (mac) k.meta = true;
      else k.ctrl = true;
    } else if (p === "Ctrl" || p === "Control") k.ctrl = true;
    else if (p === "Cmd" || p === "Meta") k.meta = true;
    else if (p === "Alt") k.alt = true;
    else if (p === "Shift") k.shift = true;
  }
  return k;
}

/**
 * The letter each physical key writes on the keyboard of the user, learned
 * as letters are typed: with Alt, macOS gives another character (⌥A is
 * `æ`, ⌥E a dead key) and the event only tells the place of the key, which
 * is the letter of a US keyboard (on AZERTY, the key A is at the place of
 * Q). What was typed there before tells the letter.
 */
const layout = new Map<string, string>();

/** Remembers the letter a key writes, from a key press without Alt. */
export function learnLayout(e: KeyEventLike) {
  if (!e.altKey && /^Key[A-Z]$/.test(e.code) && /^[a-zA-Z]$/.test(e.key)) layout.set(e.code, e.key.toLowerCase());
}

/** Forgets the layout (tests). */
export function forgetLayout() {
  layout.clear();
}

/** The letter or the digit of the key at `code`: as learned, else as on a US keyboard. */
function keyAt(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return layout.get(code) ?? code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return null;
}

/**
 * Key names of an event: the character it produces and, when that is not
 * a plain letter or digit, the key itself (Alt on macOS produces other
 * characters, AZERTY digits need Shift): the letter it writes on this
 * keyboard when it is known, and the one of a US keyboard. A letter is
 * never replaced by the letter printed at the same place on a US keyboard:
 * on AZERTY, ⌘Z must stay Z (undo), not become ⌘W (close).
 */
export function eventKeys(e: KeyEventLike): string[] {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const names = [k];
  const plain = /^[a-z0-9]$/.test(k);
  if (!plain) {
    const at = keyAt(e.code);
    if (at) names.push(at);
    if (e.code.startsWith("Key")) names.push(e.code.slice(3).toLowerCase());
  }
  if (k === "+") names.push("=");
  if (k === " ") names.push("Space");
  return [...new Set(names)];
}

const NAMED_KEYS: Record<string, string> = { " ": "Space" };

/**
 * The shortcut a key press makes, in CodeMirror notation (`Mod-Alt-n`), or
 * null for a modifier alone. With Alt, or when the key writes no plain
 * character (a dead key), the key itself is named, by the letter it writes
 * on this keyboard.
 */
export function specFromEvent(e: KeyEventLike, mac: boolean): string | null {
  if (["Control", "Meta", "Alt", "AltGraph", "Shift", "CapsLock", "Fn", "OS"].includes(e.key)) return null;
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (mac && e.ctrlKey) parts.push("Ctrl");
  if (!mac && e.metaKey) parts.push("Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = NAMED_KEYS[e.key] ?? e.key;
  const plain = key.length === 1 && /^[a-z0-9]$/i.test(key);
  const at = keyAt(e.code);
  if (at && !plain && (e.altKey || key.length !== 1 || key === "Dead")) key = at;
  else if (key === "Dead" || key === "Unidentified") return null;
  else if (key.length === 1) key = key.toLowerCase();
  parts.push(key);
  return parts.join("-");
}

/**
 * On Windows and Linux, AltGr reaches the page as Ctrl + Alt: a character
 * typed that way (`{`, `[`, `@`, `€` on AZERTY, `ś` on Polish keyboards…)
 * is text, never a shortcut.
 */
export function isAltGrText(e: KeyEventLike, mac: boolean): boolean {
  if (mac || !e.ctrlKey || !e.altKey) return false;
  return e.key === "Dead" || (e.key.length === 1 && !/^[a-z0-9]$/i.test(e.key));
}

/** Whether `e` is the shortcut `spec` (`Mod` is ⌘ on macOS, Ctrl elsewhere). */
export function matchesKey(e: KeyEventLike, spec: string, mac: boolean): boolean {
  if (isAltGrText(e, mac)) return false;
  const k = parseKey(spec, mac);
  if (e.ctrlKey !== k.ctrl || e.metaKey !== k.meta || e.altKey !== k.alt) return false;
  if (!eventKeys(e).includes(k.key)) return false;
  // Punctuation often needs Shift on non-US layouts: only check Shift for letters, digits and named keys.
  const punctuation = k.key.length === 1 && !/[a-z0-9]/.test(k.key);
  return punctuation ? !k.shift || e.shiftKey : e.shiftKey === k.shift;
}
