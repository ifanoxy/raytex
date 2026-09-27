<script lang="ts">
  // Templates: a picture of the first page and a title. A click puts the
  // template in the project's main file (undoable).
  import { runAction } from "$lib/actions";
  import { t, tr, type MessageKey } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { tex } from "$lib/state/tex.svelte";
  import { templates } from "$lib/state/templates.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { TemplateInfo } from "$lib/types";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  const GROUPS: { id: string; label: MessageKey }[] = [
    { id: "general", label: "newProject.general" },
    { id: "student", label: "newProject.student" },
    { id: "teacher", label: "newProject.teacher" },
    { id: "researcher", label: "newProject.researcher" },
    { id: "user", label: "newProject.user" },
  ];

  $effect(() => {
    void templates.load();
  });

  // Thumbnails need TeX: render them once it is found.
  $effect(() => {
    if (tex.ready) templates.renderAll();
  });

  const groups = $derived(
    GROUPS.map((g) => ({ ...g, items: templates.list.filter((x) => (g.id === "user" ? x.user : !x.user && x.category === g.id)) })).filter((g) => g.items.length),
  );

  function menu(e: MouseEvent, tpl: TemplateInfo) {
    ui.openMenu(e, [
      { label: t("templates.use"), icon: "check", run: () => templates.apply(tpl) },
      ...(tpl.user
        ? [
            { separator: true },
            {
              label: t("common.delete"),
              icon: "trash",
              danger: true,
              run: async () => {
                const ok = await ui.confirm({ title: t("newProject.deleteTemplate", { name: tr(tpl.name) }), okLabel: t("common.delete"), danger: true });
                if (!ok) return;
                await ipc.deleteTemplate(tpl.id);
                await templates.load(true);
              },
            },
          ]
        : []),
    ]);
  }
</script>

<PanelHeader title={t("sidebar.templates")}>
  <button class="icon-btn" title={t("action.saveAsTemplate")} onclick={() => runAction("project.saveAsTemplate")}>
    <Icon name="save" />
  </button>
</PanelHeader>

<div class="list">
  <p class="tip faint">{t("templates.tip", { undo: prettyKey("Mod-z") })}</p>
  {#each groups as g (g.id)}
    <div class="group section-title">{t(g.label)}</div>
    <div class="grid">
      {#each g.items as tpl (tpl.id)}
        {@const thumb = templates.thumbs[tpl.id]}
        <button
          class="card"
          class:applied={templates.applied === tpl.id}
          class:busy={templates.applying === tpl.id}
          title={tr(tpl.name)}
          onclick={() => templates.apply(tpl)}
          oncontextmenu={(e) => menu(e, tpl)}
          data-template={tpl.id}
        >
          <span class="page" class:landscape={thumb?.state === "ready" && thumb.landscape}>
            {#if thumb?.state === "ready"}
              <img src={thumb.url} alt="" draggable="false" />
            {:else if thumb?.state === "failed" || !tex.ready}
              <Icon name="file-tex" size={26} stroke={1.3} />
            {:else}
              <span class="spinner"></span>
            {/if}
            {#if templates.applying === tpl.id}<span class="veil"><span class="spinner"></span></span>{/if}
            {#if templates.applied === tpl.id}<span class="check"><Icon name="check" size={12} /></span>{/if}
          </span>
          <span class="name ellipsis">{tr(tpl.name)}</span>
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .list {
    flex: 1;
    overflow: auto;
    padding: 0 10px 14px;
  }
  .tip {
    margin: 2px 4px 6px;
    font-size: 11.5px;
    line-height: 1.45;
  }
  .group {
    margin: 12px 4px 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 12px 10px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: center;
    color: var(--text-muted);
  }
  .page {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1 / 1.414;
    overflow: hidden;
    border-radius: 4px;
    background: #fff;
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    color: #9a9a9a;
    transition:
      border-color 0.12s,
      box-shadow 0.12s,
      transform 0.12s;
  }
  .page img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: top;
  }
  .page.landscape img {
    object-position: center;
  }
  .page.landscape {
    background: #f4f4f4;
  }
  .card:hover .page {
    border-color: var(--accent);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    transform: translateY(-1px);
  }
  .card:hover .name,
  .card.applied .name {
    color: var(--text);
  }
  .card.applied .page {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .card:focus-visible .page {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .name {
    font-size: 12px;
    font-weight: 550;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.6);
  }
  .check {
    position: absolute;
    top: 5px;
    right: 5px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .spinner {
    width: 16px;
    height: 16px;
  }
</style>
