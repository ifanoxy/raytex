<script lang="ts">
  // The presenter's view, in the main window while the slides are shown
  // full screen in a window of their own (on the projector when there is
  // one): the page shown and the next one, the notes of the slide, the
  // time gone by; the arrows, the space bar, a click there move from step
  // to step, B shows black, Escape ends. Nothing runs when not presenting.
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { onDestroy, onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import type { Frame } from "$lib/slides/deck";
  import Icon from "../components/common/Icon.svelte";
  import PageCanvas from "./PageCanvas.svelte";

  let {
    doc,
    pdf,
    built,
    pages,
    frames,
    start,
    ratio,
    revision,
    onend,
  }: { doc: PDFDocumentProxy; pdf: string; built: number; pages: [number, number][]; frames: Frame[]; start: number; ratio: number; revision: number; onend: (page: number) => void } = $props();

  // svelte-ignore state_referenced_locally
  let page = $state(Math.max(1, Math.min(start, doc.numPages)));
  let black = $state(false);
  /** The page the window of the presentation last drew (0: none yet). */
  let drawn = $state(0);
  let screens = $state<{ name: string; main: boolean }[]>([]);
  let screen = $state(-1);

  const total = $derived(doc.numPages);
  /** The slide of a page (from the `.nav`; one page a slide without it). */
  const frameOf = (p: number) => {
    const k = pages.findIndex(([a, b]) => p >= a && p <= b);
    return k >= 0 ? k : Math.min(frames.length - 1, p - 1);
  };
  const slide = $derived(frameOf(page));
  const steps = $derived(pages[slide] ? pages[slide][1] - pages[slide][0] + 1 : 1);
  const stepAt = $derived(pages[slide] ? page - pages[slide][0] + 1 : 1);
  const notes = $derived(frames[slide]?.notes.map((n) => n.text.trim()).filter(Boolean) ?? []);

  function go(to: number) {
    page = Math.max(1, Math.min(total, to));
    black = false;
  }

  function act(key: string) {
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"].includes(key)) go(page + 1);
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(key)) go(page - 1);
    else if (key === "Home") go(1);
    else if (key === "End") go(total);
    else if (key === "b" || key === "B" || key === ".") black = !black;
    else if (key === "Escape") onend(page);
  }

  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    act(e.key);
  }

  // ------------------------------------------- the window of the presentation

  function send() {
    void ipc.tell("present", "present:show", { pdf, built, page, black }).catch(() => {});
  }
  $effect(() => {
    void page;
    void black;
    void built;
    send();
  });

  const stops: (() => void)[] = [];
  let ended = false;
  onMount(() => {
    void (async () => {
      stops.push(await ipc.on("present:key", ({ key }) => act(key)));
      stops.push(await ipc.on("present:ready", () => send()));
      stops.push(await ipc.on("present:drawn", ({ page: p }) => (drawn = p)));
      stops.push(
        await ipc.on("present:closed", () => {
          if (!ended) onend(page);
        }),
      );
      screens = await ipc.presentScreens().catch(() => []);
      screen = await ipc.presentOpen(null).catch(() => -1);
    })();
  });
  onDestroy(() => {
    ended = true;
    for (const stop of stops) stop();
    clearInterval(clock);
    void ipc.presentClose().catch(() => {});
  });

  async function nextScreen() {
    if (screens.length < 2) return;
    screen = await ipc.presentOpen((screen + 1) % screens.length).catch(() => screen);
  }

  // ---------------------------------------------------------------- time

  let began = Date.now();
  let pausedAt = $state<number | null>(null);
  let now = $state(Date.now());
  const clock = setInterval(() => (now = Date.now()), 500);
  const elapsed = $derived(Math.max(0, Math.floor(((pausedAt ?? now) - began) / 1000)));
  const shown = $derived(`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`);
  function pause() {
    if (pausedAt === null) pausedAt = Date.now();
    else {
      began += Date.now() - pausedAt;
      pausedAt = null;
    }
  }
  function reset() {
    began = Date.now();
    if (pausedAt !== null) pausedAt = began;
    now = began;
  }

  // ------------------------------------------------------------ the sizes

  let area = $state<HTMLElement | null>(null);
  let areaSize = $state({ width: 0, height: 0 });
  $effect(() => {
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => (areaSize = { width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(area);
    return () => observer.disconnect();
  });
  const currentWidth = $derived(Math.max(0, Math.min(areaSize.width * 0.62, (areaSize.height - 8) * ratio)));
  const nextWidth = $derived(Math.max(0, Math.min(areaSize.width * 0.34, ((areaSize.height - 8) * 0.45) * ratio)));
</script>

<svelte:window onkeydown={key} />

<div class="presenter" data-page={page} data-drawn={drawn} data-screen={screen}>
  <header class="bar">
    <button class="btn small" data-action="end" onclick={() => onend(page)}><Icon name="stop" size={13} />{t("slides.present.end")}</button>
    <span class="where">{t("slides.present.where", { n: slide + 1, total: frames.length })}{#if steps > 1}<span class="faint"> · {t("slides.present.step", { n: stepAt, total: steps })}</span>{/if}</span>
    <span class="spacer"></span>
    <span class="clock" class:paused={pausedAt !== null}><Icon name="clock" size={14} />{shown}</span>
    <button class="icon-btn" title={pausedAt === null ? t("slides.present.pause") : t("slides.present.resume")} aria-label={pausedAt === null ? t("slides.present.pause") : t("slides.present.resume")} onclick={pause}><Icon name={pausedAt === null ? "stop" : "play"} size={14} /></button>
    <button class="icon-btn" title={t("slides.present.reset")} aria-label={t("slides.present.reset")} onclick={reset}><Icon name="refresh" size={14} /></button>
    <span class="sep"></span>
    <button class="btn small" class:on={black} data-action="black" onclick={() => (black = !black)}>{t("slides.present.black")}</button>
    {#if screens.length > 1}<button class="btn small" data-action="screen" onclick={nextScreen}><Icon name="display" size={13} />{t("slides.present.screen", { name: screens[screen]?.name ?? "" })}</button>{/if}
  </header>
  <div class="area" bind:this={area}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="current" onclick={() => go(page + 1)}>
      <PageCanvas {doc} {page} width={currentWidth} height={currentWidth / ratio} {revision} />
      {#if black}<span class="black-badge">{t("slides.present.black")}</span>{/if}
    </div>
    <div class="side">
      <span class="faint label">{page < total ? t("slides.present.next") : t("slides.present.last")}</span>
      {#if page < total}<PageCanvas {doc} page={page + 1} width={nextWidth} height={nextWidth / ratio} {revision} />{/if}
      <span class="faint label">{t("slides.notes")}</span>
      <div class="notes">
        {#each notes as note, k (k)}<p>{note}</p>{:else}<p class="faint">{t("slides.present.noNotes")}</p>{/each}
      </div>
    </div>
  </div>
  <footer class="moves">
    <button class="btn" aria-label={t("slides.present.previous")} disabled={page <= 1} onclick={() => go(page - 1)}><Icon name="chevron-left" size={16} /></button>
    <span class="faint">{page} / {total}</span>
    <button class="btn" aria-label={t("slides.present.nextStep")} disabled={page >= total} onclick={() => go(page + 1)}><Icon name="chevron-right" size={16} /></button>
  </footer>
</div>

<style>
  .presenter {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    grid-template-rows: 44px minmax(0, 1fr) 48px;
    background: #0d0b14;
    color: #eee;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .where {
    font-size: 13px;
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.12);
  }
  .clock {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
  .clock.paused {
    opacity: 0.5;
  }
  .btn.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .area {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 24px;
    padding: 18px 20px 4px;
    min-height: 0;
  }
  .current {
    position: relative;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }
  .black-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    background: #000;
    color: #fff;
    font-size: 12px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    max-height: 100%;
  }
  .label {
    font-size: 12px;
  }
  .notes {
    flex: 1;
    min-height: 60px;
    overflow: auto;
    font-size: 17px;
    line-height: 1.5;
  }
  .notes p {
    margin: 0 0 10px;
    white-space: pre-wrap;
  }
  .moves {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-size: 12px;
  }
</style>
