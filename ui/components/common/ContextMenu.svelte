<script lang="ts">
  // Context and dropdown menus (one at a time, driven by `ui.menu`).
  import { prettyKey } from "$lib/utils";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "./Icon.svelte";

  let el = $state<HTMLElement | null>(null);
  let pos = $state({ x: 0, y: 0 });
  let focused = $state(-1);

  $effect(() => {
    const menu = ui.menu;
    if (!menu || !el) return;
    focused = -1;
    // Keep the menu inside the window.
    const r = el.getBoundingClientRect();
    pos = {
      x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, menu.y + r.height > window.innerHeight - 4 ? menu.y - r.height : menu.y),
    };
    el.focus();
  });

  function run(i: number) {
    const item = ui.menu?.items[i];
    if (!item || item.disabled || item.separator) return;
    ui.closeMenu();
    void item.run?.();
  }

  function key(e: KeyboardEvent) {
    const items = ui.menu?.items ?? [];
    const step = (d: number) => {
      let i = focused;
      for (let n = 0; n < items.length; n++) {
        i = (i + d + items.length) % items.length;
        if (!items[i].separator && !items[i].disabled) break;
      }
      focused = i;
    };
    if (e.key === "Escape") ui.closeMenu();
    else if (e.key === "ArrowDown") step(1);
    else if (e.key === "ArrowUp") step(-1);
    else if (e.key === "Enter" && focused >= 0) run(focused);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

{#if ui.menu}
  <div class="backdrop" role="presentation" onpointerdown={() => ui.closeMenu()} oncontextmenu={(e) => { e.preventDefault(); ui.closeMenu(); }}></div>
  <div class="menu" bind:this={el} role="menu" tabindex="-1" style:left="{pos.x}px" style:top="{pos.y}px" onkeydown={key}>
    {#each ui.menu.items as item, i}
      {#if item.separator}
        <div class="sep" role="separator"></div>
      {:else}
        <button
          class="item"
          class:danger={item.danger}
          class:focused={focused === i}
          role="menuitem"
          disabled={item.disabled}
          onclick={() => run(i)}
          onpointerenter={() => (focused = i)}
        >
          <span class="icon">
            {#if item.checked}<Icon name="check" size={14} />{:else if item.icon}<Icon name={item.icon} size={14} />{/if}
          </span>
          <span class="label ellipsis">{item.label}</span>
          {#if item.keys}<span class="keys">{prettyKey(item.keys)}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 900;
  }
  .menu {
    position: fixed;
    z-index: 901;
    min-width: 200px;
    max-width: 360px;
    padding: 4px;
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow);
    outline: none;
    animation: pop 0.1s var(--ease);
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .item.focused {
    background: var(--bg-hover);
  }
  .item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .item.danger {
    color: var(--error);
  }
  .icon {
    width: 16px;
    display: flex;
    justify-content: center;
    color: var(--text-muted);
  }
  .label {
    flex: 1;
  }
  .keys {
    font-size: 11px;
    color: var(--text-faint);
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
</style>
