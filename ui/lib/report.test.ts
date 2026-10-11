import assert from "node:assert/strict";
import { test } from "node:test";
import { anonymise, problemReport, type ReportData } from "./report.ts";

const data = (over: Partial<ReportData> = {}): ReportData => ({
  description: "La compilation s'arrête sur mon tableau.",
  app: { version: "0.5.0", os: "macos", arch: "aarch64" },
  tex: { label: "TeX Live 2025", kind: "texlive" },
  settings: { engine: "auto", tool: "auto", autoBuild: "onIdle", miktexAutoInstall: true, shellEscape: false },
  build: {
    engine: "pdflatex",
    success: false,
    cancelled: false,
    durationMs: 1234,
    steps: ["pdfLaTeX", "BibTeX", "pdfLaTeX (2)"],
    problems: [
      { severity: "warning", code: "overfull-box", message: "Overfull \\hbox (12pt too wide)", file: "/Users/camille/Documents/these/chapitres/intro.tex", line: 40 },
      { severity: "error", code: "extra-alignment-tab", message: "Extra alignment tab has been changed to \\cr.\nSee a | b", file: "/Users/camille/Documents/these/main.tex", line: 12 },
    ],
  },
  output: ["(/Users/camille/Documents/these/main.tex", "! Extra alignment tab has been changed to \\cr.", "l.12 a & b & c"],
  projectRoot: "/Users/camille/Documents/these",
  ...over,
});

test("paths lose the folder of the project and the name of the user", () => {
  const root = "/Users/camille/Documents/these";
  assert.equal(anonymise("/Users/camille/Documents/these/chapitres/intro.tex", root), "chapitres/intro.tex");
  assert.equal(anonymise("(/Users/camille/Documents/these/main.tex", root), "(main.tex");
  assert.equal(anonymise("/Users/camille/Library/texmf/tex/x.sty", root), "/Users/<user>/Library/texmf/tex/x.sty");
  assert.equal(anonymise("/home/sacha/.texlive/x.sty read", null), "/home/<user>/.texlive/x.sty read");
  assert.equal(anonymise("C:\\Users\\Jean Dupont\\AppData\\x.log", null), "C:\\Users\\<user>\\AppData\\x.log");
  // A project on Windows, named with either slash.
  assert.equal(anonymise("C:/Users/jean/these/main.tex", "C:\\Users\\jean\\these"), "main.tex");
  assert.equal(anonymise("in C:\\Users\\jean\\these", "C:\\Users\\jean\\these"), "in <project>");
});

test("the report says what is here and what the build said, errors first", () => {
  const text = problemReport(data(), { problems: true, output: false });
  assert.equal(
    text,
    [
      "### What happened",
      "",
      "La compilation s'arrête sur mon tableau.",
      "",
      "### Environment",
      "",
      "- RayTeX 0.5.0 (macos, aarch64)",
      "- TeX: TeX Live 2025",
      "- Build settings: engine auto, driver auto, automatic build onIdle",
      "",
      "### Last build",
      "",
      "- pdflatex: failed in 1.2 s (pdfLaTeX, BibTeX, pdfLaTeX (2))",
      "- 1 error(s), 1 warning(s)",
      "",
      "| | Code | Message | Where |",
      "|---|---|---|---|",
      "| error | extra-alignment-tab | Extra alignment tab has been changed to \\cr. See a \\| b | main.tex:12 |",
      "| warning | overfull-box | Overfull \\hbox (12pt too wide) | chapitres/intro.tex:40 |",
      "",
    ].join("\n"),
  );
  assert.ok(!text.includes("camille"));
});

test("what the build printed is there only when asked, without the name of the user", () => {
  assert.ok(!problemReport(data(), { problems: true, output: false }).includes("l.12"));
  const text = problemReport(data(), { problems: false, output: true });
  assert.ok(!text.includes("| error |") && text.includes("<details><summary>End of the build output (3 lines)</summary>"));
  assert.ok(text.includes("(main.tex\n! Extra alignment tab has been changed to \\cr.\nl.12 a & b & c") && !text.includes("camille"));
  // Backquotes in the output do not close the block.
  const quoted = problemReport(data({ output: ["a ``` b"] }), { problems: false, output: true });
  assert.ok(quoted.includes("\n````\na ``` b\n````\n"));
});

test("a report without a build, a distribution or a description still reads", () => {
  const text = problemReport(data({ description: " ", tex: null, build: null, output: [] }), { problems: true, output: true });
  assert.ok(text.includes("_Describe the problem here") && text.includes("- TeX: no distribution found") && text.includes("The document was not built in this session."));
  const miktex = problemReport(data({ tex: { label: "MiKTeX 26.5", kind: "miktex" } }), { problems: false, output: false });
  assert.ok(miktex.includes("- MiKTeX installs missing packages while compiling: yes"));
  // Many problems: the first ones, and how many are left out.
  const many = data();
  many.build!.problems = Array.from({ length: 20 }, (_, i) => ({ severity: "warning", code: null, message: `w${i}`, file: null, line: null }));
  assert.ok(problemReport(many, { problems: true, output: false }).includes("_…and 5 more._"));
});
