<script lang="ts">
  // The tools of the block chosen, above it on the slide: set it centred,
  // to the right or the left, larger or smaller, from a step on; what its
  // kind has (bullets or numbers and one point a click for a list, the
  // width of a picture or another one, the kind of a box, a number for a
  // formula, a column or a row more); written in place, copied, deleted.
  // Each writes the LaTeX of the block, in its environments.
  import { t } from "$lib/i18n.svelte";
  import { alignOf, type Block, gridColumns, gridCode, oneByOne, revealStep, setOneByOne, setAlign, setReveal, stepSize, tableGrid } from "$lib/slides/blocks";
  import Icon from "../components/common/Icon.svelte";

  let {
    block,
    steps,
    unit,
    lang,
    writable,
    onchange,
    onduplicate,
    ondelete,
    onwrite,
    onpicture,
  }: {
    block: Block;
    steps: number;
    unit: string;
    lang: "fr" | "en";
    writable: boolean;
    onchange: (edit: (b: Block) => Block) => void;
    onduplicate: () => void;
    ondelete: () => void;
    onwrite: () => void;
    onpicture: () => void;
  } = $props();

  const align = $derived(alignOf(block));
  const rs = $derived(revealStep(block));
  const grid = $derived(block.kind === "table" ? tableGrid(block.text) : null);
  const stepChoices = $derived(Array.from({ length: Math.max(3, steps) }, (_, k) => k + 2));
  const ALIGNS = [
    { id: "left", icon: "align-left", key: "slides.tools.left" },
    { id: "center", icon: "align-center", key: "slides.tools.center" },
    { id: "right", icon: "align-right", key: "slides.tools.right" },
  ] as const;
  const widthOf = (b: Block) => Number(b.width || "0.7");
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="slide-tools" role="toolbar" tabindex="-1" aria-label={t("slides.tools")} onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
  {#if block.kind !== "pause"}
    <span class="group">
      {#each ALIGNS as a (a.id)}
        <button class="tool" class:on={align === a.id} data-align={a.id} title={t(a.key)} aria-label={t(a.key)} onclick={() => onchange((b) => setAlign(b, a.id, unit))}><Icon name={a.icon} size={14} /></button>
      {/each}
    </span>
  {/if}
  {#if block.kind !== "pause" && block.kind !== "image"}
    <span class="group">
      <button class="tool text" data-size="-1" title={t("slides.tools.smaller")} aria-label={t("slides.tools.smaller")} disabled={block.size === "tiny"} onclick={() => onchange((b) => stepSize(b, -1))}>A<sup>−</sup></button>
      <button class="tool text big" data-size="1" title={t("slides.tools.larger")} aria-label={t("slides.tools.larger")} disabled={block.size === "Huge"} onclick={() => onchange((b) => stepSize(b, 1))}>A<sup>+</sup></button>
    </span>
  {/if}
  {#if block.kind === "list"}
    <span class="group">
      <button class="tool" class:on={!block.ordered} data-list="bullets" title={t("slides.list.bullets")} aria-label={t("slides.list.bullets")} onclick={() => onchange((b) => ({ ...b, ordered: false }))}><Icon name="list" size={14} /></button>
      <button class="tool" class:on={block.ordered} data-list="numbers" title={t("slides.list.numbers")} aria-label={t("slides.list.numbers")} onclick={() => onchange((b) => ({ ...b, ordered: true }))}><Icon name="list-ordered" size={14} /></button>
      <button class="tool" class:on={oneByOne(block)} data-list="one-by-one" title={t("slides.list.oneByOne")} aria-label={t("slides.list.oneByOne")} onclick={() => onchange((b) => setOneByOne(b, !oneByOne(b)))}><Icon name="eye" size={14} /></button>
      <button class="tool" data-list="add" title={t("slides.list.add")} aria-label={t("slides.list.add")} onclick={() => onchange((b) => ({ ...b, items: [...(b.items ?? []), { text: lang === "fr" ? "Nouveau point" : "New point", overlay: "" }] }))}><Icon name="plus" size={14} /></button>
    </span>
  {:else if block.kind === "image"}
    <span class="group">
      <button class="tool" data-width="-1" title={t("slides.tools.narrower")} aria-label={t("slides.tools.narrower")} disabled={widthOf(block) <= 0.1} onclick={() => onchange((b) => ({ ...b, width: String(Math.max(0.1, Math.round((widthOf(b) - 0.1) * 10) / 10)) }))}><Icon name="zoom-out" size={14} /></button>
      <span class="value">{Math.round(widthOf(block) * 100)} %</span>
      <button class="tool" data-width="1" title={t("slides.tools.wider")} aria-label={t("slides.tools.wider")} disabled={widthOf(block) >= 1} onclick={() => onchange((b) => ({ ...b, width: String(Math.min(1, Math.round((widthOf(b) + 0.1) * 10) / 10)) }))}><Icon name="zoom-in" size={14} /></button>
      <button class="tool" data-action="picture" title={t("slides.tools.picture")} aria-label={t("slides.tools.picture")} onclick={onpicture}><Icon name="image" size={14} /></button>
    </span>
  {:else if block.kind === "box"}
    <select class="input mini" data-box-kind value={block.env} aria-label={t("slides.block.box")} onchange={(e) => {
      const env = (e.currentTarget as HTMLSelectElement).value;
      onchange((b) => ({ ...b, env }));
    }}>
      {#each ["block", "alertblock", "exampleblock"] as env (env)}<option value={env}>{t(`slides.box.${env}` as "slides.box.block")}</option>{/each}
    </select>
  {:else if block.kind === "formula"}
    <button class="tool" class:on={block.numbered} data-action="numbered" title={t("slides.formula.numbered")} aria-label={t("slides.formula.numbered")} onclick={() => onchange((b) => ({ ...b, numbered: !b.numbered }))}><Icon name="hash" size={14} /></button>
  {:else if block.kind === "columns"}
    <button class="tool" data-action="add-column" title={t("slides.addColumn")} aria-label={t("slides.addColumn")} onclick={() => onchange((b) => ({ ...b, columns: [...(b.columns ?? []).map((c) => ({ ...c, width: String(Math.round((0.96 / ((b.columns?.length ?? 1) + 1)) * 100) / 100) })), { width: String(Math.round((0.96 / ((b.columns?.length ?? 1) + 1)) * 100) / 100), text: lang === "fr" ? "Texte" : "Text" }] }))}><Icon name="plus" size={14} /></button>
  {:else if grid}
    <span class="group">
      <button class="tool" title={t("slides.table.addRow")} aria-label={t("slides.table.addRow")} onclick={() => onchange((b) => {
        const g = tableGrid(b.text);
        return g ? { ...b, text: gridCode({ ...g, rows: [...g.rows, { rule: "", cells: [] }] }, unit) } : b;
      })}><Icon name="plus" size={14} /><span class="mini-label">{t("slides.table.row")}</span></button>
      <button class="tool" title={t("slides.addColumn")} aria-label={t("slides.addColumn")} onclick={() => onchange((b) => {
        const g = tableGrid(b.text);
        return g ? { ...b, text: gridCode(gridColumns(g, 1), unit) } : b;
      })}><Icon name="plus" size={14} /><span class="mini-label">{t("slides.table.column")}</span></button>
    </span>
  {/if}
  {#if block.kind !== "pause"}
    <select class="input mini" data-tools-reveal value={block.reveal ? (rs ? String(rs.step) : "other") : "1"} aria-label={t("slides.reveal.label")} title={t("slides.reveal.label")} onchange={(e) => {
      const step = Number((e.currentTarget as HTMLSelectElement).value);
      onchange((b) => setReveal(b, step, revealStep(b)?.only ?? false));
    }}>
      <option value="1">{t("slides.reveal.always")}</option>
      {#each stepChoices as n (n)}<option value={String(n)}>{t("slides.reveal.from", { n })}</option>{/each}
      {#if block.reveal && !rs}<option value="other" disabled>{block.reveal.overlay}</option>{/if}
    </select>
  {/if}
  <span class="group">
    {#if writable}<button class="tool" data-action="write" title={t("slides.tools.write")} aria-label={t("slides.tools.write")} onclick={onwrite}><Icon name="edit" size={14} /></button>{/if}
    <button class="tool" data-action="duplicate-block" title={t("slides.tools.duplicate")} aria-label={t("slides.tools.duplicate")} onclick={onduplicate}><Icon name="copy" size={14} /></button>
    <button class="tool" data-action="delete-block" title={t("slides.blockDelete")} aria-label={t("slides.blockDelete")} onclick={ondelete}><Icon name="trash" size={14} /></button>
  </span>
</div>

<style>
  .slide-tools {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 5px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
    white-space: nowrap;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 1px;
  }
  .group + .group,
  .group + select,
  select + .group {
    padding-left: 6px;
    border-left: 1px solid var(--border);
  }
  .tool {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 26px;
    height: 26px;
    padding: 0 4px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tool:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .tool.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tool:disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  .tool.text {
    font-size: 12px;
    font-weight: 700;
  }
  .tool.big {
    font-size: 15px;
  }
  .tool sup {
    font-size: 9px;
  }
  .value {
    min-width: 38px;
    font-size: 11.5px;
    text-align: center;
    color: var(--text-muted);
  }
  .mini-label {
    font-size: 11px;
  }
  .mini {
    width: auto;
    height: 26px;
    padding: 0 4px;
    font-size: 12px;
  }
</style>
