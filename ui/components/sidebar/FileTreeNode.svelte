<script lang="ts">
  // One file or folder of the project tree (recursive).
  import FileTreeNode from "./FileTreeNode.svelte";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { diagnostics, pathKey } from "$lib/state/diagnostics.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { type MenuItem, ui } from "$lib/state/ui.svelte";
  import type { FileNode } from "$lib/types";
  import { basename, fileKind, join, relative, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  let { node, depth, expanded, toggle }: { node: FileNode; depth: number; expanded: Set<string>; toggle: (path: string) => void } = $props();

  let dragOver = $state(false);

  const kind = $derived(node.dir ? "dir" : fileKind(node.path));
  const open = $derived(node.dir && expanded.has(node.path));
  const isMain = $derived(samePath(node.path, project.info?.main));
  const isActive = $derived(samePath(node.path, editor.active));
  const tab = $derived(editor.tabs.find((tb) => samePath(tb.path, node.path)));
  const problems = $derived.by(() => {
    if (node.dir) return 0;
    const key = pathKey(node.path);
    const lint = diagnostics.lint[key] ?? [];
    return (
      lint.filter((d) => d.severity === "error").length +
      diagnostics.build.filter((d) => d.severity === "error" && d.file && pathKey(d.file) === key).length
    );
  });

  const ICONS: Record<string, string> = { dir: "folder", tex: "file-tex", bib: "file-bib", image: "image", pdf: "pdf" };
  const icon = $derived(node.dir ? (open ? "folder-open" : "folder") : (ICONS[kind] ?? "file"));

  function click() {
    if (node.dir) toggle(node.path);
    else void editor.open(node.path);
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => ui.toast("success", t("files.copied")));
  }

  function menu(e: MouseEvent) {
    const root = project.info?.root ?? "";
    const items: MenuItem[] = [];
    if (node.dir) {
      items.push(
        { label: t("action.newFile"), icon: "file-plus", run: () => project.newFile(node.path) },
        { label: t("action.newFolder"), icon: "folder-plus", run: () => project.newFolder(node.path) },
        { label: t("files.importHere"), icon: "download", run: () => project.importDialog(node.path) },
        { separator: true },
      );
    } else {
      items.push({ label: t("files.open"), icon: "file", run: () => editor.open(node.path) });
      if (kind === "tex") items.push({ label: t("action.setMain"), icon: "star", disabled: isMain, run: () => project.setMain(node.path) });
      if (editor.view && editor.activeTab?.kind === "tex" && !samePath(node.path, editor.active)) {
        items.push({ label: t("files.insertReference"), icon: "link", run: () => editor.view && editor.insertFileReference(editor.view, node.path) });
      }
      items.push({ label: t("files.openExternal"), icon: "external", run: () => ipc.openInOs(node.path) }, { separator: true });
    }
    items.push(
      { label: t("files.rename"), icon: "edit", keys: "F2", run: () => project.rename(node.path) },
      { label: t("files.delete"), icon: "trash", danger: true, run: () => project.remove(node.path, node.dir) },
      { separator: true },
      { label: t("files.copyPath"), icon: "copy", run: () => copy(node.path) },
      { label: t("files.copyRelativePath"), icon: "copy", run: () => copy(relative(root, node.path)) },
      { label: t("action.revealInOs"), icon: "folder-open", run: () => ipc.revealInOs(node.path) },
    );
    ui.openMenu(e, items);
  }

  function key(e: KeyboardEvent) {
    if (e.key === "F2") project.rename(node.path);
    else if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) project.remove(node.path, node.dir);
    else if (e.key === "ArrowRight" && node.dir && !open) toggle(node.path);
    else if (e.key === "ArrowLeft" && node.dir && open) toggle(node.path);
    else return;
    e.preventDefault();
  }

  function dragStart(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/x-labaguetex-path", node.path);
    e.dataTransfer.setData("text/plain", relative(project.info?.root ?? "", node.path));
    e.dataTransfer.effectAllowed = "copyMove";
  }

  function dragOverDir(e: DragEvent) {
    if (!node.dir || !e.dataTransfer?.types.includes("application/x-labaguetex-path")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    dragOver = true;
  }

  function drop(e: DragEvent) {
    dragOver = false;
    const from = e.dataTransfer?.getData("application/x-labaguetex-path");
    if (!node.dir || !from) return;
    e.preventDefault();
    e.stopPropagation();
    if (samePath(from, node.path) || pathKey(node.path).startsWith(pathKey(from) + "/")) return;
    void project.move(from, join(node.path, basename(from)));
  }
</script>

<div class="node" role="treeitem" aria-selected={isActive} aria-expanded={node.dir ? open : undefined}>
  <button
    class="row"
    class:active={isActive}
    class:drag-over={dragOver}
    style:padding-left="{8 + depth * 14}px"
    title={node.path}
    draggable="true"
    data-drop-dir={node.dir ? node.path : undefined}
    onclick={click}
    oncontextmenu={menu}
    onkeydown={key}
    ondragstart={dragStart}
    ondragover={dragOverDir}
    ondragleave={() => (dragOver = false)}
    ondrop={drop}
  >
    <span class="chevron">
      {#if node.dir}<Icon name={open ? "chevron-down" : "chevron-right"} size={13} />{/if}
    </span>
    <span class="icon {kind}"><Icon name={icon} size={15} /></span>
    <span class="name ellipsis" class:error={problems > 0}>{node.name}</span>
    {#if isMain}<span class="main" title={t("files.main")}><Icon name="star" size={12} /></span>{/if}
    {#if problems}<span class="count">{problems}</span>{/if}
    {#if tab?.dirty}<span class="dirty" title={t("files.unsaved")}></span>{/if}
  </button>
  {#if open}
    {#each node.children ?? [] as child (child.path)}
      <FileTreeNode node={child} depth={depth + 1} {expanded} {toggle} />
    {/each}
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    height: 26px;
    padding-right: 8px;
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
  .row.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  .row.drag-over {
    outline: 1.5px dashed var(--accent);
    outline-offset: -2px;
  }
  .chevron {
    width: 13px;
    flex-shrink: 0;
    color: var(--text-faint);
  }
  .icon {
    color: var(--text-faint);
  }
  .icon.dir {
    color: var(--accent);
  }
  .icon.tex {
    color: var(--hl-command);
  }
  .icon.bib {
    color: var(--hl-heading);
  }
  .icon.image {
    color: var(--hl-key);
  }
  .icon.pdf {
    color: var(--error);
  }
  .name {
    flex: 1;
  }
  .name.error {
    color: var(--error);
  }
  .main {
    color: var(--accent);
  }
  .count {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--error);
  }
  .dirty {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
  }
</style>
