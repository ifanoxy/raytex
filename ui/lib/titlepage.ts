// The title page of a document: what it says (title, authors, date, who it
// is for), in one of a few layouts, written as plain LaTeX and read back
// from it. Pure functions: text in, text out.
//
// The classic layout is `\maketitle` with `\title`, `\author` and `\date`.
// The others are a `titlepage` environment whose lines say what they are in
// a comment (`% title`, `% author`): the code stays readable and can be
// changed by hand, and the window finds its fields again.

import { addPackages, mask, preambleEnd, statementEnd } from "./preamble.ts";

export type TitleStyle = "classic" | "centered" | "report" | "modern";
export const TITLE_STYLES: TitleStyle[] = ["classic", "centered", "report", "modern"];
type Lang = "fr" | "en";

export interface TitlePage {
  style: TitleStyle;
  title: string;
  subtitle: string;
  /** One per author. */
  authors: string[];
  /** `\today`, a text, or nothing for no date. */
  date: string;
  /** University, school, company. */
  institution: string;
  /** Faculty, department, course. */
  department: string;
  /** What the document is: "Master's thesis", "Internship report". */
  kind: string;
  /** What is written above the supervisors: "Supervised by". */
  supervisorLabel: string;
  supervisors: string[];
  /** Picture file, as `\includegraphics` takes it; empty for none. */
  logo: string;
  logoWidth: string;
  /** Colour of the rules (a name xcolor knows); empty for black. */
  accent: string;
}

export const TODAY = "\\today";

export function emptyTitlePage(lang: Lang): TitlePage {
  return {
    style: "classic",
    title: "",
    subtitle: "",
    authors: [],
    date: TODAY,
    institution: "",
    department: "",
    kind: "",
    supervisorLabel: lang === "fr" ? "Sous la direction de" : "Supervised by",
    supervisors: [],
    logo: "",
    logoWidth: "3cm",
    accent: "",
  };
}

// ------------------------------------------------------------------ text

const SPECIAL = "&%#";

/** A text as LaTeX takes it: `&`, `%`, `#`, and `_` outside formulas, escaped when they are not. */
export function texText(text: string): string {
  let out = "";
  let math = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      out += text.slice(i, i + 2);
      i++;
    } else if (c === "$") {
      math = !math;
      out += c;
    } else if (SPECIAL.includes(c) || (c === "_" && !math)) out += `\\${c}`;
    else out += c;
  }
  return out.trim();
}

/** The text as it was typed: the reverse of [`texText`]. */
export function plainText(code: string): string {
  let out = "";
  let math = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const next = code[i + 1] ?? "";
    if (c === "\\" && (SPECIAL.includes(next) || (next === "_" && !math)) && next) {
      out += next;
      i++;
    } else if (c === "\\") {
      out += code.slice(i, i + 2);
      i++;
    } else {
      if (c === "$") math = !math;
      out += c;
    }
  }
  return out.trim();
}

// ------------------------------------------------------------ the layouts

type Field = "logo" | "institution" | "department" | "kind" | "title" | "subtitle" | "author" | "supervisorLabel" | "supervisor" | "date";

/** What a line is, said in a comment at its end (in the language of the interface; both are read). */
const TAGS: Record<Field, [string, string]> = {
  logo: ["logo", "logo"],
  institution: ["établissement", "institution"],
  department: ["formation", "department"],
  kind: ["type de document", "kind of document"],
  title: ["titre", "title"],
  subtitle: ["sous-titre", "subtitle"],
  author: ["auteur", "author"],
  supervisorLabel: ["encadrement", "supervision"],
  supervisor: ["encadrant", "supervisor"],
  date: ["date", "date"],
};

type Block = Exclude<TitleStyle, "classic">;

const STYLE_NAMES: Record<Block, [string, string]> = {
  centered: ["centrée", "centered"],
  report: ["rapport", "report"],
  modern: ["moderne", "modern"],
};

