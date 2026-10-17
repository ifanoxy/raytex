// The look of a Beamer deck, as its preamble sets it: its theme, its
// colours, its fonts, the shape of its slides (lying down only: 16:9,
// 16:10, 4:3) and the navigation symbols; read, and written back with what
// set them before taken out, the rest of the preamble as it was.
//
// No local imports: tested directly by Node (`npm test`).

export interface DeckLook {
  /** `\usetheme{…}`; "default" when there is none. */
  theme: string;
  /** `\usecolortheme{…}`; "default" when there is none. */
  color: string;
  /** `\usefonttheme{…}`; "default" when there is none. */
  font: string;
  /** `aspectratio=…` of the class: "169", "1610", "43"…; "43" when there is none (Beamer's own). */
  ratio: string;
  /** The navigation symbols drawn (no `\setbeamertemplate{navigation symbols}{}`). */
  navigation: boolean;
}

/** The themes shown first (drawn on the slide), then the others. */
export const MAIN_THEMES = ["default", "Madrid", "Boadilla", "CambridgeUS", "AnnArbor", "Warsaw", "Berlin", "Copenhagen", "Singapore", "Frankfurt", "PaloAlto", "Hannover"];
export const OTHER_THEMES = ["Antibes", "Bergen", "Berkeley", "Darmstadt", "Dresden", "Goettingen", "Ilmenau", "JuanLesPins", "Luebeck", "Malmoe", "Marburg", "Montpellier", "Pittsburgh", "Rochester", "Szeged"];

/** The colour themes, with a colour each to show them by. */
export const COLORS: { id: string; swatch: string }[] = [
  { id: "default", swatch: "#3333b3" },
  { id: "beaver", swatch: "#a6192e" },
  { id: "crane", swatch: "#ffb300" },
  { id: "dolphin", swatch: "#5b6bb8" },
  { id: "orchid", swatch: "#2e3192" },
  { id: "rose", swatch: "#c5b4d9" },
  { id: "seahorse", swatch: "#7f7fd9" },
  { id: "whale", swatch: "#1f1f80" },
  { id: "wolverine", swatch: "#f2c200" },
  { id: "albatross", swatch: "#14144a" },
  { id: "beetle", swatch: "#666666" },
  { id: "fly", swatch: "#4d4d4d" },
  { id: "seagull", swatch: "#8c8c8c" },
  { id: "dove", swatch: "#cccccc" },
  { id: "lily", swatch: "#6b6bd9" },
  { id: "spruce", swatch: "#2e6b4f" },
];

export const FONTS = ["default", "serif", "structurebold", "structureitalicserif", "structuresmallcapsserif", "professionalfonts"];

/** The shapes of slides lying down. */
export const RATIOS: { id: string; label: string }[] = [
  { id: "169", label: "16:9" },
  { id: "1610", label: "16:10" },
  { id: "43", label: "4:3" },
  { id: "149", label: "14:9" },
  { id: "32", label: "3:2" },
  { id: "54", label: "5:4" },
];

/** The shape of slides of an `aspectratio` (width over height). */
export function ratioValue(id: string): number {
  const known: Record<string, number> = { "169": 16 / 9, "1610": 16 / 10, "43": 4 / 3, "149": 14 / 9, "32": 3 / 2, "54": 5 / 4, "141": 1.41, "221": 2.21 };
  return known[id] ?? 4 / 3;
}

/** Where the preamble ends (`\begin{document}`), or the whole text. */
export function preambleEnd(text: string): number {
  const m = /^[^%\n]*?\\begin\s*\{document\}/m.exec(text);
  return m ? m.index + m[0].length - "\\begin{document}".length : text.length;
}

/** The text with its comments blanked (offsets kept). */
function uncommented(text: string): string {
  return text.replace(/(^|[^\\])(%.*)$/gm, (_, a: string, c: string) => a + " ".repeat(c.length));
}

const NAVIGATION = /\\setbeamertemplate\s*\{navigation symbols\}\s*\{\s*\}/;

