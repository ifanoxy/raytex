<script lang="ts">
  // Title row of a sidebar view, with optional action buttons.
  import type { Snippet } from "svelte";

  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="panel-header">
  <span class="section-title ellipsis">{title}</span>
  <div class="spacer"></div>
  {@render children?.()}
</div>

<style>
  .panel-header {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 38px;
    padding: 0 6px 0 14px;
    flex-shrink: 0;
  }
  .panel-header :global(.icon-btn) {
    width: 26px;
    height: 26px;
  }
</style>
