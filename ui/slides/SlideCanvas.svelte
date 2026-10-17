<script lang="ts">
  // The slide being edited, drawn as a page of the shape of the deck: its
  // title and its blocks, typed into where they are. A click chooses a
  // block (its tools above it), its handle moves it, a + between two blocks
  // (or what is dragged from the bar) adds one there; the line at the
  // bottom of the page shows where the slide ends. The real slide, as
  // Beamer draws it, is shown beside.
  import { t } from "$lib/i18n.svelte";
  import type { Block, BlockKind } from "$lib/slides/blocks";
  import Icon from "../components/common/Icon.svelte";
  import BlockTools from "./BlockTools.svelte";
  import BlockView from "./BlockView.svelte";
  import { type Carried, drag } from "./drag.svelte";
  import InsertMenu from "./InsertMenu.svelte";
  import RichText from "./RichText.svelte";

  let {
    title,
    titlePage,
    blocks,
    path,
    dir,
    lang,
    unit,
    steps,
    ratio,
    selected = $bindable(-1),
    focus = $bindable(null),
    onchange,
    onsplit,
    onremove,
    ontitle,
    oninsert,
    onduplicate,
    ondelete,
    onpicture,
    ondropped,
  }: {
    title: string;
    titlePage: boolean;
    blocks: Block[];
    path: string | null;
    dir: string | null;
    lang: "fr" | "en";
    unit: string;
    steps: number;
    ratio: number;
    selected?: number;
    /** A block whose text gets the caret once it is drawn (a block just made). */
    focus?: { index: number; part: number } | null;
    onchange: (i: number, edit: (b: Block) => Block | null) => void;
    onsplit: (i: number, first: Block, second: Block) => void;
    onremove: (i: number) => void;
    ontitle: (title: string) => void;
    oninsert: (before: number, kind: BlockKind, variant: string) => void;
    onduplicate: (i: number) => void;
    ondelete: (i: number) => void;
    onpicture: (i: number) => void;
    /** What was dragged, let go on a place (`before:2`, `column:1:0`). */
    ondropped: (place: string, carried: Carried) => void;
  } = $props();

  // ---------------------------------------------------------- its size

  let holder = $state<HTMLElement | null>(null);
  let room = $state(800);
  $effect(() => {
    if (!holder) return;
    const observer = new ResizeObserver(([entry]) => (room = entry.contentRect.width));
    observer.observe(holder);
    return () => observer.disconnect();
  });
  const width = $derived(Math.max(320, Math.min(room - 72, 1100)));
  /** The text of Beamer (11 pt) on a slide 16 cm wide (12.8 cm in 4:3). */
  const fontSize = $derived(width / (ratio > 1.45 ? 40 : 33));

  // While something is carried near the top or the bottom of the slide, it scrolls.
  $effect(() => {
    const y = drag.y;
    if (!drag.carried || !holder) return;
    const r = holder.getBoundingClientRect();
    if (drag.x < r.left || drag.x > r.right) return;
    if (y < r.top + 48) holder.scrollTop -= 14;
    else if (y > r.bottom - 48) holder.scrollTop += 14;
  });

  // ------------------------------------------------- the text with the caret

  let insertAt = $state<number | null>(null);
  const label = (b: Block) => t(`slides.block.${b.kind}` as "slides.block.text");
</script>

