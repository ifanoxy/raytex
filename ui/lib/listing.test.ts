// Code listings: what is written in the document, read back, and the tools of indentation.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codeColumns,
  DEFAULT_CODE_STYLE,
  LANGUAGES,
  indentationOf,
  languageOf,
  languageOfFile,
  linesOver,
  listingAt,
  listingCode,
  listingLabel,
  listingPreview,
  longestLine,
  mixedIndentation,
  PREVIEW_LINES,
  readCodeStyle,
  reindentCode,
  styleBlock,
  tidyCode,
  withFragileFrame,
  writeCodeStyle,
} from "./listing.ts";

const DOC = "\\documentclass{article}\n\\usepackage[french]{babel}\n\\begin{document}\nTexte.\n\\end{document}\n";

test("languages by name and by file", () => {
  assert.equal(languageOf("python")!.listings, "Python");
  assert.equal(languageOf("[Sharp]C")!.name, "C#");
  assert.equal(languageOf("C#")!.listings, "[Sharp]C");
  assert.equal(languageOf("Klingon"), null);
  assert.equal(languageOfFile("src/tri.py")!.name, "Python");
  assert.equal(languageOfFile("App.tsx")!.name, "TypeScript");
  assert.equal(languageOfFile("notes"), null);
  // A name is used once, and what `listings` lacks comes with its definition.
  assert.equal(new Set(LANGUAGES.map((l) => l.name)).size, LANGUAGES.length);
  assert.equal(new Set(LANGUAGES.map((l) => l.listings.toLowerCase())).size, LANGUAGES.length);
  for (const name of ["JavaScript", "TypeScript", "Rust", "Go", "JSON", "YAML"]) assert.ok(languageOf(name)!.definition, name);
  for (const name of ["Python", "C", "Java", "SQL"]) assert.equal(languageOf(name)!.definition, undefined, name);
});

test("a listing is written and read back", () => {
  const listing = { language: "Python", code: "def carre(x):\n    return x * x\n\n", file: null, caption: "Le carré, {\\itshape vite}", label: "lst:carre", options: "firstnumber=10" };
  const code = listingCode(listing);
  assert.equal(code, "\\begin{lstlisting}[language=Python, caption={Le carré, {\\itshape vite}}, label={lst:carre}, firstnumber=10]\ndef carre(x):\n    return x * x\n\\end{lstlisting}");
  const text = `Avant.\n${code}\nAprès.`;
  const read = listingAt(text, text.indexOf("\\begin{lstlisting}"))!;
  assert.equal(text.slice(read.from, read.to), code);
  assert.deepEqual(read.listing, { ...listing, code: "def carre(x):\n    return x * x" });
  // A language whose name has brackets is written in braces.
  assert.equal(listingCode({ ...listing, language: "C#", caption: "", label: "", options: "", code: "int x;" }), "\\begin{lstlisting}[language={[Sharp]C}]\nint x;\n\\end{lstlisting}");
  assert.equal(listingAt("\\begin{lstlisting}[language={[Sharp]C}]\nint x;\n\\end{lstlisting}", 0)!.listing.language, "C#");
  // No option at all, and code that looks like LaTeX.
  const bare = "\\begin{lstlisting}\n\\section{x} % [pas une option]\n\\end{lstlisting}";
  assert.deepEqual(listingAt(bare, 0)!.listing, { language: "", code: "\\section{x} % [pas une option]", file: null, caption: "", label: "", options: "" });
  assert.equal(listingCode({ language: "", code: "x", file: null, caption: "", label: "", options: "" }), "\\begin{lstlisting}\nx\n\\end{lstlisting}");
  // A language that is not one of ours stays as it is written.
  const other = listingAt("\\begin{lstlisting}[language=Cobol, numbers=none]\nX.\n\\end{lstlisting}", 0)!.listing;
  assert.deepEqual([other.language, other.options], ["", "language=Cobol, numbers=none"]);
  assert.equal(listingAt("\\begin{verbatim}", 0), null);
  assert.equal(listingAt("\\begin{lstlisting}\nsans fin", 0), null);
});

test("a listing read from a file", () => {
  const code = listingCode({ language: "Rust", code: "", file: "src/main.rs", caption: "Le programme", label: "", options: "" });
  assert.equal(code, "\\lstinputlisting[language=Rust, caption={Le programme}]{src/main.rs}");
  const read = listingAt(`Voir ${code}.`, 5)!;
  assert.equal(`Voir ${code}.`.slice(read.from, read.to), code);
  assert.deepEqual(read.listing, { language: "Rust", code: "", file: "src/main.rs", caption: "Le programme", label: "", options: "" });
  assert.equal(listingAt("\\lstinputlisting{a.py}", 0)!.listing.file, "a.py");
});

test("a label from a caption", () => {
  assert.equal(listingLabel("Tri rapide (version 2)"), "lst:tri-rapide-version-2");
  assert.equal(listingLabel("Élève à la puissance $n$"), "lst:eleve-a-la-puissance-n");
  assert.equal(listingLabel("  "), "");
});

