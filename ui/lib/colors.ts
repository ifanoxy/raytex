// Colours LaTeX knows by name (xcolor base colours, `dvipsnames`,
// `svgnames`), the colours a document defines, and the CSS colour of an
// xcolor expression (`red!30`, `blue!50!black`) for swatches.
//
// No local imports: tested directly by Node (`npm test`).

export interface NamedColor {
  name: string;
  /** CSS colour of the swatch. */
  css: string;
}

/** Colours of xcolor without any option. */
export const BASE_COLORS: NamedColor[] = [
  { name: "black", css: "#000000" },
  { name: "blue", css: "#0000FF" },
  { name: "brown", css: "#BF8040" },
  { name: "cyan", css: "#00FFFF" },
  { name: "darkgray", css: "#404040" },
  { name: "gray", css: "#808080" },
  { name: "green", css: "#00FF00" },
  { name: "lightgray", css: "#BFBFBF" },
  { name: "lime", css: "#BFFF00" },
  { name: "magenta", css: "#FF00FF" },
  { name: "olive", css: "#808000" },
  { name: "orange", css: "#FF8000" },
  { name: "pink", css: "#FFBFBF" },
  { name: "purple", css: "#BF0040" },
  { name: "red", css: "#FF0000" },
  { name: "teal", css: "#008080" },
  { name: "violet", css: "#800080" },
  { name: "white", css: "#FFFFFF" },
  { name: "yellow", css: "#FFFF00" },
];

/** xcolor with the `dvipsnames` option (68 colours). */
export const DVIPS_COLORS: NamedColor[] = [
  { name: "Apricot", css: "#FBB982" },
  { name: "Aquamarine", css: "#00B5BE" },
  { name: "Bittersweet", css: "#C04F17" },
  { name: "Black", css: "#221E1F" },
  { name: "Blue", css: "#2D2F92" },
  { name: "BlueGreen", css: "#00B3B8" },
  { name: "BlueViolet", css: "#473992" },
  { name: "BrickRed", css: "#B6321C" },
  { name: "Brown", css: "#792500" },
  { name: "BurntOrange", css: "#F7921D" },
  { name: "CadetBlue", css: "#74729A" },
  { name: "CarnationPink", css: "#F282B4" },
  { name: "Cerulean", css: "#00A2E3" },
  { name: "CornflowerBlue", css: "#41B0E4" },
  { name: "Cyan", css: "#00AEEF" },
  { name: "Dandelion", css: "#FDBC42" },
  { name: "DarkOrchid", css: "#A4538A" },
  { name: "Emerald", css: "#00A99D" },
  { name: "ForestGreen", css: "#009B55" },
  { name: "Fuchsia", css: "#8C368C" },
  { name: "Goldenrod", css: "#FFDF42" },
  { name: "Gray", css: "#949698" },
  { name: "Green", css: "#00A64F" },
  { name: "GreenYellow", css: "#DFE674" },
  { name: "JungleGreen", css: "#00A99A" },
  { name: "Lavender", css: "#F49EC4" },
  { name: "LimeGreen", css: "#8DC73E" },
  { name: "Magenta", css: "#EC008C" },
  { name: "Mahogany", css: "#A9341F" },
  { name: "Maroon", css: "#AF3235" },
  { name: "Melon", css: "#F89E7B" },
  { name: "MidnightBlue", css: "#006795" },
  { name: "Mulberry", css: "#A93C93" },
  { name: "NavyBlue", css: "#006EB8" },
  { name: "OliveGreen", css: "#3C8031" },
  { name: "Orange", css: "#F58137" },
  { name: "OrangeRed", css: "#ED135A" },
  { name: "Orchid", css: "#AF72B0" },
  { name: "Peach", css: "#F7965A" },
  { name: "Periwinkle", css: "#7977B8" },
  { name: "PineGreen", css: "#008B72" },
  { name: "Plum", css: "#92268F" },
  { name: "ProcessBlue", css: "#00B0F0" },
  { name: "Purple", css: "#99479B" },
  { name: "RawSienna", css: "#974006" },
  { name: "Red", css: "#ED1B23" },
  { name: "RedOrange", css: "#F26035" },
  { name: "RedViolet", css: "#A1246B" },
  { name: "Rhodamine", css: "#EF559F" },
  { name: "RoyalBlue", css: "#0071BC" },
  { name: "RoyalPurple", css: "#613F99" },
  { name: "RubineRed", css: "#ED017D" },
  { name: "Salmon", css: "#F69289" },
  { name: "SeaGreen", css: "#3FBC9D" },
  { name: "Sepia", css: "#671800" },
  { name: "SkyBlue", css: "#46C5DD" },
  { name: "SpringGreen", css: "#C6DC67" },
  { name: "Tan", css: "#DA9D76" },
  { name: "TealBlue", css: "#00AEB3" },
  { name: "Thistle", css: "#D883B7" },
  { name: "Turquoise", css: "#00B4CE" },
  { name: "Violet", css: "#58429B" },
  { name: "VioletRed", css: "#EF58A0" },
  { name: "White", css: "#FFFFFF" },
  { name: "WildStrawberry", css: "#EE2967" },
  { name: "Yellow", css: "#FFF200" },
  { name: "YellowGreen", css: "#98CC70" },
  { name: "YellowOrange", css: "#FAA21A" },
];

