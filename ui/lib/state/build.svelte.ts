// Compilation: runs builds, streams their output, publishes diagnostics
// and refreshes the PDF.

import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import type { BuildOutcome, BuildPlan, Diagnostic } from "../types";
import { basename, fileKind, formatDuration, samePath } from "../utils";
import { app } from "./app.svelte";
import { diagnostics } from "./diagnostics.svelte";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { tex } from "./tex.svelte";
import { ui } from "./ui.svelte";
import { viewer } from "./viewer.svelte";

export interface ConsoleLine {
  stream: "stdout" | "stderr" | "cmd";
  text: string;
}

/** Output kept in memory (older lines are dropped on very verbose builds). */
const MAX_LINES = 40_000;

class BuildStore {
  running = $state(false);
  plan = $state<BuildPlan | null>(null);
  step = $state<string | null>(null);
  outcome = $state<BuildOutcome | null>(null);
  error = $state<Diagnostic | null>(null);
  startedAt = $state(0);
  /** Incremented when `output` changes (the array itself is not reactive: it can be huge). */
  outputRevision = $state(0);
  output: ConsoleLine[] = [];
  /** The running build was asked for by the user (not a live or on-save build). */
  manual = $state(false);

  get status(): "idle" | "running" | "success" | "failed" | "cancelled" {
    if (this.running) return "running";
    if (this.error) return "failed";
    if (!this.outcome) return "idle";
    if (this.outcome.cancelled) return "cancelled";
    return this.outcome.success ? "success" : "failed";
  }

  async init() {
    await ipc.on("build:started", ({ plan, manual }) => {
      // The engine tells which builds the user asked for (queued requests are coalesced).
      this.manual = manual;
      this.running = true;
      this.plan = plan;
      this.step = null;
      this.error = null;
      this.startedAt = Date.now();
      this.output = [];
      this.outputRevision++;
    });
    await ipc.on("build:step", ({ name, command }) => {
      this.step = name;
      this.push([{ stream: "cmd", text: `$ ${command}` }]);
    });
    await ipc.on("build:output", ({ lines }) => this.push(lines));
    await ipc.on("build:finished", ({ outcome, error, manual }) => this.finished(outcome, error, manual));
  }

  private push(lines: ConsoleLine[]) {
    this.output.push(...lines);
    if (this.output.length > MAX_LINES) this.output.splice(0, this.output.length - MAX_LINES);
    this.outputRevision++;
  }

  /** The file to compile: the active LaTeX file (its root is found by the engine), else the main file. */
  target(): string | null {
    const active = editor.active;
    if (active && fileKind(active) === "tex" && !editor.activeTab?.readOnly) return active;
    return project.info?.main ?? null;
  }

  async run(opts: { auto?: boolean } = {}) {
    const target = this.target();
    if (!target) {
      if (!opts.auto) ui.toast("info", t("build.nothingToBuild"));
      return;
    }
    // An empty main file (new project): nothing to compile yet.
    const text = editor.textOf(target);
    if (text !== null && !text.trim() && samePath(target, project.info?.main)) {
      if (!opts.auto) ui.toast("info", t("build.emptyDocument"));
      return;
    }
    if (!tex.ready) {
      if (opts.auto) return;
      if (tex.status?.detecting) ui.toast("info", t("build.stillDetecting"));
      else ui.openOverlay("setup");
      return;
    }
    // The engine reads files from disk: save first.
    await editor.saveAll({ auto: true, silent: true });
    await editor.flush();
    try {
      await ipc.build(target, !opts.auto);
    } catch (e) {
      ui.toast("error", t("build.failedToStart"), { detail: String(e) });
    }
  }

  cancel() {
    return ipc.cancelBuild();
  }

  async clean() {
    const target = this.target();
    if (!target) return;
    try {
      const n = await ipc.cleanBuild(target);
      ui.toast("success", t("build.cleaned", { n }));
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  async openLog() {
    const log = this.outcome?.plan.log ?? this.plan?.log;
    if (log && (await ipc.pathExists(log))) await editor.open(log);
    else ui.toast("info", t("build.noLog"));
  }

  reset() {
    this.outcome = null;
    this.error = null;
    this.plan = null;
    this.output = [];
    this.outputRevision++;
    diagnostics.setBuild([]);
  }

  private finished(outcome: BuildOutcome | null, error: Diagnostic | null, manual: boolean) {
    this.running = false;
    this.step = null;
    const auto = !manual;
    this.manual = false;
    if (error) {
      this.error = error;
      this.outcome = null;
      diagnostics.setBuild([error]);
      if (!auto) ui.toast("error", error.message, { action: { label: t("build.showProblems"), run: () => ui.showBottom("problems") } });
      return;
    }
    if (!outcome) return;
    this.outcome = outcome;
    this.error = null;
    diagnostics.setBuild(outcome.diagnostics);
    if (outcome.pdf && (outcome.pdfUpdated || !viewer.pdf)) viewer.load(outcome.pdf);
    if (outcome.cancelled) {
      ui.toast("info", t("build.cancelled"));
      return;
    }
    // The console is never opened by itself: errors are shown in the text,
    // in the top bar, and (for a compilation asked for) in a notification.
    const errors = outcome.diagnostics.filter((d) => d.severity === "error").length;
    if (!outcome.success || errors) {
      if (!auto && !ui.bottomVisible) {
        ui.toast("error", errors ? t("build.failedErrors", { n: errors }) : t("build.failed"), {
          action: { label: t("build.showProblems"), run: () => ui.showBottom("problems") },
        });
      }
    } else if (!auto && !ui.pdfVisible) {
      ui.toast("success", t("build.succeeded", { file: basename(outcome.pdf ?? ""), time: formatDuration(outcome.durationMs) }), {
        action: { label: t("build.showPdf"), run: () => ui.setVisible("pdf", true) },
      });
    }
    if (outcome.success && app.settings?.viewer.syncAfterBuild && !auto) void editor.syncForward(true);
    void project.refreshStructure();
  }
}

export const build = new BuildStore();
