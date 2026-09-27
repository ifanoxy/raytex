<script lang="ts">
  // Colours for the text. Without xcolor: the usual colours. With xcolor:
  // its 19 colours, the 68 `dvipsnames` and the SVG colours (the option is
  // added when a colour needs it), the colours of the document, and any
  // colour picked by hand.
  import { BASE_COLORS, customColorName, DVIPS_COLORS, type NamedColor, SVG_COLORS } from "$lib/colors";
  import { COLORS } from "$lib/editor/format";
  import { t, type MessageKey } from "$lib/i18n.svelte";
  import { type ColorChoice, colors } from "$lib/state/colors.svelte";
  import Icon from "../common/Icon.svelte";

  let { x, y, onclose }: { x: number; y: number; onclose: () => void } = $props();

  let filter = $state("");
  let custom = $state("#3a7bc2");
  let showSvg = $state(false);

  const info = $derived(colors.current);
  const xcolor = $derived(!!info?.xcolor);
  const options = $derived(info?.options ?? []);
  const q = $derived(filter.trim().toLowerCase());
  const match = (c: NamedColor) => !q || c.name.toLowerCase().includes(q) || label(c).toLowerCase().includes(q);

  function label(c: NamedColor): string {
    const key = `color.${c.name}` as MessageKey;
    const text = t(key);
    return text === key ? c.name : text;
  }

  function keep(e: MouseEvent) {
    e.preventDefault();
  }

  async function pick(c: ColorChoice) {
    onclose();
    await colors.apply(c);
  }

  const sections = $derived.by(() => {
    const out: { id: string; title: string; note?: string; items: ColorChoice[] }[] = [];
    if (info?.defined.length) out.push({ id: "doc", title: t("colors.document"), items: info.defined.filter(match) });
    out.push({ id: "base", title: xcolor ? t("colors.xcolor") : t("colors.common"), items: (xcolor ? BASE_COLORS : COLORS).filter(match) });
    if (xcolor) {
      const dvips = options.includes("dvipsnames");
      out.push({
        id: "dvips",
        title: "dvipsnames",
        note: dvips ? undefined : t("colors.addsOption", { option: "dvipsnames" }),
        items: DVIPS_COLORS.filter(match).map((c) => (dvips ? c : { ...c, option: "dvipsnames" })),
      });
      const svg = options.includes("svgnames");
      if (showSvg || svg || q) {
        out.push({
          id: "svg",
          title: "svgnames",
          note: svg ? undefined : t("colors.addsOption", { option: "svgnames" }),
          items: SVG_COLORS.filter(match).map((c) => (svg ? c : { ...c, option: "svgnames" })),
        });
      }
    }
    return out.filter((s) => s.items.length);
  });
</script>

<div class="pop color-menu" style:left="{x}px" style:top="{y}px" role="dialog" aria-label={t("format.color")}>
  {#if xcolor}
    <!-- svelte-ignore a11y_autofocus -->
    <input class="input small search" placeholder={t("colors.search")} bind:value={filter} spellcheck="false" autofocus />
  {/if}
  <div class="scroll">
    {#each sections as s (s.id)}
      <div class="title">
        <span class="section-title">{s.title}</span>
        {#if s.note}<span class="note faint">{s.note}</span>{/if}
      </div>
      <div class="grid" class:big={s.id !== "base" && s.id !== "doc"}>
        {#each s.items as c (c.name)}
          <button class="swatch" class:current={c.name === colors.last.name} style:background={c.css} title={label(c)} aria-label={label(c)} onmousedown={keep} onclick={() => pick(c)}></button>
        {/each}
      </div>
    {/each}
    {#if !xcolor}
      <button class="more" onmousedown={keep} onclick={() => colors.enableXcolor()}>
        <Icon name="palette" size={14} />{t("colors.moreWithXcolor")}
      </button>
    {:else if !showSvg && !options.includes("svgnames") && !q}
      <button class="more" onmousedown={keep} onclick={() => (showSvg = true)}><Icon name="palette" size={14} />{t("colors.showSvg", { n: SVG_COLORS.length })}</button>
    {/if}
  </div>
  <div class="custom">
    <input type="color" bind:value={custom} aria-label={t("colors.custom")} />
    <span class="mono faint">{custom.toUpperCase()}</span>
    <button class="btn small" onmousedown={keep} onclick={() => pick({ name: customColorName(custom), css: custom, define: custom })}>{t("colors.useCustom")}</button>
  </div>
  <p class="faint foot">{t("colors.foot")}</p>
</div>

<style>
  .color-menu {
    position: fixed;
    z-index: 400;
    width: 292px;
    padding: 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  }
  .search {
    width: 100%;
    margin-bottom: 8px;
  }
  .scroll {
    max-height: min(420px, 55vh);
    overflow: auto;
    padding-right: 2px;
  }
  .title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin: 8px 0 5px;
  }
  .title:first-child {
    margin-top: 0;
  }
  .note {
    font-size: 10.5px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(8, 26px);
    gap: 6px;
  }
  .grid.big {
    grid-template-columns: repeat(10, 20px);
    gap: 5px;
  }
  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    cursor: pointer;
  }
  .big .swatch {
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }
  .swatch:hover,
  .swatch.current {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .more {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 10px;
    padding: 6px 8px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .custom {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .custom input[type="color"] {
    width: 34px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: none;
    cursor: pointer;
  }
  .custom .mono {
    flex: 1;
    font-size: 11.5px;
  }
  .foot {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.4;
  }
</style>
