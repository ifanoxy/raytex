// Simulated engine for designing the interface in a plain browser
// (`npm run dev`, then open http://localhost:1420). Never bundled in the
// application: main.ts imports it only in development outside Tauri.
//
// It answers every IPC command with small, realistic data: a demo thesis
// project, a TeX Live installation, diagnostics, a build and a PDF.

import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type * as T from "../lib/types";

const ROOT = "/Users/demo/Documents/memoire";
const p = (rel: string) => `${ROOT}/${rel}`;

const files: Record<string, string> = {
  [p("main.tex")]: `% !TEX program = pdflatex
\\documentclass[12pt,a4paper]{report}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage[backend=biber,style=authoryear]{biblatex}
\\usepackage{hyperref}
\\addbibresource{refs.bib}

\\newcommand{\\R}{\\mathbb{R}}

\\title{Étude des équations de la chaleur}
\\author{Camille Martin}

\\begin{document}
\\maketitle
\\tableofcontents

\\input{chapitres/introduction}
\\input{chapitres/methodes}

\\printbibliography
\\end{document}
`,
  [p("chapitres/introduction.tex")]: `\\chapter{Introduction}
\\label{chap:intro}

La diffusion de la chaleur est décrite par l'équation
\\begin{equation}
  \\frac{\\partial u}{\\partial t} = \\alpha \\Delta u, \\qquad u : \\R^n \\times \\R_+ \\to \\R
  \\label{eq:chaleur}
\\end{equation}
étudiée depuis \\textcite{fourier1822}. % TODO: ajouter l'historique

\\section{Motivation}
Comme le montre la figure~\\ref{fig:courbe}, la température $T(x,t)$ décroît.
Voir aussi l'équation~\\eqref{eq:chaleur} et la section~\\ref{sec:inconnue}.

\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=0.7\\linewidth]{figures/courbe}
  \\caption{Profil de température.}
  \\label{fig:courbe}
\\end{figure}

\\section{Plan du mémoire}
\\textbff{Chapitre 2} présente les méthodes numériques.
`,
  [p("chapitres/methodes.tex")]: `\\chapter{Méthodes numériques}
\\label{chap:methodes}

\\section{Différences finies}
On discrétise $u_i^n \\approx u(i h, n \\tau)$ :
\\begin{align}
  \\frac{u_i^{n+1} - u_i^n}{\\tau} &= \\alpha \\frac{u_{i+1}^n - 2u_i^n + u_{i-1}^n}{h^2} \\\\
  \\lambda &= \\frac{\\alpha \\tau}{h^2} \\leq \\frac12
\\end{align}

\\begin{itemize}
  \\item stabilité \\cite{crank1947}
  \\item convergence
\\end{itemize}
`,
  [p("refs.bib")]: `@book{fourier1822,
  author    = {Fourier, Joseph},
  title     = {Théorie analytique de la chaleur},
  publisher = {Firmin Didot},
  year      = {1822},
}

@article{crank1947,
  author  = {Crank, John and Nicolson, Phyllis},
  title   = {A practical method for numerical evaluation of solutions of partial differential equations},
  journal = {Proc. Cambridge Philos. Soc.},
  volume  = {43},
  year    = {1947},
}
`,
  [p("labaguetex.toml")]: `[project]\nname = "Mémoire"\nmain = "main.tex"\n`,
};

const tree: T.FileNode[] = [
  {
    name: "chapitres",
    path: p("chapitres"),
    dir: true,
    children: [
      { name: "introduction.tex", path: p("chapitres/introduction.tex"), dir: false, children: [] },
      { name: "methodes.tex", path: p("chapitres/methodes.tex"), dir: false, children: [] },
    ],
  },
  { name: "figures", path: p("figures"), dir: true, children: [{ name: "courbe.png", path: p("figures/courbe.png"), dir: false, children: [] }] },
  { name: "labaguetex.toml", path: p("labaguetex.toml"), dir: false, children: [] },
  { name: "main.tex", path: p("main.tex"), dir: false, children: [] },
  { name: "refs.bib", path: p("refs.bib"), dir: false, children: [] },
];

