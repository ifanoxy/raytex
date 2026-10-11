// Exporting the project as an archive (engine: export.rs): the whole of it,
// or what one document needs, for arXiv or a journal.

export interface ExportOptions {
  /** Only what the document uses, with its compiled bibliography (else the whole project). */
  submission: boolean;
  /** Submission: the comments of the `.tex` files are removed. */
  stripComments: boolean;
  /** Submission: the files the main file `\input`s are written in it. */
  singleFile: boolean;
  /** Submission: the `.bib` files too. */
  includeBib: boolean;
  /** The PDF of the last build. */
  includePdf: boolean;
}

export type ExportRole = "main" | "source" | "bibliography" | "compiled" | "picture" | "pdf" | "other";

export interface ExportFile {
  source: string;
  /** Its path in the archive, with `/`. */
  name: string;
  size: number;
  role: ExportRole;
}

export interface ExportPlan {
  files: ExportFile[];
  size: number;
  /** Submission: a build listed the files the document reads. */
  recorded: boolean;
  /** Submission: a source changed since that build. */
  stale: boolean;
}

/** What each kind of export does unless told otherwise. */
export function defaultOptions(submission: boolean): ExportOptions {
  return { submission, stripComments: submission, singleFile: false, includeBib: submission, includePdf: false };
}

/** The name offered for the archive: the name of the project, as a file name. */
export function archiveName(project: string, submission: boolean): string {
  const base =
    project
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "document";
  return `${base}${submission ? "-submission" : ""}.zip`;
}

/** The order the kinds of files are listed in. */
export const ROLES: ExportRole[] = ["main", "source", "bibliography", "compiled", "picture", "pdf", "other"];

/** The files by kind, in the order of [`ROLES`], without the kinds that have none. */
export function byRole(files: ExportFile[]): { role: ExportRole; files: ExportFile[] }[] {
  return ROLES.map((role) => ({ role, files: files.filter((f) => f.role === role) })).filter((g) => g.files.length);
}
