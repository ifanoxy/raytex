<script lang="ts">
  // The menus of the top bar: Format, Insert, Maths, Page and the @
  // shortcuts, each tool by its name with its shortcut, and submenus for the
  // style of the line, the size, the colour and the alignment. A click opens
  // a menu, passing over the others opens them; the arrows, Enter, Escape
  // and the first letter of an entry work as in any menu. The text keeps
  // its focus and its selection meanwhile.
  import { hasChapters } from "$lib/editor/format";
  import { t, type MessageKey } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { byLetter, type MenuCell, type MenuEntry, move, type Stop } from "$lib/menu";
  import { menus } from "$lib/menubar";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import MathGlyph from "../common/MathGlyph.svelte";
  import ColorMenu from "./ColorMenu.svelte";

  /** The menus of the bar, in their order (their entries are read when one opens). */
  const TOP: [string, MessageKey, string?][] = [
    ["format", "menu.format"],
    ["insert", "menu.insert"],
    ["math", "menu.math"],
    ["page", "menu.page"],
    ["shortcuts", "menu.shortcuts", "at"],
  ];

  let open = $state<string | null>(null);
  /** Where the keyboard (or the pointer) is in the menu, and in its submenu. */
  let at = $state<Stop | null>(null);
  let sub = $state<number | null>(null);
  let subAt = $state<Stop | null>(null);
  let inSub = $state(false);
  /** Where the menu and the submenu open, kept inside the window once measured. */
  let anchor = $state({ x: 0, y: 0 });
  let subAnchor = $state({ left: 0, right: 0, top: 0 });
  let pos = $state({ x: 0, y: 0 });
  let subPos = $state({ x: 0, y: 0 });
  let dropEl = $state<HTMLElement | null>(null);
  let subEl = $state<HTMLElement | null>(null);
  let colorsAt = $state<{ x: number; y: number } | null>(null);
  let shortcuts = $state<[string, string][]>([]);
  const buttons = $state<Record<string, HTMLButtonElement>>({});
  let timer: ReturnType<typeof setTimeout> | undefined;

  const chapters = $derived.by(() => {
    if (!open) return false;
    void editor.revision;
    const main = project.info?.main;
    return hasChapters((main && editor.headOf(main, 4000)) ?? "");
  });
  const current = $derived(open ? (menus({ chapters, shortcuts, allColors }).find((m) => m.id === open) ?? null) : null);
  const subEntries = $derived(current && sub !== null ? (current.items[sub]?.items ?? []) : []);

  function show(id: string | null) {
    clearTimeout(timer);
    open = id;
    at = null;
    sub = null;
    subAt = null;
    inSub = false;
    if (!id) return;
    colorsAt = null;
    const r = buttons[id].getBoundingClientRect();
    anchor = { x: r.left, y: r.bottom + 3 };
    if (!shortcuts.length) void ipc.atShortcuts().then((all) => (shortcuts = all));
  }

  function close() {
    show(null);
  }

  /** The menu on the left or on the right, opened at its first entry. */
  function beside(step: number) {
    const i = TOP.findIndex(([id]) => id === open);
    show(TOP[(i + step + TOP.length) % TOP.length][0]);
    if (current) at = move(current.items, null, "down");
  }

  function openSub(i: number, el: HTMLElement, enter: boolean) {
    clearTimeout(timer);
    const r = el.getBoundingClientRect();
    subAnchor = { left: r.left, right: r.right, top: r.top };
    sub = i;
    inSub = enter;
    subAt = enter ? move(current?.items[i]?.items ?? [], null, "down") : null;
  }

  function closeSub() {
    sub = null;
    subAt = null;
    inSub = false;
  }

  // Inside the window: the menu moves left, the submenu goes to the other side.
  $effect(() => {
    if (!dropEl) return;
    const w = dropEl.offsetWidth;
    pos = { x: Math.max(4, Math.min(anchor.x, window.innerWidth - w - 4)), y: anchor.y };
  });
  $effect(() => {
    if (!subEl) return;
    const { offsetWidth: w, offsetHeight: h } = subEl;
    const x = subAnchor.right + w + 6 > window.innerWidth ? subAnchor.left - w - 2 : subAnchor.right + 2;
    subPos = { x: Math.max(4, x), y: Math.max(4, Math.min(subAnchor.top - 5, window.innerHeight - h - 4)) };
  });

  function allColors() {
    const r = dropEl?.getBoundingClientRect();
    colorsAt = { x: r ? r.left : anchor.x, y: anchor.y };
  }

  async function run(fn?: () => unknown) {
    close();
    await fn?.();
    if (!colorsAt) editor.focus();
  }

  /** The entry or the cell at a stop: chosen, or its submenu opened. */
  function choose(entries: MenuEntry[], s: Stop, inside: boolean) {
    const e = entries[s.entry];
    if (s.cell !== undefined) return void run(e.cells?.[s.cell]?.run);
    if (e.disabled) return;
    if (e.items && !inside) {
      const el = dropEl?.querySelector<HTMLElement>(`[data-entry="${s.entry}"]`);
      if (el) openSub(s.entry, el, true);
    } else void run(e.run);
  }

  function key(e: KeyboardEvent) {
    if (!current) return;
    const list = inSub ? subEntries : current.items;
    const here = inSub ? subAt : at;
    const set = (s: Stop | null) => {
      if (inSub) subAt = s;
      else {
        at = s;
        if (sub !== null && s?.entry !== sub) closeSub();
      }
    };
    let handled = true;
    if (e.key === "Escape") {
      if (inSub) closeSub();
      else {
        close();
        editor.focus();
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") set(move(list, here, e.key === "ArrowDown" ? "down" : "up"));
    else if (e.key === "ArrowRight") {
      const next = move(list, here, "right");
      if (next) set(next);
      else if (!inSub && here && here.cell === undefined && list[here.entry].items && !list[here.entry].disabled) choose(list, here, false);
      else beside(1);
    } else if (e.key === "ArrowLeft") {
      const prev = move(list, here, "left");
      if (prev) set(prev);
      else if (inSub) closeSub();
      else beside(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      if (here) choose(list, here, inSub);
    } else if (e.key === "Tab") {
      close();
      handled = false;
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const s = byLetter(list, here, e.key);
      if (s) set(s);
    } else if (e.metaKey || e.ctrlKey) {
      // A shortcut: the menu closes and the shortcut does what it does.
      close();
      handled = false;
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  $effect(() => {
    if (!open) return;
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  function outside(e: PointerEvent) {
    const el = e.target as HTMLElement;
    if (open && !el.closest(".menubar, .menu-drop")) close();
    if (colorsAt && !el.closest(".color-menu")) colorsAt = null;
  }

  /**
   * A real move of the pointer: the page changing under a pointer at rest
   * (a menu opening below it) does not take the place of the keyboard.
   */
  const moved = (e: PointerEvent) => e.movementX !== 0 || e.movementY !== 0;

  /** Passing over an entry: it is the one meant, and its submenu opens (or the open one closes). */
  function hover(i: number, entry: MenuEntry, el: HTMLElement) {
    if (isAt(at, i) && !inSub) return;
    at = { entry: i };
    inSub = false;
    clearTimeout(timer);
    if (entry.items && !entry.disabled) {
      if (sub !== i) timer = setTimeout(() => openSub(i, el, false), 120);
    } else if (sub !== null) timer = setTimeout(closeSub, 200);
  }

  /** Keeps the focus (and the selection) in the text. */
  function keep(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  const isAt = (s: Stop | null, entry: number, cell?: number) => !!s && s.entry === entry && s.cell === cell;
</script>

<svelte:window
  onpointerdown={outside}
  onblur={close}
  onresize={close}
  onkeydown={(e) => {
    if (e.key === "Escape" && colorsAt) {
      colorsAt = null;
      editor.focus();
    }
  }}
/>

<div class="menubar" role="menubar" aria-label={t("menu.bar")}>
  {#each TOP as [id, label, icon] (id)}
    <button
      class="top"
      class:open={open === id}
      class:icon-only={!!icon}
      bind:this={buttons[id]}
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={open === id}
      aria-label={t(label)}
      title={icon ? t(label) : undefined}
      data-menu={id}
      onmousedown={keep}
      onclick={() => show(open === id ? null : id)}
      onpointermove={(e) => moved(e) && open && open !== id && show(id)}
    >
      {#if icon}<Icon name={icon} size={15} />{:else}{t(label)}{/if}
    </button>
  {/each}
</div>

{#snippet entries(list: MenuEntry[], here: Stop | null, inside: boolean)}
  {#each list as entry, i (i)}
    {#if entry.separator}
      <div class="sep" role="separator"></div>
    {:else if entry.note}
      <p class="note faint">{entry.note}</p>
    {:else if entry.cells}
      <div class="cells" class:swatches={entry.cells.some((c) => c.swatch)} style:--columns={entry.columns ?? 4}>
        {#each entry.cells as cell, c (c)}
          {@render cellButton(cell, i, c, here, inside)}
        {/each}
      </div>
    {:else}
      <button
        class="entry"
        class:at={isAt(here, i) || (!inside && sub === i)}
        role="menuitem"
        aria-haspopup={entry.items ? "menu" : undefined}
        data-entry={i}
        disabled={entry.disabled}
        onclick={(e) => (entry.items && !inside ? openSub(i, e.currentTarget, true) : run(entry.run))}
        onpointermove={(e) => moved(e) && (inside ? ((subAt = { entry: i }), (inSub = true)) : hover(i, entry, e.currentTarget))}
      >
        <span class="icon">
          {#if entry.checked}<Icon name="check" size={14} />{:else if entry.glyph}<MathGlyph latex={entry.glyph} />{:else if entry.icon}<Icon name={entry.icon} size={14} />{/if}
        </span>
        <span class="label ellipsis">{entry.label}</span>
        {#if entry.hint}<span class="hint mono">{entry.hint}</span>{/if}
        {#if entry.items}<Icon name="chevron-right" size={12} />{:else if entry.keys}<span class="keys">{prettyKey(entry.keys)}</span>{/if}
      </button>
    {/if}
  {/each}
{/snippet}

{#snippet cellButton(cell: MenuCell, i: number, c: number, here: Stop | null, inside: boolean)}
  <button
    class="cell"
    class:at={isAt(here, i, c)}
    class:swatch={!!cell.swatch}
    style:background={cell.swatch}
    role="menuitem"
    title={cell.key ? `${cell.key}  ${cell.label}` : cell.label}
    aria-label={cell.key ? `${cell.key} ${cell.label}` : cell.label}
    disabled={cell.disabled}
    onclick={() => run(cell.run)}
    onpointermove={(e) => moved(e) && (inside ? ((subAt = { entry: i, cell: c }), (inSub = true)) : ((at = { entry: i, cell: c }), (inSub = false)))}
  >
    {#if cell.key}<span class="key mono">{cell.key}</span><MathGlyph latex={cell.glyph ?? cell.label} />{/if}
  </button>
{/snippet}

{#if current}
  <div class="menu-drop" bind:this={dropEl} role="menu" tabindex="-1" aria-label={current.label} data-no-drag data-menu={current.id} style:left="{pos.x}px" style:top="{pos.y}px" onmousedown={keep}>
    {@render entries(current.items, at, false)}
  </div>
  {#if sub !== null && subEntries.length}
    <div class="menu-drop sub" bind:this={subEl} role="menu" tabindex="-1" data-no-drag style:left="{subPos.x}px" style:top="{subPos.y}px" onmousedown={keep} onpointerenter={() => clearTimeout(timer)}>
      {@render entries(subEntries, subAt, true)}
    </div>
  {/if}
{/if}

{#if colorsAt}
  <ColorMenu x={colorsAt.x} y={colorsAt.y} onclose={() => (colorsAt = null)} />
{/if}

<style>
  .menubar {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
  }
  .top {
    display: flex;
    align-items: center;
    height: 28px;
    padding: 0 9px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
  }
  .top.icon-only {
    padding: 0 7px;
  }
  .top:hover,
  .top.open {
    background: var(--bg-hover);
    color: var(--text);
  }
  .top.open {
    color: var(--accent);
  }
  @media (max-width: 1000px) {
    .top {
      padding: 0 6px;
    }
  }
  .menu-drop {
    position: fixed;
    z-index: 880;
    min-width: 240px;
    max-width: 380px;
    max-height: calc(100vh - var(--toolbar-height) - 12px);
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
    outline: none;
    animation: drop 0.1s var(--ease);
  }
  .menu-drop.sub {
    z-index: 881;
    min-width: 200px;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .entry.at {
    background: var(--bg-hover);
  }
  .entry:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .entry :global(.icon:last-child) {
    color: var(--text-faint);
  }
  .icon {
    flex-shrink: 0;
    width: 22px;
    display: flex;
    justify-content: center;
    color: var(--text-muted);
  }
  .icon :global(.glyph) {
    min-width: 0;
    font-size: 11px;
  }
  .label {
    flex: 1;
    min-width: 0;
  }
  .hint {
    font-size: 10.5px;
    color: var(--text-faint);
  }
  .keys {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-faint);
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
  .note {
    margin: 4px 8px 6px;
    font-size: 11.5px;
  }
  /* A grid of small choices: the @ shortcuts, the colours. */
  .cells {
    display: grid;
    grid-template-columns: repeat(var(--columns), 1fr);
    gap: 4px;
    padding: 2px 4px 4px;
  }
  .cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    height: 32px;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    cursor: pointer;
  }
  .cell.at:not(.swatch) {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .cell:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .cell .key {
    font-variant-ligatures: none;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--accent);
  }
  .swatches {
    gap: 6px;
    padding: 6px 8px;
  }
  .cell.swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border-color: var(--border-strong);
  }
  .cell.swatch.at {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
