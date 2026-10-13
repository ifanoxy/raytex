// Compilation: runs builds, streams their output, publishes diagnostics
// and refreshes the PDF.

import type { BuildReference } from "../buildprogress";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import type { BuildOutcome, BuildPlan, Diagnostic } from "../types";
import { basename, fileKind, formatDuration, samePath } from "../utils";
import { app } from "./app.svelte";
import { diagnostics } from "./diagnostics.svelte";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { tex } from "./tex.svelte";
import { BuildTracker } from "./tracker.svelte";
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
  /** Where the running build stands (step, pages, last line). */
  readonly tracker = new BuildTracker();
  /** What the last whole build of each document took: the measure of the next one. */
  private references = new Map<string, BuildReference>();
  /** Builds that ended, and those waiting for the end of the running one. */
  private ended = 0;
  private waiters: (() => void)[] = [];

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
      editor.buildStarted();
      this.running = true;
      this.plan = plan;
      this.step = null;
      this.error = null;
      this.startedAt = Date.now();
      this.output = [];
      this.outputRevision++;
      this.tracker.start(this.references.get(plan.root) ?? null);
    });
    await ipc.on("build:step", ({ name, command }) => {
      this.step = name;
      this.tracker.stepStarted(name);
      this.push([{ stream: "cmd", text: `$ ${command}` }]);
    });
    await ipc.on("build:output", ({ lines }) => {
      this.tracker.output(lines);
      this.push(lines);
    });
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

  /** Asks for a build; false when none was asked (nothing to build, no TeX…). */
  async run(opts: { auto?: boolean } = {}): Promise<boolean> {
    const target = this.target();
    if (!target) {
      if (!opts.auto) ui.toast("info", t("build.nothingToBuild"));
      return false;
    }
    // An empty main file (new project): nothing to compile yet.
    const text = editor.textOf(target);
    if (text !== null && !text.trim() && samePath(target, project.info?.main)) {
      if (!opts.auto) ui.toast("info", t("build.emptyDocument"));
      return false;
    }
    if (!tex.ready) {
      if (opts.auto) return false;
      if (tex.status?.detecting) ui.toast("info", t("build.stillDetecting"));
      else ui.openOverlay("setup");
      return false;
    }
    // The engine reads files from disk: save first.
    await editor.saveAll({ auto: true, silent: true });
    await editor.flush();
    try {
      await ipc.build(target, !opts.auto);
      return true;
    } catch (e) {
      ui.toast("error", t("build.failedToStart"), { detail: String(e) });
      return false;
    }
  }

  /** What the last whole build of the document took: the measure of a build of the same document. */
  get reference(): BuildReference | null {
    const root = this.outcome?.plan.root ?? this.plan?.root;
    return (root && this.references.get(root)) || null;
  }

  /** Resolves once no build runs, one that was queued behind it included. */
  async idle(): Promise<void> {
    while (this.running) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
      // A queued build starts right after the one that ended.
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  /** Compiles and waits for the end; false when no build was asked. */
  async runToEnd(opts: { auto?: boolean } = {}): Promise<boolean> {
    const before = this.ended;
    if (!(await this.run(opts))) return false;
    // The engine says it started a moment after it was asked.
    for (let i = 0; i < 100 && !this.running && this.ended === before; i++) await new Promise((r) => setTimeout(r, 50));
    await this.idle();
    return true;
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
    this.tracker.ended();
    this.ended++;
    // A whole build that made its PDF is what the next one is measured with.
    if (outcome?.success && !outcome.cancelled && outcome.steps.length) {
      this.references.set(outcome.plan.root, { steps: outcome.steps.map((st) => ({ name: st.name, durationMs: st.durationMs })), pages: outcome.pages ?? null });
    }
    for (const done of this.waiters.splice(0)) done();
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
    // Typed during the build: the diagnostics move to the current text.
    editor.mapBuildDiagnostics(outcome.diagnostics);
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
