<script lang="ts">
  // Settings: application-wide ones, and the open project's labaguetex.toml.
  import { actions, keyFor } from "$lib/actions";
  import { REPOSITORY_URL } from "$lib/constants";
  import { type MessageKey, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { app } from "$lib/state/app.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { BibTool, BuildTool, EngineChoice, Macro, ProjectConfig, Settings, Severity } from "$lib/types";
  import { basename, prettyKey, relative } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import TexSetup from "./TexSetup.svelte";

  const SECTIONS: { id: string; label: MessageKey; icon: string; project?: boolean }[] = [
    { id: "general", label: "settings.general", icon: "settings" },
    { id: "editor", label: "settings.editor", icon: "edit" },
    { id: "build", label: "settings.build", icon: "play" },
    { id: "viewer", label: "settings.viewer", icon: "pdf" },
    { id: "completion", label: "settings.completion", icon: "sparkles" },
    { id: "lint", label: "settings.lint", icon: "check" },
    { id: "macros", label: "settings.macros", icon: "snippets" },
    { id: "keys", label: "settings.keys", icon: "keyboard" },
    { id: "distribution", label: "settings.distribution", icon: "cpu" },
    { id: "project", label: "settings.project", icon: "folder", project: true },
    { id: "about", label: "settings.about", icon: "info" },
  ];

  const ENGINES: EngineChoice[] = ["auto", "pdflatex", "xelatex", "lualatex", "latex", "tectonic"];
  const TOOLS: BuildTool[] = ["auto", "latexmk", "single", "custom"];
  const BIBTOOLS: BibTool[] = ["auto", "biber", "bibtex", "none"];

  let rules = $state<[string, Severity][]>([]);
  let recording = $state<string | null>(null);
  let keyFilter = $state("");

  $effect(() => {
    void ipc.lintRules().then((r) => (rules = r));
  });

  const s = $derived(app.settings);
  const cfg = $derived(project.info?.config ?? null);

  function set(mutate: (s: Settings) => void) {
    void app.update(mutate);
  }

  function setProject(mutate: (c: ProjectConfig) => void) {
    void project.updateConfig(mutate);
  }

  function num(e: Event, min: number, max: number): number | null {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
  }

  function checked(e: Event): boolean {
    return (e.currentTarget as HTMLInputElement).checked;
  }

  function value(e: Event): string {
    return (e.currentTarget as HTMLInputElement | HTMLSelectElement).value;
  }

  function splitArgs(text: string): string[] {
    return (text.match(/"[^"]*"|\S+/g) ?? []).map((a) => a.replace(/^"|"$/g, ""));
  }

  // ------------------------------------------------------------ macros
  function addMacro() {
    set((x) => x.macros.push({ name: t("settings.newMacro"), trigger: "", key: "", body: "", math: false }));
  }

  function updateMacro(i: number, patch: Partial<Macro>) {
    set((x) => Object.assign(x.macros[i], patch));
  }

  function removeMacro(i: number) {
    set((x) => x.macros.splice(i, 1));
  }

  // ------------------------------------------------------- keybindings
  const KEY_NAMES: Record<string, string> = { " ": "Space", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight" };

  function keyFromEvent(e: KeyboardEvent): string | null {
    if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return null;
    const mac = navigator.platform.toLowerCase().includes("mac");
    const parts: string[] = [];
    if (mac ? e.metaKey : e.ctrlKey) parts.push("Mod");
    if (mac && e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    let key = KEY_NAMES[e.key] ?? e.key;
    if (e.altKey && e.code.startsWith("Key")) key = e.code.slice(3).toLowerCase();
    else if (key.length === 1) key = key.toLowerCase();
    parts.push(key);
    return parts.join("-");
  }

  function record(e: KeyboardEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      recording = null;
      return;
    }
    const key = keyFromEvent(e);
    if (!key) return;
    recording = null;
    set((x) => (x.keybindings[id] = key));
  }

  function resetKey(id: string) {
    set((x) => delete x.keybindings[id]);
  }

  function conflict(id: string): string | null {
    const k = keyFor(id);
    if (!k) return null;
    const other = actions.find((a) => a.id !== id && keyFor(a.id) === k);
    return other ? t(other.title) : null;
  }

  /** Opens labaguetex.toml in the editor (writing it first if it does not exist yet). */
  async function editToml(root: string) {
    const path = `${root}/labaguetex.toml`;
    if (!(await ipc.pathExists(path))) await project.updateConfig(() => {});
    ui.closeOverlay();
    await editor.open(path);
  }

  const shownActions = $derived(actions.filter((a) => !keyFilter || t(a.title).toLowerCase().includes(keyFilter.toLowerCase())));
</script>

{#snippet toggle(label: string, hint: string | null, on: boolean, change: (v: boolean) => void)}
  <label class="field toggle-field">
    <div class="text">
      <span class="label">{label}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </div>
    <span class="switch">
      <input type="checkbox" checked={on} onchange={(e) => change(checked(e))} />
      <span></span>
    </span>
  </label>
{/snippet}

{#snippet field(label: string, hint: string | null, control: import("svelte").Snippet)}
  <div class="field">
    <div class="text">
      <span class="label">{label}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </div>
    <div class="control">{@render control()}</div>
  </div>
{/snippet}

<Modal title={t("action.settings")} icon="settings">
  <nav class="nav">
    {#each SECTIONS as sec (sec.id)}
      {#if !sec.project || project.info}
        <button class="nav-item" class:active={ui.settingsSection === sec.id} onclick={() => (ui.settingsSection = sec.id)}>
          <Icon name={sec.icon} size={15} />
          {t(sec.label)}
        </button>
      {/if}
    {/each}
    <div class="spacer"></div>
    <button class="nav-item small" onclick={() => app.info && ipc.revealInOs(app.info.settingsPath)}>
      <Icon name="folder-open" size={14} />{t("settings.openFile")}
    </button>
  </nav>

  <div class="page">
    {#if s}
      {#if ui.settingsSection === "general"}
        <h3>{t("settings.general")}</h3>
        {#snippet languageControl()}
          <select class="select input" value={s.general.language} onchange={(e) => set((x) => (x.general.language = value(e) as Settings["general"]["language"]))}>
            <option value="system">{t("settings.system")}</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        {/snippet}
        {@render field(t("settings.language"), t("settings.languageHint"), languageControl)}
        {#snippet themeControl()}
          <div class="segmented">
            {#each ["system", "light", "dark"] as const as th}
              <button class:active={s.general.theme === th} onclick={() => set((x) => (x.general.theme = th))}>
                <Icon name={th === "light" ? "sun" : th === "dark" ? "moon" : "settings"} size={13} />{t(`settings.theme.${th}`)}
              </button>
            {/each}
          </div>
        {/snippet}
        {@render field(t("settings.theme"), null, themeControl)}
        {@render toggle(t("settings.restoreSession"), t("settings.restoreSessionHint"), s.general.restoreSession, (v) => set((x) => (x.general.restoreSession = v)))}
        {@render toggle(t("settings.beginnerTips"), t("settings.beginnerTipsHint"), s.general.beginnerTips, (v) => set((x) => (x.general.beginnerTips = v)))}
        {@render toggle(t("settings.hideAux"), t("settings.hideAuxHint"), s.general.hideAuxFiles, (v) => {
          set((x) => (x.general.hideAuxFiles = v));
          setTimeout(() => project.refreshTree(), 100);
        })}
      {:else if ui.settingsSection === "editor"}
        <h3>{t("settings.editor")}</h3>
        {#snippet fontControl()}
          <input class="input wide" value={s.editor.fontFamily} placeholder="JetBrains Mono" onchange={(e) => set((x) => (x.editor.fontFamily = value(e)))} />
        {/snippet}
        {@render field(t("settings.fontFamily"), t("settings.fontFamilyHint"), fontControl)}
        {#snippet sizeControl()}
          <input class="input num" type="number" min="9" max="32" value={s.editor.fontSize} onchange={(e) => { const v = num(e, 9, 32); if (v) set((x) => (x.editor.fontSize = v)); }} />
          <span class="unit">px</span>
          <input class="input num" type="number" min="1" max="2.4" step="0.05" value={s.editor.lineHeight} onchange={(e) => { const v = num(e, 1, 2.4); if (v) set((x) => (x.editor.lineHeight = v)); }} />
          <span class="unit">{t("settings.lineHeight")}</span>
        {/snippet}
        {@render field(t("settings.fontSize"), null, sizeControl)}
        {#snippet indentControl()}
          <select class="select input" value={s.editor.useTabs ? "tabs" : String(s.editor.tabSize)} onchange={(e) => set((x) => {
            const v = value(e);
            x.editor.useTabs = v === "tabs";
            if (v !== "tabs") x.editor.tabSize = Number(v);
          })}>
            <option value="2">{t("status.spaces", { n: 2 })}</option>
            <option value="4">{t("status.spaces", { n: 4 })}</option>
            <option value="tabs">{t("status.tabs")}</option>
          </select>
        {/snippet}
        {@render field(t("settings.indentation"), null, indentControl)}
        {@render toggle(t("settings.wordWrap"), null, s.editor.wordWrap, (v) => set((x) => (x.editor.wordWrap = v)))}
        {@render toggle(t("settings.lineNumbers"), null, s.editor.lineNumbers, (v) => set((x) => (x.editor.lineNumbers = v)))}
        {@render toggle(t("settings.activeLine"), null, s.editor.highlightActiveLine, (v) => set((x) => (x.editor.highlightActiveLine = v)))}
        {@render toggle(t("settings.folding"), null, s.editor.folding, (v) => set((x) => (x.editor.folding = v)))}
        {@render toggle(t("settings.whitespace"), null, s.editor.showWhitespace, (v) => set((x) => (x.editor.showWhitespace = v)))}
        <h4>{t("settings.assistance")}</h4>
        {@render toggle(t("settings.closeBrackets"), null, s.editor.autoCloseBrackets, (v) => set((x) => (x.editor.autoCloseBrackets = v)))}
        {@render toggle(t("settings.closeEnvironments"), t("settings.closeEnvironmentsHint"), s.editor.autoCloseEnvironments, (v) => set((x) => (x.editor.autoCloseEnvironments = v)))}
        {@render toggle(t("settings.mathPreview"), t("settings.mathPreviewHint"), s.editor.mathPreview, (v) => set((x) => (x.editor.mathPreview = v)))}
        {@render toggle(t("settings.hoverDocs"), t("settings.hoverDocsHint"), s.editor.hoverDocs, (v) => set((x) => (x.editor.hoverDocs = v)))}
        {@render toggle(t("settings.spellcheck"), t("settings.spellcheckHint"), s.editor.spellcheck, (v) => set((x) => (x.editor.spellcheck = v)))}
        {@render toggle(t("settings.vim"), t("settings.vimHint"), s.editor.vimMode, (v) => set((x) => (x.editor.vimMode = v)))}
        <h4>{t("settings.saving")}</h4>
        {@render toggle(t("settings.autoSave"), t("settings.autoSaveHint"), s.editor.autoSave, (v) => set((x) => (x.editor.autoSave = v)))}
        {#if s.editor.autoSave}
          {#snippet autoSaveControl()}
            <input class="input num" type="number" min="300" max="60000" step="100" value={s.editor.autoSaveDelayMs} onchange={(e) => { const v = num(e, 300, 60000); if (v) set((x) => (x.editor.autoSaveDelayMs = v)); }} />
            <span class="unit">ms</span>
          {/snippet}
          {@render field(t("settings.autoSaveDelay"), null, autoSaveControl)}
        {/if}
      {:else if ui.settingsSection === "build"}
        <h3>{t("settings.build")}</h3>
        <p class="intro">{t("settings.buildIntro")}</p>
        {#snippet engineControl()}
          <select class="select input" value={s.build.engine} onchange={(e) => set((x) => (x.build.engine = value(e) as EngineChoice))}>
            {#each ENGINES as en}<option value={en}>{en === "auto" ? t("settings.engineAuto") : en}</option>{/each}
          </select>
        {/snippet}
        {@render field(t("settings.engine"), t("settings.engineHint"), engineControl)}
        {#snippet toolControl()}
          <select class="select input" value={s.build.tool} onchange={(e) => set((x) => (x.build.tool = value(e) as BuildTool))}>
            {#each TOOLS as tool}<option value={tool}>{t(`settings.tool.${tool}`)}</option>{/each}
          </select>
        {/snippet}
        {@render field(t("settings.tool"), t("settings.toolHint"), toolControl)}
        {#snippet bibControl()}
          <select class="select input" value={s.build.bibTool} onchange={(e) => set((x) => (x.build.bibTool = value(e) as BibTool))}>
            {#each BIBTOOLS as b}<option value={b}>{b === "auto" ? t("settings.engineAuto") : b === "none" ? t("settings.none") : b}</option>{/each}
          </select>
        {/snippet}
        {@render field(t("settings.bibTool"), null, bibControl)}
        {#snippet autoBuildControl()}
          <select class="select input" value={s.build.autoBuild} onchange={(e) => set((x) => (x.build.autoBuild = value(e) as Settings["build"]["autoBuild"]))}>
            <option value="off">{t("settings.autoBuild.off")}</option>
            <option value="onSave">{t("settings.autoBuild.onSave")}</option>
            <option value="onIdle">{t("settings.autoBuild.onIdle")}</option>
          </select>
          {#if s.build.autoBuild === "onIdle"}
            <input class="input num" type="number" min="400" max="30000" step="100" value={s.build.autoBuildDelayMs} onchange={(e) => { const v = num(e, 400, 30000); if (v) set((x) => (x.build.autoBuildDelayMs = v)); }} />
            <span class="unit">ms</span>
          {/if}
        {/snippet}
        {@render field(t("settings.autoBuild"), t("settings.autoBuildHint"), autoBuildControl)}
        {#snippet outDirControl()}
          <input class="input mono" value={s.build.outDir} placeholder="build" onchange={(e) => set((x) => (x.build.outDir = value(e).trim() || "build"))} />
        {/snippet}
        {@render field(t("settings.outDir"), t("settings.outDirHint"), outDirControl)}
        {@render toggle(t("settings.copyPdf"), t("settings.copyPdfHint"), s.build.copyPdfToRoot, (v) => set((x) => (x.build.copyPdfToRoot = v)))}
        {@render toggle(t("settings.synctex"), t("settings.synctexHint"), s.build.synctex, (v) => set((x) => (x.build.synctex = v)))}
        {@render toggle(t("settings.haltOnError"), t("settings.haltOnErrorHint"), s.build.haltOnError, (v) => set((x) => (x.build.haltOnError = v)))}
        {@render toggle(t("settings.shellEscape"), t("settings.shellEscapeHint"), s.build.shellEscape, (v) => set((x) => (x.build.shellEscape = v)))}
        {@render toggle(t("settings.badboxes"), t("settings.badboxesHint"), s.build.showBadboxes, (v) => set((x) => (x.build.showBadboxes = v)))}
        {#snippet argsControl()}
          <input class="input mono wide" value={s.build.extraArgs.join(" ")} placeholder="-interaction=nonstopmode" onchange={(e) => set((x) => (x.build.extraArgs = splitArgs(value(e))))} />
        {/snippet}
        {@render field(t("settings.extraArgs"), t("settings.extraArgsHint"), argsControl)}
        {#snippet timeoutControl()}
          <input class="input num" type="number" min="10" max="3600" value={s.build.timeoutS} onchange={(e) => { const v = num(e, 10, 3600); if (v) set((x) => (x.build.timeoutS = v)); }} />
          <span class="unit">s</span>
        {/snippet}
        {@render field(t("settings.timeout"), null, timeoutControl)}
        {#if s.build.tool === "custom"}
          <h4>{t("settings.customSteps")}</h4>
          <p class="intro">{t("settings.customStepsHint")}</p>
          {#each s.build.customSteps as step, i (i)}
            <div class="step">
              <input class="input" value={step.name} placeholder={t("settings.stepName")} onchange={(e) => set((x) => (x.build.customSteps[i].name = value(e)))} />
              <input class="input mono" value={step.program} placeholder="pdflatex" onchange={(e) => set((x) => (x.build.customSteps[i].program = value(e)))} />
              <input class="input mono grow" value={step.args.join(" ")} placeholder="-synctex=1 %DOC%" onchange={(e) => set((x) => (x.build.customSteps[i].args = splitArgs(value(e))))} />
              <button class="icon-btn" disabled={i === 0} onclick={() => set((x) => x.build.customSteps.splice(i - 1, 0, ...x.build.customSteps.splice(i, 1)))} title={t("settings.moveUp")}><Icon name="chevron-up" /></button>
              <button class="icon-btn" onclick={() => set((x) => x.build.customSteps.splice(i, 1))} title={t("common.delete")}><Icon name="trash" /></button>
            </div>
          {/each}
          <button class="btn small" onclick={() => set((x) => x.build.customSteps.push({ name: "", program: "", args: ["%DOC%"] }))}><Icon name="plus" size={13} />{t("settings.addStep")}</button>
        {/if}
      {:else if ui.settingsSection === "viewer"}
        <h3>{t("settings.viewer")}</h3>
        {#snippet zoomControl()}
          <select class="select input" value={s.viewer.defaultZoom} onchange={(e) => set((x) => (x.viewer.defaultZoom = value(e)))}>
            <option value="page-width">{t("viewer.fitWidth")}</option>
            <option value="page-fit">{t("viewer.fitPage")}</option>
            {#each ["75", "100", "125", "150"] as z}<option value={z}>{z} %</option>{/each}
          </select>
        {/snippet}
        {@render field(t("settings.defaultZoom"), null, zoomControl)}
        {@render toggle(t("viewer.syncAfterBuild"), t("settings.syncAfterBuildHint"), s.viewer.syncAfterBuild, (v) => set((x) => (x.viewer.syncAfterBuild = v)))}
        {@render toggle(t("settings.doubleClickSync"), t("settings.doubleClickSyncHint"), s.viewer.doubleClickSync, (v) => set((x) => (x.viewer.doubleClickSync = v)))}
        {@render toggle(t("viewer.invert"), t("settings.invertHint"), s.viewer.invertInDark, (v) => set((x) => (x.viewer.invertInDark = v)))}
      {:else if ui.settingsSection === "completion"}
        <h3>{t("settings.completion")}</h3>
        <p class="intro">{t("settings.completionIntro")}</p>
        {@render toggle(t("settings.completionEnabled"), null, s.completion.enabled, (v) => set((x) => (x.completion.enabled = v)))}
        {@render toggle(t("settings.learnFromPackages"), t("settings.learnFromPackagesHint"), s.completion.learnFromPackages, (v) => set((x) => (x.completion.learnFromPackages = v)))}
        {@render toggle(t("settings.autoAddPackage"), t("settings.autoAddPackageHint"), s.completion.autoAddPackage, (v) => set((x) => (x.completion.autoAddPackage = v)))}
        {@render toggle(t("settings.snippets"), t("settings.snippetsHint"), s.completion.snippets, (v) => set((x) => (x.completion.snippets = v)))}
        {@render toggle(t("settings.atShortcuts"), t("settings.atShortcutsHint"), s.completion.atShortcuts, (v) => set((x) => (x.completion.atShortcuts = v)))}
      {:else if ui.settingsSection === "lint"}
        <h3>{t("settings.lint")}</h3>
        <p class="intro">{t("settings.lintIntro")}</p>
        {@render toggle(t("settings.lintEnabled"), null, s.lint.enabled, (v) => set((x) => (x.lint.enabled = v)))}
        {@render toggle(t("settings.styleHints"), t("settings.styleHintsHint"), s.lint.styleHints, (v) => set((x) => (x.lint.styleHints = v)))}
        <h4>{t("settings.rules")}</h4>
        <div class="rules">
          {#each rules as [rule, severity] (rule)}
            <label class="rule">
              <input type="checkbox" checked={!s.lint.disabledRules.includes(rule)} onchange={(e) => set((x) => {
                x.lint.disabledRules = checked(e) ? x.lint.disabledRules.filter((r) => r !== rule) : [...x.lint.disabledRules, rule];
              })} />
              <span class="mono">{rule}</span>
              <span class="badge {severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info'}">{severity}</span>
            </label>
          {/each}
        </div>
      {:else if ui.settingsSection === "macros"}
        <h3>{t("settings.macros")}</h3>
        <p class="intro">{t("settings.macrosIntro")}</p>
        <pre class="example mono">{t("settings.macrosExample")}</pre>
        {#each s.macros as m, i (i)}
          <div class="macro card">
            <div class="macro-row">
              <input class="input" value={m.name} placeholder={t("settings.macroName")} onchange={(e) => updateMacro(i, { name: value(e) })} />
              <input class="input mono trigger" value={m.trigger} placeholder={t("settings.macroTrigger")} onchange={(e) => updateMacro(i, { trigger: value(e).trim() })} />
              <button class="btn small key-btn" class:recording={recording === `macro:${i}`} onclick={() => (recording = `macro:${i}`)} onkeydown={(e) => {
                if (recording !== `macro:${i}`) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.key === "Escape") { recording = null; return; }
                if (e.key === "Backspace") { recording = null; updateMacro(i, { key: "" }); return; }
                const k = keyFromEvent(e);
                if (k) { recording = null; updateMacro(i, { key: k }); }
              }}>
                {recording === `macro:${i}` ? t("settings.pressKeys") : m.key ? prettyKey(m.key) : t("settings.noShortcut")}
              </button>
              <label class="inline"><input type="checkbox" checked={m.math} onchange={(e) => updateMacro(i, { math: checked(e) })} />{t("settings.macroMath")}</label>
              <button class="icon-btn" onclick={() => removeMacro(i)} title={t("common.delete")}><Icon name="trash" /></button>
            </div>
            <textarea class="input" rows="3" value={m.body} placeholder={"\\frac{${1:a}}{${2:b}}${0}"} spellcheck="false" onchange={(e) => updateMacro(i, { body: (e.currentTarget as HTMLTextAreaElement).value })}></textarea>
          </div>
        {/each}
        <button class="btn small" onclick={addMacro}><Icon name="plus" size={13} />{t("snippets.addMacro")}</button>
      {:else if ui.settingsSection === "keys"}
        <h3>{t("settings.keys")}</h3>
        <p class="intro">{t("settings.keysIntro")}</p>
        <input class="input wide" placeholder={t("settings.keysFilter")} bind:value={keyFilter} />
        <div class="keys">
          {#each shownActions as a (a.id)}
            {@const k = keyFor(a.id)}
            {@const c = conflict(a.id)}
            <div class="key-row">
              <span class="ellipsis">{t(a.title)}</span>
              {#if c}<span class="conflict" title={t("settings.conflict", { action: c })}><Icon name="alert-triangle" size={13} /></span>{/if}
              <button
                class="btn small key-btn"
                class:recording={recording === a.id}
                onclick={() => (recording = a.id)}
                onkeydown={(e) => recording === a.id && record(e, a.id)}
                onblur={() => recording === a.id && (recording = null)}
              >
                {recording === a.id ? t("settings.pressKeys") : k ? prettyKey(k) : t("settings.noShortcut")}
              </button>
              <button class="icon-btn" title={t("settings.removeShortcut")} onclick={() => set((x) => (x.keybindings[a.id] = ""))}><Icon name="x" size={13} /></button>
              <button class="icon-btn" title={t("settings.resetShortcut")} disabled={s.keybindings[a.id] === undefined} onclick={() => resetKey(a.id)}><Icon name="refresh" size={13} /></button>
            </div>
          {/each}
        </div>
      {:else if ui.settingsSection === "distribution"}
        <h3>{t("settings.distribution")}</h3>
        <TexSetup />
      {:else if ui.settingsSection === "project" && project.info && cfg}
        {@const info = project.info}
        <h3>{t("settings.projectTitle", { name: info.name })}</h3>
        <p class="intro">{t("settings.projectIntro")}</p>
        {#if info.configError}<div class="error-box">{info.configError}</div>{/if}
        {#snippet nameControl()}
          <input class="input" value={cfg.project.name ?? ""} placeholder={basename(info.root)} onchange={(e) => setProject((c) => (c.project.name = value(e).trim() || null))} />
        {/snippet}
        {@render field(t("settings.projectName"), null, nameControl)}
        {#snippet mainControl()}
          <select class="select input" value={info.main ?? ""} onchange={(e) => project.setMain(value(e))}>
            {#each info.candidates as c}<option value={c}>{relative(info.root, c)}</option>{/each}
          </select>
        {/snippet}
        {@render field(t("toolbar.mainFile"), t("settings.mainHint"), mainControl)}
        {#snippet pEngine()}
          <select class="select input" value={cfg.build.engine ?? ""} onchange={(e) => setProject((c) => (c.build.engine = (value(e) || null) as EngineChoice | null))}>
            <option value="">{t("settings.inherit")}</option>
            {#each ENGINES as en}<option value={en}>{en === "auto" ? t("settings.engineAuto") : en}</option>{/each}
          </select>
        {/snippet}
        {@render field(t("settings.engine"), null, pEngine)}
        {#snippet pTool()}
          <select class="select input" value={cfg.build.tool ?? ""} onchange={(e) => setProject((c) => (c.build.tool = (value(e) || null) as BuildTool | null))}>
            <option value="">{t("settings.inherit")}</option>
            {#each TOOLS as tool}<option value={tool}>{t(`settings.tool.${tool}`)}</option>{/each}
          </select>
        {/snippet}
        {@render field(t("settings.tool"), null, pTool)}
        {#snippet pBib()}
          <select class="select input" value={cfg.build.bib_tool ?? ""} onchange={(e) => setProject((c) => (c.build.bib_tool = (value(e) || null) as BibTool | null))}>
            <option value="">{t("settings.inherit")}</option>
            {#each BIBTOOLS as b}<option value={b}>{b === "auto" ? t("settings.engineAuto") : b === "none" ? t("settings.none") : b}</option>{/each}
          </select>
        {/snippet}
        {@render field(t("settings.bibTool"), null, pBib)}
        {#snippet pOut()}
          <input class="input mono" value={cfg.build.out_dir ?? ""} placeholder={s.build.outDir} onchange={(e) => setProject((c) => (c.build.out_dir = value(e).trim() || null))} />
        {/snippet}
        {@render field(t("settings.outDir"), null, pOut)}
        {#snippet pShell()}
          <select class="select input" value={cfg.build.shell_escape === null || cfg.build.shell_escape === undefined ? "" : String(cfg.build.shell_escape)} onchange={(e) => setProject((c) => {
            const v = value(e);
            c.build.shell_escape = v === "" ? null : v === "true";
          })}>
            <option value="">{t("settings.inherit")}</option>
            <option value="true">{t("settings.enabled")}</option>
            <option value="false">{t("settings.disabled")}</option>
          </select>
        {/snippet}
        {@render field(t("settings.shellEscape"), t("settings.shellEscapeHint"), pShell)}
        {#snippet pArgs()}
          <input class="input mono wide" value={(cfg.build.extra_args ?? []).join(" ")} onchange={(e) => setProject((c) => {
            const args = splitArgs(value(e));
            c.build.extra_args = args.length ? args : null;
          })} />
        {/snippet}
        {@render field(t("settings.extraArgs"), null, pArgs)}
        {#snippet pLang()}
          <select class="select input" value={cfg.project.language ?? ""} onchange={(e) => setProject((c) => (c.project.language = value(e) || null))}>
            <option value="">{t("settings.auto")}</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        {/snippet}
        {@render field(t("settings.projectLanguage"), t("settings.projectLanguageHint"), pLang)}
        <div class="row">
          <button class="btn small" onclick={() => editToml(info.root)}>
            <Icon name="file" size={13} />{t("settings.editToml")}
          </button>
        </div>
      {:else if ui.settingsSection === "about"}
        <div class="about">
          <img src="/assets/logo.svg" alt="" width="88" height="88" />
          <h3>labaguetex {app.info?.version}</h3>
          <p>{t("welcome.tagline")}</p>
          <p class="faint">{app.info?.os} · {app.info?.arch}</p>
          <p class="faint small">{t("settings.license")}</p>
          <div class="row">
            <button class="btn small" onclick={() => ipc.openUrl(REPOSITORY_URL)}><Icon name="globe" size={13} />GitHub</button>
            <button class="btn small" onclick={() => app.info && ipc.revealInOs(app.info.templatesPath)}><Icon name="folder-open" size={13} />{t("settings.templatesFolder")}</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</Modal>

<style>
  .nav {
    width: 210px;
    flex-shrink: 0;
    padding: 12px 8px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: auto;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius);
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .nav-item.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  .nav-item.active :global(.icon) {
    color: var(--accent);
  }
  .nav-item.small {
    font-size: 12px;
  }
  .page {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 20px 28px 40px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 18px;
  }
  h4 {
    margin: 18px 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
  }
  .intro {
    margin: 0 0 12px;
    color: var(--text-muted);
    line-height: 1.55;
    max-width: 720px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .toggle-field {
    cursor: pointer;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .label {
    font-weight: 500;
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.45;
  }
  .control {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .control .input {
    min-width: 180px;
  }
  .control .num {
    min-width: 0;
    width: 84px;
  }
  .wide {
    width: 320px;
  }
  .unit {
    font-size: 12px;
    color: var(--text-faint);
  }
  .segmented {
    display: flex;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .segmented button {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
  }
  .segmented button + button {
    border-left: 1px solid var(--border-strong);
  }
  .segmented button.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  .rules {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 4px 16px;
  }
  .rule {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    cursor: pointer;
  }
  .rule span.mono {
    flex: 1;
  }
  input[type="checkbox"] {
    accent-color: var(--accent);
  }
  .example {
    margin: 0 0 12px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 12px;
    white-space: pre-wrap;
  }
  .macro {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .macro-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .macro-row .input {
    flex: 1;
    min-width: 0;
  }
  .macro-row .trigger {
    flex: 0 0 110px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    white-space: nowrap;
  }
  .key-btn {
    min-width: 120px;
    font-family: var(--font-mono);
  }
  .key-btn.recording {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .keys {
    display: flex;
    flex-direction: column;
    margin-top: 10px;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .key-row > span:first-child {
    flex: 1;
  }
  .conflict {
    color: var(--warning);
  }
  .step {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }
  .step .input {
    width: 130px;
  }
  .step .grow {
    flex: 1;
  }
  .error-box {
    padding: 10px 12px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: var(--error);
    font-family: var(--font-mono);
    font-size: 12px;
    white-space: pre-wrap;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
  .about {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    padding-top: 30px;
  }
  .about p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
</style>
