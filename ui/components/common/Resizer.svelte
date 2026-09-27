<script lang="ts">
  // Drag handle between two panes. `horizontal` resizes along x.
  let {
    direction,
    onresize,
    onend,
  }: { direction: "horizontal" | "vertical"; onresize: (delta: number) => void; onend?: () => void } = $props();

  let dragging = $state(false);
  let last = 0;

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    last = direction === "horizontal" ? e.clientX : e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const pos = direction === "horizontal" ? e.clientX : e.clientY;
    const delta = pos - last;
    if (delta) {
      last = pos;
      onresize(delta);
    }
  }

  function up() {
    if (!dragging) return;
    dragging = false;
    onend?.();
  }
</script>

<div
  class="resizer {direction}"
  class:dragging
  role="separator"
  aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
></div>

{#if dragging}
  <div class="shield {direction}"></div>
{/if}

<style>
  .resizer {
    position: relative;
    flex-shrink: 0;
    z-index: 5;
  }
  .resizer.horizontal {
    width: 5px;
    margin: 0 -2px;
    cursor: col-resize;
  }
  .resizer.vertical {
    height: 5px;
    margin: -2px 0;
    cursor: row-resize;
  }
  .resizer::after {
    content: "";
    position: absolute;
    inset: 0;
    transition: background 0.15s;
  }
  .resizer:hover::after,
  .resizer.dragging::after {
    background: var(--accent);
    opacity: 0.6;
  }
  /* Keeps iframes/canvases from stealing the pointer while dragging. */
  .shield {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }
  .shield.horizontal {
    cursor: col-resize;
  }
  .shield.vertical {
    cursor: row-resize;
  }
</style>
