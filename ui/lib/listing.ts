// Code in a document, with the `listings` package: it works with every
// engine and every distribution, and asks for no outside tool. A listing
// carries its language, its caption and its label; how code looks is said
// once, for the whole document, in a block of the preamble this module
// writes and reads back.

import { addPackages, preambleEnd } from "./preamble.ts";

// ---------------------------------------------------------------- languages

/** A language `listings` does not know: what it needs to colour it. */
interface Definition {
  keywords: string[];
  /** Start of a comment that runs to the end of the line. */
  line?: string;
  /** Start and end of a comment in a block. */
  block?: [string, string];
  /** Characters a string is written between. */
  strings: string[];
  /** Upper and lower case differ (true for nearly all). */
  sensitive?: boolean;
}

export interface Language {
  /** The name shown, and written in a document for a language of our own. */
  name: string;
  /** What `language=` takes: `Python`, `[Sharp]C`, `[LaTeX]TeX`. */
  listings: string;
  /** Extensions of its files, for a listing read from a file. */
  extensions: string[];
  /** Its definition, when `listings` has none. */
  definition?: Definition;
}

const C_LIKE = { line: "//", block: ["/*", "*/"] as [string, string] };

/** The languages offered, the most common first; then by name. */
export const LANGUAGES: Language[] = [
  { name: "Python", listings: "Python", extensions: ["py"] },
  { name: "C", listings: "C", extensions: ["c", "h"] },
  { name: "C++", listings: "C++", extensions: ["cpp", "cc", "cxx", "hpp", "hh"] },
  { name: "Java", listings: "Java", extensions: ["java"] },
  {
    name: "JavaScript",
    listings: "JavaScript",
    extensions: ["js", "mjs", "cjs", "jsx"],
    definition: {
      keywords: "async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield".split(" "),
      ...C_LIKE,
      strings: ['"', "'", "`"],
    },
  },
  {
    name: "TypeScript",
    listings: "TypeScript",
    extensions: ["ts", "tsx"],
    definition: {
      keywords:
        "abstract any as async await boolean break case catch class const continue declare default delete do else enum export extends false finally for from function if implements import in instanceof interface keyof let namespace never new null number of private protected public readonly return static string super switch this throw true try type typeof undefined unknown var void while yield".split(
          " ",
        ),
      ...C_LIKE,
      strings: ['"', "'", "`"],
    },
  },
  { name: "R", listings: "R", extensions: ["r"] },
  { name: "MATLAB", listings: "Matlab", extensions: ["m"] },
  { name: "SQL", listings: "SQL", extensions: ["sql"] },
  { name: "Bash", listings: "bash", extensions: ["sh", "bash"] },
  { name: "LaTeX", listings: "[LaTeX]TeX", extensions: ["tex", "sty", "cls"] },
  { name: "HTML", listings: "HTML", extensions: ["html", "htm"] },
  { name: "Ada", listings: "Ada", extensions: ["adb", "ads"] },
  { name: "Assembler (x86)", listings: "[x86masm]Assembler", extensions: ["asm", "s"] },
  { name: "C#", listings: "[Sharp]C", extensions: ["cs"] },
  {
    name: "CSS",
    listings: "CSS",
    extensions: ["css"],
    definition: { keywords: "important inherit initial unset none auto".split(" "), block: ["/*", "*/"], strings: ['"', "'"], sensitive: false },
  },
  {
    name: "Dart",
    listings: "Dart",
    extensions: ["dart"],
    definition: {
      keywords:
        "abstract as assert async await bool break case catch class const continue default do double dynamic else enum extends false final finally for if implements import in int is late new null required return static String super switch this throw true try var void while with yield".split(
          " ",
        ),
      ...C_LIKE,
      strings: ['"', "'"],
    },
  },
  { name: "Fortran", listings: "Fortran", extensions: ["f", "f90", "f95"] },
  {
    name: "Go",
    listings: "Go",
    extensions: ["go"],
    definition: {
      keywords:
        "bool break byte case chan const continue default defer else error fallthrough false float64 for func go goto if import int interface map nil package range return rune select string struct switch true type uint var".split(
          " ",
        ),
      ...C_LIKE,
      strings: ['"', "`"],
    },
  },
  { name: "Haskell", listings: "Haskell", extensions: ["hs"] },
  {
    name: "JSON",
    listings: "JSON",
    extensions: ["json"],
    definition: { keywords: ["true", "false", "null"], strings: ['"'] },
  },
  {
    name: "Julia",
    listings: "Julia",
    extensions: ["jl"],
    definition: {
      keywords: "abstract baremodule begin break catch const continue do else elseif end export false finally for function global if import in let local macro module mutable nothing quote return struct true try using where while".split(" "),
      line: "#",
      block: ["#=", "=#"],
      strings: ['"'],
    },
  },
  {
    name: "Kotlin",
    listings: "Kotlin",
    extensions: ["kt", "kts"],
    definition: {
      keywords:
        "abstract as break by catch class companion const continue data do else enum false final finally for fun if import in interface internal is lateinit null object open override package private protected public return sealed super suspend this throw true try typealias val var when while".split(
          " ",
        ),
      ...C_LIKE,
      strings: ['"'],
    },
  },
  { name: "Lisp", listings: "Lisp", extensions: ["lisp", "lsp", "el"] },
  // No dialect is the default one: `language=Lua` alone is an error.
  { name: "Lua", listings: "[5.0]Lua", extensions: ["lua"] },
  { name: "Makefile", listings: "make", extensions: ["mk"] },
  { name: "OCaml", listings: "[Objective]Caml", extensions: ["ml", "mli"] },
  { name: "Octave", listings: "Octave", extensions: [] },
  { name: "Pascal", listings: "Pascal", extensions: ["pas", "pp"] },
  { name: "Perl", listings: "Perl", extensions: ["pl", "pm"] },
  { name: "PHP", listings: "PHP", extensions: ["php"] },
  { name: "Prolog", listings: "Prolog", extensions: ["pro"] },
  { name: "Ruby", listings: "Ruby", extensions: ["rb"] },
  {
    name: "Rust",
    listings: "Rust",
    extensions: ["rs"],
    definition: {
      keywords:
        "as async await bool break const continue crate dyn else enum extern false fn for i32 i64 if impl in let loop match mod move mut pub ref return self Self static str String struct super trait true type u8 u32 u64 unsafe use usize where while".split(
          " ",
        ),
      ...C_LIKE,
      // Not the apostrophe: it also starts a lifetime (`'a`), which is no string.
      strings: ['"'],
    },
  },
  { name: "Scala", listings: "Scala", extensions: ["scala"] },
  { name: "Scilab", listings: "Scilab", extensions: ["sce", "sci"] },
  {
    name: "Swift",
    listings: "Swift",
    extensions: ["swift"],
    definition: {
      keywords:
        "as associatedtype break case catch class continue default defer do else enum extension fallthrough false fileprivate final for func guard if import in init inout internal is let nil open private protocol public repeat return self Self static struct subscript super switch throw throws true try typealias var where while".split(
          " ",
        ),
      ...C_LIKE,
      strings: ['"'],
    },
  },
  {
    name: "TOML",
    listings: "TOML",
    extensions: ["toml"],
    definition: { keywords: ["true", "false"], line: "#", strings: ['"', "'"] },
  },
  { name: "Verilog", listings: "Verilog", extensions: ["v", "sv"] },
  { name: "VHDL", listings: "VHDL", extensions: ["vhd", "vhdl"] },
  { name: "XML", listings: "XML", extensions: ["xml", "svg"] },
  {
    name: "YAML",
    listings: "YAML",
    extensions: ["yaml", "yml"],
    definition: { keywords: "true false null yes no on off".split(" "), line: "#", strings: ['"', "'"], sensitive: false },
  },
];

