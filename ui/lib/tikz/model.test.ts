// Tests of the TikZ whiteboard model: code written from shapes, and read
// back (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { codeShapes, drawingCode, emptyStyle, moved, num, parseDrawing, parseStatement, shapeCode, snapPoint, splitOptions } from "./model.ts";

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
