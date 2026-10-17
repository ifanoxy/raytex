import assert from "node:assert/strict";
import { test } from "node:test";
import { alignOf, blockCode, deleteBlock, duplicateBlock, frameBlocks, gridCode, gridColumns, indentUnit, insertBlock, moveBlock, moveBlockTo, moveToColumn, newBlock, oneByOne, replaceBlock, revealStep, setAlign, setOneByOne, setReveal, stepSize, tableGrid } from "./blocks.ts";
import { parseDeck } from "./deck.ts";

const DECK = `\\documentclass{beamer}
\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Tout}
  Une phrase
  sur deux lignes. % un commentaire \\begin{itemize}

  Un autre paragraphe.
  \\begin{itemize}[<+->]
    \\item Un
    \\item<2-> Deux
    \\begin{enumerate}
      \\item Dedans
    \\end{enumerate}
  \\end{itemize}
  \\pause
  \\begin{center}
    \\includegraphics[width=0.6\\textwidth]{figure.png}
  \\end{center}
  \\[ a^2 + b^2 = c^2 \\]
  \\begin{align}
    x &= 1
  \\end{align}
  \\begin{alertblock}{Attention}
    Un piège.
  \\end{alertblock}
  \\begin{columns}
    \\begin{column}{0.4\\textwidth}
      Gauche
    \\end{column}
    \\begin{column}{0.55\\textwidth}
      Droite
    \\end{column}
  \\end{columns}
  \\begin{tabular}{ll}
    a & b \\\\
  \\end{tabular}
  \\vspace{1em}
  \\note{Une note}
\\end{frame}

\\begin{frame}{Vide}
\\end{frame}

\\end{document}
`;

const apply = (text: string, e: { from: number; to: number; insert: string }) => text.slice(0, e.from) + e.insert + text.slice(e.to);

test("the blocks of a slide, in order, what is not one kept as LaTeX", () => {
  const frames = parseDeck(DECK).frames;
  assert.deepEqual(frameBlocks(DECK, frames[0]).map((b) => [b.kind, b.special]), [["special", "titlepage"]]);
  const blocks = frameBlocks(DECK, frames[1]);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["text", "text", "list", "pause", "image", "formula", "formula", "box", "columns", "table", "text"],
  );
  assert.equal(blocks[0].text, "Une phrase\nsur deux lignes. % un commentaire \\begin{itemize}");
  assert.equal(blocks[1].text, "Un autre paragraphe.");
  const list = blocks[2];
  assert.equal(list.listOverlay, "+-");
  assert.deepEqual(list.items?.map((it) => [it.text.split("\n")[0], it.overlay]), [["Un", ""], ["Deux", "2-"]]);
  assert.equal(list.items?.[1].text, "Deux\n\\begin{enumerate}\n  \\item Dedans\n\\end{enumerate}");
  assert.deepEqual([blocks[4].path, blocks[4].width], ["figure.png", "0.6"]);
  assert.deepEqual([blocks[5].text, blocks[5].numbered], ["a^2 + b^2 = c^2", false]);
  assert.deepEqual([blocks[6].text, blocks[6].numbered], ["x &= 1", true]);
  assert.deepEqual([blocks[7].env, blocks[7].title, blocks[7].text], ["alertblock", "Attention", "Un piège."]);
  assert.deepEqual(blocks[8].columns, [{ width: "0.4", text: "Gauche" }, { width: "0.55", text: "Droite" }]);
  assert.equal(blocks[10].text, "\\vspace{1em}");
  assert.deepEqual(frameBlocks(DECK, frames[2]), []);
});

