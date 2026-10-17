// Simulated engine for designing the interface in a plain browser
// (`npm run dev`, then open http://localhost:1420). Never bundled in the
// application: main.ts imports it only in development outside Tauri.
//
// It answers every IPC command with small, realistic data: a demo thesis
// project, a TeX Live installation, diagnostics, a build and a PDF.

import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type * as T from "../lib/types";
import type { CommandDraft, CommandSpec, CustomCommand } from "../lib/commands";

const ROOT = "/Users/demo/Documents/memoire";
const p = (rel: string) => `${ROOT}/${rel}`;

/** The definitions of the demonstration project, read like the engine does (roughly). */
/** The bibliography of the demo project, as the engine gives it. */
function mockBibliography() {
  const entry = (line: number, key: string, kind: string, authors: string, year: string, title: string, venue: string, cited: number, sameAs: string | null = null) => ({
    file: p("refs.bib"),
    line,
    key,
    kind,
    authors,
    year,
    title,
    venue,
    fields: [
      { name: "author", value: authors, raw: false },
      { name: "title", value: title, raw: false },
      { name: kind === "article" ? "journal" : "publisher", value: venue, raw: false },
      { name: "year", value: year, raw: true },
    ],
    cited,
    sameKey: false,
    sameAs,
  });
  return {
    files: [p("refs.bib")],
    entries: [
      entry(1, "fourier1822", "book", "Fourier", "1822", "Théorie analytique de la chaleur", "Firmin Didot", 3),
      entry(8, "crank1947", "article", "Crank & Nicolson", "1947", "A practical method for numerical evaluation of solutions of partial differential equations of the heat-conduction type", "Proc. Cambridge Philos. Soc.", 1),
      entry(17, "evans2010", "book", "Evans", "2010", "Partial Differential Equations", "American Mathematical Society", 0),
      entry(24, "fourier1822b", "book", "Fourier", "1822", "Théorie analytique de la chaleur", "Didot", 0, "fourier1822"),
    ],
    allCited: false,
  };
}

function customCommands(): CustomCommand[] {
  const out: CustomCommand[] = [];
  for (const [file, text] of Object.entries(files)) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const m = /\\newcommand\{\\([A-Za-z]+)\}(?:\[(\d)\])?\{(.*)\}\s*$/.exec(line);
      if (!m) return;
      const [, name, n, body] = m;
      const args = Number(n ?? 0);
      const call = `\\${name}${Array.from({ length: args }, (_, k) => `{${String.fromCharCode(97 + k)}}`).join("")}`;
      const math = /\\(mathbb|left|frac|vec|lVert)/.test(body);
      const uses = Object.values(files).reduce((sum, t) => sum + (t.split(`\\${name}`).length - 1), 0) - 1;
      out.push({
        name,
        kind: "command",
        args,
        firstOptional: false,
        definition: body,
        math,
        usage: `\\${name}${Array.from({ length: args }, (_, k) => `{\${${k + 1}}}`).join("")}`,
        sample: math ? `$${call}$` : call,
        location: { file, range: range(i, line.indexOf(name), line.indexOf(name) + name.length) },
        source: line.trim(),
        inPreamble: true,
        uses: Math.max(0, uses),
      });
    });
  }
  return out;
}

