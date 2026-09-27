<script lang="ts">
  // Bottom panel: problems, compiler output and installation jobs.
  import { t } from "$lib/i18n.svelte";
  import { build } from "$lib/state/build.svelte";
  import { diagnostics } from "$lib/state/diagnostics.svelte";
  import { tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "../common/Icon.svelte";
  import Jobs from "./Jobs.svelte";
  import Output from "./Output.svelte";
  import Problems from "./Problems.svelte";

  const counts = $derived(diagnostics.counts);
  const runningJobs = $derived(tex.jobs.filter((j) => j.running).length);
</script>

<div class="panel">
  <div class="tabs" role="tablist">
    <button class="tab" class:active={ui.bottomTab === "problems"} role="tab" aria-selected={ui.bottomTab === "problems"} onclick={() => (ui.bottomTab = "problems")}>
      {t("panel.problems")}
      {#if counts.errors}<span class="badge error">{counts.errors}</span>{/if}
      {#if counts.warnings}<span class="badge warning">{counts.warnings}</span>{/if}
    </button>
    <button class="tab" class:active={ui.bottomTab === "output"} role="tab" aria-selected={ui.bottomTab === "output"} onclick={() => (ui.bottomTab = "output")}>
      {t("panel.output")}
      {#if build.running}<span class="spinner"></span>{/if}
    </button>
    <button class="tab" class:active={ui.bottomTab === "jobs"} role="tab" aria-selected={ui.bottomTab === "jobs"} onclick={() => (ui.bottomTab = "jobs")}>
      {t("panel.jobs")}
      {#if runningJobs}<span class="spinner"></span>{:else if tex.jobs.length}<span class="badge">{tex.jobs.length}</span>{/if}
    </button>
    <div class="spacer"></div>
    <button class="icon-btn" title={t("panel.hide")} onclick={() => ui.toggleBottom()}><Icon name="chevron-down" /></button>
  </div>
  <div class="content">
    {#if ui.bottomTab === "problems"}
      <Problems />
    {:else if ui.bottomTab === "output"}
      <Output />
    {:else}
      <Jobs />
    {/if}
  </div>
</div>

<style>
  .panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 34px;
    padding: 0 6px 0 8px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
    cursor: pointer;
  }
  .tab:hover {
    color: var(--text-muted);
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .spinner {
    width: 11px;
    height: 11px;
    border-width: 1.5px;
  }
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
