// Tests of the TikZ whiteboard model: code written from shapes, and read
// back (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { codeShapes, copies, drawingCode, emptyStyle, fitView, freeSetName, moved, num, parseDrawing, parseStatement, scaled, setCode, setShapes, type Shape, shapeCode, shapesFromCode, snapPoint, splitOptions, touches } from "./model.ts";

test("numbers and options", () => {
  assert.equal(num(2), "2");
  assert.equal(num(1.2500001), "1.25");
  assert.equal(num(-0.0001), "0");
  assert.deepEqual(splitOptions("red, fill={blue!20}, line width=1pt, ->"), ["red", "fill={blue!20}", "line width=1pt", "->"]);
  assert.deepEqual(snapPoint({ x: 1.26, y: -0.74 }, 0.5), { x: 1.5, y: -0.5 });
});

test("shapes become TikZ statements", () => {
  const style = { ...emptyStyle(), stroke: "red", width: "thick" as const, arrow: "->" as const };
  assert.equal(shapeCode({ id: "a", kind: "path", points: [{ x: 0, y: 0 }, { x: 2, y: 1 }], closed: false, style }), "\\draw[red, thick, ->] (0,0) -- (2,1);");
  assert.equal(
    shapeCode({ id: "b", kind: "rect", from: { x: 0, y: 0 }, to: { x: 2, y: 1 }, style: { ...emptyStyle(), fill: "blue!20", noStroke: true } }),
    "\\fill[blue!20] (0,0) rectangle (2,1);",
  );
  assert.equal(shapeCode({ id: "c", kind: "circle", center: { x: 1, y: 1 }, r: 0.5, style: emptyStyle() }), "\\draw (1,1) circle (0.5);");
  assert.equal(shapeCode({ id: "d", kind: "ellipse", center: { x: 0, y: 0 }, rx: 2, ry: 1, style: { ...emptyStyle(), dash: "dashed" } }), "\\draw[dashed] (0,0) ellipse (2 and 1);");
  assert.equal(
    shapeCode({ id: "e", kind: "node", at: { x: 1, y: 2 }, text: "$x^2$", style: { ...emptyStyle(), fill: "yellow!30" }, boxed: true, shape: "circle", position: "above", textColor: null, font: "\\small", name: null }),
    "\\node[draw, circle, fill=yellow!30, above, font=\\small] at (1,2) {$x^2$};",
  );
});

test("the code of the whiteboard reads back to the same drawing", () => {
  const code = [
    "\\begin{tikzpicture}[scale=1.5]",
    "  \\draw[red, thick, ->] (0,0) -- (2,1);",
    "  \\draw[fill=blue!20, rounded corners] (0,0) rectangle (2,1);",
    "  \\fill[green!40] (0,0) -- (1,0) -- (0.5,1) -- cycle;",
    "  \\draw (1,1) circle (0.5);",
    "  \\draw[dashed] (0,0) ellipse (2 and 1);",
    "  \\node[draw, above] (a) at (1,2) {Début};",
    "  \\foreach \\i in {1,...,3} {\\draw (\\i,0) circle (0.1);}",
    "\\end{tikzpicture}",
  ].join("\n");
  const d = parseDrawing(code)!;
  assert.equal(d.options, "scale=1.5");
  assert.deepEqual(d.shapes.map((s) => s.kind), ["path", "rect", "path", "circle", "ellipse", "node", "code"]);
  assert.equal(codeShapes(d), 1);
  assert.equal(drawingCode(d), code, "writing it again gives the same code");
});

test("unknown statements and options are kept", () => {
  assert.equal(parseStatement("\\draw (0,0) node {x}"), null);
  assert.equal(parseStatement("\\draw (0,0) to[bend left] (1,1)"), null);
  assert.equal(parseStatement("\\draw (a) -- (b)"), null);
  const s = parseStatement("\\draw[line width=2pt, red!50!black, shorten >=2pt] (0,0) -- (1,0)")!;
  assert.equal(shapeCode(s), "\\draw[red!50!black, line width=2pt, shorten >=2pt] (0,0) -- (1,0);");
  const cm = parseStatement("\\draw (0cm,1cm) -- (2cm, 3 cm)")!;
  assert.equal(shapeCode(cm), "\\draw (0,1) -- (2,3);");
  assert.equal(parseDrawing("\\draw (0,0) -- (1,1);"), null, "not a picture");
});

test("moving shapes", () => {
  const r = parseStatement("\\draw (0,0) rectangle (1,1)")!;
  assert.equal(shapeCode(moved(r, 1, -0.5)), "\\draw (1,-0.5) rectangle (2,0.5);");
});

const rect = (x1: number, y1: number, x2: number, y2: number): Shape => ({ id: "r", kind: "rect", from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, style: emptyStyle() });
const circle = (x: number, y: number, r: number): Shape => ({ id: "c", kind: "circle", center: { x, y }, r, style: emptyStyle() });

