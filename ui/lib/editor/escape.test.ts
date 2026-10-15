// Special characters typed in text are escaped; where they are LaTeX, never.
import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeTyped } from "./escape.ts";

const DOC = "\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\n";

test("in text: & _ # are escaped, % after a number", () => {
  assert.equal(escapeTyped("&", `${DOC}La R`, false), true);
  assert.equal(escapeTyped("_", `${DOC}le fichier mon`, false), true);
  assert.equal(escapeTyped("#", `${DOC}le numéro `, false), true);
  assert.equal(escapeTyped("%", `${DOC}soit 50`, false), true);
  assert.equal(escapeTyped("%", `${DOC}soit 50 `, false), true);
  assert.equal(escapeTyped("&", "Dans un chapitre sans préambule, R", false), true);
  assert.equal(escapeTyped("_", `${DOC}\\textbf{gras a`, false), true);
});

test("a comment, a formula, an escape already typed: left as it is", () => {
  assert.equal(escapeTyped("%", `${DOC}Texte `, false), false);
  assert.equal(escapeTyped("%", `${DOC}`, false), false);
  assert.equal(escapeTyped("&", `${DOC}texte % un commentaire R`, false), false);
  assert.equal(escapeTyped("_", `${DOC}$x`, true), false);
  assert.equal(escapeTyped("&", `${DOC}R\\`, false), false);
  assert.equal(escapeTyped("&", `${DOC}R\\\\`, false), true);
});

test("tables and alignments keep their &", () => {
  assert.equal(escapeTyped("&", `${DOC}\\begin{tabular}{ll}\na `, false), false);
  assert.equal(escapeTyped("&", `${DOC}\\begin{align*}\nx `, false), false);
  assert.equal(escapeTyped("&", `${DOC}\\begin{tabular}{ll}\na & b\n\\end{tabular}\nR`, false), true);
  assert.equal(escapeTyped("&", `${DOC}% \\begin{tabular}{ll}\nR`, false), true);
});

test("names, keys, links, files, definitions, options, code: left as they are", () => {
  assert.equal(escapeTyped("_", `${DOC}\\label{fig`, false), false);
  assert.equal(escapeTyped("_", `${DOC}voir \\ref{sec`, false), false);
  assert.equal(escapeTyped("_", `${DOC}\\includegraphics[width=5cm]{images/photo`, false), false);
  assert.equal(escapeTyped("_", `${DOC}\\includegraphics[width=a`, false), false);
  assert.equal(escapeTyped("#", `${DOC}\\href{https://a.org/page`, false), false);
  assert.equal(escapeTyped("_", `${DOC}\\cite{doe`, false), false);
  assert.equal(escapeTyped("#", `${DOC}\\newcommand{\\vect}[1]{\\overrightarrow{`, false), false);
  assert.equal(escapeTyped("_", `${DOC}\\begin{lstlisting}\nmy`, false), false);
  assert.equal(escapeTyped("&", `${DOC}\\begin{tikzpicture}\n\\matrix{a `, false), false);
  assert.equal(escapeTyped("_", `${DOC}\\verb|a`, false), false);
  // The preamble is code.
  assert.equal(escapeTyped("#", "\\documentclass{article}\n\\newcommand{\\x}[1]{", false), false);
  assert.equal(escapeTyped("_", "\\documentclass{article}\n\\usepackage{a", false), false);
});
