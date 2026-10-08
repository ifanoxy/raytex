// The launch screen of index.html: its colours follow the theme chosen in
// RayTeX, and it fades away once the interface is ready.

const THEME_KEY = "raytex.theme";

/** Gives the launch screen the theme of the last session, before the settings are read. */
export function themeSplash() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch {
    /* storage unavailable: the theme of the system is used */
  }
}

/**
 * Draws how the ray crosses the launch screen this time: which of its three
 * routes comes first, and which way up. Only at the very start, while
 * nothing is seen yet: later, the ray would jump.
 */
export function drawSplashRoute() {
  const el = document.getElementById("splash");
  if (!el || performance.now() > 300) return;
  // One crossing lasts 5.5 s: the ray is somewhere in the first half of one of the three.
  el.style.setProperty("--splash-start", `${-(5.5 * Math.floor(Math.random() * 3) + 0.9 + Math.random() * 1.6).toFixed(2)}s`);
  el.style.setProperty("--splash-flip", Math.random() < 0.5 ? "1" : "-1");
}

/** Remembers the theme for the next launch. */
export function rememberTheme(theme: "light" | "dark") {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

/** Fades the launch screen away and removes it. */
export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el || el.classList.contains("done")) return;
  el.classList.add("done");
  setTimeout(() => el.remove(), 400);
}
