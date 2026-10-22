// Calls made one after the other, in the order they were asked for: two
// saves at once (settings changed twice in a row, a file saved twice) could
// reach the disk in the other order, the older one last.

const queues = new Map<string, Promise<void>>();

/** Runs `run` once the calls of `key` asked for before it are over (each
 *  one waits for the previous, whatever its outcome). */
export function inOrder<R>(key: string, run: () => Promise<R>): Promise<R> {
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run);
  const over = next.then(
    () => {},
    () => {},
  );
  queues.set(key, over);
  // Nothing kept once the last one is over.
  void over.then(() => {
    if (queues.get(key) === over) queues.delete(key);
  });
  return next;
}

/** Calls of `key` under way or waiting. */
export function pending(key: string): boolean {
  return queues.has(key);
}
