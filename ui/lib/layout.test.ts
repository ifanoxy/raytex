// Tests of the margins and of the page styles: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addRange,
  emptyStyle,
  fontCode,
  ensureGeometry,
  fromPt,
  geometryCode,
  headHeightAsked,
  imageWatermark,
  metrics,
  newGeometryCode,
  type PageStyle,
  parseStyle,
  previewSource,
  rangeCode,
  readFont,
  readClass,
  readMargins,
  readStyles,
  readUse,
  readWatermark,
  removeRange,
  removeStyle,
  saveStyle,
  setHeadHeight,
  shownLength,
  splitOptions,
  styleCode,
  stylePackages,
  textWatermark,
  toPt,
  typedLength,
  useOpening,
  useStyle,
  validLength,
  validStyleName,
  watermarkCode,
  writeMargins,
} from "./layout.ts";

const doc = (preamble: string) => `\\documentclass[a4paper]{article}\n${preamble}\\begin{document}\nTexte\n\\end{document}\n`;

// ----------------------------------------------------------------- lengths

test("lengths are read in points and written in a unit", () => {
  assert.equal(toPt("1in"), 72.27);
  assert.equal(Math.round(toPt("2.54cm")! * 100) / 100, 72.27);
  assert.equal(toPt("2,5 cm"), toPt("2.5cm"));
  assert.equal(toPt("0.1\\paperwidth"), null);
  assert.equal(toPt("abc"), null);
  assert.equal(fromPt(72.27, "cm"), "2.54cm");
  assert.equal(fromPt(72.27, "mm"), "25.4mm");
  assert.equal(fromPt(72.27, "in"), "1in");
  assert.equal(fromPt(15, "pt"), "15pt");
});

test("a field shows a number, and what is typed becomes a length", () => {
  assert.equal(shownLength("1in", "cm"), "2.54");
  assert.equal(shownLength("25mm", "cm"), "2.5");
  assert.equal(shownLength("", "cm"), "");
  assert.equal(shownLength("0.1\\paperwidth", "cm"), "0.1\\paperwidth");
  assert.equal(typedLength("2,5", "cm"), "2.5cm");
  assert.equal(typedLength(" 3 ", "mm"), "3mm");
  assert.equal(typedLength("1in", "cm"), "1in");
  assert.equal(typedLength("2.50 cm", "mm"), "2.5cm");
  assert.equal(typedLength("0.1\\paperwidth", "cm"), "0.1\\paperwidth");
  assert.equal(typedLength("", "cm"), "");
  assert.ok(validLength("2.5cm") && validLength("") && validLength("0.1\\paperwidth"));
  assert.ok(!validLength("abc") && !validLength("2.5"));
});

test("options are split at the commas outside braces", () => {
  assert.deepEqual(splitOptions("a4paper, margin={2cm, 3cm},\n  headheight=15pt,"), ["a4paper", "margin={2cm, 3cm}", "headheight=15pt"]);
  assert.deepEqual(splitOptions(""), []);
});

// ------------------------------------------------------------------ margins

test("the class says the paper, the orientation and the sides", () => {
  assert.deepEqual(readClass("\\documentclass[a4paper,12pt,twoside,landscape]{report}"), {
    name: "report",
    options: ["a4paper", "12pt", "twoside", "landscape"],
    paper: "a4paper",
    landscape: true,
    twoside: true,
  });
  assert.equal(readClass("\\documentclass{book}").twoside, true);
  assert.equal(readClass("\\documentclass[oneside]{book}").twoside, false);
  assert.equal(readClass("\\documentclass[paper=a5]{scrartcl}").paper, "a5paper");
  assert.equal(readClass("% \\documentclass[twoside]{book}\n\\documentclass{article}").twoside, false);
});

