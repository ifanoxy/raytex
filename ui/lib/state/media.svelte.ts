// Requests opening the image, font and TikZ dialogs with content already
// chosen (pasted image, dropped files, picture under the cursor…).

import { t } from "../i18n.svelte";
import type { FontRole } from "../types";
import { ui } from "./ui.svelte";

/** What the font window is opened for: a role of the document, an extra font. */
export interface FontPreset {
  role?: FontRole;
  /** Command of an extra font being changed (`fontTitle`). */
  command?: string;
}

export interface ImageRequest {
  /** Files of the computer or of the project. */
  paths?: string[];
  /** Images from the clipboard. */
  blobs?: File[];
}

export interface TikzRequest {
  code: string;
  /** Range replaced by "Update" (a picture of the document)… */
  range?: { path: string; from: number; to: number };
  /** …or file rewritten by "Update" (a picture kept in its own file). */
  file?: string;
}

class MediaStore {
  imageRequest = $state<ImageRequest | null>(null);
  tikzRequest = $state<TikzRequest | null>(null);
  /** Font files to show first in the font dialog. */
  fontRequest = $state<string[] | null>(null);
  /** Role chosen before opening the font dialog (from the font menu). */
  fontPreset: FontPreset | null = null;
  /**
   * Light mode: asks to make a project before a feature that writes files
   * (set by the project store). Resolves with false when the user declines.
   */
  guard: (reason: string) => Promise<boolean> = () => Promise.resolve(true);
  /** Unfinished new picture, kept when the studio is closed. */
  tikzDraft: { code: string; packages: string[]; libraries: string[]; extra: string; mode?: "draw" | "code" } | null = null;

  /** Images are copied into the project: in light mode, a project is made first. */
  async openImages(request: ImageRequest = {}) {
    if (!(await this.guard(t("light.reasonImages")))) return;
    this.imageRequest = request;
    ui.openOverlay("image");
  }

  openTikz(request: TikzRequest | null = null) {
    this.tikzRequest = request;
    ui.openOverlay("tikz");
  }

  openFonts(files: string[] | null = null, preset: FontPreset | null = null) {
    this.fontRequest = files;
    this.fontPreset = preset;
    ui.openOverlay("fonts");
  }
}

export const media = new MediaStore();