let settings: T.Settings = {
  version: 3,
  general: { language: "system", theme: "system", restoreSession: true, beginnerTips: true, hideAuxFiles: true, projectsDir: null },
  editor: {
    fontFamily: "",
    fontSize: 14,
    lineHeight: 1.55,
    tabSize: 2,
    useTabs: false,
    wordWrap: true,
    lineNumbers: true,
    highlightActiveLine: true,
    autoCloseBrackets: true,
    autoCloseEnvironments: true,
    mathPreview: true,
    hoverDocs: true,
    spellcheck: false,
    vimMode: false,
    autoSave: true,
    autoSaveDelayMs: 1000,
    folding: true,
    showWhitespace: false,
  },
  build: {
    engine: "auto",
    tool: "auto",
    bibTool: "auto",
    autoBuild: "onIdle",
    autoBuildDelayMs: 600,
    outDir: "build",
    synctex: true,
    shellEscape: false,
    haltOnError: false,
    extraArgs: [],
    customSteps: [],
    timeoutS: 300,
    distribution: null,
    extraBinDirs: [],
    showBadboxes: true,
    miktexAutoInstall: true,
    copyPdfToRoot: false,
    precompilePreamble: true,
  },
  viewer: { syncAfterBuild: true, invertInDark: false, defaultZoom: "page-width", doubleClickSync: true },
  completion: { enabled: true, autoAddPackage: true, atShortcuts: true, snippets: true, learnFromPackages: true },
  lint: { enabled: true, styleHints: true, disabledRules: [] },
  macros: [{ name: "Fraction", trigger: "ff", key: "", body: "\\frac{${1:a}}{${2:b}}${0}", math: true }],
  keybindings: {},
};

const session: T.Session = {
  recent: [
    { path: ROOT, name: "memoire", openedAt: Date.now() / 1000 - 3600 * 5, light: false },
    { path: "/Users/demo/Downloads/devoir.tex", name: "devoir.tex", openedAt: Date.now() / 1000 - 86400 * 3, light: true },
    { path: "/Users/demo/Documents/article-edp", name: "article-edp", openedAt: Date.now() / 1000 - 86400 * 12, light: false },
  ],
  lastProject: ROOT,
  lastLight: false,
  openFiles: {},
  activeFile: {},
};

const distribution: T.Distribution = {
  id: "mactex-2025",
  kind: "mactex",
  name: "MacTeX",
  version: "2025",
  binDir: "/Library/TeX/texbin",
  tools: Object.fromEntries(
    ["pdflatex", "xelatex", "lualatex", "latexmk", "biber", "bibtex", "makeindex", "texdoc", "kpsewhich", "synctex"].map((t) => [t, `/Library/TeX/texbin/${t}`]),
  ),
  engines: ["pdflatex", "xelatex", "lualatex", "latex"],
  packageManager: { kind: "tlmgr", path: "/Library/TeX/texbin/tlmgr", writable: false },
};

let texStatus: T.TexStatus = { detected: true, detecting: false, indexing: false, distributions: [distribution], active: distribution.id, installedPackages: 6488 };

let projectOpen = false;

function info(): T.ProjectInfo {
  return {
    root: ROOT,
    name: "Mémoire",
    main: p("main.tex"),
    candidates: [p("main.tex")],
    config: { project: { name: "Mémoire", main: "main.tex" }, build: {}, lint: { disabled_rules: [] } },
    configError: null,
    initialFile: p("chapitres/introduction.tex"),
    light: false,
    openFiles: [p("main.tex"), p("chapitres/introduction.tex")],
  };
}

const range = (line: number, start: number, end: number, endLine = line): T.Range => ({ start: { line, character: start }, end: { line: endLine, character: end } });

