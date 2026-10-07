<script lang="ts">
  // A field for a TeX length: a number in the unit of the window (`2,5`),
  // or a length written in full (`1in`, `0.1\paperwidth`). What is typed is
  // given as it goes; the field is tidied when it is left.
  import { shownLength, toPt, typedLength, type Unit, validLength } from "$lib/layout";

  let {
    value,
    unit,
    label,
    placeholder = "",
    title = "",
    onchange,
  }: {
    /** The length as the document writes it (`2.5cm`), or "". */
    value: string;
    unit: Unit;
    label: string;
    /** What TeX uses when nothing is set, shown in grey. */
    placeholder?: string;
    title?: string;
    onchange: (length: string) => void;
  } = $props();

  let focused = $state(false);
  let text = $state("");

  // The field follows the document, except while it is being typed in.
  $effect(() => {
    const shown = shownLength(value, unit);
    if (!focused) text = shown;
  });

  /** The unit is written after a number, not after a length that has its own. */
  const plain = $derived(!text.trim() || toPt(typedLength(text, unit)) !== null);
  const invalid = $derived(!validLength(typedLength(text, unit)));

  function typed() {
    onchange(typedLength(text, unit));
  }
</script>

<label class="length" {title}>
  <span class="label">{label}</span>
  <span class="box" class:invalid>
    <input
      class="input small"
      bind:value={text}
      {placeholder}
      inputmode="decimal"
      spellcheck="false"
      autocomplete="off"
      aria-label={label}
      aria-invalid={invalid}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      oninput={typed}
    />
    {#if plain}<span class="unit faint">{unit}</span>{/if}
  </span>
</label>

<style>
  .length {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .box {
    position: relative;
    display: flex;
    align-items: center;
  }
  .input {
    width: 100%;
    min-width: 0;
    padding-right: 30px;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    position: absolute;
    right: 8px;
    font-size: 11px;
    pointer-events: none;
  }
  .invalid .input {
    border-color: var(--error);
  }
</style>
