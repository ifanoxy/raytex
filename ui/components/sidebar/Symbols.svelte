<script lang="ts">
  // Symbol palette: click to insert (wrapped in $…$ outside math).
  import { findFormula } from "$lib/editor/math-preview";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { editor } from "$lib/state/editor.svelte";
  import type { SymbolCategory } from "$lib/types";
  import PanelHeader from "../common/PanelHeader.svelte";

  let categories = $state<SymbolCategory[]>([]);
  let filter = $state("");
  let category = $state<string>("all");

  $effect(() => {
    void ipc.symbolPalette().then((c) => (categories = c));
  });

  const q = $derived(filter.trim().toLowerCase().replace(/^\\/, ""));
  const shown = $derived(
    categories
      .filter((c) => category === "all" || c.id === category)
      .map((c) => ({ ...c, symbols: c.symbols.filter((s) => !q || s.command.toLowerCase().includes(q)) }))
      .filter((c) => c.symbols.length),
  );

  async function insert(s: SymbolCategory["symbols"][number]) {
    const view = editor.view;
    if (!view || editor.activeTab?.kind !== "tex" || view.state.readOnly) return;
    const pos = view.state.selection.main.head;
    const inMath = !!findFormula(view.state.doc, pos);
    const next = view.state.sliceDoc(pos, pos + 1);
    const cmd = s.command + (/[a-zA-Z]$/.test(s.command) && /[a-zA-Z]/.test(next) ? " " : "");
    editor.insertText(s.math && !inMath ? `$${cmd}$` : cmd);
    if (s.package) await editor.addPackage(s.package);
  }
</script>

<PanelHeader title={t("sidebar.symbols")} />

<div class="controls">
  <input class="input small" placeholder={t("symbols.filter")} bind:value={filter} spellcheck="false" />
  <select class="select input small" bind:value={category} aria-label={t("symbols.category")}>
    <option value="all">{t("symbols.all")}</option>
    {#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
  </select>
</div>

<div class="list">
  {#each shown as c (c.id)}
    <div class="section-title cat">{c.name}</div>
    <div class="grid">
      {#each c.symbols as s (s.command)}
        <button class="sym" title="{s.command}{s.package ? ` — ${s.package}` : ''}" onclick={() => insert(s)}>
          <span class="glyph">{s.glyph}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="empty">{categories.length ? t("symbols.none") : ""}</div>
  {/each}
</div>
<div class="tip faint">{t("symbols.tip")}</div>

<style>
  .controls {
    display: flex;
    gap: 6px;
    padding: 0 10px 8px;
  }
  .controls .input {
    flex: 1;
    min-width: 0;
  }
  .controls .select {
    flex: 0 1 120px;
  }
  .list {
    flex: 1;
    overflow: auto;
    padding: 0 10px 10px;
  }
  .cat {
    margin: 10px 2px 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
    gap: 3px;
  }
  .sym {
    height: 36px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .sym:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .glyph {
    font-family: "STIX Two Math", "Cambria Math", "Latin Modern Math", serif;
    font-size: 18px;
    line-height: 1;
  }
  .tip {
    padding: 8px 12px;
    font-size: 11px;
    border-top: 1px solid var(--border);
  }
</style>
