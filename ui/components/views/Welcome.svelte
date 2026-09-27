<script lang="ts">
  // Start screen: create or open a project, recent projects, TeX status.
  import { keyFor } from "$lib/actions";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { app } from "$lib/state/app.svelte";
  import { project } from "$lib/state/project.svelte";
  import { distLabel, tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  const recent = $derived(app.session?.recent ?? []);
  const dist = $derived(tex.active);

  function ago(seconds: number): string {
    const diff = Date.now() / 1000 - seconds;
    const rtf = new Intl.RelativeTimeFormat(document.documentElement.lang || "fr", { numeric: "auto" });
    if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), "minute");
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
    if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
    return new Date(seconds * 1000).toLocaleDateString();
  }

  async function forget(e: MouseEvent, path: string) {
    e.stopPropagation();
    await ipc.forgetRecent(path);
    await app.refreshSession();
  }

  const GUIDES = [
    { id: "getting-started", icon: "sparkles", title: "welcome.guideStart" },
    { id: "latex-basics", icon: "type", title: "welcome.guideBasics" },
    { id: "math", icon: "sigma", title: "welcome.guideMath" },
    { id: "bibliography", icon: "quote", title: "welcome.guideBib" },
  ] as const;
</script>

<div class="welcome">
  <div class="inner">
    <header>
      <img class="logo" src="/assets/logo.svg" alt="labaguetex" />
      <div>
        <h1>labaguetex</h1>
        <p class="tagline">{t("welcome.tagline")}</p>
      </div>
    </header>

    <div class="grid">
      <section>
        <h2 class="section-title">{t("welcome.start")}</h2>
        <button class="action primary" onclick={() => ui.openOverlay("newProject")} disabled={project.opening}>
          <Icon name="sparkles" size={20} />
          <span>
            <strong>{t("action.newProject")}</strong>
            <small>{t("welcome.newProjectHint")}</small>
          </span>
          <kbd>{prettyKey(keyFor("project.new") ?? "")}</kbd>
        </button>
        <button class="action" onclick={() => project.openFolderDialog()} disabled={project.opening}>
          <Icon name="folder-open" size={20} />
          <span>
            <strong>{t("action.openProject")}</strong>
            <small>{t("welcome.openProjectHint")}</small>
          </span>
          <kbd>{prettyKey(keyFor("project.open") ?? "")}</kbd>
        </button>
        <button class="action" onclick={() => project.openFileDialog()} disabled={project.opening}>
          <Icon name="file-tex" size={20} />
          <span>
            <strong>{t("action.openFile")}</strong>
            <small>{t("welcome.openFileHint")}</small>
          </span>
        </button>

        <h2 class="section-title">{t("welcome.learn")}</h2>
        <div class="guides">
          {#each GUIDES as g}
            <button class="guide" onclick={() => ui.openHelp("guides", g.id)}>
              <Icon name={g.icon} size={16} />
              {t(g.title)}
            </button>
          {/each}
        </div>
      </section>

      <section>
        <h2 class="section-title">{t("welcome.recent")}</h2>
        {#if project.opening}
          <div class="empty"><span class="spinner"></span></div>
        {:else if recent.length}
          <div class="recent">
            {#each recent.slice(0, 9) as r (r.path)}
              <div class="recent-item" role="button" tabindex="0" onclick={() => project.open(r.path)} onkeydown={(e) => e.key === "Enter" && project.open(r.path)}>
                <Icon name="folder" size={18} />
                <div class="recent-text">
                  <strong class="ellipsis">{r.name}</strong>
                  <small class="ellipsis">{r.path}</small>
                </div>
                <small class="when">{ago(r.openedAt)}</small>
                <button class="icon-btn forget" title={t("welcome.forget")} onclick={(e) => forget(e, r.path)}><Icon name="x" size={13} /></button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">{t("welcome.noRecent")}</div>
        {/if}

        <h2 class="section-title">{t("welcome.distribution")}</h2>
        <button class="tex card" onclick={() => ui.openOverlay("setup")}>
          {#if tex.status?.detecting}
            <span class="spinner"></span>
            <span>{t("status.detecting")}</span>
          {:else if dist}
            <span class="ok"><Icon name="check" size={18} /></span>
            <span class="tex-text">
              <strong>{distLabel(dist)}</strong>
              <small>{dist.engines.join(" · ")}{tex.status?.installedPackages ? ` — ${t("welcome.packages", { n: tex.status.installedPackages.toLocaleString() })}` : ""}</small>
            </span>
          {:else}
            <span class="warn"><Icon name="alert-triangle" size={18} /></span>
            <span class="tex-text">
              <strong>{t("welcome.noTex")}</strong>
              <small>{t("welcome.noTexHint")}</small>
            </span>
            <span class="btn primary small">{t("welcome.install")}</span>
          {/if}
        </button>

        {#if app.settings?.general.beginnerTips}
          <div class="tip">
            <Icon name="lightbulb" size={16} />
            <span>{t("welcome.tip", { palette: prettyKey(keyFor("view.palette") ?? "") })}</span>
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .welcome {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    padding: 6vh 28px 40px;
    background:
      radial-gradient(1200px 500px at 50% -10%, var(--accent-soft), transparent 70%),
      var(--bg);
  }
  .inner {
    width: min(980px, 100%);
  }
  header {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 40px;
  }
  .logo {
    width: 84px;
    height: 84px;
    border-radius: 20px;
    box-shadow: var(--shadow);
  }
  h1 {
    margin: 0;
    font-size: 34px;
    letter-spacing: -0.02em;
  }
  .tagline {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 15px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 36px;
  }
  @media (max-width: 860px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-title {
    margin: 14px 0 4px;
  }
  .action {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    text-align: left;
    cursor: pointer;
    color: var(--accent);
    transition: border-color 0.12s, transform 0.08s;
  }
  .action:hover {
    border-color: var(--accent);
  }
  .action:active {
    transform: translateY(1px);
  }
  .action.primary {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .action span {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--text);
  }
  .action small,
  .recent small,
  .tex small {
    color: var(--text-faint);
    font-size: 12px;
  }
  .guides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .guide {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
  }
  .guide:hover {
    color: var(--text);
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }
  .recent {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .recent-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: var(--radius);
    cursor: pointer;
    color: var(--text-faint);
  }
  .recent-item:hover {
    background: var(--bg-hover);
  }
  .recent-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    color: var(--text);
  }
  .when {
    white-space: nowrap;
  }
  .forget {
    width: 22px;
    height: 22px;
    opacity: 0;
  }
  .recent-item:hover .forget {
    opacity: 1;
  }
  .tex {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-lg);
  }
  .tex:hover {
    border-color: var(--border-strong);
  }
  .tex-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ok {
    color: var(--success);
  }
  .warn {
    color: var(--warning);
  }
  .tip {
    display: flex;
    gap: 10px;
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--text-muted);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .tip :global(.icon) {
    color: var(--accent);
    margin-top: 2px;
  }
</style>
