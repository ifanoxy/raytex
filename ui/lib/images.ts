// Image helpers of the interface: LaTeX-safe names (same rules as the
// engine, for a live preview of the name), formats and PNG conversion of
// formats LaTeX cannot read.

/** Formats read directly by LaTeX. */
export const DIRECT = ["pdf", "png", "jpg", "jpeg", "eps"];
/** Formats converted to PNG by the interface (decoded by the web view). */
export const TO_PNG = ["webp", "gif", "heic", "heif", "bmp", "tif", "tiff", "avif", "ico"];
/** Every image format accepted by the image dialog. */
export const ACCEPTED = [...DIRECT, "svg", "svgz", ...TO_PNG];

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function stemOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}

/** Extension of the file written in the project. */
export function targetExtension(ext: string, mime = ""): string {
  if (ext === "svg" || ext === "svgz" || mime === "image/svg+xml") return "pdf";
  if (ext === "jpeg") return "jpg";
  if (DIRECT.includes(ext)) return ext;
  if (mime === "image/jpeg") return "jpg";
  return "png";
}

const FOLD: Record<string, string> = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", æ: "ae", ç: "c", è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i", ñ: "n", ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ø: "o", œ: "oe",
  ù: "u", ú: "u", û: "u", ü: "u", ý: "y", ÿ: "y", ß: "ss",
};

/** Same rules as the engine: lowercase ASCII, digits and hyphens (`Mon schéma` → `mon-schema`). */
export function safeStem(name: string): string {
  let out = "";
  for (const raw of name) {
    const c = raw.toLowerCase();
    if (/[a-z0-9]/.test(c)) out += c;
    else if (FOLD[c]) out += FOLD[c];
    else if (!out.endsWith("-")) out += "-";
  }
  out = out.replace(/^-+|-+$/g, "");
  return out || "image";
}

export function mimeOf(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif", avif: "image/avif", pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Decodes any image the web view can read and re-encodes it as PNG. */
export async function toPng(blob: Blob): Promise<Uint8Array> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"));
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `2026-09-27 10:12:33` as `20260927-101233`, for pasted images. */
export function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export interface FigureOptions {
  /** Paths for `\includegraphics`, relative to the root document, without extension. */
  paths: string[];
  /** Caption and label of each image (sub-figures). */
  captions: string[];
  labels: string[];
  mode: "figure" | "inline";
  /** Width in percent of the text width. */
  width: number;
  /** `htbp`, `H`, `t`… */
  placement: string;
  /** Caption and label of the whole figure. */
  caption: string;
  label: string;
  /** Images per row (sub-figures). */
  columns: number;
  /** Options of a single `\\includegraphics` kept as written (instead of `width`). */
  options?: string | null;
}

/** Pictures the image dialog lays out side by side, at most. */
export const MAX_COLUMNS = 4;

function fraction(percent: number): string {
  if (percent >= 100) return "\\linewidth";
  return `${Math.round(percent) / 100}\\linewidth`;
}

/** LaTeX code inserting the images (tabs mark one indentation level). */
export function figureCode(o: FigureOptions): string {
  const one = (p: string) =>
    o.options != null ? `\\includegraphics${o.options ? `[${o.options}]` : ""}{${p}}` : `\\includegraphics[width=${fraction(o.width)}]{${p}}`;
  if (o.mode === "inline") {
    return o.paths.map(one).join("\\hfill\n");
  }
  const lines = [`\\begin{figure}[${o.placement}]`, "\t\\centering"];
  if (o.paths.length === 1) {
    lines.push(`\t${one(o.paths[0])}`);
  } else {
    const cols = Math.max(1, Math.min(o.columns, o.paths.length));
    const sub = `${Math.floor((1 / cols - 0.02) * 100) / 100}\\linewidth`;
    o.paths.forEach((p, i) => {
      if (i > 0) lines.push(i % cols === 0 ? "\t\\par\\medskip" : "\t\\hfill");
      lines.push(`\t\\begin{subfigure}[b]{${sub}}`, "\t\t\\centering", `\t\t\\includegraphics[width=\\linewidth]{${p}}`);
      if (o.captions[i]) lines.push(`\t\t\\caption{${o.captions[i]}}`);
      if (o.labels[i]) lines.push(`\t\t\\label{${o.labels[i]}}`);
      lines.push("\t\\end{subfigure}");
    });
  }
  lines.push(`\t\\caption{${o.caption}}`);
  if (o.label) lines.push(`\t\\label{${o.label}}`);
  lines.push("\\end{figure}");
  return lines.join("\n");
}

/** A picture of the document, as the image dialog edits it. */
export interface FigureAt {
  /** Range rewritten by "Update": the whole figure, or the `\\includegraphics` alone. */
  from: number;
  to: number;
  mode: "figure" | "inline";
  /** Path written in `\\includegraphics{…}`. */
  path: string;
  /** Width in percent of the line, or null when the options say something else. */
  width: number | null;
  /** Options of `\\includegraphics` as written. */
  options: string;
  placement: string;
  caption: string;
  label: string;
}

/** `\\name{…}` (with braces inside) in `text`: the whole command and its argument. */
function commandArg(text: string, name: string): { raw: string; value: string } | null {
  const m = new RegExp(`\\\\${name}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`).exec(text);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return { raw: text.slice(m.index, i + 1), value: text.slice(m.index + m[0].length, i) };
  }
  return null;
}

