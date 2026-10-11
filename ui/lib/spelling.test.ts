import assert from "node:assert/strict";
import { test } from "node:test";
import { codeArguments, codeRegions, documentLanguage, foreignPassages, languageTag, serving, wordsIn } from "./spelling.ts";

const doc = (preamble: string, body = "Texte.") => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;

test("a language named as babel names it, or as a tag", () => {
  assert.equal(languageTag("french"), "fr");
  assert.equal(languageTag("ngerman"), "de");
  assert.equal(languageTag("British"), "en-GB");
  assert.equal(languageTag("fr_FR"), "fr-FR");
  assert.equal(languageTag("en-gb"), "en-GB");
  assert.equal(languageTag("pt"), "pt");
  assert.equal(languageTag("klingon"), null);
  assert.equal(languageTag(""), null);
});

test("the language of a document is the one babel or polyglossia is given", () => {
  assert.equal(documentLanguage(doc("\\usepackage[french]{babel}")), "fr");
  // The last language is the main one, unless `main=` says otherwise.
  assert.equal(documentLanguage(doc("\\usepackage[english, ngerman]{babel}")), "de");
  assert.equal(documentLanguage(doc("\\usepackage[main=french, english]{babel}")), "fr");
  assert.equal(documentLanguage(doc("\\usepackage[T1]{fontenc}\n\\usepackage[british]{babel}")), "en-GB");
  // Given to the class, babel takes it from there.
  assert.equal(documentLanguage("\\documentclass[a4paper, spanish]{article}\n\\usepackage{babel}\n\\begin{document}\n\\end{document}"), "es");
  assert.equal(documentLanguage(doc("\\usepackage{polyglossia}\n\\setdefaultlanguage[variant=british]{english}\n\\setotherlanguage{french}")), "en");
  assert.equal(documentLanguage(doc("\\usepackage{polyglossia}\n\\setmainlanguage{italian}")), "it");
  // A commented line does not count; a document that says nothing has no language.
  assert.equal(documentLanguage(doc("% \\usepackage[french]{babel}")), null);
  assert.equal(documentLanguage(doc("\\usepackage{amsmath}")), null);
  assert.equal(documentLanguage(doc("\\usepackage[provide=*]{babel}")), null);
  // A line for the spelling wins over everything.
  assert.equal(documentLanguage(`% !TEX spellcheck = de_AT\n${doc("\\usepackage[french]{babel}")}`), "de-AT");
  assert.equal(documentLanguage(`% !TeX spellcheck = french\n${doc("")}`), "fr");
  // Not in the body.
  assert.equal(documentLanguage(doc("", "\\usepackage[french]{babel}")), null);
});

test("passages in another language are found with their language", () => {
  const text = "Il dit \\foreignlanguage{english}{hello {dear} world} puis\n\\begin{otherlanguage}{ngerman}\nGuten Tag.\n\\end{otherlanguage}\net \\textitalian{ciao} mais \\textit{rien} ni \\textbf{rien}.";
  const found = foreignPassages(text);
  assert.deepEqual(
    found.map((p) => [p.lang, text.slice(p.from, p.to)]),
    [
      ["en", "hello {dear} world"],
      ["de", "\nGuten Tag.\n"],
      ["it", "ciao"],
    ],
  );
  // Commented out, or a language nobody names so: nothing.
  assert.deepEqual(foreignPassages("% \\foreignlanguage{english}{hello}\n\\foreignlanguage{klingon}{nuqneH}"), []);
});

