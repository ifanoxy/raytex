<script lang="ts">
  // "See all": every formatting and insertion command, with its shortcut,
  // and the @ shortcuts to type symbols faster. A field finds a tool by its
  // name, a rail shows one family at a time, and each tool is a tile large
  // enough to aim at: the picture of what it does, its name, its keys.
  import { getAction, keyFor, runAction } from "$lib/actions";
  import { BASE_COLORS, type NamedColor } from "$lib/colors";
  import { COLORS, HEADINGS, type Heading, setHeading, setSize, type Size } from "$lib/editor/format";
  import { colors } from "$lib/state/colors.svelte";
  import ColorMenu from "./ColorMenu.svelte";
  import { t, type MessageKey } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { editor } from "$lib/state/editor.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import MathGlyph from "../common/MathGlyph.svelte";

  let { onclose, hasChapters }: { onclose: () => void; hasChapters: boolean } = $props();

  interface Item {
    label: string;
    icon?: string;
    /** A formula shown in place of the icon (what the tool writes). */
    glyph?: string;
    keys?: string;
    disabled?: boolean;
    run: () => unknown;
  }

  type Family = "format.groupText" | "format.groupParagraph" | "format.groupMath" | "format.groupInsert" | "format.groupPage" | "format.groupShortcuts";
  /** The families of the rail, with their pictures; `null` shows them all. */
  const FAMILIES: [Family | null, string][] = [
    [null, "grid"],
    ["format.groupText", "type"],
    ["format.groupParagraph", "heading"],
    ["format.groupMath", "sigma"],
    ["format.groupInsert", "plus"],
    ["format.groupPage", "page-style"],
    ["format.groupShortcuts", "at"],
  ];
  let family = $state<Family | null>(null);
  let query = $state("");
  let field = $state<HTMLInputElement | null>(null);

  /** A text as it is searched: lower case, without accents. */
  const plain = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const wanted = $derived(plain(query.trim()));

  const canEdit = $derived(!!editor.activeTab && editor.activeTab.kind === "tex" && !editor.activeTab.readOnly);

  /** The @ shortcuts shown first (the most useful ones). */
  const FAVOURITES = ["a", "b", "l", "p", "s", "w", "8", "/", "2", "^", "V", "R", "N", "<", ">", "->", "=>", "*", "6", "I"];
  let shortcuts = $state<[string, string][]>([]);
  $effect(() => {
    void ipc.atShortcuts().then((all) => {
      const map = new Map(all);
      shortcuts = FAVOURITES.filter((k) => map.has(k)).map((k) => [k, map.get(k)!]);
    });
  });

  function action(id: string, icon?: string): Item {
    const a = getAction(id)!;
    const k = keyFor(id);
    return { label: t(a.title), icon: icon ?? a.icon, keys: k, disabled: !!a.when && !a.when(), run: () => runAction(id) };
  }

  function onView(fn: (v: NonNullable<typeof editor.view>) => unknown) {
    return () => {
      if (editor.view && canEdit) fn(editor.view);
    };
  }

  function snippet(label: MessageKey, icon: string, body: string, math = false, glyph?: string): Item {
    const block = body.endsWith("\n") || body.startsWith("\\begin");
    return { label: t(label), icon, glyph, disabled: !canEdit, run: () => (math ? editor.insertMath(body) : editor.insertSnippet(body, editor.view, { block })) };
  }

  const HEADING_LABEL: Record<Heading, MessageKey> = {
    part: "format.part",
    chapter: "format.chapter",
    section: "format.section",
    subsection: "format.subsection",
    subsubsection: "format.subsubsection",
    paragraph: "format.paragraph",
  };
  const SIZES_SHOWN: [Size, MessageKey][] = [
    ["small", "format.size.small"],
    ["normalsize", "format.size.normalsize"],
    ["large", "format.size.large"],
    ["Large", "format.size.Large"],
    ["LARGE", "format.size.LARGE"],
    ["huge", "format.size.huge"],
  ];

  const groups = $derived.by((): { title: Family; items: Item[] }[] => [
    {
      title: "format.groupText",
      items: [
        action("edit.bold", "bold"),
        action("edit.italic", "italic"),
        action("edit.underline", "underline"),
        action("edit.emph", "italic"),
        action("edit.typewriter", "code"),
        action("edit.smallcaps", "type"),
        action("format.fonts"),
      ],
    },
    {
      title: "format.groupParagraph",
      items: [
        { label: t("format.normal"), icon: "type", disabled: !canEdit, run: onView((v) => setHeading(v, null)) },
        ...HEADINGS.filter((h) => h !== "chapter" || hasChapters).map((h) => ({ label: t(HEADING_LABEL[h]), icon: "heading", disabled: !canEdit, run: onView((v) => setHeading(v, h)) })),
        action("edit.bulletList"),
        action("edit.numberedList"),
        action("edit.alignLeft"),
        action("edit.alignCenter"),
        action("edit.alignRight"),
        action("edit.alignJustify"),
        action("edit.comment", "comment"),
        action("edit.wrapEnv", "snippets"),
      ],
    },
    {
      title: "format.groupMath",
      items: [
        action("edit.math", "formula"),
        action("insert.equation", "equation"),
        action("insert.align", "equation"),
        snippet("format.fraction", "formula", "\\frac{${1}}{${2}}", true, "\\tfrac{a}{b}"),
        snippet("format.sqrt", "formula", "\\sqrt{${1}}", true, "\\sqrt{x}"),
        snippet("format.sum", "sigma", "\\sum_{${1}}^{${2}}", true, "\\textstyle\\sum"),
        snippet("format.integral", "formula", "\\int_{${1}}^{${2}} ${3} \\,\\mathrm{d}${4}", true, "\\textstyle\\int"),
        action("insert.matrix", "matrix"),
        action("insert.graph"),
        action("insert.variations"),
        action("view.symbols"),
      ],
    },
    {
      title: "format.groupInsert",
      items: [
        action("insert.image"),
        action("insert.code"),
        action("insert.table", "table"),
        action("insert.figure", "image"),
        action("insert.tikz"),
        action("insert.link", "link"),
        action("insert.footnote", "footnote"),
        action("insert.ref", "hash"),
        action("insert.cite", "quote"),
        snippet("format.label", "hash", "\\label{${1}}"),
        action("insert.frame", "presentation"),
      ],
    },
    {
      title: "format.groupPage",
      items: [
        action("format.titlePage"),
        action("format.margins"),
        action("format.pageStyles"),
        snippet("format.pageBreak", "page-break", "\\newpage\n"),
        snippet("format.toc", "outline", "\\tableofcontents\n"),
      ],
    },
  ]);

  /** The families in sight: the one of the rail, or those that hold what is searched. */
  const shown = $derived(
    groups
      .filter((g) => wanted || family === null || g.title === family)
      .map((g) => ({ ...g, items: wanted ? g.items.filter((i) => plain(i.label).includes(wanted)) : g.items }))
      .filter((g) => g.items.length),
  );
  /** The @ shortcuts in sight: all the favourites, or those whose key or command is searched. */
  const keys = $derived(wanted ? shortcuts.filter(([key, cmd]) => `@${key}`.includes(wanted) || plain(cmd).includes(wanted.replace(/^\\/, ""))) : family === null || family === "format.groupShortcuts" ? shortcuts : []);
  /** The size and the colour of the text, with the tools of the text. */
  const extras = $derived(!wanted && (family === null || family === "format.groupText"));

  function key(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onclose();
      editor.focus();
    } else if (e.key === "Enter" && wanted) {
      // The first tool found is the one meant.
      e.preventDefault();
      const first = shown[0]?.items.find((i) => !i.disabled);
      if (first) void choose(first);
      else if (keys.length) insertShortcut(keys[0][1]);
    }
  }

  $effect(() => {
    field?.focus();
  });

  async function choose(item: Item) {
    if (item.disabled) return;
    onclose();
    await item.run();
    editor.focus();
  }

  async function color(c: NamedColor) {
    onclose();
    if (canEdit) await colors.apply(c);
  }

  /** Colours of the document first, then those of xcolor (or the usual ones). */
  const swatches = $derived([...(colors.current?.defined ?? []), ...(colors.current?.xcolor ? BASE_COLORS : COLORS)]);
  let colorMenu = $state<{ x: number; y: number } | null>(null);

  function label(c: NamedColor): string {
    const key = `color.${c.name}` as MessageKey;
    const text = t(key);
    return text === key ? c.name : text;
  }

  function size(s: Size) {
    onclose();
    if (editor.view && canEdit) setSize(editor.view, s);
    editor.focus();
  }

  function insertShortcut(cmd: string) {
    onclose();
    if (canEdit) editor.insertMath(cmd);
    editor.focus();
  }
