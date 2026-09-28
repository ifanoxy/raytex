<script lang="ts">
  // Precise error console: every diagnostic with its location, the TeX
  // context, a plain-language suggestion and one-click fixes, one by one or
  // all at once.
  import { autoFix, fixable, fixAllAndReport, fixIcon, fixLabel, runFix } from "$lib/fixes";
  import { t } from "$lib/i18n.svelte";
  import { app } from "$lib/state/app.svelte";
  import { build } from "$lib/state/build.svelte";
  import { diagnostics } from "$lib/state/diagnostics.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { Diagnostic } from "$lib/types";
  import { inlineMarkdown, relative } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  let showErrors = $state(true);
  let showWarnings = $state(true);
  let showInfos = $state(true);
  let filter = $state("");
  let expanded = $state<Set<Diagnostic>>(new Set());

  const ICON = { error: "alert-circle", warning: "alert-triangle", info: "info", hint: "lightbulb" } as const;
  const SEVERITY = { error: "problems.severity.error", warning: "problems.severity.warning", info: "problems.severity.info", hint: "problems.severity.hint" } as const;
  const SOURCE: Record<string, string> = { latex: "LaTeX", bibtex: "BibTeX", biber: "Biber", index: "Index", syntax: "RayTeX", lint: "RayTeX", build: "Build" };

  const q = $derived(filter.trim().toLowerCase());
  const showBadboxes = $derived(app.settings?.build.showBadboxes ?? false);

  function keep(d: Diagnostic): boolean {
    if (d.severity === "error" && !showErrors) return false;
    if (d.severity === "warning" && !showWarnings) return false;
    if ((d.severity === "info" || d.severity === "hint") && !showInfos) return false;
    if (!showBadboxes && d.code?.startsWith("badbox")) return false;
    if (q && !`${d.message} ${d.code ?? ""} ${d.file ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }

  const groups = $derived(diagnostics.grouped.map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length));
  const counts = $derived(diagnostics.counts);
  const visible = $derived(groups.flatMap((g) => g.items));
  const fixableCount = $derived(fixable(visible).length);
  let fixing = $state(false);

  async function fixEverything() {
    fixing = true;
    try {
      await fixAllAndReport(visible);
    } finally {
      fixing = false;
    }
  }

  function open(d: Diagnostic) {
    if (!d.file) {
      toggle(d);
      return;
    }
    if (d.range) void editor.open(d.file, { range: d.range });
    else void editor.open(d.file, { line: d.line ?? 1 });
  }

  function toggle(d: Diagnostic) {
    const next = new Set(expanded);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    expanded = next;
  }

  function location(d: Diagnostic): string {
    const line = d.range ? d.range.start.line + 1 : d.line;
    const col = d.range ? d.range.start.character + 1 : null;
    return line ? (col ? `${line}:${col}` : `${line}`) : "";
  }

  /** One problem as text: `chapters/intro.tex:12:5: erreur : message`. */
  function asText(d: Diagnostic, details = false): string {
    const where = d.file ? `${relative(project.info?.root ?? "", d.file)}${location(d) ? `:${location(d)}` : ""}: ` : "";
    const lines = [`${where}${t(SEVERITY[d.severity])}: ${d.hint?.title ?? d.message}`];
    if (d.hint && d.hint.title !== d.message) lines.push(`  ${d.message}`);
    if (details && (d.contextBefore || d.contextAfter)) lines.push(`  ${d.contextBefore ?? ""}⏐${d.contextAfter ?? ""}`);
    if (details && d.raw) lines.push(d.raw);
    return lines.join("\n");
  }

  function write(text: string) {
    void navigator.clipboard.writeText(text).then(() => ui.toast("success", t("files.copied")));
  }

  function copy(d: Diagnostic) {
    write(asText(d, true));
  }

  function copyAll() {
    write(groups.flatMap((g) => g.items.map((d) => asText(d))).join("\n"));
  }

  /** Text selected in the panel (the message stays selectable and copyable). */
  function selection(): string {
    return window.getSelection()?.toString() ?? "";
  }

  /** A click opens the location, unless it ended a text selection. */
  function clicked(d: Diagnostic) {
    if (selection()) return;
    open(d);
  }

  function menu(e: MouseEvent, d: Diagnostic) {
    const selected = selection();
    ui.openMenu(e, [
      ...(selected ? [{ label: t("problems.copySelection"), icon: "copy", keys: "Mod-c", run: () => write(selected) }, { separator: true }] : []),
      { label: t("problems.copyMessage"), icon: "copy", run: () => write(d.hint?.title ?? d.message) },
      { label: t("problems.copyWithLocation"), icon: "copy", run: () => write(asText(d, true)) },
      { label: t("problems.copyAll"), icon: "copy", run: copyAll },
      ...(d.file ? [{ separator: true }, { label: t("problems.goTo"), icon: "arrow-right", run: () => open(d) }] : []),
    ]);
  }
</script>

<div class="bar">
  <button class="filter-btn" class:on={showErrors} onclick={() => (showErrors = !showErrors)} title={t("problems.errors")}>
    <Icon name="alert-circle" size={13} />{counts.errors}
  </button>
  <button class="filter-btn warn" class:on={showWarnings} onclick={() => (showWarnings = !showWarnings)} title={t("problems.warnings")}>
    <Icon name="alert-triangle" size={13} />{counts.warnings}
  </button>
  <button class="filter-btn info" class:on={showInfos} onclick={() => (showInfos = !showInfos)} title={t("problems.infos")}>
    <Icon name="info" size={13} />{counts.infos}
  </button>
  <input class="input small" placeholder={t("problems.filter")} bind:value={filter} spellcheck="false" />
  <div class="spacer"></div>
  {#if build.outcome}
    <span class="faint small">{t("problems.lastBuild", { engine: build.outcome.engine, pages: build.outcome.pages ?? "?" })}</span>
  {/if}
  <button class="btn small fix-all" disabled={!fixableCount || fixing} onclick={fixEverything} title={t("problems.fixAllHint")}>
    {#if fixing}<span class="spinner"></span>{:else}<Icon name="wand" size={13} />{/if}{t("problems.fixAll", { n: fixableCount })}
  </button>
  <button class="btn ghost small" disabled={!groups.length} onclick={copyAll} title={t("problems.copyAllHint")}><Icon name="copy" size={13} />{t("problems.copyAll")}</button>
  <button class="btn ghost small" onclick={() => project.lintAll()}><Icon name="refresh" size={13} />{t("problems.recheck")}</button>
</div>

<div class="list" role="list">
  {#each groups as g (g.file ?? "")}
    <div class="file">
      <Icon name={g.file ? "file-tex" : "cpu"} size={13} />
      <span class="ellipsis">{g.file ? relative(project.info?.root ?? "", g.file) : t("problems.general")}</span>
      <span class="badge">{g.items.length}</span>
    </div>
    {#each g.items as d, i (i + d.message + (d.line ?? "") + d.source)}
      {@const open_ = expanded.has(d)}
      <div class="item {d.severity}" role="listitem" oncontextmenu={(e) => menu(e, d)}>
        <div class="line">
          <button class="expand" onclick={() => toggle(d)} aria-label={t("problems.details")} aria-expanded={open_}>
            <Icon name={open_ ? "chevron-down" : "chevron-right"} size={12} />
          </button>
          <span class="sev"><Icon name={ICON[d.severity]} size={14} /></span>
          <!-- Not a button: the text must stay selectable (a click without selection opens the location). -->
          <div class="message selectable" role="button" tabindex="0" onclick={() => clicked(d)} ondblclick={() => toggle(d)} onkeydown={(e) => e.key === "Enter" && open(d)}>
            <span class="text">{d.hint?.title ?? d.message}</span>
            {#if d.hint && d.hint.title !== d.message}<span class="orig mono">{d.message}</span>{/if}
          </div>
          <span class="src">{SOURCE[d.source]}{d.code && (d.source === "lint" || d.source === "syntax") ? ` · ${d.code}` : ""}</span>
          {#if location(d)}<button class="loc mono" onclick={() => open(d)}>{location(d)}</button>{/if}
        </div>
        {#if d.hint && !open_}
          <!-- The suggestion; a click shows the details. -->
          <div class="suggestion selectable" role="button" tabindex="-1" onclick={() => !selection() && toggle(d)} onkeydown={(e) => e.key === "Enter" && toggle(d)}>
            <Icon name="lightbulb" size={12} />
            <span>{@html inlineMarkdown(d.hint.explanation)}</span>
          </div>
        {/if}
        {#if d.fixes.length}
          {@const main = autoFix(d)}
          <div class="fixes">
            {#each d.fixes as fix}
              <button class="btn small fix" class:main={fix === main} onclick={() => runFix(fix, d)} title={fix === main ? t("problems.mainFix") : undefined}>
                <Icon name={fixIcon(fix)} size={12} />{fixLabel(fix)}
              </button>
            {/each}
          </div>
        {/if}
        {#if open_}
          <div class="details">
            {#if d.hint}<p class="explanation selectable">{@html inlineMarkdown(d.hint.explanation)}</p>{/if}
            {#if d.contextBefore || d.contextAfter}
              <div class="context mono selectable">
                <span class="before">{d.contextBefore ?? ""}</span><span class="cursor"></span><span class="after">{d.contextAfter ?? ""}</span>
              </div>
            {/if}
            {#if d.raw}<pre class="raw selectable">{d.raw}</pre>{/if}
            <div class="detail-actions">
              <button class="btn ghost small" onclick={() => copy(d)}><Icon name="copy" size={12} />{t("problems.copy")}</button>
              {#if d.code && d.source !== "lint"}
                <button class="btn ghost small" onclick={() => ui.openHelp("errors", d.code ?? undefined)}><Icon name="book" size={12} />{t("problems.learnMore")}</button>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  {:else}
    <div class="empty">
      {#if build.running}
        <span class="spinner"></span>
      {:else if diagnostics.build.length || Object.values(diagnostics.lint).some((l) => l.length)}
        {t("problems.allFiltered")}
      {:else}
        <Icon name="check" size={20} />
        <div>{build.outcome?.success ? t("problems.noneAfterBuild") : t("problems.none")}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    flex-shrink: 0;
  }
  .bar .input {
    width: 220px;
  }
  .small {
    font-size: 11px;
  }
  .filter-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: none;
    font-size: 11.5px;
    color: var(--text-faint);
    cursor: pointer;
    opacity: 0.55;
  }
  .filter-btn.on {
    opacity: 1;
    color: var(--error);
    border-color: color-mix(in srgb, var(--error) 40%, transparent);
  }
  .filter-btn.warn.on {
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 40%, transparent);
  }
  .filter-btn.info.on {
    color: var(--info);
    border-color: color-mix(in srgb, var(--info) 40%, transparent);
  }
  .list {
    flex: 1;
    overflow: auto;
    padding: 0 6px 10px;
  }
  .file {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px;
    font-weight: 600;
    font-size: 12px;
    position: sticky;
    top: 0;
    background: var(--bg-elev);
    z-index: 1;
  }
  .item {
    padding: 2px 0 2px 6px;
    border-radius: var(--radius-sm);
  }
  .item:hover {
    background: var(--bg-hover);
  }
  .line {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-height: 24px;
  }
  .expand {
    width: 18px;
    height: 22px;
    border: none;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .sev {
    padding-top: 4px;
  }
  .error .sev {
    color: var(--error);
  }
  .warning .sev {
    color: var(--warning);
  }
  .info .sev {
    color: var(--info);
  }
  .hint .sev {
    color: var(--hint);
  }
  .message {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 3px 0;
    text-align: left;
    color: var(--text);
    cursor: pointer;
    line-height: 1.4;
    outline: none;
  }
  .message:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-soft);
    border-radius: var(--radius-sm);
  }
  .orig {
    font-size: 11px;
    color: var(--text-faint);
  }
  .src {
    padding-top: 4px;
    font-size: 11px;
    color: var(--text-faint);
    white-space: nowrap;
  }
  .loc {
    padding: 3px 8px 0 4px;
    border: none;
    background: none;
    font-size: 11px;
    color: var(--link);
    cursor: pointer;
    white-space: nowrap;
  }
  .fixes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 0 6px 50px;
  }
  .fix {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .fix.main {
    background: var(--accent-soft);
  }
  .fix-all {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--accent-soft);
    font-weight: 600;
  }
  .fix-all:disabled {
    color: var(--text-faint);
    background: none;
    border-color: var(--border);
    font-weight: normal;
  }
  .suggestion {
    display: flex;
    gap: 6px;
    padding: 0 12px 4px 50px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
    cursor: pointer;
  }
  .suggestion :global(.icon) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--warning);
  }
  .suggestion span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .details {
    padding: 0 12px 10px 50px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .explanation {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.55;
  }
  .context {
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .context .before {
    color: var(--text-muted);
  }
  .context .cursor {
    display: inline-block;
    width: 2px;
    height: 1.1em;
    margin: 0 1px;
    vertical-align: text-bottom;
    background: var(--error);
  }
  .context .after {
    color: var(--error);
  }
  .raw {
    margin: 0;
    padding: 8px 10px;
    max-height: 180px;
    overflow: auto;
    border-radius: var(--radius);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: pre-wrap;
  }
  .detail-actions {
    display: flex;
    gap: 6px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: var(--success);
  }
  .empty div {
    color: var(--text-faint);
  }
</style>
