<script lang="ts">
  // "See all": every formatting and insertion command, grouped, with its
  // shortcut, and the @ shortcuts to type symbols faster.
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
    keys?: string;
    disabled?: boolean;
    run: () => unknown;
  }

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

  function snippet(label: MessageKey, icon: string, body: string, math = false): Item {
    const block = body.endsWith("\n") || body.startsWith("\\begin");
    return { label: t(label), icon, disabled: !canEdit, run: () => (math ? editor.insertMath(body) : editor.insertSnippet(body, editor.view, { block })) };
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

  const groups = $derived.by((): { title: MessageKey; items: Item[] }[] => [
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
        snippet("format.fraction", "formula", "\\frac{${1}}{${2}}", true),
        snippet("format.sqrt", "formula", "\\sqrt{${1}}", true),
        snippet("format.sum", "sigma", "\\sum_{${1}}^{${2}}", true),
        snippet("format.integral", "formula", "\\int_{${1}}^{${2}} ${3} \\,\\mathrm{d}${4}", true),
        action("insert.matrix", "matrix"),
        action("view.symbols"),
      ],
    },
    {
      title: "format.groupInsert",
      items: [
        action("insert.image"),
        action("insert.table", "table"),
        action("insert.figure", "image"),
        action("insert.tikz"),
        action("insert.link", "link"),
        action("insert.footnote", "footnote"),
        action("insert.ref", "hash"),
        action("insert.cite", "quote"),
        snippet("format.label", "hash", "\\label{${1}}"),
        snippet("format.pageBreak", "page-break", "\\newpage\n"),
        snippet("format.toc", "outline", "\\tableofcontents\n"),
        action("insert.frame", "presentation"),
      ],
    },
  ]);

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

<div class="all-tools" role="dialog" aria-label={t("format.all")}>
  <div class="columns">
    {#each groups as g (g.title)}
      <section>
        <h3 class="section-title">{t(g.title)}</h3>
        {#each g.items as item (item.label)}
          <button class="item" disabled={item.disabled} onmousedown={(e) => e.preventDefault()} onclick={() => choose(item)}>
            <span class="icon-box">{#if item.icon}<Icon name={item.icon} size={15} />{/if}</span>
            <span class="label ellipsis">{item.label}</span>
            {#if item.keys}<kbd>{prettyKey(item.keys)}</kbd>{/if}
          </button>
        {/each}
        {#if g.title === "format.groupText"}
          <div class="row-title faint">{t("format.size")}</div>
          <div class="chips">
            {#each SIZES_SHOWN as [s, label] (s)}
              <button class="chip" disabled={!canEdit} onmousedown={(e) => e.preventDefault()} onclick={() => size(s)}>{t(label)}</button>
            {/each}
          </div>
          <div class="row-title faint">{t("format.color")}</div>
          <div class="swatches">
            {#each swatches as c (c.name)}
              <button class="swatch" disabled={!canEdit} style:background={c.css} title={label(c)} aria-label={label(c)} onmousedown={(e) => e.preventDefault()} onclick={() => color(c)}></button>
            {/each}
          </div>
          <button
            class="chip more-colors"
            disabled={!canEdit}
            onmousedown={(e) => e.preventDefault()}
            onclick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              colorMenu = { x: r.left, y: r.bottom + 4 };
            }}>{t("colors.more")}</button>
        {/if}
      </section>
    {/each}
    <section class="at">
      <h3 class="section-title"><Icon name="at" size={13} /> {t("format.groupShortcuts")}</h3>
      <p class="faint">{t("format.shortcutsIntro")}</p>
      <div class="at-grid">
        {#each shortcuts as [key, cmd] (key)}
          <button class="at-item" disabled={!canEdit} title={cmd} onmousedown={(e) => e.preventDefault()} onclick={() => insertShortcut(cmd)}>
            <span class="key mono">@{key}</span>
            <MathGlyph latex={cmd} />
          </button>
        {/each}
      </div>
      <button class="btn small more" onclick={() => { onclose(); ui.showSidebar("snippets"); }}>
        {t("format.allShortcuts")}
        <Icon name="chevron-right" size={12} />
      </button>
    </section>
  </div>
</div>

<style>
  .all-tools {
    position: fixed;
    z-index: 390;
    top: calc(var(--toolbar-height) + 40px);
    right: 12px;
    left: max(12px, calc(100vw - 1180px));
    max-height: calc(100vh - var(--toolbar-height) - 80px);
    overflow: auto;
    padding: 14px 16px 16px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
    animation: drop 0.12s ease-out;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px 18px;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0 0 6px 6px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    padding: 0 6px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .item:hover:not(:disabled) {
    background: var(--bg-hover);
  }
  .item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .icon-box {
    width: 18px;
    display: grid;
    place-items: center;
    color: var(--text-muted);
  }
  .label {
    flex: 1;
  }
  kbd {
    font-size: 10.5px;
  }
  .row-title {
    margin: 10px 6px 4px;
    font-size: 11px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 6px;
  }
  .chip {
    height: 24px;
    padding: 0 8px;
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
  .more-colors {
    margin: 6px 6px 0;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 0 6px;
  }
  .swatch {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    border: 1px solid var(--border-strong);
    cursor: pointer;
  }
  .swatch:hover:not(:disabled) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .at {
    grid-column: span 2;
    min-width: 0;
  }
  .at p {
    margin: 0 6px 8px;
    font-size: 11.5px;
    line-height: 1.45;
  }
  .at-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
    gap: 5px;
    padding: 0 6px;
  }
  .at-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    cursor: pointer;
  }
  .at-item:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .key {
    font-variant-ligatures: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }
  .more {
    margin: 10px 6px 0;
  }
  @media (max-width: 900px) {
    .at {
      grid-column: auto;
    }
  }
</style>
