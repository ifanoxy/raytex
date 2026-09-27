// Settings, language, theme and session.

import * as ipc from "../ipc";
import { i18n, resolveLang } from "../i18n.svelte";
import type { AppInfo, Session, Settings } from "../types";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

class AppStore {
  settings = $state<Settings | null>(null);
  info = $state<AppInfo | null>(null);
  session = $state<Session | null>(null);
  systemDark = $state(darkQuery.matches);
  ready = $state(false);

  constructor() {
    darkQuery.addEventListener("change", (e) => {
      this.systemDark = e.matches;
      this.applyTheme();
    });
  }

  get theme(): "light" | "dark" {
    const pref = this.settings?.general.theme ?? "system";
    if (pref === "light" || pref === "dark") return pref;
    return this.systemDark ? "dark" : "light";
  }

  applyTheme() {
    document.documentElement.dataset.theme = this.theme;
  }

  async applyLanguage() {
    const lang = resolveLang(this.settings?.general.language);
    i18n.lang = lang;
    document.documentElement.lang = lang;
    await ipc.setLanguage(lang);
  }

  async init() {
    const [settings, info, session] = await Promise.all([ipc.getSettings(), ipc.appInfo(), ipc.getSession()]);
    this.settings = settings;
    this.info = info;
    this.session = session;
    this.applyTheme();
    await this.applyLanguage();
    this.ready = true;
  }

  /** Changes settings through `mutate`, saves them and applies them. */
  async update(mutate: (s: Settings) => void) {
    if (!this.settings) return;
    const next = structuredClone($state.snapshot(this.settings)) as Settings;
    mutate(next);
    this.settings = next;
    this.applyTheme();
    await this.applyLanguage();
    await ipc.saveSettings(next);
  }

  async refreshSession() {
    this.session = await ipc.getSession();
  }
}

export const app = new AppStore();
