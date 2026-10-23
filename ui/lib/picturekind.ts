// What a TikZ picture is, from what it holds: curves (pgfplots), a table of
// variations (tkz-tab), a probability tree (a TikZ tree growing right), or
// a drawing. The chips of the editor open the studio of each from it.

export type PictureKind = "graph" | "variations" | "tree" | "tikz";

/** The kind of the picture whose `\begin{tikzpicture}` starts `text`. */
export function pictureKind(text: string): PictureKind {
  const end = text.indexOf("\\end{tikzpicture}");
  const inside = end < 0 ? text : text.slice(0, end);
  if (/\\begin\s*\{axis\}/.test(inside)) return "graph";
  if (/\\tkzTabInit\b/.test(inside)) return "variations";
  if (/grow'\s*=\s*right/.test(inside) && /\bchild\s*\{/.test(inside)) return "tree";
  return "tikz";
}
