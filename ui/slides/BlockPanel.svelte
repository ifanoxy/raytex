<script lang="ts">
  // The content of the slide chosen, in blocks: each one shown by its kind
  // and what it says, opened to be filled (a text, the points of a list, a
  // picture and its width, columns, a formula, the cells of a table, a box
  // and its title), moved, taken out; blocks added after the one chosen. A
  // block changed is written back alone, when its field is left.
  import { open } from "@tauri-apps/plugin-dialog";
  import { t } from "$lib/i18n.svelte";
  import { DIRECT, safeStem, stemOf } from "$lib/images";
  import * as ipc from "$lib/ipc";
  import { pictureFolder } from "$lib/pictures";
  import { graphicsPaths } from "$lib/preamble";
  import { type Block, type BlockEdit, type BlockKind, deleteBlock, type Grid, gridCode, gridColumns, insertBlock, moveBlock, newBlock, oneByOne, replaceBlock, revealStep, setOneByOne, setReveal, tableGrid } from "$lib/slides/blocks";
  import type { Frame } from "$lib/slides/deck";
  import { dirname, join, relative } from "$lib/utils";
  import Icon from "../components/common/Icon.svelte";

  type Make = (text: string, frame: Frame, blocks: Block[]) => BlockEdit | null;

  let {
    text,
    blocks,
    unit,
    path,
    lang,
    steps,
    selected = $bindable(-1),
    onedit,
  }: { text: string; blocks: Block[]; unit: string; path: string | null; lang: "fr" | "en"; steps: number; selected?: number; onedit: (make: Make) => void } = $props();

  /** The steps a block can appear at: those of the slide, and one more. */
  const stepChoices = $derived(Array.from({ length: Math.max(3, steps) }, (_, k) => k + 2));

  const ICONS: Record<BlockKind, string> = {
    text: "type",
    list: "list",
    image: "image",
    columns: "layout",
    formula: "formula",
    table: "table",
    box: "square",
    code: "code",
    pause: "eye",
    special: "title-page",
    raw: "file-tex",
  };
  const ADDABLE: BlockKind[] = ["text", "list", "image", "columns", "formula", "table", "box", "pause"];
  const BOXES = ["block", "alertblock", "exampleblock"] as const;
  const SPECIALS = {
    titlepage: "slides.special.titlepage",
    maketitle: "slides.special.titlepage",
    tableofcontents: "slides.special.tableofcontents",
    sectionpage: "slides.special.sectionpage",
    subsectionpage: "slides.special.subsectionpage",
    partpage: "slides.special.partpage",
  } as const;

  /** Block `i` changed, from what it is when the change is written. */
  function change(i: number, edit: (b: Block) => Block) {
    const kind = blocks[i]?.kind;
    onedit((tx, _f, bs) => (bs[i]?.kind === kind ? replaceBlock(tx, bs, i, edit(bs[i])) : null));
  }

  let adding = $state(false);
  function add(kind: BlockKind) {
    adding = false;
    const after = selected >= 0 ? selected : blocks.length - 1;
    onedit((tx, f, bs) => insertBlock(tx, f, bs, Math.min(after, bs.length - 1), newBlock(kind, lang)));
  }

  /** What a block says, in a few words. */
  function summary(b: Block): string {
    const flat = (s: string) => s.replace(/\s+/g, " ").trim();
    switch (b.kind) {
      case "list":
        return flat(b.items?.[0]?.text ?? "");
      case "image":
        return b.path ?? "";
      case "columns":
        return flat(b.columns?.map((c) => c.text).join(" | ") ?? "");
      case "box":
        return b.title || flat(b.text);
      case "table": {
        const g = tableGrid(b.text);
        return g ? `${g.rows.length} × ${Math.max(0, ...g.rows.map((r) => r.cells.length))}` : "";
      }
      case "special":
        return t(SPECIALS[b.special as keyof typeof SPECIALS] ?? "slides.block.special");
      case "pause":
        return "";
      case "code":
        return b.env ?? "";
      default:
        return flat(b.text);
    }
  }

  const value = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
  /** What a field says when it is left, written in block `i`. */
  const field = (i: number, edit: (b: Block, v: string) => Block) => (e: Event) => {
    const v = value(e);
    change(i, (b) => edit(b, v));
  };
  /** A box ticked or not, written in block `i`. */
  const ticked = (i: number, edit: (b: Block, on: boolean) => Block) => (e: Event) => {
    const on = (e.currentTarget as HTMLInputElement).checked;
    change(i, (b) => edit(b, on));
  };

  // ---------------------------------------------------------------- lists

  function setItem(i: number, k: number, text: string) {
    change(i, (b) => ({ ...b, items: b.items?.map((it, n) => (n === k ? { ...it, text } : it)) }));
  }
  function addItem(i: number) {
    change(i, (b) => ({ ...b, items: [...(b.items ?? []), { text: lang === "fr" ? "Nouveau point" : "New point", overlay: "" }] }));
  }
  function removeItem(i: number, k: number) {
    change(i, (b) => ({ ...b, items: b.items?.filter((_, n) => n !== k) }));
  }

  // -------------------------------------------------------------- pictures

  /** A picture chosen: its path from the deck, copied into the project when it is not in it. */
  async function choosePicture(i: number) {
    if (!path) return;
    const picked = await open({ multiple: false, title: t("slides.image.chooseTitle"), filters: [{ name: "Images", extensions: DIRECT }] });
    if (typeof picked !== "string") return;
    const root = dirname(path);
    let file = picked;
    if (relative(root, picked) === picked.replace(/\\/g, "/")) {
      const ext = picked.split(".").pop() ?? "png";
      file = await ipc.importImage(picked, join(root, pictureFolder([], graphicsPaths(text))), `${safeStem(stemOf(picked))}.${ext}`).catch(() => "");
      if (!file) return;
    }
    const chosen = relative(root, file).replace(/\.(png|jpe?g|pdf|eps)$/i, "");
    change(i, (b) => ({ ...b, path: chosen }));
  }

  // ---------------------------------------------------------------- tables

  /** The grid of table `i` changed (left as it is when it is no longer a plain one). */
  function setGrid(i: number, edit: (g: Grid) => Grid) {
    change(i, (b) => {
      const g = tableGrid(b.text);
      return g ? { ...b, text: gridCode(edit(g), unit) } : b;
    });
  }
  function setCell(i: number, r: number, c: number, text: string) {
    setGrid(i, (g) => ({ ...g, rows: g.rows.map((row, n) => (n === r ? { ...row, cells: Array.from({ length: Math.max(row.cells.length, c + 1) }, (_, k) => (k === c ? text : (row.cells[k] ?? ""))) } : row)) }));
  }
