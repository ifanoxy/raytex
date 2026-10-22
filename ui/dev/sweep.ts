// Every command of the application run from its real entry, in a real
// project: each is prepared, run, its effect checked, and what it changed
// put back. Then every entry of the menus of the top bar that is not a
// command, and every shortcut (it must start its own command). Nothing may
// fail meanwhile: no error of the page, no notification of an error.
//
// A few commands open a window of the system (a file dialog, the Finder,
// the browser) or reach the network: they are said, not run.

import { actions, getAction, isAvailable, keyFor, runAction } from "$lib/actions";
import { keyLang, NAMES } from "$lib/answerkey";
import { menus } from "$lib/menubar";
import type { MenuEntry } from "$lib/menu";
import * as ipc from "$lib/ipc";
import { answerKey } from "$lib/state/answerkey.svelte";
import { app } from "$lib/state/app.svelte";
import { build } from "$lib/state/build.svelte";
import { diagnostics } from "$lib/state/diagnostics.svelte";
import { editor } from "$lib/state/editor.svelte";
import { gridStore } from "$lib/state/grid.svelte";
import { project } from "$lib/state/project.svelte";
import { searchStore } from "$lib/state/search.svelte";
import { tex } from "$lib/state/tex.svelte";
import { type Overlay, ui } from "$lib/state/ui.svelte";
import { viewer } from "$lib/state/viewer.svelte";
import { whatsNew } from "$lib/state/whatsnew.svelte";
import { i18n, t } from "$lib/i18n.svelte";
import { isMac } from "$lib/utils";
import { mark, shown, since } from "./toasts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean, timeoutMs: number, what: string) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${what}`);
    await pause(50);
  }
}

const TEXT = `\\documentclass{article}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb,graphicx,tikz}
\\newcommand{\\R}{\\mathbb{R}}
\\begin{document}
\\section{Introduction}\\label{sec:intro}
Un mot à mettre en forme. Voir la section~\\ref{sec:intro}.

Une ligne de texte.

\\begin{tabular}{ll}
  a & b \\\\
\\end{tabular}

\\begin{tikzpicture}
  \\draw (0,0) -- (1,1);
\\end{tikzpicture}

$x \\in \\R$
\\end{document}
`;

/** How a command is checked. */
interface Spec {
  /** Not run: why. */
  skip?: string;
  /** Not available in this project, as it should be (`when`). */
  unavailable?: boolean;
  prepare?: () => unknown;
  /** The answer to a question it asks (a prompt, a confirmation). */
  answer?: string | boolean | null;
  /** Its effect is there (true), or what is wrong. */
  expect?: () => Promise<true | string> | true | string;
  /** What it changed put back. */
  done?: () => unknown;
}

