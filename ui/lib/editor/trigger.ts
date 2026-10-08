// What Tab writes after a trigger: a macro of the user, or a snippet of
// RayTeX (`doc`, `fig`, `eq`…).

/** Something a trigger stands for. */
export interface Triggered {
  trigger: string;
  /** What it writes, with the fields of a snippet (`${1:a}`). */
  body: string;
  /** It is the content of a formula. */
  math: boolean;
}

/**
 * The item whose trigger ends `before` (the line up to the cursor): the
 * longest one, and the first of `items` among equals (the macros of the
 * user go before the snippets of RayTeX).
 */
export function triggerAt<T extends { trigger: string }>(before: string, items: T[]): T | null {
  let found: T | null = null;
  for (const item of items) {
    const trigger = item.trigger;
    if (!trigger || !before.endsWith(trigger)) continue;
    const prev = before[before.length - trigger.length - 1];
    // The trigger must be a whole word (or start after a space / brace),
    // and not the name of a command being typed (`\al` for a trigger `al`).
    if (prev && /[A-Za-z0-9\\]/.test(prev) && /^[A-Za-z0-9]/.test(trigger)) continue;
    if (!found || trigger.length > found.trigger.length) found = item;
  }
  return found;
}

/**
 * The snippet to write for `item`: as it is, or between `$…$` when it is
 * the content of a formula and the cursor is in text.
 */
export function expansion(item: Triggered, inMath: boolean): string {
  const body = item.body.replaceAll("${SELECTION}", "");
  if (!item.math || inMath) return body;
  // `${` would start a field: the brace is told apart.
  return `$${body.startsWith("{") ? "\\" : ""}${body}$`;
}
