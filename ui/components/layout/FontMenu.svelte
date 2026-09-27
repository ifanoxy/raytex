<script lang="ts">
  // Fonts of the document, from the formatting bar: the font of each role
  // (main text, sans-serif, code, maths) with a button to change it or go
  // back to the default, and extra fonts for passages, applied to the
  // selection in one click.
  import { t, type MessageKey } from "$lib/i18n.svelte";
  import type { FontSlot } from "$lib/fonts";
  import { editor } from "$lib/state/editor.svelte";
  import { fonts } from "$lib/state/fonts.svelte";
  import Icon from "../common/Icon.svelte";

  let { x, y, onclose }: { x: number; y: number; onclose: () => void } = $props();

  const SLOTS: { slot: FontSlot; label: MessageKey }[] = [
    { slot: "main", label: "fontMenu.main" },
    { slot: "sans", label: "fontMenu.sans" },
    { slot: "mono", label: "fontMenu.mono" },
    { slot: "math", label: "fontMenu.math" },
  ];

  const current = $derived(fonts.current);
  const canEdit = $derived(editor.activeTab?.kind === "tex" && !editor.activeTab.readOnly);
  const hasSelection = $derived(editor.cursor.selected > 0);

  function keep(e: MouseEvent) {
    e.preventDefault();
  }

  function choose(slot: FontSlot) {
    onclose();
    fonts.choose(slot);
  }

  async function reset(slot: FontSlot) {
    onclose();
    await fonts.reset(slot);
  }

  function apply(command: string) {
    onclose();
    fonts.applyExtra(command);
    editor.focus();
  }
</script>

<div class="pop font-menu" style:left="{x}px" style:top="{y}px" role="dialog" aria-label={t("fontMenu.title")}>
  <div class="head">
    <strong>{t("fontMenu.title")}</strong>
    {#if current?.unicode}<span class="badge">XeLaTeX / LuaLaTeX</span>{/if}
  </div>
  {#if current}
    {#each SLOTS as s (s.slot)}
      {@const f = current[s.slot]}
      <div class="slot">
        <span class="label faint">{t(s.label)}</span>
        <button class="font" disabled={!canEdit} onmousedown={keep} onclick={() => choose(s.slot)} title={t("fontMenu.change")}>
          <span class="name ellipsis" style:font-family={f.source === "default" ? undefined : `"${f.name}"`}>{f.name}</span>
          {#if f.source === "default"}<span class="default faint">{t("fontMenu.default")}</span>{/if}
          <Icon name="chevron-right" size={12} />
        </button>
        {#if f.source !== "default"}
          <button class="icon-btn small" disabled={!canEdit} onmousedown={keep} onclick={() => reset(s.slot)} title={t("fontMenu.reset")} aria-label={t("fontMenu.reset")}>
            <Icon name="x" size={13} />
          </button>
        {:else}
          <span class="icon-gap"></span>
        {/if}
      </div>
    {/each}

    <div class="section-title extra-title">{t("fontMenu.extra")}</div>
    {#each current.extra as e (e.command)}
      <div class="extra">
        <span class="name ellipsis" style:font-family={`"${e.name}"`}>{e.name}</span>
        <code class="faint">\{e.command}</code>
        <button class="btn small" disabled={!canEdit} onmousedown={keep} onclick={() => apply(e.command)} title={t("fontMenu.applyHint", { cmd: `{\\${e.command} …}` })}>
          {hasSelection ? t("fontMenu.applySelection") : t("fontMenu.insert")}
        </button>
        <button class="icon-btn small" disabled={!canEdit} onmousedown={keep} onclick={() => (onclose(), fonts.choose("command", e.command))} title={t("fontMenu.change")} aria-label={t("fontMenu.change")}><Icon name="edit" size={13} /></button>
        <button class="icon-btn small" disabled={!canEdit} onmousedown={keep} onclick={() => (onclose(), void fonts.removeExtra(e.command))} title={t("fontMenu.remove")} aria-label={t("fontMenu.remove")}><Icon name="trash" size={13} /></button>
      </div>
    {:else}
      <p class="faint none">{t("fontMenu.noExtra")}</p>
    {/each}
    <button class="add" disabled={!canEdit} onmousedown={keep} onclick={() => (onclose(), fonts.choose("command"))}>
      <Icon name="plus" size={14} />
      {hasSelection ? t("fontMenu.addForSelection") : t("fontMenu.add")}
    </button>
  {:else}
    <div class="loading"><span class="spinner"></span></div>
  {/if}
</div>

<style>
  .font-menu {
    position: fixed;
    z-index: 400;
    width: 340px;
    padding: 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 2px 10px;
  }
  .slot {
    display: grid;
    grid-template-columns: 92px 1fr 26px;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }
  .label {
    font-size: 11.5px;
  }
  .font {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .font:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
  }
  .default {
    font-size: 11px;
  }
  .icon-btn.small {
    width: 26px;
    height: 26px;
  }
  .icon-gap {
    width: 26px;
  }
  .extra-title {
    margin: 12px 2px 6px;
  }
  .extra {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .extra code {
    font-size: 11px;
  }
  .none {
    margin: 0 2px 6px;
    font-size: 11.5px;
    line-height: 1.45;
  }
  .add {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 30px;
    margin-top: 4px;
    padding: 0 8px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .add:hover:not(:disabled) {
    background: var(--accent-soft);
  }
  .loading {
    display: grid;
    place-items: center;
    height: 80px;
  }
</style>
