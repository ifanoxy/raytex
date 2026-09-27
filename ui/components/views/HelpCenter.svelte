<script lang="ts">
  // Help centre: guides, command reference, symbols, errors, shortcuts.
  import { actions, keyFor } from "$lib/actions";
  import { type MessageKey, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { editor } from "$lib/state/editor.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { ErrorEntry, PageInfo, ReferenceEntry, SymbolCategory } from "$lib/types";
  import { debounce, escapeSnippet, inlineMarkdown, prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  type Section = "guides" | "reference" | "symbols" | "errors" | "shortcuts";
  const SECTIONS: { id: Section; label: MessageKey; icon: string }[] = [
    { id: "guides", label: "help.guides", icon: "book" },
    { id: "reference", label: "help.reference", icon: "hash" },
    { id: "symbols", label: "help.symbols", icon: "sigma" },
    { id: "errors", label: "help.errors", icon: "bug" },
    { id: "shortcuts", label: "help.shortcuts", icon: "keyboard" },
  ];

  let section = $state<Section>((ui.helpTarget?.section as Section) ?? "guides");
  let pages = $state<PageInfo[]>([]);
  let page = $state<string | null>(ui.helpTarget?.section === "guides" ? (ui.helpTarget.id ?? null) : null);
  let html = $state("");
  let content = $state<HTMLElement | null>(null);
  let query = $state("");
  let reference = $state<ReferenceEntry[]>([]);
  let symbols = $state<SymbolCategory[]>([]);
  let errors = $state<ErrorEntry[]>([]);
  const errorTarget = ui.helpTarget?.section === "errors" ? ui.helpTarget.id : undefined;

  $effect(() => {
    void ipc.helpPages().then((p) => {
      pages = p;
      page ??= p[0]?.id ?? null;
    });
  });

  $effect(() => {
    if (section !== "guides" || !page) return;
    void ipc.helpPage(page).then((h) => {
      html = h ?? `<p>${t("help.missing")}</p>`;
      requestAnimationFrame(enhance);
    });
  });

  const search = debounce(async (q: string) => {
    reference = await ipc.referenceSearch(q).catch(() => []);
  }, 150);

  $effect(() => {
    if (section === "reference") search(query);
    if (section === "symbols" && !symbols.length) void ipc.symbolPalette().then((s) => (symbols = s));
    if (section === "errors" && !errors.length)
      void ipc.errorCatalog().then((e) => {
        errors = e;
        if (errorTarget) requestAnimationFrame(() => document.getElementById(`err-${errorTarget}`)?.scrollIntoView({ block: "center" }));
      });
  });

  /** Adds "copy" and "insert" buttons to code blocks, and routes links. */
  function enhance() {
    if (!content) return;
    content.scrollTop = 0;
    for (const pre of content.querySelectorAll("pre")) {
      const code = pre.textContent ?? "";
      const bar = document.createElement("div");
      bar.className = "code-actions";
      const copy = document.createElement("button");
      copy.className = "btn small";
      copy.textContent = t("help.copy");
      copy.onclick = () => void navigator.clipboard.writeText(code).then(() => ui.toast("success", t("files.copied")));
      bar.appendChild(copy);
      if (editor.activeTab?.kind === "tex" && /\\/.test(code)) {
        const insert = document.createElement("button");
        insert.className = "btn small";
        insert.textContent = t("help.insert");
        insert.onclick = () => {
          ui.closeOverlay();
          editor.insertSnippet(escapeSnippet(code.replace(/\n$/, "")));
        };
        bar.appendChild(insert);
      }
      pre.appendChild(bar);
    }
  }

  function click(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:/.test(href)) void ipc.openUrl(href);
    else if (href.startsWith("#")) document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
    else {
      // Links between guides: "latex-basics.md", "../fr/03-math.md#…".
      const id = href.replace(/^.*\//, "").replace(/\.md(#.*)?$/, "").replace(/^\d+-/, "");
      if (pages.some((p) => p.id === id)) page = id;
    }
  }

  function insertReference(r: ReferenceEntry) {
    ui.closeOverlay();
    editor.insertSnippet(r.insert);
    if (r.package) void editor.addPackage(r.package);
  }

  const SHORTCUT_GROUPS = ["file", "build", "view", "navigate", "edit", "help"] as const;
  const EDITOR_KEYS: { keys: string; label: MessageKey }[] = [
    { keys: "Mod-f", label: "help.keyFind" },
    { keys: "Mod-Alt-f", label: "help.keyReplace" },
    { keys: "Mod-z", label: "help.keyUndo" },
    { keys: "Mod-Shift-z", label: "help.keyRedo" },
    { keys: "Mod-/", label: "action.toggleComment" },
    { keys: "Mod-d", label: "help.keyNextOccurrence" },
    { keys: "Alt-ArrowUp", label: "help.keyMoveLine" },
    { keys: "Mod-Space", label: "help.keyComplete" },
    { keys: "Tab", label: "help.keyTab" },
    { keys: "F8", label: "help.keyNextProblem" },
  ];
</script>

<Modal title={t("action.help")} icon="help">
  <nav class="nav">
    {#each SECTIONS as s (s.id)}
      <button class="nav-item" class:active={section === s.id} onclick={() => (section = s.id)}>
        <Icon name={s.icon} size={15} />
        {t(s.label)}
      </button>
      {#if s.id === "guides" && section === "guides"}
        <div class="pages">
          {#each pages as p (p.id)}
            <button class="page-item" class:active={page === p.id} onclick={() => (page = p.id)}>{p.title}</button>
          {/each}
        </div>
      {/if}
    {/each}
  </nav>

  <div class="content" bind:this={content}>
    {#if section === "guides"}
      <!-- Guides are rendered by the engine, which escapes raw HTML. -->
      <article class="doc guide" role="presentation" onclick={click}>{@html html}</article>
    {:else if section === "reference"}
      <div class="search">
        <Icon name="search" size={15} />
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" placeholder={t("help.referenceSearch")} bind:value={query} autofocus spellcheck="false" />
      </div>
      <div class="entries">
        {#each reference as r (r.label + (r.package ?? ""))}
          <div class="entry">
            <div class="entry-head">
              {#if r.glyph}<span class="glyph">{r.glyph}</span>{/if}
              <code class="name">{r.environment ? `\\begin{${r.label}}` : r.label}{r.args}</code>
              {#if r.package}<span class="badge">{r.package}</span>{:else}<span class="badge accent">LaTeX</span>{/if}
              <div class="spacer"></div>
              {#if editor.activeTab?.kind === "tex"}
                <button class="btn small" onclick={() => insertReference(r)}>{t("help.insert")}</button>
              {/if}
            </div>
            {#if r.doc}<p class="entry-doc">{@html inlineMarkdown(r.doc)}</p>{/if}
          </div>
        {:else}
          <div class="empty">{t("help.noResults")}</div>
        {/each}
      </div>
    {:else if section === "symbols"}
      {#each symbols as c (c.id)}
        <h3 class="cat">{c.name}</h3>
        <div class="symbols">
          {#each c.symbols as s (s.command)}
            <div class="symbol" title={s.package ?? ""}>
              <span class="glyph">{s.glyph}</span>
              <code>{s.command}</code>
            </div>
          {/each}
        </div>
      {/each}
    {:else if section === "errors"}
      <p class="intro">{t("help.errorsIntro")}</p>
      <div class="entries">
        {#each errors as e (e.id)}
          <div class="entry" class:target={e.id === errorTarget} id="err-{e.id}">
            <strong>{e.title}</strong>
            <!-- Rendered by the engine from our own catalogue (raw HTML escaped). -->
            <div class="entry-doc doc">{@html e.explanation}</div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="intro">{t("help.shortcutsIntro")}</p>
      <div class="shortcut-groups">
        {#each SHORTCUT_GROUPS as g}
          {@const list = actions.filter((a) => a.category === g && keyFor(a.id))}
          {#if list.length}
            <div class="group">
              <h3 class="cat">{t(`category.${g}`)}</h3>
              {#each list as a (a.id)}
                <div class="shortcut"><span>{t(a.title)}</span><kbd>{prettyKey(keyFor(a.id)!)}</kbd></div>
              {/each}
            </div>
          {/if}
        {/each}
        <div class="group">
          <h3 class="cat">{t("help.editorKeys")}</h3>
          {#each EDITOR_KEYS as k}
            <div class="shortcut"><span>{t(k.label)}</span><kbd>{prettyKey(k.keys)}</kbd></div>
          {/each}
          <div class="shortcut"><span>{t("help.keyDefinition")}</span><kbd>{prettyKey("Mod")} + clic</kbd></div>
          <div class="shortcut"><span>{t("help.keyMultiCursor")}</span><kbd>{prettyKey("Alt")} + clic</kbd></div>
          <div class="shortcut"><span>{t("help.keyInverseSync")}</span><kbd>{t("help.doubleClickPdf")}</kbd></div>
        </div>
      </div>
      <button class="btn small" onclick={() => ui.openSettings("keys")}><Icon name="edit" size={13} />{t("help.customize")}</button>
    {/if}
  </div>
</Modal>

<style>
  .nav {
    width: 240px;
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
  .pages {
    display: flex;
    flex-direction: column;
    margin: 2px 0 6px 18px;
    padding-left: 8px;
    border-left: 1px solid var(--border);
  }
  .page-item {
    padding: 5px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    font-size: 12.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .page-item:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
  .page-item.active {
    color: var(--accent);
    font-weight: 600;
  }
  .content {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 24px 36px 48px;
  }
  .guide {
    max-width: 780px;
    font-size: 14px;
  }
  .guide :global(pre) {
    padding-bottom: 38px;
  }
  .guide :global(.code-actions) {
    position: absolute;
    right: 8px;
    bottom: 6px;
    display: flex;
    gap: 6px;
    opacity: 0.6;
  }
  .guide :global(.code-actions .btn) {
    font-family: var(--font-ui);
  }
  .guide :global(pre:hover .code-actions) {
    opacity: 1;
  }
  .guide :global(a) {
    cursor: pointer;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    color: var(--text-faint);
  }
  .search .input {
    flex: 1;
    height: 36px;
    font-size: 14px;
  }
  .entries {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .entry {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elev-2);
  }
  .entry.target {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .entry-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font-size: 13px;
    color: var(--hl-command);
  }
  .entry-doc {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
    user-select: text;
  }
  .glyph {
    font-family: "STIX Two Math", "Cambria Math", "Latin Modern Math", serif;
    font-size: 18px;
    min-width: 22px;
    text-align: center;
  }
  .cat {
    margin: 18px 0 8px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .symbols {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 4px;
  }
  .symbol {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    user-select: text;
  }
  .symbol:hover {
    background: var(--bg-hover);
  }
  .symbol code {
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .intro {
    margin: 0 0 14px;
    color: var(--text-muted);
    max-width: 720px;
    line-height: 1.55;
  }
  .shortcut-groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 8px 28px;
    margin-bottom: 18px;
  }
  .shortcut {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12.5px;
  }
</style>
