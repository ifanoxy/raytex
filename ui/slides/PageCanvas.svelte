<script lang="ts">
  // A page of the PDF of the deck, drawn as wide as asked (sharp on a
  // screen of high density); drawn again when the PDF or the size changes.
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

  let { doc, page, width, revision = 0 }: { doc: PDFDocumentProxy | null; page: number; width: number; revision?: number } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let height = $state(0);
  let task: RenderTask | null = null;

  $effect(() => {
    void revision;
    const d = doc;
    const c = canvas;
    const w = width;
    const n = page;
    if (!d || !c || w <= 0 || n < 1 || n > d.numPages) return;
    let gone = false;
    void (async () => {
      const p = await d.getPage(n);
      if (gone) return;
      const base = p.getViewport({ scale: 1 });
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const viewport = p.getViewport({ scale: (w / base.width) * ratio });
      height = (w * base.height) / base.width;
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

<canvas bind:this={canvas} class="page" style:width="{width}px" style:height={height ? `${height}px` : undefined}></canvas>

<style>
  .page {
    display: block;
    background: #fff;
    border-radius: 3px;
  }
</style>