function diag(partial: Partial<T.Diagnostic> & Pick<T.Diagnostic, "severity" | "source" | "message">): T.Diagnostic {
  return { code: null, file: null, range: null, line: null, endLine: null, contextBefore: null, contextAfter: null, raw: null, hint: null, fixes: [], ...partial };
}

function lintFor(path: string, text: string): T.Diagnostic[] {
  const out: T.Diagnostic[] = [];
  text.split("\n").forEach((l, i) => {
    const ref = l.indexOf("\\ref{sec:inconnue}");
    if (ref >= 0)
      out.push(
        diag({
          severity: "warning",
          source: "lint",
          code: "undefined-reference",
          message: "Référence indéfinie : sec:inconnue",
          file: path,
          range: range(i, ref + 5, ref + 17),
          hint: { title: "Cette étiquette n'existe pas", explanation: "Aucun `\\label{sec:inconnue}` dans le projet. Vérifiez l'orthographe ou ajoutez l'étiquette." },
        }),
      );
    const bff = l.indexOf("\\textbff");
    if (bff >= 0)
      out.push(
        diag({
          severity: "error",
          source: "lint",
          code: "unknown-command",
          message: "Commande inconnue : \\textbff",
          file: path,
          range: range(i, bff, bff + 8),
          fixes: [{ kind: "replace", title: "Remplacer par \\textbf", range: range(i, bff, bff + 8), text: "\\textbf" }],
        }),
      );
  });
  return out;
}

// A small valid PDF (a few pages of text) generated on the fly.
function makePdf(pages: string[][]): ArrayBuffer {
  const objects: string[] = [];
  const add = (s: string) => objects.push(s) && objects.length;
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const body = lines
      .map((l, i) => {
        const big = l.startsWith("# ");
        const txt = (big ? l.slice(2) : l).replace(/[()\\]/g, (c) => `\\${c}`);
        return `BT /${big ? "F2 20" : "F1 12"} Tf 72 ${760 - i * 22 - (big ? 0 : 20)} Td (${txt}) Tj ET`;
      })
      .join("\n");
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}

const pdfBytes = () =>
  makePdf([
    ["# Etude des equations de la chaleur", "", "Camille Martin", "", "Memoire de master"],
    ["# Chapitre 1 - Introduction", "La diffusion de la chaleur est decrite par l'equation (1.1)", "etudiee depuis Fourier (1822).", "", "1.1 Motivation", "Comme le montre la figure 1.1, la temperature decroit."],
    ["# Chapitre 2 - Methodes numeriques", "2.1 Differences finies", "On discretise u(i h, n tau).", "", "Bibliographie", "Crank, J. et Nicolson, P. (1947)", "Fourier, J. (1822)"],
  ]);

const COMMANDS = ["section", "subsection", "textbf", "textit", "emph", "frac", "sqrt", "alpha", "beta", "label", "ref", "eqref", "cite", "includegraphics", "begin", "end", "item", "mathbb", "partial", "Delta"];

function complete(before: string): T.CompletionList | null {
  const cmd = /\\([a-zA-Z]*)$/.exec(before);
  if (cmd) {
    return {
      from: cmd[0].length,
      toAfter: 0,
      validFor: "^\\\\[a-zA-Z]*$",
      filter: true,
      incomplete: false,
      items: COMMANDS.map((c) => ({
        label: `\\${c}`,
        kind: "command",
        detail: ["alpha", "beta", "partial", "Delta"].includes(c) ? "amsmath" : "LaTeX",
        apply: c === "frac" ? "\\frac{${1}}{${2}}" : c === "begin" ? "\\begin{" : `\\${c}`,
        snippet: c === "frac",
        boost: 0,
        glyph: ({ alpha: "α", beta: "β", partial: "∂", Delta: "Δ" } as Record<string, string>)[c],
        info: c,
      })),
    };
  }
  const ref = /\\(?:ref|eqref|cref)\{([^}]*)$/.exec(before);
  if (ref) {
    return {
      from: ref[1].length,
      toAfter: 0,
      validFor: null,
      filter: true,
      incomplete: false,
      items: ["chap:intro", "eq:chaleur", "fig:courbe", "chap:methodes"].map((l) => ({ label: l, kind: "label", detail: "Chapitre 1", apply: l, snippet: false, boost: 0 })),
    };
  }
  const env = /\\begin\{([^}]*)$/.exec(before);
  if (env) {
    return {
      from: env[1].length,
      toAfter: 0,
      validFor: null,
      filter: true,
      incomplete: false,
      items: ["equation", "align", "itemize", "enumerate", "figure", "table", "theorem"].map((e) => ({ label: e, kind: "environment", apply: e, snippet: false, boost: 0 })),
    };
  }
  return null;
}