test("margins are read from the options of geometry and from \\geometry", () => {
  const m = readMargins(doc("\\usepackage[letterpaper,margin=2cm,headheight=15pt]{geometry}\n\\geometry{left=3cm, includehead, showframe}\n% \\geometry{left=9cm}\n"));
  assert.equal(m.paper, "letterpaper");
  assert.deepEqual([m.top, m.bottom, m.left, m.right], ["2cm", "2cm", "3cm", "2cm"]);
  assert.equal(m.headHeight, "15pt");
  assert.equal(m.includeHead, true);
  assert.deepEqual(m.other, ["showframe"]);
});

test("geometry loaded for some pages only leaves the page of the class", () => {
  const text = ensureGeometry(doc("\\usepackage{amsmath}\n"));
  assert.equal(text, doc("\\usepackage{amsmath}\n\\usepackage[pass]{geometry}\n"));
  assert.equal(ensureGeometry(text), text);
  const m = readMargins(text);
  assert.equal(m.pass, true);
  // Nothing set: geometry stays, for the pages that use it.
  assert.equal(writeMargins(text, m), text);
  // Margins for the document: `pass` would undo them.
  assert.equal(writeMargins(text, { ...m, top: "2cm" }), doc("\\usepackage{amsmath}\n\\usepackage{geometry}\n\\geometry{top=2cm}\n"));
});

test("every way of writing a margin is understood", () => {
  const m = readMargins(doc("\\usepackage{geometry}\n\\geometry{\n  hmargin={3cm,2cm},\n  vmargin=25mm,\n  bindingoffset=5mm, head=14pt, foot=1cm, marginpar=3cm,\n  landscape, twoside=true,\n  papersize={15cm,20cm},\n  textwidth=10cm, textwidth=11cm\n}\n"));
  assert.deepEqual([m.left, m.right, m.top, m.bottom], ["3cm", "2cm", "25mm", "25mm"]);
  assert.deepEqual([m.bindingOffset, m.headHeight, m.footSkip, m.marginParWidth], ["5mm", "14pt", "1cm", "3cm"]);
  assert.deepEqual([m.landscape, m.twoside, m.paper, m.paperWidth, m.paperHeight], [true, true, "custom", "15cm", "20cm"]);
  assert.deepEqual(m.other, ["textwidth=11cm"]);
  const inner = readMargins(doc("\\usepackage[inner=3cm,outer=2cm,tmargin=1cm,bmargin=4cm,portrait]{geometry}\n"));
  assert.deepEqual([inner.left, inner.right, inner.top, inner.bottom, inner.landscape], ["3cm", "2cm", "1cm", "4cm", false]);
});

test("the code says what differs from the class, the margins in one word when they are equal", () => {
  const cls = readClass(doc(""));
  const m = readMargins(doc(""));
  assert.equal(geometryCode(m, cls), "");
  Object.assign(m, { top: "2.5cm", bottom: "2.5cm", left: "2.5cm", right: "2.5cm" });
  assert.equal(geometryCode(m, cls), "\\geometry{margin=2.5cm}");
  Object.assign(m, { left: "3cm", twoside: true, landscape: true, paper: "a5paper" });
  assert.equal(geometryCode(m, cls), "\\geometry{a5paper, landscape, twoside, top=2.5cm, bottom=2.5cm, inner=3cm, outer=2.5cm}");
  Object.assign(m, { headHeight: "15pt", includeFoot: true, other: ["showframe"] });
  assert.equal(newGeometryCode(m), "\\newgeometry{top=2.5cm, bottom=2.5cm, inner=3cm, outer=2.5cm, headheight=15pt, includefoot}");
  assert.equal(geometryCode({ ...m, landscape: false, twoside: false, paper: "a4paper", top: "", bottom: "", left: "", right: "" }, cls), "\\geometry{headheight=15pt, includefoot, showframe}");
  assert.ok(geometryCode({ ...m, twoside: false, landscape: true }, readClass("\\documentclass[landscape,twoside]{article}")).includes("  a5paper,\n  twoside=false,\n  top=2.5cm,"));
});

