// Tests of the TikZ whiteboard model: code written from shapes, and read
// back (`npm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { alignment, codeShapes, copies, drawingCode, emptyStyle, fitView, freeSetName, linked, mergeSets, moved, num, parseDrawing, parseStatement, scaled, setCode, setsFile, setsFromFile, setShapes, type Shape, shapeCode, shapesFromCode, smoothCurve, snapPoint, splitOptions, touches, uniqueNames, withoutLooseLinks } from "./model.ts";

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
  // A line between two names is a link; in a picture where these nodes are not drawn, it stays code.
  assert.equal(parseStatement("\\draw (a) -- (b)")?.kind, "link");
  assert.deepEqual(parseDrawing("\\begin{tikzpicture}\n\\coordinate (a) at (0,0);\n\\draw (a) -- (b);\n\\end{tikzpicture}")!.shapes.map((x) => x.kind), ["code", "code"]);
  assert.equal(parseStatement("\\draw (a) -- (1,2)"), null);
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

test("a curve through points is a smooth plot, read back as one", () => {
  const curve = parseStatement("\\draw[thick, ->] plot[smooth] coordinates {(0,0) (1,2) (3,1.5)}")!;
  assert.equal(curve.kind === "path" && curve.smooth && !curve.closed && curve.points.length, 3);
  assert.equal(shapeCode(curve), "\\draw[thick, ->] plot[smooth] coordinates {(0,0) (1,2) (3,1.5)};");
  const closed = parseStatement("\\draw[fill=blue!20] plot[smooth cycle] coordinates {(0,0) (2,0) (1,1.5)}")!;
  assert.equal(closed.kind === "path" && closed.smooth && closed.closed, true);
  assert.equal(shapeCode(closed), "\\draw[fill=blue!20] plot[smooth cycle] coordinates {(0,0) (2,0) (1,1.5)};");
  assert.equal(shapeCode(moved(curve, 1, 1)), "\\draw[thick, ->] plot[smooth] coordinates {(1,1) (2,3) (4,2.5)};");
  // A tension of its own is not what the whiteboard draws: kept as code.
  assert.equal(parseStatement("\\draw plot[smooth, tension=1] coordinates {(0,0) (1,2) (3,1.5)}"), null);
});

test("a smooth curve as TikZ draws it", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 3, y: 1.5 },
  ];
  const open = smoothCurve(points, false);
  assert.equal(open.length, 2);
  // Its ends are left straight; at the middle point it runs parallel to the line between the two others.
  assert.deepEqual(open[0].c1, points[0]);
  assert.deepEqual(open[1].c2, points[2]);
  const t = 0.13875;
  assert.deepEqual(open[0].c2, { x: 1 - t * 3, y: 2 - t * 1.5 });
  assert.deepEqual(open[1].c1, { x: 1 + t * 3, y: 2 + t * 1.5 });
  assert.deepEqual(open.map((c) => c.to), points.slice(1));
  // Closed: one piece per point, back to the first.
  const closed = smoothCurve(points, true);
  assert.equal(closed.length, 3);
  assert.deepEqual(closed[2].to, points[0]);
  assert.deepEqual(closed[0].c1, { x: t * (1 - 3), y: t * (2 - 1.5) });
  assert.deepEqual(smoothCurve([points[0]], false), []);
});

test("what is moved lines up with the other shapes", () => {
  const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });
  // Its left side is 0.08 from the left side of another box: it is taken there.
  const near = alignment(box(1.08, 5, 2.08, 6), [box(1, 0, 3, 1)], 0.15);
  assert.ok(Math.abs(near.dx + 0.08) < 1e-9 && near.dy === 0);
  // Its right side is then on the middle of that box too: two lines.
  assert.deepEqual(near.guides, [
    { axis: "x", at: 1, from: 0, to: 6 },
    { axis: "x", at: 2, from: 0, to: 6 },
  ]);
  // Middles: a box 1 wide whose middle is near that of a box 3 wide.
  const middle = alignment(box(0.95, 3, 1.95, 4), [box(0, 0, 3, 1)], 0.15);
  assert.ok(Math.abs(middle.dx - 0.05) < 1e-9);
  assert.deepEqual(middle.guides.map((g) => [g.axis, g.at]), [["x", 1.5]]);
  // Both ways at once, and nothing when everything is far.
  const both = alignment(box(4.1, 0.05, 5.1, 1.05), [box(0, 0, 3, 1), box(4, 5, 6, 7)], 0.15);
  assert.ok(Math.abs(both.dx + 0.1) < 1e-9 && Math.abs(both.dy + 0.05) < 1e-9);
  assert.deepEqual([...new Set(both.guides.map((g) => g.axis))].sort(), ["x", "y"]);
  assert.ok(both.guides.some((g) => g.axis === "x" && g.at === 4) && both.guides.some((g) => g.axis === "y" && g.at === 0));
  assert.deepEqual(alignment(box(10, 10, 11, 11), [box(0, 0, 3, 1)], 0.15), { dx: 0, dy: 0, guides: [] });
  // The nearest mark wins.
  assert.ok(Math.abs(alignment(box(0.1, 5, 1.04, 6), [box(0, 0, 1, 1)], 0.15).dx + 0.04) < 1e-9);
});

