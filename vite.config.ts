import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri expects a fixed port and no clearing of its output.
const host = process.env.TAURI_DEV_HOST;

// KaTeX lists each of its fonts in three formats. Every webview RayTeX runs
// in reads WOFF2 (the fonts of the interface come in that format alone), so
// the two others stay out of the application.
const katexWoff2Only = (): Plugin => ({
  name: "katex-woff2-only",
  enforce: "pre",
  transform(code, id) {
    if (!id.includes("katex/dist/katex.min.css")) return;
    return { code: code.replace(/,url\([^)]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g, ""), map: null };
  },
});

export default defineConfig({
  root: ".",
  plugins: [svelte(), katexWoff2Only()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/crates/**", "**/target/**"] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  resolve: {
    alias: { $lib: "/ui/lib" },
  },
});
