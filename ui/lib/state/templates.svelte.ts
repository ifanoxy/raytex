// Templates of the sidebar: list, thumbnails (first page, compiled once by
// the engine and rendered here) and application to the open project.

import { i18n, t, tr } from "../i18n.svelte";
import * as ipc from "../ipc";
import type { TemplateInfo } from "../types";
import { basename, join, prettyKey, relative } from "../utils";
import { build } from "./build.svelte";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { tex } from "./tex.svelte";
import { ui } from "./ui.svelte";

const AUTHOR_KEY = "labaguetex.author";
/** Thumbnails compiled at the same time (the engine allows as many). */
const THUMB_WORKERS = 3;
/** Width of the rendered thumbnails, in CSS pixels. */
const THUMB_WIDTH = 150;

export type Thumb = { state: "loading" } | { state: "ready"; url: string; landscape: boolean } | { state: "failed" };

/** Renders the first page of a PDF to an image URL. */
async function renderFirstPage(pdf: string): Promise<{ url: string; landscape: boolean }> {
  const { closePdf, loadPdf } = await import("../pdf/pdfjs");
  const doc = await loadPdf(await ipc.readBinaryFile(pdf));
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const landscape = base.width > base.height;
    const scale = ((landscape ? THUMB_WIDTH * 1.4 : THUMB_WIDTH) / base.width) * Math.max(2, window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("no image");
    return { url: URL.createObjectURL(blob), landscape };
  } finally {
    closePdf(doc);
  }
}

class TemplatesStore {
  list = $state<TemplateInfo[]>([]);
  thumbs = $state<Record<string, Thumb>>({});
  /** Template last applied to the project (highlighted in the list). */
  applied = $state<string | null>(null);
  applying = $state<string | null>(null);
  private lang = "";
  /** Thumbnails waiting to be compiled, and the workers compiling them. */
  private pending: TemplateInfo[] = [];
  private workers = 0;
  /** Text put in the main file by the last template (replacing it needs no confirmation). */
  private lastText: string | null = null;

  /** Loads the list (and thumbnails) once per language. */
  async load(force = false) {
    if (!force && this.lang === i18n.lang && this.list.length) return;
    if (this.lang !== i18n.lang) {
      this.pending = [];
      for (const th of Object.values(this.thumbs)) if (th.state === "ready") URL.revokeObjectURL(th.url);
      this.thumbs = {};
    }
    this.lang = i18n.lang;
    this.list = await ipc.listTemplates().catch(() => []);
    this.renderAll();
  }

  /** Compiles and renders missing thumbnails, a few at a time (in list order). */
  renderAll() {
    if (!tex.ready) return;
    for (const tpl of this.list) {
      if (this.thumbs[tpl.id]) continue;
      this.thumbs[tpl.id] = { state: "loading" };
      this.pending.push(tpl);
    }
    while (this.workers < THUMB_WORKERS && this.pending.length) void this.worker();
  }

  private async worker() {
    this.workers++;
    try {
      for (let tpl = this.pending.shift(); tpl; tpl = this.pending.shift()) {
        const lang = this.lang;
        try {
          const pdf = await ipc.templateThumbnail(tpl.id);
          const img = await renderFirstPage(pdf);
          if (lang === this.lang) this.thumbs[tpl.id] = { state: "ready", ...img };
          else URL.revokeObjectURL(img.url);
        } catch {
          if (lang === this.lang) this.thumbs[tpl.id] = { state: "failed" };
        }
      }
    } finally {
      this.workers--;
    }
  }

  /** Values filled in a template: the project name as title, the remembered author. */
  private values() {
    let author = "";
    try {
      author = localStorage.getItem(AUTHOR_KEY) ?? "";
    } catch {
      /* not remembered */
    }
    return { title: project.info?.name ?? "", author, institution: "", language: i18n.lang };
  }

  /**
   * Puts template `tpl` in the project's main file (one undoable change) and
   * adds its other files. Asks first when the file has other text.
   */
  async apply(tpl: TemplateInfo): Promise<boolean> {
    const info = project.info;
    if (!info || this.applying) return false;
    const main = info.main ?? join(info.root, "main.tex");
    if (!(await editor.open(main))) return false;
    const current = editor.textOf(main) ?? "";
    if (current.trim() && current !== this.lastText) {
      const ok = await ui.confirm({
        title: t("templates.replaceTitle", { name: tr(tpl.name), file: basename(main) }),
        message: t("templates.replaceMessage", { key: prettyKey("Mod-z") }),
        okLabel: t("templates.replace"),
      });
      if (!ok) return false;
    }
    this.applying = tpl.id;
    try {
      const applied = await ipc.applyTemplate(tpl.id, this.values());
      editor.setText(main, applied.mainText, bodyStart(applied.mainText));
      this.lastText = applied.mainText;
      this.applied = tpl.id;
      editor.focus();
      await Promise.all([project.refreshTree(), project.refreshInfo()]);
      if (applied.created.length) {
        const files = applied.created.map((f) => relative(info.root, f)).join(", ");
        ui.toast("info", t("templates.filesAdded", { files }));
      }
      await editor.saveAll({ auto: true, silent: true });
      void build.run({ auto: true });
      return true;
    } catch (e) {
      ui.toast("error", t("templates.applyFailed"), { detail: String(e) });
      return false;
    } finally {
      this.applying = null;
    }
  }
}

/** Where to put the cursor in a new document: the first empty line of the body. */
function bodyStart(text: string): number {
  const begin = text.indexOf("\\begin{document}");
  if (begin < 0) return 0;
  const after = text.indexOf("\n", begin);
  return after < 0 ? text.length : after + 1;
}

export const templates = new TemplatesStore();
