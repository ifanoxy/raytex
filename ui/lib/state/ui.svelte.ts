// Layout, overlays, dialogs and notifications.

import { uid } from "../utils";

export type SidebarView = "files" | "templates" | "outline" | "search" | "symbols" | "snippets" | "packages";
export type Overlay = null | "settings" | "help" | "newProject" | "setup" | "palette" | "shortcuts" | "image" | "fonts" | "tikz" | "projects" | "convert" | "grid";
export type BottomTab = "problems" | "output" | "jobs";

export interface Toast {
  id: string;
  kind: "info" | "success" | "warning" | "error";
  message: string;
  detail?: string;
  action?: { label: string; run: () => void };
  timeout: number;
}

export interface DialogChoice {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

export interface MenuItem {
  label?: string;
  icon?: string;
  /** Shortcut shown on the right (CodeMirror notation). */
  keys?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  run?: () => unknown;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export interface DialogState {
  kind: "confirm" | "prompt" | "alert" | "choice";
  choices?: DialogChoice[];
  title: string;
  message?: string;
  detail?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  value?: string;
  placeholder?: string;
  code?: string;
  resolve: (v: string | boolean | null) => void;
}

const LAYOUT_KEY = "raytex.layout.v1";

interface Layout {
  sidebar: SidebarView;
  sidebarVisible: boolean;
  sidebarWidth: number;
  bottomVisible: boolean;
  bottomHeight: number;
  pdfVisible: boolean;
  pdfRatio: number;
  formatBarVisible: boolean;
}

function loadLayout(): Partial<Layout> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

class UiStore {
  sidebar = $state<SidebarView>("files");
  sidebarVisible = $state(true);
  sidebarWidth = $state(270);
  bottomVisible = $state(false);
  bottomHeight = $state(230);
  bottomTab = $state<BottomTab>("problems");
  pdfVisible = $state(true);
  /** Share of the editor + PDF area taken by the PDF (0.2…0.8). */
  pdfRatio = $state(0.46);
  /** Formatting bar under the top bar. */
  formatBarVisible = $state(true);
  overlay = $state<Overlay>(null);
  paletteMode = $state<"commands" | "files">("commands");
  settingsSection = $state("general");
  helpTarget = $state<{ section: string; id?: string } | null>(null);
  toasts = $state<Toast[]>([]);
  dialog = $state<DialogState | null>(null);
  /** Package or file to highlight in the packages panel. */
  packageFocus = $state<string | null>(null);
  menu = $state<MenuState | null>(null);

  constructor() {
    const l = loadLayout();
    Object.assign(this, {
      sidebar: l.sidebar ?? "files",
      sidebarVisible: l.sidebarVisible ?? true,
      sidebarWidth: l.sidebarWidth ?? 270,
      bottomVisible: l.bottomVisible ?? false,
      bottomHeight: l.bottomHeight ?? 230,
      pdfVisible: l.pdfVisible ?? true,
      pdfRatio: l.pdfRatio ?? 0.46,
      formatBarVisible: l.formatBarVisible ?? true,
    });
  }

  saveLayout() {
    const l: Layout = {
      sidebar: this.sidebar,
      sidebarVisible: this.sidebarVisible,
      sidebarWidth: this.sidebarWidth,
      bottomVisible: this.bottomVisible,
      bottomHeight: this.bottomHeight,
      pdfVisible: this.pdfVisible,
      pdfRatio: this.pdfRatio,
      formatBarVisible: this.formatBarVisible,
    };
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
    } catch {
      /* storage unavailable: layout is not remembered */
    }
  }

  showSidebar(view: SidebarView) {
    if (this.sidebar === view && this.sidebarVisible) {
      this.sidebarVisible = false;
    } else {
      this.sidebar = view;
      this.sidebarVisible = true;
    }
    this.saveLayout();
  }

  showBottom(tab: BottomTab) {
    this.bottomTab = tab;
    this.bottomVisible = true;
    this.saveLayout();
  }

  toggleBottom() {
    this.bottomVisible = !this.bottomVisible;
    this.saveLayout();
  }

  /** Shows or hides a part of the window (the "View" menu, close buttons). */
  setVisible(part: "sidebar" | "pdf" | "bottom" | "formatBar", visible: boolean) {
    if (part === "sidebar") this.sidebarVisible = visible;
    else if (part === "pdf") this.pdfVisible = visible;
    else if (part === "bottom") this.bottomVisible = visible;
    else this.formatBarVisible = visible;
    this.saveLayout();
  }

  toggleFormatBar() {
    this.setVisible("formatBar", !this.formatBarVisible);
  }

  openOverlay(o: Exclude<Overlay, null>) {
    this.overlay = o;
  }

  openSettings(section = "general") {
    this.settingsSection = section;
    this.overlay = "settings";
  }

  openHelp(section = "guides", id?: string) {
    this.helpTarget = { section, id };
    this.overlay = "help";
  }

  closeOverlay() {
    this.overlay = null;
  }

  toast(kind: Toast["kind"], message: string, opts: Partial<Omit<Toast, "id" | "kind" | "message">> = {}) {
    const toast: Toast = { id: uid(), kind, message, timeout: kind === "error" ? 9000 : 4500, ...opts };
    this.toasts = [...this.toasts.slice(-4), toast];
    if (toast.timeout > 0) setTimeout(() => this.dismiss(toast.id), toast.timeout);
    return toast.id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  confirm(opts: Omit<DialogState, "kind" | "resolve">): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialog = { kind: "confirm", ...opts, resolve: (v) => resolve(v === true) };
    });
  }

  prompt(opts: Omit<DialogState, "kind" | "resolve">): Promise<string | null> {
    return new Promise((resolve) => {
      this.dialog = { kind: "prompt", ...opts, resolve: (v) => resolve(typeof v === "string" ? v : null) };
    });
  }

  /** Asks the user to pick one of several buttons; resolves with its id (null if dismissed). */
  choose(opts: Omit<DialogState, "kind" | "resolve"> & { choices: DialogChoice[] }): Promise<string | null> {
    return new Promise((resolve) => {
      this.dialog = { kind: "choice", ...opts, resolve: (v) => resolve(typeof v === "string" ? v : null) };
    });
  }

  alert(opts: Omit<DialogState, "kind" | "resolve">): Promise<void> {
    return new Promise((resolve) => {
      this.dialog = { kind: "alert", ...opts, resolve: () => resolve() };
    });
  }

  /** Opens a context menu at the pointer. */
  openMenu(e: MouseEvent, items: MenuItem[]) {
    e.preventDefault();
    e.stopPropagation();
    this.menu = { x: e.clientX, y: e.clientY, items };
  }

  /** Opens a menu below an element (toolbar buttons). */
  openMenuBelow(el: HTMLElement, items: MenuItem[]) {
    const r = el.getBoundingClientRect();
    this.menu = { x: r.left, y: r.bottom + 4, items };
  }

  closeMenu() {
    this.menu = null;
  }

  closeDialog(value: string | boolean | null) {
    const d = this.dialog;
    this.dialog = null;
    d?.resolve(value);
  }
}

export const ui = new UiStore();
