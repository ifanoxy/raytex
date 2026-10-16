import assert from "node:assert/strict";
import { test } from "node:test";
import { answerSwitch, keyLang, pieceSnippet, totalPoints, withAnswers, withPiece } from "./answerkey.ts";

/** As the template "Exam with answer key" is written. */
const EXAM = `\\documentclass[11pt,a4paper,addpoints]{exam}
% Décommentez pour afficher le corrigé :
% \\printanswers

\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\begin{document}
\\begin{questions}
\\question[4] Calculer.
\\begin{solution}
  Fait.
\\end{solution}
\\question Répondre.
\\begin{parts}
  \\part[2] Un.
  \\part[1,5] Deux.
\\end{parts}
\\end{questions}
\\end{document}
`;

/** As the template "Exercise sheet" is written. */
const SHEET = `\\documentclass[11pt,a4paper]{article}
\\usepackage[french]{babel}
\\usepackage{etoolbox}

% Mettre \\toggletrue pour imprimer les corrections
\\newtoggle{corrections}
\\togglefalse{corrections}

\\newcounter{exo}
\\NewDocumentEnvironment{exo}{O{0}}{%
  \\refstepcounter{exo}\\par\\bigskip\\noindent
  \\textbf{Exercice~\\theexo}\\par\\smallskip}{\\par}
\\NewDocumentEnvironment{correction}{+b}{%
  \\iftoggle{corrections}{\\par\\smallskip\\noindent\\textbf{Correction.}~#1\\par}{}}{}

\\begin{document}
\\begin{exo}[1]
  Calculer.
  \\begin{correction}
    Fait.
  \\end{correction}
\\end{exo}
\\end{document}
`;

const PLAIN = `\\documentclass{article}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage{amsmath}

\\begin{document}
Texte.
\\end{document}
`;

test("the class exam: \\printanswers, commented or not, and its option", () => {
  const sw = answerSwitch(EXAM)!;
  assert.equal(sw.kind, "exam");
  assert.equal(sw.shown, false);
  assert.equal(sw.env, "solution");
  // Shown: the line of the template is uncommented; hidden again: as it was.
  const shown = withAnswers(EXAM, true);
  assert.ok(shown.includes("\n\\printanswers\n") && !shown.includes("% \\printanswers"));
  assert.equal(answerSwitch(shown)!.shown, true);
  assert.equal(withAnswers(shown, false), EXAM);
  assert.equal(withAnswers(EXAM, false), EXAM);
  // The option `answers` of the class.
  const option = EXAM.replace("[11pt,a4paper,addpoints]", "[answers,11pt]").replace("% \\printanswers\n", "");
  assert.equal(answerSwitch(option)!.shown, true);
  const hidden = withAnswers(option, false);
  assert.ok(hidden.startsWith("\\documentclass[11pt]{exam}"));
  assert.equal(answerSwitch(hidden)!.shown, false);
  // No line to uncomment: one is written after the class.
  assert.ok(withAnswers(hidden, true).startsWith("\\documentclass[11pt]{exam}\n\\printanswers\n"));
  // \noprintanswers turned.
  const no = EXAM.replace("% \\printanswers", "\\noprintanswers");
  assert.ok(withAnswers(no, true).includes("\n\\printanswers\n"));
});

test("a toggle of etoolbox, with the environment that tests it", () => {
  const sw = answerSwitch(SHEET)!;
  assert.deepEqual(sw, { kind: "toggle", shown: false, name: "corrections", env: "correction", exercise: "exo" });
  const shown = withAnswers(SHEET, true);
  assert.ok(shown.includes("\\toggletrue{corrections}") && !shown.includes("\\togglefalse{corrections}"));
  assert.equal(withAnswers(shown, false), SHEET);
  // Lines to answer on test the same toggle; the corrections are written in their own environment.
  const lines = withPiece(SHEET, "lines", "fr");
  assert.ok(lines.includes("\\newcommand\\lignesreponse[1]{\\iftoggle{corrections}{}{%"));
  assert.equal(withPiece(lines, "lines", "fr"), lines);
  assert.equal(pieceSnippet(SHEET, "solution", "fr"), "\\begin{correction}\n\t${1:${SELECTION}}\n\\end{correction}");
  assert.equal(pieceSnippet(SHEET, "exercise", "fr"), "\\begin{exo}\n\t${1:${SELECTION}}\n\\end{exo}");
  assert.equal(withPiece(SHEET, "solution", "fr"), SHEET);
});

