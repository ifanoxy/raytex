<script lang="ts">
  // Minimize, maximize and close, drawn by RayTeX where the system bar is
  // removed (Windows). They stay above the dialogs, like the system's.
  import { onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import { appWindow } from "$lib/state/window.svelte";

  onMount(() => {
    const stop = appWindow.watch();
    return () => void stop.then((f) => f());
  });
</script>

<div class="controls" data-no-drag>
  <button onclick={() => appWindow.minimize()} title={t("window.minimize")} aria-label={t("window.minimize")}>
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" /></svg>
  </button>
  <button
    onclick={() => appWindow.toggleMaximize()}
    title={appWindow.maximized ? t("window.restore") : t("window.maximize")}
    aria-label={appWindow.maximized ? t("window.restore") : t("window.maximize")}
  >
    {#if appWindow.maximized}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>
    {:else}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M.5.5h9v9h-9z" /></svg>
    {/if}
  </button>
  <button class="close" onclick={() => appWindow.close()} title={t("window.close")} aria-label={t("window.close")}>
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" /></svg>
  </button>
</div>

<style>
  .controls {
    position: relative;
    z-index: 1000;
    display: flex;
    align-self: stretch;
    margin-left: 6px;
  }
  button {
    display: grid;
    place-items: center;
    width: 46px;
    height: 100%;
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    color: var(--text);
    cursor: default;
  }
  button:hover {
    background: var(--bg-hover);
  }
  button:active {
    background: var(--bg-active);
  }
  .close:hover {
    background: #c42b1c;
    color: #fff;
  }
  .close:active {
    background: #b22a1b;
    color: #fff;
  }
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .close svg {
    shape-rendering: geometricPrecision;
  }
</style>
