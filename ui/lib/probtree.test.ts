import assert from "node:assert/strict";
import { test } from "node:test";
import { addLevel, branchProbs, complement, contrary, emptyTree, headerFrom, node, parseProb, pathProduct, probLatex, readTree, rows, sameEvents, type Tree, treeCode, wrongSum } from "./probtree.ts";

/** P(A) = 0,3, P_A(B) = 0,4, P_Ā(B) = 0,5: the textbook tree. */
function textbook(): Tree {
  const t = emptyTree();
  const [a, na] = t.root.children;
  a.prob = "0,3";
  a.children[0].prob = "0,4";
  na.children[0].prob = "0,5";
  return t;
}

test("probabilities as typed: decimals, fractions, letters", () => {
  assert.deepEqual(parseProb("0,3"), { num: 3, den: 10, decimal: true });
  assert.deepEqual(parseProb("0.25"), { num: 1, den: 4, decimal: true });
  assert.deepEqual(parseProb("1/3"), { num: 1, den: 3, decimal: false });
  assert.deepEqual(parseProb("\\frac{2}{6}"), { num: 1, den: 3, decimal: false });
  assert.deepEqual(parseProb("1"), { num: 1, den: 1, decimal: true });
  assert.equal(parseProb("p"), null);
  assert.equal(parseProb(""), null);
  assert.equal(complement("0,3", true), "0,7");
  assert.equal(complement("0.25", false), "0.75");
  assert.equal(complement("1/3", true), "2/3");
  assert.equal(complement("p", true), "1-p");
  assert.equal(complement("1-p", true), "p");
  assert.equal(complement("2p", true), "1-2p");
  assert.equal(complement("p+q", true), "1-(p+q)");
  assert.equal(complement("1,5", true), "");
  assert.equal(probLatex("0,3", true), "0{,}3");
  assert.equal(probLatex("0.3", true), "0{,}3");
  assert.equal(probLatex("0,3", false), "0.3");
  assert.equal(probLatex("2/6", true), "\\frac{2}{6}");
  assert.equal(probLatex("1-p", true), "1-p");
});

test("the branch left empty of two is worked out; each node adds up to 1", () => {
  const t = textbook();
  assert.deepEqual(branchProbs(t.root, true), ["0,3", "0,7"]);
  assert.deepEqual(branchProbs(t.root.children[1], true), ["0,5", "0,5"]);
  assert.equal(wrongSum(t.root, true), null);
  const three = node("", "", [node("R", "0,2"), node("V", "0,5"), node("B", "0,2")]);
  assert.equal(wrongSum(three, true), "0,9");
  assert.equal(wrongSum(node("", "", [node("A", "1/3"), node("B", "1/2"), node("C", "1/6")]), true), null);
  assert.equal(wrongSum(node("", "", [node("A", "p"), node("B")]), true), null);
  assert.deepEqual(pathProduct(["0,3", "0,4"]), { num: 3, den: 25, decimal: true });
  assert.deepEqual(pathProduct(["1/3", "0,5"]), { num: 1, den: 6, decimal: false });
  assert.equal(pathProduct(["0,3", "p"]), null);
});

test("the TikZ tree: the first event on top, its probability above the branch", () => {
  const t = textbook();
  t.products = true;
  const code = treeCode(t, true);
  assert.equal(
    code,
    [
      "% Arbre de probabilités (RayTeX)",
      "\\begin{tikzpicture}[grow'=right, level distance=2.8cm, level 1/.style={sibling distance=2.4cm}, level 2/.style={sibling distance=1.2cm}]",
      "  \\node {}",
      "    child { node {$A$}",
      "      child { node[label={right:{$P(A \\cap B) = 0{,}12$}}] {$B$} edge from parent node[above] {$0{,}4$} }",
      "      child { node[label={right:{$P(A \\cap \\overline{B}) = 0{,}18$}}] {$\\overline{B}$} edge from parent node[below] {$0{,}6$} }",
      "      edge from parent node[above] {$0{,}3$} }",
      "    child { node {$\\overline{A}$}",
      "      child { node[label={right:{$P(\\overline{A} \\cap B) = 0{,}35$}}] {$B$} edge from parent node[above] {$0{,}5$} }",
      "      child { node[label={right:{$P(\\overline{A} \\cap \\overline{B}) = 0{,}35$}}] {$\\overline{B}$} edge from parent node[below] {$0{,}5$} }",
      "      edge from parent node[below] {$0{,}7$} };",
      "\\end{tikzpicture}",
    ].join("\n"),
  );
  // Read back: the same tree, the probabilities worked out left empty again.
  const back = readTree(code)!;
  assert.ok(back);
  assert.equal(back.products, true);
  assert.deepEqual(
    rows(back).map((r) => [r.depth, r.node.label, r.node.prob]),
    [
      [0, "A", "0,3"],
      [1, "B", "0,4"],
      [1, "\\overline{B}", ""],
      [0, "\\overline{A}", ""],
      [1, "B", "0,5"],
      [1, "\\overline{B}", ""],
    ],
  );
  assert.equal(treeCode(back, true), code);
  // Fractions in English, an option of one's own kept.
  const f = emptyTree();
  f.root.children[0].prob = "1/3";
  f.extra = ["every node/.style={font=\\small}"];
  const english = treeCode(f, false);
  assert.ok(english.includes("{$\\frac{1}{3}$}") && english.includes("{$2/3$}") === false && english.includes("{$\\frac{2}{3}$}"));
  assert.deepEqual(readTree(english)!.extra, ["every node/.style={font=\\small}"]);
  assert.equal(readTree("\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}"), null);
});

test("editing: a level more, the same events everywhere, the contrary", () => {
  const t = textbook();
  addLevel(t);
  assert.equal(rows(t).length, 14);
  assert.deepEqual(
    rows(t)
      .filter((r) => r.depth === 2)
      .map((r) => r.node.label)
      .slice(0, 2),
    ["C", "\\overline{C}"],
  );
  t.root.children[0].children[0].label = "D";
  sameEvents(t);
  assert.equal(t.root.children[1].children[0].label, "D");
  assert.equal(contrary("A"), "\\overline{A}");
  assert.equal(contrary("\\overline{A}"), "A");
  // Three levels spread so that nothing overlaps.
  assert.ok(treeCode(t, true).includes("level 1/.style={sibling distance=4.8cm}, level 2/.style={sibling distance=2.4cm}, level 3/.style={sibling distance=1.2cm}"));
});

test("a tree written over takes its line above it along (it was written twice)", () => {
  const text = "Texte.\n\t% Arbre de probabilités (RayTeX)\n\t\\begin{tikzpicture}[grow'=right]\n\t\\end{tikzpicture}\n";
  const begin = text.indexOf("\\begin");
  assert.equal(headerFrom(text, begin), text.indexOf("% Arbre"));
  const english = text.replace("Arbre de probabilités", "Probability tree");
  assert.equal(headerFrom(english, english.indexOf("\\begin")), english.indexOf("% Probability"));
  // Without it, or with other text before the picture: where the picture starts.
  const bare = "Texte.\n\\begin{tikzpicture}\n";
  assert.equal(headerFrom(bare, bare.indexOf("\\begin")), bare.indexOf("\\begin"));
  assert.equal(headerFrom("\\begin{tikzpicture}", 0), 0);
  // The comment follows the language of the document, the numbers the way chosen.
  const t = textbook();
  assert.match(treeCode(t, false, true), /^% Arbre de probabilités \(RayTeX\)\n/);
  assert.match(treeCode(t, false, true), /\$0\.3\$/);
});