/** xcolor with the `svgnames` option: the SVG / CSS colour names. */
export const SVG_COLORS: NamedColor[] = [
  "AliceBlue",
  "AntiqueWhite",
  "Aqua",
  "Aquamarine",
  "Azure",
  "Beige",
  "Bisque",
  "Black",
  "BlanchedAlmond",
  "Blue",
  "BlueViolet",
  "Brown",
  "BurlyWood",
  "CadetBlue",
  "Chartreuse",
  "Chocolate",
  "Coral",
  "CornflowerBlue",
  "Cornsilk",
  "Crimson",
  "Cyan",
  "DarkBlue",
  "DarkCyan",
  "DarkGoldenrod",
  "DarkGray",
  "DarkGreen",
  "DarkKhaki",
  "DarkMagenta",
  "DarkOliveGreen",
  "DarkOrange",
  "DarkOrchid",
  "DarkRed",
  "DarkSalmon",
  "DarkSeaGreen",
  "DarkSlateBlue",
  "DarkSlateGray",
  "DarkTurquoise",
  "DarkViolet",
  "DeepPink",
  "DeepSkyBlue",
  "DimGray",
  "DodgerBlue",
  "FireBrick",
  "FloralWhite",
  "ForestGreen",
  "Fuchsia",
  "Gainsboro",
  "GhostWhite",
  "Gold",
  "Goldenrod",
  "Gray",
  "Green",
  "GreenYellow",
  "Honeydew",
  "HotPink",
  "IndianRed",
  "Indigo",
  "Ivory",
  "Khaki",
  "Lavender",
  "LavenderBlush",
  "LawnGreen",
  "LemonChiffon",
  "LightBlue",
  "LightCoral",
  "LightCyan",
  "LightGoldenrod",
  "LightGoldenrodYellow",
  "LightGray",
  "LightGreen",
  "LightPink",
  "LightSalmon",
  "LightSeaGreen",
  "LightSkyBlue",
  "LightSlateBlue",
  "LightSlateGray",
  "LightSteelBlue",
  "LightYellow",
  "Lime",
  "LimeGreen",
  "Linen",
  "Magenta",
  "Maroon",
  "MediumAquamarine",
  "MediumBlue",
  "MediumOrchid",
  "MediumPurple",
  "MediumSeaGreen",
  "MediumSlateBlue",
  "MediumSpringGreen",
  "MediumTurquoise",
  "MediumVioletRed",
  "MidnightBlue",
  "MintCream",
  "MistyRose",
  "Moccasin",
  "NavajoWhite",
  "Navy",
  "NavyBlue",
  "OldLace",
  "Olive",
  "OliveDrab",
  "Orange",
  "OrangeRed",
  "Orchid",
  "PaleGoldenrod",
  "PaleGreen",
  "PaleTurquoise",
  "PaleVioletRed",
  "PapayaWhip",
  "PeachPuff",
  "Peru",
  "Pink",
  "Plum",
  "PowderBlue",
  "Purple",
  "Red",
  "RosyBrown",
  "RoyalBlue",
  "SaddleBrown",
  "Salmon",
  "SandyBrown",
  "SeaGreen",
  "Seashell",
  "Sienna",
  "Silver",
  "SkyBlue",
  "SlateBlue",
  "SlateGray",
  "Snow",
  "SpringGreen",
  "SteelBlue",
  "Tan",
  "Teal",
  "Thistle",
  "Tomato",
  "Turquoise",
  "Violet",
  "VioletRed",
  "Wheat",
  "White",
  "WhiteSmoke",
  "Yellow",
  "YellowGreen"
].map((name) => ({ name, css: name.toLowerCase().replace(/^lightgoldenrod$/, "#eedd82").replace(/^lightslateblue$/, "#8470ff").replace(/^violetred$/, "#d02090").replace(/^navyblue$/, "#000080") }));

