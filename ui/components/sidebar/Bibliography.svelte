<script lang="ts">
  // The bibliography of the project: the entries of its `.bib` files, how
  // much each one is cited, those that are the same work or have the same
  // key, with a way to cite them, to change them and to add new ones.
  import { type BibItem, type Bibliography, matches, remarks } from "$lib/bibliography";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { bibliography } from "$lib/state/bibliography.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  let data = $state<Bibliography>({ files: [], entries: [], allCited: false });
  let loaded = $state(false);
  let tab = $state<"all" | "unused" | "check">("all");
  let filter = $state("");

  const path = $derived(editor.active ?? project.info?.main ?? null);

  // Read again when the project changes (a citation typed, a `.bib` file
  // edited) and when the form writes an entry.
  $effect(() => {
    void project.structure;
    void bibliography.revision;
    const p = path;
    if (!p) {
      data = { files: [], entries: [], allCited: false };
      return;
    }
    void ipc
      .bibliography(p)
      .then((b) => {
        if (p === path) data = b;
      })
      .catch(() => (data = { files: [], entries: [], allCited: false }))
      .finally(() => (loaded = true));
  });

  const unused = $derived(data.allCited ? [] : data.entries.filter((e) => !e.cited));
  const toCheck = $derived(data.entries.filter((e) => e.sameKey || e.sameAs));
  const shown = $derived((tab === "unused" ? unused : tab === "check" ? toCheck : data.entries).filter((e) => matches(e, filter)));
  const keys = $derived(data.entries.map((e) => e.key));

  function cite(e: BibItem) {
    editor.insertSnippet(`\\cite{${e.key}}`);
    editor.focus();
  }

  function menu(event: MouseEvent, e: BibItem) {
    event.preventDefault();
    ui.openMenu(event, [
      { label: t("bib.cite"), icon: "quote", run: () => cite(e) },
      { label: t("bib.edit"), icon: "edit", run: () => bibliography.edit(e, data.files, keys) },
      { label: t("bib.goTo"), icon: "file-bib", run: () => editor.open(e.file, { line: e.line }) },
      { label: t("bib.copyKey"), icon: "copy", run: () => navigator.clipboard.writeText(e.key).then(() => ui.toast("success", t("files.copied"))) },
      { separator: true },
      { label: t("bib.delete"), icon: "trash", danger: true, run: () => bibliography.remove(e) },
    ]);
  }
</script>

<PanelHeader title={t("sidebar.bibliography")}>
  <button class="icon-btn" title={t("bib.new")} aria-label={t("bib.new")} onclick={() => bibliography.create(data.files, keys)}><Icon name="plus" /></button>
</PanelHeader>

<div class="tabs" role="tablist">
  <button class="tab" class:active={tab === "all"} role="tab" aria-selected={tab === "all"} onclick={() => (tab = "all")}>
    {t("bib.tab.all")}{#if data.entries.length}<span class="n">{data.entries.length}</span>{/if}
  </button>
  <button class="tab" class:active={tab === "unused"} role="tab" aria-selected={tab === "unused"} onclick={() => (tab = "unused")}>
    {t("bib.tab.unused")}{#if unused.length}<span class="n">{unused.length}</span>{/if}
  </button>
  <button class="tab" class:active={tab === "check"} role="tab" aria-selected={tab === "check"} onclick={() => (tab = "check")}>
    {t("bib.tab.check")}{#if toCheck.length}<span class="n warn">{toCheck.length}</span>{/if}
  </button>
</div>

<div class="filter"><input class="input small" placeholder={t("bib.filter")} bind:value={filter} spellcheck="false" /></div>

<div class="list bib-list">
  {#each shown as e, i (`${e.file}:${e.line}:${i}`)}
    {@const notes = remarks(e, data.allCited)}
    <div class="item" role="presentation" oncontextmenu={(event) => menu(event, e)}>
      <button class="main" title={t("bib.edit")} onclick={() => bibliography.edit(e, data.files, keys)}>
        <span class="head">
          <span class="key mono ellipsis">{e.key}</span>
          {#if e.cited}
            <span class="uses faint" title={t("bib.cited", { n: e.cited })}>{e.cited}×</span>
          {:else if !data.allCited}
            <span class="uses mark">{t("bib.unused")}</span>
          {/if}
        </span>
        <span class="title ellipsis">{e.title || t(`bib.kind.${e.kind}` as never) || e.kind}</span>
        <span class="by faint ellipsis">{[e.authors, e.year, e.venue].filter(Boolean).join(" · ")}</span>
        {#if notes.includes("sameKey")}<span class="note warn"><Icon name="alert-triangle" size={12} />{t("bib.sameKey")}</span>{/if}
        {#if e.sameAs}<span class="note warn"><Icon name="alert-triangle" size={12} />{t("bib.sameAs", { key: e.sameAs })}</span>{/if}
      </button>
      <div class="tools">
        <button class="icon-btn" title={t("bib.cite")} aria-label={t("bib.cite")} onclick={() => cite(e)}><Icon name="quote" size={14} /></button>
        <button class="icon-btn" title={t("common.more")} aria-label={t("common.more")} onclick={(event) => menu(event, e)}><Icon name="more" size={14} /></button>
      </div>
    </div>
  {:else}
    {#if loaded}
      <div class="empty">
        <span>
          {#if filter.trim()}
            {t("bib.noMatch")}
          {:else if tab === "unused" && data.entries.length}
            {t("bib.noneUnused")}
          {:else if tab === "check" && data.entries.length}
            {t("bib.noneCheck")}
          {:else if data.files.length}
            {t("bib.none")}
          {:else}
            {t("bib.noFile")}
          {/if}
        </span>
        {#if !filter.trim() && (tab === "all" || !data.entries.length)}
          <button class="btn small" onclick={() => bibliography.create(data.files, keys)}><Icon name="plus" size={13} />{t("bib.new")}</button>
        {/if}
      </div>
    {/if}
  {/each}
</div>
<div class="foot faint">{data.allCited ? t("bib.allCited") : t("bib.foot")}</div>

<style>
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
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
  .n {
    padding: 0 5px;
    border-radius: 8px;
    background: var(--bg-hover);
    font-size: 10px;
    line-height: 15px;
  }
  .n.warn {
    background: color-mix(in srgb, var(--warning) 22%, transparent);
    color: var(--text);
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
    padding: 0 6px 10px;
  }
  .item {
    position: relative;
    border-radius: var(--radius-sm);
  }
  .item:hover,
  .item:focus-within {
    background: var(--bg-hover);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    min-width: 0;
    padding: 7px 8px;
    border: none;
    background: none;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .key {
    font-size: 12px;
    color: var(--accent);
  }
  .uses {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 11px;
  }
  .uses.mark {
    padding: 0 6px;
    border-radius: 8px;
    background: var(--bg-active);
    font-size: 10.5px;
    line-height: 16px;
    color: var(--text-muted);
  }
  .title {
    font-size: 12.5px;
    color: var(--text);
  }
  .by {
    font-size: 11px;
  }
  .note {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
  }
  .note.warn {
    color: var(--warning);
  }
  .tools {
    position: absolute;
    top: 3px;
    right: 4px;
    display: flex;
    gap: 1px;
    padding-left: 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-hover);
    /* Shown with the pointer or the keyboard on the row; always reachable. */
    opacity: 0;
  }
  .item:hover .tools,
  .item:focus-within .tools {
    opacity: 1;
  }
  .tools .icon-btn {
    width: 24px;
    height: 24px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .foot {
    padding: 8px 12px;
    font-size: 11px;
    line-height: 1.45;
    border-top: 1px solid var(--border);
  }
</style>
