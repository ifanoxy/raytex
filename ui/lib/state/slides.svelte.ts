// The slides mode seen from the application: the window becomes the slides
// mode (the editor stays behind it, hidden), which is told the text of the
// deck and each build, and whose changes are made in the editor (undone
// like any other). Loaded when the slides mode is opened, followed only
// while it is shown.

import { i18n } from "../i18n.svelte";
import type { SlidesCommand, SlidesEdit, SlidesHost, SlidesState } from "../slides/host";
import { debounce, join, samePath } from "../utils";
import { app } from "./app.svelte";
import { build } from "./build.svelte";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

class SlidesLink {
  private listeners = new Set<(state: SlidesState) => void>();
  private stop: (() => void) | null = null;
  private version = 0;
  private lastText: string | null = null;
  private built = 0;
  private lastPdf = "";
  private readonly sendSoon = debounce(() => this.send(), 80);

  /** What the slides mode is given. */
  readonly host: SlidesHost = {
    subscribe: (listener) => {
      this.listeners.add(listener);
      this.watch();
      listener(this.state());
      return () => this.listeners.delete(listener);
    },
    edit: (e) => void this.apply(e),
    command: (c) => void this.command(c),
  };

  /** The window becomes the slides mode. */
  open() {
    // Keys go to the slides, not to the editor left behind.
    (document.activeElement as HTMLElement | null)?.blur?.();
    ui.mode = "slides";
    // No PDF of the deck yet: it is built, its slides are drawn as soon as it is.
    const path = project.info?.main;
    if (path && !build.running && !(build.outcome?.pdf && samePath(build.outcome.plan.root, path))) void build.run({ auto: true });
  }

  /** Back to the editor. */
  leave() {
    ui.mode = "editor";
    editor.focus();
  }

  /** Follows the text and the builds while the mode is shown. */
  private watch() {
    if (this.stop) return;
    this.stop = $effect.root(() => {
      $effect(() => {
        void editor.mainEdits;
        void editor.revision;
        void build.running;
        void build.outcome;
        void build.status;
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
    };
  }

  private send() {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }

  /** A change asked for on the version told: made in the editor, then built. */
  private async apply(edit: SlidesEdit) {
    const path = project.info?.main;
    if (!path) return;
    // Made on another text: the mode is told the text as it is.
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
    else if (c.kind === "leave") this.leave();
    else if (c.kind === "reveal" && path) {
      this.leave();
      await editor.open(path);
      editor.reveal(path, null, c.line);
      editor.focus();
    }
  }
}

export const slides = new SlidesLink();
