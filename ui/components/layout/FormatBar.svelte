<script lang="ts">
  // Formatting bar (like a word processor's): undo, heading style, size,
  // bold/italic/underline, colour, alignment, lists, maths and insertions.
  // "See all" opens every command, grouped. Buttons never take the focus
  // from the text, so the selection stays and typing goes on.
  import { getAction, keyFor, openGrid, runAction } from "$lib/actions";
  import { HEADINGS, type Heading, setHeading, setSize, SIZES, type Size } from "$lib/editor/format";
  import type { GridKind } from "$lib/grid";
  import { gridStore } from "$lib/state/grid.svelte";
  import { t, type MessageKey } from "$lib/i18n.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import { colors } from "$lib/state/colors.svelte";
  import { fonts } from "$lib/state/fonts.svelte";
  import ColorMenu from "./ColorMenu.svelte";
  import AllTools from "./AllTools.svelte";
  import FontMenu from "./FontMenu.svelte";

  const canEdit = $derived(!!editor.activeTab && editor.activeTab.kind === "tex" && !editor.activeTab.readOnly);
  const hasDoc = $derived(!!editor.activeTab && editor.activeTab.kind !== "image" && editor.activeTab.kind !== "pdf");

  const HEADING_LABEL: Record<Heading, MessageKey> = {
    part: "format.part",
    chapter: "format.chapter",
    section: "format.section",
    subsection: "format.subsection",
    subsubsection: "format.subsubsection",
    paragraph: "format.paragraph",
  };
  const SIZE_LABEL: Record<Size, MessageKey> = {
    tiny: "format.size.tiny",
    scriptsize: "format.size.scriptsize",
    footnotesize: "format.size.footnotesize",
    small: "format.size.small",
    normalsize: "format.size.normalsize",
    large: "format.size.large",
    Large: "format.size.Large",
    LARGE: "format.size.LARGE",
    huge: "format.size.huge",
    Huge: "format.size.Huge",
  };

  /** Chapters exist only in book-like classes. */
  const hasChapters = $derived.by(() => {
    void editor.revision;
    const main = project.info?.main;
    const text = (main && editor.textOf(main)) ?? "";
    return /\\documentclass\s*(\[[^\]]*\])?\s*\{(report|book|memoir|scrbook|scrreprt|thesis|[^}]*these[^}]*)\}/.test(text.slice(0, 4000));
  });

  let pop = $state<{ kind: "color" | "table" | "matrix" | "font"; x: number; y: number } | null>(null);

  // Fonts of the document shown in the font box.
  $effect(() => {
    void editor.active;
    void project.info?.root;
    void fonts.refresh();
    void colors.refresh();
  });
  const mainFont = $derived(fonts.current?.main);
  let allOpen = $state(false);
  let grid = $state({ rows: 0, cols: 0 });

  /** Keeps the focus (and selection) in the editor when a button is pressed. */
  function keep(e: MouseEvent) {
    e.preventDefault();
  }

  function done() {
    editor.focus();
  }

  function run(id: string) {
    void runAction(id).then(done);
  }

  function title(id: string): string {
    const a = getAction(id);
    if (!a) return id;
    const k = keyFor(id);
    return k ? `${t(a.title)} (${prettyKey(k)})` : t(a.title);
  }

  function styleMenu(e: MouseEvent) {
    const levels = HEADINGS.filter((h) => h !== "chapter" || hasChapters || editor.lineHeading === "chapter");
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      { label: t("format.normal"), checked: !editor.lineHeading, run: () => apply((v) => setHeading(v, null)) },
      { separator: true },
      ...levels.map((h) => ({ label: t(HEADING_LABEL[h]), icon: "heading", checked: editor.lineHeading === h, run: () => apply((v) => setHeading(v, h)) })),
    ]);
  }

  function sizeMenu(e: MouseEvent) {
    ui.openMenuBelow(
      e.currentTarget as HTMLElement,
      SIZES.map((sz) => ({ label: `${t(SIZE_LABEL[sz])}  —  \\${sz}`, run: () => apply((v) => setSize(v, sz)) })),
    );
  }

  function apply(fn: (v: NonNullable<typeof editor.view>) => unknown) {
    const v = editor.view;
    if (!v || !canEdit) return;
    fn(v);
    done();
  }


  /** Size picked: the grid editor opens to fill the cells. */
  function pickGrid(kind: GridKind, rows: number, cols: number) {
    pop = null;
    const view = editor.view;
    if (!canEdit || !view) return;
    gridStore.openNew(view, kind, rows, cols, editor.inMath());
  }

  /** Inside a matrix or table: edits it; otherwise asks for the size of a new one. */
  function gridButton(e: MouseEvent, kind: GridKind) {
    const view = editor.view;
    if (view && gridStore.at(view, kind) !== null) {
      pop = null;
      openGrid(view, kind);
    } else openPop(e, kind);
  }

  function openPop(e: MouseEvent, kind: "color" | "table" | "matrix" | "font") {
    if (pop?.kind === kind) {
      pop = null;
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pop = { kind, x: r.left, y: r.bottom + 4 };
    grid = { rows: 0, cols: 0 };
  }

  function outside(e: PointerEvent) {
    const el = e.target as HTMLElement;
    if (pop && !el.closest(".pop") && !el.closest("[data-pop]")) pop = null;
    if (allOpen && !el.closest(".all-tools") && !el.closest("[data-all]") && !el.closest(".pop")) allOpen = false;
  }

  function key(e: KeyboardEvent) {
    if (e.key === "Escape" && (pop || allOpen)) {
      pop = null;
      allOpen = false;
      done();
    }
  }

  const headingLabel = $derived(editor.lineHeading ? t(HEADING_LABEL[editor.lineHeading as Heading]) : t("format.normal"));
  const swatch = $derived(colors.last.css);
</script>

<svelte:window onpointerdown={outside} onkeydown={key} />

<div class="format-bar" role="toolbar" aria-label={t("format.bar")}>
  <!-- Groups that do not fit are clipped; "See all" always stays visible. -->
  <div class="groups">
  <div class="group">
    <button class="icon-btn" disabled={!hasDoc || !editor.canUndo} onmousedown={keep} onclick={() => run("edit.undo")} title={title("edit.undo")} aria-label={t("action.undo")}><Icon name="undo" /></button>
    <button class="icon-btn" disabled={!hasDoc || !editor.canRedo} onmousedown={keep} onclick={() => run("edit.redo")} title={title("edit.redo")} aria-label={t("action.redo")}><Icon name="redo" /></button>
  </div>

  <div class="group">
    <button class="select-btn style" disabled={!canEdit} onmousedown={keep} onclick={styleMenu} title={t("format.styleHint")}>
      <span class="ellipsis">{headingLabel}</span>
      <Icon name="chevron-down" size={12} />
    </button>
    <button class="select-btn font" data-pop disabled={!canEdit} onmousedown={keep} onclick={(e) => openPop(e, "font")} title={t("fontMenu.hint")}>
      <Icon name="type" size={14} />
      <span class="ellipsis" style:font-family={mainFont && mainFont.source !== "default" ? `"${mainFont.name}"` : undefined}>{mainFont?.name ?? t("fontMenu.title")}</span>
      <Icon name="chevron-down" size={12} />
    </button>
    <button class="select-btn" disabled={!canEdit} onmousedown={keep} onclick={sizeMenu} title={t("format.size")} aria-label={t("format.size")}>
      <Icon name="text-size" size={17} />
      <Icon name="chevron-down" size={12} />
    </button>
  </div>

  <div class="group">
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.bold")} title={title("edit.bold")} aria-label={t("action.bold")}><Icon name="bold" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.italic")} title={title("edit.italic")} aria-label={t("action.italic")}><Icon name="italic" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.underline")} title={title("edit.underline")} aria-label={t("action.underline")}><Icon name="underline" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.typewriter")} title={title("edit.typewriter")} aria-label={t("action.typewriter")}><Icon name="code" /></button>
    <div class="split">
      <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => colors.apply(colors.last)} title={t("format.colorApply", { color: colors.last.name })} aria-label={t("format.color")} style="--swatch: {swatch}">
        <Icon name="text-color" />
      </button>
      <button class="icon-btn caret" data-pop disabled={!canEdit} onmousedown={keep} onclick={(e) => openPop(e, "color")} title={t("format.color")} aria-label={t("format.color")}><Icon name="chevron-down" size={12} /></button>
    </div>
  </div>

  <div class="group wide-only">
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.alignLeft")} title={title("edit.alignLeft")} aria-label={t("action.alignLeft")}><Icon name="align-left" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.alignCenter")} title={title("edit.alignCenter")} aria-label={t("action.alignCenter")}><Icon name="align-center" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.alignRight")} title={title("edit.alignRight")} aria-label={t("action.alignRight")}><Icon name="align-right" /></button>
  </div>

  <div class="group">
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.bulletList")} title={title("edit.bulletList")} aria-label={t("action.bulletList")}><Icon name="list" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.numberedList")} title={title("edit.numberedList")} aria-label={t("action.numberedList")}><Icon name="list-ordered" /></button>
  </div>

  <div class="group">
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("edit.math")} title={title("edit.math")} aria-label={t("action.inlineMath")}><Icon name="formula" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("insert.equation")} title={title("insert.equation")} aria-label={t("action.insertEquation")}><Icon name="equation" /></button>
  </div>

  <div class="group">
    <button class="text-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("insert.image")} title={title("insert.image")}>
      <Icon name="image" size={16} /><span>{t("toolbar.image")}</span>
    </button>
    <button class="text-btn" data-pop disabled={!canEdit} onmousedown={keep} onclick={(e) => gridButton(e, "table")} title={t("format.tableHint")}>
      <Icon name="table" size={16} /><span>{t("format.table")}</span>
    </button>
    <button class="text-btn" data-pop disabled={!canEdit} onmousedown={keep} onclick={(e) => gridButton(e, "matrix")} title={t("format.matrixHint")}>
      <Icon name="matrix" size={16} /><span>{t("format.matrix")}</span>
    </button>
    <button class="text-btn tikz" class:editing={editor.inTikz} disabled={!project.info} onmousedown={keep} onclick={() => run("insert.tikz")} title={title("insert.tikz")}>
      <Icon name="sparkles" size={16} /><span>{editor.inTikz ? t("toolbar.editTikz") : t("format.tikz")}</span>
    </button>
  </div>

  <div class="group wide-only">
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("insert.link")} title={title("insert.link")} aria-label={t("action.insertLink")}><Icon name="link" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("insert.footnote")} title={title("insert.footnote")} aria-label={t("action.insertFootnote")}><Icon name="footnote" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("insert.ref")} title={title("insert.ref")} aria-label={t("action.insertReference")}><Icon name="hash" /></button>
    <button class="icon-btn" disabled={!canEdit} onmousedown={keep} onclick={() => run("insert.cite")} title={title("insert.cite")} aria-label={t("action.insertCitation")}><Icon name="quote" /></button>
  </div>

  <button class="text-btn macros" onmousedown={keep} onclick={() => ui.showSidebar("snippets")} title={t("format.macrosHint")}>
    <Icon name="at" size={16} /><span>{t("format.macros")}</span>
  </button>

  </div>

  <button class="text-btn all" class:active={allOpen} data-all onmousedown={keep} onclick={() => (allOpen = !allOpen)} title={t("format.allHint")}>
    <Icon name="grid" size={15} /><span>{t("format.all")}</span>
  </button>
