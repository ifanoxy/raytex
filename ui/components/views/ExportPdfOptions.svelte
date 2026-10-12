<script lang="ts">
  // Exporting the PDF of a document that has pictures: as it is, with
  // lighter pictures, or under a size. Each choice says about what the PDF
  // would weigh before anything is done.
  import { onDestroy, onMount } from "svelte";
  import { save } from "@tauri-apps/plugin-dialog";
  import { sizeLabel } from "$lib/history";
  import { i18n, plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { estimate, megabytes, type PdfChoice, type PdfWeights, STEP_BALANCED, STEP_LIGHT, stepFor } from "$lib/pdfweight";
  import { build } from "$lib/state/build.svelte";
  import { pdfExport } from "$lib/state/pdfexport.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { viewer } from "$lib/state/viewer.svelte";
  import { basename } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  type Kind = "original" | "balanced" | "light" | "limit";
  const KINDS: Kind[] = ["original", "balanced", "light", "limit"];
  const KEY = "raytex.export.pdf";
  const lang = i18n.lang === "fr" ? "fr" : "en";
  const target = build.target();

  // The choice and the limit of the last time.
  const saved: { kind?: Kind; limit?: string } = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {
      return {};
    }
  })();
  let kind = $state<Kind>(KINDS.includes(saved.kind as Kind) ? (saved.kind as Kind) : "original");
  let limit = $state(typeof saved.limit === "string" ? saved.limit : "10");
  /** The pictures and the PDF as they are (at once), then what they weigh at each step (seconds). */
  let pictures = $state<{ pictures: number; original: number; pdf: number | null } | null>(null);
  let weights = $state<PdfWeights | null>(null);
  let weighing = $state(true);

  onMount(async () => {
    if (!target) return;
    pictures = await ipc.pdfPictures(target).catch(() => null);
    weights = await ipc.pdfWeights(target).catch(() => null);
    weighing = false;
  });
  onDestroy(() => {
    if (weighing) void ipc.pdfWeightsCancel();
  });

  const bytes = $derived(megabytes(limit));
  const reach = $derived(weights && bytes ? stepFor(weights, bytes) : null);

  /** About what the PDF would weigh with a choice; null when it cannot be said (yet). */
  function about(of: Kind): number | null {
    if (of === "original") return pictures?.pdf ?? null;
    if (!weights) return null;
    if (of === "limit") return reach ? estimate(weights, reach.step) : null;
    return estimate(weights, of === "balanced" ? STEP_BALANCED : STEP_LIGHT);
  }

  const ready = $derived(kind === "original" || (kind === "limit" ? bytes !== null : true));

  async function choose() {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ kind, limit }));
    } catch {
      /* not remembered */
    }
    const choice: PdfChoice = kind === "original" ? { kind } : kind === "limit" ? { kind, bytes: bytes! } : { kind: "step", step: kind === "balanced" ? STEP_BALANCED : STEP_LIGHT };
    // Light mode: proposed next to the .tex file (its build is in the cache).
    const main = project.info?.light ? project.info.main : null;
    const defaultPath = main ? main.replace(/\.[^./\\]+$/, ".pdf") : viewer.pdf ? basename(viewer.pdf) : "document.pdf";
    const dest = await save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!dest) return;
    ui.closeOverlay();
    await pdfExport.start(dest, choice);
  }
</script>

<Modal title={t("pdfChoice.title")} icon="download" width="min(540px, 94vw)" height="auto">
  <div class="pdf-choice">
    {#if pictures}
      <p class="what faint">{plural(pictures.pictures, "pdfChoice.picturesOne", "pdfChoice.picturesMany")} · {sizeLabel(pictures.original, lang)}</p>
    {/if}
    <div class="choices" role="radiogroup" aria-label={t("pdfChoice.title")}>
      {#each KINDS as of (of)}
        {@const size = about(of)}
        <label class="choice" class:active={kind === of} data-kind={of}>
          <input type="radio" name="pdf-choice" value={of} bind:group={kind} />
          <span class="name">
            {t(`pdfChoice.${of}`)}
            {#if of === "limit"}
              <input class="input small limit" inputmode="decimal" aria-label={t("pdfChoice.limit")} bind:value={limit} onfocus={() => (kind = "limit")} />
              <span class="unit">{lang === "fr" ? "Mo" : "MB"}</span>
            {/if}
          </span>
          <span class="size" class:over={of === "limit" && reach?.within === false}>
            {#if size !== null}
              {t(of === "original" ? "pdfChoice.exact" : of === "limit" && reach?.within === false ? "pdfChoice.best" : "pdfChoice.about", { size: sizeLabel(size, lang) })}
            {:else if of !== "original" && weighing}
              <span class="spinner"></span>
            {/if}
          </span>
          {#if of !== "limit"}<span class="hint faint">{t(`pdfChoice.${of}Hint`)}</span>{/if}
        </label>
      {/each}
    </div>
    <p class="note faint"><Icon name="shield" size={13} />{t("pdfChoice.note")}</p>
    <div class="buttons">
      <button class="btn" onclick={() => ui.closeOverlay()}>{t("common.cancel")}</button>
      <button class="btn primary" disabled={!ready} onclick={choose}><Icon name="download" size={14} />{t("pdfChoice.export")}</button>
    </div>
  </div>
</Modal>

<style>
  .pdf-choice {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px 18px 14px;
  }
  .what,
  .note {
    margin: 0;
    font-size: 12px;
  }
  .note {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px 10px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .choice:hover {
    background: var(--bg-hover);
  }
  .choice.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .choice input[type="radio"] {
    accent-color: var(--accent);
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .limit {
    width: 64px;
    text-align: right;
    font-weight: 400;
  }
  .unit {
    font-weight: 400;
    color: var(--text-muted);
  }
  .size {
    display: inline-flex;
    align-items: center;
    min-height: 18px;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .size.over {
    color: var(--warning);
  }
  .hint {
    grid-column: 2 / -1;
    font-size: 12px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
