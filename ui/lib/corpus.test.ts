// Every LaTeX file of the installed distribution read by the parts of the
// interface that read a document (tables, drawings, slides, title page,
// page layout, paragraphs, code, colours, figures, answer key, spelling,
// fonts), without an exception and in a reasonable time. Long, so only
// when asked: `RAYTEX_CORPUS=1 npm test` (`RAYTEX_CORPUS=<text>` keeps the
// files whose path contains the text).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { answerSwitch, totalPoints } from "./answerkey.ts";
import { documentColors } from "./colors.ts";
import { documentFonts } from "./fonts.ts";
import { readGraph } from "./graph.ts";
import { gridAt, parseGrid } from "./grid.ts";
import { figureAt, figureGroupAt } from "./images.ts";
import { readMargins, readStyles, readWatermark } from "./layout.ts";
import { listingAt, readCodeStyle } from "./listing.ts";
import { paragraphIssues, readParagraphs } from "./paragraphs.ts";
import { addPackages } from "./preamble.ts";
import { readTree } from "./probtree.ts";
import { parseDeck } from "./slides/deck.ts";
import { documentLanguage, foreignPassages, wordsIn } from "./spelling.ts";
import { parseDrawing, shapesFromCode } from "./tikz/model.ts";
import { readTitlePage } from "./titlepage.ts";
import { readTable } from "./variations.ts";

const SLOW_MS = 1500;

function files(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(tex|ltx)$/.test(name)) out.push(path);
  }
}

/** The bodies of `env` in `text` (the first few). */
function bodies(text: string, env: string): string[] {
  const out: string[] = [];
  let at = 0;
  while (out.length < 4) {
    const open = text.indexOf(`\\begin{${env}}`, at);
    if (open < 0) break;
    const close = text.indexOf(`\\end{${env}}`, open);
    out.push(text.slice(open, close < 0 ? undefined : close + env.length + 6));
    at = open + 1;
  }
  return out;
}

/** The places of `needle` in `text` (the first few). */
function places(text: string, needle: string): number[] {
  const out: number[] = [];
  for (let at = text.indexOf(needle); at >= 0 && out.length < 4; at = text.indexOf(needle, at + 1)) out.push(at + 1);
  return out;
}

function read(text: string) {
  const sw = answerSwitch(text);
  totalPoints(text, sw);
  documentColors(text);
  documentFonts(text, []);
  for (const at of [...places(text, "\\begin{tabular"), Math.floor(text.length / 2)]) {
    gridAt(text, at);
    parseGrid(text, at - 1);
  }
  for (const at of [...places(text, "\\includegraphics"), Math.floor(text.length / 3)]) {
    figureAt(text, at);
    figureGroupAt(text, at);
  }
  readMargins(text);
  readStyles(text);
  for (const code of bodies(text, "tikzpicture")) {
    parseDrawing(code);
    shapesFromCode(code);
    readGraph(code);
    readTree(code);
    readWatermark(code);
    readTable(code);
  }
  readCodeStyle(text);
  for (const at of places(text, "\\begin{lstlisting")) listingAt(text, at);
  const p = readParagraphs(text);
  paragraphIssues(text, p);
  addPackages(text, [{ name: "xcolor" }]);
  parseDeck(text);
  readTitlePage(text, "fr");
  documentLanguage(text);
  foreignPassages(text);
  wordsIn(text.slice(0, 200_000));
}

const filter = process.env.RAYTEX_CORPUS;

test("every LaTeX file of the distribution is read by the interface", { skip: !filter && "RAYTEX_CORPUS is not set" }, () => {
  let root = "";
  try {
    root = execFileSync("kpsewhich", ["-var-value", "TEXMFDIST"], { encoding: "utf8" }).trim();
  } catch {
    return;
  }
  const all: string[] = [];
  files(root, all);
  const chosen = all.filter((p) => filter === "1" || p.includes(filter!)).sort();
  const failures: string[] = [];
  const slow: string[] = [];
  const started = Date.now();
  for (const path of chosen) {
    const text = readFileSync(path, "utf8");
    // As it is, then with letters of several bytes beside the braces.
    for (const [variant, t] of [
      ["", text],
      [" (CJK beside braces)", text.replaceAll("{", "{語").replaceAll("}", "語}").replaceAll("$", "$é")],
    ] as const) {
      const t0 = Date.now();
      try {
        read(t);
      } catch (e) {
        failures.push(`${path}${variant}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" < ")}`);
      }
      if (Date.now() - t0 > SLOW_MS) slow.push(`${Date.now() - t0} ms ${path}${variant}`);
    }
  }
  for (const f of failures.slice(0, 40)) console.log(`failure: ${f}`);
  for (const s of slow.slice(0, 20)) console.log(`slow: ${s}`);
  console.log(`${chosen.length} files in ${Date.now() - started} ms: ${failures.length} failures, ${slow.length} slow`);
  assert.equal(failures.length + slow.length, 0);
});
