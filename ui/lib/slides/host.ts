// What the slides mode and the application say to each other. The slides
// mode takes the place of the editor in the same window; the application
// keeps the text (its editor, its undo, its builds), tells it each change
// and makes the changes it asks for, on the version of the text it saw.
// The mode is given a host and nothing else: it can be installed apart.

/** What the application tells the slides mode, each time something changes. */
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
  /** The line of the cursor in the editor when the mode opened (its slide is shown). */
  cursorLine: number | null;
  lang: "fr" | "en";
}

/** A change of the text asked for by the slides mode. */
export interface SlidesEdit {
  version: number;
  changes: { from: number; to: number; insert: string }[];
}

/** What the slides mode asks of the application. */
export type SlidesCommand =
  /** Build the deck now. */
  | { kind: "build" }
  /** Back to the editor, at this line. */
  | { kind: "reveal"; line: number }
  /** Back to the editor. */
  | { kind: "leave" }
  /** The mode is no longer shown. */
  | { kind: "closed" };

/** The application, as the slides mode sees it. */
export interface SlidesHost {
  /** Calls `listener` now and at each change; gives what stops it. */
  subscribe(listener: (state: SlidesState) => void): () => void;
  edit(edit: SlidesEdit): void;
  command(command: SlidesCommand): void;
}