const FONTS: Record<Block, Record<Exclude<Field, "logo">, string>> = {
  centered: {
    institution: "\\scshape\\LARGE",
    department: "\\scshape\\large",
    kind: "\\Large",
    title: "\\huge\\bfseries",
    subtitle: "\\Large",
    author: "\\Large",
    supervisorLabel: "\\large\\itshape",
    supervisor: "\\large",
    date: "\\large",
  },
  report: {
    institution: "\\scshape\\large",
    department: "\\large",
    kind: "\\scshape\\Large",
    title: "\\huge\\bfseries",
    subtitle: "\\Large",
    author: "\\large",
    supervisorLabel: "\\large\\itshape",
    supervisor: "\\large",
    date: "\\large",
  },
  modern: {
    institution: "\\sffamily\\large",
    department: "\\sffamily",
    kind: "\\sffamily\\large",
    title: "\\sffamily\\bfseries\\Huge",
    subtitle: "\\sffamily\\LARGE",
    author: "\\sffamily\\Large",
    supervisorLabel: "\\sffamily\\itshape",
    supervisor: "\\sffamily",
    date: "\\sffamily",
  },
};

const tagOf = (field: Field, lang: Lang) => TAGS[field][lang === "fr" ? 0 : 1];

/** The lines of a `titlepage` environment, each one indented by `depth` steps. */
class Lines {
  private out: string[] = [];
  /** Something of the page was written (a text, the logo). */
  private written = false;
  private style: Block;
  private lang: Lang;

  constructor(style: Block, lang: Lang) {
    this.style = style;
    this.lang = lang;
  }

  raw(code: string, depth = 1) {
    this.out.push(`${"  ".repeat(depth)}${code}`);
  }

  /** A line of text of the page; nothing when the text is empty. Returns whether it was written. */
  text(field: Exclude<Field, "logo">, text: string, depth = 1): boolean {
    const code = field === "date" && text.trim() === TODAY ? TODAY : texText(text);
    if (!code) return false;
    this.raw(`{${FONTS[this.style][field]} ${code}\\par} % ${tagOf(field, this.lang)}`, depth);
    this.written = true;
    return true;
  }

  logo(p: TitlePage, depth = 1): boolean {
    if (!p.logo.trim()) return false;
    this.raw(`\\includegraphics[width=${p.logoWidth.trim() || "3cm"}]{${p.logo.trim()}}\\par % ${tagOf("logo", this.lang)}`, depth);
    this.written = true;
    return true;
  }

  space(length: string, depth = 1) {
    this.raw(`\\vspace{${length}}`, depth);
  }

  /** Stretchable space; at the top of the page (nothing written yet), one TeX does not drop. */
  fill(depth = 1) {
    this.raw(this.written ? "\\vfill" : "\\vspace*{\\fill}", depth);
  }

  get lines(): string[] {
    return this.out;
  }
}

const rule = (p: TitlePage, width: string, height: string) => (p.accent.trim() ? `{\\color{${p.accent.trim()}}\\rule{${width}}{${height}}}` : `\\rule{${width}}{${height}}`);

/** The names of a list, without the empty ones. */
const names = (list: string[]) => list.map((n) => n.trim()).filter(Boolean);

function centered(p: TitlePage, l: Lines) {
  l.raw("\\centering");
  if (l.logo(p)) l.space("1cm");
  l.text("institution", p.institution);
  l.text("department", p.department);
  l.fill();
  if (l.text("kind", p.kind)) l.space("0.6cm");
  l.raw(`${rule(p, "\\linewidth", "0.4mm")}\\par`);
  l.space("0.5cm");
  l.text("title", p.title);
  if (texText(p.subtitle)) {
    l.space("0.3cm");
    l.text("subtitle", p.subtitle);
  }
  l.space("0.5cm");
  l.raw(`${rule(p, "\\linewidth", "0.4mm")}\\par`);
  l.space("1.2cm");
  for (const a of names(p.authors)) l.text("author", a);
  if (names(p.supervisors).length) {
    l.space("0.8cm");
    l.text("supervisorLabel", p.supervisorLabel);
    for (const s of names(p.supervisors)) l.text("supervisor", s);
  }
  l.raw("\\vfill");
  l.text("date", p.date);
}