/** A definition written from its fields, with the checks a demonstration needs. */
function draftCommand(spec: CommandSpec): CommandDraft {
  const name = spec.name.trim().replace(/^\\+/, "");
  const environment = spec.kind === "environment" || spec.kind === "theorem";
  const args = spec.kind === "command" || spec.kind === "environment" ? spec.args : 0;
  const count = args ? `[${args}]` : "";
  const optional = spec.default ? `[${spec.default}]` : "";
  const code =
    spec.kind === "operator"
      ? `\\DeclareMathOperator{\\${name}}{${spec.body}}`
      : spec.kind === "theorem"
        ? `\\newtheorem{${name}}{${spec.body}}`
        : spec.kind === "environment"
          ? `\\newenvironment{${name}}${count}${optional}{${spec.body}}{${spec.end}}`
          : `\\newcommand{\\${name}}${count}${optional}{${spec.body}}`;
  const problems: string[] = [];
  if (!name) problems.push("Donnez un nom.");
  else if (!/^[A-Za-z]+$/.test(name)) problems.push("Le nom d'une commande n'est fait que de lettres : ni chiffre, ni espace, ni accent.");
  else if (customCommands().some((c) => c.name === name)) problems.push(`\`\\${name}\` est déjà défini dans le projet (main.tex, ligne 11).`);
  if (!spec.body.trim() && spec.kind !== "environment") problems.push("La définition est vide.");
  const math = spec.kind === "operator" || /\\(mathbb|left|frac|vec|lVert|langle)/.test(spec.body);
  const given = Array.from({ length: args }, (_, k) => k + 1).filter((k) => !(k === 1 && spec.default));
  const call = environment ? `\\begin{${name}}\nDu texte.\n\\end{${name}}` : `\\${name}${given.map((k) => `{${math ? String.fromCharCode(96 + k) : "texte"}}`).join("")}`;
  return {
    name,
    code,
    usage: environment ? `\\begin{${name}}\n\t\${1}\n\\end{${name}}` : `\\${name}${given.map((k) => `{\${${k}}}`).join("")}`,
    sample: math && !environment ? `$${call}$` : call,
    math,
    packages: spec.kind === "operator" ? ["amsmath"] : [],
    problems,
    notes: [],
  };
}

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
  [p("raytex.toml")]: `[project]\nname = "Mémoire"\nmain = "main.tex"\n`,
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
  { name: "raytex.toml", path: p("raytex.toml"), dir: false, children: [] },
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
  updates: { checkAtStartup: true, skippedVersion: null, seenVersion: null },
  history: { enabled: true, intervalMinutes: 10, keepDays: 30 },
};

/** The sources of the demo project, by their path in it. */
function sources(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => /\.(tex|bib|toml)$/.test(path))
      .map(([path, text]) => [path.slice(ROOT.length + 1), text]),
  );
}

interface MockMoment {
  id: string;
  time: number;
  reason: string;
  texts: Record<string, string>;
}

/** The history of the demo project: what it was a little earlier, and before. */
const moments: MockMoment[] = (() => {
  const now = sources();
  const intro = "chapitres/introduction.tex";
  const earlier: Record<string, string> = {
    ...now,
    [intro]: now[intro]
      .replace("Comme le montre la figure~\\ref{fig:courbe}, la température $T(x,t)$ décroît.", "Comme le montre la figure~\\ref{fig:courbe}, la température $T(x,t)$ diminue.")
      .replace("\\section{Plan du mémoire}\n\\textbff{Chapitre 2} présente les méthodes numériques.\n", "\\section{Plan}\nÀ écrire.\n"),
  };
  const yesterday: Record<string, string> = { ...earlier, "main.tex": earlier["main.tex"].replace("\\usepackage{hyperref}\n", "") };
  delete yesterday["chapitres/methodes.tex"];
  const at = Date.now();
  const moment = (ago: number, reason: string, texts: Record<string, string>): MockMoment => ({ id: String(at - ago), time: at - ago, reason, texts });
  const morning: Record<string, string> = { ...earlier, [intro]: earlier[intro].replace(" % TODO: ajouter l'historique", "") };
  const before: Record<string, string> = { ...yesterday, "refs.bib": "" };
  return [moment(12 * 60_000, "save", now), moment(47 * 60_000, "save", earlier), moment(2 * 3_600_000, "open", morning), moment(26 * 3_600_000, "save", yesterday), moment(27 * 3_600_000, "open", before)];
})();

