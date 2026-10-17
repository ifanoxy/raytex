import assert from "node:assert/strict";
import { test } from "node:test";
import { lookSample, readLook, writeLook } from "./theme.ts";

const DECK = `\\documentclass[11pt,aspectratio=169]{beamer}
\\usepackage[T1]{fontenc}
% \\usetheme{Warsaw}
\\usetheme[height=1cm]{Madrid}
\\usecolortheme{beaver}
\\setbeamertemplate{navigation symbols}{}
\\title{Essai}
\\begin{document}
\\begin{frame}{Un}
  \\usetheme{PasCeluiLa}
\\end{frame}
\\end{document}
`;

test("the look a deck has, from its preamble", () => {
  assert.deepEqual(readLook(DECK), { theme: "Madrid", color: "beaver", font: "default", ratio: "169", navigation: false });
  assert.deepEqual(readLook("\\documentclass{beamer}\n\\begin{document}\n\\end{document}"), { theme: "default", color: "default", font: "default", ratio: "43", navigation: true });
});

test("a look written in the preamble, the rest as it was", () => {
  const out = writeLook(DECK, { theme: "Warsaw", color: "default", font: "serif", ratio: "43", navigation: true });
  assert.equal(
    out,
    `\\documentclass[aspectratio=43,11pt]{beamer}
\\usepackage[T1]{fontenc}
% \\usetheme{Warsaw}
\\usetheme[height=1cm]{Warsaw}
\\usefonttheme{serif}
\\title{Essai}
\\begin{document}
\\begin{frame}{Un}
  \\usetheme{PasCeluiLa}
\\end{frame}
\\end{document}
`,
  );
  assert.deepEqual(readLook(out), { theme: "Warsaw", color: "default", font: "serif", ratio: "43", navigation: true });
  // Added after the class when there is none, and the symbols hidden again.
  const bare = "\\documentclass{beamer}\n\\title{X}\n\\begin{document}\n\\end{document}\n";
  assert.equal(writeLook(bare, { color: "whale", navigation: false, ratio: "1610" }), "\\documentclass[aspectratio=1610]{beamer}\n\\usecolortheme{whale}\n\\setbeamertemplate{navigation symbols}{}\n\\title{X}\n\\begin{document}\n\\end{document}\n");
  assert.equal(writeLook(bare, {}), bare);
});

test("a deck of one slide to see a look on", () => {
  const sample = lookSample(DECK, "\\begin{frame}{Deux}\\end{frame}", { theme: "Berlin" });
  assert.ok(sample.includes("\\usetheme[height=1cm]{Berlin}\n"));
  assert.ok(sample.endsWith("\\begin{document}\n\\begin{frame}{Deux}\\end{frame}\n\\end{document}\n"));
  assert.ok(!sample.includes("PasCeluiLa"));
});