test("the preamble and the pictures are code, a chapter is all text", () => {
  const text = doc("\\usepackage{tikz}\n\\newcommand{\\R}{\\mathbb{R}}", "Avant.\n\\begin{tikzpicture}\n\\draw (0,0) node[above] {x};\n\\end{tikzpicture}\nAprès.\n\\begin{lstlisting}\nint main;\n\\end{lstlisting}");
  const regions = codeRegions(text).map((r) => text.slice(r.from, r.to));
  assert.equal(regions.length, 3);
  assert.ok(regions[0].startsWith("\\documentclass") && regions[0].endsWith("\\mathbb{R}}\n"));
  assert.equal(regions[1], "\\begin{tikzpicture}\n\\draw (0,0) node[above] {x};\n\\end{tikzpicture}");
  assert.equal(regions[2], "\\begin{lstlisting}\nint main;\n\\end{lstlisting}");
  // A chapter (no \\begin{document}): no preamble, its pictures still.
  const chapter = "\\section{Titre}\nDu texte.\n\\begin{tikzpicture}\\end{tikzpicture}\n";
  assert.deepEqual(codeRegions(chapter).map((r) => chapter.slice(r.from, r.to)), ["\\begin{tikzpicture}\\end{tikzpicture}"]);
  assert.deepEqual(codeRegions("Rien que du texte."), []);
  // A picture that is not closed yet: to the end.
  const open = "Texte.\n\\begin{tikzpicture}\n\\draw";
  assert.deepEqual(codeRegions(open).map((r) => open.slice(r.from, r.to)), ["\\begin{tikzpicture}\n\\draw"]);
});

test("a language is served by its dictionary, or by one of the same language", () => {
  assert.equal(serving("fr", ["de", "fr"]), "fr");
  assert.equal(serving("en-GB", ["en-US", "fr"]), "en-US");
  assert.equal(serving("en-GB", ["en-US", "en-GB"]), "en-GB");
  assert.equal(serving("fr-CA", ["fr"]), "fr");
  assert.equal(serving("en", ["en-GB"]), "en-GB");
  assert.equal(serving("de", ["fr", "en-US"]), null);
  assert.equal(serving("de", []), null);
});

test("the words of a stretch of prose that are looked up", () => {
  const text = "L'équation de la chaleur, peut-être «résolue» aujourd’hui: voir LaTeX, le CNRS, H2O, x2 et l'URL; à 3 h.";
  assert.deepEqual(
    wordsIn(text).map((w) => w.text),
    ["L'équation", "de", "la", "chaleur", "peut-être", "résolue", "aujourd’hui", "voir", "le", "et", "l'URL"],
  );
  // Their place in the document.
  const found = wordsIn("un mot", 100);
  assert.deepEqual(found, [
    { from: 100, to: 102, text: "un" },
    { from: 103, to: 106, text: "mot" },
  ]);
  assert.equal("xx un mot".slice(3 + 0, 3 + 2), "un");
  // An accent written as a command cuts a word in two: what follows it is not a word of its own.
  assert.deepEqual(wordsIn("une \\'etude et l'\\oe{}uvre faite").map((w) => w.text), ["une", "et", "faite"]);
  assert.deepEqual(wordsIn("").length, 0);
  // Other alphabets.
  assert.deepEqual(wordsIn("Привет мир, Straße über").map((w) => w.text), ["Привет", "мир", "Straße", "über"]);
});

test("arguments that are code are not prose", () => {
  const marked = (text: string) => codeArguments(text).map((r) => text.slice(r.from, r.to));
  assert.deepEqual(marked("\\textcolor{red}{du texte} et \\foreignlanguage{english}{some words}"), ["{red}", "{english}"]);
  assert.deepEqual(marked("\\includegraphics[width=0.5\\linewidth]{figures/courbe} \\hspace*{1cm} suite"), ["[width=0.5\\linewidth]", "{figures/courbe}", "{1cm}"]);
  // The options of an environment, the columns of a table, the language of a passage.
  assert.deepEqual(marked("\\begin{figure}[htbp] \\begin{tabular}{lcr} \\begin{otherlanguage}{german} \\begin{center}"), ["[htbp]", "{lcr}", "{german}"]);
  assert.deepEqual(marked("\\begin{minipage}[t]{0.5\\textwidth}Texte"), ["[t]", "{0.5\\textwidth}"]);
  // Not the text of a heading, of an item, nor the short title between brackets.
  assert.deepEqual(marked("\\section[Court]{Un long titre} \\item[note] texte \\emph{mot}"), []);
  assert.deepEqual(marked("\\setlength{\\parindent}{0pt} \\definecolor{bleu}{RGB}{0,0,255} \\multicolumn{2}{c}{Titre}"), ["{\\parindent}", "{0pt}", "{bleu}", "{RGB}", "{0,0,255}", "{2}", "{c}"]);
  // Commented out: nothing; a group that is not closed: nothing.
  assert.deepEqual(marked("% \\color{red}\n\\color{red"), []);
});
