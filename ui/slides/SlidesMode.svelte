<script lang="ts">
  // The slides mode: the window shows the slides of a Beamer deck as
  // thumbnails on the left (added from a layout, duplicated, deleted, moved
  // by dragging or with Alt and the arrows), the slide chosen large in the
  // middle with its steps and the notes of the speaker under it, and on the
  // right its title and its content in blocks (the one chosen outlined on
  // the slide, a click on the slide choosing the one it falls on), or its
  // LaTeX. The text stays with the application (its editor,
  // left behind, its undo, its builds): the mode is given a host that tells
  // it the text and makes the changes it asks for.
  import { onDestroy, onMount } from "svelte";
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { closePdf, loadPdf, pageTexts } from "$lib/pdf/pdfjs";
  import { type DeckEdit, deleteFrame, duplicateFrame, framePages, insertFrame, type Layout, LAYOUTS, moveFrame, pagesOf, parseDeck, setNotes, setTitle } from "$lib/slides/deck";
  import { addToColumn, type Block, type BlockEdit, deleteBlock, duplicateBlock, frameBlocks, indentUnit, insertBlock, moveBlockTo, moveToColumn, newBlock, replaceBlock } from "$lib/slides/blocks";
  import type { Frame } from "$lib/slides/deck";
  import { choosePicture, isPicture, pictureFor } from "$lib/slides/pictures";
  import { blockAt, type Box, dropTarget, type DropTarget, partAt, partsOf, type Placement, placeBlocks, withPart } from "$lib/slides/place";
  import type { SlidesHost, SlidesState } from "$lib/slides/host";
  import { type DeckExport, exportNames, exportText } from "$lib/slides/exports";
  import { type DeckLook, preambleEnd, writeLook } from "$lib/slides/theme";
  import Icon from "../components/common/Icon.svelte";
  import BlockPanel from "./BlockPanel.svelte";
  import ComponentBar, { BLOCK_TYPE, type Component, COMPONENT_TYPE } from "./ComponentBar.svelte";
  import SlideTools from "./SlideTools.svelte";
  import TextTools from "./TextTools.svelte";
  import FrameCode from "./FrameCode.svelte";
  import PresenterView from "./PresenterView.svelte";
  import ThemePanel from "./ThemePanel.svelte";
  import PageCanvas from "./PageCanvas.svelte";

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

  // ------------------------------------------------------- what is asked

  /** A change of the text, asked of the main window on the version it told. */
  function apply(edit: DeckEdit | null) {
    if (!edit || !told) return;
    host.edit({ version: told.version, changes: [{ from: edit.from, to: edit.to, insert: edit.insert }] });
    select(edit.select);
  }

  function replaceAll(text: string, at: number) {
    if (!told) return;
    host.edit({ version: told.version, changes: [{ from: 0, to: told.text.length, insert: text }] });
    select(at);
  }

  function select(i: number) {
    if (i !== selected) {
      step = 0;
      block = -1;
    }
    selected = i;
  }

  // ---------------------------------------------------------- the blocks

  /** The block of the slide chosen (-1: none). */
  let block = $state(-1);
  const blocks = $derived<Block[]>(frame && told ? frameBlocks(told.text, frame) : []);
  const unit = $derived(indentUnit(told?.text ?? ""));

  // A change of a block is made on the text as it is when it is asked: one
  // after the other, the next one waiting for the text the last one gave.
  type Make = (text: string, frame: Frame, blocks: Block[]) => BlockEdit | null;
  let asked: { version: number; timer: ReturnType<typeof setTimeout> } | null = null;
  const waiting: Make[] = [];
  function blockEdit(make: Make) {
    waiting.push(make);
    if (!asked) nextAsked();
  }
  function nextAsked() {
    if (asked) clearTimeout(asked.timer);
    asked = null;
    const s = told;
    const make = waiting.shift();
    if (!make || !s) return;
    const f = parseDeck(s.text).frames[selected];
    const edit = f ? make(s.text, f, frameBlocks(s.text, f)) : null;
    if (!edit) return nextAsked();
    // Not answered (refused, or the text as it was): the next one is not held.
    asked = { version: s.version, timer: setTimeout(nextAsked, 1500) };
    host.edit({ version: s.version, changes: [{ from: edit.from, to: edit.to, insert: edit.insert }] });
    block = edit.select;
  }

  /** Where the blocks are on the slide: found by their words in the texts of its last step (all shown). */
  let placement = $state<Placement | null>(null);
  let placedSlide = -1;
  const placed = $derived(placement?.boxes ?? []);
  $effect(() => {
    const d = doc;
    const r = range;
    const bs = blocks;
    const f = frame;
    void revision;
    if (!d || !r || !f || r[1] > d.numPages) {
      placement = null;
      return;
    }
    // The last placement of the same slide stays meanwhile: a click falls on it, not on nothing.
    const slide = selected;
    if (placedSlide !== slide) placement = null;
    let gone = false;
    void (async () => {
      const page = await d.getPage(r[1]);
      const viewport = page.getViewport({ scale: 1 });
      const items = await pageTexts(page).catch(() => null);
      if (gone || !items) return;
      const texts = items.flatMap((it) => {
        if (!it.str.trim()) return [];
        const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
        const height = it.height || Math.hypot(it.transform[2], it.transform[3]);
        return [{ str: it.str, x, y: y - height, width: it.width, height }];
      });
      placement = placeBlocks(texts, bs, `${f.title} ${f.subtitle}`, { width: viewport.width, height: viewport.height });
      placedSlide = slide;
    })();
    return () => {
      gone = true;
    };
  });
  /** Where the block chosen is on the slide, in points of the page. */
  const marked = $derived(placed[block] ?? null);

  /** Where a click falls on the page, in its points (null: not on it). */
  function pointOf(e: MouseEvent): { x: number; y: number } | null {
    const canvas = (e.currentTarget as HTMLElement).querySelector("canvas");
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    return { x: ((e.clientX - r.left) / r.width) * pageSize.width, y: ((e.clientY - r.top) / r.height) * pageSize.height };
  }

  /** A click on the slide: the block it falls on is chosen. */
  function pickOnSlide(e: MouseEvent) {
    const p = pointOf(e);
    if (!p || inplace) return;
    const at = blockAt(placed, p.x, p.y);
    if (at < 0) return;
    block = at;
    if (view !== "interface") show("interface");
  }

  // ------------------------------------------------- written on the slide

  /** A text of the slide written where it is drawn: a part of a block, or the title. */
  let inplace = $state<{ block: number; part: number; kind: string; box: Box; size: number; text: string; lines: boolean } | null>(null);

  /** A double click on a text of the slide: it is written there. */
  function writeOnSlide(e: MouseEvent) {
    const p = pointOf(e);
    if (!p || !placement || !frame) return;
    const t = placement.title;
    if (t && !frame.titlePage && p.x >= t.x - 3 && p.x <= t.x + t.width + 3 && p.y >= t.y - 3 && p.y <= t.y + t.height + 3) {
      inplace = { block: -1, part: 0, kind: "title", box: t, size: t.height, text: frame.title, lines: false };
      return;
    }
    const found = partAt(placement, blocks, p.x, p.y);
    if (!found) return;
    const b = blocks[found.block];
    block = found.block;
    const lines = b.kind === "text" || b.kind === "formula" || b.kind === "columns" || (b.kind === "box" && found.part === 1);
    inplace = { ...found, kind: b.kind, text: partsOf(b)![found.part], lines };
  }

  /** What was written on the slide, written in the text (`keep`: false when it is given up). */
  function closeInplace(value: string, keep: boolean) {
    const w = inplace;
    inplace = null;
    if (!w || !keep || value.trim() === w.text.trim() || !told) return;
    if (w.block < 0) {
      if (frame) apply(setTitle(told.text, deck, selected, value));
      return;
    }
    blockEdit((tx, _f, bs) => (bs[w.block]?.kind === w.kind ? replaceBlock(tx, bs, w.block, withPart(bs[w.block], w.part, value)) : null));
  }

  function inplaceKey(e: KeyboardEvent) {
    const field = e.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    if (e.key === "Escape") {
      e.preventDefault();
      closeInplace(field.value, false);
    } else if (e.key === "Enter" && (!inplace?.lines || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      closeInplace(field.value, true);
    }
  }

  // ------------------------------------------ dragged, dropped, the tools

  /** What is dragged over the slide: a component, or block `n` moved. */
  let dragComponent = $state<Component | null>(null);
  let dragBlock = $state<number | null>(null);
  /** Where it would go. */
  let dropAt = $state<DropTarget | null>(null);

  const carried = (e: DragEvent) => {
    const types = [...(e.dataTransfer?.types ?? [])];
    return types.includes(COMPONENT_TYPE) || types.includes(BLOCK_TYPE) || dragComponent !== null || dragBlock !== null;
  };
  function componentOf(e: DragEvent): Component | null {
    try {
      const raw = e.dataTransfer?.getData(COMPONENT_TYPE);
      return raw ? (JSON.parse(raw) as Component) : null;
    } catch {
      return null;
    }
  }
  const blockOf = (e: DragEvent) => {
    const raw = e.dataTransfer?.getData(BLOCK_TYPE);
    return raw ? Number(raw) : null;
  };

  function dragOverSlide(e: DragEvent) {
    if (!carried(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = dragBlock !== null ? "move" : "copy";
    const p = pointOf(e);
    dropAt = p ? dropTarget(placement, blocks, p.x, p.y, pageSize, dragBlock ?? -1) : null;
  }

  function dropOnSlide(e: DragEvent) {
    if (!carried(e)) return;
    e.preventDefault();
    const p = pointOf(e);
    const moving = blockOf(e) ?? dragBlock;
    const target = p ? dropTarget(placement, blocks, p.x, p.y, pageSize, moving ?? -1) : null;
    const component = componentOf(e) ?? dragComponent;
    dropAt = null;
    dragComponent = null;
    dragBlock = null;
    if (target) put(target, component, moving);
  }

  /** A component added, or block `moving` moved, where it was dropped. */
  function put(target: DropTarget, component: Component | null, moving: number | null) {
    if (component) {
      const made = newBlock(component.kind, lang, component.variant);
      blockEdit((tx, f, bs) => {
        if (target.kind === "between") return insertBlock(tx, f, bs, Math.min(target.before, bs.length) - 1, made);
        const c = bs[target.block];
        return c?.kind === "columns" ? { ...replaceBlock(tx, bs, target.block, addToColumn(c, target.column, made, unit)), select: target.block } : null;
      });
    } else if (moving !== null) {
      blockEdit((tx, _f, bs) => (target.kind === "column" ? moveToColumn(tx, bs, moving, target.block, target.column, unit) : moveBlockTo(tx, bs, moving, target.before)));
    }
  }

  /** A component added with a click: after the block chosen, else at the end. */
  function addComponent(c: Component) {
    const made = newBlock(c.kind, lang, c.variant);
    const after = block >= 0 ? block : blocks.length - 1;
    blockEdit((tx, f, bs) => insertBlock(tx, f, bs, Math.min(after, bs.length - 1), made));
  }

  /** The block chosen, changed by one of its tools. */
  function toolChange(edit: (b: Block) => Block) {
    const i = block;
    const kind = blocks[i]?.kind;
    blockEdit((tx, _f, bs) => (bs[i]?.kind === kind ? replaceBlock(tx, bs, i, edit(bs[i])) : null));
  }

  async function toolPicture() {
    if (!told?.path) return;
    const chosen = await choosePicture(told.path, told.text);
    if (chosen) toolChange((b) => ({ ...b, path: chosen }));
  }

  /** The block chosen written in place: its first part (the body of a box). */
  function writeBlock() {
    const b = blocks[block];
    const parts = b ? partsOf(b) : null;
    if (!b || !parts || !marked) return;
    const part = b.kind === "box" ? 1 : 0;
    const heights = placement?.texts.filter((_, k) => placement!.owner[k] === block).map((x) => x.height) ?? [];
    const lines = b.kind === "text" || b.kind === "formula" || b.kind === "columns" || (b.kind === "box" && part === 1);
    inplace = { block, part, kind: b.kind, box: marked, size: heights.length ? Math.min(...heights) : 11, text: parts[part], lines };
  }

  // Pictures dropped from the system: the application hands them to the slide.
  let rootEl = $state<HTMLElement | null>(null);
  /** A point of the screen on the page shown, in its points (null: not on it). */
  function pointAt(x: number, y: number): { x: number; y: number } | null {
    const canvas = rootEl?.querySelector<HTMLCanvasElement>(".slide-box canvas");
    const r = canvas?.getBoundingClientRect();
    if (!r?.width || x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    return { x: ((x - r.left) / r.width) * pageSize.width, y: ((y - r.top) / r.height) * pageSize.height };
  }
  async function dropFiles(paths: string[], x: number, y: number) {
    dropAt = null;
    const pictures = paths.filter(isPicture);
    if (!pictures.length || !told?.path) return;
    const p = pointAt(x, y);
    const target: DropTarget = p ? dropTarget(placement, blocks, p.x, p.y, pageSize) : { kind: "between", before: blocks.length, line: { x: 0, y: 0, width: 0, height: 0 } };
    // Put at one place one after the other: in their order.
    for (const file of target.kind === "between" ? [...pictures].reverse() : pictures) {
      const path = await pictureFor(file, told.path, told.text);
      if (path) put(target, { kind: "image", variant: path }, null);
    }
  }
  $effect(() => {
    const el = rootEl;
    if (!el) return;
    const over = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      const p = pointAt(x, y);
      dropAt = p ? dropTarget(placement, blocks, p.x, p.y, pageSize) : null;
    };
    const dropped = (e: Event) => {
      const { paths, x, y } = (e as CustomEvent<{ paths: string[]; x: number; y: number }>).detail;
      void dropFiles(paths, x, y);
    };
    const left = () => (dropAt = null);
    el.addEventListener("raytex-files-over", over);
    el.addEventListener("raytex-files", dropped);
    el.addEventListener("raytex-files-leave", left);
    return () => {
      el.removeEventListener("raytex-files-over", over);
      el.removeEventListener("raytex-files", dropped);
      el.removeEventListener("raytex-files-leave", left);
    };
  });

  let inplaceField = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

  /** The field opened on the slide takes the keys at once. */
  function focusField(el: HTMLElement) {
    el.focus();
    (el as HTMLInputElement).select?.();
  }

  const lang = $derived(i18n.lang === "fr" ? "fr" : "en");
  let layoutsOpen = $state(false);

  function add(layout: Layout) {
    layoutsOpen = false;
    if (told) apply(insertFrame(told.text, deck, deck.frames.length ? selected : -1, layout, lang));
  }

  function duplicate() {
    if (told) apply(duplicateFrame(told.text, deck, selected));
  }

  function remove() {
    if (told && frame) apply(deleteFrame(told.text, deck, selected));
  }

  // Titles and notes: written when the field is left (or after a pause).
  let titleField = $state("");
  let notesField = $state("");
  let editing = $state<"title" | "notes" | null>(null);
  $effect(() => {
    if (editing !== "title") titleField = frame?.title ?? "";
    if (editing !== "notes") notesField = frame?.notes.map((n) => n.text).join("\n\n") ?? "";
  });

  function saveTitle() {
    editing = null;
    if (told && frame && titleField.trim() !== frame.title) apply(setTitle(told.text, deck, selected, titleField));
  }

  function saveNotes() {
    editing = null;
    const now = frame?.notes.map((n) => n.text).join("\n\n") ?? "";
    if (told && frame && notesField.trim() !== now.trim()) apply(setNotes(told.text, deck, selected, notesField));
  }

  // -------------------------------------------------------- dragging

  let dragged = $state<number | null>(null);
  let over = $state<number | null>(null);

  function drop(to: number) {
    const from = dragged;
    dragged = null;
    over = null;
    if (from === null || !told || from === to) return;
    const moved = moveFrame(told.text, deck, from, to);
    if (moved) replaceAll(moved.text, moved.select);
  }

  /** The slide chosen moved up or down by one. */
  function shift(by: number) {
    if (!told) return;
    const moved = moveFrame(told.text, deck, selected, selected + by);
    if (moved) replaceAll(moved.text, moved.select);
  }

  function key(e: KeyboardEvent) {
    // While presenting, the keys are the presenter's.
    if (presenting !== null) return;
    if (e.key === "F5") {
      e.preventDefault();
      present(e.shiftKey ? (range?.[0] ?? 1) : 1);
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, .cm-editor, [role='dialog']")) return;
    if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      shift(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      select(Math.max(0, Math.min(deck.frames.length - 1, selected + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "ArrowRight" && range && shownPage < range[1]) step++;
    else if (e.key === "ArrowLeft" && step > 0) step--;
    else if (e.key === "Escape" && (layoutsOpen || exportsOpen)) layoutsOpen = exportsOpen = false;
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicate();
    }
  }

  // ------------------------------------------------------ the large slide

  let stage = $state<HTMLElement | null>(null);
  let stageSize = $state({ width: 0, height: 0 });
  $effect(() => {
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => (stageSize = { width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage);
    return () => observer.disconnect();
  });
  /** The size of the pages of the deck, in points; the slides are always shown lying down (16:9, 4:3…). */
  let pageSize = $state({ width: 16, height: 9 });
  const pageRatio = $derived(pageSize.width / pageSize.height);
  $effect(() => {
    const d = doc;
    if (!d) return;
    void d.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      pageSize = { width: v.width, height: v.height };
    });
  });
  const frameRatio = $derived(pageRatio >= 1 ? pageRatio : 16 / 9);
  const slideWidth = $derived(Math.max(0, Math.min(stageSize.width - 32, (stageSize.height - 24) * frameRatio)));
  /** How the page is drawn in the frame: its scale, and where it begins. */
  const drawnAt = $derived.by(() => {
    const height = slideWidth / frameRatio;
    const scale = Math.min(slideWidth / pageSize.width, height / pageSize.height);
    return { scale, left: (slideWidth - pageSize.width * scale) / 2, top: (height - pageSize.height * scale) / 2 };
  });

  // --------------------------------------------- the interface, or the code

  const VIEW_KEY = "raytex.slides.view";
  type View = "interface" | "code" | "look";
  let view = $state<View>(
    (() => {
      try {
        const kept = localStorage.getItem(VIEW_KEY);
        return kept === "code" || kept === "look" ? kept : "interface";
      } catch {
        return "interface";
      }
    })(),
  );
  function show(v: View) {
    view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered */
    }
  }
  const frameText = $derived(frame && told ? told.text.slice(frame.from, frame.to) : "");
  /** The code of the slide typed: written in its place, while it is still one slide. */
  let codeProblem = $state(false);
  function codeChanged(text: string) {
    if (!told || !frame) return;
    const one = /^\s*\\begin\s*\{frame\}/.test(text) && /\\end\s*\{frame\}\s*$/.test(text) && (text.match(/\\begin\s*\{frame\}/g)?.length ?? 0) === 1;
    codeProblem = !one;
    if (!one || text === frameText) return;
    host.edit({ version: told.version, changes: [{ from: frame.from, to: frame.to, insert: text.trim() }] });
  }

  /** A look chosen: the preamble written again (the rest of the deck as it was). */
  function setLook(look: Partial<DeckLook>) {
    if (!told) return;
    const end = preambleEnd(told.text);
    const next = writeLook(told.text, look);
    host.edit({ version: told.version, changes: [{ from: 0, to: end, insert: next.slice(0, next.length - (told.text.length - end)) }] });
  }

  // ------------------------------------------------------------ presenting

  /** The page the presentation began at, while it goes on. */
  let presenting = $state<number | null>(null);
  function present(page: number) {
    if (!doc || !told?.pdf) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    presenting = page;
  }
  let exportsOpen = $state(false);
  /** An export of the deck, built apart from a text of its own. */
  function exportDeck(e: DeckExport) {
    exportsOpen = false;
    if (!told) return;
    host.command({ kind: "export", ...exportNames(e, lang), text: exportText(told.text, e) });
  }

  /** The presentation ended at a page: its slide is chosen. */
  function endPresenting(page: number) {
    presenting = null;
    const k = pages.findIndex(([a, b]) => page >= a && page <= b);
    if (k >= 0) select(k);
  }

  const sections = $derived(deck.frames.map((f, i) => (i === 0 || f.section !== deck.frames[i - 1].section ? f.section : null)));
</script>

<svelte:window
  onkeydown={key}
  onpointerdown={(e) => {
    const target = e.target as HTMLElement;
    if (layoutsOpen && !target.closest(".bar .add:not(.exports)")) layoutsOpen = false;
    if (exportsOpen && !target.closest(".bar .exports")) exportsOpen = false;
  }}
/>

<div class="slides-mode" bind:this={rootEl} data-pages={doc?.numPages ?? 0} data-drawn={doc && frame ? "yes" : "no"} data-placed={placed.filter(Boolean).length}>
  {#if presenting !== null && doc && told?.pdf}
    <PresenterView {doc} pdf={told.pdf} built={told.built} {pages} frames={deck.frames} start={presenting} ratio={frameRatio} {revision} onend={endPresenting} />
  {/if}
  <header class="bar">
    <button class="btn small" data-action="leave" title={t("slides.leaveHint")} onclick={() => host.command({ kind: "leave" })}><Icon name="arrow-left" size={13} />{t("slides.leave")}</button>
    <span class="sep"></span>
    <div class="add">
      <button class="btn small primary" onclick={() => (layoutsOpen = !layoutsOpen)} disabled={!deck.beamer}><Icon name="plus" size={14} />{t("slides.new")}</button>
      {#if layoutsOpen}
        <div class="layouts" role="menu">
          {#each LAYOUTS as l (l)}
            <button class="layout" role="menuitem" data-layout={l} onclick={() => add(l)}>
              <span class="sketch {l}" aria-hidden="true"><i></i><b></b><b></b></span>
              <span>{t(`slides.layout.${l}`)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="icon-btn" data-action="duplicate" title={t("slides.duplicate")} aria-label={t("slides.duplicate")} disabled={!frame} onclick={duplicate}><Icon name="copy" size={15} /></button>
    <button class="icon-btn" data-action="up" title={t("slides.up")} aria-label={t("slides.up")} disabled={!frame || selected === 0} onclick={() => shift(-1)}><Icon name="chevron-up" size={15} /></button>
    <button class="icon-btn" data-action="down" title={t("slides.down")} aria-label={t("slides.down")} disabled={!frame || selected >= deck.frames.length - 1} onclick={() => shift(1)}><Icon name="chevron-down" size={15} /></button>
    <button class="icon-btn" data-action="delete" title={t("slides.delete")} aria-label={t("slides.delete")} disabled={!frame} onclick={remove}><Icon name="trash" size={15} /></button>
    <span class="spacer"></span>
    <div class="add exports">
      <button class="btn small" data-action="exports" disabled={!deck.beamer} onclick={() => (exportsOpen = !exportsOpen)}><Icon name="download" size={13} />{t("slides.export")}<Icon name="chevron-down" size={12} /></button>
      {#if exportsOpen}
        <div class="menu" role="menu">
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
    {#if told?.building}<span class="status"><span class="spinner"></span>{t("slides.building")}</span>{:else if told?.failed}<span class="status err"><Icon name="alert-circle" size={13} />{t("slides.failed")}</span>{/if}

  </header>

  {#if told && !deck.beamer}
    <div class="nothing"><Icon name="presentation" size={28} /><p>{t("slides.notBeamer")}</p></div>
  {:else}
    <nav class="thumbs" aria-label={t("slides.list")}>
      {#each deck.frames as f, i (f.from)}
        {#if sections[i]}<div class="section">{sections[i]}</div>{/if}
        <button
          class="thumb"
          class:active={i === selected}
          class:over={over === i && dragged !== i}
          draggable="true"
          data-index={i}
          onclick={() => select(i)}
          ondragstart={() => (dragged = i)}
          ondragover={(e) => {
            e.preventDefault();
            over = i;
          }}
          ondragleave={() => over === i && (over = null)}
          ondrop={(e) => {
            e.preventDefault();
            drop(i);
          }}
          ondragend={() => ((dragged = null), (over = null))}
        >
          <span class="number">{i + 1}</span>
          <span class="picture">
            {#if doc}<PageCanvas {doc} page={pagesOf(pages, deck.frames.length, i)[0]} width={150} height={150 / frameRatio} {revision} />{:else}<span class="blank" style:height="{150 / frameRatio}px"></span>{/if}
          </span>
          <span class="name ellipsis" title={f.title}>{f.titlePage ? t("slides.titlePage") : f.title || t("slides.untitled")}</span>
        </button>
      {/each}
      {#if !deck.frames.length}<p class="faint empty">{t("slides.empty")}</p>{/if}
    </nav>

    <main class="center">
      <ComponentBar onadd={addComponent} ondrag={(c) => (dragComponent = c)} />
      <div class="stage" bind:this={stage}>
        {#if doc && frame && range}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div
            class="slide-box"
            title={t("slides.slideHint")}
            onclick={pickOnSlide}
            ondblclick={writeOnSlide}
            ondragover={dragOverSlide}
            ondragleave={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && (dropAt = null)}
            ondrop={dropOnSlide}
          >
            <PageCanvas {doc} page={shownPage} width={slideWidth} height={slideWidth / frameRatio} {revision} />
            {#if marked && view === "interface"}
              <span
                class="marked"
                style:left="{drawnAt.left + marked.x * drawnAt.scale - 4}px"
                style:top="{drawnAt.top + marked.y * drawnAt.scale - 4}px"
                style:width="{marked.width * drawnAt.scale + 8}px"
                style:height="{marked.height * drawnAt.scale + 8}px"
              >
                <span
                  class="grip"
                  draggable="true"
                  title={t("slides.tools.drag")}
                  role="button"
                  tabindex="-1"
                  ondragstart={(e) => {
                    e.dataTransfer?.setData(BLOCK_TYPE, String(block));
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                    dragBlock = block;
                  }}
                  ondragend={() => ((dragBlock = null), (dropAt = null))}><Icon name="grip" size={12} /></span>
              </span>
              {#if blocks[block] && !inplace && !dropAt}
                {@const above = drawnAt.top + marked.y * drawnAt.scale - 46}
                <div class="tools-at" style:left="{Math.max(0, drawnAt.left + marked.x * drawnAt.scale - 4)}px" style:top="{above >= -8 ? above : drawnAt.top + (marked.y + marked.height) * drawnAt.scale + 10}px">
                  <SlideTools
                    block={blocks[block]}
                    steps={range ? range[1] - range[0] + 1 : 1}
                    {unit}
                    {lang}
                    writable={!!partsOf(blocks[block])}
                    onchange={toolChange}
                    onduplicate={() => blockEdit((tx, _f, bs) => (bs[block] ? duplicateBlock(tx, bs, block) : null))}
                    ondelete={() => blockEdit((tx, _f, bs) => (bs[block] ? deleteBlock(tx, bs, block) : null))}
                    onwrite={writeBlock}
                    onpicture={toolPicture}
                  />
                </div>
              {/if}
            {/if}
            {#if dropAt}
              {#if dropAt.kind === "between"}
                <span class="drop-line" style:left="{drawnAt.left + dropAt.line.x * drawnAt.scale}px" style:top="{drawnAt.top + dropAt.line.y * drawnAt.scale - 1}px" style:width="{dropAt.line.width * drawnAt.scale}px"></span>
              {:else}
                <span class="drop-box" style:left="{drawnAt.left + dropAt.box.x * drawnAt.scale - 3}px" style:top="{drawnAt.top + dropAt.box.y * drawnAt.scale - 3}px" style:width="{dropAt.box.width * drawnAt.scale + 6}px" style:height="{dropAt.box.height * drawnAt.scale + 6}px"></span>
              {/if}
            {/if}
            {#if inplace}
              {@const w = inplace}
              {@const left = drawnAt.left + w.box.x * drawnAt.scale - 6}
              {@const width = Math.min(slideWidth - left - 4, Math.max(w.box.width * drawnAt.scale + 40, 220))}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="inplace"
                style:left="{left}px"
                style:top="{drawnAt.top + w.box.y * drawnAt.scale - 6}px"
                style:width="{width}px"
                style:font-size="{Math.max(12, Math.min(26, w.size * drawnAt.scale * 0.85))}px"
                onclick={(e) => e.stopPropagation()}
                ondblclick={(e) => e.stopPropagation()}
              >
                <div class="inplace-tools"><TextTools target={() => inplaceField} /></div>
                {#if w.lines}
                  <textarea
                    bind:this={inplaceField}
                    use:focusField
                    rows={Math.max(2, w.text.split("\n").length)}
                    value={w.text}
                    aria-label={t("slides.writeHere")}
                    onkeydown={inplaceKey}
                    onblur={(e) => closeInplace(e.currentTarget.value, true)}
                  ></textarea>
                {:else}
                  <input bind:this={inplaceField} use:focusField value={w.text} aria-label={t("slides.writeHere")} onkeydown={inplaceKey} onblur={(e) => closeInplace(e.currentTarget.value, true)} />
                {/if}
              </div>
            {/if}
          </div>
        {:else if frame}
          <div class="waiting faint">{told?.building ? t("slides.building") : t("slides.notBuilt")}</div>
        {/if}
      </div>
      {#if range && range[1] > range[0]}
        <div class="steps" role="group" aria-label={t("slides.steps")}>
          {#each Array.from({ length: range[1] - range[0] + 1 }, (_, k) => k) as k (k)}
            <button class="dot" class:on={k === step} aria-label={t("slides.step", { n: k + 1 })} onclick={() => (step = k)}>{k + 1}</button>
          {/each}
        </div>
      {/if}
      <label class="notes">
        <span class="faint">{t("slides.notes")}</span>
        <textarea bind:value={notesField} placeholder={t("slides.notesPlaceholder")} disabled={!frame} onfocus={() => (editing = "notes")} onblur={saveNotes}></textarea>
      </label>
    </main>

    <aside class="side" class:code={view !== "interface"}>
      <div class="views" role="tablist" aria-label={t("slides.views")}>
        <button role="tab" class:on={view === "interface"} aria-selected={view === "interface"} data-view="interface" onclick={() => show("interface")}><Icon name="layout" size={13} />{t("slides.interface")}</button>
        <button role="tab" class:on={view === "code"} aria-selected={view === "code"} data-view="code" onclick={() => show("code")}><Icon name="code" size={13} />{t("slides.code")}</button>
        <button role="tab" class:on={view === "look"} aria-selected={view === "look"} data-view="look" onclick={() => show("look")}><Icon name="palette" size={13} />{t("slides.look")}</button>
      </div>
      {#if view === "look" && told?.path}
        <ThemePanel text={told.text} path={told.path} {frameText} onlook={setLook} />
      {:else if frame && view === "code" && told?.path}
        <FrameCode text={frameText} path={told.path} onchange={codeChanged} />
        {#if codeProblem}<p class="problem">{t("slides.codeProblem")}</p>{/if}
      {:else if frame}
        <label class="field">
          <span>{t("slides.title")}</span>
          <input class="input" bind:value={titleField} disabled={frame.titlePage} onfocus={() => (editing = "title")} onblur={saveTitle} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
        </label>
        {#if frame.options}<p class="faint options">{t("slides.options", { options: frame.options })}</p>{/if}
        <BlockPanel text={told?.text ?? ""} {blocks} {unit} path={told?.path ?? null} {lang} steps={range ? range[1] - range[0] + 1 : 1} bind:selected={block} onedit={blockEdit} />
        <button class="btn small reveal" data-action="reveal" onclick={() => host.command({ kind: "reveal", line: frame!.line })}><Icon name="code" size={13} />{t("slides.reveal")}</button>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .slides-mode {
    position: relative;
    display: grid;
    grid-template-columns: 196px minmax(0, 1fr) var(--side, 340px);
    grid-template-rows: 40px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    background: var(--bg);
    color: var(--text);
  }
  .bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .spacer {
    flex: 1;
  }
  .sep {
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: var(--border);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .status.err {
    color: var(--error);
  }
  .add {
    position: relative;
  }
  .layouts {
    position: absolute;
    z-index: 20;
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
  .menu {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    right: 0;
    display: flex;
    flex-direction: column;
    min-width: 230px;
    padding: 4px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
  }
  .menu button {
    height: 28px;
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
  /* A layout drawn small: a title bar and its blocks. */
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
    gap: 6px;
    padding: 10px 10px 16px;
    border-right: 1px solid var(--border);
    background: var(--bg-elev);
    overflow: auto;
  }
  .section {
    margin: 6px 2px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .thumb {
    display: grid;
    grid-template-columns: 16px 1fr;
    grid-template-rows: auto auto;
    gap: 3px 6px;
    padding: 5px;
    border: 2px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .thumb:hover {
    background: var(--bg-hover);
  }
  .thumb.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .thumb.over {
    border-top-color: var(--accent);
  }
  .number {
    grid-row: 1 / 3;
    font-size: 11px;
    color: var(--text-faint);
  }
  .picture {
    display: block;
    min-height: 40px;
  }
  .blank {
    display: block;
    width: 150px;
    height: 84px;
    border-radius: 3px;
    background: var(--bg-input);
  }
  .name {
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .empty {
    font-size: 12px;
  }
  .center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg-panel);
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 12px 16px;
  }
  .slide-box {
    position: relative;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    border-radius: 3px;
    cursor: pointer;
  }
  .grip {
    position: absolute;
    top: -11px;
    left: -11px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    pointer-events: auto;
    cursor: grab;
  }
  .tools-at {
    position: absolute;
    z-index: 6;
  }
  .drop-line {
    position: absolute;
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
    pointer-events: none;
  }
  .drop-box {
    position: absolute;
    border: 2px dashed var(--accent);
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    pointer-events: none;
  }
  .inplace-tools {
    position: absolute;
    bottom: calc(100% + 6px);
    left: -2px;
  }
  .inplace {
    position: absolute;
    z-index: 5;
    display: flex;
    padding: 3px;
    border: 2px solid var(--accent);
    border-radius: 5px;
    background: #fff;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }
  .inplace input,
  .inplace textarea {
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: 0;
    outline: none;
    background: none;
    color: #1a1a1a;
    font: inherit;
    font-family: var(--font-mono);
    resize: vertical;
  }
  .marked {
    position: absolute;
    border: 2px solid var(--accent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    pointer-events: none;
  }
  .reveal {
    align-self: flex-start;
  }
  .waiting {
    font-size: 13px;
  }
  .steps {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding-bottom: 8px;
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
  .notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 130px;
    padding: 8px 16px 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
    font-size: 12px;
  }
  .notes textarea {
    flex: 1;
    resize: none;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .slides-mode:has(.side.code) {
    --side: 440px;
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
  .problem {
    margin: 0;
    font-size: 11.5px;
    color: var(--warning);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-left: 1px solid var(--border);
    background: var(--bg-elev);
    overflow: auto;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .options {
    margin: 0;
    font-size: 11.5px;
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
</style>
