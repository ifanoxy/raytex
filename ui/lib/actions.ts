// Every command of the application, in one registry: the command palette,
// menus and keyboard shortcuts (customisable in the settings) all use it.
//
// Global actions are matched on window key events (capture phase, so they
// win over the editor). Editor actions live in the CodeMirror keymap and
// receive the view.

import { toggleComment } from "@codemirror/commands";
import { gotoLine, openSearchPanel } from "@codemirror/search";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { REPOSITORY_URL } from "./constants";
import { matchesKey } from "./keys";
import { setAlignment, setList } from "./editor/format";
import { wrapCommand, wrapEnvironment, wrapMath } from "./editor/structure";
import { type MessageKey, t } from "./i18n.svelte";
import { confirmAndRun } from "./install";
import * as ipc from "./ipc";
import { app } from "./state/app.svelte";
import { build } from "./state/build.svelte";
import { editor } from "./state/editor.svelte";
import { media } from "./state/media.svelte";
import { project } from "./state/project.svelte";
import { searchStore } from "./state/search.svelte";
import { tex } from "./state/tex.svelte";
import { ui } from "./state/ui.svelte";
import { viewer } from "./state/viewer.svelte";
import { fileKind, isMac } from "./utils";

export type Category = "file" | "edit" | "insert" | "build" | "view" | "navigate" | "tex" | "help";

export interface Action {
  id: string;
  title: MessageKey;
  category: Category;
  /** Default shortcut, in CodeMirror notation (`Mod-Shift-p`). */
  keys?: string;
  /** Other shortcuts doing the same (not customisable): `Mod-y` for redo. */
  altKeys?: string[];
  /** Runs inside the editor (receives the view, only when a text file is shown). */
  editor?: boolean;
  icon?: string;
  /** Hidden from the palette when false. */
  when?: () => boolean;
  run: (view?: EditorView) => unknown;
}

const hasProject = () => !!project.info;
const hasText = () => !!editor.activeTab && editor.activeTab.kind !== "image" && editor.activeTab.kind !== "pdf";
const hasTex = () => hasText() && fileKind(editor.active ?? "") === "tex";
const hasPdf = () => !!viewer.pdf;
/** The PDF viewer handles its own zoom shortcuts when focused. */
const notInPdf = () => !document.activeElement?.closest(".pdf-viewer");
/**
 * Undo/redo of the document: everywhere except in text fields and other
 * editors (dialogs, the TikZ studio), which keep their own history.
 */
const documentHistory = () => {
  if (!hasText() || ui.overlay || ui.dialog) return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return true;
  if (el.closest(".cm-editor")) return !!editor.view?.dom.contains(el) && !el.closest(".cm-panel");
  return !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable);
};
/** Indentation unit of the editor. */
const unit = () => {
  const s = app.settings?.editor;
  return s?.useTabs ? "\t" : " ".repeat(s?.tabSize ?? 2);
};

/** Runs `fn` with the editor view when a text file is shown. */
function withView(fn: (view: EditorView) => unknown) {
  return (view?: EditorView) => {
    const v = view ?? (hasText() ? editor.view : null);
    if (!v) return false;
    fn(v);
    return true;
  };
}

/** Environments and headings are blocks: they go on lines of their own. */
const isBlock = (body: string) => /^\\(begin|part|chapter|section|subsection)\b/.test(body);

function snippetAction(id: string, title: MessageKey, body: () => string, when = hasTex): Action {
  return { id, title, category: "insert", editor: true, when, run: withView((v) => editor.insertSnippet(body(), v, { block: isBlock(body()) })) };
}

function zoomEditor(delta: number | null) {
  void app.update((s) => {
    s.editor.fontSize = delta === null ? 14 : Math.min(32, Math.max(9, s.editor.fontSize + delta));
  });
}

