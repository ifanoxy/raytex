<script lang="ts">
  // Raw compiler output (virtualised: only visible lines are in the DOM).
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

  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 20));
  const last = $derived(Math.min(lines.length, Math.ceil((scrollTop + height) / ROW) + 20));

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
    const m = FILE_LINE.exec(l.text);
    const root = build.plan?.root;
    if (!m || !root) return;
    const path = m[1].startsWith("/") ? m[1] : join(dirname(root), m[1].replace(/^\.\//, ""));
    void editor.open(path, { line: Number(m[2]) });
  }

  function copyAll() {
    void navigator.clipboard.writeText(build.output.map((l) => l.text).join("\n")).then(() => ui.toast("success", t("files.copied")));
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

<div class="scroller mono selectable" bind:this={scroller} bind:clientHeight={height} onscroll={onScroll}>
  {#if lines.length}
    <div class="spacer-box" style:height="{lines.length * ROW}px">
      <div class="window" style:transform="translateY({first * ROW}px)">
        {#each lines.slice(first, last) as l, i (first + i)}
          {@const k = kind(l)}
          {#if FILE_LINE.test(l.text)}
            <button class="row link {k}" onclick={() => openLine(l)}>{l.text}</button>
          {:else}
            <div class="row {k}">{l.text || " "}</div>
          {/if}
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
  button.row {
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    width: 100%;
    cursor: pointer;
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
