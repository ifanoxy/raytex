// Fonts of the open document (main, sans-serif, monospace, math, extra
// fonts for passages), kept up to date for the formatting bar, and the
// actions of its font menu.

import { t } from "../i18n.svelte";
import { documentFonts, type DocumentFonts, extraFontUses, type FontSlot, type KnownFontPackage, removeExtraFont, resetSlot } from "../fonts";
import * as ipc from "../ipc";
import type { FontRole } from "../types";
import { debounce } from "../utils";
import { editor } from "./editor.svelte";
import { media } from "./media.svelte";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

class FontsStore {
  /** Fonts of the root document of the active file. */
  current = $state<DocumentFonts | null>(null);
  private known: KnownFontPackage[] = [];
  private loading: Promise<void> | null = null;

  constructor() {
    const soon = debounce(() => void this.refresh(), 300);
    editor.onDidSync(soon);
  }

  private async knownFonts(): Promise<KnownFontPackage[]> {
    this.loading ??= ipc
      .texFonts()
      .then((list) => {
        this.known = list.map((f) => ({ package: f.package, name: f.name, kind: f.kind, math: f.math }));
      })
      .catch(() => {});
    await this.loading;
    return this.known;
  }

  /** Reads the fonts of the root document again. */
  async refresh() {
    if (!project.info) {
      this.current = null;
      return;
    }
    const known = await this.knownFonts();
    const root = (await editor.rootOf().catch(() => null)) ?? project.info.main;
    if (!root) return;
    const text = editor.textOf(root) ?? (await ipc.readTextFile(root).then((f) => f.text).catch(() => ""));
    this.current = documentFonts(text, known);
  }

  /** Chooses the font of a slot (opens the font window on it). */
  choose(role: FontRole, command?: string) {
    media.openFonts(null, { role, command });
  }

  /** Back to the default font of a slot. */
  async reset(slot: FontSlot) {
    const known = await this.knownFonts();
    await editor.transformRoot((text) => resetSlot(text, slot, known, t("fonts.resetNote")));
    await this.refresh();
  }

  /** Removes an extra font (asks first when the text still uses it). */
  async removeExtra(command: string) {
    const root = (await editor.rootOf().catch(() => null)) ?? project.info?.main;
    const uses = root ? extraFontUses(editor.textOf(root) ?? "", command) : 0;
    if (uses) {
      const ok = await ui.confirm({
        title: t("fonts.removeExtraTitle", { cmd: `\\${command}` }),
        message: t("fonts.removeExtraUsed", { n: uses }),
        okLabel: t("common.delete"),
        danger: true,
      });
      if (!ok) return;
    }
    await editor.transformRoot((text) => removeExtraFont(text, command));
    await this.refresh();
  }

  /** Puts the selection in an extra font: `{\cmd …}`. */
  applyExtra(command: string): boolean {
    const view = editor.view;
    if (!view || editor.activeTab?.kind !== "tex") return false;
    return editor.insertSnippet(`{\\${command} \${1:\${SELECTION}}}`);
  }
}

export const fonts = new FontsStore();
