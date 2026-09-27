// Hover documentation: commands, environments, labels (with their number),
// citations (full entry), packages, and image previews for \includegraphics.

import { hoverTooltip } from "@codemirror/view";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as ipc from "../ipc";
import { docPath, hooks } from "./context";

export function latexHover() {
  return hoverTooltip(
    async (view, pos) => {
      if (!hooks.settings().hoverDocs) return null;
      const path = view.state.facet(docPath);
      if (!path) return null;
      const line = view.state.doc.lineAt(pos);
      const h = await ipc.hover(path, line.number - 1, pos - line.from).catch(() => null);
      if (!h) return null;
      const doc = view.state.doc;
      const toPos = (p: { line: number; character: number }) => {
        if (p.line + 1 > doc.lines) return doc.length;
        const l = doc.line(p.line + 1);
        return Math.min(l.to, l.from + p.character);
      };
      const from = toPos(h.range.start);
      const to = Math.max(from, toPos(h.range.end));
      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "lbt-hover doc";
          if (h.kind === "html") {
            dom.innerHTML = h.html;
          } else if (/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(h.path)) {
            const img = document.createElement("img");
            img.src = convertFileSrc(h.path);
            img.alt = h.path;
            img.className = "lbt-hover-image";
            dom.appendChild(img);
            const caption = document.createElement("div");
            caption.className = "lbt-hover-caption";
            caption.textContent = h.path.split(/[\\/]/).pop() ?? h.path;
            dom.appendChild(caption);
          } else if (/\.pdf$/i.test(h.path)) {
            const canvas = document.createElement("canvas");
            canvas.className = "lbt-hover-image";
            dom.appendChild(canvas);
            void renderPdfThumbnail(h.path, canvas);
          } else {
            dom.textContent = h.path;
          }
          return { dom };
        },
      };
    },
    { hoverTime: 380 },
  );
}

async function renderPdfThumbnail(path: string, canvas: HTMLCanvasElement) {
  const { closePdf, loadPdf } = await import("../pdf/pdfjs");
  try {
    const pdf = await loadPdf(await ipc.readBinaryFile(path));
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(320 / base.width, 240 / base.height) * (window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
    await page.render({ canvas, viewport }).promise;
    closePdf(pdf);
  } catch {
    canvas.replaceWith(document.createTextNode(path));
  }
}
