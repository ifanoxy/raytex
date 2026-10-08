<script lang="ts">
  // The page studio: the margins of the document and its page styles
  // (header, footer, rules, watermark) are set with fields, and seen on
  // real pages compiled with the class and the preamble of the project
  // before anything is written. The main settings are in sight; each group
  // keeps the others behind "Advanced". A style is then given to the whole
  // document, to the pages that open, from the cursor on, to one page or
  // to pages by their numbers.
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { onMount, tick } from "svelte";
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import {
    addRange,
    type Band,
    BUILTIN_STYLES,
    emptyStyle,
    ensureGeometry,
    type EvenPages,
    FIELD_CODES,
    FONT_SHAPES,
    FONT_SIZES,
    fontCode,
    fromPt,
    geometryCode,
    hasChapters,
    headHeightAsked,
    imageField,
    imageWatermark,
    MARGIN_PRESETS,
    type MarginPreset,
    type Margins,
    marginsSample,
    type MarkFormat,
    type Metrics,
    metrics,
    newGeometryCode,
    type PagePreview,
    type PageStyle,
    PAPERS,
    previewSource,
    readClass,
    readFont,
    readMargins,
    readStyles,
    readUse,
    removeRange,
    removeStyle,
    saveStyle,
    setHeadHeight,
    shownLength,
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
  import { type MenuItem, ui } from "$lib/state/ui.svelte";
  import { basename, debounce, dirname, relative } from "$lib/utils";
  import FoldSection from "../common/FoldSection.svelte";
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
  /** Which groups show their advanced settings. */
  const open = $state({ paper: false, margins: false, head: false, foot: false, mark: false, more: false, use: false });

  const cls = $derived(source === null ? null : readClass(source));
  const chapters = $derived(!!cls && hasChapters(cls));

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
  /** XeLaTeX draws a see-through image as it is. */
  const opaque = $derived(tab === "styles" && outcome?.engine === "xelatex" && !!style?.watermark?.image && style.watermark.opacity < 100);

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

  /** A file of the project, as the document names it. */
  async function pickImage(): Promise<string | null> {
    if (!root) return null;
    const file = await openDialog({ filters: [{ name: t("layout.markImage"), extensions: ["png", "jpg", "jpeg", "pdf"] }] }).catch(() => null);
    return typeof file === "string" ? relative(dirname(root), file) : null;
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
    // In a two-sided document, what is outside stays outside.
    if (margins?.twoside) style.even = "mirror";
    isNew = true;
    markKind = "none";
  }

  function setMark(kind: "none" | "text" | "image") {
    if (!style) return;
    markKind = kind;
    style.watermark = kind === "none" ? null : kind === "text" ? textWatermark(t("layout.markSample")) : imageWatermark("");
  }

  async function chooseMark() {
    const file = await pickImage();
    if (file && style?.watermark) style.watermark.image = file;
  }

  /** The field of a header or a footer the menu writes in, and where its cursor was. */
  let slot: { part: "head" | "foot"; pages: "odd" | "even"; side: keyof Slots; input: HTMLInputElement; from: number; to: number } | null = null;

  async function write(code: string) {
    if (!style || !slot) return;
    const { part, pages, side, input, from, to } = slot;
    const value = style[part][pages][side];
    style[part][pages][side] = value.slice(0, from) + code + value.slice(to);
    // Inside the braces of what takes a text.
    const caret = from + code.length - (code.endsWith("{}") ? 1 : 0);
    // Once the field shows its new text.
    await tick();
    input.focus();
    input.setSelectionRange(caret, caret);
  }

  /** What a field can hold besides text: the menu of its `+`. */
  function fieldMenu(e: MouseEvent, part: "head" | "foot", pages: "odd" | "even", side: keyof Slots) {
    const button = e.currentTarget as HTMLElement;
    const input = button.parentElement?.querySelector("input");
    if (!input) return;
    const focused = document.activeElement === input;
    const end = input.value.length;
    slot = { part, pages, side, input, from: focused ? (input.selectionStart ?? end) : end, to: focused ? (input.selectionEnd ?? end) : end };
    const item = (label: string, code: string, icon?: string): MenuItem => ({ label, icon, run: () => write(code) });
    ui.openMenuBelow(button, [
      item(t("layout.field.page"), FIELD_CODES.page, "hash"),
      item(t("layout.field.pageOf"), FIELD_CODES.pageOf),
      item(t(chapters ? "layout.field.chapter" : "layout.field.section"), FIELD_CODES.chapter, "heading"),
      item(t(chapters ? "layout.field.section" : "layout.field.subsection"), FIELD_CODES.section),
      item(t("layout.field.date"), FIELD_CODES.date, "clock"),
      {
        label: t("layout.field.image"),
        icon: "image",
        run: async () => {
          const file = await pickImage();
          if (file) await write(imageField(file));
        },
      },
      { separator: true },
      item(t("layout.field.bold"), FIELD_CODES.bold, "bold"),
      item(t("layout.field.italic"), FIELD_CODES.italic, "italic"),
      item(t("layout.field.smallcaps"), FIELD_CODES.smallcaps),
      item(t("layout.field.small"), FIELD_CODES.small, "text-size"),
      item(t("layout.field.color"), FIELD_CODES.color, "text-color"),
      item(t("layout.field.newline"), FIELD_CODES.newline),
      { separator: true },
      item(t("layout.field.pageTotal"), FIELD_CODES.pageTotal),
      item(t("layout.field.firstMark"), FIELD_CODES.firstMark),
      item(t("layout.field.lastMark"), FIELD_CODES.lastMark),
      item(t("layout.field.exceptFloatPages"), FIELD_CODES.exceptFloatPages),
    ]);
  }

  function setFont(band: Band, key: "size" | "shape" | "color", value: string) {
    band.init = fontCode({ ...readFont(band.init), [key]: value });
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

  const SIDES: (keyof Slots)[] = ["left", "center", "right"];
  const EVEN: EvenPages[] = ["same", "mirror", "own"];
  const MARKS: MarkFormat[] = ["", "number", "title"];
  const COLORS = ["black", "gray", "red", "blue", "teal", "orange", "purple"];
  /** The settings the even pages get a say in: a two-sided document, or a style that already sets them apart. */
  const twoSided = $derived(!!margins?.twoside || (!!style && style.even !== "same"));
</script>

{#snippet lengthOf(key: "top" | "bottom" | "left" | "right" | "bindingOffset" | "headHeight" | "headSep" | "footSkip" | "marginParWidth" | "marginParSep" | "paperWidth" | "paperHeight", label: string, placeholder: string, title?: string)}
  {#if margins}
    <LengthField value={margins[key]} {unit} {label} {placeholder} {title} onchange={(v) => setMargin(key, v)} />
  {/if}
{/snippet}

{#snippet colorOf(value: string, none: string, onpick: (color: string) => void, label: string)}
  <label class="field">
    <span>{label}</span>
    <select class="select input small" {value} onchange={(e) => onpick(e.currentTarget.value)}>
      <option value="">{none}</option>
      {#each COLORS as c (c)}<option value={c}>{t(`layout.color.${c}` as "layout.color.black")}</option>{/each}
      {#if value && !COLORS.includes(value)}<option {value}>{value}</option>{/if}
    </select>
  </label>
{/snippet}

{#snippet fields(part: "head" | "foot", pages: "odd" | "even")}
  {#if style}
    <div class="grid three">
      {#each SIDES as side (side)}
        <label class="field">
          <span>{t(`layout.slot.${side}`)}</span>
          <span class="slot">
            <input class="input small mono" bind:value={style[part][pages][side]} spellcheck="false" autocomplete="off" data-slot="{part}-{pages === 'even' ? 'even-' : ''}{side}" />
            <button class="plus" type="button" title={t("layout.fieldMenu")} aria-label={t("layout.fieldMenu")} onmousedown={(e) => e.preventDefault()} onclick={(e) => fieldMenu(e, part, pages, side)}><Icon name="plus" size={12} /></button>
          </span>
        </label>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet band(part: "head" | "foot")}
  {#if style}
    {@const b = style[part]}
    {@const font = readFont(b.init)}
    <FoldSection id={part} title={t(part === "head" ? "layout.header" : "layout.footer")} bind:open={open[part]}>
      {#if style.even === "own"}<span class="pages faint">{t("layout.oddPages")}</span>{/if}
      {@render fields(part, "odd")}
      {#if style.even === "own"}
        <span class="pages faint">{t("layout.evenPages")}</span>
        {@render fields(part, "even")}
      {/if}
      {#snippet advanced()}
        <div class="grid three">
          <LengthField value={b.rule} unit="pt" label={t("layout.rule")} placeholder="0" title={t("layout.ruleTitle")} onchange={(v) => (b.rule = v)} />
          {@render colorOf(b.ruleColor, t("layout.color.text"), (c) => (b.ruleColor = c), t("layout.ruleColor"))}
          <LengthField value={b.ruleSkip} unit="pt" label={t("layout.ruleSkip")} placeholder={part === "head" ? "0" : "…"} onchange={(v) => (b.ruleSkip = v)} />
        </div>
        <label class="check">
          <input type="checkbox" bind:checked={b.floatPagesBare} />
          <span>{t("layout.floatPagesBare")}</span>
        </label>
        <div class="grid three">
          <label class="field">
            <span>{t("layout.fontSize")}</span>
            <select class="select input small" value={font.size} onchange={(e) => setFont(b, "size", e.currentTarget.value)}>
              <option value="">{t("layout.asText")}</option>
              {#each FONT_SIZES as s (s)}<option value={s}>{t(`layout.size.${s.slice(1)}` as "layout.size.small")}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span>{t("layout.fontShape")}</span>
            <select class="select input small" value={font.shape} onchange={(e) => setFont(b, "shape", e.currentTarget.value)}>
              <option value="">{t("layout.asText")}</option>
              {#each FONT_SHAPES as s (s)}<option value={s}>{t(`layout.shape.${s.slice(1)}` as "layout.shape.itshape")}</option>{/each}
            </select>
          </label>
          {@render colorOf(font.color, t("layout.color.text"), (c) => setFont(b, "color", c), t("layout.fontColor"))}
        </div>
        <div class="grid three">
          <LengthField value={b.offsetLeft} {unit} label={t("layout.offsetLeft")} placeholder="0" title={t("layout.offsetTitle")} onchange={(v) => (b.offsetLeft = v)} />
          <LengthField value={b.offsetRight} {unit} label={t("layout.offsetRight")} placeholder="0" title={t("layout.offsetTitle")} onchange={(v) => (b.offsetRight = v)} />
        </div>
      {/snippet}
    </FoldSection>
  {/if}
{/snippet}

<Modal title={t("layout.title")} icon="margins" width="min(1180px, 96vw)" height="min(800px, 94vh)">
  <div class="studio">
    <section class="left">
      <div class="tabs" role="tablist">
        <button class="tab" class:active={tab === "margins"} role="tab" aria-selected={tab === "margins"} title={t("layout.marginsTip")} onclick={() => (tab = "margins")}><Icon name="margins" size={14} />{t("layout.tabMargins")}</button>
        <button class="tab" class:active={tab === "styles"} role="tab" aria-selected={tab === "styles"} title={t("layout.stylesTip")} onclick={() => (tab = "styles")}><Icon name="page-style" size={14} />{t("layout.tabStyles")}</button>
      </div>

      {#if missing}
        <div class="empty">{t("layout.noPreamble")}</div>
      {:else if tab === "margins" && margins}
        <div class="chips" role="group" aria-label={t("layout.presets")}>
          <button class="chip" class:active={activePreset === "default"} onclick={() => preset(null)} title={t("layout.presetDefaultTitle")}>{t("layout.preset.default")}</button>
          {#each MARGIN_PRESETS as p (p.id)}
            <button class="chip" class:active={activePreset === p.id} onclick={() => preset(p)}>{t(`layout.preset.${p.id}`)}</button>
          {/each}
        </div>

        <FoldSection id="margins" title={t("layout.tabMargins")} bind:open={open.margins}>
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
            <p class="measure faint" title={t("layout.marginsTip")}>
              {t("layout.measured", {
                text: `${auto(measured.textWidth)} × ${auto(measured.textHeight)} ${unit}`,
                paper: `${auto(measured.paperWidth)} × ${auto(measured.paperHeight)} ${unit}`,
              })}
            </p>
          {/if}
          {#snippet advanced()}
            <div class="grid three">
              {@render lengthOf("headHeight", t("layout.headHeight"), auto(measured?.headHeight), t("layout.headHeightTitle"))}
              {@render lengthOf("headSep", t("layout.headSep"), auto(measured?.headSep), t("layout.headSepTitle"))}
              {@render lengthOf("footSkip", t("layout.footSkip"), auto(measured?.footSkip), t("layout.footSkipTitle"))}
            </div>
            <div class="checks">
              <label class="check" title={t("layout.includeTitle")}>
                <input type="checkbox" checked={margins!.includeHead} onchange={(e) => setMargin("includeHead", e.currentTarget.checked)} />
                <span>{t("layout.includeHead")}</span>
              </label>
              <label class="check" title={t("layout.includeTitle")}>
                <input type="checkbox" checked={margins!.includeFoot} onchange={(e) => setMargin("includeFoot", e.currentTarget.checked)} />
                <span>{t("layout.includeFoot")}</span>
              </label>
            </div>
            <div class="grid three">
              {@render lengthOf("marginParWidth", t("layout.marginParWidth"), auto(measured?.marginParWidth))}
              {@render lengthOf("marginParSep", t("layout.marginParSep"), auto(measured?.marginParSep))}
            </div>
            <label class="field">
              <span>{t("layout.other")}</span>
              <input class="input small mono" value={margins!.other.join(", ")} placeholder="showframe, textwidth=15cm" spellcheck="false" onchange={(e) => setMargin("other", e.currentTarget.value.split(/,(?![^{]*\})/).map((o) => o.trim()).filter(Boolean))} />
            </label>
            <pre class="code selectable">{marginsCode || t("layout.marginsNone")}</pre>
          {/snippet}
        </FoldSection>

        <FoldSection id="paper" title={t("layout.paper")} bind:open={open.paper}>
          <div class="paper">
            <label class="field">
              <span>{t("layout.format")}</span>
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
            <div class="grid three">
              {@render lengthOf("paperWidth", t("layout.paperWidth"), auto(measured?.paperWidth))}
              {@render lengthOf("paperHeight", t("layout.paperHeight"), auto(measured?.paperHeight))}
            </div>
          {/if}
          {#snippet advanced()}
            <div class="grid three">
              <label class="check tall" title={t("layout.twosideHint")}>
                <input type="checkbox" checked={margins!.twoside} onchange={(e) => setMargin("twoside", e.currentTarget.checked)} />
                <span>{t("layout.twoside")}</span>
              </label>
              {@render lengthOf("bindingOffset", t("layout.bindingOffset"), "0", t("layout.bindingOffsetTitle"))}
            </div>
          {/snippet}
        </FoldSection>

        <div class="actions">
          <button class="btn" disabled={!canInsert} onclick={() => insertHere("\\restoregeometry")} title={t("layout.restoreHereTitle")}>{t("layout.restoreHere")}</button>
          <button class="btn" disabled={!canInsert || !pagesCode} onclick={marginsFromHere} title={t("layout.marginsFromHereTitle")}>{t("layout.fromHere")}</button>
          <button class="btn primary" disabled={applying} onclick={applyMargins}><Icon name="check" size={14} />{t("layout.applyDocument")}</button>
        </div>
      {:else if tab === "styles" && source !== null}
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
              <span>{t("layout.styleName")}</span>
              <input class="input small mono name" class:invalid={!styleReady} bind:value={style.name} title={t("layout.styleNameHint")} spellcheck="false" autocomplete="off" />
            </label>
            {#if nameTaken}<div class="note problem"><Icon name="info" size={13} /><span>{t("layout.nameTaken", { name: style.name })}</span></div>
            {:else if !styleReady}<div class="note problem"><Icon name="info" size={13} /><span>{t("layout.nameInvalid")}</span></div>{/if}
          {/if}

          {#if twoSided}
            <div class="row">
              <span class="row-label">{t("layout.evenPages")}</span>
              <div class="segment" role="radiogroup" aria-label={t("layout.evenPages")}>
                {#each EVEN as e (e)}
                  <button class:active={style.even === e} role="radio" aria-checked={style.even === e} title={t(`layout.evenTitle.${e}`)} onclick={() => (style!.even = e)}>{t(`layout.even.${e}`)}</button>
                {/each}
              </div>
            </div>
          {/if}

          {@render band("head")}
          {@render band("foot")}

          <FoldSection id="mark" title={t("layout.watermark")} bind:open={open.mark}>
            <div class="segment" role="radiogroup" aria-label={t("layout.watermark")}>
              <button class:active={markKind === "none"} role="radio" aria-checked={markKind === "none"} onclick={() => setMark("none")}>{t("layout.markNone")}</button>
              <button class:active={markKind === "text"} role="radio" aria-checked={markKind === "text"} onclick={() => setMark("text")}>{t("layout.markText")}</button>
              <button class:active={markKind === "image"} role="radio" aria-checked={markKind === "image"} onclick={() => setMark("image")}>{t("layout.markImage")}</button>
            </div>
            {#if style.watermark && markKind === "text"}
              <div class="grid three">
                <label class="field wide">
                  <span>{t("layout.markTextLabel")}</span>
                  <input class="input small" bind:value={style.watermark.text} spellcheck="false" />
                </label>
                <label class="field"><span>{t("layout.markStrength")} · {style.watermark.strength} %</span><input type="range" min="4" max="60" step="1" bind:value={style.watermark.strength} /></label>
              </div>
            {:else if style.watermark && markKind === "image"}
              <div class="grid three">
                <label class="field wide">
                  <span>{t("layout.markFile")}</span>
                  <span class="file">
                    <input class="input small mono" bind:value={style.watermark.image} placeholder="images/logo.png" spellcheck="false" />
                    <button class="btn small" onclick={chooseMark}>{t("layout.browse")}</button>
                  </span>
                </label>
                <label class="field"><span>{t("layout.markOpacity")} · {style.watermark.opacity} %</span><input type="range" min="5" max="100" step="5" bind:value={style.watermark.opacity} /></label>
              </div>
            {/if}
            {#snippet advanced()}
              {#if style?.watermark}
                {@const w = style.watermark}
                <div class="grid three">
                  {#if markKind === "text"}
                    {@render colorOf(w.color === "black" ? "" : w.color, t("layout.color.black"), (c) => (w.color = c || "black"), t("layout.markColor"))}
                    <label class="field"><span>{t("layout.markSize")} · ×{w.size}</span><input type="range" min="1" max="14" step="0.5" bind:value={w.size} /></label>
                  {:else}
                    <label class="check tall">
                      <input type="checkbox" bind:checked={w.fit} />
                      <span>{t("layout.markFit")}</span>
                    </label>
                    <label class="field"><span>{t("layout.markWidth")} · {Math.round(w.size * 100)} %</span><input type="range" min="0.1" max="1" step="0.05" bind:value={w.size} disabled={w.fit} /></label>
                  {/if}
                  <label class="field"><span>{t("layout.markAngle")} · {w.angle}°</span><input type="range" min="-90" max="90" step="5" bind:value={w.angle} disabled={w.fit} /></label>
                </div>
                <div class="grid three">
                  <label class="field"><span>{t("layout.markX")} · {Math.round(w.x * 100)} %</span><input type="range" min="0" max="1" step="0.05" bind:value={w.x} disabled={w.fit} /></label>
                  <label class="field"><span>{t("layout.markY")} · {Math.round(w.y * 100)} %</span><input type="range" min="0" max="1" step="0.05" bind:value={w.y} disabled={w.fit} /></label>
                  <label class="check tall" title={t("layout.markFrontTitle")}>
                    <input type="checkbox" bind:checked={w.front} />
                    <span>{t("layout.markFront")}</span>
                  </label>
                </div>
              {:else}
                <span class="faint small">{t("layout.markFirst")}</span>
              {/if}
            {/snippet}
          </FoldSection>

          <FoldSection id="more" title={t("layout.more")} bind:open={open.more}>
            {#snippet advanced()}
              <div class="grid three">
                <label class="field" title={t("layout.marksTitle")}>
                  <span>{t(chapters ? "layout.markOf.chapter" : "layout.markOf.section")}</span>
                  <select class="select input small" bind:value={style!.marks.first}>
                    {#each MARKS as m (m)}<option value={m}>{t(`layout.mark.${m || "class"}`)}</option>{/each}
                  </select>
                </label>
                <label class="field" title={t("layout.marksTitle")}>
                  <span>{t(chapters ? "layout.markOf.section" : "layout.markOf.subsection")}</span>
                  <select class="select input small" bind:value={style!.marks.second}>
                    {#each MARKS as m (m)}<option value={m}>{t(`layout.mark.${m || "class"}`)}</option>{/each}
                  </select>
                </label>
                <label class="field" title={t("layout.baseTitle")}>
                  <span>{t("layout.base")}</span>
                  <select class="select input small" bind:value={style!.base}>
                    <option value="">{t("layout.baseNone")}</option>
                    {#each styles.filter((s) => s.name !== style!.name) as s (s.name)}<option value={s.name}>{s.name}</option>{/each}
                    {#if style!.base && !styles.some((s) => s.name === style!.base)}<option value={style!.base}>{style!.base}</option>{/if}
                  </select>
                </label>
              </div>
              <label class="field">
                <span>{t("layout.extra")}</span>
                <textarea class="input small mono" rows="2" value={style!.extra.join("\n")} placeholder={"\\fancyheadwidth{0.8\\textwidth}"} spellcheck="false" oninput={(e) => (style!.extra = e.currentTarget.value.split("\n"))}></textarea>
              </label>
              {#if styleReady}<pre class="code selectable">{styleCode(style!, chapters)}</pre>{/if}
            {/snippet}
          </FoldSection>

          {#if styleReady}
            <FoldSection id="use" title={t("layout.useTitle", { name: style.name })} bind:open={open.use}>
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
              {#snippet advanced()}
                <div class="range" title={t("layout.pagesTitle")}>
                  <span>{t("layout.pagesFrom")}</span>
                  <input class="input small num" type="number" min="1" bind:value={rangeFrom} oninput={() => (rangeTo = Math.max(rangeTo, rangeFrom))} aria-label={t("layout.pagesFrom")} />
                  <span>{t("layout.pagesTo")}</span>
                  <input class="input small num" type="number" min="1" bind:value={rangeTo} aria-label={t("layout.pagesTo")} />
                  <button class="btn small" disabled={!rangeValid} onclick={addPages}>{t("layout.pagesApply")}</button>
                </div>
                <div class="chips small">
                  <span class="faint">{t("layout.backHere")}</span>
                  {#each ["plain", "empty", "headings"] as const as b (b)}
                    <button class="chip" disabled={!canInsert} title={t(`layout.builtin.${b}`)} onclick={() => insertHere(`\\pagestyle{${b}}`)}>{b}</button>
                  {/each}
                </div>
              {/snippet}
            </FoldSection>
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
      {:else if opaque}
        <div class="warn-box"><span>{t("layout.opaque")}</span></div>
      {:else if outcome?.pdf}
        <div class="ok-line"><Icon name="check" size={13} />{t("layout.previewOk", { engine: outcome.engine })}</div>
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
  .left,
  .right {
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
  .right h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
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
    box-shadow:
      0 -14px 0 0 var(--bg-elev),
      0 6px 0 0 var(--bg-elev);
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
  .measure {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
    text-align: center;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .chips.small,
  .small {
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
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .row-label,
  .pages {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .row .segment {
    flex: 1;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .field .input,
  .field .select {
    width: 100%;
    min-width: 0;
  }
  .field textarea {
    resize: vertical;
    line-height: 1.5;
  }
  .field input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
  }
  .field.wide {
    grid-column: span 2;
  }
  /* A field of a header or a footer, with the `+` of what it can hold. */
  .slot {
    position: relative;
    display: flex;
  }
  .slot .input {
    padding-right: 26px;
  }
  .plus {
    position: absolute;
    top: 50%;
    right: 4px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    transform: translateY(-50%);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .plus:hover {
    background: var(--accent-soft);
    color: var(--accent);
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
  /* A box to tick, on the line of the fields next to it. */
  .check.tall {
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
  .grid.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .file {
    display: flex;
    gap: 6px;
  }
  /* The four margins around a drawing of the page. */
  .cross {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 110px minmax(0, 1fr);
    grid-template-areas:
      ". top ."
      "left page right"
      ". bottom .";
    gap: 6px 12px;
    align-items: center;
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
    height: 136px;
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
    width: 96px;
    height: 136px;
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
