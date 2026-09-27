<script lang="ts">
  // Projects of the projects folder (a preview of their PDF, their name and
  // last change) and the recent projects and files. Used on the start
  // screen and in the "My projects" window.
  import { i18n, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { renderFirstPage } from "$lib/pdf/thumbnail";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { ProjectEntry, ProjectsOverview, RecentProject } from "$lib/types";
  import { samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  let { onopen }: { onopen?: () => void } = $props();

  let overview = $state<ProjectsOverview | null>(null);
  let filter = $state("");
  let sort = $state<"recent" | "name">("recent");
  let thumbs = $state<Record<string, string>>({});

  /** Previews already drawn, kept while the application runs. */
  const cache = (globalThis as { __projectThumbs?: Map<string, string> }).__projectThumbs ?? new Map<string, string>();
  (globalThis as { __projectThumbs?: Map<string, string> }).__projectThumbs = cache;

  async function load() {
    overview = await ipc.listProjects().catch(() => null);
    for (const p of overview?.projects ?? []) {
      if (!p.pdf) continue;
      const key = `${p.pdf}:${p.modified}`;
      const hit = cache.get(key);
      if (hit) {
        thumbs[p.path] = hit;
        continue;
      }
      void renderFirstPage(p.pdf, 170)
        .then(({ url }) => {
          cache.set(key, url);
          thumbs[p.path] = url;
        })
        .catch(() => {});
    }
  }

  $effect(() => {
    void load();
  });

  const q = $derived(filter.trim().toLowerCase());
  const projects = $derived.by(() => {
    const list = (overview?.projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
    return sort === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name, i18n.lang)) : list;
  });
  /** Recent ones not already shown as projects of the folder, plus files. */
  const recent = $derived.by(() => {
    const inFolder = new Set((overview?.projects ?? []).map((p) => p.path));
    return (overview?.recent ?? []).filter((r) => (r.light || !inFolder.has(r.path)) && (!q || r.name.toLowerCase().includes(q))).slice(0, 8);
  });

  function ago(seconds: number): string {
    const diff = Date.now() / 1000 - seconds;
    const rtf = new Intl.RelativeTimeFormat(i18n.lang, { numeric: "auto" });
    if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), "minute");
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
    if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
    return new Date(seconds * 1000).toLocaleDateString(i18n.lang);
  }

  function isOpen(path: string): boolean {
    return samePath(project.info?.light ? project.info.main : project.info?.root, path);
  }

  async function openProject(p: ProjectEntry) {
    onopen?.();
    await project.open(p.path);
  }

  async function openRecent(r: RecentProject) {
    onopen?.();
    await project.openRecent(r);
  }

  async function rename(p: ProjectEntry) {
    const name = await ui.prompt({ title: t("projects.renameTitle"), value: p.name, okLabel: t("common.save") });
    if (!name?.trim()) return;
    await ipc.renameProject(p.path, name).catch((e) => ui.toast("error", String(e)));
    if (isOpen(p.path)) await project.refreshInfo();
    await load();
  }

  async function trash(p: ProjectEntry) {
    const ok = await ui.confirm({ title: t("projects.trashTitle", { name: p.name }), message: t("projects.trashMessage"), okLabel: t("projects.trash"), danger: true });
    if (!ok) return;
    try {
      await ipc.trashProject(p.path);
      ui.toast("success", t("projects.trashed", { name: p.name }));
    } catch (e) {
      ui.toast("error", String(e));
    }
    await load();
  }

  function menu(e: MouseEvent, p: ProjectEntry) {
    const open = isOpen(p.path);
    ui.openMenu(e, [
      { label: t("projects.open"), icon: "folder-open", disabled: open, run: () => openProject(p) },
      { label: t("action.revealInOs"), icon: "external", run: () => ipc.revealInOs(p.path) },
      { separator: true },
      { label: t("projects.rename"), icon: "edit", run: () => rename(p) },
      { label: t("projects.trash"), icon: "trash", danger: true, disabled: open, run: () => trash(p) },
    ]);
  }

  async function forget(e: MouseEvent, r: RecentProject) {
    e.stopPropagation();
    await ipc.forgetRecent(r.path);
    await load();
  }

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
</script>

