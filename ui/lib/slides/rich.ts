// A text of a slide as it is edited on the slide: its words, in bold,
// italic, underlined, emphasised, alerted, in a colour or a link, its
// formulas and its line breaks; what is anything else (a command, a group)
// is kept as it is written, shown apart and not changed. Read from the
// LaTeX, made into the elements of the page, read back from them, written
// as LaTeX again (what the user types escaped: `50 %` becomes `50 \%`).
//
// No local imports: tested directly by Node (`npm test`).

export type Inline =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "emph" | "u" | "alert" | "structure"; c: Inline[] }
  | { t: "color"; color: string; c: Inline[] }
  | { t: "link"; url: string; c: Inline[] }
  | { t: "math"; v: string; d: "$" | "\\(" }
  | { t: "br" }
  | { t: "raw"; v: string };

/** The colours offered for words, as LaTeX names them (xcolor, loaded by Beamer). */
export const INLINE_COLORS: { id: string; swatch: string }[] = [
  { id: "red", swatch: "#e53935" },
  { id: "blue", swatch: "#1e63d6" },
  { id: "green!50!black", swatch: "#2e7d32" },
  { id: "orange", swatch: "#f57c00" },
  { id: "violet", swatch: "#8e24aa" },
  { id: "gray", swatch: "#808080" },
];

/** The tools of a text written on the slide. */
export type RichTool = "b" | "i" | "u" | "alert" | "structure" | "color" | "link" | "math";

const STYLES: Record<string, "b" | "i" | "emph" | "u" | "alert" | "structure"> = {
  textbf: "b",
  textit: "i",
  emph: "emph",
  underline: "u",
  alert: "alert",
  structure: "structure",
};
const COMMAND_OF: Record<string, string> = { b: "textbf", i: "textit", emph: "emph", u: "underline", alert: "alert", structure: "structure" };
const ESCAPED: Record<string, string> = { "%": "%", "&": "&", _: "_", "#": "#", $: "$", "{": "{", "}": "}" };
const WORDS: Record<string, string> = { textbackslash: "\\", textasciitilde: "~", textasciicircum: "^" };

/** The end of the group opened at `open` (`{` or `[`), or -1. */
function groupEnd(s: string, open: number): number {
  const o = s[open];
  const c = o === "[" ? "]" : "}";
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === o) depth++;
    else if (s[i] === c && --depth === 0) return i + 1;
  }
  return -1;
}

/** The end of a command and the arguments that follow it (`*`, `[…]`, `{…}`), from the end of its name. */
function argsEnd(s: string, at: number): number {
  let i = at;
  if (s[i] === "*") i++;
  for (;;) {
    let j = i;
    while (s[j] === " " && (s[j + 1] === "{" || s[j + 1] === "[")) j++;
    if (s[j] !== "{" && s[j] !== "[") return i;
    const e = groupEnd(s, j);
    if (e < 0) return i;
    i = e;
  }
}

