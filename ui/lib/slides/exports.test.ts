import assert from "node:assert/strict";
import { test } from "node:test";
import { exportNames, exportText } from "./exports.ts";

const DECK = `\\documentclass[aspectratio=169,handout]{beamer}
\\usetheme{Madrid}
\\setbeameroption{show notes on second screen=right}
\\begin{document}
\\begin{frame}{Un}\\note{N}\\end{frame}
\\end{document}
`;

test("the text of a deck for each export, the deck untouched", () => {
  assert.equal(exportText(DECK, { kind: "slides" }), "\\documentclass[aspectratio=169]{beamer}\n\\usetheme{Madrid}\n\\begin{document}\n\\begin{frame}{Un}\\note{N}\\end{frame}\n\\end{document}\n");
  assert.equal(exportText(DECK, { kind: "notes" }), "\\documentclass[aspectratio=169]{beamer}\n\\usetheme{Madrid}\n\\setbeameroption{show notes}\n\\begin{document}\n\\begin{frame}{Un}\\note{N}\\end{frame}\n\\end{document}\n");
  assert.equal(exportText(DECK, { kind: "handout" }).split("\n")[0], "\\documentclass[handout,aspectratio=169]{beamer}");
  const four = exportText(DECK, { kind: "handout", perPage: 4 });
  assert.ok(four.includes("\\usepackage{pgfpages}\n\\pgfpagesuselayout{4 on 1}[a4paper,landscape,border shrink=5mm]\n\\begin{document}"));
  assert.ok(exportText("\\documentclass{beamer}\n\\begin{document}\n\\end{document}", { kind: "handout", perPage: 2, paper: "letterpaper" }).includes("\\pgfpagesuselayout{2 on 1}[letterpaper,border shrink=5mm]"));
  assert.deepEqual(exportNames({ kind: "handout", perPage: 4 }, "fr"), { name: "handout-4", suffix: " - polycopié" });
});
