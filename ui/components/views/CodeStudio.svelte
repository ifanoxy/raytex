<script lang="ts">
  // Code in the document (the `listings` package): the code, its language,
  // its indentation, and how code looks in the whole document, with the
  // listing compiled next to it. What TeX measures tells how many columns a
  // line holds, so that lines too long are said before they run into the
  // margin.
  import { onMount } from "svelte";
  import { i18n, plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import type { PagePreview } from "$lib/layout";
  import {
    CODE_SIZES,
    CODE_THEMES,
    type CodeStyle,
    codeColumns,
    COMMON_LANGUAGES,
    DEFAULT_CODE_STYLE,
    emptyListing,
    indentationOf,
    LANGUAGES,
    languageOf,
    languageOfFile,
    linesOver,
    type Listing,
    listingCode,
    listingLabel,
    listingPreview,
    mixedIndentation,
    readCodeStyle,
    reindentCode,
    tidyCode,
    withFragileFrame,
    writeCodeStyle,
  } from "$lib/listing";
  import { preambleEnd } from "$lib/preamble";
  import { editor } from "$lib/state/editor.svelte";
  import { type CodeEdit, media } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { FileNode } from "$lib/types";
  import { debounce, dirname, relative } from "$lib/utils";
  import FoldSection from "../common/FoldSection.svelte";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const path = editor.active ?? project.info?.main ?? null;
  void i18n.lang;

  let root = $state<string | null>(null);
  let source = $state<string | null>(null);
  let missing = $state(false);
  let listing = $state<Listing>(emptyListing());
  let style = $state<CodeStyle>({ ...DEFAULT_CODE_STYLE });
  /** The style the document had, and whether it was changed here. */
  let had = $state<{ style: CodeStyle; edited: boolean } | null>(null);
  let styled = $state(false);
  /** A listing of the document being changed (its chip). */
  let edit = $state<CodeEdit | null>(null);
  let labelEdited = $state(false);
  let advanced = $state(false);
  /** The text of the file a listing is read from. */
  let fileText = $state("");

  onMount(async () => {
    const request = media.codeRequest;
    media.codeRequest = null;
    const found = path ? await editor.rootSource(path) : null;
    if (!found || preambleEnd(found.text) >= found.text.length) {
      missing = true;
      return;
    }
    root = found.root;
    source = found.text;
    had = readCodeStyle(found.text);
    if (had) style = { ...had.style };
    if (request?.edit) {
      edit = request.edit;
      listing = { ...request.edit.listing };
      labelEdited = true;
      advanced = !!listing.options || listing.file !== null;
      if (listing.file !== null) void readFile(listing.file);
    } else if (request?.code) {
      listing.code = tidyCode(request.code);
    }
  });

  /** A change of the style made here: it is what the document will have. */
  function restyle(change: Partial<CodeStyle>) {
    style = { ...style, ...change };
    styled = true;
  }
  /** What is written in the preamble: the style chosen here, or nothing new when the document has one that was left alone. */
  const styleToWrite = $derived(had && !styled ? null : style);

  // The label follows the caption until it is typed.
  $effect(() => {
    if (!labelEdited) listing.label = listingLabel(listing.caption);
  });

  // ----------------------------------------------------------------- the code

  const code = $derived(listing.file !== null ? fileText : listing.code);
  const indentation = $derived(indentationOf(code));
  const mixed = $derived(mixedIndentation(code));

  function indent(to: "tabs" | number) {
    listing.code = reindentCode(tidyCode(listing.code), to);
  }

  /** Code pasted from the middle of a file comes back to the margin. */
  function pasted(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text/plain");
    const area = e.currentTarget as HTMLTextAreaElement;
    if (!text || listing.code.trim() || area.selectionStart !== area.selectionEnd) return;
    e.preventDefault();
    listing.code = tidyCode(text);
  }

  /** Tab indents by what the code uses (four spaces when it is not indented yet). */
  function key(e: KeyboardEvent) {
    if (e.key !== "Tab" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    const area = e.currentTarget as HTMLTextAreaElement;
    const unit = indentation?.tabs ? "\t" : " ".repeat(indentation?.size ?? 4);
    area.setRangeText(unit, area.selectionStart, area.selectionEnd, "end");
    listing.code = area.value;
  }

  // ------------------------------------------------------- code from a file

  function flatten(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
    for (const n of nodes) {
      if (n.dir) flatten(n.children ?? [], out);
      else out.push(n);
    }
    return out;
  }
  /** Files of the project that hold code of a language offered here, as the document names them. */
  const files = $derived(
    root
      ? flatten(project.tree)
          .filter((n) => !/\.(tex|sty|cls)$/i.test(n.name) && languageOfFile(n.name))
          .map((n) => relative(dirname(root!), n.path))
      : [],
  );

  async function readFile(file: string) {
    fileText = root ? await ipc.readTextFile(`${dirname(root)}/${file}`).then((f) => f.text.replace(/\n+$/, ""), () => "") : "";
  }

  function chooseFile(file: string) {
    listing.file = file || null;
    if (!file) return;
    const language = languageOfFile(file);
    if (language) listing.language = language.name;
    void readFile(file);
  }

  // ------------------------------------------------------------- the preview

  const ready = $derived(listing.file !== null || !!listing.code.trim());
  const previewText = $derived.by(() => {
    if (source === null || !ready) return null;
    const shown = listing.file !== null ? { ...listing } : { ...listing, code: tidyCode(listing.code) };
    return listingPreview(source, shown, $state.snapshot(styleToWrite) as CodeStyle | null);
  });
  let outcome = $state<PagePreview | null>(null);
  let compiling = $state(false);
  let revision = $state(0);
  let failure = $state<string | null>(null);
  let running = 0;
  const schedule = debounce(() => void compile(), 600);

  $effect(() => {
    void previewText;
    schedule();
  });

  async function compile() {
    const text = previewText;
    if (!root || !text) {
      outcome = null;
      failure = null;
      return;
    }
    const my = ++running;
    compiling = true;
    try {
      const result = await ipc.previewPage({ path: root, job: "code", source: text });
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
  /** Columns a line of the document holds, as TeX measured them. */
  const columns = $derived(codeColumns(outcome?.measures, had && !styled ? had.style : style));
  const over = $derived(columns === null ? 0 : linesOver(tidyCode(code), columns, style.tab));

  // --------------------------------------------------------------- the writing

  let busy = $state(false);

  async function write() {
    if (!ready || busy || !path) return;
    busy = true;
    try {
      const wanted: Listing = listing.file !== null ? { ...listing, code: "" } : { ...listing, code: tidyCode(listing.code) };
      const text = listingCode(wanted);
      const language = languageOf(wanted.language);
      if (edit) {
        editor.replaceRange(edit.doc, edit.from, edit.to, text);
      } else {
        const view = editor.view;
        if (!view || editor.activeTab?.kind !== "tex" || view.state.readOnly) {
          ui.toast("warning", t("code.noDocument"));
          return;
        }
        // On lines of its own.
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        const before = line.text.slice(0, head - line.from).trim() ? "\n" : "";
        const after = line.text.slice(head - line.from).trim() ? "\n" : "";
        editor.replaceRange(path, head, head, `${before}${text}\n${after}`);
        // In a presentation, the frame the code is in must be fragile.
        if (source && /\\documentclass(?:\[[^\]]*\])?\{beamer\}/.test(source)) await editor.rewrite(path, (doc) => withFragileFrame(doc, head));
      }
      const styleNow = $state.snapshot(styleToWrite) as CodeStyle | null;
      await editor.transformRoot((doc) => writeCodeStyle(doc, styleNow, language ? [language] : []), path);
      ui.toast("success", t(edit ? "code.updated" : "code.inserted"));
      if (ui.overlay === "code") ui.closeOverlay();
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
</script>

<svelte:window onkeydown={shortcut} />

<Modal title={edit ? t("code.editTitle") : t("code.title")} icon="code" width="min(1120px, 96vw)" height="min(740px, 92vh)">
  <div class="code-studio">
    {#if missing}
      <div class="nothing"><Icon name="alert-triangle" size={22} /><span>{t("layout.noPreamble")}</span></div>
    {:else}
      <section class="left">
        <div class="bar">
          <label class="language">
            <span>{t("code.language")}</span>
            <select class="select input" bind:value={listing.language} aria-label={t("code.language")}>
              <option value="">{t("code.noLanguage")}</option>
              <optgroup label={t("code.common")}>
                {#each LANGUAGES.slice(0, COMMON_LANGUAGES) as l (l.name)}<option value={l.name}>{l.name}</option>{/each}
              </optgroup>
              <optgroup label={t("code.others")}>
                {#each LANGUAGES.slice(COMMON_LANGUAGES) as l (l.name)}<option value={l.name}>{l.name}</option>{/each}
              </optgroup>
            </select>
          </label>
          <div class="spacer"></div>
          {#if listing.file === null}
            <span class="faint small">{t("code.indentation")}</span>
            <div class="segmented indents" role="group" aria-label={t("code.indentation")}>
              {#each [2, 4] as n (n)}
                <button class:active={!mixed && indentation?.tabs === false && indentation.size === n} disabled={!indentation} data-indent={n} onclick={() => indent(n)}>{plural(n, "code.spaceOne", "code.spaceMany")}</button>
              {/each}
              <button class:active={!mixed && indentation?.tabs === true} disabled={!indentation} data-indent="tabs" onclick={() => indent("tabs")}>{t("code.tabs")}</button>
            </div>
          {/if}
        </div>
        {#if listing.file === null}
          <textarea
            class="source mono"
            bind:value={listing.code}
            onpaste={pasted}
            onkeydown={key}
            placeholder={t("code.placeholder")}
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            wrap="off"
            aria-label={t("code.title")}
          ></textarea>
        {:else}
          <pre class="source mono from-file selectable">{fileText}</pre>
        {/if}
        <div class="notes">
          {#if mixed && listing.file === null}
            <span class="note warn"><Icon name="alert-triangle" size={13} />{t("code.mixed")}</span>
          {/if}
          {#if over > 0 && columns !== null}
            <span class="note" class:warn={!style.wrap}>
              <Icon name={style.wrap ? "info" : "alert-triangle"} size={13} />
              {plural(over, style.wrap ? "code.wrappedOne" : "code.overOne", style.wrap ? "code.wrappedMany" : "code.overMany")}
              <span class="faint">{t("code.columns", { n: columns })}</span>
              {#if !style.wrap}<button class="btn small" onclick={() => restyle({ wrap: true })}>{t("code.wrap")}</button>{/if}
              {#if style.size !== "footnotesize"}<button class="btn small" onclick={() => restyle({ size: style.size === "normalsize" ? "small" : "footnotesize" })}>{t("code.smaller")}</button>{/if}
            </span>
          {/if}
        </div>
      </section>

      <aside class="right">
        {#snippet more()}
          <div class="field">
            <span>{t("code.tabWidth")}</span>
            <div class="segmented" role="radiogroup" aria-label={t("code.tabWidth")}>
              {#each [2, 4, 8] as n (n)}
                <button class:active={style.tab === n} role="radio" aria-checked={style.tab === n} onclick={() => restyle({ tab: n })}>{n}</button>
              {/each}
            </div>
          </div>
          <label class="field">
            <span>{t("code.fromFile")}</span>
            <select class="select input mono" value={listing.file ?? ""} onchange={(e) => chooseFile(e.currentTarget.value)}>
              <option value="">{t("code.typedHere")}</option>
              {#if listing.file && !files.includes(listing.file)}<option value={listing.file}>{listing.file}</option>{/if}
              {#each files as f (f)}<option value={f}>{f}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span>{t("code.options")}</span>
            <input class="input mono" bind:value={listing.options} placeholder="firstnumber=10" />
          </label>
        {/snippet}
        <FoldSection id="look" title={t("code.style")} bind:open={advanced} advanced={more}>
          <div class="themes" role="radiogroup" aria-label={t("code.style")}>
            {#each CODE_THEMES as theme (theme)}
              <button class="theme" class:active={style.theme === theme} role="radio" aria-checked={style.theme === theme} data-theme={theme} title={t(`code.theme.${theme}Hint`)} onclick={() => restyle({ theme })}>
                <span class="sample mono" aria-hidden="true"><b>def</b> f(x):<br />&nbsp;&nbsp;<i># …</i><br />&nbsp;&nbsp;<b>return</b> <u>"a"</u></span>
                <span class="name">{t(`code.theme.${theme}`)}</span>
              </button>
            {/each}
          </div>
          {#if had?.edited && !styled}<span class="faint small">{t("code.styleEdited")}</span>{/if}
          <div class="checks">
            <label class="check"><input type="checkbox" checked={style.numbers} onchange={(e) => restyle({ numbers: e.currentTarget.checked })} />{t("code.numbers")}</label>
            <label class="check"><input type="checkbox" checked={style.wrap} onchange={(e) => restyle({ wrap: e.currentTarget.checked })} />{t("code.wrapLines")}</label>
            <label class="check"><input type="checkbox" checked={style.frame} onchange={(e) => restyle({ frame: e.currentTarget.checked })} />{t("code.frame")}</label>
          </div>
          <div class="field">
            <span>{t("code.size")}</span>
            <div class="segmented" role="radiogroup" aria-label={t("code.size")}>
              {#each CODE_SIZES as size (size)}
                <button class:active={style.size === size} role="radio" aria-checked={style.size === size} onclick={() => restyle({ size })}>{t(`code.size.${size}`)}</button>
              {/each}
            </div>
          </div>
        </FoldSection>

        <label class="field">
          <span>{t("image.caption")}</span>
          <input class="input" bind:value={listing.caption} placeholder={t("image.optional")} />
        </label>
        {#if listing.caption.trim() || listing.label}
          <label class="field">
            <span>{t("image.label")}</span>
            <input class="input mono" bind:value={listing.label} oninput={() => (labelEdited = true)} />
          </label>
        {/if}

        <div class="preview-box">
          <div class="preview-bar">
            <span class="section-title">{t("tikz.latexRendering")}</span>
            <div class="spacer"></div>
            {#if compiling}<span class="spinner"></span>{:else if error}<span class="status err"><Icon name="alert-circle" size={13} />{error.message.split("\n")[0].slice(0, 60)}</span>{/if}
          </div>
          {#if ready && !failure}
            <PdfPreview pdf={outcome?.pdf ?? null} {revision} maxScale={3} />
          {:else}
            <p class="faint empty">{failure ?? t("code.previewHint")}</p>
          {/if}
        </div>

        <button class="btn primary large" disabled={!ready || busy} onclick={write}>
          {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
          {edit ? t("image.update") : t("code.insert")}
        </button>
      </aside>
    {/if}
  </div>
</Modal>

<style>
  .code-studio {
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
  .left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .language {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .language .select {
    width: 190px;
  }
  .small {
    font-size: 12px;
  }
  .source {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--editor-bg);
    color: var(--text);
    font-size: 12.5px;
    line-height: 1.5;
    tab-size: 4;
    resize: none;
    overflow: auto;
    white-space: pre;
    outline: none;
  }
  textarea.source:focus {
    border-color: var(--accent);
  }
  .source.from-file {
    color: var(--text-muted);
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }
  .note {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--text-muted);
  }
  .note.warn {
    color: var(--warning);
  }
  .right {
    width: 360px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding: 14px 16px;
    border-left: 1px solid var(--border);
    overflow: auto;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 5px 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .theme.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  /* A theme as it looks on paper. */
  .sample {
    padding: 5px 6px;
    border-radius: 3px;
    background: #f5f5f5;
    color: #111;
    font-size: 9px;
    line-height: 1.45;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
  }
  .sample b {
    color: #00004d;
  }
  .sample i {
    color: #2b662b;
  }
  .sample u {
    color: #a63a3a;
    text-decoration: none;
  }
  [data-theme="plain"] .sample {
    background: #fff;
  }
  [data-theme="plain"] .sample b,
  [data-theme="plain"] .sample u {
    color: #111;
  }
  [data-theme="plain"] .sample i {
    color: #666;
  }
  [data-theme="dark"] .sample {
    background: #1f1f1f;
    color: #fff;
  }
  [data-theme="dark"] .sample b {
    color: #73e6e6;
  }
  [data-theme="dark"] .sample i {
    color: #80c080;
  }
  [data-theme="dark"] .sample u {
    color: #ffb45a;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
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
    height: 28px;
    padding: 0 10px;
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
  .segmented button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .preview-box {
    flex: 1 0 200px;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .preview-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    font-size: 12px;
  }
  .preview-box :global(.preview) {
    flex: 1;
    min-height: 0;
  }
  .status.err {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--error);
    min-width: 0;
  }
  .empty {
    margin: 0;
    padding: 4px 10px 10px;
    font-size: 12px;
    line-height: 1.5;
  }
</style>
