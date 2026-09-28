<script lang="ts">
  // One file or folder of the project tree (recursive). A click selects it
  // (and opens a file); Shift + click selects a range, Ctrl + click (Cmd +
  // click on a Mac, where Ctrl + click is the right click) adds or removes
  // it; menus, moving, deleting and dragging apply to the selection.
  import FileTreeNode from "./FileTreeNode.svelte";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { diagnostics, pathKey } from "$lib/state/diagnostics.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { media } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { fileSelection } from "$lib/state/selection.svelte";
  import { type MenuItem, ui } from "$lib/state/ui.svelte";
  import type { FileNode } from "$lib/types";
  import { basename, dirname, fileKind, isMac, join, relative, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  let {
    node,
    depth,
    expanded,
    toggle,
    order,
  }: { node: FileNode; depth: number; expanded: Set<string>; toggle: (path: string) => void; order: () => string[] } = $props();

  let dragOver = $state(false);

  const kind = $derived(node.dir ? "dir" : fileKind(node.path));
  const open = $derived(node.dir && expanded.has(node.path));
  const isMain = $derived(samePath(node.path, project.info?.main));
  const isActive = $derived(samePath(node.path, editor.active));
  const selected = $derived(fileSelection.has(node.path));
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

  /** Shift / Ctrl / Cmd + click: changes the selection only. */
  function selectWith(e: MouseEvent): boolean {
    const add = isMac() ? e.metaKey : e.ctrlKey || e.metaKey;
    if (e.shiftKey) {
      fileSelection.range(node.path, order(), add);
      return true;
    }
    if (add) {
      fileSelection.toggle(node.path);
      return true;
    }
    fileSelection.only(node.path);
    return false;
  }

  function click(e: MouseEvent) {
    // On a Mac, Ctrl + click opens the menu (contextmenu): nothing else.
    if (isMac() && e.ctrlKey) return;
    if (selectWith(e)) return;
    if (node.dir) toggle(node.path);
    else void editor.open(node.path);
  }

  /** Folders of the project, for "Move to…" (the root first). */
  function folders(nodes: FileNode[] = project.tree, out: string[] = []): string[] {
    for (const n of nodes) {
      if (!n.dir) continue;
      out.push(n.path);
      folders(n.children ?? [], out);
    }
    return out;
  }

  /** "Move to…": the folders where `paths` can go, in a second menu. */
  function moveMenu(e: MouseEvent, paths: string[]) {
    const root = project.info?.root ?? "";
    const inside = (dir: string, p: string) => samePath(dir, p) || dir.replace(/\\/g, "/").startsWith(p.replace(/\\/g, "/") + "/");
    const targets = [root, ...folders()].filter(
      (dir) => !paths.some((p) => inside(dir, p)) && !paths.every((p) => samePath(dirname(p), dir)),
    );
    const items: MenuItem[] = targets.map((dir) => ({
      label: samePath(dir, root) ? `${project.info?.name ?? basename(root)} /` : `${relative(root, dir)} /`,
      icon: "folder",
      run: () => project.moveMany(paths, dir),
    }));
    if (!items.length) items.push({ label: t("files.noOtherFolder"), disabled: true });
    ui.openMenu(e, items);
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => ui.toast("success", t("files.copied")));
  }

  function menu(e: MouseEvent) {
    if (!selected) fileSelection.only(node.path);
    if (fileSelection.count > 1) {
      manyMenu(e);
      return;
    }
    const root = project.info?.root ?? "";
    const ext = node.path.split(".").pop()?.toLowerCase() ?? "";
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
      if (["png", "jpg", "jpeg", "pdf", "eps", "svg", "webp", "gif", "heic"].includes(ext)) {
        items.push({ label: t("files.insertImage"), icon: "image", disabled: editor.activeTab?.kind !== "tex", run: () => media.openImages({ paths: [node.path] }) });
      } else if (["ttf", "otf", "ttc", "otc"].includes(ext)) {
        items.push({ label: t("files.useFont"), icon: "type", run: () => media.openFonts([node.path]) });
      } else if (ext === "tikz") {
        items.push({ label: t("files.editTikz"), icon: "sparkles", run: () => void ipc.readTextFile(node.path).then((f) => media.openTikz({ code: f.text.trimEnd(), file: node.path })) });
      }
      if (editor.view && editor.activeTab?.kind === "tex" && !samePath(node.path, editor.active) && !["ttf", "otf", "ttc", "otc"].includes(ext)) {
        items.push({ label: t("files.insertReference"), icon: "link", run: () => editor.view && editor.insertFileReference(editor.view, node.path) });
      }
      items.push({ label: t("files.openExternal"), icon: "external", run: () => ipc.openInOs(node.path) }, { separator: true });
    }
    items.push(
      { label: t("files.rename"), icon: "edit", keys: "F2", run: () => project.rename(node.path) },
      { label: t("files.moveTo"), icon: "folder-open", run: () => moveMenu(e, [node.path]) },
      { label: t("files.delete"), icon: "trash", danger: true, run: () => project.remove(node.path, node.dir) },
      { separator: true },
      { label: t("files.copyPath"), icon: "copy", run: () => copy(node.path) },
      { label: t("files.copyRelativePath"), icon: "copy", run: () => copy(relative(root, node.path)) },
      { label: t("action.revealInOs"), icon: "folder-open", run: () => ipc.revealInOs(node.path) },
    );
    ui.openMenu(e, items);
  }

  /** Menu of several selected files and folders. */
  function manyMenu(e: MouseEvent) {
    const root = project.info?.root ?? "";
    const paths = fileSelection.roots();
    const files = paths.filter((p) => !project.findNode(p)?.dir);
    const images = files.filter((p) => /\.(png|jpe?g|pdf|eps|svg|webp|gif|heic)$/i.test(p));
    const items: MenuItem[] = [];
    if (files.length) items.push({ label: t("files.openMany", { n: files.length }), icon: "file", run: () => files.forEach((f) => void editor.open(f)) });
    if (images.length && images.length === files.length) {
      items.push({ label: t("files.insertImages", { n: images.length }), icon: "image", disabled: editor.activeTab?.kind !== "tex", run: () => media.openImages({ paths: images }) });
    } else if (files.length && editor.view && editor.activeTab?.kind === "tex") {
      items.push({ label: t("files.insertReferences", { n: files.length }), icon: "link", run: () => editor.view && editor.insertFileReferences(editor.view, files) });
    }
    items.push(
      { separator: true },
      { label: t("files.moveMany", { n: paths.length }), icon: "folder-open", run: () => moveMenu(e, paths) },
      { label: t("files.deleteMany", { n: paths.length }), icon: "trash", danger: true, run: () => project.removeMany(paths) },
      { separator: true },
      { label: t("files.copyPaths"), icon: "copy", run: () => copy(paths.join("\n")) },
      { label: t("files.copyRelativePaths"), icon: "copy", run: () => copy(paths.map((p) => relative(root, p)).join("\n")) },
      { label: t("action.revealInOs"), icon: "folder-open", run: () => ipc.revealInOs(paths[0]) },
      { separator: true },
      { label: t("files.clearSelection"), icon: "x", run: () => fileSelection.clear() },
    );
    ui.openMenu(e, items);
  }

  function key(e: KeyboardEvent) {
    const many = selected && fileSelection.count > 1;
    if (e.key === "F2" && !many) project.rename(node.path);
    else if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
      if (many) void project.removeMany(fileSelection.roots());
      else project.remove(node.path, node.dir);
    }
    else if (e.key === "ArrowRight" && node.dir && !open) toggle(node.path);
    else if (e.key === "ArrowLeft" && node.dir && open) toggle(node.path);
    else return;
    e.preventDefault();
  }

  function dragStart(e: DragEvent) {
    if (!e.dataTransfer) return;
    // Dragging a selected row drags the whole selection.
    if (!selected) fileSelection.only(node.path);
    const paths = fileSelection.count > 1 ? fileSelection.roots() : [node.path];
    e.dataTransfer.setData("application/x-labaguetex-path", node.path);
    e.dataTransfer.setData("application/x-labaguetex-paths", JSON.stringify(paths));
    e.dataTransfer.setData("text/plain", paths.map((p) => relative(project.info?.root ?? "", p)).join("\n"));
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
    let paths = [from];
    try {
      paths = JSON.parse(e.dataTransfer?.getData("application/x-labaguetex-paths") || "null") ?? paths;
    } catch {
      /* one file */
    }
    if (paths.length > 1) {
      void project.moveMany(paths, node.path);
      return;
    }
    if (samePath(from, node.path) || pathKey(node.path).startsWith(pathKey(from) + "/")) return;
    void project.move(from, join(node.path, basename(from)));
  }
</script>

<div class="node" role="treeitem" aria-selected={selected || isActive} aria-expanded={node.dir ? open : undefined}>
  <button
    class="row"
    class:active={isActive}
    class:selected
    data-path={node.path}
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
      <FileTreeNode node={child} depth={depth + 1} {expanded} {toggle} {order} />
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
  .row.selected {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
    color: var(--text);
  }
  .row.selected:hover {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
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
