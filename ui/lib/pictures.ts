// Where the pictures of a project go: the folder it already keeps them in,
// whatever its name, or `figures`.

/** Names a folder of pictures usually has. */
export const PICTURE_FOLDERS = ["figures", "images", "img", "figs", "graphics", "pictures", "fig"];

/**
 * The folder the pictures of a document are copied into: one of the folders
 * of the project (`folders`, named from the document) that has a usual name,
 * else the first folder of its `\graphicspath`, else `figures`.
 */
export function pictureFolder(folders: string[], graphicsPaths: string[]): string {
  const existing = folders.find((f) => PICTURE_FOLDERS.includes(f.toLowerCase()));
  return existing ?? graphicsPaths[0]?.replace(/\/+$/, "") ?? "figures";
}
