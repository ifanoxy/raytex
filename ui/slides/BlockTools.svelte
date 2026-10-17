<script lang="ts">
  // The tools of the block chosen, above it on the slide, in one row: the
  // words chosen in bold, italic, underlined, alerted, in a colour, a
  // formula, a link (on the text that has the caret); the block on the
  // left, centred or on the right, smaller or larger; what its kind has; the
  // step it appears at; copied, deleted. Each writes plain LaTeX.
  import { t } from "$lib/i18n.svelte";
  import { alignOf, type Block, type Grid, gridAddColumn, gridAddRow, gridAlign, gridCode, gridHeader, gridLines, gridRemoveColumn, gridRemoveRow, oneByOne, revealStep, setAlign, setGridHeader, setGridLines, setOneByOne, setReveal, stepSize, type TableLines, tableGrid } from "$lib/slides/blocks";
  import { INLINE_COLORS } from "$lib/slides/rich";
  import type { RichTool } from "$lib/slides/rich";
  import Icon from "../components/common/Icon.svelte";

  let {
    block,
    steps,
    unit,
    onchange,
    onduplicate,
    ondelete,
    onpicture,
  }: {
    block: Block;
    steps: number;
    unit: string;
    onchange: (edit: (b: Block) => Block) => void;
    onduplicate: () => void;
    ondelete: () => void;
    onpicture: () => void;
  } = $props();

  const align = $derived(alignOf(block));
  const rs = $derived(revealStep(block));
  const grid = $derived(block.kind === "table" ? tableGrid(block.text) : null);
  const words = $derived(["text", "list", "box", "columns", "table"].includes(block.kind));
  const stepChoices = $derived(Array.from({ length: Math.max(3, steps) }, (_, k) => k + 2));
  let colors = $state(false);
  let open = $state<"row" | "column" | null>(null);

  /**
   * The table changed around its cell that has (or last had) the caret
   * (else its last one), written at the indentation of the document.
   */
  function table(edit: (g: Grid, at: { r: number; c: number }) => Grid) {
    open = null;
    const said = document.querySelector<HTMLElement>(".slides-mode .paper .block.selected table")?.dataset.cell;
    onchange((b) => {
      const g = tableGrid(b.text);
      if (!g) return b;
      const [r, c] = said ? said.split(":").map(Number) : [g.rows.length - 1, Math.max(0, ...g.rows.map((x) => x.cells.length)) - 1];
      return { ...b, text: gridCode(edit(g, { r, c }), unit) };
    });
  }
  const widthOf = (b: Block) => Number(b.width || "0.7");

  /**
   * A tool on the words chosen: in the text of the block chosen that has the
   * caret, else on the whole of its first text.
   */
  function use(tool: RichTool, color?: string) {
    colors = false;
    const chosen = document.querySelector<HTMLElement>(".slides-mode .paper .block.selected");
    let target = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(".rich") : null;
    if (!target || !chosen?.contains(target)) {
      target = chosen?.querySelector<HTMLElement>(".rich") ?? null;
      if (!target) return;
      target.focus();
      getSelection()?.selectAllChildren(target);
    }
    target.dispatchEvent(new CustomEvent("rich-format", { detail: { tool, color } }));
  }

  const TEXT_TOOLS: { tool: RichTool; icon: string; key: string }[] = [
    { tool: "b", icon: "bold", key: "slides.text.bold" },
    { tool: "i", icon: "italic", key: "slides.text.italic" },
    { tool: "u", icon: "underline", key: "slides.text.underline" },
    { tool: "alert", icon: "alert-circle", key: "slides.text.alert" },
  ];
  const ALIGNS = [
    { id: "left", icon: "align-left", key: "slides.tools.left" },
    { id: "center", icon: "align-center", key: "slides.tools.center" },
    { id: "right", icon: "align-right", key: "slides.tools.right" },
  ] as const;
</script>

<svelte:window onpointerdown={(e) => (open || colors) && !(e.target as HTMLElement).closest(".block-tools .menu-wrap, .block-tools .colors") && ((open = null), (colors = false))} />

