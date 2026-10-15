// Typed access to the Rust side. Every function maps to one IPC command
// (see crates/raytex-desktop/src/commands).

import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type * as T from "./types";
import type { BibDraft, BibField, Bibliography } from "./bibliography";
import type { ExportWindowCommand, ExportWindowReport, ExportWindowState } from "./exportwindow";
import type { PdfWeights } from "./pdfweight";
import type { ExportOptions, ExportPlan } from "./export";
import type { SpellStatus } from "./spelling";
import type { Change, ChangesPdf, Comparison, HistoryView, Moment } from "./history";
import type { CommandDraft, CommandSpec, CustomCommand } from "./commands";
import type { PagePreview } from "./layout";
import type { ShapeSet } from "./tikz/model";

const call = <R>(cmd: string, args?: Record<string, unknown>) => invoke<R>(cmd, args);

// ----------------------------------------------------------------- app
export const appInfo = () => call<T.AppInfo>("app_info");
/** Reads again the files installed in the distribution. */
export const reindexTex = () => call<void>("reindex_tex");
/** Files the system asked to open (Finder, "Open with…", command line), each given once. */
export const takeOpenRequests = () => call<string[]>("take_open_requests");
/** Quits the application (after the unsaved files were dealt with). */
export const quitApp = () => call<void>("quit_app");
export const getSettings = () => call<T.Settings>("get_settings");
export const saveSettings = (settings: T.Settings) => call<boolean>("save_settings", { settings });
export const setLanguage = (lang: T.Lang) => call<void>("set_language", { lang });
export const getSession = () => call<T.Session>("get_session");
export const saveOpenFiles = (files: string[], active: string | null) => call<void>("save_open_files", { files, active });
export const forgetRecent = (path: string) => call<void>("forget_recent", { path });
export const openInOs = (path: string) => call<void>("open_in_os", { path });
export const revealInOs = (path: string) => call<void>("reveal_in_os", { path });
export const openUrl = (url: string) => call<void>("open_url", { url });
export const logFrontend = (level: "error" | "info", message: string) => call<void>("log_frontend", { level, message });

// ------------------------------------------------------------- project
export const openProject = (path: string) => call<T.ProjectInfo>("open_project", { path });
export const closeProject = () => call<void>("close_project");
export const projectInfo = () => call<T.ProjectInfo | null>("project_info");
export const fileTree = () => call<T.FileNode[]>("file_tree");
export const setMainFile = (path: string) => call<T.ProjectInfo>("set_main_file", { path });
export const saveProjectConfig = (config: T.ProjectConfig) => call<T.ProjectInfo>("save_project_config", { config });
export const listTemplates = () => call<T.TemplateInfo[]>("list_templates");
export const openLightFile = (path: string) => call<T.ProjectInfo>("open_light_file", { path });
export const listProjects = () => call<T.ProjectsOverview>("list_projects");
export const projectsDir = () => call<string>("projects_dir");
export const convertToProject = (name: string, parent: string | null) => call<T.ProjectInfo>("convert_to_project", { name, parent });
export const renameProject = (path: string, name: string) => call<void>("rename_project", { path, name });
export const trashProject = (path: string) => call<void>("trash_project", { path });
export const createEmptyProject = (dir: string, name: string) => call<T.ProjectInfo>("create_empty_project", { dir, name });
export const applyTemplate = (id: string, values: T.TemplateValues) => call<T.AppliedTemplate>("apply_template", { id, values });
export const templateThumbnail = (id: string) => call<string>("template_thumbnail", { id });
export const saveAsTemplate = (name: string, description: string) => call<void>("save_as_template", { name, description });
export const deleteTemplate = (id: string) => call<void>("delete_template", { id });

// --------------------------------------------------------------- files
export const readTextFile = (path: string) => call<T.TextFile>("read_text_file", { path });
export const writeTextFile = (path: string, text: string) => call<number>("write_text_file", { path, text });
export const readBinaryFile = (path: string) => call<ArrayBuffer>("read_binary_file", { path });
export const writeBinaryFile = (path: string, bytes: Uint8Array) =>
  invoke<string>("write_binary_file", bytes, { headers: { "x-path": encodeURIComponent(path) } });
