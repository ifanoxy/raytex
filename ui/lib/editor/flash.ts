// Briefly highlights the lines of a location the user jumped to
// (error, outline entry, SyncTeX…), so the eye finds it immediately.

import { type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

export const flash = StateEffect.define<{ from: number; to: number } | null>();

const line = Decoration.line({ class: "lbt-flash" });

export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(flash)) continue;
      if (!e.value) return Decoration.none;
      const doc = tr.state.doc;
      const first = doc.lineAt(Math.min(e.value.from, doc.length)).number;
      const last = Math.min(doc.lineAt(Math.min(e.value.to, doc.length)).number, first + 40);
      const ranges: Range<Decoration>[] = [];
      for (let n = first; n <= last; n++) ranges.push(line.range(doc.line(n).from));
      return Decoration.set(ranges);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
