<script lang="ts">
  // TikZ studio: start from a gallery picture, edit the code with element
  // and style buttons, see the picture compiled live (with a centimetre
  // grid; a click inserts the coordinates), then insert it at the cursor
  // or in its own file, with the packages and libraries it needs.
  import { closeBrackets, closeBracketsKeymap, snippet, startCompletion } from "@codemirror/autocomplete";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { indentUnit } from "@codemirror/language";
  import { type Diagnostic as CmDiagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
  import { EditorState } from "@codemirror/state";
  import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
  import { onDestroy, onMount } from "svelte";
  import { latexCompletion } from "$lib/editor/completion";
  import { docPath } from "$lib/editor/context";
  import { latex } from "$lib/editor/latex";
  import { editorTheme } from "$lib/editor/theme";
  import { type MessageKey, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { addLines, addPackages, addTikzLibraries, hasPackage } from "$lib/preamble";
  import { app } from "$lib/state/app.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { media, type TikzRequest } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { PreviewOutcome, TikzTemplate } from "$lib/types";
  import { debounce, dirname, escapeSnippet, join, prettyKey, relative } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const CATEGORIES: { id: string; label: MessageKey; icon: string }[] = [
    { id: "basics", label: "tikz.cat.basics", icon: "layers" },
    { id: "functions", label: "tikz.cat.functions", icon: "sigma" },
    { id: "diagrams", label: "tikz.cat.diagrams", icon: "outline" },
    { id: "geometry", label: "tikz.cat.geometry", icon: "target" },
    { id: "science", label: "tikz.cat.science", icon: "bolt" },
    { id: "cs", label: "tikz.cat.cs", icon: "cpu" },
    { id: "math", label: "tikz.cat.math", icon: "hash" },
  ];

  interface Element {
    label: MessageKey;
    icon: string;
    body: string;
    libraries?: string[];
  }

  const ELEMENTS: Element[] = [
    { label: "tikz.el.node", icon: "type", body: "\\node[${1:draw}] (${2:n}) at (${3:0},${4:0}) {${5:texte}};" },
    { label: "tikz.el.point", icon: "target", body: "\\coordinate (${1:A}) at (${2:0},${3:0});" },
    { label: "tikz.el.line", icon: "minus", body: "\\draw (${1:0},${2:0}) -- (${3:2},${4:1});" },
    { label: "tikz.el.arrow", icon: "arrow-right", body: "\\draw[-Stealth] (${1:0},${2:0}) -- (${3:2},${4:1});", libraries: ["arrows.meta"] },
    { label: "tikz.el.polygon", icon: "sparkles", body: "\\draw (${1:0},${2:0}) -- (${3:2},${4:0}) -- (${5:1},${6:1.5}) -- cycle;" },
    { label: "tikz.el.rectangle", icon: "fit-page", body: "\\draw (${1:0},${2:0}) rectangle (${3:2},${4:1});" },
    { label: "tikz.el.circle", icon: "globe", body: "\\draw (${1:0},${2:0}) circle (${3:1});" },
    { label: "tikz.el.arc", icon: "refresh", body: "\\draw (${1:1},${2:0}) arc (${3:0}:${4:90}:${5:1});" },
    { label: "tikz.el.curve", icon: "sync", body: "\\draw (${1:0},${2:0}) .. controls (${3:1},${4:1}) and (${5:2},${6:1}) .. (${7:3},${8:0});" },
    { label: "tikz.el.fill", icon: "layers", body: "\\fill[${1:blue!20}] (${2:0},${3:0}) rectangle (${4:1},${5:1});" },
    { label: "tikz.el.grid", icon: "hash", body: "\\draw[help lines, step=${1:0.5}] (${2:0},${3:0}) grid (${4:4},${5:3});" },
    {
      label: "tikz.el.axes",
      icon: "plus",
      body: "\\draw[-Stealth] (${1:-0.5},0) -- (${2:4},0) node[right] {$x$};\n\\draw[-Stealth] (0,${3:-0.5}) -- (0,${4:3}) node[above] {$y$};",
      libraries: ["arrows.meta"],
    },
    { label: "tikz.el.plot", icon: "sigma", body: "\\draw[domain=${1:-2}:${2:2}, smooth, variable=\\x, ${3:blue}, thick] plot ({\\x}, {${4:\\x*\\x}});" },
    { label: "tikz.el.label", icon: "quote", body: "\\node[${1:above}] at (${2:0},${3:0}) {${4:texte}};" },
    { label: "tikz.el.loop", icon: "refresh", body: "\\foreach \\i in {${1:1,...,5}} {\n\t${2:\\draw (\\i,0) circle (0.1);}\n}" },
  ];

  /** Stands for an empty caption until the code becomes a snippet. */
  const CAPTION_FIELD = "\u0001caption\u0001";

  const COLORS = ["black", "red", "blue", "green!60!black", "orange", "violet", "teal", "gray", "brown", "magenta"];
  const SWATCH: Record<string, string> = {
    black: "#000", red: "#e00", blue: "#00f", "green!60!black": "#0a0", orange: "#f80", violet: "#80f", teal: "#088", gray: "#888", brown: "#a52", magenta: "#f0f",
  };
  const STYLES = ["thin", "thick", "very thick", "ultra thick", "dashed", "dotted", "densely dashed", "rounded corners", "fill=blue!20", "opacity=0.5", "->", "<->", "-Stealth"];

  let templates = $state<TikzTemplate[]>([]);
  let allLibraries = $state<string[]>([]);
  let category = $state("basics");
  let host = $state<HTMLDivElement | null>(null);
  let view: EditorView | null = null;
  let code = $state("");
  let packages = $state<string[]>(["tikz"]);
  let libraries = $state<string[]>([]);
  let extra = $state("");
  let outcome = $state<PreviewOutcome | null>(null);
  let revision = $state(0);
  let compiling = $state(false);
  let grid = $state(true);
  let request = $state<TikzRequest | null>(null);
  let destination = $state<"cursor" | "file">("cursor");
  let fileName = $state("figures/schema.tikz");
  let wrap = $state(true);
  let caption = $state("");
  let label = $state("fig:schema");
  let pristine = true;
  let busy = $state(false);
  let libraryInput = $state("");
  let rootDir = $state("");

  const editing = $derived(!!(request?.range || request?.file));

  onMount(async () => {
    const [tpl, libs] = await Promise.all([ipc.tikzTemplates(), ipc.tikzLibraries()]);
    templates = tpl;
    allLibraries = libs;
    const root = await editor.rootOf();
    rootDir = root ? dirname(root) : "";
    request = media.tikzRequest;
    media.tikzRequest = null;
    if (request) {
      code = request.code;
      libraries = detectLibraries(code);
      packages = detectPackages(code);
      extra = packages.includes("pgfplots") ? "\\pgfplotsset{compat=1.18}" : "";
      wrap = false;
    } else if (media.tikzDraft) {
      ({ code, packages, libraries, extra } = media.tikzDraft);
      pristine = false;
    } else {
      const first = templates.find((x) => x.id === "axes") ?? templates[0];
      if (first) use(first, true);
    }
    createEditor();
    void refresh();
  });

  onDestroy(() => {
    if (!editing && !pristine) media.tikzDraft = { code, packages: [...packages], libraries: [...libraries], extra };
    view?.destroy();
  });

  function detectLibraries(src: string): string[] {
    const libs = new Set<string>();
    if (/Stealth|Latex\b|>=\s*\{?Stealth/.test(src)) libs.add("arrows.meta");
    if (/\b(above|below|left|right)=[^,\]]*of\b/.test(src)) libs.add("positioning");
    if (/\bdiamond\b|\bellipse\b|\btrapezium\b/.test(src)) libs.add("shapes.geometric");
    if (/\bstate\b.*\binitial\b|\baccepting\b/.test(src)) libs.add("automata");
    if (/\\pic\b.*\bangle\b/.test(src)) libs.add("angles");
    if (/"[^"]*"/.test(src) && /\\pic|edge\s*\[/.test(src)) libs.add("quotes");
    if (/matrix of (math )?nodes/.test(src)) libs.add("matrix");
    if (/\bmindmap\b/.test(src)) libs.add("mindmap");
    if (/\(\$[^)]*\$\)|\blet\b/.test(src)) libs.add("calc");
    return [...libs];
  }

  function detectPackages(src: string): string[] {
    const p = ["tikz"];
    if (/\\begin\{axis\}|\\addplot/.test(src)) p.push("pgfplots");
    if (/\\begin\{circuitikz\}/.test(src)) p.push("circuitikz");
    if (/\\begin\{tikzcd\}/.test(src)) p.push("tikz-cd");
    return p;
  }

  function createEditor() {
    if (!host) return;
    const s = app.settings?.editor;
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: code,
        extensions: [
          editorTheme(s?.fontFamily || "var(--font-mono)", Math.max(12, (s?.fontSize ?? 14) - 1), s?.lineHeight ?? 1.55),
          latex(),
          lineNumbers(),
          lintGutter(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          closeBrackets(),
          indentUnit.of("  "),
          EditorView.lineWrapping,
          docPath.of(editor.active ?? project.info?.main ?? ""),
          latexCompletion(),
          keymap.of([{ key: "Mod-Enter", run: () => (void insert(), true) }, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            code = u.state.doc.toString();
            pristine = false;
            refreshSoon();
          }),
        ],
      }),
    });
    view.focus();
  }

  function setCode(next: string) {
    code = next;
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  }

  async function use(tpl: TikzTemplate, initial = false) {
    if (!initial && !pristine && code.trim() && code !== tpl.code) {
      const ok = await ui.confirm({ title: t("tikz.replaceTitle"), message: t("tikz.replaceMessage"), okLabel: t("tikz.replace") });
      if (!ok) return;
    }
    packages = [...tpl.packages];
    libraries = [...tpl.libraries];
    extra = tpl.preamble;
    category = tpl.category;
    if (initial) code = tpl.code;
    else setCode(tpl.code);
    pristine = true;
    void refresh();
  }

  // ------------------------------------------------------------ preview

  const refreshSoon = debounce(() => void refresh(), 650);
  let pending = false;

  async function refresh() {
    if (compiling) {
      pending = true;
      return;
    }
    const path = editor.active ?? project.info?.main;
    if (!path || !code.trim()) return;
    compiling = true;
    try {
      outcome = await ipc.previewSnippet({
        path,
        job: "tikz",
        classOptions: "tikz,border=6pt",
        projectPreamble: true,
        packages,
        libraries,
        extra,
        body: code,
      });
      revision++;
      showErrors();
    } catch (e) {
      ui.toast("error", String(e));
    } finally {
      compiling = false;
      if (pending) {
        pending = false;
        void refresh();
      }
    }
  }

  const errors = $derived(outcome?.diagnostics.filter((d) => d.severity === "error") ?? []);

  function showErrors() {
    if (!view) return;
    const doc = view.state.doc;
    const diags: CmDiagnostic[] = [];
    for (const d of outcome?.diagnostics ?? []) {
      if (!d.line || d.line > doc.lines || d.severity === "info" || d.severity === "hint") continue;
      const line = doc.line(d.line);
      diags.push({ from: line.from, to: line.to, severity: d.severity, message: d.hint ? `${d.hint.title} — ${d.message}` : d.message });
    }
    view.dispatch(setDiagnostics(view.state, diags));
  }

  function goToLine(n: number | null) {
    if (!view || !n || n > view.state.doc.lines) return;
    const line = view.state.doc.line(n);
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    view.focus();
  }

  // -------------------------------------------------------------- editing

  function insertElement(element: Element) {
    if (!view) return;
    const el = { ...element, body: element.body.replaceAll("texte", t("tikz.text")) };
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    if (!line.text.trim()) {
      // Empty line: the element goes there.
      snippet(el.body)(view, { label: "" }, line.to, line.to);
    } else if (/^\s*\\end\{/.test(line.text)) {
      // On `\end{tikzpicture}`: just before it.
      snippet(`  ${el.body}\n`)(view, { label: "" }, line.from, line.from);
    } else {
      // Otherwise on a new line after the current one, with its indentation.
      const indent = /^\s*/.exec(line.text)![0];
      snippet(`\n${indent}${el.body}`)(view, { label: "" }, line.to, line.to);
    }
    for (const lib of el.libraries ?? []) if (!libraries.includes(lib)) libraries = [...libraries, lib];
    view.focus();
  }

  function insertOption(option: string) {
    if (!view) return;
    const pos = view.state.selection.main.head;
    const before = view.state.sliceDoc(Math.max(0, pos - 1), pos);
    const text = before === "[" || before === "," || before === " " ? option : `, ${option}`;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  function insertPoint(x: number, y: number) {
    if (!view) return;
    const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    view.dispatch(view.state.replaceSelection(`(${fmt(x)},${fmt(y)})`));
    view.focus();
  }

  function addLibrary(name: string) {
    const lib = name.trim();
    if (lib && !libraries.includes(lib)) {
      libraries = [...libraries, lib];
      void refresh();
    }
    libraryInput = "";
  }

  function removeLibrary(lib: string) {
    libraries = libraries.filter((l) => l !== lib);
    void refresh();
  }

  // ------------------------------------------------------------- insertion

  function wrapped(body: string): string {
    if (!wrap) return body;
    const inner = body.split("\n").map((l) => `\t${l}`).join("\n");
    return `\\begin{figure}[htbp]\n\t\\centering\n${inner}\n\t\\caption{${caption || CAPTION_FIELD}}\n\t\\label{${label}}\n\\end{figure}`;
  }

  async function requirements() {
    const extraLines = extra.split("\n").filter((l) => l.trim());
    await editor.transformRoot((text) => {
      let out = addPackages(text, packages.map((name) => ({ name })));
      const libs = [...libraries];
      if (hasPackage(out, "babel") && !libs.includes("babel")) libs.push("babel");
      if (libs.length) out = addTikzLibraries(out, libs);
      if (extraLines.length) out = addLines(out, extraLines, packages.includes("pgfplots") ? "pgfplots" : "tikz");
      return out;
    });
  }

  async function insert() {
    if (busy || !code.trim()) return;
    if (errors.length) {
      const ok = await ui.confirm({ title: t("tikz.errorsTitle"), message: t("tikz.errorsMessage", { n: errors.length }), okLabel: t("tikz.insertAnyway") });
      if (!ok) return;
    }
    busy = true;
    try {
      const body = code.trimEnd();
      if (request?.range) {
        await editor.open(request.range.path);
        editor.replaceRange(request.range.path, request.range.from, request.range.to, body);
      } else if (request?.file) {
        if (editor.isOpen(request.file)) {
          const current = editor.textOf(request.file) ?? "";
          editor.replaceRange(request.file, 0, current.length, `${body}\n`);
          await editor.save(request.file);
        } else {
          await ipc.writeTextFile(request.file, `${body}\n`);
        }
      } else {
        const view = editor.view;
        if (!view || editor.activeTab?.kind !== "tex" || view.state.readOnly) {
          ui.toast("warning", t("image.noDocument"));
          return;
        }
        let inserted = body;
        if (destination === "file") {
          const rel = fileName.replace(/\\/g, "/").replace(/^\/+/, "") || "figures/schema.tikz";
          const target = join(rootDir, rel);
          if (await ipc.pathExists(target)) {
            const ok = await ui.confirm({ title: t("tikz.overwriteTitle", { file: rel }), okLabel: t("tikz.overwrite"), danger: true });
            if (!ok) return;
          }
          await ipc.createDir(dirname(target)).catch(() => {});
          await ipc.writeTextFile(target, `${body}\n`);
          inserted = `\\input{${relative(rootDir, target)}}`;
          await project.refreshTree();
        }
        const line = view.state.doc.lineAt(view.state.selection.main.head);
        const prefix = line.text.trim() ? "\n" : "";
        // An empty caption becomes a field to type in.
        const snippetBody = escapeSnippet(prefix + wrapped(inserted)).replace(CAPTION_FIELD, `\${1:${t("snippet.caption")}}`);
        editor.insertSnippet(`${snippetBody}\${0}`, view);
      }
      await requirements();
      media.tikzDraft = null;
      pristine = true;
      ui.toast("success", editing ? t("tikz.updated") : t("tikz.inserted"));
      ui.closeOverlay();
      editor.focus();
    } catch (e) {
      ui.toast("error", String(e));
    } finally {
      busy = false;
    }
  }

  function copy() {
    void navigator.clipboard.writeText(code).then(() => ui.toast("success", t("files.copied")));
  }

  const shown = $derived(templates.filter((x) => x.category === category));
</script>

<Modal title={t("tikz.title")} icon="sparkles" width="96vw" height="92vh">
  {#snippet actions()}
    <span class="faint small">{t("tikz.shortcutHint", { key: prettyKey("Mod-Enter") })}</span>
  {/snippet}
  <div class="wrap">
  <div class="studio">
    <aside class="gallery">
      <div class="cats">
        {#each CATEGORIES as c}
          <button class="cat" class:active={category === c.id} title={t(c.label)} onclick={() => (category = c.id)}>
            <Icon name={c.icon} size={16} />
            <span>{t(c.label)}</span>
          </button>
        {/each}
      </div>
      <div class="templates">
        {#each shown as tpl (tpl.id)}
          <button class="tpl" onclick={() => use(tpl)}>
            <strong>{tpl.name}</strong>
            <span>{tpl.description}</span>
          </button>
        {/each}
      </div>
    </aside>

    <section class="code-pane">
      <div class="elements">
        {#each ELEMENTS as el}
          <button class="el" title={t(el.label)} onclick={() => insertElement(el)}>
            <Icon name={el.icon} size={14} />
            <span>{t(el.label)}</span>
          </button>
        {/each}
      </div>
      <div class="styles">
        {#each COLORS as c}
          <button class="swatch" title={c} style:background={SWATCH[c]} onclick={() => insertOption(c)} aria-label={c}></button>
        {/each}
        <span class="sep"></span>
        {#each STYLES as s}
          <button class="style mono" onclick={() => insertOption(s)}>{s}</button>
        {/each}
      </div>
      <div class="cm" bind:this={host}></div>
      <div class="libs">
        <span class="faint">{t("tikz.packages")}</span>
        {#each packages as p}<span class="chip mono">{p}</span>{/each}
        <span class="faint">{t("tikz.libraries")}</span>
        {#each libraries as l (l)}
          <span class="chip mono">{l}<button class="x" onclick={() => removeLibrary(l)} aria-label={t("common.delete")}>×</button></span>
        {/each}
        <input
          class="input small mono lib-input"
          list="tikz-libraries"
          placeholder={t("tikz.addLibrary")}
          bind:value={libraryInput}
          onkeydown={(e) => e.key === "Enter" && addLibrary(libraryInput)}
          onchange={() => allLibraries.includes(libraryInput) && addLibrary(libraryInput)}
        />
        <datalist id="tikz-libraries">{#each allLibraries as l}<option value={l}></option>{/each}</datalist>
        <button class="icon-btn" title={t("tikz.complete")} onclick={() => view && startCompletion(view)}><Icon name="sparkles" size={14} /></button>
      </div>
    </section>

    <section class="preview-pane">
      <div class="preview-bar">
        {#if compiling}
          <span class="spinner"></span><span class="faint">{t("tikz.compiling")}</span>
        {:else if outcome}
          {#if errors.length}
            <span class="status err"><Icon name="alert-circle" size={13} />{t("tikz.errors", { n: errors.length })}</span>
          {:else}
            <span class="status ok"><Icon name="check" size={13} />{t("tikz.upToDate", { ms: outcome.durationMs })}</span>
          {/if}
        {/if}
        <div class="spacer"></div>
        <label class="toggle"><input type="checkbox" bind:checked={grid} />{t("tikz.grid")}</label>
        <button class="icon-btn" title={t("viewer.reload")} onclick={() => refresh()}><Icon name="refresh" size={14} /></button>
      </div>
      <PdfPreview pdf={outcome?.pdf ?? null} {revision} bbox={outcome?.bbox ?? null} border={outcome?.border ?? 0} {grid} onpoint={insertPoint} />
      {#if errors.length}
        <div class="errors">
          {#each errors.slice(0, 4) as e}
            <button class="error" onclick={() => goToLine(e.line)}>
              <Icon name="alert-circle" size={13} />
              <span>{#if e.line}<strong>{t("tikz.line", { n: e.line })}</strong> {/if}{e.hint?.title ?? e.message}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="tip faint">{t("tikz.clickTip")}</p>
      {/if}
    </section>
  </div>

  <footer class="footer">
    {#if editing}
      <span class="editing"><Icon name="edit" size={14} />{request?.file ? t("tikz.editingFile", { file: relative(rootDir, request.file) }) : t("tikz.editingPicture")}</span>
    {:else}
      <div class="segmented">
        <button class:active={destination === "cursor"} onclick={() => (destination = "cursor")}>{t("tikz.atCursor")}</button>
        <button class:active={destination === "file"} onclick={() => (destination = "file")}>{t("tikz.ownFile")}</button>
      </div>
      {#if destination === "file"}
        <input class="input small mono file" bind:value={fileName} />
      {/if}
      <label class="toggle"><input type="checkbox" bind:checked={wrap} />{t("tikz.wrapFigure")}</label>
      {#if wrap}
        <input class="input small" placeholder={t("snippet.caption")} bind:value={caption} />
        <input class="input small mono label" bind:value={label} />
      {/if}
    {/if}
    <div class="spacer"></div>
    <button class="btn" onclick={copy}><Icon name="copy" size={14} />{t("tikz.copy")}</button>
    <button class="btn primary" disabled={busy || !code.trim()} onclick={insert}>
      {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={14} />{/if}
      {editing ? t("tikz.update") : t("tikz.insert")}
    </button>
  </footer>
  </div>
</Modal>

<style>
  .wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .studio {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .gallery {
    width: 250px;
    flex-shrink: 0;
    display: flex;
    border-right: 1px solid var(--border);
    min-height: 0;
  }
  .cats {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 4px;
    border-right: 1px solid var(--border);
  }
  .cat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 64px;
    padding: 6px 2px;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    font-size: 10px;
    text-align: center;
  }
  .cat:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .cat.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .templates {
    flex: 1;
    overflow: auto;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tpl {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    text-align: left;
    cursor: pointer;
  }
  .tpl:hover {
    border-color: var(--accent);
  }
  .tpl strong {
    font-size: 12.5px;
  }
  .tpl span {
    font-size: 11px;
    color: var(--text-faint);
    line-height: 1.35;
  }
  .code-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
  }
  .elements {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 8px 8px 4px;
  }
  .el {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .el:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .styles {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    padding: 2px 8px 8px;
    border-bottom: 1px solid var(--border);
  }
  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--bg-elev-2);
    box-shadow: 0 0 0 1px var(--border-strong);
    cursor: pointer;
  }
  .sep {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: var(--border);
  }
  .style {
    height: 20px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: none;
    font-size: 10.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .style:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .cm {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .cm :global(.cm-editor) {
    flex: 1;
  }
  .libs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border-top: 1px solid var(--border);
    font-size: 11.5px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 6px;
    border-radius: 9px;
    background: var(--bg-active);
    font-size: 11px;
  }
  .chip .x {
    border: none;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    padding: 0 0 0 2px;
  }
  .lib-input {
    width: 150px;
  }
  .preview-pane {
    width: 42%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 6px;
    min-height: 0;
  }
  .preview-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    min-height: 26px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .status.ok {
    color: var(--success);
  }
  .status.err {
    color: var(--error);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .toggle input {
    accent-color: var(--accent);
  }
  .errors {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .error {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    padding: 5px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--error);
    text-align: left;
    font-size: 12px;
    cursor: pointer;
  }
  .error span {
    color: var(--text);
  }
  .tip {
    margin: 0;
    font-size: 11.5px;
  }
  .footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .segmented {
    display: flex;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .segmented button {
    height: 28px;
    padding: 0 10px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 12px;
  }
  .segmented button + button {
    border-left: 1px solid var(--border-strong);
  }
  .segmented button.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  .file {
    width: 200px;
  }
  .label {
    width: 130px;
  }
  .editing {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
    font-size: 12.5px;
  }
  .small {
    font-size: 11.5px;
  }
</style>
