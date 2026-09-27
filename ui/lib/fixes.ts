// Automatic fixes attached to diagnostics (lint and build).

import { t } from "./i18n.svelte";
import { installMissing } from "./install";
import * as ipc from "./ipc";
import { build } from "./state/build.svelte";
import { diagnostics } from "./state/diagnostics.svelte";
import { editor } from "./state/editor.svelte";
import { project } from "./state/project.svelte";
import { ui } from "./state/ui.svelte";
import type { Diagnostic, Fix } from "./types";
import { join } from "./utils";

export function fixLabel(fix: Fix): string {
  switch (fix.kind) {
    case "addPackage":
      return t("fix.addPackage", { pkg: fix.package });
    case "installPackage":
      return t("fix.install", { name: fix.file });
    case "replace":
      return fix.title;
    case "useEngine":
      return t("fix.useEngine", { engine: fix.engine });
    case "enableShellEscape":
      return t("fix.shellEscape");
    case "createFile":
      return t("fix.createFile", { path: fix.path });
  }
}

export async function runFix(fix: Fix, d: Diagnostic): Promise<void> {
  if (await apply(fix, d)) diagnostics.dismiss(d);
}

/** Applies a fix; resolves with whether it was applied. */
async function apply(fix: Fix, d: Diagnostic): Promise<boolean> {
  switch (fix.kind) {
    case "addPackage": {
      if (d.file && !editor.isOpen(d.file)) await editor.open(d.file);
      return editor.addPackage(fix.package);
    }
    case "installPackage": {
      if (!(await installMissing(fix.file))) return false;
      void build.run();
      return true;
    }
    case "replace": {
      if (!d.file) return false;
      await editor.open(d.file, { range: fix.range });
      await editor.applyEdits([{ file: d.file, range: fix.range, newText: fix.text }]);
      editor.focus();
      return true;
    }
    case "useEngine": {
      await editor.setMagicProgram(fix.engine);
      ui.toast("success", t("fix.engineSet", { engine: fix.engine }));
      void build.run();
      return true;
    }
    case "enableShellEscape": {
      const ok = await ui.confirm({
        title: t("fix.shellEscapeTitle"),
        message: t("fix.shellEscapeMessage"),
        okLabel: t("fix.shellEscapeConfirm"),
        danger: true,
      });
      if (!ok) return false;
      await project.updateConfig((c) => {
        c.build.shell_escape = true;
      });
      void build.run();
      return true;
    }
    case "createFile": {
      const root = project.info?.root;
      if (!root) return false;
      try {
        const path = await ipc.createFile(join(root, fix.path));
        await editor.open(path);
        return true;
      } catch (e) {
        ui.toast("error", String(e));
        return false;
      }
    }
  }
}
