<script lang="ts">
  // Probability trees: the events and the probability of each branch, laid
  // out as the tree grows (one line a branch), the one left out of two
  // worked out, each node checked to add up to 1, the probability of each
  // path at its end if asked, and the tree LaTeX draws under it. A tree
  // written here is opened again from its chip.
  import { onMount } from "svelte";
  import { keyLang } from "$lib/answerkey";
  import { conventionOf } from "$lib/numbers";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { addPackages, preambleEnd } from "$lib/preamble";
  import { addLevel, branchProbs, contrary, emptyTree, headerFrom, node, rows, sameEvents, type Tree, type TreeNode, treeCode, wrongSum } from "$lib/probtree";
  import { editor } from "$lib/state/editor.svelte";
  import { media, type TreeEdit } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { PreviewOutcome } from "$lib/types";
  import { debounce } from "$lib/utils";
  import FoldSection from "../common/FoldSection.svelte";
  import Icon from "../common/Icon.svelte";
  import MathGlyph from "../common/MathGlyph.svelte";
  import Modal from "../common/Modal.svelte";
  import PdfPreview from "../common/PdfPreview.svelte";

  const path = editor.active ?? project.info?.main ?? null;

  let tree = $state<Tree>(emptyTree());
  let edit = $state<TreeEdit | null>(null);
  // The main document as it is open, at once (its language sets the decimal
  // comma), then the root of the file once it is known.
  let source = $state(editor.textOf(project.info?.main ?? "") ?? "");
  let advanced = $state(false);
  let inFigure = $state(false);
  let caption = $state("");
  let label = $state("fig:arbre");

  onMount(async () => {
    const request = media.treeRequest;
    media.treeRequest = null;
    // What is changed shows at once: nothing typed meanwhile is overwritten.
    if (request?.edit) {
      edit = request.edit;
      tree = request.edit.tree;
    }
    const found = path ? await editor.rootSource(path) : null;
    if (found) source = found.text;
  });

  /** Numbers written as the document asks (Maths › Number conventions), else as its language goes. */
  const comma = $derived(conventionOf(source) === "french");
  // The line above the picture, in the language of the document.
  const code = $derived(treeCode(tree, comma, keyLang(source, "en") === "fr"));
  const lines = $derived(rows(tree));

  // ------------------------------------------------------------ the tree

  /** Adds a branch to `n`: the contrary of its only one, else a new event. */
  function addBranch(n: TreeNode) {
    const only = n.children.length === 1 ? n.children[0].label : "";
    n.children.push(node(only ? contrary(only) : "", ""));
  }

  function remove(parent: TreeNode, n: TreeNode) {
    parent.children = parent.children.filter((c) => c.id !== n.id);
  }

  /** The probability shown in grey when none is typed: the one worked out from the other branch. */
  function workedOut(parent: TreeNode, index: number): string {
    return parent.children[index].prob.trim() ? "" : branchProbs(parent, comma)[index];
  }

  /** The last branch of a node: where what is wrong with its sum is said. */
  const lastOf = (parent: TreeNode, n: TreeNode) => parent.children[parent.children.length - 1]?.id === n.id;

  // ------------------------------------------------------------ preview

  let outcome = $state<PreviewOutcome | null>(null);
  let compiling = $state(false);
  let revision = $state(0);
  let failure = $state<string | null>(null);
  let running = 0;
  const schedule = debounce(() => void compile(), 500);
  $effect(() => {
    void code;
    schedule();
    // Closed before the preview was due: nothing is compiled for it.
    return () => schedule.cancel();
  });

  async function compile() {
    const body = code;
    if (!path) return;
    const my = ++running;
    compiling = true;
    try {
      const result = await ipc.previewSnippet({ path, job: "tree", classOptions: "tikz,border=6pt", projectPreamble: true, packages: ["tikz"], body });
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

  // ------------------------------------------------------------ writing

  let busy = $state(false);
  async function write() {
    if (busy || !path || !tree.root.children.length) return;
    busy = true;
    try {
      const picture = code;
      if (edit) {
        await editor.open(edit.path);
        // The line written above the picture goes with it (it was written twice).
        editor.replaceRange(edit.path, headerFrom(editor.textOf(edit.path) ?? "", edit.from), edit.to, picture);
      } else {
        const view = editor.view;
        if (!view || editor.activeTab?.kind !== "tex" || view.state.readOnly) {
          ui.toast("warning", t("image.noDocument"));
          return;
        }
        const body = inFigure
          ? `\\begin{figure}[htbp]\n\t\\centering\n${picture
              .split("\n")
              .map((l) => `\t${l}`)
              .join("\n")}\n\t\\caption{${caption.trim() || "…"}}\n\t\\label{${label.trim() || "fig:arbre"}}\n\\end{figure}`
          : picture;
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        const before = line.text.slice(0, head - line.from).trim() ? "\n" : "";
        const after = line.text.slice(head - line.from).trim() ? "\n" : "";
        editor.replaceRange(editor.active!, head, head, `${before}${body}\n${after}`);
      }
      await editor.transformRoot((text) => addPackages(text, [{ name: "tikz" }]), path);
      ui.toast("success", t(edit ? "tree.updated" : "tree.inserted"));
      if (ui.overlay === "tree") ui.closeOverlay();
      editor.focus();
    } finally {
      busy = false;
    }
  }

  function shortcut(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void write();
    }
  }

  const noPreamble = $derived(!!source && preambleEnd(source) >= source.length);
</script>

<svelte:window onkeydown={shortcut} />

<Modal title={edit ? t("tree.editTitle") : t("tree.title")} icon="tree" width="min(1180px, 96vw)" height="min(800px, 94vh)">
  <div class="studio">
    {#if noPreamble}
      <div class="nothing"><Icon name="alert-triangle" size={22} /><span>{t("layout.noPreamble")}</span></div>
    {:else}
      <section class="main">
        <div class="branches" role="tree" aria-label={t("tree.title")}>
          <div class="branch start">
            <span class="dot" aria-hidden="true"></span>
            <span class="faint">{t("tree.start")}</span>
            <button class="icon-btn small" title={t("tree.addBranch")} aria-label={t("tree.addBranch")} onclick={() => addBranch(tree.root)}><Icon name="plus" size={13} /></button>
          </div>
          {#each lines as { node: n, parent, depth }, i (n.id)}
            {@const index = parent.children.indexOf(n)}
            <div class="branch" role="treeitem" aria-selected="false" style:--depth={depth} data-depth={depth}>
              <span class="joint" aria-hidden="true"></span>
              <input class="input mono event" bind:value={n.label} placeholder="A" spellcheck="false" aria-label={t("tree.event")} />
              <span class="drawn" aria-hidden="true">{#if n.label.trim()}<MathGlyph latex={n.label} />{/if}</span>
              <button class="icon-btn small bar" class:on={n.label.trim().startsWith("\\overline")} title={t("tree.contrary")} aria-label={t("tree.contrary")} onclick={() => (n.label = contrary(n.label || "A"))}>Ā</button>
              <span class="faint p">p =</span>
              <input class="input mono prob" bind:value={n.prob} placeholder={workedOut(parent, index) || (comma ? "0,5" : "0.5")} spellcheck="false" aria-label={t("tree.prob")} data-row={i} />
              <span class="spacer"></span>
              <button class="icon-btn small" title={t("tree.addBranch")} aria-label={t("tree.addBranch")} onclick={() => addBranch(n)}><Icon name="plus" size={13} /></button>
              <button class="icon-btn small" title={t("tree.remove")} aria-label={t("tree.remove")} onclick={() => remove(parent, n)}><Icon name="trash" size={13} /></button>
            </div>
            {#if lastOf(parent, n) && wrongSum(parent, comma)}
              <p class="sum" style:--depth={depth} data-sum>{t("tree.sum", { event: parent === tree.root ? t("tree.start").toLowerCase() : `${parent.label}`, sum: wrongSum(parent, comma) ?? "" })}</p>
            {/if}
          {/each}
        </div>
        <div class="adds">
          <button class="btn small" onclick={() => addLevel(tree)}><Icon name="plus" size={14} />{t("tree.addLevel")}</button>
          <button class="btn small" onclick={() => sameEvents(tree)}>{t("tree.same")}</button>
          <span class="spacer"></span>
          <span class="faint small">{t("tree.howTo")}</span>
        </div>
        <div class="preview">
          <div class="preview-bar">
            <span class="section-title">{t("tikz.latexRendering")}</span>
            <div class="spacer"></div>
            {#if compiling}<span class="spinner"></span>{:else if error}<span class="status err" title={error.message}><Icon name="alert-circle" size={13} />{error.message.split("\n")[0].slice(0, 70)}</span>{/if}
          </div>
          {#if !failure}
            <PdfPreview pdf={outcome?.pdf ?? null} {revision} maxScale={2.5} whole />
          {:else}
            <p class="faint empty">{failure}</p>
          {/if}
        </div>
      </section>

      <aside class="side">
        <label class="check"><input type="checkbox" bind:checked={tree.products} />{t("tree.products")}</label>

        {#snippet more()}
          <label class="pair">
            <span>{t("tree.levelDistance")}</span>
            <input class="input small mono" type="number" min="1" max="8" step="0.1" bind:value={tree.levelDistance} />
            <span>cm</span>
          </label>
          <label class="pair">
            <span>{t("tree.leafDistance")}</span>
            <input class="input small mono" type="number" min="0.5" max="4" step="0.1" bind:value={tree.leafDistance} />
            <span>cm</span>
          </label>
        {/snippet}
        <FoldSection id="tree" title={t("tree.look")} bind:open={advanced} advanced={more}>
          <p class="hint">{t("tree.lookHint")}</p>
        </FoldSection>

        {#if !edit}
          <label class="check"><input type="checkbox" bind:checked={inFigure} />{t("tikz.wrapFigure")}</label>
          {#if inFigure}
            <input class="input" bind:value={caption} placeholder={t("image.caption")} aria-label={t("image.caption")} />
            <input class="input mono" bind:value={label} aria-label={t("image.label")} />
          {/if}
        {/if}
        <div class="spacer"></div>
        <button class="btn primary large" disabled={busy || !tree.root.children.length} onclick={write}>
          {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
          {edit ? t("image.update") : t("tree.insert")}
        </button>
      </aside>
    {/if}
  </div>
</Modal>

<style>
  .studio {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    height: 100%;
    min-height: 0;
  }
  .nothing {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-muted);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    padding: 14px 16px;
  }
  /* One line a branch, set in by its level, a joint drawn before it. */
  .branches {
    flex: 0 1 auto;
    max-height: 48%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
  }
  .branch {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: calc(var(--depth, 0) * 26px + 14px);
    min-height: 30px;
  }
  .branch.start {
    padding-left: 2px;
    font-size: 12px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .joint {
    width: 14px;
    height: 14px;
    margin-left: -8px;
    border-left: 1.5px solid var(--border-strong);
    border-bottom: 1.5px solid var(--border-strong);
    border-bottom-left-radius: 4px;
    transform: translateY(-6px);
  }
  .event {
    width: 140px;
  }
  .drawn {
    display: inline-flex;
    justify-content: center;
    min-width: 28px;
  }
  .prob {
    width: 92px;
  }
  .p {
    font-size: 12px;
  }
  .bar {
    width: 26px;
    font-size: 12px;
    font-weight: 600;
  }
  .bar.on {
    color: var(--accent);
  }
  .sum {
    margin: 0 0 4px;
    padding-left: calc(var(--depth, 0) * 26px + 20px);
    font-size: 11.5px;
    color: var(--warning);
  }
  .spacer {
    flex: 1;
  }
  .adds {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .small {
    font-size: 11.5px;
  }
  .preview {
    flex: 1;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .preview-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .status.err {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--error);
  }
  .empty {
    padding: 16px;
    font-size: 12px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-left: 1px solid var(--border);
    background: var(--bg-panel);
    overflow: auto;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    cursor: pointer;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 72px auto;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .hint {
    margin: 0;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .large {
    justify-content: center;
    height: 36px;
  }
</style>