test("the style of the document is written once and read back", () => {
  const first = writeCodeStyle(DOC, DEFAULT_CODE_STYLE);
  assert.ok(first.includes("\\usepackage{listings}") && first.includes("\\usepackage{xcolor}"));
  assert.ok(first.includes("% RayTeX code style: theme=light numbers=on wrap=on frame=on size=small tab=4\n\\lstdefinestyle{raytex}{"));
  assert.ok(first.indexOf("\\lstset{style=raytex}") < first.indexOf("\\begin{document}"));
  assert.deepEqual(readCodeStyle(first), { style: DEFAULT_CODE_STYLE, edited: false });
  // Written again, nothing changes; another style takes the place of the first.
  assert.equal(writeCodeStyle(first, DEFAULT_CODE_STYLE), first);
  const dark = { ...DEFAULT_CODE_STYLE, theme: "dark" as const, numbers: false, size: "footnotesize" as const, tab: 2 };
  const second = writeCodeStyle(first, dark);
  assert.equal(second.split("\\lstdefinestyle{raytex}").length, 2);
  assert.deepEqual(readCodeStyle(second), { style: dark, edited: false });
  assert.ok(second.includes("backgroundcolor=\\color{black!88}") && second.includes("numbers=none") && second.includes("tabsize=2"));
  // Touched by hand: it is said, and kept as it is unless a style is asked for.
  const byHand = second.replace("tabsize=2", "tabsize=3");
  assert.equal(readCodeStyle(byHand)!.edited, true);
  assert.equal(writeCodeStyle(byHand, null), byHand);
  assert.equal(readCodeStyle(writeCodeStyle(byHand, dark))!.edited, false);
  // No style of ours, no preamble.
  assert.equal(readCodeStyle(DOC), null);
  assert.equal(writeCodeStyle("Juste un texte.", DEFAULT_CODE_STYLE), "Juste un texte.");
});

test("a language listings does not know comes with its definition, once", () => {
  const rust = languageOf("Rust")!;
  const python = languageOf("Python")!;
  const once = writeCodeStyle(DOC, DEFAULT_CODE_STYLE, [rust, python]);
  assert.ok(once.includes("% RayTeX code language: Rust\n\\lstdefinelanguage{Rust}{\n  keywords={as, async,"));
  assert.ok(once.includes("  morecomment=[l]{//},\n  morecomment=[s]{/*}{*/},\n  morestring=[b]\",\n}"));
  assert.ok(!once.includes("\\lstdefinelanguage{Python}"));
  assert.ok(once.indexOf("\\lstdefinelanguage{Rust}") < once.indexOf("\\begin{document}"));
  const twice = writeCodeStyle(once, null, [rust, languageOf("JSON")!]);
  assert.equal(twice.split("\\lstdefinelanguage{Rust}").length, 2);
  assert.ok(twice.includes("\\lstdefinelanguage{JSON}"));
  // The style is still read whole, with the definitions after it.
  assert.deepEqual(readCodeStyle(twice), { style: DEFAULT_CODE_STYLE, edited: false });
});

test("the indentation of a piece of code", () => {
  assert.deepEqual(indentationOf("a\n    b\n        c"), { tabs: false, size: 4 });
  assert.deepEqual(indentationOf("a\n  b\n      c"), { tabs: false, size: 2 });
  assert.deepEqual(indentationOf("a\n\tb\n\t\tc"), { tabs: true, size: 1 });
  assert.equal(indentationOf("a\nb"), null);
  assert.equal(mixedIndentation("a\n\tb\n    c"), true);
  assert.equal(mixedIndentation("a\n    b\n        c"), false);
  // Taken from the middle of a file: back to the margin, without the spaces at the ends.
  assert.equal(tidyCode("\n\n        if x:   \n            return 1\n\n        return 0\n   \n"), "if x:\n    return 1\n\nreturn 0");
  assert.equal(tidyCode("\tfor (;;) {\r\n\t\tbreak;\r\n\t}"), "for (;;) {\n\tbreak;\n}");
  assert.equal(tidyCode("déjà\n  à la marge"), "déjà\n  à la marge");
  // Another indentation, level by level; an alignment keeps its spaces.
  const four = "def f(a,\n      b):\n    if a:\n        return b";
  assert.deepEqual(indentationOf(four), { tabs: false, size: 4 });
  assert.equal(reindentCode(four, 2), "def f(a,\n    b):\n  if a:\n    return b");
  assert.equal(reindentCode(four, "tabs"), "def f(a,\n\t  b):\n\tif a:\n\t\treturn b");
  assert.equal(reindentCode("a\n\tb\n\t\tc", 4), "a\n    b\n        c");
  assert.equal(reindentCode(reindentCode(four, "tabs"), 4), four);
  assert.equal(reindentCode("a\nb", 4), "a\nb");
  assert.equal(longestLine("ab\n\tabc\nabcdefgh", 4), 8);
  assert.equal(longestLine("\t\tx", 4), 9);
});

