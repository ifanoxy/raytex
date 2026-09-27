<script lang="ts">
  // Modal dialogs: confirm, prompt, alert and multiple choice.
  import { t } from "$lib/i18n.svelte";
  import { ui } from "$lib/state/ui.svelte";

  let value = $state("");
  let input = $state<HTMLInputElement | null>(null);
  let primary = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    const d = ui.dialog;
    if (!d) return;
    value = d.value ?? "";
    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        // Select the name without its extension, like file managers do.
        const dot = value.lastIndexOf(".");
        input.setSelectionRange(0, dot > 0 ? dot : value.length);
      } else {
        primary?.focus();
      }
    });
  });

  function ok() {
    const d = ui.dialog;
    if (!d) return;
    if (d.kind === "prompt") {
      if (!value.trim()) return;
      ui.closeDialog(value.trim());
    } else {
      ui.closeDialog(true);
    }
  }

  function cancel() {
    ui.closeDialog(ui.dialog?.kind === "prompt" || ui.dialog?.kind === "choice" ? null : false);
  }

  function key(e: KeyboardEvent) {
    if (!ui.dialog) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === "Enter" && ui.dialog.kind !== "choice" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      ok();
    }
  }
</script>

<svelte:window onkeydowncapture={key} />

{#if ui.dialog}
  {@const d = ui.dialog}
  <div class="overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && cancel()}>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-label={d.title}>
      <h3>{d.title}</h3>
      {#if d.message}<p class="message selectable">{d.message}</p>{/if}
      {#if d.code}<pre class="code selectable">{d.code}</pre>{/if}
      {#if d.detail}<p class="detail">{d.detail}</p>{/if}
      {#if d.kind === "prompt"}
        <input class="input" bind:this={input} bind:value placeholder={d.placeholder ?? ""} spellcheck="false" />
      {/if}
      <div class="buttons">
        {#if d.kind === "choice"}
          {#each d.choices ?? [] as c (c.id)}
            {#if c.primary}
              <button class="btn primary" bind:this={primary} onclick={() => ui.closeDialog(c.id)}>{c.label}</button>
            {:else}
              <button class="btn" class:danger={c.danger} onclick={() => ui.closeDialog(c.id)}>{c.label}</button>
            {/if}
          {/each}
        {:else}
          {#if d.kind !== "alert"}
            <button class="btn" onclick={cancel}>{d.cancelLabel ?? t("common.cancel")}</button>
          {/if}
          <button class="btn primary" class:danger-primary={d.danger} bind:this={primary} onclick={ok} disabled={d.kind === "prompt" && !value.trim()}>
            {d.okLabel ?? t("common.ok")}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 800;
    display: grid;
    place-items: center;
    background: var(--overlay);
  }
  .dialog {
    width: min(480px, 92vw);
    max-height: 86vh;
    overflow: auto;
    padding: 20px 22px 18px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: rise 0.14s var(--ease);
  }
  @keyframes rise {
    from {
      transform: translateY(6px);
      opacity: 0;
    }
  }
  h3 {
    margin: 0;
    font-size: 15px;
  }
  .message {
    margin: 0;
    color: var(--text-muted);
    white-space: pre-wrap;
    line-height: 1.5;
  }
  .detail {
    margin: 0;
    font-size: 12px;
    color: var(--warning);
  }
  .code {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 220px;
    overflow: auto;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .danger-primary {
    background: var(--error);
    border-color: var(--error);
    color: #fff;
  }
</style>
