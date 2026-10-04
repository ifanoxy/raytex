<script lang="ts">
  // The command studio: a new command (or environment) is made from a few
  // fields, and tried in a small document compiled with the preamble of
  // the project, before it is added. A command of the project is tried the
  // same way.
  import type { CommandDraft, CommandSpec, CustomCommand, CustomKind } from "$lib/commands";
  import { signature } from "$lib/commands";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { PreviewOutcome } from "$lib/types";
  import { basename, debounce } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const request = ui.commandRequest;
  const existing: CustomCommand | null = request.test ?? null;
  const path = editor.active ?? project.info?.main ?? null;

  const KINDS: { id: CustomKind; label: "commands.kind.command" | "commands.kind.operator" | "commands.kind.environment" | "commands.kind.theorem" }[] = [
    { id: "command", label: "commands.kind.command" },
    { id: "operator", label: "commands.kind.operator" },
    { id: "environment", label: "commands.kind.environment" },
    { id: "theorem", label: "commands.kind.theorem" },
  ];

  // ------------------------------------------------------- what is defined

  let kind = $state<CustomKind>(request.create?.kind ?? "command");
  let name = $state(request.create?.name ?? "");
  let args = $state(request.create?.args ?? 0);
  let optional = $state(request.create?.default != null);
  let fallback = $state(request.create?.default ?? "");
  let body = $state(request.create?.body ?? "");
  let end = $state(request.create?.end ?? "");
  let draft = $state<CommandDraft | null>(null);

  const hasArgs = $derived(kind === "command" || kind === "environment");
  const spec = $derived<CommandSpec>({
    kind,
    name,
    args: hasArgs ? args : 0,
    default: hasArgs && optional && args > 0 ? fallback : null,
    body,
    end: kind === "environment" ? end : "",
  });

  let drafting = 0;
  $effect(() => {
    if (existing || !path) return;
    const s = spec;
    const my = ++drafting;
    void ipc
      .draftCommand(path, s)
      .then((d) => {
        if (my === drafting) draft = d;
      })
      .catch(() => {
        if (my === drafting) draft = null;
      });
  });

  // A name was typed with its backslash, or pasted with spaces.
  function cleanName() {
    name = name.trim().replace(/^\\+/, "");
  }

  const ready = $derived(!!draft && draft.problems.length === 0);
  const bodyLabel = $derived(
    kind === "operator" ? t("commands.fieldOperator") : kind === "theorem" ? t("commands.fieldTitle") : kind === "environment" ? t("commands.fieldBegin") : t("commands.fieldBody"),
  );
  const bodyPlaceholder = $derived(
    kind === "operator" ? "argmax" : kind === "theorem" ? t("commands.placeholderTitle") : kind === "environment" ? "\\begin{center}\\textbf{#1}\\par" : "\\left\\lVert #1 \\right\\rVert",
  );

  // ------------------------------------------------------------ the trial

  /** What the trial compiles; follows the example of the definition until it is edited. */
  let trial = $state(existing?.sample ?? "");
  let edited = $state(false);
  let outcome = $state<PreviewOutcome | null>(null);
  let compiling = $state(false);
  let revision = $state(0);
  let failure = $state<string | null>(null);

  $effect(() => {
    if (!existing && draft && !edited) trial = draft.sample;
  });

  /** What the preamble of the trial adds to the one of the project. */
  const extra = $derived(existing ? (existing.inPreamble ? "" : `${existing.source}\n`) : ready && draft ? `${draft.code}\n` : null);
  const packages = $derived(existing ? [] : (draft?.packages ?? []));

  const schedule = debounce(() => void compile(), 450);
  let running = 0;

  $effect(() => {
    void trial;
    void extra;
    void packages;
    schedule();
  });

  async function compile() {
    const code = extra;
    const text = trial.trim();
    if (!path || code === null || !text) {
      outcome = null;
      failure = null;
      return;
    }
    const my = ++running;
    compiling = true;
    try {
      const result = await ipc.previewSnippet({
        path,
        job: "command",
        classOptions: "border=8pt,varwidth=12cm",
        projectPreamble: true,
        packages,
        extra: code,
        body: text,
      });
      if (my !== running) return;
      outcome = result;
      failure = null;
      revision++;
    } catch (e) {
      if (my !== running) return;
      outcome = null;
      failure = String(e);
    } finally {
      if (my === running) compiling = false;
    }
  }

  const error = $derived(outcome?.diagnostics.find((d) => d.severity === "error") ?? null);

  // ---------------------------------------------------------------- apply

  let adding = $state(false);

  async function add(insert: boolean) {
    const d = draft;
    if (!d || !ready || adding) return;
    adding = true;
    try {
      const root = await editor.addDefinition(d.code, d.packages, path);
      if (!root) {
        ui.toast("warning", t("commands.noPreamble"));
        return;
      }
      ui.commandsRevision++;
      ui.toast("success", t("commands.added", { name: kind === "command" || kind === "operator" ? `\\${d.name}` : d.name, file: basename(root) }));
      ui.closeOverlay();
      if (insert) use(d.usage, d.math, kind === "environment" || kind === "theorem");
      editor.focus();
    } finally {
      adding = false;
    }
  }

  function use(usage: string, math: boolean, block: boolean) {
    if (math) editor.insertMath(usage);
    else editor.insertSnippet(usage, undefined, { block });
  }

  function insertExisting() {
    if (!existing) return;
    ui.closeOverlay();
    use(existing.usage, existing.math, existing.kind === "environment" || existing.kind === "theorem");
    editor.focus();
  }

  function goToDefinition() {
    if (!existing) return;
    ui.closeOverlay();
    void editor.openLocation(existing.location);
  }