function report(p: TitlePage, l: Lines) {
  const top = !!texText(p.institution) || !!texText(p.department);
  if (p.logo.trim() && top) {
    l.raw("\\begin{minipage}[t]{0.4\\textwidth}");
    l.raw("\\vspace{0pt}", 2);
    l.logo(p, 2);
    l.raw("\\end{minipage}\\hfill");
    l.raw("\\begin{minipage}[t]{0.55\\textwidth}");
    l.raw("\\vspace{0pt}\\raggedleft", 2);
    l.text("institution", p.institution, 2);
    l.text("department", p.department, 2);
    l.raw("\\end{minipage}");
  } else if (p.logo.trim() || top) {
    l.raw("\\begin{flushleft}");
    l.logo(p, 2);
    l.text("institution", p.institution, 2);
    l.text("department", p.department, 2);
    l.raw("\\end{flushleft}");
  }
  l.fill();
  l.raw("\\begin{center}");
  if (l.text("kind", p.kind, 2)) l.space("0.5cm", 2);
  l.raw(`${rule(p, "\\linewidth", "0.4mm")}\\par`, 2);
  l.space("0.4cm", 2);
  l.text("title", p.title, 2);
  if (texText(p.subtitle)) {
    l.space("0.3cm", 2);
    l.text("subtitle", p.subtitle, 2);
  }
  l.space("0.4cm", 2);
  l.raw(`${rule(p, "\\linewidth", "0.4mm")}\\par`, 2);
  l.raw("\\end{center}");
  l.raw("\\vfill");
  const authors = names(p.authors);
  const supervisors = names(p.supervisors);
  if (authors.length && supervisors.length) {
    l.raw("\\begin{minipage}[t]{0.45\\textwidth}");
    for (const a of authors) l.text("author", a, 2);
    l.raw("\\end{minipage}\\hfill");
    l.raw("\\begin{minipage}[t]{0.45\\textwidth}");
    l.raw("\\raggedleft", 2);
    l.text("supervisorLabel", p.supervisorLabel, 2);
    for (const s of supervisors) l.text("supervisor", s, 2);
    l.raw("\\end{minipage}");
  } else if (authors.length || supervisors.length) {
    l.raw("\\begin{center}");
    for (const a of authors) l.text("author", a, 2);
    if (supervisors.length) {
      l.text("supervisorLabel", p.supervisorLabel, 2);
      for (const s of supervisors) l.text("supervisor", s, 2);
    }
    l.raw("\\end{center}");
  }
  if (p.date.trim()) {
    l.raw("\\vfill");
    l.raw("\\begin{center}");
    l.text("date", p.date, 2);
    l.raw("\\end{center}");
  }
}

function modern(p: TitlePage, l: Lines) {
  l.raw("\\noindent");
  l.raw(`${rule(p, "1.5mm", "\\textheight")}\\hspace{8mm}%`);
  l.raw("\\parbox[b][\\textheight][t]{0.85\\textwidth}{%");
  l.raw("\\raggedright", 2);
  if (l.logo(p, 2)) l.space("1.5cm", 2);
  else l.space("2cm", 2);
  if (l.text("kind", p.kind, 2)) l.space("0.6cm", 2);
  l.text("title", p.title, 2);
  if (texText(p.subtitle)) {
    l.space("0.4cm", 2);
    l.text("subtitle", p.subtitle, 2);
  }
  l.space("1.5cm", 2);
  for (const a of names(p.authors)) l.text("author", a, 2);
  if (names(p.supervisors).length) {
    l.space("0.6cm", 2);
    l.text("supervisorLabel", p.supervisorLabel, 2);
    for (const s of names(p.supervisors)) l.text("supervisor", s, 2);
  }
  l.raw("\\vfill", 2);
  l.text("institution", p.institution, 2);
  l.text("department", p.department, 2);
  if (p.date.trim()) {
    l.space("0.4cm", 2);
    l.text("date", p.date, 2);
  }
  l.raw("}");
}

const HEADER = { fr: "page de titre :", en: "title page:" };

/** The `titlepage` environment of a page (not for the classic layout). */
export function titleBlock(p: TitlePage, lang: Lang): string {
  const style: Block = p.style === "classic" ? "centered" : p.style;
  const l = new Lines(style, lang);
  ({ centered, report, modern })[style](p, l);
  return [`\\begin{titlepage} % ${HEADER[lang]} ${STYLE_NAMES[style][lang === "fr" ? 0 : 1]}`, ...l.lines, "\\end{titlepage}"].join("\n");
}

