// A picture chosen on the computer for the document itself (the watermark
// and the logos of a page style, the logo of a title page): it is copied
// into the folder of pictures of the project, like the images inserted in
// the text, so that the project holds everything it shows and can be moved
// or sent as it is.

import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import { pictureFolder } from "../pictures";
import { graphicsPaths } from "../preamble";
import type { FileNode } from "../types";
import { basename, dirname, join, relative } from "../utils";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

function folders(nodes: FileNode[], rootDir: string, out: string[] = []): string[] {
  for (const n of nodes) {
    if (!n.dir) continue;
    const named = relative(rootDir, n.path);
    if (named !== n.path.replace(/\\/g, "/")) out.push(named);
    folders(n.children ?? [], rootDir, out);
  }
  return out;
}

/**
 * The picture `file` as the document of `root` names it. A picture that is
 * not in the project is copied into its folder of pictures first (under a
 * name LaTeX accepts everywhere), and the copy is what the document names.
 * A file opened on its own has no folder: the picture is named where it is.
 */
export async function bringPicture(file: string, root: string, rootText: string): Promise<string> {
  const rootDir = dirname(root);
  const plain = file.replace(/\\/g, "/");
  const named = relative(rootDir, file);
  if (named !== plain || project.light) return named;
  const folder = pictureFolder(folders(project.tree, rootDir), graphicsPaths(rootText));
  try {
    const copy = await ipc.importImage(file, join(rootDir, folder));
    await project.refreshTree();
    ui.toast("info", t("image.copied", { file: basename(copy), folder }));
    return relative(rootDir, copy);
  } catch (e) {
    // Not copied (a folder that cannot be written): the picture is named where it is, and it is said.
    ui.toast("warning", t("image.notCopied", { file: basename(file) }), { detail: String(e) });
    return plain;
  }
}
