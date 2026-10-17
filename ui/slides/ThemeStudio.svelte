<script lang="ts">
  // The look of the deck, chosen on real slides: the themes drawn on the
  // slide chosen (large, one after the other while this is open), and the
  // look being chosen drawn on its title page and that slide; its shape,
  // its colours (a colour theme, a main colour of one's own), its font, the
  // size of its text. Nothing is written before "Apply"; Cancel or Escape
  // leave the deck as it was. Nothing is built once it is closed.
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { onDestroy, onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { closePdf, loadPdf } from "$lib/pdf/pdfjs";
  import { COLORS, type DeckLook, FONTS, lookSample, MAIN_COLORS, MAIN_THEMES, OTHER_THEMES, RATIOS, ratioValue, readLook, TEXT_SIZES } from "$lib/slides/theme";
  import Icon from "../components/common/Icon.svelte";
  import PageCanvas from "./PageCanvas.svelte";

  let {
    text,
    path,
    frameText,
    titleFrame,
    onapply,
    onclose,
  }: {
    text: string;
    path: string;
    /** The slide chosen, and the title page of the deck (made when it has none). */
    frameText: string;
    titleFrame: string;
    /** What changed of the look (only that is written). */
    onapply: (look: Partial<DeckLook>) => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const was = readLook(text);
  let look = $state<DeckLook>({ ...was });
  const changed = $derived(JSON.stringify(look) !== JSON.stringify(was));
  const ratio = $derived(ratioValue(look.ratio));
  let others = $state(false);
  const FONT_KEYS = {
    default: "slides.look.font.default",
    serif: "slides.look.font.serif",
    structurebold: "slides.look.font.structurebold",
    structureitalicserif: "slides.look.font.structureitalicserif",
    structuresmallcapsserif: "slides.look.font.structuresmallcapsserif",
    professionalfonts: "slides.look.font.professionalfonts",
  } as const;
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // -------------------------------------------- built one after the other

  /** The look being chosen, on its title page and the slide chosen. */
  let preview = $state<PDFDocumentProxy | null>(null);
  let previewing = $state(false);
  /** Each theme drawn on the slide, and what it was drawn with. */
  let drawn = $state<Record<string, { doc: PDFDocumentProxy | null; key: string }>>({});
  let revision = $state(0);
  const slide = $derived(frameText.trim() || "\\begin{frame}{Titre}\\end{frame}");
  /** What the themes are drawn with: everything of the look but the theme. */
  const thumbKey = $derived(JSON.stringify([slide, look.color, look.main, look.font, look.ratio, look.size, look.navigation]));
  const previewKey = $derived(JSON.stringify([slide, titleFrame, look]));
  const themes = $derived(others ? [...MAIN_THEMES, ...OTHER_THEMES] : MAIN_THEMES);

  let runner = 0;
  let previewed = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void previewKey;
    void thumbKey;
    void themes;
    clearTimeout(timer);
    timer = setTimeout(() => void work(), 250);
  });

  async function build(job: string, source: string): Promise<PDFDocumentProxy | null> {
    const result = await ipc.previewPage({ path, job, source }).catch(() => null);
    const bytes = result?.pdf ? await ipc.readBinaryFile(result.pdf).catch(() => null) : null;
    return bytes ? await loadPdf(bytes).catch(() => null) : null;
  }

  /** The preview first, then each theme not drawn with the look as it is. */
  async function work() {
    const my = ++runner;
    for (;;) {
      if (my !== runner) return;
      if (previewed !== previewKey) {
        const key = previewKey;
        previewing = true;
        const doc = await build("slides-look", lookSample(text, [titleFrame, slide], look));
        if (my !== runner) return closePdf(doc);
        previewing = false;
        previewed = key;
        const old = preview;
        preview = doc;
        revision++;
        closePdf(old);
        continue;
      }
      const theme = themes.find((name) => drawn[name]?.key !== thumbKey);
      if (!theme) return;
      const key = thumbKey;
      const doc = await build(`slides-theme-${theme}`, lookSample(text, slide, { ...look, theme }));
      if (my !== runner) return closePdf(doc);
      const old = drawn[theme]?.doc;
      drawn = { ...drawn, [theme]: { doc, key } };
      revision++;
      closePdf(old);
    }
  }

  onMount(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onclose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  onDestroy(() => {
    runner++;
    clearTimeout(timer);
    closePdf(preview);
    for (const d of Object.values(drawn)) closePdf(d.doc);
  });

  const set = (patch: Partial<DeckLook>) => (look = { ...look, ...patch });
</script>

<div class="theme-studio" role="dialog" aria-label={t("slides.look.title")}>
  <header class="studio-bar">
    <Icon name="palette" size={16} />
    <h2>{t("slides.look.title")}</h2>
    <span class="spacer"></span>
    {#if previewing}<span class="status faint"><span class="spinner"></span>{t("slides.look.drawing")}</span>{/if}
    <button class="btn" data-action="cancel-look" onclick={onclose}>{t("common.cancel")}</button>
    <button class="btn primary" data-action="apply-look" disabled={!changed} onclick={() => onapply(Object.fromEntries(Object.entries(look).filter(([k, v]) => was[k as keyof DeckLook] !== v)) as Partial<DeckLook>)}><Icon name="check" size={14} />{t("slides.look.apply")}</button>
  </header>

  <div class="studio-body">
    <section class="themes">
      <h3>{t("slides.look.theme")}</h3>
      <div class="theme-grid">
        {#each themes as theme (theme)}
          {@const d = drawn[theme]}
          <button class="theme" class:on={look.theme === theme} data-theme={theme} onclick={() => set({ theme })}>
            <span class="picture" style:aspect-ratio={ratio}>
              {#if d?.doc}
                <PageCanvas doc={d.doc} page={1} width={232} height={232 / ratio} {revision} />
              {:else if d && !d.doc}
                <span class="faint none">{t("slides.look.unavailable")}</span>
              {:else}
                <span class="spinner"></span>
              {/if}
              {#if d && d.key !== thumbKey}<span class="redrawing"><span class="spinner"></span></span>{/if}
            </span>
            <span class="name">{theme === "default" ? t("slides.look.default") : theme}</span>
          </button>
        {/each}
      </div>
      <button class="btn small more" onclick={() => (others = !others)}><Icon name={others ? "chevron-up" : "chevron-down"} size={13} />{others ? t("slides.look.fewer") : t("slides.look.others", { n: OTHER_THEMES.length })}</button>
    </section>

    <section class="choice">
      <h3>{t("slides.look.preview")}</h3>
      <div class="previews">
        {#each [1, 2] as page (page)}
          <span class="preview" style:aspect-ratio={ratio}>
            {#if preview && preview.numPages >= page}
              <PageCanvas doc={preview} {page} width={300} height={300 / ratio} {revision} />
            {:else}
              <span class="spinner"></span>
            {/if}
          </span>
        {/each}
      </div>

      <div class="settings">
        <div class="setting">
          <span class="label">{t("slides.look.format")}</span>
          <div class="seg" role="group">
            {#each RATIOS.slice(0, 3) as r (r.id)}
              <button class:on={look.ratio === r.id} data-ratio={r.id} onclick={() => set({ ratio: r.id })}>{r.label}</button>
            {/each}
            {#if !RATIOS.slice(0, 3).some((r) => r.id === look.ratio)}<button class="on">{RATIOS.find((r) => r.id === look.ratio)?.label ?? look.ratio}</button>{/if}
          </div>
        </div>
        <div class="setting column">
          <span class="label">{t("slides.look.colors")}</span>
          <div class="colors">
            {#each COLORS as c (c.id)}
              <button class="color" class:on={look.color === c.id} data-color={c.id} onclick={() => set({ color: c.id })}>
                <span class="swatch" style:background={c.swatch}></span>
                <span>{c.id === "default" ? t("slides.look.default") : capital(c.id)}</span>
              </button>
            {/each}
          </div>
        </div>
        <div class="setting">
          <span class="label">{t("slides.look.main")}</span>
          <div class="mains">
            <button class="main theirs" class:on={!look.main} data-main="theme" title={t("slides.look.mainTheme")} onclick={() => set({ main: null })}>{t("slides.look.mainTheme")}</button>
            {#each MAIN_COLORS as c (c)}
              <button class="main" class:on={look.main === c} data-main={c} title={c} aria-label={c} style:background={c} onclick={() => set({ main: c })}></button>
            {/each}
            <label class="main custom" class:on={!!look.main && !MAIN_COLORS.includes(look.main)} title={t("slides.look.mainOther")} style:background={look.main && !MAIN_COLORS.includes(look.main) ? look.main : undefined}>
              <Icon name="plus" size={12} />
              <input type="color" value={look.main ?? "#1e63d6"} onchange={(e) => set({ main: (e.currentTarget as HTMLInputElement).value })} aria-label={t("slides.look.mainOther")} />
            </label>
          </div>
        </div>
        <div class="setting">
          <span class="label">{t("slides.look.font")}</span>
          <select class="input" data-font value={look.font} onchange={(e) => set({ font: (e.currentTarget as HTMLSelectElement).value })}>
            {#each FONTS as f (f)}<option value={f}>{t(FONT_KEYS[f as keyof typeof FONT_KEYS])}</option>{/each}
            {#if !FONTS.includes(look.font)}<option value={look.font}>{look.font}</option>{/if}
          </select>
        </div>
        <div class="setting">
          <span class="label">{t("slides.look.size")}</span>
          <div class="seg" role="group">
            {#each TEXT_SIZES as size (size)}
              <button class:on={look.size === size} data-size={size} onclick={() => set({ size })}>{size.replace("pt", "")}</button>
            {/each}
          </div>
        </div>
        <details class="advanced">
          <summary><Icon name="chevron-right" size={12} />{t("slides.look.advanced")}</summary>
          <div class="setting">
            <span class="label">{t("slides.look.otherRatios")}</span>
            <select class="input" value={look.ratio} onchange={(e) => set({ ratio: (e.currentTarget as HTMLSelectElement).value })}>
              {#each RATIOS as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
            </select>
          </div>
          <label class="check"><input type="checkbox" checked={look.navigation} onchange={(e) => set({ navigation: (e.currentTarget as HTMLInputElement).checked })} />{t("slides.look.navigation")}</label>
        </details>
      </div>
    </section>
  </div>
</div>

<style>
  .theme-studio {
    position: absolute;
    inset: 44px 0 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .studio-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .studio-bar h2 {
    margin: 0;
    font-size: 15px;
  }
  .spacer {
    flex: 1;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .studio-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 42%);
  }
  section {
    min-height: 0;
    overflow: auto;
    padding: 16px 20px 24px;
  }
  .choice {
    border-left: 1px solid var(--border);
    background: var(--bg-elev);
  }
  h3 {
    margin: 0 0 10px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
    gap: 12px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 2px solid transparent;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    color: var(--text);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .theme:hover {
    border-color: var(--border-strong);
  }
  .theme.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .picture,
  .preview {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    overflow: hidden;
    border-radius: 4px;
    background: #fff;
  }
  .picture :global(.box),
  .preview :global(.box) {
    width: 100% !important;
  }
  .picture :global(canvas),
  .preview :global(canvas) {
    width: 100% !important;
    height: auto !important;
  }
  .redrawing {
    position: absolute;
    top: 6px;
    right: 6px;
  }
  .none {
    font-size: 12px;
  }
  .more {
    margin-top: 14px;
  }
  .previews {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .preview {
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  }
  .settings {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 18px;
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .setting.column {
    flex-direction: column;
    align-items: stretch;
  }
  .label {
    min-width: 120px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .seg {
    display: flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .seg button {
    min-width: 46px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-contrast);
    font-weight: 600;
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
    height: 26px;
    padding: 0 9px 0 5px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }
  .color.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .swatch {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
  }
  .mains {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .main {
    position: relative;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 2px solid transparent;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }
  .main.on {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .main.theirs {
    width: auto;
    padding: 0 10px;
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 11.5px;
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .main.custom {
    background: var(--bg-input);
    color: var(--text-muted);
  }
  .main.custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .setting select {
    width: auto;
    min-width: 200px;
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
  .advanced .setting {
    margin-top: 10px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 12.5px;
  }
</style>
