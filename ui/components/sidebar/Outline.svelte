<script lang="ts">
  // Document structure: sections, labels, bibliography entries and TODOs.
  import { t } from "$lib/i18n.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import type { LabelItem, Location } from "$lib/types";
  import { basename, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  type Tab = "outline" | "labels" | "citations" | "todos";
  let tab = $state<Tab>("outline");
  let filter = $state("");

  const s = $derived(project.structure);
  const q = $derived(filter.trim().toLowerCase());

  const outline = $derived((s?.outline ?? []).filter((o) => !q || o.title.toLowerCase().includes(q)));
  const minLevel = $derived(Math.min(...(s?.outline ?? []).map((o) => o.level), 9));
  const labels = $derived((s?.labels ?? []).filter((l) => !q || l.name.toLowerCase().includes(q) || (l.context ?? "").toLowerCase().includes(q)));
  const citations = $derived(
    (s?.citations ?? []).filter((c) => !q || `${c.key} ${c.authors} ${c.title} ${c.year}`.toLowerCase().includes(q)),
  );
  const todos = $derived((s?.todos ?? []).filter((d) => !q || d.text.toLowerCase().includes(q)));

  /** Section containing the cursor (last heading before it in the active file). */
  const current = $derived.by(() => {
    const active = editor.active;
    const line = editor.cursor.line - 1;
    let found = -1;
    (s?.outline ?? []).forEach((o, i) => {
      if (samePath(o.location.file, active) && o.location.range.start.line <= line) found = i;
    });
    return found >= 0 ? s!.outline[found] : null;
  });

  function go(loc: Location) {
    void editor.openLocation(loc);
  }

  function labelKind(l: LabelItem): string {
    return l.kind.type === "theorem" ? l.kind.name : t(`outline.kind.${l.kind.type}` as never);
  }

  function refCommand(l: LabelItem): string {
    return l.kind.type === "equation" ? "eqref" : "ref";
  }

  const COUNTS = $derived({ outline: s?.outline.length ?? 0, labels: s?.labels.length ?? 0, citations: s?.citations.length ?? 0, todos: s?.todos.length ?? 0 });
</script>

<PanelHeader title={t("sidebar.outline")}>
  <button class="icon-btn" title={t("files.refresh")} onclick={() => project.refreshStructure()}><Icon name="refresh" /></button>
</PanelHeader>

<div class="tabs" role="tablist">
  {#each ["outline", "labels", "citations", "todos"] as const as id}
    <button class="tab" class:active={tab === id} role="tab" aria-selected={tab === id} onclick={() => (tab = id)}>
      {t(`outline.tab.${id}`)}
      {#if COUNTS[id]}<span class="n">{COUNTS[id]}</span>{/if}
    </button>
  {/each}
</div>

<div class="filter">
  <input class="input small" placeholder={t("outline.filter")} bind:value={filter} spellcheck="false" />
</div>

<div class="list">
  {#if !s}
    <div class="empty">{t("outline.none")}</div>
  {:else if tab === "outline"}
    {#each outline as o}
      <button
        class="row"
        class:current={current === o}
        style:padding-left="{10 + (o.level - minLevel) * 13}px"
        title="{basename(o.location.file)}:{o.location.range.start.line + 1}"
        onclick={() => go(o.location)}
      >
        {#if o.number}<span class="num">{o.number}</span>{/if}
        <span class="title ellipsis" class:top={o.level === minLevel}>{o.title || "…"}</span>
      </button>
    {:else}
      <div class="empty">{t("outline.noSections")}</div>
    {/each}
  {:else if tab === "labels"}
    {#each labels as l}
      <div class="item">
        <button class="row" onclick={() => go(l.location)} title="{basename(l.location.file)}:{l.location.range.start.line + 1}">
          <span class="badge">{labelKind(l)}{l.resolved ? ` ${l.resolved.number}` : ""}</span>
          <span class="title mono ellipsis">{l.name}</span>
        </button>
        <button class="icon-btn mini" title={t("outline.insertRef", { cmd: refCommand(l) })} onclick={() => editor.insertText(`\\${refCommand(l)}{${l.name}}`)}>
          <Icon name="link" size={13} />
        </button>
      </div>
      {#if l.context}<div class="context ellipsis">{l.context}</div>{/if}
    {:else}
      <div class="empty">{t("outline.noLabels")}</div>
    {/each}
  {:else if tab === "citations"}
    {#each citations as c}
      <div class="item">
        <button class="row cite" onclick={() => go(c.location)} title={c.title}>
          <span class="title mono ellipsis">{c.key}</span>
          <span class="meta ellipsis">{[c.authors, c.year].filter(Boolean).join(", ")}</span>
          {#if c.title}<span class="meta ellipsis">{c.title}</span>{/if}
        </button>
        <button class="icon-btn mini" title={t("outline.insertCite")} onclick={() => editor.insertText(`\\cite{${c.key}}`)}>
          <Icon name="quote" size={13} />
        </button>
      </div>
    {:else}
      <div class="empty">{t("outline.noCitations")}</div>
    {/each}
  {:else}
    {#each todos as d}
      <button class="row" onclick={() => go(d.location)}>
        <span class="badge todo">{d.tag}</span>
        <span class="title ellipsis">{d.text}</span>
      </button>
    {:else}
      <div class="empty">{t("outline.noTodos")}</div>
    {/each}
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    gap: 0;
    padding: 0 6px;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 5px 7px;
    flex-shrink: 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .n {
    font-size: 10px;
    color: var(--text-faint);
  }
  .filter {
    padding: 8px 10px 4px;
  }
  .filter .input {
    width: 100%;
  }
  .list {
    flex: 1;
    overflow: auto;
    padding: 4px 6px 12px;
  }
  .item {
    display: flex;
    align-items: center;
  }
  .item .row {
    flex: 1;
    min-width: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-height: 26px;
    padding: 3px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    cursor: pointer;
    color: var(--text-muted);
  }
  .row:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .row.current {
    background: var(--accent-soft);
    color: var(--text);
  }
  .row.cite {
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
  }
  .num {
    font-size: 11px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .title.top {
    font-weight: 600;
    color: var(--text);
  }
  .meta {
    font-size: 11px;
    color: var(--text-faint);
    max-width: 100%;
  }
  .context {
    padding: 0 10px 4px 16px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .badge.todo {
    background: color-mix(in srgb, var(--warning) 16%, transparent);
    color: var(--warning);
  }
  .mini {
    width: 24px;
    height: 24px;
    opacity: 0;
  }
  .item:hover .mini {
    opacity: 1;
  }
</style>
