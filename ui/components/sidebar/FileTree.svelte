<script lang="ts">
  // Project files: tree, selection (Shift / Ctrl / Cmd), context menus,
  // drag and drop, file operations.
  import { t } from "$lib/i18n.svelte";
  import { project } from "$lib/state/project.svelte";
  import { fileSelection } from "$lib/state/selection.svelte";
  import type { FileNode } from "$lib/types";
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

  // A new project starts with nothing selected.
  $effect(() => {
    void project.info?.root;
    fileSelection.clear();
  });

  /** Rows shown, top to bottom (for Shift ranges and the arrow keys). */
  function order(): string[] {
    const out: string[] = [];
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        out.push(n.path);
        if (n.dir && expanded.has(n.path)) walk(n.children ?? []);
      }
    };
    walk(project.tree);
    return out;
  }

  function focusRow(path: string) {
    const row = [...document.querySelectorAll<HTMLElement>(".tree .row")].find((r) => r.dataset.path === path);
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
  }

  function treeKey(e: KeyboardEvent) {
    const current = (document.activeElement as HTMLElement | null)?.dataset?.path;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      fileSelection.all(order());
    } else if (e.key === "Escape" && fileSelection.count) {
      fileSelection.clear();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && current) {
      const rows = order();
      const i = rows.indexOf(current) + (e.key === "ArrowDown" ? 1 : -1);
      if (i < 0 || i >= rows.length) return;
      if (e.shiftKey) fileSelection.range(rows[i], rows, false);
      else fileSelection.only(rows[i]);
      focusRow(rows[i]);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
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
    let paths = [from];
    try {
      paths = JSON.parse(e.dataTransfer?.getData("application/x-labaguetex-paths") || "null") ?? paths;
    } catch {
      /* one file */
    }
    void project.moveMany(paths, project.info.root);
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
  onkeydown={treeKey}
>
  {#each project.tree as node (node.path)}
    <FileTreeNode {node} depth={0} {expanded} {toggle} {order} />
  {:else}
    <div class="empty">{t("files.empty")}</div>
  {/each}
  {#if !project.light}<div class="drop-hint faint">{t("files.dropHint")}</div>{/if}
</div>

<!-- Below the tree, so that selecting does not move the rows. -->
{#if fileSelection.count > 1}
  <div class="selection">
    <span>{t("files.selected", { n: fileSelection.count })}</span>
    <button class="icon-btn" title={t("files.deleteMany", { n: fileSelection.roots().length })} onclick={() => project.removeMany(fileSelection.roots())}><Icon name="trash" size={14} /></button>
    <button class="icon-btn" title={t("files.clearSelection")} onclick={() => fileSelection.clear()}><Icon name="x" size={14} /></button>
  </div>
{/if}

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
  .selection {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    margin: 6px 8px 8px;
    padding: 2px 4px 2px 10px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    font-size: 12px;
    color: var(--text);
  }
  .selection span {
    flex: 1;
  }
  .selection .icon-btn {
    width: 24px;
    height: 24px;
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
