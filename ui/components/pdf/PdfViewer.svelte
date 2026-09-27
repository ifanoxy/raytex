<script lang="ts">
  // PDF viewer built on pdf.js: only visible pages are rendered (memory
  // stays flat on long documents), rebuilt PDFs reload without losing the
  // position, SyncTeX works both ways (double-click → source; source →
  // highlighted rectangles).
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
  import { onDestroy, onMount, tick } from "svelte";
  import { keyFor } from "$lib/actions";
  import { t } from "$lib/i18n.svelte";
  import * as ipc from "$lib/ipc";
  import { app } from "$lib/state/app.svelte";
  import { build } from "$lib/state/build.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { viewer } from "$lib/state/viewer.svelte";
  import { basename, prettyKey } from "$lib/utils";
  import Icon from "../common/Icon.svelte";

  type PdfJs = typeof import("../../lib/pdf/pdfjs");

  /** A page rendered (or being rendered) at a given scale for a given document. */
  interface Rendered {
    scale: number;
    doc: number;
    task: RenderTask | null;
    text: { cancel(): void } | null;
  }

  /** Maximum canvas size, in device pixels (keeps memory bounded at high zoom). */
  const MAX_PIXELS = 16_000_000;
  /** Pages rendered around the visible ones. */
  const MARGIN = 1;

  let lib: PdfJs | null = null;
  let scroller = $state<HTMLDivElement | null>(null);
  let pagesEl = $state<HTMLDivElement | null>(null);
  let doc: PDFDocumentProxy | null = null;
  let docId = 0;
  let sizes = $state<{ w: number; h: number }[]>([]);
  let scale = $state(1);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let missing = $state(false);
  let pageInput = $state("1");
  let highlights = $state<{ page: number; x: number; y: number; w: number; h: number; token: number }[]>([]);
  const rendered = new Map<number, Rendered>();
  let resizeObserver: ResizeObserver | null = null;
  let loadToken = 0;

  const invert = $derived(app.theme === "dark" && (app.settings?.viewer.invertInDark ?? false));

  onMount(() => {
    resizeObserver = new ResizeObserver(() => updateScale());
    if (scroller) resizeObserver.observe(scroller);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    if (scrollTimer) clearTimeout(scrollTimer);
    clearRendered();
    lib?.closePdf(doc);
    doc = null;
  });

  // Load (or reload) when the file or its revision changes.
  $effect(() => {
    const path = viewer.pdf;
    void viewer.revision;
    if (path) void load(path);
    else reset();
  });

  // Zoom mode changes.
  $effect(() => {
    void viewer.zoom;
    updateScale();
  });

  // SyncTeX forward: scroll to and highlight the rectangles.
  $effect(() => {
    const target = viewer.forwardTarget;
    if (!target || !sizes.length) return;
    void showForward(target.page, target.rects, target.token);
  });

  function reset() {
    clearRendered();
    lib?.closePdf(doc);
    doc = null;
    sizes = [];
    viewer.pages = 0;
    error = null;
    missing = false;
  }

  function clearRendered() {
    for (const i of [...rendered.keys()]) release(i);
  }

  /** Stops rendering page `i` and frees its canvas. */
  function release(i: number) {
    const r = rendered.get(i);
    r?.task?.cancel();
    r?.text?.cancel();
    rendered.delete(i);
    const el = pagesEl?.children[i];
    const canvas = el?.querySelector<HTMLCanvasElement>(".canvas");
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
    }
    el?.querySelector(".textLayer")?.remove();
  }

  /** Position to restore after a reload or a zoom: page and fraction within it. */
  function anchor(): { page: number; within: number; left: number } | null {
    if (!scroller || !pagesEl) return null;
    const top = scroller.scrollTop;
    const children = pagesEl.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      if (el.offsetTop + el.offsetHeight > top) {
        return { page: i, within: (top - el.offsetTop) / Math.max(1, el.offsetHeight), left: scroller.scrollLeft / Math.max(1, scroller.scrollWidth) };
      }
    }
    return null;
  }

  function restore(a: { page: number; within: number; left: number } | null) {
    if (!a || !scroller || !pagesEl) return;
    const el = pagesEl.children[Math.min(a.page, pagesEl.children.length - 1)] as HTMLElement | undefined;
    if (!el) return;
    scroller.scrollTop = el.offsetTop + a.within * el.offsetHeight;
    scroller.scrollLeft = a.left * scroller.scrollWidth;
  }

  async function load(path: string) {
    const token = ++loadToken;
    loading = true;
    error = null;
    try {
      lib ??= await import("../../lib/pdf/pdfjs");
      let bytes: ArrayBuffer;
      try {
        bytes = await ipc.readBinaryFile(path);
      } catch {
        if (token === loadToken) {
          missing = true;
          reset();
          missing = true;
        }
        return;
      }
      const next = await lib.loadPdf(bytes);
      if (token !== loadToken) {
        lib.closePdf(next);
        return;
      }
      const first = (await next.getPage(1)).getViewport({ scale: 1 });
      const keep = anchor();
      const old = doc;
      doc = next;
      docId++;
      missing = false;
      // Same size for every page until each one is measured when rendered.
      const count = next.numPages;
      const same = sizes.length === count;
      sizes = same ? sizes : Array.from({ length: count }, () => ({ w: first.width, h: first.height }));
      viewer.pages = count;
      updateScale(false);
      await tick();
      restore(keep);
      await renderVisible();
      lib.closePdf(old);
    } catch (e) {
      if (token === loadToken) error = String(e);
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  function computeScale(): number {
    const z = viewer.zoom;
    if (typeof z === "number") return z;
    if (!scroller || !sizes.length) return 1;
    const ref = sizes[Math.min(viewer.page - 1, sizes.length - 1)] ?? sizes[0];
    const width = scroller.clientWidth - 28;
    const byWidth = width / ref.w;
    if (z === "page-width") return Math.max(0.2, byWidth);
    return Math.max(0.2, Math.min(byWidth, (scroller.clientHeight - 24) / ref.h));
  }

  function updateScale(keepPosition = true) {
    const next = computeScale();
    if (Math.abs(next - scale) < 0.001) return;
    const keep = keepPosition ? anchor() : null;
    scale = next;
    viewer.scale = next;
    void tick().then(() => {
      if (keep) restore(keep);
      void renderVisible();
    });
  }

  /** Indices of the pages intersecting the viewport (plus half a screen above and below). */
  function visiblePages(): number[] {
    if (!scroller || !pagesEl) return [];
    const margin = scroller.clientHeight / 2;
    const top = scroller.scrollTop - margin;
    const bottom = scroller.scrollTop + scroller.clientHeight + margin;
    const out: number[] = [];
    const children = pagesEl.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      if (el.offsetTop > bottom) break;
      if (el.offsetTop + el.offsetHeight >= top) out.push(i);
    }
    return out;
  }

  async function renderVisible() {
    if (!doc) return;
    const wanted = new Set<number>();
    for (const i of visiblePages()) for (let d = -MARGIN; d <= MARGIN; d++) if (i + d >= 0 && i + d < sizes.length) wanted.add(i + d);
    for (const i of [...rendered.keys()]) if (!wanted.has(i)) release(i);
    await Promise.all([...wanted].map((i) => renderPage(i)));
  }

  async function renderPage(i: number) {
    const current = rendered.get(i);
    if (current && current.scale === scale && current.doc === docId) return;
    current?.task?.cancel();
    current?.text?.cancel();
    const d = doc;
    if (!d || !lib) return;
    // Reserved before any await: a page is never rendered twice at once.
    const entry: Rendered = { scale, doc: docId, task: null, text: null };
    rendered.set(i, entry);
    const failed = (why?: unknown) => {
      if (import.meta.env.DEV) void ipc.logFrontend("info", `pdf page ${i + 1} not rendered: ${why} (current: ${rendered.get(i) === entry})`).catch(() => {});
      if (rendered.get(i) === entry) rendered.delete(i);
    };
    let page;
    try {
      page = await d.getPage(i + 1);
    } catch (e) {
      return failed(e);
    }
    if (rendered.get(i) !== entry) return;
    const viewport = page.getViewport({ scale: entry.scale });
    const w = viewport.width / entry.scale;
    const h = viewport.height / entry.scale;
    if (Math.abs(sizes[i].w - w) > 0.5 || Math.abs(sizes[i].h - h) > 0.5) sizes[i] = { w, h };
    const dpr = window.devicePixelRatio || 1;
    const out = Math.min(dpr, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
    const canvas = document.createElement("canvas");
    canvas.className = "canvas";
    canvas.width = Math.floor(viewport.width * out);
    canvas.height = Math.floor(viewport.height * out);
    entry.task = page.render({ canvas, viewport, transform: out !== 1 ? [out, 0, 0, out, 0, 0] : undefined });
    try {
      await entry.task.promise;
    } catch (e) {
      return failed(e); // cancelled or broken: a later pass retries
    }
    entry.task = null;
    const el = pagesEl?.children[i] as HTMLElement | undefined;
    if (rendered.get(i) !== entry || !el) {
      if (import.meta.env.DEV) void ipc.logFrontend("info", `pdf page ${i + 1} superseded (el: ${!!el})`).catch(() => {});
      canvas.width = canvas.height = 0;
      return;
    }
    // Swap canvases only once the new one is ready: no white flash on reload.
    const old = el.querySelector<HTMLCanvasElement>(".canvas");
    if (old) {
      old.replaceWith(canvas);
      old.width = old.height = 0;
    } else {
      el.prepend(canvas);
    }
    const layer = document.createElement("div");
    layer.className = "textLayer";
    const text = new lib.pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
    entry.text = text;
    try {
      await text.render();
    } catch {
      return;
    }
    if (rendered.get(i) !== entry) return;
    el.querySelector(".textLayer")?.remove();
    el.appendChild(layer);
  }

  let scrollTimer: ReturnType<typeof setTimeout> | null = null;

  function onScroll() {
    if (!scroller || !pagesEl) return;
    if (!scrollTimer)
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        void renderVisible();
      }, 30);
    const middle = scroller.scrollTop + scroller.clientHeight / 3;
    const children = pagesEl.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      if (el.offsetTop + el.offsetHeight >= middle) {
        if (viewer.page !== i + 1) {
          viewer.page = i + 1;
          pageInput = String(i + 1);
        }
        break;
      }
    }
  }

  function goToPage(n: number) {
    if (!pagesEl || !scroller || !sizes.length) return;
    const i = Math.max(1, Math.min(sizes.length, n)) - 1;
    const el = pagesEl.children[i] as HTMLElement;
    scroller.scrollTop = el.offsetTop - 12;
    pageInput = String(i + 1);
  }

  async function showForward(pageNo: number, rects: { x: number; y: number; width: number; height: number }[], token: number) {
    await tick();
    if (!pagesEl || !scroller) return;
    const i = pageNo - 1;
    const el = pagesEl.children[i] as HTMLElement | undefined;
    if (!el) return;
    highlights = rects.map((r) => ({ page: i, x: r.x, y: r.y, w: r.width, h: r.height, token }));
    const first = rects[0];
    const y = Math.max(0, el.offsetTop + first.y * scale - scroller.clientHeight / 3);
    // Jump directly when far away (a long smooth scroll is slow and WebKit may stop it).
    const far = Math.abs(y - scroller.scrollTop) > scroller.clientHeight * 1.5;
    scroller.scrollTo({ top: y, behavior: far ? "auto" : "smooth" });
    if (far) void renderVisible();
    const x = el.offsetLeft + first.x * scale - scroller.clientWidth / 2;
    if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = Math.max(0, x);
    setTimeout(() => {
      if (highlights[0]?.token === token) highlights = [];
    }, 2600);
  }

  function dblclick(e: MouseEvent, i: number) {
    if (app.settings?.viewer.doubleClickSync === false) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    window.getSelection()?.removeAllRanges();
    void viewer.inverse(i + 1, x, y);
  }

  function wheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    // Pinch-to-zoom on trackpads and Ctrl+wheel, anchored at the pointer.
    e.preventDefault();
    if (!scroller) return;
    const factor = Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 20 ? 0.02 : 0.004));
    const next = Math.min(5, Math.max(0.25, scale * factor));
    const rect = scroller.getBoundingClientRect();
    const px = e.clientX - rect.left + scroller.scrollLeft;
    const py = e.clientY - rect.top + scroller.scrollTop;
    const ratio = next / scale;
    viewer.zoom = next;
    scale = next;
    viewer.scale = next;
    void tick().then(() => {
      if (!scroller) return;
      scroller.scrollLeft = px * ratio - (e.clientX - rect.left);
      scroller.scrollTop = py * ratio - (e.clientY - rect.top);
      void renderVisible();
    });
  }

  function key(e: KeyboardEvent) {
    if (!scroller) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "=" || e.key === "+")) viewer.zoomBy(1.15);
    else if (mod && e.key === "-") viewer.zoomBy(1 / 1.15);
    else if (mod && e.key === "0") viewer.zoom = "page-width";
    else if (e.key === "Home") goToPage(1);
    else if (e.key === "End") goToPage(sizes.length);
    else if (e.key === "ArrowRight" && !mod && scroller.scrollWidth <= scroller.clientWidth) goToPage(viewer.page + 1);
    else if (e.key === "ArrowLeft" && !mod && scroller.scrollWidth <= scroller.clientWidth) goToPage(viewer.page - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const zoomLabel = $derived(viewer.zoom === "page-width" ? t("viewer.fitWidth") : viewer.zoom === "page-fit" ? t("viewer.fitPage") : `${Math.round(scale * 100)} %`);

  function zoomMenu(e: MouseEvent) {
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      { label: t("viewer.fitWidth"), icon: "fit-width", checked: viewer.zoom === "page-width", run: () => (viewer.zoom = "page-width") },
      { label: t("viewer.fitPage"), icon: "fit-page", checked: viewer.zoom === "page-fit", run: () => (viewer.zoom = "page-fit") },
      { separator: true },
      ...[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((z) => ({ label: `${z * 100} %`, checked: viewer.zoom === z, run: () => (viewer.zoom = z) })),
    ]);
  }

  function moreMenu(e: MouseEvent) {
    ui.openMenuBelow(e.currentTarget as HTMLElement, [
      { label: t("action.exportPdf"), icon: "download", disabled: !viewer.pdf, run: () => viewer.exportPdf() },
      { label: t("action.openPdfExternal"), icon: "external", disabled: !viewer.pdf, run: () => viewer.openExternal() },
      { label: t("viewer.reload"), icon: "refresh", disabled: !viewer.pdf, run: () => viewer.pdf && viewer.load(viewer.pdf) },
      { separator: true },
      {
        label: t("viewer.invert"),
        icon: "moon",
        checked: app.settings?.viewer.invertInDark,
        run: () => app.update((s) => (s.viewer.invertInDark = !s.viewer.invertInDark)),
      },
      {
        label: t("viewer.syncAfterBuild"),
        icon: "sync",
        checked: app.settings?.viewer.syncAfterBuild,
        run: () => app.update((s) => (s.viewer.syncAfterBuild = !s.viewer.syncAfterBuild)),
      },
    ]);
  }