/** The files that differ between two states of the project. */
function changedBetween(then: Record<string, string>, now: Record<string, string>) {
  const out: { path: string; status: "changed" | "added" | "removed" }[] = [];
  for (const path of [...new Set([...Object.keys(then), ...Object.keys(now)])].sort()) {
    if (!(path in then)) out.push({ path, status: "added" });
    else if (!(path in now)) out.push({ path, status: "removed" });
    else if (then[path] !== now[path]) out.push({ path, status: "changed" });
  }
  return out;
}

/** Two small texts compared line by line (longest common subsequence). */
function diffLines(before: string, after: string) {
  const a = before ? before.replace(/\n$/, "").split("\n") : [];
  const b = after ? after.replace(/\n$/, "").split("\n") : [];
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: { kind: "same" | "removed" | "added"; text: string; before: number | null; after: number | null }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push({ kind: "same", text: a[i], before: ++i, after: ++j });
    else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push({ kind: "removed", text: a[i], before: ++i, after: null });
    else out.push({ kind: "added", text: b[j], before: null, after: ++j });
  }
  return out;
}

/** The spelling of the demo: no dictionary until one is "downloaded"; a few words it calls wrong. */
const spellInstalled = new Set<string>();
const spellWords = new Set<string>();
const SPELL_WRONG = new Set(["diffusionn", "decrite", "temperature", "numériqes"]);

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

