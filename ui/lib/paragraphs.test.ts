import assert from "node:assert/strict";
import { test } from "node:test";
import { fixIssues, paragraphIssues, readParagraphs, writeParagraphs } from "./paragraphs.ts";

const doc = (preamble: string, body = "Texte.\n") => `\\documentclass{article}\n\\usepackage[T1]{fontenc}\n${preamble}\n\\begin{document}\n${body}\\end{document}\n`;
const FR = "\\usepackage[french]{babel}";
const EN = "\\usepackage[english]{babel}";

test("how the paragraphs start, as the preamble says", () => {
  assert.deepEqual(readParagraphs(doc(EN)), { style: "indent", indent: "", skip: "", first: false, french: false });
  assert.deepEqual(readParagraphs(doc(FR)), { style: "indent", indent: "", skip: "", first: true, french: true });
  assert.equal(readParagraphs(doc(`${FR}\n\\frenchsetup{IndentFirst=false}`)).first, false);
  assert.equal(readParagraphs(doc(`${FR}\n\\frenchsetup{StandardLayout=true}`)).first, false);
  assert.equal(readParagraphs(doc(`${FR}\n\\frenchsetup{StandardLayout=true, IndentFirst=true}`)).first, true);
  assert.equal(readParagraphs(doc(`${EN}\n\\usepackage{indentfirst}`)).first, true);
  assert.deepEqual(readParagraphs(doc(`${EN}\n\\usepackage[skip=6pt]{parskip}`)), { style: "skip", indent: "", skip: "6pt", first: false, french: false });
  assert.equal(readParagraphs(doc(`${EN}\n\\usepackage[skip=6pt, indent]{parskip}`)).style, "both");
  assert.equal(readParagraphs(doc(`${EN}\n\\usepackage[indent=1em]{parskip}`)).indent, "1em");
  // By hand: \setlength, or \parindent=0pt.
  assert.deepEqual(readParagraphs(doc(`${EN}\n\\setlength{\\parindent}{0pt}\n\\setlength{\\parskip}{1ex}`)), { style: "skip", indent: "", skip: "1ex", first: false, french: false });
  assert.equal(readParagraphs(doc(`${EN}\n\\setlength\\parindent{2em}`)).indent, "2em");
  // A comment is not a setting.
  assert.equal(readParagraphs(doc(`${EN}\n% \\usepackage{parskip}`)).style, "indent");
});

test("written back: what set them before is taken out", () => {
  const hand = doc(`${EN}\n\\setlength{\\parindent}{0pt}\n\\setlength{\\parskip}{1ex}`);
  const skip = writeParagraphs(hand, { style: "skip", indent: "", skip: "6pt", first: false, french: false });
  assert.ok(skip.includes("\\usepackage[skip=6pt]{parskip}") && !skip.includes("\\setlength"));
  assert.deepEqual(readParagraphs(skip), { style: "skip", indent: "", skip: "6pt", first: false, french: false });
  const both = writeParagraphs(skip, { style: "both", indent: "", skip: "", first: false, french: false });
  assert.ok(both.includes("\\usepackage[indent]{parskip}"));
  const back = writeParagraphs(both, { style: "indent", indent: "1.5em", skip: "", first: false, french: false });
  assert.ok(!back.includes("parskip") && back.includes("\\setlength{\\parindent}{1.5em}\n\n\\begin{document}"));
  assert.equal(readParagraphs(back).indent, "1.5em");
  // Nothing changed: the text as it was.
  assert.equal(writeParagraphs(hand, readParagraphs(hand)), hand);
  // A package in a list keeps the others.
  const listed = doc(`${EN}\n\\usepackage{amsmath,parskip}`);
  assert.ok(writeParagraphs(listed, { ...readParagraphs(listed), style: "indent" }).includes("\\usepackage{amsmath}\n"));
});

test("the first paragraph after a heading, in French and in English", () => {
  const fr = doc(FR);
  const off = writeParagraphs(fr, { ...readParagraphs(fr), first: false });
  assert.ok(off.includes("\\frenchsetup{IndentFirst=false}"));
  assert.equal(readParagraphs(off).first, false);
  assert.equal(writeParagraphs(off, { ...readParagraphs(off), first: true }).match(/IndentFirst=true/g)?.length, 1);
  // The key goes last in a list that has StandardLayout, where it wins.
  const std = doc(`${FR}\n\\frenchsetup{StandardLayout=true, IndentFirst=false}`);
  assert.ok(writeParagraphs(std, { ...readParagraphs(std), first: true }).includes("\\frenchsetup{StandardLayout=true, IndentFirst=true}"));
  const en = doc(EN);
  const on = writeParagraphs(en, { ...readParagraphs(en), first: true });
  assert.ok(on.includes("\\usepackage{indentfirst}"));
  assert.ok(!writeParagraphs(on, { ...readParagraphs(on), first: false }).includes("indentfirst"));
});

test("what the text does by hand: \\noindent, blank lines after formulas, \\\\ ending a paragraph", () => {
  const body = [
    "\\section{Début}\\label{sec:a}",
    "\\noindent Premier paragraphe.",
    "",
    "\\noindent Un autre.",
    "\\begin{equation}",
    "  E = mc^2",
    "\\end{equation}",
    "",
    "où $E$ est l'énergie.",
    "\\[ x \\]",
    "",
    "Une phrase neuve.",
    "Une ligne finie à la main.\\\\",
    "",
    "\\begin{tabular}{c}",
    "a \\\\",
    "",
    "\\end{tabular}",
    "",
  ].join("\n");
  const text = doc(EN, body);
  const issues = paragraphIssues(text, readParagraphs(text));
  assert.deepEqual(
    issues.map((i) => [i.kind, i.useless]),
    [
      ["noindent", true],
      ["noindent", false],
      ["blank-after-math", true],
      ["break-paragraph", true],
    ],
  );
  assert.equal(issues[2].line, text.split("\n").indexOf("\\end{equation}") + 2);
  const fixed = fixIssues(text, issues.filter((i) => i.useless));
  assert.ok(fixed.includes("\\section{Début}\\label{sec:a}\nPremier paragraphe.") && fixed.includes("\\noindent Un autre."));
  assert.ok(fixed.includes("\\end{equation}\noù $E$"));
  assert.ok(fixed.includes("Une ligne finie à la main.\n\n"));
  assert.ok(fixed.includes("a \\\\\n"));
  // In French, the first paragraph is set in: that \noindent does something.
  const fr = doc(FR, body);
  assert.equal(paragraphIssues(fr, readParagraphs(fr))[0].useless, false);
  // A space between paragraphs and no indent: every \noindent does nothing.
  const skip = doc(`${EN}\n\\usepackage{parskip}`, body);
  assert.ok(paragraphIssues(skip, readParagraphs(skip)).filter((i) => i.kind === "noindent").every((i) => i.useless));
  // A file brought in (no preamble) is read from its start.
  assert.equal(paragraphIssues("\\noindent Texte.\n", readParagraphs(doc(EN))).length, 1);
});
