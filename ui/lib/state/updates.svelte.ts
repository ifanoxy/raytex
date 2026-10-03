// New versions of RayTeX: looked for at start (unless turned off) or on
// demand, offered in a dialog, downloaded, installed, then RayTeX restarts.
// The versions come from the GitHub releases (latest.json), signed with the
// project's update key: only those signed files are installed.

import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { DOWNLOAD_PAGE } from "../updates";
import { app } from "./app.svelte";
import { editor } from "./editor.svelte";
import { ui } from "./ui.svelte";

export type UpdatePhase = "idle" | "checking" | "offer" | "downloading" | "installing" | "error";

interface Offer {
  version: string;
  current: string;
  date: string | null;
  notes: string;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

class UpdateStore {
  phase = $state<UpdatePhase>("idle");
  offer = $state<Offer | null>(null);
  /** Bytes received, and the size when known. */
  received = $state(0);
  total = $state(0);
  error = $state<string | null>(null);
  private update: Update | null = null;

  /** At start: in the application built for users, unless turned off. */
  async checkAtStart() {
    const simulated = import.meta.env.DEV && new URLSearchParams(location.search).has("update");
    if (simulated) return this.simulate();
    if (import.meta.env.DEV || !inTauri || app.settings?.updates?.checkAtStartup === false) return;
    await this.check(false);
  }

  /** Looks for a new version; `manual` also says when there is none. */
  async check(manual: boolean) {
    if (!inTauri) {
      if (manual) ui.toast("info", t("update.unavailable"));
      return;
    }
    if (this.phase === "checking" || this.phase === "downloading" || this.phase === "installing") return;
    this.phase = "checking";
    try {
      const update = await check();
      const skipped = app.settings?.updates?.skippedVersion;
      if (!update || (!manual && update.version === skipped)) {
        this.phase = "idle";
        if (manual) ui.toast("success", t("update.upToDate", { version: app.info?.version ?? "" }));
        return;
      }
      this.update = update;
      this.offer = { version: update.version, current: update.currentVersion, date: update.date ?? null, notes: update.body ?? "" };
      this.phase = "offer";
    } catch (e) {
      this.phase = "idle";
      // At start, a missing network says nothing; asked for, it is said.
      if (manual) ui.toast("warning", t("update.checkFailed"), { detail: String(e) });
    }
  }

  /** Not now: offered again at the next start. */
  later() {
    this.phase = "idle";
    this.offer = null;
  }

  /** Never this version (a later one is offered). */
  async skip() {
    const version = this.offer?.version ?? null;
    await app.update((s) => {
      s.updates = { checkAtStartup: s.updates?.checkAtStartup ?? true, skippedVersion: version };
    });
    this.later();
  }

  /** Downloads and installs the new version, then restarts RayTeX. */
  async install() {
    if (!this.update) return this.later();
    // Nothing is lost: the open files are saved first.
    if (editor.dirtyTabs.length) await editor.saveAll();
    this.phase = "downloading";
    this.received = 0;
    this.total = 0;
    try {
      await this.update.downloadAndInstall((event) => {
        if (event.event === "Started") this.total = event.data.contentLength ?? 0;
        else if (event.event === "Progress") this.received += event.data.chunkLength;
        else if (event.event === "Finished") this.phase = "installing";
      });
      this.phase = "installing";
      await relaunch();
    } catch (e) {
      this.error = String(e);
      this.phase = "error";
    }
  }

  /** When this system cannot update by itself: the download page. */
  openDownloadPage() {
    void ipc.openUrl(DOWNLOAD_PAGE);
    this.later();
  }

  /** In the browser (npm run dev, `?update`): the dialog with a fake version. */
  private simulate() {
    this.offer = {
      version: "0.2.0",
      current: app.info?.version ?? "0.1.0",
      date: new Date().toISOString(),
      notes: "## Nouveautés\n\n- **Mise à jour** proposée au lancement\n- Nouvelle identité : la raie violette\n- Site entièrement repensé",
    };
    this.phase = "offer";
    this.install = async () => {
      this.phase = "downloading";
      this.total = 12_000_000;
      this.received = 0;
      const timer = setInterval(() => {
        this.received = Math.min(this.total, this.received + 900_000);
        if (this.received >= this.total) {
          clearInterval(timer);
          this.phase = "installing";
          setTimeout(() => this.later(), 1500);
        }
      }, 120);
    };
  }
}

export const updates = new UpdateStore();
