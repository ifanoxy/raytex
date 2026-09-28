<script lang="ts">
  // Start screen: the projects (projects folder, recent projects and files),
  // then guides and the TeX installation.
  import { keyFor } from "$lib/actions";
  import { t } from "$lib/i18n.svelte";
  import { app } from "$lib/state/app.svelte";
  import { distLabel, tex } from "$lib/state/tex.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import ProjectsBrowser from "./ProjectsBrowser.svelte";

  const dist = $derived(tex.active);

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
      <img class="logo" src="/assets/logo.svg" alt="LaBagueTex" />
      <div>
        <h1>LaBagueTex</h1>
        <p class="tagline">{t("welcome.tagline")}</p>
      </div>
    </header>

    <ProjectsBrowser />

    <div class="bottom">
      <section>
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
    padding: 5vh 28px 40px;
    background:
      radial-gradient(1200px 500px at 50% -10%, var(--accent-soft), transparent 70%),
      var(--bg);
  }
  .inner {
    width: min(1100px, 100%);
  }
  header {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 28px;
  }
  .logo {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    box-shadow: var(--shadow);
  }
  h1 {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .tagline {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 14px;
  }
  .bottom {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 36px;
    margin-top: 28px;
  }
  @media (max-width: 860px) {
    .bottom {
      grid-template-columns: 1fr;
    }
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    padding: 9px 11px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elev);
    color: var(--text);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .guide:hover {
    border-color: var(--border-strong);
  }
  .guide :global(.icon) {
    color: var(--accent);
  }
  .tex {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    color: var(--text);
    text-align: left;
    cursor: pointer;
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
  .tex small {
    color: var(--text-muted);
    font-size: 11.5px;
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
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .tip :global(.icon) {
    color: var(--accent);
    flex-shrink: 0;
  }
</style>
