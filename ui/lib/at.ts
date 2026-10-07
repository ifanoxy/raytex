// The `@` shortcuts of the user: macros whose trigger starts with `@`
// (`@v` writes `\vec{}`). They are offered by the completion as soon as `@`
// is typed, like those of RayTeX, and take the place of one with the same
// key. No local imports: tested directly by Node (`npm test`).

/** How many characters a key has at most (the same limit as the engine). */
export const AT_KEY_MAX = 12;

/** The parts of a macro this needs. */
export interface AtMacroLike {
  trigger: string;
  body: string;
}

/** Whether `key` (without `@`) can be the key of a shortcut: a short word without spaces. */
export function validAtKey(key: string): boolean {
  const length = [...key].length;
  return length >= 1 && length <= AT_KEY_MAX && !/[\s\\@{}$]/.test(key);
}

/** The key of a macro that is an `@` shortcut (its trigger without `@`), else null. */
export function atKey(m: Pick<AtMacroLike, "trigger">): string | null {
  if (!m.trigger.startsWith("@")) return null;
  const key = m.trigger.slice(1);
  return validAtKey(key) ? key : null;
}

/** What the user typed as a key, cleaned: no `@` in front, no spaces around. */
export function cleanAtKey(typed: string): string {
  return typed.trim().replace(/^@+/, "");
}

/**
 * The body of a shortcut from what the user typed as a command: a command
 * with empty braces gets fields there (`\vec{}` → `\vec{${1}}`), so that the
 * cursor lands in them.
 */
export function atBody(typed: string): string {
  const text = typed.trim();
  if (text.includes("${")) return text;
  let n = 0;
  return text.replace(/\{\}/g, () => `{\${${++n}}}`);
}

/** A body as it is shown to a person: fields become their text, or `…`. */
export function atPreview(body: string): string {
  return body.replace(/\$\{\d+(?::([^}]*))?\}/g, (_, text: string | undefined) => text || "…");
}

/**
 * The shortcuts shown in a list: those of the user first, then those of
 * RayTeX that no key of the user replaces.
 */
export function mergeShortcuts<M extends AtMacroLike>(builtin: readonly [string, string][], macros: readonly M[]): { key: string; body: string; own: M | null }[] {
  const own = macros.flatMap((m) => {
    const key = atKey(m);
    return key ? [{ key, body: m.body, own: m as M | null }] : [];
  });
  const taken = new Set(own.map((o) => o.key));
  return [...own, ...builtin.filter(([key]) => !taken.has(key)).map(([key, body]) => ({ key, body, own: null }))];
}