export interface DocumentColors {
  /** xcolor (or color) is loaded. */
  xcolor: boolean;
  /** Options of xcolor (`dvipsnames`, `svgnames`…). */
  options: string[];
  /** Colours defined by the document (`\definecolor`, `\colorlet`). */
  defined: NamedColor[];
}

/** The preamble without comments. */
function preambleOf(text: string): string {
  const end = text.search(/\\begin\s*\{document\}/);
  return (end < 0 ? text : text.slice(0, end))
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\") i++;
        else if (line[i] === "%") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
const rgbHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

function parseHex(css: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(css);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS colour of a colour given in an xcolor model (`HTML`, `rgb`, `RGB`, `gray`, `cmyk`). */
export function modelCss(model: string, spec: string): string | null {
  const nums = spec.split(/[\s,]+/).filter(Boolean).map(Number);
  switch (model.trim()) {
    case "HTML":
      return /^[0-9a-fA-F]{6}$/.test(spec.trim()) ? `#${spec.trim().toLowerCase()}` : null;
    case "rgb":
      return nums.length === 3 && nums.every((n) => n >= 0 && n <= 1) ? rgbHex(nums[0] * 255, nums[1] * 255, nums[2] * 255) : null;
    case "RGB":
      return nums.length === 3 ? rgbHex(nums[0], nums[1], nums[2]) : null;
    case "gray":
      return nums.length === 1 ? rgbHex(nums[0] * 255, nums[0] * 255, nums[0] * 255) : null;
    case "cmyk": {
      if (nums.length !== 4) return null;
      const [c, m, y, k] = nums;
      return rgbHex(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k));
    }
    default:
      return null;
  }
}

/**
 * CSS colour of an xcolor expression: a name, or a mix like `red!30`
 * (30 % red, the rest white) or `blue!50!black`.
 */
export function expressionCss(expr: string, known: NamedColor[]): string | null {
  const find = (name: string) => {
    const c = known.find((k) => k.name === name.trim());
    if (!c) return null;
    if (c.css.startsWith("#")) return parseHex(c.css);
    return null;
  };
  const parts = expr.split("!").map((p) => p.trim());
  let color = find(parts[0]);
  if (!color) return null;
  for (let i = 1; i < parts.length; i += 2) {
    const pct = Number(parts[i]);
    if (!Number.isFinite(pct)) return null;
    const other = i + 1 < parts.length ? find(parts[i + 1]) : [255, 255, 255];
    if (!other) return null;
    const p = Math.max(0, Math.min(100, pct)) / 100;
    color = [0, 1, 2].map((k) => color![k] * p + other[k] * (1 - p)) as [number, number, number];
  }
  return rgbHex(color[0], color[1], color[2]);
}

/** xcolor, its options and the colours defined in a document. */
export function documentColors(text: string): DocumentColors {
  const head = preambleOf(text);
  const out: DocumentColors = { xcolor: false, options: [], defined: [] };
  const pkg = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = pkg.exec(head))) {
    const names = m[2].split(",").map((s) => s.trim());
    if (names.includes("xcolor") || names.includes("color")) {
      out.xcolor = out.xcolor || names.includes("xcolor");
      out.options.push(...(m[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    }
    // TikZ and pgfplots load xcolor.
    if (names.some((n) => ["tikz", "pgfplots", "circuitikz", "tcolorbox"].includes(n))) out.xcolor = true;
  }
  // Classes that load xcolor (beamer) and options given globally.
  if (/\\documentclass\s*(?:\[[^\]]*\])?\s*\{beamer\}/.test(head)) out.xcolor = true;
  const cls = /\\documentclass\s*\[([^\]]*)\]/.exec(head);
  if (cls) out.options.push(...cls[1].split(",").map((s) => s.trim()).filter((o) => /names$/.test(o)));
  const known = [...BASE_COLORS, ...(out.options.includes("dvipsnames") ? DVIPS_COLORS : []), ...(out.options.includes("svgnames") ? SVG_COLORS.filter((c) => c.css.startsWith("#")) : [])];
  const def = /\\(?:definecolor|providecolor)\s*\{([^}]+)\}\s*\{([^}]+)\}\s*\{([^}]+)\}|\\colorlet\s*\{([^}]+)\}\s*\{([^}]+)\}/g;
  while ((m = def.exec(head))) {
    const name = (m[1] ?? m[4]).trim();
    const css = m[1] ? modelCss(m[2], m[3]) : expressionCss(m[5], [...known, ...out.defined]);
    if (!out.defined.some((c) => c.name === name)) out.defined.push({ name, css: css ?? "transparent" });
  }
  return out;
}

