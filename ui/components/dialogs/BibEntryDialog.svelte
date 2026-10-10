<script lang="ts">
  // An entry of the bibliography, in a form: its kind, its key, the fields
  // of that kind in sight and the others behind "Advanced". A new entry can
  // be filled from a DOI, an arXiv identifier or pasted BibTeX.
  import { untrack } from "svelte";
  import { type BibField, filled, formRows, KINDS, sourceOf, validKey } from "$lib/bibliography";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { bibliography } from "$lib/state/bibliography.svelte";
  import { basename } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  const editing = $derived(bibliography.editing);

  let kind = $state("article");
  let key = $state("");
  let file = $state("");
  let main = $state<BibField[]>([]);
  let more = $state<BibField[]>([]);
  /** Fields added by hand: their name is typed too. */
  let added = $state<BibField[]>([]);
  let advanced = $state(false);
  let source = $state("");
  let fetching = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);

  // The form is filled each time it opens (and only then: what is typed in
  // it afterwards must not fill it again).
  $effect(() => {
    const e = editing;
    if (!e) return;
    untrack(() => {
      kind = e.draft.kind || "article";
      key = e.draft.key;
      file = e.file;
      const rows = formRows(kind, e.draft.fields);
      main = rows.main;
      more = rows.more;
      added = [];
      // What the entry already says beyond the main fields is shown at once.
      advanced = rows.more.some((f) => f.value);
      source = "";
      error = null;
      fetching = saving = false;
    });
  });

  const kinds = $derived(Object.keys(KINDS).includes(kind) ? Object.keys(KINDS) : [...Object.keys(KINDS), kind]);
  const label = (name: string) => {
    const k = `bib.field.${name}`;
    const text = t(k as never);
    return text === k ? name : text;
  };
  const kindLabel = (name: string) => {
    const k = `bib.kind.${name}`;
    const text = t(k as never);
    return text === k ? name : text;
  };

  /** Another kind: its fields, with what was typed kept. */
  function setKind(next: string) {
    const now = filled([...main, ...more, ...added]);
    kind = next;
    ({ main, more } = formRows(next, now));
    added = [];
    if (more.some((f) => f.value)) advanced = true;
  }

  async function suggest() {
    if (!editing) return;
    key = await ipc.bibKey(filled([...main, ...more, ...added]), editing.taken);
  }

  const recognised = $derived(sourceOf(source));

  /** Fills the form from what was pasted: BibTeX, or an identifier to ask for. */
  async function fill() {
    const e = editing;
    const what = recognised;
    if (!e || fetching) return;
    if (!what) {
      error = t("bib.error.invalid");
      return;
    }
    fetching = true;
    error = null;
    try {
      const drafts = what === "bibtex" ? await ipc.bibDrafts(source) : await ipc.bibFetch(what, source.trim());
      const draft = drafts[0];
      if (!draft) {
        error = t(what === "bibtex" ? "bib.error.invalid" : "bib.error.notFound");
        return;
      }
      kind = draft.kind || "misc";
      ({ main, more } = formRows(kind, draft.fields));
      added = [];
      advanced = false;
      // The key of pasted BibTeX is kept when it is free; a fetched one is made here.
      key = what === "bibtex" && draft.key && !e.taken.includes(draft.key) ? draft.key : await ipc.bibKey(draft.fields, e.taken);
      source = "";
    } catch (why) {
      const code = String(why);
      error = code === "invalid" ? t("bib.error.invalid") : code === "not-found" ? t("bib.error.notFound") : `${t("bib.error.network")} ${code}`;
    } finally {
      fetching = false;
    }
  }

  async function save() {
    const e = editing;
    if (!e || saving) return;
    const fields = filled([...main, ...more, ...added]);
    if (!key.trim() && fields.length) key = await ipc.bibKey(fields, e.taken);
    if (!validKey(key)) {
      error = t("bib.error.key");
      return;
    }
    if (e.taken.includes(key.trim())) {
      error = t("bib.error.keyTaken");
      return;
    }
    if (!fields.length) {
      error = t("bib.error.empty");
      return;
    }
    saving = true;
    error = null;
    e.file = file;
    const refused = await bibliography.save({ kind, key, fields });
    saving = false;
    if (!refused) return;
    error = refused === "key" ? t("bib.error.key") : refused.startsWith("braces:") ? t("bib.error.braces", { field: label(refused.slice(7)) }) : t("bib.error.file");
  }

  function addField() {
    added = [...added, { name: "", value: "", raw: false }];
    advanced = true;
  }

  function onKey(e: KeyboardEvent) {
    if (!editing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      bibliography.close();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      void save();
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#snippet row(f: BibField, custom: boolean)}
  <label class="field">
    {#if custom}
      <input class="input small mono name" placeholder={t("bib.form.fieldName")} bind:value={f.name} spellcheck="false" />
    {:else}
      <span class="label">{label(f.name)}</span>
    {/if}
    {#if f.name === "note" || f.name === "abstract"}
      <textarea class="input small" rows="2" bind:value={f.value}></textarea>
    {:else}
      <input
        class="input small"
        class:mono={f.raw || ["doi", "url", "eprint", "isbn"].includes(f.name)}
        placeholder={f.name === "author" || f.name === "editor" ? t("bib.form.authorHint") : undefined}
        bind:value={f.value}
        spellcheck="false"
      />
    {/if}
  </label>
{/snippet}

{#if editing}
  <div class="overlay" role="presentation">
    <div class="dialog bib-entry" role="dialog" aria-modal="true" aria-labelledby="bib-entry-title">
      <div class="head">
        <Icon name="book" size={18} />
        <h3 id="bib-entry-title">{editing.replaces ? t("bib.form.edit") : t("bib.form.new")}</h3>
        <span class="spacer"></span>
        <button class="icon-btn" title={t("common.close")} aria-label={t("common.close")} onclick={() => bibliography.close()}><Icon name="x" size={15} /></button>
      </div>

      <div class="body">
        {#if !editing.replaces}
          <div class="import">
            <div class="import-row">
              <input
                class="input small mono"
                placeholder={t("bib.form.importPlaceholder")}
                bind:value={source}
                spellcheck="false"
                onkeydown={(e) => {
                  if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    void fill();
                  }
                }}
              />
              <button class="btn small" disabled={!source.trim() || fetching} onclick={fill}>
                {#if fetching}<span class="spinner"></span>{:else}<Icon name="wand" size={13} />{/if}{t("bib.form.fill")}
              </button>
            </div>
            <p class="hint faint">{t("bib.form.importHint")}</p>
          </div>
        {/if}

        <div class="top">
          <label class="field">
            <span class="label">{t("bib.form.kind")}</span>
            <select class="input small" value={kind} onchange={(e) => setKind(e.currentTarget.value)}>
              {#each kinds as k (k)}<option value={k}>{kindLabel(k)}</option>{/each}
            </select>
          </label>
          <label class="field grow">
            <span class="label">{t("bib.form.key")}</span>
            <span class="with-button">
              <input class="input small mono key" bind:value={key} spellcheck="false" placeholder={t("bib.form.keyHint")} />
              <button class="icon-btn" title={t("bib.form.newKey")} aria-label={t("bib.form.newKey")} onclick={suggest}><Icon name="refresh" size={14} /></button>
            </span>
          </label>
        </div>

        {#each main as f (f.name)}
          {@render row(f, false)}
        {/each}

        <button class="more" aria-expanded={advanced} onclick={() => (advanced = !advanced)}>
          <Icon name={advanced ? "chevron-up" : "chevron-down"} size={13} />{t("common.advanced")}
        </button>
        {#if advanced}
          {#each more as f (f.name)}
            {@render row(f, false)}
          {/each}
          {#each added as f, i (i)}
            {@render row(f, true)}
          {/each}
          <div class="extras">
            <button class="btn small ghost" onclick={addField}><Icon name="plus" size={13} />{t("bib.form.addField")}</button>
            {#if editing.files.length > 1}
              <label class="field inline">
                <span class="label">{t("bib.form.file")}</span>
                <select class="input small" bind:value={file} disabled={!!editing.replaces}>
                  {#each editing.files as f (f)}<option value={f}>{basename(f)}</option>{/each}
                </select>
              </label>
            {/if}
          </div>
        {/if}
      </div>

      {#if error}<p class="error" role="alert"><Icon name="alert-circle" size={14} />{error}</p>{/if}

      <div class="buttons">
        {#if editing.item}
          {@const item = editing.item}
          <button class="btn link danger" onclick={() => bibliography.remove(item)}><Icon name="trash" size={13} />{t("bib.delete")}</button>
        {/if}
        <span class="spacer"></span>
        <button class="btn" onclick={() => bibliography.close()}>{t("common.cancel")}</button>
        <button class="btn primary" disabled={saving} onclick={save}>
          {#if saving}<span class="spinner"></span>{:else}<Icon name="check" size={14} />{/if}{t("common.save")}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 810;
    display: grid;
    place-items: center;
    background: var(--overlay);
    animation: fade 0.18s var(--ease);
  }
  .dialog {
    width: min(560px, 94vw);
    max-height: 88vh;
    padding: 16px 20px 16px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: rise 0.22s var(--ease);
  }
  @keyframes rise {
    from {
      transform: translateY(8px) scale(0.98);
      opacity: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--accent);
  }
  h3 {
    margin: 0;
    font-size: 15px;
    color: var(--text);
  }
  .spacer {
    flex: 1;
  }
  .body {
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 2px 4px 2px 0;
  }
  .import {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 12px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elev);
  }
  .import-row {
    display: flex;
    gap: 6px;
  }
  .import-row .input {
    flex: 1;
    min-width: 0;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
  }
  .top {
    display: flex;
    gap: 10px;
  }
  .field {
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }
  .top .field {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .top .field.grow {
    flex: 1;
  }
  .field.inline {
    grid-template-columns: auto minmax(0, 180px);
    margin-left: auto;
  }
  .label {
    font-size: 12px;
    color: var(--text-muted);
  }
  .field .input {
    width: 100%;
  }
  .field textarea {
    resize: vertical;
    min-height: 44px;
    line-height: 1.4;
  }
  .name {
    font-size: 11.5px;
  }
  .with-button {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .with-button .icon-btn {
    width: 26px;
    height: 26px;
    flex: none;
  }
  .more {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 4px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .more:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .extras {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .error {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: 12.5px;
    color: var(--error);
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn.link {
    background: none;
    border-color: transparent;
    padding-left: 0;
    color: var(--text-muted);
  }
  .btn.link.danger:hover {
    color: var(--error);
  }
</style>
