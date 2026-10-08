<script lang="ts">
  // A small picture of shapes (a set of the whiteboard): lines, boxes and
  // circles as they are, a text as a short stroke of words.
  import { expressionCss, BASE_COLORS, DVIPS_COLORS } from "$lib/colors";
  import { bounds, type Shape, shapesFromCode, type Style, WIDTH_PT } from "$lib/tikz/model";

  let { code }: { code: string } = $props();

  const KNOWN = [...BASE_COLORS, ...DVIPS_COLORS];
  const css = (color: string | null, fallback: string) => (color ? (expressionCss(color, KNOWN) ?? fallback) : fallback);

  const shapes = $derived(shapesFromCode(code).filter((s): s is Exclude<Shape, { kind: "code" }> => s.kind !== "code"));
  /** The box of the shapes, with a little room around; y goes up in TikZ. */
  const view = $derived.by(() => {
    const b = bounds(shapes) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const pad = Math.max(0.25, (b.maxX - b.minX) * 0.08, (b.maxY - b.minY) * 0.08);
    return { x: b.minX - pad, y: -(b.maxY + pad), w: Math.max(b.maxX - b.minX, 0.5) + pad * 2, h: Math.max(b.maxY - b.minY, 0.5) + pad * 2 };
  });
  /** A line thick enough to be seen whatever the size of the set. */
  const thin = $derived(Math.max(view.w, view.h) / 60);
  const width = (s: Style) => thin * Math.max(1, (s.width ? WIDTH_PT[s.width] : 0.4) / 0.4) ** 0.7;
  const dash = (s: Style) => (s.dash ? `${thin * 3} ${thin * 2.5}` : undefined);
</script>

<svg viewBox="{view.x} {view.y} {view.w} {view.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  {#each shapes as s (s.id)}
    {#if s.kind === "node"}
      <text x={s.at.x} y={-s.at.y} font-size={Math.max(view.w, view.h) / 9} text-anchor="middle" dominant-baseline="central" fill={css(s.textColor, "#222")}>{s.text.replace(/[$\\{}]/g, "").slice(0, 8)}</text>
    {:else}
      {@const stroke = s.style.noStroke ? "none" : css(s.style.stroke, "#222")}
      {@const fill = s.style.fill ? css(s.style.fill, "none") : "none"}
      {#if s.kind === "path"}
        {@const points = s.points.map((p) => `${p.x},${-p.y}`).join(" ")}
        {#if s.closed}
          <polygon {points} {fill} {stroke} stroke-width={width(s.style)} stroke-dasharray={dash(s.style)} stroke-linejoin="round" />
        {:else}
          <polyline {points} fill="none" {stroke} stroke-width={width(s.style)} stroke-dasharray={dash(s.style)} stroke-linecap="round" stroke-linejoin="round" />
          {#if s.style.arrow && s.points.length > 1}
            {@const tip = s.points[s.points.length - 1]}
            <circle cx={tip.x} cy={-tip.y} r={width(s.style) * 1.6} fill={stroke} />
          {/if}
        {/if}
      {:else if s.kind === "rect"}
        <rect x={Math.min(s.from.x, s.to.x)} y={-Math.max(s.from.y, s.to.y)} width={Math.abs(s.to.x - s.from.x)} height={Math.abs(s.to.y - s.from.y)} {fill} {stroke} stroke-width={width(s.style)} stroke-dasharray={dash(s.style)} />
      {:else if s.kind === "circle"}
        <circle cx={s.center.x} cy={-s.center.y} r={s.r} {fill} {stroke} stroke-width={width(s.style)} stroke-dasharray={dash(s.style)} />
      {:else if s.kind === "ellipse"}
        <ellipse cx={s.center.x} cy={-s.center.y} rx={s.rx} ry={s.ry} {fill} {stroke} stroke-width={width(s.style)} stroke-dasharray={dash(s.style)} />
      {/if}
    {/if}
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  text {
    font-family: "Latin Modern Roman", "CMU Serif", "Times New Roman", serif;
  }
</style>
