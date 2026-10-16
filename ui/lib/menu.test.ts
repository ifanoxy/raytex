import assert from "node:assert/strict";
import { test } from "node:test";
import { byLetter, leaves, type MenuEntry, move, stops, type TopMenu } from "./menu.ts";

const run = () => {};
const cells = (n: number, disabled = false) => Array.from({ length: n }, (_, i) => ({ label: `c${i}`, disabled, run }));

/** Bold, (separator), a greyed entry, Style ▸, a grid of 6 cells 3 wide, a note, Symbols. */
function menu(): MenuEntry[] {
  return [
    { label: "Gras", action: "edit.bold", run },
    { separator: true },
    { label: "Gris", disabled: true, run },
    { label: "Style", items: [{ label: "Section", run }] },
    { cells: cells(6), columns: 3 },
    { note: "Tapez @" },
    { label: "Symboles", run },
  ];
}

test("the keyboard lands on what can be chosen, cells one by one", () => {
  assert.deepEqual(stops(menu()), [{ entry: 0 }, { entry: 3 }, ...[0, 1, 2, 3, 4, 5].map((cell) => ({ entry: 4, cell })), { entry: 6 }]);
  // A greyed grid (no document to write in) is passed over.
  assert.deepEqual(stops([{ cells: cells(4, true), columns: 2 }, { label: "A", run }]), [{ entry: 1 }]);
  assert.deepEqual(stops([{ separator: true }, { note: "x" }]), []);
});

test("up and down go from entry to entry, by rows in a grid, and come round", () => {
  const m = menu();
  assert.deepEqual(move(m, null, "down"), { entry: 0 });
  assert.deepEqual(move(m, null, "up"), { entry: 6 });
  // The separator and the greyed entry are passed over.
  assert.deepEqual(move(m, { entry: 0 }, "down"), { entry: 3 });
  assert.deepEqual(move(m, { entry: 3 }, "down"), { entry: 4, cell: 0 });
  assert.deepEqual(move(m, { entry: 4, cell: 1 }, "down"), { entry: 4, cell: 4 });
  // Out of the last row: the entry after the grid (the note is passed over).
  assert.deepEqual(move(m, { entry: 4, cell: 4 }, "down"), { entry: 6 });
  assert.deepEqual(move(m, { entry: 4, cell: 2 }, "up"), { entry: 3 });
  assert.deepEqual(move(m, { entry: 6 }, "down"), { entry: 0 });
  assert.deepEqual(move(m, { entry: 0 }, "up"), { entry: 6 });
  assert.deepEqual(move(m, { entry: 6 }, "up"), { entry: 4, cell: 5 });
});

test("left and right go from cell to cell, and give the menu beside elsewhere", () => {
  const m = menu();
  assert.deepEqual(move(m, { entry: 4, cell: 0 }, "right"), { entry: 4, cell: 1 });
  assert.deepEqual(move(m, { entry: 4, cell: 3 }, "left"), { entry: 4, cell: 2 });
  assert.equal(move(m, { entry: 4, cell: 0 }, "left"), null);
  assert.equal(move(m, { entry: 4, cell: 5 }, "right"), null);
  assert.equal(move(m, { entry: 3 }, "right"), null);
  assert.equal(move(m, null, "left"), null);
  assert.equal(move([{ separator: true }], null, "down"), null);
});

test("a letter typed goes to the next entry it starts, accents aside", () => {
  const m: MenuEntry[] = [
    { label: "Équation", run },
    { label: "Somme", run },
    { label: "Symboles", run },
    { label: "Intégrale", run },
  ];
  assert.deepEqual(byLetter(m, null, "e"), { entry: 0 });
  assert.deepEqual(byLetter(m, null, "S"), { entry: 1 });
  assert.deepEqual(byLetter(m, { entry: 1 }, "s"), { entry: 2 });
  assert.deepEqual(byLetter(m, { entry: 2 }, "s"), { entry: 1 });
  assert.equal(byLetter(m, null, "z"), null);
});

test("the palette finds what is not an action already, by its path", () => {
  const menus: TopMenu[] = [
    {
      id: "format",
      label: "Format",
      items: [
        { label: "Gras", action: "edit.bold", run },
        { label: "Taille du texte", items: [{ label: "Grand", hint: "\\large", run }, { separator: true }] },
        { label: "Couleur du texte", items: [{ cells: cells(3), columns: 3 }] },
      ],
    },
    { id: "math", label: "Maths", items: [{ label: "Fraction", glyph: "\\frac{a}{b}", run }] },
  ];
  assert.deepEqual(
    leaves(menus).map((l) => l.path.join(" › ")),
    ["Format › Taille du texte › Grand", "Maths › Fraction"],
  );
});