test("xsim: solution/print, set or not", () => {
  const doc = "\\documentclass{article}\n\\usepackage{xsim}\n\\xsimsetup{solution/print=false}\n\\begin{document}\n\\end{document}\n";
  const sw = answerSwitch(doc)!;
  assert.equal(sw.kind, "xsim");
  assert.equal(sw.shown, false);
  assert.ok(withAnswers(doc, true).includes("\\xsimsetup{solution/print=true}"));
  const bare = doc.replace("\\xsimsetup{solution/print=false}\n", "");
  assert.equal(withAnswers(bare, true), "\\documentclass{article}\n\\usepackage{xsim}\n\\xsimsetup{solution/print=true}\n\\begin{document}\n\\end{document}\n");
  assert.equal(pieceSnippet(doc, "lines", "fr"), null);
});

test("a document without a switch gets RayTeX's, then its pieces once", () => {
  assert.equal(answerSwitch(PLAIN), null);
  assert.equal(withAnswers(PLAIN, true), PLAIN);
  const solution = withPiece(PLAIN, "solution", "fr");
  assert.ok(solution.includes("\\usepackage{tcolorbox}"));
  assert.ok(solution.includes("\\newif\\ifcorrige\n\\corrigefalse"));
  assert.ok(solution.includes("\\newtcolorbox{corrige}{breakable,"));
  assert.ok(solution.indexOf("\\newif\\ifcorrige") < solution.indexOf("\\begin{document}"));
  assert.deepEqual(answerSwitch(solution), { kind: "newif", shown: false, name: "corrige", env: "corrige", exercise: null });
  assert.equal(withPiece(solution, "solution", "fr"), solution);
  assert.ok(withAnswers(solution, true).includes("\\corrigetrue"));
  const all = (["exercise", "lines", "space", "grid"] as const).reduce((t, p) => withPiece(t, p, "fr"), solution);
  assert.ok(all.includes("\\NewDocumentEnvironment{exercice}{o}") && all.includes("\\newcommand\\espacereponse[1]{\\ifcorrige\\else") && all.includes("\\usepackage{tikz}"));
  assert.equal(answerSwitch(all)!.exercise, "exercice");
  assert.equal(pieceSnippet(all, "exercise", "fr"), "\\begin{exercice}[${1:4 points}]\n\t${2:${SELECTION}}\n\\end{exercice}");
  assert.equal(pieceSnippet(all, "grid", "fr"), "\\quadrillage{${1:4cm}}");
  // In English: the names of the language of the document.
  const english = withPiece(PLAIN.replace("[french]", "[english]"), "solution", "en");
  assert.ok(english.includes("\\newif\\ifanswers") && english.includes("\\newtcolorbox{solution}"));
  // A switch only in a comment is no switch.
  assert.equal(answerSwitch(PLAIN.replace("\\usepackage{amsmath}", "% \\newif\\ifcorrige")), null);
});

test("the class exam brings its own pieces", () => {
  assert.equal(withPiece(EXAM, "lines", "fr"), EXAM);
  assert.equal(pieceSnippet(EXAM, "lines", "fr"), "\\fillwithdottedlines{${1:3cm}}");
  assert.equal(pieceSnippet(EXAM, "exercise", "fr", true), "\\question[${1:2}] ${2:${SELECTION}}");
  assert.ok(pieceSnippet(EXAM, "exercise", "fr", false)!.startsWith("\\begin{questions}"));
});

test("the points of the exercises are added up", () => {
  assert.equal(totalPoints(EXAM, answerSwitch(EXAM)), 7.5);
  const doc = withPiece(withPiece(PLAIN, "solution", "fr"), "exercise", "fr").replace("Texte.", "\\begin{exercice}[4 points]\nA\n\\end{exercice}\n\\begin{exercice}[2,5 pts]\nB\n\\end{exercice}\n\\begin{exercice}\nC\n\\end{exercice}");
  assert.equal(totalPoints(doc, answerSwitch(doc)), 6.5);
  assert.equal(totalPoints(PLAIN, null), null);
});

test("the language of the names written", () => {
  assert.equal(keyLang(PLAIN, "en"), "fr");
  assert.equal(keyLang(PLAIN.replace("[french]", "[english]"), "fr"), "en");
  assert.equal(keyLang("\\documentclass[french]{article}\n\\usepackage{babel}\n", "en"), "fr");
  assert.equal(keyLang("\\documentclass{article}\n", "fr"), "fr");
});