test("a block written back alone, the rest of the slide as it was", () => {
  const frames = parseDeck(DECK).frames;
  const blocks = frameBlocks(DECK, frames[1]);
  // Blocks written as they are give the text back, at its indentation.
  for (const i of [0, 2, 6, 7, 8, 9]) assert.equal(apply(DECK, replaceBlock(DECK, blocks, i, blocks[i])), DECK, `block ${i}`);
  const again = apply(DECK, replaceBlock(DECK, blocks, 5, blocks[5]));
  assert.deepEqual({ ...frameBlocks(again, parseDeck(again).frames[1])[5], from: 0, to: 0 }, { ...blocks[5], from: 0, to: 0 });
  const list = { ...blocks[2], items: [...blocks[2].items!, { text: "Trois", overlay: "" }] };
  const e = replaceBlock(DECK, blocks, 2, list);
  const out = apply(DECK, e);
  assert.ok(out.includes("\\end{enumerate}\n    \\item Trois\n  \\end{itemize}"));
  assert.equal(out.slice(0, blocks[2].from), DECK.slice(0, blocks[2].from));
  assert.equal(out.slice(blocks[2].from + e.insert.length), DECK.slice(blocks[2].to));
  assert.equal(blockCode({ ...blocks[7], title: "Danger" }, "  "), "\\begin{alertblock}{Danger}\n  \tUn piège.\n  \\end{alertblock}");
  assert.equal(blockCode({ ...blocks[5], numbered: true, env: "equation" }), "\\begin{equation}\n\ta^2 + b^2 = c^2\n\\end{equation}");
});

test("blocks added, taken out and moved", () => {
  const frames = parseDeck(DECK).frames;
  const blocks = frameBlocks(DECK, frames[1]);
  const added = apply(DECK, insertBlock(DECK, frames[1], blocks, 1, newBlock("box", "fr")));
  const after = frameBlocks(added, parseDeck(added).frames[1]);
  assert.deepEqual(after.slice(0, 4).map((b) => b.kind), ["text", "text", "box", "list"]);
  assert.equal(after[2].title, "À retenir");
  // On an empty slide, before its end.
  const empty = apply(DECK, insertBlock(DECK, frames[2], [], -1, newBlock("list", "en")));
  assert.ok(empty.includes("\\begin{frame}{Vide}\n  \\begin{itemize}\n    \\item First point\n    \\item Second point\n  \\end{itemize}\n\\end{frame}"));
  // First of a slide that has blocks.
  const first = apply(DECK, insertBlock(DECK, frames[1], blocks, -1, newBlock("pause", "en")));
  assert.deepEqual(frameBlocks(first, parseDeck(first).frames[1]).slice(0, 2).map((b) => b.kind), ["pause", "text"]);
  // Taken out with its line.
  const gone = apply(DECK, deleteBlock(DECK, blocks, 3));
  assert.ok(gone.includes("  \\end{itemize}\n  \\begin{center}"));
  // Moved: the two in each other's place.
  const moved = apply(DECK, moveBlock(DECK, blocks, 3, -1)!);
  assert.deepEqual(frameBlocks(moved, parseDeck(moved).frames[1]).slice(1, 4).map((b) => b.kind), ["text", "pause", "list"]);
  assert.equal(moveBlock(DECK, blocks, 0, -1), null);
});

test("the indentation of a level, as the document has it", () => {
  assert.equal(indentUnit(DECK), "  ");
  assert.equal(indentUnit("a\n\tb\n\t\tc\n"), "\t");
  assert.equal(indentUnit("a\n    b\n        c\n"), "    ");
  assert.equal(indentUnit("a\nb\n"), "\t");
});

