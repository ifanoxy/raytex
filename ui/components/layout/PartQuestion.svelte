<script lang="ts">
  // Asked once per project, when a file that is a part of the document is
  // opened: while it is written, compile it alone or the whole document.
  // It takes no focus: typing goes on, and the whole document is compiled
  // until it is answered.
  import { t } from "$lib/i18n.svelte";
  import { build } from "$lib/state/build.svelte";
  import { basename } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  const WIDTH = 392;
  let left = $state(220);

  // Under the button that compiles.
  $effect(() => {
    if (!build.asking) return;
    const place = () => {
      const r = document.querySelector(".toolbar .build")?.getBoundingClientRect();
      if (r) left = Math.max(12, Math.min(r.left, window.innerWidth - WIDTH - 12));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  });
</script>

{#if build.asking && build.part}
  {@const part = build.part}
  {@const title = t("part.title", { file: basename(part.file), root: basename(part.root) })}
  <div class="part-question" style:left="{left}px" style:width="{WIDTH}px" role="dialog" aria-label={title}>
    <header>
      <Icon name="file-tex" size={15} />
      <span class="title ellipsis" {title}>{title}</span>
      <button class="close" onclick={() => build.askLater()} title={t("part.later")} aria-label={t("part.later")}>
        <Icon name="x" size={14} />
      </button>
    </header>
    <p class="question">{t("part.question")}</p>
    <div class="choices">
      <button class="choice" onclick={() => build.setPartChoice("file")}>
        <Icon name="bolt" size={16} />
        <strong>{t("part.file")}</strong>
        <span>{t("part.fileHint")}</span>
      </button>
      <button class="choice" onclick={() => build.setPartChoice("document")}>
        <Icon name="book" size={16} />
        <strong>{t("part.document")}</strong>
        <span>{t("part.documentHint")}</span>
      </button>
    </div>
    <p class="foot">{t("part.changeLater")}</p>
  </div>
{/if}

<style>
  .part-question {
    position: fixed;
    top: calc(var(--toolbar-height) + 6px);
    z-index: 400;
    padding: 12px 14px 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
    animation: arrive 0.18s var(--ease);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent);
  }
  .title {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
  }
  .close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-faint);
    cursor: pointer;
  }
  .close:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .question {
    margin: 6px 0 10px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 11px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--accent);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s;
  }
  .choice:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .choice strong {
    font-size: 13px;
    color: var(--text);
  }
  .choice span {
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .foot {
    margin: 8px 0 0;
    font-size: 11.5px;
    color: var(--text-faint);
  }
</style>
