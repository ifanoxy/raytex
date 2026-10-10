<script lang="ts">
  // What is new in the version that runs: a summary, everything in detail
  // behind "See more", and the page of the website that lists every version.
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { whatsNew } from "$lib/state/whatsnew.svelte";
  import { VERSIONS_PAGE } from "$lib/updates";
  import Icon from "../common/Icon.svelte";
  import ReleaseNotes from "../common/ReleaseNotes.svelte";

  const shown = $derived(whatsNew.shown);
  let expanded = $state(false);
  // Each time it opens, the summary first.
  $effect(() => {
    if (shown) expanded = false;
  });
  const day = (date: string) => new Intl.DateTimeFormat(i18n.lang, { dateStyle: "long" }).format(new Date(`${date}T12:00:00`));

  function key(e: KeyboardEvent) {
    if (!shown || e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    whatsNew.close();
  }
</script>

<svelte:window onkeydowncapture={key} />

{#if shown}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && whatsNew.close()}>
    <div class="dialog whats-new" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div class="head">
        <img src="/assets/logo.svg" alt="" width="52" height="52" />
        <div>
          <h3 id="whats-new-title">{t("whatsnew.title", { version: shown.version })}</h3>
          <p class="faint">{t("whatsnew.released", { date: day(shown.date) })}</p>
        </div>
      </div>

      <div class="body">
        <ReleaseNotes notes={shown[i18n.lang]} earlier={whatsNew.earlier} bind:expanded />
      </div>

      <div class="buttons">
        <button class="btn link" onclick={() => ipc.openUrl(VERSIONS_PAGE[i18n.lang])}><Icon name="external" size={13} />{t("whatsnew.allVersions")}</button>
        <span class="spacer"></span>
        <button class="btn primary" onclick={() => whatsNew.close()}>{t("common.close")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 815;
    display: grid;
    place-items: center;
    background: var(--overlay);
    animation: fade 0.18s var(--ease);
  }
  .dialog {
    width: min(560px, 92vw);
    max-height: 86vh;
    padding: 22px 24px 18px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 16px;
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
    font-size: 12px;
  }
  .body {
    min-height: 0;
    overflow: auto;
    padding-right: 4px;
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
