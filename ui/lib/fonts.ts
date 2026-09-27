// Fonts of a document, read from its preamble: the main, sans-serif,
// monospace and math fonts (fontspec commands or LaTeX font packages) and
// the extra fonts defined for passages (`\newfontfamily\cmd{…}`). Also the
// edits that remove them.
//
// No local imports: tested directly by Node (`npm test`).

export type FontSlot = "main" | "sans" | "mono" | "math";

/** A LaTeX font package of the knowledge base (`libertinus`, `roboto`…). */
export interface KnownFontPackage {
  /** Package(s), the first one identifying the font (`newpxtext,newpxmath`). */
  package: string;
  name: string;
  kind: "serif" | "sans" | "mono";
  math: boolean;
}

export interface SlotFont {
  /** Display name (`Libertinus`, `Georgia`, `Latin Modern`). */
  name: string;
  /** Set by fontspec, by a font package, or LaTeX's default. */
  source: "fontspec" | "package" | "default";
  /** The package, for package fonts. */
  package?: string;
}

export interface ExtraFont {
  /** Command switching to it, without backslash (`fontTitle`). */
  command: string;
  name: string;
}

export interface DocumentFonts {
  main: SlotFont;
  sans: SlotFont;
  mono: SlotFont;
  math: SlotFont;
  extra: ExtraFont[];
  /** fontspec or unicode-math is loaded (XeLaTeX / LuaLaTeX fonts). */
  unicode: boolean;
}

/** The preamble without comments. */
function preamble(text: string): string {
  const end = text.search(/\\begin\s*\{document\}/);
  const head = end < 0 ? text : text.slice(0, end);
  return head
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

/** Packages loaded by `\usepackage`/`\RequirePackage`, with their options. */
function packages(head: string): { name: string; options: string }[] {
  const out: { name: string; options: string }[] = [];
  const re = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    for (const name of m[2].split(",")) if (name.trim()) out.push({ name: name.trim(), options: m[1] ?? "" });
  }
  return out;
}

/** `Demo-Regular.otf` → `Demo`; names of installed fonts are kept. */
export function fontDisplayName(arg: string): string {
  const name = arg.trim();
  if (!/\.(otf|ttf|otc|ttc)$/i.test(name)) return name;
  return name
    .replace(/\.(otf|ttf|otc|ttc)$/i, "")
    .replace(/[-_ ]?(Regular|Roman|Book|Medium|Normal|Text)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/** The fonts of a document (only its preamble is read). */
export function documentFonts(text: string, known: KnownFontPackage[]): DocumentFonts {
  const head = preamble(text);
  const loaded = packages(head);
  const has = (p: string) => loaded.some((x) => x.name === p);
  const unicode = has("fontspec") || has("unicode-math");
  const base = unicode || has("lmodern") ? "Latin Modern" : "Computer Modern";
  const fonts: DocumentFonts = {
    main: { name: `${base} Roman`, source: "default" },
    sans: { name: `${base} Sans`, source: "default" },
    mono: { name: `${base} Mono`, source: "default" },
    math: { name: `${base} Math`, source: "default" },
    extra: [],
    unicode,
  };
  // Font packages (pdfLaTeX-friendly).
  for (const font of known) {
    const main = font.package.split(",")[0].trim();
    const use = loaded.find((x) => x.name === main);
    if (!use) continue;
    const slot: SlotFont = { name: font.name, source: "package", package: main };
    if (font.kind === "serif") fonts.main = slot;
    else if (font.kind === "sans") {
      fonts.sans = slot;
      if (/\bsfdefault\b/.test(use.options)) fonts.main = slot;
    } else fonts.mono = slot;
    if (font.math && font.kind === "serif") fonts.math = { ...slot };
  }
  // fontspec commands win (they come after, and they are what XeLaTeX/LuaLaTeX use).
  const re = /\\set(main|sans|mono|math)font\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    fonts[m[1] as FontSlot] = { name: fontDisplayName(m[2]), source: "fontspec" };
  }
  if (/\\renewcommand\s*\{?\\familydefault\}?\s*\{\\sfdefault\}/.test(head)) fonts.main = { ...fonts.sans };
  const extra = /\\newfontfamily\s*\{?\\([A-Za-z]+)\}?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  while ((m = extra.exec(head))) fonts.extra.push({ command: m[1], name: fontDisplayName(m[2]) });
  return fonts;
}

/** Index after the group opened at `open` (balanced, escapes skipped), or -1. */
function groupEnd(text: string, open: number): number {
  const opener = text[open];
  const closer = opener === "[" ? "]" : "}";
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === "\\") j++;
    else if (text[j] === opener) depth++;
    else if (text[j] === closer && --depth === 0) return j + 1;
  }
  return -1;
}

