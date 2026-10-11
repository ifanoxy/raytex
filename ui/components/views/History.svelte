<script lang="ts">
  // The local history of the project: its moments by day, what changed
  // since the one looked at, a file compared line by line with what it was,
  // and a way back (one file, or all of them).
  import { byDay, type Change, counts, dayName, HISTORY_DEFAULTS, type Moment, rows, sizeLabel } from "$lib/history";
  import { i18n, plural, t } from "$lib/i18n.svelte";
  import { app } from "$lib/state/app.svelte";
  import { history } from "$lib/state/history.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  const settings = $derived(app.settings?.history ?? HISTORY_DEFAULTS);
  const days = $derived(byDay(history.view.moments));
  const moment = $derived(history.view.moments.find((m) => m.id === history.selected) ?? null);
  const change = $derived(history.changes.find((c) => c.path === history.file) ?? null);
  const shown = $derived(history.comparison ? rows(history.comparison.lines) : []);
  const total = $derived(history.comparison ? counts(history.comparison.lines) : { added: 0, removed: 0 });
  /** Files that can be put back: those that existed at the moment. */
  const restorable = $derived(history.changes.filter((c) => c.status !== "added"));

  const time = (ms: number) => new Intl.DateTimeFormat(i18n.lang, { hour: "2-digit", minute: "2-digit" }).format(ms);
  const date = (ms: number) => new Intl.DateTimeFormat(i18n.lang, { weekday: "long", day: "numeric", month: "long" }).format(ms);

  function dayTitle(day: number): string {
    const name = dayName(day, Date.now());
    return name === "date" ? date(day) : t(`history.${name}`);
  }

  /** `Changes since 14:32`, with the day when it is not today. */
  function since(m: Moment): string {
    const name = dayName(new Date(m.time).setHours(0, 0, 0, 0), Date.now());
    if (name === "today") return t("history.sinceTime", { time: time(m.time) });
    const day = name === "yesterday" ? t("history.yesterday").toLowerCase() : date(m.time);
    return t(name === "yesterday" ? "history.sinceYesterday" : "history.sinceDate", { day, time: time(m.time) });
  }

  /** What a moment says of itself in the list. */
  function note(m: Moment): string {
    if (m.reason === "open" || m.reason === "manual" || m.reason === "before-restore") return t(`history.reason.${m.reason}`);
    return m.changed.length ? plural(m.changed.length, "history.changedOne", "history.changedMany") : plural(m.files, "history.fileOne", "history.fileMany");
  }

  async function restoreAll() {
    if (!moment || !restorable.length) return;
    const ok = await ui.confirm({
      title: t("history.restoreAllTitle"),
      message: plural(restorable.length, "history.restoreAllOne", "history.restoreAllMany"),
      detail: t("history.restoreAllDetail"),
      okLabel: t("history.restoreAll"),
    });
    if (ok) await history.restore(restorable);
  }

  function more(e: MouseEvent) {
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      { label: t("history.settings"), icon: "settings", run: () => ui.openSettings("editor") },
      { separator: true },
      { label: t("history.clear"), icon: "trash", danger: true, disabled: !history.view.moments.length, run: () => history.clear() },
    ]);
  }

  /** A line cut around the part that differs from the line it replaces. */
  function parts(text: string, span?: { from: number; to: number }): [string, string, string] {
    return span ? [text.slice(0, span.from), text.slice(span.from, span.to), text.slice(span.to)] : [text, "", ""];
  }

  const statusLabel = (c: Change) => (c.status === "added" ? t("history.status.added") : c.status === "removed" ? t("history.status.removed") : "");
</script>

