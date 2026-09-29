<script lang="ts">
  // Grid editor: a matrix or a table filled cell by cell. Each cell is a
  // small LaTeX editor (colours, completion, macros, Ctrl+B / I / U…). Enter
  // goes to the next cell, Tab in the last cell adds a row, Ctrl+Enter
  // inserts; cells pasted from a spreadsheet (or LaTeX) fill the grid. An `&`
  // typed in a cell is the character. Opened on a new grid or, from the chip
  // after `\begin{…}`, on an environment of the document.
  import { EditorView } from "@codemirror/view";
  import { onMount, tick } from "svelte";
  import type { CellMove } from "$lib/editor/cell";
  import { displayHtml, textHtml } from "$lib/editor/math-preview";
  import { cellLatex, type Grid, gridToLatex, pastedCells, resize, specOf, type TableStyle, trimmed } from "$lib/grid";
  import { t } from "$lib/i18n.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { gridStore } from "$lib/state/grid.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { escapeSnippet, prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import GridCell from "./GridCell.svelte";

  const request = gridStore.request;
  const editing = !!request?.range;
  const path = request?.range?.path ?? editor.active ?? "";
  let g = $state<Grid>(
    request
      ? ($state.snapshot(request.grid) as Grid)
      : { kind: "matrix", env: "pmatrix", cells: [[""]], columns: ["c"], style: "plain", header: false, option: "", rawSpec: null, rawCount: 0 },
  );
  let float = $state(!editing);
  let caption = $state("");
  let label = $state("");
  let preview = $state("");
  let gridEl = $state<HTMLElement | null>(null);
  let insertBtn = $state<HTMLButtonElement | null>(null);

  const rows = $derived(g.cells.length);
  const cols = $derived(g.cells[0]?.length ?? 1);
  const matrix = $derived(g.kind === "matrix");
  const code = $derived(gridToLatex(trimmed(g), "", request?.unit ?? "\t"));

  const DELIMITERS = [
    { env: "pmatrix", glyph: "( )" },
    { env: "bmatrix", glyph: "[ ]" },
    { env: "Bmatrix", glyph: "{ }" },
    { env: "vmatrix", glyph: "| |" },
    { env: "Vmatrix", glyph: "‖ ‖" },
    { env: "matrix", glyph: "" },
    { env: "smallmatrix", glyph: "" },
  ];
  const STYLES: { id: TableStyle; label: () => string }[] = [
    { id: "booktabs", label: () => t("grid.booktabs") },
    { id: "lines", label: () => t("grid.lines") },
    { id: "plain", label: () => t("grid.plain") },
  ];
  const ALIGN_ICON: Record<string, string> = { l: "align-left", c: "align-center", r: "align-right" };
  const NEXT_ALIGN: Record<string, string> = { l: "c", c: "r", r: "l" };
  const alignOf = (col: string | undefined) => (col === "r" ? "right" : col === "c" ? "center" : "left");

  onMount(() => {
    if (!request) ui.closeOverlay();
    else void focusCell(0, 0);
  });

  // What the PDF will show: the matrix as a formula, the table cell by cell
  // (formulas, bold, italics… and the macros of the document).
  let previewToken = 0;
  $effect(() => {
    const token = ++previewToken;
    const shown = trimmed($state.snapshot(g) as Grid);
    const source = code;
    const render = matrix ? displayHtml(source.replace(/\\begin\{(\w+)\*\}\[[^\]]*\]/, "\\begin{$1}").replace(/\\end\{(\w+)\*\}/, "\\end{$1}"), path) : tableHtml(shown);
    void render.then((html) => {
      if (token === previewToken) preview = html;
    });
  });

  async function tableHtml(grid: Grid): Promise<string> {
    const width = grid.cells[0]?.length ?? 1;
    const out: string[] = [];
    for (const row of grid.cells) {
      let cells = "";
      let span = 0;
      for (const cell of row) {
        if (span >= width) break;
        const m = /^\\multicolumn\s*\{\s*(\d+)\s*\}\s*\{([^}]*)\}\s*\{([\s\S]*)\}$/.exec(cell.trim());
        const n = m ? Math.max(1, Number(m[1])) : 1;
        const align = m ? alignOf(/r/.test(m[2]) ? "r" : /l/.test(m[2]) ? "l" : "c") : alignOf(grid.columns[span]);
        const html = await textHtml(cellLatex(m ? m[3] : cell), path);
        cells += `<td colspan="${n}" style="text-align:${align}">${html}</td>`;
        span += n;
      }
      out.push(`<tr>${cells}</tr>`);
    }
    return `<table>${out.join("")}</table>`;
  }

  function setSize(r: number, c: number) {
    g = resize(g, r, c);
  }

  function setEnv(env: string) {
    const star = g.env.endsWith("*") && env !== "matrix" ? "*" : "";
    g.env = env + star;
    if (!star) g.option = "";
  }

  function cycleAlign(i: number) {
    g.columns[i] = NEXT_ALIGN[g.columns[i]] ?? "l";
    g.rawSpec = null;
  }

  function setSpec(value: string) {
    g.rawSpec = value;
    g.rawCount = cols;
  }

  async function focusCell(r: number, c: number) {
    await tick();
    const dom = gridEl?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"] .cm-editor`);
    const view = dom ? EditorView.findFromDOM(dom) : null;
    if (!view) return;
    view.focus();
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  }

  /** The cell `delta` places away in reading order (row by row). */
  function step(r: number, c: number, delta: number): [number, number] | null {
    const i = r * cols + c + delta;
    if (i < 0 || i >= rows * cols) return null;
    return [Math.floor(i / cols), i % cols];
  }

  function move(r: number, c: number, to: CellMove): boolean {
    switch (to) {
      case "insert":
        void insert();
        return true;
      case "next":
      case "previous": {
        const target = step(r, c, to === "next" ? 1 : -1);
        if (target) void focusCell(...target);
        else if (to === "next") insertBtn?.focus();
        return !!target || to === "next";
      }
      case "up":
      case "down": {
        const target = to === "up" ? r - 1 : r + 1;
        if (target < 0 || target >= rows) return false;
        void focusCell(target, c);
        return true;
      }
      case "newRow": {
        if (r !== rows - 1 || c !== cols - 1) return false;
        const last = rows;
        setSize(last + 1, cols);
        void focusCell(last, 0);
        return true;
      }
    }
  }

  /** Cells from a spreadsheet or from LaTeX fill the grid from this cell on. */
  function paste(r: number, c: number, text: string): boolean {
    const cells = pastedCells(text);
    if (!cells) return false;
    const width = Math.max(...cells.map((row) => row.length));
    if (r + cells.length > rows || c + width > cols) setSize(Math.max(rows, r + cells.length), Math.max(cols, c + width));
    cells.forEach((row, i) => row.forEach((value, j) => (g.cells[r + i][c + j] = value)));
    return true;
  }

  const indented = (text: string) =>
    text
      .split("\n")
      .map((l) => `\t${l}`)
      .join("\n");

  /** A snippet field with its text (plain text when it has braces). */
  const field = (n: number, value: string) => (/[{}]/.test(value) ? escapeSnippet(value) : `\${${n}:${value}}`);

  async function insert() {
    if (!request) return;
    const out = trimmed($state.snapshot(g) as Grid);
    const view = editor.view;
    ui.closeOverlay();
    if (request.range) {
      const { path: file, from, to, indent } = request.range;
      editor.replaceRange(file, from, to, gridToLatex(out, indent, request.unit));
    } else {
      let body = escapeSnippet(gridToLatex(out, "", "\t"));
      if (out.kind === "matrix" && !request.inMath) body = `\\[\n${indented(body)}\n\\]`;
      if (out.kind === "table" && float) {
        body = [
          "\\begin{table}[htbp]",
          "\t\\centering",
          `\t\\caption{${field(1, caption.trim())}}`,
          `\t\\label{tab:${field(2, label.trim())}}`,
          indented(body),
          "\\end{table}",
        ].join("\n");
      }
      editor.insertSnippet(`${body}\${0}`, view ?? undefined, { block: out.kind === "table" || !request.inMath });
    }
    if (out.kind === "matrix") await editor.addPackage("amsmath", view, true);
    else if (out.style === "booktabs") await editor.addPackage("booktabs", view, true);
    editor.focus();
  }

  const title = $derived(
    matrix ? (editing ? t("grid.editMatrix") : t("grid.newMatrix")) : editing ? t("grid.editTable") : t("grid.newTable"),
  );
  const insertKey = prettyKey("Mod-Enter");
