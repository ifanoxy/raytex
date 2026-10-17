// The tools of a text of a slide: what they write around the words chosen
// (`\textbf{…}`, `\alert{…}`, `\textcolor{red}{…}`, `$…$`, `\href{…}{…}`),
// taken off again when the words have it already.
//
// No local imports: tested directly by Node (`npm test`).

export type InlineTool = "bold" | "italic" | "underline" | "alert" | "structure" | "color" | "math" | "link";

/** The colours offered, as LaTeX names them (xcolor, loaded by Beamer). */
export const INLINE_COLORS: { id: string; swatch: string }[] = [
  { id: "red", swatch: "#e53935" },
  { id: "blue", swatch: "#1e63d6" },
  { id: "green!50!black", swatch: "#2e7d32" },
  { id: "orange", swatch: "#f57c00" },
  { id: "violet", swatch: "#8e24aa" },
  { id: "gray", swatch: "#808080" },
];

/** What a tool writes before and after the words. */
export function around(tool: InlineTool, color = "red"): [string, string] {
  switch (tool) {
    case "bold":
      return ["\\textbf{", "}"];
    case "italic":
      return ["\\textit{", "}"];
    case "underline":
      return ["\\underline{", "}"];
    case "alert":
      return ["\\alert{", "}"];
    case "structure":
      return ["\\structure{", "}"];
    case "color":
      return [`\\textcolor{${color}}{`, "}"];
    case "math":
      return ["$", "$"];
    case "link":
      return ["\\href{https://}{", "}"];
  }
}

/**
 * A field after a tool: the words from `start` to `end` put inside (taken
 * out when they are inside already); what is chosen after it, the words
 * (or, for a link, the address to type).
 */
export function applyTool(value: string, start: number, end: number, tool: InlineTool, color?: string): { value: string; start: number; end: number } {
  const [a, b] = around(tool, color);
  // Inside already (the same tool, or another colour): taken out.
  const open = tool === "color" ? /\\textcolor\{[^}]*\}\{$/.exec(value.slice(0, start)) : value.slice(start - a.length, start) === a ? [a] : null;
  if (open && value.slice(end, end + b.length) === b && start < end) {
    const from = start - open[0].length;
    const inner = value.slice(start, end);
    const next = tool === "color" && open[0] !== a ? `${a}${inner}${b}` : inner;
    const out = value.slice(0, from) + next + value.slice(end + b.length);
    const at = next === inner ? from : from + a.length;
    return { value: out, start: at, end: at + inner.length };
  }
  const inner = value.slice(start, end);
  const out = value.slice(0, start) + a + inner + b + value.slice(end);
  if (tool === "link") return { value: out, start: start + "\\href{".length, end: start + "\\href{https://".length };
  return { value: out, start: start + a.length, end: start + a.length + inner.length };
}
