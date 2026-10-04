// Edits of the preamble of a LaTeX document. Pure functions: text in,
// text out. The editor applies the result as a single undoable change.

/** Replaces comments by spaces, so offsets stay valid but commented code is ignored. */
function mask(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "%") {
      const nl = text.indexOf("\n", i);
      const end = nl < 0 ? text.length : nl;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Offset of `\begin{document}` (the end of the preamble), or the text length. */
export function preambleEnd(text: string): number {
  const i = mask(text).indexOf("\\begin{document}");
  return i < 0 ? text.length : i;
}

export interface LoadedPackage {
  names: string[];
  options: string;
  from: number;
  to: number;
}

const PACKAGE_RE = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;

/** Every `\usepackage` of the preamble. */
export function loadedPackages(text: string): LoadedPackage[] {
  const code = mask(text).slice(0, preambleEnd(text));
  const out: LoadedPackage[] = [];
  for (const m of code.matchAll(PACKAGE_RE)) {
    out.push({
      names: m[2].split(",").map((s) => s.trim()).filter(Boolean),
      options: m[1] ?? "",
      from: m.index!,
      to: m.index! + m[0].length,
    });
  }
  return out;
}

export function hasPackage(text: string, name: string): boolean {
  return loadedPackages(text).some((p) => p.names.includes(name));
}

function lineEnd(text: string, offset: number): number {
  const nl = text.indexOf("\n", offset);
  return nl < 0 ? text.length : nl;
}

/** Packages that must stay after the others (hyperref, and those loaded after it). */
const LOAD_LAST = ["hyperref", "cleveref", "bookmark", "autonum", "glossaries", "glossaries-extra"];

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf("\n", offset - 1) + 1;
}

/**
 * Where new preamble lines go: after the last `\usepackage` but before
 * hyperref (and friends, which must come last); else after `\documentclass`.
 */
export function insertionPoint(text: string): number | null {
  const packages = loadedPackages(text);
  const last = packages.findIndex((p) => p.names.some((n) => LOAD_LAST.includes(n)));
  if (last > 0) return lineEnd(text, packages[last - 1].to);
  if (last === 0) {
    const start = lineStart(text, packages[0].from);
    return start > 0 ? start - 1 : null;
  }
  if (packages.length) return lineEnd(text, packages[packages.length - 1].to);
  const code = mask(text);
  const cls = code.indexOf("\\documentclass");
  if (cls >= 0 && cls < preambleEnd(text)) return lineEnd(text, cls);
  return null;
}

function insertAt(text: string, at: number, lines: string): string {
  return text.slice(0, at) + lines + text.slice(at);
}

/** Loads packages that are not loaded yet (`options` only used for new ones). */
export function addPackages(text: string, packages: { name: string; options?: string }[]): string {
  for (const p of packages) {
    if (hasPackage(text, p.name)) continue;
    const at = insertionPoint(text);
    if (at === null) continue;
    text = insertAt(text, at, `\n\\usepackage${p.options ? `[${p.options}]` : ""}{${p.name}}`);
  }
  return text;
}

/**
 * Adds an option to a loaded package (`\usepackage{xcolor}` →
 * `\usepackage[dvipsnames]{xcolor}`), or loads it with the option.
 */
export function addPackageOption(text: string, name: string, option: string): string {
  const pkg = loadedPackages(text).find((p) => p.names.includes(name));
  if (!pkg) return addPackages(text, [{ name, options: option }]);
  const options = pkg.options.split(",").map((o) => o.trim()).filter(Boolean);
  if (options.includes(option)) return text;
  const code = `\\usepackage[${[...options, option].join(",")}]{${name}}`;
  if (pkg.names.length > 1) {
    // A line loading several packages: its options apply to all of them, so
    // the package gets a line of its own.
    const others = `\\usepackage${pkg.options ? `[${pkg.options}]` : ""}{${pkg.names.filter((n) => n !== name).join(",")}}`;
    return `${text.slice(0, pkg.from)}${others}\n${code}${text.slice(pkg.to)}`;
  }
  return text.slice(0, pkg.from) + code + text.slice(pkg.to);
}

/** Adds lines after the last package (or after `after` when loaded), unless already there. */
export function addLines(text: string, lines: string[], after?: string): string {
  const code = mask(text).slice(0, preambleEnd(text));
  const missing = lines.filter((l) => l.trim() && !code.includes(l.trim()));
  // `\pgfplotsset{compat=…}` once is enough.
  const wanted = missing.filter((l) => !(l.startsWith("\\pgfplotsset{compat") && code.includes("\\pgfplotsset{compat")));
  if (!wanted.length) return text;
  const anchor = after ? loadedPackages(text).find((p) => p.names.includes(after)) : undefined;
  const at = anchor ? lineEnd(text, anchor.to) : insertionPoint(text);
  if (at === null) return text;
  return insertAt(text, at, wanted.map((l) => `\n${l}`).join(""));
}

