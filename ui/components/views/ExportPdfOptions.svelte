<script lang="ts">
  // Exporting the PDF of a document that has pictures: as it is, with
  // lighter pictures, or under a size. Each choice says about what the PDF
  // would weigh before anything is done. A subject with its answer key:
  // either one, or both in two files.
  import { onDestroy, onMount } from "svelte";
  import { save } from "@tauri-apps/plugin-dialog";
  import { totalPoints } from "$lib/answerkey";
  import { sizeLabel } from "$lib/history";
  import { i18n, plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { estimate, megabytes, type PdfChoice, type PdfWeights, STEP_BALANCED, STEP_LIGHT, stepFor } from "$lib/pdfweight";
  import { answerKey, type Version } from "$lib/state/answerkey.svelte";
  import { build } from "$lib/state/build.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { pdfExport } from "$lib/state/pdfexport.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { viewer } from "$lib/state/viewer.svelte";
  import { basename, stem } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  type Kind = "original" | "balanced" | "light" | "limit";
  const KINDS: Kind[] = ["original", "balanced", "light", "limit"];
  const KEY = "raytex.export.pdf";
  const lang = i18n.lang === "fr" ? "fr" : "en";
  const target = build.target();

  // The choice and the limit of the last time.
  const saved: { kind?: Kind; limit?: string; standard?: ipc.PdfStandard } = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {
      return {};
    }
  })();
  let kind = $state<Kind>(KINDS.includes(saved.kind as Kind) ? (saved.kind as Kind) : "original");
  let limit = $state(typeof saved.limit === "string" ? saved.limit : "10");
  const STANDARDS: ipc.PdfStandard[] = ["a-2b", "a-1b", "a-2u", "a-3b"];
  /** A PDF/A, for archiving: ticked when asked for from "Export as PDF/A". */
  let archive = $state(pdfExport.archiveAsked);
  let standard = $state<ipc.PdfStandard>(STANDARDS.includes(saved.standard as ipc.PdfStandard) ? (saved.standard as ipc.PdfStandard) : "a-2b");
  pdfExport.archiveAsked = false;
  /** A subject with its answer key: the one shown, or both when asked for. */
  const answers = answerKey.current;
  type Which = Version | "both";
  let which = $state<Which>(answerKey.bothAsked ? "both" : answers?.shown ? "key" : "subject");
  answerKey.bothAsked = false;
  const points = answers && project.info?.main ? totalPoints(editor.textOf(project.info.main) ?? "", answers) : null;
  /** What the files are called by default: the project, then the version. */
  const base = project.info?.light && project.info.main ? stem(project.info.main) : (project.info?.name ?? "document");
  const named = (v: Version) => `${base} - ${t(v === "subject" ? "answers.fileSubject" : "answers.fileKey")}.pdf`;
  /** The answer key next to the subject chosen: its word replaced, else added. */
  function keyNext(subject: string): string {
    const file = basename(subject);
    const word = t("answers.fileSubject");
    const at = file.toLowerCase().lastIndexOf(word.toLowerCase());
    const name = at >= 0 ? file.slice(0, at) + t("answers.fileKey") + file.slice(at + word.length) : file.replace(/(\.pdf)?$/i, ` - ${t("answers.fileKey")}.pdf`);
    return subject.slice(0, subject.length - file.length) + name;
  }
  /** The pictures and the PDF as they are (at once), then what they weigh at each step (seconds). */
  let pictures = $state<{ pictures: number; original: number; pdf: number | null } | null>(null);
  let weights = $state<PdfWeights | null>(null);
  let weighing = $state(true);

  onMount(async () => {
    if (!target) return;
    pictures = await ipc.pdfPictures(target).catch(() => null);
    // No pictures: the PDF as it is (a PDF/A, if asked).
    if (!pictures?.pictures) kind = "original";
    weights = await ipc.pdfWeights(target).catch(() => null);
    weighing = false;
  });
  onDestroy(() => {
    if (weighing) void ipc.pdfWeightsCancel();
  });

  const bytes = $derived(megabytes(limit));
  const reach = $derived(weights && bytes ? stepFor(weights, bytes) : null);

  /** About what the PDF would weigh with a choice; null when it cannot be said (yet). */
  function about(of: Kind): number | null {
    if (of === "original") return pictures?.pdf ?? null;
    if (!weights) return null;
    if (of === "limit") return reach ? estimate(weights, reach.step) : null;
    return estimate(weights, of === "balanced" ? STEP_BALANCED : STEP_LIGHT);
  }

  const ready = $derived(kind === "original" || (kind === "limit" ? bytes !== null : true));

  async function choose() {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ kind, limit, standard }));
    } catch {
      /* not remembered */
    }
    const choice: PdfChoice = kind === "original" ? { kind } : kind === "limit" ? { kind, bytes: bytes! } : { kind: "step", step: kind === "balanced" ? STEP_BALANCED : STEP_LIGHT };
    // Light mode: proposed next to the .tex file (its build is in the cache).
    const main = project.info?.light ? project.info.main : null;
    const filters = [{ name: "PDF", extensions: ["pdf"] }];
    const level = archive ? standard : null;
    if (answers) {
      // The version shown is the build of the project: the others are built apart.
      const versionOf = (v: Version) => ((v === "key") === answers.shown ? null : answerKey.versionOf(v));
      const dest = await save({ defaultPath: named(which === "key" ? "key" : "subject"), filters });
      if (!dest) return;
      if (which !== "both") {
        ui.closeOverlay();
        await pdfExport.start(dest, choice, level, versionOf(which));
        return;
      }
      const key = keyNext(dest);
      if (key !== dest && (await ipc.pathExists(key).catch(() => false)) && !(await ui.confirm({ title: t("answers.replaceTitle"), message: t("answers.replace", { file: basename(key) }), okLabel: t("answers.replaceOk") }))) return;
      ui.closeOverlay();
      if (await pdfExport.start(dest, choice, level, versionOf("subject"))) await pdfExport.start(key, choice, level, versionOf("key"));
      return;
    }
    const defaultPath = main ? main.replace(/\.[^./\\]+$/, ".pdf") : viewer.pdf ? basename(viewer.pdf) : "document.pdf";
    const dest = await save({ defaultPath, filters });
    if (!dest) return;
    ui.closeOverlay();
    await pdfExport.start(dest, choice, level);
  }
