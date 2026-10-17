<script lang="ts">
  // A text written on the slide itself: its words shown in bold, italic, a
  // colour…, typed into directly; formulas drawn (a click edits them),
  // what is anything else shown apart as it is written (a click edits it).
  // Given back as LaTeX after a pause and when it is left; what is typed is
  // escaped. Enter is the caller's (a new point of a list), Shift+Enter a
  // line break; Backspace in an empty text tells it too.
  import { onDestroy, onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import { mathHtml } from "$lib/editor/math-preview";
  import { fromNodes, inlineHtml, inlineLatex, parseInline, type RichTool } from "$lib/slides/rich";

  let {
    value,
    path = null,
    placeholder = "",
    single = false,
    onchange,
    onenter,
    onempty,
    onfocus,
    onblur,
    class: className = "",
  }: {
    value: string;
    path?: string | null;
    placeholder?: string;
    /** One line only: Shift+Enter does nothing either. */
    single?: boolean;
    onchange: (latex: string) => void;
    /** Enter: what is before the caret and what is after it. */
    onenter?: (before: string, after: string) => void;
    /** Backspace in a text left empty. */
    onempty?: () => void;
    onfocus?: () => void;
    onblur?: () => void;
    class?: string;
  } = $props();

  let el = $state<HTMLElement | null>(null);
  let focused = $state(false);
  /** What the text was as last written: nothing is given back while it is the same. */
  let given = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** What the text says now; the line break WebKit leaves at the end of an emptied text is not one. */
  const read = (): string => {
    if (!el) return given;
    const nodes = fromNodes(el.childNodes);
    while (nodes.length && nodes[nodes.length - 1].t === "br") nodes.pop();
    return inlineLatex(nodes);
  };

  /** Draws the text (not while it is typed in). */
  function draw(latex: string) {
    if (!el) return;
    const nodes = parseInline(latex);
    given = inlineLatex(nodes);
    // Empty: one line, as the browsers make it (WebKit makes an empty text taller).
    el.innerHTML = nodes.length ? inlineHtml(nodes) : "<br>";
    void drawMath();
  }

  async function drawMath() {
    if (!el) return;
    for (const span of el.querySelectorAll<HTMLElement>(".rt-math")) {
      const html = await mathHtml(span.dataset.latex ?? "", path).catch(() => null);
      if (html) span.innerHTML = html;
    }
  }

  onMount(() => {
    draw(value);
    // The tools of the bar act on the text that has the caret: they say so to it.
    const tool = (e: Event) => {
      const { tool: which, color } = (e as CustomEvent<{ tool: RichTool; color?: string }>).detail;
      format(which, color);
    };
    el?.addEventListener("rich-format", tool);
    return () => el?.removeEventListener("rich-format", tool);
  });
  $effect(() => {
    const next = value;
    if (!focused && el && inlineLatex(parseInline(next)) !== given) draw(next);
  });
  onDestroy(() => {
    clearTimeout(timer);
    give();
  });

  /** What was typed, given back when it changed. */
  function give() {
    clearTimeout(timer);
    const now = read();
    if (now !== given) {
      given = now;
      onchange(now);
    }
  }

  function typed() {
    clearTimeout(timer);
    timer = setTimeout(give, 500);
  }

  /** The LaTeX of the part of the text before (or after) the caret. */
  function around(): [string, string] {
    const sel = getSelection();
    if (!el || !sel?.rangeCount) return [read(), ""];
    const r = sel.getRangeAt(0);
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(r.startContainer, r.startOffset);
    const after = document.createRange();
    after.selectNodeContents(el);
    after.setStart(r.endContainer, r.endOffset);
    const of = (range: Range) => inlineLatex(fromNodes(range.cloneContents().childNodes));
    return [of(before), of(after)];
  }

  function keydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && ["b", "i", "u"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      format(e.key.toLowerCase() as "b" | "i" | "u");
    } else if (e.key === "Enter" && (e.shiftKey ? single : true)) {
      e.preventDefault();
      if (e.shiftKey) return;
      if (onenter) {
        const [before, after] = around();
        clearTimeout(timer);
        // What goes on in the next one leaves this one at once.
        draw(before);
        onenter(before, after);
      } else el?.blur();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      typed();
    } else if (e.key === "Backspace" && onempty && !(el?.textContent ?? "").replace(/​/g, "").length) {
      e.preventDefault();
      onempty();
    } else if (e.key === "Escape") {
      el?.blur();
    }
  }

  function paste(e: ClipboardEvent) {
    e.preventDefault();
    const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r?\n/g, single ? " " : "\n");
    document.execCommand("insertText", false, text);
    typed();
  }

  /** The caret put in this text, at its start or its end. */
  export function focusAt(where: "start" | "end" = "end") {
    if (!el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(where === "start");
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }

  // ------------------------------------------------------------ the tools

  const KINDS: Record<string, (n: HTMLElement) => boolean> = {
    b: (n) => n.nodeName === "B" || n.nodeName === "STRONG",
    i: (n) => n.nodeName === "I" || n.nodeName === "EM",
    u: (n) => n.nodeName === "U",
    alert: (n) => n.dataset.k === "alert",
    structure: (n) => n.dataset.k === "structure",
    color: (n) => n.dataset.k === "color",
    link: (n) => n.dataset.k === "link",
  };

  /** The words chosen in this text put in a style, or taken out of it when they are in it already. */
  export function format(tool: RichTool, color = "red") {
    if (!el) return;
    el.focus();
    const sel = getSelection();
    if (!sel?.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.commonAncestorContainer)) return;
    if (tool === "b" || tool === "i" || tool === "u") {
      document.execCommand(tool === "b" ? "bold" : tool === "i" ? "italic" : "underline");
      typed();
      return;
    }
    if (tool === "math") {
      const span = document.createElement("span");
      span.className = "rt-math";
      span.dataset.k = "math";
      span.dataset.latex = r.toString().trim() || "x";
      span.dataset.d = "$";
      span.contentEditable = "false";
      span.textContent = span.dataset.latex;
      r.deleteContents();
      r.insertNode(span);
      r.setStartAfter(span);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      void drawMath();
      give();
      return;
    }
    // Inside it already (another colour: changed): taken out.
    let anc: Node | null = r.commonAncestorContainer;
    while (anc && anc !== el && !(anc instanceof HTMLElement && KINDS[tool]?.(anc))) anc = anc.parentNode;
    if (anc && anc !== el && anc instanceof HTMLElement) {
      if (tool === "color" && anc.dataset.color !== color) {
        anc.dataset.color = color;
        anc.style.color = "";
        give();
        draw(read());
        return;
      }
      anc.replaceWith(...anc.childNodes);
      give();
      return;
    }
    const wrap = document.createElement("span");
    wrap.dataset.k = tool;
    if (tool === "color") wrap.dataset.color = color;
    if (tool === "link") wrap.dataset.url = "https://";
    if (r.collapsed) wrap.textContent = t("slides.text.word");
    else wrap.append(r.extractContents());
    r.insertNode(wrap);
    sel.removeAllRanges();
    const chosen = document.createRange();
    chosen.selectNodeContents(wrap);
    sel.addRange(chosen);
    give();
    // Drawn again, with its colours and classes.
    draw(read());
  }

  // ------------------------------------- formulas and LaTeX, edited apart

  let editing = $state<{ span: HTMLElement; kind: "math" | "raw" | "link"; value: string } | null>(null);

  function click(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".rt-math, .rt-raw, .rt-link");
    if (!target || !el?.contains(target)) return;
    e.preventDefault();
    const kind = target.dataset.k as "math" | "raw" | "link";
    editing = { span: target, kind, value: kind === "link" ? (target.dataset.url ?? "") : (target.dataset.latex ?? "") };
  }

  function closeEditing(keep: boolean, value: string) {
    const w = editing;
    editing = null;
    if (!w || !keep) return;
    if (w.kind === "link") w.span.dataset.url = value.trim();
    else w.span.dataset.latex = value;
    give();
    draw(read());
  }
