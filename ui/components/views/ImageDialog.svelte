<script lang="ts">
  // Insert images: choose, paste or drop them (or pick images of the
  // project), then folder, name, size, placement and caption. The images are
  // copied into the project (converted when LaTeX cannot read them) and the
  // figure is inserted at the cursor with the packages it needs.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { onDestroy, onMount } from "svelte";
  import { sizeLabel } from "$lib/history";
  import { i18n, t } from "$lib/i18n.svelte";
  import { ACCEPTED, extensionOf, figureCode, MAX_COLUMNS, mimeOf, safeStem, stemOf, targetExtension, timestamp, toPng, TO_PNG } from "$lib/images";
  import * as ipc from "$lib/ipc";
  import { pictureFolder } from "$lib/pictures";
  import { addPackages, graphicsPaths } from "$lib/preamble";
  import { editor } from "$lib/state/editor.svelte";
  import { type ImageEdit, type ImageGroupEdit, media } from "$lib/state/media.svelte";
  import { project } from "$lib/state/project.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { FileNode } from "$lib/types";
  import { dirname, escapeSnippet, join, relative, uid } from "$lib/utils";
  import Icon from "../common/Icon.svelte";
  import Modal from "../common/Modal.svelte";

  interface Item {
    id: string;
    /**
     * `project`: already in the project and readable by LaTeX (used where it
     * is); `kept`: a picture of the document whose file was not found, left
     * as it is written.
     */
    kind: "file" | "blob" | "project" | "kept";
    path?: string;
    /** What the document writes in `\includegraphics{…}` for it: kept as it is. */
    written?: string;
    /** Its own label in the document (sub-figure), kept as it is; undefined: one is made with its caption. */
    label?: string;
    blob?: Blob;
    original: string;
    /** File name without extension, in the project. */
    stem: string;
    ext: string;
    url: string | null;
    ratio: number | null;
    caption: string;
    /** What it shows, in words (`alt={…}`): read aloud by screen readers in an accessible PDF. */
    alt: string;
    /** Size of the image as it is, in bytes, once read. */
    size?: number;
    /** The image as a PNG, once converted (a format LaTeX does not read). */
    png?: Uint8Array;
  }

  /** How much the images copied into the project are lightened. */
  type Weight = "original" | ipc.CompressionLevel;
  const WEIGHTS: Weight[] = ["original", "balanced", "light"];
  const WEIGHT_KEY = "raytex.image.weight";
  const lang = i18n.lang === "fr" ? "fr" : "en";

  /** Stands for an empty caption until the code becomes a snippet. */
  const CAPTION_FIELD = "\u0001caption\u0001";

  let items = $state<Item[]>([]);
  let rootDir = $state("");
  let rootText = "";
  let folder = $state("figures");
  let mode = $state<"figure" | "inline">("figure");
  let width = $state(80);
  let placement = $state("htbp");
  let caption = $state("");
  let label = $state("");
  let labelEdited = $state(false);
  let columns = $state(2);
  let busy = $state(false);
  let showProject = $state(false);
  let dragOver = $state(false);
  /** A picture of the document being changed (chip after `\includegraphics`). */
  let edit = $state<ImageEdit | null>(null);
  /** Several pictures of the document, written together, being changed. */
  let group = $state<ImageGroupEdit | null>(null);
  /** What "Update" rewrites: that picture, or those pictures. */
  const changed = $derived(edit ? { doc: edit.doc, from: edit.figure.from, to: edit.figure.to, indent: edit.indent, unit: edit.unit } : group ? { doc: group.doc, from: group.group.from, to: group.group.to, indent: group.indent, unit: group.unit } : null);
  /** Options of that picture other than a width of the line, kept until the width is changed. */
  let keepOptions = $state<string | null>(null);
  /** Kept from one time to the next: who wants light images wants them each time. */
  let weight = $state<Weight>(
    (() => {
      try {
        const saved = localStorage.getItem(WEIGHT_KEY);
        return WEIGHTS.includes(saved as Weight) ? (saved as Weight) : "original";
      } catch {
        return "original";
      }
    })(),
  );
  /** What each image would weigh at a level, by `id:level`; `null` while it is being worked out. */
  let weights = $state<Record<string, ipc.ImageWeight | null>>({});
  let rootReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => (rootReady = resolve));

  const multiple = $derived(items.length > 1);

  onMount(async () => {
    const root = await editor.rootOf();
    if (root) {
      rootDir = dirname(root);
      rootText = editor.textOf(root) ?? (await ipc.readTextFile(root).then((f) => f.text).catch(() => ""));
    }
    folder = pictureFolder(folders(), graphicsPaths(rootText));
    window.addEventListener("paste", onPaste);
    rootReady();
  });

  onDestroy(() => {
    window.removeEventListener("paste", onPaste);
    for (const it of items) if (it.url) URL.revokeObjectURL(it.url);
  });

  // Files handed over by the editor (paste, drop) or the file tree.
  $effect(() => {
    const request = media.imageRequest;
    if (!request) return;
    media.imageRequest = null;
    for (const p of request.paths ?? []) void addPath(p);
    for (const b of request.blobs ?? []) void addBlob(b);
    const change = request.edit;
    const several = request.group;
    // After the root is known: an image of the project is used where it is.
    if (change) void ready.then(() => startEdit(change));
    if (several) void ready.then(() => startGroup(several));
  });

  function startEdit(change: ImageEdit) {
    edit = change;
    const f = change.figure;
    mode = f.mode;
    if (f.width !== null) width = f.width;
    else keepOptions = f.options;
    placement = f.placement || "htbp";
    caption = f.caption;
    label = f.label;
    labelEdited = true;
    if (change.file) void addPath(change.file, { written: f.path, alt: f.alt });
    else ui.toast("warning", t("image.missing", { path: f.path }));
  }

  /** The pictures of a group, in their order, with what the document says of each. */
  function startGroup(change: ImageGroupEdit) {
    group = change;
    const g = change.group;
    mode = g.mode;
    if (g.width !== null) width = g.width;
    else if (g.options !== null) keepOptions = g.options;
    placement = g.placement || "htbp";
    caption = g.caption;
    label = g.label;
    labelEdited = true;
    columns = g.columns;
    g.images.forEach((image, i) => {
      const file = change.files[i];
      // A picture with a caption has the label it was given, none included; one without gets a label with its caption.
      const said = { written: image.path, caption: image.caption, label: image.caption || image.label ? image.label : undefined, alt: image.alt };
      if (file) void addPath(file, said);
      else items = [...items, { id: uid(), kind: "kept", original: image.path, stem: safeStem(stemOf(image.path)), ext: extensionOf(image.path), url: null, ratio: null, ...said }];
    });
  }

  /** Continuation lines indented like the first one, in the unit of the document. */
  function reindent(code: string, indent: string, unit: string): string {
    return code
      .split("\n")
      .map((line, i) => (i === 0 ? line : indent + line.replace(/^\t+/, (tabs) => unit.repeat(tabs.length))))
      .join("\n");
  }

  // The figure label follows the first image until edited.
  $effect(() => {
    if (!labelEdited) label = items.length ? `fig:${items.length > 1 ? `${items[0].stem}-group` : items[0].stem}` : "";
  });

  function flatten(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
    for (const n of nodes) {
      out.push(n);
      if (n.dir) flatten(n.children ?? [], out);
    }
    return out;
  }

  /** Folders of the project, relative to the root document. */
  function folders(): string[] {
    return flatten(project.tree)
      .filter((n) => n.dir && relative(rootDir, n.path) !== n.path.replace(/\\/g, "/"))
      .map((n) => relative(rootDir, n.path));
  }

  const projectImages = $derived(
    flatten(project.tree).filter((n) => !n.dir && ["png", "jpg", "jpeg", "pdf", "eps", "svg"].includes(extensionOf(n.name))),
  );

  function inProject(path: string): boolean {
    return !!rootDir && relative(rootDir, path) !== path.replace(/\\/g, "/");
  }

  /** Images a lighter copy can be made of: those copied into the project, but drawings (PDF, EPS, SVG). */
  function compressible(item: Item): boolean {
    if (item.kind !== "file" && item.kind !== "blob") return false;
    const ext = item.kind === "blob" ? targetExtension(item.ext, item.blob?.type) : item.ext;
    return ["png", "jpg", "jpeg"].includes(ext) || TO_PNG.includes(item.ext);
  }

  /** The bytes of an image as LaTeX can read them: its own for a PNG or a JPEG, a PNG made of it otherwise. */
  async function rasterBytes(item: Item): Promise<Uint8Array> {
    const direct = item.kind === "blob" ? item.blob!.type === "image/png" || item.blob!.type === "image/jpeg" : !TO_PNG.includes(item.ext);
    const blob = item.blob ?? new Blob([await ipc.readBinaryFile(item.path!)], { type: mimeOf(item.ext) });
    if (direct) return new Uint8Array(await blob.arrayBuffer());
    item.png ??= await toPng(blob);
    return item.png;
  }

  // What each image would weigh at the level chosen, worked out once.
  $effect(() => {
    const level = weight;
    if (level === "original") return;
    for (const item of items) {
      const key = `${item.id}:${level}`;
      if (!compressible(item) || key in weights) continue;
      weights[key] = null;
      const asked = item.kind === "file" && !TO_PNG.includes(item.ext) ? ipc.imageWeight(item.path!, level) : rasterBytes(item).then((bytes) => ipc.imageWeightData(bytes, level));
      void asked.then(
        (w) => {
          weights[key] = w;
        },
        () => {
          weights[key] = { original: item.size ?? 0, compressed: null, ext: null };
        },
      );
    }
  });

  function chooseWeight(level: Weight) {
    weight = level;
    try {
      localStorage.setItem(WEIGHT_KEY, level);
    } catch {
      /* not remembered */
    }
  }

  /** What an image will weigh in the project at the level chosen (undefined: not known yet). */
  function weightOf(item: Item): ipc.ImageWeight | null | undefined {
    return weight === "original" || !compressible(item) ? undefined : weights[`${item.id}:${weight}`];
  }

  /** The total of the images copied: as they are, and as they will be. */
  const total = $derived.by(() => {
    let from = 0;
    let to = 0;
    let pending = false;
    for (const item of items) {
      if (item.kind !== "file" && item.kind !== "blob") continue;
      const size = item.size ?? 0;
      const w = weightOf(item);
      if (w === null) pending = true;
      from += w?.original || size;
      to += w?.compressed ?? (w?.original || size);
    }
    return { from, to, pending };
  });

  async function preview(item: Item, blob: Blob) {
    item.size = blob.size;
    if (item.ext === "pdf" || item.ext === "eps") return;
    item.url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => (item.ratio = img.naturalWidth / Math.max(1, img.naturalHeight));
    img.src = item.url;
  }

  async function addPath(path: string, said: { written?: string; caption?: string; label?: string; alt?: string } = {}) {
    const ext = extensionOf(path);
    if (!ACCEPTED.includes(ext)) {
      ui.toast("warning", t("image.unsupported", { name: path.split(/[\\/]/).pop() ?? path }));
      return;
    }
    if (items.some((i) => i.path === path)) return;
    const direct = ["png", "jpg", "jpeg", "pdf", "eps"].includes(ext);
    const item: Item = {
      id: uid(),
      kind: direct && inProject(path) ? "project" : "file",
      path,
      original: path.split(/[\\/]/).pop() ?? path,
      stem: safeStem(stemOf(path)),
      ext,
      url: null,
      ratio: null,
      caption: "",
      alt: "",
      ...said,
    };
    items = [...items, item];
    const added = items[items.length - 1];
    try {
      const bytes = await ipc.readBinaryFile(path);
      await preview(added, new Blob([bytes], { type: mimeOf(ext) }));
      if (ext === "pdf") void pdfRatio(added, bytes);
    } catch {
      /* preview unavailable */
    }
  }

  async function pdfRatio(item: Item, bytes: ArrayBuffer) {
    const { closePdf, loadPdf } = await import("$lib/pdf/pdfjs");
    try {
      const doc = await loadPdf(bytes.slice(0));
      const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
      item.ratio = vp.width / vp.height;
      closePdf(doc);
    } catch {
      /* ignore */
    }
  }

  async function addBlob(blob: Blob) {
    const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/svg+xml" ? "svg" : (blob.type.split("/")[1] ?? "png");
    const item: Item = {
      id: uid(),
      kind: "blob",
      blob,
      original: `${t("image.pasted")}.${ext}`,
      stem: `image-${timestamp()}`,
      ext,
      url: null,
      ratio: null,
      caption: "",
      alt: "",
    };
    items = [...items, item];
    await preview(items[items.length - 1], blob);
  }

  function onPaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    files.forEach((f) => void addBlob(f));
  }

  async function choose() {
    const picked = await open({ multiple: true, title: t("image.chooseTitle"), filters: [{ name: "Images", extensions: ACCEPTED }] });
    if (!picked) return;
    for (const p of Array.isArray(picked) ? picked : [picked]) await addPath(p);
  }

  function remove(item: Item) {
    if (item.url) URL.revokeObjectURL(item.url);
    items = items.filter((i) => i !== item);
  }

  /** The picture being dragged to another place by its handle, and the list it is in. */
  let dragging = $state<string | null>(null);
  let list = $state<HTMLElement | null>(null);

  function move(item: Item, to: number) {
    const from = items.indexOf(item);
    const target = Math.max(0, Math.min(items.length - 1, to));
    if (from < 0 || from === target) return;
    const next = [...items];
    next.splice(from, 1);
    next.splice(target, 0, item);
    items = next;
  }

  function dragStart(e: PointerEvent, item: Item) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = item.id;
  }

  /** The dragged picture takes the place of the one whose middle the pointer passed. */
  function dragMove(e: PointerEvent, item: Item) {
    if (dragging !== item.id || !list) return;
    const from = items.indexOf(item);
    const rows = [...list.querySelectorAll<HTMLElement>(".item")];
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      const middle = r.top + r.height / 2;
      if ((i > from && e.clientY > middle) || (i < from && e.clientY < middle)) move(item, i);
    });
  }

  function reorderKey(e: KeyboardEvent, item: Item) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    move(item, items.indexOf(item) + (e.key === "ArrowUp" ? -1 : 1));
  }

  function toggleProjectImage(path: string) {
    const existing = items.find((i) => i.path === path);
    if (existing) remove(existing);
    else void addPath(path);
  }

  /** Path written in `\includegraphics` (relative to the root, without extension, shortened by `\graphicspath`). */
  function includePath(file: string): string {
    let rel = relative(rootDir, file).replace(/\.(png|jpe?g|pdf|eps)$/i, "");
    for (const gp of graphicsPaths(rootText)) {
      const prefix = gp.endsWith("/") ? gp : `${gp}/`;
      if (rel.startsWith(prefix)) {
        rel = rel.slice(prefix.length);
        break;
      }
    }
    return rel;
  }

  function targetPath(item: Item): string {
    if (item.kind === "project" && item.path) return item.path;
    return join(rootDir, folder, `${item.stem}.${targetExtension(item.ext, item.blob?.type)}`);
  }

  /** The label of a picture among several: the one it has, else one made from its name once it has a caption. */
  function subLabel(item: Item): string {
    if (!multiple) return "";
    return item.label ?? (item.caption ? `fig:${item.stem}` : "");
  }

  const code = $derived(
    items.length
      ? figureCode({
          paths: items.map((i) => i.written ?? includePath(targetPath(i))),
          captions: items.map((i) => i.caption),
          alts: items.map((i) => i.alt),
          labels: items.map(subLabel),
          mode,
          width,
          placement,
          caption: caption || t("snippet.caption"),
          label,
          columns,
          options: keepOptions,
        })
      : "",
  );

  async function uniqueTarget(dir: string, stem: string, ext: string): Promise<string> {
    let candidate = join(dir, `${stem}.${ext}`);
    for (let n = 2; await ipc.pathExists(candidate); n++) candidate = join(dir, `${stem}-${n}.${ext}`);
    return candidate;
  }

  /** Copies or converts one image into the project; returns its path there. */
  async function importItem(item: Item): Promise<string> {
    const dir = join(rootDir, folder);
    if (item.kind === "kept") return item.written ?? "";
    if (item.kind === "project" && item.path) return item.path;
    // Lighter on its way in: the engine writes the copy, the image chosen is not touched.
    if (weight !== "original" && compressible(item)) {
      if (item.kind === "file" && !TO_PNG.includes(item.ext)) return ipc.importImage(item.path!, dir, `${item.stem}.${item.ext}`, weight);
      const ext = item.kind === "blob" && item.blob!.type === "image/jpeg" ? "jpg" : "png";
      return ipc.importImageData(dir, `${item.stem}.${ext}`, await rasterBytes(item), weight);
    }
    if (item.kind === "blob" && item.blob) {
      const direct = item.blob.type === "image/png" || item.blob.type === "image/jpeg";
      if (item.blob.type === "image/svg+xml") return ipc.importSvgData(dir, item.stem, new Uint8Array(await item.blob.arrayBuffer()));
      const target = await uniqueTarget(dir, item.stem, direct ? targetExtension(item.ext, item.blob.type) : "png");
      await ipc.writeBinaryFile(target, direct ? new Uint8Array(await item.blob.arrayBuffer()) : await toPng(item.blob));
      return target;
    }
    if (TO_PNG.includes(item.ext) && item.path) {
      const bytes = await ipc.readBinaryFile(item.path);
      const target = await uniqueTarget(dir, item.stem, "png");
      await ipc.writeBinaryFile(target, await toPng(new Blob([bytes], { type: mimeOf(item.ext) })));
      return target;
    }
    return ipc.importImage(item.path!, dir, `${item.stem}.${item.ext}`);
  }

  async function insert() {
    if (!items.length || busy) return;
    const view = editor.view;
    if (!view || editor.activeTab?.kind !== "tex" || view.state.readOnly) {
      ui.toast("warning", t("image.noDocument"));
      return;
    }
    busy = true;
    try {
      // Pasted images come with the dialog: the project's folder may not be known yet.
      await ready;
      // What the document already writes for a picture is kept as it is written.
      const paths: string[] = [];
      for (const item of items) {
        const file = await importItem(item);
        paths.push(item.written ?? includePath(file));
      }
      if (changed) {
        const rewritten = figureCode({
          paths,
          captions: items.map((i) => i.caption),
          alts: items.map((i) => i.alt),
          labels: items.map(subLabel),
          mode,
          width,
          placement,
          caption,
          label,
          columns,
          options: keepOptions,
        });
        editor.replaceRange(changed.doc, changed.from, changed.to, reindent(rewritten, changed.indent, changed.unit));
      }
      const final = figureCode({
        paths,
        captions: items.map((i) => i.caption),
        alts: items.map((i) => i.alt),
        labels: items.map(subLabel),
        mode,
        width,
        placement,
        caption: caption || CAPTION_FIELD,
        label,
        columns,
      });
      // A figure starts on its own line; an empty caption becomes a field to type in.
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const prefix = mode === "figure" && line.text.trim() !== "" ? "\n" : "";
      const body = escapeSnippet(prefix + final).replace(CAPTION_FIELD, `\${1:${t("snippet.caption")}}`);
      if (!changed) editor.insertSnippet(`${body}\${0}`, view);
      const packages = [{ name: "graphicx" }];
      if (mode === "figure" && multiple) packages.push({ name: "subcaption" });
      if (mode === "figure" && placement === "H") packages.push({ name: "float" });
      await editor.transformRoot((text) => addPackages(text, packages));
      await project.refreshTree();
      const copied = items.filter((i) => i.kind !== "project" && i.kind !== "kept").length;
      if (changed) ui.toast("success", t(items.length > 1 ? "image.updatedMany" : "image.updated"));
      else ui.toast("success", copied ? t("image.inserted", { n: items.length, folder }) : t("image.insertedExisting", { n: items.length }));
      if (ui.overlay === "image") ui.closeOverlay();
      editor.focus();
    } catch (e) {
      ui.toast("error", t("image.failed"), { detail: String(e) });
    } finally {
      busy = false;
    }
  }

  function key(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void insert();
    }
  }

  /** Width of a picture in the page sketch (A4 with usual margins: a text 104 px wide in a 150 px page). */
  const sketchWidth = $derived(multiple && mode === "figure" ? 104 / Math.min(columns, items.length) - 3 : (104 * width) / 100 - (multiple ? 3 : 0));
