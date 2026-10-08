<script lang="ts">
  // The sets of the whiteboard: shapes kept under a name, drawn again with
  // a click, in any picture of any project. Those of the user first (kept
  // from the selection, renamed and removed here), then a few of RayTeX.
  import { t } from "$lib/i18n.svelte";
  import type { ShapeSet } from "$lib/tikz/model";
  import Icon from "../../common/Icon.svelte";
  import ShapeThumb from "./ShapeThumb.svelte";

  let {
    sets,
    builtin,
    canSave,
    renaming = $bindable(null),
    oninsert,
    onsave,
    onrename,
    ondelete,
  }: {
    /** The sets of the user. */
    sets: ShapeSet[];
    /** Those RayTeX comes with. */
    builtin: ShapeSet[];
    /** Something is selected on the whiteboard. */
    canSave: boolean;
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

<div class="sets">
  <button class="save" disabled={!canSave} onclick={onsave} title={t("tikz.saveSetTitle")}>
    <Icon name="star" size={14} />{t("tikz.saveSet")}
  </button>

  {#if sets.length}
    <div class="grid">
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

  <span class="group faint">{t("tikz.sets.builtin")}</span>
  <div class="grid">
    {#each builtin as set (set.id)}
      <div class="set">
        <button class="thumb" onclick={() => oninsert(set)} title={t("tikz.sets.insert", { name: set.name })} aria-label={t("tikz.sets.insert", { name: set.name })}>
          <ShapeThumb code={set.code} />
        </button>
        <div class="caption"><span class="label ellipsis">{set.name}</span></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .sets {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px 12px;
    overflow: auto;
  }
  .save {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 32px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    background: none;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
  }
  .save:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }
  .save:disabled {
    color: var(--text-faint);
    cursor: default;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 8px;
  }
  .set {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .thumb {
    aspect-ratio: 4 / 3;
    padding: 6px;
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
  }
  button.label {
    cursor: text;
  }
  button.label:hover {
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
  .group {
    margin-top: 4px;
    font-size: 11px;
    letter-spacing: 0.02em;
  }
  .empty {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
  }
</style>
