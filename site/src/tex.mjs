// The building blocks of the pages, borrowed from LaTeX: numbered sections,
// equations (KaTeX, rendered when the site is built), figures, theorems,
// tables, listings, footnotes, a table of contents, and the handwriting of
// the reader: notes and arrows in the margin, words circled, boxed,
// underlined, highlighted or crossed out, ticks, stamps and sticky notes.
// The strokes draw themselves when they come into view (site.js).

import katex from "katex";

import { esc } from "./layout.mjs";
import { latex } from "./util.mjs";

/** A fresh set of counters for one page. */
export function texContext(lang) {
  const fr = lang === "fr";
  const n = { chapter: "", section: 0, subsection: 0, equation: 0, figure: 0, theorem: 0, exercise: 0, table: 0, footnote: 0, note: 0 };
  // Numbers within the chapter (A.1, A.2…) on the appendices.
  const num = (k) => (n.chapter ? `${n.chapter}.${k}` : `${k}`);
  const footnotes = [];

  /** Mathematics: inline, or displayed. \htmlClass{tx-violet}{…} colours a
   *  part (tx-violet, tx-red, tx-green), \htmlClass{strike}{…} crosses it out
   *  and \htmlClass{hbox}{…} boxes it, by hand. */
  const math = (tex, display = false) =>
    katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      strict: "ignore",
      output: "html",
      trust: (c) => c.command === "\\htmlClass",
    });

  /** A stroke drawn by hand in an SVG stretched over a word. */
  const stroke = (cls, viewBox, d) =>
    `<svg class="${cls}" viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true"><path class="draw-me" d="${d}"/></svg>`;
  // A wave, like the red line under a spelling mistake.
  const WAVE = `M0 4 ${Array.from({ length: 14 }, (_, i) => `q 3.5 ${i % 2 ? 3.5 : -3.5} 7 0`).join(" ")}`;

  return {
    math: (tex) => `<span class="m" data-tex="${esc(`$${tex}$`)}">${math(tex)}</span>`,

    /** A displayed equation, numbered (1), (2)… (double-click: its source). */
    eq(tex, { label = true, cls = "" } = {}) {
      const k = label ? num(++n.equation) : null;
      return `<div class="equation ${cls}" data-reveal data-tex="${esc(`\\begin{equation}\n  ${tex}\n\\end{equation}`)}"><div class="eq-body">${math(tex, true)}</div>${k ? `<span class="eq-num">(${k})</span>` : ""}</div>`;
    },

    /** \chapter of an appendix: « Annexe B », its title, an epigraph, a lead. */
    chapter(letter, title, { epigraph = null, lead = "", stamp = null } = {}) {
      n.chapter = letter;
      const mark = stamp ? `<span class="stamp stamp-${stamp[1] ?? "red"} stamp-chapter" data-reveal style="--tilt: ${stamp[2] ?? 7}deg">${stamp[0]}</span>` : "";
      return `<header class="chapter" data-reveal>${mark}<p class="chapter-label">${fr ? "Annexe" : "Appendix"} <span>${letter}</span></p><h1 class="chapter-title">${title}</h1>${
        epigraph ? `<blockquote class="epigraph"><p>${epigraph[0]}</p><footer>— ${epigraph[1]}</footer></blockquote>` : ""
      }${lead ? `<p class="chapter-lead">${lead}</p>` : ""}</header>`;
    },

    /** \section, numbered, with an anchor. */
    section(title, id = "") {
      n.section++;
      n.subsection = 0;
      return `<h2 class="section" id="${id}" data-reveal><span class="sec-num">${num(n.section)}</span>${title}</h2>`;
    },

    /** \subsection, numbered within its section. */
    subsection(title, id = "") {
      n.subsection++;
      return `<h3 class="subsection" id="${id}" data-reveal><span class="sec-num">${num(n.section)}.${n.subsection}</span>${title}</h3>`;
    },

    /** \section* : not numbered. */
    sectionStar: (title, id = "") => `<h2 class="section" id="${id}" data-reveal>${title}</h2>`,

    /** A figure and its caption. */
    figure(content, caption, cls = "") {
      const k = num(++n.figure);
      return `<figure class="figure ${cls}" data-reveal>${content}<figcaption><span class="fig-label">Figure ${k} —</span> ${caption}</figcaption></figure>`;
    },

    /** Théorème / Proposition, with an optional proof ending in ∎. */
    theorem(kind, title, statement, proof = "") {
      const k = num(++n.theorem);
      return `<div class="theorem" data-reveal><p><span class="thm-head">${kind} ${k}</span>${title ? ` <span class="thm-title">(${title})</span>` : ""}. <span class="thm-body">${statement}</span></p>${
        proof
          ? `<div class="proof"><span class="proof-head">${fr ? "Démonstration" : "Proof"}.</span> ${proof} <button type="button" class="qed" data-qed aria-label="${fr ? "C.Q.F.D." : "Q.E.D."}" title="${fr ? "C.Q.F.D." : "Q.E.D."}"></button></div>`
          : ""
      }</div>`;
    },

    /** An exercise and its solution (folded, like the end of a textbook). */
    exercise(question, answer, open = false) {
      const k = num(++n.exercise);
      return `<details class="exercise" data-reveal${open ? " open" : ""}><summary><span class="ex-head">${fr ? "Exercice" : "Exercise"} ${k}.</span> ${question}</summary><div class="solution"><p><span class="sol-head">Solution.</span> ${answer}</p></div></details>`;
    },

    /** \begin{enumerate}: (i), (ii)… or 1., 2.… */
    enumerate: (items, style = "roman") => `<ol class="enumerate ${style}" data-reveal>${items.map((i) => `<li>${i}</li>`).join("")}</ol>`,

    /** \begin{itemize}. */
    itemize: (items) => `<ul class="itemize" data-reveal>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`,

    /** \begin{description}. */
    description: (items) => `<dl class="description" data-reveal>${items.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("")}</dl>`,

    /** A note in the margin, by hand: violet ink, or red, or green. */
    note(text, { arrow = "left", tilt = -2, color = "violet" } = {}) {
      const id = ++n.note;
      const arrows = {
        left: '<path d="M70 8 C 48 4, 24 10, 6 26 M6 26 l 3 -12 M6 26 l 12 -2"/>',
        down: '<path d="M30 4 C 36 18, 34 30, 24 44 M24 44 l 0 -12 M24 44 l 10 -6"/>',
        up: '<path d="M24 44 C 34 30, 34 16, 26 4 M26 4 l -8 9 M26 4 l 10 6"/>',
        none: "",
      };
      const svg = arrows[arrow] ? `<svg class="note-arrow arrow-${arrow}" viewBox="0 0 76 48" aria-hidden="true"><g class="draw">${arrows[arrow]}</g></svg>` : "";
      return `<aside class="marginnote ink-${color}" data-reveal style="--tilt: ${tilt}deg" id="note-${id}">${svg}<span class="hand">${text}</span></aside>`;
    },

    /** A sticky note in the margin, a bit of tape on top. */
    sticky: (text, { tilt = 3, color = "yellow" } = {}) =>
      `<aside class="sticky sticky-${color}" data-reveal style="--tilt: ${tilt}deg"><span class="hand">${text}</span></aside>`,

    /** A word circled by hand. */
    circled: (text, color = "violet") =>
      `<span class="circled ink-${color}">${text}${stroke("", "0 0 100 40", "M8 22 C 6 8, 40 3, 62 5 C 86 7, 98 14, 95 24 C 92 34, 60 38, 36 36 C 16 34, 4 28, 10 16 C 14 10, 24 6, 34 5")}</span>`,

    /** A word boxed by hand. */
    boxed: (text, color = "violet") =>
      `<span class="handbox ink-${color}">${text}${stroke("", "0 0 100 40", "M5 4 C 30 2, 70 5, 97 3 C 99 14, 98 27, 97 37 C 68 39, 32 38, 3 37 C 1 26, 2 14, 7 1")}</span>`,

    /** A word underlined by hand (twice, to insist). */
    underline: (text, color = "violet", twice = false) =>
      `<span class="scribble ink-${color}${twice ? " twice" : ""}">${text}${stroke("", "0 0 100 10", twice ? "M2 4 C 20 2, 40 6, 60 3 S 90 3, 98 4 M6 8 C 30 6, 60 9, 95 7" : "M2 6 C 20 3, 40 8, 60 5 S 90 4, 98 6")}</span>`,

    /** A word underlined with a red wave, like a spelling mistake. */
    squiggle: (text) => `<span class="scribble squiggle ink-red">${text}${stroke("", "0 0 100 8", WAVE)}</span>`,

    /** A phrase gone over with a highlighter (yellow, pink, green, violet). */
    hl: (text, color = "yellow") => `<mark class="hl hl-${color}">${text}</mark>`,

    /** A rubber stamp, pressed on the page when it comes into view. */
    stamp: (text, { color = "red", tilt = -8, cls = "" } = {}) =>
      `<span class="stamp stamp-${color} ${cls}" data-reveal style="--tilt: ${tilt}deg">${text}</span>`,

    /** A small star drawn in the margin of a line. */
    star: (color = "violet") =>
      `<svg class="doodle-star ink-${color}" viewBox="0 0 24 24" aria-hidden="true"><path class="draw-me" d="M12 2.5 L14.3 9.4 L21.5 9.6 L15.7 13.9 L17.9 21 L12 16.7 L6.2 21 L8.3 13.9 L2.5 9.6 L9.7 9.4 Z"/></svg>`,

    /** A list whose items are ticked by hand, one after the other. */
    checklist: (items, color = "green") =>
      `<ul class="checklist ink-${color}" data-reveal>${items
        .map((i, k) => `<li style="--k: ${k}"><svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path class="draw-me" d="M3 13 C 6 15, 8 18, 9.5 20.5 C 12 13, 16 7, 22 2.5"/></svg>${i}</li>`)
        .join("")}</ul>`,

    /** A word crossed out in red, corrected above by hand. */
    fix: (wrong, right) =>
      `<span class="fix"><span class="fix-wrong">${wrong}</span><span class="fix-right hand">${right}</span></span>`,

    /** A footnote: its mark here, its text at the bottom of the page. */
    footnote(text) {
      const num = ++n.footnote;
      footnotes.push(`<li id="fn-${num}"><span class="fn-num">${num}</span> ${text} <a href="#fnref-${num}" class="fn-back" aria-label="${fr ? "Retour au texte" : "Back to the text"}">↩</a></li>`);
      return `<sup class="fn-ref" id="fnref-${num}"><a href="#fn-${num}">${num}</a></sup>`;
    },
    footnotes: () => (footnotes.length ? `<footer class="footnotes"><hr /><ol>${footnotes.join("")}</ol></footer>` : ""),

    /** \tableofcontents: dotted leaders and page numbers. */
    toc: (entries) =>
      `<nav class="toc" aria-label="${fr ? "Table des matières" : "Contents"}" data-reveal><h2 class="toc-title">${fr ? "Table des matières" : "Contents"}</h2><ol>${entries
        .map(
          ([num, title, href, page], i) =>
            `<li${/^[A-Z]$/.test(num) ? ' class="app"' : ""} style="--i: ${i}"><a href="${href}"><span class="toc-num">${num}</span><span class="toc-text">${title}</span><span class="toc-dots"></span><span class="toc-page">${page}</span></a></li>`,
        )
        .join("")}</ol></nav>`,

    /** A table in the booktabs style (\toprule, \midrule, \bottomrule). */
    table(head, rows, caption = "", align = "") {
      const cls = (i) => (align[i] === "r" ? ' class="num"' : "");
      const body = rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${c}</td>`).join("")}</tr>`).join("");
      const k = caption ? num(++n.table) : null;
      return `<div class="booktabs" data-reveal>${caption ? `<p class="tab-caption"><span class="fig-label">${fr ? "Tableau" : "Table"} ${k} —</span> ${caption}</p>` : ""}<table><thead><tr>${head.map((h, i) => `<th${cls(i)}>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
    },

    /** A listing of LaTeX source, line numbers in the margin. */
    listing: (src, title = "") =>
      `<div class="listing" data-reveal>${title ? `<p class="listing-title">${title}</p>` : ""}<pre><code>${src
        .split("\n")
        .map((l) => `<span class="ln"></span>${latex(l)}`)
        .join("\n")}</code></pre></div>`,

    /** \fbox around a link or a button. */
    fbox: (inner) => `<span class="fbox">${inner}</span>`,
  };
}
