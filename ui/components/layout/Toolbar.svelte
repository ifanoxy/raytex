<script lang="ts">
  // Top bar: project, compilation, main file, search and the "View" menu.
  // Formatting lives in the bar below (FormatBar).
  import { getAction, keyFor, runAction } from "$lib/actions";
  import { t } from "$lib/i18n.svelte";
  import { app } from "$lib/state/app.svelte";
  import { build } from "$lib/state/build.svelte";
  import { project } from "$lib/state/project.svelte";
  import { type MenuItem, ui } from "$lib/state/ui.svelte";
  import { basename, formatDuration, prettyKey, relative, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  const logo = $derived(app.theme === "dark" ? "/assets/logo-mark-dark.svg" : "/assets/logo-mark-light.svg");

  function actionItem(id: string): MenuItem {
    const a = getAction(id)!;
    return { label: t(a.title), icon: a.icon, keys: keyFor(id), disabled: !!a.when && !a.when(), run: () => runAction(id) };
  }

  function projectMenu(e: MouseEvent) {
    const recent = (app.session?.recent ?? []).filter((r) => !samePath(r.path, project.info?.root)).slice(0, 8);
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      actionItem("project.new"),
      actionItem("project.open"),
      actionItem("project.openFile"),
      ...(recent.length ? [{ separator: true }, ...recent.map((r) => ({ label: r.name, icon: "folder", run: () => project.open(r.path) }))] : []),
      { separator: true },
      actionItem("view.templates"),
      actionItem("project.settings"),
      actionItem("project.saveAsTemplate"),
      actionItem("project.close"),
    ]);
  }

  function buildMenu(e: MouseEvent) {
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      { label: t("toolbar.liveBuild"), icon: "bolt", checked: app.settings?.build.autoBuild === "onIdle", run: () => runAction("build.live") },
      { separator: true },
      actionItem("build.run"),
      actionItem("build.clean"),
      actionItem("build.log"),
      actionItem("build.output"),
      { separator: true },
      actionItem("pdf.export"),
      actionItem("pdf.external"),
      { separator: true },
      { label: t("toolbar.buildSettings"), icon: "settings", run: () => ui.openSettings("build") },
    ]);
  }

  function mainMenu(e: MouseEvent) {
    const info = project.info;
    if (!info) return;
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      ...info.candidates.map((c) => ({
        label: relative(info.root, c),
        icon: "file-tex",
        checked: samePath(c, info.main),
        run: () => project.setMain(c),
      })),
      ...(info.candidates.length ? [] : [{ label: t("toolbar.noCandidates"), disabled: true }]),
    ]);
  }

  /** What is shown in the window: every part can be closed and brought back here. */
  function viewMenu(e: MouseEvent) {
    const shortcut = (id: string) => keyFor(id);
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      { label: t("view.formatBar"), icon: "type", checked: ui.formatBarVisible, run: () => ui.toggleFormatBar() },
      { label: t("view.sidebar"), icon: "panel-left", keys: shortcut("view.sidebar"), checked: ui.sidebarVisible, run: () => ui.setVisible("sidebar", !ui.sidebarVisible) },
      { label: t("view.pdf"), icon: "panel-right", keys: shortcut("view.pdf"), checked: ui.pdfVisible, run: () => ui.setVisible("pdf", !ui.pdfVisible) },
      { label: t("view.console"), icon: "panel-bottom", keys: shortcut("view.panel"), checked: ui.bottomVisible, run: () => ui.setVisible("bottom", !ui.bottomVisible) },
      { separator: true },
      { label: t("view.darkTheme"), icon: "moon", checked: app.theme === "dark", run: () => runAction("view.theme") },
      actionItem("view.zoomIn"),
      actionItem("view.zoomOut"),
    ]);
  }

  const status = $derived(build.status);
  const errors = $derived(build.outcome?.diagnostics.filter((d) => d.severity === "error").length ?? 0);
  const live = $derived(app.settings?.build.autoBuild === "onIdle");
</script>

