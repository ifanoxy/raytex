<script lang="ts">
  // Large overlay window (settings, help, new project, setup assistant).
  import type { Snippet } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "./Icon.svelte";

  let {
    title,
    icon,
    width = "min(1100px, 94vw)",
    height = "min(760px, 90vh)",
    onclose = () => ui.closeOverlay(),
    children,
    actions,
  }: {
    title: string;
    icon?: string;
    width?: string;
    height?: string;
    onclose?: () => void;
    children: Snippet;
    actions?: Snippet;
  } = $props();

  /**
   * Closes the window after the field being edited was committed: on macOS
   * a click on a button (the cross) does not take the focus away, and the
   * field never got its `change`.
   */
  function close() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches("input, textarea, select")) active.blur();
    onclose();
  }

  function key(e: KeyboardEvent) {
    // Escape already used inside (a completion list, a snippet field closed).
    if (e.defaultPrevented) return;
    if (e.key === "Escape" && !ui.dialog && !ui.menu) {
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydown={key} />

<div class="overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && close()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={title} style:width style:height>
    <header>
      {#if icon}<Icon name={icon} size={18} />{/if}
      <h2>{title}</h2>
      <div class="spacer"></div>
      {@render actions?.()}
      <button class="icon-btn" title={t("common.close")} onclick={close}><Icon name="x" /></button>
    </header>
    <div class="body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: grid;
    place-items: center;
    background: var(--overlay);
    backdrop-filter: blur(3px);
    animation: fade 0.12s ease-out;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .modal {
    display: flex;
    flex-direction: column;
    background: var(--bg-elev);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    animation: rise 0.16s var(--ease);
  }
  @keyframes rise {
    from {
      transform: translateY(8px) scale(0.99);
      opacity: 0;
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 50px;
    padding: 0 10px 0 18px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    color: var(--accent);
  }
  h2 {
    margin: 0;
    font-size: 15px;
    color: var(--text);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
</style>
