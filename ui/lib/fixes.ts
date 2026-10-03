// Automatic fixes attached to diagnostics (lint and build): one at a time,
// all at once ("Fix all"), or from the cursor (Alt+Enter).

import type { EditorView } from "@codemirror/view";
import { t } from "./i18n.svelte";
import { installMissing } from "./install";
import * as ipc from "./ipc";
import { addLines, addPackageOption, addTikzLibraries } from "./preamble";
import { build } from "./state/build.svelte";
import { diagnostics } from "./state/diagnostics.svelte";
import { editor } from "./state/editor.svelte";
import { project } from "./state/project.svelte";
import { type MenuItem, ui } from "./state/ui.svelte";
import type { Diagnostic, Fix, Position, Range, TextEdit } from "./types";
import { join } from "./utils";

/** The cause of a problem of the compiler, found in the sources by the
 *  engine, with what to write instead; null when it only knows what the
 *  message means (nothing is guessed). */
export function causeOf(d: Diagnostic): string | null {
  const hint: { title: string; explanation: string; advice?: string | null } | null = d.hint;
  return hint?.advice ?? null;
}

/** What to suggest for a problem: the cause found in the sources, or the
 *  explanation of a live check (it knows the exact place by itself). The
 *  meaning of a compiler message alone is not a suggestion. */
export function suggestionOf(d: Diagnostic): string | null {
  if (!d.hint) return null;
  return causeOf(d) ?? (d.source === "lint" || d.source === "syntax" ? d.hint.explanation : null);
}

export function fixLabel(fix: Fix): string {
  switch (fix.kind) {
    case "addPackage":
      return fix.options ? t("fix.addPackageWith", { pkg: fix.package, options: fix.options }) : t("fix.addPackage", { pkg: fix.package });
    case "addPackageOption":
      return t("fix.addOption", { option: fix.option, pkg: fix.package });
    case "addToPreamble":
    case "replace":
    case "edits":
      return fix.title;
    case "addTikzLibrary":
      return t("fix.tikzLibrary", { library: fix.library });
    case "installPackage":
      return t("fix.install", { name: fix.file });
    case "useEngine":
      return t("fix.useEngine", { engine: fix.engine });
    case "enableShellEscape":
      return t("fix.shellEscape");
    case "createFile":
      return t("fix.createFile", { path: fix.path });
    case "rebuild":
      return t("fix.rebuild");
    case "openDoc":
      return t("fix.openDoc", { pkg: fix.package });
  }
}

/** Icon of the button of a fix. */
export function fixIcon(fix: Fix): string {
  if (fix.kind === "openDoc") return "book";
  if (fix.kind === "rebuild") return "refresh";
  if (fix.kind === "installPackage") return "download";
  return "wand";
}

/** Fixes applied without asking (not an installation, a security setting or a documentation page). */
export function isAutomatic(fix: Fix): boolean {
  return fix.kind !== "installPackage" && fix.kind !== "enableShellEscape" && fix.kind !== "openDoc";
}

/** The fix "Fix all" applies to a diagnostic: its first automatic one. */
export function autoFix(d: Diagnostic): Fix | undefined {
  const fix = d.fixes.find(isAutomatic);
  if (fix?.kind === "rebuild") return undefined;
  // Not the settings that change the spacing of the whole document for a
  // line that is too long (often the consequence of another error).
  if (d.code === "overfull-box" && fix && fix.kind !== "edits") return undefined;
  return fix;
}

export async function runFix(fix: Fix, d: Diagnostic): Promise<void> {
  if (await apply(fix, d)) diagnostics.dismiss(d);
}

function edit(file: string, range: Range, newText: string): TextEdit {
  return { file, range, newText };
}

/** Text edits of a fix (empty for the fixes of the preamble). */
function textEdits(fix: Fix, d: Diagnostic): TextEdit[] {
  if (fix.kind === "replace") return d.file ? [edit(d.file, fix.range, fix.text)] : [];
  if (fix.kind === "edits") return fix.edits.map((e) => edit(e.file, e.range, e.text));
  return [];
}

