// The open project: information, file tree, structure (outline, labels,
// citations, TODOs), project-wide lint and file operations.

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import type { Diagnostic, FileNode, ProjectConfig, ProjectInfo, RecentProject, Structure } from "../types";
import { basename, debounce, dirname, extension, fileKind, join, relative, samePath } from "../utils";
import { app } from "./app.svelte";
import { build } from "./build.svelte";
import { diagnostics, pathKey } from "./diagnostics.svelte";
import { editor } from "./editor.svelte";
import { media } from "./media.svelte";
import { ui } from "./ui.svelte";
import { viewer } from "./viewer.svelte";

class ProjectStore {
  info = $state<ProjectInfo | null>(null);
  tree = $state<FileNode[]>([]);
  structure = $state<Structure | null>(null);
  opening = $state(false);
  /** A feature needing a folder waits for the light file to become a project. */
  conversion = $state<{ reason: string; resolve: (ok: boolean) => void } | null>(null);

  lintSoon = debounce(() => void this.lintAll(), 700);
  private structureSoon = debounce(() => void this.refreshStructure(), 450);
  private treeSoon = debounce(() => void this.refreshTree(), 250);

  get root(): string | null {
    return this.info?.root ?? null;
  }

  /** A file opened on its own (light mode): no project folder. */
  get light(): boolean {
    return !!this.info?.light;
  }

  async init() {
    // Features that write files next to the document ask for a project first.
    media.guard = (reason) => this.requireProject(reason);
    await ipc.on("fs:changed", ({ paths, structure }) => {
      void editor.externalChanges(paths);
      if (structure) this.treeSoon();
      if (paths.some((p) => /\.(tex|bib|sty|cls|ltx)$/i.test(p))) {
        this.lintSoon();
        this.structureSoon();
      }
      // A PDF rebuilt by another tool (latexmk -pvc, terminal…).
      if (!build.running && viewer.pdf && paths.some((p) => samePath(p, viewer.pdf))) viewer.load(viewer.pdf);
    });
    editor.onDidSync(() => this.structureSoon());
    editor.onDidSave(() => this.lintSoon());
  }

  // ------------------------------------------------------------ opening

  /** Opens a folder, or the folder of a file, as the project. */
  async open(path: string): Promise<boolean> {
    if (this.info && !this.info.light && samePath(this.info.root, path)) return true;
    if (this.info && !(await this.close())) return false;
    this.opening = true;
    try {
      const info = await ipc.openProject(path);
      await this.adopt(info);
      return true;
    } catch (e) {
      ui.toast("error", t("project.openFailed"), { detail: String(e) });
      return false;
    } finally {
      this.opening = false;
    }
  }

  /** Makes `info` the current project (after opening or creating it). */
  private async adopt(info: ProjectInfo) {
    this.info = info;
    build.reset();
    viewer.clear();
    ui.overlay = null;
    if (info.configError) ui.toast("warning", t("project.configError"), { detail: info.configError, timeout: 0 });
    await this.refreshTree();
    const files = app.settings?.general.restoreSession === false ? [] : info.openFiles;
    await editor.restore(files, info.initialFile);
    void this.lintAll();
    void this.refreshStructure();
    const target = info.main ?? info.initialFile;
    if (target) {
      const pdf = await ipc.pdfPath(target).catch(() => null);
      if (pdf) viewer.load(pdf);
    }
    void app.refreshSession();
  }

  /** Opens a `.tex` file on its own (light mode): nothing is created next to it. */
  /**
   * Files the system asked to open: a folder opens as a project; a file of
   * the open project opens in the editor; a file of a RayTeX project
   * opens that project; any other LaTeX file opens on its own (light mode),
   * any other file with its folder.
   */
  async openFiles(paths: string[]): Promise<void> {
    // A RayTeX project (or one of the versions named LaBagueTex).
    const isProjectDir = async (dir: string) =>
      (await ipc.pathExists(join(dir, "raytex.toml")).catch(() => false)) || (await ipc.pathExists(join(dir, "labaguetex.toml")).catch(() => false));
    for (const path of paths) {
      const inside = this.info && !this.info.light && pathKey(path).startsWith(pathKey(this.info.root) + "/");
      if (inside) {
        await editor.open(path);
        continue;
      }
      if (!extension(path)) {
        // A folder (a file without extension is rare, and opens with its folder anyway).
        if (await isProjectDir(path)) {
          await this.open(path);
          continue;
        }
      }
      const dir = dirname(path);
      const isProject = await isProjectDir(dir);
      if (/\.(tex|ltx)$/i.test(path) && !isProject) {
        await this.openLight(path);
      } else if (!extension(path) && !isProject) {
        await this.open(path);
      } else if (await this.open(dir)) {
        await editor.open(path);
      }
    }
  }

