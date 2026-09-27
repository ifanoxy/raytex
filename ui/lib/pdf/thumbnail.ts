// First page of a PDF as an image (template and project previews).

import * as ipc from "../ipc";

/** Renders the first page of a PDF `width` CSS pixels wide (sharp on retina screens). */
export async function renderFirstPage(pdf: string, width: number): Promise<{ url: string; landscape: boolean }> {
  const { closePdf, loadPdf } = await import("./pdfjs");
  const doc = await loadPdf(await ipc.readBinaryFile(pdf));
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const landscape = base.width > base.height;
    const scale = ((landscape ? width * 1.4 : width) / base.width) * Math.max(2, window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("no image");
    return { url: URL.createObjectURL(blob), landscape };
  } finally {
    closePdf(doc);
  }
}
