<script lang="ts">
  // Project files: tree, context menus, drag and drop, file operations.
  import { t } from "$lib/i18n.svelte";
  import { project } from "$lib/state/project.svelte";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";
  import FileTreeNode from "./FileTreeNode.svelte";

  const KEY = "labaguetex.expanded.";

  let expanded = $state<Set<string>>(new Set());
  let dragOverRoot = $state(false);

  $effect(() => {
    const root = project.info?.root;
    if (!root) return;
    try {
      expanded = new Set(JSON.parse(localStorage.getItem(KEY + root) ?? "[]"));
    } catch {
      expanded = new Set();
    }
  });

  function toggle(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    expanded = next;
    try {
      localStorage.setItem(KEY + project.info!.root, JSON.stringify([...next]));
    } catch {
      /* not remembered */
    }
  }

  function collapseAll() {
    expanded = new Set();
    try {
      localStorage.removeItem(KEY + project.info!.root);
    } catch {
      /* ignore */
    }
  }

  function dropOnRoot(e: DragEvent) {
    dragOverRoot = false;
    const from = e.dataTransfer?.getData("application/x-labaguetex-path");
    if (!from || !project.info) return;
    e.preventDefault();
    const name = from.split(/[\\/]/).pop()!;
    void project.move(from, `${project.info.root}/${name}`);
  }
</script>

<PanelHeader title={t("sidebar.files")}>
  {#if !project.light}
    <button class="icon-btn" title={t("action.newFile")} onclick={() => project.newFile()}><Icon name="file-plus" /></button>
    <button class="icon-btn" title={t("action.newFolder")} onclick={() => project.newFolder()}><Icon name="folder-plus" /></button>
    <button class="icon-btn" title={t("action.importFiles")} onclick={() => project.importDialog()}><Icon name="download" /></button>
    <button class="icon-btn" title={t("files.refresh")} onclick={() => project.refreshTree()}><Icon name="refresh" /></button>
    <button class="icon-btn" title={t("files.collapseAll")} onclick={collapseAll}><Icon name="minus" /></button>
  {/if}
</PanelHeader>

{#if project.light}
  <!-- Light mode: the file alone; nothing is created next to it. -->
  <div class="light">
    <strong><Icon name="file-tex" size={15} />{t("light.title")}</strong>
    <p>{t("light.explanation")}</p>
    <button class="btn small primary" onclick={() => project.requireProject("")}><Icon name="folder-plus" size={13} />{t("light.makeProject")}</button>
  </div>
{/if}

<div
  class="tree"
  class:drag-over={dragOverRoot}
  role="tree"
  tabindex="-1"
  data-drop-dir={project.info?.root}
  ondragover={(e) => {
    if (e.dataTransfer?.types.includes("application/x-labaguetex-path") && e.target === e.currentTarget) {
      e.preventDefault();
      dragOverRoot = true;
    }
  }}
  ondragleave={() => (dragOverRoot = false)}
  ondrop={dropOnRoot}
>
  {#each project.tree as node (node.path)}
    <FileTreeNode {node} depth={0} {expanded} {toggle} />
  {:else}
    <div class="empty">{t("files.empty")}</div>
  {/each}
  {#if !project.light}<div class="drop-hint faint">{t("files.dropHint")}</div>{/if}
</div>

<style>
  .tree {
    flex: 1;
    overflow: auto;
    padding: 0 6px 12px;
    outline: none;
  }
  .tree.drag-over {
    background: var(--accent-soft);
  }
  .light {
    margin: 2px 10px 10px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    font-size: 12px;
    line-height: 1.5;
  }
  .light strong {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
  }
  .light p {
    margin: 4px 0 8px;
    color: var(--text-muted);
  }
  .drop-hint {
    padding: 14px 10px;
    font-size: 11px;
    text-align: center;
  }
</style>
