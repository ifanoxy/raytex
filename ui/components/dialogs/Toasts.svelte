<script lang="ts">
  // Notifications in the bottom-right corner.
  import { t } from "$lib/i18n.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "../common/Icon.svelte";

  const ICON = { info: "info", success: "check", warning: "alert-triangle", error: "alert-circle" } as const;
</script>

<div class="toasts" aria-live="polite">
  {#each ui.toasts as toast (toast.id)}
    <div class="toast {toast.kind}" role="status">
      <span class="kind"><Icon name={ICON[toast.kind]} size={16} /></span>
      <div class="content">
        <div class="message selectable">{toast.message}</div>
        {#if toast.detail}<div class="detail selectable">{toast.detail}</div>{/if}
        {#if toast.action}
          <button
            class="btn small"
            onclick={() => {
              toast.action?.run();
              ui.dismiss(toast.id);
            }}>{toast.action.label}</button
          >
        {/if}
      </div>
      <button class="icon-btn close" title={t("common.close")} onclick={() => ui.dismiss(toast.id)}><Icon name="x" size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 14px;
    bottom: calc(var(--statusbar-height) + 12px);
    z-index: 950;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(380px, 90vw);
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    gap: 10px;
    padding: 10px 8px 10px 12px;
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    border-left: 3px solid var(--info);
    box-shadow: var(--shadow);
    animation: slide 0.18s var(--ease);
  }
  @keyframes slide {
    from {
      transform: translateX(16px);
      opacity: 0;
    }
  }
  .toast.success {
    border-left-color: var(--success);
  }
  .toast.warning {
    border-left-color: var(--warning);
  }
  .toast.error {
    border-left-color: var(--error);
  }
  .kind {
    padding-top: 1px;
    color: var(--info);
  }
  .success .kind {
    color: var(--success);
  }
  .warning .kind {
    color: var(--warning);
  }
  .error .kind {
    color: var(--error);
  }
  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .message {
    line-height: 1.4;
    word-break: break-word;
  }
  .detail {
    font-size: 11.5px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow: auto;
    width: 100%;
  }
  .close {
    width: 22px;
    height: 22px;
  }
</style>
