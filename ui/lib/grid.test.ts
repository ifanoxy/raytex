import { test } from "node:test";
import assert from "node:assert/strict";
import { envRange, gridAt, gridToLatex, newGrid, parseGrid, parseSpec, pastedCells, resize, trimmed } from "./grid.ts";

test("a matrix is read into cells", () => {
  const g = parseGrid("\\begin{pmatrix}\n  a & b \\\\\n  c & \\frac{1}{2}\n\\end{pmatrix}")!;
  assert.equal(g.kind, "matrix");
  assert.equal(g.env, "pmatrix");
  assert.deepEqual(g.cells, [
    ["a", "b"],
    ["c", "\\frac{1}{2}"],
  ]);
});

test("a matrix is written with aligned cells, without a final \\\\", () => {
  const g = newGrid("matrix", 2, 2);
  g.cells = [
    ["1", "-10"],
    ["100", "2"],
  ];
  assert.equal(gridToLatex(g), "\\begin{pmatrix}\n\t1   & -10 \\\\\n\t100 & 2\n\\end{pmatrix}");
  assert.equal(gridToLatex({ ...g, env: "bmatrix" }, "  ", "  "), "\\begin{bmatrix}\n    1   & -10 \\\\\n    100 & 2\n  \\end{bmatrix}");
});

test("a booktabs table keeps its columns and header", () => {
  const src = "\\begin{tabular}{lcr}\n\t\\toprule\n\tName & Age & City \\\\\n\t\\midrule\n\tAnne & 30 & Paris \\\\\n\tBob & 25 & Lyon \\\\\n\t\\bottomrule\n\\end{tabular}";
  const g = parseGrid(src)!;
  assert.equal(g.kind, "table");
  assert.deepEqual(g.columns, ["l", "c", "r"]);
  assert.equal(g.style, "booktabs");
  assert.equal(g.header, true);
  assert.deepEqual(g.cells[2], ["Bob", "25", "Lyon"]);
  assert.equal(g.cells.length, 3);
  assert.equal(parseGrid(gridToLatex(g))!.cells.length, 3);
  assert.deepEqual(parseGrid(gridToLatex(g)), g);
});

test("tables with lines, escaped &, spacing after \\\\ and comments", () => {
  const src = "\\begin{tabular}[t]{|l|p{3cm}|}\n\\hline\nA \\& B & x \\\\[2pt] \\hline\nC & y % note & z\n\\\\ \\hline\n\\end{tabular}";
  const g = parseGrid(src)!;
  assert.equal(g.style, "lines");
  assert.equal(g.option, "[t]");
  assert.deepEqual(g.columns, ["l", "p{3cm}"]);
  assert.deepEqual(g.cells, [
    ["A \\& B", "x"],
    ["C", "y"],
  ]);
  assert.match(gridToLatex(g), /^\\begin\{tabular\}\[t\]\{\|l\|p\{3cm\}\|\}\n\t\\hline\n/);
});

test("a \\multicolumn row keeps its width", () => {
  const g = parseGrid("\\begin{tabular}{ccc}\n\\multicolumn{2}{c}{AB} & C \\\\\n1 & 2 & 3\n\\end{tabular}")!;
  assert.deepEqual(g.cells[0], ["\\multicolumn{2}{c}{AB}", "C", ""]);
  assert.match(gridToLatex(g), /\t\\multicolumn\{2\}\{c\}\{AB\} & C \\\\\n/);
});

test("column specifications that cannot be rebuilt are kept", () => {
  assert.deepEqual(parseSpec("*{3}{c}"), { columns: ["c", "c", "c"], simple: true, lines: false });
  const g = parseGrid("\\begin{tabular}{@{}lS@{}}\na & 1.5 \\\\\n\\end{tabular}")!;
  assert.equal(g.rawSpec, "@{}lS@{}");
  assert.match(gridToLatex(g), /^\\begin\{tabular\}\{@\{\}lS@\{\}\}/);
  // A new column: the specification is written from the columns.
  assert.match(gridToLatex(resize(g, 1, 3)), /^\\begin\{tabular\}\{lSc\}/);
});

test("environments are found around the cursor, the innermost first", () => {
  const text = "x \\begin{tabular}{cc}\n$\\begin{pmatrix} 1 \\end{pmatrix}$ & b\n\\end{tabular} y";
  const tab = text.indexOf("\\begin{tabular}");
  const mat = text.indexOf("\\begin{pmatrix}");
  assert.equal(gridAt(text, mat + 17), mat);
  assert.equal(gridAt(text, text.indexOf("& b")), tab);
  assert.equal(gridAt(text, 0), null);
  assert.equal(envRange(text, tab)!.to, text.indexOf(" y"));
  // `[` after \begin{pmatrix} is a cell, not an option.
  assert.deepEqual(parseGrid("\\begin{pmatrix}[a] & b\\end{pmatrix}")!.cells, [["[a]", "b"]]);
  assert.equal(parseGrid("\\begin{pmatrix*}[r] -1 & 2\\end{pmatrix*}")!.option, "[r]");
});

test("empty rows and columns at the end are left out", () => {
  const g = newGrid("matrix", 3, 3);
  g.cells[0][0] = "a";
  g.cells[1][1] = "b";
  assert.deepEqual(trimmed(g).cells, [
    ["a", ""],
    ["", "b"],
  ]);
});

test("pasted cells from a spreadsheet or LaTeX", () => {
  assert.deepEqual(pastedCells("a\tb\nc\td\n"), [
    ["a", "b"],
    ["c", "d"],
  ]);
  assert.deepEqual(pastedCells("1 & 2 \\\\ 3 & 4 \\\\"), [
    ["1", "2"],
    ["3", "4"],
  ]);
  assert.equal(pastedCells("x^2"), null);
});