<!-- The text keeps its caret and its selection: the tools take no focus. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="block-tools" role="toolbar" tabindex="-1" aria-label={t("slides.tools")} onmousedown={(e) => (e.target as HTMLElement).closest("select") || e.preventDefault()} onclick={(e) => e.stopPropagation()}>
  {#if words}
    <span class="group">
      {#each TEXT_TOOLS as tl (tl.tool)}
        <button class="tool" data-tool={tl.tool} title={t(tl.key as "slides.text.bold")} aria-label={t(tl.key as "slides.text.bold")} onclick={() => use(tl.tool)}><Icon name={tl.icon} size={14} /></button>
      {/each}
      <span class="colors">
        <button class="tool" data-tool="color" title={t("slides.text.color")} aria-label={t("slides.text.color")} onclick={() => (colors = !colors)}><Icon name="text-color" size={14} /></button>
        {#if colors}
          <span class="swatches" role="menu">
            <button class="swatch theme" role="menuitem" data-color="structure" title={t("slides.text.structure")} onclick={() => use("structure")}>A</button>
            {#each INLINE_COLORS as c (c.id)}
              <button class="swatch" role="menuitem" data-color={c.id} title={c.id} aria-label={c.id} style:background={c.swatch} onclick={() => use("color", c.id)}></button>
            {/each}
          </span>
        {/if}
      </span>
      <button class="tool" data-tool="math" title={t("slides.text.math")} aria-label={t("slides.text.math")} onclick={() => use("math")}><Icon name="formula" size={14} /></button>
      <button class="tool" data-tool="link" title={t("slides.text.link")} aria-label={t("slides.text.link")} onclick={() => use("link")}><Icon name="link" size={14} /></button>
    </span>
  {/if}
  {#if block.kind !== "pause"}
    <span class="group">
      {#each ALIGNS as a (a.id)}
        <button class="tool" class:on={align === a.id} data-align={a.id} title={t(a.key)} aria-label={t(a.key)} onclick={() => onchange((b) => setAlign(b, a.id, unit))}><Icon name={a.icon} size={14} /></button>
      {/each}
    </span>
  {/if}
  {#if words}
    <span class="group">
      <button class="tool text" data-size="-1" title={t("slides.tools.smaller")} aria-label={t("slides.tools.smaller")} disabled={block.size === "tiny"} onclick={() => onchange((b) => stepSize(b, -1))}>A<sup>−</sup></button>
      <button class="tool text big" data-size="1" title={t("slides.tools.larger")} aria-label={t("slides.tools.larger")} disabled={block.size === "Huge"} onclick={() => onchange((b) => stepSize(b, 1))}>A<sup>+</sup></button>
    </span>
  {/if}
  {#if block.kind === "list"}
    <span class="group">
      <button class="tool" class:on={!block.ordered} data-list="bullets" title={t("slides.list.bullets")} aria-label={t("slides.list.bullets")} onclick={() => onchange((b) => ({ ...b, ordered: false }))}><Icon name="list" size={14} /></button>
      <button class="tool" class:on={block.ordered} data-list="numbers" title={t("slides.list.numbers")} aria-label={t("slides.list.numbers")} onclick={() => onchange((b) => ({ ...b, ordered: true }))}><Icon name="list-ordered" size={14} /></button>
      <button class="tool labelled" class:on={oneByOne(block)} data-list="one-by-one" title={t("slides.list.oneByOne")} onclick={() => onchange((b) => setOneByOne(b, !oneByOne(b)))}><Icon name="eye" size={14} /><span>{t("slides.tools.oneByOne")}</span></button>
    </span>
  {:else if block.kind === "image"}
    <span class="group">
      <button class="tool" data-width="-1" title={t("slides.tools.narrower")} aria-label={t("slides.tools.narrower")} disabled={widthOf(block) <= 0.1} onclick={() => onchange((b) => ({ ...b, width: String(Math.max(0.1, Math.round((widthOf(b) - 0.1) * 10) / 10)) }))}><Icon name="minus" size={14} /></button>
      <span class="value">{Math.round(widthOf(block) * 100)} %</span>
      <button class="tool" data-width="1" title={t("slides.tools.wider")} aria-label={t("slides.tools.wider")} disabled={widthOf(block) >= 1} onclick={() => onchange((b) => ({ ...b, width: String(Math.min(1, Math.round((widthOf(b) + 0.1) * 10) / 10)) }))}><Icon name="plus" size={14} /></button>
      <button class="tool labelled" data-action="picture" title={t("slides.tools.picture")} onclick={onpicture}><Icon name="image" size={14} /><span>{t("slides.tools.change")}</span></button>
    </span>
  {:else if block.kind === "box"}
    <select class="input mini" data-box-kind value={block.env} aria-label={t("slides.block.box")} onchange={(e) => {
      const env = (e.currentTarget as HTMLSelectElement).value;
      onchange((b) => ({ ...b, env }));
    }}>
      {#each ["block", "alertblock", "exampleblock"] as env (env)}<option value={env}>{t(`slides.box.${env}` as "slides.box.block")}</option>{/each}
    </select>
  {:else if block.kind === "formula"}
    <button class="tool labelled" class:on={block.numbered} data-action="numbered" title={t("slides.formula.numbered")} onclick={() => onchange((b) => ({ ...b, numbered: !b.numbered }))}><Icon name="hash" size={14} /><span>{t("slides.formula.numbered")}</span></button>
  {:else if block.kind === "columns"}
    <button class="tool labelled" data-action="add-column" title={t("slides.addColumn")} onclick={() => onchange((b) => {
      const n = (b.columns?.length ?? 1) + 1;
      const w = String(Math.round((0.96 / n) * 100) / 100);
      return { ...b, columns: [...(b.columns ?? []).map((c) => ({ ...c, width: w })), { width: w, text: "" }] };
    })}><Icon name="plus" size={14} /><span>{t("slides.table.column")}</span></button>
  {:else if grid}
    {@const lines = gridLines(grid)}
    <span class="group">
      <span class="menu-wrap">
        <button class="tool labelled" data-action="row-menu" onclick={() => (open = open === "row" ? null : "row")}><Icon name="table" size={14} /><span>{t("slides.table.row")}</span><Icon name="chevron-down" size={11} /></button>
        {#if open === "row"}
          <span class="drop" role="menu">
            <button role="menuitem" data-action="row-above" onclick={() => table((g, at) => gridAddRow(g, at.r))}>{t("slides.table.rowAbove")}</button>
            <button role="menuitem" data-action="row-below" onclick={() => table((g, at) => gridAddRow(g, at.r + 1))}>{t("slides.table.rowBelow")}</button>
            <button role="menuitem" data-action="row-delete" disabled={grid.rows.length <= 1} onclick={() => table((g, at) => gridRemoveRow(g, at.r))}>{t("slides.table.rowDelete")}</button>
          </span>
        {/if}
      </span>
      <span class="menu-wrap">
        <button class="tool labelled" data-action="column-menu" onclick={() => (open = open === "column" ? null : "column")}><Icon name="layout" size={14} /><span>{t("slides.table.column")}</span><Icon name="chevron-down" size={11} /></button>
        {#if open === "column"}
          <span class="drop" role="menu">
            <button role="menuitem" data-action="column-left" onclick={() => table((g, at) => gridAddColumn(g, at.c))}>{t("slides.table.columnLeft")}</button>
            <button role="menuitem" data-action="column-right" onclick={() => table((g, at) => gridAddColumn(g, at.c + 1))}>{t("slides.table.columnRight")}</button>
            <button role="menuitem" data-action="column-delete" onclick={() => table((g, at) => gridRemoveColumn(g, at.c))}>{t("slides.table.columnDelete")}</button>
            <span class="drop-sep"></span>
            <span class="drop-row">
              {#each ALIGNS as a (a.id)}
                <button class="tool" data-column-align={a.id} title={t(a.key)} aria-label={t(a.key)} onclick={() => table((g, at) => gridAlign(g, at.c, a.id === "left" ? "l" : a.id === "center" ? "c" : "r"))}><Icon name={a.icon} size={14} /></button>
              {/each}
            </span>
          </span>
        {/if}
      </span>
    </span>
    <select class="input mini" data-table-lines value={lines ?? "other"} aria-label={t("slides.table.lines")} title={t("slides.table.lines")} onchange={(e) => {
      const v = (e.currentTarget as HTMLSelectElement).value as TableLines;
      table((g) => setGridLines(g, v));
    }}>
      <option value="none">{t("slides.table.linesNone")}</option>
      <option value="header">{t("slides.table.linesHeader")}</option>
      <option value="rows">{t("slides.table.linesRows")}</option>
      <option value="grid">{t("slides.table.linesGrid")}</option>
      {#if !lines}<option value="other" disabled>{t("slides.table.linesOther")}</option>{/if}
    </select>
    <button class="tool labelled" class:on={gridHeader(grid)} data-action="table-head" title={t("slides.table.headHint")} onclick={() => table((g) => setGridHeader(g, !gridHeader(g)))}><Icon name="bold" size={13} /><span>{t("slides.table.head")}</span></button>
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
    <button class="tool" data-action="duplicate-block" title={t("slides.tools.duplicate")} aria-label={t("slides.tools.duplicate")} onclick={onduplicate}><Icon name="copy" size={14} /></button>
    <button class="tool" data-action="delete-block" title={t("slides.blockDelete")} aria-label={t("slides.blockDelete")} onclick={ondelete}><Icon name="trash" size={14} /></button>
  </span>
</div>

<style>
  .block-tools {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 3px 5px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
    color: var(--text);
    font-size: 12px;
    outline: none;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 1px;
  }
  .group + .group,
  .group + select,
  select + .group,
  .group + .tool,
  .tool + select {
    padding-left: 5px;
    border-left: 1px solid var(--border);
  }
  .tool {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
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
    opacity: 0.35;
    pointer-events: none;
  }
  .tool.labelled span {
    font-size: 11.5px;
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
    min-width: 36px;
    font-size: 11.5px;
    text-align: center;
    color: var(--text-muted);
  }
  .mini {
    width: auto;
    height: 26px;
    padding: 0 4px;
    font-size: 12px;
  }
  .colors,
  .menu-wrap {
    position: relative;
  }
  .drop {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    flex-direction: column;
    min-width: 190px;
    padding: 4px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
  }
  .drop > button {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .drop > button:hover {
    background: var(--bg-hover);
  }
  .drop > button:disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  .drop-sep {
    height: 1px;
    margin: 4px 2px;
    background: var(--border);
  }
  .drop-row {
    display: flex;
    gap: 2px;
    padding: 0 4px;
  }
  .swatches {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: -4px;
    display: flex;
    gap: 4px;
    padding: 5px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
  }
  .swatch {
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
    cursor: pointer;
  }
  .swatch.theme {
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 10px;
    font-weight: 700;
  }
</style>
