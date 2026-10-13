// A click in the margin of the editor (the line numbers, the empty part of
// the columns of the folds and of the problems) puts the cursor at the start
// of that line. By itself the editor ignores such a click: the cursor stays
// where it was, often far below, and the next letter typed sends the view
// back down there.

import { EditorSelection } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";

export function gutterClicks() {
  return ViewPlugin.fromClass(
    class {
      private readonly down: (e: MouseEvent) => void;

      constructor(readonly view: EditorView) {
        this.down = (e) => {
          const target = e.target instanceof Element ? e.target : null;
          if (e.button !== 0 || !target?.closest(".cm-gutters")) return;
          // What a mark does (folding a section, showing a problem) is its own.
          if (target.closest(".cm-foldGutter span, .cm-lint-marker")) return;
          const line = view.lineBlockAtHeight(e.clientY - view.documentTop);
          const main = view.state.selection.main;
          e.preventDefault();
          view.dispatch({ selection: e.shiftKey ? EditorSelection.range(main.anchor, line.from) : EditorSelection.cursor(line.from), userEvent: "select.pointer" });
          view.focus();
        };
        view.scrollDOM.addEventListener("mousedown", this.down);
      }

      destroy() {
        this.view.scrollDOM.removeEventListener("mousedown", this.down);
      }
    },
  );
}