/** How many languages lead the list as the common ones. */
export const COMMON_LANGUAGES = 11;

/** The language of that name (as shown, or as `language=` writes it), whatever the case. */
export function languageOf(name: string): Language | null {
  const wanted = name.trim().toLowerCase();
  return LANGUAGES.find((l) => l.name.toLowerCase() === wanted || l.listings.toLowerCase() === wanted) ?? null;
}

/** The language of a file, from its extension. */
export function languageOfFile(file: string): Language | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(file)?.[1].toLowerCase();
  return ext ? (LANGUAGES.find((l) => l.extensions.includes(ext)) ?? null) : null;
}

/** `\lstdefinelanguage` for a language `listings` does not know. */
function definitionCode(language: Language): string {
  const d = language.definition!;
  // In a definition, `#` is the sign of a parameter: it is written `\#`.
  const mark = (text: string) => text.replace(/#/g, "\\#");
  const lines = [`  keywords={${d.keywords.join(", ")}},`, `  sensitive=${d.sensitive === false ? "false" : "true"},`];
  if (d.line) lines.push(`  morecomment=[l]{${mark(d.line)}},`);
  if (d.block) lines.push(`  morecomment=[s]{${mark(d.block[0])}}{${mark(d.block[1])}},`);
  for (const quote of d.strings) lines.push(`  morestring=[b]${quote},`);
  return `\\lstdefinelanguage{${language.listings}}{\n${lines.join("\n")}\n}`;
}

// -------------------------------------------------------------------- style

export type CodeTheme = "light" | "plain" | "dark";
export type CodeSize = "footnotesize" | "small" | "normalsize";

/** How code looks in the whole document. */
export interface CodeStyle {
  /** `light`: colours on a pale ground; `plain`: black and white, for print; `dark`: a dark ground. */
  theme: CodeTheme;
  /** Lines are numbered. */
  numbers: boolean;
  /** A line too long goes on on the next one (else it runs into the margin). */
  wrap: boolean;
  /** A frame, or the ground of the theme, around the code. */
  frame: boolean;
  size: CodeSize;
  /** Columns a tabulation is worth. */
  tab: number;
}

export const CODE_THEMES: CodeTheme[] = ["light", "plain", "dark"];
export const CODE_SIZES: CodeSize[] = ["footnotesize", "small", "normalsize"];
export const DEFAULT_CODE_STYLE: CodeStyle = { theme: "light", numbers: true, wrap: true, frame: true, size: "small", tab: 4 };

/** Colours of a theme, as xcolor mixes them: text, keywords, comments, strings, numbers of the lines, ground, rule. */
const THEMES: Record<CodeTheme, { basic: string; keyword: string; comment: string; string: string; number: string; ground: string | null; rule: string }> = {
  light: { basic: "", keyword: "\\color{blue!70!black}\\bfseries", comment: "\\color{green!40!black}\\itshape", string: "\\color{red!65!black}", number: "black!45", ground: "black!4", rule: "black!20" },
  plain: { basic: "", keyword: "\\bfseries", comment: "\\itshape\\color{black!60}", string: "", number: "black!55", ground: null, rule: "black!60" },
  dark: { basic: "\\color{white}", keyword: "\\color{cyan!55!white}\\bfseries", comment: "\\color{green!50!white}\\itshape", string: "\\color{orange!65!white}", number: "black!45", ground: "black!88", rule: "black!88" },
};

/**
 * Accented letters as `listings` must be told them: it reads its code byte
 * by byte, and with pdfLaTeX a letter of several bytes breaks it (a comment
 * in French is enough). Harmless with the other engines.
 */
const ACCENTS: [string, string][] = [
  ["é", "\\'e"], ["è", "\\`e"], ["ê", "\\^e"], ["ë", '\\"e'], ["à", "\\`a"], ["â", "\\^a"], ["ä", '\\"a'], ["ù", "\\`u"], ["û", "\\^u"], ["ü", '\\"u'],
  ["î", "\\^\\i"], ["ï", '\\"\\i'], ["ô", "\\^o"], ["ö", '\\"o'], ["ç", "\\c c"], ["ñ", "\\~n"], ["É", "\\'E"], ["È", "\\`E"], ["À", "\\`A"], ["Ç", "\\c C"],
  ["œ", "\\oe"], ["ß", "\\ss"], ["«", "\\guillemotleft"], ["»", "\\guillemotright"], ["’", "'"], ["€", "\\texteuro"],
];

const STYLE_HEAD = "% RayTeX code style:";
const STYLE_END = "\\lstset{style=raytex}";
const LANGUAGE_HEAD = "% RayTeX code language:";

function headLine(s: CodeStyle): string {
  const on = (b: boolean) => (b ? "on" : "off");
  return `${STYLE_HEAD} theme=${s.theme} numbers=${on(s.numbers)} wrap=${on(s.wrap)} frame=${on(s.frame)} size=${s.size} tab=${s.tab}`;
}

/** The block of the preamble that says how code looks: a line that names the choices, then the style they make. */
export function styleBlock(s: CodeStyle): string {
  const c = THEMES[s.theme];
  const keys = [
    `basicstyle=\\ttfamily\\${s.size}${c.basic}`,
    `keywordstyle=${c.keyword}`,
    `commentstyle=${c.comment}`,
    `stringstyle=${c.string}`,
    s.numbers ? `numbers=left, numberstyle=\\scriptsize\\color{${c.number}}, numbersep=8pt` : "numbers=none",
    s.wrap ? "breaklines=true, breakatwhitespace=false, postbreak=\\mbox{\\textcolor{gray}{$\\hookrightarrow$}\\space}" : "breaklines=false",
    `tabsize=${s.tab}, showstringspaces=false, columns=fullflexible, keepspaces=true`,
    s.frame
      ? c.ground
        ? `frame=single, rulecolor=\\color{${c.rule}}, backgroundcolor=\\color{${c.ground}}, framesep=4pt`
        : `frame=tb, rulecolor=\\color{${c.rule}}, framesep=4pt`
      : c.ground && s.theme === "dark"
        ? `frame=none, backgroundcolor=\\color{${c.ground}}`
        : "frame=none",
    "aboveskip=\\medskipamount, belowskip=\\medskipamount",
    s.numbers ? "xleftmargin=2em, framexleftmargin=1.6em" : "xleftmargin=0pt",
    `literate=${ACCENTS.map(([letter, tex]) => `{${letter}}{{${tex}}}1`).join(" ")}`,
  ];
  return `${headLine(s)}\n\\lstdefinestyle{raytex}{\n${keys.map((k) => `  ${k}`).join(",\n")}\n}\n${STYLE_END}`;
}

/** Where the block of the style is in `text` (its preamble), if it has one. */
function styleRange(text: string): { from: number; to: number } | null {
  const end = preambleEnd(text);
  const from = text.indexOf(STYLE_HEAD);
  if (from < 0 || from > end) return null;
  const close = text.indexOf(STYLE_END, from);
  return close < 0 || close > end ? null : { from, to: close + STYLE_END.length };
}

/**
 * The style of the code of a document, read back from its preamble; null
 * when it has none of ours. `edited`: the block was changed by hand since
 * (it is then replaced only when another style is asked for).
 */
export function readCodeStyle(text: string): { style: CodeStyle; edited: boolean } | null {
  const range = styleRange(text);
  if (!range) return null;
  const block = text.slice(range.from, range.to);
  const head = block.split("\n")[0].slice(STYLE_HEAD.length);
  const said = new Map<string, string>();
  for (const m of head.matchAll(/(\w+)=(\S+)/g)) said.set(m[1], m[2]);
  const d = DEFAULT_CODE_STYLE;
  const theme = said.get("theme") as CodeTheme;
  const size = said.get("size") as CodeSize;
  const tab = Number(said.get("tab"));
  const flag = (key: string, fallback: boolean) => (said.has(key) ? said.get(key) === "on" : fallback);
  const style: CodeStyle = {
    theme: CODE_THEMES.includes(theme) ? theme : d.theme,
    numbers: flag("numbers", d.numbers),
    wrap: flag("wrap", d.wrap),
    frame: flag("frame", d.frame),
    size: CODE_SIZES.includes(size) ? size : d.size,
    tab: [2, 4, 8].includes(tab) ? tab : d.tab,
  };
  return { style, edited: block.replace(/\r\n/g, "\n") !== styleBlock(style) };
}

/**
 * The document with what its code needs: the packages, the style (written
 * at the end of the preamble, or in place of the one it had), and the
 * definition of each of `languages` that `listings` does not know. Null
 * style: the one the document has is left as it is.
 */
export function writeCodeStyle(text: string, style: CodeStyle | null, languages: Language[] = []): string {
  let out = addPackages(text, [{ name: "listings" }, { name: "xcolor" }]);
  if (preambleEnd(out) >= out.length) return text;
  const range = styleRange(out);
  if (style && range) out = out.slice(0, range.from) + styleBlock(style) + out.slice(range.to);
  else if (!range) {
    const at = preambleEnd(out);
    const before = out.slice(0, at).replace(/\n*$/, "\n\n");
    out = `${before}${styleBlock(style ?? DEFAULT_CODE_STYLE)}\n\n${out.slice(at)}`;
  }
  for (const language of languages) {
    if (!language.definition || out.slice(0, preambleEnd(out)).includes(`\\lstdefinelanguage{${language.listings}}`)) continue;
    // After the style: one block for each language, said by a line of its own.
    const close = styleRange(out)!.to;
    out = `${out.slice(0, close)}\n${LANGUAGE_HEAD} ${language.name}\n${definitionCode(language)}${out.slice(close)}`;
  }
  return out;
}

// ------------------------------------------------------------------ listing

/** A piece of code in the document. */
export interface Listing {
  /** Name of its language (see `LANGUAGES`); empty: no language, nothing is coloured. */
  language: string;
  /** The code, when it is written in the document. */
  code: string;
  /** The file it is read from instead (`\lstinputlisting`), as the document names it. */
  file: string | null;
  caption: string;
  label: string;
  /** Its other options, kept as they are written. */
  options: string;
}

export function emptyListing(): Listing {
  return { language: "Python", code: "", file: null, caption: "", label: "", options: "" };
}

/** A label made from a caption: `Tri rapide (version 2)` gives `lst:tri-rapide-version-2`. */
export function listingLabel(caption: string): string {
  const slug = caption
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\\[a-zA-Z]+|[{}$\\]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `lst:${slug.slice(0, 40).replace(/-+$/, "")}` : "";
}

function optionsOf(l: Listing): string {
  const language = languageOf(l.language);
  const parts = [];
  if (language) parts.push(`language=${language.listings.startsWith("[") ? `{${language.listings}}` : language.listings}`);
  if (l.caption.trim()) parts.push(`caption={${l.caption.trim()}}`);
  if (l.label.trim()) parts.push(`label={${l.label.trim()}}`);
  if (l.options.trim()) parts.push(l.options.trim());
  return parts.length ? `[${parts.join(", ")}]` : "";
}

/** The code of a listing, as it is written in the document. */
export function listingCode(l: Listing): string {
  if (l.file !== null) return `\\lstinputlisting${optionsOf(l)}{${l.file}}`;
  const code = l.code.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return `\\begin{lstlisting}${optionsOf(l)}\n${code}\n\\end{lstlisting}`;
}

/** Splits `a=1, b={x, y}, c` at the commas that are not inside braces or brackets. */
function splitOptions(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
  }
  out.push(text.slice(from));
  return out.map((o) => o.trim()).filter(Boolean);
}

