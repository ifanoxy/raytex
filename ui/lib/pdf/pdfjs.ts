// pdf.js set-up (loaded lazily: the viewer is the only heavy dependency).

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };

/** Loads a PDF from bytes. The buffer is transferred to the worker. */
export function loadPdf(data: ArrayBuffer) {
  return pdfjs.getDocument({
    data: new Uint8Array(data),
    disableAutoFetch: true,
    enableXfa: false,
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
