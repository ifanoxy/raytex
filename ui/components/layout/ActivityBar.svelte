<script lang="ts">
  // Vertical bar selecting the sidebar view.
  import { keyFor } from "$lib/actions";
  import { t } from "$lib/i18n.svelte";
  import { diagnostics } from "$lib/state/diagnostics.svelte";
  import { project } from "$lib/state/project.svelte";
  import { type SidebarView, ui } from "$lib/state/ui.svelte";
  import { prettyKey } from "$lib/utils";
  import type { MessageKey } from "$lib/i18n.svelte";
  import Icon from "../common/Icon.svelte";

  const VIEWS: { id: SidebarView; icon: string; title: MessageKey; action: string }[] = [
    { id: "files", icon: "files", title: "sidebar.files", action: "view.files" },
    { id: "templates", icon: "template", title: "sidebar.templates", action: "view.templates" },
    { id: "outline", icon: "outline", title: "sidebar.outline", action: "view.outline" },
    { id: "search", icon: "search", title: "sidebar.search", action: "view.search" },
    { id: "symbols", icon: "sigma", title: "sidebar.symbols", action: "view.symbols" },
    { id: "snippets", icon: "at", title: "sidebar.snippets", action: "view.snippets" },
    { id: "packages", icon: "packages", title: "sidebar.packages", action: "view.packages" },
  ];

  function title(v: (typeof VIEWS)[number]) {
    const k = keyFor(v.action);
    return k ? `${t(v.title)} (${prettyKey(k)})` : t(v.title);
  }
</script>

<nav class="activity" aria-label={t("sidebar.label")}>
  {#if project.info}
    {#each VIEWS.filter((v) => !(project.info?.light && v.id === "templates")) as v (v.id)}
      <button
        class="item"
        class:active={ui.sidebarVisible && ui.sidebar === v.id}
        title={title(v)}
        aria-label={t(v.title)}
        aria-pressed={ui.sidebarVisible && ui.sidebar === v.id}
        onclick={() => ui.showSidebar(v.id)}
      >
        <Icon name={v.icon} size={21} stroke={1.6} />
        {#if v.id === "files" && diagnostics.counts.errors}
          <span class="dot"></span>
        {/if}
      </button>
    {/each}
  {/if}
  <div class="spacer"></div>
  <button class="item" class:active={ui.overlay === "help"} title="{t('action.help')} (F1)" aria-label={t("action.help")} onclick={() => ui.openHelp()}>
    <Icon name="help" size={21} stroke={1.6} />
  </button>
  <button class="item" class:active={ui.overlay === "settings"} title={t("action.settings")} aria-label={t("action.settings")} onclick={() => ui.openSettings()}>
    <Icon name="settings" size={21} stroke={1.6} />
  </button>
</nav>

<style>
  .activity {
    width: var(--activity-width);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 0;
    background: var(--bg);
    border-right: 1px solid var(--border);
  }
  .item {
    position: relative;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--text-faint);
    cursor: pointer;
  }
  .item:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
  .item.active {
    color: var(--accent);
  }
  .item.active::before {
    content: "";
    position: absolute;
    left: -4px;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--error);
    border: 1.5px solid var(--bg);
  }
</style>
