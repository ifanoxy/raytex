<script lang="ts">
  // Side panel of the whiteboard: the look of what is selected (or of the
  // next shapes), a group at a time. Each group shows its usual choices as
  // pictures to click; the others are behind "Advanced".
  import { expressionCss, BASE_COLORS, DVIPS_COLORS } from "$lib/colors";
  import { plural, t, type MessageKey } from "$lib/i18n.svelte";
  import { type Arrow, type Dash, type Drawing, type LineWidth, type NodePosition, type NodeShape, num, type Shape, type Style } from "$lib/tikz/model";
  import FoldSection from "../../common/FoldSection.svelte";
  import Icon from "../../common/Icon.svelte";
  import type { Tool } from "./Whiteboard.svelte";

  let {
    drawing = $bindable(),
    selected = $bindable(),
    style = $bindable(),
    tool,
    oncommit,
    oncode,
  }: {
    drawing: Drawing;
    selected: string[];
    style: Style;
    tool: Tool;
    oncommit: () => void;
    /** Shows the code tab (to edit statements kept as code). */
    oncode: () => void;
  } = $props();

  const STROKES = ["black", "gray", "red", "orange", "green!60!black", "teal", "blue", "violet"];
  const FILLS = ["red!20", "orange!25", "yellow!40", "green!20", "teal!20", "blue!20", "violet!20", "gray!20"];
  const WIDTHS: { value: LineWidth; label: MessageKey; px: number }[] = [
    { value: "thin", label: "tikz.width.thin", px: 1 },
    { value: "semithick", label: "tikz.width.medium", px: 2 },
    { value: "thick", label: "tikz.width.thick", px: 3 },
    { value: "very thick", label: "tikz.width.veryThick", px: 4.5 },
  ];
  const DASHES: { value: Dash | null; label: MessageKey; dash: string }[] = [
    { value: null, label: "tikz.dash.solid", dash: "" },
    { value: "dashed", label: "tikz.dash.dashed", dash: "6 4" },
    { value: "dotted", label: "tikz.dash.dotted", dash: "1.5 4" },
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
  /** Arrows are for lines: one that is selected, or the one about to be drawn. */
  const hasPath = $derived(shapes.length ? shapes.some((s) => s.kind === "path" && !s.closed) : tool === "line" || tool === "arrow");
  const node = $derived(shapes.length === 1 && first?.kind === "node" ? first : null);
  /** Only texts are selected: they have no line of their own unless framed. */
  const textOnly = $derived(shapes.length > 0 && shapes.every((s) => s.kind === "node"));
  const codeItems = $derived(drawing.shapes.filter((s) => s.kind === "code"));
  const open = $state({ stroke: false, fill: false, text: false, place: false });

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

  /** A colour typed as xcolor writes it (`red!50!black`), applied with Enter. */
  function typed(e: KeyboardEvent, apply: (color: string) => void) {
    const value = (e.currentTarget as HTMLInputElement).value.trim();
    if (e.key === "Enter" && value) apply(value);
  }
</script>

<div class="props">
  <p class="what faint">{shapes.length ? plural(shapes.length, "tikz.selectedOne", "tikz.selectedMany") : t("tikz.nextShapes")}</p>

  <FoldSection id="stroke" title={t("tikz.stroke")} bind:open={open.stroke}>
    <div class="swatches">
      <button class="swatch none" class:active={current.noStroke} title={t("tikz.noStroke")} aria-label={t("tikz.noStroke")} onclick={() => setStyle({ noStroke: true, fill: current.fill ?? "blue!20" })}><Icon name="x" size={12} /></button>
      {#each STROKES as c (c)}
        <button class="swatch" class:active={!current.noStroke && (current.stroke ?? "black") === c} style:background={css(c)} title={c} aria-label={c} onclick={() => setStyle({ stroke: c === "black" ? null : c, noStroke: false })}></button>
      {/each}
    </div>
    {#if !textOnly}
      <div class="picks" role="radiogroup" aria-label={t("tikz.width")}>
        {#each WIDTHS as w (w.value)}
          <button class:active={(current.width ?? "thin") === w.value} role="radio" aria-checked={(current.width ?? "thin") === w.value} title={t(w.label)} aria-label={t(w.label)} onclick={() => setStyle({ width: w.value === "thin" ? null : w.value })}>
            <svg viewBox="0 0 34 12" aria-hidden="true"><line x1="3" y1="6" x2="31" y2="6" stroke-width={w.px} /></svg>
          </button>
        {/each}
      </div>
    {/if}
    {#if hasPath}
      <div class="picks arrows" role="radiogroup" aria-label={t("tikz.arrows")}>
        {#each ARROWS as a (a.label)}
          <button class:active={current.arrow === a.value} role="radio" aria-checked={current.arrow === a.value} onclick={() => setStyle({ arrow: a.value })}>{a.label}</button>
        {/each}
      </div>
    {/if}
    {#snippet advanced()}
      <div class="picks" role="radiogroup" aria-label={t("tikz.lineStyle")}>
        {#each DASHES as d (d.label)}
          <button class:active={current.dash === d.value} role="radio" aria-checked={current.dash === d.value} title={t(d.label)} aria-label={t(d.label)} onclick={() => setStyle({ dash: d.value })}>
            <svg viewBox="0 0 34 12" aria-hidden="true"><line x1="3" y1="6" x2="31" y2="6" stroke-width="2" stroke-dasharray={d.dash} /></svg>
          </button>
        {/each}
      </div>
      <label class="check"><input type="checkbox" checked={current.rounded} onchange={(e) => setStyle({ rounded: e.currentTarget.checked })} />{t("tikz.rounded")}</label>
      <label class="line">
        <span>{t("tikz.customColor")}</span>
        <input class="input small mono" placeholder="red!50!black" onkeydown={(e) => typed(e, (c) => setStyle({ stroke: c, noStroke: false }))} />
      </label>
    {/snippet}
  </FoldSection>

  <FoldSection id="fill" title={t("tikz.fill")} bind:open={open.fill}>
    <div class="swatches">
      <button class="swatch none" class:active={!current.fill} title={t("tikz.noFill")} aria-label={t("tikz.noFill")} onclick={() => setStyle({ fill: null, noStroke: false })}><Icon name="x" size={12} /></button>
      {#each FILLS as c (c)}
        <button class="swatch" class:active={current.fill === c} style:background={css(c)} title={c} aria-label={c} onclick={() => setStyle({ fill: c })}></button>
      {/each}
    </div>
    {#snippet advanced()}
      <label class="line">
        <span>{t("tikz.opacity")} · {Math.round((current.opacity ?? 1) * 100)} %</span>
        <input type="range" min="0.1" max="1" step="0.05" value={current.opacity ?? 1} oninput={(e) => setStyle({ opacity: Number(e.currentTarget.value) >= 1 ? null : Number(e.currentTarget.value) })} />
      </label>
      <label class="line">
        <span>{t("tikz.customColor")}</span>
        <input class="input small mono" placeholder="yellow!30" onkeydown={(e) => typed(e, (c) => setStyle({ fill: c }))} />
      </label>
    {/snippet}
  </FoldSection>

  {#if node}
    <FoldSection id="text" title={t("tikz.textTitle")} bind:open={open.text}>
      <input class="input small" value={node.text} title={t("tikz.textHint")} onchange={(e) => updateNode({ text: e.currentTarget.value })} placeholder={t("tikz.nodeText")} />
      <div class="picks text" role="radiogroup" aria-label={t("tikz.frame")}>
        {#each [["", "tikz.frame.none"], ["rectangle", "tikz.frame.box"], ["circle", "tikz.frame.circle"]] as const as [shape, label] (shape)}
          <button class:active={(node.boxed ? node.shape || "rectangle" : "") === shape} role="radio" aria-checked={(node.boxed ? node.shape || "rectangle" : "") === shape} onclick={() => updateNode({ boxed: !!shape, shape: shape === "circle" ? "circle" : ("" as NodeShape) })}>{t(label)}</button>
        {/each}
      </div>
      {#snippet advanced()}
        <label class="line">
          <span>{t("tikz.position")}</span>
          <select class="select input small" value={node.position} onchange={(e) => updateNode({ position: e.currentTarget.value as NodePosition })}>
            {#each POSITIONS as p (p.value)}<option value={p.value}>{t(p.label)}</option>{/each}
          </select>
        </label>
        <label class="line">
          <span>{t("tikz.textSize")}</span>
          <select class="select input small" value={node.font ?? ""} onchange={(e) => updateNode({ font: e.currentTarget.value || null })}>
            {#each SIZES as s (s)}<option value={s}>{s || t("format.size.normalsize")}</option>{/each}
          </select>
        </label>
      {/snippet}
    </FoldSection>
  {/if}

  {#if shapes.length === 1 && first && first.kind !== "code"}
    <FoldSection id="place" title={t("tikz.coordinates")} bind:open={open.place}>
      {#snippet advanced()}
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
      {/snippet}
    </FoldSection>
  {/if}

  {#if codeItems.length}
    <button class="code-note" onclick={oncode} title={t("tikz.codeItemsHint")}>
      <Icon name="code" size={13} />{t("tikz.codeItems", { n: codeItems.length })}
    </button>
  {/if}
</div>

<style>
  .props {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px 12px;
    overflow: auto;
  }
  .what {
    margin: 0 2px;
    font-size: 11.5px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
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
    outline-offset: 2px;
  }
  /* Choices shown as what they draw. */
  .picks {
    display: flex;
    gap: 4px;
  }
  .picks button {
    flex: 1;
    display: grid;
    place-items: center;
    height: 28px;
    padding: 0 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .picks button:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .picks button.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .picks svg {
    width: 34px;
    height: 12px;
  }
  .picks line {
    stroke: currentColor;
    stroke-linecap: round;
  }
  .picks.arrows button {
    font-size: 15px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .line {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .line input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
  }
  .line .input {
    width: 100%;
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
  .code-note {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 4px 9px;
    border: 1px dashed var(--border-strong);
    border-radius: 999px;
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .code-note:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
</style>
