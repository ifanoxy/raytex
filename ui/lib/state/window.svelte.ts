// The title bar is part of the top bar of RayTeX: on Windows the system bar
// is removed (tauri.windows.conf.json) and RayTeX draws the buttons; on macOS
// the traffic lights sit in the top bar (tauri.macos.conf.json).

import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { isMac } from "../utils";

/** `windows`: RayTeX's own buttons; `mac`: traffic lights over the bar; `system`: the bar of the system. */
export type TitleBar = "windows" | "mac" | "system";

function detect(): TitleBar {
  // `?titlebar=windows` shows another platform in the browser preview.
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(location.search).get("titlebar");
    if (forced === "windows" || forced === "mac" || forced === "system") return forced;
  }
  if (isMac()) return "mac";
  return navigator.userAgent.includes("Windows") ? "windows" : "system";
}

function current(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/** Elements of the top bar that keep their own click. */
const INTERACTIVE = "button, a, input, select, textarea, [contenteditable], [role='button'], [data-no-drag]";

class AppWindow {
  readonly titleBar: TitleBar = detect();
  maximized = $state(false);
  fullscreen = $state(false);
  #win = current();

  /** Follows the maximized and full screen states; returns the way to stop. */
  async watch(): Promise<() => void> {
    const win = this.#win;
    if (!win) return () => {};
    const sync = async () => {
      this.maximized = await win.isMaximized().catch(() => false);
      this.fullscreen = await win.isFullscreen().catch(() => false);
    };
    await sync();
    return await win.onResized(() => void sync()).catch(() => () => {});
  }

  minimize() {
    void this.#win?.minimize().catch(() => {});
  }

  toggleMaximize() {
    void this.#win?.toggleMaximize().catch(() => {});
  }

  /** Same as the close button of the system (unsaved files are asked about). */
  close() {
    void this.#win?.close().catch(() => {});
  }

  /** Mouse down on an empty part of the top bar: moves the window; a double click maximizes it. */
  drag(e: MouseEvent) {
    if (this.titleBar === "system" || e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest(INTERACTIVE)) return;
    e.preventDefault();
    if (e.detail === 2) this.toggleMaximize();
    else void this.#win?.startDragging().catch(() => {});
  }
}

export const appWindow = new AppWindow();
