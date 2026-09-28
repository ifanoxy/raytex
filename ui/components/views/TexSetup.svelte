<script lang="ts">
  // TeX distribution: detected installations, choice of the active one,
  // guided installation (any OS, any distribution), extra folders, tools.
  import { open } from "@tauri-apps/plugin-dialog";
  import { t, tr } from "$lib/i18n.svelte";
  import { confirmAndRun, formatCmd } from "$lib/install";
  import * as ipc from "$lib/ipc";
  import { app } from "$lib/state/app.svelte";
  import { distLabel, tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { Distribution, DistroOption } from "$lib/types";
  import Icon from "../common/Icon.svelte";

  let options = $state<DistroOption[]>([]);
  let showOptions = $state(false);
  let installing = $state<string | null>(null);

  $effect(() => {
    void ipc.distroOptions().then((o) => (options = o));
  });

  const status = $derived(tex.status);
  const chosen = $derived(app.settings?.build.distribution ?? null);
  const active = $derived(tex.active);

  const KIND: Record<string, string> = {
    texlive: "TeX Live",
    mactex: "MacTeX",
    tinytex: "TinyTeX",
    miktex: "MiKTeX",
    tectonic: "Tectonic",
    other: "LaTeX",
  };

  function manager(d: Distribution): string {
    const m = d.packageManager;
    switch (m.kind) {
      case "tlmgr":
        return m.writable ? "tlmgr" : `tlmgr (${t("setup.adminOrUser")})`;
      case "miktex":
        return m.modern ? "miktex" : "mpm";
      case "automatic":
        return t("setup.automatic");
      case "system":
        return m.tool;
      default:
        return t("setup.noManager");
    }
  }

  const IMPORTANT_TOOLS = ["pdflatex", "xelatex", "lualatex", "latexmk", "biber", "bibtex", "makeindex", "makeglossaries", "texdoc", "kpsewhich", "synctex", "tectonic"];

  async function install(o: DistroOption) {
    installing = o.id;
    const ok = await confirmAndRun({ kind: "installDistribution", option: o.id }, t("setup.installing", { name: o.name }));
    installing = null;
    if (ok) await tex.detect();
  }

  async function addFolder() {
    const dir = await open({ directory: true, title: t("setup.addFolderTitle") });
    if (typeof dir !== "string") return;
    await app.update((s) => {
      if (!s.build.extraBinDirs.includes(dir)) s.build.extraBinDirs.push(dir);
    });
  }

  async function removeFolder(dir: string) {
    await app.update((s) => {
      s.build.extraBinDirs = s.build.extraBinDirs.filter((d) => d !== dir);
    });
  }

  async function choose(id: string | null) {
    await app.update((s) => {
      s.build.distribution = id;
    });
  }
</script>

<div class="setup">
  {#if status?.detecting}
    <div class="state card"><span class="spinner"></span>{t("setup.detecting")}</div>
  {:else if status?.distributions.length}
    <p class="intro">{t("setup.found", { n: status.distributions.length })}</p>
    <div class="distros">
      <label class="distro auto" class:active={!chosen}>
        <input type="radio" name="dist" checked={!chosen} onchange={() => choose(null)} />
        <div>
          <strong>{t("setup.auto")}</strong>
          <small>{t("setup.autoHint")}</small>
        </div>
      </label>
      {#each status.distributions as d (d.id)}
        <label class="distro" class:active={chosen === d.id}>
          <input type="radio" name="dist" checked={chosen === d.id} onchange={() => choose(d.id)} />
          <div class="d-body">
            <div class="d-head">
              <strong>{distLabel(d)}</strong>
              <span class="badge">{d.kind === "systemtexlive" ? t("setup.systemTexLive") : (KIND[d.kind] ?? d.kind)}</span>
              {#if active?.id === d.id}<span class="badge success">{t("setup.inUse")}</span>{/if}
            </div>
            <small class="mono ellipsis" title={d.binDir}>{d.binDir}</small>
            <div class="chips">
              {#each d.engines as e}<span class="chip">{e}</span>{/each}
              <span class="chip pm"><Icon name="packages" size={11} />{manager(d)}</span>
            </div>
          </div>
        </label>
      {/each}
    </div>

    {#if active}
      <div class="section-title">{t("setup.tools")}</div>
      <div class="tools">
        {#each IMPORTANT_TOOLS as tool}
          {@const path = active.tools[tool]}
          <div class="tool" class:missing={!path} title={path ?? t("setup.toolMissing")}>
            <Icon name={path ? "check" : "minus"} size={12} />
            <span class="mono">{tool}</span>
          </div>
        {/each}
      </div>
      <div class="row">
        <button class="btn small" onclick={() => confirmAndRun({ kind: "updateAll" }, t("action.texUpdate"))}><Icon name="refresh" size={13} />{t("action.texUpdate")}</button>
        {#if active.kind === "miktex"}
          <label class="inline" title={t("setup.miktexAutoHint")}>
            <span class="switch">
              <input type="checkbox" checked={app.settings?.build.miktexAutoInstall} onchange={(e) => app.update((s) => (s.build.miktexAutoInstall = e.currentTarget.checked))} />
              <span></span>
            </span>
            {t("setup.miktexAuto")}
          </label>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="missing card">
      <Icon name="alert-triangle" size={22} />
      <div>
        <strong>{t("setup.noneTitle")}</strong>
        <p>{t("setup.noneText")}</p>
      </div>
    </div>
  {/if}

  {#if !status?.detecting}
    {#if status?.distributions.length}
      <button class="btn ghost small toggle" onclick={() => (showOptions = !showOptions)}>
        <Icon name={showOptions ? "chevron-down" : "chevron-right"} size={13} />{t("setup.installAnother")}
      </button>
    {/if}
    {#if !status?.distributions.length || showOptions}
      <div class="options">
        {#each options as o (o.id)}
          <div class="option card" class:recommended={o.recommended}>
            <div class="o-head">
              <strong>{o.name}</strong>
              {#if o.recommended}<span class="badge accent">{t("setup.recommended")}</span>{/if}
              <span class="badge">{o.size}</span>
              {#if o.needsAdmin}<span class="badge warning"><Icon name="shield" size={10} />{t("setup.admin")}</span>{/if}
            </div>
            <p>{tr(o.description)}</p>
            {#if tr(o.notes)}<p class="notes">{tr(o.notes)}</p>{/if}
            {#if o.command}<code class="cmd selectable">{formatCmd(o.command)}</code>{/if}
            <div class="row">
              {#if o.command}
                <button class="btn small" class:primary={o.recommended} disabled={!!installing} onclick={() => install(o)}>
                  {#if installing === o.id}<span class="spinner"></span>{:else}<Icon name="download" size={13} />{/if}
                  {t("setup.install")}
                </button>
              {/if}
              <button class="btn small ghost" onclick={() => ipc.openUrl(o.url)}><Icon name="external" size={13} />{t("setup.website")}</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <div class="section-title">{t("setup.folders")}</div>
  <p class="hint">{t("setup.foldersHint")}</p>
  {#each app.settings?.build.extraBinDirs ?? [] as dir (dir)}
    <div class="folder">
      <Icon name="folder" size={14} />
      <span class="mono ellipsis">{dir}</span>
      <button class="icon-btn" onclick={() => removeFolder(dir)} title={t("common.delete")}><Icon name="x" size={13} /></button>
    </div>
  {/each}
  <div class="row">
    <button class="btn small" onclick={addFolder}><Icon name="plus" size={13} />{t("setup.addFolder")}</button>
    <button class="btn small" onclick={() => tex.detect()} disabled={status?.detecting}><Icon name="refresh" size={13} />{t("action.texDetect")}</button>
    <button class="btn small ghost" onclick={() => ui.openHelp("guides", "packages-distribution")}><Icon name="help" size={13} />{t("setup.help")}</button>
  </div>
</div>

<style>
  .setup {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .intro,
  .hint {
    margin: 0;
    color: var(--text-muted);
  }
  .hint {
    font-size: 12px;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px;
  }
  .distros {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .distro {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    cursor: pointer;
  }
  .distro.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .distro input {
    margin-top: 3px;
    accent-color: var(--accent);
  }
  .distro > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .distro small {
    color: var(--text-faint);
    font-size: 11.5px;
  }
  .d-head,
  .o-head {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 3px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    border-radius: 9px;
    font-size: 11px;
    background: var(--bg-active);
    color: var(--text-muted);
  }
  .chip.pm {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 4px 12px;
  }
  .tool {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--success);
  }
  .tool span {
    color: var(--text);
  }
  .tool.missing {
    color: var(--text-faint);
  }
  .tool.missing span {
    color: var(--text-faint);
  }
  .missing {
    display: flex;
    gap: 14px;
    padding: 14px 16px;
    color: var(--warning);
  }
  .missing p {
    margin: 4px 0 0;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .missing strong {
    color: var(--text);
  }
  .options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
  }
  .option {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
  }
  .option.recommended {
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .option p {
    margin: 0;
    font-size: 12.5px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .option .notes {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .cmd {
    display: block;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--editor-bg);
    font-size: 11px;
    word-break: break-all;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .row .inline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin-left: 8px;
  }
  .toggle {
    align-self: flex-start;
  }
  .folder {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px 2px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
  }
  .folder span {
    flex: 1;
    font-size: 12px;
  }
  .section-title {
    margin-top: 10px;
  }
</style>
