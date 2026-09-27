<script lang="ts">
  // Project-wide search and replace; also shows "find references" results.
  import { t } from "$lib/i18n.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { searchStore as s } from "$lib/state/search.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { debounce, relative } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  let input = $state<HTMLInputElement | null>(null);
  let showReplace = $state(false);
  let collapsed = $state<Set<string>>(new Set());

  const runSoon = debounce(() => void s.run(), 250);

  $effect(() => {
    void s.focusRequest;
    input?.focus();
    input?.select();
  });

  function toggle(file: string) {
    const next = new Set(collapsed);
    if (next.has(file)) next.delete(file);
    else next.add(file);
    collapsed = next;
  }

  /** The line with the match highlighted (trimmed around long lines). */
  function parts(text: string, start: number, end: number) {
    const from = Math.max(0, start - 40);
    const before = (from > 0 ? "…" : "") + text.slice(from, start).trimStart();
    return { before, match: text.slice(start, end), after: text.slice(end, end + 120) };
  }

  async function replaceAll() {
    const n = s.results.length;
    const ok = await ui.confirm({
      title: t("search.replaceAllTitle", { n }),
      message: t("search.replaceAllMessage", { query: s.query, replacement: s.replacement }),
      okLabel: t("search.replaceAll"),
    });
    if (ok) {
      const done = await s.replaceAll();
      ui.toast("success", t("search.replaced", { n: done }));
    }
  }
</script>

<PanelHeader title={s.title ?? t("sidebar.search")}>
  {#if s.title}
    <button class="icon-btn" title={t("search.backToSearch")} onclick={() => { s.title = null; s.results = []; void s.run(); }}><Icon name="x" /></button>
  {/if}
</PanelHeader>

{#if !s.title}
  <div class="form">
    <div class="field">
      <button class="icon-btn toggle" title={t("search.toggleReplace")} onclick={() => (showReplace = !showReplace)}>
        <Icon name={showReplace ? "chevron-down" : "chevron-right"} size={14} />
      </button>
      <div class="inputs">
        <div class="input-wrap">
          <input
            class="input small"
            bind:this={input}
            bind:value={s.query}
            placeholder={t("search.placeholder")}
            spellcheck="false"
            oninput={runSoon}
            onkeydown={(e) => e.key === "Enter" && s.run()}
          />
          <button class="opt" class:on={s.caseSensitive} title={t("search.caseSensitive")} onclick={() => { s.caseSensitive = !s.caseSensitive; void s.run(); }}>Aa</button>
          <button class="opt" class:on={s.regex} title={t("search.regex")} onclick={() => { s.regex = !s.regex; void s.run(); }}>.*</button>
        </div>
        {#if showReplace}
          <div class="input-wrap">
            <input class="input small" bind:value={s.replacement} placeholder={t("search.replacePlaceholder")} spellcheck="false" />
            <button class="opt" title={t("search.replaceAll")} disabled={!s.results.length} onclick={replaceAll}><Icon name="check" size={13} /></button>
          </div>
        {/if}
      </div>
    </div>
    {#if s.error}<div class="error">{s.error}</div>{/if}
  </div>
{/if}

<div class="summary faint">
  {#if s.running}
    <span class="spinner"></span>
  {:else if s.query || s.title}
    {t("search.summary", { n: s.results.length, files: s.grouped.length })}
  {/if}
</div>

<div class="results">
  {#each s.grouped as g (g.file)}
    <button class="file" onclick={() => toggle(g.file)}>
      <Icon name={collapsed.has(g.file) ? "chevron-right" : "chevron-down"} size={13} />
      <span class="ellipsis">{relative(project.info?.root ?? "", g.file)}</span>
      <span class="badge">{g.items.length}</span>
    </button>
    {#if !collapsed.has(g.file)}
      {#each g.items as m}
        {@const range = m.location.range}
        {@const p = parts(m.lineText, range.start.character, range.start.line === range.end.line ? range.end.character : m.lineText.length)}
        <button class="match" onclick={() => editor.openLocation(m.location)} title={String(range.start.line + 1)}>
          <span class="line">{range.start.line + 1}</span>
          <span class="text ellipsis mono">{p.before}<mark>{p.match}</mark>{p.after}</span>
        </button>
      {/each}
    {/if}
  {/each}
</div>

<style>
  .form {
    padding: 0 10px 6px 4px;
  }
  .field {
    display: flex;
    gap: 2px;
    align-items: flex-start;
  }
  .toggle {
    width: 22px;
    height: 26px;
  }
  .inputs {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .input-wrap {
    position: relative;
    display: flex;
  }
  .input-wrap .input {
    flex: 1;
    padding-right: 56px;
  }
  .opt {
    position: absolute;
    top: 3px;
    width: 22px;
    height: 20px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    font-size: 10.5px;
    font-family: var(--font-mono);
    color: var(--text-faint);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .opt:nth-of-type(1) {
    right: 28px;
  }
  .opt:nth-of-type(2),
  .input-wrap .opt:only-of-type {
    right: 4px;
  }
  .opt.on {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .error {
    margin-top: 6px;
    font-size: 11px;
    color: var(--error);
  }
  .summary {
    padding: 2px 14px 6px;
    font-size: 11px;
    min-height: 20px;
  }
  .results {
    flex: 1;
    overflow: auto;
    padding: 0 6px 12px;
  }
  .file {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: none;
    background: none;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .file .ellipsis {
    flex: 1;
  }
  .match {
    display: flex;
    gap: 8px;
    width: 100%;
    height: 23px;
    align-items: center;
    padding: 0 6px 0 22px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
  }
  .match:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .line {
    font-size: 10.5px;
    color: var(--text-faint);
    min-width: 24px;
    text-align: right;
  }
  .text {
    font-size: 11.5px;
  }
  mark {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--text);
    border-radius: 2px;
  }
</style>
