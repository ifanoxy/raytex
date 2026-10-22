// Every notification shown while the scenes run, kept in order: the list of
// the interface keeps the last five and lets each one go after a moment, so
// that a place taken in it before a step could miss what the step showed.

import type { Toast } from "$lib/state/ui.svelte";

export type Shown = Omit<Toast, "id" | "timeout">;

export const shown: Shown[] = [];

/** Where the notifications stand, to read those shown after it. */
export const mark = (): number => shown.length;

/** The notifications shown since `at` (a `mark()`). */
export const since = (at: number): Shown[] => shown.slice(at);
