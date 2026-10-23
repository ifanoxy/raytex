<script lang="ts">
  // How the numbers of the document are written (Maths › Number
  // conventions): the French way or the English way, or as its language
  // goes. What is already written (plots, tables of variations, trees,
  // drawings, siunitx, the formulas of the text if asked) is written again
  // that way, one undoable change a file; what is inserted next follows.
  import { onMount } from "svelte";
  import { plural, t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { added, chosenConvention, type Convention, EXAMPLES, isNothing, languageConvention, nothingRewritten, type Rewritten, rewrite, withChoice } from "$lib/numbers";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  type Choice = "auto" | Convention;
  const CHOICES: Choice[] = ["auto", "french", "english"];

  const from = editor.active ?? project.info?.main ?? null;
  /** The files of the document, their text as the editor has it; the root first. */
  let files = $state<{ path: string; text: string }[]>([]);
  let choice = $state<Choice>("auto");
  let text = $state(false);
  let ready = $state(false);
  let busy = $state(false);

  onMount(async () => {
    if (!from) return;
    const root = (await editor.rootOf(from)) ?? from;
    const paths = await ipc.documentFiles(root).catch(() => [root]);
    const read: { path: string; text: string }[] = [];
    for (const path of paths.length ? paths : [root]) {
      const open = editor.textOf(path);
      const found = open ?? (await ipc.readTextFile(path).then((f) => f.text).catch(() => null));
      if (found !== null) read.push({ path, text: found });
    }
    files = read;
    choice = (read[0] && chosenConvention(read[0].text)) ?? "auto";
    ready = true;
  });

  const rootText = $derived(files[0]?.text ?? "");
  const byLanguage = $derived(languageConvention(rootText));
  const way = $derived<Convention>(choice === "auto" ? byLanguage : choice);
  /** Each file written that way, and what changed. */
  const plan = $derived(files.map((f) => ({ ...f, ...rewrite(f.text, way, { text }) })));
  const done = $derived(plan.reduce((sum, p) => added(sum, p.done), nothingRewritten()));
  /** Only the formulas of the text, to say how many the box would change. */
  const textFormulas = $derived(files.reduce((n, f) => n + rewrite(f.text, way, { text: true }).done.formulas, 0));

  function said(r: Rewritten): string[] {
    const out: string[] = [];
    if (r.plots) out.push(plural(r.plots, "numbers.plotsOne", "numbers.plotsMany"));
    if (r.tables) out.push(plural(r.tables, "numbers.tablesOne", "numbers.tablesMany"));
    if (r.trees) out.push(plural(r.trees, "numbers.treesOne", "numbers.treesMany"));
    if (r.drawings) out.push(plural(r.drawings, "numbers.drawingsOne", "numbers.drawingsMany"));
    if (r.formulas) out.push(plural(r.formulas, "numbers.formulasOne", "numbers.formulasMany"));
    if (r.siunitx) out.push(t("numbers.siunitx"));
    return out;
  }

  async function apply() {
    if (busy || !files.length) return;
    busy = true;
    try {
      const mark = choice === "auto" ? null : choice;
      for (const [i, f] of files.entries()) {
        const root = i === 0;
        // Only the files that change are opened (in the background, to be undone like any change).
        if (rewrite(f.text, way, { text }).text === f.text && !(root && withChoice(f.text, mark) !== f.text)) continue;
        // Written again from the text of the moment (it may have changed since the window opened).
        await editor.rewrite(f.path, (now) => {
          const again = rewrite(now, way, { text }).text;
          const out = root ? withChoice(again, mark) : again;
          return out === now ? null : out;
        });
      }
      const what = said(done);
      const how = t(way === "french" ? "numbers.wayFrench" : "numbers.wayEnglish");
      ui.toast("success", what.length ? t("numbers.doneWith", { way: how, what: what.join(", ") }) : t("numbers.done", { way: how }));
      ui.closeOverlay();
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={t("numbers.title")} icon="hash" width="min(520px, 94vw)" height="auto">
  <div class="numbers" data-ready={ready ? "yes" : "no"}>
    <div class="choices" role="radiogroup" aria-label={t("numbers.title")}>
      {#each CHOICES as of (of)}
        <label class="choice" class:active={choice === of} data-choice={of}>
          <input type="radio" name="numbers-way" value={of} bind:group={choice} />
          <span class="name">{t(of === "auto" ? "numbers.auto" : of === "french" ? "numbers.french" : "numbers.english")}</span>
          <span class="example">{EXAMPLES[of === "auto" ? byLanguage : of]}</span>
          <span class="hint faint">
            {t(of === "auto" ? (byLanguage === "french" ? "numbers.autoFrench" : "numbers.autoEnglish") : of === "french" ? "numbers.frenchHint" : "numbers.englishHint")}
          </span>
        </label>
      {/each}
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={text} data-text />
      <span>{t("numbers.text")}{#if textFormulas} · {plural(textFormulas, "numbers.formulasOne", "numbers.formulasMany")}{/if}</span>
    </label>
    <p class="hint faint">{t("numbers.textHint")}</p>
    <div class="again" data-nothing={isNothing(done) ? "yes" : "no"}>
      {#if !ready}
        <span class="spinner"></span>
      {:else if isNothing(done)}
        <p class="faint">{t("numbers.nothing")}</p>
      {:else}
        <p class="what faint">{t("numbers.again")}</p>
        <ul>
          {#each said(done) as line (line)}<li>{line}</li>{/each}
        </ul>
      {/if}
    </div>
    <div class="buttons">
      <button class="btn" onclick={() => ui.closeOverlay()}>{t("common.cancel")}</button>
      <button class="btn primary" disabled={!ready || busy} onclick={apply}><Icon name="check" size={14} />{t("numbers.apply")}</button>
    </div>
  </div>
</Modal>

<style>
  .numbers {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px 18px;
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
  .choice input[type="radio"],
  .check input {
    accent-color: var(--accent);
  }
  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .example {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .choice .hint {
    grid-column: 2 / -1;
  }
  .hint {
    margin: 0;
    font-size: 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .check + .hint {
    margin-top: -8px;
    padding-left: 24px;
  }
  .again {
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px;
  }
  .again p {
    margin: 0;
  }
  .again .what {
    font-size: 12px;
    margin-bottom: 4px;
  }
  .again ul {
    margin: 0;
    padding-left: 18px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
