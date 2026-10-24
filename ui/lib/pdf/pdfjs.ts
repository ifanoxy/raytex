// pdf.js set-up (loaded lazily: the viewer is the only heavy dependency).

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };

/**
 * Letters drawn from their outlines rather than through the fonts of the
 * system: on Windows these go through ClearType, which gives letters on a
 * canvas coloured edges and heavy strokes at the small sizes of a preview.
 * The outlines are those of the PDF, smoothed in grey as on the other systems.
 */
const outlines = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/** Loads a PDF from bytes. The buffer is transferred to the worker. */
export function loadPdf(data: ArrayBuffer) {
  return pdfjs.getDocument({
    data: new Uint8Array(data),
    disableAutoFetch: true,
    enableXfa: false,
    disableFontFace: outlines,
  }).promise;
}

/** Frees a document and its worker resources. */
export function closePdf(doc: PDFDocumentProxy | null | undefined) {
  if (doc) void doc.loadingTask.destroy();
}

/**
 * The texts drawn on a page. Read from its stream with a reader:
 * `getTextContent` walks the stream with `for await`, which the webview of
 * macOS (WebKit) does not do on a stream.
 */
export async function pageTexts(page: PDFPageProxy): Promise<TextItem[]> {
  const reader = page.streamTextContent().getReader();
  const items: TextItem[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return items;
    for (const item of (value as { items: (TextItem | object)[] }).items) if ("str" in item) items.push(item);
  }
}
