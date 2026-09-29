// The editor: tabs, one shared CodeMirror view, one EditorState per file.
//
// A single EditorView exists. Switching tabs swaps its state, which holds
// the text, undo history, selection and folds of the file: memory stays low
// and switching is instant, whatever the number of open files.
//
// Every change is sent to the engine (debounced) which answers with live
// diagnostics; saving, auto-save, auto-build, external changes, navigation
// and pasted images are handled here too.

import { acceptCompletion, closeBrackets, closeBracketsKeymap, snippet } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language";
import { type Diagnostic as CmDiagnostic, lintGutter, lintKeymap, setDiagnostics } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { ChangeSet, Compartment, EditorSelection, EditorState, type Extension, Prec, type StateEffect, type Text, type TransactionSpec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  highlightWhitespace,
  type KeyBinding,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
  type ViewUpdate,
} from "@codemirror/view";
import { editorKeymap } from "../actions";
import { latexCompletion } from "../editor/completion";
import { docPath, hooks } from "../editor/context";
import { deleteDollarPair, handleDollar } from "../editor/dollar";
import { flash, flashField } from "../editor/flash";
import { gridChips } from "../editor/grid-chip";
import { latexHover } from "../editor/hover";
import { bibtex, latex } from "../editor/latex";
import { findFormula, mathPreview, refreshMacros } from "../editor/math-preview";
import { headingOf } from "../editor/format";
import { linkedEnvironments } from "../editor/linked-envs";
import { navigableAt } from "../editor/navigation";
import { frenchPhrases } from "../editor/phrases";
import { enterKeymap, latexStructure } from "../editor/structure";
import { editorTheme } from "../editor/theme";
import { fixLabel, runFix } from "../fixes";
import { i18n, t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { addPackages, hasPackage, insertionPoint } from "../preamble";
import type { Diagnostic, Location, Macro, Position, Range, Settings, TextEdit } from "../types";
import { basename, debounce, dirname, escapeSnippet, fileKind, type FileKind, inlineMarkdown, isMac, join, prettyKey, relative, samePath } from "../utils";
import { app } from "./app.svelte";
import { build } from "./build.svelte";
import { diagnostics, mapDiagnostic, pathKey, type PositionMap } from "./diagnostics.svelte";
import { gridStore } from "./grid.svelte";
import { media, type TikzRequest } from "./media.svelte";
import { project } from "./project.svelte";
import { searchStore } from "./search.svelte";
import { ui } from "./ui.svelte";
import { viewer } from "./viewer.svelte";


export interface Tab {
  path: string;
  name: string;
  kind: FileKind;
  dirty: boolean;
  /** Deleted or moved on disk while open. */
  missing: boolean;
  /** Outside the project (package sources): read-only. */
  readOnly: boolean;
}

interface DocModel {
  path: string;
  kind: FileKind;
  /** Authoritative only while the model is not shown (the view holds the live state). */
  state: EditorState;
  version: number;
  /** Version last sent to the engine. */
  synced: number;
  /** Text as it is on disk. */
  saved: Text;
  modified: number;
  lossy: boolean;
  readOnly: boolean;
  scroll: StateEffect<unknown> | null;
  /** Settings the state was configured with. */
  configKey: string;
}

// Compartments are shared identifiers: every state uses the same ones.
const c = {
  theme: new Compartment(),
  gutters: new Compartment(),
  wrap: new Compartment(),
  indent: new Compartment(),
  activeLine: new Compartment(),
  brackets: new Compartment(),
  whitespace: new Compartment(),
  vim: new Compartment(),
  keys: new Compartment(),
  spell: new Compartment(),
  phrases: new Compartment(),
  completion: new Compartment(),
  path: new Compartment(),
  placeholder: new Compartment(),
};

let vimModule: typeof import("@replit/codemirror-vim") | null = null;

const SYNC_DELAY = 250;
const MAX_UNDO_BATCH = 500;

// ------------------------------------------------------------ helpers

export function toOffset(doc: Text, p: Position): number {
  if (p.line + 1 > doc.lines) return doc.length;
  const l = doc.line(p.line + 1);
  return Math.min(l.to, l.from + p.character);
}

export function toPosition(doc: Text, offset: number): Position {
  const l = doc.lineAt(offset);
  return { line: l.number - 1, character: offset - l.from };
}

/** Smallest single change turning `a` into `b` (keeps cursors and history meaningful). */
function minimalChange(a: string, b: string) {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

/** How positions of `from` move to `to` through `changes`. */
function positionMap(from: Text, to: Text, changes: ChangeSet): PositionMap {
  return (p, assoc) => {
    const n = changes.mapPos(toOffset(from, p), assoc);
    const line = to.lineAt(Math.min(n, to.length));
    return { line: line.number - 1, character: n - line.from };
  };
}

function sourceLabel(d: Diagnostic): string {
  const names: Record<string, string> = { latex: "LaTeX", bibtex: "BibTeX", biber: "Biber", index: "Index", syntax: "RayTeX", lint: "RayTeX", build: "build" };
  return d.code && (d.source === "lint" || d.source === "syntax") ? `${names[d.source]} · ${d.code}` : names[d.source];
}

function renderDiagnostic(d: Diagnostic): HTMLElement {
  const root = document.createElement("div");
  root.className = "lbt-diag";
  const msg = document.createElement("div");
  msg.className = "lbt-diag-message";
  msg.textContent = d.message;
  root.appendChild(msg);
  if (d.hint) {
    const hint = document.createElement("div");
    hint.className = "lbt-diag-hint";
    hint.innerHTML = `<strong>${inlineMarkdown(d.hint.title)}</strong> ${inlineMarkdown(d.hint.explanation)}`;
    root.appendChild(hint);
  }
  if (d.fixes.length) {
    const keys = document.createElement("div");
    keys.className = "lbt-diag-keys";
    keys.textContent = t("fix.quickFixHint", { keys: prettyKey("Alt-Enter") });
    root.appendChild(keys);
  }
  return root;
}

function toCmDiagnostics(doc: Text, list: Diagnostic[]): CmDiagnostic[] {
  const out: CmDiagnostic[] = [];
  for (const d of list) {
    let from: number;
    let to: number;
    if (d.range) {
      from = toOffset(doc, d.range.start);
      to = Math.max(from, toOffset(doc, d.range.end));
    } else if (d.line && d.line <= doc.lines) {
      const l = doc.line(d.line);
      from = l.from + /^\s*/.exec(l.text)![0].length;
      to = d.endLine && d.endLine > d.line && d.endLine <= doc.lines ? doc.line(d.endLine).to : l.to;
    } else {
      continue;
    }
    out.push({
      from,
      to,
      severity: d.severity,
      source: sourceLabel(d),
      message: d.message,
      renderMessage: () => renderDiagnostic(d),
      actions: d.fixes.map((fix) => ({
        name: fixLabel(fix),
        apply: () => void runFix(fix, d),
      })),
    });
  }
  return out;
}

/** Whether `pos` is inside a `tikzpicture` (or `tikzcd`, `circuitikz`), looking back a little. */
function insideTikz(doc: Text, pos: number): boolean {
  const before = doc.sliceString(Math.max(0, pos - 30000), pos);
  const begin = Math.max(before.lastIndexOf("\\begin{tikzpicture}"), before.lastIndexOf("\\begin{tikzcd}"), before.lastIndexOf("\\begin{circuitikz}"));
  if (begin < 0) return false;
  return !/\\end\{(tikzpicture|tikzcd|circuitikz)\}/.test(before.slice(begin));
}

/** Word (or label/key) at `pos`, for rename. */
function symbolAt(state: EditorState, pos: number): { from: number; to: number; text: string } | null {
  const line = state.doc.lineAt(pos);
  const rel = pos - line.from;
  const re = /\\?[A-Za-z@][\w@:.\-/]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    if (m.index <= rel && rel <= m.index + m[0].length) {
      return { from: line.from + m.index, to: line.from + m.index + m[0].length, text: m[0] };
    }
  }
  return null;
}

// ---------------------------------------------------------------- store

type Listener = (path: string) => void;

class EditorStore {
  tabs = $state<Tab[]>([]);
  active = $state<string | null>(null);
  cursor = $state({ line: 1, col: 1, selections: 1, selected: 0 });
  words = $state<{ file: number; project: number } | null>(null);
  /** Increments when the active document changes (for panels following it). */
  revision = $state(0);
  /** The cursor is inside a TikZ picture (the toolbar offers to edit it). */
  inTikz = $state(false);
  /** Heading command of the cursor line (`section`), shown by the style menu. */
  lineHeading = $state<string | null>(null);
  /** The shown document is empty (the editor offers ways to start it). */
  activeEmpty = $state(false);
  /** Undo and redo are possible in the shown document. */
  canUndo = $state(false);
  canRedo = $state(false);

  view: EditorView | null = null;
  private models = new Map<string, DocModel>();
  private configKey = "";
  private syncListeners: Listener[] = [];
  private saveListeners: Listener[] = [];
  private lastMacroRefresh = new Map<string, number>();

  private syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private idleBuildTimer: ReturnType<typeof setTimeout> | null = null;
  private wordsSoon = debounce(() => void this.refreshWords(), 1200);
  private sessionSoon = debounce(() => {
    void ipc.saveOpenFiles(
      this.tabs.map((t) => t.path),
      this.active,
    ).catch(() => {});
  }, 600);

  constructor() {
    diagnostics.onChange((key) => this.applyDiagnostics(key));
    hooks.addPackage = async (view, pkg) => {
      await this.addPackage(pkg, view);
    };
    hooks.goToDefinition = (view, pos) => this.goToDefinition(view, pos);
    hooks.pasteImage = (view, file) => this.pasteImage(view, file);
    hooks.settings = () => {
      const s = app.settings;
      return {
        autoAddPackage: s?.completion.autoAddPackage ?? true,
        hoverDocs: s?.editor.hoverDocs ?? true,
        mathPreview: s?.editor.mathPreview ?? true,
        autoCloseEnvironments: s?.editor.autoCloseEnvironments ?? true,
      };
    };
  }

  // --------------------------------------------------------- listeners

  /** Called after each synchronisation with the engine (outline refresh…). */
  onDidSync(fn: Listener) {
    this.syncListeners.push(fn);
  }

  onDidSave(fn: Listener) {
    this.saveListeners.push(fn);
  }

  // ------------------------------------------------------------- queries

  get activeTab(): Tab | null {
    return this.tabs.find((t) => t.path === this.active) ?? null;
  }

  get dirtyTabs(): Tab[] {
    return this.tabs.filter((t) => t.dirty);
  }

  isOpen(path: string): boolean {
    return this.models.has(pathKey(path)) || this.tabs.some((t) => samePath(t.path, path));
  }

  private model(path: string | null | undefined): DocModel | undefined {
    return path ? this.models.get(pathKey(path)) : undefined;
  }

  private isShown(m: DocModel): boolean {
    return !!this.view && samePath(this.active, m.path) && this.view.state.facet(docPath) === m.path;
  }

  /** Live state of an open document. */
  stateOf(path: string): EditorState | null {
    const m = this.model(path);
    if (!m) return null;
    return this.isShown(m) ? this.view!.state : m.state;
  }

  /** Current text of an open document. */
  textOf(path: string): string | null {
    return this.stateOf(path)?.doc.toString() ?? null;
  }

  // ------------------------------------------------------- configuration

  private settings(): Settings | null {
    return app.settings;
  }

  private computeConfigKey(): string {
    const s = this.settings();
    return JSON.stringify([s?.editor, s?.completion.enabled, s?.macros, s?.keybindings, i18n.lang, !!vimModule]);
  }

  /** Extensions of each compartment for the current settings. */
  private compartmentValues(path: string): [Compartment, Extension][] {
    const s = this.settings();
    const e = s?.editor;
    const tabSize = e?.tabSize ?? 2;
    const vimOn = !!e?.vimMode && !!vimModule;
    return [
      [c.theme, editorTheme(e?.fontFamily || "var(--font-mono)", e?.fontSize ?? 14, e?.lineHeight ?? 1.6)],
      [
        c.gutters,
        [
          e?.lineNumbers !== false ? [lineNumbers(), highlightActiveLineGutter()] : [],
          e?.folding !== false ? foldGutter({ openText: "▾", closedText: "▸" }) : [],
          lintGutter({ hoverTime: 250 }),
        ],
      ],
      [c.wrap, e?.wordWrap !== false ? EditorView.lineWrapping : []],
      [c.indent, [EditorState.tabSize.of(tabSize), indentUnit.of(e?.useTabs ? "\t" : " ".repeat(tabSize))]],
      [c.activeLine, e?.highlightActiveLine !== false ? highlightActiveLine() : []],
      [c.brackets, e?.autoCloseBrackets !== false ? closeBrackets() : []],
      [c.whitespace, e?.showWhitespace ? highlightWhitespace() : []],
      [c.vim, vimOn ? Prec.highest(vimModule!.vim({ status: true })) : []],
      [c.keys, Prec.high(keymap.of(this.userKeymap()))],
      [
        c.spell,
        EditorView.contentAttributes.of(
          e?.spellcheck ? { spellcheck: "true", lang: i18n.lang, autocorrect: "off", autocapitalize: "off" } : { spellcheck: "false" },
        ),
      ],
      [c.phrases, i18n.lang === "fr" ? EditorState.phrases.of(frenchPhrases) : []],
      [c.completion, s?.completion.enabled === false ? [] : latexCompletion()],
      [c.path, docPath.of(path)],
      [c.placeholder, placeholder(t("editor.placeholder"))],
    ];
  }

  private extensions(path: string, kind: FileKind, readOnly: boolean): Extension[] {
    const languageExt =
      kind === "tex"
        ? [
            latex(),
            latexStructure(),
            latexHover(),
            mathPreview(),
            linkedEnvironments(),
            readOnly
              ? []
              : gridChips({
                  label: (kind) => t(kind === "matrix" ? "grid.matrix" : "grid.table"),
                  title: (kind) => t(kind === "matrix" ? "grid.chipMatrix" : "grid.chipTable"),
                  open: (view, from) => {
                    if (!gridStore.edit(view, path, from)) ui.toast("warning", t("grid.unreadable"));
                  },
                }),
            EditorView.inputHandler.of((view, from, to, text) => handleDollar(view, from, to, text)),
            Prec.high(keymap.of([{ key: "Backspace", run: deleteDollarPair }])),
          ]
        : kind === "bib"
          ? [bibtex()]
          : [];
    const smart = kind === "tex" || kind === "bib";
    return [
      ...this.compartmentValues(path).map(([comp, ext]) => (comp === c.completion && !smart ? comp.of([]) : comp.of(ext))),
      languageExt,
      flashField,
      history({ minDepth: MAX_UNDO_BATCH, newGroupDelay: 600 }),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      rectangularSelection({ eventFilter: (e) => e.altKey && e.shiftKey }),
      crosshairCursor({ key: "Alt" }),
      highlightSelectionMatches({ minSelectionLength: 2, maxMatches: 400 }),
      search({ top: true }),
      EditorView.clickAddsSelectionRange.of((e) => e.altKey && !e.shiftKey),
      readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(true)] : [],
      Prec.high(keymap.of(enterKeymap({ closeEnvironments: () => hooks.settings().autoCloseEnvironments }))),
      keymap.of([
        ...this.tabKeymap(),
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((u) => this.onViewUpdate(u)),
      EditorView.domEventHandlers({
        mousedown: (e, view) => this.onMouseDown(e, view),
        paste: (e, view) => this.onPaste(e, view),
        drop: (e, view) => this.onDrop(e, view),
      }),
    ];
  }

  /** Tab: accept completion, expand a macro trigger, otherwise indent. */
  private tabKeymap(): KeyBinding[] {
    return [
      { key: "Tab", run: acceptCompletion },
      { key: "Tab", run: (view) => this.expandMacroTrigger(view) },
    ];
  }

  private userKeymap(): KeyBinding[] {
    const bindings = editorKeymap();
    for (const m of this.settings()?.macros ?? []) {
      if (!m.key) continue;
      bindings.push({ key: m.key, run: (view) => this.insertMacro(view, m) });
    }
    return bindings;
  }

  /** Applies changed settings to the visible editor (others update when shown). */
  async reconfigure() {
    if (this.settings()?.editor.vimMode && !vimModule) vimModule = await import("@replit/codemirror-vim");
    this.configKey = this.computeConfigKey();
    const view = this.view;
    if (!view) return;
    const m = this.model(view.state.facet(docPath));
    if (!m) return;
    this.applyConfig(view, m);
  }

  private applyConfig(view: EditorView, m: DocModel) {
    if (m.configKey === this.configKey) return;
    const smart = m.kind === "tex" || m.kind === "bib";
    view.dispatch({
      effects: this.compartmentValues(m.path).map(([comp, ext]) => comp.reconfigure(comp === c.completion && !smart ? [] : ext)),
    });
    m.configKey = this.configKey;
  }

  // ------------------------------------------------------------- the view

  /** Creates the shared view inside `parent` (called by the Editor component). */
  mount(parent: HTMLElement) {
    if (this.view) {
      parent.appendChild(this.view.dom);
      return;
    }
    this.configKey = this.computeConfigKey();
    const m = this.model(this.active);
    this.view = new EditorView({
      parent,
      state: m?.state ?? EditorState.create({ doc: "" }),
    });
    if (m) {
      this.applyConfig(this.view, m);
      this.view.dispatch({ effects: m.scroll ?? EditorView.scrollIntoView(this.view.state.selection.main.head, { y: "center" }) });
    }
  }

  unmount() {
    const view = this.view;
    if (!view) return;
    const m = this.model(view.state.facet(docPath));
    if (m && this.isShown(m)) {
      m.state = view.state;
      m.scroll = view.scrollSnapshot();
    }
    view.destroy();
    this.view = null;
  }

  focus() {
    requestAnimationFrame(() => this.view?.focus());
  }

  /** Flags of the shown document used by the toolbar and the start card. */
  private refreshFlags(state: EditorState) {
    const empty = state.doc.length < 400 && !state.doc.toString().trim();
    if (this.activeEmpty !== empty) this.activeEmpty = empty;
    const u = undoDepth(state) > 0;
    const r = redoDepth(state) > 0;
    if (this.canUndo !== u) this.canUndo = u;
    if (this.canRedo !== r) this.canRedo = r;
  }

  private onViewUpdate(u: ViewUpdate) {
    const path = u.state.facet(docPath);
    const m = this.model(path);
    if (!m) return;
    if (u.docChanged) {
      this.track(m, u.changes, u.startState.doc, u.state.doc);
      this.afterChange(m, u.state);
    }
    if (u.transactions.length) this.refreshFlags(u.state);
    if (u.selectionSet || u.docChanged) {
      const sel = u.state.selection;
      const head = sel.main.head;
      const line = u.state.doc.lineAt(head);
      let selected = 0;
      for (const r of sel.ranges) selected += r.to - r.from;
      this.cursor = { line: line.number, col: head - line.from + 1, selections: sel.ranges.length, selected };
      this.inTikz = m.kind === "tex" && insideTikz(u.state.doc, head);
      const heading = m.kind === "tex" ? headingOf(line.text) : null;
      if (this.lineHeading !== heading) this.lineHeading = heading;
    }
  }

  /** Book-keeping after any change of a document (shown or not). */
  private afterChange(m: DocModel, state: EditorState) {
    m.version++;
    const dirty = state.doc !== m.saved;
    this.setTabFlag(m.path, "dirty", dirty);
    if (m.kind === "tex" || m.kind === "bib") this.syncSoon(pathKey(m.path));
    const s = this.settings();
    if (s?.editor.autoSave && !m.readOnly) {
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => void this.saveAll({ silent: true, auto: true }), Math.max(300, s.editor.autoSaveDelayMs));
    }
    if (s?.build.autoBuild === "onIdle" && (m.kind === "tex" || m.kind === "bib")) {
      if (this.idleBuildTimer) clearTimeout(this.idleBuildTimer);
      this.idleBuildTimer = setTimeout(() => void build.run({ auto: true }), Math.max(400, s.build.autoBuildDelayMs));
    }
    this.wordsSoon();
  }

  private setTabFlag(path: string, flag: "dirty" | "missing", value: boolean) {
    const tab = this.tabs.find((t) => samePath(t.path, path));
    if (tab && tab[flag] !== value) tab[flag] = value;
  }

  /** Applies a transaction to an open document, shown or not. */
  private applyTo(m: DocModel, spec: TransactionSpec) {
    if (this.isShown(m)) {
      this.view!.dispatch(spec);
    } else {
      const tr = m.state.update(spec);
      const old = m.state.doc;
      m.state = tr.state;
      if (tr.docChanged) {
        this.track(m, tr.changes, old, tr.state.doc);
        this.afterChange(m, m.state);
      }
    }
  }

  // ------------------------------------------- diagnostics on their text

  /** Changes of each open document since the running build read it. */
  private sinceBuild = new Map<string, { doc: Text; changes: ChangeSet }>();

  /** A change: the diagnostics and their fixes follow the text. */
  private track(m: DocModel, changes: ChangeSet, old: Text, now: Text) {
    const key = pathKey(m.path);
    const since = this.sinceBuild.get(key);
    if (since) since.changes = since.changes.compose(changes);
    diagnostics.mapFile(key, positionMap(old, now, changes));
  }

  /** A build started: it reads the saved files. */
  buildStarted() {
    this.sinceBuild.clear();
    for (const [key, m] of this.models) {
      const now = this.stateOf(m.path)?.doc;
      if (!now) continue;
      const change = minimalChange(m.saved.toString(), now.toString());
      const same = change.from === change.to && !change.insert;
      this.sinceBuild.set(key, { doc: m.saved, changes: ChangeSet.of(same ? [] : [change], m.saved.length) });
    }
  }

  /** Moves the diagnostics of a finished build (found in the saved text) to the current text. */
  mapBuildDiagnostics(list: Diagnostic[]) {
    for (const [key, since] of this.sinceBuild) {
      const m = this.models.get(key);
      const now = m && this.stateOf(m.path)?.doc;
      if (!now || since.changes.empty) continue;
      const map = positionMap(since.doc, now, since.changes);
      for (const d of list) mapDiagnostic(d, key, map);
    }
    this.sinceBuild.clear();
  }

  // ----------------------------------------------------- engine sync

  private syncSoon(key: string) {
    const timer = this.syncTimers.get(key);
    if (timer) clearTimeout(timer);
    this.syncTimers.set(
      key,
      setTimeout(() => {
        this.syncTimers.delete(key);
        void this.sync(key);
      }, SYNC_DELAY),
    );
  }

  private async sync(key: string, force = false) {
    const m = this.models.get(key);
    if (!m || (!force && m.synced === m.version)) return;
    const state = this.stateOf(m.path)!;
    const version = m.version;
    // Clear the dirty flag when undo brought the text back to the saved one.
    if (state.doc !== m.saved && state.doc.eq(m.saved)) {
      m.saved = state.doc;
      this.setTabFlag(m.path, "dirty", false);
    }
    try {
      const res = await ipc.updateDocument(m.path, state.doc.toString(), version);
      m.synced = version;
      if (m.version === version) diagnostics.setLint(m.path, res.diagnostics);
    } catch {
      return; // no project open (loose file): no diagnostics
    }
    const now = Date.now();
    if (m.kind === "tex" && now - (this.lastMacroRefresh.get(key) ?? 0) > 2000) {
      this.lastMacroRefresh.set(key, now);
      void refreshMacros(m.path);
    }
    for (const fn of this.syncListeners) fn(m.path);
  }

  /** Sends pending changes right away (before a build or a query). */
  async flush() {
    for (const timer of this.syncTimers.values()) clearTimeout(timer);
    this.syncTimers.clear();
    await Promise.all([...this.models.values()].filter((m) => m.synced !== m.version && (m.kind === "tex" || m.kind === "bib")).map((m) => this.sync(pathKey(m.path))));
  }

  private applyDiagnostics(key: string) {
    const m = this.models.get(key);
    if (!m) return;
    const { lint, build } = diagnostics.forFile(m.path);
    const state = this.stateOf(m.path)!;
    this.applyTo(m, setDiagnostics(state, toCmDiagnostics(state.doc, [...build, ...lint])));
  }

  private async refreshWords() {
    const path = this.active;
    if (!path || fileKind(path) !== "tex") return;
    await this.flush();
    const wc = await ipc.wordCount(path).catch(() => null);
    this.words = wc ? { file: wc.file.words, project: wc.project.words } : null;
  }

  // ------------------------------------------------------ opening files

  /**
   * Opens `path` in a tab (or shows it) and optionally selects a range or
   * line. Binary files are opened with the system application.
   */
  async open(path: string, opts: { range?: Range; line?: number; focus?: boolean; background?: boolean } = {}): Promise<boolean> {
    const kind = fileKind(path);
    if (kind === "binary") {
      await ipc.openInOs(path).catch((e) => ui.toast("error", String(e)));
      return false;
    }
    let tab = this.tabs.find((t) => samePath(t.path, path));
    if (!tab) {
      const textual = kind !== "image" && kind !== "pdf";
      let readOnly = false;
      if (textual) {
        const loaded = await this.load(path);
        if (!loaded) return false;
        readOnly = loaded.readOnly;
      }
      tab = { path, name: basename(path), kind, dirty: false, missing: false, readOnly };
      const at = this.tabs.findIndex((t) => samePath(t.path, this.active));
      const next = [...this.tabs];
      next.splice(at < 0 ? next.length : at + 1, 0, tab);
      this.tabs = next;
      this.sessionSoon();
    }
    if (!opts.background) this.activate(tab.path);
    if (opts.range || opts.line) this.reveal(tab.path, opts.range ?? null, opts.line ?? null);
    if (opts.focus !== false && !opts.background) this.focus();
    return true;
  }

  private async load(path: string): Promise<DocModel | null> {
    let file;
    try {
      file = await ipc.readTextFile(path);
    } catch (e) {
      ui.toast("error", t("editor.openFailed", { file: basename(path) }), { detail: String(e) });
      return null;
    }
    const kind = fileKind(path);
    const root = project.info?.root;
    const inside = !!root && relative(root, path) !== path.replace(/\\/g, "/");
    const readOnly = !inside;
    const state = EditorState.create({ doc: file.text, extensions: this.extensions(path, kind, readOnly) });
    const m: DocModel = {
      path,
      kind,
      state,
      version: 0,
      synced: -1,
      saved: state.doc,
      modified: file.modified,
      lossy: file.lossy,
      readOnly,
      scroll: null,
      configKey: this.configKey || this.computeConfigKey(),
    };
    this.models.set(pathKey(path), m);
    if (file.lossy) ui.toast("warning", t("editor.notUtf8", { file: basename(path) }), { timeout: 9000 });
    if (!readOnly && (kind === "tex" || kind === "bib")) {
      void this.sync(pathKey(path), true);
      if (kind === "tex") void refreshMacros(path);
    }
    // Diagnostics already known for the file (project lint, last build).
    this.applyDiagnostics(pathKey(path));
    return m;
  }

  /** Shows an open tab. */
  activate(path: string) {
    const tab = this.tabs.find((t) => samePath(t.path, path));
    if (!tab) return;
    const view = this.view;
    const target = this.model(tab.path);
    const targetLive = !!target && this.isShown(target);
    if (view) {
      // Keep the live state of the document being hidden.
      const shown = this.model(view.state.facet(docPath));
      if (shown && shown !== target && this.isShown(shown)) {
        shown.state = view.state;
        shown.scroll = view.scrollSnapshot();
      }
    }
    this.active = tab.path;
    if (view && target && !targetLive) {
      view.setState(target.state);
      this.applyConfig(view, target);
      view.dispatch({ effects: target.scroll ?? EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }) });
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      this.cursor = { line: line.number, col: head - line.from + 1, selections: 1, selected: 0 };
    }
    if (view) this.refreshFlags(view.state);
    this.revision++;
    this.sessionSoon();
    this.wordsSoon();
  }

  /** Selects a range (or a whole line) and scrolls it to the middle of the view. */
  reveal(path: string, range: Range | null, line: number | null = null) {
    const m = this.model(path);
    if (!m) return;
    const state = this.stateOf(path)!;
    const doc = state.doc;
    let anchor: number;
    let head: number;
    if (range) {
      anchor = toOffset(doc, range.start);
      head = toOffset(doc, range.end);
    } else if (line) {
      const l = doc.line(Math.max(1, Math.min(line, doc.lines)));
      anchor = head = l.from + /^\s*/.exec(l.text)![0].length;
    } else {
      return;
    }
    this.applyTo(m, {
      selection: EditorSelection.single(anchor, head),
      effects: [EditorView.scrollIntoView(head, { y: "center" }), flash.of({ from: Math.min(anchor, head), to: Math.max(anchor, head) })],
    });
    if (!this.isShown(m)) m.scroll = null;
    setTimeout(() => {
      if (this.isShown(m)) this.view!.dispatch({ effects: flash.of(null) });
      else m.state = m.state.update({ effects: flash.of(null) }).state;
    }, 1600);
  }

  /** Opens a location returned by the engine. */
  async openLocation(loc: Location) {
    await this.open(loc.file, { range: loc.range });
  }

  // ------------------------------------------------------------- saving

  async save(path = this.active, opts: { silent?: boolean; auto?: boolean } = {}): Promise<boolean> {
    const m = this.model(path);
    if (!m || m.readOnly) return false;
    const state = this.stateOf(m.path)!;
    const doc = state.doc;
    if (doc === m.saved && !this.tabs.find((t) => samePath(t.path, m.path))?.missing) {
      if (!opts.auto) this.afterSave(m.path, opts);
      return true;
    }
    try {
      m.modified = await ipc.writeTextFile(m.path, doc.toString());
    } catch (e) {
      ui.toast("error", t("editor.saveFailed", { file: basename(m.path) }), { detail: String(e) });
      return false;
    }
    m.saved = doc;
    m.lossy = false;
    const now = this.stateOf(m.path)!;
    this.setTabFlag(m.path, "dirty", now.doc !== m.saved);
    this.setTabFlag(m.path, "missing", false);
    this.afterSave(m.path, opts);
    return true;
  }

  private afterSave(path: string, opts: { auto?: boolean }) {
    for (const fn of this.saveListeners) fn(path);
    const s = this.settings();
    const kind = fileKind(path);
    if (s?.build.autoBuild === "onSave" && !opts.auto && (kind === "tex" || kind === "bib")) {
      void build.run({ auto: true });
    }
  }

  async saveAll(opts: { silent?: boolean; auto?: boolean } = {}): Promise<boolean> {
    let ok = true;
    let anyTex = false;
    for (const tab of this.tabs) {
      if (!tab.dirty || tab.readOnly) continue;
      anyTex ||= tab.kind === "tex" || tab.kind === "bib";
      ok = (await this.save(tab.path, { ...opts, auto: true })) && ok;
    }
    if (!opts.auto && anyTex && this.settings()?.build.autoBuild === "onSave") {
      void build.run({ auto: true });
    }
    return ok;
  }

  // ------------------------------------------------------------- closing

  /** Closes a tab, asking what to do with unsaved changes. Returns false if cancelled. */
  async close(path: string, opts: { force?: boolean } = {}): Promise<boolean> {
    const tab = this.tabs.find((t) => samePath(t.path, path));
    if (!tab) return true;
    if (tab.dirty && !opts.force) {
      const choice = await ui.choose({
        title: t("editor.unsavedTitle", { file: tab.name }),
        message: t("editor.unsavedMessage"),
        choices: [
          { id: "save", label: t("common.save"), primary: true },
          { id: "discard", label: t("editor.dontSave"), danger: true },
          { id: "cancel", label: t("common.cancel") },
        ],
      });
      if (choice === "save") {
        if (!(await this.save(tab.path))) return false;
      } else if (choice !== "discard") {
        return false;
      }
    }
    const index = this.tabs.findIndex((t) => t === tab);
    const m = this.model(path);
    const live = this.stateOf(path);
    this.tabs = this.tabs.filter((t) => t !== tab);
    if (m) {
      const discarded = !!live && live.doc !== m.saved;
      this.models.delete(pathKey(path));
      if (m.kind === "tex" || m.kind === "bib") {
        void ipc.closeDocument(m.path).catch(() => {});
        if (discarded) project.lintSoon();
      }
    }
    if (samePath(this.active, path)) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      if (next) {
        this.activate(next.path);
      } else {
        this.active = null;
        this.view?.setState(EditorState.create({ doc: "" }));
        this.revision++;
      }
    }
    this.sessionSoon();
    return true;
  }

  async closeOthers(path: string) {
    for (const tab of [...this.tabs]) if (!samePath(tab.path, path)) if (!(await this.close(tab.path))) return;
  }

  /** Closes every tab. Returns false if the user cancelled. */
  async closeAll(): Promise<boolean> {
    const dirty = this.dirtyTabs;
    if (dirty.length > 1) {
      const choice = await ui.choose({
        title: t("editor.unsavedManyTitle", { n: dirty.length }),
        message: dirty.map((d) => d.name).join(", "),
        choices: [
          { id: "save", label: t("editor.saveAll"), primary: true },
          { id: "discard", label: t("editor.dontSave"), danger: true },
          { id: "cancel", label: t("common.cancel") },
        ],
      });
      if (choice === "save") {
        if (!(await this.saveAll())) return false;
      } else if (choice !== "discard") {
        return false;
      }
      for (const tab of [...this.tabs]) await this.close(tab.path, { force: true });
      return true;
    }
    for (const tab of [...this.tabs]) if (!(await this.close(tab.path))) return false;
    return true;
  }

  /** Forgets every document without asking (project switch after confirmation). */
  reset() {
    this.tabs = [];
    this.models.clear();
    this.active = null;
    this.words = null;
    this.view?.setState(EditorState.create({ doc: "" }));
    this.revision++;
  }

  moveTab(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= this.tabs.length || to >= this.tabs.length) return;
    const next = [...this.tabs];
    const [tab] = next.splice(from, 1);
    next.splice(to, 0, tab);
    this.tabs = next;
    this.sessionSoon();
  }

  /** Restores the tabs of a project. */
  async restore(files: string[], initial: string | null) {
    for (const f of files) await this.open(f, { background: true, focus: false });
    if (initial) await this.open(initial, { focus: false });
    else if (this.tabs[0]) this.activate(this.tabs[0].path);
  }

  // -------------------------------------------------- files changed on disk

  /** A file or folder was renamed in the project: follow it. */
  renamed(from: string, to: string) {
    const fromKey = pathKey(from);
    for (const tab of this.tabs) {
      const key = pathKey(tab.path);
      if (key !== fromKey && !key.startsWith(fromKey + "/")) continue;
      const newPath = to + tab.path.slice(from.length);
      const m = this.models.get(key);
      if (m) {
        this.models.delete(key);
        m.path = newPath;
        this.models.set(pathKey(newPath), m);
        this.applyTo(m, { effects: c.path.reconfigure(docPath.of(newPath)) });
        if (m.kind === "tex" || m.kind === "bib") {
          void ipc.closeDocument(tab.path).catch(() => {});
          m.synced = -1;
          void this.sync(pathKey(newPath), true);
        }
      }
      if (samePath(this.active, tab.path)) this.active = newPath;
      tab.path = newPath;
      tab.name = basename(newPath);
    }
    this.sessionSoon();
  }

  /** A file or folder was deleted from the project. */
  async deleted(path: string) {
    const key = pathKey(path);
    for (const tab of [...this.tabs]) {
      const k = pathKey(tab.path);
      if (k === key || k.startsWith(key + "/")) await this.close(tab.path, { force: true });
    }
  }

  /** Files changed outside RayTeX (reported by the watcher). */
  async externalChanges(paths: string[]) {
    for (const p of paths) {
      const m = this.model(p);
      if (!m) continue;
      const exists = await ipc.pathExists(m.path).catch(() => false);
      if (!exists) {
        this.setTabFlag(m.path, "missing", true);
        this.setTabFlag(m.path, "dirty", true);
        continue;
      }
      this.setTabFlag(m.path, "missing", false);
      let file;
      try {
        file = await ipc.readTextFile(m.path);
      } catch {
        continue;
      }
      const state = this.stateOf(m.path)!;
      const current = state.doc.toString();
      if (current === file.text) {
        m.saved = state.doc;
        m.modified = file.modified;
        this.setTabFlag(m.path, "dirty", false);
        continue;
      }
      const dirty = state.doc !== m.saved;
      if (!dirty) {
        this.replaceText(m, file.text, file.modified);
      } else {
        ui.toast("warning", t("editor.changedOnDisk", { file: basename(m.path) }), {
          timeout: 0,
          action: {
            label: t("editor.reload"),
            run: () => void ipc.readTextFile(m.path).then((f) => this.replaceText(m, f.text, f.modified)),
          },
        });
      }
    }
  }

  private replaceText(m: DocModel, text: string, modified: number) {
    const state = this.stateOf(m.path)!;
    this.applyTo(m, { changes: minimalChange(state.doc.toString(), text), userEvent: "reload" });
    m.saved = this.stateOf(m.path)!.doc;
    m.modified = modified;
    this.setTabFlag(m.path, "dirty", false);
  }

  // ------------------------------------------------------------- editing

  /** Replaces ranges in any file: open ones in the editor (undoable), others on disk. */
  async applyEdits(edits: TextEdit[]): Promise<number> {
    const byFile = new Map<string, TextEdit[]>();
    for (const e of edits) {
      const key = pathKey(e.file);
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(e);
    }
    const closed: TextEdit[] = [];
    for (const [key, list] of byFile) {
      const m = this.models.get(key);
      if (!m) {
        closed.push(...list);
        continue;
      }
      const doc = this.stateOf(m.path)!.doc;
      this.applyTo(m, {
        changes: list.map((e) => ({ from: toOffset(doc, e.range.start), to: toOffset(doc, e.range.end), insert: e.newText })),
        userEvent: "input.rename",
      });
    }
    if (closed.length) await ipc.applyEdits(closed);
    return byFile.size;
  }

  /** Inserts a snippet at the cursor; `${SELECTION}` receives the selected text. */
  insertSnippet(template: string, view = this.view, opts: { block?: boolean } = {}): boolean {
    if (!view || view.state.readOnly) return false;
    const sel = view.state.selection.main;
    const selected = view.state.sliceDoc(sel.from, sel.to);
    if (opts.block) {
      // A block (environment, heading) goes on lines of its own.
      const first = view.state.doc.lineAt(sel.from);
      const last = view.state.doc.lineAt(sel.to);
      if (first.text.slice(0, sel.from - first.from).trim()) template = `\n${template}`;
      if (last.text.slice(sel.to - last.from).trim()) template = `${template}\n`;
    }
    // CodeMirror indents continuation lines like the current one (tabs = one level).
    // Placeholders cannot contain braces: such a selection is inserted as plain text.
    const literal = escapeSnippet(selected);
    let body = template;
    if (/[{}]/.test(selected)) body = body.replace(/\$\{\d+:\$\{SELECTION\}\}/g, () => literal);
    body = body.replaceAll("${SELECTION}", () => literal);
    snippet(body)(view, { label: "" }, sel.from, sel.to);
    view.focus();
    return true;
  }

  /** Inserts plain text at the cursor. */
  insertText(text: string, view = this.view): boolean {
    if (!view || view.state.readOnly) return false;
    view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: "input" });
    view.focus();
    return true;
  }

  private insertMacro(view: EditorView, m: Macro): boolean {
    if (m.math && !findFormula(view.state.doc, view.state.selection.main.head)) return false;
    return this.insertSnippet(m.body, view);
  }

  private expandMacroTrigger(view: EditorView): boolean {
    const macros = this.settings()?.macros ?? [];
    if (!macros.length) return false;
    const sel = view.state.selection.main;
    if (!sel.empty) return false;
    const line = view.state.doc.lineAt(sel.head);
    const before = line.text.slice(0, sel.head - line.from);
    for (const m of macros) {
      if (!m.trigger || !before.endsWith(m.trigger)) continue;
      const start = sel.head - m.trigger.length;
      const prev = before[before.length - m.trigger.length - 1];
      // The trigger must be a whole word (or start after a space / brace).
      if (prev && /[A-Za-z0-9]/.test(prev) && /^[A-Za-z0-9]/.test(m.trigger)) continue;
      if (m.math && !findFormula(view.state.doc, sel.head)) continue;
      snippet(m.body.replaceAll("${SELECTION}", ""))(view, { label: m.trigger }, start, sel.head);
      return true;
    }
    return false;
  }

  /** Root document of `path` (or of the active file). */
  async rootOf(path: string | null = this.active): Promise<string | null> {
    if (!path) return project.info?.main ?? null;
    return (await ipc.rootOf(path).catch(() => null)) ?? project.info?.main ?? path;
  }

  /**
   * Rewrites the root document with `transform` (preamble edits) as one
   * undoable change. The root is opened in a background tab if needed.
   * Returns the root path, or null when nothing could be done.
   */
  async transformRoot(transform: (text: string) => string, from: string | null = this.active): Promise<string | null> {
    const root = await this.rootOf(from);
    if (!root) return null;
    if (!this.model(root) && !(await this.open(root, { background: true, focus: false }))) return null;
    const m = this.model(root)!;
    const before = this.stateOf(root)!.doc.toString();
    const after = transform(before);
    if (after !== before) this.applyTo(m, { changes: minimalChange(before, after), userEvent: "input.preamble" });
    return root;
  }

  /** Adds `\usepackage[options]{pkg}` to the preamble of the root document. */
  async addPackage(pkg: string, view: EditorView | null = this.view, quiet = false, options?: string): Promise<boolean> {
    const current = view?.state.facet(docPath) ?? this.active;
    let added = false;
    let missingPreamble = false;
    const root = await this.transformRoot((text) => {
      if (hasPackage(text, pkg)) return text;
      if (insertionPoint(text) === null) {
        missingPreamble = true;
        return text;
      }
      added = true;
      return addPackages(text, [{ name: pkg, options }]);
    }, current);
    if (!root || missingPreamble) {
      ui.toast("warning", t("editor.noPreamble", { pkg }));
      return false;
    }
    if (added && !quiet) ui.toast("success", t("editor.packageAdded", { pkg, file: basename(root) }));
    return true;
  }

  /** The TikZ picture under the cursor (or the picture file of an `\input` line). */
  async tikzAt(): Promise<TikzRequest | null> {
    const view = this.view;
    const path = this.active;
    if (!view || !path || fileKind(path) !== "tex") return null;
    const doc = view.state.doc;
    const pos = view.state.selection.main.head;
    const text = doc.toString();
    const envRe = /\\begin\{(tikzpicture|tikzcd|circuitikz)\}/g;
    let m: RegExpExecArray | null;
    while ((m = envRe.exec(text))) {
      const close = `\\end{${m[1]}}`;
      const end = text.indexOf(close, m.index);
      if (end < 0) break;
      const to = end + close.length;
      if (m.index <= pos && pos <= to) return { code: text.slice(m.index, to), range: { path, from: m.index, to } };
      if (m.index > pos) break;
    }
    // `\input{figures/schema.tikz}` on the current line.
    const line = doc.lineAt(pos).text;
    const input = /\\(?:input|include)\{([^}]+)\}/.exec(line);
    if (input) {
      const root = await this.rootOf(path);
      const base = root ? dirname(root) : dirname(path);
      for (const candidate of [input[1], `${input[1]}.tex`]) {
        const file = join(base, candidate);
        const content = this.textOf(file) ?? (await ipc.readTextFile(file).then((f) => f.text).catch(() => null));
        if (content && /\\begin\{(tikzpicture|tikzcd|circuitikz)\}/.test(content)) return { code: content.trimEnd(), file };
      }
    }
    return null;
  }

  /** Whether the cursor of the shown document is inside a formula. */
  inMath(): boolean {
    const view = this.view;
    if (!view) return false;
    const head = view.state.selection.main.head;
    const f = findFormula(view.state.doc, head);
    return !!f && head > f.from && head < f.to;
  }

  /** Inserts a math snippet, in `$…$` when the cursor is in text. */
  insertMath(body: string): boolean {
    return this.insertSnippet(this.inMath() ? body : `$${body}$`);
  }

  /** Undoes the last change of the shown document (wherever the focus is). */
  undo(): boolean {
    const view = this.view;
    if (!view || !this.activeTab || this.activeTab.kind === "image" || this.activeTab.kind === "pdf") return false;
    const done = undo(view);
    view.focus();
    return done;
  }

  /** Redoes the last undone change of the shown document. */
  redo(): boolean {
    const view = this.view;
    if (!view || !this.activeTab || this.activeTab.kind === "image" || this.activeTab.kind === "pdf") return false;
    const done = redo(view);
    view.focus();
    return done;
  }

  /** Replaces the whole text of an open document, as one undoable change. */
  setText(path: string, text: string, cursor = 0) {
    const m = this.model(path);
    if (!m) return;
    const state = this.stateOf(m.path)!;
    this.applyTo(m, {
      changes: { from: 0, to: state.doc.length, insert: text },
      selection: EditorSelection.cursor(Math.min(cursor, text.length)),
      userEvent: "input.replace",
      scrollIntoView: true,
    });
  }

  /** Replaces a range of an open document. */
  replaceRange(path: string, from: number, to: number, text: string) {
    const m = this.model(path);
    if (!m) return;
    this.applyTo(m, { changes: { from, to, insert: text }, userEvent: "input.replace", scrollIntoView: true });
  }

  /** Inserts or replaces the `% !TEX program = …` magic comment of the root document. */
  async setMagicProgram(engine: string) {
    const current = this.active;
    const root = (current && (await ipc.rootOf(current).catch(() => null))) ?? project.info?.main;
    if (!root) return;
    if (!this.model(root) && !(await this.open(root, { background: true, focus: false }))) return;
    const m = this.model(root)!;
    const doc = this.stateOf(root)!.doc;
    const magic = `% !TEX program = ${engine}`;
    for (let n = 1; n <= Math.min(doc.lines, 20); n++) {
      const l = doc.line(n);
      if (/^%\s*!\s*TEX\s+(TS-)?program\s*=/i.test(l.text)) {
        this.applyTo(m, { changes: { from: l.from, to: l.to, insert: magic } });
        return;
      }
    }
    this.applyTo(m, { changes: { from: 0, insert: `${magic}\n` } });
  }

  // ---------------------------------------------------------- navigation

  private onMouseDown(e: MouseEvent, view: EditorView): boolean {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (!mod || e.button !== 0 || e.altKey || e.shiftKey) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null || !navigableAt(view.state, pos)) return false;
    e.preventDefault();
    void this.goToDefinition(view, pos);
    return true;
  }

  async goToDefinition(view: EditorView | null = this.view, pos?: number): Promise<void> {
    if (!view) return;
    const path = view.state.facet(docPath);
    const at = pos ?? view.state.selection.main.head;
    await this.flush();
    const p = toPosition(view.state.doc, at);
    const locs = await ipc.definition(path, p.line, p.character).catch(() => []);
    if (!locs.length) {
      ui.toast("info", t("editor.noDefinition"));
      return;
    }
    await this.openLocation(locs[0]);
  }

  async findReferences(view: EditorView | null = this.view): Promise<void> {
    if (!view) return;
    const path = view.state.facet(docPath);
    await this.flush();
    const head = view.state.selection.main.head;
    const p = toPosition(view.state.doc, head);
    const locs = await ipc.references(path, p.line, p.character).catch(() => []);
    const sym = symbolAt(view.state, head)?.text ?? "";
    await searchStore.showLocations(t("search.referencesOf", { name: sym }), locs);
  }

  async rename(view: EditorView | null = this.view): Promise<void> {
    if (!view) return;
    const path = view.state.facet(docPath);
    const head = view.state.selection.main.head;
    const sym = symbolAt(view.state, head);
    if (!sym) {
      ui.toast("info", t("editor.nothingToRename"));
      return;
    }
    const current = sym.text.replace(/^\\/, "");
    const name = await ui.prompt({ title: t("editor.renameTitle", { name: sym.text }), value: current, okLabel: t("editor.rename") });
    if (!name || name === current) return;
    await this.flush();
    const p = toPosition(view.state.doc, head);
    let edits: TextEdit[];
    try {
      edits = await ipc.renameSymbol(path, p.line, p.character, name.replace(/^\\/, ""));
    } catch (e) {
      ui.toast("info", t("editor.nothingToRename"), { detail: String(e) });
      return;
    }
    const files = await this.applyEdits(edits);
    ui.toast("success", t("editor.renamed", { n: edits.length, files }));
  }

  /** Source → PDF. */
  async syncForward(quiet = false) {
    const view = this.view;
    const path = this.active;
    if (!view || !path || fileKind(path) !== "tex") return;
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    await viewer.forward(path, line, quiet);
  }

  // -------------------------------------------------------------- images

  /** A file dragged from the project tree: insert the matching command where it is dropped. */
  private onDrop(e: DragEvent, view: EditorView): boolean {
    const path = e.dataTransfer?.getData("application/x-raytex-path");
    if (!path || view.state.readOnly) return false;
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos !== null) view.dispatch({ selection: { anchor: pos } });
    view.focus();
    let paths = [path];
    try {
      paths = JSON.parse(e.dataTransfer?.getData("application/x-raytex-paths") || "null") ?? paths;
    } catch {
      /* one file */
    }
    void this.insertFileReferences(view, paths);
    return true;
  }

  private onPaste(e: ClipboardEvent, view: EditorView): boolean {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length || fileKind(view.state.facet(docPath)) !== "tex") return false;
    e.preventDefault();
    void this.pasteImage(view, files[0]);
    return true;
  }

  /** A pasted image: the image dialog opens with it (folder, name, size, caption). */
  async pasteImage(_view: EditorView, file: File): Promise<boolean> {
    if (!project.info) return false;
    media.openImages({ blobs: [file] });
    return true;
  }

  /** Inserts the right command for a project file dropped into the editor. */
  async insertFileReference(view: EditorView, path: string) {
    return this.insertFileReferences(view, [path]);
  }

  /** Images go to the image window (together); other files become `\\input`, `\\addbibresource` or paths. */
  async insertFileReferences(view: EditorView, paths: string[]) {
    const isImage = (p: string) => fileKind(p) === "image" || /\.(pdf|eps)$/i.test(p);
    const current = view.state.facet(docPath);
    const root = (await ipc.rootOf(current).catch(() => null)) ?? project.info?.main ?? current;
    const lines = paths
      .filter((p) => !isImage(p))
      .map((path) => {
        const rel = relative(dirname(root), path);
        const kind = fileKind(path);
        if (kind === "tex") return `\\input{${rel.replace(/\.tex$/, "")}}`;
        if (kind === "bib") return `\\addbibresource{${rel}}`;
        return rel;
      });
    if (lines.length) this.insertText(lines.join("\n"), view);
    const images = paths.filter(isImage);
    if (images.length) media.openImages({ paths: images });
  }
}

export const editor = new EditorStore();
