// The canvas of a page shown on the screen: one of its pixels for one of the
// screen. A canvas a fraction of a pixel off the box it fills is resampled,
// and its whole page blurred; on a screen at 125 % or 150 % (most Windows
// laptops) a size in CSS pixels hardly ever falls on whole pixels.

/** Pixels of a canvas drawn `width` × `height` CSS pixels on a screen of `ratio`. */
export interface PixelSize {
  /** The canvas, in pixels of the screen. */
  width: number;
  height: number;
  /** The box it fills, in CSS pixels: exactly the canvas, on the screen. */
  cssWidth: number;
  cssHeight: number;
  /** For pdf.js: a viewport of `width` × `height` drawn over the whole canvas. */
  transform: [number, number, number, number, number, number];
}

export function pixelSize(width: number, height: number, ratio: number): PixelSize {
  const r = ratio > 0 ? ratio : 1;
  const w = Math.max(1, Math.round(width * r));
  const h = Math.max(1, Math.round(height * r));
  return { width: w, height: h, cssWidth: w / r, cssHeight: h / r, transform: [w / width, 0, 0, h / height, 0, 0] };
}

/** A length in CSS pixels brought to whole pixels of the screen. */
export function onPixels(length: number, ratio: number): number {
  const r = ratio > 0 ? ratio : 1;
  return Math.round(length * r) / r;
}

/**
 * Calls `run` each time the density of the screen changes (the window taken
 * to another screen, the scale of the system changed). Returns the way to stop.
 */
export function onRatioChange(run: () => void): () => void {
  let query: MediaQueryList | null = null;
  const changed = () => {
    run();
    listen();
  };
  const listen = () => {
    query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener("change", changed, { once: true });
  };
  listen();
  return () => query?.removeEventListener("change", changed);
}
