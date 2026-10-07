// Which macro the text before the cursor asks for (its trigger, then Tab).

import type { Macro } from "../types";

/**
 * The macro whose trigger ends `before` (the line up to the cursor).
 * `inMath` tells whether the cursor is in a formula (math macros only
 * apply there).
 */
export function triggerAt(before: string, macros: Macro[], inMath: () => boolean): Macro | null {
  for (const m of macros) {
    if (!m.trigger || !before.endsWith(m.trigger)) continue;
    const prev = before[before.length - m.trigger.length - 1];
    // The trigger must be a whole word (or start after a space / brace),
    // and not the name of a command being typed (`\al` for a trigger `al`).
    if (prev && /[A-Za-z0-9\\]/.test(prev) && /^[A-Za-z0-9]/.test(m.trigger)) continue;
    if (m.math && !inMath()) continue;
    return m;
  }
  return null;
}
