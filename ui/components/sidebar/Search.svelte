<script lang="ts">
  // Search and replace in the whole project (Ctrl+Shift+F, Ctrl+Shift+R);
  // also shows the results of "find references". Each match shows what it
  // would become, and is replaced alone, with its file, or with all.
  import { t } from "$lib/i18n.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { searchStore as s } from "$lib/state/search.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { SearchMatch } from "$lib/types";
  import { basename, debounce, isMac, relative } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  let input = $state<HTMLInputElement | null>(null);
  let replaceInput = $state<HTMLInputElement | null>(null);
  let collapsed = $state<Set<string>>(new Set());

  const runSoon = debounce(() => void s.run(), 250);
  const mod = isMac() ? "⌘" : "Ctrl+";

  $effect(() => {
    void s.focusRequest;
    requestAnimationFrame(() => {
      const target = s.showReplace && s.query ? replaceInput : input;
      target?.focus();
      target?.select();
    });
  });

  function toggle(file: string) {
    const next = new Set(collapsed);
    if (next.has(file)) next.delete(file);
    else next.add(file);
    collapsed = next;
  }

  function option(which: "case" | "word" | "regex") {
    if (which === "case") s.caseSensitive = !s.caseSensitive;
    if (which === "word") s.wholeWord = !s.wholeWord;
    if (which === "regex") s.regex = !s.regex;
    void s.run();
  }

  /** The line with the match marked (cut around long lines). */
  function parts(m: SearchMatch) {
    const r = m.location.range;
    const start = r.start.character;
    const end = r.start.line === r.end.line ? r.end.character : m.lineText.length;
    const from = Math.max(0, start - 28);
    const before = (from > 0 ? "…" : "") + m.lineText.slice(from, start).trimStart();
    return { before, match: m.lineText.slice(start, end), after: m.lineText.slice(end, end + 120) };
  }

  async function replaceAll() {
    const n = s.results.length;
    if (!n) return;
    const ok = await ui.confirm({
      title: t("search.replaceAllTitle", { n }),
      message: t("search.replaceAllMessage", { query: s.query, replacement: s.replacement }),
      okLabel: t("search.replaceAll"),
    });
    if (ok) ui.toast("success", t("search.replaced", { n: await s.replaceAll() }));
  }

  async function replaceFile(items: SearchMatch[]) {
    ui.toast("success", t("search.replaced", { n: await s.replaceMatches(items) }));
  }

  function replaceKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void replaceAll();
    }
  }

  const root = $derived(project.info?.root ?? "");

  /** The folder of a path from the project (empty at its top). */
  function folderOf(rel: string): string {
    const at = Math.max(rel.lastIndexOf("/"), rel.lastIndexOf("\\"));
    return at > 0 ? rel.slice(0, at) : "";
  }
</script>

