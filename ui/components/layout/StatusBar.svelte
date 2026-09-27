<script lang="ts">
  // Bottom status bar: TeX installation, build, problems, cursor, words.
  import { t } from "$lib/i18n.svelte";
  import { app } from "$lib/state/app.svelte";
  import { build } from "$lib/state/build.svelte";
  import { diagnostics } from "$lib/state/diagnostics.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { distLabel, tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "../common/Icon.svelte";

  const counts = $derived(diagnostics.counts);
  const dist = $derived(tex.active);
  const running = $derived(tex.jobs.find((j) => j.running));
  const e = $derived(app.settings?.editor);
</script>

<footer class="status">
  <button class="item" onclick={() => ui.openOverlay("setup")} title={t("status.texTitle")}>
    {#if tex.status?.detecting}
      <span class="spinner"></span>{t("status.detecting")}
    {:else if tex.missing}
      <Icon name="alert-triangle" size={13} /><span class="warn">{t("status.noTex")}</span>
    {:else if dist}
      <Icon name="cpu" size={13} />{distLabel(dist)}
      {#if tex.status?.indexing}<span class="faint">· {t("status.indexing")}</span>{/if}
    {/if}
  </button>

  {#if running}
    <button class="item" onclick={() => ui.showBottom("jobs")}><span class="spinner"></span>{running.title}</button>
  {/if}

  {#if project.info}
    <button class="item" onclick={() => ui.showBottom("problems")} title={t("status.problems")}>
      <Icon name="alert-circle" size={13} /><span class:err={counts.errors}>{counts.errors}</span>
      <Icon name="alert-triangle" size={13} /><span class:warn={counts.warnings}>{counts.warnings}</span>
      {#if counts.infos}<Icon name="info" size={13} /><span>{counts.infos}</span>{/if}
    </button>
    {#if build.running}
      <button class="item" onclick={() => ui.showBottom("output")}>
        <span class="spinner"></span>{build.plan?.engine ?? ""} · {build.step ?? t("toolbar.building")}
      </button>
    {/if}
  {/if}

  <div class="spacer"></div>

  {#if editor.activeTab && editor.activeTab.kind !== "image" && editor.activeTab.kind !== "pdf"}
    {#if editor.activeTab.readOnly}<span class="item static"><Icon name="eye" size={13} />{t("status.readOnly")}</span>{/if}
    {#if e?.vimMode}<span class="item static mono">VIM</span>{/if}
    <span class="item static">
      {t("status.cursor", { line: editor.cursor.line, col: editor.cursor.col })}
      {#if editor.cursor.selections > 1}· {t("status.cursors", { n: editor.cursor.selections })}{:else if editor.cursor.selected}· {t("status.selected", { n: editor.cursor.selected })}{/if}
    </span>
    {#if editor.words && editor.activeTab.kind === "tex"}
      <span class="item static" title={t("status.wordsTitle", { file: editor.words.file, project: editor.words.project })}>
        {t("status.words", { n: editor.words.project.toLocaleString() })}
      </span>
    {/if}
    <button class="item" onclick={() => ui.openSettings("editor")}>{e?.useTabs ? t("status.tabs") : t("status.spaces", { n: e?.tabSize ?? 2 })}</button>
    <span class="item static">UTF-8</span>
  {/if}
  {#if build.outcome?.plan.engine}
    <button class="item" onclick={() => ui.openSettings("build")} title={build.outcome.plan.engineReason}>{build.outcome.plan.engine}</button>
  {/if}
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    background: var(--bg);
    border-top: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--text-muted);
    overflow: hidden;
    white-space: nowrap;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 7px;
    border: none;
    border-radius: 4px;
    background: none;
    font-size: 11.5px;
    color: inherit;
    cursor: pointer;
  }
  button.item:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .item.static {
    cursor: default;
  }
  .spinner {
    width: 11px;
    height: 11px;
    border-width: 1.5px;
  }
  .err {
    color: var(--error);
    font-weight: 600;
  }
  .warn {
    color: var(--warning);
    font-weight: 600;
  }
</style>
