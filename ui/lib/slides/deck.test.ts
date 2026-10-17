import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteFrame, duplicateFrame, framePages, insertFrame, layoutCode, moveFrame, pagesOf, parseDeck, setNotes, setTitle } from "./deck.ts";

const DECK = `\\documentclass[aspectratio=169]{beamer}
\\usetheme{Madrid}
\\title{Essai}
\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\section{Début}
\\begin{frame}{Un}
  \\begin{itemize}
    \\item<1-> a
    \\item<2-> b
  \\end{itemize}
  \\note{Penser à l'exemple}
\\end{frame}

% \\begin{frame}{Commentée}
\\begin{frame}<1->[fragile]{Deux}{Sous-titre}
  Texte \\pause suite
\\end{frame}
\\note[item]{Après la diapositive}

\\begin{frame}
  \\frametitle{Trois}
  {\\centering Fin\\par}
\\end{frame}

\\end{document}
`;

const apply = (text: string, e: { from: number; to: number; insert: string }) => text.slice(0, e.from) + e.insert + text.slice(e.to);

test("the frames of a deck: titles, options, sections, notes, title page", () => {
  const d = parseDeck(DECK);
  assert.equal(d.beamer, true);
  assert.deepEqual(
    d.frames.map((f) => [f.title, f.subtitle, f.options, f.section, f.titlePage, f.notes.map((n) => n.text)]),
    [
      ["", "", "", "", true, []],
      ["Un", "", "", "Début", false, ["Penser à l'exemple"]],
      ["Deux", "Sous-titre", "fragile", "Début", false, ["Après la diapositive"]],
      ["Trois", "", "", "Début", false, []],
    ],
  );
  assert.equal(d.frames[1].line, 11);
  assert.ok(DECK.slice(d.frames[2].bodyFrom, d.frames[2].bodyTo).includes("Texte \\pause suite"));
  assert.equal(parseDeck("\\documentclass{article}\n\\begin{document}\n\\end{document}").beamer, false);
});

test("the pages of each frame, steps of reveals included", () => {
  const nav = "\\headcommand {\\slideentry {0}{0}{1}{1/1}{}{0}}\n\\headcommand {\\beamer@framepages {1}{1}}\n\\headcommand {\\beamer@framepages {2}{3}}\n\\headcommand {\\beamer@framepages {4}{5}}\n\\headcommand {\\beamer@framepages {6}{6}}\n";
  const pages = framePages(nav);
  assert.deepEqual(pages, [[1, 1], [2, 3], [4, 5], [6, 6]]);
  assert.deepEqual(pagesOf(pages, 4, 1), [2, 3]);
  // A .nav of another state of the text: one page a frame.
  assert.deepEqual(pagesOf(pages, 5, 4), [5, 5]);
});

test("slides added from a layout, duplicated, deleted, moved", () => {
  const d = parseDeck(DECK);
  const added = insertFrame(DECK, d, 1, "two-columns", "fr")!;
  const withNew = apply(DECK, added);
  const d2 = parseDeck(withNew);
  assert.equal(d2.frames.length, 5);
  assert.equal(d2.frames[2].title, "Titre de la diapositive");
  assert.equal(added.select, 2);
  assert.ok(withNew.includes("\\begin{columns}"));
  const dup = parseDeck(apply(DECK, duplicateFrame(DECK, d, 2)!));
  assert.deepEqual(dup.frames.map((f) => f.title), ["", "Un", "Deux", "Deux", "Trois"]);
  // The note after the slide goes with it.
  assert.equal(dup.frames[3].notes[0]?.text, "Après la diapositive");
  const del = apply(DECK, deleteFrame(DECK, d, 2)!);
  assert.deepEqual(parseDeck(del).frames.map((f) => f.title), ["", "Un", "Trois"]);
  assert.ok(!del.includes("Après la diapositive"));
  const up = moveFrame(DECK, d, 3, 1)!;
  assert.deepEqual(parseDeck(up.text).frames.map((f) => f.title), ["", "Trois", "Un", "Deux"]);
  const down = moveFrame(DECK, d, 1, 3)!;
  assert.deepEqual(parseDeck(down.text).frames.map((f) => f.title), ["", "Deux", "Trois", "Un"]);
  assert.equal(parseDeck(down.text).frames[3].notes[0].text, "Penser à l'exemple");
  // An empty deck gets its first slide before \end{document}.
  const empty = "\\documentclass{beamer}\n\\begin{document}\n\\end{document}\n";
  assert.equal(parseDeck(apply(empty, insertFrame(empty, parseDeck(empty), -1, "title-content", "en")!)).frames[0].title, "Title of the slide");
  assert.ok(layoutCode("section", "fr").startsWith("\\section{Nouvelle partie}"));
});

test("the title and the notes of a slide changed where they are written", () => {
  const d = parseDeck(DECK);
  assert.deepEqual(parseDeck(apply(DECK, setTitle(DECK, d, 1, "Premier")!)).frames.map((f) => f.title), ["", "Premier", "Deux", "Trois"]);
  assert.equal(parseDeck(apply(DECK, setTitle(DECK, d, 3, "Dernier")!)).frames[3].title, "Dernier");
  const titled = apply(DECK, setTitle(DECK, d, 0, "Accueil")!);
  assert.equal(parseDeck(titled).frames[0].title, "Accueil");
  assert.ok(titled.includes("\\begin{frame}{Accueil}"));
  const noted = apply(DECK, setNotes(DECK, d, 1, "Une autre note")!);
  assert.deepEqual(parseDeck(noted).frames[1].notes.map((n) => n.text), ["Une autre note"]);
  const cleared = apply(DECK, setNotes(DECK, d, 1, "")!);
  assert.deepEqual(parseDeck(cleared).frames[1].notes, []);
  const fresh = apply(DECK, setNotes(DECK, d, 3, "Conclure")!);
  assert.deepEqual(parseDeck(fresh).frames[3].notes.map((n) => n.text), ["Conclure"]);
  assert.ok(fresh.includes("\\note{Conclure}\n\\end{frame}"));
});
