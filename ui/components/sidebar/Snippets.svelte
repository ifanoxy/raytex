<script lang="ts">
  // @ shortcuts (first: the fastest way to type symbols), snippets (built
  // in) and personal macros.
  import { keyFor } from "$lib/actions";
  import { atBody, atPreview, cleanAtKey, mergeShortcuts, validAtKey } from "$lib/at";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { app } from "$lib/state/app.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { SnippetView } from "$lib/types";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import MathGlyph from "../common/MathGlyph.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  let snippets = $state<SnippetView[]>([]);
  let shortcuts = $state<[string, string][]>([]);
  let filter = $state("");
  let tab = $state<"snippets" | "macros" | "shortcuts">("shortcuts");

  $effect(() => {
    void ipc.builtinSnippets().then((s) => (snippets = s));
    void ipc.atShortcuts().then((s) => (shortcuts = s));
  });

  const q = $derived(filter.trim().toLowerCase());
  const shownSnippets = $derived(snippets.filter((s) => !q || `${s.trigger} ${s.name}`.toLowerCase().includes(q)));
  const macros = $derived((app.settings?.macros ?? []).filter((m) => !q || `${m.trigger} ${m.name}`.toLowerCase().includes(q)));
  // The `@` shortcuts: those of the user (macros whose trigger starts with
  // `@`) first, then those of RayTeX that none of them replaces.
  const allShortcuts = $derived(mergeShortcuts(shortcuts, app.settings?.macros ?? []));
  const shownShortcuts = $derived(allShortcuts.filter((s) => !q || `${s.key} ${s.body}`.toLowerCase().includes(q)));
  const mine = $derived(shownShortcuts.filter((s) => s.own));
  const builtin = $derived(shownShortcuts.filter((s) => !s.own));

  // A new `@` shortcut: a key and what it writes.
  let newKey = $state("");
  let newBody = $state("");
  let newMath = $state(true);
  const key = $derived(cleanAtKey(newKey));
  const body = $derived(atBody(newBody));
  const keyProblem = $derived(key !== "" && !validAtKey(key));
  /** The shortcut of RayTeX this key would replace. */
  const replaced = $derived(validAtKey(key) ? (shortcuts.find(([k]) => k === key)?.[1] ?? null) : null);
  const canAdd = $derived(validAtKey(key) && body !== "");

  async function addShortcut() {
    if (!canAdd) return;
    const trigger = `@${key}`;
    const macro = { name: atPreview(body), trigger, key: "", body, math: newMath };
    await app.update((x) => {
      // The same key again: its command changes.
      const at = x.macros.findIndex((m) => m.trigger === trigger);
      if (at >= 0) x.macros[at] = { ...x.macros[at], name: atPreview(body), body, math: newMath };
      else x.macros.push(macro);
    });
    ui.toast("success", t("snippets.atAdded", { key: trigger, body: atPreview(body) }));
    newKey = "";
    newBody = "";
  }

  function removeShortcut(trigger: string) {
    void app.update((x) => {
      const at = x.macros.findIndex((m) => m.trigger === trigger);
      if (at >= 0) x.macros.splice(at, 1);
    });
  }

  function insertShortcut(s: { body: string; own: { math: boolean } | null }) {
    // Those of RayTeX are formulas; one of the user may be text.
    if (!s.own || s.own.math) editor.insertMath(s.body);
    else editor.insertSnippet(s.body);
  }

  async function insert(body: string, pkg?: string | null) {
    if (editor.insertSnippet(body) && pkg) await editor.addPackage(pkg);
  }
</script>

<PanelHeader title={t("sidebar.snippets")}>
  <button class="icon-btn" title={t("snippets.editMacros")} onclick={() => ui.openSettings("macros")}><Icon name="edit" /></button>
</PanelHeader>

<div class="tabs" role="tablist">
  <button class="tab" class:active={tab === "shortcuts"} onclick={() => (tab = "shortcuts")}>{t("snippets.tabShortcuts")}</button>
  <button class="tab" class:active={tab === "snippets"} onclick={() => (tab = "snippets")}>{t("snippets.tabSnippets")}</button>
  <button class="tab" class:active={tab === "macros"} onclick={() => (tab = "macros")}>{t("snippets.tabMacros")}</button>
</div>

<div class="filter"><input class="input small" placeholder={t("snippets.filter")} bind:value={filter} spellcheck="false" /></div>

