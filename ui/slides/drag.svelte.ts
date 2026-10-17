// Dragging with the mouse in the slides mode: pointer events, not the drag
// and drop of HTML (the webview of Windows keeps that for the files dropped
// on the window). What is carried, where the pointer is, and the place under
// it that takes it: the nearest element saying `data-drop`.

export interface Carried {
  kind: "component" | "block" | "slide";
  /** What it is: a component (`list`, `box-alertblock`), the index of a block or of a slide. */
  value: string;
  /** What the pointer shows while it is carried. */
  label: string;
}

class Drag {
  carried = $state<Carried | null>(null);
  x = $state(0);
  y = $state(0);
  /** The `data-drop` of the place under the pointer. */
  over = $state<string | null>(null);

  /**
   * Starts carrying from a press, once the pointer has moved a little (a
   * press without moving stays a click); `drop` is told where it was let go,
   * `onstart` when the carrying begins.
   */
  start(e: PointerEvent, carried: Carried, drop: (place: string, carried: Carried) => void, onstart?: () => void) {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    const move = (m: PointerEvent) => {
      if (!started && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      if (!started) {
        started = true;
        this.carried = carried;
        document.body.classList.add("slides-dragging");
        getSelection()?.removeAllRanges();
        onstart?.();
      }
      this.x = m.clientX;
      this.y = m.clientY;
      const place = (document.elementFromPoint(m.clientX, m.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-drop]");
      this.over = place?.dataset.drop ?? null;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", cancel);
      if (!started) return;
      const place = this.over;
      this.end();
      // The click that follows the release is not one.
      const swallow = (c: Event) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      if (place) drop(place, carried);
    };
    const cancel = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", cancel);
      this.end();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", cancel);
  }

  private end() {
    this.carried = null;
    this.over = null;
    document.body.classList.remove("slides-dragging");
  }
}

export const drag = new Drag();
