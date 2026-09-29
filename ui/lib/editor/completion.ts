// Completion source backed by the Rust engine.

import { autocompletion, type Completion, type CompletionContext, type CompletionResult, completionStatus, snippet, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import * as ipc from "../ipc";
import type { CompletionItem, ItemKind } from "../types";
import { t } from "../i18n.svelte";
import { completionPrefix, docPath, hooks } from "./context";
import { argumentHints } from "./hints";
import { autoClosed } from "./pairs";

const TYPE: Record<ItemKind, string> = {
  command: "function",
  environment: "class",
  label: "label",
  citation: "citation",
  package: "package",
  class: "doctype",
  file: "file",
  color: "color",
  snippet: "snippet",
  macro: "macro",
  symbol: "symbol",
  option: "property",
  keyword: "keyword",
  glossary: "text",
};

/** What must precede the cursor for completion to open while typing. */
const TRIGGER = /(?:\\[a-zA-Z@]*\*?|@\S{0,2}|[{[,][^{}[\]\n,]*|%\s*!.*)$/;

interface Extra {
  glyph?: string;
  color?: string;
  shortcut?: string;
}

/**
 * `tail`: text after the cursor that the item replaces too (the `}` of
 * `\\begin{it|}`, the end of a name). It is not part of the completion range:
 * the editor filters the items with the whole range, and `it}` would match
 * nothing.
 */
function apply(item: CompletionItem, tail: string) {
  return (view: EditorView, completion: Completion, from: number, to: number) => {
    if (tail && view.state.sliceDoc(to, to + tail.length) === tail) to += tail.length;
    // `@[` typed became `@[]`: the `]` goes with what is replaced.
    else if (autoClosed(view.state.sliceDoc(from, to), view.state.sliceDoc(to, to + 1))) to += 1;
    if (item.snippet) {
      snippet(item.apply)(view, completion, from, to);
    } else {
      view.dispatch({
        changes: { from, to, insert: item.apply },
        selection: { anchor: from + item.apply.length },
        userEvent: "input.complete",
        scrollIntoView: true,
      });
    }
    if (item.addPackage && hooks.settings().autoAddPackage) void hooks.addPackage(view, item.addPackage);
    // After choosing \ref, \begin… open the next list right away.
    if (/[{,=]$/.test(item.apply) || /^\\(ref|eqref|cref|Cref|cite|citep|citet|parencite|textcite|autocite|usepackage|documentclass|input|include|includegraphics|begin)$/.test(item.label)) {
      setTimeout(() => startCompletion(view), 20);
    }
  };
}

async function source(context: CompletionContext): Promise<CompletionResult | null> {
  const path = context.state.facet(docPath);
  if (!path) return null;
  const pos = context.pos;
  const line = context.state.doc.lineAt(pos);
  const lineBefore = line.text.slice(0, pos - line.from);
  if (!context.explicit && !TRIGGER.test(lineBefore)) return null;
  const doc = context.state.doc;
  const before = context.state.facet(completionPrefix) + doc.sliceString(Math.max(0, pos - 12000), pos);
  const after = doc.sliceString(pos, Math.min(doc.length, pos + 400));
  let list;
  try {
    list = await ipc.complete(path, before, after, context.explicit);
  } catch {
    return null;
  }
  if (!list || context.aborted) return null;
  const tail = after.slice(0, list.toAfter);
  const options: Completion[] = list.items.map((item) => {
    const c: Completion & Extra = {
      label: item.label,
      detail: item.detail,
      type: TYPE[item.kind] ?? "text",
      boost: item.boost,
      apply: apply(item, tail),
      glyph: item.glyph,
      color: item.color,
      shortcut: item.shortcut,
    };
    if (item.info) {
      const key = item.info;
      c.info = async () => {
        const html = await ipc.completionInfo(path, key).catch(() => null);
        if (!html) return null;
        const div = document.createElement("div");
        div.className = "doc";
        div.innerHTML = html;
        return div;
      };
    }
    return c;
  });
  // The engine only sends items matching what is typed: the list can be
  // reused while the text extends it, not after deleting characters.
  const typed = context.state.sliceDoc(pos - list.from, pos);
  const pattern = list.validFor ? new RegExp(list.validFor) : null;
  return {
    from: pos - list.from,
    options,
    validFor: pattern && !list.incomplete ? (text: string) => text.startsWith(typed) && pattern.test(text) : undefined,
    filter: list.filter,
  };
}

/**
 * An empty argument of a command, or the place after a comma in it:
 * `\\begin{|}`, `\\cite{a,|}`, `\\includegraphics[|]`, `\\hypersetup{colorlinks, |}`.
 * The engine answers only for the arguments it can complete.
 */
const ARGUMENT = /\\[a-zA-Z]+\*?(?:\s*(?:\{[^{}\n]*\}|\[[^\]\n]*\]))*\s*[{[](?:[^{}[\]\n]*,\s*)?$/;

/**
 * The cursor put into an empty argument (arrows, click): the list opens
 * as if something had been typed.
 */
const openInEmptyArgument = EditorView.updateListener.of((u) => {
  if (u.docChanged || !u.selectionSet || !u.transactions.some((tr) => tr.isUserEvent("select"))) return;
  const sel = u.state.selection.main;
  if (!sel.empty || completionStatus(u.state) !== null || !u.state.facet(docPath)) return;
  const line = u.state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const next = line.text[sel.head - line.from];
  if ((next === "}" || next === "]" || next === ",") && ARGUMENT.test(before)) setTimeout(() => startCompletion(u.view), 0);
});

export function latexCompletion() {
  return [openInEmptyArgument, latexAutocompletion(), argumentHints()];
}

function latexAutocompletion() {
  return autocompletion({
    override: [source],
    activateOnTyping: true,
    activateOnTypingDelay: 60,
    maxRenderedOptions: 120,
    closeOnBlur: true,
    icons: true,
    addToOptions: [
      {
        position: 60,
        render(completion) {
          const extra = completion as Completion & Extra;
          if (extra.color) {
            const swatch = document.createElement("span");
            swatch.className = "cm-completion-swatch";
            swatch.style.background = extra.color;
            return swatch;
          }
          if (extra.glyph) {
            const g = document.createElement("span");
            g.className = "cm-completion-glyph";
            g.textContent = extra.glyph;
            return g;
          }
          return null;
        },
      },
      {
        // `@a` next to `\alpha`: makes the @ shortcuts known where they help.
        position: 90,
        render(completion) {
          const extra = completion as Completion & Extra;
          if (!extra.shortcut) return null;
          const badge = document.createElement("span");
          badge.className = "cm-completion-shortcut";
          badge.textContent = extra.shortcut;
          badge.title = t("completion.shortcutHint", { key: extra.shortcut });
          return badge;
        },
      },
    ],
  });
}
