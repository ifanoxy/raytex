// Exporting the PDF. The document is compiled first when its PDF is not
// that of the text as it is; the file is never copied while the engine
// writes it; and a small window tells where the build stands. That window
// can be closed: the export goes on, and says when it is done.
//
// With lighter pictures, the document is built once more, in a copy of the
// project kept apart: the same window follows that build.

import { sizeLabel } from "../history";
import { i18n, t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { type PdfChoice, STEP_LIGHT, stepFor } from "../pdfweight";
import { basename } from "../utils";
import { build } from "./build.svelte";
import { editor } from "./editor.svelte";
import { BuildTracker } from "./tracker.svelte";
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
  /** Its window is shown. */
  open = $state(false);
  /** The build of a lighter PDF, followed apart from the builds of the project. */
  readonly tracker = new BuildTracker();
  /** Pictures written lighter so far. */
  pictures = $state<{ done: number; total: number } | null>(null);
  /** Changes with each export: one that was given up says nothing at its end. */
  private run = 0;
  private listening = false;

  /** Exports the PDF of the document to `dest`, as it is or with lighter pictures. */
  async start(dest: string, choice: PdfChoice = ORIGINAL) {
    if (this.job && this.job.phase !== "failed") return;
    const run = ++this.run;
    const current = () => run === this.run;
    this.job = null;
    this.open = false;
    // What is typed is part of the document.
    await editor.saveAll({ auto: true, silent: true });
    await editor.flush();
    const target = build.target();
    const fresh = !target || (!build.running && (await ipc.pdfFresh(target).catch(() => false)));
    if (!current()) return;
    if (!fresh) {
      this.set(dest, choice, "building");
      // Its own window tells how this build goes and ends: it is asked for quietly.
      const asked = build.running ? (await build.idle(), true) : await build.runToEnd({ auto: true });
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

  /** Closes the window: an export under way goes on, one that failed is forgotten. */
  hide() {
    if (this.job?.phase === "failed") this.close();
    else this.open = false;
  }

  private close() {
    this.run++;
    this.job = null;
    this.open = false;
  }

  private set(dest: string, choice: PdfChoice, phase: ExportPhase) {
    this.job = { dest, phase, choice, errors: 0, reason: null, canForce: false };
    this.open = true;
  }

  private fail(dest: string, choice: PdfChoice, errors: number, reason: string | null, canForce: boolean) {
    this.job = { dest, phase: "failed", choice, errors, reason, canForce };
    this.open = true;
  }

  private done(dest: string, kind: "success" | "warning", message: string) {
    this.job = null;
    this.open = false;
    ui.toast(kind, message, { action: { label: t("export.show"), run: () => void ipc.revealInOs(dest) } });
  }

  private write(dest: string, choice: PdfChoice, run: number, withErrors: boolean) {
    return choice.kind === "original" ? this.copy(dest, run, withErrors) : this.lighter(dest, choice, run);
  }

  private async copy(dest: string, run: number, withErrors: boolean) {
    const pdf = viewer.pdf ?? build.outcome?.pdf ?? null;
    if (!pdf) return this.fail(dest, ORIGINAL, 0, t("pdfExport.noPdf"), false);
    this.job = { dest, phase: "copying", choice: ORIGINAL, errors: 0, reason: null, canForce: false };
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
          continue;
        }
        return this.fail(dest, ORIGINAL, 0, said.includes("incomplete") ? t("pdfExport.incomplete") : said, false);
      }
    }
    this.fail(dest, ORIGINAL, 0, t("pdfExport.busy"), false);
  }

  /** The events of the build of a lighter PDF, heard once for all. */
  private async listen() {
    if (this.listening) return;
    this.listening = true;
    await ipc.on("export:pictures", (told) => (this.pictures = told));
    await ipc.on("export:step", ({ name }) => {
      if (this.job?.phase === "pictures") this.job.phase = "lighter";
      this.tracker.stepStarted(name);
    });
    await ipc.on("export:output", ({ lines }) => this.tracker.output(lines));
  }

  /** The document built again with lighter pictures, in a copy of the project, and written at `dest`. */
  private async lighter(dest: string, choice: Exclude<PdfChoice, { kind: "original" }>, run: number) {
    const target = build.target();
    if (!target) return this.fail(dest, choice, 0, t("pdfExport.noPdf"), false);
    const current = () => run === this.run;
    await this.listen();
    this.pictures = null;
    this.tracker.start(build.reference);
    this.set(dest, choice, "pictures");
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
