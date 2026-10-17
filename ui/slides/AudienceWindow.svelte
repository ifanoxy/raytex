<script lang="ts">
  // The window of a presentation: the page the main window says, as large
  // as the screen allows, on black; a key pressed or a click here goes to
  // the main window, which leads the presentation.
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { onDestroy, onMount } from "svelte";
  import * as ipc from "$lib/ipc";
  import { closePdf, loadPdf } from "$lib/pdf/pdfjs";
  import PageCanvas from "./PageCanvas.svelte";

  let doc = $state<PDFDocumentProxy | null>(null);
  let page = $state(1);
  let black = $state(false);
  let revision = $state(0);
  let size = $state({ width: window.innerWidth, height: window.innerHeight });
  let loaded = "";
  const stops: (() => void)[] = [];

  onMount(() => {
    void (async () => {
      stops.push(
        await ipc.on("present:show", async (s) => {
          page = s.page;
          black = s.black;
          const key = `${s.pdf}:${s.built}`;
          if (key !== loaded) {
            loaded = key;
            const bytes = await ipc.readBinaryFile(s.pdf).catch(() => null);
            const next = bytes ? await loadPdf(bytes).catch(() => null) : null;
            if (next) {
              const old = doc;
              doc = next;
              revision++;
              closePdf(old);
            }
          }
          void ipc.tell("main", "present:drawn", { page: s.page }).catch(() => {});
        }),
      );
      await ipc.tell("main", "present:ready", null).catch(() => {});
    })();
  });

  onDestroy(() => {
    for (const stop of stops) stop();
    closePdf(doc);
  });

  function key(e: KeyboardEvent) {
    e.preventDefault();
    void ipc.tell("main", "present:key", { key: e.key }).catch(() => {});
  }
</script>

<svelte:window onkeydown={key} onresize={() => (size = { width: window.innerWidth, height: window.innerHeight })} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="audience" onclick={() => void ipc.tell("main", "present:key", { key: "ArrowRight" }).catch(() => {})}>
  {#if doc && !black}
    <PageCanvas {doc} {page} width={size.width} height={size.height} {revision} />
  {/if}
</div>

<style>
  .audience {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: #000;
    cursor: none;
  }
  .audience :global(.page) {
    border-radius: 0;
  }
</style>