<header class="toolbar">
  <div class="brand">
    <img src={logo} alt="" width="26" height="26" />
  </div>

  {#if project.info}
    <button class="project" onclick={projectMenu} title={project.info.root}>
      <span class="ellipsis">{project.info.name}</span>
      <Icon name="chevron-down" size={13} />
    </button>

    <div class="sep"></div>

    <div class="build" class:running={build.running && build.manual}>
      {#if build.running && build.manual}
        <button class="btn primary run" onclick={() => build.cancel()} title="{t('action.cancelBuild')} ({prettyKey(keyFor('build.cancel') ?? '')})">
          <span class="spinner light"></span>
          <span class="ellipsis">{build.step ?? t("toolbar.building")}</span>
          <Icon name="stop" size={12} />
        </button>
      {:else}
        <button class="btn primary run" onclick={() => build.run()} title="{t('action.build')} ({prettyKey(keyFor('build.run') ?? '')})">
          <Icon name="play" size={13} />
          {t("toolbar.build")}
        </button>
      {/if}
      <button class="btn primary more" onclick={buildMenu} title={t("toolbar.buildOptions")} aria-label={t("toolbar.buildOptions")}>
        <Icon name="chevron-down" size={13} />
      </button>
    </div>

    {#if live}
      <button class="live" class:busy={build.running && !build.manual} onclick={() => runAction("build.live")} title={t("toolbar.liveOn")}>
        {#if build.running && !build.manual}<span class="spinner tiny"></span>{:else}<span class="pulse"></span>{/if}
        {t("toolbar.live")}
      </button>
    {/if}

    <button class="state {status}" onclick={() => ui.showBottom(status === "failed" ? "problems" : "output")} title={t("toolbar.lastBuild")}>
      {#if status === "success"}
        <Icon name="check" size={14} />
        {formatDuration(build.outcome?.durationMs ?? 0)}
      {:else if status === "failed"}
        <Icon name="alert-circle" size={14} />
        {errors ? t("toolbar.errors", { n: errors }) : t("toolbar.failed")}
      {:else if status === "cancelled"}
        <Icon name="stop" size={12} />
        {t("toolbar.cancelled")}
      {/if}
    </button>

    <button class="chip" onclick={mainMenu} title={t("toolbar.mainFile")}>
      <Icon name="star" size={13} />
      <span class="ellipsis">{project.info.main ? basename(project.info.main) : t("toolbar.noMain")}</span>
    </button>
  {/if}

  <div class="spacer"></div>

  <button class="palette-btn" onclick={() => runAction(project.info ? "view.quickOpen" : "view.palette")}>
    <Icon name="search" size={14} />
    <span>{project.info ? t("toolbar.searchFiles") : t("toolbar.commands")}</span>
    <kbd>{prettyKey(keyFor(project.info ? "view.quickOpen" : "view.palette") ?? "")}</kbd>
  </button>

  {#if project.info}
    <button class="btn ghost small view-btn" onclick={viewMenu} title={t("view.menuHint")}>
      <Icon name="layout" size={15} />
      <span>{t("view.menu")}</span>
      <Icon name="chevron-down" size={12} />
    </button>
  {/if}
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--toolbar-height);
    padding: 0 10px 0 11px;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--border);
    min-width: 0;
    overflow: hidden;
  }
  .brand {
    display: flex;
    width: 28px;
    margin-right: 8px;
  }
  .project {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    height: 30px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius);
    background: none;
    font-weight: 650;
    font-size: 13.5px;
    cursor: pointer;
  }
  .project:hover,
  .chip:hover {
    background: var(--bg-hover);
  }
  .sep {
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: var(--border);
    flex-shrink: 0;
  }
  .build {
    display: flex;
  }
  .build .run {
    border-radius: var(--radius) 0 0 var(--radius);
    max-width: 220px;
    font-weight: 600;
  }
  .build .more {
    border-radius: 0 var(--radius) var(--radius) 0;
    padding: 0 7px;
    border-left: 1px solid color-mix(in srgb, var(--accent-contrast) 25%, transparent);
  }
  .spinner.light {
    border-color: color-mix(in srgb, var(--accent-contrast) 25%, transparent);
    border-top-color: var(--accent-contrast);
  }
  .state {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .state.idle,
  .state.running {
    display: none;
  }
  .state.success {
    color: var(--success);
  }
  .state.failed {
    color: var(--error);
  }
  .state.cancelled {
    color: var(--text-muted);
  }
  .state:hover {
    background: var(--bg-hover);
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 180px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .chip :global(.icon) {
    color: var(--accent);
  }
  .live {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 8px;
    border: none;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .spinner.tiny {
    width: 9px;
    height: 9px;
    border-width: 1.5px;
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    border-top-color: var(--accent);
  }
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  .view-btn {
    gap: 6px;
    white-space: nowrap;
  }
  .palette-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(300px, 26vw);
    height: 28px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text-faint);
    cursor: pointer;
    font-size: 12px;
  }
  .palette-btn span {
    flex: 1;
    text-align: left;
  }
  .palette-btn:hover {
    border-color: var(--border-strong);
    color: var(--text-muted);
  }
  @media (max-width: 1100px) {
    .chip,
    .live,
    .view-btn span,
    .palette-btn span {
      display: none;
    }
    .palette-btn {
      width: auto;
    }
  }
</style>