</script>

<div class="pdf-viewer" class:invert>
  <div class="bar">
    <div class="pages-nav">
      <button class="icon-btn" disabled={viewer.page <= 1} onclick={() => goToPage(viewer.page - 1)} title={t("viewer.previous")}><Icon name="chevron-up" /></button>
      <input
        class="input small page-input"
        bind:value={pageInput}
        onkeydown={(e) => e.key === "Enter" && goToPage(parseInt(pageInput, 10) || 1)}
        onblur={() => (pageInput = String(viewer.page))}
        aria-label={t("viewer.page")}
      />
      <span class="faint">/ {viewer.pages || "–"}</span>
      <button class="icon-btn" disabled={viewer.page >= viewer.pages} onclick={() => goToPage(viewer.page + 1)} title={t("viewer.next")}><Icon name="chevron-down" /></button>
    </div>
    <div class="spacer"></div>
    <button class="icon-btn" onclick={() => viewer.zoomBy(1 / 1.15)} title={t("viewer.zoomOut")}><Icon name="zoom-out" /></button>
    <button class="zoom" onclick={zoomMenu}>{zoomLabel}</button>
    <button class="icon-btn" onclick={() => viewer.zoomBy(1.15)} title={t("viewer.zoomIn")}><Icon name="zoom-in" /></button>
    <button class="icon-btn" class:active={viewer.zoom === "page-width"} onclick={() => (viewer.zoom = viewer.zoom === "page-width" ? "page-fit" : "page-width")} title={t("viewer.toggleFit")}>
      <Icon name={viewer.zoom === "page-width" ? "fit-page" : "fit-width"} />
    </button>
    <button class="icon-btn" onclick={moreMenu} title={t("viewer.more")}><Icon name="more" /></button>
  </div>

  <!-- A scrollable region must be focusable to be scrolled with the keyboard. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="scroller" bind:this={scroller} onscroll={onScroll} onwheel={wheel} onkeydown={key} tabindex="0" role="document" aria-label={viewer.pdf ? basename(viewer.pdf) : t("viewer.empty")}>
    {#if sizes.length && !missing}
      <div class="pages" bind:this={pagesEl}>
        {#each sizes as s, i (i)}
          <div
            class="page"
            data-index={i}
            style:width="{s.w * scale}px"
            style:height="{s.h * scale}px"
            style="--scale-factor: {scale}; --total-scale-factor: {scale}; --user-unit: 1"
            ondblclick={(e) => dblclick(e, i)}
            role="presentation"
          >
            <!-- Own container: Svelte may clear an element whose only child is a list,
                 which would also remove the canvas and text layer added by renderPage. -->
            <div class="highlights">
              {#each highlights.filter((h) => h.page === i) as h (h.token + ":" + h.x + ":" + h.y)}
                <div class="highlight" style:left="{h.x * scale - 2}px" style:top="{h.y * scale - 2}px" style:width="{h.w * scale + 4}px" style:height="{h.h * scale + 4}px"></div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div class="message">
        <Icon name="alert-triangle" size={32} stroke={1.3} />
        <p>{t("viewer.error")}</p>
        <code class="selectable">{error}</code>
      </div>
    {:else if loading}
      <div class="message"><span class="spinner"></span></div>
    {:else}
      <div class="message">
        <Icon name="pdf" size={40} stroke={1.2} />
        <p>{missing ? t("viewer.notBuilt") : t("viewer.empty")}</p>
        <button class="btn primary" onclick={() => build.run()} disabled={build.running}>
          <Icon name="play" size={13} />
          {t("toolbar.build")}
          <kbd>{prettyKey(keyFor("build.run") ?? "")}</kbd>
        </button>
      </div>
    {/if}
  </div>
  {#if loading && sizes.length}<div class="progress"></div>{/if}
</div>

<style>
  .pdf-viewer {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--pdf-bg);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 36px;
    padding: 0 6px;
    flex-shrink: 0;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--border);
  }
  .pages-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
  .page-input {
    width: 44px;
    height: 24px;
    padding: 0 4px;
    text-align: center;
  }
  .zoom {
    min-width: 76px;
    height: 24px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .zoom:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .scroller {
    flex: 1;
    overflow: auto;
    outline: none;
  }
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 12px 14px 40px;
    width: max-content;
    min-width: 100%;
  }
  .page {
    position: relative;
    flex-shrink: 0;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), 0 4px 18px rgba(0, 0, 0, 0.12);
  }
  .page :global(.canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .invert .page {
    background: #1a1a1a;
  }
  .invert .page :global(.canvas) {
    filter: invert(0.88) hue-rotate(180deg);
  }
  .highlights {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
  }
  .highlight {
    position: absolute;
    border-radius: 3px;
    background: color-mix(in srgb, var(--accent) 28%, transparent);
    outline: 2px solid var(--accent);
    pointer-events: none;
    animation: pulse 2.6s ease-out forwards;
  }
  @keyframes pulse {
    0% {
      opacity: 0;
      transform: scale(1.3);
    }
    12% {
      opacity: 1;
      transform: scale(1);
    }
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  .message {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    color: var(--text-faint);
    text-align: center;
  }
  .message p {
    margin: 0;
    color: var(--text-muted);
  }
  .message code {
    max-width: 90%;
    font-size: 11px;
    white-space: pre-wrap;
  }
  .progress {
    position: absolute;
    top: 36px;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    background-size: 50% 100%;
    animation: slide 1s linear infinite;
  }
  @keyframes slide {
    from {
      background-position: -50% 0;
    }
    to {
      background-position: 150% 0;
    }
  }

  /* pdf.js text layer (selectable, invisible text over the canvas). */
  .page :global(.textLayer) {
    position: absolute;
    inset: 0;
    overflow: clip;
    line-height: 1;
    text-align: initial;
    transform-origin: 0 0;
    z-index: 2;
    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
  }
  .page :global(.textLayer :is(span, br)) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    user-select: text;
    -webkit-user-select: text;
  }
  .page :global(.textLayer > :not(.markedContent)),
  .page :global(.textLayer .markedContent span:not(.markedContent)) {
    z-index: 1;
    --font-height: 0;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    --scale-x: 1;
    --rotate: 0deg;
    transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
  }
  .page :global(.textLayer .markedContent) {
    display: contents;
  }
  .page :global(.textLayer ::selection) {
    background: rgba(40, 110, 255, 0.28);
  }
  .page :global(.textLayer .endOfContent) {
    display: block;
    position: absolute;
    inset: 100% 0 0;
    z-index: 0;
    cursor: default;
    user-select: none;
  }
</style>