test("a selection drawn with the mouse takes what it touches", () => {
  assert.equal(touches(rect(0, 0, 2, 1), { x: 1, y: 0.5 }, { x: 3, y: 3 }), true);
  assert.equal(touches(rect(0, 0, 2, 1), { x: 3, y: 3 }, { x: 2.5, y: 0 }), false);
  // Drawn from any corner.
  assert.equal(touches(circle(5, 5, 1), { x: 7, y: 7 }, { x: 5.5, y: 5.5 }), true);
  assert.equal(touches({ id: "k", kind: "code", code: "\\foreach …;" }, { x: -9, y: -9 }, { x: 9, y: 9 }), false);
});

test("copies are new shapes, moved", () => {
  const [a, b] = copies([rect(0, 0, 2, 1), circle(1, 1, 0.5)], 0.5, -0.5);
  assert.notEqual(a.id, "r");
  assert.notEqual(a.id, b.id);
  assert.deepEqual(a.kind === "rect" && [a.from, a.to], [{ x: 0.5, y: -0.5 }, { x: 2.5, y: 0.5 }]);
  assert.deepEqual(b.kind === "circle" && b.center, { x: 1.5, y: 0.5 });
});

test("shapes grow around a point", () => {
  const big = scaled(rect(1, 1, 2, 3), { x: 1, y: 1 }, 2);
  assert.deepEqual(big.kind === "rect" && [big.from, big.to], [{ x: 1, y: 1 }, { x: 3, y: 5 }]);
  const round = scaled(circle(2, 0, 1), { x: 0, y: 0 }, 0.5);
  assert.deepEqual(round.kind === "circle" && [round.center, round.r], [{ x: 1, y: 0 }, 0.5]);
});

test("a set keeps shapes as code, from the corner of their box", () => {
  const shapes = parseDrawing("\\begin{tikzpicture}\n\\draw[red, thick] (2,3) rectangle (4,4);\n\\node[above] at (3,4) {$L$};\n\\foreach \\i in {1,2} {\\fill (\\i,0) circle (2pt);}\n\\end{tikzpicture}")!.shapes;
  const code = setCode(shapes);
  assert.equal(code, "\\draw[red, thick] (0,0) rectangle (2,1);\n\\node[above] at (1,1) {$L$};\n\\foreach \\i in {1,2} {\\fill (\\i,0) circle (2pt);}");
  // Drawn again around a point, on the grid, as new shapes each time.
  const first = setShapes({ code }, { x: 5.1, y: 5.1 }, 0.5);
  const again = setShapes({ code }, { x: 5.1, y: 5.1 }, 0.5);
  assert.deepEqual(first.map(shapeCode), ["\\draw[red, thick] (4,4.5) rectangle (6,5.5);", "\\node[above] at (5,5.5) {$L$};", "\\foreach \\i in {1,2} {\\fill (\\i,0) circle (2pt);}"]);
  assert.notEqual(first[0].id, again[0].id);
  assert.equal(shapesFromCode(code).length, 3);
  assert.equal(codeShapes({ shapes: first, options: "" }), 1);
});

test("a new set gets a name of its own", () => {
  assert.equal(freeSetName("Ensemble", []), "Ensemble");
  assert.equal(freeSetName("Ensemble", [{ name: "Ensemble" }, { name: "Ensemble 2" }]), "Ensemble 3");
});

test("a filling without a colour stays a filling", () => {
  const dot = parseStatement("\\fill (1,2) circle (0.06);")!;
  assert.equal(dot.kind === "circle" && dot.style.fill, "black");
  assert.equal(shapeCode(dot), "\\fill[black] (1,2) circle (0.06);");
  assert.equal(shapeCode(parseStatement("\\fill[red!20] (0,0) rectangle (1,1);")!), "\\fill[red!20] (0,0) rectangle (1,1);");
});

test("the board frames what is drawn, in its middle", () => {
  // Far from the origin: the view goes to the shapes, not to (0, 0).
  const far = fitView([rect(20, 10, 26, 13)], 896, 596);
  assert.equal(far.scale, 120);
  assert.deepEqual([far.ox + 23 * far.scale, far.oy - 11.5 * far.scale], [448, 298]);
  // A large drawing is made smaller until it fits, with room around.
  const large = fitView([rect(0, 0, 40, 10), circle(50, 5, 5)], 896, 596);
  assert.equal(large.scale, 800 / 55);
  assert.ok(large.ox >= 48 && large.ox + 55 * large.scale <= 896 - 48 + 1e-9);
  // One point (a text alone) and an empty board still give a usable view.
  const node = parseDrawing("\\begin{tikzpicture}\n\\node at (3,2) {A};\n\\end{tikzpicture}")!.shapes;
  assert.deepEqual(fitView(node, 800, 600), { scale: 120, ox: 400 - 360, oy: 300 + 240 });
  assert.deepEqual(fitView([], 896, 596), { scale: 100, ox: 448 - 400, oy: 298 + 250 });
});
