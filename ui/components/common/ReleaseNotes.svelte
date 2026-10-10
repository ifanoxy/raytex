<script lang="ts">
  // What a version brings: its summary in a few points, and everything in
  // detail behind "See more" (with the versions before it, when given).
  import { i18n, t } from "$lib/i18n.svelte";
  import { noteParts, type Notes, type VersionNotes } from "$lib/whatsnew";
  import Icon from "./Icon.svelte";

  let {
    notes,
    earlier = [],
    expanded = $bindable(false),
  }: {
    notes: Notes;
    /** Older versions, listed after the details. */
    earlier?: VersionNotes[];
    expanded?: boolean;
  } = $props();

  const day = (date: string) => new Intl.DateTimeFormat(i18n.lang, { dateStyle: "long" }).format(new Date(`${date}T12:00:00`));
  const more = $derived(notes.details.length > 0 || earlier.length > 0);
</script>

{#snippet line(text: string)}
  {#each noteParts(text) as part, i (i)}{#if part.code}<code>{part.text}</code>{:else}{part.text}{/if}{/each}
{/snippet}

<div class="release-notes selectable">
  <ul class="points">
    {#each notes.points as point, i (i)}
      <li>{@render line(point)}</li>
    {/each}
  </ul>

  {#if more}
    <button class="more" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
      <Icon name={expanded ? "chevron-up" : "chevron-down"} size={13} />{expanded ? t("whatsnew.less") : t("whatsnew.more")}
    </button>
  {/if}

  {#if expanded}
    <div class="details">
      {#each notes.details as section (section.title)}
        <h4>{section.title}</h4>
        <ul>
          {#each section.items as item, i (i)}
            <li>{@render line(item)}</li>
          {/each}
        </ul>
      {/each}
      {#if earlier.length}
        <h4 class="earlier">{t("whatsnew.earlier")}</h4>
        {#each earlier as version (version.version)}
          <p class="version"><strong>RayTeX {version.version}</strong><span class="faint">{day(version.date)}</span></p>
          <ul>
            {#each version[i18n.lang].points as point, i (i)}
              <li>{@render line(point)}</li>
            {/each}
          </ul>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .release-notes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
    line-height: 1.55;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .points li::marker {
    color: var(--accent);
  }
  .more {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 4px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 12.5px;
    color: var(--accent);
    cursor: pointer;
  }
  .more:hover {
    background: var(--accent-soft);
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 12.5px;
    color: var(--text-muted);
  }
  h4 {
    margin: 6px 0 0;
    font-size: 12.5px;
    color: var(--text);
  }
  h4:first-child {
    margin-top: 0;
  }
  h4.earlier {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .version {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 4px 0 0;
    color: var(--text);
  }
  .version .faint {
    font-size: 11.5px;
  }
  code {
    padding: 0 4px;
    border-radius: 4px;
    background: var(--bg-active);
    font: 0.92em var(--font-mono);
  }
</style>
