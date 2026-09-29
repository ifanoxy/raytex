<script lang="ts">
  // Root component: start-up, global shortcuts, window events and layout.

  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onMount } from "svelte";
  import { handleGlobalKey } from "$lib/actions";
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { afterBuild, offerMissingPackages } from "$lib/install";
  import { diagnostics } from "$lib/state/diagnostics.svelte";
  import { app } from "$lib/state/app.svelte";
  import { build } from "$lib/state/build.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { viewer } from "$lib/state/viewer.svelte";
  import { ACCEPTED, extensionOf } from "$lib/images";
  import { media } from "$lib/state/media.svelte";
  import { debounce, dirname, relative } from "$lib/utils";
  import ContextMenu from "./components/common/ContextMenu.svelte";
  import Resizer from "./components/common/Resizer.svelte";
  import CommandPalette from "./components/dialogs/CommandPalette.svelte";
  import DialogHost from "./components/dialogs/DialogHost.svelte";
  import Toasts from "./components/dialogs/Toasts.svelte";
  import EditorArea from "./components/editor/EditorArea.svelte";
  import ActivityBar from "./components/layout/ActivityBar.svelte";
  import FormatBar from "./components/layout/FormatBar.svelte";
  import Sidebar from "./components/layout/Sidebar.svelte";
  import StatusBar from "./components/layout/StatusBar.svelte";
  import Toolbar from "./components/layout/Toolbar.svelte";
  import BottomPanel from "./components/panel/BottomPanel.svelte";
  import PdfViewer from "./components/pdf/PdfViewer.svelte";
  import Welcome from "./components/views/Welcome.svelte";

  // Large windows are loaded when first opened (and prepared in the
  // background after start-up): less code to read before the first screen.
  const VIEWS = {
    settings: () => import("./components/views/Settings.svelte"),
    help: () => import("./components/views/HelpCenter.svelte"),
    newProject: () => import("./components/views/NewProject.svelte"),
    setup: () => import("./components/views/SetupAssistant.svelte"),
    image: () => import("./components/views/ImageDialog.svelte"),
    fonts: () => import("./components/views/FontDialog.svelte"),
    tikz: () => import("./components/views/TikzStudio.svelte"),
    projects: () => import("./components/views/ProjectsWindow.svelte"),
    convert: () => import("./components/views/ConvertProject.svelte"),
    grid: () => import("./components/views/GridEditor.svelte"),
  } as const;
  type LazyView = keyof typeof VIEWS;
  const lazyView = $derived(ui.overlay && ui.overlay in VIEWS ? VIEWS[ui.overlay as LazyView]() : null);

  let workEl = $state<HTMLElement | null>(null);
  let centerEl = $state<HTMLElement | null>(null);
  let failed = $state<string | null>(null);
  let setupShown = false;

  const hasProject = $derived(!!project.info);

  onMount(() => {
    const unlisten: (() => void)[] = [];
    const onKey = (e: KeyboardEvent) => handleGlobalKey(e);
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("input, textarea, .cm-content, .selectable, .doc")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onContextMenu);

    (async () => {
      try {
        await app.init();
        await Promise.all([tex.init(), build.init(), project.init()]);
        viewer.setDefaultZoom(app.settings?.viewer.defaultZoom);
        await editor.reconfigure();
        // Opened from the Finder or with a file: that file, else the last session.
        const requested = (await ipc.takeOpenRequests().catch(() => null)) ?? [];
        const last = app.session?.lastProject;
        if (requested.length) await project.openFiles(requested);
        else if (app.settings?.general.restoreSession && last) await (app.session?.lastLight ? project.openLight(last) : project.open(last));
      } catch (e) {
        failed = String(e);
      }
      unlisten.push(await getCurrentWebview().onDragDropEvent((e) => void onDrop(e.payload)));
      // Packages loaded but not installed: installed by MiKTeX during the
      // build, or offered by RayTeX (never MiKTeX's window per file).
      diagnostics.onChange(debounce(() => offerMissingPackages(), 1200));
      unlisten.push(await ipc.on("build:finished", () => afterBuild()));
      // Files opened from the Finder while the application runs.
      unlisten.push(await ipc.on("app:open-files", () => void ipc.takeOpenRequests().then((paths) => project.openFiles(paths ?? []))));
      // Prepare the other windows while nothing happens.
      const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500));
      idle(() => Object.values(VIEWS).forEach((load) => void load().catch(() => {})));
      // ⌘Q or the menu: the same question as when closing the window.
      unlisten.push(
        await ipc.on("app:quit-requested", async () => {
          if (!editor.dirtyTabs.length || (await editor.closeAll())) await ipc.quitApp();
        }),
      );
      unlisten.push(
        await getCurrentWindow().onCloseRequested(async (event) => {
          if (!editor.dirtyTabs.length) return;
          event.preventDefault();
          if (await editor.closeAll()) await getCurrentWindow().destroy();
        }),
      );
    })();

    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("contextmenu", onContextMenu);
      unlisten.forEach((u) => u());
    };
  });

  // Settings and language changes reconfigure the editor.
  $effect(() => {
    void app.settings;
    void i18n.lang;
    if (app.ready) void editor.reconfigure();
  });

  // First launch without any TeX distribution: open the setup assistant once.
  $effect(() => {
    if (app.ready && tex.missing && !setupShown && !ui.overlay) {
      setupShown = true;
      ui.openOverlay("setup");
    }
  });

  // Window title: file — project — RayTeX.
  $effect(() => {
    // A file opened on its own has no project name besides its own.
    const parts = [editor.activeTab?.name, project.info?.light ? null : project.info?.name, "RayTeX"].filter(Boolean);
    const title = (editor.activeTab?.dirty ? "● " : "") + parts.join(" — ");
    document.title = title;
    void getCurrentWindow()
      .setTitle(title)
      .catch(() => {});
  });

  /** Files dropped from the system (Finder, Explorer…). */
  async function onDrop(e: { type: string; paths?: string[]; position?: { x: number; y: number } }) {
    if (e.type !== "drop" || !e.paths?.length || !e.position) return;
    const ratio = window.devicePixelRatio || 1;
    const target = document.elementFromPoint(e.position.x / ratio, e.position.y / ratio) as HTMLElement | null;
    if (!project.info) {
      // A LaTeX file alone opens in light mode; a folder as a project.
      const first = e.paths[0];
      await (/\.(tex|ltx)$/i.test(first) ? project.openLight(first) : project.open(first));
      return;
    }
    // Dialogs that accept files take them.
    if (ui.overlay === "image") {
      media.imageRequest = { paths: e.paths };
      return;
    }
    if (ui.overlay === "fonts") {
      media.fontRequest = e.paths;
      return;
    }
    const root = project.info.root;
    const inside = (p: string) => relative(root, p) !== p.replace(/\\/g, "/");
    const dirEl = target?.closest<HTMLElement>("[data-drop-dir]");
    if (dirEl) {
      await project.importFiles(e.paths, dirEl.dataset.dropDir!);
      return;
    }
    if (target?.closest(".cm-editor") && editor.view && editor.activeTab?.kind === "tex") {
      // Images go through the image dialog (folder, name, size, caption).
      const images = e.paths.filter((p) => ACCEPTED.includes(extensionOf(p)));
      if (images.length) media.openImages({ paths: images });
      const main = project.info.main ?? editor.active!;
      for (const p of e.paths.filter((x) => !images.includes(x))) {
        const path = inside(p) ? p : (await project.importFiles([p], dirname(main)))[0];
        if (path) await editor.insertFileReference(editor.view, path);
      }
      return;
    }
    const outside = e.paths.filter((p) => !inside(p));
    if (outside.length) await project.importFiles(outside, root);
    for (const p of e.paths) if (inside(p)) await editor.open(p);
  }

  function resizeSidebar(dx: number) {
    ui.sidebarWidth = Math.min(560, Math.max(190, ui.sidebarWidth + dx));
  }

  function resizePdf(dx: number) {
    if (!workEl) return;
    const width = workEl.getBoundingClientRect().width;
    ui.pdfRatio = Math.min(0.8, Math.max(0.2, ui.pdfRatio - dx / width));
  }

  function resizeBottom(dy: number) {
    const max = (centerEl?.getBoundingClientRect().height ?? 600) - 120;
    ui.bottomHeight = Math.min(max, Math.max(110, ui.bottomHeight - dy));
  }
