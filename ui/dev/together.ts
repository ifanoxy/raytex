// Features used together, where work could be lost: another project opened
// with work not saved, a file changed by another program while it is open,
// an open file renamed then deleted from the tree, a label renamed while a
// file that uses it is closed, the TikZ studio inserting after another tab
// was shown.

import { runAction } from "$lib/actions";
import * as ipc from "$lib/ipc";
import { app } from "$lib/state/app.svelte";
import { build } from "$lib/state/build.svelte";
import { diagnostics } from "$lib/state/diagnostics.svelte";
import { editor } from "$lib/state/editor.svelte";
import { history } from "$lib/state/history.svelte";
import { project } from "$lib/state/project.svelte";
import { ui } from "$lib/state/ui.svelte";
import { viewer } from "$lib/state/viewer.svelte";
import { t } from "$lib/i18n.svelte";
import { inFolder, samePath } from "$lib/utils";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean, timeoutMs: number, what: string) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${what}`);
    await pause(50);
  }
}

/** Answers the next question the application asks (a prompt, a confirmation, a choice). */
async function answer(value: string | boolean | null, timeoutMs = 5_000): Promise<boolean> {
  try {
    await until(() => !!ui.dialog, timeoutMs, "question");
  } catch {
    return false;
  }
  ui.closeDialog(value);
  await pause(100);
  return true;
}

export async function togetherScenes(log: (msg: string) => void, dir: string): Promise<boolean> {
  const results: Record<string, string> = {};
  const check = (name: string, value: boolean, detail: unknown = "") => {
    results[name] = value ? "ok" : `FAILED ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  };
  const autoSave = app.settings?.editor.autoSave ?? true;
  try {
    // Saved only when asked: what is not saved is what these scenes are about.
    await app.update((s) => (s.editor.autoSave = false));
    const stamp = Date.now();
    const rootA = `${dir}/ensemble-a-${stamp}`;
    const rootB = `${dir}/ensemble-b-${stamp}`;
    if (!(await project.createEmpty(rootB, "Projet B"))) throw new Error("project B not created");
    if (!(await project.createEmpty(rootA, "Projet A"))) throw new Error("project A not created");
    const main = project.info!.main!;
    const annexe = `${rootA}/annexe.tex`;
    const chapter = `${rootA}/chapitre.tex`;
    const TEXT = "\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\section{A}\\label{sec:a}\nTexte.\n\n\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n\n\\input{annexe}\n\\end{document}\n";
    await ipc.createFile(annexe, "Voir la section~\\ref{sec:a}.\n");
    await ipc.createFile(chapter, "Un chapitre.\n");
    await editor.open(main);
    await until(() => samePath(editor.active, main) && !!editor.view, 5_000, "main open");
    editor.view!.dispatch({ changes: { from: 0, to: editor.view!.state.doc.length, insert: TEXT } });
    await editor.saveAll({ silent: true });
    // The files written meanwhile known to the project as when it is opened.
    await project.close();
    await project.open(rootA);
    await editor.open(main);
    await until(() => samePath(editor.active, main) && !!editor.view, 5_000, "main open again");
    const view = () => editor.view!;
    const text = () => view().state.doc.toString();

    // ------------------------------- another project, with work not saved
    view().dispatch({ changes: { from: text().indexOf("Texte."), insert: "Travail non enregistré. " } });
    let opening = project.open(rootB);
    const askedOnce = await answer("cancel");
    await opening;
    check("another project: what is not saved is asked about", askedOnce, "no question");
    check("another project: cancelled, nothing changes", samePath(project.info?.root, rootA) && text().includes("Travail non enregistré"), project.info?.root);
    opening = project.open(rootB);
    await answer("save");
    await opening;
    const savedA = (await ipc.readTextFile(main)).text;
    check("another project: saved when asked, then opened", samePath(project.info?.root, rootB) && savedA.includes("Travail non enregistré"), { root: project.info?.root, saved: savedA.includes("Travail non enregistré") });
    await project.open(rootA);
    await editor.open(main);
    await until(() => samePath(editor.active, main) && !!editor.view, 5_000, "back to A");
    check("another project: the work is there when it is opened again", text().includes("Travail non enregistré"));

    // ------------------------------- a file changed by another program
    log(`external-append: ${main} | % ajouté ailleurs 1`);
    await until(() => text().includes("ajouté ailleurs 1"), 8_000, "reloaded").catch(() => {});
    check("changed elsewhere, nothing typed: shown as it is now", text().includes("ajouté ailleurs 1") && !editor.activeTab?.dirty, { dirty: editor.activeTab?.dirty });
    view().dispatch({ changes: { from: text().indexOf("Texte."), insert: "Tapé ici. " } });
    const toasts = ui.toasts.length;
    log(`external-append: ${main} | % ajouté ailleurs 2`);
    const warned = await until(() => ui.toasts.slice(toasts).some((x) => x.message === t("editor.changedOnDisk", { file: "main.tex" })), 8_000, "warned").then(
      () => true,
      () => false,
    );
    check("changed elsewhere while typed: what was typed stays, and it is said", warned && text().includes("Tapé ici") && !text().includes("ajouté ailleurs 2"), { warned, typed: text().includes("Tapé ici") });
    // What was typed is kept: saved over the other change.
    await editor.save(main);

    // ------------------------------- an open file renamed, then deleted
    await editor.open(chapter);
    await until(() => samePath(editor.active, chapter), 5_000, "chapter open");
    view().dispatch({ changes: { from: 0, insert: "Ajout non enregistré. " } });
    const renamedTo = `${rootA}/chapitre-un.tex`;
    await project.move(chapter, renamedTo);
    const tab = editor.tabs.find((x) => samePath(x.path, renamedTo));
    check("open file renamed: its tab follows, with what was typed", !!tab && samePath(editor.active, renamedTo) && !!tab.dirty && text().startsWith("Ajout non enregistré"), { tabs: editor.tabs.map((x) => x.name), active: editor.active });
    await editor.save(renamedTo);
    const underNew = (await ipc.readTextFile(renamedTo).catch(() => ({ text: "(missing)" }))).text;
    const oldThere = await ipc.pathExists(chapter);
    check("open file renamed: saved under its new name", underNew.startsWith("Ajout non enregistré") && !oldThere, { underNew: underNew.slice(0, 60), oldThere, dirty: editor.tabs.find((x) => samePath(x.path, renamedTo))?.dirty });
    const removing = project.remove(renamedTo, false);
    const asked = await answer(true);
    await removing;
    check("open file deleted: asked, then its tab closed", asked && !editor.tabs.some((x) => samePath(x.path, renamedTo)) && !(await ipc.pathExists(renamedTo)), { asked, tabs: editor.tabs.map((x) => x.name) });

    // ------------------------------- a label renamed, a file that uses it closed
    await editor.open(main);
    await until(() => samePath(editor.active, main) && !!editor.view, 5_000, "main for the label");
    check("the file that uses the label is closed", !editor.tabs.some((x) => samePath(x.path, annexe)));
    const at = text().indexOf("\\label{sec:a}") + 9;
    view().dispatch({ selection: { anchor: at } });
    view().focus();
    const renaming = runAction("nav.rename");
    await answer("sec:debut");
    await renaming;
    await pause(500);
    const closedFile = (await ipc.readTextFile(annexe)).text;
    check("label renamed: in its file and in the closed file that uses it", text().includes("\\label{sec:debut}") && closedFile.includes("\\ref{sec:debut}"), { here: text().includes("\\label{sec:debut}"), closed: closedFile.trim() });

    // ------------------------------- the TikZ studio, another tab shown meanwhile
    await ipc.createFile(chapter, "Un autre fichier.\n");
    const pictureAt = text().indexOf("\\draw") + 2;
    view().dispatch({ selection: { anchor: pictureAt } });
    view().focus();
    await runAction("insert.tikz");
    await until(() => ui.overlay === "tikz" && !!document.querySelector(".overlay .modal .cm-content"), 10_000, "TikZ studio");
    // A comment written in the code of the studio, then another file shown.
    const studio = (document.querySelector(".overlay .modal .cm-content") as HTMLElement & { cmTile?: { view?: { state: { doc: { toString(): string } }; dispatch(spec: unknown): void } } }).cmTile?.view;
    const code = studio?.state.doc.toString() ?? "";
    const end = code.indexOf("\\end{tikzpicture}");
    studio?.dispatch({ changes: { from: end, insert: "  % dans le studio\n" } });
    await editor.open(chapter);
    await until(() => samePath(editor.active, chapter), 5_000, "other tab shown");
    await pause(800);
    document.querySelector<HTMLButtonElement>(".overlay .footer .btn.primary")?.click();
    await until(() => ui.overlay === null, 20_000, "inserted").catch(() => {});
    const mainNow = editor.textOf(main) ?? "";
    const chapterNow = editor.textOf(chapter) ?? (await ipc.readTextFile(chapter)).text;
    check("TikZ studio, another tab shown: the picture goes back where it came from", !!studio && mainNow.includes("% dans le studio") && !chapterNow.includes("dans le studio"), { studio: !!studio, main: mainNow.includes("% dans le studio"), chapter: chapterNow.includes("dans le studio") });
    await editor.saveAll({ silent: true });

    // ------------------------------- the bibliography: not cited, to check
    await ipc.createFile(`${rootA}/refs.bib`, "@book{knuth, title={The TeXbook}, author={Knuth, Donald}, year={1984}}\n@book{lamport, title={LaTeX}, author={Lamport, Leslie}, year={1994}}\n@book{knuth2, title={The TeXbook}, author={Knuth, Donald}, year={1984}}\n");
    await editor.open(main);
    await until(() => samePath(editor.active, main) && !!editor.view, 5_000, "main for the bibliography");
    view().dispatch({ changes: { from: text().indexOf("\\end{document}"), insert: "\\cite{knuth}\n\\bibliographystyle{plain}\n\\bibliography{refs}\n" } });
    await editor.saveAll({ silent: true });
    if (ui.sidebar === "bibliography" && ui.sidebarVisible) ui.sidebarVisible = false;
    ui.showSidebar("bibliography");
    const tabs = () => [...document.querySelectorAll<HTMLElement>(".tabs .tab")];
    const count = (i: number) => tabs()[i]?.querySelector(".n")?.textContent?.trim() ?? "0";
    await until(() => tabs().length === 3 && count(0) === "3", 10_000, "entries listed").catch(() => {});
    check("bibliography: the entries not cited and the ones to check", count(0) === "3" && count(1) === "2" && Number(count(2)) >= 1, { all: count(0), unused: count(1), check: count(2) });
    tabs()[1]?.click();
    await pause(300);
    const shownUnused = document.querySelectorAll(".sidebar .item .main").length;
    check("bibliography: the tab of the entries not cited shows them", shownUnused === 2, shownUnused);

    // ------------------------------- the history: everything put back
    const moment = (await ipc.historyKeep("manual")) ?? (await ipc.historyList()).moments[0];
    const before = (await ipc.readTextFile(main)).text;
    view().dispatch({ changes: { from: text().indexOf("Texte."), insert: "Changé après le moment. " } });
    await editor.saveAll({ silent: true });
    const removing2 = project.remove(annexe, false);
    await answer(true);
    await removing2;
    await ipc.createFile(`${rootA}/nouveau.tex`, "Ajouté après le moment.\n");
    await history.show(main);
    await until(() => history.loaded, 10_000, "history");
    await history.select(moment!.id);
    const changes = history.changes.map((c) => `${c.path}:${c.status}`);
    const toasts2 = ui.toasts.length;
    await history.restore(history.changes);
    await until(() => !history.busy, 20_000, "restored");
    const failedToast = ui.toasts.slice(toasts2).some((x) => x.kind === "error");
    const mainBack = (await ipc.readTextFile(main)).text === before && editor.textOf(main) === before;
    const annexeBack = await ipc.pathExists(annexe);
    const addedLeft = await ipc.pathExists(`${rootA}/nouveau.tex`);
    check("history: everything put back (a file changed, one deleted; one added left)", mainBack && annexeBack && addedLeft && !failedToast, { changes, mainBack, annexeBack, addedLeft, failedToast });
    ui.closeOverlay();

    // ------------------------------- two saves of a file at once
    // (the automatic one and the one before a build): the long text of the
    // first takes longer to reach the disk than the short one that follows.
    const notes = `${rootA}/notes.txt`;
    await ipc.createFile(notes, "Début.\n");
    await editor.open(notes);
    await until(() => samePath(editor.active, notes) && !!editor.view, 5_000, "notes open");
    view().dispatch({ changes: { from: 0, to: text().length, insert: "Une ligne de notes assez longue.\n".repeat(150_000) } });
    const firstSave = editor.save(notes, { silent: true });
    view().dispatch({ changes: { from: 0, to: text().length, insert: "Court.\n" } });
    const secondSave = editor.save(notes, { silent: true });
    await Promise.all([firstSave, secondSave]);
    const onDisk = (await ipc.readTextFile(notes)).text;
    const notesTab = editor.tabs.find((x) => samePath(x.path, notes));
    check("two saves at once: the last text on the disk, the tab saved", onDisk === "Court.\n" && !notesTab?.dirty, { disk: onDisk.length, tab: text().length, dirty: notesTab?.dirty });
    await editor.close(notes, { force: true });

    // ------------------------------- another project opened during a build
    await editor.saveAll({ silent: true });
    void build.run();
    await until(() => build.running, 10_000, "a build of project A");
    await project.open(rootB);
    // The build of A would have ended by now.
    await pause(3000);
    const shownOfA = inFolder(viewer.pdf, rootA) || diagnostics.build.some((d) => inFolder(d.file, rootA));
    check("another project opened during a build: the build stops, its page and problems not shown", samePath(project.info?.root, rootB) && !build.running && !shownOfA, { root: project.info?.root, running: build.running, pdf: viewer.pdf });

    // ------------------------------- settings changed twice in a row
    const size = app.settings!.editor.fontSize;
    void app.update((s) => (s.editor.fontSize = size + 1));
    await app.update((s) => (s.editor.fontSize = size + 2));
    const kept = (await ipc.getSettings()).editor.fontSize;
    check("settings changed twice in a row: the last kept", kept === size + 2, { asked: size + 2, kept });
    await app.update((s) => (s.editor.fontSize = size));
  } catch (e) {
    results.failure = String(e);
  } finally {
    await app.update((s) => (s.editor.autoSave = autoSave));
    if (ui.dialog) ui.closeDialog(null);
  }
  for (const [what, result] of Object.entries(results)) log(`together ${what}: ${result}`);
  const ok = !results.failure && Object.values(results).every((r) => !r.startsWith("FAILED"));
  log(`together scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}
