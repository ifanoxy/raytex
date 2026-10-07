// Entry point of the interface.

import { mount } from "svelte";
import { logFrontend } from "$lib/ipc";
import { themeSplash } from "$lib/splash";
import "./styles/app.css";

// The launch screen of index.html takes the theme of the last session.
themeSplash();

// Uncaught errors are reported to the terminal running the application.
window.addEventListener("error", (e) => void logFrontend("error", `${e.message} (${e.filename}:${e.lineno})`).catch(() => {}));
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack ?? ""}` : String(e.reason);
  void logFrontend("error", `unhandled promise rejection: ${reason}`).catch(() => {});
});

// What is typed in RayTeX is LaTeX, names and paths: the automatic
// correction of the system (macOS changes words, quotes and dashes as they
// are typed, also in plain fields) has no place in any field.
document.addEventListener(
  "focusin",
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.dataset.prose !== undefined) return;
    if (el instanceof HTMLInputElement && !["text", "search", ""].includes(el.type)) return;
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("autocomplete", "off");
    el.spellcheck = false;
  },
  true,
);

async function start() {
  // In a plain browser (development only), a simulated engine lets the
  // interface be designed without the desktop shell.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installMocks } = await import("./dev/mocks");
    installMocks();
  }
  const { default: App } = await import("./App.svelte");
  mount(App, { target: document.getElementById("app")! });
  if (import.meta.env.DEV && "__TAURI_INTERNALS__" in window) {
    const { runSelfTest } = await import("./dev/selftest");
    void runSelfTest();
  }
}

void start();