  async openLight(file: string): Promise<boolean> {
    if (this.info && samePath(this.info.main, file) && this.info.light) return true;
    if (this.info && !(await this.close())) return false;
    this.opening = true;
    try {
      await this.adopt(await ipc.openLightFile(file));
      return true;
    } catch (e) {
      ui.toast("error", t("project.openFailed"), { detail: String(e) });
      return false;
    } finally {
      this.opening = false;
    }
  }

  /** Opens a recent project or file, as it was opened. */
  openRecent(r: RecentProject): Promise<boolean> {
    return r.light ? this.openLight(r.path) : this.open(r.path);
  }

  /**
   * In light mode, asks to make a project (name and place) before a feature
   * that needs a folder (images, font files…). Resolves with true when the
   * feature can go on (already a project, or the project was made).
   */
  requireProject(reason: string): Promise<boolean> {
    if (!this.info?.light) return Promise.resolve(true);
    this.conversion?.resolve(false);
    return new Promise((resolve) => {
      this.conversion = { reason, resolve };
      ui.openOverlay("convert");
    });
  }

  /** Makes a project from the light file (in `parent`, the projects folder by default) and opens it. */
  async convert(name: string, parent: string | null): Promise<boolean> {
    if (!this.info?.light) return true;
    // Unsaved changes go to the file first: it is copied into the project.
    if (!(await editor.saveAll({ silent: true }))) return false;
    const pending = this.conversion;
    this.opening = true;
    try {
      const info = await ipc.convertToProject(name, parent);
      editor.reset();
      await this.adopt(info);
      ui.toast("success", t("light.converted", { name: info.name }), { detail: info.root });
      this.conversion = null;
      pending?.resolve(true);
      return true;
    } catch (e) {
      ui.toast("error", t("project.createFailed"), { detail: String(e) });
      return false;
    } finally {
      this.opening = false;
    }
  }

  /** The conversion dialog was closed without making a project. */
  cancelConversion() {
    const pending = this.conversion;
    this.conversion = null;
    pending?.resolve(false);
  }

  async openFolderDialog() {
    const dir = await openDialog({ directory: true, title: t("project.openTitle") });
    if (typeof dir === "string") await this.open(dir);
  }

  async openFileDialog() {
    const file = await openDialog({
      title: t("project.openFileTitle"),
      filters: [{ name: "LaTeX", extensions: ["tex", "ltx", "bib", "sty", "cls"] }],
    });
    if (typeof file !== "string") return;
    if (this.info && !this.info.light && relative(this.info.root, file) !== file.replace(/\\/g, "/")) {
      await editor.open(file);
    } else if (/\.(tex|ltx)$/i.test(file)) {
      // A LaTeX file alone: light mode, no project created.
      await this.openLight(file);
    } else {
      await this.open(file);
    }
  }

  /** Closes the project (asks about unsaved changes). */
  async close(): Promise<boolean> {
    if (!(await editor.closeAll())) return false;
    await ipc.closeProject().catch(() => {});
    editor.reset();
    this.info = null;
    this.tree = [];
    this.structure = null;
    for (const key of Object.keys(diagnostics.lint)) diagnostics.clearLint(key);
    build.reset();
    viewer.clear();
    await app.refreshSession();
    return true;
  }

