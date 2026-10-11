// A report of a problem, to paste in an issue: what RayTeX and TeX are
// here, how the document is built, and what the last build said. Nothing
// is sent anywhere: the text is shown, copied by the user, and pasted where
// they choose. It is written in English whatever the language of the
// interface (it is read on GitHub), and says nothing of who the user is:
// the folder of the user and the folder of the project are taken out of
// every path.

/** Where issues are written. */
export const ISSUES_URL = "https://github.com/ifanoxy/raytex/issues/new";

export interface ReportProblem {
  severity: string;
  code: string | null;
  message: string;
  file: string | null;
  line: number | null;
}

export interface ReportData {
  /** What the user says happened; empty when nothing was typed. */
  description: string;
  app: { version: string; os: string; arch: string } | null;
  /** The TeX distribution in use (`TeX Live 2025`); null when none was found. */
  tex: { label: string; kind: string } | null;
  settings: { engine: string; tool: string; autoBuild: string; miktexAutoInstall: boolean; shellEscape: boolean } | null;
  /** The last build; null when the document was not built. */
  build: { engine: string; success: boolean; cancelled: boolean; durationMs: number; steps: string[]; problems: ReportProblem[] } | null;
  /** The last lines the build printed. */
  output: string[];
  /** The folder of the project, taken out of the paths. */
  projectRoot: string | null;
}

export interface ReportOptions {
  /** The problems of the last build (messages of LaTeX, with the file and the line). */
  problems: boolean;
  /** The end of what the build printed (it may quote lines of the document). */
  output: boolean;
}

/** A path, or a text with paths in it, without the folder of the project and without the name of the user. */
export function anonymise(text: string, projectRoot: string | null): string {
  let out = text;
  if (projectRoot) {
    for (const root of new Set([projectRoot, projectRoot.replace(/\\/g, "/"), projectRoot.replace(/\//g, "\\")])) {
      out = out.split(`${root}/`).join("").split(`${root}\\`).join("").split(root).join("<project>");
    }
  }
  return out
    // A Windows name may have spaces in it ("Jean Dupont"): up to the next separator.
    .replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/"'\n]+/g, "$1<user>")
    .replace(/(\/(?:Users|home)\/)[^/\s"']+/g, "$1<user>");
}

/** A cell of a Markdown table: on one line, its bars escaped. */
const cell = (text: string) => text.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim();

/** How many problems at most are listed (the first errors say the most). */
const MAX_PROBLEMS = 15;
const MAX_OUTPUT = 40;

/** The report, in Markdown. */
export function problemReport(data: ReportData, options: ReportOptions): string {
  const clean = (text: string) => anonymise(text, data.projectRoot);
  const lines: string[] = ["### What happened", "", data.description.trim() || "_Describe the problem here: what you did, what you expected, what you got._", "", "### Environment", ""];
  lines.push(data.app ? `- RayTeX ${data.app.version} (${data.app.os}, ${data.app.arch})` : "- RayTeX: unknown version");
  lines.push(data.tex ? `- TeX: ${data.tex.label}` : "- TeX: no distribution found");
  if (data.settings) {
    const s = data.settings;
    lines.push(`- Build settings: engine ${s.engine}, driver ${s.tool}, automatic build ${s.autoBuild}${s.shellEscape ? ", shell escape on" : ""}`);
    if (data.tex?.kind === "miktex") lines.push(`- MiKTeX installs missing packages while compiling: ${s.miktexAutoInstall ? "yes" : "no"}`);
  }
  lines.push("", "### Last build", "");
  const b = data.build;
  if (!b) lines.push("The document was not built in this session.");
  else {
    const errors = b.problems.filter((p) => p.severity === "error").length;
    const warnings = b.problems.filter((p) => p.severity === "warning").length;
    const result = b.cancelled ? "cancelled" : b.success ? "succeeded" : "failed";
    lines.push(`- ${b.engine}: ${result} in ${(b.durationMs / 1000).toFixed(1)} s${b.steps.length ? ` (${b.steps.join(", ")})` : ""}`);
    lines.push(`- ${errors} error(s), ${warnings} warning(s)`);
    if (options.problems && b.problems.length) {
      // Errors first: they are what stopped the build.
      const rank = (p: ReportProblem) => (p.severity === "error" ? 0 : p.severity === "warning" ? 1 : 2);
      const shown = [...b.problems].sort((x, y) => rank(x) - rank(y)).slice(0, MAX_PROBLEMS);
      lines.push("", "| | Code | Message | Where |", "|---|---|---|---|");
      for (const p of shown) {
        const where = p.file ? `${clean(p.file)}${p.line ? `:${p.line}` : ""}` : "";
        lines.push(`| ${p.severity} | ${p.code ?? ""} | ${cell(clean(p.message))} | ${cell(where)} |`);
      }
      if (b.problems.length > shown.length) lines.push("", `_…and ${b.problems.length - shown.length} more._`);
    }
  }
  if (options.output && data.output.length) {
    const tail = data.output.slice(-MAX_OUTPUT).map(clean);
    // A fence longer than any run of backquotes in the output.
    const longest = Math.max(2, ...tail.join("\n").split(/[^`]+/).map((run) => run.length));
    const fence = "`".repeat(longest + 1);
    lines.push("", `<details><summary>End of the build output (${tail.length} lines)</summary>`, "", fence, ...tail, fence, "", "</details>");
  }
  return `${lines.join("\n")}\n`;
}
