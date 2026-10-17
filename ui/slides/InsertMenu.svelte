<script lang="ts">
  // The components to add where the + was pressed: each by its picture and
  // its name; Escape or a click elsewhere closes it.
  import { onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import type { BlockKind } from "$lib/slides/blocks";
  import Icon from "../components/common/Icon.svelte";
  import { COMPONENTS, componentId } from "./components";

  let { onpick, onclose }: { onpick: (kind: BlockKind, variant: string) => void; onclose: () => void } = $props();

  let menu = $state<HTMLElement | null>(null);
  onMount(() => {
    const away = (e: PointerEvent) => !menu?.contains(e.target as Node) && !(e.target as HTMLElement).closest(".insert, .add") && onclose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onclose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  });
</script>

<div class="insert-menu" role="menu" bind:this={menu}>
  {#each COMPONENTS as c (componentId(c))}
    <button role="menuitem" data-insert={componentId(c)} onclick={() => onpick(c.kind, c.variant)}>
      <Icon name={c.icon} size={16} />
      <span>{t(c.key as "slides.component.text")}</span>
    </button>
  {/each}
</div>

<style>
  .insert-menu {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    grid-template-columns: repeat(4, 76px);
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
    font-size: 12px;
  }
  .insert-menu button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 2px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
  }
  .insert-menu button:hover {
    border-color: var(--accent);
    background: var(--bg-hover);
  }
</style>