test("a long list of options is written one by line", () => {
  const m = readMargins(doc(""));
  Object.assign(m, { top: "1cm", bottom: "2cm", left: "3cm", right: "4cm", bindingOffset: "5mm", headHeight: "15pt", headSep: "8mm", footSkip: "12mm", marginParWidth: "3cm", marginParSep: "4mm" });
  const code = geometryCode(m, readClass(doc("")));
  assert.ok(code.startsWith("\\geometry{\n  top=1cm,\n  bottom=2cm,\n"));
  assert.ok(code.endsWith("  marginparsep=4mm,\n}"));
  // Read again, it says the same.
  assert.deepEqual(readMargins(doc(`\\usepackage{geometry}\n${code}\n`)), m);
});

test("margins are written in one place, after geometry", () => {
  const m = readMargins(doc(""));
  Object.assign(m, { top: "2cm", bottom: "2cm", left: "2cm", right: "2cm" });
  assert.equal(writeMargins(doc("\\usepackage{amsmath}\n"), m), doc("\\usepackage{amsmath}\n\\usepackage{geometry}\n\\geometry{margin=2cm}\n"));
  // What was said in several places is gathered.
  const before = doc("\\usepackage[margin=1in,showframe]{geometry}\n\\usepackage{amsmath}\n\\geometry{left=3cm}\n\\geometry{top=1cm}\n");
  const read = readMargins(before);
  assert.equal(
    writeMargins(before, { ...read, right: "4cm" }),
    doc("\\usepackage{geometry}\n\\geometry{top=1cm, bottom=1in, left=3cm, right=4cm, showframe}\n\\usepackage{amsmath}\n"),
  );
  // Before hyperref, which stays last.
  assert.equal(writeMargins(doc("\\usepackage{hyperref}\n"), m), doc("\\usepackage{geometry}\n\\geometry{margin=2cm}\n\\usepackage{hyperref}\n"));
});

test("with nothing to say, geometry goes", () => {
  const before = doc("\\usepackage{amsmath}\n\\usepackage[margin=2cm]{geometry}\n\\geometry{top=1cm}\n");
  const m = readMargins(before);
  Object.assign(m, { top: "", bottom: "", left: "", right: "" });
  assert.equal(writeMargins(before, m), doc("\\usepackage{amsmath}\n"));
  // Nothing without a preamble.
  assert.equal(writeMargins("Texte seul", readMargins(before)), "Texte seul");
});

test("the paper of the class is not said again", () => {
  const text = doc("");
  const m = readMargins(text);
  assert.equal(m.paper, "a4paper");
  m.top = "3cm";
  assert.equal(geometryCode(m, readClass(text)), "\\geometry{top=3cm}");
  m.paper = "letterpaper";
  assert.equal(geometryCode(m, readClass(text)), "\\geometry{letterpaper, top=3cm}");
});

test("the height of the header goes to geometry when it is there", () => {
  assert.equal(setHeadHeight(doc("\\usepackage[margin=2cm]{geometry}\n"), "14.5pt"), doc("\\usepackage{geometry}\n\\geometry{margin=2cm, headheight=14.5pt}\n"));
  assert.equal(setHeadHeight(doc("\\usepackage{fancyhdr}\n"), "14.5pt"), doc("\\usepackage{fancyhdr}\n\\setlength{\\headheight}{14.5pt}\n"));
  assert.equal(setHeadHeight(doc("\\usepackage{fancyhdr}\n\\setlength\\headheight{12pt}\n"), "14.5pt"), doc("\\usepackage{fancyhdr}\n\\setlength{\\headheight}{14.5pt}\n"));
});