</script>

<Modal {title} icon={matrix ? "matrix" : "table"} width="min(1040px, 96vw)" height="min(760px, 94vh)">
  <div class="grid-editor" data-own-keys>
    <div class="options">
      <div class="size">
        <span class="faint">{t("grid.rows")}</span>
        <button class="icon-btn small" disabled={rows <= 1} onclick={() => setSize(rows - 1, cols)} title={t("grid.removeRow")} aria-label={t("grid.removeRow")}><Icon name="minus" size={13} /></button>
        <strong>{rows}</strong>
        <button class="icon-btn small" onclick={() => setSize(rows + 1, cols)} title={t("grid.addRow")} aria-label={t("grid.addRow")}><Icon name="plus" size={13} /></button>
        <span class="faint gap">{t("grid.cols")}</span>
        <button class="icon-btn small" disabled={cols <= 1} onclick={() => setSize(rows, cols - 1)} title={t("grid.removeCol")} aria-label={t("grid.removeCol")}><Icon name="minus" size={13} /></button>
        <strong>{cols}</strong>
        <button class="icon-btn small" onclick={() => setSize(rows, cols + 1)} title={t("grid.addCol")} aria-label={t("grid.addCol")}><Icon name="plus" size={13} /></button>
      </div>

      {#if matrix}
        <div class="segmented" role="radiogroup" aria-label={t("grid.delimiters")}>
          {#each DELIMITERS as d (d.env)}
            <button
              role="radio"
              aria-checked={g.env.replace("*", "") === d.env}
              class:on={g.env.replace("*", "") === d.env}
              onclick={() => setEnv(d.env)}
              title={`\\begin{${d.env}}`}
            >
              {d.glyph || (d.env === "matrix" ? t("grid.none") : t("grid.small"))}
            </button>
          {/each}
        </div>
      {:else}
        <div class="segmented" role="radiogroup" aria-label={t("grid.style")}>
          {#each STYLES as s (s.id)}
            <button role="radio" aria-checked={g.style === s.id} class:on={g.style === s.id} onclick={() => (g.style = s.id)}>{s.label()}</button>
          {/each}
        </div>
        <label class="check" class:disabled={g.style === "lines"}>
          <input type="checkbox" bind:checked={g.header} disabled={g.style === "lines"} />
          {t("grid.header")}
        </label>
        <label class="spec">
          <span class="faint">{t("grid.columns")}</span>
          <input class="input small mono" value={specOf(g)} oninput={(e) => setSpec(e.currentTarget.value)} spellcheck="false" />
        </label>
      {/if}
    </div>

    {#if !matrix && !editing}
      <div class="options float">
        <label class="check"><input type="checkbox" bind:checked={float} />{t("grid.float")}</label>
        {#if float}
          <input class="input small caption" placeholder={t("grid.caption")} bind:value={caption} />
          <input class="input small mono label" placeholder={t("grid.label")} bind:value={label} spellcheck="false" />
        {/if}
      </div>
    {/if}

    <div class="cells-wrap">
      <div class="cells" bind:this={gridEl} style:grid-template-columns="repeat({cols}, minmax(96px, 1fr))">
        {#if !matrix}
          {#each g.cells[0] as _, c (c)}
            {@const col = g.columns[c] ?? "c"}
            <button class="align" onclick={() => cycleAlign(c)} title={t("grid.alignHint", { spec: col })} disabled={g.rawSpec !== null && cols === g.rawCount}>
              {#if ALIGN_ICON[col]}<Icon name={ALIGN_ICON[col]} size={13} />{:else}<span class="mono">{col}</span>{/if}
            </button>
          {/each}
        {/if}
        {#each g.cells as row, r (r)}
          {#each row as _, c (c)}
            <GridCell
              value={g.cells[r][c]}
              {r}
              {c}
              math={matrix}
              {path}
              align={matrix ? "center" : alignOf(g.columns[c])}
              head={!matrix && g.header && r === 0 && g.style !== "lines"}
              label="{r + 1}, {c + 1}"
              onchange={(text) => (g.cells[r][c] = text)}
              onmove={(to) => move(r, c, to)}
              onpaste={(text) => paste(r, c, text)}
            />
          {/each}
        {/each}
      </div>
    </div>

    <div class="bottom">
      <div class="preview" class:table={!matrix} class:booktabs={!matrix && g.style === "booktabs"} class:lines={!matrix && g.style === "lines"} class:head={!matrix && g.header && g.style !== "lines"} aria-label={t("grid.preview")}>
        {@html preview}
      </div>
      <pre class="code selectable" aria-label={t("grid.code")}>{code}</pre>
    </div>

    <footer>
      <span class="hint faint">{t("grid.hint", { insert: insertKey, bold: prettyKey("Mod-b"), italic: prettyKey("Mod-i") })}</span>
      <button class="btn" onclick={() => ui.closeOverlay()}>{t("common.cancel")}</button>
      <button class="btn primary" bind:this={insertBtn} onclick={() => void insert()}>
        <Icon name="check" size={15} />{editing ? t("grid.update") : t("grid.insert")}
      </button>
    </footer>
  </div>
</Modal>

<style>
  .grid-editor {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 18px 16px;
  }
  .options {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 18px;
  }
  .options.float {
    gap: 10px;
  }
  .options .caption {
    flex: 1;
    max-width: 380px;
  }
  .options .label {
    width: 200px;
  }
  .size {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
  }
  .size strong {
    min-width: 18px;
    text-align: center;
  }
  .size .gap {
    margin-left: 10px;
  }
  .icon-btn.small {
    width: 24px;
    height: 24px;
  }
  .segmented {
    display: flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
  }
  .segmented button {
    min-width: 38px;
    height: 26px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
  }
  .segmented button:hover {
    color: var(--text);
  }
  .segmented button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    cursor: pointer;
  }
  .check.disabled {
    opacity: 0.5;
  }
  .spec {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    font-size: 12px;
  }
  .spec input {
    width: 150px;
  }
  .cells-wrap {
    flex: 1;
    min-height: 120px;
    overflow: auto;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .cells {
    display: grid;
    gap: 6px;
    width: max-content;
    min-width: 100%;
  }
  .align {
    display: grid;
    place-items: center;
    height: 22px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .align:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--accent);
  }
  .align:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .bottom {
    display: flex;
    gap: 12px;
    min-height: 90px;
    max-height: 36%;
  }
  .preview,
  .code {
    flex: 1;
    min-width: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .preview {
    display: grid;
    place-items: center;
    padding: 8px 12px;
    font-size: 15px;
  }
  .preview.table {
    font-size: 13px;
  }
  .preview :global(table) {
    border-collapse: collapse;
  }
  .preview :global(td) {
    padding: 3px 12px;
    white-space: nowrap;
  }
  .preview.booktabs :global(tr:first-child td) {
    border-top: 1.5px solid var(--text);
  }
  .preview.booktabs :global(tr:last-child td) {
    border-bottom: 1.5px solid var(--text);
  }
  .preview.head :global(tr:first-child td) {
    border-bottom: 1px solid var(--text-muted);
  }
  .preview.lines :global(td) {
    border: 1px solid var(--text-muted);
  }
  .code {
    margin: 0;
    padding: 8px 12px;
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-variant-ligatures: none;
    tab-size: 4;
    color: var(--text-muted);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hint {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
  }
</style>