const node = (id: string, x: number, y: number, name: string | null = null): Shape => ({ id, kind: "node", at: { x, y }, text: id, style: emptyStyle(), boxed: true, shape: "", position: "", textColor: null, font: null, name });

test("a link joins two nodes by their names, and follows them", () => {
  const made = linked([node("a", 0, 0), node("b", 3, 1, "fin")], "a", "b", { ...emptyStyle(), arrow: "->" })!;
  // The node without a name gets one; the other keeps its own.
  assert.deepEqual(made.shapes.map((s) => (s.kind === "node" ? s.name : s.kind)), ["n1", "fin", "link"]);
  const code = made.shapes.map(shapeCode);
  assert.deepEqual(code, ["\\node[draw] (n1) at (0,0) {a};", "\\node[draw] (fin) at (3,1) {b};", "\\draw[->] (n1) -- (fin);"]);
  // The node moves: the code of the link does not change, TikZ draws it to the new place.
  assert.equal(shapeCode(moved(made.link, 5, 5)), "\\draw[->] (n1) -- (fin);");
  assert.equal(linked(made.shapes, "a", "a", emptyStyle()), null);
  assert.equal(linked([node("a", 0, 0)], "a", "nothing", emptyStyle()), null);

  // Read back, with a bend and a text on the line.
  const picture = parseDrawing("\\begin{tikzpicture}\n\\node[draw] (a) at (0,0) {A};\n\\node[draw] (b) at (3,0) {B};\n\\draw[->, thick] (a) to[bend left] node[above] {oui} (b);\n\\draw (b) -- (a);\n\\end{tikzpicture}")!;
  const link = picture.shapes[2];
  assert.deepEqual(link.kind === "link" && [link.from, link.to, link.bend, link.label, link.labelPosition, link.style.arrow], ["a", "b", "left", "oui", "above", "->"]);
  assert.equal(shapeCode(link), "\\draw[thick, ->] (a) to[bend left] node[above] {oui} (b);");
  assert.equal(shapeCode(picture.shapes[3]), "\\draw (b) -- (a);");

  // A node is removed: its links go with it.
  assert.deepEqual(withoutLooseLinks(picture.shapes.filter((s) => s.kind !== "node" || s.name !== "b")).map((s) => s.kind), ["node"]);
});

test("copies of linked nodes have names of their own", () => {
  const made = linked([node("a", 0, 0), node("b", 3, 1)], "a", "b", emptyStyle())!;
  const added = uniqueNames(made.shapes, copies(made.shapes, 1, 1));
  assert.deepEqual(added.map(shapeCode), ["\\node[draw] (n3) at (1,1) {a};", "\\node[draw] (n4) at (4,2) {b};", "\\draw (n3) -- (n4);"]);
  // A link copied without one of its nodes is left out; in an empty picture, names are kept.
  assert.deepEqual(uniqueNames(made.shapes, copies(made.shapes.slice(1), 1, 1)).map((s) => s.kind), ["node"]);
  assert.deepEqual(uniqueNames([], copies(made.shapes)).map(shapeCode), made.shapes.map(shapeCode));
  // A set keeps its links.
  const again = setShapes({ code: setCode(made.shapes) }, { x: 0, y: 0 });
  assert.deepEqual(again.map((s) => s.kind), ["node", "node", "link"]);
});

test("sets go to a file and come back", () => {
  const mine = [
    { id: "1", name: "Capteur", code: "\\draw (0,0) rectangle (1,1);" },
    { id: "2", name: "Axes", code: "\\draw[->] (0,0) -- (2,0);" },
  ];
  const text = setsFile(mine);
  assert.deepEqual(setsFromFile(text), [
    { name: "Capteur", code: "\\draw (0,0) rectangle (1,1);" },
    { name: "Axes", code: "\\draw[->] (0,0) -- (2,0);" },
  ]);
  // Not a file of sets.
  assert.equal(setsFromFile("{}"), null);
  assert.equal(setsFromFile("\\draw (0,0) -- (1,1);"), null);
  assert.equal(setsFromFile('{"raytex":"tikz-sets","sets":[{"name":"x"}]}'), null);
  // Added to the sets that are there: the same shapes are not added twice, a taken name gets a number.
  const merged = mergeSets(mine, [
    { name: "Capteur bis", code: "\\draw (0,0) rectangle (1,1);" },
    { name: "Axes", code: "\\draw[->] (0,0) -- (0,2);" },
    { name: "Bloc", code: "\\draw (0,0) circle (1);" },
  ]);
  assert.equal(merged.added, 2);
  assert.deepEqual(merged.sets.map((s) => s.name), ["Capteur", "Axes", "Axes 2", "Bloc"]);
  assert.equal(new Set(merged.sets.map((s) => s.id)).size, 4);
});