</div>

{#if pop?.kind === "font"}
  <FontMenu x={pop.x} y={pop.y} onclose={() => (pop = null)} />
{:else if pop?.kind === "color"}
  <ColorMenu x={pop.x} y={pop.y} onclose={() => (pop = null)} />
{:else if pop?.kind === "table" || pop?.kind === "matrix"}
  {@const kind = pop.kind}
  <div class="pop tables" style:left="{pop.x}px" style:top="{pop.y}px" role="grid" tabindex="-1" onmouseleave={() => (grid = { rows: 0, cols: 0 })}>
    <div class="cells">
      {#each Array.from({ length: 8 }, (_, r) => r + 1) as r (r)}
        {#each Array.from({ length: 8 }, (_, c) => c + 1) as c (c)}
          <button class="cell" class:on={r <= grid.rows && c <= grid.cols} aria-label="{r} × {c}" onmouseenter={() => (grid = { rows: r, cols: c })} onmousedown={keep} onclick={() => pickGrid(kind, r, c)}></button>
        {/each}
      {/each}
    </div>
    <p class="faint">{grid.rows ? t("format.tableSize", { rows: grid.rows, cols: grid.cols }) : t("format.tablePick")}</p>
  </div>
{/if}

{#if allOpen}
  <AllTools onclose={() => (allOpen = false)} {hasChapters} />
{/if}

<style>
  .format-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 38px;
    padding: 0 10px;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--border);
    min-width: 0;
    overflow: hidden;
  }
  .groups {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 1px;
    padding-right: 6px;
    margin-right: 2px;
    border-right: 1px solid var(--border);
    flex-shrink: 0;
  }
  .icon-btn {
    width: 30px;
    height: 30px;
  }
  .split {
    display: flex;
  }
  .split .caret {
    width: 16px;
    margin-left: -2px;
  }
  .select-btn,
  .text-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
  }
  .select-btn:hover:not(:disabled),
  .text-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text);
  }
  .select-btn:disabled,
  .text-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .select-btn.font {
    width: 118px;
    gap: 4px;
    padding: 0 6px;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text);
  }
  .select-btn.font span {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: 12px;
  }
  .select-btn.style {
    width: 136px;
    justify-content: space-between;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text);
  }
  .tikz.editing,
  .all.active {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .macros {
    color: var(--accent);
    font-weight: 600;
  }
  .all {
    flex-shrink: 0;
    margin-left: 6px;
    border: 1px solid var(--border);
    font-weight: 600;
    color: var(--text);
  }
  .pop {
    position: fixed;
    z-index: 400;
    padding: 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.3));
  }
  .pop p {
    margin: 8px 0 0;
    font-size: 11.5px;
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(8, 18px);
    gap: 3px;
  }
  .cell {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    background: var(--bg-input);
    cursor: pointer;
  }
  .cell.on {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  /* When space runs out: alignment and links first, then the name of the
     macros, the texts of image / table / diagram last. */
  @media (max-width: 1439px) {
    .wide-only {
      display: none;
    }
  }
  @media (max-width: 1220px) {
    .macros span {
      display: none;
    }
    .select-btn.style {
      width: 112px;
    }
  }
  @media (max-width: 1080px) {
    .text-btn:not(.all):not(.macros) span {
      display: none;
    }
    .select-btn.font {
      width: 92px;
    }
  }
</style>
