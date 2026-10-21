// The text stays where it was scrolled when the editor gets the focus back.
// WebKit (macOS) scrolls a text given the focus back to its old caret, even
// when asked not to: after a click elsewhere (the PDF, the tree) or once the
// editor was hidden, scrolling and clicking in the text threw it back to the
// old caret, and the click chose the text in between.

import { EditorView } from "@codemirror/view";

/** Gives the focus to `view`, its text left where it is. */
export function focusKeepingScroll(view: EditorView) {
  const { scrollTop, scrollLeft } = view.scrollDOM;
  view.focus();
  if (view.scrollDOM.scrollTop !== scrollTop) view.scrollDOM.scrollTop = scrollTop;
  if (view.scrollDOM.scrollLeft !== scrollLeft) view.scrollDOM.scrollLeft = scrollLeft;
}

/** A click in an editor without the focus: the focus given first, the text kept where it is, then the click as usual. */
export const keepScrollOnFocus = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!view.hasFocus && event.button === 0) focusKeepingScroll(view);
    return false;
  },
});
