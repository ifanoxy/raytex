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
 * Key names of an event: the character it produces and, when that is not
 * a plain letter or digit, the physical key (Alt on macOS produces other
 * characters, AZERTY digits need Shift). A letter is never replaced by the
 * letter printed at the same place on a US keyboard: on AZERTY, ⌘Z must
 * stay Z (undo), not become ⌘W (close).
 */
export function eventKeys(e: KeyEventLike): string[] {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const names = [k];
  const plain = /^[a-z0-9]$/.test(k);
  if (!plain) {
    if (e.code.startsWith("Key")) names.push(e.code.slice(3).toLowerCase());
    else if (e.code.startsWith("Digit")) names.push(e.code.slice(5));
  }
  if (k === "+") names.push("=");
  return names;
}

/** Whether `e` is the shortcut `spec` (`Mod` is ⌘ on macOS, Ctrl elsewhere). */
export function matchesKey(e: KeyEventLike, spec: string, mac: boolean): boolean {
  const k = parseKey(spec, mac);
  if (e.ctrlKey !== k.ctrl || e.metaKey !== k.meta || e.altKey !== k.alt) return false;
  if (!eventKeys(e).includes(k.key)) return false;
  // Punctuation often needs Shift on non-US layouts: only check Shift for letters, digits and named keys.
  const punctuation = k.key.length === 1 && !/[a-z0-9]/.test(k.key);
  return punctuation ? !k.shift || e.shiftKey : e.shiftKey === k.shift;
}
