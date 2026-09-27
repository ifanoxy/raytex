<script lang="ts">
  // Raw compiler output (virtualised: only visible lines are in the DOM).
  // The text can be selected and copied like in a terminal: a selection
  // spanning lines copies them from the output itself, even those scrolled
  // out of the DOM; Ctrl/⌘ + A selects the whole output.
  import { t } from "$lib/i18n.svelte";
  import { build, type ConsoleLine } from "$lib/state/build.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { dirname, formatDuration, join } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  const ROW = 18;
  let scroller = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let height = $state(300);
  let stick = true;
  let filter = $state("");

  const lines = $derived.by((): ConsoleLine[] => {
    void build.outputRevision;
    const q = filter.trim().toLowerCase();
    return q ? build.output.filter((l) => l.text.toLowerCase().includes(q)) : build.output.slice();
  });

  // Lines kept around the visible ones: a selection dragged a little out of view keeps its ends.
  const OVERSCAN = 120;
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  const last = $derived(Math.min(lines.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN));
  /** The whole output is selected (Ctrl/⌘ + A). */
  let all = $state(false);

  $effect(() => {
    void lines.length;
    if (stick && scroller) requestAnimationFrame(() => scroller && (scroller.scrollTop = scroller.scrollHeight));
  });

  function onScroll() {
    if (!scroller) return;
    scrollTop = scroller.scrollTop;
    stick = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - ROW * 2;
  }

  const FILE_LINE = /^(\.?\.?\/?[^\s:]+\.(?:tex|sty|cls|bib|ltx)):(\d+):/;

  function kind(l: ConsoleLine): string {
    if (l.stream === "cmd") return "cmd";
    if (/^!|^\S+\.\w+:\d+: /.test(l.text)) return "error";
    if (/Warning|Avertissement/i.test(l.text)) return "warning";
    if (l.stream === "stderr") return "stderr";
    return "";
  }

  function openLine(l: ConsoleLine) {
    // A click that ends a selection only selects.
    if (window.getSelection()?.toString()) return;
    const m = FILE_LINE.exec(l.text);
    const root = build.plan?.root;
    if (!m || !root) return;
    const path = m[1].startsWith("/") ? m[1] : join(dirname(root), m[1].replace(/^\.\//, ""));
    void editor.open(path, { line: Number(m[2]) });
  }

  function copyAll() {
    void navigator.clipboard.writeText(lines.map((l) => l.text).join("\n")).then(() => ui.toast("success", t("files.copied")));
  }

  /** Index (in `lines`) of the row containing a node. */
  function rowOf(node: Node | null): { el: HTMLElement; index: number } | null {
    const el = (node instanceof HTMLElement ? node : node?.parentElement)?.closest<HTMLElement>("[data-i]");
    return el ? { el, index: Number(el.dataset.i) } : null;
  }

  /** Copy: the selected text, rebuilt from the output when it spans lines. */
  function onCopy(e: ClipboardEvent) {
    let text: string | null = null;
    if (all) {
      text = lines.map((l) => l.text).join("\n");
    } else {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const a = rowOf(range.startContainer);
      const b = rowOf(range.endContainer);
      if (!a || !b || a.index === b.index) return;
      // Ends: the part of their row inside the selection; between them, whole lines.
      const head = document.createRange();
      head.setStart(range.startContainer, range.startOffset);
      head.setEndAfter(a.el);
      const tail = document.createRange();
      tail.setStartBefore(b.el);
      tail.setEnd(range.endContainer, range.endOffset);
      const middle = lines.slice(a.index + 1, b.index).map((l) => l.text);
      text = [head.toString(), ...middle, tail.toString()].join("\n");
    }
    e.preventDefault();
    e.clipboardData?.setData("text/plain", text);
  }

  function onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      all = true;
    } else if (e.key === "Escape") {
      all = false;
    }
  }
</script>

<div class="bar">
  {#if build.plan}
    <span class="plan faint ellipsis" title={build.plan.engineReason}>
      {build.plan.engine} · {build.plan.tool}{build.plan.bibTool ? ` · ${build.plan.bibTool}` : ""} → {build.plan.outDir}
    </span>
  {/if}
  <div class="spacer"></div>
  {#if !build.running && build.outcome}
    <span class="faint small">{build.outcome.steps.map((s) => `${s.name} ${formatDuration(s.durationMs)}`).join(" · ")}</span>
  {/if}
  <input class="input small" placeholder={t("output.filter")} bind:value={filter} spellcheck="false" />
  <button class="icon-btn" title={t("action.openLog")} onclick={() => build.openLog()}><Icon name="file" /></button>
  <button class="icon-btn" title={t("output.copy")} onclick={copyAll}><Icon name="copy" /></button>
</div>

<!-- A log that can be focused, selected and copied. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="scroller mono selectable"
  class:all
  bind:this={scroller}
  bind:clientHeight={height}
  onscroll={onScroll}
  oncopy={onCopy}
  onkeydown={onKey}
  onpointerdown={() => (all = false)}
  tabindex="0"
  role="log"
  aria-label={t("panel.output")}
>
  {#if lines.length}
    <div class="spacer-box" style:height="{lines.length * ROW}px">
      <div class="window" style:transform="translateY({first * ROW}px)">
        {#each lines.slice(first, last) as l, i (first + i)}
          {@const k = kind(l)}
          {@const m = FILE_LINE.exec(l.text)}
          <div class="row {k}" data-i={first + i}>{#if m}<span class="link" role="link" tabindex="-1" onclick={() => openLine(l)} onkeydown={(e) => e.key === "Enter" && openLine(l)} title={t("output.openLocation")}>{m[0]}</span>{l.text.slice(m[0].length)}{:else}{l.text || " "}{/if}</div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="empty">{build.running ? t("output.waiting") : t("output.none")}</div>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 12px;
    flex-shrink: 0;
  }
  .bar .input {
    width: 180px;
  }
  .plan {
    font-size: 11.5px;
    min-width: 0;
  }
  .small {
    font-size: 11px;
    white-space: nowrap;
  }
  .scroller {
    flex: 1;
    overflow: auto;
    font-size: 12px;
    background: var(--editor-bg);
  }
  .spacer-box {
    position: relative;
    min-width: max-content;
  }
  .window {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
  }
  .row {
    display: block;
    height: 18px;
    line-height: 18px;
    padding: 0 12px;
    white-space: pre;
    color: var(--text-muted);
  }
  .scroller:focus {
    outline: none;
  }
  .scroller.all .row {
    background: var(--selection, rgba(120, 150, 255, 0.25));
  }
  .link {
    cursor: pointer;
    color: var(--link);
    text-decoration: underline dotted;
  }
  .row.cmd {
    color: var(--accent);
    font-weight: 600;
  }
  .row.error {
    color: var(--error);
  }
  .row.warning {
    color: var(--warning);
  }
  .row.stderr {
    color: color-mix(in srgb, var(--error) 70%, var(--text-muted));
  }
</style>
