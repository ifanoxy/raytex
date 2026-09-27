<script lang="ts">
  // Fonts: a font installed on the computer, font files added to the project,
  // or a LaTeX font package. The dialog previews the font with LaTeX itself,
  // edits the preamble (fontspec, unicode-math…) and switches the engine
  // when needed (system fonts require XeLaTeX or LuaLaTeX).
  import { open } from "@tauri-apps/plugin-dialog";
  import { onMount } from "svelte";
  import { type MessageKey, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { addLines, addPackages, commentOutPackages, hasPackage, loadedPackages, setStatement } from "$lib/preamble";
  import { fontCommand } from "$lib/fonts";
  import { app } from "$lib/state/app.svelte";
  import { fonts } from "$lib/state/fonts.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { media } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { BuildPlan, FontFamily, FontRole, PreviewOutcome, TexFont } from "$lib/types";
  import { debounce, dirname, join, relative } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  type Tab = "system" | "files" | "latex";
  const FONT_EXT = ["ttf", "otf", "ttc", "otc"];

  // Role asked by the font menu (main font, extra font…).
  const preset = media.fontPreset;
  media.fontPreset = null;
  let tab = $state<Tab>("system");
  let role = $state<FontRole>(preset?.role ?? "main");
  let command = $state(preset?.command ?? "");
  /** The command name was typed (not suggested from the font name). */
  let commandEdited = $state(!!preset?.command);
  /** Text selected in the editor when the window opened: an extra font can be applied to it. */
  const selectedText = (() => {
    const v = editor.view;
    if (!v || editor.activeTab?.kind !== "tex") return "";
    const sel = v.state.selection.main;
    return v.state.sliceDoc(sel.from, sel.to);
  })();
  let applyToSelection = $state(!!selectedText);
  let filter = $state("");
  let systemFamilies = $state<FontFamily[] | null>(null);
  let fileFamilies = $state<FontFamily[]>([]);
  let texFonts = $state<TexFont[]>([]);
  let installed = $state<Set<string>>(new Set());
  let selected = $state<{ family?: FontFamily; tex?: TexFont; fromFiles?: boolean } | null>(null);
  let hasMath = $state(false);
  let plan = $state<BuildPlan | null>(null);
  let rootText = $state("");
  let rootDir = $state("");
  let fontsFolder = $state("fonts");
  let disableFontenc = $state(true);
  let outcome = $state<PreviewOutcome | null>(null);
  let revision = $state(0);
  let compiling = $state(false);
  let busy = $state(false);

  const SAMPLE_FR = "Portez ce vieux whisky au juge blond qui fume. \\textbf{Gras} \\textit{italique} \\textbf{\\textit{gras italique}} 0123456789 « guillemets » — œ æ ç é";
  const SAMPLE_EN = "Sphinx of black quartz, judge my vow. \\textbf{Bold} \\textit{italic} \\textbf{\\textit{bold italic}} 0123456789 “quotes” — fi fl ffi";

  onMount(async () => {
    const root = await editor.rootOf();
    if (root) {
      rootDir = dirname(root);
      rootText = editor.textOf(root) ?? (await ipc.readTextFile(root).then((f) => f.text).catch(() => ""));
      const p = await ipc.buildPlan(root).catch(() => null);
      plan = p?.Ok ?? null;
    }
    void ipc.texFonts().then((f) => (texFonts = f));
    void ipc.installedPackages().then((p) => (installed = new Set(p)));
    void ipc.systemFonts().then((f) => (systemFamilies = f));
    // Font files already in the project.
    const inProject = flatten(project.tree).filter((p) => FONT_EXT.includes(ext(p)));
    if (inProject.length) fileFamilies = await ipc.inspectFonts(inProject);
    if (fileFamilies.length && !media.fontRequest) tab = "files";
  });

  // Font files handed over by the file tree or dropped on the window.
  $effect(() => {
    const files = media.fontRequest;
    if (!files) return;
    media.fontRequest = null;
    void addFiles(files.filter((f) => FONT_EXT.includes(ext(f))));
  });

  function ext(p: string) {
    return p.split(".").pop()?.toLowerCase() ?? "";
  }

  function flatten(nodes: typeof project.tree, out: string[] = []): string[] {
    for (const n of nodes) {
      if (n.dir) flatten(n.children ?? [], out);
      else out.push(n.path);
    }
    return out;
  }

  async function addFiles(paths: string[]) {
    if (!paths.length) return;
    const families = await ipc.inspectFonts(paths);
    const names = new Set(families.map((f) => f.name));
    fileFamilies = [...fileFamilies.filter((f) => !names.has(f.name)), ...families];
    tab = "files";
    if (families[0]) choose({ family: families[0], fromFiles: true });
  }

  async function chooseFiles() {
    const picked = await open({ multiple: true, title: t("fonts.chooseTitle"), filters: [{ name: "Fonts", extensions: FONT_EXT }] });
    if (picked) await addFiles(Array.isArray(picked) ? picked : [picked]);
  }

  function choose(s: NonNullable<typeof selected>) {
    selected = s;
    hasMath = false;
    const face = s.family?.faces[0];
    if (face) void ipc.fontHasMath(face.path, face.index).then((m) => (hasMath = m));
    if (role === "math" && s.family) role = "main";
    schedulePreview();
  }

  const ROLES: { id: FontRole; label: MessageKey; hint: MessageKey }[] = [
    { id: "main", label: "fonts.roleMain", hint: "fonts.roleMainHint" },
    { id: "sans", label: "fonts.roleSans", hint: "fonts.roleSansHint" },
    { id: "mono", label: "fonts.roleMono", hint: "fonts.roleMonoHint" },
    { id: "math", label: "fonts.roleMath", hint: "fonts.roleMathHint" },
    { id: "command", label: "fonts.roleCommand", hint: "fonts.roleCommandHint" },
  ];

  // An extra font gets a command named after it (\fontPlayfairDisplay) until one is typed.
  $effect(() => {
    const name = selected?.family?.name;
    if (role === "command" && name && !commandEdited) {
      command = fontCommand(name, (fonts.current?.extra ?? []).map((x) => x.command));
    }
  });

  const q = $derived(filter.trim().toLowerCase());
  const shownSystem = $derived((systemFamilies ?? []).filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 400));
  const shownFiles = $derived(fileFamilies.filter((f) => !q || f.name.toLowerCase().includes(q)));
  const shownTex = $derived(texFonts.filter((f) => !q || `${f.name} ${f.package}`.toLowerCase().includes(q)));

  /** Faces of a family from files inside the project (then named by file). */
  function projectDirOf(family: FontFamily): string | null {
    const face = family.faces[0];
    if (!face || !rootDir) return null;
    const rel = relative(rootDir, dirname(face.path));
    return rel === dirname(face.path).replace(/\\/g, "/") ? null : rel;
  }

  const needsUnicodeEngine = $derived(!!selected?.family);
  const engineWillChange = $derived(needsUnicodeEngine && plan?.engine === "pdflatex");

  // ------------------------------------------------------------ preview

  const schedulePreview = debounce(() => void runPreview(), 300);

  async function runPreview() {
    const s = selected;
    const path = editor.active ?? project.info?.main;
    if (!s || !path) return;
    compiling = true;
    const sample = document.documentElement.lang === "fr" ? SAMPLE_FR : SAMPLE_EN;
    try {
      if (s.tex) {
        outcome = await ipc.previewSnippet({
          path,
          job: "font",
          classOptions: "border=6pt,varwidth=11cm",
          projectPreamble: false,
          extra: `\\usepackage[T1]{fontenc}\n${s.tex.code}\n`,
          body: `${sample}\n\n$\\displaystyle \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$`,
          engine: "pdflatex",
        });
      } else if (s.family) {
        // Files are named with an absolute path so the preview works before importing them.
        const dir = s.fromFiles ? dirname(s.family.faces[0].path) : null;
        const code = await ipc.fontspecCode(s.family, "main", dir, "");
        const math = hasMath ? `\n\\usepackage{unicode-math}\n\\setmathfont{${s.family.name}}` : "";
        outcome = await ipc.previewSnippet({
          path,
          job: "font",
          classOptions: "border=6pt,varwidth=11cm",
          projectPreamble: false,
          extra: `\\usepackage{fontspec}\n${code}${math}\n`,
          body: `${sample}\n\n$\\displaystyle \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$`,
          engine: plan?.engine === "lualatex" ? "lualatex" : "xelatex",
        });
      }
      revision++;
    } catch (e) {
      outcome = null;
      ui.toast("error", String(e));
    } finally {
      compiling = false;
    }
  }

  const previewError = $derived(outcome?.diagnostics.find((d) => d.severity === "error") ?? null);

  // --------------------------------------------------------------- apply

  const ROLE_COMMAND: Record<FontRole, string> = {
    main: "\\setmainfont",
    sans: "\\setsansfont",
    mono: "\\setmonofont",
    math: "\\setmathfont",
    command: "",
  };

  async function apply() {
    const s = selected;
    if (!s || busy) return;
    busy = true;
    try {
      if (s.tex) await applyTex(s.tex);
      else if (s.family) await applyFamily(s.family, !!s.fromFiles);
      if (ui.overlay === "fonts") ui.closeOverlay();
    } catch (e) {
      ui.toast("error", t("fonts.failed"), { detail: String(e) });
    } finally {
      busy = false;
    }
  }

  async function applyTex(font: TexFont) {
    if (!installed.has(font.package.split(",")[0])) {
      ui.toast("warning", t("fonts.notInstalled", { name: font.name }));
    }
    // Other font packages of the same kind are commented out (they would fight).
    const sameKind = texFonts.filter((f) => f.kind === font.kind && f.id !== font.id).flatMap((f) => f.package.split(","));
    const root = await editor.transformRoot((text) => {
      let out = commentOutPackages(text, sameKind, t("fonts.replacedBy", { name: font.name }));
      const names = font.package.split(",");
      out = addPackages(out, names.map((name, i) => ({ name, options: i === 0 ? font.options : undefined })));
      if (font.extra) out = addLines(out, [font.extra], names[names.length - 1]);
      return out;
    });
    if (root) ui.toast("success", t("fonts.applied", { name: font.name }));
    await fonts.refresh();
  }

  async function applyFamily(family: FontFamily, fromFiles: boolean) {
    let fam = family;
    let dir: string | null = null;
    if (fromFiles) {
      const inProject = projectDirOf(family);
      if (inProject !== null) {
        dir = inProject;
      } else {
        const target = join(rootDir, fontsFolder);
        const copied = await ipc.importFonts(family.faces.map((f) => f.path), target);
        const reread = await ipc.inspectFonts(copied);
        fam = reread.find((f) => f.name === family.name) ?? reread[0] ?? family;
        dir = relative(rootDir, target);
        await project.refreshTree();
      }
    }
    const effectiveRole: FontRole = role === "math" && !hasMath ? "main" : role;
    const code = await ipc.fontspecCode(fam, effectiveRole, dir, cmdName());
    const statement = effectiveRole === "command" ? `\\newfontfamily\\${cmdName()}` : ROLE_COMMAND[effectiveRole];
    const root = await editor.transformRoot((text) => {
      let out = text;
      if (disableFontenc) out = commentOutPackages(out, ["fontenc", "inputenc"], t("fonts.fontspecHandles"));
      const pkg = effectiveRole === "math" ? "unicode-math" : "fontspec";
      if (!hasPackage(out, "fontspec") && !hasPackage(out, "unicode-math")) out = addPackages(out, [{ name: pkg }]);
      else if (pkg === "unicode-math") out = addPackages(out, [{ name: "unicode-math" }]);
      const anchor = hasPackage(out, "unicode-math") ? "unicode-math" : "fontspec";
      return setStatement(out, statement, code, anchor);
    });
    if (!root) return;
    if (effectiveRole === "command" && applyToSelection && selectedText) fonts.applyExtra(cmdName());
    if (engineWillChange) await editor.setMagicProgram("lualatex");
    // An engine forced in the settings wins over the magic comment.
    if (project.info?.config.build.engine === "pdflatex") await project.updateConfig((c) => (c.build.engine = null));
    if (app.settings?.build.engine === "pdflatex") ui.toast("warning", t("fonts.settingsForcePdflatex"), { timeout: 0 });
    ui.toast(
      "success",
      effectiveRole === "command" ? t("fonts.appliedCommand", { cmd: `\\${cmdName()}` }) : t("fonts.applied", { name: fam.name }),
    );
    await fonts.refresh();
  }

  function cmdName(): string {
    return command.replace(/[^A-Za-z]/g, "") || fontCommand(selected?.family?.name ?? "");
  }

  const hasFontspec = $derived(hasPackage(rootText, "fontspec") || hasPackage(rootText, "unicode-math"));
  const hasFontenc = $derived(loadedPackages(rootText).some((p) => p.names.includes("fontenc") || p.names.includes("inputenc")));
