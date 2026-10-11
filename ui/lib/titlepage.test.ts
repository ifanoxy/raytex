import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyTitlePage, isBeamer, plainText, readTitlePage, texText, type TitlePage, titleBlock, titleCode, titlePackages, titlePreview, TODAY, writeTitlePage } from "./titlepage.ts";

const DOC = `\\documentclass[12pt]{report}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath}

\\begin{document}

\\chapter{Introduction}
Texte.
\\end{document}
`;

const page = (over: Partial<TitlePage> = {}): TitlePage => ({
  ...emptyTitlePage("fr"),
  title: "Étude de l'équation de la chaleur",
  subtitle: "Méthodes numériques",
  authors: ["Camille Martin", "Sacha Durand"],
  ...over,
});

const full = (over: Partial<TitlePage> = {}) =>
  page({
    institution: "Université de Lyon",
    department: "Master de mathématiques",
    kind: "Mémoire de master",
    supervisors: ["Pr. Ada Lovelace"],
    logo: "images/logo.png",
    logoWidth: "4cm",
    accent: "blue",
    ...over,
  });

test("a text is written as LaTeX takes it, and read back as it was typed", () => {
  assert.equal(texText("Recherche & développement"), "Recherche \\& développement");
  assert.equal(texText("100 % de $x_1$ et mon_fichier #2"), "100 \\% de $x_1$ et mon\\_fichier \\#2");
  // What is already escaped, and commands, are left alone.
  assert.equal(texText("R\\&D en \\LaTeX"), "R\\&D en \\LaTeX");
  for (const typed of ["Recherche & développement", "100 % de $x_1$ et mon_fichier #2", "\\LaTeX{} en pratique", "Un titre\\\\ sur deux lignes"]) {
    assert.equal(plainText(texText(typed)), typed);
  }
});

