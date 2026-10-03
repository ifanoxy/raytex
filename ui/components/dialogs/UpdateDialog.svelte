<script lang="ts">
  // A new version of RayTeX: what it brings, then its download and restart.
  import { i18n, t } from "$lib/i18n.svelte";
  import { updates } from "$lib/state/updates.svelte";
  import { noteLines } from "$lib/updates";
  import Icon from "../common/Icon.svelte";

  const offer = $derived(updates.offer);
  const busy = $derived(updates.phase === "downloading" || updates.phase === "installing");
  const percent = $derived(updates.total > 0 ? Math.min(100, Math.round((updates.received / updates.total) * 100)) : null);
  const notes = $derived(noteLines(offer?.notes));
  const megabytes = (n: number) => (n / 1_048_576).toFixed(1);

  function key(e: KeyboardEvent) {
    if (!offer || busy) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      updates.later();
    }
  }
</script>

<svelte:window onkeydowncapture={key} />

{#if offer && updates.phase !== "idle" && updates.phase !== "checking"}
  <div class="overlay" role="presentation">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="update-title">
      <div class="head">
        <img src="/assets/logo.svg" alt="" width="52" height="52" />
        <div>
          <h3 id="update-title">{t("update.title", { version: offer.version })}</h3>
          <p class="faint">{t("update.current", { version: offer.current })}</p>
        </div>
      </div>

      {#if notes.length && updates.phase === "offer"}
        <div class="notes selectable">
          {#each notes as line, i (i)}
            <p class:item={line.startsWith("•")}>{line}</p>
          {/each}
        </div>
      {/if}

      {#if updates.phase === "downloading" || updates.phase === "installing"}
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? undefined}>
          <div class="bar" class:indeterminate={percent === null || updates.phase === "installing"} style:width={percent === null ? undefined : `${percent}%`}></div>
        </div>
        <p class="faint small">
          {#if updates.phase === "installing"}
            {t("update.installing")}
          {:else if percent !== null}
            {t("update.downloading")} · {megabytes(updates.received)} / {megabytes(updates.total)} {i18n.lang === "fr" ? "Mo" : "MB"} · {percent} %
          {:else}
            {t("update.downloading")}
          {/if}
        </p>
      {:else if updates.phase === "error"}
        <p class="error selectable">{t("update.failed")}</p>
        {#if updates.error}<pre class="code selectable">{updates.error}</pre>{/if}
      {:else}
        <p class="faint small">{t("update.saveNote")}</p>
      {/if}

      <div class="buttons">
        {#if updates.phase === "offer"}
          <button class="btn link" onclick={() => updates.skip()}>{t("update.skip")}</button>
          <span class="spacer"></span>
          <button class="btn" onclick={() => updates.later()}>{t("update.later")}</button>
          <button class="btn primary" onclick={() => updates.install()}><Icon name="download" size={14} />{t("update.install")}</button>
        {:else if updates.phase === "error"}
          <button class="btn" onclick={() => updates.later()}>{t("common.close")}</button>
          <button class="btn primary" onclick={() => updates.openDownloadPage()}><Icon name="external" size={14} />{t("update.downloadPage")}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 820;
    display: grid;
    place-items: center;
    background: var(--overlay);
    animation: fade 0.18s var(--ease);
  }
  .dialog {
    width: min(520px, 92vw);
    max-height: 86vh;
    overflow: auto;
    padding: 22px 24px 18px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: rise 0.22s var(--ease);
  }
  @keyframes rise {
    from {
      transform: translateY(8px) scale(0.98);
      opacity: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .head {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .head img {
    border-radius: 12px;
    flex: none;
  }
  h3 {
    margin: 0 0 2px;
    font-size: 16px;
  }
  .head p {
    margin: 0;
  }
  .notes {
    max-height: 220px;
    overflow: auto;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    font-size: 12.5px;
    line-height: 1.55;
  }
  .notes p {
    margin: 0 0 4px;
  }
  .notes p:not(.item) {
    font-weight: 600;
    margin-top: 6px;
  }
  .notes p:first-child {
    margin-top: 0;
  }
  .notes .item {
    color: var(--text-muted);
    padding-left: 4px;
  }
  .progress {
    height: 8px;
    border-radius: 4px;
    background: var(--bg-active);
    overflow: hidden;
  }
  .bar {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    transition: width 0.2s var(--ease);
  }
  .bar.indeterminate {
    width: 35%;
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(300%);
    }
  }
  .error {
    margin: 0;
    color: var(--error);
  }
  .code {
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev);
    font: 11.5px var(--font-mono);
    white-space: pre-wrap;
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .btn.link {
    background: none;
    border-color: transparent;
    color: var(--text-muted);
    padding-left: 0;
  }
  .btn.link:hover {
    color: var(--text);
  }
</style>
