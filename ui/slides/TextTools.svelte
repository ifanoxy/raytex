<script lang="ts">
  // The tools of a text being written (on the slide or on the right): bold,
  // italic, underlined, alert, the colour of the theme or another colour, a
  // formula, a link; written around the words chosen in the field (taken
  // off when they have it already), the field keeping its focus. `commit`:
  // the field is given back at once (a field written when it is left).
  import { t } from "$lib/i18n.svelte";
  import { applyTool, INLINE_COLORS, type InlineTool } from "$lib/slides/inline";
  import Icon from "../components/common/Icon.svelte";

  let { target, commit = false }: { target: () => HTMLInputElement | HTMLTextAreaElement | null; commit?: boolean } = $props();

  let colors = $state(false);

  function use(tool: InlineTool, color?: string) {
    colors = false;
    const field = target();
    if (!field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const next = applyTool(field.value, start, end, tool, color);
    field.value = next.value;
    field.focus();
    field.setSelectionRange(next.start, next.end);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    if (commit) field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const TOOLS: { tool: InlineTool; icon: string; key: string }[] = [
    { tool: "bold", icon: "bold", key: "slides.text.bold" },
    { tool: "italic", icon: "italic", key: "slides.text.italic" },
    { tool: "underline", icon: "underline", key: "slides.text.underline" },
    { tool: "alert", icon: "alert-circle", key: "slides.text.alert" },
  ];
</script>

<!-- The field keeps its focus and its selection: the tools take no focus. -->
<div class="text-tools" role="toolbar" aria-label={t("slides.text.tools")} tabindex="-1" onmousedown={(e) => e.preventDefault()}>
  {#each TOOLS as tl (tl.tool)}
    <button class="tool" data-tool={tl.tool} title={t(tl.key as "slides.text.bold")} aria-label={t(tl.key as "slides.text.bold")} onclick={() => use(tl.tool)}><Icon name={tl.icon} size={13} /></button>
  {/each}
  <span class="colors">
    <button class="tool" data-tool="color" title={t("slides.text.color")} aria-label={t("slides.text.color")} onclick={() => (colors = !colors)}><Icon name="text-color" size={13} /></button>
    {#if colors}
      <span class="swatches" role="menu">
        <button class="swatch theme" role="menuitem" data-color="structure" title={t("slides.text.structure")} onclick={() => use("structure")}>A</button>
        {#each INLINE_COLORS as c (c.id)}
          <button class="swatch" role="menuitem" data-color={c.id} title={c.id} style:background={c.swatch} aria-label={c.id} onclick={() => use("color", c.id)}></button>
        {/each}
      </span>
    {/if}
  </span>
  <button class="tool" data-tool="math" title={t("slides.text.math")} aria-label={t("slides.text.math")} onclick={() => use("math")}><Icon name="formula" size={13} /></button>
  <button class="tool" data-tool="link" title={t("slides.text.link")} aria-label={t("slides.text.link")} onclick={() => use("link")}><Icon name="link" size={13} /></button>
</div>

<style>
  .text-tools {
    align-self: flex-start;
    width: max-content;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    outline: none;
  }
  .tool {
    display: grid;
    place-items: center;
    width: 24px;
    height: 22px;
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
  .colors {
    position: relative;
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