test("in a presentation, the frame of a listing is made fragile", () => {
  const slides = "\\begin{frame}{Avant}\nx\n\\end{frame}\n\\begin{frame}{Code}\nICI\n\\end{frame}";
  const at = slides.indexOf("ICI");
  assert.equal(withFragileFrame(slides, at), slides.replace("\\begin{frame}{Code}", "\\begin{frame}[fragile]{Code}"));
  const withOptions = slides.replace("\\begin{frame}{Code}", "\\begin{frame}[t, shrink=5]{Code}");
  assert.ok(withFragileFrame(withOptions, withOptions.indexOf("ICI")).includes("\\begin{frame}[t, shrink=5, fragile]{Code}"));
  const already = slides.replace("\\begin{frame}{Code}", "\\begin{frame}[fragile]{Code}");
  assert.equal(withFragileFrame(already, already.indexOf("ICI")), already);
  // Not in a frame: nothing to do.
  assert.equal(withFragileFrame("\\begin{frame}x\\end{frame}\nICI", 28), "\\begin{frame}x\\end{frame}\nICI");
  assert.equal(withFragileFrame(DOC, 60), DOC);
});

test("the preview is the preamble of the project and the code alone, on a page cut to it", () => {
  const listing = { language: "Go", code: "func main() {}", file: null, caption: "Le début", label: "lst:debut", options: "" };
  const preview = listingPreview(DOC, listing, DEFAULT_CODE_STYLE);
  assert.ok(preview.startsWith("\\documentclass{article}\n\\usepackage[french]{babel}"));
  assert.ok(preview.includes("\\lstdefinelanguage{Go}") && preview.includes("\\lstset{style=raytex}"));
  assert.ok(!preview.includes("Texte."));
  // The code in a box as wide as a line, measured, then shipped as the page.
  assert.ok(preview.includes("\\begin{document}\n\\newsavebox\\RTXcode\n\\begin{lrbox}{\\RTXcode}\\begin{minipage}{\\linewidth}\n\\makeatletter\\setbox0\\hbox{\\lst@basicstyle M}\\typeout{RTXMEASURE:"));
  assert.ok(preview.includes("\\makeatother\n\\begin{lstlisting}[language=Go, caption={Le début}]\nfunc main() {}\n\\end{lstlisting}\n\\end{minipage}\\end{lrbox}\n"));
  assert.ok(preview.endsWith("\\shipout\\vbox{\\kern8pt\\hbox{\\kern8pt\\box\\RTXcode}}\n\\end{document}\n"));
  // The block is what styleBlock says, to the letter.
  assert.ok(preview.includes(styleBlock(DEFAULT_CODE_STYLE)));
  // In a presentation: a slide, fragile.
  const slides = listingPreview(DOC.replace("{article}", "{beamer}"), listing, null);
  assert.ok(slides.includes("\\begin{frame}[fragile]\n\\makeatletter") && slides.includes("\\makeatother\n\\begin{lstlisting}") && !slides.includes("\\shipout"));
  assert.equal(listingPreview("sans préambule", listing, null), "");
  // A long code shows its first lines; a file is told where to stop, unless it says so itself.
  const long = listingPreview(DOC, { ...listing, code: Array.from({ length: 100 }, (_, i) => `l${i + 1}`).join("\n") }, null);
  assert.ok(long.includes(`\nl${PREVIEW_LINES}\n\\end{lstlisting}`) && !long.includes(`l${PREVIEW_LINES + 1}\n`));
  assert.ok(listingPreview(DOC, { ...listing, code: "", file: "a.go", options: "firstnumber=3" }, null).includes(`\\lstinputlisting[language=Go, caption={Le début}, firstnumber=3, lastline=${PREVIEW_LINES}]{a.go}`));
  assert.ok(listingPreview(DOC, { ...listing, code: "", file: "a.go", options: "lastline=5" }, null).includes("caption={Le début}, lastline=5]{a.go}"));
});

test("what a line of the document holds, from what TeX measured", () => {
  // An article: lines of 345 pt, characters of 4.72 pt, 20 pt for the numbers.
  const measures = [345, 4.72498, 20];
  assert.equal(codeColumns(measures, DEFAULT_CODE_STYLE), 67);
  assert.equal(codeColumns(measures, { ...DEFAULT_CODE_STYLE, numbers: false, frame: false }), 73);
  assert.equal(codeColumns(null, DEFAULT_CODE_STYLE), null);
  assert.equal(codeColumns([345, 0, 20], DEFAULT_CODE_STYLE), null);
  const code = `court\n${"x".repeat(67)}\n${"y".repeat(68)}\n\t${"z".repeat(64)}`;
  assert.equal(linesOver(code, 67, 4), 2);
  assert.equal(linesOver(code, 67, 2), 1);
  assert.equal(linesOver(code, 80, 4), 0);
});
