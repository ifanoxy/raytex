// Find and replace in the file shown: a floating card over the editor
// (Ctrl+F, and Ctrl+R with its row of replacement), in place of the bar of
// the editor library, whose search it uses (highlights, next, previous).

import { openSearchPanel, search, searchPanelOpen } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { mount, unmount } from "svelte";
import FindBar from "../../components/editor/FindBar.svelte";

class FindStore {
  /** The row of replacement is shown. */
  replace = $state(false);
  /** Incremented to put the focus in the search field. */
  focusTick = $state(0);
  /** Incremented at each change of the text or the selection (the count follows). */
  tick = $state(0);
}

export const find = new FindStore();

/** The search of the editor, with this card as its panel. */
export function findExtension(): Extension {
  return search({
    top: true,
    createPanel: (view: EditorView) => {
      const dom = document.createElement("div");
      dom.className = "lbt-find-panel";
      const component = mount(FindBar, { target: dom, props: { view } });
      return {
        dom,
        top: true,
        mount: () => find.focusTick++,
        update: (u: ViewUpdate) => {
          if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.length)) find.tick++;
        },
        destroy: () => void unmount(component),
      };
    },
  });
}

/** Opens the card (with its row of replacement for `replace`), or puts the focus back in it. */
export function openFind(view: EditorView, replace: boolean): boolean {
  if (replace) find.replace = true;
  else if (!searchPanelOpen(view.state)) find.replace = false;
  if (searchPanelOpen(view.state)) find.focusTick++;
  else openSearchPanel(view);
  return true;
}
