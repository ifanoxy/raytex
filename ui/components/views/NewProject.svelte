<script lang="ts">
  // New project: template gallery, details form and live preview.
  import { documentDir } from "@tauri-apps/api/path";
  import { open } from "@tauri-apps/plugin-dialog";
  import { i18n, type MessageKey, t, tr } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { TemplateInfo } from "$lib/types";
  import { debounce, join } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  const PARENT_KEY = "labaguetex.newProjectParent";
  const AUTHOR_KEY = "labaguetex.author";
  const CATEGORIES: { id: string; label: MessageKey; icon: string }[] = [
    { id: "all", label: "newProject.all", icon: "layers" },
    { id: "student", label: "newProject.student", icon: "book" },
    { id: "teacher", label: "newProject.teacher", icon: "edit" },
    { id: "researcher", label: "newProject.researcher", icon: "sparkles" },
    { id: "general", label: "newProject.general", icon: "file" },
    { id: "user", label: "newProject.user", icon: "star" },
  ];

  let templates = $state<TemplateInfo[]>([]);
  let category = $state("all");
  let selected = $state<TemplateInfo | null>(null);
  let title = $state("");
  let author = $state(localStorage.getItem(AUTHOR_KEY) ?? "");
  let institution = $state("");
  let language = $state<string>(i18n.lang);
  let parent = $state(localStorage.getItem(PARENT_KEY) ?? "");
  let folder = $state("");
  let folderEdited = $state(false);
  let preview = $state("");
  let creating = $state(false);

  $effect(() => {
    void ipc.listTemplates().then((list) => {
      templates = list.sort((a, b) => a.order - b.order);
      selected ??= templates.find((x) => x.id === "article") ?? templates[0] ?? null;
    });
    if (!parent)
      void documentDir()
        .then((d) => (parent ||= d ?? ""))
        .catch(() => {});
  });

  const shown = $derived(templates.filter((x) => category === "all" || x.category === category || (category === "user" && x.user)));

  function slug(s: string): string {
    return (
      s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || ""
    );
  }

  $effect(() => {
    if (!folderEdited) folder = slug(title) || (selected ? selected.id : "projet");
  });

  const refreshPreview = debounce(async (id: string, values: { title: string; author: string; institution: string; language: string }) => {
    preview = await ipc.templatePreview(id, values).catch(() => "");
  }, 200);

  $effect(() => {
    if (selected) refreshPreview(selected.id, { title: title || t("newProject.defaultTitle"), author, institution, language });
  });

  async function chooseParent() {
    const dir = await open({ directory: true, defaultPath: parent || undefined, title: t("newProject.chooseLocation") });
    if (typeof dir === "string") parent = dir;
  }

  async function create() {
    if (!selected || !parent || !folder.trim()) return;
    const dir = join(parent, folder.trim());
    if (await ipc.pathExists(dir)) {
      ui.toast("error", t("newProject.exists", { dir }));
      return;
    }
    creating = true;
    try {
      localStorage.setItem(PARENT_KEY, parent);
      if (author) localStorage.setItem(AUTHOR_KEY, author);
    } catch {
      /* not remembered */
    }
    const ok = await project.create(selected.id, dir, { title: title || t("newProject.defaultTitle"), author, institution, language });
    creating = false;
    if (ok) ui.closeOverlay();
  }

  async function removeTemplate(tpl: TemplateInfo) {
    const ok = await ui.confirm({ title: t("newProject.deleteTemplate", { name: tr(tpl.name) }), okLabel: t("common.delete"), danger: true });
    if (!ok) return;
    await ipc.deleteTemplate(tpl.id);
    templates = templates.filter((x) => x.id !== tpl.id);
    if (selected?.id === tpl.id) selected = templates[0] ?? null;
  }
</script>

