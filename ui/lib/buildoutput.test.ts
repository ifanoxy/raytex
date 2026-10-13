// The file a TeX engine is reading, followed in its output.
import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenFiles, shownFile } from "./buildoutput.ts";

test("the file being read is the last source still open", () => {
  const files = new OpenFiles();
  assert.equal(files.current, null);
  files.feed("This is pdfTeX, Version 3.14 (TeX Live 2025) (preloaded format=pdflatex)\n");
  assert.equal(files.current, null);
  files.feed("(./main.tex\nLaTeX2e <2024-11-01>\n(/usr/local/texlive/2025/texmf-dist/tex/latex/base/report.cls\nDocument Class: report\n");
  // A class is not a part of the text: the document is what is being read.
  assert.equal(files.current, "./main.tex");
  files.feed("(/usr/local/texlive/2025/texmf-dist/tex/latex/base/size11.clo))");
  files.feed(" (./build/main.aux) (./chapters/introduction.tex [1] [2{/usr/local/texlive/2025/texmf-var/fonts/map/pdftex/updmap/pdftex.map}]\nChapitre 1.\n");
  assert.equal(files.current, "./chapters/introduction.tex");
  // A message in parentheses opens no file and closes none.
  files.feed("Overfull \\hbox (3.2pt too wide) in paragraph at lines 4--5\n(see the transcript file for additional information)\n");
  assert.equal(files.current, "./chapters/introduction.tex");
  files.feed("[3]) (./chapters/methode.tex [4]");
  assert.equal(files.current, "./chapters/methode.tex");
  files.feed(") [5] (./build/main.bbl [6]");
  assert.equal(files.current, "./build/main.bbl");
  files.feed(")");
  assert.equal(files.current, "./main.tex");
  files.feed(" )");
  assert.equal(files.current, null);
  // More closings than openings (a message that has a parenthesis): nothing breaks.
  files.feed("))) (./suite.tex");
  assert.equal(files.current, "./suite.tex");
  files.reset();
  assert.equal(files.current, null);
});

test("paths of Windows and absolute paths", () => {
  const files = new OpenFiles();
  files.feed("(C:/Users/ada/these/main.tex (C:\\Users\\ada\\these\\chapitres\\un.tex");
  assert.equal(files.current, "C:\\Users\\ada\\these\\chapitres\\un.tex");
  assert.equal(shownFile(files.current!, "C:/Users/ada/these"), "chapitres/un.tex");
  assert.equal(shownFile("./chapters/intro.tex"), "chapters/intro.tex");
  assert.equal(shownFile("/home/ada/these/main.tex", "/home/ada/these/"), "main.tex");
  assert.equal(shownFile("/ailleurs/x.tex", "/home/ada/these"), "/ailleurs/x.tex");
});