/** A text of a slide, read. */
export function parseInline(latex: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  const s = latex;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const next = s[i + 1] ?? "";
      if (next in ESCAPED) {
        text += next;
        i += 2;
        continue;
      }
      if (next === "\\") {
        // A line break; with a length (`\\[2mm]`) it is kept as it is.
        if (s[i + 2] === "[") {
          const e = groupEnd(s, i + 2);
          flush();
          out.push({ t: "raw", v: s.slice(i, e < 0 ? s.length : e) });
          i = e < 0 ? s.length : e;
        } else {
          flush();
          out.push({ t: "br" });
          i += 2;
          // The spaces after a line break are not seen.
          while (i < s.length && /\s/.test(s[i])) i++;
        }
        continue;
      }
      if (next === "(") {
        const e = s.indexOf("\\)", i + 2);
        if (e > 0) {
          flush();
          out.push({ t: "math", v: s.slice(i + 2, e), d: "\\(" });
          i = e + 2;
          continue;
        }
      }
      const name = /^[A-Za-z@]+/.exec(s.slice(i + 1))?.[0] ?? "";
      const after = i + 1 + name.length;
      if (name in WORDS && s.slice(after, after + 2) === "{}") {
        text += WORDS[name];
        i = after + 2;
        continue;
      }
      if (name in STYLES && s[after] === "{") {
        const e = groupEnd(s, after);
        if (e > 0) {
          flush();
          out.push({ t: STYLES[name], c: parseInline(s.slice(after + 1, e - 1)) });
          i = e;
          continue;
        }
      }
      if ((name === "textcolor" || name === "href") && s[after] === "{") {
        const e1 = groupEnd(s, after);
        if (e1 > 0 && s[e1] === "{") {
          const e2 = groupEnd(s, e1);
          if (e2 > 0) {
            flush();
            const first = s.slice(after + 1, e1 - 1);
            const inner = parseInline(s.slice(e1 + 1, e2 - 1));
            out.push(name === "textcolor" ? { t: "color", color: first, c: inner } : { t: "link", url: first, c: inner });
            i = e2;
            continue;
          }
        }
      }
      // Anything else: kept as it is written, with its arguments.
      flush();
      const end = name ? argsEnd(s, after) : i + 2;
      out.push({ t: "raw", v: s.slice(i, end) });
      i = end;
      continue;
    }
    if (c === "$" && s[i + 1] !== "$") {
      const e = s.indexOf("$", i + 1);
      if (e > 0) {
        flush();
        out.push({ t: "math", v: s.slice(i + 1, e), d: "$" });
        i = e + 1;
        continue;
      }
    }
    if (c === "{" || c === "%" || (c === "$" && s[i + 1] === "$")) {
      // A group, a comment, a displayed formula: kept as written.
      flush();
      const end = c === "{" ? groupEnd(s, i) : c === "%" ? (s.indexOf("\n", i) < 0 ? s.length : s.indexOf("\n", i)) : s.indexOf("$$", i + 2) + 2;
      const stop = end <= i ? s.length : end;
      out.push({ t: "raw", v: s.slice(i, stop) });
      i = stop;
      continue;
    }
    if (c === "~") {
      text += " ";
      i++;
      continue;
    }
    // Spaces as LaTeX reads them: one, whatever they are.
    if (/\s/.test(c)) {
      if (!text.endsWith(" ") && !(text === "" && out.length === 0)) text += " ";
      i++;
      while (i < s.length && /\s/.test(s[i])) i++;
      continue;
    }
    text += c;
    i++;
  }
  flush();
  return out;
}

/** What is typed, written for LaTeX. */
export function escapeText(v: string): string {
  return v.replace(/[\\{}%&_#$~^ ]/g, (ch) => {
    switch (ch) {
      case "\\":
        return "\\textbackslash{}";
      case "~":
        return "\\textasciitilde{}";
      case "^":
        return "\\textasciicircum{}";
      case " ":
        return "~";
      default:
        return `\\${ch}`;
    }
  });
}

/** A text of a slide, written. */
export function inlineLatex(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return escapeText(n.v);
        case "br":
          return "\\\\ ";
        case "raw":
          return n.v;
        case "math":
          return n.d === "$" ? `$${n.v}$` : `\\(${n.v}\\)`;
        case "color":
          return `\\textcolor{${n.color}}{${inlineLatex(n.c)}}`;
        case "link":
          return `\\href{${n.url}}{${inlineLatex(n.c)}}`;
        default:
          return `\\${COMMAND_OF[n.t]}{${inlineLatex(n.c)}}`;
      }
    })
    .join("")
    .replace(/\\\\ $/, "\\\\")
    .replace(/\\\\ (?=\\\\)/g, "\\\\");
}

/** The same text without what is empty (a bold around nothing), its pieces of text joined. */
export function tidy(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    const m = "c" in n ? { ...n, c: tidy(n.c) } : n;
    if ("c" in m && !m.c.length) continue;
    if (m.t === "text" && !m.v) continue;
    const prev = out[out.length - 1];
    if (m.t === "text" && prev?.t === "text") prev.v += m.v;
    else out.push(m.t === "text" ? { ...m } : m);
  }
  return out;
}

