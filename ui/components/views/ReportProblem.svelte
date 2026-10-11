<script lang="ts">
  // Reporting a problem: a report the user reads, copies and pastes where
  // they choose (an issue on GitHub). Nothing is sent from here.
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { ISSUES_URL, problemReport, type ReportData } from "$lib/report";
  import { app } from "$lib/state/app.svelte";
  import { build } from "$lib/state/build.svelte";
  import { project } from "$lib/state/project.svelte";
  import { distLabel, tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  let description = $state("");
  let problems = $state(true);
  /** Off unless asked: what the build printed may quote lines of the document. */
  let output = $state(false);

  /** What is known here, read once when the window opens. */
  const gathered: Omit<ReportData, "description"> = {
    app: app.info ? { version: app.info.version, os: app.info.os, arch: app.info.arch } : null,
    tex: tex.active ? { label: distLabel(tex.active), kind: tex.active.kind } : null,
    settings: app.settings
      ? {
          engine: app.settings.build.engine,
          tool: app.settings.build.tool,
          autoBuild: app.settings.build.autoBuild,
          miktexAutoInstall: app.settings.build.miktexAutoInstall,
          shellEscape: app.settings.build.shellEscape,
        }
      : null,
    build: build.outcome
      ? {
          engine: build.outcome.engine,
          success: build.outcome.success,
          cancelled: build.outcome.cancelled,
          durationMs: build.outcome.durationMs,
          steps: build.outcome.steps.map((s) => s.name),
          problems: build.outcome.diagnostics.filter((d) => d.severity === "error" || d.severity === "warning").map((d) => ({ severity: d.severity, code: d.code, message: d.message, file: d.file, line: d.line })),
        }
      : null,
    output: build.output.map((l) => l.text),
    projectRoot: project.info?.root ?? null,
  };

  const report = $derived(problemReport({ ...gathered, description }, { problems, output }));
  const hasProblems = !!gathered.build?.problems.length;
  const hasOutput = gathered.output.length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      ui.toast("success", t("report.copied"));
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  /** Copies the report, then opens the page where an issue is written: the report is pasted there. */
  async function openIssue() {
    await copy();
    void ipc.openUrl(ISSUES_URL);
  }
</script>

<Modal title={t("report.title")} icon="alert-circle" width="min(760px, 94vw)" height="min(700px, 92vh)">
  <div class="report report-window">
    <p class="promise"><Icon name="check" size={14} />{t("report.nothingSent")}</p>

    <label class="field">
      <span>{t("report.what")}</span>
      <textarea class="input" rows="3" bind:value={description} placeholder={t("report.whatPlaceholder")}></textarea>
    </label>

    <div class="options">
      <label class="check" class:off={!hasProblems}>
        <input type="checkbox" bind:checked={problems} disabled={!hasProblems} />
        <span>{t("report.problems")}</span>
      </label>
      <label class="check" class:off={!hasOutput}>
        <input type="checkbox" bind:checked={output} disabled={!hasOutput} />
        <span>{t("report.output")}<span class="hint faint">{t("report.outputHint")}</span></span>
      </label>
    </div>

    <div class="preview">
      <header>{t("report.preview")}</header>
      <pre class="selectable">{report}</pre>
    </div>

    <div class="buttons">
      <button class="btn" onclick={() => ui.closeOverlay()}>{t("common.close")}</button>
      <span class="spacer"></span>
      <button class="btn" onclick={copy}><Icon name="copy" size={14} />{t("report.copy")}</button>
      <button class="btn primary" onclick={openIssue}><Icon name="external" size={14} />{t("report.open")}</button>
    </div>
  </div>
</Modal>

<style>
  .report {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    padding: 16px 18px 14px;
  }
  .promise {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .promise :global(svg) {
    color: var(--success);
    flex-shrink: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  textarea.input {
    width: 100%;
    height: auto;
    min-height: 62px;
    padding-top: 7px;
    padding-bottom: 7px;
    resize: vertical;
    line-height: 1.5;
    font-family: inherit;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
    flex-shrink: 0;
  }
  .check {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .check.off {
    opacity: 0.5;
    cursor: default;
  }
  .check input {
    position: relative;
    top: 2px;
  }
  .hint {
    margin-left: 6px;
    font-size: 11.5px;
  }
  .preview {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    overflow: hidden;
  }
  .preview header {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-faint);
    flex-shrink: 0;
  }
  pre {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--text);
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .spacer {
    flex: 1;
  }
</style>