async function applyPreamble(fix: Fix, quiet: boolean): Promise<boolean> {
  switch (fix.kind) {
    case "addPackage":
      return editor.addPackage(fix.package, undefined, quiet, fix.options);
    case "addPackageOption":
      return (await editor.transformRoot((text) => addPackageOption(text, fix.package, fix.option))) !== null;
    case "addToPreamble":
      return (await editor.transformRoot((text) => addLines(text, [fix.code], fix.after))) !== null;
    case "addTikzLibrary":
      return (await editor.transformRoot((text) => addTikzLibraries(text, [fix.library]))) !== null;
    default:
      return false;
  }
}

/** Applies a fix; resolves with whether it was applied. */
async function apply(fix: Fix, d: Diagnostic): Promise<boolean> {
  switch (fix.kind) {
    case "addPackage":
    case "addPackageOption":
    case "addToPreamble":
    case "addTikzLibrary": {
      if (d.file && !editor.isOpen(d.file)) await editor.open(d.file);
      return applyPreamble(fix, false);
    }
    case "installPackage": {
      if (!(await installMissing(fix.file))) return false;
      void build.run();
      return true;
    }
    case "replace":
    case "edits": {
      const edits = textEdits(fix, d);
      if (!edits.length) return false;
      const first = edits[0];
      await editor.open(first.file, { range: first.range });
      await editor.applyEdits(sorted(edits));
      editor.focus();
      return true;
    }
    case "useEngine": {
      await editor.setMagicProgram(fix.engine);
      ui.toast("success", t("fix.engineSet", { engine: fix.engine }));
      void build.run();
      return true;
    }
    case "enableShellEscape": {
      const ok = await ui.confirm({
        title: t("fix.shellEscapeTitle"),
        message: t("fix.shellEscapeMessage"),
        okLabel: t("fix.shellEscapeConfirm"),
        danger: true,
      });
      if (!ok) return false;
      await project.updateConfig((c) => {
        c.build.shell_escape = true;
      });
      void build.run();
      return true;
    }
    case "createFile":
      return createFile(fix.path, true);
    case "rebuild":
      void build.run();
      return true;
    case "openDoc":
      void ipc.openTexdoc(fix.package).then((ok) => {
        if (!ok) ui.toast("warning", t("fix.noDoc", { pkg: fix.package }));
      });
      return false;
  }
}

async function createFile(path: string, open: boolean): Promise<boolean> {
  const root = project.info?.root;
  if (!root) return false;
  try {
    const created = await ipc.createFile(join(root, path));
    if (open) await editor.open(created);
    return true;
  } catch (e) {
    ui.toast("error", String(e));
    return false;
  }
}

const before = (a: Position, b: Position) => a.line < b.line || (a.line === b.line && a.character < b.character);
const same = (a: Position, b: Position) => a.line === b.line && a.character === b.character;

function sorted(edits: TextEdit[]): TextEdit[] {
  return [...edits].sort((a, b) => a.file.localeCompare(b.file) || (before(a.range.start, b.range.start) ? -1 : same(a.range.start, b.range.start) ? 0 : 1));
}

/** Whether two edits of the same file touch the same text. */
function conflict(a: TextEdit, b: TextEdit): boolean {
  if (a.file !== b.file) return false;
  // Two insertions at the same place, or overlapping replacements.
  if (same(a.range.start, a.range.end) && same(b.range.start, b.range.end)) return same(a.range.start, b.range.start);
  return before(a.range.start, b.range.end) && before(b.range.start, a.range.end);
}

/** Diagnostics "Fix all" can fix. */
export function fixable(list: Diagnostic[]): Diagnostic[] {
  return list.filter((d) => autoFix(d));
}

/**
 * Applies the first automatic fix of every diagnostic of `list` as one
 * operation: text edits first (their ranges refer to the current text),
 * then the preamble fixes (recomputed on the new text), then a build.
 * A fix whose edits are already applied by another one (the same problem
 * found by the live checks and by the compiler) counts as done; a fix that
 * would touch the same text as another is left for the next round.
 */