export const actions: Action[] = [
  // ------------------------------------------------------------- file
  { id: "project.new", title: "action.newProject", category: "file", keys: "Mod-Shift-n", icon: "folder-plus", run: () => ui.openOverlay("newProject") },
  { id: "project.open", title: "action.openProject", category: "file", keys: "Mod-o", icon: "folder-open", run: () => project.openFolderDialog() },
  { id: "project.openFile", title: "action.openFile", category: "file", icon: "file", run: () => project.openFileDialog() },
  { id: "project.close", title: "action.closeProject", category: "file", when: hasProject, run: () => project.close() },
  { id: "file.new", title: "action.newFile", category: "file", icon: "file-plus", when: hasProject, run: () => project.newFile() },
  { id: "file.newFolder", title: "action.newFolder", category: "file", icon: "folder-plus", when: hasProject, run: () => project.newFolder() },
  { id: "file.import", title: "action.importFiles", category: "file", icon: "download", when: hasProject, run: () => project.importDialog() },
  { id: "file.save", title: "action.save", category: "file", keys: "Mod-s", icon: "save", when: hasText, run: () => editor.save() },
  { id: "file.saveAll", title: "action.saveAll", category: "file", keys: "Mod-Alt-s", when: () => editor.tabs.length > 0, run: () => editor.saveAll() },
  { id: "file.close", title: "action.closeTab", category: "file", keys: "Mod-w", when: () => !!editor.active, run: () => editor.active && editor.close(editor.active) },
  { id: "file.closeAll", title: "action.closeAllTabs", category: "file", when: () => editor.tabs.length > 0, run: () => editor.closeAll() },
  { id: "file.reveal", title: "action.revealInOs", category: "file", when: () => !!editor.active, run: () => editor.active && ipc.revealInOs(editor.active) },
  { id: "project.saveAsTemplate", title: "action.saveAsTemplate", category: "file", when: hasProject, run: () => project.saveAsTemplate() },
  { id: "project.settings", title: "action.projectSettings", category: "file", when: hasProject, run: () => ui.openSettings("project") },

  // ------------------------------------------------------------ build
  { id: "build.run", title: "action.build", category: "build", keys: "Mod-Enter", icon: "play", when: hasProject, run: () => build.run() },
  { id: "build.cancel", title: "action.cancelBuild", category: "build", keys: "Mod-.", icon: "stop", when: () => build.running, run: () => build.cancel() },
  { id: "build.clean", title: "action.cleanBuild", category: "build", icon: "broom", when: hasProject, run: () => build.clean() },
  { id: "build.setMain", title: "action.setMain", category: "build", icon: "star", when: hasTex, run: () => editor.active && project.setMain(editor.active) },
  { id: "build.log", title: "action.openLog", category: "build", icon: "file", when: () => !!build.outcome, run: () => build.openLog() },
  { id: "build.output", title: "action.showOutput", category: "build", keys: "Mod-Shift-u", icon: "terminal", run: () => ui.showBottom("output") },
  { id: "build.problems", title: "action.showProblems", category: "build", icon: "alert-circle", run: () => ui.showBottom("problems") },
  { id: "build.live", title: "action.toggleLiveBuild", category: "build", icon: "bolt", run: () => toggleLiveBuild() },
  { id: "pdf.export", title: "action.exportPdf", category: "build", icon: "download", when: hasPdf, run: () => viewer.exportPdf() },
  { id: "pdf.external", title: "action.openPdfExternal", category: "build", icon: "external", when: hasPdf, run: () => viewer.openExternal() },

  // ------------------------------------------------------------- view
  { id: "view.palette", title: "action.palette", category: "view", keys: "Mod-Shift-p", icon: "command", run: () => openPalette("commands") },
  { id: "view.quickOpen", title: "action.quickOpen", category: "view", keys: "Mod-p", icon: "search", when: hasProject, run: () => openPalette("files") },
  { id: "view.settings", title: "action.settings", category: "view", keys: "Mod-,", icon: "settings", run: () => (ui.overlay === "settings" ? ui.closeOverlay() : ui.openSettings()) },
  { id: "view.sidebar", title: "action.toggleSidebar", category: "view", keys: "Mod-Alt-b", icon: "panel-left", run: () => toggleSidebar() },
  { id: "view.panel", title: "action.togglePanel", category: "view", keys: "Mod-j", icon: "panel-bottom", run: () => ui.toggleBottom() },
  { id: "view.pdf", title: "action.togglePdf", category: "view", keys: "Mod-Alt-p", icon: "panel-right", run: () => togglePdf() },
  { id: "view.files", title: "action.showFiles", category: "view", keys: "Mod-Shift-e", icon: "files", run: () => ui.showSidebar("files") },
  { id: "view.outline", title: "action.showOutline", category: "view", keys: "Mod-Shift-o", icon: "outline", run: () => ui.showSidebar("outline") },
  { id: "view.search", title: "action.searchProject", category: "view", keys: "Mod-Shift-f", icon: "search", when: hasProject, run: () => searchStore.focus() },
  { id: "view.symbols", title: "action.showSymbols", category: "view", icon: "sigma", run: () => ui.showSidebar("symbols") },
  { id: "view.snippets", title: "action.showSnippets", category: "view", icon: "snippets", run: () => ui.showSidebar("snippets") },
  { id: "view.packages", title: "action.showPackages", category: "view", icon: "packages", run: () => ui.showSidebar("packages") },
  { id: "view.templates", title: "action.showTemplates", category: "view", icon: "template", when: hasProject, run: () => ui.showSidebar("templates") },
  { id: "view.formatBar", title: "action.toggleFormatBar", category: "view", icon: "type", run: () => ui.toggleFormatBar() },
  { id: "view.zoomIn", title: "action.zoomIn", category: "view", keys: "Mod-=", icon: "zoom-in", when: notInPdf, run: () => zoomEditor(1) },
  { id: "view.zoomOut", title: "action.zoomOut", category: "view", keys: "Mod--", icon: "zoom-out", when: notInPdf, run: () => zoomEditor(-1) },
  { id: "view.zoomReset", title: "action.zoomReset", category: "view", keys: "Mod-0", when: notInPdf, run: () => zoomEditor(null) },
  {
    id: "view.theme",
    title: "action.toggleTheme",
    category: "view",
    icon: "moon",
    run: () => app.update((s) => (s.general.theme = app.theme === "dark" ? "light" : "dark")),
  },

  // --------------------------------------------------------- navigate
  { id: "nav.definition", title: "action.goToDefinition", category: "navigate", keys: "F12", editor: true, when: hasTex, run: withView((v) => editor.goToDefinition(v)) },
  { id: "nav.references", title: "action.findReferences", category: "navigate", keys: "Shift-F12", editor: true, when: hasTex, run: withView((v) => editor.findReferences(v)) },
  { id: "nav.rename", title: "action.rename", category: "navigate", keys: "F2", editor: true, when: hasTex, run: withView((v) => editor.rename(v)) },
  { id: "nav.syncForward", title: "action.syncForward", category: "navigate", keys: "Mod-Alt-j", icon: "sync", when: hasTex, run: () => editor.syncForward() },
  { id: "nav.find", title: "action.find", category: "navigate", editor: true, when: hasText, run: withView((v) => openSearchPanel(v)) },
  { id: "nav.goToLine", title: "action.goToLine", category: "navigate", keys: "Mod-l", editor: true, when: hasText, run: withView((v) => gotoLine(v)) },

  // ------------------------------------------------------------- edit
  { id: "edit.undo", title: "action.undo", category: "edit", keys: "Mod-z", icon: "undo", when: documentHistory, run: () => editor.undo() },
  { id: "edit.redo", title: "action.redo", category: "edit", keys: "Mod-Shift-z", altKeys: ["Mod-y"], icon: "redo", when: documentHistory, run: () => editor.redo() },
  { id: "edit.bold", title: "action.bold", category: "edit", keys: "Mod-b", editor: true, when: hasTex, run: withView((v) => wrapCommand(v, "textbf")) },
  { id: "edit.italic", title: "action.italic", category: "edit", keys: "Mod-i", editor: true, when: hasTex, run: withView((v) => wrapCommand(v, "textit")) },
  { id: "edit.emph", title: "action.emph", category: "edit", keys: "Mod-e", editor: true, when: hasTex, run: withView((v) => wrapCommand(v, "emph")) },
  { id: "edit.underline", title: "action.underline", category: "edit", keys: "Mod-u", editor: true, when: hasTex, run: withView((v) => wrapCommand(v, "underline")) },
  { id: "edit.typewriter", title: "action.typewriter", category: "edit", editor: true, when: hasTex, run: withView((v) => wrapCommand(v, "texttt")) },
  { id: "edit.smallcaps", title: "action.smallcaps", category: "edit", editor: true, when: hasTex, run: withView((v) => wrapCommand(v, "textsc")) },
  { id: "edit.math", title: "action.inlineMath", category: "edit", keys: "Mod-Shift-m", editor: true, when: hasTex, run: withView((v) => wrapMath(v)) },
  { id: "edit.comment", title: "action.toggleComment", category: "edit", editor: true, when: hasText, run: withView((v) => toggleComment(v)) },
  { id: "edit.bulletList", title: "action.bulletList", category: "edit", keys: "Mod-Shift-8", editor: true, icon: "list", when: hasTex, run: withView((v) => setList(v, "itemize", unit())) },
  { id: "edit.numberedList", title: "action.numberedList", category: "edit", keys: "Mod-Shift-7", editor: true, icon: "list-ordered", when: hasTex, run: withView((v) => setList(v, "enumerate", unit())) },
  { id: "edit.alignLeft", title: "action.alignLeft", category: "edit", editor: true, icon: "align-left", when: hasTex, run: withView((v) => setAlignment(v, "flushleft", unit())) },
  { id: "edit.alignCenter", title: "action.alignCenter", category: "edit", editor: true, icon: "align-center", when: hasTex, run: withView((v) => setAlignment(v, "center", unit())) },
  { id: "edit.alignRight", title: "action.alignRight", category: "edit", editor: true, icon: "align-right", when: hasTex, run: withView((v) => setAlignment(v, "flushright", unit())) },
  { id: "edit.alignJustify", title: "action.alignJustify", category: "edit", editor: true, icon: "align-justify", when: hasTex, run: withView((v) => setAlignment(v, null, unit())) },
  {
    id: "edit.wrapEnv",
    title: "action.wrapEnvironment",
    category: "edit",
    keys: "Mod-Shift-w",
    editor: true,
    when: hasTex,
    run: withView(async (v) => {
      const env = await ui.prompt({ title: t("action.wrapEnvironment"), value: "center", okLabel: t("common.ok") });
      if (env) wrapEnvironment(v, env.trim());
      v.focus();
    }),
  },

  // ----------------------------------------------------------- insert
  snippetAction("insert.section", "action.insertSection", () => `\\section{\${1:\${SELECTION}}}\n\${0}`),
  snippetAction("insert.subsection", "action.insertSubsection", () => `\\subsection{\${1:\${SELECTION}}}\n\${0}`),
  snippetAction(
    "insert.figure",
    "action.insertFigure",
    () =>
      `\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{\${1:${t("snippet.file")}}}\n\t\\caption{\${2:${t("snippet.caption")}}}\n\t\\label{fig:\${3:label}}\n\\end{figure}\${0}`,
  ),
  snippetAction(
    "insert.table",
    "action.insertTable",
    () =>
      `\\begin{table}[htbp]\n\t\\centering\n\t\\caption{\${1:${t("snippet.caption")}}}\n\t\\label{tab:\${2:label}}\n\t\\begin{tabular}{\${3:lcc}}\n\t\t\\toprule\n\t\t\${4:A} & \${5:B} & \${6:C} \\\\\n\t\t\\midrule\n\t\t\${7} &  &  \\\\\n\t\t\\bottomrule\n\t\\end{tabular}\n\\end{table}\${0}`,
  ),
  snippetAction("insert.equation", "action.insertEquation", () => `\\begin{equation}\n\t\${1:\${SELECTION}}\n\t\\label{eq:\${2:label}}\n\\end{equation}\${0}`),
  snippetAction("insert.align", "action.insertAlign", () => `\\begin{align}\n\t\${1:a} &= \${2:b} \\\\\n\t\${3:c} &= \${4:d}\n\\end{align}\${0}`),
  snippetAction("insert.itemize", "action.insertItemize", () => `\\begin{itemize}\n\t\\item \${1:\${SELECTION}}\n\\end{itemize}\${0}`),
  snippetAction("insert.enumerate", "action.insertEnumerate", () => `\\begin{enumerate}\n\t\\item \${1:\${SELECTION}}\n\\end{enumerate}\${0}`),
  snippetAction("insert.frame", "action.insertFrame", () => `\\begin{frame}{\${1:${t("snippet.title")}}}\n\t\${2:\${SELECTION}}\n\\end{frame}\${0}`),
  snippetAction("insert.footnote", "action.insertFootnote", () => `\\footnote{\${1:\${SELECTION}}}\${0}`),
  snippetAction("insert.cite", "action.insertCitation", () => `\\cite{\${1}}\${0}`),
  snippetAction("insert.ref", "action.insertReference", () => `\\ref{\${1}}\${0}`),
  snippetAction("insert.link", "action.insertLink", () => `\\href{\${1:https://}}{\${2:\${SELECTION}}}\${0}`),
  { id: "insert.image", title: "action.insertImage", category: "insert", keys: "Mod-Alt-i", icon: "image", when: hasTex, run: () => media.openImages() },
  { id: "insert.tikz", title: "action.tikzStudio", category: "insert", keys: "Mod-Alt-t", icon: "sparkles", when: hasProject, run: () => openTikz() },
  { id: "format.fonts", title: "action.fonts", category: "edit", icon: "type", when: hasProject, run: () => media.openFonts() },

  // -------------------------------------------------------------- TeX
  { id: "tex.setup", title: "action.texSetup", category: "tex", icon: "wand", run: () => ui.openOverlay("setup") },
  { id: "tex.detect", title: "action.texDetect", category: "tex", icon: "refresh", run: () => tex.detect() },
  {
    id: "tex.update",
    title: "action.texUpdate",
    category: "tex",
    icon: "download",
    when: () => tex.ready,
    run: () => confirmAndRun({ kind: "updateAll" }, t("action.texUpdate")),
  },

  // ------------------------------------------------------------- help
  { id: "help.open", title: "action.help", category: "help", keys: "F1", icon: "help", run: () => ui.openHelp() },
  { id: "help.shortcuts", title: "action.shortcuts", category: "help", icon: "keyboard", run: () => ui.openHelp("shortcuts") },
  { id: "help.symbols", title: "action.symbolReference", category: "help", icon: "sigma", run: () => ui.openHelp("symbols") },
  { id: "help.errors", title: "action.errorReference", category: "help", icon: "bug", run: () => ui.openHelp("errors") },
  { id: "help.website", title: "action.website", category: "help", icon: "globe", run: () => ipc.openUrl(REPOSITORY_URL) },
];

