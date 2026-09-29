// End-to-end check of the real application (development builds only).
//
//   RAYTEX_SELFTEST=/path/to/project npm run app:dev
//
// Opens the project, the main file, builds it with the real TeX
// distribution, waits for the PDF to be drawn by pdf.js, exercises
// completion and SyncTeX, prints a report on the terminal and quits.

import { acceptCompletion, currentCompletions, setSelectedCompletion, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import * as ipc from "../lib/ipc";
import { app } from "../lib/state/app.svelte";
import { build } from "../lib/state/build.svelte";
import { editor } from "../lib/state/editor.svelte";
import { project } from "../lib/state/project.svelte";
import { distLabel, tex } from "../lib/state/tex.svelte";
import { diagnostics } from "../lib/state/diagnostics.svelte";
import { fixable, quickFix } from "../lib/fixes";
import { fileSelection } from "../lib/state/selection.svelte";
import { media } from "../lib/state/media.svelte";
import { colors } from "../lib/state/colors.svelte";
import { fonts } from "../lib/state/fonts.svelte";
import { templates } from "../lib/state/templates.svelte";
import { ui } from "../lib/state/ui.svelte";
import { viewer } from "../lib/state/viewer.svelte";
import { basename, samePath } from "../lib/utils";

async function until(check: () => boolean, timeoutMs: number, what: string) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      // What the application said meanwhile (an error toast explains most time-outs).
      const toasts = ui.toasts.map((t) => `${t.kind}: ${t.message}${t.detail ? ` (${t.detail})` : ""}`);
      throw new Error(`timeout: ${what}${toasts.length ? ` — ${toasts.join(" | ")}` : ""}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return Date.now() - start;
}

export async function runSelfTest() {
  const target = await invoke<string | null>("selftest_target");
  if (!target) return;
  const report: Record<string, unknown> = {};
  const log = (msg: string) => void ipc.logFrontend("info", `selftest: ${msg}`);
  // Every error or warning shown, when it is shown (a toast is gone by the
  // time a step times out).
  const toast = ui.toast.bind(ui);
  ui.toast = (kind, message, opts) => {
    if (kind === "error" || kind === "warning") {
      const o = build.outcome;
      const detail = o ? ` [${o.engine}, success ${o.success}, pdf ${!!o.pdf}, steps ${o.steps.map((x) => `${x.name}:${x.exitCode}`).join(" ")}, ${o.diagnostics.filter((d) => d.severity === "error").map((d) => d.message).join(" | ")}]` : "";
      log(`${kind} notification: ${message}${opts?.detail ? ` — ${opts.detail}` : ""}${detail}`);
      if (kind === "error") log(`last output: ${build.output.slice(-12).map((l) => l.text).join(" ⏎ ")}`);
    }
    return toast(kind, message, opts);
  };
  let ok = true;
  try {
    report.startMs = await until(() => app.ready, 20_000, "app ready");
    // The layout is remembered between runs: start from the default one.
    ui.setVisible("pdf", true);
    ui.setVisible("formatBar", true);
    ui.setVisible("bottom", false);
    report.texMs = await until(() => tex.ready, 60_000, "TeX detection");
    report.distribution = tex.active ? distLabel(tex.active) : null;
    if (!(await project.open(target))) throw new Error("project did not open");
    report.main = project.info?.main;
    report.files = project.tree.length;
    const main = project.info!.main!;
    await editor.open(main);
    await until(() => !!editor.view && editor.view.state.doc.length > 0, 5_000, "editor content");
    report.lines = editor.view!.state.doc.lines;
    const list = await ipc.complete(main, "\\sec", "", true);
    report.completions = list?.items.length ?? 0;
    const started = Date.now();
    await build.run();
    await until(() => build.running, 10_000, "build start");
    await until(() => !build.running, 180_000, "build end");
    report.buildMs = Date.now() - started;
    report.buildStatus = build.status;
    report.engine = build.outcome?.engine;
    report.pages = build.outcome?.pages;
    report.errors = build.outcome?.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
    await until(() => viewer.pages > 0, 20_000, "PDF loaded");
    report.viewerPages = viewer.pages;
    await drawn(".pdf-viewer canvas.canvas", log, "PDF page drawn");
    const canvas = document.querySelector<HTMLCanvasElement>(".pdf-viewer canvas.canvas");
    report.canvas = canvas ? `${canvas.width}x${canvas.height}` : `not drawn (${document.visibilityState})`;
    report.textLayer = !!document.querySelector(".pdf-viewer .textLayer span");
    const fwd = await ipc.synctexForward(main, 12);
    report.synctexForward = fwd ? { page: fwd.page, rects: fwd.rects.length } : null;
    if (fwd && viewer.pdf) {
      const r = fwd.rects[0];
      const inv = await ipc.synctexInverse(viewer.pdf, fwd.page, r.x + 1, r.y + r.height / 2);
      report.synctexInverse = inv ? `${basename(inv.file)}:${inv.line}` : null;
    }
    const outline = await ipc.structure(main);
    report.outline = outline?.outline.length ?? 0;
    report.labels = outline?.labels.length ?? 0;
    ok = build.status === "success" && !!fwd;
  } catch (e) {
    ok = false;
    report.failure = String(e);
  }
  log(JSON.stringify(report, null, 2));
  log(ok ? "PASSED" : "FAILED");
  const [which, assets] = await invoke<[string | null, string | null]>("selftest_scenes");
  if (ok && which === "workflow" && assets) ok = await workflowScenes(log, assets);
  else if (ok && which === "projects" && assets) ok = await projectsScenes(log, assets);
  else if (ok && which === "fixes" && assets) ok = await fixesScenes(log, assets);
  else if (ok && which === "files" && assets) ok = await filesScenes(log, assets);
  else {
    if (ok && which && which !== "media") await scenes(log);
    if (ok && which && (which === "media" || which === "all") && assets) ok = await mediaScenes(log, assets);
  }
  await new Promise((r) => setTimeout(r, 300));
  await invoke("selftest_exit", { code: ok ? 0 : 1 });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shows the main screens one after the other, for screenshots. */
async function scenes(log: (msg: string) => void) {
  const scene = async (name: string, setup: () => unknown, holdMs = 3500) => {
    try {
      await setup();
    } catch (e) {
      log(`scene ${name} failed: ${e}`);
    }
    await pause(900);
    log(`scene: ${name}`);
    await pause(holdMs);
  };
  const root = project.info!.root;
  const chapter = project.tree.flatMap((n) => n.children ?? []).find((n) => n.name.endsWith(".tex"))?.path ?? project.info!.main!;
  const view = () => editor.view!;
  const lineStart = (n: number) => view().state.doc.line(Math.min(n, view().state.doc.lines)).from;

  await scene("editor-pdf", async () => {
    await editor.open(chapter);
    const doc = view().state.doc;
    let target = 1;
    for (let n = 1; n <= doc.lines; n++) if (/^[A-ZÉa-z]/.test(doc.line(n).text) && doc.line(n).text.length > 30) { target = n; break; }
    view().dispatch({ selection: { anchor: lineStart(target) + 5 } });
    view().focus();
    const fwd = await ipc.synctexForward(chapter, target);
    log(`forward ${basename(chapter)}:${target} → ${JSON.stringify(fwd && { page: fwd.page, rects: fwd.rects })}`);
    await editor.syncForward();
    await pause(1200);
    const sc = document.querySelector<HTMLElement>(".pdf-viewer .scroller");
    log(`viewer page ${viewer.page}, scrollTop ${sc?.scrollTop}, highlight ${!!document.querySelector(".pdf-viewer .highlight")}`);
    await pause(1500);
    const pages = [...document.querySelectorAll<HTMLElement>(".pdf-viewer .page")];
    log(`pages: ${pages.map((p, i) => `${i + 1}:${p.offsetTop}${p.querySelector("canvas") ? "✓" : "·"}`).join(" ")} scrollTop ${sc?.scrollTop} height ${sc?.clientHeight}`);
  });
  await scene("error", async () => {
    const end = view().state.doc.length;
    view().dispatch({ changes: { from: end, insert: "\nUn \\textbff{mot} en gras.\n" } });
    await editor.save();
    await build.run();
    await until(() => build.running, 10_000, "build start");
    await until(() => !build.running, 120_000, "build end");
    ui.showBottom("problems");
  }, 4500);
  await scene("completion", () => {
    ui.bottomVisible = false;
    const end = view().state.doc.length;
    view().dispatch({ changes: { from: end, insert: "\\sec" }, selection: { anchor: end + 4 } });
    view().focus();
    startCompletion(view());
  });
  await scene("math", () => {
    const end = view().state.doc.length;
    const formula = "\n\\[ \\int_0^1 \\frac{x^2}{\\sqrt{1+x}} \\, dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2} \\]\n";
    view().dispatch({ changes: { from: end, insert: formula }, selection: { anchor: end + 12 } });
    view().focus();
  });
  await scene("palette", () => {
    ui.paletteMode = "commands";
    ui.openOverlay("palette");
  });
  await scene("settings", () => ui.openSettings("build"));
  await scene("help", () => ui.openHelp("errors"));
  await scene("help-guide", () => {
    ui.closeOverlay();
    return new Promise((r) => setTimeout(() => r(ui.openHelp("guides", "compilation")), 50));
  });
  await scene("setup", () => ui.openOverlay("setup"));
  await scene("new-project", () => ui.openOverlay("newProject"));
  await scene("packages", () => {
    ui.closeOverlay();
    ui.showSidebar("packages");
  });
  await scene("outline-light", async () => {
    await app.update((s) => (s.general.theme = "light"));
    ui.showSidebar("outline");
  });
  await app.update((s) => (s.general.theme = "system"));
  log(`scenes done (${root})`);
}


/** Waits for a PDF preview to be drawn; drawing needs a visible screen (logged, not fatal, when asleep). */
async function drawn(selector: string, log: (msg: string) => void, what: string) {
  try {
    await until(() => !!document.querySelector(selector), 45_000, what);
  } catch {
    log(`${what}: not drawn (screen asleep or hidden?), continuing`);
  }
}

/** Clicks the first element matching `selector` whose text contains `text`. */
function clickText(selector: string, text: string): boolean {
  const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.includes(text));
  el?.click();
  return !!el;
}

async function buildOk(log: (msg: string) => void, what: string): Promise<boolean> {
  await build.run();
  await until(() => build.running, 10_000, "build start");
  await until(() => !build.running, 300_000, "build end");
  const errors = build.outcome?.diagnostics.filter((d) => d.severity === "error").map((d) => d.message) ?? [];
  log(`${what}: build ${build.status} (${build.outcome?.engine}, ${build.outcome?.durationMs} ms)${errors.length ? ` errors: ${errors.join(" | ")}` : ""}`);
  return build.status === "success";
}

/** Images, TikZ studio and fonts, from the dialogs to a successful build. */
async function mediaScenes(log: (msg: string) => void, assets: string): Promise<boolean> {
  const scene = async (name: string) => {
    await pause(900);
    log(`scene: ${name}`);
    await pause(3000);
  };
  let ok = true;
  const chapter = project.tree.flatMap((n) => n.children ?? []).find((n) => n.name.startsWith("intro"))?.path ?? project.info!.main!;
  await editor.open(chapter);
  const view = editor.view!;
  view.dispatch({ selection: { anchor: view.state.doc.length } });

  // ------------------------------------------------------------- images
  try {
    media.openImages({ paths: [`${assets}/Photo de l'expérience.png`, `${assets}/Schéma réseau.svg`] });
    await until(() => document.querySelectorAll(".items .item").length === 2, 10_000, "image items");
    await pause(800);
    await scene("image-dialog");
    const before = editor.textOf(chapter)!.length;
    document.querySelector<HTMLButtonElement>(".right .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "image insertion");
    const text = editor.textOf(chapter)!;
    const inserted = text.slice(before);
    const files = await Promise.all(["figures/photo-de-l-experience.png", "figures/schema-reseau.pdf"].map((f) => ipc.pathExists(`${project.info!.root}/${f}`)));
    log(`images: files ${files.join(",")}, subfigures ${(inserted.match(/subfigure/g) ?? []).length / 2}, subcaption ${editor.textOf(project.info!.main!)?.includes("{subcaption}")}`);
    ok = files.every(Boolean) && inserted.includes("\\includegraphics") && (await buildOk(log, "images")) && ok;
  } catch (e) {
    log(`images failed: ${e}`);
    ok = false;
  }

  // ------------------------------------------------------ pasted images
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e3a857";
    ctx.fillRect(0, 0, 120, 80);
    const png = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><circle cx="30" cy="20" r="15" fill="teal"/></svg>'], { type: "image/svg+xml" });
    const v = editor.view!;
    v.dispatch({ changes: { from: v.state.doc.length, insert: "\n\n" }, selection: { anchor: v.state.doc.length + 2 } });
    media.openImages({ blobs: [new File([png], "capture.png", { type: "image/png" }), new File([svg], "dessin.svg", { type: "image/svg+xml" })] });
    await until(() => document.querySelectorAll(".items .item").length === 2, 10_000, "pasted items");
    document.querySelector<HTMLButtonElement>(".right .btn.primary")!.click();
    await until(() => ui.overlay === null, 30_000, "pasted insertion").catch((e) => {
      const button = document.querySelector<HTMLButtonElement>(".right .btn.primary");
      throw new Error(`${e.message} (button ${button?.disabled ? "disabled" : "enabled"}, busy ${!!button?.querySelector(".spinner")}, items ${document.querySelectorAll(".items .item").length})`);
    });
    const tree = await ipc.fileTree();
    const figures = tree.find((n) => n.name === "figures")?.children?.map((c) => c.name) ?? [];
    const pasted = figures.filter((n) => n.startsWith("image-"));
    log(`pasted: ${pasted.join(", ")}`);
    ok = pasted.some((n) => n.endsWith(".png")) && pasted.some((n) => n.endsWith(".pdf")) && ok;
  } catch (e) {
    log(`pasted images failed: ${e}`);
    ok = false;
  }

  // ---------------------------------------------------------------- TikZ
  try {
    const v = editor.view!;
    v.dispatch({ changes: { from: v.state.doc.length, insert: "\n\n" }, selection: { anchor: v.state.doc.length + 2 } });
    media.openTikz(null);
    // The studio opens on the whiteboard: the templates are in their tab.
    await until(() => !!document.querySelector(".studio"), 10_000, "tikz studio");
    clickText('[role="dialog"] [role="tab"]', "Modèles") || clickText('[role="dialog"] [role="tab"]', "Templates");
    await until(() => !!document.querySelector(".studio .tpl"), 20_000, "tikz templates").catch((e) => {
      const tabs = [...document.querySelectorAll<HTMLElement>('[role="dialog"] [role="tab"]')].map((t) => `${t.textContent?.trim()}${t.getAttribute("aria-selected") === "true" ? "*" : ""}`);
      throw new Error(`${e.message} (overlay ${ui.overlay}, tabs ${tabs.join(", ")})`);
    });
    clickText(".cats .cat", "Diagram") || clickText(".cats .cat", "Diagramme");
    await pause(300);
    clickText(".templates .tpl", "Organigramme") || clickText(".templates .tpl", "Flowchart");
    await pause(400);
    // A replaced drawing asks for confirmation.
    if (ui.dialog) ui.closeDialog(true);
    await drawn(".preview-pane canvas", log, "tikz preview");
    await pause(1500);
    await scene("tikz-studio");
    document.querySelector<HTMLButtonElement>(".footer .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "tikz insertion");
    const main = editor.textOf(project.info!.main!) ?? "";
    log(`tikz: picture ${editor.textOf(chapter)!.includes("\\begin{tikzpicture}")}, libraries ${/\\usetikzlibrary\{[^}]*positioning/.test(main)}`);
    ok = (await buildOk(log, "tikz")) && ok;
  } catch (e) {
    log(`tikz failed: ${e}`);
    ok = false;
  }

  // --------------------------------------------------------------- fonts
  try {
    media.openFonts();
    await until(() => document.querySelectorAll(".list .font").length > 20, 20_000, "system fonts");
    clickText(".list .font", "Georgia") || document.querySelector<HTMLButtonElement>(".list .font")!.click();
    await drawn(".preview-box canvas", log, "font preview");
    await pause(1200);
    await scene("font-dialog");
    clickText(".tabs .tab", "LaTeX");
    await pause(300);
    clickText(".list .font", "Libertinus");
    // Its preview may install the font first (MiKTeX): the build waits for it.
    await pause(500);
    await until(() => !document.querySelector(".preview-box .busy"), 180_000, "tex font preview").catch((e) => log(`${e}, continuing`));
    await drawn(".preview-box canvas", log, "tex font preview");
    await pause(800);
    await scene("font-latex");
    document.querySelector<HTMLButtonElement>(".right .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "font applied");
    log(`fonts: libertinus ${editor.textOf(project.info!.main!)?.includes("{libertinus}")}`);
    ok = (await buildOk(log, "fonts")) && ok;
  } catch (e) {
    log(`fonts failed: ${e}`);
    ok = false;
  }
  await editor.saveAll();
  log(`media scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}

/** A key press as the user would make it (window capture handlers included). */
function press(key: string, mods: { shift?: boolean; alt?: boolean } = {}) {
  const mac = navigator.platform.toLowerCase().includes("mac");
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: mods.shift ? key.toUpperCase() : key,
      code: `Key${key.toUpperCase()}`,
      metaKey: mac,
      ctrlKey: !mac,
      shiftKey: !!mods.shift,
      altKey: !!mods.alt,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Sets the value of an input as if typed. */
function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * New empty project, templates, live compilation, undo/redo, formatting
 * bar, closing and reopening panels. `dir` is where the project is created.
 */
async function workflowScenes(log: (msg: string) => void, dir: string): Promise<boolean> {
  const scene = async (name: string, holdMs = 2500) => {
    await pause(700);
    log(`scene: ${name}`);
    await pause(holdMs);
  };
  const results: Record<string, unknown> = {};
  const check = (name: string, value: boolean, detail: unknown = "") => {
    results[name] = value ? "ok" : `FAILED ${detail}`;
  };
  // Anything opening the console by itself is reported (it must not happen).
  const showBottom = ui.showBottom.bind(ui);
  ui.showBottom = (tab) => {
    log(`console opened (${tab}) by ${new Error().stack?.split("\n").slice(1, 5).join(" < ")}`);
    showBottom(tab);
  };
  const toggleBottom = ui.toggleBottom.bind(ui);
  ui.toggleBottom = () => {
    log(`console toggled by ${new Error().stack?.split("\n").slice(1, 5).join(" < ")}`);
    toggleBottom();
  };
  try {
    check("live by default", app.settings?.build.autoBuild === "onIdle", app.settings?.build.autoBuild);

    // --------------------------------------------------- new project
    ui.openOverlay("newProject");
    await until(() => !!document.querySelector<HTMLInputElement>(".form input.large"), 5_000, "new project dialog");
    type(document.querySelector<HTMLInputElement>(".form input.large")!, "Rapport de stage");
    await scene("new-project", 1500);
    ui.closeOverlay();
    const target = `${dir}/rapport-${Date.now()}`;
    check("created", await project.createEmpty(target, "Rapport de stage"));
    const main = project.info!.main!;
    await until(() => editor.active === main && !!editor.view, 5_000, "main open");
    check("empty main", editor.textOf(main) === "", editor.textOf(main));
    await until(() => !!document.querySelector(".start .card"), 5_000, "start card");
    check("start card", !!document.querySelector(".start .card"));
    check("templates panel", ui.sidebarVisible && ui.sidebar === "templates");
    check("project name", project.info?.name === "Rapport de stage", project.info?.name);
    await scene("empty-project", 1500);
    const t0 = Date.now();
    await until(() => templates.list.length > 0 && templates.list.every((x) => templates.thumbs[x.id] && templates.thumbs[x.id].state !== "loading"), 240_000, "thumbnails");
    const states = templates.list.map((x) => templates.thumbs[x.id]?.state);
    results.thumbnails = `${states.filter((x) => x === "ready").length}/${states.length} in ${Date.now() - t0} ms`;
    check("thumbnails ready", states.every((x) => x === "ready"), states.join(","));
    await scene("templates");

    // An empty document is not compiled.
    await build.run();
    check("empty not built", build.status === "idle" && ui.toasts.some((x) => x.kind === "info"), build.status);

    // ------------------------------------------------ apply a template
    document.querySelector<HTMLButtonElement>('.card[data-template="article"]')!.click();
    await until(() => (editor.textOf(main) ?? "").includes("\\documentclass"), 10_000, "template applied");
    check("title filled", (editor.textOf(main) ?? "").includes("Rapport de stage"));
    await until(() => build.running || build.status !== "idle", 15_000, "automatic build");
    await until(() => !build.running, 120_000, "build end");
    check("template builds", build.status === "success", build.status);
    await until(() => viewer.pages > 0, 20_000, "PDF loaded");
    check("console stays closed", !ui.bottomVisible);
    await drawn(".pdf-viewer canvas.canvas", log, "PDF page drawn");
    await scene("template-applied");

    // ------------------------------------------------------ undo / redo
    const applied = editor.textOf(main)!;
    (document.activeElement as HTMLElement | null)?.blur();
    press("z");
    check("undo from outside the editor", editor.textOf(main) === "", (editor.textOf(main) ?? "").slice(0, 40));
    press("z", { shift: true });
    check("redo (shift)", editor.textOf(main) === applied);
    press("z");
    press("y");
    check("redo (Mod-y)", editor.textOf(main) === applied);

    // --------------------------------------------------- live compile
    const v = editor.view!;
    const end = v.state.doc.toString().lastIndexOf("\\end{document}");
    const beforeRev = viewer.revision;
    const startLive = Date.now();
    v.dispatch({ changes: { from: end, insert: "\\section{Essai en direct}\nCe paragraphe apparaît sans cliquer sur Compiler.\n\n" }, userEvent: "input.type" });
    await until(() => build.running, 10_000, "live build start");
    await until(() => !build.running, 120_000, "live build end");
    await until(() => viewer.revision !== beforeRev, 10_000, "PDF reloaded");
    results.liveMs = Date.now() - startLive;
    check("live build", build.status === "success", build.status);

    // ------------------------------------- manual build with an error
    const toasts = ui.toasts.length;
    const at = editor.view!.state.doc.toString().lastIndexOf("\\end{document}");
    editor.view!.dispatch({ changes: { from: at, insert: "Un \\textbff{mot}.\n\n" }, userEvent: "input.type" });
    await build.run();
    await until(() => build.running, 10_000, "build start");
    await until(() => !build.running, 120_000, "build end");
    check("error: console closed", !ui.bottomVisible);
    check("error: notified", ui.toasts.length > toasts && ui.toasts.some((x) => x.kind === "error"));
    check("error: status", build.status === "failed", build.status);
    await scene("build-error", 1500);
    press("z");

    // ---------------------------------------- linked environment names
    const w = editor.view!;
    const pos = w.state.doc.toString().lastIndexOf("\\end{document}");
    w.dispatch({ changes: { from: pos, insert: "\\begin{itemize}\n\t\\item un\n\\end{itemize}\n\n" }, userEvent: "input.type" });
    const begin = w.state.doc.toString().lastIndexOf("\\begin{itemize}") + 7;
    w.dispatch({ changes: { from: begin, to: begin + 7, insert: "enumerate" }, userEvent: "input.type" });
    const txt = w.state.doc.toString();
    check("linked rename", txt.includes("\\begin{enumerate}\n\t\\item un\n\\end{enumerate}"));

    // ------------------------------------------------ typing dollars
    const typeText = (text: string) => {
      for (const ch of text) {
        const { from, to } = w.state.selection.main;
        const handled = w.state.facet(EditorView.inputHandler).some((h) => h(w, from, to, ch, () => w.state.update({ changes: { from, to, insert: ch } })));
        if (!handled) w.dispatch({ changes: { from, to, insert: ch }, selection: { anchor: from + ch.length }, userEvent: "input.type" });
      }
    };
    const dollarAt = w.state.doc.toString().lastIndexOf("\\end{document}");
    // At the end of an empty line: the first $ makes a pair, the closing one steps over it.
    w.dispatch({ changes: { from: dollarAt, insert: "\n\n" }, selection: { anchor: dollarAt } });
    typeText("Soit $f(x)$ et le prix$");
    const line = w.state.doc.lineAt(dollarAt).text;
    check("dollars", line.startsWith("Soit $f(x)$ et le prix$") && !line.includes("$$"), line);
    w.dispatch({ changes: { from: dollarAt, to: w.state.doc.lineAt(dollarAt).to } });

    // -------------------------------------------------- formatting bar
    const para = w.state.doc.toString().indexOf("Ce paragraphe");
    w.dispatch({ selection: { anchor: para + 3, head: para + 13 } });
    w.focus();
    document.querySelector<HTMLButtonElement>('.format-bar [aria-label="' + (document.documentElement.lang === "en" ? "Bold" : "Gras") + '"]')!.click();
    check("bold button", (editor.textOf(main) ?? "").includes("Ce \\textbf{paragraphe}"));
    document.querySelector<HTMLButtonElement>(".format-bar .select-btn.style")!.click();
    await pause(200);
    clickText(".menu .item", "Sous-section") || clickText(".menu .item", "Subsection");
    check("heading style", (editor.textOf(main) ?? "").includes("\\subsection{Ce \\textbf{paragraphe}"));
    const tableBtn = [...document.querySelectorAll<HTMLButtonElement>(".format-bar .text-btn")].find((b) => b.querySelector("span")?.textContent?.match(/Tableau|Table/))!;
    editor.view!.dispatch({ selection: { anchor: editor.view!.state.doc.toString().lastIndexOf("\\end{document}") } });
    tableBtn.click();
    await pause(200);
    log(`table picker open: ${!!document.querySelector(".tables")}, console ${ui.bottomVisible}`);
    const cells = document.querySelectorAll<HTMLButtonElement>(".tables .cell");
    cells[8 * 2 + 2].dispatchEvent(new MouseEvent("mouseenter"));
    await pause(300);
    await scene("table-picker", 1200);
    cells[8 * 2 + 2].click();
    // The grid editor opens on a 3 × 3 table: a header row with an `&`, then insert.
    await until(() => document.querySelectorAll(".grid-editor .cm-editor").length === 9, 5_000, "grid editor");
    await scene("grid-editor", 1200);
    const cell = (i: number) => EditorView.findFromDOM(document.querySelectorAll<HTMLElement>(".grid-editor .cm-editor")[i])!;
    ["Produit", "R&D", "Prix"].forEach((text, i) => cell(i).dispatch({ changes: { from: 0, insert: text } }));
    await pause(300);
    [...document.querySelectorAll<HTMLButtonElement>(".grid-editor footer .btn.primary")][0].click();
    await until(() => !document.querySelector(".grid-editor"), 5_000, "grid inserted");
    await pause(600);
    const withTable = editor.textOf(main) ?? "";
    check(
      "table 3x3",
      /\\begin\{tabular\}\{lcc\}/.test(withTable) && withTable.includes("Produit & R\\&D & Prix") && withTable.includes("{booktabs}"),
      withTable.slice(withTable.indexOf("\\begin{table}"), withTable.indexOf("\\end{table}") + 11),
    );
    press("Escape");
    document.querySelector<HTMLButtonElement>(".format-bar .all")!.click();
    await until(() => !!document.querySelector(".all-tools .at-item .katex"), 10_000, "all tools");
    await scene("all-tools");
    document.querySelector<HTMLButtonElement>(".format-bar .all")!.click();

    // ------------------------------------------ completion with @ hint
    const e2 = editor.view!;
    const p2 = e2.state.doc.toString().lastIndexOf("\\end{document}");
    e2.dispatch({ changes: { from: p2, insert: "$\\alp$\n" }, selection: { anchor: p2 + 5 }, scrollIntoView: true });
    e2.focus();
    startCompletion(e2);
    await until(() => !!document.querySelector(".cm-completion-shortcut"), 10_000, "@ badge");
    check("@ badge", document.querySelector(".cm-completion-shortcut")?.textContent === "@a", document.querySelector(".cm-completion-shortcut")?.textContent);
    await scene("completion-at", 1500);
    e2.dispatch({ changes: { from: p2, to: p2 + 7 } });

    // -------------------------------------------------- close / reopen
    document.querySelector<HTMLButtonElement>(".pdf-viewer .bar > .icon-btn:last-child")!.click();
    check("pdf closed", !ui.pdfVisible);
    document.querySelector<HTMLButtonElement>(".toolbar .view-btn")!.click();
    await pause(200);
    await scene("view-menu", 1200);
    clickText(".menu .item", "Aperçu PDF") || clickText(".menu .item", "PDF preview");
    check("pdf reopened", ui.pdfVisible);
    ui.showBottom("output");
    await pause(300);
    document.querySelector<HTMLButtonElement>(".panel .tabs .icon-btn")!.click();
    check("console closed by its cross", !ui.bottomVisible);

    // ------------------------------------------- empty chapter, @ panel
    const chapter = `${project.info!.root}/chapitre.tex`;
    await ipc.createFile(chapter, "");
    await editor.open(chapter);
    await until(() => !!document.querySelector(".start .card"), 5_000, "chapter start card");
    await scene("empty-chapter", 1500);
    clickText(".start .choice", "Inclure") || clickText(".start .choice", "Include");
    await pause(300);
    check("chapter included", (editor.textOf(main) ?? "").includes("\\input{chapitre}"));
    ui.showSidebar("snippets");
    await until(() => !!document.querySelector(".at-grid .at-item .katex"), 10_000, "@ panel");
    await scene("macros-panel");
    await editor.saveAll();
    check("final build", await buildOk(log, "final"));

    // ------------------------------------------ precompiled preamble
    // The format is prepared in the background after a build; the next one uses it.
    await pause(6000);
    const t1 = Date.now();
    check("build with the format", await buildOk(log, "with format"));
    const usedFormat = build.output.some((l) => l.stream === "cmd" && l.text.includes("-fmt="));
    results.formatBuildMs = `${Date.now() - t1} ms (format ${usedFormat ? "used" : "not used"})`;
    // MiKTeX does not use precompiled preambles (see build::preamble).
    check("format used", usedFormat || tex.active?.kind === "miktex");

    await editor.open(main);
    // The templates are in the language of the interface.
    const en = document.documentElement.lang === "en";
    const paragraph = en ? "Here is a paragraph" : "Voici un paragraphe";
    const summary = en ? "Summarise your article here" : "Résumez ici";
    const selectText = (needle: string) => {
      const v = editor.view!;
      const at = v.state.doc.toString().indexOf(needle);
      if (at < 0) return false;
      v.dispatch({ selection: { anchor: at, head: at + needle.length }, scrollIntoView: true });
      v.focus();
      return true;
    };

    // --------------------------------------------------------- colours
    await colors.refresh();
    check("select for colour", selectText(paragraph));
    document.querySelector<HTMLButtonElement>(".format-bar .split .caret")!.click();
    await until(() => document.querySelectorAll(".color-menu .grid.big .swatch").length >= 68, 5_000, "colour menu");
    results.colors = document.querySelectorAll(".color-menu .swatch").length;
    await scene("colors", 1500);
    document.querySelector<HTMLButtonElement>('.color-menu .swatch[title="Emerald"]')!.click();
    await pause(600);
    const withColor = editor.textOf(main) ?? "";
    check("dvipsnames colour", withColor.includes(`\\textcolor{Emerald}{${paragraph}}`) && withColor.includes("\\usepackage[dvipsnames]{xcolor}"));
    check("coloured build", await buildOk(log, "colours"));

    // ----------------------------------------------------------- fonts
    await fonts.refresh();
    check("main font read", !!fonts.current?.main.name.startsWith("Latin Modern"), fonts.current?.main.name);
    check("select for font", selectText(summary));
    document.querySelector<HTMLButtonElement>(".format-bar .select-btn.font")!.click();
    await until(() => !!document.querySelector(".font-menu .add"), 5_000, "font menu");
    await scene("font-menu", 1500);
    document.querySelector<HTMLButtonElement>(".font-menu .add")!.click();
    await until(() => document.querySelectorAll(".list .font").length > 20, 20_000, "system fonts");
    clickText(".list .font", "Georgia");
    await pause(1500);
    check("role for a passage", !!document.querySelector(".roles .role.active")?.textContent?.match(/passage/i));
    await scene("font-dialog", 1500);
    document.querySelector<HTMLButtonElement>(".right .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "font applied");
    await pause(500);
    const withFont = editor.textOf(main) ?? "";
    check("extra font defined and applied", withFont.includes("\\newfontfamily\\fontGeorgia") && withFont.includes(`{\\fontGeorgia ${summary}`), withFont.slice(0, 300));
    await fonts.refresh();
    check("extra font listed", !!fonts.current?.extra.some((e) => e.command === "fontGeorgia"));
    check("font build (LuaLaTeX)", await buildOk(log, "fonts"));

    // ------------------------------------------------- TikZ whiteboard
    const z = editor.view!;
    const endAt = z.state.doc.toString().lastIndexOf("\\end{document}");
    z.dispatch({ changes: { from: endAt, insert: "\n\n" }, selection: { anchor: endAt + 1 } });
    document.querySelector<HTMLButtonElement>(".format-bar .text-btn.tikz")!.click();
    await until(() => !!document.querySelector(".studio .board svg"), 10_000, "whiteboard");
    await pause(500);
    const svg = document.querySelector<SVGSVGElement>(".studio .board svg")!;
    const boardEl = document.querySelector<HTMLElement>(".studio .board")!;
    const r = svg.getBoundingClientRect();
    const pe = (type: string, x: number, y: number) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, button: 0, isPrimary: true }));
    const k = (key: string) => boardEl.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    const drag = (x1: number, y1: number, x2: number, y2: number) => {
      pe("pointerdown", x1, y1);
      pe("pointermove", (x1 + x2) / 2, (y1 + y2) / 2);
      pe("pointermove", x2, y2);
      pe("pointerup", x2, y2);
    };
    boardEl.focus();
    k("r");
    drag(120, 300, 260, 220);
    k("c");
    drag(420, 260, 470, 260);
    k("a");
    drag(260, 260, 370, 260);
    k("t");
    pe("pointerdown", 190, 180);
    await pause(150);
    const input = document.querySelector<HTMLInputElement>(".node-input")!;
    input.value = "Entrée $x_1$";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await pause(2500);
    check("whiteboard shapes", document.querySelectorAll(".studio .board g.shape").length === 3 && !!document.querySelector(".studio .board .node .katex"));
    await scene("whiteboard", 2500);
    document.querySelector<HTMLButtonElement>(".footer .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "drawing inserted");
    const withDrawing = editor.textOf(main) ?? "";
    check("drawing inserted", /\\draw \([^)]*\) rectangle/.test(withDrawing) && withDrawing.includes("\\node at") && withDrawing.includes("{Entrée $x_1$}"));
    check("drawing build", await buildOk(log, "drawing"));
    await scene("final-document", 2500);
  } catch (e) {
    results.failure = String(e);
  }
  log(JSON.stringify(results, null, 2));
  const ok = !results.failure && Object.values(results).every((r) => typeof r !== "string" || !r.startsWith("FAILED"));
  log(`workflow scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}

/**
 * Projects folder, start screen, light mode (a file opened on its own,
 * built without writing next to it), conversion into a project, recent
 * files, renaming and trash. `dir` is a scratch folder.
 */
async function projectsScenes(log: (msg: string) => void, dir: string): Promise<boolean> {
  const scene = async (name: string, holdMs = 2500) => {
    await pause(700);
    log(`scene: ${name}`);
    await pause(holdMs);
  };
  const results: Record<string, unknown> = {};
  const check = (name: string, value: boolean, detail: unknown = "") => {
    results[name] = value ? "ok" : `FAILED ${detail}`;
  };
  try {
    const projectsDir = `${dir}/mes-projets`;
    await app.update((s) => (s.general.projectsDir = projectsDir));
    check("projects folder", (await ipc.projectsDir()) === projectsDir, await ipc.projectsDir());

    // Two projects, one built (its PDF gives the preview).
    check("first project", await project.createEmpty(`${projectsDir}/rapport`, "Rapport de stage"));
    await until(() => templates.list.length > 0, 10_000, "templates");
    await templates.apply(templates.list.find((x) => x.id === "article")!);
    await until(() => !build.running && build.status === "success", 60_000, "first build");
    check("second project", await project.createEmpty(`${projectsDir}/td`, "TD de maths"));
    await project.close();
    await until(() => document.querySelectorAll(".browser .card").length >= 2, 10_000, "projects on the start screen");
    await until(() => !!document.querySelector(".browser .card .page img"), 15_000, "project preview");
    results.cards = document.querySelectorAll(".browser .card").length;
    await scene("projects-home");

    // ---------------------------------------------------------- light mode
    // Prepared by the test script: devoir.tex (with \\input{partie}) and partie.tex.
    const loose = `${dir}/telechargements`;
    check("light opened", await project.openLight(`${loose}/devoir.tex`));
    check("light flag", !!project.info?.light && project.info.name === "devoir.tex", project.info?.name);
    await until(() => project.tree.length >= 1, 5_000, "light tree");
    check("light tree", project.tree.length === 2 && project.tree[0].name === "devoir.tex", project.tree.map((n) => n.name).join(","));
    check("badge", !!document.querySelector(".toolbar .light-badge"));
    check("light build", await buildOk(log, "light"));
    check("nothing written next to the file", !(await ipc.pathExists(`${loose}/build`)) && !(await ipc.pathExists(`${loose}/raytex.toml`)) && !(await ipc.pathExists(`${loose}/devoir.aux`)));
    check("pdf in the cache", !!viewer.pdf && !viewer.pdf.startsWith(loose), viewer.pdf);
    await scene("light-mode");

    // Adding an image asks for a project.
    void media.openImages();
    await until(() => ui.overlay === "convert", 5_000, "conversion dialog");
    await pause(400);
    await scene("convert-dialog", 1500);
    const nameInput = document.querySelector<HTMLInputElement>(".form input.large")!;
    type(nameInput, "Devoir de maths");
    document.querySelector<HTMLButtonElement>(".form .btn.primary")!.click();
    await until(() => ui.overlay === "image", 20_000, "image dialog after conversion");
    check("converted", !project.info?.light && samePath(project.info?.root, `${projectsDir}/devoir-de-maths`), project.info?.root);
    check("files copied", (await ipc.pathExists(`${projectsDir}/devoir-de-maths/partie.tex`)) && (await ipc.pathExists(`${projectsDir}/devoir-de-maths/devoir.tex`)));
    check("original untouched", !(await ipc.pathExists(`${loose}/raytex.toml`)));
    ui.closeOverlay();
    check("converted build", await buildOk(log, "converted"));

    // Recent: the light file reopens as it was opened.
    const overview = await ipc.listProjects();
    const recentLight = overview.recent.find((r) => r.light);
    check("recent light file", !!recentLight && recentLight.path.endsWith("devoir.tex"));
    check("three projects listed", overview.projects.length === 3, overview.projects.map((p) => p.name).join(","));
    if (recentLight) {
      await project.openRecent(recentLight);
      check("reopened light", !!project.info?.light);
    }

    // The projects window, renaming, trash.
    await project.open(`${projectsDir}/rapport`);
    ui.openOverlay("projects");
    await until(() => document.querySelectorAll(".browser .card").length >= 3, 10_000, "projects window");
    await scene("projects-window");
    ui.closeOverlay();
    await ipc.renameProject(`${projectsDir}/td`, "TD d'analyse");
    await ipc.trashProject(`${projectsDir}/devoir-de-maths`);
    const after = await ipc.listProjects();
    check("renamed", after.projects.some((p) => p.name === "TD d'analyse"));
    check("trashed", !after.projects.some((p) => p.path.endsWith("devoir-de-maths")));
    let refused = false;
    await ipc.trashProject(`${projectsDir}/rapport`).catch(() => (refused = true));
    check("open project protected", refused);
  } catch (e) {
    results.failure = String(e);
  }
  log(JSON.stringify(results, null, 2));
  const ok = !results.failure && Object.values(results).every((r) => typeof r !== "string" || !r.startsWith("FAILED"));
  log(`projects scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}

/** A document full of common mistakes: suggestions, quick fix (Alt+Enter), "Fix all". */
const MISTAKES = String.raw`\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage{tikz}
\begin{document}
\section{Introduction}\label{sec:intro}
Du texte en \textbff{gras} et le carré x^2 dans le texte.
\begin{itemise}
\item Premier point
\end{itemise}
Voir la section~\ref{sec:intr} et les équations
\begin{align}
a &= b
\end{align}
\begin{figure}[h]
\centering
\begin{tikzpicture}
\draw[-Stealth] (0,0) -- (1,0);
\end{tikzpicture}
\caption{Un schéma}
\end{figure}
Le fichier mon_fichier.txt de Dupont & Fils.
\end{document}
`;

async function fixesScenes(log: (msg: string) => void, dir: string): Promise<boolean> {
  const scene = async (name: string, holdMs = 2500) => {
    await pause(700);
    log(`scene: ${name}`);
    await pause(holdMs);
  };
  const results: Record<string, unknown> = {};
  const check = (name: string, value: boolean, detail: unknown = "") => {
    results[name] = value ? "ok" : `FAILED ${detail}`;
  };
  try {
    check("created", await project.createEmpty(`${dir}/fautes-${Date.now()}`, "Fautes courantes"));
    const main = project.info!.main!;
    await until(() => editor.active === main && !!editor.view, 5_000, "main open");
    const view = editor.view!;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: MISTAKES } });
    await editor.saveAll({ auto: true, silent: true });
    check("build fails", !(await buildOk(log, "mistakes")));
    ui.showBottom("problems");
    await until(() => document.querySelectorAll(".list .item .suggestion").length > 0, 10_000, "suggestions");
    const items = document.querySelectorAll(".list .item").length;
    const suggestions = document.querySelectorAll(".list .item .suggestion").length;
    const buttons = document.querySelectorAll(".list .item .fix").length;
    results.problems = `${items} problems, ${suggestions} suggestions, ${buttons} fix buttons`;
    const all = [...diagnostics.build, ...Object.values(diagnostics.lint).flat()];
    const errors = all.filter((d) => d.severity === "error");
    check("every error explained", errors.every((d) => !!d.hint), errors.filter((d) => !d.hint).map((d) => d.message).join(" | "));
    check("errors have a fix", errors.filter((d) => d.fixes.length).length >= 6, errors.map((d) => `${d.code}:${d.fixes.length}`).join(" "));
    const fixAll = document.querySelector<HTMLButtonElement>(".bar .fix-all");
    check("fix all button", !!fixAll && !fixAll.disabled && /\d/.test(fixAll.textContent ?? ""), fixAll?.textContent);
    await scene("problems-suggestions", 2500);

    // Alt+Enter on the misspelled command.
    const at = view.state.doc.toString().indexOf("textbff") + 2;
    view.dispatch({ selection: { anchor: at } });
    view.focus();
    quickFix(view, main);
    await until(() => !!ui.menu, 3_000, "quick fix menu");
    const labels = ui.menu!.items.map((i) => i.label ?? "");
    check("quick fix menu", labels.some((l) => l.includes("\\textbf")), labels.join(" | "));
    await scene("quick-fix-menu", 2000);
    ui.menu!.items.find((i) => i.label?.includes("\\textbf"))?.run?.();
    ui.closeMenu();
    await until(() => view.state.doc.toString().includes("\\textbf{gras}"), 3_000, "quick fix applied");
    check("quick fix applied", true);

    // Fix all, as many rounds as needed (a fix can reveal the next problem).
    let rounds = 0;
    const left = () => fixable([...diagnostics.build, ...Object.values(diagnostics.lint).flat()]).length;
    while (rounds < 4 && (build.status !== "success" || left() > 0)) {
      await until(() => !build.running, 120_000, "idle");
      const button = document.querySelector<HTMLButtonElement>(".bar .fix-all");
      if (!button || button.disabled) break;
      rounds++;
      button.click();
      await until(() => build.running, 15_000, "build after fix all");
      await until(() => !build.running, 180_000, "build end");
      log(`fix all round ${rounds}: ${build.status}, ${fixable([...diagnostics.build, ...Object.values(diagnostics.lint).flat()]).length} fixable left`);
    }
    results.rounds = rounds;
    check("compiles after fix all", build.status === "success", build.outcome?.diagnostics.filter((d) => d.severity === "error").map((d) => d.message).join(" | "));
    const text = editor.textOf(main) ?? "";
    for (const [what, needle] of [
      ["amsmath", "\\usepackage{amsmath}"],
      ["itemize", "\\begin{itemize}"],
      ["math", "$x^2$"],
      ["underscore", "mon\\_fichier"],
      ["ampersand", "Dupont \\& Fils"],
      ["arrows", "arrows.meta"],
      ["reference", "\\ref{sec:intro}"],
    ]) {
      check(`fixed ${what}`, text.includes(needle));
    }
    await scene("fixed", 3000);
  } catch (e) {
    results.failure = String(e);
  }
  log(JSON.stringify(results, null, 2));
  const ok = !results.failure && Object.values(results).every((r) => typeof r !== "string" || !r.startsWith("FAILED"));
  log(`fixes scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}

/** Several files selected in the tree (Shift, Ctrl / Cmd, keyboard), moved and deleted together; the formatting bar. */
async function filesScenes(log: (msg: string) => void, dir: string): Promise<boolean> {
  const scene = async (name: string, holdMs = 2000) => {
    await pause(700);
    log(`scene: ${name}`);
    await pause(holdMs);
  };
  const results: Record<string, unknown> = {};
  const check = (name: string, value: boolean, detail: unknown = "") => {
    results[name] = value ? "ok" : `FAILED ${detail}`;
  };
  const mac = navigator.platform.toLowerCase().includes("mac");
  const row = (name: string) => [...document.querySelectorAll<HTMLElement>(".tree .row")].find((r) => basename(r.dataset.path ?? "") === name)!;
  const click = (name: string, mods: { shift?: boolean; add?: boolean } = {}) =>
    row(name).dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: !!mods.shift, metaKey: !!mods.add && mac, ctrlKey: !!mods.add && !mac }));
  const names = () => fileSelection.paths.map((p) => basename(p)).join(",");
  try {
    ui.setVisible("sidebar", true);
    ui.showSidebar("files");
    const root = `${dir}/fichiers-${Date.now()}`;
    check("created", await project.createEmpty(root, "Fichiers"));
    for (const f of ["chap1.tex", "chap2.tex", "chap3.tex", "notes.txt"]) await ipc.createFile(`${root}/${f}`, `% ${f}\n`);
    await ipc.createDir(`${root}/annexes`);
    await project.refreshTree();
    // A new empty project shows the templates: back to the files.
    ui.showSidebar("files");
    await until(() => !!row("notes.txt") && !!row("annexes"), 5_000, "tree rows");

    click("chap1.tex");
    check("click selects one", fileSelection.count === 1 && names() === "chap1.tex", names());
    click("chap3.tex", { shift: true });
    check("shift range", names() === "chap1.tex,chap2.tex,chap3.tex", names());
    click("notes.txt", { add: true });
    check("ctrl/cmd adds", fileSelection.count === 4, names());
    click("chap2.tex", { add: true });
    check("ctrl/cmd removes", names() === "chap1.tex,chap3.tex,notes.txt", names());
    click("chap2.tex", { add: true });
    // Ctrl + click on a Mac is the right click: the menu of the selection.
    if (mac) {
      row("chap3.tex").dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      row("chap3.tex").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      check("mac ctrl click opens the menu", fileSelection.count === 4 && !!ui.menu, `${names()} menu ${!!ui.menu}`);
      ui.closeMenu();
    }
    await until(() => !!document.querySelector(".selection"), 2_000, "selection bar");
    check("selection bar", document.querySelector(".selection")?.textContent?.includes(String(fileSelection.count)) ?? false);
    row("chap1.tex").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    await until(() => !!ui.menu, 2_000, "menu");
    const labels = ui.menu!.items.map((i) => i.label ?? "");
    check("menu of the selection", labels.some((l) => /4/.test(l) && /Supprimer|Delete/.test(l)), labels.join(" | "));
    await scene("multi-select", 2500);
    ui.closeMenu();

    // "Move to…" then the folder, from the menu of the selection.
    await ipc.createDir(`${root}/brouillons`);
    await project.refreshTree();
    click("notes.txt");
    row("notes.txt").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    await until(() => !!ui.menu, 2_000, "menu");
    ui.menu!.items.find((i) => /Déplacer|Move/.test(i.label ?? ""))?.run?.();
    await until(() => !!ui.menu && ui.menu.items.some((i) => i.label?.startsWith("brouillons")), 2_000, "folders");
    await scene("move-to", 1500);
    const target = ui.menu!.items.find((i) => i.label?.startsWith("brouillons"))!;
    ui.closeMenu();
    await target.run?.();
    check("move to", await ipc.pathExists(`${root}/brouillons/notes.txt`));
    await project.move(`${root}/brouillons/notes.txt`, `${root}/notes.txt`);
    click("chap1.tex");
    click("chap3.tex", { shift: true });
    click("notes.txt", { add: true });

    // Drag the selection onto a folder.
    const dt = new DataTransfer();
    row("chap1.tex").dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    row("annexes").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    await until(() => project.findNode(`${root}/annexes/chap1.tex`) !== null, 5_000, "moved");
    const moved = await Promise.all(["chap1.tex", "chap2.tex", "chap3.tex", "notes.txt"].map((f) => ipc.pathExists(`${root}/annexes/${f}`)));
    check("moved together", moved.every(Boolean), moved.join(","));

    // Keyboard: the arrows move, Shift extends, Cmd/Ctrl + A selects everything.
    await project.refreshTree();
    click("annexes");
    await until(() => !!row("chap2.tex"), 3_000, "folder open");
    click("chap1.tex");
    row("chap1.tex").focus();
    row("chap1.tex").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }));
    check("shift arrow", names() === "chap1.tex,chap2.tex", names());
    row("chap2.tex").dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: mac, ctrlKey: !mac, bubbles: true }));
    check("select all", fileSelection.count >= 6, fileSelection.count);

    // Deleting two files after one confirmation.
    click("chap1.tex");
    click("chap2.tex", { add: true });
    row("chap2.tex").dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await until(() => !!document.querySelector(".dialog .btn.primary"), 3_000, "confirmation");
    check("one confirmation", /2/.test(document.querySelector(".dialog")?.textContent ?? ""));
    await scene("delete-confirm", 1500);
    document.querySelector<HTMLButtonElement>(".dialog .btn.primary")!.click();
    await until(() => project.findNode(`${root}/annexes/chap1.tex`) === null, 5_000, "deleted");
    check("deleted together", !(await ipc.pathExists(`${root}/annexes/chap1.tex`)) && !(await ipc.pathExists(`${root}/annexes/chap2.tex`)));

    // The formatting bar at the size of the window.
    await editor.open(project.info!.main!);
    await pause(500);

    // @[ typed: the editor closes the bracket; the shortcut replaces both.
    const view = editor.view!;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "$@[]$" }, selection: { anchor: 3 } });
    view.focus();
    startCompletion(view);
    await until(() => currentCompletions(view.state).some((c) => c.label === "@["), 5_000, "@[ completion");
    const option = currentCompletions(view.state).findIndex((c) => c.label === "@[");
    view.dispatch({ effects: setSelectedCompletion(option) });
    // CodeMirror ignores an acceptance right after the list opens.
    await pause(200);
    acceptCompletion(view);
    await pause(200);
    check("@[ not doubled", view.state.doc.toString() === "$\\left[  \\right]$", view.state.doc.toString());
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
    const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetWidth > 0).map((e) => e.textContent?.trim());
    const texts = shown(".format-bar .text-btn span");
    results.window = `${window.innerWidth}px`;
    results.barTexts = texts.join(" | ");
    check("one @ on the macros button", (document.querySelector(".format-bar .macros")?.textContent?.match(/@/g) ?? []).length === 0);
    // The texts are shown from 1195 px on (smaller windows keep the icons).
    check(
      "image, table, diagram texts",
      window.innerWidth < 1195 ||
        ["Image", "Tableau", "Schéma"].every((x) => texts.some((s) => s?.startsWith(x))) ||
        ["Image", "Table", "Diagram"].every((x) => texts.some((s) => s?.startsWith(x))),
      texts.join(","),
    );
    const font = document.querySelector<HTMLElement>(".format-bar .select-btn.font");
    results.fontButton = `${font?.offsetWidth}px`;
    check("small font button", !!font && font.offsetWidth <= 120, font?.offsetWidth);
    const bar = document.querySelector<HTMLElement>(".format-bar .groups");
    check("bar fits", !!bar && bar.scrollWidth <= bar.clientWidth + 1, `${bar?.scrollWidth} > ${bar?.clientWidth}`);
    await scene("format-bar", 2000);
  } catch (e) {
    results.failure = String(e);
  }
  log(JSON.stringify(results, null, 2));
  const ok = !results.failure && Object.values(results).every((r) => typeof r !== "string" || !r.startsWith("FAILED"));
  log(`files scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}