const unbraced = (value: string) => (/^\{[\s\S]*\}$/.test(value) ? value.slice(1, -1) : value);

/** The options of a listing: its language, caption and label, and the others as written. */
function readOptions(text: string): Pick<Listing, "language" | "caption" | "label" | "options"> {
  const out = { language: "", caption: "", label: "", options: "" };
  const kept: string[] = [];
  for (const option of splitOptions(text)) {
    const eq = option.indexOf("=");
    const key = eq < 0 ? option : option.slice(0, eq).trim();
    const value = eq < 0 ? "" : option.slice(eq + 1).trim();
    if (key === "language") out.language = languageOf(unbraced(value))?.name ?? "";
    else if (key === "caption") out.caption = unbraced(value);
    else if (key === "label") out.label = unbraced(value);
    else kept.push(option);
    // A language this module does not offer is kept as it is written.
    if (key === "language" && !out.language && value) kept.push(option);
  }
  out.options = kept.join(", ");
  return out;
}

/** The end of `[…]` starting at `at` (with braces and brackets inside), or `at` when there is none. */
function optionsEnd(text: string, at: number): number {
  if (text[at] !== "[") return at;
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "[" || c === "{") depth++;
    else if ((c === "]" || c === "}") && --depth === 0) return i + 1;
  }
  return at;
}

