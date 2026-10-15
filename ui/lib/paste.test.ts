// What a paste becomes: samples of what Word, Google Docs, a web page and a
// spreadsheet put on the clipboard.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkup } from "./markup.ts";
import { formulasIn, mathmlToLatex, ommlToLatex } from "./mathconv.ts";
import { smartPaste } from "./paste.ts";

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml">
<head><meta charset=utf-8><style><!-- p.MsoNormal {margin:0cm;} --></style></head>
<body lang=FR style='tab-interval:35.4pt'>
<!--StartFragment-->
<p class=MsoNormal>Texte <b>gras</b> et <i>italique</i> pour 50&nbsp;% des cas_A.<o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Premier<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:72.0pt;mso-add-space:auto;text-indent:-18.0pt;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>o<span>&nbsp; </span></span><![endif]>Sous-point<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>·</span><![endif]>Second<o:p></o:p></p>
<p class=MsoNormal>Soit <!--[if gte msEquation 12]><m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f><m:r><m:t>+</m:t></m:r><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath><![endif]--><![if !msEquation]><img width=40 height=20 src="file:///C:/Temp/image001.png"><![endif]> ici.<o:p></o:p></p>
<!--EndFragment-->
</body></html>`;

test("Word: formatting, a list with a sub-item, an equation, special characters", () => {
  const r = smartPaste(WORD, "Texte gras et italique…");
  assert.equal(r?.kind, "latex");
  if (r?.kind !== "latex") return;
  const lines = r.latex.split("\n");
  assert.equal(lines[0], "Texte \\textbf{gras} et \\emph{italique} pour 50~\\% des cas\\_A.");
  assert.ok(r.latex.includes("\\begin{itemize}\n\t\\item Premier\n\t\\begin{itemize}\n\t\t\\item Sous-point\n\t\\end{itemize}\n\t\\item Second\n\\end{itemize}"), r.latex);
  assert.ok(r.latex.includes("Soit $\\frac{a}{b}+x^2$ ici."), r.latex);
  assert.ok(!r.latex.includes("image001") && !r.latex.includes("·"), r.latex);
});

test("Word: a numbered list", () => {
  const html = `<!--StartFragment--><p class=MsoListParagraphCxSpFirst style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span><![endif]>Un</p><p class=MsoListParagraphCxSpLast style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.</span><![endif]>Deux</p><!--EndFragment-->`;
  const r = smartPaste(html, "1. Un\n2. Deux");
  assert.equal(r?.kind === "latex" && r.latex, "\\begin{enumerate}\n\t\\item Un\n\t\\item Deux\n\\end{enumerate}");
});

test("Google Docs: its wrapper in bold that is not bold, headings, lists, a link", () => {
  const html = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1 dir="ltr"><span style="font-size:20pt;font-weight:400">Introduction</span></h1><p dir="ltr"><span style="font-weight:700;">Gras</span><span style="font-weight:400;"> et </span><span style="font-style:italic;font-weight:400;">italique</span><span style="font-weight:400;">, voir </span><a href="https://example.org/a_b#c" style="text-decoration:none;"><span style="text-decoration:underline;font-weight:400;">le site</span></a></p><ul><li dir="ltr"><p dir="ltr"><span>Un</span></p></li><li dir="ltr"><p dir="ltr"><span>Deux</span></p></li></ul></b>`;
  const r = smartPaste(html, "Introduction\nGras et italique");
  assert.equal(r?.kind, "latex");
  if (r?.kind !== "latex") return;
  assert.equal(
    r.latex,
    "\\section{Introduction}\n\n\\textbf{Gras} et \\emph{italique}, voir \\href{https://example.org/a_b\\#c}{\\underline{le site}}\n\n\\begin{itemize}\n\t\\item Un\n\t\\item Deux\n\\end{itemize}",
  );
  assert.deepEqual(r.packages, ["hyperref"]);
});

test("a web page: nested formatting and a line break", () => {
  const r = smartPaste("<p><b>Gras <i>et italique</i> encore</b><br>Ligne<sup>2</sup></p>", "Gras et italique encore\nLigne2");
  assert.equal(r?.kind === "latex" && r.latex, "\\textbf{Gras \\emph{et italique} encore}\\\\\nLigne\\textsuperscript{2}");
});

test("pasted as it is: plain text, LaTeX code, code from an editor", () => {
  assert.equal(smartPaste("<p>Bonjour tout le monde</p>", "Bonjour tout le monde"), null);
  assert.equal(smartPaste("<pre><code><b>\\begin</b>{equation}x\\end{equation}</code></pre>", "\\begin{equation}x\\end{equation}"), null);
  assert.equal(smartPaste(`<div style="font-family: Menlo, monospace;"><div><span style="color:#c586c0;font-weight:bold;">fn</span> main() {}</div></div>`, "fn main() {}"), null);
  assert.equal(smartPaste("", "simple texte"), null);
});