test("a plain table as a grid, written back", () => {
  const code = "\\begin{tabular}{|l|c|}\n  \\hline\n  Nom & Valeur \\\\\n  \\hline\n  a & {1 & 2} \\\\\n  b & \\& \\\\\n  \\hline\n\\end{tabular}";
  const g = tableGrid(code)!;
  assert.equal(g.spec, "|l|c|");
  assert.deepEqual(g.rows, [
    { rule: "\\hline", cells: ["Nom", "Valeur"] },
    { rule: "\\hline", cells: ["a", "{1 & 2}"] },
    { rule: "", cells: ["b", "\\&"] },
  ]);
  assert.equal(g.end, "\\hline");
  assert.deepEqual(tableGrid(gridCode(g, "  ")), g);
  assert.equal(gridCode(g, "  "), code);
  const wider = gridColumns(g, 1);
  assert.equal(wider.spec, "|l|c|c|");
  assert.deepEqual(gridColumns(wider, -1), g);
  assert.equal(tableGrid("\\begin{tabular}{ll}\\multicolumn{2}{c}{x} \\\\\\end{tabular}"), null);
  const centred = tableGrid("\\begin{center}\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\end{center}")!;
  assert.equal(centred.center, true);
  assert.equal(gridCode(centred), "\\begin{center}\n\t\\begin{tabular}{ll}\n\t\ta & b \\\\\n\t\\end{tabular}\n\\end{center}");
});

test("a list shown one point a click, either way it is written", () => {
  const list = newBlock("list", "fr");
  assert.equal(oneByOne(list), false);
  assert.equal(oneByOne({ ...list, items: list.items!.map((it, k) => ({ ...it, overlay: `${k + 1}-` })) }), true);
  const on = setOneByOne({ ...list, items: list.items!.map((it, k) => ({ ...it, overlay: `${k + 1}-` })) }, true);
  assert.equal(blockCode(on), "\\begin{itemize}[<+->]\n\t\\item Premier point\n\t\\item Deuxième point\n\\end{itemize}");
  assert.equal(oneByOne(setOneByOne(on, false)), false);
  const g = tableGrid("\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}")!;
  assert.equal(gridCode(gridColumns(g, 1)), "\\begin{tabular}{llc}\n\ta & b & \\\\\n\\end{tabular}");
});

test("blocks shown at some steps only: around them, by a command, on them", () => {
  const deck = `\\documentclass{beamer}
\\begin{document}
\\begin{frame}{Étapes}
  \\begin{uncoverenv}<2->
    \\begin{itemize}
      \\item Un
    \\end{itemize}
  \\end{uncoverenv}
  \\uncover<3->{Une phrase}
  \\begin{alertblock}<4>{Attention}
    Seulement là
  \\end{alertblock}
  \\includegraphics<5->[width=0.5\\textwidth]{fig}
  \\only<2>{Un mot} et la suite
  \\begin{onlyenv}<2>
    A
    \\[ x \\]
  \\end{onlyenv}
\\end{frame}
\\end{document}
`;
  const f = parseDeck(deck).frames[0];
  const blocks = frameBlocks(deck, f);
  assert.deepEqual(
    blocks.map((b) => [b.kind, b.reveal?.form, b.reveal?.name, b.reveal?.overlay]),
    [
      ["list", "env", "uncoverenv", "2-"],
      ["text", "command", "uncover", "3-"],
      ["box", "spec", "", "4"],
      ["image", "spec", "", "5-"],
      ["text", undefined, undefined, undefined],
      ["raw", undefined, undefined, undefined],
    ],
  );
  assert.deepEqual(blocks[0].items?.map((it) => it.text), ["Un"]);
  assert.deepEqual([blocks[2].title, blocks[2].text], ["Attention", "Seulement là"]);
  assert.deepEqual(revealStep(blocks[2]), { step: 4, only: true });
  // Written back as they were.
  for (const i of [0, 1, 2, 3]) assert.equal(apply(deck, replaceBlock(deck, blocks, i, blocks[i])), deck, `block ${i}`);
  // Set from the interface: around a text, on a box, taken off.
  assert.equal(blockCode(setReveal(newBlock("text", "en"), 2), "  ", "  "), "\\begin{uncoverenv}<2->\n    A paragraph of text.\n  \\end{uncoverenv}");
  assert.equal(blockCode(setReveal(blocks[2], 3)), "\\begin{alertblock}<3->{Attention}\n\tSeulement là\n\\end{alertblock}");
  assert.equal(blockCode(setReveal(blocks[1], 1)), "Une phrase");
  assert.equal(setReveal(blocks[1], 2, true).reveal?.overlay, "2");
});

