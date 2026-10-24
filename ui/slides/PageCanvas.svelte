<script lang="ts">
  // A page of the PDF of the deck, drawn as wide as asked, or fitted in a
  // box when its height is given too (a page standing up stays whole in a
  // frame lying down), sharp on a screen of high density. Drawn apart and
  // then shown at once: the page shown stays until the new one is ready (no
  // white between two builds); not drawn again for a size that hardly
  // changed.
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
  import { pixelSize } from "$lib/pdf/pixels";

  let { doc, page, width, height = 0, revision = 0 }: { doc: PDFDocumentProxy | null; page: number; width: number; height?: number; revision?: number } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let drawn = $state({ width: 0, height: 0 });
  let task: RenderTask | null = null;
  /** What the canvas shows: the page, its document, its build, its size. */
  let shown = { doc: null as PDFDocumentProxy | null, page: 0, revision: -1, width: 0, height: 0 };

  $effect(() => {
    void revision;
    const d = doc;
    const c = canvas;
    const w = Math.round(width);
    const h = Math.round(height);
    const n = page;
    if (!d || !c || w <= 0 || n < 1 || n > d.numPages) {
      // A page the PDF does not have (yet): nothing drawn.
      drawn = { width: 0, height: 0 };
      shown = { ...shown, doc: null };
      return;
    }
    // The same page at nearly the same size: kept as it is.
    if (shown.doc === d && shown.page === n && shown.revision === revision && Math.abs(shown.width - w) < 3 && Math.abs(shown.height - h) < 3) return;
    let gone = false;
    void (async () => {
      const p = await d.getPage(n).catch(() => null);
      if (gone || !p) return;
      const base = p.getViewport({ scale: 1 });
      const scale = h > 0 ? Math.min(w / base.width, h / base.height) : w / base.width;
      const viewport = p.getViewport({ scale });
      // One pixel of the canvas for one of the screen (a canvas a fraction
      // off its box is resampled, and blurred).
      const px = pixelSize(viewport.width, viewport.height, Math.max(1, window.devicePixelRatio || 1));
      // Drawn on a canvas of its own, then copied at once on the one shown.
      const off = document.createElement("canvas");
      off.width = px.width;
      off.height = px.height;
      task?.cancel();
      task = p.render({ canvas: off, viewport, transform: px.transform });
      const ok = await task.promise.then(() => true).catch(() => false);
      if (gone || !ok) return;
      c.width = off.width;
      c.height = off.height;
      c.getContext("2d")?.drawImage(off, 0, 0);
      drawn = { width: px.cssWidth, height: px.cssHeight };
      shown = { doc: d, page: n, revision, width: w, height: h };
    })();
    return () => {
      gone = true;
    };
  });
</script>

<div class="box" style:width="{width}px" style:height={height ? `${height}px` : undefined}>
  <canvas bind:this={canvas} class="page" class:none={!drawn.width} style:width={drawn.width ? `${drawn.width}px` : undefined} style:height={drawn.height ? `${drawn.height}px` : undefined}></canvas>
</div>

<style>
  .box {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .page.none {
    display: none;
  }
  .page {
    display: block;
    background: #fff;
    border-radius: 3px;
  }
</style>
