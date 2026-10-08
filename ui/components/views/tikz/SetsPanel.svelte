<script lang="ts">
  // The sets of the whiteboard, on a shelf of their own under the paper:
  // shapes kept under a name, drawn again with a click, in any picture of
  // any project. A set is kept from the selection, renamed and removed here.
  import { t } from "$lib/i18n.svelte";
  import type { ShapeSet } from "$lib/tikz/model";
  import Icon from "../../common/Icon.svelte";
  import ShapeThumb from "./ShapeThumb.svelte";

  let {
    sets,
    canSave,
    open = $bindable(true),
    renaming = $bindable(null),
    oninsert,
    onsave,
    onrename,
    ondelete,
  }: {
    /** The sets of the user. */
    sets: ShapeSet[];
    /** Something is selected on the whiteboard. */
    canSave: boolean;
    /** The shelf shows its sets (else only its title). */
    open?: boolean;
    /** The set whose name is being typed (a new one starts that way). */
    renaming?: string | null;
    oninsert: (set: ShapeSet) => void;
    onsave: () => void;
    onrename: (id: string, name: string) => void;
    ondelete: (id: string) => void;
  } = $props();

  function named(e: Event, set: ShapeSet) {
    const name = (e.currentTarget as HTMLInputElement).value.trim();
    renaming = null;
    if (name && name !== set.name) onrename(set.id, name);
  }

  /** The name being typed takes the cursor, all of it selected. */
  function focusAll(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<section class="sets" class:closed={!open} aria-label={t("tikz.sets.title")}>
  <header>
    <button class="title" aria-expanded={open} onclick={() => (open = !open)}>
      <Icon name="star" size={14} />
      <strong>{t("tikz.sets.title")}</strong>
      {#if sets.length}<span class="n">{sets.length}</span>{/if}
      <Icon name={open ? "chevron-down" : "chevron-up"} size={13} />
    </button>
    <button class="save" disabled={!canSave} onclick={onsave} title={t("tikz.saveSetTitle")}>
      <Icon name="plus" size={13} />{t("tikz.sets.keep")}
    </button>
  </header>

  {#if open}
    {#if sets.length}
      <div class="row">
        {#each sets as set (set.id)}
          <div class="set">
            <button class="thumb" onclick={() => oninsert(set)} title={t("tikz.sets.insert", { name: set.name })} aria-label={t("tikz.sets.insert", { name: set.name })}>
              <ShapeThumb code={set.code} />
            </button>
            {#if renaming === set.id}
              <input class="input small name" value={set.name} use:focusAll onblur={(e) => named(e, set)} onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") renaming = null;
              }} aria-label={t("tikz.sets.rename")} />
            {:else}
              <div class="caption">
                <button class="label ellipsis" onclick={() => (renaming = set.id)} title={t("tikz.sets.rename")}>{set.name}</button>
                <button class="x" onclick={() => ondelete(set.id)} title={t("common.delete")} aria-label={t("common.delete")}><Icon name="x" size={11} /></button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty faint">{t("tikz.sets.empty")}</p>
    {/if}
  {/if}
</section>

<style>
  .sets {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 7px 12px 9px;
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .sets.closed {
    padding-bottom: 7px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
  }
  .title:hover {
    background: var(--bg-hover);
  }
  .n {
    padding: 0 6px;
    border-radius: 8px;
    background: var(--bg-hover);
    font-size: 10.5px;
    line-height: 16px;
    color: var(--text-muted);
  }
  .save {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: var(--accent-soft);
    font-size: 11.5px;
    color: var(--accent);
    cursor: pointer;
  }
  .save:hover:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }
  .save:disabled {
    border-color: var(--border);
    background: none;
    color: var(--text-faint);
    cursor: default;
  }
  /* The sets side by side: the shelf scrolls when there are many. */
  .row {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .set {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 96px;
    flex-shrink: 0;
  }
  .thumb {
    height: 62px;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: #fdfdfc;
    cursor: pointer;
  }
  .thumb:hover {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .caption {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .label {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    text-align: left;
    cursor: text;
  }
  .label:hover {
    color: var(--text);
  }
  .x {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    opacity: 0;
  }
  .set:hover .x,
  .x:focus-visible {
    opacity: 1;
  }
  .x:hover {
    background: var(--bg-hover);
    color: var(--error);
  }
  .name {
    width: 100%;
    height: 22px;
    font-size: 11.5px;
  }
  .empty {
    margin: 0 4px 2px;
    font-size: 11.5px;
    line-height: 1.5;
  }
</style>
