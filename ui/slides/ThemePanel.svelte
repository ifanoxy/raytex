<script lang="ts">
  // The look of the deck: the shape of its slides, its theme (each drawn on
  // the slide chosen, built one after the other while this panel is open),
  // its colours and its fonts; what is chosen is written in the preamble
  // and the deck built again. Nothing is built while it is closed.
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { onDestroy } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { closePdf, loadPdf } from "$lib/pdf/pdfjs";
  import { COLORS, type DeckLook, FONTS, lookSample, MAIN_THEMES, OTHER_THEMES, RATIOS, ratioValue, readLook } from "$lib/slides/theme";
  import Icon from "../components/common/Icon.svelte";
  import PageCanvas from "./PageCanvas.svelte";

  let { text, path, frameText, onlook }: { text: string; path: string; frameText: string; onlook: (look: Partial<DeckLook>) => void } = $props();

  const look = $derived(readLook(text));
  const FONT_KEYS = {
    default: "slides.look.font.default",
    serif: "slides.look.font.serif",
    structurebold: "slides.look.font.structurebold",
    structureitalicserif: "slides.look.font.structureitalicserif",
    structuresmallcapsserif: "slides.look.font.structuresmallcapsserif",
    professionalfonts: "slides.look.font.professionalfonts",
  } as const;

  // ------------------------------------------------- the themes, drawn

  let drawn = $state<Record<string, PDFDocumentProxy | null>>({});
  let revision = $state(0);
  let round = 0;
  /** What the themes are drawn on: the slide chosen, with the colours, the fonts and the shape of the deck. */
  const sampleKey = $derived(JSON.stringify([frameText, look.color, look.font, look.ratio, look.navigation]));
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void sampleKey;
    clearTimeout(timer);
    timer = setTimeout(() => void drawAll(), 400);
  });

  async function drawAll() {
    const my = ++round;
    const slide = frameText.trim() || "\\begin{frame}{Titre}\n\\end{frame}";
    const deck = text;
    for (const theme of MAIN_THEMES) {
      const source = lookSample(deck, slide, { theme });
      const result = await ipc.previewPage({ path, job: `slides-theme-${theme}`, source }).catch(() => null);
      if (my !== round) return;
      const bytes = result?.pdf ? await ipc.readBinaryFile(result.pdf).catch(() => null) : null;
      const doc = bytes ? await loadPdf(bytes).catch(() => null) : null;
      if (my !== round) {
        closePdf(doc);
        return;
      }
      const old = drawn[theme];
      drawn = { ...drawn, [theme]: doc };
      revision++;
      closePdf(old);
    }
  }

  onDestroy(() => {
    round++;
    clearTimeout(timer);
    for (const doc of Object.values(drawn)) closePdf(doc);
  });

  const ratioShown = $derived(ratioValue(look.ratio));
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<div class="theme-panel">
  <div class="group">
    <span class="label faint">{t("slides.look.format")}</span>
    <div class="seg" role="group">
      {#each RATIOS.slice(0, 3) as r (r.id)}
        <button class:on={look.ratio === r.id} data-ratio={r.id} onclick={() => look.ratio !== r.id && onlook({ ratio: r.id })}>{r.label}</button>
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="label faint">{t("slides.look.theme")}</span>
    <div class="themes">
      {#each MAIN_THEMES as theme (theme)}
        <button class="theme" class:on={look.theme === theme} data-theme={theme} onclick={() => look.theme !== theme && onlook({ theme })}>
          <span class="picture" style:aspect-ratio={ratioShown}>
            {#if drawn[theme]}
              <PageCanvas doc={drawn[theme]} page={1} width={176} height={176 / ratioShown} {revision} />
            {:else if drawn[theme] === null}
              <span class="faint none">—</span>
            {:else}
              <span class="spinner"></span>
            {/if}
          </span>
          <span class="name">{theme === "default" ? t("slides.look.default") : theme}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="label faint">{t("slides.look.colors")}</span>
    <div class="colors">
      {#each COLORS as c (c.id)}
        <button class="color" class:on={look.color === c.id} data-color={c.id} title={c.id} onclick={() => look.color !== c.id && onlook({ color: c.id })}>
          <span class="swatch" style:background={c.swatch}></span>
          <span>{c.id === "default" ? t("slides.look.default") : capital(c.id)}</span>
        </button>
      {/each}
    </div>
  </div>

  <label class="group">
    <span class="label faint">{t("slides.look.font")}</span>
    <select class="input" data-font value={look.font} onchange={(e) => onlook({ font: (e.currentTarget as HTMLSelectElement).value })}>
      {#each FONTS as f (f)}<option value={f}>{t(FONT_KEYS[f as keyof typeof FONT_KEYS])}</option>{/each}
      {#if !FONTS.includes(look.font)}<option value={look.font}>{look.font}</option>{/if}
    </select>
  </label>

  <details class="advanced">
    <summary><Icon name="chevron-right" size={12} />{t("slides.look.advanced")}</summary>
    <label class="row">
      <span>{t("slides.look.otherThemes")}</span>
      <select class="input" value={MAIN_THEMES.includes(look.theme) ? "" : look.theme} onchange={(e) => (e.currentTarget as HTMLSelectElement).value && onlook({ theme: (e.currentTarget as HTMLSelectElement).value })}>
        <option value="">—</option>
        {#each OTHER_THEMES as theme (theme)}<option value={theme}>{theme}</option>{/each}
        {#if !MAIN_THEMES.includes(look.theme) && !OTHER_THEMES.includes(look.theme)}<option value={look.theme}>{look.theme}</option>{/if}
      </select>
    </label>
    <label class="row">
      <span>{t("slides.look.otherRatios")}</span>
      <select class="input" value={look.ratio} onchange={(e) => onlook({ ratio: (e.currentTarget as HTMLSelectElement).value })}>
        {#each RATIOS as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
      </select>
    </label>
    <label class="check"><input type="checkbox" checked={look.navigation} onchange={(e) => onlook({ navigation: (e.currentTarget as HTMLInputElement).checked })} />{t("slides.look.navigation")}</label>
  </details>
</div>

<style>
  .theme-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 12px;
  }
  .seg {
    display: flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .seg button {
    flex: 1;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px;
    border: 2px solid transparent;
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text);
    font-size: 11.5px;
    cursor: pointer;
  }
  .theme:hover {
    border-color: var(--border-strong);
  }
  .theme.on {
    border-color: var(--accent);
  }
  .picture {
    display: grid;
    place-items: center;
    width: 100%;
    overflow: hidden;
    border-radius: 3px;
    background: var(--bg);
  }
  .none {
    font-size: 12px;
  }
  .name {
    text-align: left;
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .color {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px 0 5px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 11.5px;
    cursor: pointer;
  }
  .color.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
  }
  .advanced summary {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    list-style: none;
  }
  .advanced[open] summary :global(svg) {
    transform: rotate(90deg);
  }
  .advanced .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
  }
  .advanced .row select {
    width: auto;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 12px;
  }
</style>
