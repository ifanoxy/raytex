<script lang="ts">
  // Shown over an empty file: ways to start it. It disappears as soon as
  // something is typed; the text cursor stays in the editor meanwhile.
  import { keyFor } from "$lib/actions";
  import { i18n, t } from "$lib/i18n.svelte";
  import { editor, type Tab } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { dirname, prettyKey, relative, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  let { tab }: { tab: Tab } = $props();

  interface Choice {
    icon: string;
    title: string;
    hint: string;
    run: () => unknown;
  }

  const isMain = $derived(samePath(tab.path, project.info?.main) || !project.info?.main);
  const babel = $derived(i18n.lang === "fr" ? "french" : "english");

  /** Relative path used to include this file from the main one. */
  const includePath = $derived.by(() => {
    const main = project.info?.main;
    if (!main) return null;
    return relative(dirname(main), tab.path).replace(/\.tex$/, "");
  });
  let justIncluded = $state(false);
  const included = $derived.by(() => {
    void editor.revision;
    if (justIncluded) return true;
    const main = project.info?.main;
    const text = (main && editor.textOf(main)) ?? "";
    return !!includePath && new RegExp(`\\\\(input|include|subfile)\\{${includePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\.tex)?\\}`).test(text);
  });

  function showTemplates() {
    ui.sidebar = "templates";
    ui.setVisible("sidebar", true);
  }

  function snippet(body: string) {
    editor.insertSnippet(body);
    editor.focus();
  }

  const minimal = $derived(
    `\\documentclass[11pt,a4paper]{article}\n\\usepackage[T1]{fontenc}\n\\usepackage[${babel}]{babel}\n\n\\title{\${1}}\n\\author{\${2}}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\${0}\n\n\\end{document}\n`,
  );

  async function includeInMain() {
    const main = project.info?.main;
    if (!main || !includePath) return;
    await editor.open(main, { background: true });
    const text = editor.textOf(main) ?? "";
    const at = text.lastIndexOf("\\end{document}");
    if (at < 0) {
      ui.toast("warning", t("start.noEndDocument"));
      return;
    }
    editor.replaceRange(main, at, at, `\\input{${includePath}}\n\n`);
    justIncluded = true;
    ui.toast("success", t("start.included", { file: includePath }));
    editor.focus();
  }

  const choices = $derived.by((): Choice[] => {
    if (tab.kind === "bib") {
      return [
        { icon: "book", title: t("start.bibArticle"), hint: "@article", run: () => snippet("@article{${1},\n\tauthor  = {${2}},\n\ttitle   = {${3}},\n\tjournal = {${4}},\n\tyear    = {${5}},\n}\n") },
        { icon: "book", title: t("start.bibBook"), hint: "@book", run: () => snippet("@book{${1},\n\tauthor    = {${2}},\n\ttitle     = {${3}},\n\tpublisher = {${4}},\n\tyear      = {${5}},\n}\n") },
        { icon: "globe", title: t("start.bibOnline"), hint: "@online", run: () => snippet("@online{${1},\n\tauthor  = {${2}},\n\ttitle   = {${3}},\n\turl     = {${4}},\n\turldate = {${5}},\n}\n") },
      ];
    }
    if (isMain) {
      return [
        // Templates may add files (bibliography, chapters): projects only.
        ...(project.info?.light ? [] : [{ icon: "template", title: t("start.template"), hint: t("start.templateHint"), run: showTemplates }]),
        { icon: "file-tex", title: t("start.minimal"), hint: t("start.minimalHint"), run: () => snippet(minimal) },
        { icon: "presentation", title: t("start.slides"), hint: t("start.slidesHint"), run: () => snippet(`\\documentclass{beamer}\n\\usepackage[T1]{fontenc}\n\\usepackage[${babel}]{babel}\n\n\\title{\${1}}\n\\author{\${2}}\n\n\\begin{document}\n\n\\begin{frame}\n\t\\titlepage\n\\end{frame}\n\n\\begin{frame}{\${3}}\n\t\${0}\n\\end{frame}\n\n\\end{document}\n`) },
      ];
    }
    return [
      { icon: "heading", title: t("start.section"), hint: "\\section{…}", run: () => snippet("\\section{${1}}\n\n${0}") },
      { icon: "heading", title: t("start.chapter"), hint: "\\chapter{…}", run: () => snippet("\\chapter{${1}}\n\n${0}") },
      ...(!included && includePath ? [{ icon: "link", title: t("start.include"), hint: `\\input{${includePath}}`, run: includeInMain }] : []),
    ];
  });
</script>

<div class="start">
  <div class="card">
    <div class="head">
      <strong>{t("start.title")}</strong>
      <span class="faint">{t("start.subtitle")}</span>
    </div>
    {#each choices as c (c.title)}
      <button class="choice" onmousedown={(e) => e.preventDefault()} onclick={c.run}>
        <span class="icon-box"><Icon name={c.icon} size={17} /></span>
        <span class="text">
          <span class="title">{c.title}</span>
          <span class="hint faint">{c.hint}</span>
        </span>
        <Icon name="chevron-right" size={14} />
      </button>
    {/each}
    <div class="tips">
      {#if tab.kind === "tex"}
        <p>
          <Icon name="at" size={13} />
          <span>{t("start.atTip")}</span>
          <button class="link" onmousedown={(e) => e.preventDefault()} onclick={() => ui.showSidebar("snippets")}>{t("start.atMore")}</button>
        </p>
        <p><Icon name="snippets" size={13} /><span>{t("start.snippetTip")}</span></p>
      {/if}
      <p><Icon name="keyboard" size={13} /><span>{t("start.completionTip", { key: prettyKey("Ctrl-Space") })}</span> <kbd>{prettyKey(keyFor("build.run") ?? "")}</kbd> {t("start.buildTip")}</p>
    </div>
  </div>
</div>

<style>
  .start {
    position: absolute;
    top: 52px;
    left: 64px;
    right: 24px;
    pointer-events: none;
    z-index: 5;
  }
  .card {
    pointer-events: auto;
    max-width: 440px;
    padding: 14px 14px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    animation: appear 0.15s ease-out;
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 4px 10px;
  }
  .head strong {
    font-size: 14px;
  }
  .head span {
    font-size: 12px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
  }
  .choice:hover {
    border-color: var(--border);
    background: var(--bg-hover);
    color: var(--text);
  }
  .icon-box {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--accent-soft);
    color: var(--accent);
    flex-shrink: 0;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .title {
    color: var(--text);
    font-weight: 600;
    font-size: 13px;
  }
  .hint {
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tips {
    margin-top: 8px;
    padding: 8px 4px 0;
    border-top: 1px solid var(--border);
  }
  .tips p {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin: 4px 0;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .tips :global(.icon) {
    color: var(--accent);
    flex-shrink: 0;
  }
  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--accent);
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
  }
  kbd {
    font-size: 10.5px;
  }
</style>
