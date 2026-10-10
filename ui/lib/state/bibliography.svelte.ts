// The bibliography of the project: the entry being written in its form, and
// what the form does to the `.bib` files (through their documents, so that
// a change can be undone and is saved like any other).

import { type BibDraft, type BibItem, filled } from "../bibliography";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { basename, dirname } from "../utils";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

interface Editing {
  /** The file the entry is written in. */
  file: string;
  /** The `.bib` files of the project (empty: one is made). */
  files: string[];
  /** The key of the entry being changed; null for a new one. */
  replaces: string | null;
  /** The entry being changed, as the list has it. */
  item: BibItem | null;
  draft: BibDraft;
  /** The keys of the other entries. */
  taken: string[];
}

class BibliographyStore {
  /** Bumped when an entry is written: the list reads the project again. */
  revision = $state(0);
  /** The entry in the form; null when the form is closed. */
  editing = $state<Editing | null>(null);

  /** Opens the form on a new entry (empty, or read from what was pasted or fetched). */
  create(files: string[], taken: string[], draft: BibDraft = { kind: "article", key: "", fields: [] }) {
    this.editing = { file: files[0] ?? "", files, replaces: null, item: null, draft, taken };
  }

  /** Opens the form on an entry of the project. */
  edit(item: BibItem, files: string[], taken: string[]) {
    this.editing = {
      file: item.file,
      files,
      replaces: item.key,
      item,
      draft: { kind: item.kind, key: item.key, fields: item.fields.map((f) => ({ ...f })) },
      taken: taken.filter((k) => k !== item.key),
    };
  }

  close() {
    this.editing = null;
  }

  /** The `.bib` file of a project that has none yet: made next to the main file. */
  private async firstFile(): Promise<string | null> {
    const main = project.info?.main ?? editor.active;
    if (!main) return null;
    const path = `${dirname(main)}/references.bib`;
    try {
      return await ipc.createFile(path, "");
    } catch {
      return (await ipc.pathExists(path)) ? path : null;
    }
  }

  /**
   * Writes the entry of the form. Resolves with what kept it from being
   * written (`key`, `braces:<field>`), or null once it is.
   */
  async save(entry: BibDraft): Promise<string | null> {
    const e = this.editing;
    if (!e) return null;
    const file = e.file || (await this.firstFile());
    if (!file) return "file";
    const draft = { kind: entry.kind, key: entry.key.trim(), fields: filled(entry.fields) };
    let refused: string | null = null;
    const done = await editor.rewrite(file, async (text) => {
      try {
        return await ipc.bibWrite(text, e.replaces, draft);
      } catch (why) {
        refused = String(why);
        return null;
      }
    });
    if (refused) return refused;
    if (!done) return "file";
    this.editing = null;
    this.revision++;
    ui.toast("success", t("bib.saved", { key: draft.key, file: basename(file) }));
    return null;
  }

  /** Removes an entry from its file, once confirmed. */
  async remove(item: BibItem): Promise<boolean> {
    const ok = await ui.confirm({
      title: t("bib.deleteTitle", { key: item.key }),
      message: item.cited ? t("bib.deleteCited", { file: basename(item.file), n: item.cited }) : t("bib.deleteMessage", { file: basename(item.file) }),
      okLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return false;
    const done = await editor.rewrite(item.file, (text) => ipc.bibRemove(text, item.key));
    if (done) {
      if (this.editing?.replaces === item.key) this.editing = null;
      this.revision++;
      ui.toast("success", t("bib.deleted", { key: item.key }));
    }
    return done;
  }
}

export const bibliography = new BibliographyStore();
