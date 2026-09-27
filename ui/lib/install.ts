// Installing distributions and packages: every job shows the exact
// commands first and runs only after the user agreed.

import { t, tr } from "./i18n.svelte";
import * as ipc from "./ipc";
import { tex } from "./state/tex.svelte";
import { ui } from "./state/ui.svelte";
import type { Cmd, JobRequest, Plan } from "./types";

function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

export function formatCmd(cmd: Cmd): string {
  return [cmd.program, ...cmd.args].map(quote).join(" ");
}

/** Shows the plan of `request`, runs it once confirmed, and resolves with its success. */
export async function confirmAndRun(request: JobRequest, title: string): Promise<boolean> {
  let plan: Plan;
  try {
    plan = await ipc.previewJob(request);
  } catch (e) {
    await ui.alert({ title: t("install.impossible"), message: String(e) });
    return false;
  }
  const ok = await ui.confirm({
    title,
    message: tr(plan.note) || undefined,
    detail: plan.needsAdmin ? t("install.needsAdmin") : undefined,
    code: plan.steps.map(formatCmd).join("\n") || undefined,
    okLabel: t("install.run"),
  });
  if (!ok) return false;
  let done: Promise<boolean>;
  try {
    ({ done } = await tex.run(request, title));
  } catch (e) {
    ui.toast("error", t("install.failed"), { detail: String(e) });
    return false;
  }
  ui.showBottom("jobs");
  const success = await done;
  if (success) ui.toast("success", t("install.done", { title }));
  else ui.toast("error", t("install.failed"), { action: { label: t("install.showLog"), run: () => ui.showBottom("jobs") } });
  return success;
}

/** Installs the package providing `file` (`foo.sty`) or named `name`. */
export function installMissing(file: string): Promise<boolean> {
  const isFile = /\.\w+$/.test(file);
  return confirmAndRun(isFile ? { kind: "installPackages", files: [file] } : { kind: "installPackages", packages: [file] }, t("install.packageTitle", { name: file }));
}
