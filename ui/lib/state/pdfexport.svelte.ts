// Exporting the PDF. The document is compiled first when its PDF is not
// that of the text as it is; the file is never copied while the engine
// writes it; and a small window tells where the build stands. That window
// can be closed: the export goes on, and says when it is done.

import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { basename } from "../utils";
import { build } from "./build.svelte";
import { editor } from "./editor.svelte";
import { ui } from "./ui.svelte";
import { viewer } from "./viewer.svelte";

/** `failed`: the build did not make a PDF to export, or made it with errors. */
export type ExportPhase = "building" | "copying" | "failed";

export interface ExportJob {
  dest: string;
  phase: ExportPhase;
  /** Errors of the build that stopped the export. */
  errors: number;
  /** Why nothing was exported, when it is not the errors of the build. */
  reason: string | null;
  /** A PDF is there all the same: it can be exported as it is. */
  canForce: boolean;
}

class PdfExportStore {
  /** The export under way; null when there is none. */
  job = $state<ExportJob | null>(null);
  /** Its window is shown. */
  open = $state(false);
  /** Changes with each export: one that was given up says nothing at its end. */
  private run = 0;

  /** Exports the PDF of the document to `dest`. */
  async start(dest: string) {
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
      this.job = { dest, phase: "building", errors: 0, reason: null, canForce: false };
      this.open = true;
      // Its own window tells how this build goes and ends: it is asked for quietly.
      const asked = build.running ? (await build.idle(), true) : await build.runToEnd({ auto: true });
      if (!current()) return;
      const outcome = build.outcome;
      const errors = outcome?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
      if (!asked || build.error || !outcome || outcome.cancelled || !outcome.success || errors) {
        // Nothing is said of a build the user stopped: the window just goes.
        if (outcome?.cancelled && !build.error) return this.close();
        this.fail(dest, errors, build.error?.message ?? null, !!outcome?.pdf);
        return;
      }
    }
    await this.copy(dest, run, false);
  }

  /** Exports the PDF as the build left it, errors and all. */
  async force() {
    const job = this.job;
    if (!job || job.phase !== "failed" || !job.canForce) return;
    await this.copy(job.dest, this.run, true);
  }

  /** Gives the export up; a build it is waiting for is stopped too. */
  cancel() {
    const building = this.job?.phase === "building";
    this.close();
    if (building && build.running) void build.cancel();
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

  private fail(dest: string, errors: number, reason: string | null, canForce: boolean) {
    this.job = { dest, phase: "failed", errors, reason, canForce };
    this.open = true;
  }

  private async copy(dest: string, run: number, withErrors: boolean) {
    const pdf = viewer.pdf ?? build.outcome?.pdf ?? null;
    if (!pdf) return this.fail(dest, 0, t("pdfExport.noPdf"), false);
    this.job = { dest, phase: "copying", errors: 0, reason: null, canForce: false };
    // A build started meanwhile (live compilation) is waited for: the engine refuses to copy what it is writing.
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await ipc.exportFile(pdf, dest);
        if (run !== this.run) return;
        this.job = null;
        this.open = false;
        ui.toast(withErrors ? "warning" : "success", t(withErrors ? "pdfExport.doneWithErrors" : "viewer.exported", { file: basename(dest) }), {
          action: { label: t("export.show"), run: () => void ipc.revealInOs(dest) },
        });
        return;
      } catch (e) {
        if (run !== this.run) return;
        const said = String(e);
        if (said.includes("building")) {
          this.job = { dest, phase: "building", errors: 0, reason: null, canForce: false };
          this.open = true;
          await build.idle();
          await new Promise((r) => setTimeout(r, 100));
          if (run !== this.run) return;
          continue;
        }
        return this.fail(dest, 0, said.includes("incomplete") ? t("pdfExport.incomplete") : said, false);
      }
    }
    this.fail(dest, 0, t("pdfExport.busy"), false);
  }
}

export const pdfExport = new PdfExportStore();
