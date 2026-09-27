<script lang="ts">
  // Guided set-up of the TeX distribution (opened on first launch when
  // none is found, or from the status bar).
  import { t } from "$lib/i18n.svelte";
  import { tex } from "$lib/state/tex.svelte";
  import Modal from "../common/Modal.svelte";
  import TexSetup from "./TexSetup.svelte";
</script>

<Modal title={t("setup.title")} icon="wand" width="min(860px, 94vw)">
  <div class="content">
    <p class="lead">{tex.missing ? t("setup.leadMissing") : t("setup.lead")}</p>
    <TexSetup />
  </div>
</Modal>

<style>
  .content {
    flex: 1;
    overflow: auto;
    padding: 18px 22px 24px;
  }
  .lead {
    margin: 0 0 14px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--text-muted);
  }
</style>