/** The listing that starts at `at` (`\begin{lstlisting}` or `\lstinputlisting`), with the range it takes. */
export function listingAt(text: string, at: number): { from: number; to: number; listing: Listing; codeEnd: number } | null {
  const begin = "\\begin{lstlisting}";
  if (text.startsWith(begin, at)) {
    const open = at + begin.length;
    const close = optionsEnd(text, open);
    const end = text.indexOf("\\end{lstlisting}", close);
    if (end < 0) return null;
    const body = text.slice(close, end).replace(/^[ \t]*\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
    return { from: at, to: end + "\\end{lstlisting}".length, codeEnd: close, listing: { ...readOptions(text.slice(open + 1, Math.max(open + 1, close - 1))), code: body, file: null } };
  }
  const input = /^\\lstinputlisting\s*/.exec(text.slice(at, at + 40));
  if (!input) return null;
  const open = at + input[0].length;
  const close = optionsEnd(text, open);
  const file = /^\s*\{([^{}]*)\}/.exec(text.slice(close, close + 400));
  if (!file) return null;
  const to = close + file[0].length;
  return { from: at, to, codeEnd: to, listing: { ...readOptions(text.slice(open + 1, Math.max(open + 1, close - 1))), code: "", file: file[1].trim() } };
}

// -------------------------------------------------------------- indentation

/**
 * How the lines of a piece of code are indented: with tabulations, or by
 * steps of so many spaces (the smallest step from a line to the next: a
 * line aligned under a parenthesis does not count as a level). Null: not
 * indented.
 */
export function indentationOf(code: string): { tabs: boolean; size: number } | null {
  let tabs = 0;
  let spaces = 0;
  let step = 0;
  let before = 0;
  for (const line of code.split("\n")) {
    if (!line.trim()) continue;
    const lead = /^[ \t]*/.exec(line)![0];
    if (lead.includes("\t")) tabs++;
    else {
      if (lead) spaces++;
      const more = lead.length - before;
      if (more > 0 && (!step || more < step)) step = more;
      before = lead.length;
    }
  }
  if (!tabs && !spaces) return null;
  return tabs > spaces ? { tabs: true, size: 1 } : { tabs: false, size: Math.max(1, Math.min(8, step)) };
}

/** Whether lines are indented some with tabulations and some with spaces (they do not line up everywhere). */
export function mixedIndentation(code: string): boolean {
  const leads = code.split("\n").map((line) => /^[ \t]+(?=\S)/.exec(line)?.[0] ?? "");
  return leads.some((l) => l.includes("\t")) && leads.some((l) => l.startsWith(" "));
}

/**
 * The code as it is best put in a document: what all its lines are indented
 * by is removed (a piece taken from the middle of a file starts at the
 * margin), and so are the spaces at the end of its lines and the empty
 * lines around it.
 */
export function tidyCode(code: string): string {
  const lines = code.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, ""));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const leads = lines.filter(Boolean).map((l) => /^[ \t]*/.exec(l)![0]);
  let common = leads[0] ?? "";
  for (const lead of leads) {
    let i = 0;
    while (i < common.length && i < lead.length && common[i] === lead[i]) i++;
    common = common.slice(0, i);
  }
  return lines.map((l) => l.slice(l ? common.length : 0)).join("\n");
}

