// Exporting the PDF. The document is compiled first when its PDF is not
// that of the text as it is; the file is never copied while the engine
// writes it; and a window of its own, apart from the main one, shows the
// build in detail (see `ExportWindow.svelte`). That window can be closed:
// the export goes on, and says in the main window when it is done.
//
// With lighter pictures, the document is built once more, in a copy of the
// project kept apart: the same window follows that build.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { EXPORT_LABEL, type ExportWindowPhase, type ExportWindowReport, type ExportWindowState } from "../exportwindow";
import { sizeLabel } from "../history";
import { i18n, t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { type PdfChoice, STEP_LIGHT, stepFor } from "../pdfweight";
import { basename, dirname } from "../utils";
import { app } from "./app.svelte";
import { build } from "./build.svelte";
import { editor } from "./editor.svelte";
import { ui } from "./ui.svelte";
import { viewer } from "./viewer.svelte";

/**
 * `building`: the build of the project is waited for; `pictures`, then
 * `lighter`: the pictures are written lighter, then the document is built
 * with them; `failed`: there was no PDF to export, or one made with errors.
 */
export type ExportPhase = "building" | "pictures" | "lighter" | "copying" | "failed";

export interface ExportJob {
  dest: string;
  phase: ExportPhase;
  choice: PdfChoice;
  /** Errors of the build that stopped the export. */
  errors: number;
  /** Why nothing was exported, when it is not the errors of the build. */
  reason: string | null;
  /** A PDF is there all the same: it can be exported as it is. */
  canForce: boolean;
}

const ORIGINAL: PdfChoice = { kind: "original" };

class PdfExportStore {
  /** The export under way; null when there is none. */
  job = $state<ExportJob | null>(null);
  /** The window of the export said it was there (the self-test waits for it). */
  windowReady = $state(false);
  /** What that window had shown when the last export ended. */
  report = $state<ExportWindowReport | null>(null);
  /** Changes with each export: one that was given up says nothing at its end. */
  private run = 0;
  private listening = false;
  /** What the window was last told: told again, as things are then, when it says it is ready. */
  private said: ExportWindowState | null = null;
  private last: { dest: string; phase: ExportWindowPhase; end: { result: string; warning: boolean } | null } | null = null;
  /** The window being opened. */
  private opening: Promise<void> = Promise.resolve();

  /** Exports the PDF of the document to `dest`, as it is or with lighter pictures. */
  async start(dest: string, choice: PdfChoice = ORIGINAL) {
    if (this.job && this.job.phase !== "failed") return;
    const run = ++this.run;
    const current = () => run === this.run;
    this.job = null;
    await this.listen();
    // What is typed is part of the document.
    await editor.saveAll({ auto: true, silent: true });
    await editor.flush();
    const target = build.target();
    const fresh = !target || (!build.running && (await ipc.pdfFresh(target).catch(() => false)));
    if (!current()) return;
    if (!fresh) {
      this.set(dest, choice, "building");
      // The window hears the build from its first step.
      if (!build.running) await this.ready();
      if (!current()) return;
      // A build under way ends first: the whole document, or a file shown
      // on its own (then the whole document is built after it).
      let asked = true;
      if (build.running) await build.idle();
      if (!current()) return;
      if (build.outcome?.plan.only || !build.outcome || !(await ipc.pdfFresh(target!).catch(() => false))) {
        // Its own window tells how this build goes and ends: it is asked for quietly.
        asked = await build.runToEnd({ auto: true, complete: true, whole: true });
      }
      if (!current()) return;
      const outcome = build.outcome;
      const errors = outcome?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
      if (!asked || build.error || !outcome || outcome.cancelled || !outcome.success || errors) {
        // Nothing is said of a build the user stopped: the window just goes.
        if (outcome?.cancelled && !build.error) return this.close();
        this.fail(dest, choice, errors, build.error?.message ?? null, !!outcome?.pdf);
        return;
      }
    }
    await this.write(dest, choice, run, false);
  }

  /** Exports the PDF as the build left it, errors and all. */
  async force() {
    const job = this.job;
    if (!job || job.phase !== "failed" || !job.canForce) return;
    await this.write(job.dest, job.choice, this.run, true);
  }

  /** Gives the export up; the build it is waiting for is stopped too. */
  cancel() {
    const phase = this.job?.phase;
    this.close();
    if (phase === "building" && build.running) void build.cancel();
    if (phase === "pictures" || phase === "lighter") void ipc.exportPdfCancel();
  }

  private close() {
    const dest = this.job?.dest ?? this.said?.dest;
    this.run++;
    this.job = null;
    if (dest) this.tell(dest, "closed");
  }

  /** The export enters a phase: its window is there to show it. */
  private set(dest: string, choice: PdfChoice, phase: ExportPhase) {
    this.job = { dest, phase, choice, errors: 0, reason: null, canForce: false };
    this.show(dest);
    this.tell(dest, phase);
  }

  private fail(dest: string, choice: PdfChoice, errors: number, reason: string | null, canForce: boolean) {
    this.job = { dest, phase: "failed", choice, errors, reason, canForce };
    // Shown even if the window was closed meanwhile: nothing was exported, and it must be known.
    this.show(dest);
    this.tell(dest, "failed");
  }

  private done(dest: string, kind: "success" | "warning", message: string) {
    this.job = null;
    this.tell(dest, "done", { result: message, warning: kind === "warning" });
    // Said in the main window too: the other one may have been closed.
    ui.toast(kind, message, { action: { label: t("export.show"), run: () => void ipc.revealInOs(dest) } });
  }

  /** Opens the window of the export (or brings it back). A new one says when it listens. */
  private show(dest: string) {
    this.report = null;
    this.opening = (async () => {
      if (!(await ipc.exportWindowShown().catch(() => false))) this.windowReady = false;
      await ipc.exportWindowOpen(t("pdfExport.windowTitle", { file: basename(dest) })).catch(() => {});
    })();
  }

  /** Resolves once the window of the export listens (or after a moment: the export does not depend on it). */
  private async ready() {
    await this.opening;
    for (let i = 0; i < 60 && !this.windowReady; i++) await new Promise((r) => setTimeout(r, 50));
  }

  /** Tells the window of the export where the export stands. */
  private tell(dest: string, phase: ExportWindowPhase, end: { result: string; warning: boolean } | null = null) {
    const job = this.job;
    const root = build.outcome?.plan.root ?? build.plan?.root ?? build.target() ?? dest;
    this.last = { dest, phase, end };
    // A build of the project under way: what it did before the window could hear it.
    const seed = phase === "building" && build.running ? { steps: $state.snapshot(build.tracker.history), pages: build.tracker.pages, lines: build.output.slice(-200).map((l) => l.text) } : null;
    this.said = {
      dest,
      base: dirname(root),
      phase,
      lighter: job ? job.choice.kind !== "original" : false,
      errors: job?.errors ?? 0,
      reason: job?.reason ?? null,
      canForce: job?.canForce ?? false,
      reference: build.reference,
      seed,
      result: end?.result ?? null,
      warning: end?.warning ?? false,
      lang: i18n.lang === "fr" ? "fr" : "en",
      theme: app.theme,
    };
    void ipc.tell(EXPORT_LABEL, "export-window:state", this.said).catch(() => {});
  }

  private write(dest: string, choice: PdfChoice, run: number, withErrors: boolean) {
    return choice.kind === "original" ? this.copy(dest, run, withErrors) : this.lighter(dest, choice, run);
  }

  private async copy(dest: string, run: number, withErrors: boolean) {
    const pdf = viewer.pdf ?? build.outcome?.pdf ?? null;
    if (!pdf) return this.fail(dest, ORIGINAL, 0, t("pdfExport.noPdf"), false);
    // A PDF that is up to date is copied at once, without a window; one that was just built has its window already.
    const shown = this.job !== null;
    this.job = { dest, phase: "copying", choice: ORIGINAL, errors: 0, reason: null, canForce: false };
    if (shown) this.tell(dest, "copying");
    // A build started meanwhile (live compilation) is waited for: the engine refuses to copy what it is writing.
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await ipc.exportFile(pdf, dest);
        if (run !== this.run) return;
        return this.done(dest, withErrors ? "warning" : "success", t(withErrors ? "pdfExport.doneWithErrors" : "viewer.exported", { file: basename(dest) }));
      } catch (e) {
        if (run !== this.run) return;
        const said = String(e);
        if (said.includes("building")) {
          this.set(dest, ORIGINAL, "building");
          await build.idle();
          await new Promise((r) => setTimeout(r, 100));
          if (run !== this.run) return;
          this.job = { dest, phase: "copying", choice: ORIGINAL, errors: 0, reason: null, canForce: false };
          this.tell(dest, "copying");
          continue;
        }
        return this.fail(dest, ORIGINAL, 0, said.includes("incomplete") ? t("pdfExport.incomplete") : said, false);
      }
    }
    this.fail(dest, ORIGINAL, 0, t("pdfExport.busy"), false);
  }

  /** What the engine and the window of the export say, heard once for all. */
  private async listen() {
    if (this.listening) return;
    this.listening = true;
    // The pictures are done once the compiler starts: the phase follows.
    await ipc.on("export:step", () => {
      if (this.job?.phase !== "pictures") return;
      this.job.phase = "lighter";
      this.tell(this.job.dest, "lighter");
    });
    await ipc.on("export-window:ready", () => {
      this.windowReady = true;
      if (this.last) this.tell(this.last.dest, this.last.phase, this.last.end);
    });
    await ipc.on("export-window:report", (shown) => (this.report = shown));
    await ipc.on("export-window:command", (command) => {
      if (command === "cancel") this.cancel();
      else if (command === "force") void this.force();
      else if (command === "reveal" && this.said) void ipc.revealInOs(this.said.dest);
      else if (command === "problems") {
        ui.showBottom("problems");
        void getCurrentWindow().setFocus().catch(() => {});
      }
    });
  }

  /** The document built again with lighter pictures, in a copy of the project, and written at `dest`. */
  private async lighter(dest: string, choice: Exclude<PdfChoice, { kind: "original" }>, run: number) {
    const target = build.target();
    if (!target) return this.fail(dest, choice, 0, t("pdfExport.noPdf"), false);
    const current = () => run === this.run;
    this.set(dest, choice, "pictures");
    await this.ready();
    if (!current()) return;
    const lang = i18n.lang === "fr" ? "fr" : "en";
    try {
      let step = choice.kind === "step" ? choice.step : STEP_LIGHT;
      if (choice.kind === "limit") {
        // The lightest touch that should do: the engine goes further if the PDF is still over.
        const weights = await ipc.pdfWeights(target);
        if (!current()) return;
        if (weights) step = stepFor(weights, choice.bytes).step;
      }
      const made = await ipc.exportPdfLighter(target, dest, step, choice.kind === "limit" ? choice.bytes : null);
      if (!current()) return;
      const told = { file: basename(dest), size: sizeLabel(made.size, lang) };
      if (made.within) this.done(dest, "success", t("pdfExport.doneSize", told));
      else this.done(dest, "warning", t("pdfExport.doneOver", { ...told, limit: sizeLabel(choice.kind === "limit" ? choice.bytes : 0, lang) }));
    } catch (e) {
      if (!current()) return;
      const said = String(e);
      if (said.includes("cancelled")) return this.close();
      const why = said.startsWith("build:") ? said.slice(6).trim() || t("pdfExport.noOutput") : said;
      this.fail(dest, choice, 0, why, false);
    }
  }
}

export const pdfExport = new PdfExportStore();
