// Tests of typing helpers: `$` pairs, linked environment names and the
// ribbon's formatting commands (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { dollarAction, insideDollarMath } from "./dollar.ts";
import { alignLines, headingLine, headingOf, listBlock, setColor, setHeading, setList, setSize, tableSnippet } from "./format.ts";
import { linkedEnvironments } from "./linked-envs.ts";

/** A view-like object: enough for commands that only read the state and dispatch. */
function fakeView(doc: string, anchor: number, head = anchor) {
  const v = {
    state: EditorState.create({ doc, selection: EditorSelection.single(anchor, head), extensions: [linkedEnvironments()] }),
    dispatch(...specs: TransactionSpec[]) {
      v.state = v.state.update(...specs).state;
    },
  };
  return v as typeof v & EditorView;
}

test("dollar: pairs only where a formula can start", () => {
  assert.equal(dollarAction("Soit ", ""), "pair");
  assert.equal(dollarAction("", ""), "pair");
  assert.equal(dollarAction("(", ")"), "pair");
  assert.equal(dollarAction("Soit", ""), "single", "after a word");
  assert.equal(dollarAction("Soit $f(x)", " = 1"), "single", "closing a formula after )");
  assert.equal(dollarAction("Soit $x", "$ tel"), "skip", "the closing $ is already there");
  assert.equal(dollarAction("coût : 5\\", ""), "single", "escaped dollar");
  assert.equal(dollarAction("Soit ", "x"), "single", "before a word");
  assert.equal(insideDollarMath("a $b$ c $d"), true);
  assert.equal(insideDollarMath("a \\$ b % $"), false);
});

test("linked environments: renaming \\begin renames \\end", () => {
  const doc = "\\begin{itemize}\n\\begin{itemize}\n\\item a\n\\end{itemize}\n\\end{itemize}\n";
  const v = fakeView(doc, 0);
  // Replace "itemize" of the first \begin by "enumerate" (typed).
  v.dispatch({ changes: { from: 7, to: 14, insert: "enumerate" }, userEvent: "input.type" });
  assert.equal(v.state.doc.toString(), "\\begin{enumerate}\n\\begin{itemize}\n\\item a\n\\end{itemize}\n\\end{enumerate}\n");
  // Deleting a letter of the inner \end also edits the inner \begin.
  const inner = v.state.doc.toString().indexOf("\\end{itemize}") + 5 + 7;
  v.dispatch({ changes: { from: inner - 1, to: inner }, userEvent: "delete.backward" });
  assert.equal(v.state.doc.toString(), "\\begin{enumerate}\n\\begin{itemiz}\n\\item a\n\\end{itemiz}\n\\end{enumerate}\n");
  // Programmatic changes and unmatched environments are left alone.
  const w = fakeView("\\begin{center}\ntext\n", 0);
  w.dispatch({ changes: { from: 7, to: 13, insert: "flushleft" }, userEvent: "input.type" });
  assert.equal(w.state.doc.toString(), "\\begin{flushleft}\ntext\n");
  const x = fakeView("\\begin{a}\n\\end{a}", 0);
  x.dispatch({ changes: { from: 7, to: 8, insert: "b" } });
  assert.equal(x.state.doc.toString(), "\\begin{b}\n\\end{a}");
});

test("headings", () => {
  assert.equal(headingOf("  \\section*{Intro} % c"), "section");
  assert.equal(headingOf("Texte"), null);
  assert.deepEqual(headingLine("Introduction", "section"), { text: "\\section{Introduction}", cursor: 21 });
  assert.equal(headingLine("\\section{A \\emph{b}} x", "subsection").text, "\\subsection{A \\emph{b}} x");
  assert.equal(headingLine("\\section*{A}", null).text, "A");
  const v = fakeView("Titre\nTexte", 2);
  setHeading(v, "chapter");
  assert.equal(v.state.doc.toString(), "\\chapter{Titre}\nTexte");
});

test("size and colour wrap the selection, then change it", () => {
  const v = fakeView("un mot ici", 3, 6);
  setSize(v, "large");
  assert.equal(v.state.doc.toString(), "un {\\large mot} ici");
  setSize(v, "Huge");
  assert.equal(v.state.doc.toString(), "un {\\Huge mot} ici");
  setSize(v, "normalsize");
  assert.equal(v.state.doc.toString(), "un mot ici");
  setColor(v, "red");
  assert.equal(v.state.doc.toString(), "un \\textcolor{red}{mot} ici");
  setColor(v, "blue");
  assert.equal(v.state.doc.toString(), "un \\textcolor{blue}{mot} ici");
  assert.equal(v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to), "mot");
});

test("alignment blocks", () => {
  const lines = ["a", "b", "c"];
  assert.deepEqual(alignLines(lines, 1, 1, "center", "  "), { from: 1, to: 1, text: ["\\begin{center}", "  b", "\\end{center}"] });
  const wrapped = ["\\begin{center}", "  b", "\\end{center}"];
  assert.deepEqual(alignLines(wrapped, 1, 1, "flushright", "  ")?.text, ["\\begin{flushright}", "  b", "\\end{flushright}"]);
  assert.deepEqual(alignLines(wrapped, 1, 1, null, "  ")?.text, ["b"]);
  assert.equal(alignLines(wrapped, 1, 1, "center", "  "), null);
});

test("lists", () => {
  assert.deepEqual(listBlock(["pommes", "", "poires"], "itemize", "\t"), ["\\begin{itemize}", "\t\\item pommes", "\t\\item poires", "\\end{itemize}"]);
  const v = fakeView("\\begin{itemize}\n\t\\item a\n\\end{itemize}", 20);
  setList(v, "enumerate", "\t");
  assert.equal(v.state.doc.toString(), "\\begin{enumerate}\n\t\\item a\n\\end{enumerate}");
});

test("tables have empty cells", () => {
  const s = tableSnippet(2, 3);
  assert.match(s, /\\begin\{tabular\}\{lll\}/);
  assert.match(s, /\$\{1\} & \$\{2\} & \$\{3\} \\\\/);
  assert.match(s, /\\caption\{\$\{7\}\}/);
  assert.ok(!/\$\{\d+:/.test(s), "no default text");
});
