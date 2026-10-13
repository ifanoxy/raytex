<script lang="ts">
  // The window of an export of the PDF, a window of its own next to the
  // main one. It follows the build from the events of the engine: its steps
  // one after the other, the file being read, the page, how far it is and
  // about how long is left, and what the compiler writes. The main window
  // runs the export and tells the rest (see `lib/exportwindow.ts`).
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { OpenFiles, shownFile } from "$lib/buildoutput";
  import { roundedRemaining } from "$lib/buildprogress";
  import type { ExportWindowCommand, ExportWindowSeed, ExportWindowState } from "$lib/exportwindow";
  import { i18n, plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { BuildTracker } from "$lib/state/tracker.svelte";
  import { basename, dirname, formatDuration } from "$lib/utils";
  import Icon from "./components/common/Icon.svelte";

  /** A step of the export, as it is listed. */
  interface Row {
    id: number;
    label: string;
    state: "running" | "done" | "failed";
    startedAt: number;
    /** How long it took, once it has ended. */
    ms: number | null;
  }

  const KEEP_KEY = "raytex.export.keepOpen";
  /** Lines of the compiler kept to be read. */
  const MAX_LINES = 400;
  const inApp = "__TAURI_INTERNALS__" in window;

  let job = $state<ExportWindowState | null>(null);
  let rows = $state<Row[]>([]);
  let lines = $state<string[]>([]);
  let pictures = $state<{ done: number; total: number } | null>(null);
  let current = $state<string | null>(null);
  let startedAt = $state(Date.now());
  let now = $state(Date.now());
  let keep = $state(
    (() => {
      try {
        return localStorage.getItem(KEEP_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );
  let consoleEl = $state<HTMLElement | null>(null);
  const tracker = new BuildTracker();
  const files = new OpenFiles();
  let nextId = 0;
  let closing: ReturnType<typeof setTimeout> | null = null;

  const phase = $derived(job?.phase ?? "building");
  const over = $derived(phase === "done" || phase === "failed" || phase === "closed");
  /** A compiler is at work for this export, and tells where it is. */
  const compiling = $derived((phase === "building" || phase === "lighter") && rows.some((r) => r.state === "running"));

  // The clock of the window runs while there is something to follow.
  $effect(() => {
    if (over) return;
    const timer = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(timer);
  });

  // ------------------------------------------------------------------ steps

  function finish(as: "done" | "failed" = "done") {
    for (const row of rows) {
      if (row.state !== "running") continue;
      row.state = as;
      row.ms = Date.now() - row.startedAt;
    }
  }

  function begin(label: string) {
    finish();
    rows.push({ id: nextId++, label, state: "running", startedAt: Date.now(), ms: null });
  }

  function restart() {
    rows = [];
    lines = [];
    pictures = null;
    current = null;
    startedAt = now = Date.now();
    files.reset();
    if (closing) clearTimeout(closing);
    closing = null;
  }

  /** What the main window says: the phase the export is in, and how it ends. */
  function told(next: ExportWindowState) {
    const before = job;
    if (!before || before.dest !== next.dest || before.phase === "done" || before.phase === "closed" || (before.phase === "failed" && next.phase !== "failed")) restart();
    job = next;
    i18n.lang = next.lang;
    document.documentElement.dataset.theme = next.theme;
    document.documentElement.lang = next.lang;
    if (next.seed && !rows.length) seed(next.seed);
    if (next.phase === before?.phase && before.dest === next.dest) return;
    if (next.phase === "pictures") begin(t("pdfExport.lightening"));
    else if (next.phase === "copying") begin(t("pdfExport.writing"));
    else if (next.phase === "failed") finish("failed");
    else if (next.phase === "done") {
      finish();
      void report();
      if (!keep) closing = setTimeout(() => void close(), 1800);
    } else if (next.phase === "closed") void close();
  }

  /** A build that was under way when the window opened: its steps so far, and what it wrote. */
  function seed(from: ExportWindowSeed) {
    tracker.start(job?.reference ?? null);
    files.reset();
    for (const step of from.steps) {
      rows.push({ id: nextId++, label: step.name, state: step.ms === null ? "running" : "done", startedAt: step.startedAt, ms: step.ms });
      tracker.stepStarted(step.name);
      tracker.stepStartedAt = step.startedAt;
    }
    tracker.pages = from.pages;
    lines = from.lines.slice(-MAX_LINES);
    files.feed(`${from.lines.join("\n")}\n`);
    const file = files.current;
    current = file ? shownFile(file, job?.base) : null;
  }

  /** What was shown, told to the main window at the end. */
  function report() {
    return ipc.tell("main", "export-window:report", { steps: rows.length, lines: lines.length }).catch(() => {});
  }

  function output(text: { stream: string; text: string }[]) {
    tracker.output(text);
    for (const line of text) {
      if (line.stream !== "cmd") files.feed(`${line.text}\n`);
      lines.push(line.text);
    }
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    const file = files.current;
    current = file ? shownFile(file, job?.base) : null;
  }

  // What is written is followed: the last line stays in sight, unless the reader went back up.
  $effect(() => {
    void lines.length;
    const el = consoleEl;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
  });

  // -------------------------------------------------------------- what shows

  const progress = $derived.by(() => {
    if (phase === "done") return { fraction: 1, remainingMs: null };
    if (phase === "pictures") return { fraction: pictures?.total ? pictures.done / pictures.total : null, remainingMs: null };
    return compiling ? tracker.progress(now) : { fraction: null, remainingMs: null };
  });
  const percent = $derived(progress.fraction === null ? null : Math.round(progress.fraction * 100));
  const left = $derived.by(() => {
    if (!compiling) return "";
    if (progress.remainingMs !== null) {
      const { n, unit } = roundedRemaining(progress.remainingMs);
      return t(unit === "s" ? "pdfExport.leftSeconds" : "pdfExport.leftMinutes", { n });
    }
    return progress.fraction !== null ? t("pdfExport.almost") : "";
  });
  const page = $derived.by(() => {
    if (!compiling || !tracker.pages) return "";
    const total = tracker.reference?.pages ?? 0;
    return total >= tracker.pages ? t("pdfExport.pageOf", { n: tracker.pages, total }) : t("pdfExport.page", { n: tracker.pages });
  });
  /** The steps the last build had after the one that runs: what is still to come. */
  const coming = $derived(compiling && job?.reference ? job.reference.steps.slice(Math.max(0, tracker.stepIndex) + 1).map((s) => s.name) : []);
  const elapsed = $derived(formatDuration(Math.max(0, Math.round((now - startedAt) / 1000) * 1000)));

  // --------------------------------------------------------------- commands

  function ask(command: ExportWindowCommand) {
    void ipc.tell("main", "export-window:command", command).catch(() => {});
  }

  async function close() {
    if (closing) clearTimeout(closing);
    closing = null;
    if (inApp) await getCurrentWindow().close().catch(() => {});
  }

  function setKeep(value: boolean) {
    keep = value;
    try {
      localStorage.setItem(KEEP_KEY, value ? "1" : "0");
    } catch {
      /* not remembered */
    }
    if (value && closing) {
      clearTimeout(closing);
      closing = null;
    }
  }

  onMount(() => {
    const stop: (() => void)[] = [];
    void (async () => {
      const building = () => job?.phase === "building";
      const apart = () => job?.phase === "pictures" || job?.phase === "lighter";
      stop.push(await ipc.on("export-window:state", told));
      // A build of the project counts while the export waits for one.
      stop.push(
        await ipc.on("build:started", () => {
          if (!building()) return;
          finish();
          tracker.start(job?.reference ?? null);
          files.reset();
        }),
      );
      stop.push(
        await ipc.on("build:step", ({ name, command }) => {
          if (!building()) return;
          begin(name);
          tracker.stepStarted(name);
          output([{ stream: "cmd", text: `$ ${command}` }]);
        }),
      );
      stop.push(await ipc.on("build:output", ({ lines: text }) => building() && output(text)));
      stop.push(await ipc.on("build:finished", () => building() && finish()));
      // The build made apart, with lighter images.
      stop.push(await ipc.on("export:pictures", (said) => apart() && (pictures = said)));
      stop.push(
        await ipc.on("export:step", ({ name, command }) => {
          if (!apart()) return;
          if (tracker.stepIndex < 0 || job?.phase === "pictures") {
            tracker.start(job?.reference ?? null);
            files.reset();
          }
          begin(name);
          tracker.stepStarted(name);
          output([{ stream: "cmd", text: `$ ${command}` }]);
        }),
      );
      stop.push(await ipc.on("export:output", ({ lines: text }) => apart() && output(text)));
      // Ready to be told where the export stands.
      await ipc.tell("main", "export-window:ready", null).catch(() => {});
    })();
    return () => stop.forEach((off) => off());
  });
</script>

<main class="export-window" class:failed={phase === "failed"} class:done={phase === "done"}>
  <header>
    <span class="badge-icon"><Icon name={phase === "failed" ? "alert-circle" : phase === "done" ? "check" : "download"} size={18} /></span>
    <div class="what">
      <h1 class="ellipsis" title={job?.dest}>{job ? basename(job.dest) : t("pdfExport.title")}</h1>
      <p class="faint ellipsis">{job ? dirname(job.dest) : ""}</p>
    </div>
    <span class="elapsed faint" title={t("pdfExport.elapsed")}>{elapsed}</span>
  </header>

  <ol class="steps" aria-label={t("pdfExport.steps")}>
    {#each rows as row (row.id)}
      <li class={row.state}>
        <span class="mark">
          {#if row.state === "running"}<span class="spinner"></span>{:else}<Icon name={row.state === "done" ? "check" : "x"} size={13} />{/if}
        </span>
        <span class="label ellipsis">{row.label}</span>
        <span class="detail faint">
          {#if row.state === "running" && phase === "pictures" && pictures}
            {t("pdfExport.picturesOf", { n: pictures.done, total: pictures.total })}
          {:else if row.ms !== null}
            {formatDuration(row.ms)}
          {/if}
        </span>
      </li>
    {/each}
    {#each coming as name, i (i)}
      <li class="coming"><span class="mark"></span><span class="label ellipsis">{name}</span><span class="detail"></span></li>
    {/each}
    {#if !rows.length && !over}
      <li class="running"><span class="mark"><span class="spinner"></span></span><span class="label">{t("pdfExport.starting")}</span><span class="detail"></span></li>
    {/if}
  </ol>

  {#if phase === "failed"}
    <p class="result why">
      {job?.reason ?? (job?.errors ? plural(job.errors, "pdfExport.errorOne", "pdfExport.errorMany") : t("pdfExport.noOutput"))}
      <span class="faint">{t("pdfExport.notExported")}</span>
    </p>
  {:else if phase === "done"}
    <p class="result" class:warning={job?.warning}>{job?.result}</p>
  {:else}
    <div class="now">
      <span class="pair"><span class="faint">{t("pdfExport.file")}</span><span class="mono ellipsis" title={current ?? ""}>{current ?? "…"}</span></span>
      <span class="pair"><span class="faint">{page ? "" : t("pdfExport.pageLabel")}</span><span>{page || "…"}</span></span>
    </div>
  {/if}

  <div class="meter">
    <div class="bar" class:unknown={percent === null && !over} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? undefined}>
      <div class="fill" style:width={percent === null ? undefined : `${percent}%`}></div>
    </div>
    <span class="percent">{percent === null ? "" : `${percent} %`}</span>
    <span class="left faint">{left}</span>
  </div>

  <section class="console">
    <h2>{t("pdfExport.output")}</h2>
    <pre class="mono selectable" bind:this={consoleEl}>{lines.join("\n")}</pre>
  </section>

  <footer>
    {#if !over}
      <label class="keep"><input type="checkbox" checked={keep} onchange={(e) => setKeep(e.currentTarget.checked)} />{t("pdfExport.keepOpen")}</label>
    {/if}
    <div class="spacer"></div>
    {#if phase === "failed"}
      {#if job?.errors}<button class="btn" onclick={() => ask("problems")}>{t("build.showProblems")}</button>{/if}
      {#if job?.canForce}<button class="btn" onclick={() => ask("force")}>{t("pdfExport.force")}</button>{/if}
      <button class="btn primary" onclick={close}>{t("common.close")}</button>
    {:else if phase === "done"}
      <button class="btn" onclick={() => ask("reveal")}>{t("export.show")}</button>
      <button class="btn primary" onclick={close}>{t("common.close")}</button>
    {:else}
      <button class="btn" onclick={() => ask("cancel")}>{t("common.cancel")}</button>
    {/if}
  </footer>
</main>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    height: 100%;
    margin: 0;
  }
  .export-window {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px 14px;
    box-sizing: border-box;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .badge-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .failed .badge-icon {
    background: color-mix(in srgb, var(--error) 16%, transparent);
    color: var(--error);
  }
  .done .badge-icon {
    background: color-mix(in srgb, var(--success) 16%, transparent);
    color: var(--success);
  }
  .what {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .what p {
    margin: 2px 0 0;
    font-size: 12px;
  }
  .elapsed {
    flex-shrink: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  /* The steps of the export, one after the other. */
  .steps {
    flex-shrink: 0;
    max-height: 34%;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: auto;
  }
  .steps li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 22px;
    font-size: 12.5px;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
  }
  .steps .done .mark {
    color: var(--success);
  }
  .steps .failed .mark,
  .steps .failed .label {
    color: var(--error);
  }
  .steps .running .label {
    font-weight: 600;
  }
  .steps .coming {
    color: var(--text-faint);
  }
  .steps .coming .mark::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--border-strong);
  }
  .detail {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .now {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    font-size: 12.5px;
  }
  .pair {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    white-space: nowrap;
  }
  .result {
    flex-shrink: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    line-height: 1.45;
  }
  .result.warning {
    color: var(--warning);
  }
  .meter {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--bg-hover);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 4px;
    background: var(--accent);
    transition: width 0.25s linear;
  }
  .done .fill {
    background: var(--success);
  }
  .failed .fill {
    background: var(--error);
  }
  /* Nothing tells how far the build is: the bar only says that it runs. */
  .bar.unknown .fill {
    width: 30%;
    animation: slide 1.3s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }
  .percent {
    min-width: 38px;
    text-align: right;
    font-weight: 600;
  }
  .left:empty,
  .percent:empty {
    display: none;
  }
  /* What the compiler writes, as it writes it. */
  .console {
    flex: 1;
    min-height: 70px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--text-faint);
  }
  pre {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--editor-bg);
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overflow: auto;
  }
  footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .keep {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .keep input {
    accent-color: var(--accent);
  }
  @media (prefers-reduced-motion: reduce) {
    .bar.unknown .fill {
      animation: none;
    }
  }
</style>
