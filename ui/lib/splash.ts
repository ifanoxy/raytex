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
