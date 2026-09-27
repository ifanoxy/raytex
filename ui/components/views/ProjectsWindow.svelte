<script lang="ts">
  // "My projects" while a project is open: the same browser as the start
  // screen, in a window.
  import { t } from "$lib/i18n.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Modal from "../common/Modal.svelte";
  import ProjectsBrowser from "./ProjectsBrowser.svelte";
</script>

<Modal title={t("projects.windowTitle")} icon="folder" width="min(1100px, 94vw)" height="min(820px, 90vh)">
  <div class="scroll">
    <ProjectsBrowser onopen={() => ui.closeOverlay()} />
  </div>
</Modal>

<style>
  .scroll {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 18px 22px 26px;
  }
</style>