<div class="list">
  {#if tab === "snippets"}
    <p class="tip faint">{t("snippets.tip")}</p>
    {#each shownSnippets as s (s.trigger)}
      <button class="row" onclick={() => insert(s.body, s.package)} title={s.body}>
        <span class="trigger mono">{s.trigger}</span>
        <span class="name ellipsis">{s.name}</span>
        {#if s.math}<span class="badge">math</span>{/if}
      </button>
    {/each}
  {:else if tab === "macros"}
    <p class="tip faint">{t("snippets.macrosTip")}</p>
    {#each macros as m, i (i)}
      <button class="row" onclick={() => insert(m.body)} title={m.body}>
        <span class="trigger mono">{m.trigger || "—"}</span>
        <span class="name ellipsis">{m.name}</span>
        {#if m.key}<kbd>{prettyKey(m.key)}</kbd>{/if}
      </button>
    {:else}
      <div class="empty">
        {t("snippets.noMacros")}
        <button class="btn small" onclick={() => ui.openSettings("macros")}><Icon name="plus" size={13} />{t("snippets.addMacro")}</button>
      </div>
    {/each}
  {:else}
    <div class="intro">
      <strong>{t("snippets.shortcutsTitle")}</strong>
      <p>{t("snippets.shortcutsTip")}</p>
    </div>
    <form
      class="at-new"
      onsubmit={(e) => {
        e.preventDefault();
        void addShortcut();
      }}
    >
      <strong class="section">{t("snippets.atNew")}</strong>
      <div class="at-fields">
        <span class="at-sign mono">@</span>
        <input class="input small mono at-key-input" class:invalid={keyProblem} bind:value={newKey} placeholder="v" aria-label={t("snippets.atKey")} spellcheck="false" autocomplete="off" />
        <span class="faint">→</span>
        <input class="input small mono at-body-input" bind:value={newBody} placeholder={"\\vec{}"} aria-label={t("snippets.atCommand")} spellcheck="false" autocomplete="off" />
        <button class="btn small primary" type="submit" disabled={!canAdd}>{t("snippets.atAdd")}</button>
      </div>
      <label class="at-math"><input type="checkbox" bind:checked={newMath} />{t("snippets.atMath")}</label>
      {#if keyProblem}
        <p class="at-note problem">{t("snippets.atInvalidKey")}</p>
      {:else if replaced}
        <p class="at-note">{t("snippets.atReplaces", { key: `@${key}`, body: replaced })}</p>
      {/if}
    </form>
    {#if mine.length}
      <strong class="section">{t("snippets.atMine")}</strong>
      <div class="at-grid">
        {#each mine as s (s.key)}
          <div class="at-own">
            <button class="at-item" onclick={() => insertShortcut(s)} title={atPreview(s.body)}>
              <span class="at-key mono">@{s.key}</span>
              {#if s.own?.math}<MathGlyph latex={s.body} />{:else}<span class="mono ellipsis at-text">{atPreview(s.body)}</span>{/if}
            </button>
            <button class="icon-btn at-remove" title={t("snippets.atRemove")} aria-label={t("snippets.atRemove")} onclick={() => removeShortcut(`@${s.key}`)}><Icon name="x" size={11} /></button>
          </div>
        {/each}
      </div>
      <strong class="section">{t("snippets.atBuiltin")}</strong>
    {/if}
    <div class="at-grid">
      {#each builtin as s (s.key)}
        <button class="at-item" onclick={() => insertShortcut(s)} title={atPreview(s.body)}>
          <span class="at-key mono">@{s.key}</span>
          <MathGlyph latex={s.body} />
        </button>
      {/each}
    </div>
  {/if}
</div>
<div class="foot faint">{t("snippets.foot", { key: prettyKey(keyFor("view.palette") ?? "") })}</div>

<style>
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    padding: 6px 7px 7px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .filter {
    padding: 8px 10px 2px;
  }
  .filter .input {
    width: 100%;
  }
  .list {
    flex: 1;
    overflow: auto;
    padding: 0 6px 10px;
  }
  .tip {
    margin: 6px 6px 8px;
    font-size: 11px;
    line-height: 1.45;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
  }
  .row:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .intro {
    margin: 8px 4px 10px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
  }
  .intro strong {
    color: var(--accent);
    font-size: 12.5px;
  }
  .intro p {
    margin: 4px 0 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .section {
    display: block;
    margin: 10px 4px 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .at-new {
    margin: 0 4px 4px;
    padding: 2px 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .at-new .section {
    margin: 4px 0 6px;
  }
  .at-fields {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .at-sign {
    font-weight: 600;
    color: var(--accent);
  }
  .at-key-input {
    width: 52px;
    flex-shrink: 0;
  }
  .at-body-input {
    flex: 1;
    min-width: 0;
  }
  .input.invalid {
    border-color: var(--error);
  }
  .at-math {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .at-note {
    margin: 6px 0 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .at-note.problem {
    color: var(--error);
  }
  .at-own {
    position: relative;
  }
  .at-own .at-item {
    width: 100%;
  }
  .at-remove {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    opacity: 0;
  }
  .at-own:hover .at-remove,
  .at-own:focus-within .at-remove {
    opacity: 1;
  }
  .at-text {
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .at-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 5px;
    padding: 0 4px;
  }
  .at-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    cursor: pointer;
  }
  .at-item:hover {
    border-color: var(--accent);
  }
  .at-key {
    font-variant-ligatures: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }
  .trigger {
    min-width: 58px;
    font-size: 11.5px;
    color: var(--accent);
  }
  .name {
    flex: 1;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .foot {
    padding: 8px 12px;
    font-size: 11px;
    border-top: 1px solid var(--border);
  }
</style>