export async function commandsScenes(log: (msg: string) => void, dir: string): Promise<boolean> {
  const results: Record<string, string> = {};
  const failures: string[] = [];
  // What went wrong while a command ran.
  const errors: string[] = [];
  const onError = (e: ErrorEvent) => void (/^ResizeObserver loop/.test(e.message) || errors.push(e.message));
  const onRejection = (e: PromiseRejectionEvent) => void errors.push(`rejection: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  let ok = true;
  try {
    if (!(await project.createEmpty(`${dir}/commandes-${Date.now()}`, "Commandes"))) throw new Error("project not created");
    const main = project.info!.main!;
    await until(() => editor.active === main && !!editor.view, 5_000, "main open");
    const view = () => editor.view!;
    const text = () => view().state.doc.toString();
    const reset = () => {
      if (text() !== TEXT) view().dispatch({ changes: { from: 0, to: view().state.doc.length, insert: TEXT } });
    };
    reset();
    await editor.saveAll({ auto: true, silent: true });
    await until(() => build.running, 10_000, "first build").catch(() => {});
    await until(() => !build.running, 120_000, "first build end");
    if (build.status !== "success") throw new Error(`first build ${build.status}`);
    await until(() => !!viewer.pdf && viewer.pages > 0, 20_000, "PDF shown");

    /** The words `w` chosen, or the caret `offset` characters into them. */
    const choose = (w: string, offset?: number) => {
      const at = text().indexOf(w);
      if (at < 0) throw new Error(`"${w}" not in the text`);
      view().dispatch({ selection: offset === undefined ? { anchor: at, head: at + w.length } : { anchor: at + offset } });
      view().focus();
    };
    const has = (s: string) => () => text().includes(s) || `"${s}" not written`;
    const window_ = (name: Exclude<Overlay, null>, extra?: () => boolean | string) => async (): Promise<true | string> => {
      await until(() => ui.overlay === name && !!document.querySelector(".overlay .modal, .overlay .palette"), 8_000, `window ${name}`).catch(() => {});
      if (ui.overlay !== name) return `window ${ui.overlay ?? "none"} instead of ${name}`;
      if (!document.querySelector(".overlay .modal, .overlay .palette")) return `window ${name} not drawn`;
      const more = extra?.();
      return more === undefined || more === true ? true : more || "not as expected";
    };
    const closeWindows = async () => {
      if (ui.dialog) ui.closeDialog(null);
      ui.closeMenu();
      if (ui.overlay) ui.closeOverlay();
      gridStore.request = null;
      await pause(150);
    };
    const sidebar = (name: typeof ui.sidebar) => async (): Promise<true | string> => {
      await pause(200);
      return (ui.sidebarVisible && ui.sidebar === name) || `sidebar ${ui.sidebarVisible ? ui.sidebar : "hidden"}`;
    };
    const flip = <T>(read: () => T, first?: () => unknown) => {
      let before: T;
      return {
        prepare: () => {
          first?.();
          before = read();
        },
        expect: () => read() !== before || `still ${String(before)}`,
      };
    };
    const twice = (id: string) => () => runAction(id);
    const wrapped = (cmd: string): Spec => ({ prepare: () => choose("mot"), expect: has(`\\${cmd}{mot}`), done: reset });
    const snippet = (needle: string): Spec => ({ prepare: () => choose("Une ligne", 0), expect: has(needle), done: reset });
    const settingFont = () => app.settings?.editor.fontSize ?? 14;
    /** The language the pieces of an answer key are named in (as the application decides it). */
    const pieceLang = () => keyLang(text(), i18n.lang === "fr" ? "fr" : "en");

    const specs: Record<string, Spec> = {
      // ---------------------------------------------------------- file
      "project.new": { expect: window_("newProject") },
      "project.open": { skip: "file dialog of the system" },
      "project.openFile": { skip: "file dialog of the system" },
      "project.close": { skip: "run last, on its own" },
      "project.browse": { expect: window_("projects") },
      "project.convert": { unavailable: true },
      "file.new": {
        answer: "nouveau.tex",
        expect: async () => (await ipc.pathExists(`${project.root}/nouveau.tex`)) || "nouveau.tex not created",
        done: async () => {
          if (editor.tabs.some((x) => x.path.endsWith("nouveau.tex"))) await editor.close(editor.tabs.find((x) => x.path.endsWith("nouveau.tex"))!.path);
          await editor.open(main);
        },
      },
      "file.newFolder": { answer: "dossier", expect: async () => (await ipc.pathExists(`${project.root}/dossier`)) || "dossier not created" },
      "file.import": { skip: "file dialog of the system" },
      "file.save": {
        prepare: () => view().dispatch({ changes: { from: text().indexOf("Une ligne"), insert: "x" } }),
        expect: async () => {
          await until(() => !editor.tabs.find((x) => x.path === main)?.dirty, 5_000, "saved").catch(() => {});
          return !editor.tabs.find((x) => x.path === main)?.dirty || "still unsaved";
        },
        done: async () => {
          reset();
          await editor.saveAll({ auto: true, silent: true });
        },
      },
      "file.saveAll": {
        prepare: () => view().dispatch({ changes: { from: text().indexOf("Une ligne"), insert: "x" } }),
        expect: async () => {
          await until(() => !editor.tabs.some((x) => x.dirty), 5_000, "saved").catch(() => {});
          return !editor.tabs.some((x) => x.dirty) || "a tab still unsaved";
        },
        done: async () => {
          reset();
          await editor.saveAll({ auto: true, silent: true });
        },
      },
      "file.close": {
        prepare: async () => {
          await editor.open(`${project.root}/nouveau.tex`);
          await until(() => editor.active?.endsWith("nouveau.tex") ?? false, 3_000, "second tab");
        },
        expect: () => !editor.tabs.some((x) => x.path.endsWith("nouveau.tex")) || "tab still open",
        done: () => editor.open(main),
      },
      "file.closeAll": {
        expect: () => editor.tabs.length === 0 || `${editor.tabs.length} tabs open`,
        done: async () => {
          await editor.open(main);
          await until(() => editor.active === main && !!editor.view, 5_000, "main again");
        },
      },
      "file.reveal": { skip: "opens the Finder" },
      "project.saveAsTemplate": {
        answer: "Modèle essai",
        expect: async () => {
          const list = await ipc.listTemplates().catch(() => []);
          return list.some((x) => JSON.stringify(x.name).includes("Modèle essai")) || "template not listed";
        },
      },
      "project.settings": { expect: window_("settings", () => ui.settingsSection === "project" || `section ${ui.settingsSection}`) },
      "edit.spellcheck": {
        ...flip(() => !!app.settings?.editor.spellcheck),
        answer: false,
        done: async () => {
          await runAction("edit.spellcheck");
          await pause(300);
          if (ui.dialog) ui.closeDialog(false);
        },
      },
      "project.history": { expect: window_("history") },
      "project.export": { expect: window_("export") },

      // --------------------------------------------------------- build
      "build.run": {
        expect: async () => {
          await until(() => build.running, 10_000, "build").catch(() => {});
          await until(() => !build.running, 120_000, "build end");
          return build.status === "success" || `build ${build.status}`;
        },
      },
      "build.cancel": {
        prepare: async () => {
          void build.run();
          await until(() => build.running, 10_000, "build to cancel");
        },
        expect: async () => {
          await until(() => !build.running, 20_000, "cancelled").catch(() => {});
          return !build.running || "still running";
        },
        done: async () => {
          await build.run();
          await until(() => !build.running, 120_000, "build again");
        },
      },
      "build.clean": {
        // Asked while a build goes on (a live one): it is stopped first,
        // TeX letting go of its files.
        prepare: async () => {
          void build.run();
          await until(() => build.running, 10_000, "build to clean during");
        },
        expect: async () => {
          for (let i = 0; i < 40 && (build.running || (await ipc.pathExists(`${project.root}/build/main.aux`))); i++) await pause(250);
          if (!build.running && !(await ipc.pathExists(`${project.root}/build/main.aux`))) return true;
          return `main.aux still there (said: ${shown.at(-1)?.message ?? "nothing"}, building: ${build.running})`;
        },
        done: async () => {
          await build.run();
          await until(() => build.running, 10_000, "build").catch(() => {});
          await until(() => !build.running, 120_000, "build again");
        },
      },
      "build.setMain": { expect: () => project.info?.main === main || `main ${project.info?.main}` },
      "build.log": {
        expect: async () => {
          await until(() => editor.active?.endsWith(".log") ?? false, 5_000, "log open").catch(() => {});
          return editor.active?.endsWith(".log") || `active ${editor.active}`;
        },
        done: async () => {
          if (editor.active?.endsWith(".log")) await editor.close(editor.active);
          await editor.open(main);
        },
      },
      "build.output": { expect: () => (ui.bottomVisible && ui.bottomTab === "output") || "output not shown" },
      "build.fixAll": {
        // A reference mistyped: its fix is known (the closest label).
        prepare: async () => {
          view().dispatch({ changes: { from: text().indexOf("Une ligne"), insert: "Voir \\ref{sec:intr}. " } });
          await editor.saveAll({ auto: true, silent: true });
          await editor.flush();
          await project.lintAll();
          await until(() => isAvailable(getAction("build.fixAll")!), 10_000, "something to fix");
        },
        answer: true,
        expect: async () => {
          await until(() => !text().includes("sec:intr}"), 15_000, "fixed").catch(() => {});
          return !text().includes("sec:intr}") || "not fixed";
        },
        done: async () => {
          await until(() => !build.running, 120_000, "idle");
          reset();
          await editor.saveAll({ auto: true, silent: true });
          await until(() => !build.running, 120_000, "idle again");
        },
      },
      "build.problems": { expect: () => (ui.bottomVisible && ui.bottomTab === "problems") || "problems not shown" },
      "build.live": { ...flip(() => app.settings?.build.autoBuild), done: twice("build.live") },
      "pdf.export": { skip: "save dialog of the system (the export is checked in the media scenes)" },
      "pdf.exportArchive": { expect: window_("pdfChoice") },
      "pdf.exportAccessible": { expect: window_("pdfChoice") },
      "pdf.external": { skip: "opens another application" },

      // ---------------------------------------------------------- view
      "view.palette": { expect: window_("palette", () => ui.paletteMode === "commands" || ui.paletteMode) },
      "view.quickOpen": { expect: window_("palette", () => ui.paletteMode === "files" || ui.paletteMode) },
      "view.settings": { expect: window_("settings") },
      "view.sidebar": { ...flip(() => ui.sidebarVisible), done: twice("view.sidebar") },
      "view.panel": { ...flip(() => ui.bottomVisible), done: twice("view.panel") },
      "view.pdf": { ...flip(() => ui.pdfVisible), done: twice("view.pdf") },
      "view.files": { prepare: () => (ui.sidebar = "outline"), expect: sidebar("files") },
      "view.outline": { expect: sidebar("outline") },
      "view.search": { expect: sidebar("search") },
      "view.replaceProject": { expect: async () => ((await sidebar("search")()) === true && searchStore.showReplace) || "replace row not shown" },
      "view.symbols": { expect: sidebar("symbols") },
      "view.slides": { skip: "the slides mode has its scenes (projects)" },
      "view.snippets": { expect: sidebar("snippets") },
      "view.commands": { expect: sidebar("commands") },
      "view.bibliography": { expect: sidebar("bibliography") },
      "view.packages": { expect: sidebar("packages") },
      "view.templates": { expect: sidebar("templates") },
      "view.formatBar": { ...flip(() => ui.formatBarVisible), done: twice("view.formatBar") },
      "view.zoomIn": { ...flip(settingFont, () => view().focus()), done: () => runAction("view.zoomReset") },
      "view.zoomOut": { ...flip(settingFont, () => view().focus()), done: () => runAction("view.zoomReset") },
      "view.zoomReset": {
        prepare: async () => {
          view().focus();
          await runAction("view.zoomIn");
        },
        expect: () => settingFont() === 14 || `size ${settingFont()}`,
      },
      "view.theme": { ...flip(() => app.theme), done: twice("view.theme") },

      // ------------------------------------------------------ navigate
      "nav.definition": {
        prepare: () => choose("\\ref{sec:intro}", 7),
        expect: async () => {
          await pause(500);
          const head = view().state.selection.main.head;
          return view().state.doc.lineAt(head).text.includes("\\label{sec:intro}") || `caret on: ${view().state.doc.lineAt(head).text}`;
        },
      },
      "nav.references": {
        prepare: () => choose("\\label{sec:intro}", 9),
        expect: async () => {
          await until(() => searchStore.results.length > 0, 5_000, "references").catch(() => {});
          return (searchStore.results.length >= 1 && ui.sidebar === "search") || `${searchStore.results.length} references`;
        },
      },
      "nav.rename": {
        prepare: () => choose("\\label{sec:intro}", 9),
        answer: "sec:debut",
        expect: async () => {
          await until(() => !text().includes("sec:intro"), 5_000, "renamed").catch(() => {});
          return (text().includes("\\label{sec:debut}") && text().includes("\\ref{sec:debut}")) || "label and reference not both renamed";
        },
        done: reset,
      },
      "nav.syncForward": {
        prepare: () => {
          viewer.forwardTarget = null;
          choose("Un mot", 2);
        },
        expect: async () => {
          await until(() => !!viewer.forwardTarget, 5_000, "place in the PDF").catch(() => {});
          return !!viewer.forwardTarget || "no place in the PDF";
        },
      },
      "nav.find": {
        prepare: () => view().focus(),
        expect: async () => {
          await until(() => !!document.querySelector(".lbt-find"), 3_000, "find card").catch(() => {});
          return !!document.querySelector(".lbt-find") || "no find card";
        },
        done: async () => {
          const field = document.querySelector<HTMLInputElement>(".lbt-find input");
          field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
          await until(() => !document.querySelector(".lbt-find"), 2_000, "card closed").catch(() => {});
        },
      },
      "nav.replace": {
        prepare: () => view().focus(),
        expect: async () => {
          await until(() => document.querySelectorAll(".lbt-find input").length === 2, 3_000, "replace card").catch(() => {});
          return document.querySelectorAll(".lbt-find input").length === 2 || "no row of replacement";
        },
        done: async () => {
          const field = document.querySelector<HTMLInputElement>(".lbt-find input");
          field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
          await until(() => !document.querySelector(".lbt-find"), 2_000, "card closed").catch(() => {});
        },
      },
      "nav.goToLine": {
        prepare: () => view().focus(),
        expect: async () => {
          await until(() => !!view().dom.querySelector(".cm-goto-line"), 3_000, "go to line").catch(() => {});
          return !!view().dom.querySelector(".cm-goto-line") || "no field for the line";
        },
        done: async () => {
          view().dom.querySelector<HTMLInputElement>(".cm-goto-line input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
          await pause(200);
        },
      },

      // ---------------------------------------------------------- edit
      "edit.undo": {
        prepare: () => {
          view().dispatch({ changes: { from: text().indexOf("Une ligne"), insert: "ajout " }, userEvent: "input" });
          view().focus();
        },
        expect: () => !text().includes("ajout ") || "not undone",
        done: reset,
      },
      "edit.redo": {
        prepare: async () => {
          view().dispatch({ changes: { from: text().indexOf("Une ligne"), insert: "ajout " }, userEvent: "input" });
          view().focus();
          await runAction("edit.undo");
        },
        expect: has("ajout "),
        done: reset,
      },
      "edit.quickFix": {
        prepare: async () => {
          view().dispatch({ changes: { from: text().indexOf("Une ligne"), insert: "Voir \\ref{sec:intr}. " } });
          await editor.flush();
          await project.lintAll();
          await until(() => diagnostics_have("sec:intr"), 10_000, "problem of the reference").catch(() => {});
          choose("\\ref{sec:intr}", 8);
        },
        expect: async () => {
          await until(() => !!ui.menu, 3_000, "menu of fixes").catch(() => {});
          if (ui.menu && ui.menu.items.length > 0) return true;
          const said = shown.at(-1)?.message ?? "nothing said";
          return `no menu of fixes (problem known: ${diagnostics_have("sec:intr")}, said: ${said})`;
        },
        done: () => {
          ui.closeMenu();
          reset();
        },
      },
      "edit.bold": wrapped("textbf"),
      "edit.italic": wrapped("textit"),
      "edit.emph": wrapped("emph"),
      "edit.underline": wrapped("underline"),
      "edit.typewriter": wrapped("texttt"),
      "edit.smallcaps": wrapped("textsc"),
      "edit.math": { prepare: () => choose("mot"), expect: has("$mot$"), done: reset },
      "edit.comment": { prepare: () => choose("Une ligne", 0), expect: has("% Une ligne"), done: reset },
      "edit.bulletList": { prepare: () => choose("Une ligne", 0), expect: has("\\begin{itemize}"), done: reset },
      "edit.numberedList": { prepare: () => choose("Une ligne", 0), expect: has("\\begin{enumerate}"), done: reset },
      "edit.alignLeft": { prepare: () => choose("Une ligne", 0), expect: has("\\begin{flushleft}"), done: reset },
      "edit.alignCenter": { prepare: () => choose("Une ligne", 0), expect: has("\\begin{center}"), done: reset },
      "edit.alignRight": { prepare: () => choose("Une ligne", 0), expect: has("\\begin{flushright}"), done: reset },
      "edit.alignJustify": {
        prepare: async () => {
          choose("Une ligne", 0);
          await runAction("edit.alignCenter");
          choose("Une ligne", 0);
        },
        expect: () => !text().includes("\\begin{center}") || "still centred",
        done: reset,
      },
      "edit.wrapEnv": { prepare: () => choose("Une ligne de texte."), answer: "quote", expect: has("\\begin{quote}"), done: reset },

      // -------------------------------------------------------- insert
      "insert.section": snippet("\\section{"),
      "insert.subsection": snippet("\\subsection{"),
      "insert.figure": snippet("\\begin{figure}"),
      "insert.equation": snippet("\\begin{equation}"),
      "insert.align": snippet("\\begin{align}"),
      "insert.itemize": snippet("\\begin{itemize}"),
      "insert.enumerate": snippet("\\begin{enumerate}"),
      "insert.frame": snippet("\\begin{frame}"),
      "insert.footnote": snippet("\\footnote{"),
      "insert.cite": snippet("\\cite{"),
      "insert.ref": snippet("\\ref{}"),
      "insert.link": snippet("\\href{"),
      "insert.table": { prepare: () => choose("Une ligne", 0), expect: window_("grid") },
      "insert.matrix": { prepare: () => choose("$x", 1), expect: window_("grid") },
      "insert.image": { expect: window_("image") },
      "insert.code": { expect: window_("code") },
      "insert.graph": { expect: window_("graph") },
      "insert.variations": { expect: window_("variations") },
      "insert.tree": { expect: window_("tree") },
      "insert.command": { prepare: () => choose("mot"), expect: window_("commands") },
      "insert.tikz": { prepare: () => choose("\\draw", 2), expect: window_("tikz") },
      "format.fonts": { expect: window_("fonts") },
      "format.margins": { expect: window_("layout", () => ui.layoutTab === "margins" || ui.layoutTab) },
      "format.pageStyles": { expect: window_("layout", () => ui.layoutTab === "styles" || ui.layoutTab) },
      "format.paragraphs": { expect: window_("layout", () => ui.layoutTab === "paragraphs" || ui.layoutTab) },
      "format.titlePage": { expect: window_("title") },
      // Subject and answer key: each piece writes the switch (and its own
      // definition) in the preamble when the document has none.
      "insert.exercise": { prepare: () => choose("Une ligne", 0), expect: () => (!!answerKey.current && text().includes(`\\begin{${NAMES[pieceLang()].exercise}}`)) || "no exercise, or no switch", done: reset },
      "insert.solution": { prepare: () => choose("Une ligne", 0), expect: () => (!!answerKey.current && text().includes(`\\begin{${NAMES[pieceLang()].solution}}`)) || "no solution, or no switch", done: reset },
      "insert.answerLines": { prepare: () => choose("Une ligne", 0), expect: () => text().includes(`\\${NAMES[pieceLang()].lines}{`) || "no lines", done: reset },
      "insert.answerSpace": { prepare: () => choose("Une ligne", 0), expect: () => text().includes(`\\${NAMES[pieceLang()].space}{`) || "no room", done: reset },
      "insert.answerGrid": { prepare: () => choose("Une ligne", 0), expect: () => text().includes(`\\${NAMES[pieceLang()].grid}{`) || "no grid", done: reset },
      "view.answers": {
        prepare: async () => {
          choose("Une ligne", 0);
          await runAction("insert.exercise");
          await until(() => !!answerKey.current, 5_000, "switch");
        },
        ...(() => {
          let before = false;
          return {
            expect: async () => {
              await pause(300);
              return answerKey.current?.shown !== before || "answers not turned";
            },
            answer: null,
          };
        })(),
        done: reset,
      },
      "pdf.exportAnswers": {
        prepare: async () => {
          choose("Une ligne", 0);
          await runAction("insert.exercise");
          await until(() => !!answerKey.current, 5_000, "switch");
        },
        expect: window_("pdfChoice"),
        done: reset,
      },

      // ----------------------------------------------------------- TeX
      "tex.setup": { expect: window_("setup") },
      "tex.detect": {
        expect: async () => {
          await until(() => !tex.status?.detecting, 30_000, "detection").catch(() => {});
          return tex.ready || "no distribution after detection";
        },
      },
      "tex.update": { skip: "installs packages from the network" },

      // ---------------------------------------------------------- help
      "help.open": { expect: window_("help") },
      "help.updates": { skip: "reaches the network" },
      "help.whatsNew": { expect: () => !!whatsNew.shown || "nothing shown", done: () => void ((whatsNew as { shown: unknown }).shown = null) },
      "help.report": { expect: window_("report") },
      "help.shortcuts": { expect: window_("help", () => ui.helpTarget?.section === "shortcuts" || `section ${ui.helpTarget?.section}`) },
      "help.symbols": { expect: window_("help", () => ui.helpTarget?.section === "symbols" || `section ${ui.helpTarget?.section}`) },
      "help.errors": { expect: window_("help", () => ui.helpTarget?.section === "errors" || `section ${ui.helpTarget?.section}`) },
      "help.website": { skip: "opens the browser" },
    };
    function diagnostics_have(needle: string): boolean {
      return Object.values(diagnostics.lint).some((list) => list.some((d) => d.message.includes(needle)));
    }

    // ------------------------------------------------------ each command
    for (const a of actions) {
      const spec = specs[a.id];
      const id = a.id;
      if (!spec) {
        // The pieces of an answer key that need its switch, the export of both: unavailable here.
        results[id] = isAvailable(a) ? "FAILED no check written for it" : "unavailable here";
        if (isAvailable(a)) failures.push(id);
        continue;
      }
      if (spec.skip) {
        results[id] = `not run: ${spec.skip}`;
        continue;
      }
      await closeWindows();
      errors.length = 0;
      const toasts = mark();
      try {
        await spec.prepare?.();
        if (spec.unavailable) {
          const fine = !isAvailable(a);
          results[id] = fine ? "unavailable, as it should" : "FAILED available where it should not be";
          if (!fine) failures.push(id);
          continue;
        }
        if (!isAvailable(a)) {
          results[id] = "FAILED not available";
          failures.push(id);
          continue;
        }
        // Run as the menu, the palette and the shortcuts do; a question it asks is answered.
        const running = runAction(id);
        const answered = (async () => {
          for (let i = 0; i < 40 && "answer" in spec; i++) {
            if (ui.dialog) {
              ui.closeDialog(spec.answer ?? null);
              return;
            }
            await pause(50);
          }
        })();
        await Promise.race([Promise.all([running, answered]), pause(15_000)]);
        const verdict = spec.expect ? await spec.expect() : true;
        const newErrors = since(toasts).filter((x) => x.kind === "error").map((x) => x.message);
        const problems = [...(verdict === true ? [] : [verdict]), ...errors.map((e) => `error: ${e}`), ...newErrors.map((m) => `notification: ${m}`)];
        results[id] = problems.length ? `FAILED ${problems.join(" · ")}` : "ok";
        if (problems.length) failures.push(id);
      } catch (e) {
        results[id] = `FAILED ${String(e)}`;
        failures.push(id);
      } finally {
        try {
          await spec.done?.();
        } catch (e) {
          results[`${id} (put back)`] = `FAILED ${String(e)}`;
        }
        await closeWindows();
        if (editor.active !== main) await editor.open(main);
      }
    }
    log("scene: commands");

    // ----------------------------- the entries of the menus that are not commands
    reset();
    const shortcuts = await ipc.atShortcuts().catch(() => [] as [string, string][]);
    const leaves: { path: string; run: () => unknown }[] = [];
    const walk = (entries: MenuEntry[], path: string) => {
      for (const e of entries) {
        if (e.separator || e.note || e.action) continue;
        if (e.items) walk(e.items, `${path} › ${e.label}`);
        else if (e.cells) e.cells.forEach((c, i) => i < 3 && c.run && leaves.push({ path: `${path} › ${c.label}`, run: c.run }));
        else if (e.run && e.label && !/colors\.more|palette/i.test(e.icon ?? "")) leaves.push({ path: `${path} › ${e.label}`, run: e.run });
      }
    };
    for (const m of menus({ chapters: false, shortcuts, allColors: () => {} })) walk(m.items, m.label);
    for (const leaf of leaves) {
      await closeWindows();
      reset();
      // A style is turned on a line of text; "normal text" on a heading; the normal size on words made larger.
      const normalSize = leaf.path.includes(t("format.size")) && leaf.path.endsWith(t("format.size.normalsize"));
      if (/›.*›/.test(leaf.path) && leaf.path.endsWith(t("format.normal"))) choose("Introduction", 2);
      else if (normalSize) {
        choose("mot");
        await leaves.find((l) => l.path.endsWith(t("format.size.Large")))?.run();
        await pause(150);
        choose("mot");
      } else choose("mot");
      errors.length = 0;
      const before = text();
      try {
        await leaf.run();
        await pause(150);
        const changed = text() !== before || ui.sidebar === "snippets";
        const problems = [...(changed ? [] : ["nothing written"]), ...errors.map((e) => `error: ${e}`)];
        results[`menu ${leaf.path}`] = problems.length ? `FAILED ${problems.join(" · ")}` : "ok";
        if (problems.length) failures.push(`menu ${leaf.path}`);
      } catch (e) {
        results[`menu ${leaf.path}`] = `FAILED ${String(e)}`;
        failures.push(`menu ${leaf.path}`);
      }
    }
    reset();
    log("scene: menus");

    // ------------------------- each shortcut starts its own command (and only it)
    const fired: string[] = [];
    const runs = new Map(actions.map((a) => [a.id, a.run]));
    for (const a of actions) a.run = () => void fired.push(a.id);
    const press = (spec: string, target: EventTarget) => {
      const parts = spec.endsWith("--") ? [...spec.slice(0, -2).split("-").filter(Boolean), "-"] : spec.split("-");
      const key = parts.pop()!;
      const mod = parts.includes("Mod");
      const shift = parts.includes("Shift");
      const codes: Record<string, string> = { "=": "Equal", "-": "Minus", ".": "Period", ",": "Comma", Enter: "Enter" };
      const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : (codes[key] ?? key);
      const shifted: Record<string, string> = { "8": "*", "7": "&" };
      const typed = /^[a-z]$/i.test(key) ? (shift ? key.toUpperCase() : key) : shift && shifted[key] ? shifted[key] : key;
      const event = new KeyboardEvent("keydown", {
        key: typed,
        code,
        metaKey: mod && isMac(),
        ctrlKey: (mod && !isMac()) || parts.includes("Ctrl"),
        shiftKey: shift,
        altKey: parts.includes("Alt"),
        bubbles: true,
        cancelable: true,
      });
      // The editor reads the key of a real keyboard from its code too (Shift-8 typed as "*").
      const keyCodes: Record<string, number> = { Enter: 13, ".": 190, ",": 188, "=": 187, "-": 189, F1: 112, F2: 113, F12: 123 };
      const keyCode = /^[a-z]$/i.test(key) ? key.toUpperCase().charCodeAt(0) : /^\d$/.test(key) ? 48 + Number(key) : (keyCodes[key] ?? 0);
      Object.defineProperty(event, "keyCode", { get: () => keyCode });
      Object.defineProperty(event, "which", { get: () => keyCode });
      target.dispatchEvent(event);
    };
    try {
      for (const a of actions) {
        const spec = keyFor(a.id);
        if (!spec) continue;
        await closeWindows();
        reset();
        choose("mot");
        if (!isAvailable(a)) {
          results[`key ${spec}`] = `${a.id} unavailable at that moment`;
          continue;
        }
        fired.length = 0;
        press(spec, a.editor ? view().contentDOM : document.body);
        await pause(80);
        const right = fired.length === 1 && fired[0] === a.id;
        results[`key ${spec}`] = right ? `ok (${a.id})` : `FAILED ${a.id} expected, ${fired.join(", ") || "nothing"} started`;
        if (!right) failures.push(`key ${spec}`);
      }
    } finally {
      for (const a of actions) a.run = runs.get(a.id)!;
    }
    log("scene: shortcuts");

    // ------------------------------------------------- the project closed last
    await closeWindows();
    await runAction("project.close");
    await until(() => !project.info, 5_000, "project closed").catch(() => {});
    results["project.close"] = !project.info ? "ok" : "FAILED project still open";
    if (project.info) failures.push("project.close");
  } catch (e) {
    results.failure = String(e);
    ok = false;
  } finally {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  }
  const counts = Object.values(results).reduce(
    (n, r) => {
      if (r.startsWith("ok")) n.ok++;
      else if (r.startsWith("FAILED")) n.failed++;
      else n.other++;
      return n;
    },
    { ok: 0, failed: 0, other: 0 },
  );
  // One line each: the log of the application cuts long messages.
  for (const [what, result] of Object.entries(results)) log(`command ${what}: ${result}`);
  log(`commands: ${counts.ok} ok, ${counts.failed} failed, ${counts.other} not run or unavailable`);
  ok = ok && failures.length === 0;
  log(`commands scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}
