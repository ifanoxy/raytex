// Aids while writing a LaTeX file: what a paste becomes, special characters
// escaped as they are typed, shortcuts offered for what is typed again and
// again. Each one is a setting of the editor (Settings › Editor).

import { isolateHistory } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { escapeTyped } from "../editor/escape";
import { existingShortcut, type LearnedState, newKey, shortcutBody, typedOnce } from "../editor/learned";
import { findFormula } from "../editor/math-preview";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { smartPaste } from "../paste";
import type { Settings } from "../types";
import { app } from "./app.svelte";
import { gridStore } from "./grid.svelte";
import { ui } from "./ui.svelte";

/** The settings of these aids (kept with those of the editor). */
export interface TypingSettings {
  smartPaste: boolean;
  escapeSpecials: boolean;
  learnedShortcuts: boolean;
}

/** The settings of the aids: on unless turned off. */
export function typingSettings(s: Settings | null = app.settings): TypingSettings {
  const e = (s?.editor ?? {}) as Partial<TypingSettings>;
  return { smartPaste: e.smartPaste !== false, escapeSpecials: e.escapeSpecials !== false, learnedShortcuts: e.learnedShortcuts !== false };
}

/** Turns one aid on or off. */
export function setTyping(key: keyof TypingSettings, on: boolean) {
  return app.update((x) => {
    (x.editor as unknown as TypingSettings)[key] = on;
  });
}

function inMathAt(view: EditorView, pos: number): boolean {
  const f = findFormula(view.state.doc, pos);
  return !!f && pos > f.from && pos < f.to;
}

// ------------------------------------------------------------ paste

/**
 * A paste in a LaTeX file: formatted text as LaTeX, a table in the table
 * window, a formula as a formula. False when it is an ordinary paste.
 */
export function pasteInto(view: EditorView, e: ClipboardEvent, addPackage: (name: string) => void): boolean {
  if (!typingSettings().smartPaste || view.state.readOnly) return false;
  const html = e.clipboardData?.getData("text/html") ?? "";
  const plain = e.clipboardData?.getData("text/plain") ?? "";
  const { from, to } = view.state.selection.main;
  const math = inMathAt(view, from);
  const pasted = smartPaste(html, plain, math);
  if (!pasted) return false;
  e.preventDefault();
  if (pasted.kind === "table") {
    gridStore.openWithCells(view, pasted.cells, math);
    return true;
  }
  const latex = pasted.kind === "math" ? (math ? pasted.latex : pasted.display ? `\n\\[\n${pasted.latex}\n\\]\n` : `$${pasted.latex}$`) : pasted.latex;
  view.dispatch({ changes: { from, to, insert: latex }, selection: { anchor: from + latex.length }, userEvent: "input.paste", scrollIntoView: true });
  if (pasted.kind === "latex") for (const p of pasted.packages) addPackage(p);
  if (pasted.kind === "math" && /\\(binom|text|boxed|overset|underset)\b|\\begin\{aligned\}/.test(pasted.latex)) addPackage("amsmath");
  // What an ordinary paste would have given, one click away.
  ui.toast("info", t(pasted.kind === "math" ? "paste.formula" : "paste.latex"), {
    action: {
      label: t("paste.plain"),
      run: () => {
        if (view.state.sliceDoc(from, from + latex.length) !== latex) return;
        view.dispatch({ changes: { from, to: from + latex.length, insert: plain }, selection: { anchor: from + plain.length }, userEvent: "input.paste" });
      },
    },
  });
  return true;
}

// ------------------------------------------------------------ typing

let tipShown = false;

