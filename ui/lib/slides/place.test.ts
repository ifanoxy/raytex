import assert from "node:assert/strict";
import { test } from "node:test";
import { frameBlocks } from "./blocks.ts";
import { parseDeck } from "./deck.ts";
import { blockAt, blockWords, dropTarget, type PageText, partAt, partsOf, placeBlocks, shownWords, withPart } from "./place.ts";

const DECK = `\\documentclass{beamer}
\\begin{document}
\\begin{frame}{Plan de l'exposé}
  Une introduction courte % pas montré
  \\begin{itemize}[<+->]
    \\item<1-> Le \\textbf{contexte}
    \\item La méthode
  \\end{itemize}
  \\begin{center}
    \\includegraphics[width=0.5\\textwidth]{figure}
  \\end{center}
  \\begin{block}{À retenir}
    La méthode compte
  \\end{block}
  \\pause
\\end{frame}
\\end{document}
`;

const PAGE = { width: 453, height: 255 };
const text = (str: string, y: number, x = 30): PageText => ({ str, x, y, width: str.length * 5, height: 10 });

test("the words a piece of LaTeX shows", () => {
  assert.deepEqual(shownWords("\\item<2-> Le \\textbf{contexte} % pas ça\n\\begin{column}{0.5\\textwidth} À droite \\includegraphics[width=2cm]{fig}"), ["le", "contexte", "droite"]);
  const blocks = frameBlocks(DECK, parseDeck(DECK).frames[0]);
  assert.deepEqual(blocks.map(blockWords), [["une", "introduction", "courte"], ["le", "contexte", "la", "methode"], [], ["retenir", "la", "methode", "compte"], []]);
});

test("the blocks found on the page by their words, a picture between them", () => {
  const blocks = frameBlocks(DECK, parseDeck(DECK).frames[0]);
  const texts = [text("Plan de l’exposé", 12), text("Une introduction courte", 50), text("Le contexte", 70), text("La méthode", 85), text("À retenir", 190), text("La méthode compte", 205), text("Alwin Exposé 3/5", 246)];
  const { boxes, title } = placeBlocks(texts, blocks, "Plan de l'exposé", PAGE);
  assert.equal(title?.y, 12);
  assert.deepEqual(boxes[0], { x: 30, y: 50, width: 115, height: 10 });
  assert.deepEqual(boxes[1], { x: 30, y: 70, width: 55, height: 25 });
  assert.equal(boxes[3]?.y, 190);
  assert.equal(boxes[3]?.height, 25);
  // The picture: the space between the list and the box.
  assert.ok(boxes[2] && boxes[2].y >= 95 && boxes[2].y + boxes[2].height <= 190, JSON.stringify(boxes[2]));
  assert.equal(boxes[4], null);
  assert.equal(blockAt(boxes, 40, 75), 1);
  assert.equal(blockAt(boxes, 100, 140), 2);
  assert.equal(blockAt(boxes, 40, 210), 3);
  assert.equal(blockAt(boxes, 40, 20), -1);
});

test("the part of a block written on the slide where it is clicked", () => {
  const blocks = frameBlocks(DECK, parseDeck(DECK).frames[0]);
  const texts = [text("Plan de l’exposé", 12), text("Une introduction courte", 50), text("Le contexte", 70), text("La méthode", 85), text("À retenir", 190), text("La méthode compte", 205)];
  const placement = placeBlocks(texts, blocks, "Plan de l'exposé", PAGE);
  assert.deepEqual(partsOf(blocks[1]), ["Le \\textbf{contexte}", "La méthode"]);
  assert.equal(partsOf(blocks[2]), null);
  // The second point of the list, alone.
  assert.deepEqual(partAt(placement, blocks, 40, 88), { block: 1, part: 1, box: { x: 30, y: 85, width: 50, height: 10 }, size: 10 });
  // The title of the box, then its body.
  assert.equal(partAt(placement, blocks, 35, 193)?.part, 0);
  assert.equal(partAt(placement, blocks, 35, 208)?.part, 1);
  assert.equal(partAt(placement, blocks, 300, 140), null);
  assert.deepEqual(withPart(blocks[1], 1, " Les résultats ").items?.map((it) => it.text), ["Le \\textbf{contexte}", "Les résultats"]);
  assert.equal(withPart(blocks[3], 0, "Important").title, "Important");
});

test("where a thing dropped on the slide goes", () => {
  const deck = "\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}{T}\n  Haut du texte\n  \\begin{columns}\n    \\begin{column}{0.5\\textwidth}\n      Gauche\n    \\end{column}\n    \\begin{column}{0.5\\textwidth}\n    \\end{column}\n  \\end{columns}\n  Bas du texte\n\\end{frame}\n\\end{document}\n";
  const blocks = frameBlocks(deck, parseDeck(deck).frames[0]);
  const placement = placeBlocks([text("T", 10), text("Haut du texte", 50), text("Gauche", 100), text("Bas du texte", 160)], blocks, "T", PAGE);
  // Between the first text and the columns, at the end.
  const between = dropTarget(placement, blocks, 100, 75, PAGE);
  assert.equal(between.kind === "between" && between.before, 1);
  assert.ok(between.kind === "between" && between.line.y > 60 && between.line.y < 100);
  assert.deepEqual(dropTarget(placement, blocks, 100, 230, PAGE).kind === "between" && (dropTarget(placement, blocks, 100, 230, PAGE) as { before: number }).before, 3);
  // In the empty right column.
  const right = dropTarget(placement, blocks, 350, 104, PAGE);
  assert.deepEqual(right.kind === "column" && [right.block, right.column], [1, 1]);
  assert.deepEqual((dropTarget(placement, blocks, 40, 104, PAGE) as { column: number }).column, 0);
  // The columns being moved are no target.
  assert.equal(dropTarget(placement, blocks, 350, 104, PAGE, 1).kind, "between");
});

test("columns whose room is guessed are no target of a drop", () => {
  const deck = "\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}{T}\n  \\begin{columns}\n    \\begin{column}{0.5\\textwidth}\n      Gauche\n    \\end{column}\n  \\end{columns}\n\\end{frame}\n\\end{document}\n";
  const blocks = frameBlocks(deck, parseDeck(deck).frames[0]);
  // Its words not on the page: a room guessed, from the title to the bottom.
  const placement = placeBlocks([text("T", 10)], blocks, "T", PAGE);
  assert.deepEqual(placement.guessed, [true]);
  assert.ok(placement.boxes[0] && placement.boxes[0].height > 100);
  assert.equal(dropTarget(placement, blocks, 100, 200, PAGE).kind, "between");
});
