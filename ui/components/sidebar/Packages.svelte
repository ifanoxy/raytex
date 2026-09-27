<script lang="ts">
  // Packages: those of the project, every installed package, and the whole
  // CTAN catalogue. Any package can be inspected (its commands are read
  // from its source), documented (texdoc), installed or added.
  import { t } from "$lib/i18n.svelte";
  import { installMissing } from "$lib/install";
  import * as ipc from "$lib/ipc";
  import { build } from "$lib/state/build.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { CatalogEntry, CtanDetails, PackageView } from "$lib/types";
  import Icon from "../common/Icon.svelte";
  import PanelHeader from "../common/PanelHeader.svelte";

  type Tab = "project" | "installed" | "ctan";
  const LIMIT = 250;

  let tab = $state<Tab>("project");
  let filter = $state("");
  let installed = $state<Set<string>>(new Set());
  let installedList = $state<string[]>([]);
  let classes = $state<Set<string>>(new Set());
  let catalog = $state<CatalogEntry[] | null>(null);
  let catalogError = $state<string | null>(null);
  let used = $state<{ name: string; cls: boolean }[]>([]);

  let details = $state<PackageView | null>(null);
  let ctan = $state<CtanDetails | null>(null);
  let loading = $state(false);

  async function loadInstalled() {
    const [list, cls] = await Promise.all([ipc.installedPackages().catch(() => []), ipc.installedClasses().catch(() => [])]);
    installedList = list;
    installed = new Set(list);
    classes = new Set(cls);
  }

  $effect(() => {
    // Refresh when the TeX index changes (after an installation).
    void tex.status?.installedPackages;
    void loadInstalled();
  });

  /** Packages loaded by the project's documents (main file and open files). */
  async function scanProject() {
    const files = new Set<string>();
    if (project.info?.main) files.add(project.info.main);
    for (const tb of editor.tabs) if (tb.kind === "tex") files.add(tb.path);
    const found = new Map<string, boolean>();
    for (const f of files) {
      const text = editor.textOf(f) ?? (await ipc.readTextFile(f).then((r) => r.text).catch(() => ""));
      const re = /\\(usepackage|RequirePackage|documentclass)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      for (const line of text.split("\n")) {
        const code = line.replace(/(^|[^\\])%.*$/, "$1");
        while ((m = re.exec(code))) {
          for (const name of m[2].split(",").map((s) => s.trim()).filter(Boolean)) found.set(name, m[1] === "documentclass");
        }
      }
    }
    used = [...found.entries()].map(([name, cls]) => ({ name, cls })).sort((a, b) => Number(b.cls) - Number(a.cls) || a.name.localeCompare(b.name));
  }

  $effect(() => {
    void editor.revision;
    void project.structure;
    if (tab === "project") void scanProject();
  });

  $effect(() => {
    if (tab === "ctan" && catalog === null && !catalogError) {
      ipc
        .ctanCatalog()
        .then((c) => (catalog = c))
        .catch((e) => (catalogError = String(e)));
    }
  });

  // Opened from elsewhere (hover, error fix…).
  $effect(() => {
    const focus = ui.packageFocus;
    if (focus) {
      ui.packageFocus = null;
      void show(focus, false);
    }
  });

  const q = $derived(filter.trim().toLowerCase());
  const shownUsed = $derived(used.filter((p) => !q || p.name.toLowerCase().includes(q)));
  const shownInstalled = $derived.by(() => {
    const list = q ? installedList.filter((p) => p.toLowerCase().includes(q)) : installedList;
    return { total: list.length, items: list.slice(0, LIMIT) };
  });
  const shownCatalog = $derived.by(() => {
    const list = catalog ?? [];
    const filtered = q ? list.filter((e) => e.key.toLowerCase().includes(q) || e.caption.toLowerCase().includes(q)) : list;
    // Exact and prefix matches first.
    const ranked = q ? [...filtered].sort((a, b) => rank(a.key) - rank(b.key)) : filtered;
    return { total: filtered.length, items: ranked.slice(0, LIMIT) };
  });

  function rank(key: string) {
    const k = key.toLowerCase();
    return k === q ? 0 : k.startsWith(q) ? 1 : 2;
  }

  async function show(name: string, cls: boolean) {
    loading = true;
    ctan = null;
    try {
      details = await ipc.packageDetails(name, cls);
    } catch (e) {
      ui.toast("error", String(e));
    } finally {
      loading = false;
    }
  }

  async function showCtan(name: string) {
    loading = true;
    try {
      ctan = await ipc.ctanPackage(name);
      if (!details || details.name !== name) details = await ipc.packageDetails(name, false).catch(() => null);
    } catch (e) {
      ui.toast("error", t("packages.ctanFailed"), { detail: String(e) });
    } finally {
      loading = false;
    }
  }

  async function install(name: string) {
    if (await installMissing(name)) {
      await loadInstalled();
      if (details?.name === name) await show(name, details.class);
      if (build.outcome && !build.outcome.success) void build.run();
    }
  }

  async function texdoc(name: string) {
    const ok = await ipc.openTexdoc(name).catch(() => false);
    if (!ok) {
      ui.toast("info", t("packages.noTexdoc"), {
        action: { label: t("packages.openCtan"), run: () => ipc.openUrl(`https://ctan.org/pkg/${encodeURIComponent(name)}`) },
      });
    }
  }

  function insertCommand(cmd: string) {
    editor.insertText(cmd.startsWith("\\") ? cmd : `\\${cmd}`);
  }