<div class="canvas" bind:this={holder}>
  <!-- The tools of the element chosen: always here, never over the slide. -->
  <div class="context">
    {#if blocks[selected]}
      <span class="what">{label(blocks[selected])}</span>
      <BlockTools
        block={blocks[selected]}
        {steps}
        {unit}
        onchange={(edit) => onchange(selected, edit)}
        onduplicate={() => onduplicate(selected)}
        ondelete={() => ondelete(selected)}
        onpicture={() => onpicture(selected)}
      />
    {:else}
      <span class="hint faint">{t("slides.canvas.hint")}</span>
    {/if}
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="paper" style:width="{width}px" style:min-height="{width / ratio}px" style:font-size="{fontSize}px" onclick={(e) => e.target === e.currentTarget && (selected = -1)}>
    <div class="frame-title">
      {#if titlePage}
        <span class="title-page"><Icon name="title-page" size={16} />{t("slides.titlePage")}</span>
      {:else}
        <RichText value={title} {path} single placeholder={t("slides.canvas.titleHere")} onchange={ontitle} onfocus={() => (selected = -1)} class="title-text" />
      {/if}
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="body" onclick={(e) => e.target === e.currentTarget && (selected = -1)}>
      {#each blocks as b, i (i)}
        <div class="gap" class:carrying={!!drag.carried} class:over={drag.over === `before:${i}`} data-drop="before:{i}">
          {#if !drag.carried}<button class="insert" title={t("slides.canvas.insertHere")} aria-label={t("slides.canvas.insertHere")} onclick={() => (insertAt = insertAt === i ? null : i)}><Icon name="plus" size={12} /></button>{/if}
          {#if insertAt === i}<InsertMenu onpick={(kind, variant) => ((insertAt = null), oninsert(i, kind, variant))} onclose={() => (insertAt = null)} />{/if}
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="block"
          class:selected={i === selected}
          class:moving={drag.carried?.kind === "block" && drag.carried.value === String(i)}
          data-block={i}
          data-kind={b.kind}
          onpointerdown={(e) => !(e.target as HTMLElement).closest(".block-tools") && (selected = i)}
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span
            class="handle"
            title={t("slides.tools.drag")}
            onpointerdown={(e) => {
              e.preventDefault();
              selected = i;
              drag.start(e, { kind: "block", value: String(i), label: label(b) }, ondropped);
            }}><Icon name="grip" size={14} /></span>
          <BlockView
            block={b}
            index={i}
            {path}
            {dir}
            {lang}
            {unit}
            selected={i === selected}
            focusPart={focus?.index === i ? focus.part : null}
            onchange={(edit) => onchange(i, edit)}
            onsplit={(first, second) => onsplit(i, first, second)}
            onremove={() => onremove(i)}
            ontext={() => (selected = i)}
            onfocused={() => (focus = null)}
          />
        </div>
      {/each}
      <div class="gap last" class:carrying={!!drag.carried} class:over={drag.over === `before:${blocks.length}`} data-drop="before:{blocks.length}">
        {#if !drag.carried}
          <button class="add" onclick={() => (insertAt = insertAt === blocks.length ? null : blocks.length)}><Icon name="plus" size={13} />{blocks.length ? t("slides.canvas.addBlock") : t("slides.canvas.firstBlock")}</button>
        {/if}
        {#if insertAt === blocks.length}<InsertMenu onpick={(kind, variant) => ((insertAt = null), oninsert(blocks.length, kind, variant))} onclose={() => (insertAt = null)} />{/if}
      </div>
    </div>
    <div class="slide-end" style:top="{width / ratio}px"><span>{t("slides.canvas.end")}</span></div>
  </div>
</div>

<style>
  .canvas {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 28px 36px 60px;
    background: var(--bg-panel);
  }
  .paper {
    position: relative;
    margin: 0 auto;
    padding: 0 0 1.2em;
    border-radius: 4px;
    background: #fff;
    color: #1d1d24;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    font-family: "Latin Modern Sans", "CMU Sans Serif", "Helvetica Neue", Arial, sans-serif;
  }
  .frame-title {
    /* Its text where the text of the slide begins. */
    padding: 0.38em calc(1.31em + 1px) 0.31em;
    border-radius: 4px 4px 0 0;
    background: color-mix(in srgb, var(--slide-accent, #3333b3) 12%, #fff);
    color: var(--slide-accent, #3333b3);
    font-size: 1.45em;
    font-weight: 600;
  }
  .title-page {
    display: flex;
    align-items: center;
    gap: 0.4em;
    font-size: 0.7em;
  }
  .body {
    padding: 0.4em 1.6em 0;
  }
  .block {
    position: relative;
    padding: 0.15em 0.3em;
    border: 1px solid transparent;
    border-radius: 4px;
  }
  .block:hover {
    border-color: rgba(51, 51, 179, 0.25);
  }
  .block.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .block.moving {
    opacity: 0.35;
  }
  .handle {
    position: absolute;
    top: 0.1em;
    left: -1.25em;
    display: grid;
    place-items: center;
    width: 1em;
    height: 1.3em;
    border-radius: 3px;
    color: #9a9aa6;
    cursor: grab;
    opacity: 0;
    touch-action: none;
  }
  .block:hover .handle,
  .block.selected .handle {
    opacity: 1;
  }
  .handle:hover {
    background: rgba(51, 51, 179, 0.1);
    color: var(--accent);
  }
  .context {
    position: sticky;
    top: -28px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    margin: -28px -36px 22px;
    padding: 6px 36px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .context .what {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  @media (max-width: 1500px) {
    .context .what {
      display: none;
    }
  }
  .context .hint {
    font-size: 12px;
  }
  .context :global(.block-tools) {
    box-shadow: none;
  }
  .gap {
    position: relative;
    height: 0.45em;
  }
  .gap.carrying {
    height: 1.1em;
  }
  .gap.over::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 3px;
    margin-top: -1.5px;
    border-radius: 2px;
    background: var(--accent);
  }
  .insert {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 1px solid var(--accent);
    border-radius: 50%;
    background: #fff;
    color: var(--accent);
    cursor: pointer;
    opacity: 0;
  }
  .gap:hover .insert {
    opacity: 1;
  }
  .gap.last {
    height: auto;
    min-height: 2.2em;
    padding-top: 0.4em;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px dashed #b4b4c4;
    border-radius: 6px;
    background: none;
    color: #6a6a7a;
    font-size: 12px;
    cursor: pointer;
  }
  .add:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .slide-end {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed rgba(200, 60, 60, 0.45);
    pointer-events: none;
  }
  .slide-end span {
    position: absolute;
    right: 6px;
    top: 2px;
    color: rgba(200, 60, 60, 0.7);
    font-size: 10px;
  }
  :global(body.slides-dragging) {
    cursor: grabbing !important;
    user-select: none;
  }
  .paper :global(.column[data-drop]) {
    outline: 1px dashed transparent;
  }
  :global(body.slides-dragging) .paper :global(.column[data-drop]) {
    outline-color: rgba(51, 51, 179, 0.35);
  }
</style>