/**
 * The `\\includegraphics` starting at `at`. A figure holding only this image,
 * `\\centering`, a caption and a label is edited whole; otherwise the
 * command alone.
 */
export function figureAt(text: string, at: number): FigureAt | null {
  const m = /^\\includegraphics\*?\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/.exec(text.slice(at, at + 1000));
  if (!m) return null;
  const options = (m[1] ?? "").trim();
  const w = /^width\s*=\s*([\d.]*)\s*\\(?:linewidth|textwidth|columnwidth)$/.exec(options);
  const width = w ? Math.round((w[1] ? Number(w[1]) : 1) * 100) : null;
  const inline: FigureAt = { from: at, to: at + m[0].length, mode: "inline", path: m[2].trim(), width, options, placement: "htbp", caption: "", label: "" };
  const begin = text.lastIndexOf("\\begin{figure", at);
  if (begin < 0 || text.slice(begin, at).includes("\\end{figure")) return inline;
  const head = /^\\begin\{figure\*?\}\s*(?:\[([^\]]*)\])?/.exec(text.slice(begin, begin + 80));
  const end = text.indexOf("\\end{figure", at);
  const close = end >= 0 ? /^\\end\{figure\*?\}/.exec(text.slice(end, end + 16)) : null;
  if (!head || !close) return inline;
  const body = text.slice(begin + head[0].length, end);
  const caption = commandArg(body, "caption");
  const label = commandArg(body, "label");
  let rest = body.replace(m[0], "");
  if (caption) rest = rest.replace(caption.raw, "");
  if (label) rest = rest.replace(label.raw, "");
  rest = rest.replace(/%.*$/gm, "").replace(/\\centering\b/, "");
  if (rest.trim()) return inline;
  return {
    ...inline,
    from: begin,
    to: end + close[0].length,
    mode: "figure",
    placement: head[1] ?? "htbp",
    caption: caption?.value ?? "",
    label: label?.value ?? "",
  };
}

/** One picture of a group. */
export interface GroupImage {
  /** Path written in `\\includegraphics{…}`. */
  path: string;
  /** Its own caption and label (sub-figure), empty when it has none. */
  caption: string;
  label: string;
}

/**
 * Several pictures written together, as the image dialog writes them: a
 * figure of sub-figures, or pictures side by side joined by `\\hfill`.
 */
export interface FigureGroup {
  /** Range rewritten by "Update". */
  from: number;
  to: number;
  mode: "figure" | "inline";
  images: GroupImage[];
  /** Pictures per row (sub-figures). */
  columns: number;
  /** Width of each picture in percent of the line (side by side), or null when their options say something else. */
  width: number | null;
  /** Their options as written, when they are not such a width. */
  options: string | null;
  placement: string;
  caption: string;
  label: string;
}

const GRAPHICS = /\\includegraphics\*?\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/;
/** What may stand between two pictures of a group. */
const BETWEEN = /^(?:\s|\\hfill\b|\\par\b|\\medskip\b|\\smallskip\b|\\bigskip\b|\\quad\b|\\qquad\b|\\\\|%[^\n]*)*$/;

/** Width in percent of the line said by the options of a picture, or null. */
function lineWidth(options: string): number | null {
  const w = /^width\s*=\s*([\d.]*)\s*\\(?:linewidth|textwidth|columnwidth)$/.exec(options.trim());
  return w ? Math.round((w[1] ? Number(w[1]) : 1) * 100) : null;
}

/** The pictures side by side that the one at `at` belongs to: joined by `\\hfill`, nothing else between them. */
function inlineGroup(text: string, at: number): FigureGroup | null {
  const found: { from: number; to: number; options: string; path: string }[] = [];
  const re = new RegExp(GRAPHICS.source, "g");
  // A little before and after: a group is a few lines.
  const start = Math.max(0, at - 4000);
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index < at + 4000) found.push({ from: m.index, to: m.index + m[0].length, options: (m[1] ?? "").trim(), path: m[2].trim() });
  const mine = found.findIndex((f) => f.from === at);
  if (mine < 0) return null;
  const joined = (a: number, b: number) => {
    const gap = text.slice(found[a].to, found[b].from);
    return gap.includes("\\hfill") && BETWEEN.test(gap);
  };
  let first = mine;
  let last = mine;
  while (first > 0 && joined(first - 1, first)) first--;
  while (last < found.length - 1 && joined(last, last + 1)) last++;
  if (first === last) return null;
  const run = found.slice(first, last + 1);
  // One width for all, as the dialog writes them; else they are not its to rewrite.
  if (run.some((f) => f.options !== run[0].options)) return null;
  const width = lineWidth(run[0].options);
  return {
    from: run[0].from,
    to: run[run.length - 1].to,
    mode: "inline",
    images: run.map((f) => ({ path: f.path, caption: "", label: "" })),
    columns: Math.min(MAX_COLUMNS, run.length),
    width,
    options: width === null ? run[0].options : null,
    placement: "htbp",
    caption: "",
    label: "",
  };
}

