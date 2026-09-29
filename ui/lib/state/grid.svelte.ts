// What the grid editor (matrices and tables) is opened on: a new grid, or
// an environment of the document edited in place.

import { indentUnit } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { envHead, envRange, type Grid, type GridKind, gridAt, newGrid, parseGrid } from "../grid";
import { ui } from "./ui.svelte";

export interface GridRequest {
  grid: Grid;
  /** The environment edited in place (`from` is its `\begin`). */
  range?: { path: string; from: number; to: number; indent: string };
  /** New grid: the cursor is in a formula (a matrix goes there as it is). */
  inMath: boolean;
  /** Indentation unit of the document. */
  unit: string;
}

/** Characters read around the cursor to find the environment. */
const WINDOW = 50_000;

class GridStore {
  request = $state<GridRequest | null>(null);

  /** New grid of `rows` × `cols` cells. */
  openNew(view: EditorView, kind: GridKind, rows: number, cols: number, inMath: boolean) {
    this.request = { grid: newGrid(kind, rows, cols), inMath, unit: view.state.facet(indentUnit) };
    ui.openOverlay("grid");
  }

  /** `\begin` of the matrix or table (of `kind`, when given) around the cursor. */
  at(view: EditorView, kind?: GridKind): number | null {
    const doc = view.state.doc;
    const pos = view.state.selection.main.head;
    const start = Math.max(0, pos - WINDOW);
    const text = doc.sliceString(start, Math.min(doc.length, pos + WINDOW));
    const at = gridAt(text, pos - start);
    if (at === null) return null;
    if (kind && envHead(text, at)?.kind !== kind) return null;
    return start + at;
  }

  /** Opens the environment whose `\begin` is at `from`; false when it cannot be read (not closed…). */
  edit(view: EditorView, path: string, from: number): boolean {
    const doc = view.state.doc;
    const text = doc.sliceString(from, Math.min(doc.length, from + 4 * WINDOW));
    const grid = parseGrid(text, 0);
    const r = envRange(text, 0);
    if (!grid || !r) return false;
    const indent = /^[\t ]*/.exec(doc.lineAt(from).text)![0];
    this.request = { grid, range: { path, from, to: from + r.to, indent }, inMath: false, unit: view.state.facet(indentUnit) };
    ui.openOverlay("grid");
    return true;
  }
}

export const gridStore = new GridStore();
