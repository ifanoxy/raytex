// pdf.js set-up (loaded lazily: the viewer is the only heavy dependency).

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
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
