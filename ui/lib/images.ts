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
}

function fraction(percent: number): string {
  if (percent >= 100) return "\\linewidth";
  return `${Math.round(percent) / 100}\\linewidth`;
}

/** LaTeX code inserting the images (tabs mark one indentation level). */
export function figureCode(o: FigureOptions): string {
  if (o.mode === "inline") {
    return o.paths.map((p) => `\\includegraphics[width=${fraction(o.width)}]{${p}}`).join("\\hfill\n");
  }
  const lines = [`\\begin{figure}[${o.placement}]`, "\t\\centering"];
  if (o.paths.length === 1) {
    lines.push(`\t\\includegraphics[width=${fraction(o.width)}]{${o.paths[0]}}`);
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