const byId = new Map(actions.map((a) => [a.id, a]));

export function getAction(id: string): Action | undefined {
  return byId.get(id);
}

/** Opens the TikZ studio, on the picture under the cursor if there is one. */
export async function openTikz() {
  media.openTikz(await editor.tikzAt());
}

function openPalette(mode: "commands" | "files") {
  if (ui.overlay === "palette" && ui.paletteMode === mode) {
    ui.closeOverlay();
    return;
  }
  ui.paletteMode = mode;
  ui.openOverlay("palette");
}

/** Live compilation (while typing) on or off; "off" keeps compiling on save. */
function toggleLiveBuild() {
  void app.update((s) => {
    s.build.autoBuild = s.build.autoBuild === "onIdle" ? "onSave" : "onIdle";
  });
}

function toggleSidebar() {
  ui.sidebarVisible = !ui.sidebarVisible;
  ui.saveLayout();
}

function togglePdf() {
  ui.pdfVisible = !ui.pdfVisible;
  ui.saveLayout();
}

/** The shortcut of an action (user override first; "" disables it). */
export function keyFor(id: string): string | undefined {
  const custom = app.settings?.keybindings?.[id];
  if (custom !== undefined) return custom || undefined;
  return byId.get(id)?.keys;
}

export function isAvailable(a: Action): boolean {
  return !a.when || a.when();
}

