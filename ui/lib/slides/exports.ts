// What a deck is exported as, each built apart from a text of its own (the
// deck itself untouched): its slides with every step, its slides with the
// notes of the speaker (a page of notes after each), or handouts (the last
// step of each slide, one, two or four to a page).
//
// No local imports: tested directly by Node (`npm test`).

export type ExportKind = "slides" | "notes" | "handout";

export interface DeckExport {
  kind: ExportKind;
  /** Slides to a page of the handouts: 1, 2 or 4. */
  perPage?: number;
  /** The paper of the handouts. */
  paper?: "a4paper" | "letterpaper";
}

/** Where the preamble ends (`\begin{document}`), or the whole text. */
function preambleEnd(text: string): number {
  const m = /^[^%\n]*?\\begin\s*\{document\}/m.exec(text);
  return m ? m.index + m[0].length - "\\begin{document}".length : text.length;
}

/** The text of the deck to build for an export. */
export function exportText(text: string, e: DeckExport): string {
  const end = preambleEnd(text);
  let pre = text
    .slice(0, end)
    // What showed or hid the notes, laid pages out or made handouts before.
    .replace(/^[ \t]*\\setbeameroption\s*\{\s*(?:show|hide) notes[^}]*\}[^\n]*\n?/gm, "")
    .replace(/^[ \t]*\\pgfpagesuselayout\s*\{[^}]*\}(?:\[[^\]]*\])?[^\n]*\n?/gm, "");
  pre = pre.replace(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{beamer\}/, (_, options: string | undefined) => {
    const kept = (options ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o && o !== "handout" && o !== "trans");
    if (e.kind === "handout") kept.unshift("handout");
    return `\\documentclass${kept.length ? `[${kept.join(",")}]` : ""}{beamer}`;
  });
  const added: string[] = [];
  if (e.kind === "notes") added.push("\\setbeameroption{show notes}");
  if (e.kind === "handout" && (e.perPage ?? 1) > 1) {
    const paper = e.paper ?? "a4paper";
    if (!/\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\bpgfpages\b[^}]*\}/.test(pre)) added.push("\\usepackage{pgfpages}");
    added.push(e.perPage === 2 ? `\\pgfpagesuselayout{2 on 1}[${paper},border shrink=5mm]` : `\\pgfpagesuselayout{4 on 1}[${paper},landscape,border shrink=5mm]`);
  }
  return `${pre}${added.map((l) => `${l}\n`).join("")}${text.slice(end)}`;
}

/** The name of the build of an export (a folder), and the end of the name of its PDF. */
export function exportNames(e: DeckExport, lang: "fr" | "en"): { name: string; suffix: string } {
  const fr = lang === "fr";
  if (e.kind === "notes") return { name: "notes", suffix: fr ? " - notes" : " - notes" };
  if (e.kind === "handout") return { name: `handout-${e.perPage ?? 1}`, suffix: fr ? " - polycopié" : " - handout" };
  return { name: "slides", suffix: "" };
}
