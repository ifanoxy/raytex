// A PDF being written (the next build has started on it) has not its end
// yet: read then, pdf.js gets part of it (pages missing, or an error).

/** Whether `bytes` hold a whole PDF: it ends with `%%EOF` (a line end or a little more may follow). */
export function wholePdf(bytes: ArrayBuffer): boolean {
  const tail = new Uint8Array(bytes, Math.max(0, bytes.byteLength - 1024));
  let text = "";
  for (const b of tail) text += String.fromCharCode(b);
  return text.includes("%%EOF");
}
