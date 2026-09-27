<script lang="ts">
  // Side panel of the whiteboard: the grid, the style of the selection (or
  // of the next shapes), the text of a node, exact coordinates, and the
  // statements kept as code.
  import { expressionCss, BASE_COLORS, DVIPS_COLORS } from "$lib/colors";
  import { t, type MessageKey } from "$lib/i18n.svelte";
  import { type Arrow, type Dash, type Drawing, type LineWidth, newId, type NodePosition, type NodeShape, num, type Shape, type Style } from "$lib/tikz/model";
  import Icon from "../../common/Icon.svelte";

  let {
    drawing = $bindable(),
    selected = $bindable(),
    style = $bindable(),
    step = $bindable(),
    showGrid = $bindable(),
    showAxes = $bindable(),
    snapOn = $bindable(),
    oncommit,
    oncode,
  }: {
    drawing: Drawing;
    selected: string[];
    style: Style;
    step: number;
    showGrid: boolean;
    showAxes: boolean;
    snapOn: boolean;
    oncommit: () => void;
    /** Shows the code tab (to edit statements kept as code). */
    oncode: () => void;
  } = $props();

  const STEPS = [0.1, 0.25, 0.5, 1];
  const STROKES = ["black", "gray", "red", "orange", "green!60!black", "teal", "blue", "violet", "magenta", "brown"];
  const FILLS = ["red!20", "orange!25", "yellow!40", "green!20", "teal!20", "blue!20", "violet!20", "gray!20", "black", "blue"];
  const WIDTHS: { value: LineWidth; label: MessageKey }[] = [
    { value: "thin", label: "tikz.width.thin" },
    { value: "semithick", label: "tikz.width.medium" },
    { value: "thick", label: "tikz.width.thick" },
    { value: "very thick", label: "tikz.width.veryThick" },
  ];
  const DASHES: { value: Dash | null; label: MessageKey }[] = [
    { value: null, label: "tikz.dash.solid" },
    { value: "dashed", label: "tikz.dash.dashed" },
    { value: "dotted", label: "tikz.dash.dotted" },
  ];
  const ARROWS: { value: Arrow | null; label: string }[] = [
    { value: null, label: "—" },
    { value: "->", label: "→" },
    { value: "<-", label: "←" },
    { value: "<->", label: "↔" },
    { value: "-Stealth", label: "➝" },
  ];
  const POSITIONS: { value: NodePosition; label: MessageKey }[] = [
    { value: "", label: "tikz.pos.center" },
    { value: "above", label: "tikz.pos.above" },
    { value: "below", label: "tikz.pos.below" },
    { value: "left", label: "tikz.pos.left" },
    { value: "right", label: "tikz.pos.right" },
  ];
  const SIZES = ["\\tiny", "\\footnotesize", "\\small", "", "\\large", "\\Large", "\\huge"];

  const KNOWN = [...BASE_COLORS, ...DVIPS_COLORS];
  const css = (c: string) => expressionCss(c, KNOWN) ?? c;

  const shapes = $derived(drawing.shapes.filter((s) => selected.includes(s.id)));
  const first = $derived(shapes[0]);
  /** Style shown: the selection's, or the one of the next shapes. */
  const current = $derived(first && first.kind !== "code" ? first.style : style);
  const hasPath = $derived(shapes.length ? shapes.some((s) => s.kind === "path" && !s.closed) : true);
  const node = $derived(shapes.length === 1 && first?.kind === "node" ? first : null);
  const codeItems = $derived(drawing.shapes.filter((s) => s.kind === "code"));

  function setShapes(next: Shape[]) {
    drawing = { ...drawing, shapes: next };
  }

  /** Changes the style of the selection and of the next shapes. */
  function setStyle(patch: Partial<Style>) {
    style = { ...style, ...patch };
    if (!shapes.length) return;
    setShapes(drawing.shapes.map((s) => (selected.includes(s.id) && s.kind !== "code" ? ({ ...s, style: { ...s.style, ...patch } } as Shape) : s)));
    oncommit();
  }

  function updateNode(patch: Partial<Extract<Shape, { kind: "node" }>>) {
    if (!node) return;
    setShapes(drawing.shapes.map((s) => (s.id === node.id ? ({ ...s, ...patch } as Shape) : s)));
    oncommit();
  }

  function setCoord(update: (s: Shape) => Shape) {
    if (!first) return;
    setShapes(drawing.shapes.map((s) => (s.id === first.id ? update(s) : s)));
    oncommit();
  }

  function numberOf(e: Event): number | null {
    const v = Number((e.currentTarget as HTMLInputElement).value.replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }

  function reorder(front: boolean) {
    const moving = drawing.shapes.filter((s) => selected.includes(s.id));
    const rest = drawing.shapes.filter((s) => !selected.includes(s.id));
    setShapes(front ? [...rest, ...moving] : [...moving, ...rest]);
    oncommit();
  }

  function duplicate() {
    const copies = shapes.map((s) => ({ ...(JSON.parse(JSON.stringify(s)) as Shape), id: newId() }));
    setShapes([...drawing.shapes, ...copies]);
    selected = copies.map((c) => c.id);
    oncommit();
  }

  function remove() {
    setShapes(drawing.shapes.filter((s) => !selected.includes(s.id)));
    selected = [];
    oncommit();
  }

  let customStroke = $state("");
  let customFill = $state("");
</script>

<div class="props">
  <section>
    <h4 class="section-title">{t("tikz.gridTitle")}</h4>
    <div class="row">
      <label class="check"><input type="checkbox" bind:checked={showGrid} />{t("tikz.showGrid")}</label>
      <label class="check"><input type="checkbox" bind:checked={snapOn} />{t("tikz.snap")}</label>
      <label class="check"><input type="checkbox" bind:checked={showAxes} />{t("tikz.axes")}</label>
    </div>
    <div class="seg" role="radiogroup" aria-label={t("tikz.step")}>
      <span class="faint small">{t("tikz.step")}</span>
      {#each STEPS as s (s)}
        <button class:active={step === s} role="radio" aria-checked={step === s} onclick={() => (step = s)}>{String(s).replace(".", ",")} cm</button>
      {/each}
    </div>
  </section>

  <section>
    <h4 class="section-title">{shapes.length ? t("tikz.selection", { n: shapes.length }) : t("tikz.nextShapes")}</h4>

    <div class="label faint">{t("tikz.stroke")}</div>
    <div class="swatches">
      <button class="swatch none" class:active={current.noStroke} title={t("tikz.noStroke")} aria-label={t("tikz.noStroke")} onclick={() => setStyle({ noStroke: true, fill: current.fill ?? "blue!20" })}><Icon name="x" size={12} /></button>
      {#each STROKES as c (c)}
        <button class="swatch" class:active={!current.noStroke && (current.stroke ?? "black") === c} style:background={css(c)} title={c} aria-label={c} onclick={() => setStyle({ stroke: c === "black" ? null : c, noStroke: false })}></button>
      {/each}
      <input class="input small mono custom" placeholder="red!50!black" bind:value={customStroke} onkeydown={(e) => e.key === "Enter" && customStroke.trim() && setStyle({ stroke: customStroke.trim(), noStroke: false })} />
    </div>

    <div class="label faint">{t("tikz.fill")}</div>
    <div class="swatches">
      <button class="swatch none" class:active={!current.fill} title={t("tikz.noFill")} aria-label={t("tikz.noFill")} onclick={() => setStyle({ fill: null, noStroke: false })}><Icon name="x" size={12} /></button>
      {#each FILLS as c (c)}
        <button class="swatch" class:active={current.fill === c} style:background={css(c)} title={c} aria-label={c} onclick={() => setStyle({ fill: c })}></button>
      {/each}
      <input class="input small mono custom" placeholder="yellow!30" bind:value={customFill} onkeydown={(e) => e.key === "Enter" && customFill.trim() && setStyle({ fill: customFill.trim() })} />
    </div>

    <div class="label faint">{t("tikz.width")}</div>
    <div class="seg">
      {#each WIDTHS as w (w.value)}
        <button class:active={(current.width ?? "thin") === w.value} onclick={() => setStyle({ width: w.value === "thin" ? null : w.value })}>{t(w.label)}</button>
      {/each}
    </div>

    <div class="label faint">{t("tikz.lineStyle")}</div>
    <div class="seg">
      {#each DASHES as d (d.label)}
        <button class:active={current.dash === d.value} onclick={() => setStyle({ dash: d.value })}>{t(d.label)}</button>
      {/each}
    </div>

    {#if hasPath}
      <div class="label faint">{t("tikz.arrows")}</div>
      <div class="seg arrows">
        {#each ARROWS as a (a.label)}
          <button class:active={current.arrow === a.value} onclick={() => setStyle({ arrow: a.value })}>{a.label}</button>
        {/each}
      </div>
    {/if}

    <div class="row">
      <label class="check"><input type="checkbox" checked={current.rounded} onchange={(e) => setStyle({ rounded: (e.currentTarget as HTMLInputElement).checked })} />{t("tikz.rounded")}</label>
      <label class="check opacity">
        {t("tikz.opacity")}
        <input type="range" min="0.1" max="1" step="0.05" value={current.opacity ?? 1} onchange={(e) => setStyle({ opacity: Number((e.currentTarget as HTMLInputElement).value) >= 1 ? null : Number((e.currentTarget as HTMLInputElement).value) })} />
      </label>
    </div>
  </section>

  {#if node}
    <section>
      <h4 class="section-title">{t("tikz.textTitle")}</h4>
      <input class="input" value={node.text} onchange={(e) => updateNode({ text: (e.currentTarget as HTMLInputElement).value })} placeholder={t("tikz.nodeText")} />
      <p class="faint small">{t("tikz.textHint")}</p>
      <div class="label faint">{t("tikz.position")}</div>
      <div class="seg">
        {#each POSITIONS as p (p.value)}
          <button class:active={node.position === p.value} onclick={() => updateNode({ position: p.value })}>{t(p.label)}</button>
        {/each}
      </div>
      <div class="label faint">{t("tikz.frame")}</div>
      <div class="seg">
        {#each [["", "tikz.frame.none"], ["rectangle", "tikz.frame.box"], ["circle", "tikz.frame.circle"]] as const as [shape, label] (shape)}
          <button class:active={(node.boxed ? node.shape || "rectangle" : "") === shape} onclick={() => updateNode({ boxed: !!shape, shape: shape === "circle" ? "circle" : ("" as NodeShape) })}>{t(label)}</button>
        {/each}
      </div>
      <div class="label faint">{t("tikz.textSize")}</div>
      <select class="select input small" value={node.font ?? ""} onchange={(e) => updateNode({ font: (e.currentTarget as HTMLSelectElement).value || null })}>
        {#each SIZES as s (s)}<option value={s}>{s || t("format.size.normalsize")}</option>{/each}
      </select>
    </section>
  {/if}

  {#if shapes.length === 1 && first && first.kind !== "code"}
    <section>
      <h4 class="section-title">{t("tikz.coordinates")}</h4>
      <div class="coords">
        {#if first.kind === "path"}
          {#each first.points as p, i (i)}
            <span class="faint">P{i + 1}</span>
            <input class="input small mono" value={num(p.x)} onchange={(e) => { const v = numberOf(e); if (v !== null) setCoord((s) => (s.kind === "path" ? { ...s, points: s.points.map((q, j) => (j === i ? { ...q, x: v } : q)) } : s)); }} />
            <input class="input small mono" value={num(p.y)} onchange={(e) => { const v = numberOf(e); if (v !== null) setCoord((s) => (s.kind === "path" ? { ...s, points: s.points.map((q, j) => (j === i ? { ...q, y: v } : q)) } : s)); }} />
          {/each}
        {:else if first.kind === "rect"}
          {#each [["from", t("tikz.corner1")], ["to", t("tikz.corner2")]] as const as [key, label] (key)}
            <span class="faint">{label}</span>
            <input class="input small mono" value={num(first[key].x)} onchange={(e) => { const v = numberOf(e); if (v !== null) setCoord((s) => (s.kind === "rect" ? { ...s, [key]: { ...s[key], x: v } } : s)); }} />
            <input class="input small mono" value={num(first[key].y)} onchange={(e) => { const v = numberOf(e); if (v !== null) setCoord((s) => (s.kind === "rect" ? { ...s, [key]: { ...s[key], y: v } } : s)); }} />
          {/each}
        {:else if first.kind === "circle" || first.kind === "ellipse" || first.kind === "node"}
          {@const at = first.kind === "node" ? first.at : first.center}
          <span class="faint">{first.kind === "node" ? t("tikz.point") : t("tikz.center")}</span>
          <input class="input small mono" value={num(at.x)} onchange={(e) => { const v = numberOf(e); if (v !== null) setCoord((s) => (s.kind === "node" ? { ...s, at: { ...s.at, x: v } } : s.kind === "circle" || s.kind === "ellipse" ? { ...s, center: { ...s.center, x: v } } : s)); }} />
          <input class="input small mono" value={num(at.y)} onchange={(e) => { const v = numberOf(e); if (v !== null) setCoord((s) => (s.kind === "node" ? { ...s, at: { ...s.at, y: v } } : s.kind === "circle" || s.kind === "ellipse" ? { ...s, center: { ...s.center, y: v } } : s)); }} />
          {#if first.kind === "circle"}
            <span class="faint">{t("tikz.radius")}</span>
            <input class="input small mono wide" value={num(first.r)} onchange={(e) => { const v = numberOf(e); if (v !== null && v > 0) setCoord((s) => (s.kind === "circle" ? { ...s, r: v } : s)); }} />
          {:else if first.kind === "ellipse"}
            <span class="faint">{t("tikz.radii")}</span>
            <input class="input small mono" value={num(first.rx)} onchange={(e) => { const v = numberOf(e); if (v !== null && v > 0) setCoord((s) => (s.kind === "ellipse" ? { ...s, rx: v } : s)); }} />
            <input class="input small mono" value={num(first.ry)} onchange={(e) => { const v = numberOf(e); if (v !== null && v > 0) setCoord((s) => (s.kind === "ellipse" ? { ...s, ry: v } : s)); }} />
          {/if}
        {/if}
      </div>
    </section>
  {/if}

  {#if shapes.length}
    <section class="actions">
      <button class="btn small" onclick={duplicate}><Icon name="copy" size={13} />{t("tikz.duplicate")}</button>
      <button class="btn small" onclick={() => reorder(true)} title={t("tikz.toFront")}><Icon name="chevron-up" size={13} /></button>
      <button class="btn small" onclick={() => reorder(false)} title={t("tikz.toBack")}><Icon name="chevron-down" size={13} /></button>
      <button class="btn small danger" onclick={remove}><Icon name="trash" size={13} />{t("common.delete")}</button>
    </section>
  {/if}

  {#if codeItems.length}
    <section>
      <h4 class="section-title">{t("tikz.codeItems", { n: codeItems.length })}</h4>
      <p class="faint small">{t("tikz.codeItemsHint")}</p>
      {#each codeItems.slice(0, 6) as c (c.id)}
        <pre class="code mono selectable">{c.kind === "code" ? c.code : ""}</pre>
      {/each}
      <button class="btn small" onclick={oncode}><Icon name="code" size={13} />{t("tikz.editCode")}</button>
    </section>
  {/if}
</div>

<style>
  .props {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px;
    overflow: auto;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h4 {
    margin: 0 0 2px;
  }
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .opacity input {
    width: 90px;
  }
  .label {
    margin-top: 4px;
    font-size: 11.5px;
  }
  .small {
    font-size: 11px;
    margin: 0;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
  }
  .seg .faint {
    margin-right: 4px;
  }
  .seg button {
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .seg button:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .seg button.active {
    color: var(--text);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .arrows button {
    min-width: 34px;
    font-size: 14px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    cursor: pointer;
  }
  .swatch.none {
    display: grid;
    place-items: center;
    background: var(--bg-input);
    color: var(--text-faint);
  }
  .swatch.active {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .custom {
    width: 108px;
    height: 24px;
  }
  .coords {
    display: grid;
    grid-template-columns: auto 1fr 1fr;
    align-items: center;
    gap: 5px 6px;
    font-size: 11.5px;
  }
  .coords .input {
    min-width: 0;
  }
  .coords .wide {
    grid-column: span 2;
  }
  .actions {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .code {
    margin: 0;
    padding: 5px 7px;
    max-height: 70px;
    overflow: auto;
    border-radius: var(--radius-sm);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 10.5px;
    white-space: pre-wrap;
  }
</style>
