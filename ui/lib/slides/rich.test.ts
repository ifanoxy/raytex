import assert from "node:assert/strict";
import { test } from "node:test";
import { fromNodes, inlineHtml, inlineLatex, type PageNode, parseInline } from "./rich.ts";

const round = (latex: string) => inlineLatex(parseInline(latex));

test("a text of a slide read: styles, colours, links, formulas, what is kept as written", () => {
  assert.deepEqual(parseInline("Un \\textbf{mot \\emph{fort}} et $x^2$, 50\\%"), [
    { t: "text", v: "Un " },
    { t: "b", c: [{ t: "text", v: "mot " }, { t: "emph", c: [{ t: "text", v: "fort" }] }] },
    { t: "text", v: " et " },
    { t: "math", v: "x^2", d: "$" },
    { t: "text", v: ", 50%" },
  ]);
  assert.deepEqual(parseInline("\\textcolor{red!70}{rouge} \\href{https://a.b}{site} \\alert{!}"), [
    { t: "color", color: "red!70", c: [{ t: "text", v: "rouge" }] },
    { t: "text", v: " " },
    { t: "link", url: "https://a.b", c: [{ t: "text", v: "site" }] },
    { t: "text", v: " " },
    { t: "alert", c: [{ t: "text", v: "!" }] },
  ]);
  // Kept as written: a command and its arguments, a group, a comment.
  assert.deepEqual(parseInline("Voir \\cite[p.~3]{knuth} et {\\bf ancien} % note"), [
    { t: "text", v: "Voir " },
    { t: "raw", v: "\\cite[p.~3]{knuth}" },
    { t: "text", v: " et " },
    { t: "raw", v: "{\\bf ancien}" },
    { t: "text", v: " " },
    { t: "raw", v: "% note" },
  ]);
  // Spaces as LaTeX reads them, a line break, a non-breaking space.
  assert.deepEqual(parseInline("  a\n    b \\\\ M.~X  "), [{ t: "text", v: "a b " }, { t: "br" }, { t: "text", v: "M.\u00a0X " }]);
});

test("written again as it was read", () => {
  for (const s of ["Un \\textbf{mot} et $x^2$", "\\textcolor{blue}{a \\textit{b}}", "50\\% \\& 3\\_4 \\#1", "a\\\\b", "M.~X \\cite{k}", "\\(x\\) et \\underline{u}", "\\structure{T} \\href{u}{l}"]) assert.equal(round(round(s)), round(s), s);
  assert.equal(round("Un \\textbf{mot} et $x^2$"), "Un \\textbf{mot} et $x^2$");
  assert.equal(round("a\\\\b"), "a\\\\ b");
  // What is typed is escaped.
  assert.equal(inlineLatex([{ t: "text", v: "50 % & {x} ~ ^ \\ _" }]), "50 \\% \\& \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{} \\_");
  assert.equal(round("\\textbackslash{} \\textasciitilde{}"), "\\textbackslash{} \\textasciitilde{}");
});

test("read back from the elements of the page", () => {
  const text = (v: string): PageNode => ({ nodeType: 3, nodeName: "#text", textContent: v, childNodes: [] });
  const el = (name: string, children: PageNode[], attrs: Record<string, string> = {}): PageNode => ({ nodeType: 1, nodeName: name, textContent: null, childNodes: children, getAttribute: (a) => attrs[a] ?? null });
  const page = [
    text("Un "),
    el("B", [text("mot")]),
    el("STRONG", []),
    text(" "),
    el("SPAN", [text("rouge")], { "data-k": "color", "data-color": "red" }),
    el("SPAN", [text("x²")], { "data-k": "math", "data-latex": "x^2", "data-d": "$" }),
    el("DIV", [text("ligne")]),
    el("SPAN", [text("\\cite{k}")], { "data-k": "raw", "data-latex": "\\cite{k}" }),
  ];
  assert.equal(inlineLatex(fromNodes(page)), "Un \\textbf{mot} \\textcolor{red}{rouge}$x^2$\\\\ ligne\\cite{k}");
  assert.ok(inlineHtml(parseInline("a \\textbf{b} $c$")).startsWith('a <b>b</b> <span class="rt-math" data-k="math" data-latex="c"'));
});