</script>

<svelte:window onkeydown={key} />

<Modal title={group ? t("image.editManyTitle") : edit ? t("image.editTitle") : t("image.title")} icon="image" width="min(1080px, 95vw)" height="min(760px, 92vh)">
  <div class="left">
    <div class="sources">
      <button class="btn primary" onclick={choose}><Icon name="folder-open" size={14} />{t("image.choose")}</button>
      <button class="btn" class:active={showProject} onclick={() => (showProject = !showProject)} disabled={!projectImages.length}>
        <Icon name="files" size={14} />{t("image.fromProject", { n: projectImages.length })}
      </button>
      <span class="hint faint">{t("image.pasteHint")}</span>
    </div>

    {#if showProject}
      <div class="project-images">
        {#each projectImages as img (img.path)}
          {@const selected = items.some((i) => i.path === img.path)}
          <button class="thumb" class:selected title={relative(rootDir, img.path)} onclick={() => toggleProjectImage(img.path)}>
            {#if extensionOf(img.name) === "pdf" || extensionOf(img.name) === "eps"}
              <Icon name="pdf" size={26} stroke={1.3} />
            {:else}
              <img src={convertFileSrc(img.path)} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
            {/if}
            <span class="ellipsis">{img.name}</span>
            {#if selected}<span class="check"><Icon name="check" size={12} /></span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <div
      class="items"
      class:drag-over={dragOver}
      role="list"
      bind:this={list}
      data-drop-image="true"
      ondragover={(e) => {
        e.preventDefault();
        dragOver = true;
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={(e) => {
        e.preventDefault();
        dragOver = false;
        const path = e.dataTransfer?.getData("application/x-raytex-path");
        if (path) void addPath(path);
        for (const f of e.dataTransfer?.files ?? []) if (f.type.startsWith("image/")) void addBlob(f);
      }}
    >
      {#each items as item, i (item.id)}
        <div class="item card" class:dragging={dragging === item.id} role="listitem">
          {#if multiple}
            <button
              class="grip"
              title={t("image.reorder")}
              aria-label={t("image.reorder")}
              onpointerdown={(e) => dragStart(e, item)}
              onpointermove={(e) => dragMove(e, item)}
              onpointerup={() => (dragging = null)}
              onpointercancel={() => (dragging = null)}
              onkeydown={(e) => reorderKey(e, item)}
            >
              <Icon name="grip" size={16} />
            </button>
          {/if}
          <div class="visual">
            {#if item.url}
              <img src={item.url} alt={item.original} />
            {:else}
              <Icon name={item.ext === "pdf" || item.ext === "eps" ? "pdf" : "image"} size={34} stroke={1.2} />
            {/if}
          </div>
          <div class="fields">
            <div class="row">
              <span class="badge">{i + 1}</span>
              <span class="original ellipsis faint" title={item.path ?? item.original}>{item.original}</span>
              {#if item.kind === "project"}<span class="badge success">{t("image.inProject")}</span>{/if}
              {#if item.kind === "kept"}<span class="badge warning" title={t("image.keptHint")}>{t("image.kept")}</span>{/if}
              {#if item.ext === "svg" || item.ext === "svgz"}<span class="badge accent" title={t("image.svgHint")}>SVG → PDF</span>{/if}
              {#if TO_PNG.includes(item.ext)}<span class="badge accent" title={t("image.pngHint")}>{item.ext.toUpperCase()} → PNG</span>{/if}
              <div class="spacer"></div>
              {#if item.size && item.kind !== "project" && item.kind !== "kept"}
                {@const w = weightOf(item)}
                <span class="weight faint" class:lighter={!!w?.compressed}>
                  {sizeLabel(item.size, lang)}{#if w === null}<span class="spinner tiny"></span>{:else if w?.compressed}<Icon name="arrow-right" size={11} />{sizeLabel(w.compressed, lang)}{/if}
                </span>
              {/if}
              <button class="icon-btn" title={t("common.delete")} onclick={() => remove(item)}><Icon name="x" size={14} /></button>
            </div>
            {#if item.kind !== "project" && item.kind !== "kept"}
              <label class="inline-field">
                <span>{t("image.fileName")}</span>
                <input class="input small mono" value={item.stem} oninput={(e) => (item.stem = safeStem(e.currentTarget.value) || "image")} />
                <span class="ext faint mono">.{weightOf(item)?.ext ?? targetExtension(item.ext, item.blob?.type)}</span>
              </label>
            {/if}
            {#if multiple && mode === "figure"}
              <label class="inline-field">
                <span>{t("image.subCaption")}</span>
                <input class="input small" bind:value={item.caption} placeholder={t("image.optional")} />
              </label>
            {/if}
            <label class="inline-field" title={t("image.altHint")}>
              <span>{t("image.alt")}</span>
              <input class="input small" bind:value={item.alt} placeholder={t("image.altPlaceholder")} data-alt />
            </label>
          </div>
        </div>
      {:else}
        <button class="drop-zone" onclick={choose}>
          <Icon name="image" size={40} stroke={1.2} />
          <strong>{t("image.dropTitle")}</strong>
          <span class="faint">{t("image.dropText")}</span>
        </button>
      {/each}
    </div>
  </div>

  <aside class="right">
    <label class="field">
      <span>{t("image.folder")}</span>
      <input class="input mono" list="image-folders" bind:value={folder} oninput={() => (folder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "figures")} />
      <datalist id="image-folders">
        {#each folders() as f}<option value={f}></option>{/each}
      </datalist>
    </label>

    {#if items.some(compressible)}
      <div class="field">
        <span>
          {t("image.weight")}
          {#if weight !== "original" && !total.pending && total.to < total.from}<span class="saved">{sizeLabel(total.from, lang)} → {sizeLabel(total.to, lang)}</span>{/if}
        </span>
        <div class="segmented weights" role="radiogroup" aria-label={t("image.weight")}>
          {#each WEIGHTS as level (level)}
            <button class:active={weight === level} role="radio" aria-checked={weight === level} data-weight={level} title={level === "original" ? undefined : t(`image.weight.${level}Hint`)} onclick={() => chooseWeight(level)}>
              {t(`image.weight.${level}`)}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="field">
      <span>{t("image.layout")}</span>
      <div class="segmented">
        <button class:active={mode === "figure"} onclick={() => (mode = "figure")}>{t("image.modeFigure")}</button>
        <button class:active={mode === "inline"} onclick={() => (mode = "inline")}>{t("image.modeInline")}</button>
      </div>
    </div>

    <label class="field">
      <span>{t("image.width", { n: width })}</span>
      <input type="range" min="10" max="100" step="5" bind:value={width} oninput={() => (keepOptions = null)} disabled={multiple && mode === "figure"} />
    </label>

    {#if mode === "figure"}
      {#if multiple}
        <label class="field">
          <span>{t("image.columns")}</span>
          <select class="select input" bind:value={columns}>
            {#each Array.from({ length: MAX_COLUMNS }, (_, i) => i + 1) as n}<option value={n}>{n}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="field">
        <span>{t("image.placement")}</span>
        <select class="select input" bind:value={placement}>
          <option value="htbp">{t("image.placeAuto")}</option>
          <option value="H">{t("image.placeHere")}</option>
          <option value="t">{t("image.placeTop")}</option>
          <option value="b">{t("image.placeBottom")}</option>
          <option value="p">{t("image.placePage")}</option>
        </select>
      </label>
      <label class="field">
        <span>{t("image.caption")}</span>
        <input class="input" bind:value={caption} placeholder={t("snippet.caption")} />
      </label>
      <label class="field">
        <span>{t("image.label")}</span>
        <input class="input mono" bind:value={label} oninput={() => (labelEdited = true)} />
      </label>
    {/if}

    <div class="sketch" aria-hidden="true">
      <div class="page">
        <div class="text-line"></div>
        <div class="text-line short"></div>
        {#if items.length}
          <!-- Every picture at its place: the order they are given is the order on the page. -->
          <div class="fig" class:center={mode === "figure"}>
            {#each items as it (it.id)}
              <div class="img" style:width="{sketchWidth}px" style:height="{Math.min(120, sketchWidth / (it.ratio ?? 4 / 3))}px">
                {#if it.url}<img src={it.url} alt="" />{/if}
              </div>
            {/each}
          </div>
          {#if mode === "figure"}<div class="cap"></div>{/if}
        {/if}
        <div class="text-line"></div>
        <div class="text-line"></div>
        <div class="text-line short"></div>
      </div>
    </div>

    {#if code}
      <pre class="code mono selectable">{code}</pre>
    {/if}

    <div class="spacer"></div>
    <button class="btn primary large" disabled={!items.length || busy} onclick={insert}>
      {#if busy}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if}
      {changed ? t("image.update") : t("image.insert", { n: items.length })}
    </button>
  </aside>
</Modal>

<style>
  .left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    overflow: hidden;
  }
  .sources {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sources .btn.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .hint {
    font-size: 11.5px;
  }
  .project-images {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
    max-height: 190px;
    overflow: auto;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .thumb {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px;
    height: 88px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    cursor: pointer;
    color: var(--text-faint);
    font-size: 10.5px;
  }
  .thumb img {
    max-width: 100%;
    height: 56px;
    object-fit: contain;
    background: #fff;
  }
  .thumb span.ellipsis {
    max-width: 100%;
  }
  .thumb.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .check {
    position: absolute;
    top: 4px;
    right: 4px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .items {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-radius: var(--radius);
  }
  .items.drag-over {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }
  .item {
    display: flex;
    gap: 12px;
    padding: 10px;
  }
  .item.dragging {
    border-color: var(--accent);
    box-shadow: var(--shadow);
  }
  /* The handle a picture is dragged by to another place. */
  .grip {
    flex-shrink: 0;
    align-self: stretch;
    display: grid;
    place-items: center;
    width: 20px;
    margin: -4px -6px -4px -4px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-faint);
    cursor: grab;
    touch-action: none;
  }
  .grip:hover,
  .grip:focus-visible {
    background: var(--bg-hover);
    color: var(--text);
  }
  .dragging .grip {
    cursor: grabbing;
  }
  .visual {
    width: 140px;
    height: 100px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: repeating-conic-gradient(var(--bg-hover) 0% 25%, transparent 0% 50%) 50% / 14px 14px;
    color: var(--text-faint);
    overflow: hidden;
  }
  .visual img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .original {
    font-size: 12px;
    min-width: 0;
  }
  /* What the image weighs, and what it will weigh in the project. */
  .weight {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .weight.lighter {
    color: var(--success);
  }
  .spinner.tiny {
    width: 10px;
    height: 10px;
  }
  .saved {
    float: right;
    color: var(--success);
    font-variant-numeric: tabular-nums;
  }
  .inline-field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .inline-field > span:first-child {
    min-width: 92px;
  }
  .inline-field .input {
    flex: 1;
    min-width: 0;
  }
  .drop-zone {
    flex: 1;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    text-align: center;
    padding: 20px;
  }
  .drop-zone:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .right {
    width: 330px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 11px;
    overflow: auto;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .field input[type="range"] {
    accent-color: var(--accent);
  }
  .segmented {
    display: flex;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .segmented button {
    flex: 1;
    height: 28px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 12px;
  }
  .segmented button + button {
    border-left: 1px solid var(--border-strong);
  }
  .segmented button.active {
    background: var(--accent-soft);
    color: var(--text);
  }
  .sketch {
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    padding: 6px 0;
  }
  .page {
    width: 150px;
    min-height: 200px;
    padding: 16px 23px;
    background: #fff;
    border-radius: 3px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .text-line {
    height: 4px;
    border-radius: 2px;
    background: #d6d6d6;
  }
  .text-line.short {
    width: 60%;
  }
  .fig {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin: 4px 0 2px;
  }
  .fig.center {
    justify-content: center;
  }
  .img {
    border-radius: 2px;
    background: #9fb8d9;
    overflow: hidden;
  }
  .img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .cap {
    align-self: center;
    width: 55%;
    height: 3px;
    border-radius: 2px;
    background: #aaa;
    margin-bottom: 4px;
  }
  .code {
    flex-shrink: 0;
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--editor-bg);
    border: 1px solid var(--border);
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--text-muted);
    white-space: pre;
    overflow: auto;
    max-height: 160px;
    tab-size: 2;
  }
</style>