test("blocks set apart, sized, copied, moved, put in a column", () => {
  const deck = `\\documentclass{beamer}
\\begin{document}
\\begin{frame}{Mise en page}
  \\begin{center}
    Un texte centré
  \\end{center}
  \\begin{Large}
    \\begin{itemize}
      \\item Grand
    \\end{itemize}
  \\end{Large}
  \\begin{flushright}
    \\includegraphics[width=0.3\\textwidth]{logo}
  \\end{flushright}
  \\begin{columns}
    \\begin{column}{0.48\\textwidth}
      Gauche
    \\end{column}
    \\begin{column}{0.48\\textwidth}
    \\end{column}
  \\end{columns}
  Fin
\\end{frame}
\\end{document}
`;
  const f = parseDeck(deck).frames[0];
  const blocks = frameBlocks(deck, f);
  assert.deepEqual(blocks.map((b) => [b.kind, b.align, b.size]), [["text", "center", undefined], ["list", undefined, "Large"], ["image", "right", undefined], ["columns", undefined, undefined], ["text", undefined, undefined]]);
  for (const i of [0, 1, 2, 3]) assert.equal(apply(deck, replaceBlock(deck, blocks, i, blocks[i])), deck, `block ${i}`);
  assert.equal(alignOf(blocks[2]), "right");
  // Centred, larger, smaller.
  assert.equal(blockCode(setAlign(blocks[4], "center"), "  ", "  "), "\\begin{center}\n    Fin\n  \\end{center}");
  assert.equal(blockCode(setAlign(blocks[0], "left")), "Un texte centré");
  assert.equal(stepSize(blocks[1], 1).size, "LARGE");
  assert.equal(stepSize(stepSize(newBlock("text", "en"), 1), -1).size, undefined);
  assert.equal(blockCode(setAlign(blocks[2], "center")), "\\begin{center}\n\t\\includegraphics[width=0.3\\textwidth]{logo}\n\\end{center}");
  // Centred and larger at once, read back as one block.
  const both = blockCode(stepSize(setAlign(blocks[4], "center"), 1), "  ", "  ");
  assert.equal(both, "\\begin{center}\n    \\begin{large}\n      Fin\n    \\end{large}\n  \\end{center}");
  const again = deck.replace("  Fin\n", `  ${both}\n`);
  const read = frameBlocks(again, parseDeck(again).frames[0])[4];
  assert.deepEqual([read.kind, read.align, read.size, read.text], ["text", "center", "large", "Fin"]);
  assert.equal(apply(again, replaceBlock(again, frameBlocks(again, parseDeck(again).frames[0]), 4, read)), again);
  // Copied right after; moved to the end, then first.
  const copied = apply(deck, duplicateBlock(deck, blocks, 4));
  assert.ok(copied.includes("  Fin\n  Fin\n\\end{frame}"));
  const last = apply(deck, moveBlockTo(deck, blocks, 0, blocks.length)!);
  assert.deepEqual(frameBlocks(last, parseDeck(last).frames[0]).map((b) => b.text.split("\n")[0] || b.kind), ["list", "image", "columns", "Fin", "Un texte centré"]);
  const first = apply(deck, moveBlockTo(deck, blocks, 4, 0)!);
  assert.equal(frameBlocks(first, parseDeck(first).frames[0])[0].text, "Fin");
  assert.equal(moveBlockTo(deck, blocks, 1, 2), null);
  // Into the empty column: the text "Fin" taken out and written there.
  const moved = apply(deck, moveToColumn(deck, blocks, 4, 3, 1, "  ")!);
  const cols = frameBlocks(moved, parseDeck(moved).frames[0]);
  assert.equal(cols.length, 4);
  assert.deepEqual(cols[3].columns?.map((c) => c.text), ["Gauche", "Fin"]);
  assert.deepEqual(newBlock("columns", "fr", "3").columns?.length, 3);
  assert.equal(newBlock("box", "en", "alertblock").env, "alertblock");
});
