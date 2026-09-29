<script lang="ts" module>
  // Stroke icons on a 24×24 grid (lucide-like style). Static markup only.
  const ICONS: Record<string, string> = {
    files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    outline: '<path d="M4 5h16M8 10h12M8 15h12M4 20h16"/><circle cx="4.5" cy="10" r=".5"/><circle cx="4.5" cy="15" r=".5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    sigma: '<path d="M18 7V5H6l6 7-6 7h12v-2"/>',
    snippets: '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-.7 2.5-2 3 1.3.5 2 1.5 2 3v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1.5.7 2.5 2 3-1.3.5-2 1.5-2 3v2c0 2-1 3-3 3"/><path d="M12 8v8M8 12h8"/>',
    packages: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/><path d="m7.5 5.5 9 5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a3 3 0 0 1 5.6 1c0 2-3 2.5-3 4.5"/><circle cx="11.8" cy="17.5" r=".6" fill="currentColor"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke-linejoin="round"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
    sync: '<path d="m17 3 3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="m7 21-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>',
    "zoom-in": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6M11 8v6M8 11h6"/>',
    "zoom-out": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6M8 11h6"/>',
    "fit-width": '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
    "fit-page": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    "chevron-right": '<path d="m9 6 6 6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-left": '<path d="m15 6-6 6 6 6"/>',
    "chevron-up": '<path d="m6 15 6-6 6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "folder-open": '<path d="M3 17V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1"/><path d="M3 17l2.5-6.2A2 2 0 0 1 7.4 9.5H21l-2.6 7.3a2 2 0 0 1-1.9 1.2H5a2 2 0 0 1-2-1z"/>',
    "folder-plus": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    "file-plus": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    "file-tex": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 12h4M10 12v5M12.5 14.5l3 3M15.5 14.5l-3 3"/>',
    "file-bib": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 12v5h2.2a1.3 1.3 0 0 0 0-2.6H9m0 0h1.8a1.2 1.2 0 0 0 0-2.4H9"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 17v-4h1.3a1.2 1.2 0 0 1 0 2.4H8.5M13 13v4h.8a2 2 0 0 0 0-4zM17 13h-1.5v4M15.5 15h1.3"/>',
    more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    "alert-triangle": '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    "alert-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><circle cx="12" cy="16.3" r=".6" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
    lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "panel-bottom": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>',
    "panel-left": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    "panel-right": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M12 6V4M9 4l1 2M15 4l-1 2M4 11h4M16 11h4M4 17l4-1M20 17l-4-1M4 5l4 3M20 5l-4 3"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    sparkles: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="2.5"/>',
    home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    wand: '<path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.7 1.3L21 14l-1.3.7L19 16l-.7-1.3L17 14l1.3-.7z"/><path d="m3 21 11-11"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    hash: '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
    quote: '<path d="M7 7c-2 1-3 3-3 6v4h5v-5H6c0-2 .6-3 2-4zM17 7c-2 1-3 3-3 6v4h5v-5h-3c0-2 .6-3 2-4z"/>',
    todo: '<rect x="3" y="5" width="5" height="5" rx="1"/><path d="m4 15 1.5 1.5L8 14M11 7.5h10M11 15.5h10"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    broom: '<path d="m15 3-6 9"/><path d="M8 11c-2.5 0-5 2.5-5 6 0 1 0 2.5 1 4h9c1-2 1-4 1-5 0-3-3-5-6-5z"/><path d="M6 21c0-2 .5-3 1.5-4M10 21c0-2 .5-3 1.5-4"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    "arrow-left": '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    "arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
    save: '<path d="M5 4h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    type: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.6-4-8.2-9-8.2z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7.5" r="1" fill="currentColor"/>',
    graduation: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7 15h10"/>',
    presentation: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8 20h8M3 4h18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    pin: '<path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    regex: '<path d="M17 3v10M12.7 5.5l8.6 5M12.7 10.5l8.6-5"/><rect x="3" y="15" width="6" height="6" rx="1"/>',
    "case": '<path d="M3 18 7 6l4 12M4.5 14h5"/><circle cx="16.5" cy="15" r="3"/><path d="M19.5 12v6"/>',
    wrap: '<path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4M3 18h6"/><path d="m16 16-2 2 2 2"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    bold: '<path d="M7 4h6.5a4 4 0 0 1 0 8H7zM7 12h7.5a4 4 0 0 1 0 8H7z" stroke-width="2.4"/>',
    italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
    underline: '<path d="M6 4v7a6 6 0 0 0 12 0V4M5 21h14"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    "text-size": '<path d="M3 19 8.5 5 14 19M5 14h7"/><path d="M15 19l3-8 3 8M16 16.5h4"/>',
    "text-color": '<path d="m5 17 6-14h2l6 14M7.4 12h9.2"/><path d="M3 21h18" stroke-width="3.2" stroke="var(--swatch, currentColor)"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    "list-ordered": '<path d="M10 6h10M10 12h10M10 18h10M4 4h1v4M4 8h2M4 11.5c.4-.9 2.3-.9 2.2.4-.1.9-2.2 1.6-2.2 2.6h2.3M4 16.5h2l-1 1.4c1.4.1 1.4 2.6-.2 2.6H4"/>',
    "align-left": '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    "align-center": '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    "align-right": '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    "align-justify": '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
    matrix: '<path d="M7 4H5v16h2M17 4h2v16h-2"/><circle cx="9.5" cy="9" r="1"/><circle cx="14.5" cy="9" r="1"/><circle cx="9.5" cy="15" r="1"/><circle cx="14.5" cy="15" r="1"/>',
    template: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    footnote: '<path d="M4 18V8l6 10V8"/><path d="M15 6.5c.5-1.2 3-1.2 3 .4 0 1.3-3 2.1-3 3.6h3.2"/>',
    formula: '<path d="M7 5h6M10 5v4c0 6-1 10-4 10M4 12h7M15 10l5 7M20 10l-5 7"/>',
    equation: '<path d="M3 5v14M21 5v14M7 10h10M7 14h10"/>',
    heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M9 14h12"/>',
    comment: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    "page-break": '<path d="M6 3v5h12V3M6 21v-5h12v5M3 12h2M8 12h2M14 12h2M19 12h2"/>',
    pointer: '<path d="M5 3l14 7.5-6.2 1.6L10 19z"/><path d="m12.8 12.1 5 5"/>',
    square: '<rect x="4" y="5" width="16" height="14" rx="1.5"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9.5" ry="6"/>',
    polygon: '<path d="M12 3.5 20.5 10 17 20H7L3.5 10z"/>',
    draw: '<path d="M4 20l1.2-4.4L15.8 5a2.1 2.1 0 0 1 3 3L8.2 18.6z"/><path d="m13.8 7 3 3M4 20h16"/>',
  };
  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  let { name, size = 16, stroke = 1.75, class: cls = "" }: { name: string; size?: number; stroke?: number; class?: string } = $props();
</script>

<svg
  class="icon {cls}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {@html ICONS[name] ?? ICONS.file}
</svg>

<style>
  .icon {
    flex-shrink: 0;
    display: block;
  }
</style>