/**
 * The code indented another way: each level becomes a tabulation (`"tabs"`)
 * or so many spaces. Spaces left after whole levels (an alignment) are kept.
 */
export function reindentCode(code: string, to: "tabs" | number): string {
  const from = indentationOf(code);
  if (!from) return code;
  const unit = to === "tabs" ? "\t" : " ".repeat(to);
  return code
    .split("\n")
    .map((line) => {
      const lead = /^[ \t]*/.exec(line)![0];
      if (!lead) return line;
      // A tabulation is a level whatever the code uses; spaces count by its step.
      let levels = 0;
      let extra = 0;
      for (const c of lead) {
        if (c === "\t") {
          levels++;
          extra = 0;
        } else if (++extra === (from.tabs ? 4 : from.size)) {
          levels++;
          extra = 0;
        }
      }
      return unit.repeat(levels) + " ".repeat(extra) + line.slice(lead.length);
    })
    .join("\n");
}

/** Columns of the longest line, tabulations counted as `tab` columns wide. */
export function longestLine(code: string, tab: number): number {
  let longest = 0;
  for (const line of code.split("\n")) {
    let width = 0;
    for (const c of line) width = c === "\t" ? (Math.floor(width / tab) + 1) * tab : width + 1;
    longest = Math.max(longest, width);
  }
  return longest;
}

