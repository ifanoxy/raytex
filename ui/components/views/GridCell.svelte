<script lang="ts">
  // A cell of the grid editor: a one-line LaTeX editor (see $lib/editor/cell).
  import { EditorState } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import { onMount } from "svelte";
  import { type CellMove, cellExtensions } from "$lib/editor/cell";
  import { app } from "$lib/state/app.svelte";

  let {
    value,
    r,
    c,
    math,
    path,
    align = "left",
    head = false,
    label,
    onchange,
    onmove,
    onpaste,
  }: {
    value: string;
    r: number;
    c: number;
    math: boolean;
    path: string;
    align?: string;
    head?: boolean;
    label: string;
    onchange: (text: string) => void;
    onmove: (to: CellMove) => boolean;
    onpaste: (text: string) => boolean;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | null = null;

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: cellExtensions({
          path,
          math,
          macros: () => app.settings?.macros ?? [],
          completion: app.settings?.completion.enabled !== false,
          move: (to) => onmove(to),
          paste: (text) => onpaste(text),
          change: (text) => onchange(text),
        }),
      }),
    });
    view.contentDOM.setAttribute("aria-label", label);
    return () => view?.destroy();
  });

  // Cells filled from outside (paste of several cells, a new size).
  $effect(() => {
    const text = value;
    if (view && view.state.doc.toString() !== text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text.replace(/\n/g, " ") } });
    }
  });
</script>

<div class="cell" class:head bind:this={host} data-r={r} data-c={c} style:--cell-align={align}></div>

<style>
  .cell {
    min-width: 0;
  }
  /* The header row, told apart without looking bold (LaTeX does not make it bold). */
  .cell.head :global(.cm-editor) {
    background: color-mix(in srgb, var(--accent) 9%, var(--bg-input));
  }
</style>