/** The look the preamble of a deck gives it. */
export function readLook(text: string): DeckLook {
  const pre = uncommented(text.slice(0, preambleEnd(text)));
  const last = (re: RegExp) => [...pre.matchAll(re)].pop()?.[1]?.trim();
  const cls = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{beamer\}/.exec(pre);
  const ratio = /(?:^|,)\s*aspectratio\s*=\s*(\d+)\s*(?:,|$)/.exec(cls?.[1] ?? "")?.[1];
  return {
    theme: last(/\\usetheme\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g) ?? "default",
    color: last(/\\usecolortheme\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g) ?? "default",
    font: last(/\\usefonttheme\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g) ?? "default",
    ratio: ratio ?? "43",
    navigation: !NAVIGATION.test(pre),
  };
}

/**
 * The preamble of a deck given a look: each `\use…theme` changed in place
 * (its options kept) or added after the class, or taken out for "default"
 * (but the theme, written `\usetheme{default}` when one was there);
 * `aspectratio` set in the options of the class.
 */
export function writeLook(text: string, look: Partial<DeckLook>): string {
  const end = preambleEnd(text);
  let pre = text.slice(0, end);
  const cls = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{beamer\}[^\n]*\n?/.exec(pre);
  const afterClass = () => {
    const c = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{beamer\}[^\n]*\n?/.exec(pre);
    return c ? c.index + c[0].length : 0;
  };
  const set = (command: string, value: string | undefined, keepDefault: boolean) => {
    if (value === undefined) return;
    const re = new RegExp(`^([ \\t]*)\\\\${command}\\s*(\\[[^\\]]*\\])?\\s*\\{[^}]*\\}[^\\n]*\\n?`, "gm");
    const found = [...uncommented(pre).matchAll(re)];
    if (value === "default" && !keepDefault) {
      for (const m of found.reverse()) pre = pre.slice(0, m.index) + pre.slice(m.index! + m[0].length);
      return;
    }
    const last = found.pop();
    if (last) {
      const line = `${last[1]}\\${command}${last[2] ?? ""}{${value}}\n`;
      pre = pre.slice(0, last.index) + line + pre.slice(last.index! + last[0].length);
    } else if (value !== "default") {
      // After the other themes, else after the class.
      const others = [...uncommented(pre).matchAll(/^[ \t]*\\use(?:color|font|inner|outer)?theme\b[^\n]*\n?/gm)].pop();
      const at = others ? others.index! + others[0].length : afterClass();
      pre = `${pre.slice(0, at)}\\${command}{${value}}\n${pre.slice(at)}`;
    }
  };
  set("usetheme", look.theme, true);
  set("usecolortheme", look.color, false);
  set("usefonttheme", look.font, false);
  if (look.ratio !== undefined && cls) {
    const c = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{beamer\}/.exec(pre)!;
    const options = (c[1] ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o && !/^aspectratio\s*=/.test(o));
    options.unshift(`aspectratio=${look.ratio}`);
    pre = `${pre.slice(0, c.index)}\\documentclass[${options.join(",")}]{beamer}${pre.slice(c.index + c[0].length)}`;
  }
  if (look.navigation !== undefined) {
    const has = NAVIGATION.exec(uncommented(pre));
    if (look.navigation && has) {
      const lineStart = pre.lastIndexOf("\n", has.index) + 1;
      const nl = pre.indexOf("\n", has.index);
      const alone = !pre.slice(lineStart, has.index).trim() && !pre.slice(has.index + has[0].length, nl < 0 ? pre.length : nl).trim();
      pre = alone ? pre.slice(0, lineStart) + pre.slice(nl < 0 ? pre.length : nl + 1) : pre.slice(0, has.index) + pre.slice(has.index + has[0].length);
    } else if (!look.navigation && !has) {
      const themes = [...uncommented(pre).matchAll(/^[ \t]*\\use(?:color|font|inner|outer)?theme\b[^\n]*\n?/gm)].pop();
      const at = themes ? themes.index! + themes[0].length : afterClass();
      pre = `${pre.slice(0, at)}\\setbeamertemplate{navigation symbols}{}\n${pre.slice(at)}`;
    }
  }
  return pre + text.slice(end);
}

/** A document of one slide, to see a look on: the preamble given that look, and the slide. */
export function lookSample(text: string, frame: string, look: Partial<DeckLook>): string {
  const end = preambleEnd(text);
  return `${writeLook(text.slice(0, end), look)}\\begin{document}\n${frame}\n\\end{document}\n`;
}