// ---------------------------------------------------------------- classic

/** Whether the class is beamer (its title page is a frame, with a subtitle and an institute of its own). */
export function isBeamer(text: string): boolean {
  return /\\documentclass(?:\[[^\]]*\])?\{beamer\}/.test(mask(text).slice(0, preambleEnd(text)));
}

const SUBTITLE_BREAK = "\\\\[0.4em]\\large ";

/** `\title`, `\author` and `\date` of a page, as the classic layout writes them (`name` → its statement, or null to remove it). */
function statements(p: TitlePage, beamer: boolean): [string, string | null][] {
  const subtitle = texText(p.subtitle);
  const authors = names(p.authors).map(texText).join(" \\and ");
  const date = p.date.trim() === TODAY ? TODAY : texText(p.date);
  const out: [string, string | null][] = [
    ["\\title", `\\title{${texText(p.title)}${subtitle && !beamer ? SUBTITLE_BREAK + subtitle : ""}}`],
    ["\\author", `\\author{${authors}}`],
    ["\\date", `\\date{${date}}`],
  ];
  if (beamer) {
    out.splice(1, 0, ["\\subtitle", subtitle ? `\\subtitle{${subtitle}}` : null]);
    out.splice(3, 0, ["\\institute", texText(p.institution) ? `\\institute{${texText(p.institution)}}` : null]);
  }
  return out;
}

/** What stands in the body for the classic layout. */
const makeTitle = (beamer: boolean) => (beamer ? "\\frame{\\titlepage}" : "\\maketitle");

/** The code of a page, as it is shown: what goes in the preamble (classic layout), and what stands in the body. */
export function titleCode(p: TitlePage, lang: Lang, beamer = false): string {
  if (p.style !== "classic" && !beamer) return titleBlock(p, lang);
  return [
    ...statements(p, beamer)
      .map(([, code]) => code)
      .filter(Boolean),
    "",
    makeTitle(beamer),
  ].join("\n");
}

/** The packages the code of a page needs. */
export function titlePackages(p: TitlePage, beamer = false): string[] {
  if (p.style === "classic" || beamer) return [];
  return [...(p.logo.trim() ? ["graphicx"] : []), ...(p.accent.trim() ? ["xcolor"] : [])];
}

// ---------------------------------------------------------------- reading

/** Offset of the whole command `name` in `code` between `from` and `to`, or -1. */
function findCommand(code: string, name: string, from: number, to: number): number {
  let at = from;
  while ((at = code.indexOf(name, at)) >= 0 && at < to) {
    if (!/[A-Za-z@]/.test(code[at + name.length] ?? "")) return at;
    at += name.length;
  }
  return -1;
}

/** The last argument of the command at `at` (`\title[short]{…}` → `…`), or null. */
function argument(text: string, at: number, name: string): string | null {
  const end = statementEnd(text, at, name);
  if (end <= at + name.length || text[end - 1] !== "}") return null;
  let depth = 0;
  for (let i = end - 1; i >= at; i--) {
    if (text[i - 1] === "\\") continue;
    if (text[i] === "}") depth++;
    else if (text[i] === "{" && --depth === 0) return text.slice(i + 1, end - 1);
  }
  return null;
}

const FONT_COMMANDS = /^(?:\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|bfseries|itshape|scshape|sffamily|rmfamily|ttfamily|mdseries|upshape|normalfont)(?![A-Za-z@])\s*)+/;

/** Where the comment of a line starts (a `%` that is not escaped), or -1. */
function commentStart(line: string): number {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "%") return i;
  }
  return -1;
}

/** What the document has for a title page. */
export type TitleKind =
  /** Nothing yet. */
  | "none"
  /** `\maketitle` (or the title frame of beamer). */
  | "classic"
  /** A `titlepage` environment written by this window. */
  | "block"
  /** A `titlepage` environment written by hand: its fields are not known. */
  | "foreign";

export interface TitleFound {
  page: TitlePage;
  kind: TitleKind;
}

