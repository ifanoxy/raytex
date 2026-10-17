// Entry point of the window of the slides mode.

import { mount } from "svelte";
import { logFrontend } from "$lib/ipc";
import { themeSplash } from "$lib/splash";
import "./styles/app.css";

// The theme of the last session, until the main window says which one it has.
themeSplash();

window.addEventListener("error", (e) => void logFrontend("error", `slides window: ${e.message} (${e.filename}:${e.lineno})`).catch(() => {}));
window.addEventListener("unhandledrejection", (e) => void logFrontend("error", `slides window: unhandled promise rejection: ${String(e.reason)}`).catch(() => {}));

async function start() {
  // In a plain browser (development only), the window shows a deck of its own.
  const demo = import.meta.env.DEV && !("__TAURI_INTERNALS__" in window);
  const mocks = demo ? await import("./dev/mocks") : null;
  mocks?.installMocks();
  const { default: SlidesWindow } = await import("./slides/SlidesWindow.svelte");
  mount(SlidesWindow, { target: document.getElementById("app")! });
  if (mocks) void mocks.demoSlides();
}

void start();
