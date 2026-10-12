<script lang="ts">
  // The small window of an export of the PDF, over the rest and out of the
  // way: what the compiler is doing, how far it is, about how long is left.
  // It goes by itself when the PDF is written, and can be closed before:
  // the export goes on.
  import { roundedRemaining } from "$lib/buildprogress";
  import { plural, t } from "$lib/i18n.svelte";
  import { build } from "$lib/state/build.svelte";
  import { pdfExport } from "$lib/state/pdfexport.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { basename } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  const job = $derived(pdfExport.job);
  const tracker = build.tracker;
  const building = $derived(job?.phase === "building");

  // The clock of the window: it only runs while there is a build to follow.
  let now = $state(Date.now());
  $effect(() => {
    if (!pdfExport.open || !building) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(timer);
  });

  const progress = $derived(building && build.running ? tracker.progress(now) : { fraction: null, remainingMs: null });
  const step = $derived(job?.phase === "copying" ? t("pdfExport.copying") : build.running ? (tracker.step ?? t("pdfExport.starting")) : t("pdfExport.starting"));
  const page = $derived.by(() => {
    if (!building || !build.running || !tracker.pages) return "";
    const total = tracker.reference?.pages ?? 0;
    return total >= tracker.pages ? t("pdfExport.pageOf", { n: tracker.pages, total }) : t("pdfExport.page", { n: tracker.pages });
  });
  const left = $derived.by(() => {
    if (!building || !build.running) return "";
    if (progress.remainingMs !== null) {
      const { n, unit } = roundedRemaining(progress.remainingMs);
      return t(unit === "s" ? "pdfExport.leftSeconds" : "pdfExport.leftMinutes", { n });
    }
    if (progress.fraction !== null) return t("pdfExport.almost");
    // Nothing to compare with (the first build): the time it has taken so far.
    return `${Math.max(0, Math.round((now - tracker.startedAt) / 1000))} s`;
  });

  function problems() {
    ui.showBottom("problems");
    pdfExport.hide();
  }
</script>

{#if job && pdfExport.open}
  <div class="export-progress" class:failed={job.phase === "failed"} role="status" aria-live="polite">
    <header>
      <Icon name={job.phase === "failed" ? "alert-circle" : "download"} size={15} />
      <strong>{t("pdfExport.title")}</strong>
      <span class="file ellipsis faint" title={job.dest}>{basename(job.dest)}</span>
      <button class="icon-btn" title={job.phase === "failed" ? t("common.close") : t("pdfExport.hide")} aria-label={t("common.close")} onclick={() => pdfExport.hide()}>
        <Icon name="x" size={14} />
      </button>
    </header>

    {#if job.phase === "failed"}
      <p class="why">
        {job.reason ?? (job.errors ? plural(job.errors, "pdfExport.errorOne", "pdfExport.errorMany") : t("pdfExport.noOutput"))}
        <span class="faint">{t("pdfExport.notExported")}</span>
      </p>
      <div class="buttons">
        {#if job.errors}<button class="btn small" onclick={problems}>{t("build.showProblems")}</button>{/if}
        {#if job.canForce}<button class="btn small" onclick={() => pdfExport.force()}>{t("pdfExport.force")}</button>{/if}
      </div>
    {:else}
      <div class="where">
        <span class="step ellipsis">{step}</span>
        {#if page}<span class="page faint">{page}</span>{/if}
        <span class="spacer"></span>
        <span class="left faint">{left}</span>
      </div>
      <div class="bar" class:unknown={progress.fraction === null} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress.fraction === null ? undefined : Math.round(progress.fraction * 100)}>
        <div class="fill" style:width={progress.fraction === null ? undefined : `${Math.round(progress.fraction * 1000) / 10}%`}></div>
      </div>
      <div class="foot">
        <span class="last mono ellipsis faint" title={tracker.lastLine}>{building && build.running ? tracker.lastLine : ""}</span>
        <button class="btn small" onclick={() => pdfExport.cancel()}>{t("common.cancel")}</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .export-progress {
    position: fixed;
    top: calc(var(--toolbar-height) + 12px);
    right: 14px;
    z-index: 940;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(390px, calc(100vw - 28px));
    padding: 10px 12px 11px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
    animation: drop 0.16s var(--ease);
  }
  @keyframes drop {
    from {
      transform: translateY(-8px);
      opacity: 0;
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent);
  }
  .failed header {
    color: var(--error);
  }
  header strong {
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
  }
  .file {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }
  header .icon-btn {
    width: 24px;
    height: 24px;
    margin: -2px -4px -2px 0;
  }
  .where {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12.5px;
    white-space: nowrap;
  }
  .step {
    min-width: 0;
    font-weight: 600;
  }
  .page,
  .left {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--bg-hover);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 0.25s linear;
  }
  /* Nothing tells how far the build is: the bar only says that it runs. */
  .bar.unknown .fill {
    width: 34%;
    animation: slide 1.3s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(300%);
    }
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .last {
    flex: 1;
    min-width: 0;
    font-size: 10.5px;
  }
  .why {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .why .faint {
    font-size: 12px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  @media (prefers-reduced-motion: reduce) {
    .export-progress,
    .bar.unknown .fill {
      animation: none;
    }
  }
</style>