function complete(before: string, after = ""): T.CompletionList | null {
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
  // Keys of `\begin{itemize}[…]` (enumitem), like the engine's.
  const keys = /\\begin\{itemize\}\[(?:[^\]]*,\s*)?([^,\]]*)$/.exec(before);
  if (keys) {
    const [key, value] = keys[1].split("=");
    if (value !== undefined) {
      if (key !== "label") return null;
      return {
        from: value.length,
        toAfter: 0,
        validFor: "^[^,\\]}]*$",
        filter: true,
        incomplete: false,
        items: [
          ["\\arabic*.", "1. 2. 3."],
          ["(\\alph*)", "(a) (b) (c)"],
          ["\\textbullet", "Puce ronde •"],
        ].map(([v, d]) => ({ label: v, kind: "keyword", detail: d, apply: v, snippet: false, boost: 0 })),
      };
    }
    return {
      from: key.length,
      toAfter: 0,
      validFor: "^[^,=\\]}]*$",
      filter: true,
      incomplete: false,
      items: [
        { label: "label", kind: "option", detail: "Étiquette de chaque élément", apply: "label=", snippet: false, boost: 60, info: "label" },
        { label: "nosep", kind: "option", detail: "Supprime tous les espaces verticaux de la liste", apply: "nosep", snippet: false, boost: 59 },
        { label: "itemsep", kind: "option", detail: "Espace entre deux éléments", apply: "itemsep=${1:0pt}", snippet: true, boost: 58 },
      ],
    };
  }
  const env = /\\begin\{([^}]*)$/.exec(before);
  if (env) {
    // Like the engine: the closing brace is replaced too.
    return {
      from: env[1].length,
      toAfter: after.startsWith("}") ? 1 : 0,
      validFor: "^[a-zA-Z*@-]*$",
      filter: true,
      incomplete: false,
      items: ["equation", "align", "itemize", "enumerate", "figure", "table", "theorem"].map((e) => ({ label: e, kind: "environment", apply: `${e}}`, snippet: false, boost: 0 })),
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

/** A small picture made on the spot, padded to the weight of a real one. */
async function samplePicture(path: string): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 220;
  const g = canvas.getContext("2d")!;
  const hue = [...path].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  const sky = g.createLinearGradient(0, 0, 320, 220);
  sky.addColorStop(0, `hsl(${hue} 70% 62%)`);
  sky.addColorStop(1, `hsl(${(hue + 70) % 360} 60% 38%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, 320, 220);
  g.fillStyle = "rgb(255 255 255 / 0.85)";
  g.beginPath();
  g.arc(230, 70, 34, 0, Math.PI * 2);
  g.fill();
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  const picture = new Uint8Array(await blob.arrayBuffer());
  const weighed = new Uint8Array(/schema|diagram/i.test(path) ? 184_000 : 3_420_000);
  weighed.set(picture);
  return weighed.buffer;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** A build of the whole document, or of `only` (a part of it) on its own. */
async function simulateBuild(only: string | null = null) {
  const out = only ? p("build/.raytex-only") : p("build");
  const plan: T.BuildPlan = {
    root: p("main.tex"),
    job: "main",
    rootDir: ROOT,
    outDir: out,
    engine: "pdflatex",
    engineReason: "% !TEX program",
    tool: "auto",
    bibTool: "biber",
    pdf: `${out}/main.pdf`,
    log: `${out}/main.log`,
    synctex: `${out}/main.synctex.gz`,
    ...(only ? { only: { file: only, record: false } } : {}),
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
        // The cause was found in the sources: the advice says it.
        hint: { title: "Commande inconnue", explanation: "LaTeX ne connaît pas cette commande : ni LaTeX ni un package chargé ne la définit.", advice: "Vouliez-vous écrire `\\textbf` ?" },
        fixes: [{ kind: "replace", title: "Remplacer par \\textbf", range: range(23, 0, 8), text: "\\textbf" }],
      }),
      diag({
        severity: "error",
        source: "latex",
        code: "missing-number",
        message: "Missing number, treated as zero.",
        file: p("chapitres/introduction.tex"),
        line: 30,
        range: range(29, 8, 11),
        contextBefore: "\\vspace{abc}",
        raw: "! Missing number, treated as zero.\n<to be read again> \n                   a\nl.30 \\vspace{abc}",
        hint: { title: "Un nombre était attendu", explanation: "TeX attendait un nombre ou une longueur à cet endroit et a lu autre chose ; il a pris zéro à la place.", advice: "`\\vspace` attend une longueur (un nombre et une unité, comme `1cm`), et `abc` n'en est pas une." },
      }),
      diag({
        severity: "error",
        source: "latex",
        code: "missing-number",
        message: "Missing number, treated as zero.",
        file: p("chapitres/introduction.tex"),
        line: 34,
        range: range(33, 0, 12),
        contextBefore: "\\espace{abc}",
        // The cause is not known: what the message means, and no suggestion.
        hint: { title: "Un nombre était attendu", explanation: "TeX attendait un nombre ou une longueur à cet endroit et a lu autre chose ; il a pris zéro à la place." },
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

/** The sets of the TikZ whiteboard kept during this session of the simulated engine. */
let mockSets: { id: string; name: string; code: string }[] = [{ id: "m1", name: "Capteur", code: "\\draw[thick] (0,0) rectangle (2,1);\n\\draw[->] (2,0.5) -- (3,0.5);\n\\node at (1,0.5) {$S$};" }];

/** A Beamer deck in place of the main file (`?deck` in the address): to look at the slides mode. */
const DECK = String.raw`\documentclass[aspectratio=169]{beamer}
\usetheme{Madrid}
\title{Étude de la chaleur}
\author{Camille Martin}
\begin{document}

\begin{frame}
  \titlepage
\end{frame}

\section{Introduction}
\begin{frame}{Le problème}
  \begin{itemize}
    \item<1-> L'équation de la chaleur
    \item<2-> Ses conditions aux limites
  \end{itemize}
  \note{Commencer par un exemple concret}
\end{frame}

\begin{frame}{La méthode}
  Des différences finies, pas à pas.
\end{frame}

\section{Résultats}
\begin{frame}{Ce que l'on voit}
  Une courbe qui s'aplatit.
\end{frame}

\end{document}
`;

export function installMocks() {
  if (new URLSearchParams(location.search).has("deck")) files[p("main.tex")] = DECK;
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      switch (cmd) {
        case "app_info":
          return { version: "0.1.0-dev", os: "macos", arch: "aarch64", settingsPath: "/Users/demo/Library/Application Support/org.raytex.app/settings.toml", templatesPath: "/Users/demo/Library/Application Support/org.raytex.app/templates" };
        case "take_open_requests":
          return [];
        case "quit_app":
          return null;
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
          // A picture from elsewhere on the computer (the image window): something to draw and to weigh.
          if (/\.(png|jpe?g)$/i.test(String(a.path))) return samplePicture(String(a.path));
          throw new Error("not found");
        case "path_exists":
          return String(a.path) in files || String(a.path).endsWith(".pdf");
        case "update_document":
          return { version: a.version, diagnostics: lintFor(a.path as string, a.text as string), root: p("main.tex") };
        case "lint_project":
          return Object.entries(files).flatMap(([path, text]) => (path.endsWith(".tex") ? lintFor(path, text) : []));
        case "complete":
          return complete(a.before as string, a.after as string);
        case "argument_hint": {
          const b = a.before as string;
          if (/\\item\[[^\]]*$/.test(b)) {
            return { parts: [{ text: "\\item", active: false }, { text: "[terme]", active: true }], name: "terme", doc: "Texte libre affiché à la place de la puce ou du numéro : le terme défini dans une liste description." };
          }
          if (/\\section\{[^}]*$/.test(b)) {
            return { parts: [{ text: "\\section", active: false }, { text: "[titre court]", active: false }, { text: "{titre}", active: true }], name: "titre", doc: "Texte libre : le titre de la section." };
          }
          return null;
        }
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
        case "custom_commands":
          return customCommands();
        case "bibliography":
          return mockBibliography();
        case "history_list":
          return {
            available: true,
            size: 184_000,
            moments: moments.map((m, i) => ({
              id: m.id,
              time: m.time,
              reason: m.reason,
              files: Object.keys(m.texts).length,
              changed: moments[i + 1] ? changedBetween(moments[i + 1].texts, m.texts).map((c) => c.path) : [],
            })),
          };
        case "history_changes":
          return changedBetween(moments.find((m) => m.id === a.id)?.texts ?? {}, sources());
        case "history_compare": {
          const then = moments.find((m) => m.id === a.id)?.texts[a.file as string] ?? null;
          const now = sources()[a.file as string] ?? null;
          return { then, exists: now !== null, lines: diffLines(then ?? "", now ?? "") };
        }
        case "history_keep": {
          const now = sources();
          if (moments[0] && !changedBetween(moments[0].texts, now).length) return null;
          moments.unshift({ id: String(Date.now()), time: Date.now(), reason: String(a.reason), texts: now });
          return { id: moments[0].id, time: moments[0].time, reason: moments[0].reason, files: Object.keys(now).length, changed: [] };
        }
        case "history_clear":
          moments.length = 0;
          return null;
        case "history_changes_pdf":
          await new Promise((r) => setTimeout(r, 1200));
          return { pdf: p("build/main.pdf"), errors: 0 };
        case "history_changes_cancel":
          return null;
        // A PDF that always needs its build: the window of the export is seen.
        case "pdf_fresh":
          return false;
        // A document of 42 MB, of which 40 are its twelve pictures.
        case "pdf_pictures":
          return { pictures: 12, original: 40_300_000, pdf: 42_100_000 };
        case "pdf_weights":
          return sleep(1400).then(() => ({ pictures: 12, original: 40_300_000, steps: [16_200_000, 9_400_000, 7_100_000, 4_300_000, 2_900_000, 1_900_000, 1_250_000, 860_000], pdf: 42_100_000 }));
        case "pdf_weights_cancel":
        case "export_pdf_cancel":
        case "export_window_open":
        case "export_window_close":
          return null;
        case "export_window_shown":
          return false;
        case "export_pdf_lighter":
          return (async () => {
            for (let done = 1; done <= 12 && a.step !== null; done++) {
              await sleep(90);
              await emit("export:pictures", { done, total: 12 });
            }
            await emit("export:step", { name: "pdflatex", command: "pdflatex main.tex" });
            for (let i = 0; i < 6; i++) {
              await sleep(160);
              await emit("export:output", { lines: [{ stream: "stdout", text: `(./chapitres/introduction.tex [${i + 1}]` }] });
            }
            const making = (a.making ?? {}) as { archive?: string | null; accessible?: boolean };
            const archive = making.archive
              ? { standard: making.accessible ? "a-3b" : making.archive, problems: [], own: false, check: { version: "1.7", part: 2, conformance: "B", outputIntent: true, fonts: 9, notEmbedded: 0, missing: [], transparency: false, encrypted: false, javascript: false } }
              : null;
            const accessible = making.accessible ? { problems: ["alt"], missingAlt: 1, part: making.archive ? 1 : 2 } : null;
            return { size: 6_180_000, step: Number(a.step ?? 0), within: true, errors: 0, archive, accessible };
          })();
        case "export_file":
          return sleep(250).then(() => null);
        case "export_plan": {
          const o = a.options as { submission: boolean; includeBib: boolean; includePdf: boolean; singleFile: boolean };
          const role = (name: string) => (name === "main.tex" ? "main" : name.endsWith(".bib") ? "bibliography" : name.endsWith(".tex") ? "source" : "other");
          let found = Object.entries(sources()).map(([name, text]) => ({ source: p(name), name, size: text.length, role: role(name) }));
          found.push({ source: p("figures/courbe.pdf"), name: "figures/courbe.pdf", size: 48_200, role: "picture" });
          if (o.submission) {
            found = found.filter((f) => f.role !== "other" && (o.includeBib || f.role !== "bibliography") && (!o.singleFile || f.role !== "source"));
            found.push({ source: p("build/main.bbl"), name: "main.bbl", size: 3_140, role: "compiled" });
          }
          if (o.includePdf) found.push({ source: p("build/main.pdf"), name: "main.pdf", size: 212_000, role: "pdf" });
          found.sort((x, y) => x.name.localeCompare(y.name));
          return { files: found, size: found.reduce((n, f) => n + f.size, 0), recorded: true, stale: false };
        }
        case "spell_status":
          return {
            installed: [...spellInstalled].map((tag) => ({ tag, size: 1_436_360 })),
            catalog: [
              { tag: "fr", path: "fr_FR/dictionaries/fr", size: 1_436_360 },
              { tag: "en-US", path: "en/en_US", size: 554_967 },
              { tag: "en-GB", path: "en/en_GB", size: 1_274_729 },
              { tag: "de", path: "de/de_DE_frami", size: 4_375_970 },
              { tag: "es", path: "es/es_ES", size: 885_191 },
              { tag: "it", path: "it_IT/it_IT", size: 1_365_137 },
            ],
            source: "github.com/LibreOffice/dictionaries",
            words: [...spellWords],
          };
        case "spell_install":
          await new Promise((r) => setTimeout(r, 1200));
          spellInstalled.add(String(a.tag));
          return a.tag;
        case "spell_remove":
          spellInstalled.delete(String(a.tag));
          return null;
        case "spell_check":
          return (a.words as string[]).map((w) => spellWords.has(w) || !SPELL_WRONG.has(w.toLowerCase()));
        case "spell_suggest":
          return { diffusionn: ["diffusion"], decrite: ["décrite", "décrié"], temperature: ["température"] }[String(a.word).toLowerCase()] ?? [];
        case "spell_learn":
          if (a.add) spellWords.add(String(a.word));
          else spellWords.delete(String(a.word));
          return null;
        case "export_write":
          await new Promise((r) => setTimeout(r, 500));
          return 96_400;
        case "bib_key":
          return "lagrange1788";
        case "bib_drafts":
        case "bib_fetch":
          await new Promise((r) => setTimeout(r, 400));
          return [
            {
              kind: "book",
              key: "Lagrange_1788",
              fields: [
                { name: "author", value: "Lagrange, Joseph-Louis", raw: false },
                { name: "title", value: "Mécanique analytique", raw: false },
                { name: "publisher", value: "Veuve Desaint", raw: false },
                { name: "year", value: "1788", raw: true },
              ],
            },
          ];
        case "bib_write": {
          const fields = (a.fields as { name: string; value: string; raw: boolean }[]).map((f) => `  ${f.name} = ${f.raw ? f.value : `{${f.value}}`},`).join("\n");
          return `${String(a.text).trimEnd()}\n\n@${a.kind}{${a.key},\n${fields}\n}\n`;
        }
        case "bib_remove":
          return String(a.text);
        case "draft_command":
          return draftCommand(a.spec as CommandSpec);
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
          void simulateBuild(a.only ? String(a.path) : null);
          return null;
        case "document_part":
          return String(a.path).endsWith(".tex") && !String(a.path).endsWith("/main.tex") ? { root: p("main.tex"), file: String(a.path) } : null;
        case "pdf_path":
          return p("build/main.pdf");
        case "synctex_forward":
          return { pdf: a.pdf ? String(a.pdf) : p("build/main.pdf"), page: 2, rects: [{ x: 70, y: 60, width: 420, height: 16 }] };
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
          return `<h1>Premiers pas</h1><p>Bienvenue dans <strong>RayTeX</strong> !</p><pre><code>\\documentclass{article}\n\\begin{document}\nBonjour !\n\\end{document}\n</code></pre>`;
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
            { trigger: "doc", name: "Document minimal", body: "\\documentclass{${1:article}}\n\\begin{document}\n${2}\n\\end{document}", math: false, package: null },
            { trigger: "eq", name: "Équation numérotée", body: "\\begin{equation}\n\t${1}\n\\end{equation}", math: false, package: null },
          ];
        case "at_shortcuts":
          // Keys without their `@`, like the engine gives them.
          return [
            ["a", "\\alpha"],
            ["b", "\\beta"],
            ["R", "\\mathbb{R}"],
            ["/", "\\frac{${1}}{${2}}"],
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
          return "/Users/demo/Documents/RayTeX";
        case "list_projects":
          return {
            dir: "/Users/demo/Documents/RayTeX",
            projects: [
              { path: ROOT, name: "Mémoire", main: p("main.tex"), modified: Date.now() / 1000 - 3600, pdf: p("build/main.pdf") },
              { path: "/Users/demo/Documents/RayTeX/td-analyse", name: "TD d'analyse", main: "/Users/demo/Documents/RayTeX/td-analyse/main.tex", modified: Date.now() / 1000 - 86400 * 2, pdf: null },
              { path: "/Users/demo/Documents/RayTeX/cours-physique", name: "Cours de physique", main: "/Users/demo/Documents/RayTeX/cours-physique/main.tex", modified: Date.now() / 1000 - 86400 * 9, pdf: null },
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
        case "tikz_sets":
          return mockSets;
        case "save_tikz_sets":
          mockSets = a.sets as typeof mockSets;
          return null;
        case "tikz_libraries":
          return ["arrows.meta", "positioning", "calc", "shapes.geometric", "angles", "quotes", "babel"];
        case "preview_snippet":
          await new Promise((r) => setTimeout(r, 300));
          return { pdf: p("build/preview.pdf"), bbox: [0, 0, 113.8, 85.4], border: 6, diagnostics: [], durationMs: 420, engine: "pdflatex" };
        case "preview_page":
          await new Promise((r) => setTimeout(r, 300));
          // A4 with margins of 2.5 cm, as TeX would measure it.
          return {
            pdf: p("build/preview.pdf"),
            bbox: null,
            border: 0,
            // A listing asks for the width of a line, of a character of code and of the line numbers.
            measures: (a.request as { job?: string })?.job === "code" ? [345, 4.72498, 20] : [597.50787, 845.04684, 455.24408, 702.78308, -1.1337, -1.1337, -30.51595, 12, 18.38225, 30, 65, 11, 0, 0],
            diagnostics: [],
            durationMs: 640,
            engine: "pdflatex",
          };
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
          return `${a.dir}/${String(a.name ?? "image.png").replace(/\.png$/, a.level ? ".jpg" : ".png")}`;
        case "import_image_data":
          return p("figures/image-collee.jpg");
        // A photograph becomes a JPEG many times lighter; a drawing has nothing to gain.
        case "image_weight": {
          const drawing = /schema|diagram/i.test(String(a.path));
          const original = drawing ? 184_000 : 3_420_000;
          return sleep(350).then(() => ({ original, compressed: drawing ? null : a.level === "light" ? 318_000 : 742_000, ext: drawing ? null : "jpg" }));
        }
        case "image_weight_data":
          return sleep(350).then(() => ({ original: 1_260_000, compressed: 402_000, ext: "jpg" }));
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
  // Events told to one window are dropped by the mocks of Tauri: they are sent to all.
  const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: unknown, options?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
  const invoke = internals.invoke.bind(internals);
  internals.invoke = (cmd, args, options) => invoke(cmd === "plugin:event|emit_to" ? "plugin:event|emit" : cmd, args, options);
}

/**
 * Plays an export in the page of its window (`/export.html` opened in a
 * browser): a build that has to be waited for, then the file written.
 */
export async function demoExport(theme: "light" | "dark" = "dark", failing = false) {
  const state = {
    dest: "/Users/demo/Desktop/memoire.pdf",
    base: ROOT,
    lighter: false,
    errors: 0,
    reason: null,
    canForce: false,
    reference: { steps: [{ name: "pdfLaTeX", durationMs: 2600 }, { name: "Biber", durationMs: 900 }, { name: "pdfLaTeX (2)", durationMs: 2600 }], pages: 12 },
    seed: null,
    result: null,
    warning: false,
    lang: "fr" as const,
    theme,
  };
  await sleep(400);
  await emit("export-window:state", { ...state, phase: "building" });
  await emit("build:started", { plan: null as unknown as T.BuildPlan, manual: false });
  for (const [name, command] of [
    ["pdfLaTeX", "pdflatex -synctex=1 -interaction=nonstopmode -file-line-error -output-directory=build main.tex"],
    ["Biber", "biber --input-directory=build main"],
    ["pdfLaTeX (2)", "pdflatex -synctex=1 -interaction=nonstopmode -file-line-error -output-directory=build main.tex"],
  ]) {
    await emit("build:step", { name, command });
    if (name === "Biber") {
      await sleep(900);
      await emit("build:output", { lines: [{ stream: "stdout", text: "INFO - This is Biber 2.20" }, { stream: "stdout", text: "INFO - Writing 'build/main.bbl' with encoding 'UTF-8'" }] });
      continue;
    }
    await emit("build:output", { lines: [{ stream: "stdout", text: "This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025)" }, { stream: "stdout", text: `(${ROOT}/main.tex` }] });
    for (let i = 0; i < 12; i++) {
      await sleep(210);
      const file = i === 0 ? ` (${ROOT}/chapitres/introduction.tex` : i === 5 ? `) (${ROOT}/chapitres/methodes.tex` : i === 9 ? `) (${ROOT}/chapitres/conclusion.tex` : "";
      await emit("build:output", { lines: [{ stream: "stdout", text: `${file} [${i + 1}]` }] });
    }
    await emit("build:output", { lines: [{ stream: "stdout", text: ") )" }, { stream: "stdout", text: "Output written on build/main.pdf (12 pages, 284113 bytes)." }] });
  }
  await emit("build:finished", { outcome: null, error: null, manual: false });
  if (failing) {
    await emit("export-window:state", { ...state, phase: "failed", errors: 3, canForce: true });
    return;
  }
  await emit("export-window:state", { ...state, phase: "copying" });
  await sleep(500);
  await emit("export-window:state", { ...state, phase: "done", result: "PDF exporté : memoire.pdf" });
}
