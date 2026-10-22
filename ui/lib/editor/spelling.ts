// Spelling in the editor: the words of the prose that the dictionary does
// not know are underlined. Commands, formulas, keys, names of environments,
// the preamble and the pictures are not prose and are left alone; a passage
// in another language is checked with the dictionary of that language, when
// it is installed. A right click on an underlined word offers what the
// dictionary suggests.
//
// The verdicts come from the engine (spell.rs) through `SpellSource`: words
// not looked up yet are asked for, and the underlines are drawn again when
// the answer comes.

import { syntaxTree } from "@codemirror/language";
import { type Extension, RangeSetBuilder, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { codeArguments, codeRegions, foreignPassages, type Stretch, type Word, wordsIn } from "../spelling";
import { hooks } from "./context";

/** Where the verdicts on words come from. */
export interface SpellSource {
  /** The dictionary of the language of the document; null when none is installed. */
  dictionary: string | null;
  /** The dictionary for a passage in the language `lang`; null when none is installed. */
  dictionaryFor(lang: string): string | null;
  /** Whether a word is right: true, false, or undefined when it was not looked up yet. */
  verdict(dictionary: string, word: string): boolean | undefined;
  /** Looks words up; resolves once their verdicts are known. */
  check(dictionary: string, words: string[]): Promise<void>;
}

/** The verdicts changed: the underlines are drawn again. */
const recheck = StateEffect.define<null>();

/** Tokens of the LaTeX tokenizer (editor/latex.ts) that are code. */
const CODE = new Set(["keyword", "labelName", "typeName", "link", "string", "mathDelim", "math", "meta", "operator", "bracket", "escape", "number"]);
/** Tokens that are text even where the rest is code: a title set in the preamble, a comment. */
const TEXT = new Set(["heading", "comment", "strong", "emphasis"]);

/** A token named `heading_keyword` is the command of a heading: code. */
const isCode = (name: string) => name.split(/[_ ]/).some((part) => CODE.has(part));
const isText = (name: string) => !isCode(name) && name.split(/[_ ]/).some((part) => TEXT.has(part));

/** Up to this length the whole text is read again at each change (a few
 *  milliseconds); a longer one, once typing pauses (a book in one file took
 *  a tenth of a second a key). */
const READ_AT_ONCE = 100_000;
const READ_AFTER_MS = 400;

const misspelled = (dictionary: string) => Decoration.mark({ class: "cm-misspelled", attributes: { "data-dictionary": dictionary } });

/** A misspelled word on the screen. */
export interface Misspelled extends Word {
  dictionary: string;
}

class Spelling {
  decorations: DecorationSet;
  /** The misspelled words in sight. */
  found: Misspelled[] = [];
  private regions: Stretch[] = [];
  /** Arguments that are code (a colour, a length, options, the name of a language). */
  private args: Stretch[] = [];
  private passages: (Stretch & { lang: string })[] = [];
  private alive = true;
  private reading: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private view: EditorView,
    private source: SpellSource,
  ) {
    this.read();
    this.decorations = this.build();
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      if (update.state.doc.length <= READ_AT_ONCE) this.read();
      else {
        // Moved with the change meanwhile.
        const moved = <T extends Stretch>(list: T[]) =>
          list.map((s) => ({ ...s, from: update.changes.mapPos(s.from, 1), to: update.changes.mapPos(s.to, -1) })).filter((s) => s.from < s.to);
        this.regions = moved(this.regions);
        this.args = moved(this.args);
        this.passages = moved(this.passages);
        this.readSoon();
      }
    }
    const asked = update.transactions.some((tr) => tr.effects.some((e) => e.is(recheck)));
    if (asked || update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = this.build();
  }

  destroy() {
    this.alive = false;
    if (this.reading) clearTimeout(this.reading);
  }

  private readSoon() {
    if (this.reading) clearTimeout(this.reading);
    this.reading = setTimeout(() => {
      this.reading = null;
      if (!this.alive) return;
      this.read();
      this.view.dispatch({ effects: recheck.of(null) });
    }, READ_AFTER_MS);
  }

  /** The regions of code and the passages in another language, for the whole document. */
  private read() {
    const text = this.view.state.doc.toString();
    this.regions = codeRegions(text);
    this.args = codeArguments(text);
    this.passages = foreignPassages(text);
  }

  /** The stretches of `[from, to)` that are prose: what is neither a token of code nor in a region of code. */
  private prose(from: number, to: number): Stretch[] {
    const tree = syntaxTree(this.view.state);
    const code: Stretch[] = [];
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.from < node.to && isCode(node.name)) code.push({ from: Math.max(node.from, from), to: Math.min(node.to, to) });
      },
    });
    for (const arg of this.args) {
      if (arg.to > from && arg.from < to) code.push({ from: Math.max(arg.from, from), to: Math.min(arg.to, to) });
    }
    // Regions of code: everything in them but their titles and comments.
    for (const region of this.regions) {
      const start = Math.max(region.from, from);
      const end = Math.min(region.to, to);
      if (start >= end) continue;
      let at = start;
      tree.iterate({
        from: start,
        to: end,
        enter: (node) => {
          if (node.from >= node.to || !isText(node.name)) return;
          if (node.from > at) code.push({ from: at, to: Math.min(node.from, end) });
          at = Math.max(at, Math.min(node.to, end));
        },
      });
      if (at < end) code.push({ from: at, to: end });
    }
    code.sort((a, b) => a.from - b.from);
    const out: Stretch[] = [];
    let at = from;
    for (const c of code) {
      if (c.from > at) out.push({ from: at, to: c.from });
      at = Math.max(at, c.to);
    }
    if (at < to) out.push({ from: at, to });
    return out;
  }

  private build(): DecorationSet {
    const { view, source } = this;
    const pending = new Map<string, Set<string>>();
    const found: Misspelled[] = [];
    for (const visible of view.visibleRanges) {
      for (const stretch of this.prose(visible.from, visible.to)) {
        for (const word of wordsIn(view.state.doc.sliceString(stretch.from, stretch.to), stretch.from)) {
          const passage = this.passages.find((p) => word.from >= p.from && word.to <= p.to);
          const dictionary = passage ? source.dictionaryFor(passage.lang) : source.dictionary;
          if (!dictionary) continue;
          const verdict = source.verdict(dictionary, word.text);
          if (verdict === false) found.push({ ...word, dictionary });
          else if (verdict === undefined) {
            if (!pending.has(dictionary)) pending.set(dictionary, new Set());
            pending.get(dictionary)!.add(word.text);
          }
        }
      }
    }
    for (const [dictionary, words] of pending) {
      void source
        .check(dictionary, [...words])
        .then(() => this.alive && view.dispatch({ effects: recheck.of(null) }))
        .catch(() => {});
    }
    found.sort((a, b) => a.from - b.from);
    this.found = found;
    const builder = new RangeSetBuilder<Decoration>();
    for (const w of found) builder.add(w.from, w.to, misspelled(w.dictionary));
    return builder.finish();
  }
}

const theme = EditorView.baseTheme({
  ".cm-misspelled": {
    textDecoration: "underline wavy #e0569a",
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
    textDecorationSkipInk: "none",
  },
});

/** Underlines the misspelled words of the prose of a LaTeX document. */
export function spelling(source: SpellSource): Extension {
  const plugin = ViewPlugin.define((view) => new Spelling(view, source), {
    decorations: (p) => p.decorations,
    eventHandlers: {
      // The right button on an underlined word: what the dictionary offers.
      contextmenu(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const word = pos === null ? undefined : this.found.find((w) => pos >= w.from && pos <= w.to);
        if (!word) return false;
        event.preventDefault();
        hooks.spellingMenu(view, event, word);
        return true;
      },
    },
  });
  return [plugin, theme];
}

/** Draws the underlines again (a word was learned). */
export function recheckSpelling(view: EditorView) {
  view.dispatch({ effects: recheck.of(null) });
}
