<script lang="ts">
  // The graph studio: functions of x written as on paper, their tangents,
  // points, lines and areas, on axes; the picture LaTeX draws next to them
  // (pgfplots). A picture written here is opened again from its chip.
  import { onMount } from "svelte";
  import {
    COLOURS,
    cssOf,
    emptyGraph,
    type Graph,
    graphCode,
    type LabelPlace,
    type Legend,
    type LineStyle,
    needs,
    newArea,
    newCurve,
    newLine,
    newPoint,
    newTangent,
    problems,
    steps,
    tangentLatex,
    type Width,
    writesFrench,
    yRange,
  } from "$lib/graph";
  import { plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { addLines, addPackages, addTikzLibraries, hasPackage, preambleEnd } from "$lib/preamble";
  import { editor } from "$lib/state/editor.svelte";
  import { type GraphEdit, media } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { PreviewOutcome } from "$lib/types";
  import { debounce } from "$lib/utils";
  import FoldSection from "../common/FoldSection.svelte";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const path = editor.active ?? project.info?.main ?? null;

  let graph = $state<Graph>(emptyGraph());
  /** A picture of the document being changed (its chip). */
  let edit = $state<GraphEdit | null>(null);
  /** The text of the root (its preamble: packages, language). */
  let source = $state("");
  /** The item whose details are open, and the one whose colours are shown. */
  let open = $state<string | null>(null);
  let palette = $state<string | null>(null);
  let advanced = $state(false);
  let inFigure = $state(false);
  let caption = $state("");
  let label = $state("fig:courbe");

  onMount(async () => {
    const request = media.graphRequest;
    media.graphRequest = null;
    // What is changed shows at once: nothing typed meanwhile is overwritten.
    if (request?.edit) {
      edit = request.edit;
      graph = request.edit.graph;
    } else {
      const first = newCurve(graph, "x^2 - 2x - 1");
      graph.curves.push(first);
      open = first.id;
    }
    const found = path ? await editor.rootSource(path) : null;
    source = found?.text ?? "";
  });

  const french = $derived(writesFrench(source));
  const issues = $derived(problems(graph));
  const code = $derived(graph.curves.length ? graphCode(graph, french) : "");
  const auto = $derived.by(() => {
    const [y0, y1] = yRange({ ...graph, axes: { ...graph.axes, ymin: "", ymax: "" } });
    const [sx, sy] = steps({ ...graph, axes: { ...graph.axes, xstep: "", ystep: "" } });
    return { y0, y1, sx, sy };
  });

  // ------------------------------------------------------------- the items

  function addCurve() {
    const c = newCurve(graph);
    graph.curves.push(c);
    open = c.id;
  }
  function addTangent() {
    if (!graph.curves.length) return;
    const tg = newTangent(graph, graph.curves[0].id);
    graph.tangents.push(tg);
    open = tg.id;
  }
  function addPoint() {
    const p = newPoint(graph, graph.curves[0]?.id ?? null);
    graph.points.push(p);
    open = p.id;
  }
  function addLine() {
    const l = newLine("x");
    graph.lines.push(l);
    open = l.id;
  }
  function addArea() {
    if (!graph.curves.length) return;
    const a = newArea(graph.curves[0].id);
    graph.areas.push(a);
    open = a.id;
  }
  function remove(id: string) {
    graph.curves = graph.curves.filter((c) => c.id !== id);
    graph.tangents = graph.tangents.filter((x) => x.id !== id && x.of !== id);
    graph.points = graph.points.filter((x) => x.id !== id).map((p) => (p.of === id ? { ...p, of: null, y: "0" } : p));
    graph.lines = graph.lines.filter((x) => x.id !== id);
    graph.areas = graph.areas.filter((x) => x.id !== id && x.of !== id).map((a) => (a.and === id ? { ...a, and: null } : a));
    if (open === id) open = null;
  }
  const toggle = (id: string) => (open = open === id ? null : id);

  const STYLES: LineStyle[] = ["solid", "dashed", "dotted"];
  const WIDTHS: Width[] = ["thin", "thick", "very thick"];
  const PLACES: LabelPlace[] = ["above right", "above left", "below right", "below left", "above", "below", "left", "right"];
  const LEGENDS: Legend[] = ["north west", "north east", "south west", "south east", "outer north east"];

  function problemText(id: string): string | null {
    const p = issues.get(id);
    return p ? t(`graph.problem.${p}` as "graph.problem.empty") : null;
  }

  // ----------------------------------------------------------- the preview

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
    if (!path || !body) {
      outcome = null;
      failure = null;
      return;
    }
    const my = ++running;
    compiling = true;
    try {
      const { libraries } = needs(graph);
      const result = await ipc.previewSnippet({
        path,
        job: "graph",
        classOptions: "tikz,border=6pt",
        projectPreamble: true,
        packages: ["tikz", "pgfplots"],
        extra: ["\\pgfplotsset{compat=1.18}", ...libraries.map((l) => `\\usepgfplotslibrary{${l}}`)].join("\n"),
        body,
      });
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

  // --------------------------------------------------------------- writing

  let busy = $state(false);
  const ready = $derived(!!code && !graph.curves.some((c) => issues.get(c.id) === "unreadable" || issues.get(c.id) === "empty"));

  async function write() {
    if (!ready || busy || !path) return;
    busy = true;
    try {
      const picture = code;
      const { libraries } = needs(graph);
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
              .join("\n")}\n\t\\caption{${caption.trim() || "…"}}\n\t\\label{${label.trim() || "fig:courbe"}}\n\\end{figure}`
          : picture;
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        const before = line.text.slice(0, head - line.from).trim() ? "\n" : "";
        const after = line.text.slice(head - line.from).trim() ? "\n" : "";
        editor.replaceRange(editor.active!, head, head, `${before}${body}\n${after}`);
      }
      await editor.transformRoot((text) => {
        let out = addPackages(text, [{ name: "pgfplots" }]);
        if (hasPackage(out, "babel")) out = addTikzLibraries(out, ["babel"]);
        return addLines(out, ["\\pgfplotsset{compat=1.18}", ...libraries.map((l) => `\\usepgfplotslibrary{${l}}`)], "pgfplots");
      }, path);
      ui.toast("success", t(edit ? "graph.updated" : "graph.inserted"));
      if (ui.overlay === "graph") ui.closeOverlay();
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
</script>

<svelte:window onkeydown={shortcut} />

{#snippet swatch(id: string, colour: string, set: (c: string) => void)}
  <span class="swatch-wrap">
    <button class="swatch" style:background={cssOf(colour)} title={t("graph.colour")} aria-label={t("graph.colour")} onclick={() => (palette = palette === id ? null : id)}></button>
    {#if palette === id}
      <span class="palette" role="radiogroup" aria-label={t("graph.colour")}>
        {#each COLOURS as c (c.tex)}
          <button class="swatch" class:active={c.tex === colour} style:background={c.css} role="radio" aria-checked={c.tex === colour} aria-label={c.tex} onclick={() => { set(c.tex); palette = null; }}></button>
        {/each}
      </span>
    {/if}
  </span>
{/snippet}

{#snippet styleChoice(value: LineStyle, set: (s: LineStyle) => void)}
  <div class="segmented" role="radiogroup" aria-label={t("graph.line")}>
    {#each STYLES as s (s)}
      <button class:active={value === s} role="radio" aria-checked={value === s} title={t(`graph.style.${s}`)} onclick={() => set(s)}><span class="dash {s}"></span></button>
    {/each}
  </div>
{/snippet}

{#snippet removeButton(id: string)}
  <button class="icon-btn small" title={t("graph.remove")} aria-label={t("graph.remove")} onclick={() => remove(id)}><Icon name="trash" size={14} /></button>
{/snippet}

{#snippet more(id: string)}
  <button class="icon-btn small" class:active={open === id} title={t("graph.more")} aria-label={t("graph.more")} aria-expanded={open === id} onclick={() => toggle(id)}><Icon name={open === id ? "chevron-up" : "chevron-down"} size={14} /></button>
{/snippet}

<Modal title={edit ? t("graph.editTitle") : t("graph.title")} icon="chart" width="min(1180px, 96vw)" height="min(780px, 92vh)">
  <div class="studio">
    {#if noPreamble}
      <div class="nothing"><Icon name="alert-triangle" size={22} /><span>{t("layout.noPreamble")}</span></div>
    {:else}
      <aside class="side">
        <section>
          <h4>{t("graph.functions")}</h4>
          {#each graph.curves as c (c.id)}
            <div class="item" class:open={open === c.id}>
              <div class="line">
                {@render swatch(c.id, c.colour, (v) => (c.colour = v))}
                <span class="mono name">{c.name}(x) =</span>
                <input class="input mono expr" class:bad={issues.has(c.id) && !!c.expr.trim()} bind:value={c.expr} placeholder="x^2 - 2x + 1" spellcheck="false" autocomplete="off" aria-label={t("graph.function", { name: c.name })} />
                {@render more(c.id)}
                {@render removeButton(c.id)}
              </div>
              {#if problemText(c.id) && c.expr.trim()}<p class="problem">{problemText(c.id)}</p>{/if}
              {#if open === c.id}
                <div class="details">
                  <div class="pair">
                    <span>{t("graph.drawn")}</span>
                    <input class="input small mono" bind:value={c.from} placeholder={graph.axes.xmin || "-5"} aria-label={t("graph.from")} />
                    <span>{t("graph.to")}</span>
                    <input class="input small mono" bind:value={c.to} placeholder={graph.axes.xmax || "5"} aria-label={t("graph.to")} />
                  </div>
                  <div class="pair">
                    {@render styleChoice(c.style, (s) => (c.style = s))}
                    <div class="segmented" role="radiogroup" aria-label={t("graph.width")}>
                      {#each WIDTHS as w (w)}
                        <button class:active={c.width === w} role="radio" aria-checked={c.width === w} onclick={() => (c.width = w)}>{t(`graph.width.${w.replace(" ", "")}` as "graph.width.thin")}</button>
                      {/each}
                    </div>
                  </div>
                  <div class="pair">
                    <span>{t("graph.name")}</span>
                    <div class="segmented" role="radiogroup" aria-label={t("graph.name")}>
                      {#each ["none", "curve", "legend"] as const as l (l)}
                        <button class:active={c.label === l} role="radio" aria-checked={c.label === l} onclick={() => { c.label = l; if (l === "legend" && c.text.startsWith("\\mathcal")) c.text = `${c.name}(x) = ${c.expr}`; if (l === "curve" && !c.text.trim()) c.text = `\\mathcal{C}_${c.name}`; }}>{t(`graph.label.${l}`)}</button>
                      {/each}
                    </div>
                  </div>
                  {#if c.label !== "none"}
                    <input class="input mono" bind:value={c.text} aria-label={t("graph.nameText")} placeholder={`\\mathcal{C}_${c.name}`} />
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
          <button class="btn small add" onclick={addCurve}><Icon name="plus" size={14} />{t("graph.addFunction")}</button>
          <p class="hint">{t("graph.syntax")}</p>
        </section>

        <section>
          <h4>{t("graph.onCurves")}</h4>
          {#each graph.tangents as tg (tg.id)}
            <div class="item" class:open={open === tg.id}>
              <div class="line">
                {@render swatch(tg.id, tg.colour, (v) => (tg.colour = v))}
                <span>{t("graph.tangentTo")}</span>
                <select class="select small" bind:value={tg.of} aria-label={t("graph.curve")}>
                  {#each graph.curves as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                </select>
                <span>{t("graph.atX")}</span>
                <input class="input small mono" class:bad={issues.has(tg.id)} bind:value={tg.at} aria-label={t("graph.atX")} />
                {@render more(tg.id)}
                {@render removeButton(tg.id)}
              </div>
              {#if issues.get(tg.id) === "undefined"}<p class="problem">{t("graph.problem.noTangent")}</p>{:else if tangentLatex(graph, tg, french)}<p class="equation mono">{tangentLatex(graph, tg, french)}</p>{/if}
              {#if open === tg.id}
                <div class="details">
                  <div class="pair">{@render styleChoice(tg.style, (s) => (tg.style = s))}</div>
                  <label class="check"><input type="checkbox" bind:checked={tg.point} />{t("graph.markPoint")}</label>
                  <div class="pair">
                    <span>{t("graph.length")}</span>
                    <input class="input small mono" bind:value={tg.span} placeholder={t("graph.auto")} aria-label={t("graph.length")} />
                    <span>{t("graph.name")}</span>
                    <input class="input small mono" bind:value={tg.text} placeholder="T" aria-label={t("graph.nameText")} />
                  </div>
                </div>
              {/if}
            </div>
          {/each}
          {#each graph.points as p (p.id)}
            <div class="item" class:open={open === p.id}>
              <div class="line">
                {@render swatch(p.id, p.colour, (v) => (p.colour = v))}
                <input class="input small mono point-name" bind:value={p.name} aria-label={t("graph.pointName")} />
                <span>x =</span>
                <input class="input small mono" class:bad={issues.has(p.id)} bind:value={p.x} aria-label="x" />
                <select class="select small" value={p.of ?? ""} onchange={(e) => (p.of = e.currentTarget.value || null)} aria-label={t("graph.pointOn")}>
                  {#each graph.curves as c (c.id)}<option value={c.id}>{t("graph.onCurve", { name: c.name })}</option>{/each}
                  <option value="">y =</option>
                </select>
                {#if !p.of}<input class="input small mono" bind:value={p.y} aria-label="y" />{/if}
                {@render more(p.id)}
                {@render removeButton(p.id)}
              </div>
              {#if open === p.id}
                <div class="details">
                  <label class="check"><input type="checkbox" bind:checked={p.projections} />{t("graph.projections")}</label>
                  <label class="pair">
                    <span>{t("graph.place")}</span>
                    <select class="select small" bind:value={p.place}>
                      {#each PLACES as place (place)}<option value={place}>{t(`graph.place.${place.replace(" ", "")}` as "graph.place.above")}</option>{/each}
                    </select>
                  </label>
                </div>
              {/if}
            </div>
          {/each}
          {#each graph.lines as l (l.id)}
            <div class="item" class:open={open === l.id}>
              <div class="line">
                {@render swatch(l.id, l.colour, (v) => (l.colour = v))}
                <select class="select small" bind:value={l.kind} aria-label={t("graph.lineKind")}>
                  <option value="x">x =</option>
                  <option value="y">y =</option>
                </select>
                <input class="input small mono" class:bad={issues.has(l.id)} bind:value={l.at} aria-label={t("graph.lineAt")} />
                <span class="faint small">{t(l.kind === "x" ? "graph.vertical" : "graph.horizontal")}</span>
                <span class="spacer"></span>
                {@render more(l.id)}
                {@render removeButton(l.id)}
              </div>
              {#if open === l.id}
                <div class="details">
                  <div class="pair">{@render styleChoice(l.style, (s) => (l.style = s))}</div>
                  <input class="input mono" bind:value={l.text} placeholder={t("graph.lineName")} aria-label={t("graph.nameText")} />
                </div>
              {/if}
            </div>
          {/each}
          {#each graph.areas as a (a.id)}
            <div class="item">
              <div class="line">
                {@render swatch(a.id, a.colour, (v) => (a.colour = v))}
                <span>{t("graph.areaUnder")}</span>
                <select class="select small" bind:value={a.of} aria-label={t("graph.curve")}>
                  {#each graph.curves as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                </select>
                <span>{t("graph.areaAnd")}</span>
                <select class="select small" value={a.and ?? ""} onchange={(e) => (a.and = e.currentTarget.value || null)} aria-label={t("graph.areaOther")}>
                  <option value="">{t("graph.areaAxis")}</option>
                  {#each graph.curves.filter((c) => c.id !== a.of) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                </select>
                <span class="spacer"></span>
                {@render removeButton(a.id)}
              </div>
              <div class="line indent">
                <span>{t("graph.from")}</span>
                <input class="input small mono" class:bad={issues.has(a.id)} bind:value={a.from} aria-label={t("graph.from")} />
                <span>{t("graph.to")}</span>
                <input class="input small mono" class:bad={issues.has(a.id)} bind:value={a.to} aria-label={t("graph.to")} />
              </div>
            </div>
          {/each}
          <div class="adds">
            <button class="btn small" disabled={!graph.curves.length} onclick={addTangent}><Icon name="plus" size={14} />{t("graph.tangent")}</button>
            <button class="btn small" onclick={addPoint}><Icon name="plus" size={14} />{t("graph.point")}</button>
            <button class="btn small" onclick={addLine}><Icon name="plus" size={14} />{t("graph.lineItem")}</button>
            <button class="btn small" disabled={!graph.curves.length} onclick={addArea}><Icon name="plus" size={14} />{t("graph.area")}</button>
          </div>
        </section>

        {#snippet axesMore()}
          <div class="pair">
            <span>{t("graph.axisNames")}</span>
            <input class="input small mono" bind:value={graph.axes.xlabel} placeholder="x" aria-label={t("graph.xName")} />
            <input class="input small mono" bind:value={graph.axes.ylabel} placeholder="y" aria-label={t("graph.yName")} />
          </div>
          <div class="pair">
            <span>{t("graph.ticks")}</span>
            <span>x</span>
            <input class="input small mono" bind:value={graph.axes.xstep} placeholder={String(auto.sx)} aria-label={t("graph.xTicks")} />
            <span>y</span>
            <input class="input small mono" bind:value={graph.axes.ystep} placeholder={String(auto.sy)} aria-label={t("graph.yTicks")} />
          </div>
          <div class="pair">
            <span>{t("graph.size")}</span>
            <input class="input small mono" type="number" min="3" max="30" step="0.5" bind:value={graph.axes.width} aria-label={t("graph.width")} />
            {#if !graph.axes.equal}
              <span>×</span>
              <input class="input small mono" type="number" min="3" max="30" step="0.5" bind:value={graph.axes.height} aria-label={t("graph.height")} />
            {/if}
            <span>cm</span>
          </div>
          {#if graph.curves.some((c) => c.label === "legend")}
            <label class="pair">
              <span>{t("graph.legend")}</span>
              <select class="select small" bind:value={graph.axes.legend}>
                {#each LEGENDS as l (l)}<option value={l}>{t(`graph.legend.${l.replace(/ /g, "")}` as "graph.legend.northwest")}</option>{/each}
              </select>
            </label>
          {/if}
          {#if graph.options.length || graph.extra.length}
            <p class="hint">{plural(graph.options.length + graph.extra.length, "graph.keptOne", "graph.keptMany")}</p>
          {/if}
        {/snippet}
        <FoldSection id="axes" title={t("graph.axes")} bind:open={advanced} advanced={axesMore}>
          <div class="pair">
            <span>x</span>
            <input class="input small mono" bind:value={graph.axes.xmin} placeholder="-5" aria-label={t("graph.xmin")} />
            <span>{t("graph.to")}</span>
            <input class="input small mono" bind:value={graph.axes.xmax} placeholder="5" aria-label={t("graph.xmax")} />
            <span>y</span>
            <input class="input small mono" bind:value={graph.axes.ymin} placeholder={String(auto.y0)} aria-label={t("graph.ymin")} />
            <span>{t("graph.to")}</span>
            <input class="input small mono" bind:value={graph.axes.ymax} placeholder={String(auto.y1)} aria-label={t("graph.ymax")} />
          </div>
          <div class="segmented" role="radiogroup" aria-label={t("graph.axes")}>
            {#each ["middle", "box", "left"] as const as l (l)}
              <button class:active={graph.axes.lines === l} role="radio" aria-checked={graph.axes.lines === l} onclick={() => (graph.axes.lines = l)}>{t(`graph.lines.${l}`)}</button>
            {/each}
          </div>
          <div class="pair">
            <span>{t("graph.grid")}</span>
            <div class="segmented" role="radiogroup" aria-label={t("graph.grid")}>
              {#each ["none", "major", "both"] as const as g (g)}
                <button class:active={graph.axes.grid === g} role="radio" aria-checked={graph.axes.grid === g} onclick={() => (graph.axes.grid = g)}>{t(`graph.grid.${g}`)}</button>
              {/each}
            </div>
          </div>
          <label class="check"><input type="checkbox" bind:checked={graph.axes.equal} />{t("graph.equal")}</label>
        </FoldSection>

        {#if !edit}
          <label class="check"><input type="checkbox" bind:checked={inFigure} />{t("tikz.wrapFigure")}</label>
          {#if inFigure}
            <input class="input" bind:value={caption} placeholder={t("image.caption")} aria-label={t("image.caption")} />
            <input class="input mono" bind:value={label} aria-label={t("image.label")} />
          {/if}
        {/if}
        <div class="spacer"></div>
        <button class="btn primary large" disabled={!ready || busy} onclick={write}>
          {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
          {edit ? t("image.update") : t("graph.insert")}
        </button>
      </aside>

      <section class="preview">
        <div class="preview-bar">
          <span class="section-title">{t("tikz.latexRendering")}</span>
          <div class="spacer"></div>
          {#if compiling}<span class="spinner"></span>{:else if error}<span class="status err" title={error.message}><Icon name="alert-circle" size={13} />{error.message.split("\n")[0].slice(0, 70)}</span>{/if}
        </div>
        {#if code && !failure}
          <PdfPreview pdf={outcome?.pdf ?? null} {revision} maxScale={3} whole />
        {:else}
          <p class="faint empty">{failure ?? t("graph.previewHint")}</p>
        {/if}
      </section>
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
  .side {
    width: 430px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 16px;
    border-right: 1px solid var(--border);
    overflow: auto;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
  }
  .item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elev);
  }
  .item.open {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .line.indent {
    padding-left: 24px;
  }
  .name {
    color: var(--text);
    white-space: nowrap;
  }
  .expr {
    flex: 1;
    min-width: 0;
  }
  .input.small {
    width: 64px;
    min-width: 0;
  }
  .point-name {
    width: 38px !important;
  }
  .select.small {
    width: auto;
    height: 28px;
    padding: 0 22px 0 7px;
    font-size: 12.5px;
  }
  .bad {
    border-color: var(--error) !important;
  }
  .problem {
    margin: 0;
    font-size: 11.5px;
    color: var(--error);
  }
  .equation {
    margin: 0 0 0 26px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding-top: 4px;
    border-top: 1px dashed var(--border);
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--text-muted);
  }
  .hint {
    margin: 0;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .add {
    align-self: flex-start;
    gap: 5px;
  }
  .adds {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .adds .btn {
    gap: 5px;
  }
  .icon-btn.small {
    width: 26px;
    height: 26px;
  }
  .swatch-wrap {
    position: relative;
    display: inline-flex;
  }
  .swatch {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--text) 25%, transparent);
    border-radius: 50%;
    cursor: pointer;
  }
  .swatch.active {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .palette {
    position: absolute;
    top: 24px;
    left: -4px;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(5, 18px);
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
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
  .segmented {
    display: flex;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .segmented button {
    flex: 1;
    height: 26px;
    padding: 0 9px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }
  .segmented button + button {
    border-left: 1px solid var(--border-strong);
  }
  .segmented button.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  /* The look of a line, in its button. */
  .dash {
    display: block;
    width: 22px;
    border-top: 2px solid currentColor;
  }
  .dash.dashed {
    border-top-style: dashed;
  }
  .dash.dotted {
    border-top-style: dotted;
  }
  .small {
    font-size: 11.5px;
  }
  .preview {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
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
</style>
