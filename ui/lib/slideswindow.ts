// What the main window and the window of the slides mode say to each other.
// The main window keeps the text (its editor, its undo, its builds); the
// slides window shows the deck and asks for changes, made on the version of
// the text it was told.

/** The label of the window of the slides mode. */
export const SLIDES_LABEL = "slides";

/** What the main window tells the slides window, each time something changes. */
export interface SlidesState {
  /** The main file of the deck, and its text as the editor has it. */
  path: string | null;
  text: string;
  /** Changes with each new text: a change asked for says the one it was made on. */
  version: number;
  /** The PDF of the last build and the `.nav` Beamer wrote with it. */
  pdf: string | null;
  nav: string | null;
  /** Changes with each build that made a PDF (it is read again). */
  built: number;
  /** A build is under way; the last one failed. */
  building: boolean;
  failed: boolean;
  /** The line of the cursor in the editor (the slide it is in is followed). */
  cursorLine: number | null;
  lang: "fr" | "en";
  theme: "light" | "dark";
}

/** A change of the text asked for by the slides window. */
export interface SlidesEdit {
  version: number;
  changes: { from: number; to: number; insert: string }[];
}

/** What the slides window asks of the main one. */
export type SlidesCommand = { kind: "build" } | { kind: "reveal"; line: number } | { kind: "closed" };

/** What the self-test asks the slides window to do (from the main window). */
export type SlidesTest =
  | { kind: "select"; index: number }
  | { kind: "add"; layout: string }
  | { kind: "duplicate" }
  | { kind: "delete" }
  | { kind: "move"; from: number; to: number }
  | { kind: "title"; text: string }
  | { kind: "notes"; text: string }
  | { kind: "close" };

/** What the slides window shows, told to the self-test. */
export interface SlidesReport {
  frames: string[];
  selected: number;
  /** Pages of the PDF read, and whether the slide chosen is drawn. */
  pages: number;
  drawn: boolean;
  notes: string;
  version: number;
}
