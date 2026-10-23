// What a version of RayTeX brings (ui/lib/whatsnew.ts): told once, at the
// first start after an update, and whenever it is asked for (Help › What's
// new, the settings).

import { NOTES, notesBefore, notesOf, tellsAtStart, type VersionNotes } from "../whatsnew";
import { app } from "./app.svelte";

class WhatsNewStore {
  /** The version whose news are shown; null when the window is closed. */
  shown = $state<VersionNotes | null>(null);
  private waiting: (() => void)[] = [];
  /** Whether RayTeX was used here before this start, read before anything is opened. */
  private usedBefore: boolean | null = null;

  /** At start, before a file or the last project is opened (opening one makes it known). */
  noteStart() {
    this.usedBefore = usedHere();
  }

  /** The versions before the one shown, for those who skipped some. */
  get earlier(): VersionNotes[] {
    return this.shown ? notesBefore(this.shown.version) : [];
  }

  /**
   * At start: the version that runs is remembered, and its news are told
   * when it is new here. Not on a first installation, which has seen nothing
   * older (no project was ever opened).
   */
  async atStart() {
    const current = app.info?.version;
    if (!current || !app.settings) return;
    const seen = app.settings.updates?.seenVersion ?? null;
    if (seen === current) return;
    const known = this.usedBefore ?? usedHere();
    const tell = tellsAtStart(current, seen, known);
    await app.update((s) => {
      s.updates = { ...s.updates, checkAtStartup: s.updates?.checkAtStartup ?? true, skippedVersion: s.updates?.skippedVersion ?? null, seenVersion: current };
    });
    if (tell) this.show(current);
  }

  /** Shows what `version` brings (the version that runs, or the latest one written). */
  show(version: string | undefined = app.info?.version) {
    this.shown = (version && notesOf(version)) || NOTES[0];
  }

  close() {
    this.shown = null;
    for (const done of this.waiting.splice(0)) done();
  }

  /** Resolves once the window is closed (at once when nothing is shown). */
  closed(): Promise<void> {
    return this.shown ? new Promise((done) => this.waiting.push(done)) : Promise.resolve();
  }
}

/** A project was opened here before (an installation that has seen an older version). */
function usedHere(): boolean {
  return !!app.session?.lastProject || (app.session?.recent.length ?? 0) > 0;
}

export const whatsNew = new WhatsNewStore();
