// Spelling in the language of the document. The checker is the one of the
// system (the web view asks it); what RayTeX does is tell it which language
// the document is written in, which passages are in another one, and which
// parts are code, not prose: commands, formulas, keys, pictures.
//
// Pure functions: text in, ranges out.

import { mask, preambleEnd } from "./preamble.ts";

/** The names babel and polyglossia give to languages, as language tags. */
const LANGUAGES: Record<string, string> = {
  english: "en",
  american: "en-US",
  usenglish: "en-US",
  british: "en-GB",
  ukenglish: "en-GB",
  australian: "en-AU",
  canadian: "en-CA",
  newzealand: "en-NZ",
  french: "fr",
  francais: "fr",
  frenchb: "fr",
  acadian: "fr-CA",
  canadien: "fr-CA",
  german: "de",
  germanb: "de",
  ngerman: "de",
  austrian: "de-AT",
  naustrian: "de-AT",
  swissgerman: "de-CH",
  nswissgerman: "de-CH",
  spanish: "es",
  italian: "it",
  portuguese: "pt-PT",
  portuges: "pt-PT",
  brazilian: "pt-BR",
  brazil: "pt-BR",
  dutch: "nl",
  catalan: "ca",
  galician: "gl",
  basque: "eu",
  polish: "pl",
  czech: "cs",
  slovak: "sk",
  slovene: "sl",
  croatian: "hr",
  serbian: "sr",
  bulgarian: "bg",
  russian: "ru",
  ukrainian: "uk",
  greek: "el",
  swedish: "sv",
  danish: "da",
  norsk: "nb",
  norwegian: "nb",
  nynorsk: "nn",
  finnish: "fi",
  icelandic: "is",
  estonian: "et",
  latvian: "lv",
  lithuanian: "lt",
  hungarian: "hu",
  magyar: "hu",
  romanian: "ro",
  turkish: "tr",
  latin: "la",
  esperanto: "eo",
  irish: "ga",
  welsh: "cy",
  arabic: "ar",
  hebrew: "he",
  persian: "fa",
  farsi: "fa",
  hindi: "hi",
  vietnamese: "vi",
  indonesian: "id",
  bahasa: "id",
  malay: "ms",
  japanese: "ja",
  chinese: "zh",
  korean: "ko",
  thai: "th",
};

/** The languages offered when one is chosen by hand, the most written first. */
export const COMMON_LANGUAGES = ["fr", "en-GB", "en-US", "de", "es", "it", "pt-PT", "pt-BR", "nl", "ca", "pl", "sv", "ru", "el"];

/** The tag of a language named as babel names it, or written as a tag already (`fr_FR`, `en-GB`); null when it is neither. */
export function languageTag(name: string): string | null {
  const n = name.trim();
  if (!n) return null;
  const known = LANGUAGES[n.toLowerCase()];
  if (known) return known;
  const tag = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2}))?$/.exec(n);
  return tag ? (tag[2] ? `${tag[1].toLowerCase()}-${tag[2].toUpperCase()}` : tag[1].toLowerCase()) : null;
}