// ------------------------------------------------------------------ beamer

/**
 * In a presentation, code needs its frame to be `fragile`. The text with
 * that option on the frame `at` is in, when it lacks it; the text as it is
 * otherwise (no frame around, or the option is there).
 */
export function withFragileFrame(text: string, at: number): string {
  const begin = text.lastIndexOf("\\begin{frame}", at);
  if (begin < 0 || text.slice(begin, at).includes("\\end{frame}")) return text;
  const open = begin + "\\begin{frame}".length;
  if (text[open] !== "[") return `${text.slice(0, open)}[fragile]${text.slice(open)}`;
  const close = optionsEnd(text, open);
  const options = text.slice(open + 1, close - 1);
  if (/\bfragile\b/.test(options)) return text;
  return `${text.slice(0, open + 1)}${options.trim() ? `${options.trim()}, ` : ""}fragile${text.slice(close - 1)}`;
}

/**
 * What the preview prints for `codeColumns`: the width of the line, that of
 * a character of the code, and of the room the line numbers take.
 */
const MEASURE = "\\makeatletter\\setbox0\\hbox{\\lst@basicstyle M}\\typeout{RTXMEASURE:\\the\\linewidth:\\the\\wd0:\\the\\dimexpr2em\\relax}\\makeatother";

/** Lines of code a preview shows at most: enough to judge how it looks, and a page TeX can make. */
export const PREVIEW_LINES = 40;

