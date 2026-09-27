<script lang="ts">
  // Installation and update jobs with their live output.
  import { t } from "$lib/i18n.svelte";
  import { tex } from "$lib/state/tex.svelte";
  import Icon from "../common/Icon.svelte";

  let selected = $state<number | null>(null);
  let pre = $state<HTMLElement | null>(null);

  const job = $derived(tex.jobs.find((j) => j.id === selected) ?? tex.jobs[0] ?? null);

  $effect(() => {
    void job?.lines.length;
    if (pre) requestAnimationFrame(() => pre && (pre.scrollTop = pre.scrollHeight));
  });
</script>

{#if tex.jobs.length}
  <div class="jobs">
    <div class="list">
      {#each tex.jobs as j (j.id)}
        <button class="job" class:active={job?.id === j.id} onclick={() => (selected = j.id)}>
          {#if j.running}<span class="spinner"></span>
          {:else if j.success}<span class="ok"><Icon name="check" size={14} /></span>
          {:else}<span class="ko"><Icon name={j.cancelled ? "stop" : "alert-circle"} size={14} /></span>{/if}
          <span class="ellipsis">{j.title}</span>
        </button>
      {/each}
    </div>
    <div class="out">
      {#if job}
        <div class="head">
          <strong class="ellipsis">{job.title}</strong>
          <span class="faint">
            {job.running ? t("jobs.running") : job.success ? t("jobs.succeeded") : job.cancelled ? t("jobs.cancelled") : t("jobs.failed")}
          </span>
          <div class="spacer"></div>
          {#if job.running}<button class="btn small danger" onclick={() => tex.cancel(job.id)}><Icon name="stop" size={11} />{t("common.cancel")}</button>{/if}
        </div>
        <pre class="mono selectable" bind:this={pre}>{job.lines.join("\n")}</pre>
      {/if}
    </div>
  </div>
{:else}
  <div class="empty">{t("jobs.none")}</div>
{/if}

<style>
  .jobs {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .list {
    width: 240px;
    flex-shrink: 0;
    overflow: auto;
    padding: 6px;
    border-right: 1px solid var(--border);
  }
  .job {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .job.active,
  .job:hover {
    background: var(--bg-hover);
  }
  .ok {
    color: var(--success);
  }
  .ko {
    color: var(--error);
  }
  .out {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
  }
  pre {
    flex: 1;
    margin: 0;
    padding: 8px 12px;
    overflow: auto;
    font-size: 12px;
    background: var(--editor-bg);
    color: var(--text-muted);
    white-space: pre-wrap;
  }
</style>
