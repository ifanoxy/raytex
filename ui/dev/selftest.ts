// End-to-end check of the real application (development builds only).
//
//   LABAGUETEX_SELFTEST=/path/to/project npm run app:dev
//
// Opens the project, the main file, builds it with the real TeX
// distribution, waits for the PDF to be drawn by pdf.js, exercises
// completion and SyncTeX, prints a report on the terminal and quits.

import { startCompletion } from "@codemirror/autocomplete";
import { invoke } from "@tauri-apps/api/core";
import * as ipc from "../lib/ipc";
import { app } from "../lib/state/app.svelte";
import { build } from "../lib/state/build.svelte";
import { editor } from "../lib/state/editor.svelte";
import { project } from "../lib/state/project.svelte";
import { distLabel, tex } from "../lib/state/tex.svelte";
import { media } from "../lib/state/media.svelte";
import { ui } from "../lib/state/ui.svelte";
import { viewer } from "../lib/state/viewer.svelte";

async function until(check: () => boolean, timeoutMs: number, what: string) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return Date.now() - start;
}

export async function runSelfTest() {
  const target = await invoke<string | null>("selftest_target");
  if (!target) return;
  const report: Record<string, unknown> = {};
  const log = (msg: string) => void ipc.logFrontend("info", `selftest: ${msg}`);
  let ok = true;
  try {
    report.startMs = await until(() => app.ready, 20_000, "app ready");
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
      report.synctexInverse = inv ? `${inv.file.split("/").pop()}:${inv.line}` : null;
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
  if (ok && which && which !== "media") await scenes(log);
  if (ok && which && (which === "media" || which === "all") && assets) ok = await mediaScenes(log, assets);
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
    log(`forward ${chapter.split("/").pop()}:${target} → ${JSON.stringify(fwd && { page: fwd.page, rects: fwd.rects })}`);
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

  // ---------------------------------------------------------------- TikZ
  try {
    const v = editor.view!;
    v.dispatch({ changes: { from: v.state.doc.length, insert: "\n\n" }, selection: { anchor: v.state.doc.length + 2 } });
    media.openTikz(null);
    await until(() => !!document.querySelector(".studio .tpl"), 10_000, "tikz studio");
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