</script>

{#if details || ctan}
  {@const d = details}
  <PanelHeader title={d?.name ?? ctan?.name ?? ""}>
    <button class="icon-btn" title={t("common.back")} onclick={() => { details = null; ctan = null; }}><Icon name="arrow-left" /></button>
  </PanelHeader>
  <div class="details">
    <div class="status">
      {#if d?.installed || (d && (d.class ? classes : installed).has(d.name))}
        <span class="badge success"><Icon name="check" size={11} />{t("packages.installed")}</span>
      {:else}
        <span class="badge warning">{t("packages.notInstalled")}</span>
      {/if}
      {#if d?.class}<span class="badge">{t("packages.class")}</span>{/if}
    </div>
    {#if d?.summary}<p class="summary">{d.summary}</p>{/if}
    {#if ctan}
      <p class="summary"><strong>{ctan.caption}</strong></p>
      <div class="ctan-desc doc">{#each ctan.description.split(/\n{2,}/) as para}<p>{para}</p>{/each}</div>
      <div class="meta">
        {#if ctan.version}<span>{t("packages.version")} : {ctan.version}</span>{/if}
        {#if ctan.license}<span>{t("packages.license")} : {ctan.license}</span>{/if}
        {#if ctan.texlive}<span>TeX Live : {ctan.texlive}</span>{/if}
        {#if ctan.miktex}<span>MiKTeX : {ctan.miktex}</span>{/if}
      </div>
    {:else if d?.provides}
      <p class="provides mono">{d.provides}</p>
    {/if}

    <div class="buttons">
      {#if d && !d.installed && !(d.class ? classes : installed).has(d.name)}
        <button class="btn primary small" onclick={() => install(d.name)}><Icon name="download" size={13} />{t("packages.install")}</button>
      {/if}
      {#if d && !d.class && editor.activeTab?.kind === "tex"}
        <button class="btn small" onclick={() => editor.addPackage(d.name)}><Icon name="plus" size={13} />{t("packages.addToDocument")}</button>
      {/if}
      <button class="btn small" onclick={() => texdoc(d?.name ?? ctan!.id)}><Icon name="book" size={13} />{t("packages.documentation")}</button>
      {#if !ctan}
        <button class="btn small" onclick={() => showCtan(d!.name)}><Icon name="globe" size={13} />CTAN</button>
      {:else}
        <button class="btn small" onclick={() => ipc.openUrl(ctan!.ctanUrl)}><Icon name="external" size={13} />ctan.org</button>
      {/if}
    </div>
    {#if loading}<div class="spinner"></div>{/if}

    {#if ctan?.documentation.length}
      <div class="section-title">{t("packages.docs")}</div>
      <div class="links">
        {#each ctan.documentation as doc}
          <button class="link" onclick={() => ipc.openUrl(doc.url)}><Icon name="external" size={12} />{doc.label || doc.url}</button>
        {/each}
      </div>
    {/if}

    {#if d?.options.length}
      <div class="section-title">{t("packages.options", { n: d.options.length })}</div>
      <div class="chips">
        {#each d.options as o}<span class="chip mono">{o}</span>{/each}
      </div>
    {/if}
    {#if d?.environments.length}
      <div class="section-title">{t("packages.environments", { n: d.environments.length })}</div>
      <div class="chips">
        {#each d.environments.slice(0, 300) as env}
          <button class="chip mono" title={t("packages.insert")} onclick={() => editor.insertSnippet(`\\begin{${env}}\n\t\${1:\${SELECTION}}\n\\end{${env}}\${0}`)}>{env}</button>
        {/each}
      </div>
    {/if}
    {#if d?.commands.length}
      <div class="section-title">{t("packages.commands", { n: d.commands.length })}</div>
      <div class="chips">
        {#each d.commands.slice(0, 600) as cmd}
          <button class="chip mono" title={t("packages.insert")} onclick={() => insertCommand(cmd)}>\{cmd.replace(/^\\/, "")}</button>
        {/each}
      </div>
    {/if}
    {#if d?.requires.length}
      <div class="section-title">{t("packages.requires")}</div>
      <div class="chips">
        {#each d.requires as r}<button class="chip mono" onclick={() => show(r, false)}>{r}</button>{/each}
      </div>
    {/if}
    {#if d && !d.installed && !d.commands.length && !ctan}
      <p class="faint small">{t("packages.notInstalledHint")}</p>
    {/if}
  </div>
{:else}
  <PanelHeader title={t("sidebar.packages")}>
    <button class="icon-btn" title={t("action.texUpdate")} onclick={() => ui.openOverlay("setup")}><Icon name="wand" /></button>
  </PanelHeader>
  <div class="tabs" role="tablist">
    <button class="tab" class:active={tab === "project"} onclick={() => (tab = "project")}>{t("packages.tabProject")}</button>
    <button class="tab" class:active={tab === "installed"} onclick={() => (tab = "installed")}>{t("packages.tabInstalled")} <span class="n">{installedList.length}</span></button>
    <button class="tab" class:active={tab === "ctan"} onclick={() => (tab = "ctan")}>CTAN</button>
  </div>
  <div class="filter"><input class="input small" placeholder={t("packages.filter")} bind:value={filter} spellcheck="false" /></div>

  <div class="list">
    {#if tab === "project"}
      {#each shownUsed as p (p.name)}
        {@const ok = (p.cls ? classes.has(p.name) : installed.has(p.name)) || !installedList.length}
        <div class="row-wrap">
          <button class="row" onclick={() => show(p.name, p.cls)}>
            <Icon name={p.cls ? "file-tex" : "packages"} size={14} />
            <span class="name mono ellipsis">{p.name}</span>
            {#if p.cls}<span class="badge">{t("packages.class")}</span>{/if}
            {#if !ok}<span class="badge warning">{t("packages.missing")}</span>{/if}
          </button>
          {#if !ok}
            <button class="btn small primary" onclick={() => install(p.name)}>{t("packages.install")}</button>
          {/if}
        </div>
      {:else}
        <div class="empty">{t("packages.noneInProject")}</div>
      {/each}
    {:else if tab === "installed"}
      {#each shownInstalled.items as name (name)}
        <button class="row" onclick={() => show(name, false)}>
          <Icon name="packages" size={14} />
          <span class="name mono ellipsis">{name}</span>
        </button>
      {:else}
        <div class="empty">{tex.status?.indexing ? t("status.indexing") : t("packages.none")}</div>
      {/each}
      {#if shownInstalled.total > LIMIT}<div class="more faint">{t("packages.more", { n: shownInstalled.total - LIMIT })}</div>{/if}
    {:else}
      {#if catalogError}
        <div class="empty">{t("packages.ctanFailed")}<br /><span class="small">{catalogError}</span></div>
      {:else if !catalog}
        <div class="empty"><span class="spinner"></span></div>
      {:else}
        {#each shownCatalog.items as e (e.key)}
          <button class="row two" onclick={() => showCtan(e.key)}>
            <span class="line1">
              <span class="name mono ellipsis">{e.key}</span>
              {#if installed.has(e.key)}<Icon name="check" size={12} class="ok" />{/if}
            </span>
            <span class="caption ellipsis">{e.caption}</span>
          </button>
        {/each}
        {#if shownCatalog.total > LIMIT}<div class="more faint">{t("packages.more", { n: shownCatalog.total - LIMIT })}</div>{/if}
      {/if}
    {/if}
  </div>
{/if}

<style>
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    padding: 6px 7px 7px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 11.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .n {
    font-size: 10px;
    color: var(--text-faint);
  }
  .filter {
    padding: 8px 10px 4px;
  }
  .filter .input {
    width: 100%;
  }
  .list,
  .details {
    flex: 1;
    overflow: auto;
    padding: 2px 6px 12px;
  }
  .details {
    padding: 0 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 4px;
  }
  .row-wrap .row {
    flex: 1;
    min-width: 0;
  }
  .row-wrap .btn {
    flex-shrink: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
  }
  .row:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .row.two {
    flex-direction: column;
    align-items: stretch;
    gap: 1px;
    padding: 5px 8px;
  }
  .line1 {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .line1 :global(.ok) {
    color: var(--success);
  }
  .name {
    flex: 1;
    color: var(--text);
    font-size: 12px;
  }
  .caption {
    font-size: 11px;
    color: var(--text-faint);
  }
  .more {
    padding: 8px;
    font-size: 11px;
    text-align: center;
  }
  .status,
  .buttons,
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .meta {
    font-size: 11px;
    color: var(--text-muted);
    gap: 4px 12px;
  }
  .summary {
    margin: 0;
    line-height: 1.5;
  }
  .provides {
    margin: 0;
    font-size: 11px;
    color: var(--text-muted);
  }
  .ctan-desc {
    font-size: 12px;
    color: var(--text-muted);
  }
  .ctan-desc :global(p) {
    margin: 4px 0;
  }
  .section-title {
    margin-top: 6px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--bg-elev-2);
    font-size: 11px;
    color: var(--text-muted);
  }
  button.chip {
    cursor: pointer;
  }
  button.chip:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .link {
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    color: var(--link);
    cursor: pointer;
    text-align: left;
    padding: 2px 0;
    font-size: 12px;
  }
  .small {
    font-size: 11px;
  }
</style>