/** The colours CSS shows for the colours of LaTeX (xcolor names and mixes), roughly. */
export function cssColor(color: string): string {
  const named: Record<string, string> = {
    red: "#d32f2f",
    blue: "#1e63d6",
    green: "#2e7d32",
    orange: "#f57c00",
    violet: "#8e24aa",
    purple: "#7b1fa2",
    gray: "#808080",
    black: "#000",
    white: "#fff",
    cyan: "#00acc1",
    magenta: "#c2185b",
    yellow: "#c9a400",
    brown: "#795548",
    teal: "#00796b",
    olive: "#827717",
    lime: "#7cb342",
    pink: "#e91e63",
  };
  if (color === "green!50!black") return "#2e7d32";
  const base = color.split("!")[0].trim();
  return named[base] ?? "#d32f2f";
}

// ------------------------------------------------- the elements of the page

/** What is needed of an element of the page to read it back (the DOM, or a stand-in in the tests). */
export interface PageNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<PageNode>;
  getAttribute?(name: string): string | null;
}

/** A text read back from the elements of the page it is edited in. */
export function fromNodes(nodes: ArrayLike<PageNode>): Inline[] {
  const out: Inline[] = [];
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    if (n.nodeType === 3) {
      out.push({ t: "text", v: (n.textContent ?? "").replace(/[\n\r\t]+/g, " ") });
      continue;
    }
    if (n.nodeType !== 1) continue;
    const name = n.nodeName.toUpperCase();
    const kind = n.getAttribute?.("data-k");
    const children = () => fromNodes(n.childNodes);
    if (name === "BR") out.push({ t: "br" });
    else if (kind === "math") out.push({ t: "math", v: n.getAttribute?.("data-latex") ?? "", d: n.getAttribute?.("data-d") === "\\(" ? "\\(" : "$" });
    else if (kind === "raw") out.push({ t: "raw", v: n.getAttribute?.("data-latex") ?? "" });
    else if (kind === "color") out.push({ t: "color", color: n.getAttribute?.("data-color") ?? "red", c: children() });
    else if (kind === "link") out.push({ t: "link", url: n.getAttribute?.("data-url") ?? "", c: children() });
    else if (kind === "alert" || kind === "structure") out.push({ t: kind, c: children() });
    else if (name === "B" || name === "STRONG") out.push({ t: "b", c: children() });
    else if (name === "I") out.push({ t: "i", c: children() });
    else if (name === "EM") out.push({ t: "emph", c: children() });
    else if (name === "U") out.push({ t: "u", c: children() });
    else if (name === "DIV" || name === "P") {
      // A line the browser made with Enter: a line break before it.
      if (out.length) out.push({ t: "br" });
      out.push(...children());
    } else out.push(...children());
  }
  return tidy(out);
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The elements of the page a text is edited in (formulas filled later, by KaTeX). */
export function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return escapeHtml(n.v).replace(/ /g, "&nbsp;");
        case "br":
          return "<br>";
        case "raw":
          return `<span class="rt-raw" data-k="raw" data-latex="${escapeHtml(n.v)}" contenteditable="false">${escapeHtml(n.v)}</span>`;
        case "math":
          return `<span class="rt-math" data-k="math" data-latex="${escapeHtml(n.v)}" data-d="${n.d === "$" ? "$" : "\\("}" contenteditable="false">${escapeHtml(n.v)}</span>`;
        case "color":
          return `<span data-k="color" data-color="${escapeHtml(n.color)}" style="color:${cssColor(n.color)}">${inlineHtml(n.c)}</span>`;
        case "link":
          return `<span class="rt-link" data-k="link" data-url="${escapeHtml(n.url)}">${inlineHtml(n.c)}</span>`;
        case "alert":
        case "structure":
          return `<span class="rt-${n.t}" data-k="${n.t}">${inlineHtml(n.c)}</span>`;
        case "b":
          return `<b>${inlineHtml(n.c)}</b>`;
        case "i":
          return `<i>${inlineHtml(n.c)}</i>`;
        case "emph":
          return `<em>${inlineHtml(n.c)}</em>`;
        case "u":
          return `<u>${inlineHtml(n.c)}</u>`;
      }
    })
    .join("");
}