export const fileModified = (path: string) => call<number>("file_modified", { path });
export const pathExists = (path: string) => call<boolean>("path_exists", { path });
export const createFile = (path: string, text?: string) => call<string>("create_file", { path, text: text ?? null });
export const createDir = (path: string) => call<void>("create_dir", { path });
export const renamePath = (from: string, to: string) => call<string>("rename_path", { from, to });
export const deletePath = (path: string) => call<void>("delete_path", { path });
export const importFiles = (sources: string[], dir: string) => call<string[]>("import_files", { sources, dir });
/** Copies a file where the user says. A PDF is refused while a build writes it (`building`) or when it has no end (`incomplete`). */
export const exportFile = (from: string, to: string) => call<void>("export_file", { from, to });
/** Whether the PDF of the document of `path` is that of its files as they are. */
export const pdfFresh = (path: string) => call<boolean>("pdf_fresh", { path });
/** The PNG and JPEG pictures the document embeds (from the record of its last build), and the PDF as it is. */
export const pdfPictures = (path: string) => call<{ pictures: number; original: number; pdf: number | null } | null>("pdf_pictures", { path });
/** What these pictures weigh at each step of compression (seconds, the first time); null when given up. */
export const pdfWeights = (path: string) => call<PdfWeights | null>("pdf_weights", { path });
export const pdfWeightsCancel = () => call<void>("pdf_weights_cancel");
/** A lighter PDF: its size, the step it was made with, whether it is within the limit asked. */
export interface LighterPdf {
  size: number;
  step: number;
  within: boolean;
  errors: number;
}
/** Builds the document again with its pictures at `step` in a copy of the project, and writes the PDF at `dest`. */
export const exportPdfLighter = (path: string, dest: string, step: number, limit: number | null) => call<LighterPdf>("export_pdf_lighter", { path, dest, step, limit });
export const exportPdfCancel = () => call<void>("export_pdf_cancel");
/** Opens the window of its own that follows an export (or brings it to the front). */
export const exportWindowOpen = (title: string) => call<void>("export_window_open", { title });
export const exportWindowClose = () => call<void>("export_window_close");
export const exportWindowShown = () => call<boolean>("export_window_shown");
/** Says something to one window of the application. */
export function tell<K extends keyof Events>(window: string, event: K, payload: Events[K]): Promise<void> {
  return emitTo(window, event, payload);
}
/** The spelling dictionaries on this computer and those that can be downloaded. */
export const spellStatus = () => call<SpellStatus>("spell_status");
/** Downloads the dictionary of a language: called only once the user agreed to it. */
export const spellInstall = (tag: string) => call<string>("spell_install", { tag });
export const spellRemove = (tag: string) => call<void>("spell_remove", { tag });
/** Whether each word is spelled right in an installed dictionary. */
export const spellCheck = (tag: string, words: string[]) => call<boolean[]>("spell_check", { tag, words });
export const spellSuggest = (tag: string, word: string) => call<string[]>("spell_suggest", { tag, word });
/** Adds a word to those of the user, or takes it back. */
export const spellLearn = (word: string, add: boolean) => call<void>("spell_learn", { word, add });
/** Writes a text where the user said (a save dialog). */
export const exportText = (to: string, text: string) => call<void>("export_text", { to, text });

// ------------------------------------------------------------ language
export const updateDocument = (path: string, text: string, version: number) =>
  call<T.DocumentUpdate>("update_document", { path, text, version });
export const closeDocument = (path: string) => call<void>("close_document", { path });
export const lintProject = () => call<T.Diagnostic[]>("lint_project");
export const complete = (path: string, before: string, after: string, explicit: boolean) =>
  call<T.CompletionList | null>("complete", { path, before, after, explicit });
export const completionInfo = (path: string, key: string) => call<string | null>("completion_info", { path, key });
export const argumentHint = (path: string, before: string, after: string) => call<T.ArgumentHint | null>("argument_hint", { path, before, after });
export const hover = (path: string, line: number, character: number) => call<T.HoverView | null>("hover", { path, line, character });
export const definition = (path: string, line: number, character: number) => call<T.Location[]>("definition", { path, line, character });
export const references = (path: string, line: number, character: number) => call<T.Location[]>("references", { path, line, character });
export const renameSymbol = (path: string, line: number, character: number, newName: string) =>
  call<T.TextEdit[]>("rename_symbol", { path, line, character, newName });