</script>

<Modal title={t("pdfChoice.title")} icon="download" width="min(540px, 94vw)" height="auto">
  <div class="pdf-choice">
    {#if answers}
      <p class="what faint">{t("pdfChoice.version")}</p>
      <div class="choices versions" role="radiogroup" aria-label={t("pdfChoice.version")}>
        {#each ["subject", "key", "both"] as const as v (v)}
          <label class="choice" class:active={which === v} data-version={v}>
            <input type="radio" name="pdf-version" value={v} bind:group={which} />
            <span class="name">{t(v === "subject" ? "pdfChoice.versionSubject" : v === "key" ? "pdfChoice.versionKey" : "pdfChoice.versionBoth")}</span>
            <span class="size">{#if v === "subject" && points !== null}{t("pdfChoice.points", { n: points })}{/if}</span>
            {#if v === "both"}<span class="hint faint">{t("pdfChoice.versionBothHint", { subject: named("subject"), key: named("key") })}</span>{/if}
          </label>
        {/each}
      </div>
    {/if}
    {#if pictures?.pictures}
      <p class="what faint">{plural(pictures.pictures, "pdfChoice.picturesOne", "pdfChoice.picturesMany")} · {sizeLabel(pictures.original, lang)}</p>
    {/if}
    <div class="choices" role="radiogroup" aria-label={t("pdfChoice.title")} hidden={!pictures?.pictures}>
      {#each KINDS as of (of)}
        {@const size = about(of)}
        <label class="choice" class:active={kind === of} data-kind={of}>
          <input type="radio" name="pdf-choice" value={of} bind:group={kind} />
          <span class="name">
            {t(`pdfChoice.${of}`)}
            {#if of === "limit"}
              <input class="input small limit" inputmode="decimal" aria-label={t("pdfChoice.limit")} bind:value={limit} onfocus={() => (kind = "limit")} />
              <span class="unit">{lang === "fr" ? "Mo" : "MB"}</span>
            {/if}
          </span>
          <span class="size" class:over={of === "limit" && reach?.within === false}>
            {#if size !== null}
              {t(of === "original" ? "pdfChoice.exact" : of === "limit" && reach?.within === false ? "pdfChoice.best" : "pdfChoice.about", { size: sizeLabel(size, lang) })}
            {:else if of !== "original" && weighing}
              <span class="spinner"></span>
            {/if}
          </span>
          {#if of !== "limit"}<span class="hint faint">{t(`pdfChoice.${of}Hint`)}</span>{/if}
        </label>
      {/each}
    </div>
    <div class="archive" class:active={archive}>
      <label class="check"><input type="checkbox" bind:checked={archive} />{t("pdfChoice.archive")}</label>
      {#if archive}
        <select class="select" bind:value={standard} aria-label={t("pdfChoice.archiveLevel")}>
          {#each STANDARDS as s (s)}<option value={s}>{t(`pdfa.${s}`)}</option>{/each}
        </select>
        <span class="hint faint">{t("pdfChoice.archiveHint")}</span>
      {/if}
    </div>
    {#if pictures?.pictures}<p class="note faint"><Icon name="shield" size={13} />{t("pdfChoice.note")}</p>{/if}
    <div class="buttons">
      <button class="btn" onclick={() => ui.closeOverlay()}>{t("common.cancel")}</button>
      <button class="btn primary" disabled={!ready} onclick={choose}><Icon name="download" size={14} />{t("pdfChoice.export")}</button>
    </div>
  </div>
</Modal>

<style>
  .pdf-choice {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px 18px 14px;
  }
  .what,
  .note {
    margin: 0;
    font-size: 12px;
  }
  .note {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .archive {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .archive.active {
    border-color: var(--accent);
  }
  .archive .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .archive .check input {
    accent-color: var(--accent);
  }
  .archive .hint {
    font-size: 11.5px;
  }
  .choices[hidden] {
    display: none;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px 10px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .choice:hover {
    background: var(--bg-hover);
  }
  .choice.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .choice input[type="radio"] {
    accent-color: var(--accent);
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .limit {
    width: 64px;
    text-align: right;
    font-weight: 400;
  }
  .unit {
    font-weight: 400;
    color: var(--text-muted);
  }
  .size {
    display: inline-flex;
    align-items: center;
    min-height: 18px;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .size.over {
    color: var(--warning);
  }
  .hint {
    grid-column: 2 / -1;
    font-size: 12px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
