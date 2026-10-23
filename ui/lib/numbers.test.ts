import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyGraph, graphCode, newCurve, readGraph } from "./graph.ts";
import { chosenConvention, conventionOf, decimals, formulas, isNothing, rewrite, withChoice } from "./numbers.ts";
import { emptyTree, readTree, treeCode } from "./probtree.ts";

const FRENCH = "\\documentclass{article}\n\\usepackage[french]{babel}\n\\begin{document}\nTexte.\n\\end{document}\n";
const ENGLISH = FRENCH.replace("[french]", "[english]");

test("the way of a document: its line, else its language", () => {
  assert.equal(conventionOf(FRENCH), "french");
  assert.equal(conventionOf(ENGLISH), "english");
  assert.equal(conventionOf("\\documentclass[french]{article}\n\\usepackage{babel}\n\\begin{document}\n\\end{document}"), "french");
  // The main language is the last one (or main=): English here.
  assert.equal(conventionOf(FRENCH.replace("[french]", "[french,english]")), "english");
  assert.equal(conventionOf(FRENCH.replace("[french]", "[main=english,french]")), "english");
  assert.equal(conventionOf("\\documentclass{article}\n\\begin{document}\n\\end{document}"), "english");
  const chosen = withChoice(FRENCH, "english");
  assert.equal(chosenConvention(chosen), "english");
  assert.equal(conventionOf(chosen), "english");
  assert.ok(chosen.startsWith("% !RayTeX numbers = english\n\\documentclass"));
  // Chosen again, then left to the language: one line, then none.
  assert.equal(withChoice(chosen, "french").match(/RayTeX numbers/g)?.length, 1);
  assert.equal(withChoice(chosen, null), FRENCH);
  // A line in the text of the document is not the document's.
  assert.equal(chosenConvention(`${FRENCH.replace("Texte.", "% !RayTeX numbers = english")}`), null);
});

test("the decimal marks of a formula, not its lengths nor its lists", () => {
  assert.equal(decimals("x = 0.5 + 12.25", "french"), "x = 0{,}5 + 12{,}25");
  assert.equal(decimals("x = 0{,}5 + 12{,}25", "english"), "x = 0.5 + 12.25");
  assert.equal(decimals("\\hspace{0.5em} 0.5\\textwidth \\scalebox{0.8}{1.5}", "french"), "\\hspace{0.5em} 0.5\\textwidth \\scalebox{0.8}{1{,}5}");
  assert.equal(decimals("\\rule{0.4pt}{1.2ex} 2.5 cm", "french"), "\\rule{0.4pt}{1.2ex} 2.5 cm");
  // A bare comma is a list: never read as a decimal mark.
  assert.equal(decimals("f(1,2)", "english"), "f(1,2)");
  assert.equal(decimals("f(1,2)", "french"), "f(1,2)");
});

test("the formulas of a text", () => {
  const text = "Soit $x = 0.5$, \\(y\\), \\[z\\] et le prix \\$3.50.\n\\begin{align*}a\\end{align*}\n% $commenté$";
  assert.deepEqual(
    formulas(text).map((f) => text.slice(f.from, f.to)),
    ["x = 0.5", "y", "z", "a"],
  );
});

test("a plot written the other way: its number format, as the graph studio writes it", () => {
  const g = emptyGraph();
  g.curves.push(newCurve(g, "0.5*x^2"));
  const french = graphCode(g, true);
  assert.match(french, /use comma/);
  // A thousand is 1 000 in French, not 1.000 (`use comma` alone puts a point there).
  assert.match(french, /1000 sep=\{\\,\}/);
  const doc = (picture: string) => FRENCH.replace("Texte.", picture);
  const english = rewrite(doc(french), "english");
  assert.equal(english.done.plots, 1);
  assert.doesNotMatch(english.text, /number format/);
  // The expression of the curve keeps its point, as pgfplots reads it.
  assert.match(english.text, /0\.5\*x\^2/);
  assert.equal(english.text, doc(graphCode(g, false)));
  const back = rewrite(english.text, "french");
  assert.equal(back.text, doc(french));
  // The graph studio reads it back either way.
  assert.ok(readGraph(english.text.slice(english.text.indexOf("\\begin{tikzpicture}"))));
  // Already written that way: nothing to do.
  assert.ok(isNothing(rewrite(doc(french), "french").done));
  // A plot written by hand, without options, gets them.
  const hand = doc("\\begin{tikzpicture}\n\\begin{axis}\n\\addplot {x};\n\\end{axis}\n\\end{tikzpicture}");
  assert.match(rewrite(hand, "french").text, /\\begin\{axis\}\[\/pgf\/number format\/use comma, \/pgf\/number format\/1000 sep=\{\\,\}\]/);
  assert.ok(isNothing(rewrite(hand, "english").done));
});