</script>

<svelte:window
  onpointerdown={(e) => adding && !(e.target as HTMLElement).closest(".block-panel .add") && (adding = false)}
  onkeydown={(e) => adding && e.key === "Escape" && (adding = false)}
/>

<div class="block-panel">
  <span class="label faint">{t("slides.blocks")}</span>
  {#if !blocks.length}<p class="faint none">{t("slides.noBlocks")}</p>{/if}
  <div class="blocks" role="list">
    {#each blocks as b, i (i)}
      <div class="block" class:open={i === selected} data-block={i} data-kind={b.kind} role="listitem">
        <div class="head">
          <button class="name" aria-expanded={i === selected} onclick={() => (selected = selected === i ? -1 : i)}>
            <Icon name={ICONS[b.kind]} size={13} />
            <span class="kind">{t(`slides.block.${b.kind}`)}</span>
            <span class="sum ellipsis">{summary(b)}</span>
            {#if b.reveal}
              {@const rs = revealStep(b)}
              <span class="step-chip" title={rs ? t("slides.reveal.chip", { n: rs.step }) : b.reveal.overlay}>{rs ? `${rs.step}${rs.only ? "" : "+"}` : b.reveal.overlay}</span>
            {/if}
          </button>
          <span class="tools">
            <button class="icon-btn tiny" data-action="block-up" title={t("slides.blockUp")} aria-label={t("slides.blockUp")} disabled={i === 0} onclick={() => onedit((tx, _f, bs) => moveBlock(tx, bs, i, -1))}><Icon name="chevron-up" size={13} /></button>
            <button class="icon-btn tiny" data-action="block-down" title={t("slides.blockDown")} aria-label={t("slides.blockDown")} disabled={i === blocks.length - 1} onclick={() => onedit((tx, _f, bs) => moveBlock(tx, bs, i, 1))}><Icon name="chevron-down" size={13} /></button>
            <button class="icon-btn tiny" data-action="block-delete" title={t("slides.blockDelete")} aria-label={t("slides.blockDelete")} onclick={() => onedit((tx, _f, bs) => (bs[i] ? deleteBlock(tx, bs, i) : null))}><Icon name="trash" size={13} /></button>
          </span>
        </div>
        {#if i === selected}
          <div class="fields">
            {#if b.kind === "text"}
              <textarea class="input area" rows="4" value={b.text} onchange={field(i, (x, v) => ({ ...x, text: v }))}></textarea>
            {:else if b.kind === "list"}
              <div class="seg" role="group">
                <button class:on={!b.ordered} data-list="bullets" onclick={() => b.ordered && change(i, (x) => ({ ...x, ordered: false }))}><Icon name="list" size={13} />{t("slides.list.bullets")}</button>
                <button class:on={b.ordered} data-list="numbers" onclick={() => !b.ordered && change(i, (x) => ({ ...x, ordered: true }))}><Icon name="list-ordered" size={13} />{t("slides.list.numbers")}</button>
              </div>
              <label class="check"><input type="checkbox" checked={oneByOne(b)} onchange={ticked(i, (x, on) => setOneByOne(x, on))} />{t("slides.list.oneByOne")}</label>
              {#each b.items ?? [] as it, k (k)}
                <div class="item">
                  <span class="mark faint">{b.ordered ? `${k + 1}.` : "•"}</span>
                  {#if it.text.includes("\n")}
                    <textarea class="input area mono" rows="3" value={it.text} onchange={(e) => setItem(i, k, value(e))}></textarea>
                  {:else}
                    <input class="input" value={it.text} onchange={(e) => setItem(i, k, value(e))} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
                  {/if}
                  <button class="icon-btn tiny" title={t("slides.list.remove")} aria-label={t("slides.list.remove")} onclick={() => removeItem(i, k)}><Icon name="x" size={12} /></button>
                </div>
              {/each}
              <button class="btn small" data-action="add-item" onclick={() => addItem(i)}><Icon name="plus" size={13} />{t("slides.list.add")}</button>
            {:else if b.kind === "image"}
              <div class="row">
                <input class="input mono" value={b.path} aria-label={t("slides.image.file")} onchange={field(i, (x, v) => ({ ...x, path: v.trim() }))} />
                <button class="btn small" onclick={() => choosePicture(i)}>{t("slides.image.choose")}</button>
              </div>
              <label class="range">
                <span>{t("slides.width")}</span>
                <input type="range" min="0.1" max="1" step="0.05" value={b.width || "0.7"} onchange={field(i, (x, v) => ({ ...x, width: String(Number(v)) }))} />
                <span class="faint">{Math.round(Number(b.width || "0.7") * 100)} %</span>
              </label>
              <label class="field"><span>{t("slides.image.caption")}</span><input class="input" value={b.caption} onchange={field(i, (x, v) => ({ ...x, caption: v.trim() }))} /></label>
            {:else if b.kind === "columns"}
              {#each b.columns ?? [] as c, k (k)}
                <div class="column">
                  <label class="range">
                    <span>{t("slides.columnN", { n: k + 1 })}</span>
                    <input type="range" min="0.1" max="1" step="0.02" value={Number(c.width) || 0.48} onchange={field(i, (x, v) => ({ ...x, columns: x.columns!.map((col, n) => (n === k ? { ...col, width: String(Number(v)) } : col)) }))} />
                    <span class="faint">{Math.round((Number(c.width) || 0.48) * 100)} %</span>
                    {#if (b.columns?.length ?? 0) > 1}<button class="icon-btn tiny" title={t("slides.removeColumn")} aria-label={t("slides.removeColumn")} onclick={() => change(i, (x) => ({ ...x, columns: x.columns!.filter((_, n) => n !== k) }))}><Icon name="x" size={12} /></button>{/if}
                  </label>
                  <textarea class="input area" rows="3" value={c.text} onchange={field(i, (x, v) => ({ ...x, columns: x.columns!.map((col, n) => (n === k ? { ...col, text: v } : col)) }))}></textarea>
                </div>
              {/each}
              <button class="btn small" onclick={() => change(i, (x) => ({ ...x, columns: [...x.columns!, { width: "0.3", text: lang === "fr" ? "Texte" : "Text" }] }))}><Icon name="plus" size={13} />{t("slides.addColumn")}</button>
            {:else if b.kind === "formula"}
              <textarea class="input area mono" rows="3" value={b.text} onchange={field(i, (x, v) => ({ ...x, text: v }))}></textarea>
              <label class="check"><input type="checkbox" checked={b.numbered} onchange={ticked(i, (x, on) => ({ ...x, numbered: on }))} />{t("slides.formula.numbered")}</label>
            {:else if b.kind === "table"}
              {@const g = tableGrid(b.text)}
              {#if g}
                <div class="grid-wrap">
                  <table class="grid">
                    <tbody>
                      {#each g.rows as row, r (r)}
                        <tr>
                          {#each Array.from({ length: Math.max(1, ...g.rows.map((x) => x.cells.length)) }, (_, c) => c) as c (c)}
                            <td><input class="cell" value={row.cells[c] ?? ""} onchange={(e) => setCell(i, r, c, value(e).trim())} /></td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
                <div class="row grid-tools">
                  <span class="group">
                    <span class="faint">{t("slides.table.row")}</span>
                    <button class="icon-btn tiny" data-action="add-row" title={t("slides.table.addRow")} aria-label={t("slides.table.addRow")} onclick={() => setGrid(i, (x) => ({ ...x, rows: [...x.rows, { rule: "", cells: [] }] }))}><Icon name="plus" size={13} /></button>
                    <button class="icon-btn tiny" title={t("slides.table.removeRow")} aria-label={t("slides.table.removeRow")} disabled={g.rows.length <= 1} onclick={() => setGrid(i, (x) => ({ ...x, rows: x.rows.slice(0, -1) }))}><Icon name="minus" size={13} /></button>
                  </span>
                  <span class="group">
                    <span class="faint">{t("slides.table.column")}</span>
                    <button class="icon-btn tiny" data-action="add-column" title={t("slides.addColumn")} aria-label={t("slides.addColumn")} onclick={() => setGrid(i, (x) => gridColumns(x, 1))}><Icon name="plus" size={13} /></button>
                    <button class="icon-btn tiny" title={t("slides.table.removeColumn")} aria-label={t("slides.table.removeColumn")} onclick={() => setGrid(i, (x) => gridColumns(x, -1))}><Icon name="minus" size={13} /></button>
                  </span>
                </div>
              {:else}
                <textarea class="input area mono" rows="5" value={b.text} onchange={field(i, (x, v) => ({ ...x, text: v }))}></textarea>
              {/if}
            {:else if b.kind === "box"}
              <div class="seg" role="group">
                {#each BOXES as env (env)}
                  <button class:on={b.env === env} data-box={env} onclick={() => b.env !== env && change(i, (x) => ({ ...x, env }))}>{t(`slides.box.${env}`)}</button>
                {/each}
              </div>
              <label class="field"><span>{t("slides.title")}</span><input class="input" value={b.title} onchange={field(i, (x, v) => ({ ...x, title: v.trim() }))} /></label>
              <textarea class="input area" rows="3" value={b.text} onchange={field(i, (x, v) => ({ ...x, text: v }))}></textarea>
            {:else if b.kind === "code" || b.kind === "raw"}
              <textarea class="input area mono" rows="5" value={b.text} onchange={field(i, (x, v) => ({ ...x, text: v }))}></textarea>
            {:else if b.kind === "pause"}
              <p class="faint hint">{t("slides.pause.hint")}</p>
            {:else if b.kind === "special"}
              <p class="faint hint">{t("slides.special.hint")}</p>
            {/if}
            {#if b.kind !== "pause"}
              {@const rs = revealStep(b)}
              <div class="reveal-row">
                <span>{t("slides.reveal.label")}</span>
                <select class="input" data-reveal value={b.reveal ? (rs ? String(rs.step) : "other") : "1"} onchange={field(i, (x, v) => setReveal(x, Number(v), revealStep(x)?.only ?? false))}>
                  <option value="1">{t("slides.reveal.always")}</option>
                  {#each stepChoices as n (n)}<option value={String(n)}>{t("slides.reveal.from", { n })}</option>{/each}
                  {#if b.reveal && !rs}<option value="other" disabled>{b.reveal.overlay}</option>{/if}
                </select>
                {#if rs}<label class="check"><input type="checkbox" checked={rs.only} onchange={ticked(i, (x, on) => setReveal(x, revealStep(x)?.step ?? 2, on))} />{t("slides.reveal.only")}</label>{/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
  <div class="add">
    <button class="btn small" data-action="add-block" onclick={() => (adding = !adding)}><Icon name="plus" size={13} />{t("slides.addBlock")}</button>
    {#if adding}
      <div class="kinds" role="menu">
        {#each ADDABLE as kind (kind)}
          <button class="kind-btn" role="menuitem" data-add={kind} onclick={() => add(kind)}><Icon name={ICONS[kind]} size={15} /><span>{t(`slides.block.${kind}`)}</span></button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .block-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 12px;
  }
  .none,
  .hint {
    margin: 0;
    font-size: 12px;
  }
  .blocks {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .block {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
  }
  .block.open {
    border-color: var(--accent);
  }
  .head {
    display: flex;
    align-items: center;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    border: 0;
    background: none;
    color: var(--text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .kind {
    flex: none;
    font-weight: 600;
  }
  .sum {
    color: var(--text-muted);
  }
  .step-chip {
    flex: none;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
  }
  .reveal-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }
  .reveal-row select {
    width: auto;
    height: 26px;
    padding: 0 6px;
  }
  .tools {
    display: flex;
    padding-right: 4px;
    opacity: 0;
  }
  .block:hover .tools,
  .block.open .tools,
  .tools:focus-within {
    opacity: 1;
  }
  .icon-btn.tiny {
    width: 22px;
    height: 22px;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 8px 10px;
  }
  .area {
    resize: vertical;
    min-height: 54px;
    font: inherit;
    font-size: 12.5px;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .seg {
    display: flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .seg button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .item .input {
    flex: 1;
    min-width: 0;
  }
  .mark {
    width: 16px;
    font-size: 12px;
    text-align: right;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .row .input {
    flex: 1;
    min-width: 0;
  }
  .grid-tools {
    gap: 16px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
  }
  .group .faint {
    margin-right: 4px;
  }
  .range {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .grid-wrap {
    overflow: auto;
  }
  .grid {
    border-collapse: collapse;
  }
  .grid td {
    padding: 0;
    border: 1px solid var(--border);
  }
  .cell {
    width: 72px;
    height: 26px;
    padding: 0 6px;
    border: 0;
    background: var(--bg);
    color: var(--text);
    font-size: 12px;
  }
  .cell:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .add {
    position: relative;
  }
  .kinds {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    grid-template-columns: repeat(4, 64px);
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
  }
  .kind-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
  }
  .kind-btn:hover {
    border-color: var(--accent);
  }
</style>
