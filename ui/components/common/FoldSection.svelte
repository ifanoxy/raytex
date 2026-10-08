<script lang="ts">
  // A group of settings: the main ones in sight, the others behind
  // "Advanced", folded until they are asked for.
  import type { Snippet } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import Icon from "./Icon.svelte";

  let {
    id,
    title,
    open = $bindable(false),
    children,
    advanced,
  }: {
    /** Names the group for the tests and the styles. */
    id: string;
    title: string;
    open?: boolean;
    children?: Snippet;
    advanced?: Snippet;
  } = $props();
</script>

<section class="fold" data-id={id}>
  <header>
    <h3>{title}</h3>
    {#if advanced}
      <button class="more" class:open aria-expanded={open} onclick={() => (open = !open)}>
        {t("layout.advanced")}<Icon name={open ? "chevron-up" : "chevron-down"} size={12} />
      </button>
    {/if}
  </header>
  {@render children?.()}
  {#if advanced && open}
    <div class="advanced">{@render advanced()}</div>
  {/if}
</section>

<style>
  .fold {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 11px 12px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bg-input) 45%, transparent);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 20px;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text);
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border: none;
    border-radius: 999px;
    background: none;
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .more:hover,
  .more.open {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .advanced {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-top: 10px;
    border-top: 1px dashed var(--border);
  }
</style>
