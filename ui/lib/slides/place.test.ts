import assert from "node:assert/strict";
import { test } from "node:test";
import { frameBlocks } from "./blocks.ts";
import { parseDeck } from "./deck.ts";
import { blockAt, blockWords, type PageText, placeBlocks, shownWords } from "./place.ts";

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
  const boxes = placeBlocks(texts, blocks, "Plan de l'exposé", PAGE);
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
