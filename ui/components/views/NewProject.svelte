<script lang="ts">
  // New project: a name and a place. The project starts empty; templates
  // are offered in the sidebar next to the text.
  import { open } from "@tauri-apps/plugin-dialog";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { join } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  const AUTHOR_KEY = "raytex.author";

  function remembered(key: string): string {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }

  let name = $state("");
  let author = $state(remembered(AUTHOR_KEY));
  // Projects go to the projects folder unless another place is chosen.
  let parent = $state("");
  let creating = $state(false);
  let exists = $state(false);

  $effect(() => {
    void ipc
      .projectsDir()
      .then((d) => (parent ||= d))
      .catch(() => {});
  });

  /** Folder name: the project name without characters that trouble LaTeX tools. */
  function folderName(s: string): string {
    return (
      s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9._ -]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .toLowerCase()
        .slice(0, 60) || ""
    );
  }

  const title = $derived(name.trim() || t("newProject.defaultTitle"));
  const folder = $derived(folderName(title) || "projet");
  const target = $derived(parent ? join(parent, folder) : "");

  $effect(() => {
    const dir = target;
    exists = false;
    if (dir)
      void ipc.pathExists(dir).then((e) => {
        if (dir === target) exists = e;
      });
  });

  async function chooseParent() {
    const dir = await open({ directory: true, defaultPath: parent || undefined, title: t("newProject.chooseLocation") });
    if (typeof dir === "string") parent = dir;
  }

  async function create() {
    if (!target || creating) return;
    if (await ipc.pathExists(target)) {
      ui.toast("error", t("newProject.exists", { dir: target }));
      return;
    }
    creating = true;
    try {
      localStorage.setItem(AUTHOR_KEY, author.trim());
    } catch {
      /* not remembered */
    }
    const ok = await project.createEmpty(target, title);
    creating = false;
    if (ok) ui.closeOverlay();
  }
</script>

<Modal title={t("action.newProject").replace(/…$/, "")} icon="sparkles" width="min(520px, 94vw)" height="auto">
  <form
    class="form"
    onsubmit={(e) => {
      e.preventDefault();
      void create();
    }}
  >
    <label>
      <span>{t("newProject.name")}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input large" bind:value={name} placeholder={t("newProject.defaultTitle")} autofocus spellcheck="false" />
    </label>
    <label>
      <span>{t("newProject.author")} <em class="faint">{t("newProject.optional")}</em></span>
      <input class="input" bind:value={author} placeholder={t("newProject.authorPlaceholder")} />
    </label>
    <label>
      <span>{t("newProject.location")}</span>
      <div class="row">
        <input class="input grow" value={parent} readonly title={parent} />
        <button type="button" class="btn" onclick={chooseParent}><Icon name="folder-open" size={14} />{t("newProject.change")}</button>
      </div>
    </label>
    <div class="path mono ellipsis" class:error={exists} title={target}>
      {#if exists}<Icon name="alert-circle" size={12} /> {t("newProject.existsShort")}{:else}<Icon name="folder" size={12} />{/if}
      {target}
    </div>
    <p class="note faint">{t("newProject.note")}</p>
    <div class="actions">
      <button type="button" class="btn" onclick={() => ui.closeOverlay()}>{t("common.cancel")}</button>
      <button type="submit" class="btn primary" disabled={creating || !parent || exists}>
        {#if creating}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
        {t("newProject.create")}
      </button>
    </div>
  </form>
</Modal>

<style>
  .form {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 20px 18px;
  }
  .form > :global(*) {
    min-width: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-muted);
  }
  em {
    font-style: normal;
  }
  .input.large {
    height: 38px;
    font-size: 15px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .path {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    margin-top: -6px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .path.error {
    color: var(--error);
  }
  .note {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }
  .path :global(.icon) {
    display: inline-block;
    vertical-align: -2px;
    margin-right: 4px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
