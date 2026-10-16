// The menus of the bar (Format, Insert, Maths, Page, @): what an entry is,
// how the keyboard goes through a menu (separators and greyed entries are
// passed over, a grid of cells is gone through by rows), and the entries
// the command palette finds by their path ("Text size › Large").

/** A small choice of a grid: an @ shortcut, a colour. */
export interface MenuCell {
  label: string;
  /** A formula drawn (what the cell writes). */
  glyph?: string;
  /** A colour shown. */
  swatch?: string;
  /** What is typed to get it (`@a`). */
  key?: string;
  disabled?: boolean;
  run: () => unknown;
}

export interface MenuEntry {
  label?: string;
  /** The action run, when it is one (the palette has it already). */
  action?: string;
  icon?: string;
  /** A formula drawn in place of the icon (what the entry writes). */
  glyph?: string;
  /** A colour shown in place of the icon. */
  swatch?: string;
  /** Written after the label, fainter (the LaTeX command). */
  hint?: string;
  keys?: string;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  /** A line of text that is not chosen (how the cells below are typed). */
  note?: string;
  /** A submenu, opened beside the entry. */
  items?: MenuEntry[];
  /** A grid of small choices, `columns` wide. */
  cells?: MenuCell[];
  columns?: number;
  run?: () => unknown;
}

export interface TopMenu {
  id: string;
  label: string;
  icon?: string;
  items: MenuEntry[];
}

/** Where the keyboard is in a menu: an entry, or a cell of its grid. */
export interface Stop {
  entry: number;
  cell?: number;
}

/** Whether an entry can be landed on (a grid is landed on by its cells). */
const choosable = (e: MenuEntry) => !e.separator && !e.note && !e.disabled && !e.cells && (!!e.run || !!e.items?.length);

/** Every place the keyboard can land on, in reading order. */
export function stops(entries: MenuEntry[]): Stop[] {
  const out: Stop[] = [];
  entries.forEach((e, entry) => {
    if (e.cells) e.cells.forEach((c, cell) => !c.disabled && out.push({ entry, cell }));
    else if (choosable(e)) out.push({ entry });
  });
  return out;
}

const same = (a: Stop, b: Stop) => a.entry === b.entry && a.cell === b.cell;

/**
 * Where an arrow key goes from `at` (nowhere yet: `null`). Up and down go
 * from entry to entry, and by rows inside a grid; left and right go from
 * cell to cell inside a grid, and give `null` elsewhere (or at the end of
 * the grid): the menu beside, or the submenu, is then meant.
 */
export function move(entries: MenuEntry[], at: Stop | null, key: "up" | "down" | "left" | "right"): Stop | null {
  const all = stops(entries);
  if (!all.length) return null;
  const grid = at && at.cell !== undefined ? entries[at.entry] : null;
  const cellAt = (cell: number) => (grid?.cells?.[cell] && !grid.cells[cell].disabled ? { entry: at!.entry, cell } : null);
  if (key === "left" || key === "right") {
    if (!at || at.cell === undefined) return null;
    return cellAt(at.cell + (key === "right" ? 1 : -1));
  }
  if (!at) return key === "down" ? all[0] : all[all.length - 1];
  if (grid && at.cell !== undefined) {
    const columns = grid.columns ?? 1;
    const row = cellAt(at.cell + (key === "down" ? columns : -columns));
    if (row) return row;
    // Out of the grid: the entry after it, or before it.
    const next = key === "down" ? all.find((s) => s.entry > at.entry) : [...all].reverse().find((s) => s.entry < at.entry);
    return next ?? (key === "down" ? all[0] : all[all.length - 1]);
  }
  const i = all.findIndex((s) => same(s, at));
  if (i < 0) return key === "down" ? all[0] : all[all.length - 1];
  return all[(i + (key === "down" ? 1 : -1) + all.length) % all.length];
}

/** The next entry after `at` whose label starts with `letter` (typed in an open menu). */
export function byLetter(entries: MenuEntry[], at: Stop | null, letter: string): Stop | null {
  const plain = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const wanted = plain(letter);
  const all = stops(entries).filter((s) => s.cell === undefined);
  const from = at ? all.findIndex((s) => s.entry === at.entry) : -1;
  for (let n = 1; n <= all.length; n++) {
    const s = all[(from + n + all.length) % all.length];
    if (plain(entries[s.entry].label ?? "").startsWith(wanted)) return s;
  }
  return null;
}

/** An entry the palette finds: its path in the menus, and what it runs. */
export interface Leaf {
  path: string[];
  entry: MenuEntry;
}

/**
 * The entries that run something without being actions (the palette has
 * the actions already): headings, sizes, formulas… Grids are left out,
 * they have windows of their own.
 */
export function leaves(menus: TopMenu[]): Leaf[] {
  const out: Leaf[] = [];
  const walk = (entries: MenuEntry[], path: string[]) => {
    for (const e of entries) {
      if (e.items) walk(e.items, [...path, e.label ?? ""]);
      else if (e.run && !e.action && e.label) out.push({ path: [...path, e.label], entry: e });
    }
  };
  for (const m of menus) walk(m.items, [m.label]);
  return out;
}
