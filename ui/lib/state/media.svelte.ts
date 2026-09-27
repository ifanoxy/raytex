// Requests opening the image, font and TikZ dialogs with content already
// chosen (pasted image, dropped files, picture under the cursor…).

import { ui } from "./ui.svelte";

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
  /** Unfinished new picture, kept when the studio is closed. */
  tikzDraft: { code: string; packages: string[]; libraries: string[]; extra: string } | null = null;

  openImages(request: ImageRequest = {}) {
    this.imageRequest = request;
    ui.openOverlay("image");
  }

  openTikz(request: TikzRequest | null = null) {
    this.tikzRequest = request;
    ui.openOverlay("tikz");
  }

  openFonts(files: string[] | null = null) {
    this.fontRequest = files;
    ui.openOverlay("fonts");
  }
}

export const media = new MediaStore();
