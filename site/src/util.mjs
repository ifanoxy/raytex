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

/** A section title with its small label above. */
export const heading = (eyebrow, title, lead = "", cls = "") =>
  `<div class="section-head ${cls}" data-reveal><p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ""}</div>`;

/** A page title band (inner pages). */
export const pageHead = (eyebrow, title, lead = "") =>
  `<section class="page-head"><div class="container narrow" data-reveal><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}</div></section>`;