/**
 * The page of the preview, cut to the listing: the code is set in a box as
 * wide as a line of the document, and that box alone is the page. A whole
 * sheet with a few lines at its top is too small to read in a panel.
 */
const TIGHT_HEAD = "\\newsavebox\\RTXcode\n\\begin{lrbox}{\\RTXcode}\\begin{minipage}{\\linewidth}";
const TIGHT_TAIL =
  "\\end{minipage}\\end{lrbox}\n\\dimen0=\\dimexpr\\wd\\RTXcode+16pt\\relax \\dimen2=\\dimexpr\\ht\\RTXcode+\\dp\\RTXcode+16pt\\relax\n" +
  "\\ifdefined\\pdfpagewidth \\pdfpagewidth=\\dimen0 \\pdfpageheight=\\dimen2 \\else \\pagewidth=\\dimen0 \\pageheight=\\dimen2 \\fi\n" +
  "\\hoffset=-1in \\voffset=-1in\n\\shipout\\vbox{\\kern8pt\\hbox{\\kern8pt\\box\\RTXcode}}";

/**
 * A document that shows the listing with the style, for the preview: the
 * preamble of the project, then the code alone, on a page cut to it (in a
 * presentation: on a slide, which is small enough to read as it is). Only
 * the first lines of a long code are shown.
 */
export function listingPreview(source: string, listing: Listing, style: CodeStyle | null): string {
  const language = languageOf(listing.language);
  const prepared = writeCodeStyle(source, style, language ? [language] : []);
  const end = preambleEnd(prepared);
  if (end >= prepared.length) return "";
  const beamer = /\\documentclass(?:\[[^\]]*\])?\{beamer\}/.test(prepared);
  const lines = listing.code.split("\n");
  const shown: Listing = { ...listing, label: "", code: lines.slice(0, PREVIEW_LINES).join("\n") };
  // A file is read by TeX itself: it is told where to stop.
  if (listing.file !== null && !/\blastline\s*=/.test(listing.options)) shown.options = [listing.options.trim(), `lastline=${PREVIEW_LINES}`].filter(Boolean).join(", ");
  const body = `${MEASURE}\n${listingCode(shown)}`;
  const page = beamer ? `\\begin{frame}[fragile]\n${body}\n\\end{frame}` : `${TIGHT_HEAD}\n${body}\n${TIGHT_TAIL}`;
  return `${prepared.slice(0, end)}\\begin{document}\n${page}\n\\end{document}\n`;
}

/**
 * Columns of code a line of the document holds, from what its preview
 * measured (`[line, character, numbers]`, in points); null when it did not.
 */
export function codeColumns(measures: number[] | null | undefined, style: CodeStyle): number | null {
  if (!measures || measures.length < 3 || !(measures[1] > 0)) return null;
  const [line, character, numbers] = measures;
  const room = line - (style.numbers ? numbers : 0) - (style.frame ? 8 : 0);
  return Math.max(1, Math.floor(room / character + 0.01));
}

/** Lines of `code` longer than `columns`. */
export function linesOver(code: string, columns: number, tab: number): number {
  return code.split("\n").filter((line) => longestLine(line, tab) > columns).length;
}