</script>

<Modal title={preset?.role ? t("fonts.titleFor", { role: t(ROLES.find((r) => r.id === preset.role)?.label ?? "fonts.roleMain") }) : t("fonts.title")} icon="type" width="min(1120px, 95vw)" height="min(780px, 92vh)">
  <div class="left">
    <div class="tabs" role="tablist">
      <button class="tab" class:active={tab === "system"} onclick={() => (tab = "system")}><Icon name="cpu" size={14} />{t("fonts.tabSystem")}</button>
      <button class="tab" class:active={tab === "files"} onclick={() => (tab = "files")}><Icon name="file" size={14} />{t("fonts.tabFiles")}</button>
      <button class="tab" class:active={tab === "latex"} onclick={() => (tab = "latex")}><Icon name="packages" size={14} />{t("fonts.tabLatex")}</button>
    </div>
    <div class="search">
      <input class="input" placeholder={t("fonts.filter")} bind:value={filter} spellcheck="false" />
    </div>
    <p class="intro faint">{t(tab === "system" ? "fonts.introSystem" : tab === "files" ? "fonts.introFiles" : "fonts.introLatex")}</p>

    <div class="list">
      {#if tab === "system"}
        {#if systemFamilies === null}
          <div class="empty"><span class="spinner"></span></div>
        {:else}
          {#each shownSystem as f (f.name)}
            <button class="font" class:active={selected?.family?.name === f.name && !selected.fromFiles} onclick={() => choose({ family: f })}>
              <span class="sample" style:font-family={`"${f.name}"`}>{f.name}</span>
              <span class="meta faint">{t("fonts.styles", { n: f.faces.length })}{f.monospace ? " · mono" : ""}</span>
            </button>
          {/each}
        {/if}
      {:else if tab === "files"}
        <button class="drop" onclick={chooseFiles}>
          <Icon name="download" size={22} stroke={1.4} />
          <strong>{t("fonts.addFiles")}</strong>
          <span class="faint">{t("fonts.addFilesHint")}</span>
        </button>
        {#each shownFiles as f (f.name)}
          <button class="font" class:active={selected?.family?.name === f.name && selected.fromFiles} onclick={() => choose({ family: f, fromFiles: true })}>
            <span class="name">{f.name}</span>
            <span class="meta faint">
              {f.faces.map((x) => x.postscript).slice(0, 4).join(", ")}{f.faces.length > 4 ? "…" : ""}
              {#if projectDirOf(f) !== null} · <span class="ok">{t("fonts.inProject")}</span>{/if}
            </span>
          </button>
        {/each}
      {:else}
        {#each ["serif", "sans", "mono"] as const as kind}
          {@const group = shownTex.filter((f) => f.kind === kind)}
          {#if group.length}
            <div class="section-title group">{t(`fonts.kind.${kind}`)}</div>
            {#each group as f (f.id)}
              <button class="font" class:active={selected?.tex?.id === f.id} onclick={() => choose({ tex: f })}>
                <span class="name">{f.name}{#if f.math} <span class="badge">maths</span>{/if}</span>
                <span class="meta faint">{f.description}</span>
                {#if !installed.has(f.package.split(",")[0])}<span class="badge warning">{t("packages.notInstalled")}</span>{/if}
              </button>
            {/each}
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <aside class="right">
    {#if selected}
      <h3>{selected.family?.name ?? selected.tex?.name}</h3>
      <div class="preview-box">
        {#if outcome?.pdf}
          <PdfPreview pdf={outcome.pdf} {revision} maxScale={1.6} />
        {:else if !compiling}
          <div class="empty">{previewError ? "" : t("fonts.previewing")}</div>
        {/if}
        {#if compiling}<div class="busy"><span class="spinner"></span></div>{/if}
      </div>
      {#if previewError}
        <div class="error-box">
          <strong>{previewError.hint?.title ?? previewError.message}</strong>
          {#if previewError.hint}<span>{previewError.hint.explanation}</span>{/if}
        </div>
      {:else if outcome?.pdf}
        <div class="ok-line"><Icon name="check" size={13} />{t("fonts.latexFinds", { engine: outcome.engine })}</div>
      {/if}

      {#if selected.family}
        <div class="field">
          <span>{t("fonts.useAs")}</span>
          <div class="roles" role="radiogroup" aria-label={t("fonts.useAs")}>
            {#each ROLES as r (r.id)}
              <button
                class="role"
                class:active={role === r.id}
                role="radio"
                aria-checked={role === r.id}
                disabled={r.id === "math" && !hasMath}
                title={r.id === "math" && !hasMath ? t("fonts.noMath") : t(r.hint)}
                onclick={() => (role = r.id)}
              >
                <strong>{t(r.label)}</strong>
                <span class="faint">{r.id === "math" && !hasMath ? t("fonts.noMath") : t(r.hint)}</span>
              </button>
            {/each}
          </div>
        </div>
        {#if role === "command"}
          <label class="field">
            <span>{t("fonts.commandName")}</span>
            <div class="row"><span class="mono faint">\</span><input class="input mono" bind:value={command} oninput={() => (commandEdited = true)} spellcheck="false" /></div>
            <span class="hint faint">{t("fonts.commandHint", { cmd: `\\${cmdName()}` })}</span>
          </label>
          {#if selectedText}
            <label class="check">
              <input type="checkbox" bind:checked={applyToSelection} />
              <span>{t("fonts.applyToSelection", { text: selectedText.length > 40 ? `${selectedText.slice(0, 40)}…` : selectedText })}</span>
            </label>
          {/if}
        {/if}
        {#if selected.fromFiles && projectDirOf(selected.family) === null}
          <label class="field">
            <span>{t("fonts.folder")}</span>
            <input class="input mono" bind:value={fontsFolder} />
            <span class="hint faint">{t("fonts.folderHint")}</span>
          </label>
        {/if}
        {#if hasFontenc && !hasFontspec}
          <label class="check">
            <input type="checkbox" bind:checked={disableFontenc} />
            <span>{t("fonts.disableFontenc")}</span>
          </label>
        {/if}
        <div class="note" class:warn={engineWillChange}>
          <Icon name={engineWillChange ? "alert-triangle" : "info"} size={14} />
          <span>{engineWillChange ? t("fonts.engineSwitch") : t("fonts.engineUnicode")}</span>
        </div>
        {#if !selected.fromFiles}
          <div class="note"><Icon name="info" size={14} /><span>{t("fonts.systemPortability")}</span></div>
        {/if}
      {:else if selected.tex}
        <pre class="code mono selectable">{selected.tex.code}</pre>
        <div class="note"><Icon name="info" size={14} /><span>{t("fonts.texNote")}</span></div>
      {/if}

      <div class="spacer"></div>
      <button class="btn primary large" disabled={busy} onclick={apply}>
        {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
        {t("fonts.apply")}
      </button>
    {:else}
      <div class="empty">{t("fonts.pick")}</div>
    {/if}
  </aside>
</Modal>

<style>
  .left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
    gap: 8px;
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tab.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }
  .search .input {
    width: 100%;
  }
  .intro {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }
  .list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .font {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 7px 10px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .font:hover {
    background: var(--bg-hover);
  }
  .font.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .sample {
    font-size: 17px;
  }
  .name {
    font-weight: 600;
  }
  .meta {
    font-size: 11.5px;
  }
  .ok {
    color: var(--success);
  }
  .group {
    margin: 10px 4px 4px;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px;
    margin-bottom: 6px;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .drop:hover {
    border-color: var(--accent);
  }
  .right {
    width: 440px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
  }
  h3 {
    margin: 0;
    font-size: 16px;
  }
  .preview-box {
    position: relative;
    height: 230px;
    display: flex;
    flex-shrink: 0;
  }
  .busy {
    position: absolute;
    top: 8px;
    left: 8px;
  }
  .error-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: var(--error);
    font-size: 12px;
  }
  .error-box span {
    color: var(--text-muted);
  }
  .ok-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--success);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .roles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }
  .role {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 7px 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .role:last-child {
    grid-column: 1 / -1;
  }
  .role strong {
    font-size: 12.5px;
  }
  .role span {
    font-size: 11px;
    line-height: 1.35;
  }
  .role:hover:not(:disabled) {
    border-color: var(--border-strong);
  }
  .role.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .role:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .field .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .field .row .input {
    flex: 1;
  }
  .hint {
    font-size: 11px;
  }
  .check {
    display: flex;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
    align-items: flex-start;
  }
  .check input {
    accent-color: var(--accent);
    margin-top: 2px;
  }
  .note {
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .note :global(.icon) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--info);
  }
  .note.warn :global(.icon) {
    color: var(--warning);
  }
  .code {
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 11.5px;
    white-space: pre-wrap;
  }
</style>
