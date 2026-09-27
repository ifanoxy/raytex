// Entry point of the interface.

import { mount } from "svelte";
import { logFrontend } from "$lib/ipc";
import "./styles/app.css";

// Uncaught errors are reported to the terminal running the application.
window.addEventListener("error", (e) => void logFrontend("error", `${e.message} (${e.filename}:${e.lineno})`).catch(() => {}));
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack ?? ""}` : String(e.reason);
  void logFrontend("error", `unhandled promise rejection: ${reason}`).catch(() => {});
});

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