<div class="browser">
  <div class="bar">
    <div class="title">
      <h2>{t("projects.title")}</h2>
      {#if overview}
        <button class="dir mono ellipsis" title={t("projects.revealDir")} onclick={() => overview && ipc.revealInOs(overview.dir)}>
          <Icon name="folder" size={12} />{overview.dir}
        </button>
      {/if}
    </div>
    <div class="spacer"></div>
    <input class="input search" placeholder={t("projects.search")} bind:value={filter} spellcheck="false" />
    <select class="select input sort" bind:value={sort} aria-label={t("projects.sort")}>
      <option value="recent">{t("projects.sortRecent")}</option>
      <option value="name">{t("projects.sortName")}</option>
    </select>
  </div>

  <div class="actions">
    <button class="action primary" onclick={() => (onopen?.(), ui.openOverlay("newProject"))}>
      <Icon name="folder-plus" size={18} />
      <span><strong>{t("action.newProject").replace(/…$/, "")}</strong><small>{t("projects.newHint")}</small></span>
    </button>
    <button class="action" onclick={() => (onopen?.(), project.openFileDialog())}>
      <Icon name="file-tex" size={18} />
      <span><strong>{t("projects.openFile")}</strong><small>{t("projects.openFileHint")}</small></span>
    </button>
    <button class="action" onclick={() => (onopen?.(), project.openFolderDialog())}>
      <Icon name="folder-open" size={18} />
      <span><strong>{t("action.openProject")}</strong><small>{t("projects.openFolderHint")}</small></span>
    </button>
  </div>

  {#if recent.length}
    <h3 class="section-title">{t("projects.recent")}</h3>
    <div class="recent">
      {#each recent as r (r.path)}
        <div class="recent-item" class:open={isOpen(r.path)} role="button" tabindex="0" onclick={() => openRecent(r)} onkeydown={(e) => e.key === "Enter" && openRecent(r)} title={r.path}>
          <Icon name={r.light ? "file-tex" : "folder"} size={17} />
          <span class="recent-text">
            <strong class="ellipsis">{r.name}</strong>
            <small class="ellipsis">{r.light ? t("projects.lightFile") : r.path}</small>
          </span>
          <small class="when">{ago(r.openedAt)}</small>
          <button class="icon-btn forget" title={t("welcome.forget")} onclick={(e) => forget(e, r)}><Icon name="x" size={12} /></button>
        </div>
      {/each}
    </div>
  {/if}

  <h3 class="section-title">{t("projects.all", { n: overview?.projects.length ?? 0 })}</h3>
  {#if !overview}
    <div class="empty"><span class="spinner"></span></div>
  {:else if projects.length}
    <div class="grid">
      {#each projects as p (p.path)}
        <button class="card" class:open={isOpen(p.path)} onclick={() => openProject(p)} oncontextmenu={(e) => menu(e, p)} title={p.path}>
          <span class="page">
            {#if thumbs[p.path]}
              <img src={thumbs[p.path]} alt="" draggable="false" />
            {:else}
              <span class="initials">{initials(p.name)}</span>
            {/if}
            {#if isOpen(p.path)}<span class="badge open-badge">{t("projects.isOpen")}</span>{/if}
          </span>
          <span class="name ellipsis">{p.name}</span>
          <span class="when faint">{ago(p.modified)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="empty">
      <Icon name="folder" size={28} stroke={1.3} />
      <p>{q ? t("projects.noMatch") : t("projects.none")}</p>
    </div>
  {/if}
</div>

<style>
  .browser {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .title h2 {
    margin: 0;
    font-size: 20px;
  }
  .dir {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 420px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-faint);
    font-size: 11px;
    cursor: pointer;
  }
  .dir:hover {
    color: var(--accent);
  }
  .search {
    width: 220px;
  }
  .sort {
    width: 150px;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 4px;
  }
  .action {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .action:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }
  .action.primary {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .action :global(.icon) {
    color: var(--accent);
    flex-shrink: 0;
  }
  .action span {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .action small {
    color: var(--text-muted);
    font-size: 11.5px;
  }
  .section-title {
    margin: 14px 0 2px;
  }
  .recent {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 6px;
  }
  .recent-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elev);
    cursor: pointer;
    min-width: 0;
  }
  .recent-item:hover,
  .recent-item.open {
    border-color: var(--accent);
  }
  .recent-item :global(.icon) {
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .recent-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .recent-text small,
  .when {
    color: var(--text-faint);
    font-size: 11px;
  }
  .forget {
    width: 22px;
    height: 22px;
    opacity: 0;
  }
  .recent-item:hover .forget {
    opacity: 1;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 18px 14px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .page {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1 / 1.3;
    overflow: hidden;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: linear-gradient(160deg, var(--bg-elev-2), var(--bg-elev));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    transition:
      border-color 0.12s,
      transform 0.12s,
      box-shadow 0.12s;
  }
  .page img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    background: #fff;
  }
  .initials {
    font-size: 30px;
    font-weight: 700;
    color: var(--accent);
    opacity: 0.8;
  }
  .card:hover .page,
  .card.open .page {
    border-color: var(--accent);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
    transform: translateY(-1px);
  }
  .open-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .name {
    font-weight: 600;
    font-size: 13px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 30px;
    color: var(--text-muted);
  }
  @media (max-width: 760px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