/** End of the statement starting at `start`: its `{…}` and `[…]` arguments, and the line break. */
function statementEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length && /[A-Za-z@]/.test(text[i])) i++;
  // `\newfontfamily\cmd` (the command may be in braces).
  if (text.startsWith("\\newfontfamily", start)) {
    const cmd = /^\s*\{?\\[A-Za-z]+\}?/.exec(text.slice(i));
    if (cmd) i += cmd[0].length;
  }
  // Arguments, at most one line break before each (fontspec options often follow on new lines).
  for (;;) {
    const ws = /^[ \t]*\n?[ \t]*/.exec(text.slice(i))![0];
    const at = i + ws.length;
    if (text[at] !== "[" && text[at] !== "{") break;
    const end = groupEnd(text, at);
    if (end < 0) break;
    i = end;
  }
  if (text[i] === "\n") i++;
  return i;
}

/** Removes every statement matching `re` (a `\setXfont`, a `\newfontfamily\cmd`) from the preamble. */
function removeStatements(text: string, re: RegExp): string {
  let out = text;
  for (;;) {
    const end = out.search(/\\begin\s*\{document\}/);
    const head = end < 0 ? out : out.slice(0, end);
    re.lastIndex = 0;
    const m = re.exec(head);
    if (!m) return out;
    // From the start of the line when the statement is alone on it.
    let from = m.index;
    const lineStart = out.lastIndexOf("\n", from - 1) + 1;
    if (!out.slice(lineStart, from).trim()) from = lineStart;
    out = out.slice(0, from) + out.slice(statementEnd(out, m.index));
  }
}

/** Back to LaTeX's default font for `slot` (fontspec statement removed, font package commented out). */
export function resetSlot(text: string, slot: FontSlot, known: KnownFontPackage[], note: string): string {
  let out = removeStatements(text, new RegExp(`\\\\set${slot}font\\b`, "g"));
  const current = documentFonts(out, known)[slot];
  if (current.source === "package" && current.package) {
    const pkg = current.package.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`^([ \\t]*)(\\\\usepackage\\s*(?:\\[[^\\]]*\\])?\\s*\\{${pkg}\\}.*)$`, "m"), `$1% $2 % ${note}`);
  }
  return out;
}

/** Removes the definition of an extra font (`\newfontfamily\cmd…`). */
export function removeExtraFont(text: string, command: string): string {
  return removeStatements(text, new RegExp(`\\\\newfontfamily\\s*\\{?\\\\${command}\\b`, "g"));
}

/** Times `\cmd` is used after `\begin{document}`. */
export function extraFontUses(text: string, command: string): number {
  const start = text.search(/\\begin\s*\{document\}/);
  const body = start < 0 ? "" : text.slice(start);
  return (body.match(new RegExp(`\\\\${command}(?![A-Za-z])`, "g")) ?? []).length;
}

/** A command name for an extra font: `Playfair Display` → `fontPlayfairDisplay`. */
export function fontCommand(name: string, taken: string[] = []): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const base = `font${words.join("") || "Extra"}`;
  let cmd = base;
  for (let n = 2; taken.includes(cmd); n++) cmd = `${base}${String.fromCharCode(64 + n)}`;
  return cmd;
}
