// End-to-end check of the real application (development builds only).
//
//   RAYTEX_SELFTEST=/path/to/project npm run app:dev
//
// Opens the project, the main file, builds it with the real TeX
// distribution, waits for the PDF to be drawn by pdf.js, exercises
// completion and SyncTeX, prints a report on the terminal and quits.

import { refused } from "$lib/policy";
import { acceptCompletion, currentCompletions, setSelectedCompletion, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { i18n } from "../lib/i18n.svelte";
import * as ipc from "../lib/ipc";
import { app } from "../lib/state/app.svelte";
import { build } from "../lib/state/build.svelte";
import { editor } from "../lib/state/editor.svelte";
import { project } from "../lib/state/project.svelte";
import { distLabel, tex } from "../lib/state/tex.svelte";
import { diagnostics } from "../lib/state/diagnostics.svelte";
import { defaultOptions } from "../lib/export";
import { causeOf, fixable, quickFix } from "../lib/fixes";
import { fileSelection } from "../lib/state/selection.svelte";
import { media } from "../lib/state/media.svelte";
import { pdfExport } from "../lib/state/pdfexport.svelte";
import { bringPicture } from "../lib/state/pictures";
import { colors } from "../lib/state/colors.svelte";
import { fonts } from "../lib/state/fonts.svelte";
import { history } from "../lib/state/history.svelte";
import { spelling } from "../lib/state/spelling.svelte";
import { templates } from "../lib/state/templates.svelte";
import { ui } from "../lib/state/ui.svelte";
import { viewer } from "../lib/state/viewer.svelte";
import { whatsNew } from "../lib/state/whatsnew.svelte";
import { readTitlePage } from "../lib/titlepage";
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
  const say = (msg: string) => void ipc.logFrontend("info", `selftest: ${msg}`);
  // A group of scenes has not passed when the security policy refused
  // something on the way (a style, in the built application).
  const log = (msg: string) => {
    if (/ scenes PASSED$/.test(msg) && refused.length) {
      say(`policy: ${refused.length} refused, ${[...new Set(refused)].slice(0, 4).join(" | ")}`);
      return say(msg.replace(/PASSED$/, "FAILED"));
    }
    say(msg);
  };
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

/**
 * The blank left around what the first page of a PDF draws, in points: a
 * cropped picture has the same on every side. Drawing needs a visible
 * screen: null when it did not happen in time.
 */
async function inkMargins(pdf: string): Promise<{ top: number; bottom: number; left: number; right: number } | null> {
  const { closePdf, loadPdf } = await import("../lib/pdf/pdfjs");
  const doc = await loadPdf(await ipc.readBinaryFile(pdf));
  try {
    const page = await doc.getPage(1);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const done = await Promise.race([page.render({ canvas, viewport }).promise.then(() => true), pause(15_000).then(() => false)]);
    if (!done) return null;
    const { data, width, height } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let [top, bottom, left, right] = [height, -1, width, -1];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128 || data[i] + data[i + 1] + data[i + 2] > 384) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    if (bottom < 0) return null;
    return { top: top / scale, bottom: (height - 1 - bottom) / scale, left: left / scale, right: (width - 1 - right) / scale };
  } finally {
    closePdf(doc);
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

  // ------------------------------------------------- several images, as one
  // The two images inserted together have one chip; it opens the window on
  // both, in their order; the second dragged first, the figure is written
  // again in that order, with what each image had.
  try {
    const doc = () => editor.textOf(chapter)!;
    // The first figure of sub-figures: the one the images above were inserted as.
    const figure = () => {
      const text = doc();
      const from = text.lastIndexOf("\\begin{figure}", text.indexOf("\\begin{subfigure}"));
      return { from, to: text.indexOf("\\end{figure}", from) };
    };
    const order = () => [...doc().slice(figure().from, figure().to).matchAll(/\\includegraphics\[width=\\linewidth\]\{([^}]*)\}/g)].map((m) => m[1]);
    const first = order();
    const v = editor.view!;
    v.dispatch({ selection: { anchor: figure().from }, scrollIntoView: true });
    await until(() => !!v.dom.querySelector('.cm-code-chip[data-count="2"]'), 10_000, "chip of the two images");
    const chips = [...v.dom.querySelectorAll<HTMLElement>(".cm-code-chip")].filter((c) => v.posAtDOM(c) >= figure().from && v.posAtDOM(c) <= figure().to).length;
    v.dom.querySelector<HTMLElement>('.cm-code-chip[data-count="2"]')!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await until(() => document.querySelectorAll(".items .item").length === 2, 10_000, "the two images in the window");
    await pause(600);
    const shown = [...document.querySelectorAll(".items .item .original")].map((e) => e.textContent?.trim());
    const subCaption = document.querySelectorAll<HTMLInputElement>(".items .item .inline-field input")[0];
    type(subCaption, "Vue de face");
    document.querySelectorAll<HTMLElement>(".items .item .grip")[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await pause(300);
    await scene("image-group");
    document.querySelector<HTMLButtonElement>(".right .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "images updated");
    const second = order();
    const captioned = /\\includegraphics\[width=\\linewidth\]\{[^}]*photo[^}]*\}\s*\\caption\{Vue de face\}/.test(doc());
    log(`image group: ${chips} chip for ${first.join(" + ")}, window ${shown.join(" + ")}, after the drag ${second.join(" + ")}, caption with its image ${captioned}`);
    ok = chips === 1 && first.length === 2 && shown.length === 2 && second.length === 2 && second[0] === first[1] && second[1] === first[0] && captioned && (await buildOk(log, "image group")) && ok;
  } catch (e) {
    log(`image group failed: ${e}`);
    ok = false;
  }

  // ------------------------------------------------- an image made lighter
  // A photograph pasted as a PNG, with light images asked for: the window
  // says what it will weigh, and what is written in the project is a JPEG
  // many times lighter.
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    const grain = ctx.createImageData(1500, 1000);
    for (let i = 0; i < grain.data.length; i += 4) {
      const x = (i / 4) % 1500;
      grain.data[i] = (x / 8 + Math.random() * 40) | 0;
      grain.data[i + 1] = (120 + Math.random() * 40) | 0;
      grain.data[i + 2] = (200 - x / 10 + Math.random() * 40) | 0;
      grain.data[i + 3] = 255;
    }
    ctx.putImageData(grain, 0, 0);
    const photo = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
    const v = editor.view!;
    v.dispatch({ changes: { from: v.state.doc.length, insert: "\n\n" }, selection: { anchor: v.state.doc.length + 2 } });
    const known = new Set((await ipc.fileTree()).find((n) => n.name === "figures")?.children?.map((c) => c.name) ?? []);
    media.openImages({ blobs: [new File([photo], "photo.png", { type: "image/png" })] });
    await until(() => document.querySelectorAll(".items .item").length === 1 && !!document.querySelector('.weights [data-weight="light"]'), 10_000, "photograph in the window");
    document.querySelector<HTMLButtonElement>('.weights [data-weight="light"]')!.click();
    await until(() => !!document.querySelector(".items .item .weight.lighter"), 60_000, "weight of the lighter image");
    const told = document.querySelector(".items .item .weight")?.textContent?.replace(/\s+/g, " ").trim();
    const extension = document.querySelector(".items .item .ext")?.textContent?.trim();
    await scene("image-weight");
    document.querySelector<HTMLButtonElement>(".right .btn.primary")!.click();
    await until(() => ui.overlay === null, 60_000, "lighter image inserted");
    const made = ((await ipc.fileTree()).find((n) => n.name === "figures")?.children ?? []).filter((c) => !known.has(c.name));
    const written = made.length === 1 ? (await ipc.readBinaryFile(made[0].path)).byteLength : 0;
    log(`lighter image: ${photo.size} bytes pasted, window «${told}» as ${extension}, written ${made.map((c) => c.name).join(" ")} ${written} bytes`);
    ok = made.length === 1 && made[0].name.endsWith(".jpg") && extension === ".jpg" && written > 0 && written * 4 < photo.size && (await buildOk(log, "lighter image")) && ok;
    // The choice is kept from one time to the next: back to images as they are, for what follows.
    localStorage.removeItem("raytex.image.weight");
  } catch (e) {
    log(`lighter image failed: ${e}`);
    localStorage.removeItem("raytex.image.weight");
    ok = false;
  }

  // ---------------------------------------------------------------- code
  // Code taken from the middle of a file, with an accent and a line too
  // long: it comes back to the margin, the window says how many columns a
  // line holds (TeX measured them) and that a line is too long; inserted, it
  // is a listing with its language, and the style is in the preamble. Its
  // chip opens it again; another language comes with its definition. The
  // document builds each time.
  try {
    const main = project.info!.main!;
    const v = editor.view!;
    v.dispatch({ changes: { from: v.state.doc.length, insert: "\n\n" }, selection: { anchor: v.state.doc.length + 2 } });
    const long = "x".repeat(90);
    media.openCode({ code: `        def moyenne(notes):\n            # Moyenne des élèves\n            return sum(notes) / len(notes)  # ${long}\n` });
    await until(() => !!document.querySelector<HTMLTextAreaElement>(".code-studio textarea")?.value, 10_000, "code window");
    const tidy = document.querySelector<HTMLTextAreaElement>(".code-studio textarea")!.value.startsWith("def moyenne(notes):\n    # Moyenne");
    await drawn(".code-studio .preview-box canvas", log, "code preview");
    // The page is cut to the code, and wide enough to read: not a sheet with three lines at its top.
    const shown = document.querySelector<HTMLCanvasElement>(".code-studio .preview-box canvas");
    const readable = !shown || !shown.clientHeight || (shown.clientWidth > 420 && shown.clientWidth / shown.clientHeight > 2.5);
    log(`code: preview ${shown ? `${shown.clientWidth}x${shown.clientHeight}` : "not drawn (screen asleep or hidden?), continuing"}`);
    ok = readable && ok;
    await until(() => !!document.querySelector(".code-studio .note"), 30_000, "lines measured");
    const told = document.querySelector(".code-studio .note")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const caption = document.querySelector<HTMLInputElement>(".code-studio .right > .field input.input")!;
    type(caption, "Moyenne des notes");
    await scene("code-studio");
    document.querySelector<HTMLButtonElement>(".code-studio .right .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "code inserted");
    const text = () => editor.textOf(chapter)!;
    const inserted = text().includes("\\begin{lstlisting}[language=Python, caption={Moyenne des notes}, label={lst:moyenne-des-notes}]\ndef moyenne(notes):\n    # Moyenne des élèves");
    const preamble = () => editor.textOf(main) ?? "";
    const styled = preamble().includes("% RayTeX code style: theme=light") && preamble().includes("\\usepackage{listings}") && preamble().indexOf("\\lstset{style=raytex}") < preamble().indexOf("\\begin{document}");
    const built = await buildOk(log, "code");
    // Its chip opens it again, with what it says.
    v.dispatch({ selection: { anchor: text().indexOf("\\begin{lstlisting}") }, scrollIntoView: true });
    await until(() => [...v.dom.querySelectorAll(".cm-code-chip")].some((c) => v.posAtDOM(c) > text().indexOf("\\begin{lstlisting}") && v.posAtDOM(c) < text().indexOf("def moyenne")), 10_000, "chip of the code");
    const chip = [...v.dom.querySelectorAll<HTMLElement>(".cm-code-chip")].find((c) => v.posAtDOM(c) > text().indexOf("\\begin{lstlisting}") && v.posAtDOM(c) < text().indexOf("def moyenne"))!;
    chip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await until(() => document.querySelector<HTMLSelectElement>(".code-studio select")?.value === "Python" && !!document.querySelector<HTMLTextAreaElement>(".code-studio textarea")?.value, 10_000, "code opened again");
    const read = document.querySelector<HTMLInputElement>(".code-studio .right > .field input.input")!.value;
    const language = document.querySelector<HTMLSelectElement>(".code-studio select")!;
    language.value = "Rust";
    language.dispatchEvent(new Event("change", { bubbles: true }));
    type(document.querySelector<HTMLTextAreaElement>(".code-studio textarea") as unknown as HTMLInputElement, 'fn main() {\n    // « Bonjour », élève\n    println!("été");\n}');
    await pause(300);
    document.querySelector<HTMLButtonElement>(".code-studio .right .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "code updated");
    const updated = text().includes("\\begin{lstlisting}[language=Rust, caption={Moyenne des notes}, label={lst:moyenne-des-notes}]\nfn main() {") && text().split("\\begin{lstlisting}").length === 2;
    const defined = preamble().includes("% RayTeX code language: Rust\n\\lstdefinelanguage{Rust}{") && preamble().split("\\lstdefinestyle{raytex}").length === 2;
    const rebuilt = await buildOk(log, "code in Rust");
    log(`code: margin ${tidy}, window «${told}», inserted ${inserted}, style ${styled}, caption read back «${read}», updated ${updated}, language defined ${defined}`);
    ok = tidy && /\d+ caract|\d+ char/.test(told) && inserted && styled && built && read === "Moyenne des notes" && updated && defined && rebuilt && ok;
  } catch (e) {
    log(`code failed: ${e}`);
    if (ui.overlay) ui.closeOverlay();
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
  // ------------------------------------------------------------ commands
  try {
    const main = project.info!.main!;
    const before = (await ipc.customCommands(main)).length;
    ui.setVisible("sidebar", true);
    ui.sidebar = "commands";
    await editor.open(chapter);
    editor.view!.dispatch({ selection: { anchor: editor.view!.state.doc.length } });
    ui.openCommands({ create: { kind: "command", name: "motcle", args: 1, body: "\\textbf{#1}" } });
    // The trial is compiled with the preamble of the project and the new definition.
    await until(() => !!document.querySelector(".studio .ok-line"), 180_000, "command trial");
    await drawn(".studio .preview-box canvas", log, "command trial preview");
    await scene("command-studio");
    const code = document.querySelector(".studio .left .code")?.textContent ?? "";
    document.querySelector<HTMLButtonElement>(".studio .actions .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "command added");
    const inPreamble = editor.textOf(main)?.includes("\\newcommand{\\motcle}[1]{\\textbf{#1}}") ?? false;
    const used = editor.textOf(chapter)?.includes("\\motcle{") ?? false;
    // The engine lists it once the document is read again, and the panel with it.
    let listed: Awaited<ReturnType<typeof ipc.customCommands>> = [];
    await until(
      () => {
        void ipc.customCommands(main).then((l) => (listed = l));
        return listed.some((c) => c.name === "motcle");
      },
      20_000,
      "command listed",
    );
    await until(() => [...document.querySelectorAll(".sidebar .item .name, .item .name")].some((e) => e.textContent?.includes("\\motcle")), 10_000, "command in the panel");
    const mine = listed.find((c) => c.name === "motcle")!;
    log(`commands: code ${code}, in preamble ${inPreamble}, used ${used}, listed ${listed.length} (was ${before}), uses ${mine.uses}, in preamble ${mine.inPreamble}`);
    await scene("commands-panel");
    // An existing command is tried the same way, without touching the document.
    ui.openCommands({ test: mine });
    await until(() => !!document.querySelector(".studio .ok-line"), 180_000, "command tried");
    ui.closeOverlay();
    ok = inPreamble && used && listed.length === before + 1 && mine.inPreamble && (await buildOk(log, "commands")) && ok;
  } catch (e) {
    log(`commands failed: ${e}`);
    ok = false;
  }
  // -------------------------------------------- macros, @ shortcuts, saves
  try {
    // The launch screen is gone once the interface is there.
    const splashGone = !document.getElementById("splash");
    await app.update((x) => {
      x.macros = [
        { name: "Fraction", trigger: "ff", key: "", body: "\\frac{${1:a}}{${2:b}}", math: true },
        { name: "Vecteur", trigger: "@vv", key: "", body: "\\vec{${1}}", math: true },
      ];
    });
    // A shortcut is recorded from the window: nothing has the focus, as on
    // macOS where a click does not give it to a button. ⌥N is a dead key.
    ui.openSettings("macros");
    await until(() => document.querySelectorAll(".macro .key-btn").length === 2, 10_000, "macros in the settings");
    document.querySelector<HTMLButtonElement>(".macro .key-btn")!.click();
    await until(() => !!document.querySelector(".key-btn.recording"), 5_000, "recording");
    (document.activeElement as HTMLElement | null)?.blur?.();
    const deadKey = () => new KeyboardEvent("keydown", { key: "Dead", code: "KeyN", altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(deadKey());
    await until(() => app.settings?.macros[0]?.key === "Alt-n", 5_000, "shortcut recorded");
    // A macro typed in the settings is saved though its last field never
    // loses the focus: on macOS, a click on the cross does not take it.
    document.querySelector<HTMLButtonElement>(".macro-add .btn")!.click();
    await until(() => document.querySelectorAll(".macro").length === 3, 5_000, "new macro");
    const card = document.querySelectorAll(".macro")[2];
    const type = (el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    type(card.querySelector<HTMLInputElement>(".trigger")!, "zz");
    type(card.querySelector<HTMLTextAreaElement>("textarea")!, "\\emph{${1:x}}");
    await scene("macros-settings");
    document.querySelector<HTMLButtonElement>(".modal header .icon-btn:last-of-type")!.click();
    await until(() => ui.overlay === null, 5_000, "settings closed");
    await pause(100);
    const typedMacro = app.settings?.macros[2];
    const savedTyped = typedMacro?.trigger === "zz" && typedMacro?.body === "\\emph{${1:x}}";
    // The shortcut runs the macro in a formula, and does nothing in text.
    await editor.open(chapter);
    await until(() => editor.active === chapter && !!editor.view, 5_000, "chapter shown");
    await editor.reconfigure();
    const view = editor.view!;
    const end = view.state.doc.length;
    view.dispatch({ changes: { from: end, insert: "\nEssai $y$ fin.\n" }, selection: { anchor: end + 9 } });
    view.focus();
    view.contentDOM.dispatchEvent(deadKey());
    await pause(300);
    const ran = view.state.doc.toString().includes("Essai $y\\frac{a}{b}$ fin.");
    const length = view.state.doc.length;
    view.dispatch({ selection: { anchor: end + 3 } });
    view.contentDOM.dispatchEvent(deadKey());
    await pause(200);
    const quietInText = view.state.doc.length === length;
    // Its trigger then Tab writes it, also right after an Escape (the
    // editor library would let that Tab leave the editor).
    const key = (name: string, code: number) => new KeyboardEvent("keydown", { key: name, code: name, keyCode: code, which: code, bubbles: true, cancelable: true });
    const tail = view.state.doc.length;
    view.dispatch({ changes: { from: tail, insert: "Racine zz" }, selection: { anchor: tail + 9 }, userEvent: "input.type" });
    view.contentDOM.dispatchEvent(key("Escape", 27));
    view.contentDOM.dispatchEvent(key("Tab", 9));
    await pause(300);
    const byTab = view.state.doc.toString().includes("Racine \\emph{x}");
    view.contentDOM.dispatchEvent(key("Escape", 27));
    // Tab also writes a snippet of RayTeX after its trigger, and a macro of
    // formulas typed in text goes between dollars.
    const typeThenTab = async (text: string) => {
      const at = view.state.doc.length;
      view.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length }, userEvent: "input.type" });
      view.contentDOM.dispatchEvent(key("Tab", 9));
      await pause(250);
      view.contentDOM.dispatchEvent(key("Escape", 27));
    };
    await typeThenTab("\nNote fn");
    await typeThenTab("\nMoitié ff");
    const written = view.state.doc.toString();
    const snippetByTab = written.includes("Note \\footnote{}");
    const mathInText = written.includes("Moitié $\\frac{a}{b}$");
    // A key that writes text is refused as the shortcut of a macro.
    await app.update((x) => (x.macros[1].key = "Tab"));
    await editor.reconfigure();
    await typeThenTab("\nAutre fn");
    const tabKept = view.state.doc.toString().includes("Autre \\footnote{}");
    await app.update((x) => (x.macros[1].key = ""));
    // The `+` of the panel opens the form of a new `@` shortcut.
    ui.setVisible("sidebar", true);
    ui.sidebar = "snippets";
    await until(() => !!document.querySelector(".panel-header .icon-btn"), 5_000, "snippets panel");
    const hidden = !document.querySelector(".at-new");
    document.querySelector<HTMLButtonElement>(".panel-header .icon-btn")!.click();
    await until(() => !!document.querySelector(".at-new"), 5_000, "new @ shortcut form");
    const formOpens = hidden && !!document.querySelector(".at-new .at-key-input");
    await scene("at-shortcut-new");
    document.querySelector<HTMLButtonElement>(".panel-header .icon-btn")!.click();
    // The `@` shortcut of the user is offered by the engine, before those of RayTeX.
    const offered = await ipc.complete(chapter, "$ @v", "", false);
    const own = offered?.items.find((i) => i.label === "@vv");
    const next = await ipc.complete(chapter, "$ \\ve", "", false);
    const beside = next?.items.find((i) => i.label === "\\vec")?.shortcut;
    // The echo of a save of RayTeX, reported while the text has changed
    // since, is not a change made by another program.
    await editor.save(chapter, { silent: true, auto: true });
    const v = editor.view!;
    v.dispatch({ changes: { from: v.state.doc.length, insert: "% encore\n" } });
    const before = ui.toasts.length;
    await editor.externalChanges([chapter]);
    await pause(200);
    const echo = ui.toasts.slice(before).map((t) => t.message);
    log(`macros: typed and closed ${savedTyped}, by Tab ${byTab}, snippet by Tab ${snippetByTab}, formula in text ${mathInText}, Tab kept ${tabKept}, + opens the form ${formOpens}`);
    log(`macros: splash gone ${splashGone}, recorded ${app.settings?.macros[0]?.key}, ran ${ran}, quiet in text ${quietInText}, @vv offered ${own?.apply}, beside \\vec ${beside}, toasts after own save ${JSON.stringify(echo)}`);
    ok = savedTyped && byTab && snippetByTab && mathInText && tabKept && formOpens && splashGone && ran && quietInText && own?.apply === "\\vec{${1}}" && beside === "@vv" && echo.length === 0 && (await buildOk(log, "macros")) && ok;
  } catch (e) {
    log(`macros failed: ${e}`);
    ok = false;
  }
  // --------------------------------------------------------- page layout
  try {
    const main = project.info!.main!;
    const code = () => document.querySelector(".studio pre.code")?.textContent ?? "";
    const measure = () => document.querySelector(".studio .measure")?.textContent ?? "";
    const idle = () => !document.querySelector(".studio .busy");
    ui.openLayout("margins");
    await until(() => !!document.querySelector(".studio .cross"), 10_000, "page studio");
    // The code is with the advanced settings of each group.
    const advanced = (id: string) => document.querySelector<HTMLButtonElement>(`.studio .fold[data-id="${id}"] .more`)!.click();
    advanced("margins");
    // The margins of the document are read, and TeX measures the page it makes of them.
    await until(() => measure().includes("16 × 24.7 cm"), 120_000, "page measured");
    const read = [...document.querySelectorAll<HTMLInputElement>(".studio .cross input")].map((i) => i.value).join(" ");
    // Other margins: seen on the pages, then written in one place.
    document.querySelectorAll<HTMLButtonElement>(".studio .left > .chips .chip")[5].click();
    await until(() => code().includes("left=3.5cm"), 5_000, "margins set");
    await until(() => measure().includes("15.5 × 24.7 cm") && idle(), 120_000, "margins previewed");
    await scene("margins");
    document.querySelector<HTMLButtonElement>(".studio .actions .btn.primary")!.click();
    await until(() => !!editor.textOf(main)?.includes("\\geometry{top=2.5cm, bottom=2.5cm, left=3.5cm, right=2cm}"), 5_000, "margins applied");
    const gathered = editor.textOf(main)!.includes("\\usepackage{geometry}\n\\geometry{");
    // A page style: a header, a watermark, on real pages before it is written.
    document.querySelectorAll<HTMLButtonElement>(".studio .tab")[1].click();
    await until(() => !!document.querySelector(".studio .empty .btn.primary"), 5_000, "no style yet");
    document.querySelector<HTMLButtonElement>(".studio .empty .btn.primary")!.click();
    await until(() => !!document.querySelector('.studio input[data-slot="head-left"]'), 5_000, "new style");
    // Its name follows the language of the interface.
    const name = document.querySelector<HTMLInputElement>(".studio input.name")!.value;
    const fill = (slot: string, text: string) => {
      const el = document.querySelector<HTMLInputElement>(`.studio input[data-slot="${slot}"]`)!;
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    fill("head-left", "\\nouppercase{\\leftmark}");
    fill("head-right", "Rapport");
    document.querySelectorAll<HTMLButtonElement>('.studio .fold[data-id="mark"] .segment button')[1].click();
    // The `+` of a field writes what it can hold; the advanced settings of the header colour its rule.
    document.querySelector<HTMLInputElement>('.studio input[data-slot="foot-right"]')!.parentElement!.querySelector<HTMLButtonElement>(".plus")!.click();
    await until(() => !!ui.menu, 5_000, "menu of a field");
    await ui.menu!.items[1].run!();
    ui.closeMenu();
    // A text longer than its field opens in a larger box, where it is changed the same.
    const small = document.querySelector<HTMLInputElement>('.studio input[data-slot="foot-right"]')!;
    small.parentElement!.querySelector<HTMLButtonElement>(".widen")!.click();
    await until(() => !!document.querySelector('.studio textarea[data-wide="foot-right"]'), 5_000, "larger field");
    const large = document.querySelector<HTMLTextAreaElement>('.studio textarea[data-wide="foot-right"]')!;
    const widened = large.value === small.value && small.value.includes("LastPage");
    document.querySelector<HTMLButtonElement>(".studio .slot.big .widen")!.click();
    await until(() => !document.querySelector(".studio textarea[data-wide]"), 5_000, "larger field closed");
    advanced("head");
    await until(() => !!document.querySelector('.studio .fold[data-id="head"] .advanced select'), 5_000, "advanced settings of the header");
    const ruleColour = document.querySelector<HTMLSelectElement>('.studio .fold[data-id="head"] .advanced select')!;
    ruleColour.value = "red";
    ruleColour.dispatchEvent(new Event("change", { bubbles: true }));
    advanced("more");
    await until(() => code().includes("\\fancyhead[R]{Rapport}") && code().includes("\\AddToShipoutPictureBG*") && code().includes("\\color{red}\\hrule") && code().includes("\\fancyfoot[R]{\\thepage\\ / \\pageref{LastPage}}"), 5_000, "style written");
    await until(() => !idle(), 10_000, "style compiling");
    await until(idle, 120_000, "style previewed");
    // fancyhdr asks for a taller header than the class keeps (11pt): one click gives it.
    const asked = !!document.querySelector(".studio .warn-box");
    if (asked) {
      document.querySelector<HTMLButtonElement>(".studio .warn-box .btn")!.click();
      await until(() => !!editor.textOf(main)?.includes("headheight=13.6pt"), 5_000, "header made taller");
      await until(() => !idle(), 10_000, "style compiling again");
      await until(idle, 120_000, "style previewed again");
    }
    const previewed = !!document.querySelector(".studio .ok-line") && !!document.querySelector(".studio .preview-box canvas");
    await scene("page-style");
    const uses = () => [...document.querySelectorAll<HTMLButtonElement>(".studio .uses .btn")];
    uses()[0].click();
    await until(() => !!editor.textOf(main)?.includes(`\\pagestyle{${name}}`), 5_000, "style of the document");
    uses()[1].click();
    await until(() => !!editor.textOf(main)?.includes(`\\let\\ps@plain\\ps@${name}`), 5_000, "style of the opening pages");
    const text = editor.textOf(main)!;
    const defined = text.indexOf(`\\fancypagestyle{${name}}`) > 0 && text.indexOf(`\\pagestyle{${name}}`) > text.indexOf(`\\fancypagestyle{${name}}`);
    const packages = ["fancyhdr", "eso-pic", "xcolor", "lastpage"].every((p) => text.includes(`\\usepackage{${p}}`));
    // A small preview (a picture, a font, a command) leaves the page layout
    // aside: it still compiles in a document that has a page style.
    await pause(800);
    const picture = await ipc.previewSnippet({ path: main, job: "tikz", classOptions: "tikz,border=6pt", projectPreamble: true, packages: ["tikz"], libraries: [], extra: "", body: "\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}" });
    const pictured = !!picture.pdf && !picture.diagnostics.some((d) => d.severity === "error");
    if (!pictured) log(`layout: picture ${JSON.stringify(picture.diagnostics.map((d) => d.message)).slice(0, 300)}`);
    // A command a chapter defines for itself is known to the previews too:
    // the picture that uses it compiles, as it does in the document.
    await editor.rewrite(chapter, (text) => `\\newcommand{\\vecteurlocal}[1]{\\overrightarrow{#1}}\n${text}`);
    await editor.flush();
    await pause(600);
    const withCommand = await ipc.previewSnippet({ path: main, job: "tikz", classOptions: "tikz,border=6pt", projectPreamble: true, packages: ["tikz"], libraries: [], extra: "", body: "\\begin{tikzpicture}\\node {$\\vecteurlocal{u}$};\\end{tikzpicture}" });
    const commanded = !!withCommand.pdf && !withCommand.diagnostics.some((d) => d.severity === "error");
    log(`layout: picture with a command of a chapter ${commanded} ${commanded ? "" : JSON.stringify(withCommand.diagnostics.map((d) => d.message)).slice(0, 300)}`);
    ok = commanded && ok;
    // A preamble that changes the lengths of the page (a taller header) leaves
    // the picture in the middle of its page, not cut at the bottom.
    const framed = await ipc.previewSnippet({
      path: main,
      job: "tikz",
      classOptions: "tikz,border=6pt",
      projectPreamble: true,
      packages: ["tikz"],
      libraries: [],
      extra: "\\setlength{\\headheight}{35pt}\n\\addtolength{\\topmargin}{-12pt}\n\\setlength{\\headsep}{30pt}",
      body: "\\begin{tikzpicture}\\draw (0,0) rectangle (3,2);\\end{tikzpicture}",
    });
    const blank = framed.pdf ? await inkMargins(framed.pdf) : null;
    const centred = !blank || (Math.abs(blank.top - blank.bottom) < 1.5 && Math.abs(blank.left - blank.right) < 1.5 && blank.top > 3 && blank.top < 9);
    log(`layout: picture in its page ${blank ? `${centred} (${[blank.top, blank.bottom, blank.left, blank.right].map((v) => v.toFixed(1)).join(" ")})` : "not drawn (screen asleep or hidden?), continuing"}`);
    // One page only, at the cursor of the chapter.
    uses()[3].click();
    await until(() => ui.overlay === null, 5_000, "studio closed");
    const here = !!editor.textOf(chapter)?.includes(`\\thispagestyle{${name}}`);
    // A picture chosen for a page style from elsewhere on the computer is copied
    // into the folder of pictures of the project; one of the project is named where it is.
    const outside = await bringPicture(`${assets}/Photo de l'expérience.png`, main, editor.textOf(main) ?? "");
    const copied = /^figures\/photo-de-l-experience(-\d+)?\.png$/.test(outside) && (await ipc.pathExists(`${project.info!.root}/${outside}`));
    const inside = await bringPicture(`${project.info!.root}/${outside}`, main, editor.textOf(main) ?? "");
    log(`layout: picture from outside «${outside}» copied ${copied}, picture of the project «${inside}»`);
    ok = copied && inside === outside && ok;
    log(`layout: style ${name}, picture with a page style ${pictured}, larger field ${widened}, read ${read}, gathered ${gathered}, header asked ${asked}, previewed ${previewed}, defined ${defined}, packages ${packages}, here ${here}`);
    ok = read === "2.5 2.5 2.5 2.5" && pictured && centred && widened && gathered && asked && previewed && defined && packages && here && (await buildOk(log, "layout")) && ok;
  } catch (e) {
    log(`layout failed: ${e}`);
    // What the window shows of its preview, to tell a page that was not
    // measured from one that was not compiled.
    const shows = (sel: string) => document.querySelector(`.studio ${sel}`)?.textContent?.replace(/\s+/g, " ").trim() ?? "none";
    log(`layout: measure «${shows(".measure")}», error «${shows(".error-box")}», preview «${shows(".empty")}», compiling ${!!document.querySelector(".studio .busy")}`);
    ok = false;
  }
  // ------------------------------------------------------------- title page
  // A layout chosen by its picture, the fields typed, the page compiled next
  // to them; written in the main file in place of the title it had, read
  // back field by field, and the document still compiles.
  try {
    const main = project.info!.main!;
    const lang = i18n.lang === "fr" ? "fr" : "en";
    if (ui.overlay) ui.closeOverlay();
    await editor.open(main);
    const had = readTitlePage(editor.textOf(main) ?? "", lang).kind;
    ui.openOverlay("title");
    await until(() => !!document.querySelector(".title-studio .style"), 10_000, "title studio");
    const typeIn = (el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const group = (id: string) => document.querySelector<HTMLElement>(`.title-studio .fold[data-id="${id}"]`)!;
    document.querySelector<HTMLButtonElement>('.title-studio .style[data-style="report"]')!.click();
    await until(() => !!document.querySelector('.title-studio .fold[data-id="institution"]'), 3_000, "fields of the layout");
    const text = [...group("text").querySelectorAll<HTMLInputElement>("input")];
    typeIn(text[0], "Étude de la chaleur & de ses usages");
    typeIn(text[1], "Rapport d'étape");
    typeIn(group("text").querySelector("textarea")!, "Camille Martin\nSacha Durand");
    const institution = [...group("institution").querySelectorAll<HTMLInputElement>("input")];
    typeIn(institution[0], "Université de Lyon");
    typeIn(institution[2], "Mémoire de master");
    typeIn(group("institution").querySelector("textarea")!, "Pr. Ada Lovelace");
    await pause(900);
    await until(() => !!document.querySelector(".title-studio .preview-box canvas") && !document.querySelector(".title-studio .busy"), 180_000, "title page previewed");
    const said = document.querySelector(".title-studio .error-box")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    await scene("title-page");
    document.querySelector<HTMLButtonElement>(".title-studio .buttons .primary")!.click();
    await until(() => ui.overlay === null, 5_000, "title studio closed");
    const written = editor.textOf(main) ?? "";
    const found = readTitlePage(written, lang);
    const block = /\\begin\{titlepage\} % .+/.test(written) && written.includes("{\\huge\\bfseries Étude de la chaleur \\& de ses usages\\par} % ") && !/^\s*\\maketitle/m.test(written);
    const readBack =
      found.kind === "block" &&
      found.page.style === "report" &&
      found.page.title === "Étude de la chaleur & de ses usages" &&
      found.page.subtitle === "Rapport d'étape" &&
      found.page.authors.join("|") === "Camille Martin|Sacha Durand" &&
      found.page.institution === "Université de Lyon" &&
      found.page.kind === "Mémoire de master" &&
      found.page.supervisors.join("|") === "Pr. Ada Lovelace";
    log(`title page: had ${had}, preview ${said ? `error «${said}»` : "compiled"}, written ${block}, read back ${readBack}`);
    ok = !said && block && readBack && (await buildOk(log, "title page")) && ok;
  } catch (e) {
    log(`title page failed: ${e}`);
    const said = document.querySelector(".title-studio .error-box, .title-studio .preview-box .empty")?.textContent?.replace(/\s+/g, " ").trim() ?? "none";
    log(`title page: the window says «${said}», compiling ${!!document.querySelector(".title-studio .busy")}`);
    ok = false;
  }
  // ----------------------------------------------------------------- export
  // The whole project without what its builds left; then what the document
  // reads, as its last build recorded it; the window lists it, and the
  // archive is written.
  try {
    const main = project.info!.main!;
    const root = project.info!.root;
    if (ui.overlay) ui.closeOverlay();
    await editor.saveAll({ silent: true });
    const whole = await ipc.exportPlan(main, defaultOptions(false));
    const sent = await ipc.exportPlan(main, defaultOptions(true));
    const built = (plan: typeof whole) => plan.files.filter((f) => /^build\/|\.(aux|log|fls|synctex\.gz)$/.test(f.name)).map((f) => f.name);
    const clean = whole.files.length > 0 && whole.files.some((f) => f.role === "main") && !built(whole).length;
    const used = sent.recorded && sent.files.some((f) => f.role === "main") && !built(sent).length && sent.files.every((f) => f.role === "compiled" || whole.files.some((w) => w.name === f.name));
    ui.openOverlay("export");
    await until(() => document.querySelectorAll(".export-window .file").length === whole.files.length, 10_000, "files of the project listed");
    document.querySelector<HTMLButtonElement>('.export-window .kind[data-kind="submission"]')!.click();
    await until(() => document.querySelectorAll(".export-window .file").length === sent.files.length && !!document.querySelector('.export-window .kind[data-kind="submission"].active'), 10_000, "files of the document listed");
    const boxes = [...document.querySelectorAll<HTMLInputElement>(".export-window .check input")].map((b) => b.checked).join(",");
    await scene("export");
    ui.closeOverlay();
    // The dialog of the system that asks where is not driven here: the archive is written next to the project.
    const dest = `${root}-export-${Date.now()}.zip`;
    const size = await ipc.exportWrite(main, defaultOptions(true), dest).catch((e) => `failed: ${e}`);
    const written = typeof size === "number" && size > 0 && (await ipc.pathExists(dest));
    log(`export: project ${whole.files.length} files clean ${clean} ${built(whole).join(" ")}, document ${sent.files.length} files recorded ${sent.recorded} stale ${sent.stale} used ${used} (${sent.files.map((f) => f.name).join(" ")}), options ${boxes}, archive ${size}`);
    ok = clean && used && boxes === "true,true" && written && ok;
  } catch (e) {
    log(`export failed: ${e}`);
    ok = false;
  }
  // ------------------------------------------------------------- PDF export
  // Asked for while the document compiles: the engine refuses to copy the
  // PDF it is writing, the small window follows the build, and what is
  // written is a whole PDF. Asked again with nothing changed: no build, no
  // window. After a change: the document is compiled first.
  try {
    const main = project.info!.main!;
    const root = project.info!.root;
    const stamp = Date.now();
    /** Size of a PDF that has its start and its end, 0 for anything else. */
    const wholePdf = async (path: string) => {
      const bytes = new Uint8Array(await ipc.readBinaryFile(path).catch(() => new ArrayBuffer(0)));
      const text = new TextDecoder("latin1").decode(bytes);
      return text.startsWith("%PDF-") && text.slice(-1024).includes("%%EOF") ? bytes.length : 0;
    };
    await build.idle();
    void build.run();
    await until(() => build.running, 15_000, "build started for the export");
    const refusal = await ipc.exportFile(viewer.pdf!, `${root}-refused-${stamp}.pdf`).then(
      () => "copied",
      (e) => String(e),
    );
    const during = `${root}-during-${stamp}.pdf`;
    const exporting = pdfExport.start(during);
    // A window of its own opens, follows the build, tells what it showed and goes by itself.
    await until(() => pdfExport.windowReady, 20_000, "export window");
    const opened = await ipc.exportWindowShown();
    await scene("pdf-export");
    await exporting;
    await until(() => pdfExport.job === null, 120_000, "export during a build");
    const sizeDuring = await wholePdf(during);
    await until(() => pdfExport.report !== null, 10_000, "report of the export window");
    const told = `${pdfExport.report?.steps} steps, ${pdfExport.report?.lines} lines`;
    const followed = (pdfExport.report?.steps ?? 0) >= 1 && (pdfExport.report?.lines ?? 0) >= 1;
    let closed = false;
    for (let i = 0; i < 40 && !closed; i++) {
      await pause(250);
      closed = !(await ipc.exportWindowShown());
    }

    const builds = build.startedAt;
    const again = `${root}-again-${stamp}.pdf`;
    await pdfExport.start(again);
    const quiet = build.startedAt === builds && pdfExport.job === null && !(await ipc.exportWindowShown());
    const sizeAgain = await wholePdf(again);

    await editor.rewrite(main, (text) => `${text}\n% exported\n`);
    const after = `${root}-after-${stamp}.pdf`;
    await pdfExport.start(after);
    await until(() => pdfExport.job === null, 120_000, "export after a change");
    const rebuilt = build.startedAt !== builds;
    const sizeAfter = await wholePdf(after);
    log(
      `pdf export: copy during a build «${refusal}», window opened ${opened} «${told}» closed by itself ${closed}, during ${sizeDuring} bytes, unchanged ${sizeAgain} bytes without a build ${quiet}, after a change ${sizeAfter} bytes rebuilt ${rebuilt}`,
    );
    ok = refusal.includes("building") && opened && followed && closed && sizeDuring > 0 && quiet && sizeAgain === sizeDuring && rebuilt && sizeAfter > 0 && ok;
  } catch (e) {
    log(`pdf export failed: ${e}, job ${JSON.stringify(pdfExport.job)}`);
    ok = false;
  }
  // ------------------------------------------------------------- lighter PDF
  // A heavy photograph in the document: the export asks how (as it is,
  // lighter, under a size) and says about what each would weigh; the lighter
  // PDF is built apart and is many times lighter; under a limit, it is within
  // it; and the photograph of the project is as it was.
  try {
    const main = project.info!.main!;
    const root = project.info!.root;
    const stamp = Date.now();
    const pdfSize = async (path: string) => {
      const bytes = new Uint8Array(await ipc.readBinaryFile(path).catch(() => new ArrayBuffer(0)));
      const text = new TextDecoder("latin1").decode(bytes);
      return text.startsWith("%PDF-") && text.slice(-1024).includes("%%EOF") ? bytes.length : 0;
    };
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d")!;
    const grain = ctx.createImageData(1800, 1200);
    for (let i = 0; i < grain.data.length; i += 4) {
      const x = (i / 4) % 1800;
      grain.data[i] = (x / 9 + Math.random() * 50) | 0;
      grain.data[i + 1] = (90 + Math.random() * 50) | 0;
      grain.data[i + 2] = (210 - x / 10 + Math.random() * 40) | 0;
      grain.data[i + 3] = 255;
    }
    ctx.putImageData(grain, 0, 0);
    const photo = new Uint8Array(await (await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"))).arrayBuffer());
    const picture = `${root}/figures/grain.png`;
    await ipc.writeBinaryFile(picture, photo);
    await editor.rewrite(chapter, (text) => `${text}\n\n\\includegraphics[width=6cm]{figures/grain}\n`);
    const heavy = `${root}-heavy-${stamp}.pdf`;
    await pdfExport.start(heavy);
    await until(() => pdfExport.job === null, 120_000, "export with the photograph");
    const sizeHeavy = await pdfSize(heavy);

    const found = await ipc.pdfPictures(main);
    const weights = await ipc.pdfWeights(main);
    // The button of the export now asks how.
    void viewer.exportPdf();
    await until(() => !!document.querySelector(".pdf-choice") && !document.querySelector(".pdf-choice .spinner"), 120_000, "choices of the export");
    const offered = [...document.querySelectorAll<HTMLElement>(".pdf-choice .choice")].map((c) => `${c.dataset.kind} ${c.querySelector(".size")?.textContent?.trim()}`);
    await scene("pdf-choice");
    ui.closeOverlay();

    const light = `${root}-light-${stamp}.pdf`;
    const lightening = pdfExport.start(light, { kind: "step", step: 3 });
    await until(() => pdfExport.job?.phase === "pictures" || pdfExport.job?.phase === "lighter" || pdfExport.job === null, 30_000, "lighter export started");
    const shown = (await ipc.exportWindowShown()) || pdfExport.job === null;
    await lightening;
    await until(() => pdfExport.job === null, 180_000, "lighter export");
    const sizeLight = await pdfSize(light);

    const limit = Math.round(sizeHeavy / 6);
    const limited = `${root}-limited-${stamp}.pdf`;
    await pdfExport.start(limited, { kind: "limit", bytes: limit });
    await until(() => pdfExport.job === null, 240_000, "export under a limit");
    const sizeLimited = await pdfSize(limited);
    const untouched = (await ipc.readBinaryFile(picture)).byteLength === photo.length;
    const strays = (await ipc.fileTree()).map((n) => n.name).filter((n) => /export|copy|\.part$/i.test(n));
    log(
      `lighter pdf: photograph ${photo.length} bytes, PDF ${sizeHeavy}; ${found?.pictures} pictures of ${found?.original} bytes, steps ${weights?.steps.join(" ")}; offered ${offered.join(" | ")}; lighter ${sizeLight} (window ${shown}); under ${limit}: ${sizeLimited}; photograph untouched ${untouched}, strays ${strays.join(" ") || "none"}`,
    );
    ok =
      sizeHeavy > photo.length / 2 &&
      (found?.pictures ?? 0) >= 1 &&
      weights?.steps.length === 8 &&
      offered.length === 4 &&
      offered.every((o) => /\d/.test(o)) &&
      shown &&
      sizeLight > 0 &&
      sizeLight * 3 < sizeHeavy &&
      sizeLimited > 0 &&
      sizeLimited <= limit &&
      untouched &&
      !strays.length &&
      ok;
  } catch (e) {
    log(`lighter pdf failed: ${e}, job ${JSON.stringify(pdfExport.job)}`);
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
    // Started, or already over: in a window behind another one, timers wake
    // once a second, and a short build is finished before it is seen running.
    await until(() => build.running || viewer.revision !== beforeRev, 10_000, "live build start");
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
    // Every tool is there, a family shows its own, and the field finds a tool by its name (without its accents).
    const tools = () => [...document.querySelectorAll<HTMLElement>(".all-tools .item .label")].map((l) => l.textContent?.trim() ?? "");
    const everything = tools().length;
    const families = document.querySelectorAll(".all-tools .family").length;
    document.querySelector<HTMLButtonElement>('.all-tools .family[data-family="format.groupPage"]')!.click();
    await pause(200);
    const ofPage = tools().length;
    const finder = document.querySelector<HTMLInputElement>(".all-tools .search")!;
    type(finder, "equation");
    await pause(200);
    const found = tools();
    check(
      "see all: every tool, by family, by name",
      everything >= 45 && families === 7 && ofPage === 5 && found.length >= 2 && found.every((name) => /[eé]quation/i.test(name)),
      `${everything} tools, ${families} families, page ${ofPage}, «equation» ${found.join(" | ")}`,
    );
    type(finder, "");
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

    // ------------------------------------------------- what is new
    // The version that runs is remembered (a first start tells nothing), and
    // its news are a summary with everything behind "See more".
    const remembered = (await ipc.getSettings()).updates?.seenVersion;
    check("version remembered", remembered === app.info!.version && whatsNew.shown === null, remembered);
    whatsNew.show();
    await until(() => !!document.querySelector(".whats-new .points li"), 5_000, "what's new");
    const news = document.querySelector<HTMLElement>(".whats-new")!;
    const newsPoints = news.querySelectorAll(".points li").length;
    news.querySelector<HTMLButtonElement>(".more")!.click();
    await until(() => !!news.querySelector(".details h4"), 3_000, "details of what's new");
    check(
      "what's new: a summary, then everything",
      news.querySelector("h3")!.textContent!.includes(app.info!.version) && newsPoints >= 1 && newsPoints <= 6 && news.querySelectorAll(".details li").length > newsPoints,
      `${newsPoints} points, ${news.querySelectorAll(".details li").length} lines`,
    );
    await scene("whats-new");
    whatsNew.close();
    await until(() => !document.querySelector(".whats-new"), 3_000, "what's new closed");

    // ------------------------------------------------- TikZ whiteboard
    const z = editor.view!;
    const endAt = z.state.doc.toString().lastIndexOf("\\end{document}");
    z.dispatch({ changes: { from: endAt, insert: "\n\n" }, selection: { anchor: endAt + 1 } });
    document.querySelector<HTMLButtonElement>(".format-bar .text-btn.tikz")!.click();
    await until(() => !!document.querySelector(".studio .board svg"), 10_000, "whiteboard");
    await pause(500);
    // Whatever the height of the window, the tools keep their shape and stay in their column.
    const column = document.querySelector<HTMLElement>(".studio .tools")!.getBoundingClientRect();
    const toolBoxes = [...document.querySelectorAll<HTMLElement>(".studio .tools .tool:not(.lock)")].map((b) => b.getBoundingClientRect());
    check(
      "whiteboard tools whole, in their column",
      toolBoxes.length > 10 && toolBoxes.every((b) => Math.abs(b.width - b.height) < 1 && b.bottom <= column.bottom + 1 && b.right <= column.right + 1),
      `${toolBoxes.length} tools, column ${Math.round(column.width)}x${Math.round(column.height)}, ${toolBoxes.map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`).join(" ")}`,
    );
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
    // After a shape, the selection tool is back: a rectangle drawn on the
    // paper selects what it touches, and the shapes are resized together.
    const shapeCount = () => document.querySelectorAll(".studio .board g.shape").length;
    drag(60, 120, 540, 340);
    await pause(200);
    const touched = document.querySelectorAll(".studio .board .sel").length;
    check("selection by rectangle", touched === 4 && !!document.querySelector(".studio .board .group") && document.querySelectorAll(".studio .board .handle").length === 4, touched);
    // The selection is kept as a set, under a name typed at once, in a file of the user.
    const bar = () => [...document.querySelectorAll<HTMLButtonElement>(".studio .board .bar button")];
    bar()[3].click();
    await until(() => !!document.querySelector(".studio .sets .name"), 5_000, "set to name");
    const setName = document.querySelector<HTMLInputElement>(".studio .sets .name")!;
    setName.value = "Montage";
    setName.dispatchEvent(new Event("blur"));
    let kept: { name: string; code: string } | undefined;
    for (let i = 0; i < 50 && !kept; i++) {
      kept = (await ipc.tikzSets()).find((x) => x.name === "Montage");
      if (!kept) await pause(100);
    }
    check("set kept", !!kept && kept.code.includes("rectangle") && kept.code.includes("{Entrée $x_1$}"), kept?.code);
    // One click draws it again, selected; Alt and a drag leave a copy of a shape.
    document.querySelector<HTMLButtonElement>(".studio .sets .set .thumb")!.click();
    await pause(300);
    check("set drawn again", shapeCount() === 6 && document.querySelectorAll(".studio .board .sel").length === 4, shapeCount());
    const hit = document.querySelector<SVGElement>(".studio .board g.shape .hit")!;
    const box = hit.getBoundingClientRect();
    hit.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.left + 1, clientY: box.top + box.height / 2, pointerId: 1, button: 0, altKey: true }));
    pe("pointermove", box.left - r.left + 80, box.top - r.top + 150);
    pe("pointerup", box.left - r.left + 80, box.top - r.top + 150);
    await pause(200);
    check("copy by Alt and a drag", shapeCount() === 7, shapeCount());
    // The bar of the selection duplicates and deletes.
    bar()[0].click();
    await pause(150);
    const duplicated = shapeCount();
    bar()[bar().length - 1].click();
    await pause(150);
    check("duplicate, then delete", duplicated === 8 && shapeCount() === 7, `${duplicated} then ${shapeCount()}`);
    // The LaTeX rendering shows the whole picture, in a box of a fair size.
    await drawn(".studio .mini canvas", log, "whiteboard rendering");
    await pause(600);
    const rendering = document.querySelector<HTMLElement>(".studio .mini .preview");
    if (rendering?.querySelector("canvas"))
      check(
        "rendering shown whole",
        rendering.clientHeight >= 170 && rendering.scrollHeight <= rendering.clientHeight + 1 && rendering.scrollWidth <= rendering.clientWidth + 1,
        `${rendering.scrollWidth}×${rendering.scrollHeight} in ${rendering.clientWidth}×${rendering.clientHeight}`,
      );
    // Back from another page of the studio, the board frames what is drawn, in its middle.
    const pages = [...document.querySelectorAll<HTMLButtonElement>(".mode-tabs button")];
    pages[1].click();
    await pause(400);
    pages[0].click();
    await until(() => shapeCount() === 7 && !!document.querySelector(".studio .board .node"), 5_000, "whiteboard back");
    await pause(300);
    const paper = boardEl.getBoundingClientRect();
    const boxes = [...document.querySelectorAll(".studio .board g.shape, .studio .board .node")].map((el) => el.getBoundingClientRect());
    const span = { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)), top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)) };
    const off = [(span.left + span.right - paper.left - paper.right) / 2, (span.top + span.bottom - paper.top - paper.bottom) / 2];
    const filled = Math.max((span.right - span.left) / paper.width, (span.bottom - span.top) / paper.height);
    check(
      "board framed on the drawing",
      span.left >= paper.left && span.right <= paper.right && span.top >= paper.top && span.bottom <= paper.bottom && Math.abs(off[0]) < paper.width * 0.1 && Math.abs(off[1]) < paper.height * 0.1 && filled > 0.4,
      `off ${off.map(Math.round)}, filled ${filled.toFixed(2)}, paper ${Math.round(paper.width)}×${Math.round(paper.height)}`,
    );
    // A curve through three points, a second text, and a link from the
    // first text to it; the second text, moved, lines up with the first
    // (a line shows it) and the link follows.
    {
      const at = svg.getBoundingClientRect();
      const on = (type: string, x: number, y: number, target: Element = svg) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true }));
      const before = shapeCount();
      boardEl.focus();
      k("b");
      for (const [x, y] of [[0.12, 0.86], [0.2, 0.72], [0.3, 0.88]]) on("pointerdown", at.left + at.width * x, at.top + at.height * y);
      k("Enter");
      await pause(200);
      const curved = !!document.querySelector('.studio .board g.shape path[d*="C"]');
      k("t");
      on("pointerdown", at.left + at.width * 0.8, at.top + at.height * 0.82);
      await pause(150);
      const second = document.querySelector<HTMLInputElement>(".node-input")!;
      second.value = "Sortie";
      second.dispatchEvent(new Event("input", { bubbles: true }));
      second.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await pause(400);
      const nodes = () => [...document.querySelectorAll<HTMLElement>(".studio .board .node")];
      const centre = (el: Element) => {
        const b = el.getBoundingClientRect();
        return [b.left + b.width / 2, b.top + b.height / 2];
      };
      const [first, last] = [nodes().find((n) => n.textContent?.includes("Entrée"))!, nodes().find((n) => n.textContent?.trim() === "Sortie")!];
      boardEl.focus();
      k("k");
      await pause(100);
      const [ax, ay] = centre(first);
      const [bx, by] = centre(last);
      on("pointerdown", ax, ay, first);
      on("pointermove", (ax + bx) / 2, (ay + by) / 2, first);
      on("pointermove", bx, by, first);
      on("pointerup", bx, by, first);
      await pause(300);
      const linkedNow = shapeCount() === before + 2 && document.querySelectorAll(".studio .board g.shape path.hit").length >= 2;
      // Dragged to nearly the height of the first text: taken to it, with a line.
      const moving = nodes().find((n) => n.textContent?.trim() === "Sortie")!;
      const [mx, my] = centre(moving);
      const lineBefore = document.querySelector(".studio .board g.shape.sel path:not(.hit)")?.getAttribute("d");
      boardEl.focus();
      k("v");
      on("pointerdown", mx, my, moving);
      on("pointermove", mx - 20, ay + 3, moving);
      await pause(100);
      const guided = document.querySelectorAll(".studio .board .guide").length > 0;
      on("pointerup", mx - 20, ay + 3, moving);
      await pause(300);
      const [, endY] = centre(nodes().find((n) => n.textContent?.trim() === "Sortie")!);
      const followed = [...document.querySelectorAll(".studio .board g.shape path:not(.hit)")].some((path) => path.getAttribute("d")?.includes("L") && path.getAttribute("d") !== lineBefore);
      check("whiteboard: a curve, a link, a guide", curved && linkedNow && guided && Math.abs(endY - ay) < 1.5 && followed, `curve ${curved}, link ${linkedNow} (${shapeCount()} shapes, ${before} before), guide ${guided}, aligned ${Math.round(endY - ay)}px, followed ${followed}`);
    }
    await scene("whiteboard", 2500);
    document.querySelector<HTMLButtonElement>(".footer .btn.primary")!.click();
    await until(() => ui.overlay === null, 20_000, "drawing inserted");
    const withDrawing = editor.textOf(main) ?? "";
    check("drawing inserted", /\\draw \([^)]*\) rectangle/.test(withDrawing) && withDrawing.includes("\\node") && withDrawing.includes("{Entrée $x_1$}"));
    check("curve and link written as TikZ", /plot\[smooth\] coordinates \{(\([^)]*\) ?){3}\}/.test(withDrawing) && /\\draw\[->\] \(n\d\) -- \(n\d\);/.test(withDrawing) && /\\node \(n\d\) at \([^)]*\) \{Sortie\}/.test(withDrawing), withDrawing.slice(withDrawing.indexOf("\\begin{tikzpicture}"), withDrawing.indexOf("\\end{tikzpicture}")));
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
    // Each mistake of the document is found in the source: its cause is said, never that it is not understood.
    const found = errors.filter((d) => !!causeOf(d));
    check("causes found", found.length >= 6, errors.map((d) => `${d.code}:${causeOf(d) ? "cause" : "none"}`).join(" "));
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
    // Both are gone from the tree, then from the disk (the second one is
    // still on its way to the bin when the first has left the tree).
    await until(() => project.findNode(`${root}/annexes/chap1.tex`) === null && project.findNode(`${root}/annexes/chap2.tex`) === null, 8_000, "deleted");
    let gone = false;
    for (let i = 0; i < 50 && !gone; i++) {
      gone = !(await ipc.pathExists(`${root}/annexes/chap1.tex`)) && !(await ipc.pathExists(`${root}/annexes/chap2.tex`));
      if (!gone) await pause(100);
    }
    check("deleted together", gone);

    // ------------------------------------------------- bibliography
    // An entry written in the form makes the .bib file of a project that has
    // none; it is listed with its fields as written, changed, then removed.
    {
      const mainFile = project.info!.main!;
      ui.showSidebar("bibliography");
      await until(() => !!document.querySelector(".bib-list"), 5_000, "bibliography view");
      document.querySelector<HTMLButtonElement>(".panel-header .icon-btn")!.click();
      await until(() => !!document.querySelector(".bib-entry"), 3_000, "entry form");
      const form = () => document.querySelector<HTMLElement>(".bib-entry")!;
      const typeIn = (el: HTMLInputElement, text: string) => {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const fields = () => [...form().querySelectorAll<HTMLInputElement>(".body > .field input")];
      typeIn(fields()[0], "Knuth, Donald E.");
      typeIn(fields()[1], "The {\\TeX}book");
      typeIn(fields()[2], "TUGboat");
      typeIn(fields()[3], "1984");
      // No key typed: it is made from the author and the year.
      form().querySelector<HTMLButtonElement>(".buttons .btn.primary")!.click();
      await until(() => !document.querySelector(".bib-entry"), 8_000, "entry saved");
      const entries = async () => (await ipc.bibliography(mainFile)).entries;
      let listed = await entries();
      for (let i = 0; i < 50 && !listed.length; i++) {
        await pause(100);
        listed = await entries();
      }
      const bibFile = listed[0]?.file ?? "";
      check(
        "entry written in a new .bib file",
        listed.length === 1 && listed[0].key === "knuth1984" && listed[0].kind === "article" && listed[0].title === "The TeXbook" && listed[0].cited === 0 && basename(bibFile) === "references.bib",
        JSON.stringify(listed).slice(0, 300),
      );
      check("fields kept as written", (editor.textOf(bibFile) ?? "").includes("title = {The {\\TeX}book},"), editor.textOf(bibFile));
      await until(() => !!document.querySelector(".bib-list .item .main"), 5_000, "entry in the list");
      await scene("bibliography");
      // A click on the entry opens it in the form; its year is changed.
      document.querySelector<HTMLButtonElement>(".bib-list .item .main")!.click();
      await until(() => !!document.querySelector(".bib-entry"), 3_000, "entry form again");
      check("form filled from the file", form().querySelector<HTMLInputElement>(".key")!.value === "knuth1984" && fields()[1].value === "The {\\TeX}book", fields().map((f) => f.value).join(" | "));
      typeIn(fields()[3], "1986");
      form().querySelector<HTMLButtonElement>(".buttons .btn.primary")!.click();
      await until(() => !document.querySelector(".bib-entry"), 8_000, "entry changed");
      listed = await entries();
      for (let i = 0; i < 50 && listed[0]?.year !== "1986"; i++) {
        await pause(100);
        listed = await entries();
      }
      check("entry changed in place", listed.length === 1 && listed[0].year === "1986" && listed[0].key === "knuth1984", JSON.stringify(listed).slice(0, 200));
      // Removed from its form, after a confirmation.
      await until(() => !!document.querySelector(".bib-list .item .main"), 5_000, "entry in the list");
      document.querySelector<HTMLButtonElement>(".bib-list .item .main")!.click();
      await until(() => !!document.querySelector(".bib-entry .btn.link.danger"), 3_000, "delete button");
      document.querySelector<HTMLButtonElement>(".bib-entry .btn.link.danger")!.click();
      await until(() => !!document.querySelector('[role="alertdialog"] .btn.primary'), 3_000, "confirmation of the deletion");
      document.querySelector<HTMLButtonElement>('[role="alertdialog"] .btn.primary')!.click();
      listed = await entries();
      for (let i = 0; i < 50 && listed.length; i++) {
        await pause(100);
        listed = await entries();
      }
      check("entry removed", listed.length === 0 && !document.querySelector(".bib-entry"), JSON.stringify(listed).slice(0, 200));
      ui.showSidebar("files");
    }

    // ------------------------------------------------------ history
    // A moment of the project is kept; a line is added to the main file; the
    // window of the history shows it, and puts the file back as it was
    // (after a moment of what it had become).
    {
      const mainFile = project.info!.main!;
      await editor.open(mainFile);
      const original = editor.textOf(mainFile) ?? "";
      const letter = (text: string) => `\\documentclass{article}\n\\begin{document}\n${text}\n\\end{document}\n`;
      await editor.rewrite(mainFile, () => letter("Une phrase."));
      await editor.saveAll({ silent: true });
      await ipc.historyKeep("manual");
      const then = editor.textOf(mainFile) ?? "";
      await editor.rewrite(mainFile, () => letter("Une phrase.\nUne ligne de plus."));
      await editor.save(mainFile, { silent: true });
      void history.show(mainFile);
      await until(() => !!document.querySelector(".history .line.added"), 10_000, "comparison with the moment");
      const added = [...document.querySelectorAll(".history .line.added .text")].map((l) => l.textContent);
      check(
        "history: what changed since the moment",
        added.length === 1 && added[0] === "Une ligne de plus." && document.querySelector(".history .file.active")?.textContent?.trim() === basename(mainFile) && !document.querySelector(".history .line.removed"),
        `${added.join(" | ")} in ${document.querySelector(".history .file.active")?.textContent?.trim()}`,
      );
      await scene("history");
      // The PDF of the changes: compiled by the distribution with latexdiff,
      // shown in the window, and nothing of it left in the project. A
      // distribution without latexdiff says so and offers to install it.
      [...document.querySelectorAll<HTMLButtonElement>(".history .actions .btn")].at(-1)!.click();
      await until(() => !history.pdfBusy && history.pdfShown, 180_000, "PDF of the changes");
      if (history.pdf) await until(() => !!document.querySelector(".history .changes canvas"), 20_000, "PDF of the changes shown");
      const leftBehind = (await ipc.pathExists(`${root}/raytex-changes.tex`)) || (await ipc.pathExists(`${root}/build/raytex-changes`));
      log(`history: PDF of the changes ${history.pdf ? `built (${history.pdf.errors} errors)` : `not built: ${history.pdfProblem?.kind} ${history.pdfProblem?.detail ?? ""}`}`);
      check(
        "history: the PDF of the changes, or why there is none",
        !leftBehind && (history.pdf ? history.pdf.errors === 0 && (await ipc.pathExists(history.pdf.path)) : history.pdfProblem?.kind === "no-latexdiff" && !!document.querySelector(".history .problem .btn.primary")),
        `left behind ${leftBehind}, ${history.pdfProblem?.kind} ${history.pdfProblem?.detail}`,
      );
      if (history.pdf) await scene("history-pdf");
      history.closePdf();
      await until(() => !!document.querySelector(".history .line.added"), 5_000, "back to the comparison");
      document.querySelector<HTMLButtonElement>(".history .actions .btn")!.click();
      for (let i = 0; i < 80 && (editor.textOf(mainFile) !== then || history.busy); i++) await pause(100);
      const onDisk = (await ipc.readTextFile(mainFile)).text;
      check("history: the file put back as it was", editor.textOf(mainFile) === then && onDisk === then, onDisk.slice(-80));
      const kept = (await ipc.historyList()).moments;
      check("history: a moment taken before going back", kept[0]?.reason === "before-restore" && kept.some((m) => m.reason === "manual"), kept.map((m) => m.reason).join(","));
      if (ui.overlay === "history") ui.closeOverlay();
      await editor.rewrite(mainFile, () => original);
      await editor.save(mainFile, { silent: true });
    }

    // ------------------------------------------------- report a problem
    // The report says what runs here and names no folder of the user; it is
    // shown whole, and nothing is sent.
    {
      ui.openOverlay("report");
      await until(() => !!document.querySelector(".report-window pre"), 10_000, "report window");
      const text = () => document.querySelector(".report-window pre")?.textContent ?? "";
      const typed = document.querySelector<HTMLTextAreaElement>(".report-window textarea")!;
      typed.value = "Le tableau ne compile plus.";
      typed.dispatchEvent(new Event("input", { bubbles: true }));
      await pause(200);
      const home = /^(?:\/(?:Users|home)\/|[A-Za-z]:[\\/]Users[\\/])([^\\/]+)/.exec(root)?.[1] ?? "";
      check(
        "report: what runs here, and no folder of the user",
        text().includes(`RayTeX ${app.info?.version}`) && text().includes("### Environment") && text().includes("Le tableau ne compile plus.") && !text().includes(root) && (!home || !text().includes(home)),
        text().slice(0, 400),
      );
      check("report: read before it is copied", [...document.querySelectorAll(".report-window .buttons .btn")].length === 3 && !!document.querySelector(".report-window .promise"));
      await scene("report-problem");
      ui.closeOverlay();
    }

    // ---------------------------------------------------------- spelling
    // Turned on for a document whose language has no dictionary here, the
    // checker asks before it downloads anything, and downloads nothing when
    // the answer is no. With a dictionary (a very small one, written here
    // by hand: the scenes use no network), a word it does not know is
    // underlined in the prose, and only there; the right button offers a
    // correction and adds the word to those of the user.
    {
      const mainFile = project.info!.main!;
      await editor.open(mainFile);
      const original = editor.textOf(mainFile) ?? "";
      const letter = (language: string, body: string) => `\\documentclass{article}\n\\usepackage[${language}]{babel}\n\\title{Ein Titel}\n\\begin{document}\n${body}\n\\end{document}\n`;
      const content = () => document.querySelector<HTMLElement>(".cm-editor .cm-content")!;
      const underlined = () => [...content().querySelectorAll(".cm-misspelled")].map((el) => el.textContent ?? "");
      const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]');

      await editor.rewrite(mainFile, () => letter("italian", "Una frase."));
      void spelling.enable();
      await until(() => !!dialog(), 10_000, "question before the download");
      const asked = dialog()!.textContent ?? "";
      const said = asked.includes("github.com/LibreOffice/dictionaries") && /1[,.]3\s?M/.test(asked) && /italien|Italian/i.test(asked);
      // "Not now": the button that is not the main one.
      dialog()!.querySelector<HTMLButtonElement>(".btn:not(.primary)")!.click();
      await until(() => !dialog(), 5_000, "question answered");
      await pause(300);
      const refused = (await ipc.spellStatus()).installed.length === 0 && app.settings?.editor.spellcheck === true;
      const offered = document.querySelector(".status .spelling")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      check("spelling: asks before downloading, and downloads nothing on a no", said && refused && /télécharger|download/i.test(offered), `${asked.slice(0, 200)} · installed ${(await ipc.spellStatus()).installed.length} · status «${offered}»`);

      // A dictionary of German, by hand, where the downloaded ones are kept.
      const dictionaries = `${app.info!.settingsPath.replace(/[\\/][^\\/]*$/, "")}/dictionaries`;
      await ipc.exportText(`${dictionaries}/de.aff`, "SET UTF-8\nTRY esianrtolcdugmphbyfvkwz\n");
      await ipc.exportText(`${dictionaries}/de.dic`, "6\nEin\nSatz\nmit\nund\nTitel\nFehler\n");
      await editor.rewrite(mainFile, () => letter("english, ngerman", "Ein Satz mit Fehlerr und $xyzzy^2$ und \\foreignlanguage{english}{sume wurds}. % Fehler\n\\begin{tikzpicture}\n\\node {abcde};\n\\end{tikzpicture}"));
      await spelling.loadStatus();
      await spelling.refresh();
      await until(() => underlined().length > 0, 15_000, "misspelled word underlined");
      await pause(500);
      check(
        "spelling: only the misspelled word of the prose is underlined",
        underlined().join("|") === "Fehlerr" && content().getAttribute("spellcheck") === "false" && content().getAttribute("lang") === "de",
        `underlined ${underlined().join("|")}, lang ${content().getAttribute("lang")}`,
      );
      const shown = document.querySelector(".status .spelling")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      check("spelling: its language in the status bar", /deutsch|german|allemand/i.test(shown) && !/télécharger|download/i.test(shown), shown);
      await scene("spelling");
      // The right button on the word: what the dictionary offers, and the word added.
      const word = content().querySelector<HTMLElement>(".cm-misspelled")!;
      const at = word.getBoundingClientRect();
      word.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.left + 6, clientY: at.top + at.height / 2 }));
      await until(() => !!ui.menu, 10_000, "menu of the word");
      const items = (ui.menu?.items ?? []).flatMap((item) => ("label" in item && item.label ? [item] : []));
      const offers = items.map((item) => item.label).join(" | ");
      items[items.length - 1]?.run?.();
      ui.closeMenu();
      await until(() => underlined().length === 0, 10_000, "word added to the dictionary");
      const words = (await ipc.spellStatus()).words;
      check("spelling: a correction is offered, and the word can be added", offers.includes("Fehler") && offers.includes("Fehlerr") && words.includes("Fehlerr"), `${offers} · words ${words.join(",")}`);

      // As it was.
      await spelling.forget("Fehlerr");
      await spelling.remove("de");
      await spelling.disable();
      await until(() => underlined().length === 0 && !document.querySelector(".status .spelling"), 5_000, "checker off");
      await editor.rewrite(mainFile, () => original);
      await editor.save(mainFile, { silent: true });
    }

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
  // ---------------------------------------------- the cursor where it is put
  // Typing at the end of a long text, going back up, clicking somewhere and
  // typing there: the cursor is where the click was, and the view stays
  // there while the text is saved and compiled.
  try {
    const main = project.info!.main!;
    await editor.open(main);
    await until(() => !!editor.view && samePath(editor.active, main), 10_000, "main file shown");
    const v = editor.view!;
    const paragraphs = Array.from({ length: 260 }, (_, i) => `Paragraphe ${i + 1} : un texte assez long pour remplir la ligne et passer à la suivante, comme dans un vrai document, avec $x_{${i}}$ et une \\emph{nuance}.`).join("\n\n");
    // The project of these scenes is empty: a whole document, long enough to scroll.
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: `\\documentclass{article}\n\\begin{document}\n${paragraphs}\n\nFin du texte\n\\end{document}\n` }, userEvent: "input" });
    const last = v.state.doc.toString().lastIndexOf("Fin du texte") + "Fin du texte".length;
    v.dispatch({ selection: { anchor: last }, scrollIntoView: true });
    v.focus();
    await pause(500);
    v.dispatch({ ...v.state.replaceSelection(" tapé en bas"), scrollIntoView: true, userEvent: "input.type" });
    await pause(300);
    const bottom = Math.round(v.scrollDOM.scrollTop);
    // Back up, as a wheel does it.
    for (let i = 0; i < 12; i++) {
      v.scrollDOM.scrollTop -= 260;
      await pause(16);
    }
    await pause(350);
    const up = Math.round(v.scrollDOM.scrollTop);
    // A click in the middle of a line that is in sight.
    const box = v.scrollDOM.getBoundingClientRect();
    const content = v.contentDOM.getBoundingClientRect();
    const point = { x: content.left + 160, y: box.top + box.height * 0.4 };
    const wanted = v.posAtCoords(point);
    const target = document.elementFromPoint(point.x, point.y) ?? v.contentDOM;
    for (const type of ["mousedown", "mouseup", "click"]) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0, detail: 1 }));
    await pause(150);
    const clicked = v.state.selection.main.head;
    v.dispatch({ ...v.state.replaceSelection("ICI"), scrollIntoView: true, userEvent: "input.type" });
    const trace: number[] = [];
    for (let i = 0; i < 28; i++) {
      await pause(250);
      trace.push(Math.round(v.scrollDOM.scrollTop));
    }
    const stayed = trace.every((top) => Math.abs(top - up) < 120);
    const head = v.state.selection.main.head;
    // A click in the margin (the line numbers): the cursor comes to that line, it does not stay below.
    v.dispatch({ selection: { anchor: v.state.doc.toString().lastIndexOf("Fin du texte") } });
    await pause(100);
    const number = [...v.dom.querySelectorAll<HTMLElement>(".cm-lineNumbers .cm-gutterElement")].find((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.top > box.top + box.height * 0.3 && r.top < box.top + box.height * 0.7;
    });
    const at = number?.getBoundingClientRect();
    if (number && at) number.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: at.left + at.width / 2, clientY: at.top + at.height / 2, button: 0 }));
    await pause(120);
    const marginLine = v.state.doc.lineAt(v.state.selection.main.head);
    const inMargin = !!number && v.state.selection.main.head === marginLine.from && String(marginLine.number) === number.textContent?.trim() && Math.abs(v.scrollDOM.scrollTop - up) < 120;
    check("a click in the margin puts the cursor on that line", inMargin, `line ${marginLine.number}, number ${number?.textContent}, head ${v.state.selection.main.head}`);
    log(`cursor: bottom ${bottom}, up ${up}, click wanted ${wanted} got ${clicked}, after typing head ${head}, view ${Math.min(...trace)}..${Math.max(...trace)} stayed ${stayed}`);
    check("the cursor is where the click was, and the view stays", wanted !== null && clicked === wanted && head === clicked + 3 && bottom - up > 1500 && stayed, `${clicked}/${wanted} ${trace.join(" ")}`);
  } catch (e) {
    results.cursor = `FAILED ${e}`;
  }
  log(JSON.stringify(results, null, 2));
  const ok = !results.failure && Object.values(results).every((r) => typeof r !== "string" || !r.startsWith("FAILED"));
  log(`files scenes ${ok ? "PASSED" : "FAILED"}`);
  return ok;
}