/** Adds TikZ libraries to the existing `\usetikzlibrary`, or a new one after TikZ. */
export function addTikzLibraries(text: string, libraries: string[]): string {
  const end = preambleEnd(text);
  const code = mask(text).slice(0, end);
  const re = /\\usetikzlibrary\s*\{([^}]*)\}/g;
  const existing = new Set<string>();
  let last: RegExpMatchArray | null = null;
  for (const m of code.matchAll(re)) {
    m[1].split(",").map((s) => s.trim()).filter(Boolean).forEach((l) => existing.add(l));
    last = m;
  }
  const missing = [...new Set(libraries)].filter((l) => !existing.has(l));
  if (!missing.length) return text;
  if (last) {
    const close = last.index! + last[0].length - 1;
    const inner = last[1].trim();
    return insertAt(text, close, `${inner ? "," : ""}${missing.join(",")}`);
  }
  const tikzLike = loadedPackages(text).filter((p) => p.names.some((n) => ["tikz", "pgfplots", "circuitikz", "tikz-cd"].includes(n)));
  const at = tikzLike.length ? lineEnd(text, tikzLike[tikzLike.length - 1].to) : insertionPoint(text);
  if (at === null) return text;
  return insertAt(text, at, `\n\\usetikzlibrary{${missing.join(",")}}`);
}

/** Extent of a command and its `{…}` / `[…]` arguments (possibly over several lines). */
function statementEnd(text: string, from: number, command: string): number {
  let i = from + command.length;
  for (;;) {
    let j = i;
    while (j < text.length && /\s/.test(text[j]) && text[j] !== "\n") j++;
    // Arguments may continue on the next line only right after a group.
    if (text[j] === "\n" && /^\s*\[/.test(text.slice(j + 1, j + 40))) {
      j++;
      while (j < text.length && /\s/.test(text[j])) j++;
    }
    const open = text[j];
    if (open !== "{" && open !== "[") return i;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let k = j;
    for (; k < text.length; k++) {
      if (text[k] === "\\") {
        k++;
        continue;
      }
      if (text[k] === open) depth++;
      else if (text[k] === close && --depth === 0) break;
    }
    if (k >= text.length) return i;
    i = k + 1;
  }
}

const DEFINITION_RE =
  /\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand|DeclareMathOperator|(?:New|Renew|Provide|Declare)DocumentCommand|(?:re)?newenvironment|newtheorem)\*?(?![A-Za-z@])/g;

/**
 * Adds a definition (`\newcommand…`) to the preamble: after the last
 * definition written there, else after the last package, with a blank line
 * before the first one. Nothing changes without a preamble, or when the
 * same definition is already there.
 */
export function addDefinition(text: string, code: string): string {
  const wanted = code.trim();
  const end = preambleEnd(text);
  const masked = mask(text).slice(0, end);
  if (!wanted || masked.includes(wanted)) return text;
  let last: RegExpExecArray | null = null;
  for (const m of masked.matchAll(DEFINITION_RE)) last = m;
  if (last) {
    const stop = lineEnd(text, statementEnd(text, last.index, last[0]));
    return insertAt(text, Math.min(stop, end), `\n${wanted}`);
  }
  // After every package (a definition may use any of them), else after the class.
  const packages = loadedPackages(text);
  const cls = masked.indexOf("\\documentclass");
  const after = packages.length ? packages[packages.length - 1].to : cls >= 0 ? statementEnd(text, cls, "\\documentclass") : -1;
  if (after < 0) return text;
  return insertAt(text, lineEnd(text, after), `\n\n${wanted}`);
}

/**
 * Sets `\setmainfont…` (or any font command): replaces the existing
 * statement, or inserts `code` after `after` (a package name) or the last package.
 */
export function setStatement(text: string, command: string, code: string, after?: string): string {
  const end = preambleEnd(text);
  const masked = mask(text).slice(0, end);
  let at = -1;
  let from = 0;
  // Whole command only (`\setmainfont`, not `\setmainfontx`).
  while ((from = masked.indexOf(command, from)) >= 0) {
    if (!/[A-Za-z@]/.test(masked[from + command.length] ?? "")) {
      at = from;
      break;
    }
    from += command.length;
  }
  if (at >= 0) return text.slice(0, at) + code + text.slice(statementEnd(text, at, command));
  const anchor = after ? loadedPackages(text).find((p) => p.names.includes(after)) : undefined;
  const pos = anchor ? lineEnd(text, anchor.to) : insertionPoint(text);
  if (pos === null) return text;
  return insertAt(text, pos, `\n${code}`);
}

/** Comments out the loading of `names` (other packages of the same line are kept). */
export function commentOutPackages(text: string, names: string[], note: string): string {
  const packages = loadedPackages(text).reverse();
  for (const p of packages) {
    const hit = p.names.filter((n) => names.includes(n));
    if (!hit.length) continue;
    const kept = p.names.filter((n) => !names.includes(n));
    const original = text.slice(p.from, p.to);
    const replacement = kept.length
      ? `${original.replace(/\{[^}]*\}$/, `{${kept.join(",")}}`)}\n% \\usepackage{${hit.join(",")}} % ${note}`
      : `% ${original} % ${note}`;
    text = text.slice(0, p.from) + replacement + text.slice(p.to);
  }
  return text;
}

/** Folders in which LaTeX looks for images (`\graphicspath{{figures/}{img/}}`). */
export function graphicsPaths(text: string): string[] {
  const code = mask(text).slice(0, preambleEnd(text));
  const m = /\\graphicspath\s*\{((?:\s*\{[^}]*\})*)\s*\}/.exec(code);
  if (!m) return [];
  return [...m[1].matchAll(/\{([^}]*)\}/g)].map((x) => x[1].replace(/^\.\//, ""));
}
