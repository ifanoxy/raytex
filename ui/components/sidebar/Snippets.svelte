<script lang="ts">
  // @ shortcuts (first: the fastest way to type symbols), snippets (built
  // in) and personal macros.
  import { keyFor } from "$lib/actions";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { app } from "$lib/state/app.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { SnippetView } from "$lib/types";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import MathGlyph from "../common/MathGlyph.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  let snippets = $state<SnippetView[]>([]);
  let shortcuts = $state<[string, string][]>([]);
  let filter = $state("");
  let tab = $state<"snippets" | "macros" | "shortcuts">("shortcuts");

  $effect(() => {
    void ipc.builtinSnippets().then((s) => (snippets = s));
    void ipc.atShortcuts().then((s) => (shortcuts = s));
  });

  const q = $derived(filter.trim().toLowerCase());
  const shownSnippets = $derived(snippets.filter((s) => !q || `${s.trigger} ${s.name}`.toLowerCase().includes(q)));
  const macros = $derived((app.settings?.macros ?? []).filter((m) => !q || `${m.trigger} ${m.name}`.toLowerCase().includes(q)));
  const shownShortcuts = $derived(shortcuts.filter(([k, v]) => !q || `${k} ${v}`.toLowerCase().includes(q)));

  async function insert(body: string, pkg?: string | null) {
    if (editor.insertSnippet(body) && pkg) await editor.addPackage(pkg);
  }
</script>

<PanelHeader title={t("sidebar.snippets")}>
  <button class="icon-btn" title={t("snippets.editMacros")} onclick={() => ui.openSettings("macros")}><Icon name="edit" /></button>
</PanelHeader>

<div class="tabs" role="tablist">
  <button class="tab" class:active={tab === "shortcuts"} onclick={() => (tab = "shortcuts")}>{t("snippets.tabShortcuts")}</button>
  <button class="tab" class:active={tab === "snippets"} onclick={() => (tab = "snippets")}>{t("snippets.tabSnippets")}</button>
  <button class="tab" class:active={tab === "macros"} onclick={() => (tab = "macros")}>{t("snippets.tabMacros")}</button>
</div>

<div class="filter"><input class="input small" placeholder={t("snippets.filter")} bind:value={filter} spellcheck="false" /></div>

<div class="list">
  {#if tab === "snippets"}
    <p class="tip faint">{t("snippets.tip")}</p>
    {#each shownSnippets as s (s.trigger)}
      <button class="row" onclick={() => insert(s.body, s.package)} title={s.body}>
        <span class="trigger mono">{s.trigger}</span>
        <span class="name ellipsis">{s.name}</span>
        {#if s.math}<span class="badge">math</span>{/if}
      </button>
    {/each}
  {:else if tab === "macros"}
    <p class="tip faint">{t("snippets.macrosTip")}</p>
    {#each macros as m, i (i)}
      <button class="row" onclick={() => insert(m.body)} title={m.body}>
        <span class="trigger mono">{m.trigger || "—"}</span>
        <span class="name ellipsis">{m.name}</span>
        {#if m.key}<kbd>{prettyKey(m.key)}</kbd>{/if}
      </button>
    {:else}
      <div class="empty">
        {t("snippets.noMacros")}
        <button class="btn small" onclick={() => ui.openSettings("macros")}><Icon name="plus" size={13} />{t("snippets.addMacro")}</button>
      </div>
    {/each}
  {:else}
    <div class="intro">
      <strong>{t("snippets.shortcutsTitle")}</strong>
      <p>{t("snippets.shortcutsTip")}</p>
    </div>
    <div class="at-grid">
      {#each shownShortcuts as [key, cmd] (key)}
        <button class="at-item" onclick={() => editor.insertMath(cmd)} title={cmd}>
          <span class="at-key mono">@{key}</span>
          <MathGlyph latex={cmd} />
        </button>
      {/each}
    </div>
  {/if}
</div>
<div class="foot faint">{t("snippets.foot", { key: prettyKey(keyFor("view.palette") ?? "") })}</div>

<style>
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    padding: 6px 7px 7px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .filter {
    padding: 8px 10px 2px;
  }
  .filter .input {
    width: 100%;
  }
  .list {
    flex: 1;
    overflow: auto;
    padding: 0 6px 10px;
  }
  .tip {
    margin: 6px 6px 8px;
    font-size: 11px;
    line-height: 1.45;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
  }
  .row:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .intro {
    margin: 8px 4px 10px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
  }
  .intro strong {
    color: var(--accent);
    font-size: 12.5px;
  }
  .intro p {
    margin: 4px 0 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .at-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 5px;
    padding: 0 4px;
  }
  .at-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    cursor: pointer;
  }
  .at-item:hover {
    border-color: var(--accent);
  }
  .at-key {
    font-variant-ligatures: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }
  .trigger {
    min-width: 58px;
    font-size: 11.5px;
    color: var(--accent);
  }
  .name {
    flex: 1;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .foot {
    padding: 8px 12px;
    font-size: 11px;
    border-top: 1px solid var(--border);
  }
</style>
