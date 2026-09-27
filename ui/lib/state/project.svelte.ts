// The open project: information, file tree, structure (outline, labels,
// citations, TODOs), project-wide lint and file operations.

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n.svelte";
import * as ipc from "../ipc";
import type { Diagnostic, FileNode, ProjectConfig, ProjectInfo, Structure } from "../types";
import { basename, debounce, dirname, extension, fileKind, join, relative, samePath } from "../utils";
import { app } from "./app.svelte";
import { build } from "./build.svelte";
import { diagnostics, pathKey } from "./diagnostics.svelte";
import { editor } from "./editor.svelte";
import { ui } from "./ui.svelte";
import { viewer } from "./viewer.svelte";

class ProjectStore {
  info = $state<ProjectInfo | null>(null);
  tree = $state<FileNode[]>([]);
  structure = $state<Structure | null>(null);
  opening = $state(false);

  lintSoon = debounce(() => void this.lintAll(), 700);
  private structureSoon = debounce(() => void this.refreshStructure(), 450);
  private treeSoon = debounce(() => void this.refreshTree(), 250);

  get root(): string | null {
    return this.info?.root ?? null;
  }

  async init() {
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
    if (this.info && samePath(this.info.root, path)) return true;
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
    if (this.info && relative(this.info.root, file) !== file.replace(/\\/g, "/")) {
      await editor.open(file);
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
    if (!this.info) return;
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

  async move(from: string, to: string) {
    if (samePath(from, to)) return;
    try {
      const target = await ipc.renamePath(from, to);
      editor.renamed(from, target);
      if (this.info?.main && (samePath(this.info.main, from) || pathKey(this.info.main).startsWith(pathKey(from) + "/"))) {
        const main = target + this.info.main.slice(from.length);
        await this.setMain(main);
      }
      await this.refreshTree();
    } catch (e) {
      ui.toast("error", String(e));
    }
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

  async importDialog(dir = this.root) {
    if (!dir) return;
    const files = await openDialog({ multiple: true, title: t("project.importTitle") });
    if (!files) return;
    await this.importFiles(Array.isArray(files) ? files : [files], dir);
  }

  async importFiles(sources: string[], dir = this.root): Promise<string[]> {
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
