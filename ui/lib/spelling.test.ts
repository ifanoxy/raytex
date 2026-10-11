import assert from "node:assert/strict";
import { test } from "node:test";
import { codeRegions, documentLanguage, foreignPassages, languageTag } from "./spelling.ts";

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
