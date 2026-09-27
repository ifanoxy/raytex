<script lang="ts">
  // Sidebar: shows the selected view.
  import { ui } from "$lib/state/ui.svelte";
  import FileTree from "../sidebar/FileTree.svelte";
  import Outline from "../sidebar/Outline.svelte";
  import Packages from "../sidebar/Packages.svelte";
  import Search from "../sidebar/Search.svelte";
  import Snippets from "../sidebar/Snippets.svelte";
  import Symbols from "../sidebar/Symbols.svelte";
  import Templates from "../sidebar/Templates.svelte";
</script>

{#if ui.sidebar === "files"}
  <FileTree />
{:else if ui.sidebar === "templates"}
  <Templates />
{:else if ui.sidebar === "outline"}
  <Outline />
{:else if ui.sidebar === "search"}
  <Search />
{:else if ui.sidebar === "symbols"}
  <Symbols />
{:else if ui.sidebar === "snippets"}
  <Snippets />
{:else if ui.sidebar === "packages"}
  <Packages />
{/if}