  /** Creates an empty project and opens it, with the templates in the sidebar. */
  async createEmpty(dir: string, name: string): Promise<boolean> {
    if (this.info && !(await this.close())) return false;
    this.opening = true;
    try {
      await this.adopt(await ipc.createEmptyProject(dir, name));
      ui.sidebar = "templates";
      ui.setVisible("sidebar", true);
      editor.focus();
      return true;
    } catch (e) {
      ui.toast("error", t("project.createFailed"), { detail: String(e) });
      return false;
    } finally {
      this.opening = false;
    }
  }

  // ------------------------------------------------------------- refresh

  async refreshTree() {
    if (!this.info) return;
    this.tree = await ipc.fileTree().catch(() => []);
  }

  async refreshInfo() {
    this.info = await ipc.projectInfo().catch(() => this.info);
  }

  /** Lints every file of the project (Problems panel). */
  async lintAll() {
    if (!this.info || app.settings?.lint.enabled === false) return;
    const all: Diagnostic[] = await ipc.lintProject().catch(() => []);
    const byFile = new Map<string, Diagnostic[]>();
    for (const d of all) {
      if (!d.file) continue;
      const k = pathKey(d.file);
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k)!.push(d);
    }
    for (const key of Object.keys(diagnostics.lint)) if (!byFile.has(key)) diagnostics.setLint(key, []);
    for (const [key, list] of byFile) diagnostics.setLint(key, list);
  }

  async refreshStructure() {
    if (!this.info) return;
    const active = editor.active;
    const target = active && fileKind(active) === "tex" ? active : this.info.main;
    if (!target) {
      this.structure = null;
      return;
    }
    this.structure = await ipc.structure(target).catch(() => null);
  }

  // -------------------------------------------------------- configuration

  async setMain(path: string) {
    try {
      this.info = await ipc.setMainFile(path);
      ui.toast("success", t("project.mainSet", { file: basename(path) }));
      void this.refreshStructure();
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  async updateConfig(mutate: (c: ProjectConfig) => void) {
    if (!this.info) return;
    const next = structuredClone($state.snapshot(this.info.config)) as ProjectConfig;
    mutate(next);
    try {
      this.info = await ipc.saveProjectConfig(next);
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  async saveAsTemplate() {
    if (!this.info || !(await this.requireProject(t("light.reasonTemplate")))) return;
    const name = await ui.prompt({ title: t("project.templateName"), value: this.info.name, okLabel: t("common.save") });
    if (!name) return;
    try {
      await ipc.saveAsTemplate(name, "");
      ui.toast("success", t("project.templateSaved", { name }));
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  // ----------------------------------------------------- file operations

  private validName(name: string): boolean {
    return !!name.trim() && !/[<>:"|?*\u0000]/.test(name) && !name.split(/[\\/]/).includes("..");
  }

  async newFile(dir = this.root) {
    // In light mode the folder becomes that of the new project.
    const wasLight = this.light;
    if (!(await this.requireProject(t("light.reasonFiles")))) return;
    if (wasLight) dir = this.root;
    if (!dir || !this.info) return;
    const name = await ui.prompt({ title: t("project.newFileTitle"), value: "chapter.tex", placeholder: "chapter.tex", okLabel: t("common.create") });
    if (!name) return;
    if (!this.validName(name)) {
      ui.toast("error", t("project.invalidName"));
      return;
    }
    const file = join(dir, extension(name) ? name : `${name}.tex`);
    let text = "";
    if (fileKind(file) === "tex" && this.info.main && !samePath(this.info.main, file)) {
      // Lets the new file be compiled (and completed) before it is \input anywhere.
      const depth = relative(this.info.root, dirname(file)).split("/").filter(Boolean).length;
      text = `% !TEX root = ${"../".repeat(depth)}${relative(this.info.root, this.info.main)}\n\n`;
    }
    try {
      const created = await ipc.createFile(file, text);
      await this.refreshTree();
      await editor.open(created);
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  async newFolder(dir = this.root) {
    // In light mode the folder becomes that of the new project.
    const wasLight = this.light;
    if (!(await this.requireProject(t("light.reasonFiles")))) return;
    if (wasLight) dir = this.root;
    if (!dir) return;
    const name = await ui.prompt({ title: t("project.newFolderTitle"), value: "", placeholder: "figures", okLabel: t("common.create") });
    if (!name) return;
    if (!this.validName(name)) {
      ui.toast("error", t("project.invalidName"));
      return;
    }
    try {
      await ipc.createDir(join(dir, name));
      await this.refreshTree();
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  async rename(path: string) {
    const name = await ui.prompt({ title: t("project.renameTitle", { name: basename(path) }), value: basename(path), okLabel: t("editor.rename") });
    if (!name || name === basename(path)) return;
    if (!this.validName(name) || /[\\/]/.test(name)) {
      ui.toast("error", t("project.invalidName"));
      return;
    }
    await this.move(path, join(dirname(path), name));
  }

  async move(from: string, to: string, refresh = true) {
    if (samePath(from, to)) return;
    try {
      const target = await ipc.renamePath(from, to);
      editor.renamed(from, target);
      if (this.info?.main && (samePath(this.info.main, from) || pathKey(this.info.main).startsWith(pathKey(from) + "/"))) {
        const main = target + this.info.main.slice(from.length);
        await this.setMain(main);
      }
      if (refresh) await this.refreshTree();
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  /** Moves files and folders into `dir` (those already there, and `dir` itself, stay). */
  async moveMany(paths: string[], dir: string) {
    const moved = paths.filter((p) => !samePath(dirname(p), dir) && !samePath(p, dir) && !pathKey(dir).startsWith(pathKey(p) + "/"));
    for (const p of moved) await this.move(p, join(dir, basename(p)), false);
    if (moved.length) await this.refreshTree();
  }

  async remove(path: string, isDir: boolean) {
    const ok = await ui.confirm({
      title: t(isDir ? "project.deleteFolderTitle" : "project.deleteFileTitle", { name: basename(path) }),
      message: t("project.deleteMessage"),
      okLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await editor.deleted(path);
      await ipc.deletePath(path);
      await this.refreshTree();
    } catch (e) {
      ui.toast("error", String(e));
    }
  }

  /** Deletes several files and folders after one confirmation. */
  async removeMany(paths: string[]) {
    if (paths.length === 1) {
      const node = this.findNode(paths[0]);
      return this.remove(paths[0], !!node?.dir);
    }
    const names = paths.slice(0, 8).map((p) => `• ${basename(p)}`);
    if (paths.length > 8) names.push(t("project.andMore", { n: paths.length - 8 }));
    const ok = await ui.confirm({
      title: t("project.deleteManyTitle", { n: paths.length }),
      message: `${names.join("\n")}\n\n${t("project.deleteManyMessage")}`,
      okLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    for (const p of paths) {
      try {
        await editor.deleted(p);
        await ipc.deletePath(p);
      } catch (e) {
        ui.toast("error", String(e));
      }
    }
    await this.refreshTree();
  }

  /** The node of `path` in the tree. */
  findNode(path: string, nodes: FileNode[] = this.tree): FileNode | null {
    for (const n of nodes) {
      if (samePath(n.path, path)) return n;
      const inner = n.children ? this.findNode(path, n.children) : null;
      if (inner) return inner;
    }
    return null;
  }

  async importDialog(dir = this.root) {
    // In light mode the folder becomes that of the new project.
    const wasLight = this.light;
    if (!(await this.requireProject(t("light.reasonFiles")))) return;
    if (wasLight) dir = this.root;
    if (!dir) return;
    const files = await openDialog({ multiple: true, title: t("project.importTitle") });
    if (!files) return;
    await this.importFiles(Array.isArray(files) ? files : [files], dir);
  }

  async importFiles(sources: string[], dir = this.root): Promise<string[]> {
    const wasLight = this.light;
    if (!(await this.requireProject(t("light.reasonFiles")))) return [];
    if (wasLight) dir = this.root;
    if (!dir || !sources.length) return [];
    try {
      const created = await ipc.importFiles(sources, dir);
      await this.refreshTree();
      ui.toast("success", t("project.imported", { n: created.length }));
      return created;
    } catch (e) {
      ui.toast("error", String(e));
      return [];
    }
  }
}

export const project = new ProjectStore();
