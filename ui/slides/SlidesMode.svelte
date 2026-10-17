<script lang="ts">
  // The slides mode: the slides of a Beamer deck as thumbnails on the left
  // (a new one from a layout, copied, deleted, moved by dragging), the slide
  // chosen in the middle, made of its title and its blocks and edited where
  // they are (typed into, a block added from the bar "Insert" or the + between
  // two blocks, moved by its handle, its tools above it), and on the right
  // the real slide as Beamer draws it (or its LaTeX) and the notes of the
  // speaker. The text stays with the application (its editor, left behind,
  // its undo, its builds): the mode is given a host that tells it the text
  // and makes the changes it asks for, one after the other.
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { onDestroy, onMount } from "svelte";
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { closePdf, loadPdf } from "$lib/pdf/pdfjs";
  import { addToColumn, type Block, type BlockEdit, type BlockKind, deleteBlock, duplicateBlock, frameBlocks, indentUnit, insertBlock, moveBlockTo, moveToColumn, newBlock, replaceBlock, splitBlock } from "$lib/slides/blocks";
  import { type Deck, deleteFrame, duplicateFrame, type Frame, framePages, insertFrame, type Layout, LAYOUTS, moveFrame, pagesOf, parseDeck, setNotes, setTitle } from "$lib/slides/deck";
  import { type DeckExport, exportNames, exportText } from "$lib/slides/exports";
  import type { SlidesHost, SlidesState } from "$lib/slides/host";
  import { choosePicture, isPicture, pictureFor } from "$lib/slides/pictures";
  import { COLORS, type DeckLook, preambleEnd, readLook, writeLook } from "$lib/slides/theme";
  import { dirname } from "$lib/utils";
  import Icon from "../components/common/Icon.svelte";
  import { COMPONENTS, componentId, componentOf } from "./components";
  import { type Carried, drag } from "./drag.svelte";
  import FrameCode from "./FrameCode.svelte";
  import PageCanvas from "./PageCanvas.svelte";
  import PresenterView from "./PresenterView.svelte";
  import SlideCanvas from "./SlideCanvas.svelte";
  import ThemeStudio from "./ThemeStudio.svelte";

  let { host }: { host: SlidesHost } = $props();

  let told = $state<SlidesState | null>(null);
  let selected = $state(0);
  let doc = $state<PDFDocumentProxy | null>(null);
  let nav = $state("");
  let revision = $state(0);

  const deck = $derived(parseDeck(told?.text ?? ""));
  const pages = $derived(framePages(nav));
  const frame = $derived(deck.frames[selected] ?? null);
  const range = $derived(frame ? pagesOf(pages, deck.frames.length, selected) : null);
  /** The step of the slide shown (its pages, reveals included). */
  let step = $state(0);
  const shownPage = $derived(range ? Math.min(range[1], range[0] + step) : 0);
  const lang = $derived(i18n.lang === "fr" ? "fr" : "en");

  // ------------------------------------------------------- what is told

  let stopListening: (() => void) | null = null;
  onMount(() => {
    stopListening = host.subscribe((next) => {
      const first = told === null;
      const rebuilt = !told || told.built !== next.built || told.pdf !== next.pdf;
      told = next;
      if (i18n.lang !== next.lang) i18n.lang = next.lang;
      if (asked && next.version !== asked.version) nextAsked();
      if (rebuilt) void reload(next);
      // The slide the cursor of the editor was in.
      if (first && next.cursorLine !== null) {
        const at = parseDeck(next.text).frames.findIndex((f) => {
          const end = f.line + (next.text.slice(f.from, f.to).match(/\n/g)?.length ?? 0);
          return next.cursorLine! >= f.line && next.cursorLine! <= end;
        });
        if (at >= 0) select(at);
      }
      const count = parseDeck(next.text).frames.length;
      if (selected >= count) selected = Math.max(0, count - 1);
    });
  });
  onDestroy(() => {
    stopListening?.();
    host.command({ kind: "closed" });
    closePdf(doc);
  });

  /** The PDF and the `.nav` of a new build. */
  async function reload(s: SlidesState) {
    if (s.nav) nav = (await ipc.readTextFile(s.nav).catch(() => null))?.text ?? nav;
    if (!s.pdf) return;
    const bytes = await ipc.readBinaryFile(s.pdf).catch(() => null);
    if (!bytes) return;
    const next = await loadPdf(bytes).catch(() => null);
    if (!next) return;
    const old = doc;
    doc = next;
    revision++;
    closePdf(old);
  }

  function select(i: number) {
    if (i !== selected) {
      step = 0;
      block = -1;
    }
    selected = i;
  }

  // -------------------------------------- the changes, one after the other

  // Each change is made on the text as it is when its turn comes: the next
  // one waits for the text the last one gave (or a moment, when it was refused).
  type Change = { from: number; to: number; insert: string; then?: () => void };
  let asked: { version: number; timer: ReturnType<typeof setTimeout> } | null = null;
  const waiting: ((s: SlidesState) => Change | null)[] = [];
  function ask(make: (s: SlidesState) => Change | null) {
    waiting.push(make);
    if (!asked) nextAsked();
  }
  function nextAsked() {
    if (asked) clearTimeout(asked.timer);
    asked = null;
    const s = told;
    const make = waiting.shift();
    if (!make || !s) return;
    const change = make(s);
    if (!change) return nextAsked();
    asked = { version: s.version, timer: setTimeout(nextAsked, 1500) };
    host.edit({ version: s.version, changes: [{ from: change.from, to: change.to, insert: change.insert }] });
    change.then?.();
  }

  /** A change of the deck (its slides): the slide it gives is chosen. */
  function deckChange(make: (text: string, d: Deck) => { from: number; to: number; insert: string; select: number } | null) {
    ask((s) => {
      const e = make(s.text, parseDeck(s.text));
      return e ? { ...e, then: () => select(e.select) } : null;
    });
  }

  /** A change of the blocks of the slide chosen: the block it gives is chosen (and its text gets the caret, `focus`). */
  type Make = (text: string, frame: Frame, blocks: Block[]) => BlockEdit | null;
  function blockChange(make: Make, focusNew = false) {
    const slide = selected;
    ask((s) => {
      const f = parseDeck(s.text).frames[slide];
      const e = f ? make(s.text, f, frameBlocks(s.text, f)) : null;
      return e
        ? {
            ...e,
            then: () => {
              block = e.select;
              if (focusNew) focus = { index: e.select, part: 0 };
            },
          }
        : null;
    });
  }

  // ---------------------------------------------------------- the blocks

  /** The block of the slide chosen (-1: none). */
  let block = $state(-1);
  /** A block whose text gets the caret once it is drawn. */
  let focus = $state<{ index: number; part: number } | null>(null);
  const blocks = $derived<Block[]>(frame && told ? frameBlocks(told.text, frame) : []);
  const unit = $derived(indentUnit(told?.text ?? ""));
  const dir = $derived(told?.path ? dirname(told.path) : null);

  function changeBlock(i: number, edit: (b: Block) => Block | null) {
    const kind = blocks[i]?.kind;
    blockChange((tx, _f, bs) => {
      if (bs[i]?.kind !== kind) return null;
      const next = edit(bs[i]);
      return next ? replaceBlock(tx, bs, i, next) : deleteBlock(tx, bs, i);
    });
  }

  /** A component added before block `before` (`blocks.length`: at the end); a picture is chosen first. */
  async function insertAt(before: number, kind: BlockKind, variant: string) {
    let made = newBlock(kind, lang, variant);
    if (kind === "image" && !variant) {
      if (!told?.path) return;
      const chosen = await choosePicture(told.path, told.text);
      if (!chosen) return;
      made = newBlock("image", lang, chosen);
    }
    blockChange((tx, f, bs) => insertBlock(tx, f, bs, Math.min(before, bs.length) - 1, made), true);
  }

  /** A component added with a click in the bar: after the block chosen, else at the end. */
  function insertComponent(kind: BlockKind, variant: string) {
    void insertAt(block >= 0 ? block + 1 : blocks.length, kind, variant);
  }

  /** A block put where something was dropped: between two blocks (`before:2`) or at the end of a column (`column:1:0`). */
  function putBlock(place: string, made: Block) {
    const [where, a, b] = place.split(":");
    if (where === "before") blockChange((tx, f, bs) => insertBlock(tx, f, bs, Math.min(Number(a), bs.length) - 1, made), true);
    else if (where === "column") blockChange((tx, _f, bs) => (bs[Number(a)]?.kind === "columns" ? { ...replaceBlock(tx, bs, Number(a), addToColumn(bs[Number(a)], Number(b), made, unit)), select: Number(a) } : null));
  }

  /** What was dragged, let go on a place: a component added there (a picture chosen first), a block or a slide moved there. */
  async function dropped(place: string, carried: Pick<Carried, "kind" | "value">) {
    const [where, a, b] = place.split(":");
    if (carried.kind === "component") {
      const c = componentOf(carried.value);
      if (!c || (where !== "before" && where !== "column")) return;
      if (c.kind === "image") {
        if (!told?.path) return;
        const chosen = await choosePicture(told.path, told.text);
        if (chosen) putBlock(place, newBlock("image", lang, chosen));
      } else putBlock(place, newBlock(c.kind, lang, c.variant));
    } else if (carried.kind === "block") {
      const i = Number(carried.value);
      if (where === "before") blockChange((tx, _f, bs) => moveBlockTo(tx, bs, i, Number(a)));
      else if (where === "column") blockChange((tx, _f, bs) => moveToColumn(tx, bs, i, Number(a), Number(b), unit));
    } else if (carried.kind === "slide" && where === "slide") {
      const from = Number(carried.value);
      const to = Number(a);
      if (from !== to) ask((s) => {
        const moved = moveFrame(s.text, parseDeck(s.text), from, to);
        return moved ? { from: 0, to: s.text.length, insert: moved.text, then: () => select(moved.select) } : null;
      });
    }
  }

  // Pictures dropped from the system: the application hands them to the slide.
  let rootEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = rootEl;
    if (!el) return;
    const dropped = (e: Event) => {
      const { paths, x, y } = (e as CustomEvent<{ paths: string[]; x: number; y: number }>).detail;
      void dropFiles(paths, x, y);
    };
    el.addEventListener("raytex-files", dropped);
    return () => el.removeEventListener("raytex-files", dropped);
  });
  async function dropFiles(paths: string[], x: number, y: number) {
    const pictures = paths.filter(isPicture);
    if (!pictures.length || !told?.path) return;
    const place = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? `before:${blocks.length}`;
    // Put at one place one after the other: in their order.
    for (const file of place.startsWith("before") ? [...pictures].reverse() : pictures) {
      const path = await pictureFor(file, told.path, told.text);
      if (path) putBlock(place, newBlock("image", lang, path));
    }
  }

  async function changePicture(i: number) {
    if (!told?.path) return;
    const chosen = await choosePicture(told.path, told.text);
    if (chosen) changeBlock(i, (b) => ({ ...b, path: chosen }));
  }

  // ------------------------------------------------- the slides, the title

  let layoutsOpen = $state(false);
  function addSlide(layout: Layout) {
    layoutsOpen = false;
    deckChange((text, d) => insertFrame(text, d, d.frames.length ? selected : -1, layout, lang));
  }

  function setFrameTitle(title: string) {
    const slide = selected;
    ask((s) => {
      const d = parseDeck(s.text);
      const f = d.frames[slide];
      if (!f || title.trim() === f.title) return null;
      const e = setTitle(s.text, d, slide, title);
      return e ? { from: e.from, to: e.to, insert: e.insert } : null;
    });
  }

  let notesField = $state("");
  let notesEditing = false;
  $effect(() => {
    const now = frame?.notes.map((n) => n.text).join("\n\n") ?? "";
    if (!notesEditing) notesField = now;
  });
  function saveNotes() {
    notesEditing = false;
    const slide = selected;
    const value = notesField;
    ask((s) => {
      const d = parseDeck(s.text);
      const f = d.frames[slide];
      if (!f || value.trim() === f.notes.map((n) => n.text).join("\n\n").trim()) return null;
      const e = setNotes(s.text, d, slide, value);
      return e ? { from: e.from, to: e.to, insert: e.insert } : null;
    });
  }

  // ------------------------------------------------------------- the keys

  function key(e: KeyboardEvent) {
    // While presenting, the keys are the presenter's.
    if (presenting !== null) return;
    if (e.key === "F5") {
      e.preventDefault();
      present(e.shiftKey ? (range?.[0] ?? 1) : 1);
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, .cm-editor, [contenteditable='true'], [role='dialog']")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      if (layoutsOpen || exportsOpen || moreOpen) layoutsOpen = exportsOpen = moreOpen = false;
      else block = -1;
    } else if ((e.key === "Delete" || e.key === "Backspace") && block >= 0) {
      e.preventDefault();
      const i = block;
      blockChange((tx, _f, bs) => (bs[i] ? { ...deleteBlock(tx, bs, i), select: -1 } : null));
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (block >= 0) {
        const i = block;
        blockChange((tx, _f, bs) => (bs[i] ? duplicateBlock(tx, bs, i) : null));
      } else deckChange((text, d) => duplicateFrame(text, d, selected));
    } else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const by = e.key === "ArrowDown" ? 1 : -1;
      if (block >= 0) {
        const i = block;
        blockChange((tx, _f, bs) => moveBlockTo(tx, bs, i, by > 0 ? i + 2 : i - 1));
      } else void dropped(`slide:${selected + by}`, { kind: "slide", value: String(selected) });
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      select(Math.max(0, Math.min(deck.frames.length - 1, selected + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "ArrowRight" && range && shownPage < range[1]) step++;
    else if (e.key === "ArrowLeft" && step > 0) step--;
  }

  // -------------------------------------------- the real slide, its shape

  /** The size of the pages of the deck, in points; the slides are always shown lying down. */
  let pageSize = $state({ width: 16, height: 9 });
  $effect(() => {
    const d = doc;
    if (!d) return;
    void d.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      pageSize = { width: v.width, height: v.height };
    });
  });
  const pageRatio = $derived(pageSize.width / pageSize.height);
  const frameRatio = $derived(pageRatio >= 1 ? pageRatio : 16 / 9);

  const VIEW_KEY = "raytex.slides.side";
  let view = $state<"render" | "code">(
    (() => {
      try {
        return localStorage.getItem(VIEW_KEY) === "code" ? "code" : "render";
      } catch {
        return "render";
      }
    })(),
  );
  function show(v: "render" | "code") {
    view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered */
    }
  }
  const frameText = $derived(frame && told ? told.text.slice(frame.from, frame.to) : "");
  /** The title page of the deck, to see a look on (made when it has none). */
  const titleFrame = $derived.by(() => {
    const f = deck.frames.find((x) => x.titlePage);
    return f && told ? told.text.slice(f.from, f.to) : "\\begin{frame}\n  \\titlepage\n\\end{frame}";
  });
  /** The code of the slide typed: written in its place, while it is still one slide. */
  let codeProblem = $state(false);
  function codeChanged(text: string) {
    const one = /^\s*\\begin\s*\{frame\}/.test(text) && /\\end\s*\{frame\}\s*$/.test(text) && (text.match(/\\begin\s*\{frame\}/g)?.length ?? 0) === 1;
    codeProblem = !one;
    if (!one) return;
    const slide = selected;
    ask((s) => {
      const f = parseDeck(s.text).frames[slide];
      return f && s.text.slice(f.from, f.to) !== text ? { from: f.from, to: f.to, insert: text.trim() } : null;
    });
  }

  // --------------------------------------------- the look, exports, presenting

  let themeOpen = $state(false);
  let exportsOpen = $state(false);
  let moreOpen = $state(false);
  function setLook(look: Partial<DeckLook>) {
    ask((s) => {
      const end = preambleEnd(s.text);
      const next = writeLook(s.text, look);
      return { from: 0, to: end, insert: next.slice(0, next.length - (s.text.length - end)) };
    });
  }
  function exportDeck(e: DeckExport) {
    exportsOpen = false;
    if (told) host.command({ kind: "export", ...exportNames(e, lang), text: exportText(told.text, e) });
  }

  /** The page the presentation began at, while it goes on. */
  let presenting = $state<number | null>(null);
  function present(page: number) {
    if (!doc || !told?.pdf) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    presenting = page;
  }
  function endPresenting(page: number) {
    presenting = null;
    const k = pages.findIndex(([a, b]) => page >= a && page <= b);
    if (k >= 0) select(k);
  }

  /** The colour of the slide being edited: that of the colour theme of the deck, roughly. */
  const accent = $derived.by(() => {
    const look = told ? readLook(told.text) : null;
    const c = look && look.color !== "default" ? COLORS.find((x) => x.id === look.color) : null;
    return c && !["dove", "seagull", "beetle", "fly"].includes(c.id) ? c.swatch : "#3333b3";
  });

  const sections = $derived(deck.frames.map((f, i) => (i === 0 || f.section !== deck.frames[i - 1].section ? f.section : null)));
  let sideWidth = $state(340);
  const renderWidth = $derived(Math.max(180, sideWidth - 26));
  let thumbsWidth = $state(186);
  const thumbWidth = $derived(Math.max(110, thumbsWidth - 38));