</script>

{#if colorMenu}
  <ColorMenu x={colorMenu.x} y={colorMenu.y} onclose={() => ((colorMenu = null), onclose())} />
{/if}

<div class="all-tools" role="dialog" tabindex="-1" aria-label={t("format.all")} onkeydown={key}>
  <header>
    <Icon name="search" size={15} />
    <input class="search" bind:this={field} bind:value={query} placeholder={t("format.search")} aria-label={t("format.search")} spellcheck="false" />
    <kbd>{prettyKey("Escape")}</kbd>
  </header>

  <div class="body">
    <nav class="rail" aria-label={t("format.all")}>
      {#each FAMILIES as [id, icon] (id ?? "all")}
        <button class="family" class:active={!wanted && family === id} aria-pressed={!wanted && family === id} data-family={id ?? "all"} onmousedown={(e) => e.preventDefault()} onclick={() => ((family = id), (query = ""))}>
          <Icon name={icon} size={15} />
          <span class="ellipsis">{id ? t(id) : t("format.everything")}</span>
        </button>
      {/each}
    </nav>

    <div class="content">
      {#each shown as g (g.title)}
        <section data-family={g.title}>
          <h3 class="section-title">{t(g.title)}</h3>
          <div class="tiles">
            {#each g.items as item (item.label)}
              <button class="item" disabled={item.disabled} onmousedown={(e) => e.preventDefault()} onclick={() => choose(item)}>
                <span class="icon-box" class:glyph={!!item.glyph}>
                  {#if item.glyph}<MathGlyph latex={item.glyph} />{:else if item.icon}<Icon name={item.icon} size={16} />{/if}
                </span>
                <span class="label ellipsis" title={item.label}>{item.label}</span>
                {#if item.keys}<kbd>{prettyKey(item.keys)}</kbd>{/if}
              </button>
            {/each}
          </div>
          {#if g.title === "format.groupText" && extras}
            <div class="extras">
              <div class="extra">
                <span class="row-title faint">{t("format.size")}</span>
                <div class="sizes">
                  {#each SIZES_SHOWN as [s, label], i (s)}
                    <button class="size" disabled={!canEdit} title={t(label)} aria-label={t(label)} style:font-size="{10.5 + i * 1.7}px" onmousedown={(e) => e.preventDefault()} onclick={() => size(s)}>A</button>
                  {/each}
                </div>
              </div>
              <div class="extra">
                <span class="row-title faint">{t("format.color")}</span>
                <div class="swatches">
                  {#each swatches as c (c.name)}
                    <button class="swatch" disabled={!canEdit} style:background={c.css} title={label(c)} aria-label={label(c)} onmousedown={(e) => e.preventDefault()} onclick={() => color(c)}></button>
                  {/each}
                  <button
                    class="chip more-colors"
                    disabled={!canEdit}
                    onmousedown={(e) => e.preventDefault()}
                    onclick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      colorMenu = { x: r.left, y: r.bottom + 4 };
                    }}>{t("colors.more")}</button>
                </div>
              </div>
            </div>
          {/if}
        </section>
      {/each}

      {#if keys.length}
        <section class="at" data-family="format.groupShortcuts">
          <h3 class="section-title">{t("format.groupShortcuts")}</h3>
          {#if !wanted}<p class="faint">{t("format.shortcutsIntro")}</p>{/if}
          <div class="at-grid">
            {#each keys as [k, cmd] (k)}
              <button class="at-item" disabled={!canEdit} title={cmd} onmousedown={(e) => e.preventDefault()} onclick={() => insertShortcut(cmd)}>
                <span class="key mono">@{k}</span>
                <MathGlyph latex={cmd} />
              </button>
            {/each}
          </div>
          {#if !wanted}
            <button class="btn small more" onclick={() => { onclose(); ui.showSidebar("snippets"); }}>
              {t("format.allShortcuts")}
              <Icon name="chevron-right" size={12} />
            </button>
          {/if}
        </section>
      {/if}

      {#if !shown.length && !keys.length}
        <p class="nothing faint">{t("format.nothing")}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .all-tools {
    position: fixed;
    z-index: 390;
    top: calc(var(--toolbar-height) + 40px);
    right: 12px;
    width: min(940px, calc(100vw - 24px));
    height: min(640px, calc(100vh - var(--toolbar-height) - 64px));
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
    overflow: hidden;
    animation: drop 0.12s ease-out;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  /* The field that finds a tool by its name. */
  header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 46px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
  }
  .search {
    flex: 1;
    min-width: 0;
    height: 30px;
    border: none;
    outline: none;
    background: none;
    color: var(--text);
    font-size: 14px;
  }
  .search::placeholder {
    color: var(--text-faint);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  /* The families, one at a time or all together. */
  .rail {
    flex-shrink: 0;
    width: 196px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    border-right: 1px solid var(--border);
    background: var(--bg-elev);
    overflow: auto;
  }
  .family {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .family:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .family.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 14px 16px 18px;
    overflow: auto;
  }
  h3 {
    margin: 0 0 8px 2px;
  }
  /* A tool: the picture of what it does, its name, its keys. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(206px, 1fr));
    gap: 6px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: 42px;
    padding: 0 10px 0 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .item:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .icon-box {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--bg-hover);
    color: var(--text-muted);
    overflow: hidden;
  }
  .item:hover:not(:disabled) .icon-box {
    color: var(--accent);
  }
  .icon-box.glyph {
    font-size: 11px;
    color: var(--text);
  }
  .label {
    flex: 1;
    min-width: 0;
  }
  kbd {
    flex-shrink: 0;
    font-size: 10.5px;
  }
  /* The size and the colour of the text. */
  .extras {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 28px;
    margin-top: 12px;
  }
  .extra {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .row-title {
    font-size: 11.5px;
    white-space: nowrap;
  }
  .sizes {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .size {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text);
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }
  .size:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .chip {
    height: 24px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: none;
    color: var(--text-muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .chip:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }
  .swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    cursor: pointer;
  }
  .swatch:hover:not(:disabled) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .more-colors {
    margin-left: 4px;
  }
  .at p {
    margin: 0 2px 8px;
    font-size: 11.5px;
    line-height: 1.45;
  }
  .at-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 6px;
  }
  .at-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    height: 34px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    cursor: pointer;
  }
  .at-item:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .key {
    font-variant-ligatures: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }
  .more {
    margin-top: 10px;
  }
  .nothing {
    margin: 24px 0;
    text-align: center;
    font-size: 12.5px;
  }
  /* A narrow window: the families go above the tools, on one line. */
  @media (max-width: 760px) {
    .body {
      flex-direction: column;
    }
    .rail {
      width: auto;
      flex-direction: row;
      border-right: none;
      border-bottom: 1px solid var(--border);
      padding: 6px 8px;
    }
    .family {
      flex-shrink: 0;
    }
  }
</style>