/** `&`, `_`, `#` typed in text (and `%` after a number) written escaped; one undo brings the character back. */
function escapes(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1 || !"&_#%".includes(text) || view.state.readOnly || view.composing) return false;
    if (!typingSettings().escapeSpecials) return false;
    const main = view.state.selection.main;
    if (view.state.selection.ranges.length > 1 || main.from !== from || main.to !== to || from !== to) return false;
    const before = view.state.sliceDoc(Math.max(0, from - 60_000), from);
    if (!escapeTyped(text, before, inMathAt(view, from))) return false;
    view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + 1 }, userEvent: "input.type" });
    view.dispatch({ changes: { from, insert: "\\" }, selection: { anchor: from + 2 }, userEvent: "input.escape", annotations: isolateHistory.of("full") });
    if (!tipShown) {
      tipShown = true;
      ui.toast("info", t("typing.escaped", { ch: text }), { action: { label: t("typing.escapedOff"), run: () => void setTyping("escapeSpecials", false) } });
    }
    return true;
  });
}

// ------------------------------------------------------------ learned

const LEARNED_KEY = "raytex.learned";
let builtin: [string, string][] | null = null;
let lastOffer = 0;

function loadLearned(): LearnedState {
  try {
    const v = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "null");
    if (v && typeof v === "object") return { counts: v.counts ?? {}, offered: v.offered ?? [] };
  } catch {
    /* none kept */
  }
  return { counts: {}, offered: [] };
}

function saveLearned(state: LearnedState) {
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(state));
  } catch {
    /* kept for this session only */
  }
}

/** A command typed in full: counted, and a shortcut offered when it is time. */
async function typedCommand(name: string, withArgument: boolean, math: boolean) {
  if (!typingSettings().learnedShortcuts) return;
  const state = loadLearned();
  const due = typedOnce(state, name);
  saveLearned(state);
  // One offer at a time, and not two in ten minutes.
  if (!due || Date.now() - lastOffer < 10 * 60_000) return;
  lastOffer = Date.now();
  state.offered.push(name);
  saveLearned(state);
  builtin ??= await ipc.atShortcuts().catch(() => []);
  const macros = app.settings?.macros ?? [];
  if (macros.some((m) => m.trigger.startsWith("@") && (m.body === `\\${name}` || m.body.startsWith(`\\${name}{`)))) return;
  const known = existingShortcut(name, builtin);
  if (known) {
    ui.toast("info", t("typing.knownShortcut", { key: `@${known}`, command: `\\${name}` }), { timeout: 9000 });
    return;
  }
  const taken = new Set([...builtin.map(([k]) => k), ...macros.filter((m) => m.trigger.startsWith("@")).map((m) => m.trigger.slice(1))]);
  const key = newKey(name, taken);
  ui.toast("info", t("typing.offerShortcut", { command: `\\${name}`, key: `@${key}` }), {
    timeout: 12000,
    action: {
      label: t("typing.createShortcut", { key: `@${key}` }),
      run: () =>
        void app.update((x) => {
          x.macros.push({ name: `\\${name}`, trigger: `@${key}`, key: "", body: shortcutBody(name, withArgument), math });
        }),
    },
  });
}

/**
 * Commands typed letter by letter: `\` then letters, ended by another
 * character (one picked in the list of completion does not count).
 */
function learning(): Extension {
  let typed: { from: number; name: string } | null = null;
  return EditorView.updateListener.of((u) => {
    for (const tr of u.transactions) {
      if (!tr.docChanged) continue;
      if (!tr.isUserEvent("input.type")) {
        typed = null;
        continue;
      }
      let inserted = "";
      let at = -1;
      tr.changes.iterChanges((fromA, toA, fromB, _toB, text) => {
        inserted += text.toString();
        at = fromA === toA ? fromB : -1;
      });
      if (inserted.length !== 1 && !(inserted.length === 2 && "{}[]()$$".includes(inserted))) {
        typed = null;
        continue;
      }
      const ch = inserted[0];
      if (ch === "\\") {
        typed = { from: at, name: "" };
      } else if (typed && /[a-zA-Z]/.test(ch) && at === typed.from + 1 + typed.name.length) {
        typed.name += ch;
      } else {
        if (typed && typed.name && at === typed.from + 1 + typed.name.length) {
          const name = typed.name;
          const math = inMathAt(u.view, at);
          void typedCommand(name, ch === "{", math);
        }
        typed = null;
      }
    }
  });
}

/** The aids of a LaTeX file (that is not read-only). */
export function typingAids(): Extension {
  return [escapes(), learning()];
}
