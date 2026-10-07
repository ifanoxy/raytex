<script lang="ts">
  // The page studio: the margins of the document and its page styles
  // (header, footer, rules, watermark) are set with fields, and seen on
  // real pages compiled with the class and the preamble of the project
  // before anything is written. A style is then given to the whole
  // document, to the pages that open, from the cursor on, to one page or
  // to pages by their numbers.
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { onMount, tick } from "svelte";
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import {
    addRange,
    BUILTIN_STYLES,
    emptyStyle,
    ensureGeometry,
    fromPt,
    geometryCode,
    headHeightAsked,
    imageWatermark,
    MARGIN_PRESETS,
    type MarginPreset,
    type Margins,
    marginsSample,
    type Metrics,
    metrics,
    newGeometryCode,
    type PagePreview,
    type PageStyle,
    PAPERS,
    previewSource,
    readClass,
    readMargins,
    readStyles,
    readUse,
    removeRange,
    removeStyle,
    saveStyle,
    setHeadHeight,
    shownLength,
    SLOT_FIELDS,
    type Slots,
    styleCode,
    styleSample,
    type StyleUse,
    textWatermark,
    toPt,
    type Unit,
    UNITS,
    useOpening,
    useStyle,
    validStyleName,
    writeMargins,
  } from "$lib/layout";
  import { preambleEnd } from "$lib/preamble";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { basename, debounce, dirname, relative } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import LengthField from "../common/LengthField.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const path = editor.active ?? project.info?.main ?? null;
  const lang = i18n.lang === "fr" ? "fr" : "en";

  let tab = $state<"margins" | "styles">(ui.layoutTab);
  let root = $state<string | null>(null);
  /** The root document as the editor has it. */
  let source = $state<string | null>(null);
  let missing = $state(false);

  let margins = $state<Margins | null>(null);
  let unit = $state<Unit>("cm");
  let styles = $state<PageStyle[]>([]);
  let use = $state<StyleUse>({ document: null, opening: null, ranges: [] });
  /** The style being edited: one of the document, or a new one. */
  let style = $state<PageStyle | null>(null);
  let isNew = $state(false);
  let markKind = $state<"none" | "text" | "image">("none");

  const cls = $derived(source === null ? null : readClass(source));

  function read(text: string) {
    source = text;
    margins = readMargins(text);
    styles = readStyles(text);
    use = readUse(text);
    const kept = style && styles.find((s) => s.name === style!.name);
    if (kept) edit(kept);
    else if (!style || !isNew) {
      if (styles.length) edit(styles[0]);
      else style = null;
    }
  }

  function edit(s: PageStyle) {
    style = structuredClone($state.snapshot(s)) as PageStyle;
    isNew = false;
    markKind = s.watermark ? (s.watermark.image ? "image" : "text") : "none";
  }

  onMount(async () => {
    const found = path ? await editor.rootSource(path) : null;
    if (!found || preambleEnd(found.text) >= found.text.length) {
      missing = true;
      return;
    }
    root = found.root;
    read(found.text);
    // The unit the document already uses.
    const written = margins && [margins.top, margins.left, margins.bottom, margins.right].find((v) => toPt(v) !== null);
    const used = written ? /[a-z]+$/.exec(written.trim())?.[0] : null;
    if (used && (UNITS as string[]).includes(used)) unit = used as Unit;
  });

  // ------------------------------------------------------------- the preview

  const marginsCode = $derived(margins && cls ? geometryCode(margins, cls) : "");
  const pagesCode = $derived(margins ? newGeometryCode(margins) : "");
  const nameTaken = $derived(!!style && isNew && (BUILTIN_STYLES.includes(style.name) || styles.some((s) => s.name === style!.name)));
  const styleReady = $derived(!!style && validStyleName(style.name) && !nameTaken);

  /** The document the preview compiles: the preamble with what is being set, and sample pages. */
  const previewText = $derived.by(() => {
    if (source === null) return null;
    if (tab === "margins") return margins ? previewSource(writeMargins(source, margins), marginsSample(lang), "\\usepackage{showframe}\n") : null;
    return style && styleReady ? previewSource(saveStyle(source, style), styleSample(style.name, lang)) : null;
  });

  let outcome = $state<PagePreview | null>(null);
  let measured = $state<Metrics | null>(null);
  let compiling = $state(false);
  let revision = $state(0);
  let failure = $state<string | null>(null);
  let running = 0;
  const schedule = debounce(() => void compile(), 500);

  $effect(() => {
    void previewText;
    schedule();
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
      const result = await ipc.previewPage({ path: root, job: "layout", source: text });
      if (my !== running) return;
      outcome = result;
      measured = metrics(result.measures) ?? measured;
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
  /** fancyhdr asks for a taller header than the page gives it. */
  const headAsked = $derived(outcome?.diagnostics.map((d) => headHeightAsked(d.message)).find((h) => !!h) ?? null);

  /** A length TeX measured, in the unit of the window, for a field left empty. */
  function auto(pt: number | undefined): string {
    return pt === undefined ? "" : shownLength(fromPt(pt, unit), unit);
  }

  // --------------------------------------------------------------- the edits

  /** Rewrites the preamble of the root document, and reads it again. */
  async function change(transform: (text: string) => string): Promise<string | null> {
    const done = await editor.transformRoot(transform, path);
    if (!done) {
      ui.toast("warning", t("layout.noPreamble"));
      return null;
    }
    const text = editor.textOf(done);
    if (text !== null) read(text);
    return done;
  }

  const canInsert = $derived(!!editor.view && !editor.view.state.readOnly && editor.activeTab?.kind === "tex");

  /** Writes a line at the cursor of the document that was being edited. */
  function insertHere(code: string) {
    ui.closeOverlay();
    editor.insertOwnLine(code);
    editor.focus();
  }

  // ----------------------------------------------------------------- margins

  function setMargin<K extends keyof Margins>(key: K, value: Margins[K]) {
    if (margins) margins[key] = value;
  }

  function preset(p: MarginPreset | null) {
    if (!margins) return;
    const to = (length: string) => (p ? fromPt(toPt(length)!, unit) : "");
    margins.top = to(p?.top ?? "");
    margins.bottom = to(p?.bottom ?? "");
    margins.left = to(p?.left ?? "");
    margins.right = to(p?.right ?? "");
  }

  const activePreset = $derived.by(() => {
    const m = margins;
    if (!m) return null;
    const same = (a: string, b: string) => {
      const [x, y] = [toPt(a), toPt(b)];
      return x !== null && y !== null && Math.abs(x - y) < 0.3;
    };
    if (![m.top, m.bottom, m.left, m.right].some((v) => v.trim())) return "default";
    return MARGIN_PRESETS.find((p) => same(m.top, p.top) && same(m.bottom, p.bottom) && same(m.left, p.left) && same(m.right, p.right))?.id ?? null;
  });

  let applying = $state(false);

  async function applyMargins() {
    const m = margins;
    if (!m || applying) return;
    applying = true;
    try {
      const done = await change((text) => writeMargins(text, $state.snapshot(m) as Margins));
      if (done) ui.toast("success", t("layout.marginsApplied", { file: basename(done) }));
    } finally {
      applying = false;
    }
  }

  async function marginsFromHere() {
    const code = pagesCode;
    if (!code || !(await change(ensureGeometry))) return;
    insertHere(code);
    ui.toast("info", t("layout.marginsFromHereDone"));
  }

  // ------------------------------------------------------------- page styles

  function newStyle() {
    const base = lang === "fr" ? "perso" : "custom";
    let name = base;
    for (let i = 0; BUILTIN_STYLES.includes(name) || styles.some((s) => s.name === name); i++) name = base + String.fromCharCode(98 + i);
    style = emptyStyle(name);
    isNew = true;
    markKind = "none";
  }

  function setMark(kind: "none" | "text" | "image") {
    if (!style) return;
    markKind = kind;
    style.watermark = kind === "none" ? null : kind === "text" ? textWatermark(t("layout.markSample")) : imageWatermark("");
  }

  async function chooseImage() {
    if (!style?.watermark || !root) return;
    const file = await openDialog({ filters: [{ name: t("layout.markImage"), extensions: ["png", "jpg", "jpeg", "pdf"] }] }).catch(() => null);
    if (typeof file === "string") style.watermark.image = relative(dirname(root), file);
  }

  /** The field of a header or a footer that has the cursor: where a chip writes. */
  let slotInput: HTMLInputElement | null = null;
  let slotOf: { part: "head" | "foot"; slot: keyof Slots } | null = null;

  async function insertField(code: string) {
    if (!style || !slotOf || !slotInput) return;
    const { part, slot } = slotOf;
    const value = style[part][slot];
    const from = slotInput.selectionStart ?? value.length;
    const to = slotInput.selectionEnd ?? from;
    style[part][slot] = value.slice(0, from) + code + value.slice(to);
    // Inside the braces of what takes a text.
    const caret = from + code.length - (code.endsWith("{}") ? 1 : 0);
    const input = slotInput;
    // Once the field shows its new text.
    await tick();
    input.focus();
    input.setSelectionRange(caret, caret);
  }

  /** The style as it is now, written in the preamble (with what it needs) before it is used. */
  const saved = (text: string) => (style ? saveStyle(text, $state.snapshot(style) as PageStyle) : text);

  async function saveNow() {
    if (!style || !styleReady) return;
    const name = style.name;
    const done = await change(saved);
    if (done) ui.toast("success", t("layout.styleSaved", { name, file: basename(done) }));
  }

  async function toggleDocument() {
    if (!style || !styleReady) return;
    const name = style.name;
    const on = use.document !== name;
    if (await change((text) => useStyle(saved(text), on ? name : null))) ui.toast("success", t(on ? "layout.usedDocument" : "layout.unusedDocument", { name }));
  }

  async function toggleOpening() {
    if (!style || !styleReady) return;
    const name = style.name;
    const on = use.opening !== name;
    if (await change((text) => useOpening(saved(text), on ? name : null))) ui.toast("success", t(on ? "layout.usedOpening" : "layout.unusedOpening", { name }));
  }

  async function useHere(command: "pagestyle" | "thispagestyle") {
    if (!style || !styleReady) return;
    const name = style.name;
    if (await change(saved)) insertHere(`\\${command}{${name}}`);
  }

  let rangeFrom = $state(1);
  let rangeTo = $state(1);
  const rangeValid = $derived(Number.isInteger(rangeFrom) && Number.isInteger(rangeTo) && rangeFrom >= 1 && rangeTo >= rangeFrom);

  async function addPages() {
    if (!style || !styleReady || !rangeValid) return;
    const r = { from: rangeFrom, to: rangeTo, name: style.name };
    if (await change((text) => addRange(saved(text), r))) ui.toast("success", t(r.from === r.to ? "layout.usedPage" : "layout.usedPages", r));
  }

  async function deleteStyle() {
    if (!style) return;
    const name = style.name;
    if (isNew) {
      style = null;
      isNew = false;
      if (styles.length) edit(styles[0]);
      return;
    }
    style = null;
    if (await change((text) => removeStyle(text, name))) ui.toast("info", t("layout.styleRemoved", { name }));
  }

  const SLOTS: (keyof Slots)[] = ["left", "center", "right"];
  const COLORS = ["black", "red", "blue", "teal", "orange", "purple"];
</script>

{#snippet lengthOf(key: "top" | "bottom" | "left" | "right" | "bindingOffset" | "headHeight" | "headSep" | "footSkip" | "marginParWidth" | "marginParSep" | "paperWidth" | "paperHeight", label: string, placeholder: string, title?: string)}
  {#if margins}
    <LengthField value={margins[key]} {unit} {label} {placeholder} {title} onchange={(v) => setMargin(key, v)} />
  {/if}
{/snippet}

<Modal title={t("layout.title")} icon="margins" width="min(1180px, 96vw)" height="min(800px, 94vh)">
  <div class="studio">
    <section class="left">
      <div class="tabs" role="tablist">
        <button class="tab" class:active={tab === "margins"} role="tab" aria-selected={tab === "margins"} onclick={() => (tab = "margins")}><Icon name="margins" size={14} />{t("layout.tabMargins")}</button>
        <button class="tab" class:active={tab === "styles"} role="tab" aria-selected={tab === "styles"} onclick={() => (tab = "styles")}><Icon name="page-style" size={14} />{t("layout.tabStyles")}</button>
      </div>

      {#if missing}
        <div class="empty">{t("layout.noPreamble")}</div>
      {:else if tab === "margins" && margins}
        <p class="tip faint">{t("layout.marginsTip")}</p>

        <div class="chips" role="group" aria-label={t("layout.presets")}>
          <button class="chip" class:active={activePreset === "default"} onclick={() => preset(null)} title={t("layout.presetDefaultTitle")}>{t("layout.preset.default")}</button>
          {#each MARGIN_PRESETS as p (p.id)}
            <button class="chip" class:active={activePreset === p.id} onclick={() => preset(p)}>{t(`layout.preset.${p.id}`)}</button>
          {/each}
        </div>

        <div class="paper">
          <label class="field">
            <span>{t("layout.paper")}</span>
            <select class="select input small" value={margins.paper} onchange={(e) => setMargin("paper", e.currentTarget.value)}>
              <option value="">{t("layout.paperOfClass")}</option>
              {#each PAPERS as p (p)}<option value={p}>{t(`layout.paper.${p}` as "layout.paper.a4paper")}</option>{/each}
              {#if margins.paper && margins.paper !== "custom" && !PAPERS.includes(margins.paper)}<option value={margins.paper}>{margins.paper}</option>{/if}
              <option value="custom">{t("layout.paperCustom")}</option>
            </select>
          </label>
          <div class="field">
            <span>{t("layout.orientation")}</span>
            <div class="segment" role="radiogroup" aria-label={t("layout.orientation")}>
              <button class:active={!margins.landscape} role="radio" aria-checked={!margins.landscape} onclick={() => setMargin("landscape", false)}>{t("layout.portrait")}</button>
              <button class:active={margins.landscape} role="radio" aria-checked={margins.landscape} onclick={() => setMargin("landscape", true)}>{t("layout.landscape")}</button>
            </div>
          </div>
          <div class="field">
            <span>{t("layout.unit")}</span>
            <div class="segment" role="radiogroup" aria-label={t("layout.unit")}>
              {#each UNITS as u (u)}<button class:active={unit === u} role="radio" aria-checked={unit === u} onclick={() => (unit = u)}>{u}</button>{/each}
            </div>
          </div>
        </div>
        {#if margins.paper === "custom"}
          <div class="grid two">
            {@render lengthOf("paperWidth", t("layout.paperWidth"), auto(measured?.paperWidth))}
            {@render lengthOf("paperHeight", t("layout.paperHeight"), auto(measured?.paperHeight))}
          </div>
        {/if}
        <label class="check">
          <input type="checkbox" checked={margins.twoside} onchange={(e) => setMargin("twoside", e.currentTarget.checked)} />
          <span>{t("layout.twoside")}<em class="faint"> · {t("layout.twosideHint")}</em></span>
        </label>

        <div class="cross">
          <div class="c-top">{@render lengthOf("top", t("layout.top"), auto(measured?.top))}</div>
          <div class="c-left">{@render lengthOf("left", margins.twoside ? t("layout.inner") : t("layout.left"), auto(measured?.left))}</div>
          <div class="c-page" aria-hidden="true">
            {#if measured}
              {@const m = measured}
              <svg viewBox="0 0 {m.paperWidth} {m.paperHeight}" preserveAspectRatio="xMidYMid meet">
                <rect class="sheet" x="0" y="0" width={m.paperWidth} height={m.paperHeight} />
                <rect class="head" x={m.left} y={m.top - m.headSep - m.headHeight} width={m.textWidth} height={Math.max(m.headHeight, 4)} />
                <rect class="body" x={m.left} y={m.top} width={m.textWidth} height={m.textHeight} />
                <line class="foot" x1={m.left} y1={m.top + m.textHeight + m.footSkip} x2={m.left + m.textWidth} y2={m.top + m.textHeight + m.footSkip} />
                {#if m.marginParWidth > 0 && m.left + m.textWidth + m.marginParSep + m.marginParWidth <= m.paperWidth + 1}
                  <rect class="mpar" x={m.left + m.textWidth + m.marginParSep} y={m.top + m.textHeight * 0.18} width={m.marginParWidth} height={m.textHeight * 0.16} />
                {/if}
              </svg>
            {:else}
              <div class="sheet-wait"></div>
            {/if}
          </div>
          <div class="c-right">{@render lengthOf("right", margins.twoside ? t("layout.outer") : t("layout.right"), auto(measured?.right))}</div>
          <div class="c-bottom">{@render lengthOf("bottom", t("layout.bottom"), auto(measured?.bottom))}</div>
        </div>
        {#if measured}
          <p class="measure faint">
            {t("layout.measured", {
              text: `${auto(measured.textWidth)} × ${auto(measured.textHeight)} ${unit}`,
              paper: `${auto(measured.paperWidth)} × ${auto(measured.paperHeight)} ${unit}`,
            })}
          </p>
        {/if}

        <h3>{t("layout.headFoot")}</h3>
        <div class="grid three">
          {@render lengthOf("headHeight", t("layout.headHeight"), auto(measured?.headHeight), t("layout.headHeightTitle"))}
          {@render lengthOf("headSep", t("layout.headSep"), auto(measured?.headSep), t("layout.headSepTitle"))}
          {@render lengthOf("footSkip", t("layout.footSkip"), auto(measured?.footSkip), t("layout.footSkipTitle"))}
        </div>
        <div class="checks">
          <label class="check" title={t("layout.includeTitle")}>
            <input type="checkbox" checked={margins.includeHead} onchange={(e) => setMargin("includeHead", e.currentTarget.checked)} />
            <span>{t("layout.includeHead")}</span>
          </label>
          <label class="check" title={t("layout.includeTitle")}>
            <input type="checkbox" checked={margins.includeFoot} onchange={(e) => setMargin("includeFoot", e.currentTarget.checked)} />
            <span>{t("layout.includeFoot")}</span>
          </label>
        </div>

        <h3>{t("layout.bindingNotes")}</h3>
        <div class="grid three">
          {@render lengthOf("bindingOffset", t("layout.bindingOffset"), "0", t("layout.bindingOffsetTitle"))}
          {@render lengthOf("marginParWidth", t("layout.marginParWidth"), auto(measured?.marginParWidth))}
          {@render lengthOf("marginParSep", t("layout.marginParSep"), auto(measured?.marginParSep))}
        </div>

        <label class="field">
          <span>{t("layout.other")}<em class="faint"> · {t("layout.otherHint")}</em></span>
          <input class="input small mono" value={margins.other.join(", ")} placeholder="showframe, textwidth=15cm" spellcheck="false" onchange={(e) => setMargin("other", e.currentTarget.value.split(/,(?![^{]*\})/).map((o) => o.trim()).filter(Boolean))} />
        </label>

        <pre class="code selectable">{marginsCode || t("layout.marginsNone")}</pre>

        <div class="actions">
          <button class="btn" disabled={!canInsert} onclick={() => insertHere("\\restoregeometry")} title={t("layout.restoreHereTitle")}>{t("layout.restoreHere")}</button>
          <button class="btn" disabled={!canInsert || !pagesCode} onclick={marginsFromHere} title={t("layout.marginsFromHereTitle")}>{t("layout.fromHere")}</button>
          <button class="btn primary" disabled={applying} onclick={applyMargins}><Icon name="check" size={14} />{t("layout.applyDocument")}</button>
        </div>
      {:else if tab === "styles" && source !== null}
        <p class="tip faint">{t("layout.stylesTip")}</p>

        <div class="chips" class:hidden={!style && !styles.length} role="group" aria-label={t("layout.styles")}>
          {#each styles as s (s.name)}
            <button class="chip" class:active={!isNew && style?.name === s.name} onclick={() => edit(s)}>
              {s.name}{#if use.document === s.name}<span class="dot" title={t("layout.inDocument")}></span>{/if}
            </button>
          {/each}
          {#if isNew && style}<button class="chip active">{style.name || "…"}</button>{/if}
          <button class="chip add" onclick={newStyle}><Icon name="plus" size={12} />{t("layout.newStyle")}</button>
        </div>

        {#if !style}
          <div class="empty">
            <span>{t("layout.noStyle")}</span>
            <button class="btn primary" onclick={newStyle}><Icon name="plus" size={14} />{t("layout.newStyle")}</button>
          </div>
        {:else}
          {#if isNew}
            <label class="field">
              <span>{t("layout.styleName")}<em class="faint"> · {t("layout.styleNameHint")}</em></span>
              <input class="input small mono name" class:invalid={!styleReady} bind:value={style.name} spellcheck="false" autocomplete="off" />
            </label>
            {#if nameTaken}<div class="note problem"><Icon name="info" size={13} /><span>{t("layout.nameTaken", { name: style.name })}</span></div>
            {:else if !styleReady}<div class="note problem"><Icon name="info" size={13} /><span>{t("layout.nameInvalid")}</span></div>{/if}
          {/if}

          {#each ["head", "foot"] as const as part (part)}
            <h3>{t(part === "head" ? "layout.header" : "layout.footer")}</h3>
            <div class="grid three">
              {#each SLOTS as slot (slot)}
                <label class="field">
                  <span>{t(`layout.slot.${slot}`)}</span>
                  <input
                    class="input small mono"
                    bind:value={style[part][slot]}
                    spellcheck="false"
                    autocomplete="off"
                    data-slot="{part}-{slot}"
                    onfocus={(e) => {
                      slotInput = e.currentTarget;
                      slotOf = { part, slot };
                    }}
                  />
                </label>
              {/each}
            </div>
          {/each}
          <div class="chips small" role="group" aria-label={t("layout.fields")}>
            <span class="faint">{t("layout.fields")}</span>
            {#each SLOT_FIELDS as f (f.id)}
              <button class="chip" title={f.code} onmousedown={(e) => e.preventDefault()} onclick={() => insertField(f.code)}>{t(`layout.field.${f.id}`)}</button>
            {/each}
          </div>

          <div class="grid three">
            <LengthField value={style.headRule} unit="pt" label={t("layout.headRule")} placeholder="0" title={t("layout.ruleTitle")} onchange={(v) => (style!.headRule = v)} />
            <LengthField value={style.footRule} unit="pt" label={t("layout.footRule")} placeholder="0" title={t("layout.ruleTitle")} onchange={(v) => (style!.footRule = v)} />
            <label class="check mirror" title={t("layout.mirrorTitle")}>
              <input type="checkbox" bind:checked={style.mirror} />
              <span>{t("layout.mirror")}</span>
            </label>
          </div>

          <h3>{t("layout.watermark")}</h3>
          <div class="segment" role="radiogroup" aria-label={t("layout.watermark")}>
            <button class:active={markKind === "none"} role="radio" aria-checked={markKind === "none"} onclick={() => setMark("none")}>{t("layout.markNone")}</button>
            <button class:active={markKind === "text"} role="radio" aria-checked={markKind === "text"} onclick={() => setMark("text")}>{t("layout.markText")}</button>
            <button class:active={markKind === "image"} role="radio" aria-checked={markKind === "image"} onclick={() => setMark("image")}>{t("layout.markImage")}</button>
          </div>
          {#if style.watermark && markKind === "text"}
            <div class="grid mark">
              <label class="field wide">
                <span>{t("layout.markTextLabel")}</span>
                <input class="input small" bind:value={style.watermark.text} spellcheck="false" />
              </label>
              <label class="field">
                <span>{t("layout.markColor")}</span>
                <select class="select input small" bind:value={style.watermark.color}>
                  {#each COLORS as c (c)}<option value={c}>{t(`layout.color.${c}` as "layout.color.black")}</option>{/each}
                  {#if !COLORS.includes(style.watermark.color)}<option value={style.watermark.color}>{style.watermark.color}</option>{/if}
                </select>
              </label>
              <label class="field"><span>{t("layout.markStrength")} · {style.watermark.strength} %</span><input type="range" min="4" max="60" step="1" bind:value={style.watermark.strength} /></label>
              <label class="field"><span>{t("layout.markSize")} · ×{style.watermark.size}</span><input type="range" min="1" max="14" step="0.5" bind:value={style.watermark.size} /></label>
              <label class="field"><span>{t("layout.markAngle")} · {style.watermark.angle}°</span><input type="range" min="-90" max="90" step="5" bind:value={style.watermark.angle} /></label>
            </div>
          {:else if style.watermark && markKind === "image"}
            <div class="grid mark">
              <label class="field wide">
                <span>{t("layout.markFile")}</span>
                <span class="file">
                  <input class="input small mono" bind:value={style.watermark.image} placeholder="images/logo.png" spellcheck="false" />
                  <button class="btn small" onclick={chooseImage}>{t("layout.browse")}</button>
                </span>
              </label>
              <label class="field"><span>{t("layout.markWidth")} · {Math.round(style.watermark.size * 100)} %</span><input type="range" min="0.1" max="1" step="0.05" bind:value={style.watermark.size} /></label>
              <label class="field"><span>{t("layout.markAngle")} · {style.watermark.angle}°</span><input type="range" min="-90" max="90" step="5" bind:value={style.watermark.angle} /></label>
            </div>
          {/if}

          {#if styleReady}
            <pre class="code selectable">{styleCode(style)}</pre>

            <h3>{t("layout.useTitle", { name: style.name })}</h3>
            <div class="uses">
              <button class="btn small" class:on={use.document === style.name} onclick={toggleDocument} title={t("layout.useDocumentTitle")}>
                {#if use.document === style.name}<Icon name="check" size={13} />{/if}{t("layout.useDocument")}
              </button>
              <button class="btn small" class:on={use.opening === style.name} onclick={toggleOpening} title={t("layout.useOpeningTitle")}>
                {#if use.opening === style.name}<Icon name="check" size={13} />{/if}{t("layout.useOpening")}
              </button>
              <button class="btn small" disabled={!canInsert} onclick={() => useHere("pagestyle")} title={t("layout.useFromHereTitle")}>{t("layout.fromHere")}</button>
              <button class="btn small" disabled={!canInsert} onclick={() => useHere("thispagestyle")} title={t("layout.useThisPageTitle")}>{t("layout.useThisPage")}</button>
            </div>
            <div class="range">
              <span>{t("layout.pagesFrom")}</span>
              <input class="input small num" type="number" min="1" bind:value={rangeFrom} oninput={() => (rangeTo = Math.max(rangeTo, rangeFrom))} aria-label={t("layout.pagesFrom")} />
              <span>{t("layout.pagesTo")}</span>
              <input class="input small num" type="number" min="1" bind:value={rangeTo} aria-label={t("layout.pagesTo")} />
              <button class="btn small" disabled={!rangeValid} onclick={addPages} title={t("layout.pagesTitle")}>{t("layout.pagesApply")}</button>
            </div>
            {#if use.ranges.length}
              <div class="chips small">
                {#each use.ranges as r, i (i)}
                  <span class="chip static">
                    {r.from === r.to ? t("layout.rangeOne", { ...r }) : t("layout.rangeMany", { ...r })}
                    <button class="x" aria-label={t("common.delete")} title={t("common.delete")} onclick={() => change((text) => removeRange(text, i))}><Icon name="x" size={11} /></button>
                  </span>
                {/each}
              </div>
            {/if}
            <div class="chips small">
              <span class="faint">{t("layout.backHere")}</span>
              {#each ["plain", "empty", "headings"] as const as b (b)}
                <button class="chip" disabled={!canInsert} title={t(`layout.builtin.${b}`)} onclick={() => insertHere(`\\pagestyle{${b}}`)}>{b}</button>
              {/each}
            </div>
          {/if}

          <div class="actions">
            <button class="btn" onclick={deleteStyle}><Icon name="trash" size={14} />{t(isNew ? "common.cancel" : "layout.deleteStyle")}</button>
            <button class="btn primary" disabled={!styleReady} onclick={saveNow}><Icon name="check" size={14} />{t("layout.saveStyle")}</button>
          </div>
        {/if}
      {/if}
    </section>

    <section class="right">
      <h3>{t(tab === "margins" ? "layout.previewMargins" : "layout.previewStyle")}</h3>
      <div class="preview-box">
        {#if outcome?.pdf}
          <PdfPreview pdf={outcome.pdf} {revision} maxScale={1.1} />
        {:else if !compiling}
          <div class="empty">{failure ?? (error ? "" : t("layout.previewWaits"))}</div>
        {/if}
        {#if compiling}<div class="busy"><span class="spinner"></span></div>{/if}
      </div>
      {#if error}
        <div class="error-box">
          <strong>{error.hint?.title ?? error.message}</strong>
          {#if error.hint?.advice}<span>{error.hint.advice}</span>{:else if error.hint?.explanation}<span>{error.hint.explanation}</span>{/if}
          {#if error.hint && error.hint.title !== error.message}<span class="mono faint">{error.message}</span>{/if}
        </div>
      {:else if headAsked}
        <div class="warn-box">
          <span>{t("layout.headTooSmall", { height: headAsked })}</span>
          <button class="btn small" onclick={() => change((text) => setHeadHeight(text, headAsked))}>{t("layout.headFix", { height: headAsked })}</button>
        </div>
      {:else if outcome?.pdf}
        <div class="ok-line"><Icon name="check" size={13} />{t(tab === "margins" ? "layout.previewOkMargins" : "layout.previewOk", { engine: outcome.engine })}</div>
      {/if}
    </section>
  </div>
</Modal>

<style>
  .studio {
    display: grid;
    grid-template-columns: minmax(380px, 6fr) minmax(320px, 5fr);
    height: 100%;
    min-height: 0;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 14px 18px 16px;
    overflow: auto;
  }
  .right {
    border-left: 1px solid var(--border);
    background: var(--bg-panel);
  }
  h3 {
    margin: 6px 0 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
  }
  .right h3 {
    margin-top: 0;
  }
  .tabs,
  .segment {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: var(--radius);
    background: var(--bg-input);
    border: 1px solid var(--border);
  }
  /* The tabs and the buttons stay in sight while the fields scroll. */
  .tabs {
    position: sticky;
    top: -14px;
    z-index: 2;
    flex-shrink: 0;
    box-shadow: 0 -14px 0 0 var(--bg-elev), 0 6px 0 0 var(--bg-elev);
  }
  .tab,
  .segment button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .segment button {
    padding: 4px 8px;
    font-size: 11.5px;
  }
  .tab:hover,
  .segment button:hover {
    color: var(--text);
  }
  .tab.active,
  .segment button.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .tip,
  .measure {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
  }
  .measure {
    text-align: center;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }
  .chips.small {
    font-size: 11.5px;
  }
  .chips.hidden {
    display: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-input);
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .chip:hover:not(:disabled):not(.static) {
    color: var(--text);
    border-color: var(--accent);
  }
  .chip.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .chip.add {
    border-style: dashed;
  }
  .chip.static {
    cursor: default;
    padding-right: 4px;
  }
  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .chip .x {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .chip .x:hover {
    background: var(--bg-hover);
    color: var(--error);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
  }
  .paper {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.2fr) minmax(0, 1.2fr);
    gap: 10px;
    align-items: end;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .field em,
  .check em {
    font-style: normal;
  }
  .field .input,
  .field .select {
    width: 100%;
    min-width: 0;
  }
  .field input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
  }
  .name.invalid {
    border-color: var(--error);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .check.mirror {
    align-self: end;
    padding-bottom: 5px;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
  }
  .grid {
    display: grid;
    gap: 8px 10px;
  }
  .grid.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .grid.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .grid.mark {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .grid.mark .wide {
    grid-column: span 2;
  }
  .file {
    display: flex;
    gap: 6px;
  }
  /* The four margins around a drawing of the page. */
  .cross {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px minmax(0, 1fr);
    grid-template-areas:
      ". top ."
      "left page right"
      ". bottom .";
    gap: 8px 12px;
    align-items: center;
    padding: 4px 0;
  }
  .c-top {
    grid-area: top;
  }
  .c-bottom {
    grid-area: bottom;
  }
  .c-left {
    grid-area: left;
    justify-self: end;
    width: min(100%, 130px);
  }
  .c-right {
    grid-area: right;
    width: min(100%, 130px);
  }
  .c-page {
    grid-area: page;
    display: grid;
    place-items: center;
    height: 150px;
  }
  .c-page svg {
    max-width: 100%;
    max-height: 100%;
    filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.25));
  }
  .sheet {
    fill: #fff;
  }
  .body {
    fill: color-mix(in srgb, var(--accent) 22%, #fff);
    stroke: var(--accent);
    stroke-width: 3;
  }
  .head,
  .mpar {
    fill: color-mix(in srgb, var(--accent) 10%, #fff);
    stroke: color-mix(in srgb, var(--accent) 60%, #fff);
    stroke-width: 2.5;
    stroke-dasharray: 9 6;
  }
  .foot {
    stroke: color-mix(in srgb, var(--accent) 60%, #fff);
    stroke-width: 3;
    stroke-dasharray: 9 6;
  }
  .sheet-wait {
    width: 100px;
    height: 141px;
    border-radius: 2px;
    background: #fff;
    opacity: 0.5;
  }
  .code {
    margin: 0;
    padding: 9px 11px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    flex-shrink: 0;
  }
  .note {
    display: flex;
    gap: 7px;
    align-items: flex-start;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .note.problem {
    color: var(--error);
  }
  .uses {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .uses .btn.on {
    border-color: var(--success);
    color: var(--success);
  }
  .range {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .num {
    width: 64px;
  }
  .actions {
    position: sticky;
    bottom: -16px;
    z-index: 2;
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin: auto -18px -16px;
    padding: 10px 18px 14px;
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 28px 16px;
    text-align: center;
  }
  .preview-box {
    position: relative;
    flex: 1;
    min-height: 200px;
    display: grid;
    place-items: start center;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: #8b8e98;
    overflow: auto;
  }
  .preview-box .empty {
    align-self: center;
    color: #f3f4f6;
  }
  .busy {
    position: absolute;
    top: 8px;
    right: 8px;
  }
  .error-box,
  .warn-box {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 11px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--error) 12%, transparent);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text);
  }
  .error-box strong {
    color: var(--error);
  }
  .warn-box {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: color-mix(in srgb, var(--warning) 14%, transparent);
  }
  .ok-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--success);
  }
</style>
