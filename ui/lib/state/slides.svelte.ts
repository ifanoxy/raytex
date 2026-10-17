// The slides mode seen from the main window: its window opened, told the
// text of the deck, each build and where the cursor is, and the changes it
// asks for made in the editor (undone like any other). Loaded when the
// slides mode is opened, followed only while its window is.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { i18n, t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { SLIDES_LABEL, type SlidesCommand, type SlidesEdit, type SlidesState } from "../slideswindow";
import { debounce, join, samePath } from "../utils";
import { app } from "./app.svelte";
import { build } from "./build.svelte";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";

class SlidesLink {
  private listening = false;
  private stop: (() => void) | null = null;
  private version = 0;
  private lastText: string | null = null;
  private built = 0;
  private lastPdf = "";
  private readonly sendSoon = debounce(() => this.send(), 120);

  /** Opens the window of the slides mode (or brings it to the front). */
  async start() {
    await this.listen();
    this.watch();
    await ipc.slidesWindowOpen(t("slides.windowTitle", { name: project.info?.name ?? "" }));
  }

  private async listen() {
    if (this.listening) return;
    this.listening = true;
    await ipc.on("slides-window:ready", () => {
      this.watch();
      this.send();
    });
    await ipc.on("slides-window:edit", (e) => void this.apply(e));
    await ipc.on("slides-window:command", (c) => void this.command(c));
  }

  /** Follows the text, the builds and the cursor while the window is open. */
  private watch() {
    if (this.stop) return;
    this.stop = $effect.root(() => {
      $effect(() => {
        void editor.mainEdits;
        void editor.revision;
        void editor.cursor;
        void build.running;
        void build.outcome;
        void build.status;
        void app.theme;
        void i18n.lang;
        this.sendSoon();
      });
    });
  }

  private state(): SlidesState {
    const path = project.info?.main ?? null;
    const text = (path && editor.textOf(path)) ?? "";
    if (text !== this.lastText) {
      this.version++;
      this.lastText = text;
    }
    // The build of the deck itself (not of a file of it shown alone).
    const outcome = build.outcome && samePath(build.outcome.plan.root, path) && !build.outcome.plan.only ? build.outcome : null;
    const pdf = outcome?.pdf ?? null;
    const key = `${pdf}:${outcome?.durationMs}:${outcome?.pages}:${outcome?.success}`;
    if (pdf && key !== this.lastPdf) {
      this.built++;
      this.lastPdf = key;
    }
    return {
      path,
      text,
      version: this.version,
      pdf,
      nav: outcome ? join(outcome.plan.outDir, `${outcome.plan.job}.nav`) : null,
      built: this.built,
      building: build.running,
      failed: build.status === "failed",
      cursorLine: path && samePath(editor.active, path) ? editor.cursor.line : null,
      lang: i18n.lang === "fr" ? "fr" : "en",
      theme: app.theme,
    };
  }

  private send() {
    void ipc.tell(SLIDES_LABEL, "slides-window:state", this.state()).catch(() => {});
  }

  /** A change asked for on the version told: made in the editor, then built. */
  private async apply(edit: SlidesEdit) {
    const path = project.info?.main;
    if (!path) return;
    // Made on another text (typed meanwhile): the window is told the text as it is.
    if (edit.version !== this.version) return this.send();
    await editor.rewrite(path, (text) => [...edit.changes].sort((a, b) => b.from - a.from).reduce((out, c) => out.slice(0, c.from) + c.insert + out.slice(c.to), text));
    this.send();
    if (app.settings?.build.autoBuild !== "off") void build.run({ auto: true });
  }

  private async command(c: SlidesCommand) {
    const path = project.info?.main;
    if (c.kind === "closed") {
      this.stop?.();
      this.stop = null;
    } else if (c.kind === "build") void build.run();
    else if (c.kind === "reveal" && path) {
      await editor.open(path);
      editor.reveal(path, null, c.line);
      editor.focus();
      void getCurrentWindow().setFocus().catch(() => {});
    }
  }
}

export const slides = new SlidesLink();