<Modal title={t("history.title")} icon="clock" width="min(1120px, 94vw)" height="min(740px, 90vh)">
  {#snippet actions()}
    <button class="btn small" disabled={history.busy || !history.view.available} onclick={() => history.keep()} title={t("history.keepHint")}>
      <Icon name="plus" size={13} />{t("history.keep")}
    </button>
  {/snippet}

  <div class="history">
    <aside class="moments">
      {#if !settings.enabled}
        <div class="paused">
          <span>{t("history.paused")}</span>
          <button class="btn small" onclick={() => app.update((s) => (s.history = { ...HISTORY_DEFAULTS, ...s.history, enabled: true }))}>{t("history.resume")}</button>
        </div>
      {/if}
      <div class="list moment-list">
        {#each days as day (day.day)}
          <div class="day">{dayTitle(day.day)}</div>
          {#each day.moments as m (m.id)}
            <button class="moment" class:active={m.id === history.selected} onclick={() => history.select(m.id)}>
              <span class="time">{time(m.time)}</span>
              <span class="note ellipsis">{note(m)}</span>
            </button>
          {/each}
        {:else}
          {#if history.loaded}
            <div class="empty none">
              <Icon name="clock" size={22} />
              <span>{t("history.none")}</span>
              <span class="faint">{t("history.noneHint", { n: settings.intervalMinutes })}</span>
            </div>
          {/if}
        {/each}
      </div>
      <div class="foot">
        <span class="faint">{history.view.moments.length ? sizeLabel(history.view.size, i18n.lang) : ""}</span>
        <span class="spacer"></span>
        <button class="icon-btn" title={t("common.more")} aria-label={t("common.more")} onclick={more}><Icon name="more" size={15} /></button>
      </div>
    </aside>

    <section class="compare">
      {#if moment}
        <header class="since">
          <strong>{since(moment)}</strong>
          {#if history.changes.length}
            <span class="faint">{plural(history.changes.length, "history.changedOne", "history.changedMany")}</span>
          {/if}
        </header>
        {#if history.changes.length}
          <div class="files" role="tablist">
            {#each history.changes as c (c.path)}
              <button class="file" class:active={c.path === history.file} role="tab" aria-selected={c.path === history.file} onclick={() => history.pick(c.path)} title={c.path}>
                <span class="dot {c.status}"></span>
                <span class="mono ellipsis">{c.path}</span>
                {#if c.status !== "changed"}<span class="tag">{statusLabel(c)}</span>{/if}
              </button>
            {/each}
          </div>
          <div class="diff selectable" class:busy={history.busy}>
            {#if history.comparison && change}
              <div class="summary">
                <span class="plus">+{total.added}</span>
                <span class="less">−{total.removed}</span>
                {#if change.status === "added"}<span class="faint">{t("history.notThen")}</span>{/if}
                {#if change.status === "removed"}<span class="faint">{t("history.goneNow")}</span>{/if}
              </div>
              <div class="lines">
                {#each shown as row, i (i)}
                  {#if row.type === "gap"}
                    <div class="gap">{plural(row.count, "history.sameOne", "history.sameMany")}</div>
                  {:else}
                    {@const [head, mark, tail] = parts(row.line.text, row.span)}
                    <div class="line {row.line.kind}">
                      <span class="num">{row.line.before ?? ""}</span>
                      <span class="num">{row.line.after ?? ""}</span>
                      <span class="sign">{row.line.kind === "added" ? "+" : row.line.kind === "removed" ? "−" : ""}</span>
                      <span class="text">{head}{#if mark}<mark>{mark}</mark>{/if}{tail}</span>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
          <footer class="actions">
            {#if change && change.status !== "added"}
              <button class="btn" disabled={history.busy} onclick={() => history.restore([change])}>
                <Icon name="undo" size={14} />{t(change.status === "removed" ? "history.recreate" : "history.restoreFile")}
              </button>
            {/if}
            <span class="spacer"></span>
            {#if restorable.length > 1}
              <button class="btn" disabled={history.busy} onclick={restoreAll}>{t("history.restoreAll")}</button>
            {/if}
          </footer>
        {:else}
          <div class="empty same">
            <Icon name="check" size={22} />
            <span>{t("history.nothingChanged")}</span>
          </div>
        {/if}
      {:else if history.loaded}
        <div class="empty same">
          {#if !history.view.available}<span class="faint">{t("history.unavailable")}</span>{/if}
        </div>
      {/if}
    </section>
  </div>
</Modal>

<style>
  .history {
    flex: 1;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  .moments {
    width: 250px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--bg);
  }
  .paused {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
  }
  .paused span {
    flex: 1;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 6px 8px 10px;
  }
  .day {
    padding: 12px 8px 5px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-faint);
  }
  .day::first-letter {
    text-transform: uppercase;
  }
  .moment {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
  }
  .moment:hover {
    background: var(--bg-hover);
  }
  .moment.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  .time {
    flex-shrink: 0;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .note {
    font-size: 11.5px;
  }
  .foot {
    display: flex;
    align-items: center;
    padding: 6px 8px 6px 14px;
    border-top: 1px solid var(--border);
    font-size: 11px;
  }
  .spacer {
    flex: 1;
  }
  .compare {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .since {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 14px 18px 10px;
    font-size: 13.5px;
  }
  .since .faint {
    font-size: 12px;
  }
  .files {
    display: flex;
    gap: 6px;
    padding: 0 18px 10px;
    overflow-x: auto;
    flex-shrink: 0;
  }
  .file {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 260px;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }
  .file:hover {
    background: var(--bg-hover);
  }
  .file.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }
  .dot.added {
    background: var(--success);
  }
  .dot.removed {
    background: var(--error);
  }
  .tag {
    font-size: 10.5px;
    color: var(--text-faint);
  }
  .diff {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
  }
  .diff.busy {
    opacity: 0.6;
  }
  .summary {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    gap: 10px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .plus {
    color: var(--success);
  }
  .less {
    color: var(--error);
  }
  .lines {
    padding: 6px 0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
  }
  .line {
    display: grid;
    grid-template-columns: 42px 42px 18px minmax(0, 1fr);
  }
  .line.removed {
    background: color-mix(in srgb, var(--error) 13%, transparent);
  }
  .line.added {
    background: color-mix(in srgb, var(--success) 13%, transparent);
  }
  .num {
    padding-right: 8px;
    text-align: right;
    color: var(--text-faint);
    user-select: none;
  }
  .sign {
    text-align: center;
    color: var(--text-muted);
    user-select: none;
  }
  .text {
    padding-right: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--text);
  }
  .line.same .text {
    color: var(--text-muted);
  }
  mark {
    border-radius: 3px;
    color: inherit;
  }
  .line.removed mark {
    background: color-mix(in srgb, var(--error) 34%, transparent);
  }
  .line.added mark {
    background: color-mix(in srgb, var(--success) 34%, transparent);
  }
  .gap {
    margin: 4px 0;
    padding: 3px 102px;
    border-block: 1px dashed var(--border);
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--text-faint);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px 14px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--text-muted);
  }
  .empty.none {
    padding: 48px 18px;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .empty.same {
    flex: 1;
    font-size: 13px;
  }
</style>
