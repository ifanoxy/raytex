// What the main window and the window of an export say to each other. The
// export is run by the main window; its own window follows the build from
// the events of the engine, and is told the rest here.

import type { BuildReference } from "./buildprogress.ts";

/** Where an export stands. `done` and `closed` end it: with its result, or given up. */
export type ExportWindowPhase = "building" | "pictures" | "lighter" | "copying" | "failed" | "done" | "closed";

/** What the main window tells the window of the export, each time something changes. */
export interface ExportWindowState {
  /** The file the PDF is written to. */
  dest: string;
  /** The folder of the document: its files are shown by their name under it. */
  base: string;
  phase: ExportWindowPhase;
  /** The PDF is built apart, with lighter images. */
  lighter: boolean;
  /** Errors of the build that stopped the export. */
  errors: number;
  /** Why nothing was exported, when it is not the errors of the build. */
  reason: string | null;
  /** A PDF is there all the same: it can be exported as it is. */
  canForce: boolean;
  /** What the last build of the document took: the measure of this one. */
  reference: BuildReference | null;
  /**
   * The build of the project the export is waiting for, as far as it went
   * when this was told: a window that opens in the middle of a build did not
   * hear its start.
   */
  seed: ExportWindowSeed | null;
  /** What is said when it is done (`PDF exporté : rapport.pdf (2 Mo)`), and whether it is a reservation. */
  result: string | null;
  warning: boolean;
  lang: "fr" | "en";
  theme: "light" | "dark";
}

/** A build under way: its steps so far (the last one runs when `ms` is null), the pages of that one, what was written. */
export interface ExportWindowSeed {
  steps: { name: string; startedAt: number; ms: number | null }[];
  pages: number;
  lines: string[];
}

/** What the window of the export asks of the main one. */
export type ExportWindowCommand = "cancel" | "force" | "problems" | "reveal";

/** What that window shows at its end, told to the main one (the self-test reads it). */
export interface ExportWindowReport {
  steps: number;
  lines: number;
}

export const EXPORT_LABEL = "export";