<PanelHeader title={s.title ?? t("sidebar.search")}>
  {#if s.title}
    <button class="icon-btn" title={t("search.backToSearch")} onclick={() => { s.title = null; s.results = []; void s.run(); }}><Icon name="x" /></button>
  {:else}
    <button class="icon-btn" class:active={s.showReplace} title={t("search.toggleReplace")} aria-pressed={s.showReplace} onclick={() => (s.showReplace = !s.showReplace)}><Icon name="edit" /></button>
  {/if}
</PanelHeader>

{#if !s.title}
  <div class="form">
    <div class="field">
      <Icon name="search" size={13} />
      <input
        bind:this={input}
        bind:value={s.query}
        placeholder={t("search.placeholder")}
        spellcheck="false"
        oninput={runSoon}
        onkeydown={(e) => e.key === "Enter" && s.run()}
      />
      <button class="opt" class:on={s.caseSensitive} title={t("find.case")} aria-pressed={s.caseSensitive} onclick={() => option("case")}>Aa</button>
      <button class="opt word" class:on={s.wholeWord} title={t("find.word")} aria-pressed={s.wholeWord} onclick={() => option("word")}>ab</button>
      <button class="opt" class:on={s.regex} title={t("find.regexp")} aria-pressed={s.regex} onclick={() => option("regex")}>.*</button>
    </div>
    {#if s.showReplace}
      <div class="field">
        <Icon name="edit" size={13} />
        <input bind:this={replaceInput} bind:value={s.replacement} placeholder={t("search.replacePlaceholder")} spellcheck="false" onkeydown={replaceKey} />
      </div>
      <button class="btn primary small all" disabled={!s.results.length} onclick={replaceAll} title="{t('search.replaceAll')} ({mod}Enter)">
        <Icon name="check" size={13} />
        {t("search.replaceAllN", { n: s.results.length })}
      </button>
    {/if}
    {#if s.error}<div class="error">{s.error}</div>{/if}
  </div>
{/if}

<div class="summary">
  {#if s.running}
    <span class="spinner"></span>
  {:else if s.query || s.title}
    <span>{s.results.length ? t("search.summary", { n: s.results.length, files: s.grouped.length }) : t("search.nothing")}</span>
    {#if s.grouped.length > 1}
      <button class="link" onclick={() => (collapsed = collapsed.size ? new Set() : new Set(s.grouped.map((g) => g.file)))}>
        {collapsed.size ? t("search.expandAll") : t("search.collapseAll")}
      </button>
    {/if}
  {/if}
</div>

<div class="results">
  {#each s.grouped as g (g.file)}
    {@const rel = relative(root, g.file)}
    <div class="file-row">
      <button class="file" onclick={() => toggle(g.file)} title={rel}>
        <Icon name={collapsed.has(g.file) ? "chevron-right" : "chevron-down"} size={13} />
        <Icon name="file-tex" size={14} />
        <span class="name">{basename(g.file)}</span>
        <span class="dir ellipsis">{folderOf(rel)}</span>
        <span class="badge">{g.items.length}</span>
      </button>
      {#if s.showReplace && !s.title}
        <button class="act" title={t("search.replaceInFile")} aria-label={t("search.replaceInFile")} onclick={() => replaceFile(g.items)}><Icon name="check" size={13} /></button>
      {/if}
    </div>
    {#if !collapsed.has(g.file)}
      {#each g.items as m, i (i)}
        {@const p = parts(m)}
        <div class="match-row">
          <button class="match" onclick={() => editor.openLocation(m.location)}>
            <span class="line">{m.location.range.start.line + 1}</span>
            <span class="text ellipsis mono"
              >{p.before}<mark class:del={s.showReplace && !s.title}>{p.match}</mark>{#if s.showReplace && !s.title}<ins>{s.replacementFor(m)}</ins>{/if}{p.after}</span
            >
          </button>
          {#if s.showReplace && !s.title}
            <button class="act" title={t("search.replaceOne")} aria-label={t("search.replaceOne")} onclick={() => s.replaceMatches([m])}><Icon name="check" size={12} /></button>
          {/if}
        </div>
      {/each}
    {/if}
  {/each}
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 10px 8px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 4px 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text-faint);
  }
  .field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .field input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12.5px;
  }
  .opt {
    display: grid;
    place-items: center;
    width: 24px;
    height: 21px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: none;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
  }
  .opt.word {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .opt:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
  .opt.on {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    background: var(--accent-soft);
  }
  .all {
    align-self: flex-end;
    gap: 6px;
  }
  .error {
    font-size: 11px;
    color: var(--error);
  }
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 22px;
    padding: 0 14px 6px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 11.5px;
    cursor: pointer;
  }
  .results {
    flex: 1;
    overflow: auto;
    padding: 0 6px 12px;
  }
  .file-row,
  .match-row {
    position: relative;
    display: flex;
    align-items: center;
  }
  .file {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 6px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .file:hover {
    background: var(--bg-hover);
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
  }
  .dir {
    flex: 1;
    min-width: 0;
    color: var(--text-faint);
    font-size: 11px;
  }
  .badge {
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 9px;
    background: var(--bg-active);
    color: var(--text-muted);
    font-size: 10.5px;
    text-align: center;
  }
  .match {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 6px 0 26px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
  }
  .match:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .line {
    min-width: 24px;
    font-size: 10.5px;
    color: var(--text-faint);
    text-align: right;
  }
  .text {
    font-size: 11.5px;
  }
  mark {
    padding: 0 1px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--warning) 32%, transparent);
    color: var(--text);
  }
  mark.del {
    background: color-mix(in srgb, var(--error) 22%, transparent);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--error) 70%, transparent);
  }
  ins {
    padding: 0 1px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--success) 25%, transparent);
    color: var(--text);
    text-decoration: none;
  }
  .act {
    position: absolute;
    right: 4px;
    display: none;
    place-items: center;
    width: 22px;
    height: 20px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg-elev);
    color: var(--success);
    cursor: pointer;
  }
  .file-row:hover .act,
  .match-row:hover .act {
    display: grid;
  }
  .act:hover {
    border-color: var(--success);
  }
</style>
