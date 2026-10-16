import assert from "node:assert/strict";
import { test } from "node:test";
import { addValue, arrow, emptyTable, niceValue, readTable, removeValue, type SignRow, type Study, study, tableCode, type VarRow } from "./variations.ts";

const done = (s: ReturnType<typeof study>): Study => {
  assert.equal(typeof s, "object", String(s));
  return s as Study;
};
const signs = (s: Study) => s.table.rows[0] as SignRow;
const vars = (s: Study) => s.table.rows[1] as VarRow;
const cells = (r: VarRow) => r.cells.map((c) => (c.forbidden ? `${c.pos}D${c.right} ${c.value}|${c.rightValue}` : `${c.pos} ${c.value}`.trim()));

test("values are written exactly when they are simple", () => {
  assert.equal(niceValue(2).text, "2");
  assert.equal(niceValue(-0.5).text, "-\\frac{1}{2}");
  assert.equal(niceValue(1 / 3).text, "\\frac{1}{3}");
  assert.equal(niceValue(Math.PI / 2).text, "\\frac{\\pi}{2}");
  assert.equal(niceValue(2 * Math.PI).text, "2\\pi");
  assert.equal(niceValue(Math.sqrt(3)).text, "\\sqrt{3}");
  assert.equal(niceValue(Number.NEGATIVE_INFINITY).text, "-\\infty");
  assert.deepEqual(niceValue(1.2345), { text: "1.23", exact: false });
  assert.equal(niceValue(1.2345, true).text, "1{,}23");
});

test("a parabola: the sign of its derivative and its variations", () => {
  const s = done(study("x^2 - 2x - 1", "-\\infty", "+\\infty", "variations"));
  assert.deepEqual(s.table.values, ["-\\infty", "1", "+\\infty"]);
  assert.equal(signs(s).label, "f'(x)");
  assert.deepEqual(signs(s).marks, ["", "z", ""]);
  assert.deepEqual(signs(s).signs, ["-", "+"]);
  assert.deepEqual(cells(vars(s)), ["+ +\\infty", "- -2", "+ +\\infty"]);
  assert.equal(s.rounded, false);
});

test("a forbidden value: 1/x", () => {
  const s = done(study("g(x) = 1/x", "", "", "variations"));
  assert.deepEqual(s.table.values, ["-\\infty", "0", "+\\infty"]);
  assert.equal(vars(s).label, "g(x)");
  assert.deepEqual(signs(s).marks, ["", "d", ""]);
  assert.deepEqual(signs(s).signs, ["-", "-"]);
  assert.deepEqual(cells(vars(s)), ["+ 0", "-D+ -\\infty|+\\infty", "- 0"]);
});

test("defined from a bound on: ln(x)", () => {
  const s = done(study("ln(x)", "-\\infty", "+\\infty", "variations"));
  assert.deepEqual(s.table.values, ["0", "+\\infty"]);
  assert.deepEqual(signs(s).marks, ["d", ""]);
  assert.deepEqual(cells(vars(s)), ["+D- |-\\infty", "+ +\\infty"]);
});

test("signs of a function, and over a bounded interval", () => {
  const s = done(study("x^3 - 3x", "", "", "signs"));
  assert.deepEqual(s.table.values, ["-\\infty", "-\\sqrt{3}", "0", "\\sqrt{3}", "+\\infty"]);
  assert.deepEqual(signs(s).signs, ["-", "+", "-", "+"]);
  assert.equal(s.table.rows.length, 1);
  const sine = done(study("sin(x)", "0", "2pi", "variations"));
  assert.deepEqual(sine.table.values, ["0", "\\frac{\\pi}{2}", "\\frac{3\\pi}{2}", "2\\pi"]);
  assert.deepEqual(cells(vars(sine)), ["- 0", "+ 1", "- -1", "+ 0"]);
  assert.equal(study("sin(x)", "", "", "variations"), "tooMany");
  assert.equal(study("x +", "", "", "variations"), "unreadable");
});

test("the picture of tkz-tab, read back the same", () => {
  const s = done(study("1/x", "", "", "variations"));
  const code = tableCode(s.table);
  assert.equal(
    code,
    "\\begin{tikzpicture}\n\\tkzTabInit{$x$ / 1, $f'(x)$ / 1, $f(x)$ / 2}{$-\\infty$, $0$, $+\\infty$}\n\\tkzTabLine{, -, d, -, }\n\\tkzTabVar{+/ $0$, -D+/ $-\\infty$ / $+\\infty$, -/ $0$}\n\\end{tikzpicture}",
  );
  const back = readTable(code)!;
  assert.equal(tableCode(back), code);
  const ln = done(study("ln(x)", "", "", "variations")).table;
  assert.equal(tableCode(readTable(tableCode(ln))!), tableCode(ln));
  const end = readTable("\\begin{tikzpicture}\n\\tkzTabInit[lgt=3, color]{$x$ / 1, $h(x)$ / 2}{$-\\infty$, $0$}\n\\tkzTabVar{-/ $-\\infty$, +D/ $+\\infty$ /}\n\\tkzTabVal{1}{2}{0.5}{$\\alpha$}{$0$}\n\\end{tikzpicture}")!;
  assert.equal(end.lgt, 3);
  assert.deepEqual(end.options, ["color"]);
  assert.deepEqual(cells(end.rows[0] as VarRow), ["- -\\infty", "+D+ +\\infty|"]);
  assert.deepEqual(end.extra, ["\\tkzTabVal{1}{2}{0.5}{$\\alpha$}{$0$}"]);
  assert.equal(readTable("\\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}"), null);
});

test("values of x are added and taken out with their intervals", () => {
  let t = emptyTable();
  t = addValue(t, 0, "1");
  assert.deepEqual(t.values, ["-\\infty", "1", "+\\infty"]);
  assert.deepEqual((t.rows[0] as SignRow).marks, ["", "z", ""]);
  assert.deepEqual((t.rows[0] as SignRow).signs, ["+", "+"]);
  assert.equal((t.rows[1] as VarRow).cells.length, 3);
  t = removeValue(t, 1);
  assert.deepEqual(t.values, ["-\\infty", "+\\infty"]);
  assert.deepEqual((t.rows[0] as SignRow).signs, ["+"]);
  const r = done(study("x^2", "", "", "variations"));
  assert.deepEqual([arrow(vars(r), 0), arrow(vars(r), 1)], ["down", "up"]);
});
