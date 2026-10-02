// Small helpers shared by the pages.

import { esc } from "./layout.mjs";

/** LaTeX source coloured like RayTeX's editor (commands, braces, maths, comments). */
export function latex(src) {
  let out = "";
  const re = /(%.*$)|(\$[^$]*\$)|(\\[a-zA-Z@]+\*?|\\.)|([{}[\]])/gm;
  let last = 0;
  for (const m of src.matchAll(re)) {
    out += esc(src.slice(last, m.index));
    const [text, comment, math, cmd] = m;
    const cls = comment ? "c-comment" : math ? "c-math" : cmd ? "c-cmd" : "c-brace";
    out += `<span class="${cls}">${esc(text)}</span>`;
    last = m.index + text.length;
  }
  return out + esc(src.slice(last));
}