/** Name for a colour picked by hand: `#3a7bc2` → `color3A7BC2`. */
export function customColorName(css: string): string {
  return `color${css.replace(/^#/, "").toUpperCase()}`;
}

/** Packages (and classes) that load xcolor themselves. */
const XCOLOR_LOADERS = ["tikz", "pgf", "pgfplots", "circuitikz", "tikz-cd", "tcolorbox", "forest", "pgfornament", "mdframed", "todonotes", "beamerarticle"];

/**
 * Gives xcolor an option (`dvipsnames`, `svgnames`) without option clash:
 * on its own `\usepackage` when xcolor is loaded there first, else with
 * `\PassOptionsToPackage` before `\documentclass` (TikZ, Beamer… load
 * xcolor earlier). `addOption` edits the `\usepackage` line.
 */
export function withXcolorOption(text: string, option: string, addOption: (text: string) => string): string {
  const head = preambleOf(text);
  const passed = /\\PassOptionsToPackage\s*\{([^}]*)\}\s*\{xcolor\}/.exec(head);
  if (passed && passed[1].split(",").map((s) => s.trim()).includes(option)) return text;
  const pkg = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;
  let explicit = -1;
  let loader = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{beamer\}/.test(head) ? 0 : -1;
  let m: RegExpExecArray | null;
  while ((m = pkg.exec(head))) {
    const names = m[2].split(",").map((s) => s.trim());
    if (names.includes("xcolor") && explicit < 0) {
      explicit = m.index;
      if ((m[1] ?? "").split(",").map((s) => s.trim()).includes(option)) return text;
    }
    if (loader < 0 && names.some((n) => XCOLOR_LOADERS.includes(n))) loader = m.index;
  }
  if (explicit >= 0 && (loader < 0 || explicit < loader)) return addOption(text);
  if (loader < 0 && explicit < 0) return addOption(text);
  // xcolor is loaded by something before: the option must be known before \documentclass.
  const cls = text.search(/\\documentclass/);
  const at = cls < 0 ? 0 : cls;
  if (passed) {
    const start = text.indexOf(passed[0]);
    const inner = passed[1].trim();
    const updated = `\\PassOptionsToPackage{${inner ? `${inner},` : ""}${option}}{xcolor}`;
    return text.slice(0, start) + updated + text.slice(start + passed[0].length);
  }
  return `${text.slice(0, at)}\\PassOptionsToPackage{${option}}{xcolor}\n${text.slice(at)}`;
}
