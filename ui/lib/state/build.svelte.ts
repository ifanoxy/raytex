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

declare module "../types" {
  interface BuildOutcome {
    /** A live build left work for a later one: the references of the page may be those of the build before. */
    rerunPending?: boolean;
  }
}

/** A pass of the engine longer than this makes a document a long one: its live builds are one pass each. */
const LONG_PASS_MS = 1500;

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
  /** The build that will complete a live one, once the text is left alone for a moment. */
  private completion: ReturnType<typeof setTimeout> | null = null;

  get status(): "idle" | "running" | "success" | "failed" | "cancelled" {
    if (this.running) return "running";
    if (this.error) return "failed";
    if (!this.outcome) return "idle";
    if (this.outcome.cancelled) return "cancelled";
    return this.outcome.success ? "success" : "failed";
  }

  async init() {
    await ipc.on("build:started", ({ plan, manual }) => {
      this.forgetCompletion();
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
    await ipc.on("build:finished", ({ outcome, error, manual, superseded }) => this.finished(outcome, error, manual, !!superseded));
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

  /** How long a pass of the engine takes on this document, from its last whole build; null when none was made. */
  get passMs(): number | null {
    return this.reference?.steps[0]?.durationMs ?? null;
  }

  /**
   * How long the text is left alone before a live build starts: the delay
   * of the settings, and longer for a document whose passes are long (a
   * build of several seconds is not worth starting at each breath).
   */
  idleDelay(setting: number): number {
    const pass = this.passMs ?? 0;
    return Math.max(400, setting, Math.min(2500, Math.round(pass * 0.3)));
  }

  /** The text changed: the build that was to complete the page waits for it to settle again. */
  textChanged() {
    this.forgetCompletion();
  }

  private forgetCompletion() {
    if (this.completion) clearTimeout(this.completion);
    this.completion = null;
  }

  /**
   * Asks for a build; false when none was asked (nothing to build, no TeX…).
   *
   * `auto`: not asked for by the user (the text was left alone, or saved).
   * On a long document such a build is a live one: one pass of the engine,
   * which gives way to a newer text. `complete`: a whole build all the
   * same (the one that completes a live build, or the one an export needs).
   * `live`: a live build whatever the length of the document (the self-test).
   */
  async run(opts: { auto?: boolean; complete?: boolean; live?: boolean } = {}): Promise<boolean> {
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
      const live = !!opts.auto && !opts.complete && (opts.live || (this.passMs ?? 0) > LONG_PASS_MS);
      await ipc.build(target, !opts.auto, live);
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
  async runToEnd(opts: { auto?: boolean; complete?: boolean; live?: boolean } = {}): Promise<boolean> {
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

  private finished(outcome: BuildOutcome | null, error: Diagnostic | null, manual: boolean, superseded = false) {
    this.running = false;
    this.step = null;
    this.tracker.ended();
    this.ended++;
    // Given up for a newer text, which is being built: the page, the problems and the console stay as they were.
    if (superseded) {
      for (const done of this.waiters.splice(0)) done();
      return;
    }
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
    // A live build showed the text; what it left (references that moved, the
    // bibliography) is done once the text has been left alone a little longer.
    if (outcome.rerunPending && auto) {
      this.forgetCompletion();
      this.completion = setTimeout(() => void this.run({ auto: true, complete: true }), Math.max(1200, Math.min(4000, Math.round(outcome.durationMs * 0.5))));
    }
  }
}

export const build = new BuildStore();
