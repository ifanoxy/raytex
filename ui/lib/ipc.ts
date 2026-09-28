// Typed access to the Rust side. Every function maps to one IPC command
// (see crates/raytex-desktop/src/commands).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type * as T from "./types";

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
export const exportFile = (from: string, to: string) => call<void>("export_file", { from, to });

// ------------------------------------------------------------ language
export const updateDocument = (path: string, text: string, version: number) =>
  call<T.DocumentUpdate>("update_document", { path, text, version });
export const closeDocument = (path: string) => call<void>("close_document", { path });
export const lintProject = () => call<T.Diagnostic[]>("lint_project");
export const complete = (path: string, before: string, after: string, explicit: boolean) =>
  call<T.CompletionList | null>("complete", { path, before, after, explicit });
export const completionInfo = (path: string, key: string) => call<string | null>("completion_info", { path, key });
export const hover = (path: string, line: number, character: number) => call<T.HoverView | null>("hover", { path, line, character });
export const definition = (path: string, line: number, character: number) => call<T.Location[]>("definition", { path, line, character });
export const references = (path: string, line: number, character: number) => call<T.Location[]>("references", { path, line, character });
export const renameSymbol = (path: string, line: number, character: number, newName: string) =>
  call<T.TextEdit[]>("rename_symbol", { path, line, character, newName });
export const applyEdits = (edits: T.TextEdit[]) => call<string[]>("apply_edits", { edits });
export const mathAt = (path: string, line: number, character: number) => call<T.MathAt | null>("math_at", { path, line, character });
export const mathMacros = (path: string) => call<Record<string, string>>("math_macros", { path });
export const structure = (path: string) => call<T.Structure | null>("structure", { path });
export const search = (query: string, regex: boolean, caseSensitive: boolean) =>
  call<T.SearchMatch[]>("search", { query, regex, caseSensitive });
export const wordCount = (path: string) => call<{ file: T.WordCount; project: T.WordCount } | null>("word_count", { path });
export const rootOf = (path: string) => call<string | null>("root_of", { path });

// --------------------------------------------------------------- build
/** Starts (or queues) a build; `manual`: asked for by the user (not live or on save). */
export const build = (path: string, manual: boolean) => call<void>("build", { path, manual });
export const cancelBuild = () => call<void>("cancel_build");
export const buildPlan = (path: string) => call<{ Ok?: T.BuildPlan; Err?: T.Diagnostic }>("build_plan", { path });
export const cleanBuild = (path: string) => call<number>("clean_build", { path });
export const pdfPath = (path: string) => call<string | null>("pdf_path", { path });
export const synctexForward = (path: string, line: number) => call<T.ForwardView | null>("synctex_forward", { path, line });
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
export const importImage = (source: string, dir: string, name?: string) => call<string>("import_image", { source, dir, name: name ?? null });
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
export const previewSnippet = (request: T.SnippetRequest) => call<T.PreviewOutcome>("preview_snippet", { request });

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
  "build:finished": { outcome: T.BuildOutcome | null; error: T.Diagnostic | null; manual: boolean };
  "tex:status": T.TexStatus;
  "job:output": { id: number; lines: string[] };
  "job:finished": { id: number; success: boolean; cancelled: boolean; code: number | null };
  "fs:changed": { paths: string[]; structure: boolean };
  "app:open-files": null;
  "app:quit-requested": null;
}

export function on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Promise<UnlistenFn> {
  return listen<Events[K]>(event, (e) => handler(e.payload));
}