test("a spreadsheet becomes a table, as does a table of a page", () => {
  const r = smartPaste("<table><tr><td>Nom</td><td>Note</td></tr></table>", "Nom\tNote\nAlice\t12,5\nBob\t15 %\n");
  assert.deepEqual(r, { kind: "table", cells: [["Nom", "Note"], ["Alice", "12,5"], ["Bob", "15 \\%"]] });
  const page = smartPaste("<table><tr><th>A</th><th><b>B</b></th></tr><tr><td>1</td><td colspan=2>2</td></tr></table>", "A B\n1 2");
  assert.deepEqual(page, { kind: "table", cells: [["A", "\\textbf{B}", ""], ["1", "2", ""]] });
});

test("a formula alone: the TeX it carries, or its MathML read", () => {
  const wiki = `<span class="mwe-math-element"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">{\\displaystyle E=mc^{2}}</annotation></semantics></math></span>`;
  assert.deepEqual(smartPaste(wiki, "E=mc2"), { kind: "math", latex: "E=mc^{2}", display: true });
  const quadratic = `<math><mi>x</mi><mo>=</mo><mfrac><mrow><mo>−</mo><mi>b</mi><mo>±</mo><msqrt><msup><mi>b</mi><mn>2</mn></msup><mo>−</mo><mn>4</mn><mi>a</mi><mi>c</mi></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></math>`;
  assert.deepEqual(smartPaste(quadratic, "x = …"), { kind: "math", latex: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", display: false });
  // MathML given as text (Word's option to copy MathML).
  assert.equal(smartPaste("", `<mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mi>α</mml:mi><mml:mo>≤</mml:mo><mml:mn>1</mml:mn></mml:math>`)?.kind, "math");
});

test("MathML: functions, sums, accents, matrices, sets", () => {
  const m = (xml: string) => mathmlToLatex(formulasIn(parseMarkup(xml))[0]).latex;
  assert.equal(m("<math><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mi>i</mi></msub></math>"), "\\sum_{i=1}^n x_i");
  assert.equal(m("<math><mi>sin</mi><mo>⁡</mo><mi>θ</mi><mo>∈</mo><mi mathvariant='double-struck'>R</mi></math>"), "\\sin\\theta\\in\\mathbb{R}");
  assert.equal(m("<math><mover><mi>u</mi><mo>→</mo></mover><mo>·</mo><mover accent='true'><mi>v</mi><mo>^</mo></mover></math>"), "\\vec{u}\\cdot\\hat{v}");
  assert.equal(m("<math><mrow><mo>(</mo><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>0</mn></mtd></mtr><mtr><mtd><mn>0</mn></mtd><mtd><mn>1</mn></mtd></mtr></mtable><mo>)</mo></mrow></math>"), "(\\begin{matrix}\n1 & 0 \\\\\n0 & 1\n\\end{matrix})");
  assert.equal(m("<math><mroot><mi>x</mi><mn>3</mn></mroot><mo>≠</mo><mfrac linethickness='0'><mi>n</mi><mi>k</mi></mfrac></math>"), "\\sqrt[3]{x}\\neq\\binom{n}{k}");
});

test("Word's equations: sums, roots, brackets, matrices, accents, functions", () => {
  const o = (xml: string) => ommlToLatex(formulasIn(parseMarkup(xml))[0]).latex;
  const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
  assert.equal(o(`<m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r("i=1")}</m:sub><m:sup>${r("n")}</m:sup><m:e>${r("i")}</m:e></m:nary></m:oMath>`), "\\sum_{i=1}^n i");
  assert.equal(o(`<m:oMath><m:nary><m:naryPr><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/><m:e>${r("f")}</m:e></m:nary></m:oMath>`), "\\int f");
  assert.equal(o(`<m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${r("x")}</m:e></m:rad></m:oMath>`), "\\sqrt{x}");
  assert.equal(o(`<m:oMath><m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>${r("a")}</m:e><m:e>${r("b")}</m:e></m:d></m:oMath>`), "\\left[ a | b \\right]");
  assert.equal(o(`<m:oMath><m:m><m:mr><m:e>${r("1")}</m:e><m:e>${r("2")}</m:e></m:mr><m:mr><m:e>${r("3")}</m:e><m:e>${r("4")}</m:e></m:mr></m:m></m:oMath>`), "\\begin{matrix}\n1 & 2 \\\\\n3 & 4\n\\end{matrix}");
  assert.equal(o(`<m:oMath><m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${r("v")}</m:e></m:acc><m:func><m:fName><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>cos</m:t></m:r></m:fName><m:e>${r("𝑥")}</m:e></m:func></m:oMath>`), "\\vec{v}\\cos x");
  assert.equal(ommlToLatex(formulasIn(parseMarkup(`<m:oMathPara><m:oMath>${r("y=1")}</m:oMath></m:oMathPara>`))[0]).display, true);
});

test("a formula pasted into a formula is not wrapped, text into a formula is left alone", () => {
  assert.equal(smartPaste("<p><b>gras</b></p>", "gras", true), null);
  assert.equal(smartPaste("<math><mi>x</mi></math>", "x", true)?.kind, "math");
});