/** The extent of the first `titlepage` environment of the body, or null. */
function blockExtent(text: string): { from: number; to: number } | null {
  const code = mask(text);
  const from = code.indexOf("\\begin{titlepage}", preambleEnd(text));
  if (from < 0) return null;
  const close = code.indexOf("\\end{titlepage}", from);
  return close < 0 ? null : { from, to: close + "\\end{titlepage}".length };
}

/** Reads the classic commands of the document into `page` (wherever they are before `\maketitle`). */
function readStatements(text: string, page: TitlePage) {
  const code = mask(text);
  const body = preambleEnd(text);
  const made = [findCommand(code, "\\maketitle", body, code.length), findCommand(code, "\\titlepage", body, code.length)].filter((i) => i >= 0);
  const limit = made.length ? Math.min(...made) : body;
  const read = (name: string) => {
    const at = findCommand(code, name, 0, limit);
    return at < 0 ? null : argument(text, at, name);
  };
  const title = read("\\title");
  if (title !== null) {
    const cut = title.indexOf("\\\\");
    if (cut >= 0) {
      page.title = plainText(title.slice(0, cut));
      page.subtitle = plainText(
        title
          .slice(cut + 2)
          .replace(/^\[[^\]]*\]/, "")
          .trim()
          .replace(FONT_COMMANDS, ""),
      );
    } else page.title = plainText(title);
  }
  const subtitle = read("\\subtitle");
  if (subtitle !== null) page.subtitle = plainText(subtitle);
  const author = read("\\author");
  if (author !== null) {
    page.authors = author
      .split(/\\and(?![A-Za-z@])/)
      .map((a) => plainText(a.replace(/\s+/g, " ")))
      .filter(Boolean);
  }
  const date = read("\\date");
  if (date !== null) page.date = date.trim() === TODAY ? TODAY : plainText(date);
  const institute = read("\\institute");
  if (institute !== null) page.institution = plainText(institute);
}

/** The title page of a document: its fields, and how it is written. */
export function readTitlePage(text: string, lang: Lang): TitleFound {
  const page = emptyTitlePage(lang);
  readStatements(text, page);
  const extent = blockExtent(text);
  if (!extent) {
    const code = mask(text);
    const body = preambleEnd(text);
    const classic = findCommand(code, "\\maketitle", body, code.length) >= 0 || findCommand(code, "\\titlepage", body, code.length) >= 0;
    return { page, kind: classic ? "classic" : "none" };
  }
  const block = text.slice(extent.from, extent.to);
  const header = /^\\begin\{titlepage\}[ \t]*%[ \t]*(?:page de titre[ \t]*:|title page:)[ \t]*(.+?)[ \t]*$/m.exec(block);
  const style = header && (Object.keys(STYLE_NAMES) as Block[]).find((s) => STYLE_NAMES[s].includes(header[1]));
  if (!style) return { page: { ...page, style: "centered" }, kind: "foreign" };

  // Its own fields, not those of commands a classic page left behind.
  const own: TitlePage = { ...emptyTitlePage(lang), style, date: "", supervisorLabel: "" };
  for (const line of block.split("\n").slice(1)) {
    const at = commentStart(line);
    if (at < 0) continue;
    const tag = line.slice(at + 1).trim();
    const field = (Object.keys(TAGS) as Field[]).find((f) => TAGS[f].includes(tag));
    if (!field) continue;
    const code = line.slice(0, at).trim();
    if (field === "logo") {
      const m = /\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}/.exec(code);
      if (m) {
        own.logo = m[2].trim();
        own.logoWidth = /width\s*=\s*([^,\]]+)/.exec(m[1] ?? "")?.[1].trim() ?? "";
      }
      continue;
    }
    const inner = /^\{([\s\S]*)\\par\}$/.exec(code)?.[1] ?? code;
    const value = inner.trim().replace(FONT_COMMANDS, "").trim();
    const typed = field === "date" && value === TODAY ? TODAY : plainText(value);
    if (field === "author") own.authors.push(typed);
    else if (field === "supervisor") own.supervisors.push(typed);
    else own[field] = typed;
  }
  own.accent = /\\color\{([^}]+)\}\\rule/.exec(block)?.[1].trim() ?? "";
  if (!own.supervisorLabel) own.supervisorLabel = page.supervisorLabel;
  if (!own.logoWidth) own.logoWidth = page.logoWidth;
  return { page: own, kind: "block" };
}

