// Small helpers shared by the interface.

/** Path separator used by `path` (Windows paths use backslashes). */
export function sepOf(path: string): string {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i <= 0 ? path.slice(0, Math.max(i, 0) + 1) : path.slice(0, i);
}

export function join(dir: string, ...names: string[]): string {
  const sep = sepOf(dir);
  let out = dir.replace(/[\\/]+$/, "");
  for (const n of names) {
    const clean = n.replace(/^[\\/]+/, "").replace(/[\\/]/g, sep);
    out = out ? `${out}${sep}${clean}` : clean;
  }
  return out;
}

export function extension(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function stem(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/** `path` relative to `base` with `/` separators, or the path itself when outside. */
/** Windows file names ignore case: `C:\\Users\\A\\x.tex` and `c:/users/a/X.tex` are one file. */
const CASE_INSENSITIVE = typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent ?? "");

/** A path in a form to compare with another: `/` separators, lower case on Windows. */
export function comparablePath(path: string): string {
  const p = path.replace(/\\/g, "/");
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}

export function relative(base: string, path: string): string {
  const b = base.replace(/\\/g, "/").replace(/\/+$/, "");
  const p = path.replace(/\\/g, "/");
  const cb = comparablePath(b);
  const cp = comparablePath(p);
  if (cp === cb) return "";
  if (cp.startsWith(cb + "/")) return p.slice(b.length + 1);
  return p;
}

export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return comparablePath(a) === comparablePath(b);
}

export type FileKind = "tex" | "bib" | "code" | "image" | "pdf" | "text" | "binary";

const TEXT_EXT = new Set(["txt", "md", "toml", "json", "yaml", "yml", "csv", "tsv", "log", "cfg", "ist", "bst", "xml", "html", "py", "r", "m", "lua", "sh", "gitignore", "latexmkrc", "dat"]);

export function fileKind(path: string): FileKind {
  const ext = extension(path);
  if (["tex", "ltx", "latex", "sty", "cls", "dtx", "tikz", "pgf", "def", "lbx", "bbx", "cbx"].includes(ext)) return "tex";
  if (ext === "bib") return "bib";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (TEXT_EXT.has(ext) || basename(path).startsWith(".")) return "text";
  return "binary";
}

export function isEditable(path: string): boolean {
  const k = fileKind(path);
  return k === "tex" || k === "bib" || k === "text" || k === "code";
}

/** Debounce with an explicit `flush` and `cancel`. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: A | null = null;
  const run = (...args: A) => {
    last = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = last!;
      last = null;
      fn(...a);
    }, ms);
  };
  run.flush = () => {
    if (timer && last) {
      clearTimeout(timer);
      timer = null;
      const a = last;
      last = null;
      fn(...a);
    }
  };
  run.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    last = null;
  };
  return run;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}

export function isMac(): boolean {
  return navigator.platform.toLowerCase().includes("mac") || navigator.userAgent.includes("Mac OS");
}

/** Human-readable shortcut: `Mod-Shift-p` → `⌘⇧P` (mac) or `Ctrl+Shift+P`. */
export function prettyKey(key: string): string {
  const mac = isMac();
  const parts = key.split("-").filter(Boolean);
  const names: Record<string, string> = mac
    ? { Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Enter: "↩", Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", Backspace: "⌫" }
    : { Mod: "Ctrl", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Enter: "Enter", Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", Backspace: "⌫" };
  const mapped = parts.map((p) => names[p] ?? (p.length === 1 ? p.toUpperCase() : p));
  return mac ? mapped.join("") : mapped.join("+");
}

/** Escapes text for HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal inline markdown (code spans, bold, italics) for hints. Escapes everything else. */
export function inlineMarkdown(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/**
 * Escapes literal text for a CodeMirror snippet template: `${`/`#{` would
 * start fields and `\{`/`\}` would lose their backslash.
 */
export function escapeSnippet(text: string): string {
  return text.replace(/\\([{}])/g, "\\\\$1").replace(/([$#])\{/g, "$1\\{");
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
