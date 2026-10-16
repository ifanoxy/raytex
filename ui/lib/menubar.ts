// What the menus of the top bar hold: Format (the text and the paragraphs),
// Insert, Maths, Page and the @ shortcuts. Read inside a `$derived`, it
// follows the document (what can be written, the heading of the line, the
// colours defined).
import { getAction, keyFor, runAction } from "./actions";
import { BASE_COLORS, type NamedColor } from "./colors";
import { COLORS, HEADINGS, type Heading, setHeading, setSize, SIZES, type Size } from "./editor/format";
import { t, type MessageKey } from "./i18n.svelte";
import type { MenuEntry, TopMenu } from "./menu";
import { answerKey } from "./state/answerkey.svelte";
import { colors } from "./state/colors.svelte";
import { editor } from "./state/editor.svelte";
import { ui } from "./state/ui.svelte";

const HEADING_LABEL: Record<Heading, MessageKey> = {
  part: "format.part",
  chapter: "format.chapter",
  section: "format.section",
  subsection: "format.subsection",
  subsubsection: "format.subsubsection",
  paragraph: "format.paragraph",
};

/** The @ shortcuts shown (the most useful ones). */
const FAVOURITES = ["a", "b", "l", "p", "s", "w", "8", "/", "2", "^", "V", "R", "N", "<", ">", "->", "=>", "*", "6", "I"];

/** The name of a colour in the language of the application. */
export function colorLabel(c: NamedColor): string {
  const key = `color.${c.name}` as MessageKey;
  const text = t(key);
  return text === key ? c.name : text;
}

export interface MenuContext {
  /** The class of the document has chapters. */
  chapters: boolean;
  /** Every @ shortcut: its key, the command it writes. */
  shortcuts: [string, string][];
  /** Opens every colour, below the menu. */
  allColors: () => void;
}

