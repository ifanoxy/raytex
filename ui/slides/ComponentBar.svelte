<script lang="ts" module>
  import type { BlockKind } from "$lib/slides/blocks";

  export interface Component {
    kind: BlockKind;
    variant: string;
  }

  /** The type a component is carried by while it is dragged. */
  export const COMPONENT_TYPE = "application/x-raytex-component";
  /** The type a block of the slide is carried by while it is moved (its index). */
  export const BLOCK_TYPE = "application/x-raytex-block";
</script>

<script lang="ts">
  // The components a slide is made of, to drag where they go (between two
  // blocks of the slide, in a column, in the list on the right) or to add
  // with a click after the block chosen. What they write is the LaTeX of a
  // block, laid out by the order of the blocks and their columns: nothing
  // is placed by its coordinates.
  import { t } from "$lib/i18n.svelte";
  import Icon from "../components/common/Icon.svelte";

  let { onadd, ondrag }: { onadd: (c: Component) => void; ondrag: (c: Component | null) => void } = $props();

  const COMPONENTS: (Component & { icon: string; key: string })[] = [
    { kind: "text", variant: "", icon: "type", key: "slides.component.text" },
    { kind: "list", variant: "", icon: "list", key: "slides.component.list" },
    { kind: "list", variant: "ordered", icon: "list-ordered", key: "slides.component.numbered" },
    { kind: "image", variant: "", icon: "image", key: "slides.component.image" },
    { kind: "columns", variant: "", icon: "layout", key: "slides.component.columns" },
    { kind: "columns", variant: "3", icon: "grid", key: "slides.component.columns3" },
    { kind: "formula", variant: "", icon: "formula", key: "slides.component.formula" },
    { kind: "table", variant: "", icon: "table", key: "slides.component.table" },
    { kind: "box", variant: "", icon: "square", key: "slides.component.box" },
    { kind: "box", variant: "alertblock", icon: "alert-triangle", key: "slides.component.alert" },
    { kind: "box", variant: "exampleblock", icon: "lightbulb", key: "slides.component.example" },
    { kind: "code", variant: "", icon: "code", key: "slides.component.code" },
    { kind: "pause", variant: "", icon: "eye", key: "slides.component.pause" },
  ];
</script>

<div class="components" role="toolbar" aria-label={t("slides.components")}>
  {#each COMPONENTS as c (c.kind + c.variant)}
    <button
      class="component"
      draggable="true"
      data-component={c.variant ? `${c.kind}-${c.variant}` : c.kind}
      title={t("slides.componentHint", { name: t(c.key as "slides.component.text") })}
      onclick={() => onadd({ kind: c.kind, variant: c.variant })}
      ondragstart={(e) => {
        e.dataTransfer?.setData(COMPONENT_TYPE, JSON.stringify({ kind: c.kind, variant: c.variant }));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
        ondrag({ kind: c.kind, variant: c.variant });
      }}
      ondragend={() => ondrag(null)}
    >
      <Icon name={c.icon} size={15} />
      <span>{t(c.key as "slides.component.text")}</span>
    </button>
  {/each}
</div>

<style>
  .components {
    display: flex;
    gap: 2px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .component {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 54px;
    padding: 4px 6px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    font-size: 10.5px;
    cursor: grab;
  }
  .component:hover {
    border-color: var(--border);
    background: var(--bg-hover);
    color: var(--text);
  }
  .component:active {
    cursor: grabbing;
  }
</style>
