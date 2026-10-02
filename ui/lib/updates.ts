// New versions of RayTeX: the `updates` section of the settings (kept by the
// engine, settings.rs) and the release notes shown in the update dialog.

export interface UpdateSettings {
  /** Look for a new version when RayTeX starts (asks GitHub). */
  checkAtStartup: boolean;
  /** A version the user chose to skip: not offered again at start. */
  skippedVersion: string | null;
}

declare module "./types" {
  interface Settings {
    updates: UpdateSettings;
  }
}

/** Download page of the website, for a system that cannot update by itself. */
export const DOWNLOAD_PAGE = "https://ifanoxy.github.io/raytex/download/";

/** Release notes (GitHub markdown) as short plain lines: headings, items, paragraphs. */
export function noteLines(body: string | null | undefined, max = 12): string[] {
  if (!body) return [];
  const lines = body
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^#+\s*/, "")
        .replace(/^\s*[-*]\s+/, "• ")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .trim(),
    )
    .filter((l) => l && l !== "---");
  return lines.length > max ? [...lines.slice(0, max), "…"] : lines;
}
