// The pictures of a deck: a file chosen or dropped, written as the deck
// includes it (its path from the deck, without its extension), copied
// first into the folder of pictures of the project when it is not in it.

import { open } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n.svelte";
import { DIRECT, safeStem, stemOf } from "../images";
import * as ipc from "../ipc";
import { pictureFolder } from "../pictures";
import { graphicsPaths } from "../preamble";
import { dirname, join, relative } from "../utils";

/** Whether a file is a picture a deck can include as it is. */
export const isPicture = (path: string) => DIRECT.includes((path.split(".").pop() ?? "").toLowerCase());

/** A picture as the deck at `deck` includes it; "" when it could not be copied. */
export async function pictureFor(file: string, deck: string, deckText: string): Promise<string> {
  const root = dirname(deck);
  let path = file;
  if (relative(root, file) === file.replace(/\\/g, "/")) {
    const ext = file.split(".").pop() ?? "png";
    path = await ipc.importImage(file, join(root, pictureFolder([], graphicsPaths(deckText))), `${safeStem(stemOf(file))}.${ext}`).catch(() => "");
    if (!path) return "";
  }
  return relative(root, path).replace(/\.(png|jpe?g|pdf|eps)$/i, "");
}

/** A picture chosen in a window of the system, as the deck includes it; null when none is. */
export async function choosePicture(deck: string, deckText: string): Promise<string | null> {
  const picked = await open({ multiple: false, title: t("slides.image.chooseTitle"), filters: [{ name: "Images", extensions: DIRECT }] });
  if (typeof picked !== "string") return null;
  return (await pictureFor(picked, deck, deckText)) || null;
}
