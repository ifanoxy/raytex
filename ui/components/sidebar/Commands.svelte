<script lang="ts">
  // The commands and environments the project defines: where they are, how
  // much they are used, with a way to insert them, to try them and to make
  // new ones.
  import { type CustomCommand, signature, specFromSelection } from "$lib/commands";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { basename, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  let commands = $state<CustomCommand[]>([]);
  let loaded = $state(false);
  let scope = $state<"file" | "project">("project");
  let filter = $state("");

  const path = $derived(editor.active ?? project.info?.main ?? null);

  // Read again when the project changes (its structure is refreshed after
  // each change of a document) and when the studio adds a definition.
  $effect(() => {
    void project.structure;
    void ui.commandsRevision;
    const p = path;
    if (!p) {
      commands = [];
      return;
    }
    void ipc
      .customCommands(p)
      .then((list) => {
        if (p === path) commands = list;
      })
      .catch(() => (commands = []))
      .finally(() => (loaded = true));
  });

  const q = $derived(filter.trim().toLowerCase().replace(/^\\/, ""));
  const inFile = $derived(commands.filter((c) => samePath(c.location.file, editor.active)));
  const shown = $derived(
    (scope === "file" ? inFile : commands).filter((c) => !q || c.name.toLowerCase().includes(q) || c.definition.toLowerCase().includes(q)),
  );

  function insert(c: CustomCommand) {
    const block = c.kind === "environment" || c.kind === "theorem";
    if (c.math) editor.insertMath(c.usage);
    else editor.insertSnippet(c.usage, undefined, { block });
    editor.focus();
  }

  function create() {
    const view = editor.view;
    const selected = view ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) : "";
    ui.openCommands({ create: specFromSelection(selected) });
  }
</script>

<PanelHeader title={t("sidebar.commands")}>
  <button class="icon-btn" title={t("commands.new")} onclick={create}><Icon name="plus" /></button>
</PanelHeader>

<div class="tabs" role="tablist">
  <button class="tab" class:active={scope === "project"} role="tab" aria-selected={scope === "project"} onclick={() => (scope = "project")}>
    {t("commands.scopeProject")}{#if commands.length}<span class="n">{commands.length}</span>{/if}
  </button>
  <button class="tab" class:active={scope === "file"} role="tab" aria-selected={scope === "file"} onclick={() => (scope = "file")}>
    {t("commands.scopeFile")}{#if inFile.length}<span class="n">{inFile.length}</span>{/if}
  </button>
</div>

<div class="filter"><input class="input small" placeholder={t("commands.filter")} bind:value={filter} spellcheck="false" /></div>

<div class="list">
  {#each shown as c (`${c.location.file}:${c.location.range.start.line}:${c.name}`)}
    <div class="item">
      <button class="main" title={c.source} onclick={() => editor.openLocation(c.location)}>
        <span class="head">
          <span class="name mono ellipsis">{signature(c)}</span>
          {#if c.kind !== "command"}<span class="badge">{t(`commands.kind.${c.kind}`)}</span>{:else if c.math}<span class="badge">math</span>{/if}
          <span class="uses faint" title={t("commands.usesTitle", { n: c.uses })}>{c.uses}×</span>
        </span>
        <span class="definition mono ellipsis faint">
          {c.definition || c.source}
        </span>
        {#if scope === "project" && !samePath(c.location.file, editor.active)}
          <span class="where faint ellipsis">{basename(c.location.file)}:{c.location.range.start.line + 1}</span>
        {/if}
      </button>
      <div class="tools">
        <button class="icon-btn" title={t("commands.insert")} aria-label={t("commands.insert")} onclick={() => insert(c)}><Icon name="plus" size={14} /></button>
        <button class="icon-btn" title={t("commands.try")} aria-label={t("commands.try")} onclick={() => ui.openCommands({ test: c })}><Icon name="play" size={14} /></button>
      </div>
    </div>
  {:else}
    {#if loaded}
      <div class="empty">
        <span>{q ? t("commands.noMatch") : commands.length ? t("commands.noneInFile") : t("commands.none")}</span>
        <button class="btn small" onclick={create}><Icon name="plus" size={13} />{t("commands.new")}</button>
      </div>
    {/if}
  {/each}
</div>
<div class="foot faint">{t("commands.foot")}</div>

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
    padding: 6px 8px;
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
  .name {
    font-size: 12.5px;
    color: var(--text);
  }
  .uses {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 11px;
  }
  .badge {
    flex-shrink: 0;
  }
  .definition {
    font-size: 11px;
  }
  .where {
    font-size: 10.5px;
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
