<script lang="ts">
  // The slides mode: the slides of a Beamer deck as thumbnails on the left
  // (added from a layout, duplicated, deleted, moved by dragging), the slide
  // chosen large in the middle with its steps and the notes of the speaker
  // under it, and its title on the right. The text stays in the main window
  // (its editor, its undo, its builds): this window shows it and asks for
  // changes.
  import { onDestroy, onMount } from "svelte";
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { closePdf, loadPdf } from "$lib/pdf/pdfjs";
  import { type DeckEdit, deleteFrame, duplicateFrame, framePages, insertFrame, type Layout, LAYOUTS, moveFrame, pagesOf, parseDeck, setNotes, setTitle } from "$lib/slides/deck";
  import { SLIDES_LABEL, type SlidesState, type SlidesTest } from "$lib/slideswindow";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Icon from "../components/common/Icon.svelte";
  import PageCanvas from "./PageCanvas.svelte";

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

  let unlisten: (() => void) | null = null;
  onMount(async () => {
    unlisten = await ipc.on("slides-window:state", (next) => {
      const first = told === null;
      const rebuilt = !told || told.built !== next.built || told.pdf !== next.pdf;
      const cursorMoved = !told || told.cursorLine !== next.cursorLine;
      told = next;
      i18n.lang = next.lang;
      document.documentElement.dataset.theme = next.theme;
      document.documentElement.lang = next.lang;
      if (rebuilt) void reload(next);
      // The slide the cursor of the editor is in, when it moves there.
      if ((first || cursorMoved) && next.cursorLine !== null) {
        const at = deck.frames.findIndex((f) => {
          const end = f.line + (next.text.slice(f.from, f.to).match(/\n/g)?.length ?? 0);
          return next.cursorLine! >= f.line && next.cursorLine! <= end;
        });
        if (at >= 0) select(at);
      }
      if (selected >= deck.frames.length) selected = Math.max(0, deck.frames.length - 1);
    });
    await ipc.tell("main", "slides-window:ready", null).catch(() => {});
    window.addEventListener("beforeunload", closed);
  });
  onDestroy(() => {
    unlisten?.();
    closePdf(doc);
  });

  function closed() {
    void ipc.tell("main", "slides-window:command", { kind: "closed" }).catch(() => {});
  }

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
    void ipc.tell("main", "slides-window:edit", { version: told.version, changes: [{ from: edit.from, to: edit.to, insert: edit.insert }] });
    select(edit.select);
  }

  function replaceAll(text: string, at: number) {
    if (!told) return;
    void ipc.tell("main", "slides-window:edit", { version: told.version, changes: [{ from: 0, to: told.text.length, insert: text }] });
    select(at);
  }

  function select(i: number) {
    if (i !== selected) step = 0;
    selected = i;
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

  function key(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      select(Math.max(0, Math.min(deck.frames.length - 1, selected + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "ArrowRight" && range && shownPage < range[1]) step++;
    else if (e.key === "ArrowLeft" && step > 0) step--;
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
  /** The width of the slide that fits the stage (a page of 16:9 or 4:3 drawn whole). */
  let ratio = $state(16 / 9);
  $effect(() => {
    const d = doc;
    if (!d) return;
    void d.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      ratio = v.width / v.height;
    });
  });
  const slideWidth = $derived(Math.max(0, Math.min(stageSize.width - 32, (stageSize.height - 24) * ratio)));

  // ------------------------------------------------------ the self-test

  // Driven from the main window by the self-test, which reads what is shown (not in a release).
  if (import.meta.env.DEV || import.meta.env.MODE === "selftest") {
    onMount(() => {
      const off = ipc.on("slides-window:test", (a) => test(a));
      return () => void off.then((f) => f());
    });
    $effect(() => {
      void told;
      void doc;
      void revision;
      void notesField;
      const report = {
        frames: deck.frames.map((f) => (f.titlePage ? "#title" : f.title)),
        selected,
        pages: doc?.numPages ?? 0,
        drawn: !!doc && !!stage?.querySelector("canvas"),
        notes: frame?.notes.map((n) => n.text).join("\n\n") ?? "",
        version: told?.version ?? 0,
      };
      void ipc.tell("main", "slides-window:report", report).catch(() => {});
    });
  }

  function test(a: SlidesTest) {
    if (a.kind === "select") select(a.index);
    else if (a.kind === "add") add(a.layout as Layout);
    else if (a.kind === "duplicate") duplicate();
    else if (a.kind === "delete") remove();
    else if (a.kind === "move") {
      dragged = a.from;
      drop(a.to);
    } else if (a.kind === "title") {
      titleField = a.text;
      saveTitle();
    } else if (a.kind === "notes") {
      notesField = a.text;
      saveNotes();
    } else if (a.kind === "close") void getCurrentWindow().close();
  }

  const sections = $derived(deck.frames.map((f, i) => (i === 0 || f.section !== deck.frames[i - 1].section ? f.section : null)));
</script>

<svelte:window onkeydown={key} />

<div class="slides-mode" data-window={SLIDES_LABEL}>
  <header class="bar">
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
    <button class="icon-btn" title={t("slides.duplicate")} aria-label={t("slides.duplicate")} disabled={!frame} onclick={duplicate}><Icon name="copy" size={15} /></button>
    <button class="icon-btn" title={t("slides.delete")} aria-label={t("slides.delete")} disabled={!frame} onclick={remove}><Icon name="trash" size={15} /></button>
    <span class="spacer"></span>
    {#if told?.building}<span class="status"><span class="spinner"></span>{t("slides.building")}</span>{:else if told?.failed}<span class="status err"><Icon name="alert-circle" size={13} />{t("slides.failed")}</span>{/if}
    <button class="btn small" onclick={() => void ipc.tell("main", "slides-window:command", { kind: "build" })}><Icon name="play" size={13} />{t("slides.build")}</button>
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
            {#if doc}<PageCanvas {doc} page={pagesOf(pages, deck.frames.length, i)[0]} width={150} {revision} />{:else}<span class="blank"></span>{/if}
          </span>
          <span class="name ellipsis" title={f.title}>{f.titlePage ? t("slides.titlePage") : f.title || t("slides.untitled")}</span>
        </button>
      {/each}
      {#if !deck.frames.length}<p class="faint empty">{t("slides.empty")}</p>{/if}
    </nav>

    <main class="center">
      <div class="stage" bind:this={stage}>
        {#if doc && frame && range}
          <div class="slide-box"><PageCanvas {doc} page={shownPage} width={slideWidth} {revision} /></div>
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

    <aside class="side">
      {#if frame}
        <label class="field">
          <span>{t("slides.title")}</span>
          <input class="input" bind:value={titleField} disabled={frame.titlePage} onfocus={() => (editing = "title")} onblur={saveTitle} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
        </label>
        {#if frame.options}<p class="faint options">{t("slides.options", { options: frame.options })}</p>{/if}
        <button class="btn small" onclick={() => void ipc.tell("main", "slides-window:command", { kind: "reveal", line: frame!.line })}><Icon name="code" size={13} />{t("slides.reveal")}</button>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .slides-mode {
    display: grid;
    grid-template-columns: 196px minmax(0, 1fr) 300px;
    grid-template-rows: 44px minmax(0, 1fr);
    height: 100vh;
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
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    border-radius: 3px;
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
