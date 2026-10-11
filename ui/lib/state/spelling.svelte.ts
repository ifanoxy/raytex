// Spelling: the language the document is checked in (the one chosen for
// the project, else the one the document gives to babel or polyglossia,
// else the language of the interface), the dictionaries on this computer,
// and the one downloaded when the user agrees to it.

import { sizeLabel } from "../history";
import { i18n, t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { documentLanguage, serving, type SpellStatus } from "../spelling";
import { debounce } from "../utils";
import { app } from "./app.svelte";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

class SpellingStore {
  /** The language the document says it is written in; null when it does not say. */
  detected = $state<string | null>(null);
  /** The dictionaries installed and offered; null until they were read. */
  status = $state<SpellStatus | null>(null);
  /** The dictionary being downloaded. */
  installing = $state<string | null>(null);
  /** Bumped when the verdicts change for a reason the editor cannot see (a word learned, a dictionary added). */
  revision = $state(0);
  /** Verdicts known so far, by dictionary: true for a word spelled right. */
  private verdicts = new Map<string, Map<string, boolean>>();
  /** Words being looked up, by dictionary and word. */
  private asking = new Map<string, Promise<void>>();

  /** The language chosen by hand for the project; null for the one of the document. */
  get chosen(): string | null {
    return project.info?.config.project.language || null;
  }

  /** The language the document is checked in. */
  get language(): string {
    return this.chosen ?? this.detected ?? i18n.lang;
  }

  private get installed(): string[] {
    return this.status?.installed.map((d) => d.tag) ?? [];
  }

  /** The installed dictionary that serves the language of the document; null when there is none. */
  get dictionary(): string | null {
    return serving(this.language, this.installed);
  }

  /** The installed dictionary for a passage in another language. */
  dictionaryFor(lang: string): string | null {
    return serving(lang, this.installed);
  }

  /** The dictionary that can be downloaded for the language of the document, when none is installed. */
  get offer(): { tag: string; size: number } | null {
    if (!this.status || this.dictionary) return null;
    const tag = serving(
      this.language,
      this.status.catalog.map((d) => d.tag),
    );
    return this.status.catalog.find((d) => d.tag === tag) ?? null;
  }

  /** Reads the dictionaries on this computer. */
  async loadStatus() {
    this.status = await ipc.spellStatus().catch(() => this.status);
  }

  /** Reads the language of the document of the file being edited. */
  async refresh() {
    if (!this.status) await this.loadStatus();
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

  // ------------------------------------------------------------- verdicts

  verdict(dictionary: string, word: string): boolean | undefined {
    return this.verdicts.get(dictionary)?.get(word);
  }

  /**
   * Looks words up in a dictionary; their verdicts are kept. Resolves once
   * every word has its verdict, those another caller asked for a moment
   * ago included: an editor that is set up again while its words are being
   * looked up still hears of the answer.
   */
  async check(dictionary: string, words: string[]): Promise<void> {
    if (!this.verdicts.has(dictionary)) this.verdicts.set(dictionary, new Map());
    const known = this.verdicts.get(dictionary)!;
    const key = (w: string) => `${dictionary}\n${w}`;
    const fresh = words.filter((w) => !known.has(w) && !this.asking.has(key(w)));
    if (fresh.length) {
      const request = ipc
        .spellCheck(dictionary, fresh)
        .then(
          (right) => fresh.forEach((w, i) => known.set(w, right[i] ?? true)),
          // A dictionary that cannot be read underlines nothing (and is not asked again for these words).
          () => fresh.forEach((w) => known.set(w, true)),
        )
        .finally(() => fresh.forEach((w) => this.asking.delete(key(w))));
      for (const w of fresh) this.asking.set(key(w), request);
    }
    await Promise.all(words.map((w) => this.asking.get(key(w))).filter((p) => !!p));
  }

  /** What the dictionary offers in place of a word. */
  suggest(dictionary: string, word: string): Promise<string[]> {
    return ipc.spellSuggest(dictionary, word).catch(() => []);
  }

  /** Adds a word to those of the user: it is right in every language from now on. */
  async learn(word: string) {
    await ipc.spellLearn(word, true);
    for (const known of this.verdicts.values()) known.set(word, true);
    await this.loadStatus();
    this.revision++;
  }

  /** Takes a word back from those of the user. */
  async forget(word: string) {
    await ipc.spellLearn(word, false);
    this.verdicts.clear();
    await this.loadStatus();
    this.revision++;
  }

  // --------------------------------------------------------- dictionaries

  /**
   * Asks whether to download the dictionary `tag` (the one offered for the
   * document when none is given), saying what is downloaded and from where,
   * and downloads it once the user agreed. Nothing is fetched otherwise.
   */
  async download(tag: string | undefined = this.offer?.tag): Promise<boolean> {
    if (!this.status) await this.loadStatus();
    const entry = this.status?.catalog.find((d) => d.tag === tag);
    if (!entry || this.installing) return false;
    const language = languageName(entry.tag);
    const ok = await ui.confirm({
      title: t("spelling.downloadTitle", { language }),
      // In one calm text: the colour of a warning is not for what reassures.
      message: `${t("spelling.downloadMessage", { size: sizeLabel(entry.size, i18n.lang), source: this.status?.source ?? "" })}\n\n${t("spelling.downloadDetail")}`,
      okLabel: t("spelling.download"),
      cancelLabel: t("spelling.notNow"),
    });
    if (!ok) return false;
    this.installing = entry.tag;
    try {
      await ipc.spellInstall(entry.tag);
      this.verdicts.delete(entry.tag);
      await this.loadStatus();
      this.revision++;
      ui.toast("success", t("spelling.installed", { language }));
      return true;
    } catch (e) {
      const said = String(e);
      ui.toast("error", t("spelling.downloadFailed", { language }), { detail: said.startsWith("download:") ? said.slice(9) : said });
      return false;
    } finally {
      this.installing = null;
    }
  }

  /** Removes an installed dictionary. */
  async remove(tag: string) {
    await ipc.spellRemove(tag).catch((e) => ui.toast("error", String(e)));
    this.verdicts.delete(tag);
    await this.loadStatus();
    this.revision++;
  }

  /** Turns the checker on; when the language of the document has no dictionary yet, asks whether to download it. */
  async enable() {
    await app.update((s) => (s.editor.spellcheck = true));
    await this.loadStatus();
    await this.refresh();
    if (!this.dictionary && this.offer) await this.download();
  }

  disable() {
    return app.update((s) => (s.editor.spellcheck = false));
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