/**
 * The group of pictures the `\\includegraphics` starting at `at` belongs to,
 * when the image dialog can rewrite it whole: a figure made of sub-figures
 * of one picture each (with `\\centering`, a caption and a label, nothing
 * else), or pictures joined by `\\hfill`. Null for a picture on its own.
 */
export function figureGroupAt(text: string, at: number): FigureGroup | null {
  if (!text.startsWith("\\includegraphics", at)) return null;
  const begin = text.lastIndexOf("\\begin{figure", at);
  const inFigure = begin >= 0 && !text.slice(begin, at).includes("\\end{figure");
  const head = inFigure ? /^\\begin\{figure\*?\}\s*(?:\[([^\]]*)\])?/.exec(text.slice(begin, begin + 80)) : null;
  const end = inFigure ? text.indexOf("\\end{figure", at) : -1;
  const close = end >= 0 ? /^\\end\{figure\*?\}/.exec(text.slice(end, end + 16)) : null;
  if (!head || !close) return inlineGroup(text, at);
  const bodyStart = begin + head[0].length;
  const body = text.slice(bodyStart, end);
  // The sub-figures, each with one picture and nothing but its caption and label.
  const images: GroupImage[] = [];
  const spans: { from: number; to: number; share: number }[] = [];
  const sub = /\\begin\{subfigure\}\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}([\s\S]*?)\\end\{subfigure\}/g;
  let m: RegExpExecArray | null;
  while ((m = sub.exec(body))) {
    const inner = m[2];
    const picture = GRAPHICS.exec(inner);
    if (!picture) return inlineGroup(text, at);
    const caption = commandArg(inner, "caption");
    const label = commandArg(inner, "label");
    let rest = inner.replace(picture[0], "");
    if (caption) rest = rest.replace(caption.raw, "");
    if (label) rest = rest.replace(label.raw, "");
    if (rest.replace(/%.*$/gm, "").replace(/\\centering\b/, "").trim()) return inlineGroup(text, at);
    images.push({ path: picture[2].trim(), caption: caption?.value ?? "", label: label?.value ?? "" });
    const share = /^([\d.]*)\s*\\(?:linewidth|textwidth|columnwidth)$/.exec(m[1].trim());
    spans.push({ from: m.index, to: m.index + m[0].length, share: share ? (share[1] ? Number(share[1]) : 1) : 0 });
  }
  if (images.length < 2) return inlineGroup(text, at);
  // Around them: `\centering`, the caption and the label of the figure, and what separates two pictures.
  let outside = "";
  let from = 0;
  let firstRow = 0;
  spans.forEach((span, i) => {
    const gap = body.slice(from, span.from);
    if (i > 0 && !firstRow && /\\par\b|\\\\/.test(gap)) firstRow = i;
    outside += i === 0 ? gap : BETWEEN.test(gap) ? "" : gap;
    from = span.to;
  });
  outside += body.slice(from);
  const caption = commandArg(outside, "caption");
  const label = commandArg(outside, "label");
  if (caption) outside = outside.replace(caption.raw, "");
  if (label) outside = outside.replace(label.raw, "");
  if (outside.replace(/%.*$/gm, "").replace(/\\centering\b/, "").trim()) return inlineGroup(text, at);
  // Pictures per row: where the first row ends, else what their width allows.
  const byWidth = spans[0].share > 0 ? Math.round(1 / (spans[0].share + 0.02)) : images.length;
  const columns = Math.max(1, Math.min(MAX_COLUMNS, firstRow || Math.min(byWidth, images.length)));
  return {
    from: begin,
    to: end + close[0].length,
    mode: "figure",
    images,
    columns,
    width: null,
    options: null,
    placement: head[1] ?? "htbp",
    caption: caption?.value ?? "",
    label: label?.value ?? "",
  };
}

/** Where the first picture of a group starts (its chip stands for all of them). */
export function firstPictureOf(text: string, group: FigureGroup): number {
  const m = GRAPHICS.exec(text.slice(group.from, group.to));
  return m ? group.from + m.index : group.from;
}