test("the classic layout sets the commands and \\maketitle", () => {
  const out = writeTitlePage(DOC, page(), "fr");
  assert.ok(out.includes("\\usepackage{amsmath}\n\n\\title{Étude de l'équation de la chaleur\\\\[0.4em]\\large Méthodes numériques}\n\\author{Camille Martin \\and Sacha Durand}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n"), out);
  // Read back as it was set.
  const found = readTitlePage(out, "fr");
  assert.equal(found.kind, "classic");
  assert.deepEqual(found.page, page());
  // Written again: nothing moves.
  assert.equal(writeTitlePage(out, found.page, "fr"), out);
  // Changed: the statements are replaced where they are, none is added.
  const changed = writeTitlePage(out, page({ title: "Autre titre", subtitle: "", date: "" }), "fr");
  assert.ok(changed.includes("\\title{Autre titre}\n\\author{Camille Martin \\and Sacha Durand}\n\\date{}\n\\begin{document}\n\\maketitle\n"), changed);
  assert.equal(changed.match(/\\title\{/g)?.length, 1);
  assert.equal(changed.match(/\\maketitle/g)?.length, 1);
});

test("commands written in the body, before \\maketitle, are read and changed there", () => {
  const doc = "\\documentclass{article}\n\\begin{document}\n\\title{Un titre}\n\\author{A. B.}\n\\maketitle\nTexte.\n\\end{document}\n";
  const found = readTitlePage(doc, "en");
  assert.equal(found.kind, "classic");
  assert.deepEqual([found.page.title, found.page.authors, found.page.date], ["Un titre", ["A. B."], TODAY]);
  const out = writeTitlePage(doc, { ...found.page, title: "Un autre" }, "en");
  assert.equal(out, "\\documentclass{article}\n\\date{\\today}\n\\begin{document}\n\\title{Un autre}\n\\author{A. B.}\n\\maketitle\nTexte.\n\\end{document}\n");
});

test("a document without a title page says so; one without \\begin{document} is left alone", () => {
  assert.equal(readTitlePage(DOC, "fr").kind, "none");
  assert.equal(readTitlePage(DOC, "fr").page.supervisorLabel, "Sous la direction de");
  assert.equal(readTitlePage(DOC, "en").page.supervisorLabel, "Supervised by");
  assert.equal(writeTitlePage("Quelques notes.\n", page(), "fr"), "Quelques notes.\n");
  assert.equal(titlePreview("Quelques notes.\n", page(), "fr"), null);
});

test("each layout is read back with all its fields", () => {
  for (const style of ["centered", "report", "modern"] as const) {
    for (const lang of ["fr", "en"] as const) {
      const wanted = full({ style, supervisorLabel: lang === "fr" ? "Sous la direction de" : "Supervised by" });
      const out = writeTitlePage(DOC, wanted, lang);
      const found = readTitlePage(out, lang);
      assert.equal(found.kind, "block", `${style} ${lang}`);
      assert.deepEqual(found.page, wanted, `${style} ${lang}\n${out}`);
      // Read in the other language of the interface too.
      assert.deepEqual(readTitlePage(out, lang === "fr" ? "en" : "fr").page, wanted);
      assert.equal(writeTitlePage(out, found.page, lang), out, `${style} ${lang} written twice`);
      assert.ok(out.includes("\\usepackage{graphicx}") && out.includes("\\usepackage{xcolor}"));
      assert.ok(!out.includes("\\maketitle"));
    }
  }
  // With few fields, nothing is written for the others (no empty line of text, no package).
  const bare = writeTitlePage(DOC, page({ style: "report", subtitle: "", authors: ["Camille Martin"], date: "" }), "fr");
  assert.ok(!/\{[^{}]*\s\\par\}/.test(bare.replace(/\{\\[A-Za-z\\]+ [^{}]+\\par\}/g, "")), bare);
  assert.ok(!bare.includes("graphicx") && !bare.includes("xcolor") && !bare.includes("% date"));
  assert.deepEqual(readTitlePage(bare, "fr").page, page({ style: "report", subtitle: "", authors: ["Camille Martin"], date: "" }));
});

test("the code of a layout, as it is written", () => {
  const code = titleBlock(full({ style: "centered", supervisors: [], logo: "", accent: "" }), "fr");
  assert.equal(
    code,
    [
      "\\begin{titlepage} % page de titre : centrée",
      "  \\centering",
      "  {\\scshape\\LARGE Université de Lyon\\par} % établissement",
      "  {\\scshape\\large Master de mathématiques\\par} % formation",
      "  \\vfill",
      "  {\\Large Mémoire de master\\par} % type de document",
      "  \\vspace{0.6cm}",
      "  \\rule{\\linewidth}{0.4mm}\\par",
      "  \\vspace{0.5cm}",
      "  {\\huge\\bfseries Étude de l'équation de la chaleur\\par} % titre",
      "  \\vspace{0.3cm}",
      "  {\\Large Méthodes numériques\\par} % sous-titre",
      "  \\vspace{0.5cm}",
      "  \\rule{\\linewidth}{0.4mm}\\par",
      "  \\vspace{1.2cm}",
      "  {\\Large Camille Martin\\par} % auteur",
      "  {\\Large Sacha Durand\\par} % auteur",
      "  \\vfill",
      "  {\\large \\today\\par} % date",
      "\\end{titlepage}",
    ].join("\n"),
  );
  assert.deepEqual(titlePackages(full()), []);
  assert.deepEqual(titlePackages(full({ style: "modern" })), ["graphicx", "xcolor"]);
  assert.equal(titleCode(page({ subtitle: "", authors: ["A"] }), "en"), "\\title{Étude de l'équation de la chaleur}\n\\author{A}\n\\date{\\today}\n\n\\maketitle");
});

test("one layout replaces another, and a page written by hand", () => {
  const classic = writeTitlePage(DOC, page(), "fr");
  const block = writeTitlePage(classic, full({ style: "modern" }), "fr");
  assert.ok(!block.includes("\\maketitle") && block.includes("% page de titre : moderne"));
  // The commands of the classic page follow the fields.
  assert.ok(block.includes("\\title{Étude de l'équation de la chaleur\\\\[0.4em]\\large Méthodes numériques}"));
  const back = writeTitlePage(block, page({ title: "Retour" }), "fr");
  assert.ok(back.includes("\\begin{document}\n\\maketitle\n") && !back.includes("titlepage") && back.includes("\\title{Retour"), back);

  const hand = DOC.replace("\\begin{document}\n", "\\begin{document}\n\\begin{titlepage}\n  \\centering Mon titre à moi\n\\end{titlepage}\n");
  const found = readTitlePage(hand, "fr");
  assert.equal(found.kind, "foreign");
  const replaced = writeTitlePage(hand, full({ style: "centered" }), "fr");
  assert.ok(!replaced.includes("Mon titre à moi") && replaced.match(/\\begin\{titlepage\}/g)?.length === 1);
  // A line changed by hand in a page of ours is read as it is.
  const edited = block.replace("{\\sffamily\\bfseries\\Huge Étude de l'équation de la chaleur\\par} % titre", "{\\sffamily\\Huge \\LaTeX{} \\& moi\\par} % titre");
  assert.equal(readTitlePage(edited, "fr").page.title, "\\LaTeX{} & moi");
});

test("beamer has its own commands and a title frame", () => {
  const doc = "\\documentclass{beamer}\n\\usetheme{Madrid}\n\\begin{document}\n\\begin{frame}{Plan}\n\\end{frame}\n\\end{document}\n";
  assert.ok(isBeamer(doc) && !isBeamer(DOC));
  const out = writeTitlePage(doc, full({ style: "modern" }), "fr");
  assert.ok(
    out.includes("\\title{Étude de l'équation de la chaleur}\n\\subtitle{Méthodes numériques}\n\\author{Camille Martin \\and Sacha Durand}\n\\institute{Université de Lyon}\n\\date{\\today}\n\\begin{document}\n\\frame{\\titlepage}\n"),
    out,
  );
  assert.ok(!out.includes("\\begin{titlepage}") && !out.includes("graphicx"));
  const found = readTitlePage(out, "fr");
  assert.equal(found.kind, "classic");
  assert.deepEqual([found.page.title, found.page.subtitle, found.page.institution], ["Étude de l'équation de la chaleur", "Méthodes numériques", "Université de Lyon"]);
  // Without a subtitle, its command goes away.
  const less = writeTitlePage(out, { ...found.page, subtitle: "" }, "fr");
  assert.ok(!less.includes("\\subtitle") && less.includes("\\title{Étude de l'équation de la chaleur}\n\\author"), less);
  assert.equal(writeTitlePage(out, found.page, "fr"), out);
});

test("the preview is the title page alone, with the preamble of the document", () => {
  const preview = titlePreview(DOC, full({ style: "centered" }), "fr")!;
  assert.ok(preview.startsWith("\\documentclass[12pt]{report}"));
  assert.ok(preview.includes("\\usepackage{graphicx}") && preview.includes("\\begin{document}\n\\begin{titlepage}"));
  assert.ok(preview.endsWith("\\end{titlepage}\n\\end{document}\n") && !preview.includes("\\chapter"));
  const classic = titlePreview(DOC, page(), "fr")!;
  assert.ok(classic.endsWith("\\date{\\today}\n\\maketitle\n\\end{document}\n"), classic);
});
