<script lang="ts">
  // Exporting the project as an archive: the whole of it, or what the
  // document needs for arXiv or a journal. What the archive will hold is
  // listed before anything is written.
  import { onMount } from "svelte";
  import { save } from "@tauri-apps/plugin-dialog";
  import { archiveName, byRole, defaultOptions, type ExportOptions, type ExportPlan } from "$lib/export";
  import { sizeLabel } from "$lib/history";
  import { i18n, plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { build } from "$lib/state/build.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { basename, dirname, join } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  const main = project.info?.main ?? editor.active ?? "";
  const lang = i18n.lang === "fr" ? "fr" : "en";

  let options = $state<ExportOptions>(defaultOptions(false));
  let plan = $state<ExportPlan | null>(null);
  let more = $state(false);
  let busy = $state(false);
  let building = $state(false);
  let asked = 0;

  /** What the archive would hold with the options as they are. */
  async function read() {
    const my = ++asked;
    const wanted = $state.snapshot(options) as ExportOptions;
    const found = await ipc.exportPlan(main, wanted).catch(() => null);
    if (my === asked) plan = found;
  }

  onMount(async () => {
    // What is typed and not yet saved is part of the project.
    await editor.saveAll({ silent: true });
    await read();
  });

  function choose(submission: boolean) {
    if (options.submission === submission) return;
    options = { ...defaultOptions(submission), includePdf: options.includePdf };
    void read();
  }

  function set<K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) {
    options[key] = value;
    void read();
  }

  /** Compiles the document, which is what tells the files it reads. */
  async function compile() {
    if (building) return;
    building = true;
    try {
      await build.run({ whole: true });
      for (let i = 0; i < 50 && !build.running; i++) await new Promise((r) => setTimeout(r, 100));
      while (build.running) await new Promise((r) => setTimeout(r, 200));
      await read();
    } finally {
      building = false;
    }
  }

  const groups = $derived(plan ? byRole(plan.files) : []);
  const needsBuild = $derived(options.submission && !!plan && !plan.recorded);
  const ready = $derived(!!plan && plan.files.length > 0 && !needsBuild);

  async function write() {
    if (!ready || busy) return;
    const root = project.info?.root ?? "";
    const name = archiveName(project.info?.name ?? basename(root), options.submission);
    const dest = await save({ defaultPath: root ? join(dirname(root), name) : name, filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!dest) return;
    busy = true;
    try {
      const size = await ipc.exportWrite(main, $state.snapshot(options) as ExportOptions, dest);
      ui.toast("success", t("export.done", { file: basename(dest), size: sizeLabel(size, lang) }), { action: { label: t("export.show"), run: () => void ipc.revealInOs(dest) } });
      ui.closeOverlay();
    } catch (e) {
      ui.toast("error", String(e));
    } finally {
      busy = false;
    }
  }
</script>

{#snippet check(key: "stripComments" | "singleFile" | "includeBib" | "includePdf", label: string, hint: string | null)}
  <label class="check">
    <input type="checkbox" checked={options[key]} onchange={(e) => set(key, (e.currentTarget as HTMLInputElement).checked)} />
    <span>
      {label}
      {#if hint}<span class="hint faint">{hint}</span>{/if}
    </span>
  </label>
{/snippet}

<Modal title={t("export.title")} icon="download" width="min(760px, 94vw)" height="min(680px, 92vh)">
  <div class="export export-window">
    <div class="kinds" role="radiogroup" aria-label={t("export.title")}>
      <button class="kind" class:active={!options.submission} role="radio" aria-checked={!options.submission} data-kind="project" onclick={() => choose(false)}>
        <Icon name="folder" size={18} />
        <span class="name">{t("export.project")}</span>
        <span class="what">{t("export.projectHint")}</span>
      </button>
      <button class="kind" class:active={options.submission} role="radio" aria-checked={options.submission} data-kind="submission" onclick={() => choose(true)}>
        <Icon name="file-tex" size={18} />
        <span class="name">{t("export.submission")}</span>
        <span class="what">{t("export.submissionHint")}</span>
      </button>
    </div>

    <div class="options">
      {#if options.submission}
        {@render check("stripComments", t("export.stripComments"), t("export.stripCommentsHint"))}
        {@render check("includeBib", t("export.includeBib"), null)}
      {:else}
        {@render check("includePdf", t("export.includePdf"), null)}
      {/if}
      {#if options.submission}
        <button class="more" class:open={more} aria-expanded={more} onclick={() => (more = !more)}>
          {t("layout.advanced")}<Icon name={more ? "chevron-up" : "chevron-down"} size={12} />
        </button>
        {#if more}
          {@render check("singleFile", t("export.singleFile"), t("export.singleFileHint"))}
          {@render check("includePdf", t("export.includePdf"), null)}
        {/if}
      {/if}
    </div>

    <div class="contents">
      {#if needsBuild}
        <div class="empty">
          <Icon name="play" size={20} />
          <span>{t("export.needsBuild")}</span>
          <button class="btn primary" disabled={building} onclick={compile}>
            {#if building}<span class="spinner"></span>{:else}<Icon name="play" size={13} />{/if}{t("export.compile")}
          </button>
        </div>
      {:else if plan}
        <header>
          <strong>{plural(plan.files.length, "export.fileOne", "export.fileMany")}</strong>
          <span class="faint">{sizeLabel(plan.size, lang)}</span>
          {#if options.submission && plan.stale}
            <span class="stale"><Icon name="alert-triangle" size={13} />{t("export.stale")}</span>
            <button class="btn small" disabled={building} onclick={compile}>{t("export.compile")}</button>
          {/if}
        </header>
        <div class="list file-list">
          {#each groups as group (group.role)}
            <div class="role">{t(`export.role.${group.role}`)}</div>
            {#each group.files as f (f.name)}
              <div class="file">
                <span class="mono ellipsis" title={f.name}>{f.name}</span>
                <span class="faint">{sizeLabel(f.size, lang)}</span>
              </div>
            {/each}
          {:else}
            <div class="empty"><span>{t("export.nothing")}</span></div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="buttons">
      <button class="btn" onclick={() => ui.closeOverlay()}>{t("common.cancel")}</button>
      <button class="btn primary" disabled={!ready || busy} onclick={write}><Icon name="download" size={14} />{t("export.write")}</button>
    </div>
  </div>
</Modal>

<style>
  .export {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    min-height: 0;
    padding: 16px 18px 14px;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    flex-shrink: 0;
  }
  .kind {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 3px 10px;
    align-items: center;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
  }
  .kind:hover {
    background: var(--bg-hover);
  }
  .kind.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
  }
  .what {
    grid-column: 2;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 22px;
    flex-shrink: 0;
  }
  .check {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .check input {
    position: relative;
    top: 2px;
  }
  .hint {
    margin-left: 4px;
    font-size: 11.5px;
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: none;
    border-radius: 999px;
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .more:hover,
  .more.open {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .contents {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    overflow: hidden;
  }
  .contents header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
    font-size: 12.5px;
    flex-shrink: 0;
  }
  .stale {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    font-size: 12px;
    color: var(--warning);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 12px 10px;
  }
  .role {
    padding: 10px 0 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-faint);
  }
  .file {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 2.5px 0;
    font-size: 12px;
  }
  .file .mono {
    flex: 1;
    min-width: 0;
    color: var(--text);
  }
  .file .faint {
    flex-shrink: 0;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }
</style>
