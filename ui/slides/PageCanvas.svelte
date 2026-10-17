<script lang="ts">
  // A page of the PDF of the deck, drawn as wide as asked, or fitted in a
  // box when its height is given too (a page standing up stays whole in a
  // frame lying down), sharp on a screen of high density; drawn again when
  // the PDF or the size changes.
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

  let { doc, page, width, height = 0, revision = 0 }: { doc: PDFDocumentProxy | null; page: number; width: number; height?: number; revision?: number } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let drawn = $state({ width: 0, height: 0 });
  let task: RenderTask | null = null;

  $effect(() => {
    void revision;
    const d = doc;
    const c = canvas;
    const w = width;
    const h = height;
    const n = page;
    if (!d || !c || w <= 0 || n < 1 || n > d.numPages) {
      // A page the PDF does not have (yet): nothing drawn.
      drawn = { width: 0, height: 0 };
      return;
    }
    let gone = false;
    void (async () => {
      const p = await d.getPage(n);
      if (gone) return;
      const base = p.getViewport({ scale: 1 });
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const scale = h > 0 ? Math.min(w / base.width, h / base.height) : w / base.width;
      const viewport = p.getViewport({ scale: scale * ratio });
      drawn = { width: base.width * scale, height: base.height * scale };
      task?.cancel();
      c.width = Math.ceil(viewport.width);
      c.height = Math.ceil(viewport.height);
      task = p.render({ canvas: c, viewport });
      await task.promise.catch(() => {});
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
