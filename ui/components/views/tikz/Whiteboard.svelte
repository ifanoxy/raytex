<script lang="ts" module>
  import type { Shape as Copied } from "$lib/tikz/model";

  export type Tool = "select" | "line" | "arrow" | "rect" | "circle" | "ellipse" | "polygon" | "text";

  /** What was copied on the whiteboard: kept from one picture to the next. */
  let clipboard: Copied[] = [];
</script>

<script lang="ts">
  // TikZ whiteboard: shapes drawn with the mouse on a centimetre grid (y
  // pointing up, like TikZ). Tools: select/move, line, arrow, rectangle,
  // circle, ellipse, polygon, text. With the selection tool, a drag on a
  // shape moves it (with Alt, a copy of it), a drag on the paper selects
  // what it touches, and Space or the middle button moves the view.
  // Handles resize the selected shape, or several shapes together; points
  // snap to the grid when snapping is on. What is selected has its actions
  // in a bar at the top and under the right button. Nodes are HTML over
  // the canvas (their text may contain $maths$, rendered by KaTeX).
  import { onMount } from "svelte";
  import { expressionCss, BASE_COLORS, DVIPS_COLORS } from "$lib/colors";
  import { mathHtml } from "$lib/editor/math-preview";
  import { plural, t } from "$lib/i18n.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { bounds, copies, type Drawing, fitView, moved, newId, type Point, scaled, type Shape, shapesCode, snapPoint, type Style, tidy, touches, WIDTH_PT } from "$lib/tikz/model";
  import Icon from "../../common/Icon.svelte";

  let {
    drawing = $bindable(),
    selected = $bindable([]),
    tool = $bindable("select"),
    style,
    step,
    showGrid,
    showAxes = false,
    snapOn,
    keepTool = false,
    oncommit,
    onundo,
    onredo,
    onsaveset,
  }: {
    drawing: Drawing;
    selected: string[];
    tool: Tool;
    /** Style of new shapes. */
    style: Style;
    /** Grid step (cm). */
    step: number;
    showGrid: boolean;
    /** Axes and graduations through (0, 0). */
    showAxes?: boolean;
    snapOn: boolean;
    /** A drawing tool stays chosen after a shape is drawn (else the selection tool comes back). */
    keepTool?: boolean;
    /** A change is finished (for the history and the code). */
    oncommit: () => void;
    onundo: () => void;
    onredo: () => void;
    /** The selection is to be kept as a set. */
    onsaveset?: () => void;
  } = $props();

  let host = $state<HTMLDivElement | null>(null);
  let width = $state(800);
  let height = $state(600);
  /** Pixels per centimetre, and the screen position of (0, 0). */
  let scale = $state(48);
  let ox = $state(60);
  let oy = $state(400);
  /** The board is in sight (it has a size): not behind another page of the studio. */
  let inSight = false;
  let hover = $state<Point | null>(null);
  /** The shape under the pointer, with the selection tool: what a click would take. */
  let hoverId = $state<string | null>(null);
  /** The rectangle being drawn to select, in centimetres. */
  let marquee = $state<{ a: Point; b: Point } | null>(null);
  let panning = $state(false);
  let draft = $state<Shape | null>(null);
  let editingNode = $state<string | null>(null);
  let nodeText = $state("");

  type Drag =
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { kind: "draw"; start: Point }
    | { kind: "move"; start: Point; origin: Shape[]; moved: boolean; copied: boolean; before: string[] }
    | { kind: "handle"; id: string; handle: string; origin: Shape }
    | { kind: "scale"; pivot: Point; corner: Point; origin: Shape[] }
    | { kind: "marquee"; start: Point; base: string[]; moved: boolean };
  let drag: Drag | null = null;

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (!host) return;
      // Hidden behind another page: the last size stays, and the board is
      // framed again on what is drawn when it comes back.
      if (!host.clientWidth || !host.clientHeight) {
        inSight = false;
        return;
      }
      width = host.clientWidth;
      height = host.clientHeight;
      if (!inSight) {
        inSight = true;
        fit();
      }
    });
    if (host) ro.observe(host);
    return () => ro.disconnect();
  });

  // -------------------------------------------------------- coordinates

  const toX = (x: number) => ox + x * scale;
  const toY = (y: number) => oy - y * scale;
  function toCm(e: { clientX: number; clientY: number }): Point {
    const r = host!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (oy - (e.clientY - r.top)) / scale };
  }
  const snapped = (p: Point) => (snapOn ? snapPoint(p, step) : { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });

  /** Shows what is drawn, whole and in the middle of the board (an empty one: its first centimetres). */
  export function fit() {
    // Asked while the board is coming back in sight: its size is read now.
    if (host?.clientWidth && host.clientHeight) {
      width = host.clientWidth;
      height = host.clientHeight;
    }
    ({ scale, ox, oy } = fitView(drawing.shapes, width, height));
  }

  // --------------------------------------------------------------- grid

  const grid = $derived.by(() => {
    if (!showGrid) return { minor: [] as string[], major: [] as string[] };
    // Too dense on screen: show every other line.
    let g = step;
    while (g * scale < 7) g *= 2;
    const minor: string[] = [];
    const major: string[] = [];
    const x0 = Math.floor(-ox / scale / g) * g;
    const x1 = (width - ox) / scale;
    for (let x = x0; x <= x1; x += g) (Math.abs(x - Math.round(x)) < 1e-6 ? major : minor).push(`M${toX(x)},0V${height}`);
    const y0 = Math.floor((oy - height) / scale / g) * g;
    const y1 = oy / scale;
    for (let y = y0; y <= y1; y += g) (Math.abs(y - Math.round(y)) < 1e-6 ? major : minor).push(`M0,${toY(y)}H${width}`);
    return { minor, major };
  });

  const labels = $derived.by(() => {
    if (!showAxes) return [];
    let g = 1;
    while (g * scale < 28) g *= 2;
    const out: { x: number; y: number; text: string }[] = [];
    for (let x = Math.ceil(-ox / scale / g) * g; x <= (width - ox) / scale; x += g) out.push({ x: toX(x) + 3, y: Math.min(height - 4, Math.max(12, oy - 4)), text: String(x) });
    for (let y = Math.ceil((oy - height) / scale / g) * g; y <= oy / scale; y += g) if (y !== 0) out.push({ x: Math.min(width - 16, Math.max(3, ox + 3)), y: toY(y) - 3, text: String(y) });
    return out;
  });

  // ------------------------------------------------------------- styles

  const KNOWN = [...BASE_COLORS, ...DVIPS_COLORS];
  function css(color: string | null, fallback: string): string {
    if (!color) return fallback;
    return expressionCss(color, KNOWN) ?? (/^[a-z]+$/i.test(color) ? color.toLowerCase() : fallback);
  }

  function strokeWidth(s: Style): number {
    const w = s.width ? WIDTH_PT[s.width] : 0.4;
    return Math.max(1, (w / 72.27) * 2.54 * scale);
  }

  function dash(s: Style): string | undefined {
    const w = strokeWidth(s);
    if (!s.dash) return undefined;
    if (s.dash.includes("dot")) return `${w} ${w * 2.5}`;
    return `${w * 4} ${w * 3}`;
  }

  /** Arrowhead polygon at `tip`, coming from `from` (screen coordinates). */
  function head(from: Point, tip: Point, w: number): string {
    const dx = tip.x - from.x;
    const dy = tip.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const size = Math.max(7, w * 4.5);
    const bx = tip.x - ux * size;
    const by = tip.y - uy * size;
    return `${tip.x},${tip.y} ${bx - uy * size * 0.45},${by + ux * size * 0.45} ${bx + uy * size * 0.45},${by - ux * size * 0.45}`;
  }

  const screen = (p: Point) => ({ x: toX(p.x), y: toY(p.y) });

  // ------------------------------------------------------------ editing

  function setShapes(shapes: Shape[]) {
    drawing = { ...drawing, shapes };
  }

  function byId(id: string) {
    return drawing.shapes.find((s) => s.id === id);
  }

  function newShape(start: Point, end: Point): Shape | null {
    const s: Style = JSON.parse(JSON.stringify(style));
    switch (tool) {
      case "line":
      case "arrow":
        if (tool === "arrow" && !s.arrow) s.arrow = "->";
        if (tool === "line") s.arrow = null;
        return { id: newId(), kind: "path", points: [start, end], closed: false, style: s };
      case "rect":
        return { id: newId(), kind: "rect", from: start, to: end, style: s };
      case "circle":
        return { id: newId(), kind: "circle", center: start, r: Math.max(Math.hypot(end.x - start.x, end.y - start.y), 0), style: s };
      case "ellipse":
        return { id: newId(), kind: "ellipse", center: start, rx: Math.abs(end.x - start.x), ry: Math.abs(end.y - start.y), style: s };
      default:
        return null;
    }
  }

  function degenerate(s: Shape): boolean {
    if (s.kind === "path") return s.points.length < 2 || s.points.every((p) => p.x === s.points[0].x && p.y === s.points[0].y);
    if (s.kind === "rect") return s.from.x === s.to.x || s.from.y === s.to.y;
    if (s.kind === "circle") return s.r <= 0;
    if (s.kind === "ellipse") return s.rx <= 0 || s.ry <= 0;
    return false;
  }

  function pointerDown(e: PointerEvent) {
    if (e.button === 2) return;
    host?.focus();
    const target = e.target as Element;
    const p = toCm(e);
    // The view moves with the middle button or with Space held.
    const id = target.closest<Element>("[data-id]")?.getAttribute("data-id") ?? null;
    const handle = target.closest<Element>("[data-handle]")?.getAttribute("data-handle") ?? null;
    if (e.button === 1 || spaceDown) {
      drag = { kind: "pan", sx: e.clientX, sy: e.clientY, ox, oy };
      panning = true;
      capture(e);
      return;
    }
    // A corner of the box around several shapes: they grow together.
    if (handle?.startsWith("g") && group) {
      const corner = { x: handle.includes("e") ? group.maxX : group.minX, y: handle.includes("n") ? group.maxY : group.minY };
      const pivot = { x: handle.includes("e") ? group.minX : group.maxX, y: handle.includes("n") ? group.minY : group.maxY };
      drag = { kind: "scale", pivot, corner, origin: drawing.shapes.filter((s) => selected.includes(s.id)) };
      capture(e);
      return;
    }
    if (handle && selected.length === 1) {
      const shape = byId(selected[0]);
      if (shape) {
        drag = { kind: "handle", id: shape.id, handle, origin: shape };
        capture(e);
        return;
      }
    }
    if (tool === "select" && id) {
      const before = selected;
      if (e.shiftKey) selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
      else if (!selected.includes(id)) selected = [id];
      let origin = drawing.shapes.filter((s) => selected.includes(s.id));
      // With Alt, copies are dragged and the shapes stay where they are.
      const copied = e.altKey && origin.length > 0;
      if (copied) {
        origin = copies(origin);
        setShapes([...drawing.shapes, ...origin]);
        selected = origin.map((s) => s.id);
      }
      drag = { kind: "move", start: snapped(p), origin, moved: false, copied, before };
      capture(e);
      return;
    }
    // On the paper: a rectangle selects what it touches (added to the selection with Shift).
    if (tool === "select") {
      drag = { kind: "marquee", start: p, base: e.shiftKey ? selected : [], moved: false };
      capture(e);
      return;
    }
    if (tool === "text") {
      newNode(snapped(p));
      return;
    }
    if (tool === "polygon") {
      const q = snapped(p);
      if (draft?.kind === "path") {
        const first = draft.points[0];
        // Back on the first point: closes the polygon.
        if (draft.points.length > 2 && Math.hypot(q.x - first.x, q.y - first.y) * scale < 10) {
          finishPolygon(true);
          return;
        }
        draft = { ...draft, points: [...draft.points.slice(0, -1), q, q] };
      } else {
        draft = { id: newId(), kind: "path", points: [q, q], closed: false, style: JSON.parse(JSON.stringify(style)) };
      }
      return;
    }
    const start = snapped(p);
    draft = newShape(start, start);
    drag = { kind: "draw", start };
    capture(e);
  }

  /** A text at `at`, ready to be typed. */
  function newNode(at: Point) {
    const node: Shape = {
      id: newId(),
      kind: "node",
      at,
      text: "",
      style: { ...JSON.parse(JSON.stringify(style)), arrow: null },
      boxed: false,
      shape: "",
      position: "",
      textColor: null,
      font: null,
      name: null,
    };
    setShapes([...drawing.shapes, node]);
    selected = [node.id];
    editNode(node.id);
  }

  function capture(e: PointerEvent) {
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer that is gone already: the drag goes on without it */
    }
  }

  function pointerMove(e: PointerEvent) {
    const p = toCm(e);
    hover = snapped(p);
    if (!drag) hoverId = tool === "select" ? ((e.target as Element).closest<Element>("[data-id]")?.getAttribute("data-id") ?? null) : null;
    if (draft?.kind === "path" && tool === "polygon" && !drag) {
      draft = { ...draft, points: [...draft.points.slice(0, -1), snapped(p)] };
      return;
    }
    if (!drag) return;
    if (drag.kind === "pan") {
      ox = drag.ox + e.clientX - drag.sx;
      oy = drag.oy + e.clientY - drag.sy;
    } else if (drag.kind === "draw") {
      draft = newShape(drag.start, snapped(p));
    } else if (drag.kind === "move") {
      const q = snapped(p);
      const dx = q.x - drag.start.x;
      const dy = q.y - drag.start.y;
      if (dx || dy) drag.moved = true;
      const origin = new Map(drag.origin.map((s) => [s.id, s]));
      setShapes(drawing.shapes.map((s) => (origin.has(s.id) ? moved(origin.get(s.id)!, dx, dy) : s)));
    } else if (drag.kind === "handle") {
      const q = snapped(p);
      const { id, origin, handle } = drag;
      const updated = resize(origin, handle, q);
      setShapes(drawing.shapes.map((s) => (s.id === id ? updated : s)));
    } else if (drag.kind === "scale") {
      // The same factor both ways: the shapes keep their proportions.
      const q = snapped(p);
      const { pivot, corner } = drag;
      const fx = corner.x !== pivot.x ? (q.x - pivot.x) / (corner.x - pivot.x) : 0;
      const fy = corner.y !== pivot.y ? (q.y - pivot.y) / (corner.y - pivot.y) : 0;
      const f = Math.max(0.05, fx, fy);
      const origin = new Map(drag.origin.map((s) => [s.id, s]));
      setShapes(drawing.shapes.map((s) => (origin.has(s.id) ? tidy(scaled(origin.get(s.id)!, pivot, f)) : s)));
    } else if (drag.kind === "marquee") {
      const { start, base } = drag;
      if (Math.hypot(p.x - start.x, p.y - start.y) * scale > 3) drag.moved = true;
      if (!drag.moved) return;
      marquee = { a: start, b: p };
      const touched = drawing.shapes.filter((s) => touches(s, start, p)).map((s) => s.id);
      selected = [...base, ...touched.filter((id) => !base.includes(id))];
    }
  }

  function resize(s: Shape, handle: string, q: Point): Shape {
    if (s.kind === "path") {
      const i = Number(handle);
      return { ...s, points: s.points.map((p, j) => (j === i ? q : p)) };
    }
    if (s.kind === "rect") {
      const from = { ...s.from };
      const to = { ...s.to };
      if (handle.includes("fx")) from.x = q.x;
      if (handle.includes("tx")) to.x = q.x;
      if (handle.includes("fy")) from.y = q.y;
      if (handle.includes("ty")) to.y = q.y;
      return { ...s, from, to };
    }
    if (s.kind === "circle") return { ...s, r: Math.max(step > 0 && snapOn ? step : 0.05, Math.hypot(q.x - s.center.x, q.y - s.center.y)) };
    if (s.kind === "ellipse") {
      if (handle === "rx") return { ...s, rx: Math.max(0.05, Math.abs(q.x - s.center.x)) };
      return { ...s, ry: Math.max(0.05, Math.abs(q.y - s.center.y)) };
    }
    return s;
  }

  function pointerUp() {
    const d = drag;
    drag = null;
    panning = false;
    marquee = null;
    if (!d) return;
    if (d.kind === "draw" && draft) {
      const shape = draft;
      draft = null;
      if (!degenerate(shape)) {
        setShapes([...drawing.shapes, shape]);
        selected = [shape.id];
        oncommit();
        drawn();
      }
    } else if (d.kind === "move" && d.copied && !d.moved) {
      // Alt and a click without a move: no copy is left on top of the shape.
      const made = new Set(d.origin.map((s) => s.id));
      setShapes(drawing.shapes.filter((s) => !made.has(s.id)));
      selected = d.before;
    } else if ((d.kind === "move" && d.moved) || d.kind === "handle" || d.kind === "scale") {
      oncommit();
    } else if (d.kind === "marquee" && !d.moved) {
      // A click on the paper: nothing is selected any more.
      selected = d.base;
    }
  }

  /** A shape was drawn: the selection tool comes back, unless the tool is kept. */
  function drawn() {
    if (!keepTool) tool = "select";
  }

  function finishPolygon(closed: boolean) {
    if (draft?.kind !== "path") return;
    const pts = closed ? draft.points.slice(0, -1) : draft.points.slice(0, -1);
    const shape: Shape = { ...draft, points: pts, closed };
    draft = null;
    if (pts.length >= 2 && !degenerate(shape)) {
      setShapes([...drawing.shapes, shape]);
      selected = [shape.id];
      oncommit();
      drawn();
    }
  }

  function doubleClick(e: MouseEvent) {
    if (tool === "polygon" && draft) {
      finishPolygon(false);
      return;
    }
    const id = (e.target as Element).closest<Element>("[data-id]")?.getAttribute("data-id");
    const shape = id ? byId(id) : null;
    if (shape?.kind === "node") editNode(shape.id);
    // On the paper, with the selection tool: a text is written there.
    else if (!shape && tool === "select" && !(e.target as Element).closest("[data-handle], .bar")) newNode(snapped(toCm(e)));
  }

  function editNode(id: string) {
    const s = byId(id);
    if (s?.kind !== "node") return;
    editingNode = id;
    nodeText = s.text;
    requestAnimationFrame(() => host?.querySelector<HTMLInputElement>(".node-input")?.focus());
  }

  function commitNode() {
    const id = editingNode;
    if (!id) return;
    editingNode = null;
    const text = nodeText.trim();
    if (!text) setShapes(drawing.shapes.filter((s) => s.id !== id));
    else setShapes(drawing.shapes.map((s) => (s.id === id && s.kind === "node" ? { ...s, text } : s)));
    if (tool === "text") tool = "select";
    oncommit();
    host?.focus();
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = host!.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.01);
      const next = Math.max(8, Math.min(240, scale * factor));
      ox = mx - ((mx - ox) * next) / scale;
      oy = my - ((my - oy) * next) / scale;
      scale = next;
    } else {
      ox -= e.deltaX;
      oy -= e.deltaY;
    }
  }

  export function zoom(factor: number) {
    const mx = width / 2;
    const my = height / 2;
    const next = Math.max(8, Math.min(240, scale * factor));
    ox = mx - ((mx - ox) * next) / scale;
    oy = my - ((my - oy) * next) / scale;
    scale = next;
  }

  let spaceDown = false;
  const TOOL_KEYS: Record<string, Tool> = { v: "select", l: "line", a: "arrow", r: "rect", c: "circle", e: "ellipse", p: "polygon", t: "text" };

  function key(e: KeyboardEvent) {
    if (editingNode) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) onredo();
      else onundo();
    } else if (mod && k === "y") {
      e.preventDefault();
      onredo();
    } else if (mod && k === "a") {
      e.preventDefault();
      selected = drawing.shapes.filter((s) => s.kind !== "code").map((s) => s.id);
    } else if (mod && k === "d") {
      e.preventDefault();
      duplicate();
    } else if (mod && k === "c") {
      e.preventDefault();
      copy();
    } else if (mod && k === "x") {
      e.preventDefault();
      copy();
      remove();
    } else if (mod && k === "v") {
      e.preventDefault();
      paste();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove();
    } else if (e.key === "Escape") {
      if (draft) draft = null;
      else if (selected.length) selected = [];
      else tool = "select";
      e.stopPropagation();
    } else if (e.key === "Enter" && draft) {
      finishPolygon(false);
    } else if (e.key.startsWith("Arrow") && selected.length) {
      e.preventDefault();
      const d = (snapOn ? step : 0.1) * (e.shiftKey ? 5 : 1);
      const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
      const dy = e.key === "ArrowDown" ? -d : e.key === "ArrowUp" ? d : 0;
      setShapes(drawing.shapes.map((s) => (selected.includes(s.id) ? moved(s, dx, dy) : s)));
      oncommit();
    } else if (e.key === " ") {
      spaceDown = true;
      e.preventDefault();
    } else if (!mod && !e.altKey && TOOL_KEYS[k]) {
      tool = TOOL_KEYS[k];
      draft = null;
    }
  }

  export function remove() {
    if (!selected.length) return;
    setShapes(drawing.shapes.filter((s) => !selected.includes(s.id)));
    selected = [];
    oncommit();
  }

  /** Copies of the selection, next to it, selected in its place. */
  export function duplicate() {
    insert(copies(chosen(), step || 0.5, -(step || 0.5)));
  }

  const chosen = () => drawing.shapes.filter((s) => selected.includes(s.id));

  /** Adds shapes to the drawing and selects them. */
  export function insert(shapes: Shape[]) {
    if (!shapes.length) return;
    setShapes([...drawing.shapes, ...shapes]);
    selected = shapes.map((s) => s.id);
    tool = "select";
    oncommit();
    host?.focus();
  }

  /** Keeps the selection for a later paste; its code goes to the clipboard of the system too. */
  export function copy() {
    const shapes = chosen();
    if (!shapes.length) return;
    clipboard = copies(shapes);
    void navigator.clipboard?.writeText(shapesCode(shapes)).catch(() => {});
  }

  /** What was copied, next to where it was (each paste a little further). */
  export function paste() {
    if (!clipboard.length) return;
    clipboard = copies(clipboard, step || 0.5, -(step || 0.5));
    insert(copies(clipboard));
  }

  export const canPaste = () => clipboard.length > 0;

  /** Puts the selection over the other shapes, or under them. */
  export function reorder(front: boolean) {
    const moving = chosen();
    if (!moving.length) return;
    const rest = drawing.shapes.filter((s) => !selected.includes(s.id));
    setShapes(front ? [...rest, ...moving] : [...moving, ...rest]);
    oncommit();
  }

  /** The middle of what is shown, in centimetres: where a set is drawn. */
  export function center(): Point {
    return { x: (width / 2 - ox) / scale, y: (oy - height / 2) / scale };
  }

  /** The actions of the selection (or of the paper), under the right button. */
  function menu(e: MouseEvent) {
    e.preventDefault();
    if (editingNode) return;
    const id = (e.target as Element).closest<Element>("[data-id]")?.getAttribute("data-id") ?? null;
    if (id && !selected.includes(id)) selected = [id];
    else if (!id) selected = [];
    const some = selected.length > 0;
    ui.openMenu(
      e,
      some
        ? [
            { label: t("tikz.duplicate"), icon: "copy", keys: "Mod-d", run: duplicate },
            { label: t("tikz.copy"), keys: "Mod-c", run: copy },
            { label: t("tikz.paste"), keys: "Mod-v", disabled: !clipboard.length, run: paste },
            { separator: true },
            { label: t("tikz.toFront"), icon: "chevron-up", run: () => reorder(true) },
            { label: t("tikz.toBack"), icon: "chevron-down", run: () => reorder(false) },
            { separator: true },
            { label: t("tikz.saveSet"), icon: "star", disabled: !onsaveset, run: () => onsaveset?.() },
            { separator: true },
            { label: t("common.delete"), icon: "trash", danger: true, run: remove },
          ]
        : [
            { label: t("tikz.paste"), keys: "Mod-v", disabled: !clipboard.length, run: paste },
            { label: t("tikz.selectAll"), keys: "Mod-a", run: () => (selected = drawing.shapes.filter((s) => s.kind !== "code").map((s) => s.id)) },
            { label: t("tikz.fit"), icon: "fit-page", run: fit },
          ],
    );
  }

  // ---------------------------------------------------------- rendering

  const shown = $derived(draft ? [...drawing.shapes, draft] : drawing.shapes);
  const selectedShape = $derived(selected.length === 1 ? byId(selected[0]) : undefined);

  /** The box around several selected shapes: they are resized together from its corners. */
  const group = $derived(selected.length > 1 ? bounds(drawing.shapes.filter((s) => selected.includes(s.id))) : null);

  const handles = $derived.by((): { id: string; p: Point }[] => {
    if (group && group.maxX > group.minX && group.maxY > group.minY)
      return [
        { id: "g-sw", p: { x: group.minX, y: group.minY } },
        { id: "g-se", p: { x: group.maxX, y: group.minY } },
        { id: "g-nw", p: { x: group.minX, y: group.maxY } },
        { id: "g-ne", p: { x: group.maxX, y: group.maxY } },
      ];
    const s = selectedShape;
    if (!s) return [];
    if (s.kind === "path") return s.points.map((p, i) => ({ id: String(i), p }));
    if (s.kind === "rect")
      return [
        { id: "fxfy", p: s.from },
        { id: "txty", p: s.to },
        { id: "fxty", p: { x: s.from.x, y: s.to.y } },
        { id: "txfy", p: { x: s.to.x, y: s.from.y } },
      ];
    if (s.kind === "circle") return [{ id: "r", p: { x: s.center.x + s.r, y: s.center.y } }];
    if (s.kind === "ellipse")
      return [
        { id: "rx", p: { x: s.center.x + s.rx, y: s.center.y } },
        { id: "ry", p: { x: s.center.x, y: s.center.y + s.ry } },
      ];
    return [];
  });

  /** HTML of a node's text: `$…$` parts rendered by KaTeX. */
  const nodeHtml = $state<Record<string, string>>({});
  $effect(() => {
    for (const s of drawing.shapes) {
      if (s.kind !== "node") continue;
      const key = s.text;
      if (nodeHtml[key] !== undefined) continue;
      nodeHtml[key] = escapeHtml(key);
      if (key.includes("$")) {
        const parts = key.split("$");
        void Promise.all(parts.map((part, i) => (i % 2 ? mathHtml(part) : Promise.resolve(escapeHtml(part.replace(/\\\\/g, " "))))))
          .then((html) => (nodeHtml[key] = html.join("")))
          .catch(() => {});
      }
    }
  });

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  }

  const FONT_SCALE: Record<string, number> = { "\\tiny": 0.5, "\\scriptsize": 0.7, "\\footnotesize": 0.8, "\\small": 0.9, "\\normalsize": 1, "\\large": 1.2, "\\Large": 1.44, "\\LARGE": 1.73, "\\huge": 2.07, "\\Huge": 2.49 };

  /** CSS transform placing a node's box relative to its point (TikZ anchors). */
  function nodeAnchor(position: string): string {
    const h = position.includes("left") ? "-100%" : position.includes("right") ? "0%" : "-50%";
    const v = position.includes("above") ? "-100%" : position.includes("below") ? "0%" : "-50%";
    const gapX = position.includes("left") ? " - 4px" : position.includes("right") ? " + 4px" : "";
    const gapY = position.includes("above") ? " - 4px" : position.includes("below") ? " + 4px" : "";
    return `translate(calc(${h}${gapX}), calc(${v}${gapY}))`;
  }
