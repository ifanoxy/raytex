<script lang="ts">
  // Tables of variations and of signs (tkz-tab): a grid laid out as the
  // table will be, filled by hand or from a function (its derivative, its
  // zeros, its forbidden values and limits are worked out), with the table
  // LaTeX draws under it. A table written here is opened again from its chip.
  import { onMount } from "svelte";
  import { writesFrench } from "$lib/graph";
  import { plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { addPackages, addTikzLibraries, hasPackage, preambleEnd } from "$lib/preamble";
  import { editor } from "$lib/state/editor.svelte";
  import { media, type VariationEdit } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { PreviewOutcome } from "$lib/types";
  import { debounce } from "$lib/utils";
  import { addValue, arrow, emptyTable, type Mark, type Pos, removeValue, type Row, type Sign, signRow, study, type Table, tableCode, varRow } from "$lib/variations";
  import FoldSection from "../common/FoldSection.svelte";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const path = editor.active ?? project.info?.main ?? null;

  let table = $state<Table>(emptyTable());
  let edit = $state<VariationEdit | null>(null);
  let source = $state("");
  let advanced = $state(false);
  let inFigure = $state(false);
  let caption = $state("");
  let label = $state("fig:variations");
  /** The function the table is filled from. */
  let fn = $state("");
  let from = $state("-\\infty");
  let to = $state("+\\infty");
  let note = $state<{ kind: "ok" | "rounded" | "problem"; text: string } | null>(null);

  onMount(async () => {
    const request = media.variationRequest;
    media.variationRequest = null;
    // What is changed shows at once: nothing typed meanwhile is overwritten.
    if (request?.edit) {
      edit = request.edit;
      table = request.edit.table;
    }
    const found = path ? await editor.rootSource(path) : null;
    source = found?.text ?? "";
  });

  const french = $derived(writesFrench(source));
  const n = $derived(table.values.length);
  const code = $derived(tableCode(table));

  // ------------------------------------------------------------ the grid

  const MARKS: Mark[] = ["", "z", "d", "t"];
  const SIGNS: Sign[] = ["+", "-", "", "h"];
  const POSITIONS: Pos[] = ["+", "-", "R"];
  const next = <T,>(list: T[], v: T) => list[(list.indexOf(v) + 1) % list.length];
  const markText: Record<Mark, string> = { "": "·", z: "0", d: "‖", t: "⋮" };
  const signText: Record<Sign, string> = { "+": "+", "-": "−", "": "·", h: "///" };

  function insertValue(index: number) {
    table = addValue(table, index);
  }
  function dropValue(index: number) {
    table = removeValue(table, index);
  }
  function addRow(kind: "sign" | "var") {
    const name = /^([a-zA-Z])/.exec(table.rows.find((r) => r.kind === "var")?.label ?? "f")?.[1] ?? "f";
    table.rows.push(kind === "sign" ? signRow(n, `${name}'(x)`) : varRow(n, `${name}(x)`));
  }
  function dropRow(id: string) {
    table.rows = table.rows.filter((r) => r.id !== id);
  }
  /** Columns: the names, then a value and an interval in turn. */
  const columns = $derived(`150px repeat(${n - 1}, minmax(84px, auto) minmax(46px, 1fr)) minmax(84px, auto)`);

  // ------------------------------------------- filling from a function

  function fill(kind: "variations" | "signs") {
    if (!fn.trim()) return;
    const found = study(fn, from, to, kind, french);
    if (typeof found === "string") {
      note = { kind: "problem", text: t(`tab.problem.${found}`) };
      return;
    }
    table = { ...found.table, lgt: table.lgt, espcl: table.espcl };
    note = found.rounded ? { kind: "rounded", text: t("tab.rounded") } : { kind: "ok", text: t("tab.filled") };
  }

  // ------------------------------------------------------------ preview

  let outcome = $state<PreviewOutcome | null>(null);
  let compiling = $state(false);
  let revision = $state(0);
  let failure = $state<string | null>(null);
  let running = 0;
  const schedule = debounce(() => void compile(), 500);
  $effect(() => {
    void code;
    schedule();
  });

  async function compile() {
    const body = code;
    if (!path) return;
    const my = ++running;
    compiling = true;
    try {
      const result = await ipc.previewSnippet({ path, job: "variations", classOptions: "tikz,border=6pt", projectPreamble: true, packages: ["tikz", "tkz-tab"], body });
      if (my !== running) return;
      outcome = result;
      failure = null;
      revision++;
    } catch (e) {
      if (my !== running) return;
      outcome = null;
      failure = String(e);
    } finally {
      if (my === running) compiling = false;
    }
  }
  const error = $derived(outcome?.diagnostics.find((d) => d.severity === "error") ?? null);

  // ------------------------------------------------------------ writing

  let busy = $state(false);
  async function write() {
    if (busy || !path || !table.rows.length) return;
    busy = true;
    try {
      const picture = code;
      if (edit) {
        await editor.open(edit.path);
        editor.replaceRange(edit.path, edit.from, edit.to, picture);
      } else {
        const view = editor.view;
        if (!view || editor.activeTab?.kind !== "tex" || view.state.readOnly) {
          ui.toast("warning", t("image.noDocument"));
          return;
        }
        const body = inFigure
          ? `\\begin{figure}[htbp]\n\t\\centering\n${picture
              .split("\n")
              .map((l) => `\t${l}`)
              .join("\n")}\n\t\\caption{${caption.trim() || "…"}}\n\t\\label{${label.trim() || "fig:variations"}}\n\\end{figure}`
          : picture;
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        const before = line.text.slice(0, head - line.from).trim() ? "\n" : "";
        const after = line.text.slice(head - line.from).trim() ? "\n" : "";
        editor.replaceRange(editor.active!, head, head, `${before}${body}\n${after}`);
      }
      await editor.transformRoot((text) => {
        const out = addPackages(text, [{ name: "tkz-tab" }]);
        return hasPackage(out, "babel") && hasPackage(out, "tikz") ? addTikzLibraries(out, ["babel"]) : out;
      }, path);
      ui.toast("success", t(edit ? "tab.updated" : "tab.inserted"));
      if (ui.overlay === "variations") ui.closeOverlay();
      editor.focus();
    } finally {
      busy = false;
    }
  }

  function shortcut(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void write();
    }
  }

  const noPreamble = $derived(!!source && preambleEnd(source) >= source.length);
  const isVar = (r: Row): r is Extract<Row, { kind: "var" }> => r.kind === "var";
