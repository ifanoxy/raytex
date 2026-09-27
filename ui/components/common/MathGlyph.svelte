<script lang="ts">
  // A small formula rendered by KaTeX (symbols of the @ shortcuts).
  import { mathHtml } from "$lib/editor/math-preview";

  let { latex }: { latex: string } = $props();
  let html = $state("");

  $effect(() => {
    const tex = latex;
    void mathHtml(tex)
      .then((h) => {
        if (tex === latex) html = h;
      })
      .catch(() => (html = ""));
  });
</script>

<span class="glyph">{#if html}{@html html}{:else}<span class="mono">{latex}</span>{/if}</span>

<style>
  .glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.6em;
    font-size: 15px;
    color: var(--text);
    line-height: 1;
  }
  .glyph :global(.katex) {
    font-size: 1em;
  }
  .mono {
    font-size: 11px;
  }
</style>