</script>

<!-- The drawing surface: keyboard shortcuts for tools, moves and history. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="board tool-{tool}"
  class:panning
  bind:this={host}
  tabindex="0"
  role="application"
  aria-label={t("tikz.board")}
  onkeydown={key}
  onkeyup={(e) => e.key === " " && (spaceDown = false)}
  onpointerleave={() => ((hover = null), (hoverId = null))}
  onwheel={wheel}
  oncontextmenu={menu}
>
  <svg {width} {height} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerUp} ondblclick={doubleClick} role="presentation">
    {#if showGrid}
      <path class="minor" d={grid.minor.join("")} />
      <path class="major" d={grid.major.join("")} />
    {/if}
    {#if showAxes}
      <path class="axis" d={`M${ox},0V${height}M0,${oy}H${width}`} />
      {#each labels as l, i (i)}<text class="tick" x={l.x} y={l.y}>{l.text}</text>{/each}
    {/if}

    {#each shown as s (s.id)}
      {#if s.kind !== "node" && s.kind !== "code"}
        {@const sw = strokeWidth(s.style)}
        {@const stroke = s.style.noStroke ? "none" : css(s.style.stroke, "#111")}
        {@const fill = s.style.fill ? css(s.style.fill, "none") : "none"}
        {@const op = s.style.opacity ?? 1}
        <g data-id={s.id} class="shape" class:sel={selected.includes(s.id)} class:hover={hoverId === s.id && !selected.includes(s.id)} opacity={op}>
          {#if s.kind === "path"}
            {@const pts = s.points.map(screen)}
            {#if s.closed}
              <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} {fill} {stroke} stroke-width={sw} stroke-dasharray={dash(s.style)} stroke-linejoin={s.style.rounded ? "round" : "miter"} />
            {:else}
              <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" {stroke} stroke-width={sw} stroke-dasharray={dash(s.style)} stroke-linejoin={s.style.rounded ? "round" : "miter"} />
            {/if}
            {#if s.style.arrow && pts.length >= 2 && stroke !== "none"}
              {#if s.style.arrow.endsWith(">") || s.style.arrow.endsWith("Stealth") || s.style.arrow.endsWith("|")}
                <polygon class="head" points={head(pts[pts.length - 2], pts[pts.length - 1], sw)} fill={stroke} />
              {/if}
              {#if s.style.arrow.startsWith("<") || s.style.arrow.startsWith("Stealth-")}
                <polygon class="head" points={head(pts[1], pts[0], sw)} fill={stroke} />
              {/if}
            {/if}
            <polyline class="hit" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
          {:else if s.kind === "rect"}
            {@const a = screen(s.from)}
            {@const b = screen(s.to)}
            <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} rx={s.style.rounded ? Math.min(8, 0.14 * scale) : 0} {fill} {stroke} stroke-width={sw} stroke-dasharray={dash(s.style)} />
            <rect class="hit" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} class:filled={!!s.style.fill} />
          {:else if s.kind === "circle"}
            {@const c = screen(s.center)}
            <circle cx={c.x} cy={c.y} r={s.r * scale} {fill} {stroke} stroke-width={sw} stroke-dasharray={dash(s.style)} />
            <circle class="hit" cx={c.x} cy={c.y} r={s.r * scale} class:filled={!!s.style.fill} />
          {:else if s.kind === "ellipse"}
            {@const c = screen(s.center)}
            <ellipse cx={c.x} cy={c.y} rx={s.rx * scale} ry={s.ry * scale} {fill} {stroke} stroke-width={sw} stroke-dasharray={dash(s.style)} />
            <ellipse class="hit" cx={c.x} cy={c.y} rx={s.rx * scale} ry={s.ry * scale} class:filled={!!s.style.fill} />
          {/if}
        </g>
      {/if}
    {/each}

    {#if draft?.kind === "path" && tool === "polygon"}
      {#each draft.points.slice(0, -1) as p, i (i)}
        <circle class="vertex" cx={toX(p.x)} cy={toY(p.y)} r="3.5" />
      {/each}
    {/if}

    {#if group}
      <rect class="group" x={toX(group.minX) - 6} y={toY(group.maxY) - 6} width={(group.maxX - group.minX) * scale + 12} height={(group.maxY - group.minY) * scale + 12} rx="3" />
    {/if}
    {#each handles as h (h.id)}
      {@const out = h.id.startsWith("g") ? 6 : 0}
      <rect class="handle" class:corner={out > 0} data-handle={h.id} x={toX(h.p.x) - 5 + (h.id.includes("e") ? out : h.id.includes("w") ? -out : 0)} y={toY(h.p.y) - 5 + (h.id.includes("n") ? -out : h.id.includes("s") ? out : 0)} width="10" height="10" rx="2" />
    {/each}
    {#if marquee}
      <rect class="marquee" x={Math.min(toX(marquee.a.x), toX(marquee.b.x))} y={Math.min(toY(marquee.a.y), toY(marquee.b.y))} width={Math.abs(marquee.b.x - marquee.a.x) * scale} height={Math.abs(marquee.b.y - marquee.a.y) * scale} />
    {/if}

    {#if hover && tool !== "select"}
      <circle class="cursor" cx={toX(hover.x)} cy={toY(hover.y)} r="3" />
    {/if}
  </svg>

  <!-- Nodes: HTML over the canvas. -->
  <div class="nodes">
    {#each drawing.shapes as s (s.id)}
      {#if s.kind === "node" && s.id !== editingNode}
        {@const c = screen(s.at)}
        {@const size = (FONT_SCALE[s.font ?? "\\normalsize"] ?? 1) * 0.3528 * scale}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="node"
          class:sel={selected.includes(s.id)}
          class:hover={hoverId === s.id && !selected.includes(s.id)}
          class:boxed={s.boxed}
          class:round={s.shape === "circle" || s.shape === "ellipse"}
          data-id={s.id}
          style:left="{c.x}px"
          style:top="{c.y}px"
          style:font-size="{size}px"
          style:transform={nodeAnchor(s.position)}
          style:color={css(s.textColor, "#111")}
          style:background={s.style.fill ? css(s.style.fill, "transparent") : "transparent"}
          style:border-color={css(s.style.stroke, "#111")}
          style:border-radius={s.style.rounded ? "0.3em" : undefined}
          onpointerdown={pointerDown}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          ondblclick={doubleClick}
        >
          {@html nodeHtml[s.text] ?? escapeHtml(s.text)}
        </div>
      {/if}
    {/each}
    {#if editingNode}
      {@const s = byId(editingNode)}
      {#if s?.kind === "node"}
        <input
          class="node-input input"
          style:left="{toX(s.at.x)}px"
          style:top="{toY(s.at.y)}px"
          bind:value={nodeText}
          placeholder={t("tikz.nodeText")}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitNode();
            if (e.key === "Escape") {
              nodeText = s.text;
              commitNode();
            }
          }}
          onblur={commitNode}
        />
      {/if}
    {/if}
  </div>

  <!-- What is selected: its actions, always at the same place. -->
  {#if selected.length && !editingNode}
    <div class="bar" role="toolbar" aria-label={plural(selected.length, "tikz.selectedOne", "tikz.selectedMany")}>
      <span class="count">{plural(selected.length, "tikz.selectedOne", "tikz.selectedMany")}</span>
      <button onclick={duplicate} title="{t('tikz.duplicate')} ({t('tikz.duplicateHint')})"><Icon name="copy" size={14} />{t("tikz.duplicate")}</button>
      <button class="icon" onclick={() => reorder(true)} title={t("tikz.toFront")} aria-label={t("tikz.toFront")}><Icon name="chevron-up" size={15} /></button>
      <button class="icon" onclick={() => reorder(false)} title={t("tikz.toBack")} aria-label={t("tikz.toBack")}><Icon name="chevron-down" size={15} /></button>
      {#if onsaveset}<button onclick={() => onsaveset?.()} title={t("tikz.saveSetTitle")}><Icon name="star" size={14} />{t("tikz.saveSet")}</button>{/if}
      <button class="icon danger" onclick={remove} title={t("common.delete")} aria-label={t("common.delete")}><Icon name="trash" size={14} /></button>
    </div>
  {/if}

  {#if hover}
    <div class="coords mono">({hover.x}, {hover.y})</div>
  {/if}
  {#if tool === "polygon" && draft}
    <div class="hint">{t("tikz.polygonHint")}</div>
  {/if}
</div>

<style>
  .board {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #fdfdfc;
    outline: none;
    touch-action: none;
  }
  .board:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent-soft);
  }
  svg {
    position: absolute;
    inset: 0;
    display: block;
    cursor: crosshair;
  }
  .tool-select svg {
    cursor: default;
  }
  .board.panning svg,
  .board.panning .node {
    cursor: grabbing;
  }
  .minor {
    stroke: #eceef1;
    stroke-width: 1;
  }
  .major {
    stroke: #dde1e7;
    stroke-width: 1;
  }
  .axis {
    stroke: #9aa3b0;
    stroke-width: 1.2;
  }
  .tick {
    fill: #8a93a0;
    font-size: 10px;
    font-family: var(--font-mono);
    pointer-events: none;
  }
  .shape {
    cursor: inherit;
  }
  .tool-select .shape {
    cursor: move;
  }
  .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
    pointer-events: stroke;
  }
  .hit.filled {
    pointer-events: all;
  }
  .shape.sel :not(.hit):not(.head) {
    filter: drop-shadow(0 0 2px color-mix(in srgb, var(--accent) 90%, transparent));
  }
  /* What a click would take, before it is taken. */
  .tool-select .shape.hover :not(.hit):not(.head) {
    filter: drop-shadow(0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent));
  }
  .head {
    pointer-events: none;
  }
  .group {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    pointer-events: none;
  }
  .marquee {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 1;
    pointer-events: none;
  }
  .handle.corner {
    cursor: nwse-resize;
  }
  .handle {
    fill: #fff;
    stroke: var(--accent);
    stroke-width: 2;
    cursor: grab;
  }
  .vertex {
    fill: var(--accent);
  }
  .cursor {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    pointer-events: none;
  }
  .nodes {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .node {
    position: absolute;
    padding: 0.2em 0.33em;
    border: 1px solid transparent;
    white-space: nowrap;
    font-family: "Latin Modern Roman", "CMU Serif", "Times New Roman", serif;
    line-height: 1.2;
    pointer-events: auto;
    cursor: move;
    user-select: none;
  }
  .node.boxed {
    border-color: inherit;
    border-style: solid;
  }
  .node:not(.boxed) {
    border-color: transparent !important;
  }
  .node.round {
    border-radius: 50%;
  }
  .node.sel {
    outline: 2px solid color-mix(in srgb, var(--accent) 90%, transparent);
    outline-offset: 2px;
  }
  .tool-select .node.hover {
    outline: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 2px;
  }
  .bar {
    position: absolute;
    top: 10px;
    left: 50%;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    transform: translateX(-50%);
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-elev);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
    white-space: nowrap;
  }
  .bar .count {
    padding: 0 8px 0 6px;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .bar button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 9px;
    border: none;
    border-radius: 7px;
    background: none;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
  }
  .bar button.icon {
    padding: 0 7px;
  }
  .bar button:hover {
    background: var(--bg-hover);
  }
  .bar button.danger:hover {
    color: var(--error);
  }
  .node :global(.katex) {
    font-size: 1.05em;
  }
  .node-input {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 220px;
    z-index: 2;
  }
  .coords {
    position: absolute;
    right: 10px;
    bottom: 8px;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.85);
    color: #555;
    font-size: 11.5px;
    pointer-events: none;
  }
  .hint {
    position: absolute;
    left: 50%;
    top: 10px;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(20, 20, 30, 0.8);
    color: #fff;
    font-size: 12px;
    pointer-events: none;
  }
</style>