export const applyEdits = (edits: T.TextEdit[]) => call<string[]>("apply_edits", { edits });
export const mathAt = (path: string, line: number, character: number) => call<T.MathAt | null>("math_at", { path, line, character });
export const mathMacros = (path: string) => call<Record<string, string>>("math_macros", { path });
/** The commands and environments the project of `path` defines. */
export const customCommands = (path: string) => call<CustomCommand[]>("custom_commands", { path });
/** The entries of the `.bib` files of the project of a file, with how much each is cited. */
export const bibliography = (path: string) => call<Bibliography>("bibliography", { path });
/** The text of a `.bib` file with an entry written in place of `replaces`, or at the end. */
export const bibWrite = (text: string, replaces: string | null, entry: BibDraft) => call<string>("bib_write", { text, replaces, kind: entry.kind, key: entry.key, fields: entry.fields });
/** The text of a `.bib` file without an entry (null when it is not there). */
export const bibRemove = (text: string, key: string) => call<string | null>("bib_remove", { text, key });
/** The entries of a piece of BibTeX. */
export const bibDrafts = (text: string) => call<BibDraft[]>("bib_drafts", { text });
/** A key made from the author and the year, not one of `taken`. */
export const bibKey = (fields: BibField[], taken: string[]) => call<string>("bib_key", { fields, taken });
/** The entry of a DOI or of an arXiv preprint (the only call here that uses the network). */
export const bibFetch = (source: "doi" | "arxiv", id: string) => call<BibDraft[]>("bib_fetch", { source, id });
/** The local history of the open project: its moments, the latest first. */
export const historyList = () => call<HistoryView>("history_list");
/** The files of the project that are not what they were at a moment. */
export const historyChanges = (id: string) => call<Change[]>("history_changes", { id });
/** A file of the project (its path in the project) then and now. */
export const historyCompare = (id: string, file: string) => call<Comparison>("history_compare", { id, file });
/** Takes a moment now (null when nothing changed since the last one). */
export const historyKeep = (reason: "manual" | "before-restore") => call<Moment | null>("history_keep", { reason });
/** Forgets the history of the open project. */
export const historyClear = () => call<void>("history_clear");
/** Builds the PDF of what changed in the document of `path` since a moment (latexdiff). */
export const historyChangesPdf = (path: string, id: string) => call<ChangesPdf>("history_changes_pdf", { path, id });
/** Stops the PDF of the changes being built. */
export const historyChangesCancel = () => call<void>("history_changes_cancel");
/** What an export of the document of `path` would hold. */
export const exportPlan = (path: string, options: ExportOptions) => call<ExportPlan>("export_plan", { path, options });
/** Writes the archive of an export at `dest`; its size in bytes. */
export const exportWrite = (path: string, options: ExportOptions, dest: string) => call<number>("export_write", { path, options, dest });
/** A new definition, written and checked against the project of `path`. */
export const draftCommand = (path: string, spec: CommandSpec) => call<CommandDraft>("draft_command", { path, spec });
export const structure = (path: string) => call<T.Structure | null>("structure", { path });
export const search = (query: string, regex: boolean, caseSensitive: boolean, wholeWord = false) =>
  call<T.SearchMatch[]>("search", { query, regex, caseSensitive, wholeWord });
export const wordCount = (path: string) => call<{ file: T.WordCount; project: T.WordCount } | null>("word_count", { path });
export const rootOf = (path: string) => call<string | null>("root_of", { path });

// --------------------------------------------------------------- build
/** Starts (or queues) a build; `manual`: asked for by the user (not live or on save). */
/**
 * Asks for a build. `live`: one made while the text is typed, which is one
 * pass of the engine and gives way to a newer text (see the engine).
 */
export const build = (path: string, manual: boolean, live = false, only = false) => call<void>("build", { path, manual, live, only });
/** A file that is a part of its document and can be compiled on its own. */
export interface DocumentPart {
  root: string;
  file: string;
}
export const documentPart = (path: string) => call<DocumentPart | null>("document_part", { path });
export const cancelBuild = () => call<void>("cancel_build");
export const buildPlan = (path: string) => call<{ Ok?: T.BuildPlan; Err?: T.Diagnostic }>("build_plan", { path });
export const cleanBuild = (path: string) => call<number>("clean_build", { path });
export const pdfPath = (path: string) => call<string | null>("pdf_path", { path });
export const synctexForward = (path: string, line: number, pdf: string | null = null) => call<T.ForwardView | null>("synctex_forward", { path, line, pdf });
export const synctexInverse = (pdf: string, page: number, x: number, y: number) =>
  call<T.InverseResult | null>("synctex_inverse", { pdf, page, x, y });

// ----------------------------------------------------------------- TeX
export const texStatus = () => call<T.TexStatus>("tex_status");
export const detectTex = () => call<void>("detect_tex");
export const distroOptions = () => call<T.DistroOption[]>("distro_options");
export const previewJob = (request: T.JobRequest) => call<T.Plan>("preview_job", { request });
export const startJob = (request: T.JobRequest) => call<number>("start_job", { request });
export const cancelJob = (id: number) => call<void>("cancel_job", { id });
export const installedPackages = () => call<string[]>("installed_packages");
export const installedClasses = () => call<string[]>("installed_classes");
export const repositoryPackages = (installedOnly: boolean) => call<T.RepositoryPackage[]>("repository_packages", { installedOnly });
export const packageDetails = (name: string, isClass: boolean) => call<T.PackageView>("package_details", { name, class: isClass });
export const ctanCatalog = () => call<T.CatalogEntry[]>("ctan_catalog");
export const ctanPackage = (name: string) => call<T.CtanDetails>("ctan_package", { name });
export const openTexdoc = (name: string) => call<boolean>("open_texdoc", { name });

