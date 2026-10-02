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

/** The download button that ends a page: centred on the sheet, a hand-written
 *  word and an arrow pointing at it. */
export const ctaEnd = ({ T, url, icon }, note) =>
  `<div class="cta-end" data-reveal>
  <span class="cta-hand" aria-hidden="true"><span class="hand">${note}</span><svg viewBox="0 0 90 50"><path class="draw-me" d="M4 10 C 30 4, 60 14, 76 38 M76 38 l -2 -13 M76 38 l -12 -4"/></svg></span>
  <a class="fbox-link big solid" href="${url("download/")}" data-download-primary>${icon("download", 18)}<span data-download-label>${T("Download RayTeX", "Télécharger RayTeX")}</span></a>
  <p class="cta-meta"><span data-download-meta>${T("Free · MIT or Apache 2.0 · no account", "Gratuit · MIT ou Apache 2.0 · sans compte")}</span></p>
</div>`;
