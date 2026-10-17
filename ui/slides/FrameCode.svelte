<script lang="ts">
  // The LaTeX of the slide chosen, written as in the editor (colours,
  // completion, brackets closed): what is typed is given back after a
  // pause; what changes elsewhere is shown when the field is not being
  // typed in.
  import { onDestroy, onMount } from "svelte";
  import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { latexCompletion } from "$lib/editor/completion";
  import { docPath } from "$lib/editor/context";
  import { latex } from "$lib/editor/latex";
  import { tooltipTheme } from "$lib/editor/theme";

  let { text, path, onchange }: { text: string; path: string; onchange: (text: string) => void } = $props();

  let host = $state<HTMLElement | null>(null);
  let view: EditorView | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    view = new EditorView({
      parent: host!,
      state: EditorState.create({
        doc: text,
        extensions: [
          latex(),
          docPath.of(path),
          latexCompletion(),
          closeBrackets(),
          history(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || !u.transactions.some((tr) => tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("undo") || tr.isUserEvent("redo") || tr.isUserEvent("move"))) return;
            clearTimeout(timer);
            const now = u.state.doc.toString();
            timer = setTimeout(() => onchange(now), 450);
          }),
          tooltipTheme,
          EditorView.theme({
            "&": { height: "100%", background: "var(--bg-input)", color: "var(--text)", fontSize: "12.5px" },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": { fontFamily: "var(--font-mono)", fontVariantLigatures: "none", lineHeight: "1.55" },
            ".cm-content": { padding: "8px 10px", caretColor: "var(--accent)" },
          }),
        ],
      }),
    });
  });

  // What changed elsewhere, shown when the field is not being typed in.
  $effect(() => {
    const next = text;
    if (!view || view.hasFocus || view.state.doc.toString() === next) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  });

  onDestroy(() => {
    clearTimeout(timer);
    view?.destroy();
  });
</script>

<div class="frame-code" bind:this={host}></div>

<style>
  .frame-code {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .frame-code :global(.cm-editor) {
    height: 100%;
  }
</style>
