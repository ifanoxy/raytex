import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyGraph, type Graph, graphCode, newArea, newCurve, newLine, newPoint, newTangent, niceStep, numberOf, pieces, readGraph, splitOptions, tangentLatex, tangentLine, writesFrench, xRange, yRange } from "./graph.ts";
import { parseExpr } from "./mathexpr.ts";

function parabola(): Graph {
  const g = emptyGraph();
  const f = newCurve(g, "x^2 - 1");
  g.curves.push(f);
  return g;
}

test("numbers are read as in a formula", () => {
  assert.equal(numberOf("2"), 2);
  assert.equal(numberOf("-1,5"), -1.5);
  assert.ok(Math.abs(numberOf("pi/2")! - Math.PI / 2) < 1e-12);
  assert.equal(numberOf("x"), null);
  assert.equal(numberOf(""), null);
  assert.equal(niceStep(10), 1);
  assert.equal(niceStep(100), 10);
  assert.equal(niceStep(3), 0.5);
});

test("a curve is cut where it is not defined and at its poles", () => {
  const inverse = pieces(parseExpr("1/x"), -5, 5);
  assert.equal(inverse.length, 2);
  assert.ok(inverse[0][1] <= 0 && inverse[1][0] >= 0);
  const root = pieces(parseExpr("sqrt(x)"), -5, 5);
  assert.deepEqual(root.map(([a, b]) => [Number(a.toFixed(6)), b]), [[0, 5]]);
  const tangent = pieces(parseExpr("tan(x)"), -3, 3);
  assert.equal(tangent.length, 3);
  assert.equal(pieces(parseExpr("x^2"), -5, 5).length, 1);
  assert.equal(pieces(parseExpr("ln(x)"), -5, -1).length, 0);
});

test("the axes hold the curves", () => {
  const g = parabola();
  assert.deepEqual(xRange(g), [-5, 5]);
  const [lo, hi] = yRange(g);
  assert.ok(lo <= -1 && lo >= -5, String(lo));
  assert.ok(hi >= 24 && hi <= 30, String(hi));
  // A pole does not stretch the axis to its values.
  const h = emptyGraph();
  h.curves.push(newCurve(h, "1/x"));
  const [a, b] = yRange(h);
  assert.ok(a > -40 && b < 40, `${a} ${b}`);
  g.axes.ymin = "-2";
  g.axes.ymax = "3";
  assert.deepEqual(yRange(g), [-2, 3]);
});

test("a tangent is the line of the derivative", () => {
  const g = parabola();
  const t = newTangent(g, g.curves[0].id);
  t.at = "1";
  g.tangents.push(t);
  const line = tangentLine(g, t)!;
  assert.equal(line.m, 2);
  assert.equal(line.c, -2);
  assert.equal(tangentLatex(g, t), "y = 2x - 2");
  t.at = "0";
  assert.equal(tangentLatex(g, t), "y = -1");
});

test("the picture says what each line is, and is read back the same", () => {
  const g = parabola();
  const f = g.curves[0];
  f.label = "legend";
  f.text = "f";
  const k = newCurve(g, "1/x");
  k.colour = "red";
  k.style = "dashed";
  g.curves.push(k);
  const t = newTangent(g, f.id);
  t.at = "1";
  g.tangents.push(t);
  const p = newPoint(g, f.id);
  p.x = "2";
  g.points.push(p);
  const q = newPoint(g, null);
  q.x = "-1";
  q.y = "4";
  q.projections = false;
  g.points.push(q);
  const v = newLine("x");
  v.at = "0";
  v.text = "x = 0";
  g.lines.push(v);
  g.areas.push({ ...newArea(f.id), from: "0", to: "1" });
  g.areas.push({ ...newArea(f.id), and: k.id, from: "1", to: "2", colour: "orange" });
  g.axes.grid = "both";
  g.axes.equal = true;
  g.options.push("x axis line style={-latex}");
  g.extra.push("\\node at (axis cs:3,3) {Bonjour};");
  const code = graphCode(g);
  assert.match(code, /\\addplot\[blue, thick, domain=-5:5\] \{x\^2 - 1\}; % f\(x\) = x\^2 - 1/);
  assert.match(code, /\\addlegendentry\{\$f\$\}/);
  assert.match(code, /forget plot\] \{1\/x\}.*; % g\(x\) = …/);
  assert.match(code, /% y = f'\(1\)\(x - 1\) \+ f\(1\)/);
  assert.match(code, /\{2\*x - 2\}/);
  assert.match(code, /coordinates \{\(2,3\)\} node\[above right\] \{\$A\$\}; % A\(2, f\(2\)\)/);
  assert.match(code, /% x = 0/);
  assert.match(code, /\\closedcycle; % ∫_0\^1 f\(x\) dx/);
  assert.match(code, /fill between\[of=RTXarea2a and RTXarea2b\]; % ∫_1\^2 \(f\(x\) - g\(x\)\) dx/);
  assert.match(code, /axis lines=middle/);
  assert.match(code, /axis equal image/);
  const back = readGraph(code)!;
  assert.ok(back);
  assert.deepEqual(
    back.curves.map((c) => [c.name, c.expr, c.colour, c.style, c.label, c.text, c.from, c.to]),
    [
      ["f", "x^2 - 1", "blue", "solid", "legend", "f", "", ""],
      ["g", "1/x", "red", "dashed", "curve", "\\mathcal{C}_g", "", ""],
    ],
  );
  assert.deepEqual(back.tangents.map((x) => [x.at, x.point, back.curves.find((c) => c.id === x.of)?.name]), [["1", true, "f"]]);
  assert.deepEqual(back.points.map((x) => [x.name, x.x, x.y, x.of ? "on" : "off", x.projections]), [
    ["A", "2", "", "on", true],
    ["B", "-1", "4", "off", false],
  ]);
  assert.deepEqual(back.lines.map((x) => [x.kind, x.at, x.text]), [["x", "0", "x = 0"]]);
  assert.deepEqual(back.areas.map((x) => [x.from, x.to, x.and ? "between" : "under", x.colour]), [
    ["0", "1", "under", "blue"],
    ["1", "2", "between", "orange"],
  ]);
  assert.equal(back.axes.grid, "both");
  assert.equal(back.axes.equal, true);
  assert.deepEqual(back.options, ["x axis line style={-latex}"]);
  assert.deepEqual(back.extra, ["\\node at (axis cs:3,3) {Bonjour};"]);
  // Written again, it is the same picture.
  assert.equal(graphCode(back), code);
});

test("a picture that is not a graph is not read as one", () => {
  assert.equal(readGraph("\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}"), null);
  assert.equal(readGraph("\\begin{tikzpicture}\\node {a};\\begin{axis}\\end{axis}\\end{tikzpicture}"), null);
  const hand = readGraph("\\begin{tikzpicture}\n\\begin{axis}[xmin=0, xmax=2]\n\\addplot {x^3};\n\\end{axis}\n\\end{tikzpicture}")!;
  assert.deepEqual(hand.extra, ["\\addplot {x^3};"]);
  assert.equal(hand.axes.xmin, "0");
});

test("details", () => {
  assert.deepEqual(splitOptions("a=1, b={c, d}, e"), ["a=1", "b={c, d}", "e"]);
  assert.ok(writesFrench("\\usepackage[french]{babel}"));
  assert.ok(!writesFrench("\\usepackage[english]{babel}"));
  const g = parabola();
  g.curves[0].expr = "sin(x)";
  assert.match(graphCode(g), /trig format plots=rad/);
  assert.match(graphCode(g, true), /use comma/);
});