</script>

<Modal title={existing ? t("commands.titleTry", { name: signature(existing) }) : t("commands.titleNew")} icon="macro" width="min(1080px, 95vw)" height="min(720px, 92vh)">
  <div class="studio">
    <section class="left">
      {#if existing}
        <h3>{t("commands.definition")}</h3>
        <pre class="code selectable">{existing.source}</pre>
        <p class="where faint">
          {t("commands.definedIn", { file: basename(existing.location.file), line: existing.location.range.start.line + 1 })}
          · {t("commands.usesTitle", { n: existing.uses })}
        </p>
        <p class="tip faint">{t("commands.tryTip")}</p>
        <div class="actions">
          <button class="btn" onclick={goToDefinition}><Icon name="edit" size={14} />{t("commands.edit")}</button>
          <button class="btn primary" onclick={insertExisting}><Icon name="plus" size={14} />{t("commands.insert")}</button>
        </div>
      {:else}
        <div class="kinds" role="radiogroup" aria-label={t("commands.kindLabel")}>
          {#each KINDS as k (k.id)}
            <button class="kind" class:active={kind === k.id} role="radio" aria-checked={kind === k.id} onclick={() => (kind = k.id)}>{t(k.label)}</button>
          {/each}
        </div>
        <p class="tip faint">{t(`commands.about.${kind}`)}</p>

        <label class="field">
          <span>{t("commands.fieldName")}</span>
          <span class="name-input">
            {#if kind === "command" || kind === "operator"}<span class="slash mono">\</span>{/if}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="input mono" bind:value={name} onblur={cleanName} placeholder={kind === "command" ? "norme" : kind === "operator" ? "argmax" : kind === "theorem" ? "lemme" : "encadre"} spellcheck="false" autocomplete="off" autofocus />
          </span>
        </label>

        {#if hasArgs}
          <div class="field">
            <span>{t("commands.fieldArgs")}</span>
            <div class="args">
              <button class="icon-btn" aria-label={t("commands.fewerArgs")} disabled={args <= 0} onclick={() => (args = Math.max(0, args - 1))}><Icon name="minus" size={14} /></button>
              <strong class="count">{args}</strong>
              <button class="icon-btn" aria-label={t("commands.moreArgs")} disabled={args >= 9} onclick={() => (args = Math.min(9, args + 1))}><Icon name="plus" size={14} /></button>
              {#if args > 0}
                <label class="optional">
                  <input type="checkbox" bind:checked={optional} />
                  {t("commands.optional")}
                </label>
                {#if optional}
                  <input class="input small mono default" bind:value={fallback} placeholder={t("commands.defaultValue")} spellcheck="false" />
                {/if}
              {/if}
            </div>
          </div>
        {/if}

        <label class="field grow">
          <span>{bodyLabel}{#if hasArgs && args > 0}<em class="faint"> · {args === 1 ? t("commands.argHint") : t("commands.argsHint", { last: `#${args}` })}</em>{/if}</span>
          <textarea class="input mono" bind:value={body} placeholder={bodyPlaceholder} spellcheck="false" rows="4"></textarea>
        </label>
        {#if kind === "environment"}
          <label class="field">
            <span>{t("commands.fieldEnd")}</span>
            <textarea class="input mono" bind:value={end} placeholder={"\\end{center}"} spellcheck="false" rows="2"></textarea>
          </label>
        {/if}

        {#if draft}
          {#each draft.problems as p}
            <div class="note problem"><Icon name="info" size={13} /><span>{p}</span></div>
          {/each}
          {#each draft.notes as n}
            <div class="note"><Icon name="lightbulb" size={13} /><span>{n}</span></div>
          {/each}
          {#if ready}
            <pre class="code selectable">{draft.code}</pre>
          {/if}
        {/if}

        <div class="actions">
          <button class="btn" disabled={!ready || adding} onclick={() => add(false)}>{t("commands.add")}</button>
          <button class="btn primary" disabled={!ready || adding} onclick={() => add(true)}><Icon name="plus" size={14} />{t("commands.addAndInsert")}</button>
        </div>
      {/if}
    </section>

    <section class="right">
      <h3>{t("commands.trial")}</h3>
      <textarea class="input mono trial" bind:value={trial} oninput={() => (edited = true)} placeholder={t("commands.trialPlaceholder")} spellcheck="false" rows="4"></textarea>
      <div class="preview-box">
        {#if outcome?.pdf}
          <PdfPreview pdf={outcome.pdf} {revision} maxScale={2.2} />
        {:else if !compiling}
          <div class="empty">{extra === null ? t("commands.trialWaits") : failure ? failure : error ? "" : t("commands.trialEmpty")}</div>
        {/if}
        {#if compiling}<div class="busy"><span class="spinner"></span></div>{/if}
      </div>
      {#if error}
        <div class="error-box">
          <strong>{error.hint?.title ?? error.message}</strong>
          {#if error.hint?.advice}<span>{error.hint.advice}</span>{:else if error.hint?.explanation}<span>{error.hint.explanation}</span>{/if}
          {#if error.hint && error.hint.title !== error.message}<span class="mono faint">{error.message}</span>{/if}
        </div>
      {:else if outcome?.pdf}
        <div class="ok-line"><Icon name="check" size={13} />{t("commands.trialOk", { engine: outcome.engine })}</div>
      {/if}
    </section>
  </div>
</Modal>

<style>
  .studio {
    display: grid;
    grid-template-columns: minmax(320px, 5fr) minmax(320px, 6fr);
    height: 100%;
    min-height: 0;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 16px 18px;
    overflow: auto;
  }
  .right {
    border-left: 1px solid var(--border);
    background: var(--bg-panel);
  }
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 3px;
    border-radius: var(--radius);
    background: var(--bg-input);
    border: 1px solid var(--border);
  }
  .kind {
    padding: 6px 4px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .kind:hover {
    color: var(--text);
  }
  .kind.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .tip {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .field em {
    font-style: normal;
  }
  .field.grow textarea {
    min-height: 84px;
  }
  textarea {
    width: 100%;
    resize: vertical;
    line-height: 1.5;
    font-size: 12.5px;
  }
  .name-input {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .name-input .input {
    flex: 1;
    font-size: 13px;
  }
  .slash {
    font-size: 15px;
    color: var(--accent);
  }
  .args {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .count {
    min-width: 18px;
    text-align: center;
    font-size: 14px;
    color: var(--text);
  }
  .optional {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 10px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .default {
    width: 130px;
  }
  .code {
    margin: 0;
    padding: 9px 11px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
  }
  .where {
    margin: 0;
    font-size: 11.5px;
  }
  .note {
    display: flex;
    gap: 7px;
    align-items: flex-start;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .note :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }
  .note.problem {
    color: var(--error);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: auto;
    padding-top: 6px;
  }
  .trial {
    flex-shrink: 0;
  }
  .preview-box {
    position: relative;
    flex: 1;
    min-height: 160px;
    display: grid;
    place-items: center;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: #fff;
    overflow: auto;
  }
  .preview-box .empty {
    padding: 0 20px;
    text-align: center;
    color: #6b7280;
  }
  .busy {
    position: absolute;
    top: 8px;
    right: 8px;
  }
  .error-box {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 11px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--error) 12%, transparent);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text);
  }
  .error-box strong {
    color: var(--error);
  }
  .ok-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--success);
  }
</style>
