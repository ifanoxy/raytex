<script lang="ts">
  // Command palette and quick open. Prefixes: `>` commands, `:` line,
  // `@` sections of the document, `#` labels; no prefix: project files.
  import { actions, isAvailable, keyFor, runAction } from "$lib/actions";
  import { fuzzy, highlight } from "$lib/fuzzy";
  import { t } from "$lib/i18n.svelte";
  import { editor } from "$lib/state/editor.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { FileNode } from "$lib/types";
  import { fileKind, prettyKey, relative, samePath } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  interface Entry {
    id: string;
    label: string;
    detail?: string;
    icon: string;
    keys?: string;
    indices: number[];
    score: number;
    run: () => unknown;
  }

  const RECENT_KEY = "labaguetex.recentCommands";
  let recent: string[] = [];
  try {
    recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    recent = [];
  }

  let query = $state(ui.paletteMode === "commands" ? ">" : "");
  let selected = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let list = $state<HTMLElement | null>(null);

  $effect(() => {
    input?.focus();
  });

  function flatten(nodes: FileNode[], out: string[] = []): string[] {
    for (const n of nodes) {
      if (n.dir) flatten(n.children ?? [], out);
      else out.push(n.path);
    }
    return out;
  }

  const ICON_BY_KIND: Record<string, string> = { tex: "file-tex", bib: "file-bib", image: "image", pdf: "pdf" };

  const entries = $derived.by((): Entry[] => {
    const q = query;
    if (q.startsWith(">")) {
      const text = q.slice(1).trim();
      const out: Entry[] = [];
      for (const a of actions) {
        if (!isAvailable(a)) continue;
        const label = t(a.title);
        const category = t(`category.${a.category}` as never);
        const m = fuzzy(text, label) ?? fuzzy(text, `${category} ${label}`);
        if (!m) continue;
        const r = recent.indexOf(a.id);
        out.push({
          id: a.id,
          label,
          detail: category,
          icon: a.icon ?? "command",
          keys: keyFor(a.id),
          indices: fuzzy(text, label)?.indices ?? [],
          score: m.score + (r >= 0 ? (text ? 30 : 1000) - r : 0),
          run: () => {
            recent = [a.id, ...recent.filter((x) => x !== a.id)].slice(0, 12);
            try {
              localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
            } catch {
              /* not remembered */
            }
            return runAction(a.id);
          },
        });
      }
      return out.sort((a, b) => b.score - a.score).slice(0, 80);
    }
    if (q.startsWith(":")) {
      const n = parseInt(q.slice(1), 10);
      if (!editor.active || !editor.view) return [];
      const lines = editor.view.state.doc.lines;
      return [
        {
          id: "line",
          label: Number.isFinite(n) ? t("palette.goToLine", { n: Math.min(n, lines) }) : t("palette.typeLine", { n: lines }),
          icon: "arrow-right",
          indices: [],
          score: 0,
          run: () => Number.isFinite(n) && editor.reveal(editor.active!, null, n),
        },
      ];
    }
    if (q.startsWith("@") || q.startsWith("#")) {
      const text = q.slice(1).trim();
      const s = project.structure;
      if (!s) return [];
      const items =
        q[0] === "@"
          ? s.outline.map((o) => ({ label: `${o.number ? o.number + " " : ""}${o.title}`, detail: o.kind, loc: o.location, icon: "hash" }))
          : s.labels.map((l) => ({ label: l.name, detail: l.resolved?.number ?? l.context ?? l.kind.type, loc: l.location, icon: "link" }));
      const out: Entry[] = [];
      items.forEach((it, i) => {
        const m = fuzzy(text, it.label);
        if (m) out.push({ id: `${q[0]}${i}`, label: it.label, detail: it.detail, icon: it.icon, indices: m.indices, score: text ? m.score : -i, run: () => editor.openLocation(it.loc) });
      });
      return out.sort((a, b) => b.score - a.score).slice(0, 100);
    }
    const root = project.info?.root ?? "";
    const out: Entry[] = [];
    for (const path of flatten(project.tree)) {
      const rel = relative(root, path);
      const m = fuzzy(q.trim(), rel);
      if (!m) continue;
      const open = editor.tabs.some((tab) => samePath(tab.path, path));
      out.push({
        id: path,
        label: rel,
        icon: ICON_BY_KIND[fileKind(path)] ?? "file",
        detail: samePath(path, project.info?.main) ? t("files.main") : open ? t("palette.open") : undefined,
        indices: m.indices,
        score: m.score + (open ? 20 : 0) + (samePath(path, project.info?.main) ? 10 : 0),
        run: () => editor.open(path),
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 80);
  });

  $effect(() => {
    void entries;
    selected = 0;
  });

  function choose(i: number) {
    const e = entries[i];
    if (!e) return;
    ui.closeOverlay();
    void e.run();
  }

  function key(e: KeyboardEvent) {
    if (e.key === "ArrowDown") selected = Math.min(entries.length - 1, selected + 1);
    else if (e.key === "ArrowUp") selected = Math.max(0, selected - 1);
    else if (e.key === "PageDown") selected = Math.min(entries.length - 1, selected + 10);
    else if (e.key === "PageUp") selected = Math.max(0, selected - 10);
    else if (e.key === "Enter") choose(selected);
    else if (e.key === "Escape") {
      ui.closeOverlay();
      editor.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
    requestAnimationFrame(() => list?.querySelector(".selected")?.scrollIntoView({ block: "nearest" }));
  }

  const placeholder = $derived(
    query.startsWith(">") ? t("palette.commandsPlaceholder") : query.startsWith(":") ? t("palette.linePlaceholder") : t("palette.filesPlaceholder"),
  );
</script>

<div class="overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && ui.closeOverlay()}>
  <div class="palette" role="dialog" aria-modal="true" aria-label={t("action.palette")}>
    <div class="search">
      <Icon name={query.startsWith(">") ? "command" : "search"} />
      <input bind:this={input} bind:value={query} {placeholder} spellcheck="false" onkeydown={key} aria-controls="palette-list" />
    </div>
    <div class="hints">
      <span><kbd>&gt;</kbd> {t("palette.hintCommands")}</span>
      <span><kbd>:</kbd> {t("palette.hintLine")}</span>
      <span><kbd>@</kbd> {t("palette.hintSections")}</span>
      <span><kbd>#</kbd> {t("palette.hintLabels")}</span>
    </div>
    <div class="list" id="palette-list" role="listbox" bind:this={list}>
      {#each entries as e, i (e.id)}
        <button class="entry" class:selected={i === selected} role="option" aria-selected={i === selected} onclick={() => choose(i)} onpointermove={() => (selected = i)}>
          <Icon name={e.icon} size={15} />
          <span class="label ellipsis">
            {#each highlight(e.label, e.indices) as part}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
          </span>
          {#if e.detail}<span class="detail ellipsis">{e.detail}</span>{/if}
          {#if e.keys}<kbd>{prettyKey(e.keys)}</kbd>{/if}
        </button>
      {:else}
        <div class="empty">{t("palette.noResults")}</div>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 600;
    background: color-mix(in srgb, var(--overlay) 55%, transparent);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
  }
  .palette {
    width: min(640px, 92vw);
    max-height: 64vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    animation: drop 0.12s var(--ease);
  }
  @keyframes drop {
    from {
      transform: translateY(-6px);
      opacity: 0;
    }
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 48px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
  }
  .search input {
    flex: 1;
    border: none;
    outline: none;
    background: none;
    font-size: 15px;
    color: var(--text);
  }
  .hints {
    display: flex;
    gap: 14px;
    padding: 6px 14px;
    font-size: 11px;
    color: var(--text-faint);
    border-bottom: 1px solid var(--border);
  }
  .list {
    overflow: auto;
    padding: 4px;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius);
    background: none;
    text-align: left;
    cursor: pointer;
    color: var(--text-muted);
  }
  .entry.selected {
    background: var(--accent-soft);
    color: var(--text);
  }
  .label {
    color: var(--text);
    flex-shrink: 1;
    min-width: 0;
  }
  .detail {
    flex: 1;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  mark {
    background: none;
    color: var(--accent);
    font-weight: 700;
  }
</style>