export async function fixAll(list: Diagnostic[]): Promise<number> {
  const edits: TextEdit[] = [];
  const keys = new Set<string>();
  const preamble: Fix[] = [];
  const preambleKeys = new Set<string>();
  const files: string[] = [];
  let engine: string | null = null;
  const done: Diagnostic[] = [];
  for (const d of list) {
    const fix = autoFix(d);
    if (!fix) continue;
    if (fix.kind === "replace" || fix.kind === "edits") {
      const mine = textEdits(fix, d);
      const fresh = mine.filter((e) => !keys.has(JSON.stringify(e)));
      if (fresh.some((e) => edits.some((o) => conflict(e, o)))) continue;
      for (const e of fresh) {
        keys.add(JSON.stringify(e));
        edits.push(e);
      }
    } else if (fix.kind === "useEngine") {
      if (engine && engine !== fix.engine) continue;
      engine = fix.engine;
    } else if (fix.kind === "createFile") {
      if (!files.includes(fix.path)) files.push(fix.path);
    } else {
      const key = JSON.stringify(fix);
      if (!preambleKeys.has(key)) {
        preambleKeys.add(key);
        preamble.push(fix);
      }
    }
    done.push(d);
  }
  if (!done.length) return 0;
  if (edits.length) await editor.applyEdits(sorted(edits));
  for (const fix of preamble) await applyPreamble(fix, true);
  for (const path of files) await createFile(path, false);
  if (engine) await editor.setMagicProgram(engine);
  for (const d of done) diagnostics.dismiss(d);
  void build.run();
  return done.length;
}

/** Every diagnostic shown (last build and live checks). */
export function allDiagnostics(): Diagnostic[] {
  return diagnostics.grouped.flatMap((g) => g.items);
}

/** "Fix all" with a message saying what happened. */
export async function fixAllAndReport(list: Diagnostic[] = allDiagnostics()): Promise<void> {
  const n = await fixAll(list);
  if (n) ui.toast("success", t("problems.fixedN", { n }), { detail: t("problems.fixedDetail") });
  else ui.toast("info", t("problems.nothingToFix"));
}

/** Offset of a position in a CodeMirror document. */
function offset(view: EditorView, p: Position): number {
  const doc = view.state.doc;
  if (p.line + 1 > doc.lines) return doc.length;
  const line = doc.line(p.line + 1);
  return Math.min(line.from + p.character, line.to);
}

/** Fixes of the problems at the cursor, in a menu next to it (Alt+Enter). */
export function quickFix(view: EditorView, path: string): boolean {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const { lint, build: built } = diagnostics.forFile(path);
  const all = [...built, ...lint];
  const span = (d: Diagnostic): [number, number] | null => {
    if (d.range) return [offset(view, d.range.start), offset(view, d.range.end)];
    if (d.line && d.line <= view.state.doc.lines) {
      const l = view.state.doc.line(d.line);
      return [l.from, l.to];
    }
    return null;
  };
  const at = all.filter((d) => {
    const s = span(d);
    return s && s[0] <= pos && pos <= s[1];
  });
  const here = at.length ? at : all.filter((d) => {
    const s = span(d);
    return s && s[0] <= line.to && s[1] >= line.from;
  });
  const coords = view.coordsAtPos(pos);
  const x = coords?.left ?? 200;
  const y = (coords?.bottom ?? 200) + 4;
  if (!here.length) {
    ui.toast("info", t("fix.nothingHere"));
    return true;
  }
  const items: MenuItem[] = here.flatMap((d) =>
    d.fixes.map((fix) => ({ label: fixLabel(fix), icon: fixIcon(fix), run: () => void runFix(fix, d) })),
  );
  if (items.length) items.push({ separator: true });
  items.push({ label: t("fix.showProblem"), icon: "alert-circle", run: () => ui.showBottom("problems") });
  ui.menu = { x, y, items };
  return true;
}
