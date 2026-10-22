<script lang="ts">
  // The title page of the document: what it says in a few fields, one of a
  // few layouts shown as pictures, the page compiled next to them, and the
  // code written in the main file (in place of the title it had).
  import { onMount } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { type PagePreview, readClass } from "$lib/layout";
  import { preambleEnd } from "$lib/preamble";
  import { editor } from "$lib/state/editor.svelte";
  import { bringPicture } from "$lib/state/pictures";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { emptyTitlePage, isBeamer, readTitlePage, TITLE_STYLES, titleCode, type TitleKind, type TitlePage, titlePreview, type TitleStyle, TODAY, writeTitlePage } from "$lib/titlepage";
  import { basename, debounce } from "$lib/utils";
  import FoldSection from "../common/FoldSection.svelte";
  import Icon from "../common/Icon.svelte";
  import LengthField from "../common/LengthField.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const path = editor.active ?? project.info?.main ?? null;
  const lang = i18n.lang === "fr" ? "fr" : "en";

  let root = $state<string | null>(null);
  let source = $state<string | null>(null);
  let missing = $state(false);
  /** The document was read: the fields show what it has (nothing typed before is overwritten). */
  let loaded = $state(false);
  let page = $state<TitlePage>(emptyTitlePage(lang));
  /** What the document had when the window opened. */
  let had = $state<TitleKind>("none");
  let beamer = $state(false);
  const open = $state({ text: false, institution: false });

  // Lists are typed one name per line.
  let authors = $state("");
  let supervisors = $state("");
  const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
  $effect(() => {
    page.authors = lines(authors);
  });
  $effect(() => {
    page.supervisors = lines(supervisors);
  });

  let dateKind = $state<"today" | "none" | "other">("today");
  let dateText = $state("");
  $effect(() => {
    page.date = dateKind === "today" ? TODAY : dateKind === "none" ? "" : dateText;
  });

  onMount(async () => {
    const found = path ? await editor.rootSource(path) : null;
    if (!found || preambleEnd(found.text) >= found.text.length) {
      missing = true;
      return;
    }
    root = found.root;
    source = found.text;
    beamer = isBeamer(found.text);
    const read = readTitlePage(found.text, lang);
    had = read.kind;
    const p = read.page;
    if (read.kind === "none") {
      // A long document opens on a page of its own; a short one keeps the title above its text.
      p.style = ["report", "book", "memoir", "scrreprt", "scrbook"].includes(readClass(found.text).name) ? "centered" : "classic";
      p.title = project.info?.name ?? "";
    }
    if (beamer) p.style = "classic";
    authors = p.authors.join("\n");
    supervisors = p.supervisors.join("\n");
    dateKind = p.date.trim() === TODAY ? "today" : p.date.trim() ? "other" : "none";
    dateText = dateKind === "other" ? p.date : "";
    page = p;
    loaded = true;
  });

  const classic = $derived(page.style === "classic" || beamer);
  const ready = $derived(!!page.title.trim());
  const code = $derived(titleCode(page, lang, beamer));

  // ------------------------------------------------------------- the preview

  const previewText = $derived(source !== null && ready ? titlePreview(source, $state.snapshot(page) as TitlePage, lang) : null);
  let outcome = $state<PagePreview | null>(null);
  let compiling = $state(false);
  let revision = $state(0);
  let failure = $state<string | null>(null);
  let running = 0;
  const schedule = debounce(() => void compile(), 600);

  $effect(() => {
    void previewText;
    schedule();
    // Closed before the preview was due: nothing is compiled for it.
    return () => schedule.cancel();
  });

  async function compile() {
    const text = previewText;
    if (!root || text === null) {
      outcome = null;
      failure = null;
      return;
    }
    const my = ++running;
    compiling = true;
    try {
      const result = await ipc.previewPage({ path: root, job: "title", source: text });
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

  // ----------------------------------------------------------------- the logo

  async function pickLogo() {
    if (!root) return;
    const file = await openDialog({ filters: [{ name: t("title.logo"), extensions: ["png", "jpg", "jpeg", "pdf"] }] }).catch(() => null);
    // A logo from elsewhere on the computer is copied into the project first.
    if (typeof file === "string") page.logo = await bringPicture(file, root, source ?? "");
  }

  /** Colours xcolor knows by name, as they look. */
  const ACCENTS: [string, string][] = [
    ["", "#1c1c1c"],
    ["gray", "#808080"],
    ["blue", "#0000ff"],
    ["teal", "#008080"],
    ["violet", "#800080"],
    ["red", "#ff0000"],
    ["orange", "#ff8000"],
  ];

  // --------------------------------------------------------------- the writing

  async function write() {
    if (!ready) return;
    const wanted = $state.snapshot(page) as TitlePage;
    const done = await editor.transformRoot((text) => writeTitlePage(text, wanted, lang), path);
    if (!done) {
      ui.toast("warning", t("layout.noPreamble"));
      return;
    }
    ui.toast("success", t(had === "none" ? "title.written" : "title.updated", { file: basename(done) }));
    ui.closeOverlay();
  }

  const STYLE_LABEL: Record<TitleStyle, "title.style.classic" | "title.style.centered" | "title.style.report" | "title.style.modern"> = {
    classic: "title.style.classic",
    centered: "title.style.centered",
    report: "title.style.report",
    modern: "title.style.modern",
  };
</script>

<Modal title={t("title.title")} icon="type" width="min(1120px, 96vw)" height="min(780px, 94vh)">
  {#if missing}
    <div class="empty whole">{t("layout.noPreamble")}</div>
  {:else if !loaded}
    <div class="empty whole"><span class="spinner"></span></div>
  {:else}
    <div class="studio title-studio">
      <section class="left">
        <div class="form">
        {#if !beamer}
          <div class="styles" role="radiogroup" aria-label={t("title.layout")}>
            {#each TITLE_STYLES as s (s)}
              <button class="style" class:active={page.style === s} role="radio" aria-checked={page.style === s} data-style={s} onclick={() => (page.style = s)}>
                <svg viewBox="0 0 44 60" aria-hidden="true">
                  <rect class="sheet" x="1" y="1" width="42" height="58" rx="2.5" />
                  {#if s === "classic"}
                    <rect class="strong" x="11" y="12" width="22" height="3" rx="1" />
                    <rect class="soft" x="15" y="18" width="14" height="1.6" rx="0.8" />
                    <rect class="soft" x="17" y="22" width="10" height="1.6" rx="0.8" />
                    <rect class="faint-line" x="7" y="31" width="30" height="1.2" />
                    <rect class="faint-line" x="7" y="35" width="30" height="1.2" />
                    <rect class="faint-line" x="7" y="39" width="30" height="1.2" />
                    <rect class="faint-line" x="7" y="43" width="22" height="1.2" />
                  {:else if s === "centered"}
                    <rect class="soft" x="15" y="8" width="14" height="1.6" rx="0.8" />
                    <rect class="rule" x="7" y="20" width="30" height="0.9" />
                    <rect class="strong" x="10" y="23.5" width="24" height="3.2" rx="1" />
                    <rect class="rule" x="7" y="29.5" width="30" height="0.9" />
                    <rect class="soft" x="16" y="37" width="12" height="1.6" rx="0.8" />
                    <rect class="soft" x="18" y="51" width="8" height="1.4" rx="0.7" />
                  {:else if s === "report"}
                    <rect class="soft" x="6" y="7" width="7" height="7" rx="1.5" />
                    <rect class="soft" x="24" y="8" width="14" height="1.6" rx="0.8" />
                    <rect class="soft" x="28" y="11.5" width="10" height="1.4" rx="0.7" />
                    <rect class="rule" x="7" y="22" width="30" height="0.9" />
                    <rect class="strong" x="10" y="25.5" width="24" height="3.2" rx="1" />
                    <rect class="rule" x="7" y="31.5" width="30" height="0.9" />
                    <rect class="soft" x="6" y="41" width="11" height="1.6" rx="0.8" />
                    <rect class="soft" x="27" y="41" width="11" height="1.6" rx="0.8" />
                    <rect class="soft" x="18" y="52" width="8" height="1.4" rx="0.7" />
                  {:else}
                    <rect class="rule" x="7" y="7" width="1.6" height="46" />
                    <rect class="strong" x="12" y="15" width="22" height="3.4" rx="1" />
                    <rect class="strong" x="12" y="20.5" width="14" height="3.4" rx="1" />
                    <rect class="soft" x="12" y="29" width="16" height="1.6" rx="0.8" />
                    <rect class="soft" x="12" y="36" width="11" height="1.6" rx="0.8" />
                    <rect class="soft" x="12" y="50" width="13" height="1.4" rx="0.7" />
                  {/if}
                </svg>
                <span>{t(STYLE_LABEL[s])}</span>
              </button>
            {/each}
          </div>
        {/if}

        <FoldSection id="text" title={t("title.text")} bind:open={open.text}>
          <label class="field">
            <span>{t("title.titleField")}</span>
            <input class="input" bind:value={page.title} placeholder={t("title.titlePlaceholder")} />
          </label>
          <label class="field">
            <span>{t("title.subtitle")}</span>
            <input class="input" bind:value={page.subtitle} />
          </label>
          <label class="field">
            <span>{t("title.authors")}</span>
            <textarea class="input" rows="2" bind:value={authors} placeholder={t("title.onePerLine")}></textarea>
          </label>
          <div class="field">
            <span>{t("title.date")}</span>
            <div class="date">
              <div class="segment" role="group" aria-label={t("title.date")}>
                <button class:active={dateKind === "today"} onclick={() => (dateKind = "today")}>{t("title.dateToday")}</button>
                <button class:active={dateKind === "none"} onclick={() => (dateKind = "none")}>{t("title.dateNone")}</button>
                <button class:active={dateKind === "other"} onclick={() => (dateKind = "other")}>{t("title.dateOther")}</button>
              </div>
              {#if dateKind === "other"}<input class="input" bind:value={dateText} placeholder={t("title.datePlaceholder")} />{/if}
            </div>
          </div>
        </FoldSection>

        {#if !classic || beamer}
          <FoldSection id="institution" title={t("title.for")} bind:open={open.institution} advanced={beamer ? undefined : more}>
            <label class="field">
              <span>{t("title.institution")}</span>
              <input class="input" bind:value={page.institution} placeholder={t("title.institutionPlaceholder")} />
            </label>
            {#if !beamer}
              <label class="field">
                <span>{t("title.department")}</span>
                <input class="input" bind:value={page.department} placeholder={t("title.departmentPlaceholder")} />
              </label>
              <label class="field">
                <span>{t("title.kind")}</span>
                <input class="input" bind:value={page.kind} placeholder={t("title.kindPlaceholder")} />
              </label>
              <label class="field">
                <span>{t("title.supervisors")}</span>
                <textarea class="input" rows="2" bind:value={supervisors} placeholder={t("title.onePerLine")}></textarea>
              </label>
              <div class="field">
                <span>{t("title.logo")}</span>
                <div class="file">
                  <input class="input mono" bind:value={page.logo} placeholder="images/logo.png" spellcheck="false" />
                  <button class="btn" onclick={pickLogo}><Icon name="folder-open" size={13} />{t("title.choose")}</button>
                </div>
              </div>
            {/if}
          </FoldSection>
        {/if}

        {#snippet more()}
          <div class="pair">
            <LengthField value={page.logoWidth} unit="cm" label={t("title.logoWidth")} onchange={(v) => (page.logoWidth = v)} />
            <label class="field">
              <span>{t("title.supervisorLabel")}</span>
              <input class="input" bind:value={page.supervisorLabel} />
            </label>
          </div>
          <div class="field">
            <span>{t("title.accent")}</span>
            <div class="swatches" role="radiogroup" aria-label={t("title.accent")}>
              {#each ACCENTS as [name, colour] (name)}
                <button class="swatch" class:active={page.accent === name} role="radio" aria-checked={page.accent === name} title={name || t("title.accentBlack")} aria-label={name || t("title.accentBlack")} style:--c={colour} onclick={() => (page.accent = name)}></button>
              {/each}
              <input class="input small mono" bind:value={page.accent} placeholder="black" spellcheck="false" />
            </div>
          </div>
        {/snippet}

        <details class="code-fold">
          <summary>{t("title.code")}</summary>
          <pre class="code selectable">{code}</pre>
        </details>

        {#if had === "foreign"}
          <div class="warn-box"><Icon name="alert-triangle" size={14} /><span>{t("title.foreign")}</span></div>
        {/if}
        </div>

        <div class="buttons">
          <button class="btn" onclick={() => ui.closeOverlay()}>{t("common.cancel")}</button>
          <button class="btn primary" disabled={!ready} onclick={write}><Icon name="check" size={14} />{t(had === "none" ? "title.write" : "title.update")}</button>
        </div>
      </section>

      <section class="right">
        <h3>{t("title.preview")}</h3>
        <div class="preview-box">
          {#if outcome?.pdf}
            <PdfPreview pdf={outcome.pdf} {revision} maxScale={1.4} whole />
          {:else if !compiling}
            <div class="empty">{failure ?? (error ? "" : ready ? t("layout.previewWaits") : t("title.needsTitle"))}</div>
          {/if}
          {#if compiling}<div class="busy"><span class="spinner"></span></div>{/if}
        </div>
        {#if error}
          <div class="error-box">
            <strong>{error.hint?.title ?? error.message}</strong>
            {#if error.hint?.advice}<span>{error.hint.advice}</span>{:else if error.hint?.explanation}<span>{error.hint.explanation}</span>{/if}
            {#if error.hint && error.hint.title !== error.message}<span class="mono faint">{error.message}</span>{/if}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</Modal>

<style>
  .studio {
    display: grid;
    grid-template-columns: minmax(380px, 5fr) minmax(320px, 5fr);
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .left {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .form,
  .right {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 14px 18px 16px;
    overflow: auto;
  }
  .form {
    flex: 1;
  }
  .right {
    border-left: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .right h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
  }
  .styles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    flex-shrink: 0;
  }
  .style {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 9px 6px 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .style:hover {
    background: var(--bg-hover);
  }
  .style.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }
  .style svg {
    width: 44px;
    height: 60px;
  }
  .sheet {
    fill: #fff;
    stroke: var(--border-strong);
    stroke-width: 1;
  }
  .strong {
    fill: #2b2540;
  }
  .soft {
    fill: #9d97b3;
  }
  .faint-line {
    fill: #d6d2e4;
  }
  .rule {
    fill: #6a3ce0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .field .input {
    width: 100%;
  }
  textarea.input {
    height: auto;
    min-height: 52px;
    padding-top: 6px;
    padding-bottom: 6px;
    resize: vertical;
    line-height: 1.5;
    font-family: inherit;
  }
  .date {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .date .input {
    flex: 1;
    min-width: 0;
  }
  .segment {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: var(--radius);
    background: var(--bg-input);
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
  .segment button {
    padding: 4px 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .segment button:hover {
    color: var(--text);
  }
  .segment button.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .file {
    display: flex;
    gap: 6px;
  }
  .file .input {
    flex: 1;
    min-width: 0;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 10px;
  }
  .swatches {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 2px solid var(--bg-elev);
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 1px var(--border-strong);
    cursor: pointer;
  }
  .swatch.active {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .swatches .input {
    width: 110px;
    margin-left: 6px;
  }
  .code-fold {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .code-fold summary {
    cursor: pointer;
    padding: 2px 0;
  }
  .code {
    margin: 6px 0 0;
    padding: 10px 12px;
    max-height: 220px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre;
    color: var(--text);
  }
  /* The buttons stay in sight while the fields scroll. */
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 18px 12px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .preview-box {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    overflow: hidden;
  }
  .preview-box :global(.preview) {
    flex: 1;
    min-width: 0;
  }
  .empty {
    margin: auto;
    padding: 0 24px;
    text-align: center;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .empty.whole {
    flex: 1;
    display: grid;
    place-items: center;
  }
  .busy {
    position: absolute;
    top: 10px;
    left: 10px;
  }
  .error-box,
  .warn-box {
    display: flex;
    gap: 8px;
    padding: 9px 11px;
    border-radius: var(--radius);
    font-size: 12px;
    line-height: 1.45;
    flex-shrink: 0;
  }
  .error-box {
    flex-direction: column;
    gap: 3px;
    border: 1px solid color-mix(in srgb, var(--error) 45%, transparent);
    background: color-mix(in srgb, var(--error) 9%, transparent);
  }
  .warn-box {
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
    background: color-mix(in srgb, var(--warning) 9%, transparent);
    color: var(--text);
  }
</style>
