<script lang="ts">
  // Small PDF preview (TikZ pictures, font samples). The previous rendering
  // stays visible until the new one is ready: no flicker while typing.
  // With a TikZ bounding box, it shows a centimetre grid and turns clicks
  // into TikZ coordinates.
  import { onDestroy } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import Icon from "./Icon.svelte";

  let {
    pdf,
    revision = 0,
    bbox = null,
    border = 0,
    grid = false,
    maxScale = 2.5,
    onpoint,
  }: {
    pdf: string | null;
    revision?: number;
    bbox?: [number, number, number, number] | null;
    border?: number;
    grid?: boolean;
    maxScale?: number;
    onpoint?: (x: number, y: number) => void;
  } = $props();

  interface PageView {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    /** Page size in PDF points (bp). */
    ptWidth: number;
    ptHeight: number;
  }

  const PT_PER_BP = 72.27 / 72;
  const PT_PER_CM = 72.27 / 2.54;

  let host = $state<HTMLDivElement | null>(null);
  let pages = $state<PageView[]>([]);
  let zoom = $state(1);
  let hover = $state<{ x: number; y: number } | null>(null);
  let failed = $state(false);
  let token = 0;
  let width = $state(0);

  $effect(() => {
    void revision;
    void zoom;
    void width;
    if (pdf) void render(pdf);
    else pages = [];
  });

  onDestroy(() => {
    token++;
  });

  async function render(path: string) {
    const my = ++token;
    try {
      const { closePdf, loadPdf } = await import("$lib/pdf/pdfjs");
      const doc = await loadPdf(await ipc.readBinaryFile(path));
      if (my !== token) return closePdf(doc);
      const out: PageView[] = [];
      const avail = Math.max(120, (host?.clientWidth ?? 400) - 24);
      for (let n = 1; n <= Math.min(doc.numPages, 12); n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(maxScale, avail / base.width) * zoom;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        await page.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
        out.push({ canvas, width: viewport.width, height: viewport.height, ptWidth: base.width, ptHeight: base.height });
      }
      closePdf(doc);
      if (my !== token) return;
      pages = out;
      failed = false;
    } catch {
      if (my === token) failed = true;
    }
  }

  function mount(node: HTMLElement, canvas: HTMLCanvasElement) {
    node.appendChild(canvas);
    return {
      update(next: HTMLCanvasElement) {
        node.replaceChildren(next);
      },
    };
  }

  /** TikZ coordinates (cm) of a point of the first page, in CSS pixels. */
  function toTikz(px: number, py: number, page: PageView): { x: number; y: number } | null {
    if (!bbox) return null;
    const perPx = page.ptWidth / page.width; // bp per CSS pixel
    const xPt = bbox[0] - border + px * perPx * PT_PER_BP;
    const yPt = bbox[3] + border - py * perPx * PT_PER_BP;
    const round = (v: number) => Math.round((v / PT_PER_CM) * 10) / 10;
    return { x: round(xPt), y: round(yPt) };
  }

  /** Grid lines of the picture, in CSS pixels of the first page. */
  const gridLines = $derived.by(() => {
    const page = pages[0];
    if (!grid || !bbox || !page) return null;
    const pxPerPt = page.width / (page.ptWidth * PT_PER_BP);
    const left = bbox[0] - border;
    const top = bbox[3] + border;
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean; label?: string; lx?: number; ly?: number }[] = [];
    const cmStart = (v: number) => Math.ceil(v / PT_PER_CM * 2) / 2;
    for (let cm = cmStart(bbox[0] - border); cm * PT_PER_CM <= bbox[2] + border; cm += 0.5) {
      const x = (cm * PT_PER_CM - left) * pxPerPt;
      const major = Math.abs(cm - Math.round(cm)) < 1e-6;
      lines.push({ x1: x, y1: 0, x2: x, y2: page.height, major, label: major ? String(Math.round(cm)) : undefined, lx: x + 2, ly: page.height - 3 });
    }
    for (let cm = cmStart(bbox[1] - border); cm * PT_PER_CM <= bbox[3] + border; cm += 0.5) {
      const y = (top - cm * PT_PER_CM) * pxPerPt;
      const major = Math.abs(cm - Math.round(cm)) < 1e-6;
      lines.push({ x1: 0, y1: y, x2: page.width, y2: y, major, label: major ? String(Math.round(cm)) : undefined, lx: 2, ly: y - 2 });
    }
    return lines;
  });

  function move(e: PointerEvent, page: PageView) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hover = toTikz(e.clientX - r.left, e.clientY - r.top, page);
  }

  function click(e: MouseEvent, page: PageView) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = toTikz(e.clientX - r.left, e.clientY - r.top, page);
    if (p) onpoint?.(p.x, p.y);
  }

  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
</script>

<div class="preview" bind:this={host} bind:clientWidth={width}>
  <div class="zoom">
    <button class="icon-btn" title={t("viewer.zoomOut")} onclick={() => (zoom = Math.max(0.25, zoom / 1.25))}><Icon name="zoom-out" size={14} /></button>
    <button class="pct" onclick={() => (zoom = 1)} title={t("viewer.fitWidth")}>{Math.round(zoom * 100)} %</button>
    <button class="icon-btn" title={t("viewer.zoomIn")} onclick={() => (zoom = Math.min(6, zoom * 1.25))}><Icon name="zoom-in" size={14} /></button>
  </div>
  <div class="pages">
    {#each pages as page, i (page.canvas)}
      <div class="page" style:width="{page.width}px" style:height="{page.height}px">
        <div class="canvas" use:mount={page.canvas}></div>
        {#if i === 0 && gridLines}
          <svg class="grid" width={page.width} height={page.height}>
            {#each gridLines as l}
              <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} class:major={l.major} />
              {#if l.label !== undefined}<text x={l.lx} y={l.ly}>{l.label}</text>{/if}
            {/each}
          </svg>
        {/if}
        {#if i === 0 && bbox && onpoint}
          <button
            class="hit"
            aria-label={t("tikz.clickToInsert")}
            onpointermove={(e) => move(e, page)}
            onpointerleave={() => (hover = null)}
            onclick={(e) => click(e, page)}
          ></button>
        {/if}
      </div>
    {:else}
      {#if failed}<div class="empty">{t("viewer.error")}</div>{/if}
    {/each}
  </div>
  {#if hover}
    <div class="coords mono">({fmt(hover.x)}, {fmt(hover.y)})</div>
  {/if}
</div>

<style>
  .preview {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--pdf-bg);
    border-radius: var(--radius);
  }
  .zoom {
    position: sticky;
    top: 6px;
    float: right;
    margin: 6px 6px 0 0;
    z-index: 3;
    display: flex;
    align-items: center;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .zoom .icon-btn {
    width: 26px;
    height: 26px;
  }
  .pct {
    min-width: 48px;
    border: none;
    background: none;
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px;
    min-width: max-content;
  }
  .page {
    position: relative;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  }
  .canvas :global(canvas) {
    display: block;
  }
  .grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .grid line {
    stroke: rgba(40, 110, 255, 0.18);
    stroke-width: 0.5;
  }
  .grid line.major {
    stroke: rgba(40, 110, 255, 0.4);
    stroke-width: 0.8;
  }
  .grid text {
    fill: rgba(40, 110, 255, 0.8);
    font-size: 9px;
    font-family: var(--font-mono);
  }
  .hit {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: crosshair;
  }
  .coords {
    position: sticky;
    bottom: 8px;
    left: 8px;
    display: inline-block;
    margin: 0 0 8px 8px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    font-size: 12px;
    box-shadow: var(--shadow);
  }
</style>