// ---------------------------------------------------------------- writing

/** The start of the line of `at`, and the end of that line with its line break. */
function wholeLine(text: string, from: number, to: number): { from: number; to: number } {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  const alone = !text.slice(start, from).trim();
  const nl = text.indexOf("\n", to);
  const end = nl < 0 ? text.length : nl;
  const clean = !text.slice(to, end).trim();
  return { from: alone ? start : from, to: clean ? (nl < 0 ? end : end + 1) : to };
}

/** Sets, or removes (`code` null), the statement of `name` that `\maketitle` reads; a new one goes at the end of the preamble. */
function setCommand(text: string, name: string, code: string | null, create: boolean): string {
  const masked = mask(text);
  const body = preambleEnd(text);
  const made = [findCommand(masked, "\\maketitle", body, masked.length), findCommand(masked, "\\titlepage", body, masked.length)].filter((i) => i >= 0);
  const limit = made.length ? Math.min(...made) : body;
  const at = findCommand(masked, name, 0, limit);
  if (at >= 0) {
    const end = statementEnd(text, at, name);
    if (code !== null) return text.slice(0, at) + code + text.slice(end);
    const line = wholeLine(text, at, end);
    return text.slice(0, line.from) + text.slice(line.to);
  }
  if (code === null || !create || body >= text.length) return text;
  const before = text.slice(0, body);
  return `${before}${before.endsWith("\n") || !before ? "" : "\n"}${code}\n${text.slice(body)}`;
}

/** Puts `code` in the body in place of the title the document has, or right after `\begin{document}`. */
function setBody(text: string, code: string): string {
  const extent = blockExtent(text);
  if (extent) return text.slice(0, extent.from) + code + text.slice(extent.to);
  const masked = mask(text);
  const body = preambleEnd(text);
  if (body >= text.length) return text;
  // `\maketitle`, or the title frame of beamer in one of its forms.
  for (const frame of [/\\begin\{frame\}(?:\[[^\]]*\])?\s*\\titlepage\s*\\end\{frame\}/, /\\frame(?:\[[^\]]*\])?\{\s*\\titlepage\s*\}/, /\\maketitle(?![A-Za-z@])/]) {
    const m = frame.exec(masked.slice(body));
    if (m) return text.slice(0, body + m.index) + code + text.slice(body + m.index + m[0].length);
  }
  const start = body + "\\begin{document}".length;
  const nl = text[start] === "\n" ? start + 1 : start;
  return `${text.slice(0, nl)}${nl === start ? "\n" : ""}${code}\n${text.slice(nl)}`;
}

/**
 * The document with `page` as its title page: its commands set and
 * `\maketitle` in the body for the classic layout, the `titlepage`
 * environment in place of what was there for the others, with the packages
 * it needs. Nothing changes in a text without `\begin{document}`.
 */
export function writeTitlePage(text: string, page: TitlePage, lang: Lang): string {
  if (preambleEnd(text) >= text.length) return text;
  const beamer = isBeamer(text);
  const classic = page.style === "classic" || beamer;
  let out = text;
  // The commands are kept up to date where they exist: other things read
  // them (the title of the PDF, a header); the classic layout needs them.
  for (const [name, code] of statements(page, beamer)) out = setCommand(out, name, code, classic);
  out = setBody(out, classic ? makeTitle(beamer) : titleBlock(page, lang));
  return addPackages(out, titlePackages(page, beamer).map((name) => ({ name })));
}

/** A document that is the title page alone, with the preamble of `text`: what the preview compiles. */
export function titlePreview(text: string, page: TitlePage, lang: Lang): string | null {
  const written = writeTitlePage(text, page, lang);
  const end = preambleEnd(written);
  if (end >= written.length) return null;
  const beamer = isBeamer(written);
  const classic = page.style === "classic" || beamer;
  // The classic commands again in the body: a document may have set them there.
  const body = classic
    ? [
        ...statements(page, beamer)
          .map(([, code]) => code)
          .filter(Boolean),
        makeTitle(beamer),
      ].join("\n")
    : titleBlock(page, lang);
  return `${written.slice(0, end).trimEnd()}\n\\begin{document}\n${body}\n\\end{document}\n`;
}