test("a tree, a table of variations and a drawing written the other way", () => {
  const tree = emptyTree();
  tree.root.children[0].prob = "0.3";
  const doc = FRENCH.replace("Texte.", `${treeCode(tree, false)}\n\n\\begin{tikzpicture}\n\\tkzTabInit{$x$ / 1, $f(x)$ / 2}{$-\\infty$, $1.5$, $+\\infty$}\n\\tkzTabVar{-/ $0$, +/ $2.25$, -/ $0$}\n\\end{tikzpicture}\n\n\\begin{tikzpicture}\n\\draw (0,0) -- (2.5,1.5) node[above] {$AB = 2.5$};\n\\end{tikzpicture}`);
  const r = rewrite(doc, "french");
  assert.deepEqual([r.done.trees, r.done.tables, r.done.drawings], [1, 1, 1]);
  assert.match(r.text, /\{\$0\{,\}3\$\}/);
  assert.match(r.text, /\$1\{,\}5\$, \$\+\\infty\$/);
  assert.match(r.text, /\$2\{,\}25\$/);
  // Coordinates stay as TikZ reads them; what the reader sees changes.
  assert.match(r.text, /\(2\.5,1\.5\) node\[above\] \{\$AB = 2\{,\}5\$\}/);
  // The tree studio reads its probability back.
  const picture = r.text.slice(r.text.indexOf("\\begin{tikzpicture}"));
  assert.equal(readTree(picture)?.root.children[0].prob, "0,3");
  assert.equal(rewrite(r.text, "english").text, doc);
});

test("the formulas of the text only when asked, never those of the preamble or of a listing", () => {
  const doc = "\\documentclass{article}\n\\newcommand{\\half}{$0.5$}\n\\begin{document}\nUn demi : $0.5$.\n\\begin{lstlisting}\necho $3.5$\n\\end{lstlisting}\n\\end{document}\n";
  assert.ok(isNothing(rewrite(doc, "french").done));
  const r = rewrite(doc, "french", { text: true });
  assert.equal(r.done.formulas, 1);
  assert.match(r.text, /Un demi : \$0\{,\}5\$\./);
  assert.match(r.text, /\\half\}\{\$0\.5\$\}/);
  assert.match(r.text, /echo \$3\.5\$/);
  // A chapter (no preamble): all of it is text.
  const chapter = "Le seuil vaut $2.5$.\n";
  assert.equal(rewrite(chapter, "french", { text: true }).text, "Le seuil vaut $2{,}5$.\n");
});

test("siunitx and pgfplots set in the preamble", () => {
  const si = (opts: string) => `\\documentclass{article}\n\\usepackage[french]{babel}\n\\usepackage${opts}{siunitx}\n\\begin{document}\n\\end{document}\n`;
  // The French way: its locale, after the package.
  assert.match(rewrite(si(""), "french").text, /\\usepackage\{siunitx\}\n\\sisetup\{locale = FR\}/);
  // Where it is set: there, and a decimal mark set by hand goes.
  const set = si("").replace("\\begin{document}", "\\sisetup{locale = FR, output-decimal-marker = {,}, per-mode = symbol}\n\\begin{document}");
  const english = rewrite(set, "english");
  assert.ok(english.done.siunitx);
  assert.match(english.text, /\\sisetup\{locale = US, per-mode = symbol\}/);
  assert.match(rewrite(si("[locale=FR]"), "english").text, /\\usepackage\[locale=US\]\{siunitx\}\n\\begin/);
  // The English way without any locale set: siunitx is English already.
  assert.ok(!rewrite(si(""), "english").done.siunitx);
  // pgfplots: a number format set for every plot is written again (none is added).
  const plots = "\\documentclass{article}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18, /pgf/number format/use comma}\n\\begin{document}\n\\end{document}\n";
  assert.match(rewrite(plots, "english").text, /\\pgfplotsset\{compat=1\.18\}/);
  assert.ok(isNothing(rewrite(plots.replace(", /pgf/number format/use comma", ""), "french").done));
});