function structure(): T.Structure {
  const loc = (file: string, line: number): T.Location => ({ file: p(file), range: range(line, 0, 0) });
  return {
    root: p("main.tex"),
    outline: [
      { kind: "chapter", level: 1, title: "Introduction", starred: false, number: "1", location: loc("chapitres/introduction.tex", 0) },
      { kind: "section", level: 2, title: "Motivation", starred: false, number: "1.1", location: loc("chapitres/introduction.tex", 9) },
      { kind: "section", level: 2, title: "Plan du mémoire", starred: false, number: "1.2", location: loc("chapitres/introduction.tex", 20) },
      { kind: "chapter", level: 1, title: "Méthodes numériques", starred: false, number: "2", location: loc("chapitres/methodes.tex", 0) },
      { kind: "section", level: 2, title: "Différences finies", starred: false, number: "2.1", location: loc("chapitres/methodes.tex", 3) },
    ],
    labels: [
      { name: "chap:intro", kind: { type: "section" }, context: "Introduction", resolved: { number: "1", page: "3" }, location: loc("chapitres/introduction.tex", 1) },
      { name: "eq:chaleur", kind: { type: "equation" }, context: null, resolved: { number: "1.1", page: "3" }, location: loc("chapitres/introduction.tex", 6) },
      { name: "fig:courbe", kind: { type: "figure" }, context: "Profil de température.", resolved: { number: "1.1", page: "4" }, location: loc("chapitres/introduction.tex", 18) },
    ],
    citations: [
      { key: "fourier1822", kind: "book", authors: "Fourier, Joseph", year: "1822", title: "Théorie analytique de la chaleur", venue: "Firmin Didot", location: loc("refs.bib", 0) },
      { key: "crank1947", kind: "article", authors: "Crank, John and Nicolson, Phyllis", year: "1947", title: "A practical method…", venue: "Proc. Cambridge", location: loc("refs.bib", 7) },
    ],
    todos: [{ tag: "TODO", text: "ajouter l'historique", location: loc("chapitres/introduction.tex", 7) }],
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function simulateBuild() {
  const plan: T.BuildPlan = {
    root: p("main.tex"),
    job: "main",
    rootDir: ROOT,
    outDir: p("build"),
    engine: "pdflatex",
    engineReason: "% !TEX program",
    tool: "auto",
    bibTool: "biber",
    pdf: p("build/main.pdf"),
    log: p("build/main.log"),
    synctex: p("build/main.synctex.gz"),
  };
  await emit("build:started", { plan, manual: true });
  for (const [name, command] of [
    ["pdflatex", "pdflatex -synctex=1 -interaction=nonstopmode -file-line-error -output-directory=build main.tex"],
    ["biber", "biber --input-directory=build main"],
    ["pdflatex", "pdflatex -synctex=1 -interaction=nonstopmode -file-line-error -output-directory=build main.tex"],
  ]) {
    await emit("build:step", { name, command });
    for (let i = 0; i < 6; i++) {
      await sleep(120);
      await emit("build:output", { lines: [{ stream: "stdout", text: `(./chapitres/introduction.tex [${i + 1}]` }] });
    }
  }
  await emit("build:output", { lines: [{ stream: "stdout", text: "./chapitres/introduction.tex:24: Undefined control sequence." }] });
  const outcome: T.BuildOutcome = {
    success: true,
    cancelled: false,
    pdf: plan.pdf,
    pdfUpdated: true,
    durationMs: 2380,
    pages: 3,
    steps: [
      { name: "pdflatex", durationMs: 900, exitCode: 1 },
      { name: "biber", durationMs: 400, exitCode: 0 },
      { name: "pdflatex", durationMs: 1080, exitCode: 1 },
    ],
    missingFiles: [],
    engine: "pdflatex",
    plan,
    diagnostics: [
      diag({
        severity: "error",
        source: "latex",
        code: "undefined-control-sequence",
        message: "Undefined control sequence.",
        file: p("chapitres/introduction.tex"),
        line: 24,
        range: range(23, 0, 8),
        contextBefore: "l.24 \\textbff",
        contextAfter: "{Chapitre 2} présente les méthodes numériques.",
        raw: "! Undefined control sequence.\nl.24 \\textbff\n              {Chapitre 2} présente les méthodes numériques.",
        hint: { title: "Commande inconnue \\textbff", explanation: "LaTeX ne connaît pas cette commande. Vérifiez l'orthographe (`\\textbf` ?) ou chargez le package qui la définit." },
        fixes: [{ kind: "replace", title: "Remplacer par \\textbf", range: range(23, 0, 8), text: "\\textbf" }],
      }),
      diag({
        severity: "warning",
        source: "latex",
        code: "undefined-reference",
        message: "Reference `sec:inconnue' on page 3 undefined on input line 12.",
        file: p("chapitres/introduction.tex"),
        line: 12,
      }),
      diag({ severity: "info", source: "latex", code: "badbox-overfull", message: "Overfull \\hbox (3.2pt too wide) in paragraph at lines 11--12", file: p("chapitres/introduction.tex"), line: 11, endLine: 12 }),
    ],
  };
  await emit("build:finished", { outcome, error: null, manual: true });
}

export function installMocks() {
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      switch (cmd) {
        case "app_info":
          return { version: "0.1.0-dev", os: "macos", arch: "aarch64", settingsPath: "/Users/demo/Library/Application Support/org.labaguetex.app/settings.toml", templatesPath: "/Users/demo/Library/Application Support/org.labaguetex.app/templates" };
        case "get_settings":
          return structuredClone(settings);
        case "save_settings":
          settings = a.settings as T.Settings;
          return false;
        case "get_session":
          return structuredClone(session);
        case "open_project":
          projectOpen = true;
          return info();
        case "project_info":
          return projectOpen ? info() : null;
        case "close_project":
          projectOpen = false;
          return null;
        case "file_tree":
          return tree;
        case "set_main_file":
          return info();
        case "save_project_config":
          return { ...info(), config: a.config };
        case "read_text_file": {
          const text = files[a.path as string];
          if (text === undefined) throw new Error(`${a.path}: no such file`);
          return { text, lossy: false, modified: Date.now() };
        }
        case "write_text_file":
          files[a.path as string] = a.text as string;
          return Date.now();
        case "read_binary_file":
          if (String(a.path).endsWith(".pdf")) return pdfBytes();
          throw new Error("not found");
        case "path_exists":
          return String(a.path) in files || String(a.path).endsWith(".pdf");
        case "update_document":
          return { version: a.version, diagnostics: lintFor(a.path as string, a.text as string), root: p("main.tex") };
        case "lint_project":
          return Object.entries(files).flatMap(([path, text]) => (path.endsWith(".tex") ? lintFor(path, text) : []));
        case "complete":
          return complete(a.before as string);
        case "completion_info":
          return `<p><code>\\${a.key}</code> — documentation de démonstration.</p>`;
        case "hover":
          return null;
        case "definition":
          return [{ file: p("chapitres/introduction.tex"), range: range(6, 2, 20) }];
        case "references":
          return [
            { file: p("chapitres/introduction.tex"), range: range(12, 30, 40) },
            { file: p("chapitres/methodes.tex"), range: range(3, 0, 10) },
          ];
        case "math_macros":
          return { "\\R": "\\mathbb{R}" };
        case "structure":
          return structure();
        case "search": {
          const q = String(a.query).toLowerCase();
          const out: T.SearchMatch[] = [];
          for (const [path, text] of Object.entries(files)) {
            text.split("\n").forEach((l, i) => {
              const at = l.toLowerCase().indexOf(q);
              if (q && at >= 0) out.push({ location: { file: path, range: range(i, at, at + q.length) }, lineText: l });
            });
          }
          return out;
        }
        case "word_count":
          return { file: { words: 84 }, project: { words: 1532 } };
        case "root_of":
          return p("main.tex");
        case "build":
          void simulateBuild();
          return null;
        case "pdf_path":
          return p("build/main.pdf");
        case "synctex_forward":
          return { pdf: p("build/main.pdf"), page: 2, rects: [{ x: 70, y: 60, width: 420, height: 16 }] };
        case "synctex_inverse":
          return { file: p("chapitres/introduction.tex"), line: 4 };
        case "tex_status":
          return texStatus;
        case "detect_tex":
          texStatus = { ...texStatus };
          void emit("tex:status", texStatus);
          return null;
        case "distro_options":
          return [
            { id: "mactex", name: "MacTeX", description: { fr: "La distribution complète pour macOS (TeX Live + outils).", en: "The complete macOS distribution." }, size: "≈ 5,5 Go", recommended: true, needsAdmin: true, command: { program: "brew", args: ["install", "--cask", "mactex-no-gui"], cwd: null, env: [], pathPrefix: [] }, url: "https://tug.org/mactex/", notes: { fr: "", en: "" } },
            { id: "tinytex", name: "TinyTeX", description: { fr: "Légère : les packages manquants s'installent à la demande.", en: "Lightweight." }, size: "≈ 250 Mo", recommended: false, needsAdmin: false, command: { program: "sh", args: ["-c", "curl -sL https://yihui.org/tinytex/install-bin-unix.sh | sh"], cwd: null, env: [], pathPrefix: [] }, url: "https://yihui.org/tinytex/", notes: { fr: "", en: "" } },
            { id: "tectonic", name: "Tectonic", description: { fr: "Moteur moderne tout-en-un, télécharge ce dont il a besoin.", en: "Modern all-in-one engine." }, size: "≈ 30 Mo", recommended: false, needsAdmin: false, command: { program: "brew", args: ["install", "tectonic"], cwd: null, env: [], pathPrefix: [] }, url: "https://tectonic-typesetting.github.io/", notes: { fr: "", en: "" } },
          ];
        case "installed_packages":
          return ["amsmath", "amssymb", "babel", "biblatex", "fontenc", "graphicx", "hyperref", "tikz", "siunitx", "geometry", "xcolor", "booktabs", "cleveref"];
        case "installed_classes":
          return ["article", "report", "book", "beamer", "memoir", "scrartcl"];
        case "package_details":
          return { name: a.name, class: a.class, installed: true, path: `/usr/local/texlive/2025/texmf-dist/tex/latex/${a.name}/${a.name}.sty`, summary: "Package de démonstration.", provides: `${a.name} 2025/01/01 v1.0`, commands: ["foo", "bar", "baz"], environments: ["demo"], options: ["draft", "final"], requires: ["kvoptions"], documented: 3 };
        case "ctan_catalog":
          return [
            { key: "tikz", name: "TikZ", caption: "Create PostScript and PDF graphics in TeX" },
            { key: "siunitx", name: "siunitx", caption: "A comprehensive (SI) units package" },
            { key: "minted", name: "minted", caption: "Highlighted source code for LaTeX" },
          ];
        case "help_pages":
          return [
            { id: "getting-started", title: "Premiers pas" },
            { id: "latex-basics", title: "Les bases de LaTeX" },
          ];
        case "help_page":
          return `<h1>Premiers pas</h1><p>Bienvenue dans <strong>LaBagueTex</strong> !</p><pre><code>\\documentclass{article}\n\\begin{document}\nBonjour !\n\\end{document}\n</code></pre>`;
        case "reference_search":
          return [{ label: "\\frac", environment: false, package: null, args: "{num}{den}", doc: "Une fraction.", glyph: "½", insert: "\\frac{${1}}{${2}}" }];
        case "symbol_palette":
          return [
            { id: "greek", name: "Lettres grecques", symbols: ["alpha:α", "beta:β", "gamma:γ", "delta:δ", "epsilon:ε", "lambda:λ", "pi:π", "sigma:σ", "omega:ω", "Delta:Δ", "Omega:Ω"].map((s) => ({ command: `\\${s.split(":")[0]}`, glyph: s.split(":")[1], package: null, math: true })) },
            { id: "arrows", name: "Flèches", symbols: ["to:→", "leftarrow:←", "Rightarrow:⇒", "iff:⟺", "mapsto:↦"].map((s) => ({ command: `\\${s.split(":")[0]}`, glyph: s.split(":")[1], package: null, math: true })) },
          ];
        case "error_catalog":
          return [{ id: "undefined-control-sequence", title: "Undefined control sequence", explanation: "Une commande inconnue : faute de frappe ou package manquant." }];
        case "builtin_snippets":
          return [
            { trigger: "fig", name: "Figure avec image", body: "\\begin{figure}\n\t${1}\n\\end{figure}", math: false, package: "graphicx" },
            { trigger: "eq", name: "Équation numérotée", body: "\\begin{equation}\n\t${1}\n\\end{equation}", math: false, package: null },
          ];
        case "at_shortcuts":
          return [
            ["@a", "\\alpha"],
            ["@b", "\\beta"],
            ["@R", "\\mathbb{R}"],
          ];
        case "lint_rules":
          return [
            ["undefined-reference", "warning"],
            ["unknown-command", "error"],
            ["missing-package", "error"],
            ["cleveref-babel-french", "warning"],
          ];
        case "list_templates":
          return [
            { id: "article", name: { fr: "Article", en: "Article" }, description: { fr: "Un article simple et soigné.", en: "A simple article." }, category: "general", order: 1, main: "main.tex", engine: null, tags: ["article"], user: false },
            { id: "thesis", name: { fr: "Thèse / mémoire", en: "Thesis" }, description: { fr: "Chapitres, bibliographie, annexes.", en: "Chapters." }, category: "researcher", order: 5, main: "main.tex", engine: null, tags: ["thèse", "biblatex"], user: false },
            { id: "beamer", name: { fr: "Diaporama", en: "Slides" }, description: { fr: "Présentation beamer.", en: "Beamer slides." }, category: "student", order: 6, main: "main.tex", engine: null, tags: ["beamer"], user: false },
            { id: "exam", name: { fr: "Examen", en: "Exam" }, description: { fr: "Sujet avec barème et corrigé.", en: "Exam." }, category: "teacher", order: 9, main: "main.tex", engine: null, tags: ["exam"], user: false },
          ];
        case "projects_dir":
          return "/Users/demo/Documents/LaBagueTex";
        case "list_projects":
          return {
            dir: "/Users/demo/Documents/LaBagueTex",
            projects: [
              { path: ROOT, name: "Mémoire", main: p("main.tex"), modified: Date.now() / 1000 - 3600, pdf: p("build/main.pdf") },
              { path: "/Users/demo/Documents/LaBagueTex/td-analyse", name: "TD d'analyse", main: "/Users/demo/Documents/LaBagueTex/td-analyse/main.tex", modified: Date.now() / 1000 - 86400 * 2, pdf: null },
              { path: "/Users/demo/Documents/LaBagueTex/cours-physique", name: "Cours de physique", main: "/Users/demo/Documents/LaBagueTex/cours-physique/main.tex", modified: Date.now() / 1000 - 86400 * 9, pdf: null },
            ],
            recent: session.recent,
          };
        case "open_light_file":
        case "convert_to_project":
          projectOpen = true;
          return { ...info(), light: cmd === "open_light_file" };
        case "rename_project":
        case "trash_project":
          return null;
        case "create_empty_project":
          return info();
        case "apply_template":
          return { mainText: "\\documentclass{article}\n\\title{" + (a.values as T.TemplateValues).title + "}\n\\begin{document}\n\\maketitle\n\n\\end{document}\n", created: [], kept: [], engine: null };
        case "template_thumbnail":
          throw new Error("no TeX in the browser");
        case "tikz_templates":
          return [
            { id: "axes", category: "basics", name: "Axes et grille", description: "Une grille et deux axes.", packages: ["tikz"], libraries: ["arrows.meta"], preamble: "", code: "\\begin{tikzpicture}\n  \\draw[help lines] (0,0) grid (3,2);\n  \\draw[-Stealth] (0,0) -- (3.2,0);\n\\end{tikzpicture}" },
            { id: "flowchart", category: "diagrams", name: "Organigramme", description: "Début, étapes, décision.", packages: ["tikz"], libraries: ["positioning"], preamble: "", code: "\\begin{tikzpicture}\n  \\node[draw] (a) {Début};\n  \\node[draw, below=of a] (b) {Fin};\n  \\draw[->] (a) -- (b);\n\\end{tikzpicture}" },
          ];
        case "tikz_libraries":
          return ["arrows.meta", "positioning", "calc", "shapes.geometric", "angles", "quotes", "babel"];
        case "preview_snippet":
          await new Promise((r) => setTimeout(r, 300));
          return { pdf: p("build/preview.pdf"), bbox: [0, 0, 113.8, 85.4], border: 6, diagnostics: [], durationMs: 420, engine: "pdflatex" };
        case "system_fonts":
          return ["Georgia", "Helvetica Neue", "Menlo", "Palatino", "Avenir Next"].map((name) => ({
            name,
            monospace: name === "Menlo",
            faces: [{ path: `/System/Library/Fonts/${name}.ttc`, index: 0, family: name, postscript: name.replace(/ /g, ""), weight: 400, italic: false, monospace: name === "Menlo" }],
          }));
        case "inspect_fonts":
          return [];
        case "font_has_math":
          return false;
        case "fontspec_code":
          return `\\setmainfont{${(a.family as T.FontFamily).name}}`;
        case "tex_fonts":
          return [
            { id: "libertinus", name: "Libertinus", package: "libertinus", options: "", kind: "serif", math: true, fontspec: "Libertinus Serif", extra: "", description: "Élégante et lisible.", code: "\\usepackage{libertinus}" },
            { id: "firasans", name: "Fira Sans", package: "FiraSans", options: "sfdefault", kind: "sans", math: false, fontspec: "Fira Sans", extra: "", description: "Humaniste.", code: "\\usepackage[sfdefault]{FiraSans}" },
          ];
        case "import_image":
          return `${a.dir}/${String(a.name ?? "image.png")}`;
        case "import_fonts":
          return a.sources;
        case "safe_file_name":
          return String(a.name).toLowerCase().replace(/[^a-z0-9.]+/g, "-");
        case "log_frontend":
          console.error("[ui]", a.message);
          return null;
        default:
          if (cmd === "plugin:path|resolve_directory") return "/Users/demo/Documents";
          if (cmd.startsWith("plugin:")) return null;
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