</script>

<div class="rich-wrap">
  <div
    bind:this={el}
    class="rich {className}"
    class:empty={!!placeholder && !focused && !value.trim()}
    contenteditable="true"
    role="textbox"
    tabindex="0"
    aria-multiline={!single}
    data-placeholder={placeholder}
    spellcheck="true"
    data-prose
    oninput={typed}
    onkeydown={keydown}
    onpaste={paste}
    onclick={click}
    onfocus={() => {
      focused = true;
      onfocus?.();
    }}
    onblur={() => {
      focused = false;
      give();
      onblur?.();
    }}
  ></div>
  {#if editing}
    {@const w = editing}
    <div class="apart" role="dialog" aria-label={t(w.kind === "math" ? "slides.rich.formula" : w.kind === "link" ? "slides.rich.link" : "slides.rich.latex")}>
      <span class="faint">{t(w.kind === "math" ? "slides.rich.formula" : w.kind === "link" ? "slides.rich.link" : "slides.rich.latex")}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="input mono"
        value={w.value}
        autofocus
        onkeydown={(e) => {
          if (e.key === "Enter") closeEditing(true, (e.currentTarget as HTMLInputElement).value);
          else if (e.key === "Escape") closeEditing(false, "");
        }}
        onblur={(e) => closeEditing(true, (e.currentTarget as HTMLInputElement).value)}
      />
    </div>
  {/if}
</div>

<style>
  .rich-wrap {
    position: relative;
  }
  .rich {
    min-height: 1.3em;
    outline: none;
    white-space: pre-wrap;
    word-break: break-word;
    cursor: text;
  }
  .rich.empty::before {
    content: attr(data-placeholder);
    color: #9a9aa6;
    pointer-events: none;
  }
  /* The placeholder and the line of an empty text on one line. */
  .rich.empty :global(br:only-child) {
    display: none;
  }
  .rich :global(.rt-alert) {
    color: #d32f2f;
  }
  .rich :global(.rt-structure) {
    color: var(--slide-accent, #3333b3);
  }
  .rich :global(.rt-link) {
    color: #1e63d6;
    text-decoration: underline;
    cursor: pointer;
  }
  .rich :global(.rt-math) {
    padding: 0 2px;
    border-radius: 3px;
    cursor: pointer;
  }
  .rich :global(.rt-math:hover),
  .rich :global(.rt-raw:hover) {
    background: rgba(51, 51, 179, 0.1);
  }
  .rich :global(.rt-raw) {
    padding: 0 3px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.06);
    color: #555;
    font-family: var(--font-mono);
    font-size: 0.82em;
    cursor: pointer;
  }
  .apart {
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 260px;
    padding: 8px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    box-shadow: var(--shadow);
    font-size: 12px;
    color: var(--text);
  }
</style>