<Modal title={t("action.newProject").replace(/…$/, "")} icon="sparkles">
  <nav class="cats">
    {#each CATEGORIES as c}
      <button class="cat" class:active={category === c.id} onclick={() => (category = c.id)}>
        <Icon name={c.icon} size={15} />
        {t(c.label)}
      </button>
    {/each}
  </nav>

  <div class="gallery">
    {#each shown as tpl (tpl.id)}
      <div
        class="tpl"
        class:active={selected?.id === tpl.id}
        role="button"
        tabindex="0"
        onclick={() => (selected = tpl)}
        ondblclick={create}
        onkeydown={(e) => e.key === "Enter" && (selected = tpl)}
      >
        <div class="tpl-head">
          <strong>{tr(tpl.name)}</strong>
          {#if tpl.engine}<span class="badge">{tpl.engine}</span>{/if}
          {#if tpl.user}
            <button class="icon-btn del" title={t("common.delete")} onclick={(e) => { e.stopPropagation(); void removeTemplate(tpl); }}><Icon name="trash" size={13} /></button>
          {/if}
        </div>
        <p>{tr(tpl.description)}</p>
        {#if tpl.tags.length}
          <div class="tags">{#each tpl.tags.slice(0, 4) as tag}<span>{tag}</span>{/each}</div>
        {/if}
      </div>
    {:else}
      <div class="empty">{t("newProject.noTemplates")}</div>
    {/each}
  </div>

  <aside class="form">
    {#if selected}
      <h3>{tr(selected.name)}</h3>
      <label>
        <span>{t("newProject.title")}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" bind:value={title} placeholder={t("newProject.defaultTitle")} autofocus />
      </label>
      <label>
        <span>{t("newProject.author")}</span>
        <input class="input" bind:value={author} placeholder={t("newProject.authorPlaceholder")} />
      </label>
      <label>
        <span>{t("newProject.institution")}</span>
        <input class="input" bind:value={institution} placeholder={t("newProject.institutionPlaceholder")} />
      </label>
      <label>
        <span>{t("newProject.language")}</span>
        <select class="select input" bind:value={language}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        <span>{t("newProject.location")}</span>
        <div class="row">
          <input class="input grow" value={parent} readonly title={parent} />
          <button class="btn" onclick={chooseParent}><Icon name="folder-open" size={14} /></button>
        </div>
      </label>
      <label>
        <span>{t("newProject.folder")}</span>
        <input class="input mono" bind:value={folder} oninput={() => (folderEdited = true)} spellcheck="false" />
      </label>
      <div class="path faint mono ellipsis" title={join(parent, folder)}>{join(parent, folder)}</div>
      <div class="preview-title section-title">{t("newProject.preview")}</div>
      <pre class="preview mono selectable">{preview}</pre>
      <button class="btn primary large" disabled={creating || !parent || !folder.trim()} onclick={create}>
        {#if creating}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
        {t("newProject.create")}
      </button>
    {/if}
  </aside>
</Modal>

<style>
  .cats {
    width: 190px;
    flex-shrink: 0;
    padding: 12px 8px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cat {
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
  }
  .cat:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .cat.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  .cat.active :global(.icon) {
    color: var(--accent);
  }
  .gallery {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 10px;
    align-content: start;
  }
  .tpl {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev-2);
    cursor: pointer;
    min-height: 112px;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .tpl:hover {
    border-color: var(--border-strong);
  }
  .tpl.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .tpl-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tpl-head strong {
    flex: 1;
  }
  .del {
    width: 22px;
    height: 22px;
  }
  .tpl p {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: auto;
  }
  .tags span {
    font-size: 10.5px;
    padding: 1px 6px;
    border-radius: 8px;
    background: var(--bg-active);
    color: var(--text-faint);
  }
  .form {
    width: 330px;
    flex-shrink: 0;
    overflow: auto;
    padding: 16px 18px;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 15px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .grow {
    flex: 1;
  }
  .path {
    font-size: 11px;
  }
  .preview {
    flex: 1;
    min-height: 120px;
    max-height: 260px;
    margin: 0;
    padding: 8px 10px;
    overflow: auto;
    border-radius: var(--radius);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
    white-space: pre;
  }
  .preview-title {
    margin-top: 4px;
  }
</style>