</script>

<svelte:window
  onkeydown={key}
  onpointerdown={(e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".menu-wrap")) layoutsOpen = exportsOpen = moreOpen = false;
  }}
/>

<div class="slides-mode" bind:this={rootEl} data-pages={doc?.numPages ?? 0} data-drawn={doc && frame ? "yes" : "no"}>
  {#if presenting !== null && doc && told?.pdf}
    <PresenterView {doc} pdf={told.pdf} built={told.built} {pages} frames={deck.frames} start={presenting} ratio={frameRatio} {revision} onend={endPresenting} />
  {/if}

  <header class="bar">
    <button class="btn small" data-action="leave" title={t("slides.leaveHint")} onclick={() => host.command({ kind: "leave" })}><Icon name="arrow-left" size={13} />{t("slides.leave")}</button>
    <div class="menu-wrap">
      <button class="btn small" data-action="new-slide" onclick={() => (layoutsOpen = !layoutsOpen)} disabled={!deck.beamer}><Icon name="plus" size={14} />{t("slides.newShort")}<Icon name="chevron-down" size={12} /></button>
      {#if layoutsOpen}
        <div class="layouts" role="menu">
          {#each LAYOUTS as l (l)}
            <button class="layout" role="menuitem" data-layout={l} onclick={() => addSlide(l)}>
              <span class="sketch {l}" aria-hidden="true"><i></i><b></b><b></b></span>
              <span>{t(`slides.layout.${l}`)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <span class="sep"></span>
    <span class="insert-label faint">{t("slides.insert")}</span>
    {#each COMPONENTS.filter((c) => c.main) as c (componentId(c))}
      <button
        class="insert-btn"
        data-component={componentId(c)}
        title={t("slides.componentHint", { name: t(c.key as "slides.component.text") })}
        disabled={!frame}
        onpointerdown={(e) => drag.start(e, { kind: "component", value: componentId(c), label: t(c.key as "slides.component.text") }, (p, k) => void dropped(p, k))}
        onclick={() => insertComponent(c.kind, c.variant)}
      >
        <Icon name={c.icon} size={15} /><span class="insert-name">{t(c.key as "slides.component.text")}</span>
      </button>
    {/each}
    <div class="menu-wrap">
      <button class="insert-btn" data-action="more" disabled={!frame} onclick={() => (moreOpen = !moreOpen)}><Icon name="more" size={15} /><span class="insert-name">{t("slides.more")}</span></button>
      {#if moreOpen}
        <div class="menu" role="menu">
          {#each COMPONENTS.filter((c) => !c.main) as c (componentId(c))}
            <button
              role="menuitem"
              data-component={componentId(c)}
              onpointerdown={(e) =>
                drag.start(
                  e,
                  { kind: "component", value: componentId(c), label: t(c.key as "slides.component.text") },
                  (p, k) => void dropped(p, k),
                  () => (moreOpen = false),
                )}
              onclick={() => ((moreOpen = false), insertComponent(c.kind, c.variant))}><Icon name={c.icon} size={14} />{t(c.key as "slides.component.text")}</button>
          {/each}
        </div>
      {/if}
    </div>
    <span class="spacer"></span>
    {#if told?.building}<span class="status"><span class="spinner"></span>{t("slides.building")}</span>{:else if told?.failed}<span class="status err"><Icon name="alert-circle" size={13} />{t("slides.failed")}</span>{/if}
    <button class="btn small" data-action="theme" class:on={themeOpen} disabled={!deck.beamer} onclick={() => (themeOpen = !themeOpen)}><Icon name="palette" size={13} />{t("slides.look")}</button>
    <div class="menu-wrap">
      <button class="btn small" data-action="exports" disabled={!deck.beamer} onclick={() => (exportsOpen = !exportsOpen)}><Icon name="download" size={13} />{t("slides.export")}<Icon name="chevron-down" size={12} /></button>
      {#if exportsOpen}
        <div class="menu right" role="menu">
          <button role="menuitem" data-export="slides" onclick={() => exportDeck({ kind: "slides" })}>{t("slides.export.slides")}</button>
          <button role="menuitem" data-export="notes" onclick={() => exportDeck({ kind: "notes" })}>{t("slides.export.notes")}</button>
          <span class="menu-label faint">{t("slides.export.handouts")}</span>
          {#each [1, 2, 4] as n (n)}
            <button role="menuitem" data-export="handout-{n}" onclick={() => exportDeck({ kind: "handout", perPage: n, paper: lang === "fr" ? "a4paper" : "letterpaper" })}>{t("slides.export.handout", { n })}</button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="btn small primary" data-action="present" title={t("slides.presentHint")} disabled={!doc || !told?.pdf} onclick={() => present(range?.[0] ?? 1)}><Icon name="play" size={13} />{t("slides.present")}</button>
  </header>

  {#if told && !deck.beamer}
    <div class="nothing"><Icon name="presentation" size={28} /><p>{t("slides.notBeamer")}</p></div>
  {:else}
    <nav class="thumbs" aria-label={t("slides.list")} bind:clientWidth={thumbsWidth}>
      {#each deck.frames as f, i (f.from)}
        {#if sections[i]}<div class="section">{sections[i]}</div>{/if}
        <div class="thumb-slot" class:over={drag.carried?.kind === "slide" && drag.over === `slide:${i}`} data-drop="slide:{i}">
          <button
            class="thumb"
            class:active={i === selected}
            class:moving={drag.carried?.kind === "slide" && drag.carried.value === String(i)}
            data-index={i}
            onpointerdown={(e) => drag.start(e, { kind: "slide", value: String(i), label: f.title || t("slides.untitled") }, (p, k) => void dropped(p, k))}
            onclick={() => select(i)}
          >
            <span class="number">{i + 1}</span>
            <span class="picture" style:width="{thumbWidth}px" style:height="{thumbWidth / frameRatio}px">
              {#if doc}<PageCanvas {doc} page={pagesOf(pages, deck.frames.length, i)[0]} width={thumbWidth} height={thumbWidth / frameRatio} {revision} />{/if}
            </span>
            <span class="name ellipsis" title={f.title}>{f.titlePage ? t("slides.titlePage") : f.title || t("slides.untitled")}</span>
          </button>
          <span class="thumb-tools">
            <button class="icon-btn tiny" data-action="duplicate" title={t("slides.duplicate")} aria-label={t("slides.duplicate")} onclick={() => deckChange((text, d) => duplicateFrame(text, d, i))}><Icon name="copy" size={12} /></button>
            <button class="icon-btn tiny" data-action="delete" title={t("slides.delete")} aria-label={t("slides.delete")} onclick={() => deckChange((text, d) => deleteFrame(text, d, i))}><Icon name="trash" size={12} /></button>
          </span>
        </div>
      {/each}
      <div class="thumb-slot end" data-drop="slide:{deck.frames.length}">
        <button class="add-slide" onclick={() => addSlide("title-content")}><Icon name="plus" size={13} />{t("slides.newShort")}</button>
      </div>
    </nav>

    <main class="center" style:--slide-accent={accent}>
      {#if frame}
        <SlideCanvas
          title={frame.title}
          titlePage={frame.titlePage}
          {blocks}
          path={told?.path ?? null}
          {dir}
          {lang}
          {unit}
          steps={range ? range[1] - range[0] + 1 : 1}
          ratio={frameRatio}
          bind:selected={block}
          bind:focus
          onchange={changeBlock}
          onsplit={(i, first, second) => blockChange((tx, _f, bs) => (bs[i] ? splitBlock(tx, bs, i, first, second, unit) : null), true)}
          onremove={(i) => blockChange((tx, _f, bs) => (bs[i] ? { ...deleteBlock(tx, bs, i), select: -1 } : null))}
          ontitle={setFrameTitle}
          oninsert={(before, kind, variant) => void insertAt(before, kind, variant)}
          onduplicate={(i) => blockChange((tx, _f, bs) => (bs[i] ? duplicateBlock(tx, bs, i) : null))}
          ondelete={(i) => blockChange((tx, _f, bs) => (bs[i] ? { ...deleteBlock(tx, bs, i), select: -1 } : null))}
          onpicture={changePicture}
          ondropped={(p, c) => void dropped(p, c)}
        />
      {:else}
        <div class="nothing faint">{t("slides.empty")}</div>
      {/if}
    </main>

    <aside class="side" bind:clientWidth={sideWidth}>
      <div class="views" role="tablist" aria-label={t("slides.views")}>
        <button role="tab" class:on={view === "render"} aria-selected={view === "render"} data-view="render" onclick={() => show("render")}><Icon name="eye" size={13} />{t("slides.render")}</button>
        <button role="tab" class:on={view === "code"} aria-selected={view === "code"} data-view="code" onclick={() => show("code")}><Icon name="code" size={13} />{t("slides.code")}</button>
      </div>
      {#if view === "code" && frame && told?.path}
        <FrameCode text={frameText} path={told.path} onchange={codeChanged} />
        {#if codeProblem}<p class="problem">{t("slides.codeProblem")}</p>{/if}
      {:else}
        <div class="render">
          {#if doc && range && frame}
            <PageCanvas {doc} page={shownPage} width={renderWidth} height={renderWidth / frameRatio} {revision} />
          {:else if frame}
            <div class="waiting faint" style:height="{renderWidth / frameRatio}px">{told?.building ? t("slides.building") : t("slides.notBuilt")}</div>
          {/if}
        </div>
        {#if range && range[1] > range[0]}
          <div class="steps" role="group" aria-label={t("slides.steps")}>
            {#each Array.from({ length: range[1] - range[0] + 1 }, (_, k) => k) as k (k)}
              <button class="dot" class:on={k === step} aria-label={t("slides.step", { n: k + 1 })} onclick={() => (step = k)}>{k + 1}</button>
            {/each}
          </div>
        {/if}
        <p class="render-hint faint">{t("slides.renderHint")}</p>
      {/if}
      <label class="notes">
        <span class="faint">{t("slides.notes")}</span>
        <textarea bind:value={notesField} placeholder={t("slides.notesPlaceholder")} disabled={!frame} onfocus={() => (notesEditing = true)} onblur={saveNotes}></textarea>
      </label>
    </aside>
  {/if}

  {#if themeOpen && told?.path}
    <ThemeStudio
      text={told.text}
      path={told.path}
      {frameText}
      {titleFrame}
      onapply={(look) => {
        themeOpen = false;
        setLook(look);
      }}
      onclose={() => (themeOpen = false)}
    />
  {/if}

  {#if drag.carried}
    <div class="drag-ghost" style:left="{drag.x + 12}px" style:top="{drag.y + 8}px">{drag.carried.label}</div>
  {/if}
</div>

<style>
  .slides-mode {
    position: relative;
    display: grid;
    grid-template-columns: clamp(150px, 13vw, 186px) minmax(0, 1fr) clamp(250px, 23vw, 340px);
    grid-template-rows: 44px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    background: var(--bg);
    color: var(--text);
  }
  .bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
    min-width: 0;
  }
  .spacer {
    flex: 1;
  }
  .sep {
    width: 1px;
    height: 22px;
    margin: 0 6px;
    background: var(--border);
  }
  .insert-label {
    margin-right: 2px;
    font-size: 11.5px;
  }
  .insert-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text);
    font-size: 12px;
    cursor: grab;
    touch-action: none;
  }
  .insert-btn:hover {
    border-color: var(--border);
    background: var(--bg-hover);
  }
  .insert-btn:disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  @media (max-width: 1440px) {
    .insert-label {
      display: none;
    }
    .insert-btn {
      padding: 0 6px;
      font-size: 11.5px;
    }
  }
  @media (max-width: 1180px) {
    .insert-name {
      display: none;
    }
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .status.err {
    color: var(--error);
  }
  .btn.on {
    border-color: var(--accent);
  }
  .menu-wrap {
    position: relative;
  }
  .menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 6px);
    left: 0;
    display: flex;
    flex-direction: column;
    min-width: 210px;
    padding: 4px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
  }
  .menu.right {
    left: auto;
    right: 0;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--bg-hover);
  }
  .menu-label {
    padding: 6px 10px 2px;
    font-size: 11px;
  }
  .layouts {
    position: absolute;
    z-index: 40;
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    grid-template-columns: repeat(3, 120px);
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
  }
  .layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text);
    font-size: 11.5px;
    cursor: pointer;
  }
  .layout:hover {
    border-color: var(--accent);
  }
  .sketch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 6px 1fr;
    gap: 4px;
    width: 72px;
    height: 44px;
    padding: 5px;
    border-radius: 3px;
    background: var(--bg);
  }
  .sketch i {
    grid-column: 1 / -1;
    border-radius: 2px;
    background: var(--accent);
  }
  .sketch b {
    border-radius: 2px;
    background: var(--text-faint);
    opacity: 0.6;
  }
  .sketch.title-content b:first-of-type,
  .sketch.image b:first-of-type {
    grid-column: 1 / -1;
  }
  .sketch.title-content b:last-of-type,
  .sketch.image b:last-of-type,
  .sketch.title-only b,
  .sketch.blank b,
  .sketch.blank i {
    display: none;
  }
  .sketch.image b:first-of-type {
    margin: 0 14px;
    background: var(--text-muted);
  }
  .sketch.section i {
    grid-row: 1 / -1;
    align-self: center;
    height: 8px;
  }
  .sketch.section b {
    display: none;
  }
  .thumbs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px 16px;
    border-right: 1px solid var(--border);
    background: var(--bg-elev);
    overflow: auto;
  }
  .section {
    margin: 6px 4px 2px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .thumb-slot {
    position: relative;
    border-top: 3px solid transparent;
  }
  .thumb-slot.over {
    border-top-color: var(--accent);
  }
  .thumb {
    display: grid;
    grid-template-columns: 14px 1fr;
    gap: 3px 4px;
    width: 100%;
    padding: 5px 4px;
    border: 2px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    touch-action: none;
  }
  .thumb:hover {
    background: var(--bg-hover);
  }
  .thumb.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .thumb.moving {
    opacity: 0.4;
  }
  .number {
    grid-row: 1 / 3;
    font-size: 11px;
    color: var(--text-faint);
  }
  .picture {
    display: block;
    border-radius: 3px;
    background: var(--bg-input);
    overflow: hidden;
  }
  .name {
    grid-column: 2;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .thumb-tools {
    position: absolute;
    top: 8px;
    right: 6px;
    display: flex;
    gap: 2px;
    opacity: 0;
  }
  .thumb-slot:hover .thumb-tools {
    opacity: 1;
  }
  .thumb-tools :global(.icon-btn) {
    width: 22px;
    height: 22px;
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
  }
  .add-slide {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 32px;
    margin-top: 6px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .add-slide:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-left: 1px solid var(--border);
    background: var(--bg-elev);
    min-height: 0;
    overflow: auto;
  }
  .views {
    display: flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
  }
  .views button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .views button.on {
    background: var(--accent);
    color: var(--accent-contrast);
    font-weight: 600;
  }
  .render {
    display: flex;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    border-radius: 3px;
  }
  .render-hint {
    margin: 0;
    font-size: 11px;
  }
  .waiting {
    display: grid;
    place-items: center;
    width: 100%;
    font-size: 12px;
  }
  .steps {
    display: flex;
    justify-content: center;
    gap: 6px;
  }
  .dot {
    min-width: 26px;
    height: 22px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--bg-input);
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .dot.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .problem {
    margin: 0;
    font-size: 11.5px;
    color: var(--warning);
  }
  .side :global(.frame-code) {
    flex: 1;
    min-height: 220px;
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: auto;
    font-size: 12px;
  }
  .notes textarea {
    min-height: 110px;
    resize: vertical;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .nothing {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-muted);
  }
  .drag-ghost {
    position: fixed;
    z-index: 100;
    padding: 4px 10px;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 12px;
    pointer-events: none;
    box-shadow: var(--shadow);
  }
</style>
