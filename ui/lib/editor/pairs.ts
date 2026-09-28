// Brackets closed automatically while typing (`[` → `[]`).

const CLOSING: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/**
 * Whether the character after the cursor is the bracket the editor added
 * when `typed` ended with its opening one (`@[` gives `@[]`): a completion
 * replacing `typed` must replace it too, or it stays (`\right]]`).
 */
export function autoClosed(typed: string, next: string): boolean {
  const open = typed.slice(-1);
  return !!CLOSING[open] && next === CLOSING[open];
}
