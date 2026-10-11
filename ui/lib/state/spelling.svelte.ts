// The language the spelling of the document is checked in: the one chosen
// for the project, else the one the document gives to babel or polyglossia,
// else the language of the interface.

import { i18n } from "../i18n.svelte";
import * as ipc from "../ipc";
import { documentLanguage } from "../spelling";
import { debounce } from "../utils";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";

class SpellingStore {
  /** The language the document says it is written in; null when it does not say. */
  detected = $state<string | null>(null);

  /** The language chosen by hand for the project; null for the one of the document. */
  get chosen(): string | null {
    return project.info?.config.project.language || null;
  }

  /** The language given to the checker. */
  get language(): string {
    return this.chosen ?? this.detected ?? i18n.lang;
  }

  /** Reads the language of the document of the file being edited. */
  async refresh() {
    const root = await editor.rootOf().catch(() => null);
    if (!root) {
      this.detected = null;
      return;
    }
    const text = editor.textOf(root) ?? (await ipc.readTextFile(root).then((f) => f.text).catch(() => null));
    this.detected = text === null ? null : documentLanguage(text);
  }

  /** After a change in a document: once typing pauses. */
  refreshSoon = debounce(() => void this.refresh(), 800);

  /** Chooses the language of the project by hand (null: back to the one of the document). */
  async choose(tag: string | null) {
    await project.updateConfig((c) => (c.project.language = tag));
  }
}

export const spelling = new SpellingStore();

/** A language as it is called in the language of the interface: `fr` → "français". */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([i18n.lang], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
