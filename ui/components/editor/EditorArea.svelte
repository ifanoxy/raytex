<script lang="ts">
  // Tabs and the shared CodeMirror view (plus image previews).
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { onDestroy, onMount } from "svelte";
  import { keyFor } from "$lib/actions";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { editor, type Tab } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { viewer } from "$lib/state/viewer.svelte";
  import { prettyKey, relative, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import EmptyStart from "./EmptyStart.svelte";

  let host = $state<HTMLElement | null>(null);
  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);

  onMount(() => {
    if (host) editor.mount(host);
  });
  onDestroy(() => editor.unmount());

  const active = $derived(editor.activeTab);
  const showsText = $derived(!!active && active.kind !== "image" && active.kind !== "pdf");

  const ICONS: Record<string, string> = { tex: "file-tex", bib: "file-bib", image: "image", pdf: "pdf" };

  /** Disambiguates tabs with the same name (`intro.tex — chapters`). */
  function hint(tab: Tab): string | null {
    const same = editor.tabs.filter((x) => x.name === tab.name);
    if (same.length < 2) return null;
    const rel = relative(project.info?.root ?? "", tab.path).split("/");
    return rel.length > 1 ? rel[rel.length - 2] : null;
  }

  function menu(e: MouseEvent, tab: Tab) {
    ui.openMenu(e, [
      { label: t("tabs.close"), keys: keyFor("file.close"), run: () => editor.close(tab.path) },
      { label: t("tabs.closeOthers"), run: () => editor.closeOthers(tab.path) },
      { label: t("tabs.closeAll"), run: () => editor.closeAll() },
      { separator: true },
      { label: t("action.setMain"), icon: "star", disabled: tab.kind !== "tex" || samePath(tab.path, project.info?.main), run: () => project.setMain(tab.path) },
      { label: t("files.copyPath"), icon: "copy", run: () => navigator.clipboard.writeText(tab.path) },
      { label: t("action.revealInOs"), icon: "folder-open", run: () => ipc.revealInOs(tab.path) },
    ]);
  }

  function mouseup(e: MouseEvent, tab: Tab) {
    if (e.button === 1) {
      e.preventDefault();
      void editor.close(tab.path);
    }
  }

  function dragStart(e: DragEvent, i: number) {
    dragIndex = i;
    e.dataTransfer?.setData("application/x-labaguetex-tab", String(i));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function drop(e: DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex !== null) editor.moveTab(dragIndex, i);
    dragIndex = dropIndex = null;
  }

  function scrollTabs(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
  }

  // Keep the active tab visible.
  $effect(() => {
    void editor.active;
    requestAnimationFrame(() => document.querySelector(".tabs .tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  });
</script>

<div class="area">
  {#if editor.tabs.length}
    <div class="tabs" role="tablist" onwheel={scrollTabs}>
      {#each editor.tabs as tab, i (tab.path)}
        {@const h = hint(tab)}
        <div
          class="tab"
          class:active={samePath(tab.path, editor.active)}
          class:drop={dropIndex === i && dragIndex !== i}
          role="tab"
          tabindex="0"
          aria-selected={samePath(tab.path, editor.active)}
          title={tab.path}
          draggable="true"
          onclick={() => editor.activate(tab.path)}
          onkeydown={(e) => e.key === "Enter" && editor.activate(tab.path)}
          onmouseup={(e) => mouseup(e, tab)}
          oncontextmenu={(e) => menu(e, tab)}
          ondragstart={(e) => dragStart(e, i)}
          ondragover={(e) => {
            if (dragIndex !== null) {
              e.preventDefault();
              dropIndex = i;
            }
          }}
          ondragend={() => (dragIndex = dropIndex = null)}
          ondrop={(e) => drop(e, i)}
        >
          <span class="icon {tab.kind}"><Icon name={ICONS[tab.kind] ?? "file"} size={14} /></span>
          <span class="name" class:missing={tab.missing}>{tab.name}</span>
          {#if h}<span class="hint">{h}</span>{/if}
          {#if tab.readOnly}<Icon name="eye" size={12} class="ro" />{/if}
          {#if samePath(tab.path, project.info?.main)}<Icon name="star" size={11} class="main" />{/if}
          <button
            class="close"
            class:dirty={tab.dirty}
            title={t("tabs.close")}
            aria-label={t("tabs.close")}
            onclick={(e) => {
              e.stopPropagation();
              void editor.close(tab.path);
            }}
          >
            <span class="dot"></span>
            <Icon name="x" size={13} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="body">
    <div class="cm-host" class:hidden={!showsText} bind:this={host}></div>
    {#if active && showsText && editor.activeEmpty && !active.readOnly && (active.kind === "tex" || active.kind === "bib")}
      {#key active.path}<EmptyStart tab={active} />{/key}
    {/if}

    {#if active?.kind === "image"}
      <div class="image">
        <img src={convertFileSrc(active.path)} alt={active.name} />
        <div class="caption faint">{relative(project.info?.root ?? "", active.path)}</div>
      </div>
    {:else if active?.kind === "pdf"}
      <div class="empty centered">
        <Icon name="pdf" size={40} stroke={1.2} />
        <p>{active.name}</p>
        <button class="btn" onclick={() => { viewer.load(active.path); ui.pdfVisible = true; }}>{t("tabs.showInViewer")}</button>
      </div>
    {:else if !active}
      <div class="empty centered">
        <img class="watermark" src="/assets/logo.svg" alt="" />
        <div class="shortcuts">
          <span>{t("action.quickOpen")}</span><kbd>{prettyKey(keyFor("view.quickOpen") ?? "")}</kbd>
          <span>{t("action.palette")}</span><kbd>{prettyKey(keyFor("view.palette") ?? "")}</kbd>
          <span>{t("action.build")}</span><kbd>{prettyKey(keyFor("build.run") ?? "")}</kbd>
          <span>{t("action.help")}</span><kbd>F1</kbd>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--editor-bg);
  }
  .tabs {
    display: flex;
    height: 36px;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--border);
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px 0 12px;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    font-size: 12.5px;
    flex-shrink: 0;
  }
  .tab:hover {
    background: var(--bg-hover);
  }
  .tab.active {
    background: var(--editor-bg);
    color: var(--text);
  }
  .tab.active::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    background: var(--accent);
  }
  .tab.active::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 1px;
    background: var(--editor-bg);
  }
  .tab.drop {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .icon {
    color: var(--text-faint);
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
  .name.missing {
    text-decoration: line-through;
  }
  .hint {
    font-size: 11px;
    color: var(--text-faint);
  }
  .tab :global(.main) {
    color: var(--accent);
  }
  .tab :global(.ro) {
    color: var(--text-faint);
  }
  .close {
    position: relative;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    visibility: hidden;
  }
  .tab:hover .close,
  .tab.active .close,
  .close.dirty {
    visibility: visible;
  }
  .close:hover {
    background: var(--bg-active);
    color: var(--text);
  }
  .close .dot {
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
  }
  .close.dirty .dot {
    display: block;
  }
  .close.dirty :global(.icon) {
    display: none;
  }
  .close.dirty:hover .dot {
    display: none;
  }
  .close.dirty:hover :global(.icon) {
    display: block;
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .cm-host {
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .cm-host :global(.cm-editor) {
    flex: 1;
    min-width: 0;
  }
  .cm-host.hidden {
    display: none;
  }
  .image {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    overflow: auto;
    background: repeating-conic-gradient(var(--bg-hover) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
  }
  .image img {
    max-width: 100%;
    max-height: calc(100% - 30px);
    object-fit: contain;
    box-shadow: var(--shadow);
  }
  .centered {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .watermark {
    width: 140px;
    opacity: 0.18;
    filter: grayscale(0.6);
  }
  .shortcuts {
    display: grid;
    grid-template-columns: auto auto;
    gap: 8px 18px;
    align-items: center;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .shortcuts span {
    text-align: right;
  }
  .shortcuts kbd {
    justify-self: start;
  }
</style>