export function menus(ctx: MenuContext): TopMenu[] {
  const canEdit = !!editor.activeTab && editor.activeTab.kind === "tex" && !editor.activeTab.readOnly;

  const action = (id: string, icon?: string): MenuEntry => {
    const a = getAction(id)!;
    return { label: t(a.title), action: id, icon: icon ?? a.icon, keys: keyFor(id), disabled: !!a.when && !a.when(), run: () => runAction(id) };
  };
  const onView = (fn: (v: NonNullable<typeof editor.view>) => unknown) => () => {
    if (editor.view && canEdit) fn(editor.view);
  };
  const snippet = (label: MessageKey, icon: string, body: string, math = false, glyph?: string): MenuEntry => {
    const block = body.endsWith("\n") || body.startsWith("\\begin");
    return { label: t(label), icon, glyph, disabled: !canEdit, run: () => (math ? editor.insertMath(body) : editor.insertSnippet(body, editor.view, { block })) };
  };
  const sep: MenuEntry = { separator: true };

  const levels = HEADINGS.filter((h) => h !== "chapter" || ctx.chapters || editor.lineHeading === "chapter");
  const style: MenuEntry = {
    label: t("menu.style"),
    icon: "heading",
    disabled: !canEdit,
    items: [
      { label: t("format.normal"), checked: !editor.lineHeading, run: onView((v) => setHeading(v, null)) },
      sep,
      ...levels.map((h) => ({ label: t(HEADING_LABEL[h]), hint: `\\${h}`, checked: editor.lineHeading === h, run: onView((v) => setHeading(v, h)) })),
    ],
  };
  const size: MenuEntry = {
    label: t("format.size"),
    icon: "text-size",
    disabled: !canEdit,
    items: SIZES.map((s: Size) => ({ label: t(`format.size.${s}` as MessageKey), hint: `\\${s}`, run: onView((v) => setSize(v, s)) })),
  };
  // Colours of the document first, then those of xcolor (or the usual ones).
  const swatches = [...(colors.current?.defined ?? []), ...(colors.current?.xcolor ? BASE_COLORS : COLORS)];
  const color: MenuEntry = {
    label: t("format.color"),
    icon: "text-color",
    disabled: !canEdit,
    items: [
      { cells: swatches.map((c) => ({ label: colorLabel(c), swatch: c.css, disabled: !canEdit, run: () => colors.apply(c) })), columns: 8 },
      sep,
      { label: t("colors.more"), icon: "palette", run: ctx.allColors },
    ],
  };
  const align: MenuEntry = {
    label: t("menu.align"),
    icon: "align-left",
    disabled: !canEdit,
    items: [action("edit.alignLeft"), action("edit.alignCenter"), action("edit.alignRight"), action("edit.alignJustify")],
  };

  // Subject and answer key: the pieces, the switch, both PDFs.
  const answers: MenuEntry = {
    label: t("menu.answers"),
    icon: "graduation",
    items: [
      action("insert.exercise"),
      action("insert.solution"),
      sep,
      action("insert.answerLines"),
      action("insert.answerSpace"),
      action("insert.answerGrid"),
      sep,
      { ...action("view.answers"), checked: !!answerKey.current?.shown },
      action("pdf.exportAnswers"),
    ],
  };

  const known = new Map(ctx.shortcuts);
  const favourites = FAVOURITES.filter((k) => known.has(k));

  return [
    {
      id: "format",
      label: t("menu.format"),
      items: [
        action("edit.bold", "bold"),
        action("edit.italic", "italic"),
        action("edit.underline", "underline"),
        action("edit.emph", "italic"),
        action("edit.typewriter", "code"),
        action("edit.smallcaps", "type"),
        sep,
        style,
        size,
        color,
        action("format.fonts"),
        sep,
        align,
        action("edit.bulletList"),
        action("edit.numberedList"),
        sep,
        action("edit.comment", "comment"),
        action("edit.wrapEnv", "snippets"),
      ],
    },
    {
      id: "insert",
      label: t("menu.insert"),
      items: [
        action("insert.image"),
        action("insert.figure", "image"),
        action("insert.table", "table"),
        action("insert.code"),
        action("insert.tikz"),
        sep,
        action("insert.link", "link"),
        action("insert.footnote", "footnote"),
        action("insert.ref", "hash"),
        action("insert.cite", "quote"),
        snippet("format.label", "hash", "\\label{${1}}"),
        sep,
        answers,
        sep,
        action("insert.command"),
        action("insert.frame", "presentation"),
      ],
    },
    {
      id: "math",
      label: t("menu.math"),
      items: [
        action("edit.math", "formula"),
        action("insert.equation", "equation"),
        action("insert.align", "equation"),
        sep,
        snippet("format.fraction", "formula", "\\frac{${1}}{${2}}", true, "\\tfrac{a}{b}"),
        snippet("format.sqrt", "formula", "\\sqrt{${1}}", true, "\\sqrt{x}"),
        snippet("format.sum", "sigma", "\\sum_{${1}}^{${2}}", true, "\\textstyle\\sum"),
        snippet("format.integral", "formula", "\\int_{${1}}^{${2}} ${3} \\,\\mathrm{d}${4}", true, "\\textstyle\\int"),
        action("insert.matrix", "matrix"),
        sep,
        action("insert.graph"),
        action("insert.variations"),
        action("insert.tree"),
        sep,
        action("view.symbols"),
      ],
    },
    {
      id: "page",
      label: t("menu.page"),
      items: [
        action("format.titlePage"),
        action("format.margins"),
        action("format.pageStyles"),
        action("format.paragraphs"),
        sep,
        snippet("format.pageBreak", "page-break", "\\newpage\n"),
        snippet("format.toc", "outline", "\\tableofcontents\n"),
      ],
    },
    {
      id: "shortcuts",
      label: t("menu.shortcuts"),
      icon: "at",
      items: [
        { note: t("menu.atIntro") },
        { cells: favourites.map((k) => ({ label: known.get(k)!, glyph: known.get(k)!, key: `@${k}`, disabled: !canEdit, run: () => editor.insertMath(known.get(k)!) })), columns: 4 },
        sep,
        { label: t("format.allShortcuts"), icon: "snippets", run: () => ui.showSidebar("snippets") },
      ],
    },
  ];
}
