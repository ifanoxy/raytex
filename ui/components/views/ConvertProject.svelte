<script lang="ts">
  // Light mode → project: a name and a place for a folder that will hold
  // the file, the files it uses and what the feature adds (images, fonts…).
  import { open } from "@tauri-apps/plugin-dialog";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { basename, join } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  const file = project.info?.main ?? "";
  const reason = project.conversion?.reason ?? "";

  /** `devoir-maths.tex` → `Devoir maths`. */
  function nameOf(path: string): string {
    const stem = basename(path).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    return stem ? stem[0].toUpperCase() + stem.slice(1) : t("newProject.defaultTitle");
  }

  let name = $state(nameOf(file));
  let parent = $state("");
  let busy = $state(false);

  $effect(() => {
    void ipc.projectsDir().then((d) => (parent ||= d));
  });

  /** Folder name, like the engine makes it (for the preview of the path). */
  function folderName(s: string): string {
    return (
      s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "projet"
    );
  }

  async function chooseParent() {
    const dir = await open({ directory: true, defaultPath: parent || undefined, title: t("newProject.chooseLocation") });
    if (typeof dir === "string") parent = dir;
  }

  function close() {
    project.cancelConversion();
    ui.closeOverlay();
  }

  async function create() {
    if (busy || !name.trim()) return;
    busy = true;
    const ok = await project.convert(name.trim(), parent || null);
    busy = false;
    if (ok && ui.overlay === "convert") ui.closeOverlay();
  }
</script>

<Modal title={t("light.convertTitle")} icon="folder-plus" width="min(540px, 94vw)" height="auto" onclose={close}>
  <form
    class="form"
    onsubmit={(e) => {
      e.preventDefault();
      void create();
    }}
  >
    {#if reason}
      <div class="why">
        <Icon name="info" size={16} />
        <span>{t("light.why", { reason })}</span>
      </div>
    {/if}
    <p class="faint intro">{t("light.convertIntro", { file: basename(file) })}</p>
    <label>
      <span>{t("newProject.name")}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input large" bind:value={name} autofocus spellcheck="false" />
    </label>
    <label>
      <span>{t("newProject.location")}</span>
      <div class="row">
        <input class="input grow" value={parent} readonly title={parent} />
        <button type="button" class="btn" onclick={chooseParent}><Icon name="folder-open" size={14} />{t("newProject.change")}</button>
      </div>
    </label>
    <div class="path mono ellipsis" title={join(parent, folderName(name))}><Icon name="folder" size={12} /> {join(parent, folderName(name))}</div>
    <div class="actions">
      <button type="button" class="btn" onclick={close}>{t("common.cancel")}</button>
      <button type="submit" class="btn primary" disabled={busy || !name.trim()}>
        {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
        {t("light.convert")}
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
    padding: 18px 20px;
  }
  .why {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--text);
    font-size: 13px;
    line-height: 1.45;
  }
  .why :global(.icon) {
    flex-shrink: 0;
    color: var(--accent);
    margin-top: 1px;
  }
  .intro {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
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
