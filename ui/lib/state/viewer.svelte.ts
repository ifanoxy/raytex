// State of the PDF viewer and SyncTeX navigation.

import { save } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import type { Rect } from "../types";
import { basename, samePath } from "../utils";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

export type Zoom = "page-width" | "page-fit" | number;

export interface ForwardTarget {
  page: number;
  rects: Rect[];
  /** Changes on every request, so the same place can be shown twice. */
  token: number;
}

class ViewerStore {
  pdf = $state<string | null>(null);
  /** Incremented to reload the same file after a build. */
  revision = $state(0);
  page = $state(1);
  pages = $state(0);
  zoom = $state<Zoom>("page-width");
  /** Scale actually used (for the zoom indicator). */
  scale = $state(1);
  forwardTarget = $state<ForwardTarget | null>(null);

  load(path: string) {
    if (!samePath(this.pdf, path)) this.pdf = path;
    this.revision++;
  }

  clear() {
    this.pdf = null;
    this.pages = 0;
    this.page = 1;
    this.forwardTarget = null;
  }

  setDefaultZoom(value: string | undefined) {
    if (value === "page-fit" || value === "page-width") this.zoom = value;
    else if (value && Number.isFinite(Number(value))) this.zoom = Number(value) / 100;
  }

  zoomBy(factor: number) {
    const next = Math.min(5, Math.max(0.25, Math.round(this.scale * factor * 100) / 100));
    this.zoom = next;
  }

  /** Source → PDF: shows where `line` of `path` is. */
  async forward(path: string, line: number, quiet = false) {
    const r = await ipc.synctexForward(path, line).catch(() => null);
    if (!r || !r.rects.length) {
      if (!quiet) ui.toast("info", t("viewer.noSync"));
      return;
    }
    if (!samePath(this.pdf, r.pdf)) this.load(r.pdf);
    if (!ui.pdfVisible) {
      ui.pdfVisible = true;
      ui.saveLayout();
    }
    this.forwardTarget = { page: r.page, rects: r.rects, token: Date.now() };
  }

  /** PDF → source: opens the line that produced point (x, y) of `page`. */
  async inverse(page: number, x: number, y: number) {
    if (!this.pdf) return;
    const r = await ipc.synctexInverse(this.pdf, page, x, y).catch(() => null);
    if (!r) {
      ui.toast("info", t("viewer.noSync"));
      return;
    }
    await editor.open(r.file, { line: r.line });
  }

  async exportPdf() {
    if (!this.pdf) return;
    // Light mode: proposed next to the .tex file (its build is in the cache).
    const main = project.info?.light ? project.info.main : null;
    const defaultPath = main ? main.replace(/\.[^./\\]+$/, ".pdf") : basename(this.pdf);
    const dest = await save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!dest) return;
    try {
      await ipc.exportFile(this.pdf, dest);
      ui.toast("success", t("viewer.exported", { file: basename(dest) }));
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  openExternal() {
    if (this.pdf) void ipc.openInOs(this.pdf);
  }
}

export const viewer = new ViewerStore();
