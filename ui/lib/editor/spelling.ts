// What the spell checker of the system is told about a LaTeX document:
// commands, formulas, keys, names of environments, the preamble and the
// pictures are not to be spelled (`spellcheck="false"` on them), and a
// passage in another language says which one (`lang`). The checker itself,
// its dictionaries and its red lines are those of the system.

import { syntaxTree } from "@codemirror/language";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { codeRegions, foreignPassages, type Stretch } from "../spelling";

const off = Decoration.mark({ attributes: { spellcheck: "false" } });

/** Tokens of the LaTeX tokenizer (editor/latex.ts) that are code. */
const CODE = new Set(["keyword", "labelName", "typeName", "link", "string", "mathDelim", "math", "meta", "operator", "bracket", "escape", "number"]);
/** Tokens that are text even where the rest is code: a title set in the preamble, a comment. */
const TEXT = new Set(["heading", "comment", "strong", "emphasis"]);

/** A token named `heading_keyword` is the command of a heading: code. */
const isCode = (name: string) => name.split(/[_ ]/).some((part) => CODE.has(part));
const isText = (name: string) => !isCode(name) && name.split(/[_ ]/).some((part) => TEXT.has(part));

class ProseOnly {
  decorations: DecorationSet;
  private regions: Stretch[] = [];
  private passages: (Stretch & { lang: string })[] = [];

  constructor(view: EditorView) {
    this.read(view);
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) this.read(update.view);
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = this.build(update.view);
  }

  /** The regions of code and the passages in another language, for the whole document. */
  private read(view: EditorView) {
    const text = view.state.doc.toString();
    this.regions = codeRegions(text);
    this.passages = foreignPassages(text);
  }

  private build(view: EditorView): DecorationSet {
    const tree = syntaxTree(view.state);
    const marks: { from: number; to: number; deco: Decoration }[] = [];
    for (const visible of view.visibleRanges) {
      // Code, token by token.
      tree.iterate({
        from: visible.from,
        to: visible.to,
        enter: (node) => {
          if (node.from < node.to && isCode(node.name)) marks.push({ from: Math.max(node.from, visible.from), to: Math.min(node.to, visible.to), deco: off });
        },
      });
      // Regions of code: everything in them but their titles and comments.
      for (const region of this.regions) {
        const from = Math.max(region.from, visible.from);
        const to = Math.min(region.to, visible.to);
        if (from >= to) continue;
        let at = from;
        tree.iterate({
          from,
          to,
          enter: (node) => {
            if (node.from >= node.to || !isText(node.name)) return;
            if (node.from > at) marks.push({ from: at, to: Math.min(node.from, to), deco: off });
            at = Math.max(at, Math.min(node.to, to));
          },
        });
        if (at < to) marks.push({ from: at, to, deco: off });
      }
      for (const passage of this.passages) {
        const from = Math.max(passage.from, visible.from);
        const to = Math.min(passage.to, visible.to);
        if (from < to) marks.push({ from, to, deco: Decoration.mark({ attributes: { lang: passage.lang } }) });
      }
    }
    marks.sort((a, b) => a.from - b.from || b.to - a.to);
    const builder = new RangeSetBuilder<Decoration>();
    for (const m of marks) builder.add(m.from, m.to, m.deco);
    return builder.finish();
  }
}

/** Marks what is not prose in a LaTeX document, and the passages in another language. */
export function proseOnly(): Extension {
  return ViewPlugin.fromClass(ProseOnly, { decorations: (plugin) => plugin.decorations });
}
