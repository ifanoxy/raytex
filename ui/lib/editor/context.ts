// Links between the editor extensions and the rest of the application,
// without import cycles: the application fills `hooks` at start-up.

import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Path of the document an editor state belongs to. */
export const docPath = Facet.define<string, string>({ combine: (v) => v[0] ?? "" });

/**
 * Text standing before the document for completion (a cell of a matrix is
 * in a formula: `\\[`).
 */
export const completionPrefix = Facet.define<string, string>({ combine: (v) => v[0] ?? "" });

export const hooks = {
  /** Adds `\usepackage{pkg}` to the preamble of the root document. */
  addPackage: async (_view: EditorView, _pkg: string): Promise<void> => {},
  /** Opens the definition of the symbol at `pos`. */
  goToDefinition: async (_view: EditorView, _pos: number): Promise<void> => {},
  /** Current settings needed by extensions. */
  settings: () => ({ autoAddPackage: true, hoverDocs: true, mathPreview: true, autoCloseEnvironments: true }),
  /** Saves a pasted image and returns its path relative to the root document. */
  pasteImage: async (_view: EditorView, _file: File): Promise<boolean> => false,
};