</script>

<div class="app" class:no-project={!hasProject}>
  <div class="top">
    <Toolbar />
    {#if hasProject && ui.formatBarVisible}<FormatBar />{/if}
  </div>
  <div class="main">
    <ActivityBar />
    {#if hasProject && ui.sidebarVisible}
      <div class="sidebar" style:width="{ui.sidebarWidth}px">
        <Sidebar />
      </div>
      <Resizer direction="horizontal" onresize={resizeSidebar} onend={() => ui.saveLayout()} />
    {/if}
    <div class="center" bind:this={centerEl}>
      {#if failed}
        <div class="empty failed">
          <strong>{t("app.startFailed")}</strong>
          <pre class="selectable">{failed}</pre>
        </div>
      {:else if !app.ready}
        <div class="loading"><div class="spinner"></div></div>
      {:else if !hasProject}
        <Welcome />
      {:else}
        <div class="work" bind:this={workEl}>
          <div class="editor-pane" style:flex={ui.pdfVisible ? `${1 - ui.pdfRatio} 1 0` : "1 1 0"}>
            <EditorArea />
          </div>
          {#if ui.pdfVisible}
            <Resizer direction="horizontal" onresize={resizePdf} onend={() => ui.saveLayout()} />
            <div class="pdf-pane" style:flex="{ui.pdfRatio} 1 0">
              <PdfViewer />
            </div>
          {/if}
        </div>
        {#if ui.bottomVisible}
          <Resizer direction="vertical" onresize={resizeBottom} onend={() => ui.saveLayout()} />
          <div class="bottom" style:height="{ui.bottomHeight}px">
            <BottomPanel />
          </div>
        {/if}
      {/if}
    </div>
  </div>
  <StatusBar />
</div>

{#if ui.overlay === "palette"}
  <CommandPalette />
{:else if lazyView}
  {#await lazyView then view}
    {#key ui.overlay}<view.default />{/key}
  {/await}
{/if}

<ContextMenu />
<DialogHost />
<Toasts />

<style>
  .app {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) var(--statusbar-height);
    height: 100%;
  }
  .top {
    min-width: 0;
  }
  .main {
    display: flex;
    min-height: 0;
    min-width: 0;
  }
  .sidebar {
    flex-shrink: 0;
    min-width: 0;
    background: var(--bg-elev);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
  .center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .work {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .editor-pane,
  .pdf-pane {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .pdf-pane {
    border-left: 1px solid var(--border);
  }
  .bottom {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .loading {
    flex: 1;
    display: grid;
    place-items: center;
  }
  .failed pre {
    text-align: left;
    white-space: pre-wrap;
    color: var(--error);
  }
</style>
