// Icons: the application's own set (ui/components/common/Icon.svelte), so
// that the site and RayTeX speak the same visual language, plus the marks of
// the operating systems and of GitHub.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../ui/components/common/Icon.svelte"), "utf8");
const APP = Object.fromEntries([...source.matchAll(/^\s{4}"?([a-z0-9-]+)"?:\s*'(.*)',\s*$/gm)].map((m) => [m[1], m[2]]));

// Filled marks, 24 × 24.
const MARKS = {
  windows: '<path d="M3 5.2 10.4 4v7.3H3zM11.4 3.9 21 2.5v8.8h-9.6zM3 12.7h7.4V20L3 18.8zM11.4 12.7H21v8.8l-9.6-1.4z"/>',
  apple:
    '<path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8s2.2-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/>',
  linux:
    '<path d="M12 2c-2.3 0-3.6 1.9-3.6 4.4 0 1.3.3 2.2-.4 3.4-.9 1.5-2.6 3.4-2.9 5.6-.1 1 .1 1.8.6 2.4-.6.4-1.9.6-1.7 1.6.2.9 1.7.8 2.9 1.4 1.2.6 2.4 1 3.1.2.3-.3.5-.6 1-.6h2c.5 0 .7.3 1 .6.7.8 1.9.4 3.1-.2 1.2-.6 2.7-.5 2.9-1.4.2-1-1.1-1.2-1.7-1.6.5-.6.7-1.4.6-2.4-.3-2.2-2-4.1-2.9-5.6-.7-1.2-.4-2.1-.4-3.4C15.6 3.9 14.3 2 12 2zm-1.4 3.6c.5 0 .8.6.8 1.2s-.3 1.1-.7 1.2c-.1-.1-.3-.2-.5-.2.1-.4 0-.9-.3-.9-.2 0-.3.3-.3.6 0 .1 0 .2.1.3l-.5.3c-.1-.3-.2-.6-.2-.9 0-.9.7-1.6 1.6-1.6zm2.8 0c.9 0 1.5.7 1.5 1.6 0 .4-.1.7-.3 1-.2-.1-.4-.2-.6-.2l.1-.4c0-.4-.2-.7-.4-.7-.3 0-.4.4-.4.8v.2c-.2 0-.3.1-.5.1-.2-.3-.3-.6-.3-1 0-.8.6-1.4 1.3-1.4zM12 8.6c.6 0 1.8.5 2.4.8.3.2.5.4.3.7-.2.4-1.6 1.3-2.7 1.3s-2.2-.8-2.6-1.2c-.3-.3-.2-.6.1-.8.7-.4 1.9-.8 2.5-.8z"/>',
  github:
    '<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>',
};

/** Stroke icon of the application (or filled mark), as inline SVG. */
export function icon(name, size = 18, cls = "") {
  if (MARKS[name]) {
    return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${MARKS[name]}</svg>`;
  }
  const body = APP[name];
  if (!body) throw new Error(`unknown icon: ${name}`);
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
