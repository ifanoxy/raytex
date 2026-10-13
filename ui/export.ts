// Entry point of the window that follows an export of the PDF.

import { mount } from "svelte";
import { logFrontend } from "$lib/ipc";
import { themeSplash } from "$lib/splash";
import "./styles/app.css";

// The theme of the last session, until the main window says which one it has.
themeSplash();

window.addEventListener("error", (e) => void logFrontend("error", `export window: ${e.message} (${e.filename}:${e.lineno})`).catch(() => {}));
window.addEventListener("unhandledrejection", (e) => void logFrontend("error", `export window: unhandled promise rejection: ${String(e.reason)}`).catch(() => {}));

async function start() {
  // In a plain browser (development only), the page plays an export by itself.
  const demo = import.meta.env.DEV && !("__TAURI_INTERNALS__" in window);
  const mocks = demo ? await import("./dev/mocks") : null;
  mocks?.installMocks();
  const { default: ExportWindow } = await import("./ExportWindow.svelte");
  mount(ExportWindow, { target: document.getElementById("app")! });
  if (mocks) {
    const asked = new URLSearchParams(location.search);
    void mocks.demoExport(asked.get("theme") === "light" ? "light" : "dark", asked.has("failing"));
  }
}

void start();
