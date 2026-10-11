// The local history of the project, as its window uses it: the moments,
// the one that is looked at, what changed since it, the file compared, and
// putting a file (or all of them) back as it was. A file is put back through
// its document: the change can be undone and is saved like any other, and a
// moment is taken first, so that nothing is ever lost by going back.

import type { Change, Comparison, HistoryView } from "../history";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { join, relative } from "../utils";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

class HistoryStore {
  view = $state<HistoryView>({ available: false, moments: [], size: 0 });
  /** Read at least once since the window opened. */
  loaded = $state(false);
  /** The moment looked at. */
  selected = $state<string | null>(null);
  /** The files that are not what they were at that moment. */
  changes = $state<Change[]>([]);
  /** The file compared (its path in the project). */
  file = $state<string | null>(null);
  comparison = $state<Comparison | null>(null);
  /** Something is being put back, kept or forgotten. */
  busy = $state(false);
  /** The file the window was asked for (shown first when it changed). */
  private wanted: string | null = null;
  private listening = false;

  /** Opens the window, on a file of the project when one is given. */
  async show(file?: string | null) {
    if (!project.info || !(await project.requireProject(t("light.reasonHistory")))) return;
    this.wanted = file && project.info ? relative(project.info.root, file).replace(/\\/g, "/") || null : null;
    this.loaded = false;
    this.selected = null;
    this.changes = [];
    this.file = null;
    this.comparison = null;
    ui.openOverlay("history");
    if (!this.listening) {
      this.listening = true;
      void ipc.on("history:changed", () => ui.overlay === "history" && void this.refresh());
    }
    // What is typed and not yet saved is part of "now".
    await editor.saveAll({ silent: true });
    await this.refresh();
    // The latest moment is often the project as it is: the window opens on
    // the last one that has something to show.
    for (const m of this.view.moments.slice(0, 6)) {
      if (this.changes.length) break;
      if (m.id !== this.selected) await this.select(m.id);
    }
    if (!this.changes.length && this.view.moments[0]) await this.select(this.view.moments[0].id);
  }

  /** Reads the moments again; the one looked at stays when it still exists. */
  async refresh() {
    this.view = await ipc.historyList().catch(() => ({ available: false, moments: [], size: 0 }));
    this.loaded = true;
    const still = this.view.moments.some((m) => m.id === this.selected);
    await this.select(still ? this.selected : (this.view.moments[0]?.id ?? null));
  }

  /** Looks at a moment: what changed since, and the first file that did. */
  async select(id: string | null) {
    this.selected = id;
    if (!id) {
      this.changes = [];
      this.file = null;
      this.comparison = null;
      return;
    }
    const changes = await ipc.historyChanges(id).catch(() => []);
    if (this.selected !== id) return;
    this.changes = changes;
    const keep = [this.file, this.wanted].find((f) => f && changes.some((c) => c.path === f));
    await this.pick(keep ?? changes[0]?.path ?? null);
  }

  /** Compares a file with what it was at the moment looked at. */
  async pick(file: string | null) {
    this.file = file;
    const id = this.selected;
    if (!file || !id) {
      this.comparison = null;
      return;
    }
    const comparison = await ipc.historyCompare(id, file).catch(() => null);
    if (this.selected === id && this.file === file) this.comparison = comparison;
  }

  /** Takes a moment now, at the user's request. */
  async keep() {
    if (this.busy) return;
    this.busy = true;
    try {
      await editor.saveAll({ silent: true });
      const moment = await ipc.historyKeep("manual");
      ui.toast(moment ? "success" : "info", t(moment ? "history.kept" : "history.nothingNew"));
      await this.refresh();
    } catch (e) {
      ui.toast("error", String(e));
    } finally {
      this.busy = false;
    }
  }

  /** Puts one file back as it was at `id`. Returns whether it was. */
  private async putBack(id: string, change: Change): Promise<boolean> {
    const root = project.info?.root;
    if (!root) return false;
    const { then } = await ipc.historyCompare(id, change.path);
    // A file that did not exist then is left where it is.
    if (then === null) return false;
    const path = join(root, change.path);
    if (change.status === "removed") {
      await ipc.createFile(path, then);
      return true;
    }
    if (!(await editor.rewrite(path, () => then))) return false;
    await editor.save(path, { silent: true });
    return true;
  }

  /** Puts back `changes` (one file, or all of them) as they were at the moment looked at. */
  async restore(changes: Change[]) {
    const id = this.selected;
    if (!id || this.busy || !changes.length) return;
    this.busy = true;
    try {
      await editor.saveAll({ silent: true });
      // What is there now can be found again.
      await ipc.historyKeep("before-restore");
      let done = 0;
      for (const change of changes) {
        if (await this.putBack(id, change)) done++;
      }
      if (changes.some((c) => c.status === "removed")) project.refreshTree();
      if (!done) ui.toast("error", t("history.restoreFailed"));
      else ui.toast("success", changes.length === 1 ? t("history.restoredOne", { file: changes[0].path }) : t("history.restored", { n: done }));
      await this.refresh();
    } catch (e) {
      ui.toast("error", String(e));
    } finally {
      this.busy = false;
    }
  }

  /** Forgets the history of the project (asked first). */
  async clear() {
    if (this.busy) return;
    const ok = await ui.confirm({ title: t("history.clearTitle"), message: t("history.clearMessage"), okLabel: t("history.clear"), danger: true });
    if (!ok) return;
    this.busy = true;
    try {
      await ipc.historyClear();
      await this.refresh();
    } catch (e) {
      ui.toast("error", String(e));
    } finally {
      this.busy = false;
    }
  }
}

export const history = new HistoryStore();
