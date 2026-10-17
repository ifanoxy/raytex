<script lang="ts">
  // A block of a slide, drawn on the slide being edited and edited there:
  // a text typed into, the points of a list (Enter makes the next one, a
  // point emptied and Backspace takes it off), a picture and its width (its
  // handle), columns and their widths (the line between them), a formula
  // drawn and its LaTeX under it, the cells of a table, a box and its title,
  // code. What is inside a box or a column is blocks too. Each change gives
  // the block as it is to be written; nothing is placed by coordinates.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { onDestroy, tick } from "svelte";
  import { displayHtml } from "$lib/editor/math-preview";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { closePdf, loadPdf } from "$lib/pdf/pdfjs";
  import { addToText, alignOf, type Block, editInText, type Grid, gridAddRow, gridCode, newBlock, revealStep, specColumns, splitInText, tableGrid, textBlocks } from "$lib/slides/blocks";
  import { join } from "$lib/utils";
  import { drag } from "./drag.svelte";
  import Icon from "../components/common/Icon.svelte";
  import BlockView from "./BlockView.svelte";
  import PageCanvas from "./PageCanvas.svelte";
  import RichText from "./RichText.svelte";

  let {
    block,
    index = 0,
    path,
    dir,
    lang,
    unit = "\t",
    selected = false,
    nested = false,
    focusPart = null,
    onchange,
    onsplit,
    onremove,
    ontext,
    onfocused,
  }: {
    block: Block;
    index?: number;
    /** The deck (for the macros of its formulas) and its folder (for its pictures). */
    path: string | null;
    dir: string | null;
    lang: "fr" | "en";
    /** The indentation of a level in the document. */
    unit?: string;
    selected?: boolean;
    /** Inside a box or a column: no columns there to drop into. */
    nested?: boolean;
    /** The part to put the caret in (a point of a list; 0: the first text), once drawn. */
    focusPart?: number | null;
    /** The block as it is to be written (null: taken out). */
    onchange: (edit: (b: Block) => Block | null) => void;
    /** Enter in a text: the block cut in two. */
    onsplit?: (first: Block, second: Block) => void;
    /** Backspace in an empty text. */
    onremove?: () => void;
    /** A text of it has the caret (its block is then the one chosen). */
    ontext?: () => void;
    onfocused?: () => void;
  } = $props();

  const SIZE_SCALE: Record<string, number> = { tiny: 0.5, scriptsize: 0.7, footnotesize: 0.8, small: 0.9, large: 1.2, Large: 1.44, LARGE: 1.73, huge: 2.07, Huge: 2.49 };
  const rs = $derived(revealStep(block));

  // ------------------------------------------------- the caret, once drawn

  let texts: (RichText | null)[] = $state([]);
  let firstText = $state<RichText | null>(null);
  $effect(() => {
    const part = focusPart;
    void block;
    if (part === null || part === undefined) return;
    void tick().then(() => {
      const target = block.kind === "list" ? texts[part] : firstText;
      if (target) {
        target.focusAt(block.kind === "list" ? "start" : "end");
        onfocused?.();
      }
    });
  });

  // ------------------------------------------------------------ the lists

  let focusItem: number | null = null;
  $effect(() => {
    void block.items?.length;
    const k = focusItem;
    if (k === null) return;
    void tick().then(() => {
      if (texts[k]) {
        texts[k]!.focusAt("start");
        focusItem = null;
      }
    });
  });

  function itemEnter(k: number, before: string, after: string) {
    focusItem = k + 1;
    onchange((b) => ({ ...b, items: [...(b.items ?? []).slice(0, k), { ...(b.items?.[k] ?? { overlay: "" }), text: before }, { text: after, overlay: "" }, ...(b.items ?? []).slice(k + 1)] }));
  }

  function itemEmpty(k: number) {
    if ((block.items?.length ?? 0) <= 1) {
      onremove?.();
      return;
    }
    focusItem = Math.max(0, k - 1);
    onchange((b) => ({ ...b, items: (b.items ?? []).filter((_, n) => n !== k) }));
  }

  // ------------------------------------------------------------ pictures

  let src = $state<string | null>(null);
  let pdf = $state<PDFDocumentProxy | null>(null);
  let missing = $state(false);
  $effect(() => {
    const file = block.kind === "image" ? block.path : null;
    const folder = dir;
    if (!file || !folder) return;
    let gone = false;
    void (async () => {
      missing = false;
      if (/^example-image/.test(file)) {
        src = null;
        closePdf(pdf);
        pdf = null;
        return;
      }
      for (const ext of ["", ".png", ".jpg", ".jpeg", ".pdf", ".PNG", ".JPG"]) {
        const full = join(folder, file + ext);
        if (/\.[A-Za-z]{2,4}$/.test(file + ext) && (await ipc.pathExists(full).catch(() => false))) {
          if (gone) return;
          if (/\.pdf$/i.test(full)) {
            const bytes = await ipc.readBinaryFile(full).catch(() => null);
            const doc = bytes ? await loadPdf(bytes).catch(() => null) : null;
            if (gone) return closePdf(doc);
            closePdf(pdf);
            pdf = doc;
            src = null;
          } else {
            closePdf(pdf);
            pdf = null;
            src = convertFileSrc(full);
          }
          return;
        }
      }
      if (!gone) missing = true;
    })();
    return () => {
      gone = true;
    };
  });
  onDestroy(() => closePdf(pdf));

  /** The width being set by its handle (the share of the text), before it is written. */
  let widthDragged = $state<number | null>(null);
  const width = $derived(widthDragged ?? Number(block.width || "0.7"));
  function resize(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const holder = (e.currentTarget as HTMLElement).closest<HTMLElement>(".picture-row");
    if (!holder) return;
    const full = holder.getBoundingClientRect().width;
    const start = e.clientX;
    const from = width;
    const move = (m: PointerEvent) => (widthDragged = Math.max(0.1, Math.min(1, Math.round((from + (m.clientX - start) / full) * 20) / 20)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const w = widthDragged;
      widthDragged = null;
      if (w !== null && Math.abs(w - from) > 0.001) onchange((b) => ({ ...b, width: String(w) }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ------------------------------------------------------------ columns

  let colsDragged = $state<number[] | null>(null);
  const colWidths = $derived(colsDragged ?? (block.columns ?? []).map((c) => Number(c.width) || 0.48));
  function resizeColumns(e: PointerEvent, k: number) {
    e.preventDefault();
    e.stopPropagation();
    const row = (e.currentTarget as HTMLElement).closest<HTMLElement>(".columns");
    if (!row) return;
    const full = row.getBoundingClientRect().width;
    const start = e.clientX;
    const from = [...colWidths];
    const move = (m: PointerEvent) => {
      const d = Math.round(((m.clientX - start) / full) * 50) / 50;
      const a = Math.max(0.1, Math.min(from[k] + from[k + 1] - 0.1, from[k] + d));
      colsDragged = from.map((w, n) => (n === k ? a : n === k + 1 ? Math.round((from[k] + from[k + 1] - a) * 100) / 100 : w));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const w = colsDragged;
      colsDragged = null;
      if (w) onchange((b) => ({ ...b, columns: b.columns?.map((c, n) => ({ ...c, width: String(Math.round(w[n] * 100) / 100) })) }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** What is inside a box or a column changed: written in its text. */
  const inText = (text: string, j: number, edit: (b: Block) => Block | null) => editInText(text, j, edit);

  // ------------------------------------------------------------ formulas

  let formulaHtml = $state("");
  $effect(() => {
    const latex = block.kind === "formula" ? block.text : null;
    if (latex === null) return;
    void displayHtml(latex, path).then((h) => (formulaHtml = h));
  });
  let formulaTimer: ReturnType<typeof setTimeout> | undefined;
  /** The LaTeX of the formula shown under it (a click on it; always for the block chosen). */
  let formulaOpen = $state(false);
  function formulaTyped(e: Event) {
    const v = (e.currentTarget as HTMLTextAreaElement).value;
    void displayHtml(v, path).then((h) => (formulaHtml = h));
    clearTimeout(formulaTimer);
    formulaTimer = setTimeout(() => onchange((b) => ({ ...b, text: v })), 600);
  }

  const grid = $derived(block.kind === "table" ? tableGrid(block.text) : null);

  // ------------------------------------------------------------ tables

  /** The cell that has (or last had) the caret: the rows and columns are put around it. */
  let cell = $state<{ r: number; c: number } | null>(null);
  let cellRefs: (RichText | null)[] = $state([]);
  let cellWanted: { r: number; c: number } | null = null;

  /** The table changed, written at the indentation of the document. */
  function editGrid(edit: (g: Grid) => Grid) {
    onchange((b) => {
      const g = tableGrid(b.text);
      return g ? { ...b, text: gridCode(edit(g), unit) } : b;
    });
  }

  /** What a cell says. */
  function setCell(r: number, c: number, v: string) {
    editGrid((g) => ({ ...g, rows: g.rows.map((x, n) => (n === r ? { ...x, cells: Array.from({ length: Math.max(x.cells.length, c + 1) }, (_, q) => (q === c ? v : (x.cells[q] ?? ""))) } : x)) }));
  }

  /** The caret put in a cell (a row more at the end when it is below the last one). */
  function toCell(r: number, c: number, grow: boolean) {
    if (!grid) return;
    const width = Math.max(1, specColumns(grid.spec)?.aligns.length ?? 0, ...grid.rows.map((x) => x.cells.length));
    if (r >= grid.rows.length) {
      if (!grow) return;
      cellWanted = { r, c };
      editGrid((g) => gridAddRow(g, g.rows.length));
      return;
    }
    cellRefs[r * width + c]?.focusAt("end");
  }
  $effect(() => {
    void grid;
    const want = cellWanted;
    if (!want || !grid || want.r >= grid.rows.length) return;
    const width = Math.max(1, specColumns(grid.spec)?.aligns.length ?? 0, ...grid.rows.map((x) => x.cells.length));
    void tick().then(() => {
      cellRefs[want.r * width + want.c]?.focusAt("end");
      cellWanted = null;
    });
  });

  /** Tab in the last cell: a row more, and the caret in its first cell. */
  function tableKey(e: KeyboardEvent) {
    if (e.key !== "Tab" || e.shiftKey || !grid || !cell) return;
    const width = Math.max(1, specColumns(grid.spec)?.aligns.length ?? 0, ...grid.rows.map((x) => x.cells.length));
    if (cell.r === grid.rows.length - 1 && cell.c === width - 1) {
      e.preventDefault();
      toCell(grid.rows.length, 0, true);
    }
  }
  const BOX_COLORS: Record<string, string> = { block: "#3333b3", alertblock: "#c62828", exampleblock: "#2e7d32" };
</script>

<div
  class="block-view kind-{block.kind}"
  class:nested
  data-nested-kind={nested ? block.kind : undefined}
  style:text-align={block.kind === "image" ? undefined : block.align === "center" ? "center" : block.align === "right" ? "right" : undefined}
  style:font-size={block.size ? `${SIZE_SCALE[block.size] ?? 1}em` : undefined}
>
  {#if nested}
    <button class="remove" title={t("slides.blockDelete")} aria-label={t("slides.blockDelete")} onclick={() => onchange(() => null)}><Icon name="x" size={11} /></button>
  {/if}
  {#if block.reveal}
    <span class="step-chip" title={rs ? t("slides.reveal.chip", { n: rs.step }) : block.reveal.overlay}>{rs ? t("slides.canvas.step", { n: rs.step }) + (rs.only ? "" : "+") : block.reveal.overlay}</span>
  {/if}

  {#if block.kind === "text"}
    <RichText
      bind:this={firstText}
      value={block.text}
      {path}
      placeholder={t("slides.canvas.textHere")}
      onchange={(v) => onchange((b) => ({ ...b, text: v }))}
      onenter={onsplit ? (before, after) => onsplit({ ...block, text: before }, { ...newBlock("text", lang), text: after }) : undefined}
      onempty={onremove}
      onfocus={() => ontext?.()}
    />
  {:else if block.kind === "list"}
    <svelte:element this={block.ordered ? "ol" : "ul"} class="items">
      {#each block.items ?? [] as item, k (k)}
        <li>
          <RichText
            bind:this={texts[k]}
            value={item.text}
            {path}
            single
            placeholder={t("slides.canvas.pointHere")}
            onchange={(v) => onchange((b) => ({ ...b, items: b.items?.map((it, n) => (n === k ? { ...it, text: v } : it)) }))}
            onenter={(before, after) => itemEnter(k, before, after)}
            onempty={() => itemEmpty(k)}
            onfocus={() => ontext?.()}
          />
        </li>
      {/each}
    </svelte:element>
  {:else if block.kind === "image"}
    <div class="picture-row" style:text-align={block.env === "center" || block.env === "figure" ? "center" : block.align === "right" ? "right" : "left"}>
      <span class="picture" style:width="{width * 100}%">
        {#if src}
          <img {src} alt={block.caption || block.path || ""} draggable="false" onerror={() => ((src = null), (missing = true))} />
        {:else if pdf}
          <span class="pdf-picture"><PageCanvas doc={pdf} page={1} width={600} /></span>
        {:else}
          <span class="placeholder"><Icon name="image" size={22} /><span>{missing ? t("slides.canvas.pictureMissing", { name: block.path ?? "" }) : block.path}</span></span>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="resize" class:shown={selected || widthDragged !== null} title={t("slides.canvas.resize")} onpointerdown={resize}></span>
        {#if selected || widthDragged !== null}<span class="width-badge">{Math.round(width * 100)} %</span>{/if}
      </span>
      {#if block.caption || selected}
        <div class="caption">
          <RichText value={block.caption ?? ""} {path} single placeholder={t("slides.canvas.caption")} onchange={(v) => onchange((b) => ({ ...b, caption: v, env: v ? "figure" : b.env === "figure" ? "center" : b.env }))} />
        </div>
      {/if}
    </div>
  {:else if block.kind === "columns"}
    <div class="columns">
      {#each block.columns ?? [] as column, k (k)}
        {#if k > 0}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="divider" class:live={selected && !nested} title={t("slides.canvas.columnWidth")} onpointerdown={(e) => selected && !nested && resizeColumns(e, k - 1)}></span>
        {/if}
        <div class="column" class:over={drag.over === `column:${index}:${k}`} style:flex-basis="{colWidths[k] * 100}%" data-drop={nested ? undefined : `column:${index}:${k}`}>
          {#each textBlocks(column.text) as inner, j (j)}
            <BlockView
              block={inner}
              {path}
              {dir}
              {lang}
              {unit}
              nested
              onchange={(edit) => onchange((b) => ({ ...b, columns: b.columns?.map((c, n) => (n === k ? { ...c, text: inText(c.text, j, edit) } : c)) }))}
              onsplit={(first, second) => onchange((b) => ({ ...b, columns: b.columns?.map((c, n) => (n === k ? { ...c, text: splitInText(c.text, j, first, second) } : c)) }))}
              onremove={() => onchange((b) => ({ ...b, columns: b.columns?.map((c, n) => (n === k ? { ...c, text: inText(c.text, j, () => null) } : c)) }))}
              {ontext}
            />
          {:else}
            <RichText value="" {path} placeholder={t("slides.canvas.columnHere")} onchange={(v) => v && onchange((b) => ({ ...b, columns: b.columns?.map((c, n) => (n === k ? { ...c, text: v } : c)) }))} />
          {/each}
        </div>
      {/each}
    </div>
  {:else if block.kind === "formula"}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="formula" title={t("slides.canvas.editFormula")} onclick={() => (formulaOpen = true)}>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <span class="math">{@html formulaHtml}</span>
      {#if block.numbered}<span class="number">(1)</span>{/if}
    </div>
    {#if selected || formulaOpen}
      <!-- svelte-ignore a11y_autofocus -->
      <textarea class="formula-code" rows={Math.max(1, block.text.split("\n").length)} value={block.text} spellcheck="false" autofocus={formulaOpen} aria-label={t("slides.rich.formula")} oninput={formulaTyped} onblur={() => (formulaOpen = false)}></textarea>
    {/if}
  {:else if block.kind === "table" && grid}
    {@const cols = specColumns(grid.spec)}
    {@const width = Math.max(1, cols?.aligns.length ?? 0, ...grid.rows.map((x) => x.cells.length))}
    <div class="table-row" style:text-align={alignOf(block) === "center" ? "center" : alignOf(block) === "right" ? "right" : "left"}>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <table class="grid" data-cell={cell ? `${cell.r}:${cell.c}` : undefined} onkeydown={tableKey}>
        <tbody>
          {#each grid.rows as row, r (r)}
            <tr class:ruled={!!row.rule} class:last={r === grid.rows.length - 1 && !!grid.end}>
              {#each Array.from({ length: width }, (_, c) => c) as c (c)}
                <td
                  onpointerdown={() => (cell = { r, c })}
                  class:bar-left={(cols?.bars[c] ?? 0) > 0}
                  class:bar-right={c === width - 1 && (cols?.bars[width] ?? 0) > 0}
                  class:current={cell?.r === r && cell?.c === c}
                  style:text-align={cols?.aligns[c] === "c" ? "center" : cols?.aligns[c] === "r" ? "right" : "left"}
                >
                  <RichText
                    bind:this={cellRefs[r * width + c]}
                    value={row.cells[c] ?? ""}
                    {path}
                    single
                    onfocus={() => ((cell = { r, c }), ontext?.())}
                    onenter={(before, after) => {
                      // What was typed in it is written first, then the caret goes below.
                      setCell(r, c, `${before}${after}`);
                      toCell(r + 1, c, true);
                    }}
                    onchange={(v) => setCell(r, c, v)}
                  />
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if block.kind === "box"}
    <div class="box" style:--box={BOX_COLORS[block.env ?? "block"] ?? "#3333b3"}>
      <div class="box-title">
        <RichText value={block.title ?? ""} {path} single placeholder={t("slides.canvas.boxTitle")} onchange={(v) => onchange((b) => ({ ...b, title: v }))} />
      </div>
      <div class="box-body">
        {#each textBlocks(block.text) as inner, j (j)}
          <BlockView
            block={inner}
            {path}
            {dir}
            {lang}
            {unit}
            nested
            onchange={(edit) => onchange((b) => ({ ...b, text: inText(b.text, j, edit) }))}
            onsplit={(first, second) => onchange((b) => ({ ...b, text: splitInText(b.text, j, first, second) }))}
            onremove={() => onchange((b) => ({ ...b, text: inText(b.text, j, () => null) }))}
            {ontext}
          />
        {:else}
          <RichText value="" {path} placeholder={t("slides.canvas.textHere")} onchange={(v) => v && onchange((b) => ({ ...b, text: addToText("", { ...newBlock("text", lang), text: v }) }))} />
        {/each}
      </div>
    </div>
  {:else if block.kind === "pause"}
    <div class="pause"><Icon name="eye" size={13} /><span>{t("slides.pause.hint")}</span></div>
  {:else if block.kind === "special"}
    <div class="special"><Icon name="title-page" size={16} /><span>{t(`slides.special.${block.special === "maketitle" ? "titlepage" : block.special}` as "slides.special.titlepage")}</span><span class="faint">{t("slides.special.hint")}</span></div>
  {:else}
    <textarea
      class="code"
      rows={Math.max(2, block.text.split("\n").length)}
      value={block.text}
      spellcheck="false"
      aria-label={t("slides.block.raw")}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLTextAreaElement).value;
        onchange((b) => ({ ...b, text: v }));
      }}
    ></textarea>
  {/if}
</div>

<style>
  .block-view {
    position: relative;
    line-height: 1.35;
  }
  .remove {
    position: absolute;
    top: -0.5em;
    right: -0.5em;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 50%;
    background: #6a6a7a;
    color: #fff;
    cursor: pointer;
    opacity: 0;
  }
  .nested:hover > .remove {
    opacity: 1;
  }
  .step-chip {
    position: absolute;
    top: -0.9em;
    right: 0;
    z-index: 2;
    padding: 0 0.5em;
    border-radius: 0.7em;
    background: #3333b3;
    color: #fff;
    font-size: 0.55em;
    font-weight: 600;
    line-height: 1.6em;
    pointer-events: none;
  }
  .items {
    margin: 0;
    padding-left: 1.4em;
  }
  .items li {
    margin: 0.15em 0;
  }
  ul.items li::marker {
    color: var(--slide-accent, #3333b3);
  }
  .picture-row {
    width: 100%;
  }
  .picture {
    position: relative;
    display: inline-block;
    vertical-align: top;
    max-width: 100%;
  }
  .picture img,
  .pdf-picture {
    display: block;
    width: 100%;
    height: auto;
  }
  .pdf-picture :global(canvas) {
    width: 100% !important;
    height: auto !important;
  }
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3em;
    aspect-ratio: 4 / 3;
    border-radius: 4px;
    background: #ececf1;
    color: #8a8a96;
    font-size: 0.6em;
  }
  .resize {
    opacity: 0;
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 14px;
    height: 14px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: var(--accent);
    cursor: nwse-resize;
    touch-action: none;
  }
  .resize.shown,
  .picture:hover .resize {
    opacity: 1;
  }
  .width-badge {
    position: absolute;
    top: 4px;
    left: 4px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 10px;
  }
  .caption {
    margin-top: 0.2em;
    font-size: 0.8em;
    text-align: center;
    color: #444;
  }
  .columns {
    display: flex;
    align-items: flex-start;
  }
  .column {
    flex-grow: 0;
    flex-shrink: 1;
    min-width: 0;
    min-height: 1.4em;
    padding: 0 0.2em;
    border-radius: 3px;
  }
  .column.over {
    background: rgba(51, 51, 179, 0.1);
    outline: 2px dashed var(--accent) !important;
  }
  .column > :global(.block-view + .block-view) {
    margin-top: 0.4em;
  }
  .divider {
    flex: none;
    width: 0.8em;
    align-self: stretch;
  }
  .divider.live {
    cursor: col-resize;
    background: linear-gradient(to right, transparent 45%, rgba(51, 51, 179, 0.35) 45%, rgba(51, 51, 179, 0.35) 55%, transparent 55%);
  }
  .formula {
    position: relative;
    text-align: center;
  }
  .formula .number {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
  }
  .formula-code,
  .code {
    display: block;
    width: 100%;
    margin-top: 0.3em;
    padding: 4px 6px;
    border: 1px solid #c8c8d4;
    border-radius: 4px;
    background: #f7f7fa;
    color: #222;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.45;
    resize: vertical;
  }
  .table-row {
    width: 100%;
  }
  .grid {
    display: inline-table;
    border-collapse: collapse;
  }
  .grid td {
    min-width: 2.6em;
    padding: 0.12em 0.45em;
    border: 1px dotted #d4d4de;
  }
  .grid tr.ruled td {
    border-top: 1px solid #333;
  }
  .grid tr.last td {
    border-bottom: 1px solid #333;
  }
  .grid td.bar-left {
    border-left: 1px solid #333;
  }
  .grid td.bar-right {
    border-right: 1px solid #333;
  }
  .grid td.current {
    background: rgba(51, 51, 179, 0.07);
  }
  .box {
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  }
  .box-title {
    padding: 0.15em 0.5em;
    background: var(--box);
    color: #fff;
    font-weight: 600;
  }
  .box-body {
    padding: 0.3em 0.5em;
    background: color-mix(in srgb, var(--box) 9%, #fff);
  }
  .box-body > :global(.block-view + .block-view) {
    margin-top: 0.4em;
  }
  .pause,
  .special {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.25em 0.4em;
    border: 1px dashed #b4b4c4;
    border-radius: 4px;
    color: #6a6a7a;
    font-size: 0.6em;
  }
  .special {
    padding: 0.8em;
    font-size: 0.7em;
  }
  .special .faint {
    color: #9a9aa6;
  }
</style>