export async function runAction(id: string) {
  const a = byId.get(id);
  if (!a || !isAvailable(a)) return;
  try {
    await a.run();
  } catch (e) {
    ui.toast("error", String(e));
  }
}

// ------------------------------------------------------------ key matching

export function matches(e: KeyboardEvent, spec: string): boolean {
  return matchesKey(e, spec, isMac());
}

/** Window-level shortcuts. Returns true when an action ran. */
export function handleGlobalKey(e: KeyboardEvent): boolean {
  if (ui.dialog || e.isComposing) return false;
  for (const a of actions) {
    if (a.editor) continue;
    const spec = keyFor(a.id);
    const specs = [spec, ...(a.altKeys ?? [])].filter((k): k is string => !!k);
    if (!specs.some((k) => matches(e, k))) continue;
    if (!isAvailable(a)) continue;
    e.preventDefault();
    e.stopPropagation();
    void runAction(a.id);
    return true;
  }
  return false;
}

/** CodeMirror bindings of the editor actions. */
export function editorKeymap(): KeyBinding[] {
  const out: KeyBinding[] = [];
  for (const a of actions) {
    if (!a.editor) continue;
    const key = keyFor(a.id);
    if (!key) continue;
    out.push({
      key,
      preventDefault: true,
      run: (view) => {
        if (!isAvailable(a)) return false;
        void a.run(view);
        return true;
      },
    });
  }
  return out;
}

/** Shortcut shown next to an action (`⌘⇧P`, `Ctrl+Shift+P`). */
export { prettyKey } from "./utils";

/** Scrolls the editor so that the cursor is visible (after palette actions). */
export function focusEditor() {
  const v = editor.view;
  if (v) {
    v.focus();
    v.dispatch({ effects: EditorView.scrollIntoView(v.state.selection.main.head) });
  }
}