</script>

<svelte:window onkeydown={shortcut} />

<Modal title={edit ? t("tab.editTitle") : t("tab.title")} icon="variations" width="min(1180px, 96vw)" height="min(800px, 94vh)">
  <div class="studio">
    {#if noPreamble}
      <div class="nothing"><Icon name="alert-triangle" size={22} /><span>{t("layout.noPreamble")}</span></div>
    {:else}
      <section class="main">
        <div class="grid-box">
          <div class="grid" style:grid-template-columns={columns} role="table" aria-label={t("tab.title")}>
            <!-- The values of x. -->
            <div class="name head" role="cell"><input class="input mono" bind:value={table.variable} aria-label={t("tab.variable")} /></div>
            {#each table.values as _, i (i)}
              <div class="value head" role="cell">
                <input class="input mono" bind:value={table.values[i]} aria-label={t("tab.value", { n: i + 1 })} placeholder="?" />
                {#if n > 2}<button class="drop" title={t("tab.dropValue")} aria-label={t("tab.dropValue")} onclick={() => dropValue(i)}><Icon name="x" size={11} /></button>{/if}
              </div>
              {#if i < n - 1}
                <div class="between head" role="cell"><button class="add-value" title={t("tab.addValue")} aria-label={t("tab.addValue")} onclick={() => insertValue(i)}><Icon name="plus" size={12} /></button></div>
              {/if}
            {/each}

            {#each table.rows as row (row.id)}
              <div class="name" class:tall={isVar(row)} role="cell">
                <input class="input mono" bind:value={row.label} aria-label={t("tab.rowName")} />
                <button class="icon-btn small" title={t("tab.dropRow")} aria-label={t("tab.dropRow")} onclick={() => dropRow(row.id)}><Icon name="trash" size={13} /></button>
              </div>
              {#if row.kind === "sign"}
                {#each row.marks as m, i (i)}
                  <div class="value" role="cell">
                    <button class="toggle mark" data-mark={m || "none"} title={t(`tab.mark.${m || "none"}`)} onclick={() => (row.marks[i] = next(MARKS, m))}>{markText[m]}</button>
                  </div>
                  {#if i < n - 1}
                    <div class="between" role="cell">
                      <button class="toggle sign" data-sign={row.signs[i] || "none"} title={t(`tab.sign.${row.signs[i] || "none"}`)} onclick={() => (row.signs[i] = next(SIGNS, row.signs[i]))}>{signText[row.signs[i]]}</button>
                    </div>
                  {/if}
                {/each}
              {:else}
                {#each row.cells as c, i (i)}
                  <div class="value tall" class:forbidden={c.forbidden} role="cell">
                    {#if c.forbidden}
                      <div class="sides">
                        {#if i > 0}
                          <div class="part" class:low={c.pos === "-"}>
                            <button class="pos" title={t("tab.position")} onclick={() => (c.pos = c.pos === "+" ? "-" : "+")}>{c.pos === "-" ? "↓" : "↑"}</button>
                            <input class="input mono" bind:value={c.value} aria-label={t("tab.leftLimit")} />
                          </div>
                        {/if}
                        <span class="bars" aria-hidden="true"></span>
                        {#if i < n - 1}
                          <div class="part" class:low={c.right === "-"}>
                            <button class="pos" title={t("tab.position")} onclick={() => (c.right = c.right === "+" ? "-" : "+")}>{c.right === "-" ? "↓" : "↑"}</button>
                            <input class="input mono" bind:value={c.rightValue} aria-label={t("tab.rightLimit")} />
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <div class="one" class:low={c.pos === "-"} class:none={c.pos === "R"}>
                        <button class="pos" title={t("tab.position")} onclick={() => (c.pos = next(POSITIONS, c.pos))}>{c.pos === "-" ? "↓" : c.pos === "+" ? "↑" : "→"}</button>
                        {#if c.pos !== "R"}<input class="input mono" bind:value={c.value} aria-label={t("tab.cellValue")} />{/if}
                      </div>
                    {/if}
                    <button class="forbid" class:on={c.forbidden} title={t("tab.forbidden")} aria-pressed={c.forbidden} onclick={() => (c.forbidden = !c.forbidden)}>‖</button>
                  </div>
                  {#if i < n - 1}
                    <div class="between tall" role="cell">
                      {#if arrow(row, i) === "up"}<svg viewBox="0 0 40 40" class="arrow" aria-hidden="true"><path d="M6 34 34 6M34 6h-9M34 6v9" /></svg>{/if}
                      {#if arrow(row, i) === "down"}<svg viewBox="0 0 40 40" class="arrow" aria-hidden="true"><path d="M6 6l28 28M34 34h-9M34 34v-9" /></svg>{/if}
                    </div>
                  {/if}
                {/each}
              {/if}
            {/each}
          </div>
        </div>
        <div class="adds">
          <button class="btn small" onclick={() => addRow("sign")}><Icon name="plus" size={14} />{t("tab.addSigns")}</button>
          <button class="btn small" onclick={() => addRow("var")}><Icon name="plus" size={14} />{t("tab.addVariations")}</button>
          <span class="spacer"></span>
          <span class="faint small">{t("tab.howTo")}</span>
        </div>
        <div class="preview">
          <div class="preview-bar">
            <span class="section-title">{t("tikz.latexRendering")}</span>
            <div class="spacer"></div>
            {#if compiling}<span class="spinner"></span>{:else if error}<span class="status err" title={error.message}><Icon name="alert-circle" size={13} />{error.message.split("\n")[0].slice(0, 70)}</span>{/if}
          </div>
          {#if !failure}
            <PdfPreview pdf={outcome?.pdf ?? null} {revision} maxScale={2.5} whole />
          {:else}
            <p class="faint empty">{failure}</p>
          {/if}
        </div>
      </section>

      <aside class="side">
        <section class="from">
          <h4>{t("tab.fromFunction")}</h4>
          <div class="line">
            <span class="mono">f(x) =</span>
            <input class="input mono grow" bind:value={fn} placeholder="x^2 - 2x - 1" spellcheck="false" autocomplete="off" aria-label={t("tab.function")} onkeydown={(e) => e.key === "Enter" && fill("variations")} />
          </div>
          <div class="line">
            <span>{t("tab.over")}</span>
            <input class="input small mono" bind:value={from} aria-label={t("tab.from")} />
            <span>;</span>
            <input class="input small mono" bind:value={to} aria-label={t("tab.to")} />
          </div>
          <div class="line">
            <button class="btn small" disabled={!fn.trim()} onclick={() => fill("variations")}><Icon name="variations" size={14} />{t("tab.variations")}</button>
            <button class="btn small" disabled={!fn.trim()} onclick={() => fill("signs")}>{t("tab.signs")}</button>
          </div>
          {#if note}<p class="note" class:warn={note.kind !== "ok"}>{note.text}</p>{/if}
        </section>

        {#snippet more()}
          <label class="pair">
            <span>{t("tab.nameWidth")}</span>
            <input class="input small mono" type="number" min="1" max="8" step="0.5" bind:value={table.lgt} />
            <span>cm</span>
          </label>
          <label class="pair">
            <span>{t("tab.spacing")}</span>
            <input class="input small mono" type="number" min="1" max="8" step="0.5" bind:value={table.espcl} />
            <span>cm</span>
          </label>
          {#each table.rows as row (row.id)}
            <label class="pair">
              <span class="mono">{row.label}</span>
              <input class="input small mono" type="number" min="0.5" max="6" step="0.5" bind:value={row.height} aria-label={t("tab.rowHeight")} />
            </label>
          {/each}
          {#if table.options.length || table.extra.length}
            <p class="hint">{plural(table.options.length + table.extra.length, "graph.keptOne", "graph.keptMany")}</p>
          {/if}
        {/snippet}
        <FoldSection id="table" title={t("tab.look")} bind:open={advanced} advanced={more}>
          <p class="hint">{t("tab.lookHint")}</p>
        </FoldSection>

        {#if !edit}
          <label class="check"><input type="checkbox" bind:checked={inFigure} />{t("tikz.wrapFigure")}</label>
          {#if inFigure}
            <input class="input" bind:value={caption} placeholder={t("image.caption")} aria-label={t("image.caption")} />
            <input class="input mono" bind:value={label} aria-label={t("image.label")} />
          {/if}
        {/if}
        <div class="spacer"></div>
        <button class="btn primary large" disabled={busy || !table.rows.length} onclick={write}>
          {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
          {edit ? t("image.update") : t("tab.insert")}
        </button>
      </aside>
    {/if}
  </div>
</Modal>

<style>
  .studio {
    flex: 1;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  .nothing {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-muted);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
  }
  .grid-box {
    flex-shrink: 0;
    max-height: 48%;
    overflow: auto;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elev);
  }
  .grid {
    display: grid;
    min-width: max-content;
  }
  .grid > div {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 4px 5px;
    border-bottom: 1px solid var(--border);
  }
  .grid > .tall {
    min-height: 86px;
  }
  .name {
    gap: 4px;
    border-right: 1px solid var(--border-strong);
  }
  .name .input {
    flex: 1;
    min-width: 0;
    text-align: center;
  }
  .head {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }
  .value {
    position: relative;
  }
  .value .input {
    width: 76px;
    text-align: center;
  }
  .drop {
    position: absolute;
    top: 1px;
    right: 1px;
    display: none;
    place-items: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--bg-hover);
    color: var(--text-muted);
    cursor: pointer;
  }
  .value.head:hover .drop,
  .value.head:focus-within .drop {
    display: grid;
  }
  .add-value {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px dashed var(--border-strong);
    border-radius: 50%;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
  }
  .add-value:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .toggle {
    min-width: 34px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 15px;
    cursor: pointer;
  }
  .toggle:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }
  .toggle[data-mark="none"],
  .toggle[data-sign="none"] {
    color: var(--text-faint);
  }
  .toggle[data-sign="h"] {
    font-size: 11px;
    letter-spacing: -1px;
    color: var(--text-muted);
  }
  .one,
  .part {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 3px;
    height: 100%;
  }
  .one.low,
  .part.low {
    flex-direction: column-reverse;
  }
  .one.none {
    justify-content: center;
  }
  .sides {
    display: flex;
    align-items: stretch;
    gap: 4px;
    height: 100%;
  }
  .sides .input {
    width: 62px;
  }
  .bars {
    width: 5px;
    border-left: 1.5px solid var(--text);
    border-right: 1.5px solid var(--text);
  }
  .pos {
    width: 22px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-input);
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .forbid {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    color: var(--text-faint);
    font-size: 12px;
    cursor: pointer;
    opacity: 0;
  }
  .value:hover .forbid,
  .forbid.on {
    opacity: 1;
  }
  .forbid.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .arrow {
    width: 38px;
    height: 38px;
    fill: none;
    stroke: var(--text);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .adds {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .adds .btn {
    gap: 5px;
  }
  .preview {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 22px;
  }
  .status.err {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--error);
  }
  .empty {
    margin: auto;
  }
  .side {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 16px;
    border-left: 1px solid var(--border);
    overflow: auto;
  }
  .from {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
  }
  .line,
  .pair {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .input.small {
    width: 72px;
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--success);
  }
  .note.warn {
    color: var(--warning);
  }
  .hint {
    margin: 0;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .small {
    font-size: 11.5px;
  }
  .icon-btn.small {
    width: 24px;
    height: 24px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .check input {
    accent-color: var(--accent);
  }
</style>
