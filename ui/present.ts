// Entry point of the window of a presentation.

import { mount } from "svelte";
import { logFrontend } from "$lib/ipc";
import "./styles/app.css";

window.addEventListener("error", (e) => void logFrontend("error", `presentation: ${e.message} (${e.filename}:${e.lineno})`).catch(() => {}));
window.addEventListener("unhandledrejection", (e) => void logFrontend("error", `presentation: unhandled promise rejection: ${String(e.reason)}`).catch(() => {}));

async function start() {
  const { default: AudienceWindow } = await import("./slides/AudienceWindow.svelte");
  mount(AudienceWindow, { target: document.getElementById("app")! });
}

void start();
