<script lang="ts">
  // The card of find and replace, over the top right of the editor. It
  // drives the search of the editor library: the matches are highlighted
  // in the text, Enter goes to the next one, Shift+Enter to the previous.
  import { closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, SearchQuery, selectMatches, setSearchQuery } from "@codemirror/search";
  import type { EditorView } from "@codemirror/view";
  import { find } from "$lib/editor/find.svelte";
  import { t } from "$lib/i18n.svelte";
  import { isMac } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  let { view }: { view: EditorView } = $props();

  // The view of a card is that of its editor for good.
  // svelte-ignore state_referenced_locally
  const initial = getSearchQuery(view.state);
  let text = $state(initial.search);
  let replacement = $state(initial.replace);
  let caseSensitive = $state(initial.caseSensitive);
  let regexp = $state(initial.regexp);
  let wholeWord = $state(initial.wholeWord);
  let searchInput = $state<HTMLInputElement | null>(null);
  let replaceInput = $state<HTMLInputElement | null>(null);
  /** Where the search started: typing looks for the first match from there. */
  // svelte-ignore state_referenced_locally
  const origin = view.state.selection.main.from;
  const mod = isMac() ? "⌘" : "Ctrl+";

  function query() {
    return new SearchQuery({ search: text, replace: replacement, caseSensitive, regexp, wholeWord });
  }

  /** The search as it is now; `move`: the selection goes to the first match from where it started. */
  function apply(move: boolean) {
    const q = query();
    view.dispatch({ effects: setSearchQuery.of(q) });
    if (move && q.valid) {
      view.dispatch({ selection: { anchor: origin } });
      findNext(view);
    }
  }

  /** How many matches, and which one is selected (counted up to a limit). */
  const counts = $derived.by(() => {
    void find.tick;
    void text;
    const q = getSearchQuery(view.state);
    if (!q.valid || !q.search) return null;
    const sel = view.state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = q.getCursor(view.state.doc);
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      total++;
      if (next.value.from === sel.from && next.value.to === sel.to) current = total;
      if (total >= 9999) break;
    }
    return { total, current };
  });

  const invalid = $derived(!!text && regexp && !query().valid);

  $effect(() => {
    void find.focusTick;
    requestAnimationFrame(() => {
      (find.replace && text ? replaceInput : searchInput)?.focus();
      (find.replace && text ? replaceInput : searchInput)?.select();
    });
  });

  function close() {
    closeSearchPanel(view);
    view.focus();
  }

  function toggle(which: "case" | "word" | "regexp") {
    if (which === "case") caseSensitive = !caseSensitive;
    if (which === "word") wholeWord = !wholeWord;
    if (which === "regexp") regexp = !regexp;
    apply(true);
  }

  function searchKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.altKey) {
        selectMatches(view);
        view.focus();
      } else if (e.shiftKey) findPrevious(view);
      else findNext(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function replaceKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) replaceAll(view);
      else replaceNext(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }
</script>

<div class="lbt-find" role="search" aria-label={t("find.title")}>
  <button class="fold" onclick={() => (find.replace = !find.replace)} title={t("find.toggleReplace")} aria-label={t("find.toggleReplace")} aria-expanded={find.replace}>
    <Icon name={find.replace ? "chevron-down" : "chevron-right"} size={14} />
  </button>
  <div class="rows">
    <div class="row">
      <div class="field" class:invalid>
        <Icon name="search" size={13} />
        <input
          bind:this={searchInput}
          bind:value={text}
          oninput={(e) => {
            text = e.currentTarget.value;
            apply(true);
          }}
          onkeydown={searchKey}
          placeholder={t("find.search")}
          spellcheck="false"
          aria-label={t("find.search")}
        />
        <button class="opt" class:on={caseSensitive} onclick={() => toggle("case")} title={t("find.case")} aria-pressed={caseSensitive}>Aa</button>
        <button class="opt word" class:on={wholeWord} onclick={() => toggle("word")} title={t("find.word")} aria-pressed={wholeWord}>ab</button>
        <button class="opt" class:on={regexp} onclick={() => toggle("regexp")} title={t("find.regexp")} aria-pressed={regexp}>.*</button>
      </div>
      <span class="count" class:none={!!text && counts?.total === 0}>
        {#if invalid}
          {t("find.invalid")}
        {:else if counts}
          {counts.total === 0 ? t("find.none") : counts.current ? t("find.of", { n: counts.current, total: counts.total }) : t("find.total", { total: counts.total })}
        {/if}
      </span>
      <button class="icon" onclick={() => findPrevious(view)} disabled={!counts?.total} title="{t('find.previous')} (⇧Enter)" aria-label={t("find.previous")}>
        <Icon name="chevron-up" size={15} />
      </button>
      <button class="icon" onclick={() => findNext(view)} disabled={!counts?.total} title="{t('find.next')} (Enter)" aria-label={t("find.next")}>
        <Icon name="chevron-down" size={15} />
      </button>
      <button class="icon" onclick={close} title="{t('find.close')} (Esc)" aria-label={t("find.close")}>
        <Icon name="x" size={14} />
      </button>
    </div>
    {#if find.replace}
      <div class="row">
        <div class="field">
          <Icon name="edit" size={13} />
          <input
            bind:this={replaceInput}
            bind:value={replacement}
            oninput={(e) => {
              replacement = e.currentTarget.value;
              apply(false);
            }}
            onkeydown={replaceKey}
            placeholder={t("find.replace")}
            spellcheck="false"
            aria-label={t("find.replace")}
          />
        </div>
        <button class="text" onclick={() => replaceNext(view)} disabled={!counts?.total} title="{t('find.replaceOne')} (Enter)">{t("find.replaceOne")}</button>
        <button class="text strong" onclick={() => replaceAll(view)} disabled={!counts?.total} title="{t('find.replaceAll')} ({mod}Enter)">{t("find.replaceAll")}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .lbt-find {
    position: absolute;
    top: 8px;
    right: 18px;
    z-index: 20;
    display: flex;
    gap: 2px;
    width: min(430px, calc(100% - 36px));
    padding: 6px 6px 6px 2px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--text);
    animation: drop 0.14s var(--ease);
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .fold {
    align-self: flex-start;
    display: grid;
    place-items: center;
    width: 22px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-faint);
    cursor: pointer;
  }
  .fold:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
  .rows {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .field {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 3px 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text-faint);
  }
  .field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .field.invalid {
    border-color: var(--error);
  }
  .field input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font: inherit;
    font-family: var(--font-mono);
    font-size: 12.5px;
  }
  .opt {
    display: grid;
    place-items: center;
    width: 24px;
    height: 21px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: none;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
  }
  .opt.word {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .opt:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
  .opt.on {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    background: var(--accent-soft);
  }
  .count {
    min-width: 62px;
    padding: 0 4px;
    text-align: center;
    color: var(--text-muted);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .count.none {
    color: var(--error);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .icon:hover:not(:disabled) {
    color: var(--text);
    background: var(--bg-hover);
  }
  .icon:disabled,
  .text:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .text {
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text);
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .text:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .text.strong {
    border-color: transparent;
    background: var(--accent);
    color: var(--accent-contrast);
    font-weight: 600;
  }
</style>