// ------------------------------------------------- images, fonts, TikZ
/** How much an image is lightened when it is copied into the project. */
export type CompressionLevel = "balanced" | "light";
/** What an image weighs, and what it would weigh made lighter (null: nothing to gain). */
export interface ImageWeight {
  original: number;
  compressed: number | null;
  /** Extension of the lighter copy (`jpg` for a photograph kept as PNG). */
  ext: string | null;
}
export const importImage = (source: string, dir: string, name?: string, level?: CompressionLevel | null) =>
  call<string>("import_image", { source, dir, name: name ?? null, level: level ?? null });
/** Writes an image given as data in a folder of the project, under `name` (with its extension). */
export const importImageData = (dir: string, name: string, bytes: Uint8Array, level?: CompressionLevel | null) =>
  invoke<string>("import_image_data", bytes, { headers: { "x-dir": encodeURIComponent(dir), "x-name": encodeURIComponent(name), ...(level ? { "x-level": level } : {}) } });
export const imageWeight = (path: string, level: CompressionLevel) => call<ImageWeight>("image_weight", { path, level });
export const imageWeightData = (bytes: Uint8Array, level: CompressionLevel) => invoke<ImageWeight>("image_weight_data", bytes, { headers: { "x-level": level } });
export const safeFileName = (name: string) => call<string>("safe_file_name", { name });
export const importSvgData = (dir: string, name: string, svg: Uint8Array) =>
  invoke<string>("import_svg_data", svg, { headers: { "x-dir": encodeURIComponent(dir), "x-name": encodeURIComponent(name) } });
export const systemFonts = () => call<T.FontFamily[]>("system_fonts");
export const inspectFonts = (paths: string[]) => call<T.FontFamily[]>("inspect_fonts", { paths });
export const fontHasMath = (path: string, index: number) => call<boolean>("font_has_math", { path, index });
export const importFonts = (sources: string[], dir: string) => call<string[]>("import_fonts", { sources, dir });
export const fontspecCode = (family: T.FontFamily, role: T.FontRole, dir: string | null, command: string) =>
  call<string>("fontspec_code", { family, role, dir, command });
export const texFonts = () => call<T.TexFont[]>("tex_fonts");
export const tikzTemplates = () => call<T.TikzTemplate[]>("tikz_templates");
export const tikzLibraries = () => call<string[]>("tikz_libraries");
/** The sets of the TikZ whiteboard the user kept (shapes to draw again), and their writing. */
export const tikzSets = () => call<ShapeSet[]>("tikz_sets");
export const saveTikzSets = (sets: ShapeSet[]) => call<void>("save_tikz_sets", { sets });
export const previewSnippet = (request: T.SnippetRequest) => call<T.PreviewOutcome>("preview_snippet", { request });
/** Compiles a whole document (the pages of a layout being set) next to the project of `path`. */
export const previewPage = (request: { path: string; job: string; source: string }) => call<PagePreview>("preview_page", { request });

// ---------------------------------------------------------------- help
export const helpPages = () => call<T.PageInfo[]>("help_pages");
export const helpPage = (id: string) => call<string | null>("help_page", { id });
export const referenceSearch = (query: string) => call<T.ReferenceEntry[]>("reference_search", { query });
export const symbolPalette = () => call<T.SymbolCategory[]>("symbol_palette");
export const errorCatalog = () => call<T.ErrorEntry[]>("error_catalog");
export const builtinSnippets = () => call<T.SnippetView[]>("builtin_snippets");
export const atShortcuts = () => call<[string, string][]>("at_shortcuts");
export const lintRules = () => call<[string, T.Severity][]>("lint_rules");

// -------------------------------------------------------------- events
export interface Events {
  "build:started": { plan: T.BuildPlan; manual: boolean };
  "build:step": { name: string; command: string };
  "build:output": { lines: T.OutputLine[] };
  /** `superseded`: the build was given up for a newer text, which is being built. */
  "build:finished": { outcome: T.BuildOutcome | null; error: T.Diagnostic | null; manual: boolean; superseded?: boolean };
  "export:pictures": { done: number; total: number };
  /** Between the main window and the window of an export (see `exportwindow.ts`). */
  "export-window:state": ExportWindowState;
  "export-window:command": ExportWindowCommand;
  "export-window:ready": null;
  "export-window:report": ExportWindowReport;
  "export:step": { name: string; command: string };
  "export:output": { lines: T.OutputLine[] };
  "tex:status": T.TexStatus;
  "job:output": { id: number; lines: string[] };
  "job:finished": { id: number; success: boolean; cancelled: boolean; code: number | null };
  "fs:changed": { paths: string[]; structure: boolean };
  "history:changed": null;
  "app:open-files": null;
  "app:quit-requested": null;
}

export function on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Promise<UnlistenFn> {
  return listen<Events[K]>(event, (e) => handler(e.payload));
}