/** The options of `\command[…]{name}` for the first `name` among `names`, in the masked preamble. */
function optionsOf(code: string, command: string, names: string[]): string[] | null {
  const re = new RegExp(String.raw`\\${command}\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}`, "g");
  for (const m of code.matchAll(re)) {
    if (m[2].split(",").some((n) => names.includes(n.trim()))) return (m[1] ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  }
  return null;
}

/**
 * The language a document is written in, as a tag (`fr`, `en-GB`): what a
 * `% !TEX spellcheck` line says, else its main language for babel (the one
 * after `main=`, else the last one of its options, or of the options of the
 * class) or for polyglossia. Null when the document does not say.
 */
export function documentLanguage(text: string): string | null {
  const magic = /^%\s*!\s*T[eE]X\s+spellcheck\s*=\s*(\S+)/m.exec(text.slice(0, 2000));
  if (magic) {
    const tag = languageTag(magic[1]);
    if (tag) return tag;
  }
  const code = mask(text).slice(0, preambleEnd(text));
  const poly = /\\set(?:default|main)language\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(code);
  if (poly) {
    const tag = languageTag(poly[1]);
    if (tag) return tag;
  }
  const babel = optionsOf(code, "usepackage", ["babel"]);
  if (babel) {
    const main = babel.map((o) => /^main\s*=\s*(.+)$/.exec(o)?.[1]).find(Boolean);
    const cls = /\\documentclass\s*(?:\[([^\]]*)\])?/.exec(code)?.[1]?.split(",").map((o) => o.trim()) ?? [];
    // The last language named is the main one; without any, babel takes those of the class.
    const candidates = main ? [main] : [...cls, ...babel].reverse();
    for (const option of candidates) {
      const tag = LANGUAGES[option.toLowerCase()];
      if (tag) return tag;
    }
  }
  return null;
}

/** A stretch of the text. */
export interface Stretch {
  from: number;
  to: number;
}

/** Offset of the `}` closing the group that opens at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * The passages written in another language than the document:
 * `\foreignlanguage{english}{…}`, the `otherlanguage` environment, and the
 * `\textenglish{…}` commands of polyglossia.
 */
export function foreignPassages(text: string): (Stretch & { lang: string })[] {
  const code = mask(text);
  const out: (Stretch & { lang: string })[] = [];
  for (const m of code.matchAll(/\\foreignlanguage\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = closing(code, open);
    const lang = languageTag(m[1]);
    if (lang && LANGUAGES[m[1].trim().toLowerCase()] && close > open) out.push({ from: open + 1, to: close, lang });
  }
  for (const m of code.matchAll(/\\begin\{otherlanguage\*?\}\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
    const from = m.index + m[0].length;
    const end = /\\end\{otherlanguage\*?\}/.exec(code.slice(from));
    const lang = LANGUAGES[m[1].trim().toLowerCase()];
    if (lang && end) out.push({ from, to: from + end.index, lang });
  }
  for (const m of code.matchAll(/\\text([a-z]+)\s*(?:\[[^\]]*\])?\s*\{/g)) {
    const lang = LANGUAGES[m[1]];
    // `\textit`, `\textbf`… are not languages; `\textlatin` is a script, not the language.
    if (!lang || m[1] === "latin") continue;
    const open = m.index + m[0].length - 1;
    const close = closing(code, open);
    if (close > open) out.push({ from: open + 1, to: close, lang });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Environments whose content is code, not prose: pictures, plots, listings. */
const CODE_ENVIRONMENTS = ["tikzpicture", "pgfpicture", "axis", "semilogxaxis", "semilogyaxis", "loglogaxis", "circuitikz", "tikzcd", "forest", "scope", "algorithmic", "lstlisting", "minted", "verbatim", "Verbatim", "filecontents", "luacode", "pycode", "asy", "pspicture"];

/**
 * The parts of the text that are code, where nothing is to be spelled: the
 * preamble (packages, definitions, settings) and the environments that hold
 * a picture, a plot or a listing.
 */
export function codeRegions(text: string): Stretch[] {
  const out: Stretch[] = [];
  const body = preambleEnd(text);
  // A file without `\begin{document}` is a chapter: all of it is text.
  if (body < text.length && body > 0) out.push({ from: 0, to: body });
  const code = mask(text);
  const re = new RegExp(String.raw`\\begin\{(${CODE_ENVIRONMENTS.join("|")})\*?\}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const from = m.index;
    const end = code.indexOf(`\\end{${m[1]}`, from + m[0].length);
    const close = end < 0 ? -1 : code.indexOf("}", end);
    const to = close < 0 ? text.length : close + 1;
    if (from >= body || body >= text.length) out.push({ from, to });
    re.lastIndex = to;
  }
  return out;
}