test("what TeX measures gives the margins of the page", () => {
  // A4, margins of 2.5 cm, header of 15pt at 8 mm of the text.
  const cm = 72.27 / 2.54;
  const m = metrics([21 * cm, 29.7 * cm, 16 * cm, 24.7 * cm, 2.5 * cm - 72.27, 2.5 * cm - 72.27, 2.5 * cm - 72.27 - 15 - 20, 15, 20, 30, 50, 10, 0, 0])!;
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≠ ${b}`);
  close(m.left, 2.5 * cm);
  close(m.right, 2.5 * cm);
  close(m.top, 2.5 * cm);
  close(m.bottom, 2.5 * cm);
  assert.equal(metrics(null), null);
  assert.equal(metrics([1, 2, 3]), null);
});

// -------------------------------------------------------------- page styles

const STYLE = `\\fancypagestyle{rapport}{%
  \\fancyhf{}%
  \\fancyhead[L]{\\nouppercase{\\leftmark}}%
  \\fancyhead[R]{Projet X}%
  \\fancyfoot[C]{\\thepage}%
  \\renewcommand{\\headrulewidth}{0.4pt}%
  \\renewcommand{\\footrulewidth}{0pt}%
}`;

const body = (s: PageStyle) => {
  const code = styleCode(s);
  return code.slice(code.indexOf("{%") + 1, -1);
};

test("a style is written as fancyhdr reads it", () => {
  const s = emptyStyle("rapport");
  s.head.odd.left = "\\nouppercase{\\leftmark}";
  s.head.odd.right = "Projet X";
  assert.equal(styleCode(s), STYLE);
  assert.deepEqual(stylePackages(s), ["fancyhdr"]);
  assert.ok(validStyleName("rapport") && !validStyleName("mon style") && !validStyleName("style2") && !validStyleName(""));
});

test("a style is read back as it was written", () => {
  const s = emptyStyle("rapport");
  s.head.odd = { left: "\\nouppercase{\\leftmark}", center: "\\textbf{Titre}", right: "\\today" };
  s.foot.odd = { left: "A", center: "\\thepage\\ / \\pageref{LastPage}", right: "\\includegraphics[height=1cm]{logo}" };
  s.even = "mirror";
  s.foot.rule = "0.2pt";
  s.watermark = textWatermark("BROUILLON");
  assert.deepEqual(parseStyle("rapport", body(s)), s);
  assert.deepEqual(readStyles(doc(`\\usepackage{fancyhdr}\n${styleCode(s)}\n`)), [s]);
  assert.deepEqual(stylePackages(s), ["fancyhdr", "eso-pic", "graphicx", "xcolor", "lastpage"]);
});

test("every setting of a band is written and read back", () => {
  const s = emptyStyle("complet");
  s.base = "rapport";
  s.even = "own";
  s.head.odd = { left: "Impair", center: "", right: "\\firstrightmark" };
  s.head.even = { left: "\\thepage", center: "Pair", right: "" };
  s.head.init = "\\small\\itshape\\color{gray}";
  s.foot.init = "\\footnotesize";
  s.head.rule = "1pt";
  s.head.ruleColor = "red";
  s.head.ruleSkip = "3pt";
  s.head.floatPagesBare = true;
  s.head.offsetLeft = "1cm";
  s.foot.offsetRight = "5mm";
  s.foot.rule = "0.4pt";
  s.foot.ruleColor = "blue!50";
  s.foot.ruleSkip = "6pt";
  s.marks = { first: "number", second: "title" };
  s.extra = ["\\setlength{\\headsep}{1cm}"];
  const code = styleCode(s);
  assert.equal(
    code,
    `\\fancypagestyle{complet}[rapport]{%
  \\fancyheadinit{\\small\\itshape\\color{gray}}%
  \\fancyfootinit{\\footnotesize}%
  \\fancyhead[LO]{Impair}%
  \\fancyhead[LE]{\\thepage}%
  \\fancyhead[CE]{Pair}%
  \\fancyhead[RO]{\\firstrightmark}%
  \\fancyfoot[CO]{\\thepage}%
  \\fancyheadoffset[L]{1cm}%
  \\fancyfootoffset[R]{5mm}%
  \\renewcommand{\\headrulewidth}{\\iffloatpage{0pt}{1pt}}%
  \\renewcommand{\\footrulewidth}{0.4pt}%
  \\def\\headruleskip{3pt}%
  \\renewcommand{\\headrule}{{\\color{red}\\hrule height\\headrulewidth width\\headwidth\\vskip-\\headrulewidth}}%
  \\def\\footruleskip{6pt}%
  \\renewcommand{\\footrule}{{\\color{blue!50}\\hrule height\\footrulewidth width\\headwidth}}%
  \\renewcommand{\\chaptermark}[1]{\\markboth{\\thechapter.\\ ##1}{}}%
  \\renewcommand{\\sectionmark}[1]{\\markright{##1}}%
  \\setlength{\\headsep}{1cm}%
}`,
  );
  assert.deepEqual(readStyles(doc(`\\usepackage{fancyhdr}\n${code}\n`)), [s]);
  assert.deepEqual(stylePackages(s), ["fancyhdr", "xcolor", "extramarks"]);
  // In a class without chapters, the titles are those of the sections.
  const article = styleCode(s, false);
  assert.ok(article.includes("\\renewcommand{\\sectionmark}[1]{\\markboth{\\thesection.\\ ##1}{}}%\n  \\renewcommand{\\subsectionmark}[1]{\\markright{##1}}%"));
  assert.deepEqual(parseStyle("complet", article.slice(article.indexOf("{%") + 1, -1), "rapport"), s);
});

test("when a style colours a rule, the others say that theirs has none", () => {
  const plain = emptyStyle("simple");
  let text = saveStyle(doc("\\usepackage{amsmath}\n"), plain);
  assert.ok(!text.includes("\\headrule}"));
  const red = emptyStyle("rouge");
  red.head.ruleColor = "red";
  text = saveStyle(text, red);
  assert.ok(text.includes("  \\renewcommand{\\footrulewidth}{0pt}%\n  \\renewcommand{\\headrule}{\\hrule height\\headrulewidth width\\headwidth\\vskip-\\headrulewidth}%\n}\n\n\\fancypagestyle{rouge}"));
  assert.ok(text.includes("\\renewcommand{\\headrule}{{\\color{red}\\hrule height\\headrulewidth width\\headwidth\\vskip-\\headrulewidth}}%"));
  assert.ok(!text.includes("\\footrule}"));
  // Read back, both are what they were; saved again, nothing moves.
  assert.deepEqual(readStyles(text), [plain, red]);
  assert.equal(saveStyle(text, plain), text);
  assert.equal(saveStyle(text, red), text);
  // A new style of the document says it too.
  const third = saveStyle(text, emptyStyle("autre"));
  assert.ok(third.slice(third.indexOf("\\fancypagestyle{autre}")).includes("\\renewcommand{\\headrule}{\\hrule height"));
  // A rule drawn another way is kept as it is written.
  const dotted = parseStyle("points", "\\fancyhf{}\\renewcommand{\\headrule}{\\dotfill}");
  assert.deepEqual(dotted.extra, ["\\renewcommand{\\headrule}{\\dotfill}"]);
});

test("a mirrored band goes into the margins on the same side", () => {
  const s = emptyStyle("livre");
  s.even = "mirror";
  s.head.odd.left = "Titre";
  s.head.offsetLeft = "1cm";
  s.head.offsetRight = "2cm";
  assert.ok(styleCode(s).includes("\\fancyheadoffset[LO,RE]{1cm}%\n  \\fancyheadoffset[RO,LE]{2cm}%"));
  assert.deepEqual(parseStyle("livre", body(s)), s);
});

test("the font of a band is read from its code and written back", () => {
  assert.deepEqual(readFont("\\small\\itshape\\color{gray}"), { size: "\\small", shape: "\\itshape", color: "gray", rest: "" });
  assert.deepEqual(readFont("\\sffamily \\large\\thispagestyle{x}"), { size: "\\large", shape: "\\sffamily", color: "", rest: "\\thispagestyle{x}" });
  assert.deepEqual(readFont("\\smallskip"), { size: "", shape: "", color: "", rest: "\\smallskip" });
  assert.equal(fontCode({ size: "\\small", shape: "\\bfseries", color: "blue!60", rest: "" }), "\\small\\bfseries\\color{blue!60}");
  assert.equal(fontCode(readFont("")), "");
});

test("a watermark is a text or an image, placed on the page", () => {
  const text = { ...textWatermark("CONFIDENTIEL"), angle: 30, size: 5.5, color: "red", strength: 20 };
  assert.equal(watermarkCode(text), "\\AddToShipoutPictureBG*{\\AtPageCenter{\\makebox(0,0){\\rotatebox{30}{\\scalebox{5.5}{\\textcolor{red!20}{CONFIDENTIEL}}}}}}");
  assert.deepEqual(readWatermark(`\\small${watermarkCode(text)}\\itshape`), [text, "\\small\\itshape"]);
  const image = { ...imageWatermark("img/logo.png") };
  assert.equal(watermarkCode(image), "\\AddToShipoutPictureBG*{\\AtPageCenter{\\makebox(0,0){\\rotatebox{0}{\\includegraphics[width=0.6\\paperwidth]{img/logo.png}}}}}");
  assert.deepEqual(readWatermark(watermarkCode(image)), [image, ""]);
  // Elsewhere on the page, over the text, half transparent.
  const placed = { ...image, x: 0.8, y: 0.1, front: true, opacity: 50, angle: 15 };
  assert.equal(
    watermarkCode(placed),
    "\\AddToShipoutPictureFG*{\\AtPageLowerLeft{\\put(\\LenToUnit{0.8\\paperwidth},\\LenToUnit{0.9\\paperheight}){\\makebox(0,0){\\rotatebox{15}{\\ifdefined\\transparent\\transparent{0.5}\\fi \\includegraphics[width=0.6\\paperwidth]{img/logo.png}}}}}}",
  );
  assert.deepEqual(readWatermark(watermarkCode(placed)), [placed, ""]);
  // Over the whole page, as a background.
  const whole = { ...image, fit: true, opacity: 30 };
  assert.equal(watermarkCode(whole), "\\AddToShipoutPictureBG*{\\AtPageLowerLeft{\\ifdefined\\transparent\\transparent{0.3}\\fi \\includegraphics[width=\\paperwidth,height=\\paperheight]{img/logo.png}}}");
  assert.deepEqual(readWatermark(watermarkCode(whole)), [whole, ""]);
  // A text with braces of its own.
  const bold = textWatermark("\\textbf{NE PAS} diffuser");
  assert.deepEqual(readWatermark(watermarkCode(bold)), [bold, ""]);
  // What is written another way is left where it is.
  assert.equal(readWatermark("\\AddToShipoutPictureBG*{\\put(0,0){x}}"), null);
  assert.equal(readWatermark("Titre"), null);
  // A style with a watermark needs what draws it.
  const s = emptyStyle("fond");
  s.watermark = whole;
  assert.deepEqual(stylePackages(s), ["fancyhdr", "eso-pic", "graphicx", "transparent"]);
  assert.deepEqual(parseStyle("fond", body(s)), s);
  // Nothing to draw, nothing written.
  s.watermark = textWatermark("  ");
  assert.ok(!styleCode(s).includes("ShipoutPicture"));
});

test("a watermark written in the centre of the header is still read", () => {
  const s = parseStyle("ancien", `\\fancyhf{}\\fancyhead[C]{${watermarkCode(textWatermark("BROUILLON"))}Titre}`);
  assert.deepEqual(s.watermark, textWatermark("BROUILLON"));
  assert.equal(s.head.odd.center, "Titre");
  assert.ok(styleCode(s).includes("\\fancyheadinit{\\AddToShipoutPictureBG*"));
});

test("a style written by hand is understood", () => {
  const text = doc(`\\usepackage{fancyhdr}
\\fancypagestyle{main}
{
  \\fancyhf{} % tout effacer
  \\lhead{Gauche}
  \\fancyhead[RO,LE]{\\thepage}
  \\fancyhead[RE]{Pair}
  \\cfoot{\\small Pied}
  \\renewcommand\\headrulewidth{1pt}
  \\fancyhfoffset[L]{2em}
  \\setlength{\\headsep}{1cm}
  \\renewcommand{\\chaptermark}[1]{\\markboth{\\MakeUppercase{#1}}{}}
}
`);
  const [s] = readStyles(text);
  assert.equal(s.name, "main");
  assert.equal(s.even, "own");
  assert.deepEqual(s.head.odd, { left: "Gauche", center: "", right: "\\thepage" });
  assert.deepEqual(s.head.even, { left: "\\thepage", center: "", right: "Pair" });
  assert.deepEqual(s.foot.odd, { left: "", center: "\\small Pied", right: "" });
  assert.deepEqual(s.foot.even, s.foot.odd);
  assert.equal(s.head.rule, "1pt");
  assert.equal(s.foot.rule, "0pt");
  assert.deepEqual([s.head.offsetLeft, s.foot.offsetLeft, s.head.offsetRight], ["2em", "2em", ""]);
  // What it cannot hold is kept as it is written.
  assert.deepEqual(s.extra, ["\\setlength{\\headsep}{1cm}", "\\renewcommand{\\chaptermark}[1]{\\markboth{\\MakeUppercase{#1}}{}}"]);
  assert.deepEqual(parseStyle("main", body(s)), s);
});

test("left and right that swap on even pages are a mirror", () => {
  const own = parseStyle("livre", "\\fancyhf{}\\fancyhead[LE,RO]{\\thepage}\\fancyhead[LO]{\\rightmark}\\fancyhead[RE]{\\leftmark}\\fancyfoot[C]{x}");
  assert.equal(own.even, "own");
  const mirrored = parseStyle("livre", "\\fancyhf{}\\fancyhead[LE,RO]{\\thepage}\\fancyhead[LO,RE]{Titre}");
  assert.equal(mirrored.even, "mirror");
  assert.deepEqual(mirrored.head.odd, { left: "Titre", center: "", right: "\\thepage" });
  assert.ok(styleCode(mirrored).includes("\\fancyhead[LO,RE]{Titre}%\n  \\fancyhead[RO,LE]{\\thepage}"));
});

test("a style is saved after the packages, then in its own place", () => {
  const s = emptyStyle("rapport");
  s.head.odd.left = "\\nouppercase{\\leftmark}";
  s.head.odd.right = "Projet X";
  const saved = saveStyle(doc("\\usepackage{amsmath}\n\\usepackage{hyperref}\n"), s);
  assert.equal(saved, doc(`\\usepackage{amsmath}\n\\usepackage{fancyhdr}\n\\usepackage{hyperref}\n\n${STYLE}\n`));
  s.head.odd.right = "Projet Y";
  assert.equal(saveStyle(saved, s), saved.replace("Projet X", "Projet Y"));
  const other = emptyStyle("annexe");
  const two = saveStyle(saved, other);
  assert.deepEqual(readStyles(two).map((x) => x.name), ["rapport", "annexe"]);
  assert.ok(two.indexOf("\\fancypagestyle{annexe}") > two.indexOf("\\fancypagestyle{rapport}"));
  assert.equal(saveStyle("Sans préambule", s), "Sans préambule");
});

test("the style of the document is said after its definition", () => {
  const s = emptyStyle("rapport");
  const text = saveStyle(doc("\\usepackage{amsmath}\n\\pagestyle{plain}\n"), s);
  const used = useStyle(text, "rapport");
  assert.ok(!used.includes("\\pagestyle{plain}"));
  assert.ok(used.indexOf("\\pagestyle{rapport}") > used.indexOf("\\fancypagestyle{rapport}"));
  assert.equal(readUse(used).document, "rapport");
  assert.equal(readUse(useStyle(used, null)).document, null);
  assert.equal(useStyle(doc(""), "fancy"), doc("\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n"));
  assert.equal(useStyle(doc("\\usepackage{amsmath}\n"), "empty"), doc("\\usepackage{amsmath}\n\\pagestyle{empty}\n"));
});

test("the pages that open take a style in place of plain", () => {
  const text = saveStyle(doc("\\usepackage{amsmath}\n"), emptyStyle("rapport"));
  const used = useOpening(text, "rapport");
  assert.ok(used.includes("}\n\\makeatletter\\let\\ps@plain\\ps@rapport\\makeatother\n"));
  assert.equal(readUse(used).opening, "rapport");
  assert.equal(useOpening(used, "rapport"), used);
  assert.equal(useOpening(used, null), text);
});

test("a style is given to pages by their numbers", () => {
  assert.equal(
    rangeCode({ from: 3, to: 5, name: "rapport" }),
    "\\AddToHook{shipout/after}{\\ifnum\\ReadonlyShipoutCounter>1 \\ifnum\\ReadonlyShipoutCounter<5 \\thispagestyle{rapport}\\fi\\fi} % pages 3-5: rapport",
  );
  assert.ok(rangeCode({ from: 1, to: 1, name: "empty" }).includes("\\fi\\fi}\\AtBeginDocument{\\thispagestyle{empty}} % page 1: empty"));
  const text = saveStyle(doc("\\usepackage{amsmath}\n"), emptyStyle("rapport"));
  const one = addRange(text, { from: 3, to: 5, name: "rapport" });
  const two = addRange(one, { from: 1, to: 1, name: "empty" });
  assert.deepEqual(readUse(two).ranges, [
    { from: 1, to: 1, name: "empty" },
    { from: 3, to: 5, name: "rapport" },
  ]);
  assert.equal(removeRange(two, 0), one);
  assert.equal(removeRange(one, 0), text);
  assert.equal(addRange(text, { from: 5, to: 3, name: "rapport" }), text);
  // A line in a comment is not a range.
  assert.deepEqual(readUse(doc(`% ${rangeCode({ from: 2, to: 2, name: "x" })}\n`)).ranges, []);
});

test("a style goes with what used it", () => {
  const base = doc("\\usepackage{amsmath}\n\\usepackage{fancyhdr}\n");
  let text = saveStyle(base, emptyStyle("rapport"));
  text = saveStyle(text, emptyStyle("annexe"));
  const kept = text;
  text = useOpening(useStyle(addRange(text, { from: 2, to: 4, name: "annexe" }), "annexe"), "annexe");
  assert.deepEqual(readUse(text), { document: "annexe", opening: "annexe", ranges: [{ from: 2, to: 4, name: "annexe" }] });
  const removed = removeStyle(text, "annexe");
  assert.deepEqual(readStyles(removed).map((s) => s.name), ["rapport"]);
  assert.deepEqual(readUse(removed), { document: null, opening: null, ranges: [] });
  assert.equal(removed, saveStyle(base, emptyStyle("rapport")));
  assert.equal(removeStyle(kept, "absent"), kept);
});

// ----------------------------------------------------------------- previews

test("a preview is the preamble with another body", () => {
  const source = previewSource(doc("\\usepackage{geometry}\n"), "Essai", "\\usepackage{showframe}\n");
  assert.ok(source.startsWith("\\documentclass[a4paper]{article}\n\\usepackage{geometry}\n\\usepackage{showframe}\n\\begin{document}\n\\typeout{RTXMEASURE:\\the\\paperwidth:"));
  assert.ok(source.endsWith("\nEssai\n\\end{document}\n"));
  assert.ok(!source.includes("Texte"));
});

test("fancyhdr says the height its header needs", () => {
  assert.equal(headHeightAsked("\\headheight is too small (12.0pt): \n(fancyhdr)                Make it at least 14.49998pt, for example:"), "14.5pt");
  assert.equal(headHeightAsked("\\headheight is too small (12.0pt): Make it at least 27.1pt."), "27.1pt");
  assert.equal(headHeightAsked("Overfull \\hbox"), null);
});
