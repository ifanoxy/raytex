// Subject and answer key ("sujet et corrigé"): the switch of a document
// that shows its solutions or hides them, read from its preamble and turned
// either way, and what RayTeX writes for a document that has none: the
// switch, solutions in a frame (left out of the subject), numbered exercises
// with their points, and room to answer in the subject (lines, a blank, a
// grid).
//
// Understood: the class exam (`\printanswers`), xsim (`solution/print`), a
// toggle of etoolbox or a `\newif` named for the answers (`corrections`,
// `corrige`, `solutions`…), as the templates and RayTeX write them.
//
// Local imports with their extension: tested directly by Node (`npm test`).

import { addPackages, loadedPackages, mask, preambleEnd, statementEnd } from "./preamble.ts";

export type SwitchKind = "exam" | "xsim" | "toggle" | "newif";

export interface AnswerSwitch {
  kind: SwitchKind;
  /** The solutions are shown now. */
  shown: boolean;
  /** The name of the toggle or of the `\newif` (`corrige`). */
  name: string | null;
  /** The environment the solutions are written in (`corrige`, `solution`); null when there is none yet. */
  env: string | null;
  /** The environment of an exercise (`exercice`, `exo`); null when there is none (exam asks `\question`). */
  exercise: string | null;
}

/** What can be written for a subject and its answer key. */
export type Piece = "solution" | "exercise" | "lines" | "space" | "grid";

export type KeyLang = "fr" | "en";

/** The names RayTeX gives, in the language of the document. */
export const NAMES = {
  fr: { flag: "corrige", solution: "corrige", exercise: "exercice", lines: "lignesreponse", space: "espacereponse", grid: "quadrillage", title: "Corrigé", heading: "Exercice", points: "4 points" },
  en: { flag: "answers", solution: "solution", exercise: "exercise", lines: "answerlines", space: "answerspace", grid: "answergrid", title: "Solution", heading: "Exercise", points: "4 points" },
} as const;

/** Names a toggle or a `\newif` has when it shows the answers. */
const ANSWER_NAME = /^(?:corriges?|corrections?|solutions?|answers?|reponses?|show(?:answers|solutions)|with(?:answers|solutions))$/i;
const SOLUTION_ENV = /^(?:corriges?|corrections?|solutions?|reponses?|answers?)$/i;
const EXERCISE_ENV = /^(?:exos?|exercices?|exercises?)$/i;
/** What defines an environment in a preamble. */
const DEF_ENV = /\\(?:(?:re)?newenvironment|(?:New|Renew|Provide|Declare)DocumentEnvironment|newtcolorbox|NewTColorBox|DeclareTColorBox|newtheorem|(?:special|exclude|include)comment)\*?\s*\{([A-Za-z]+)\}/g;

/**
 * The start of the text up to its first `\begin{document}`: all that is
 * read (a long document is not gone through as it is typed).
 */
function head(text: string): string {
  const at = text.indexOf("\\begin{document}");
  return at < 0 ? text.slice(0, 60_000) : text.slice(0, at + 16);
}

/** The preamble with its comments blanked (offsets kept). */
function preamble(text: string): string {
  const start = head(text);
  return mask(start).slice(0, preambleEnd(start));
}

function lastMatch(code: string, re: RegExp): RegExpMatchArray | null {
  let found: RegExpMatchArray | null = null;
  for (const m of code.matchAll(re)) found = m;
  return found;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The environments the preamble defines, each with the text of its definition. */
function definedEnvs(code: string): { name: string; body: string }[] {
  const all = [...code.matchAll(DEF_ENV)];
  return all.map((m, i) => ({ name: m[1], body: code.slice(m.index!, all[i + 1]?.index ?? Math.min(code.length, m.index! + 1200)) }));
}

/** The environment of the solutions: the one that tests the switch, else one named for them. */
function solutionEnv(code: string, test: string | null): string | null {
  const envs = definedEnvs(code);
  // An environment defined inside the test (`\ifcorrige \newtcolorbox{corrige}…`).
  if (test) {
    for (const m of code.matchAll(new RegExp(escape(test), "g"))) {
      const after = code.slice(m.index!, m.index! + 600);
      const inside = /\\(?:(?:re)?newenvironment|(?:New|Renew|Provide|Declare)DocumentEnvironment|newtcolorbox|NewTColorBox|(?:special|exclude|include)comment)\*?\s*\{([A-Za-z]+)\}/.exec(after);
      if (inside && SOLUTION_ENV.test(inside[1])) return inside[1];
    }
    const testing = envs.find((e) => e.body.includes(test));
    if (testing) return testing.name;
  }
  return envs.find((e) => SOLUTION_ENV.test(e.name))?.name ?? null;
}

function exerciseEnv(code: string): string | null {
  return definedEnvs(code).find((e) => EXERCISE_ENV.test(e.name))?.name ?? null;
}

/** The switch of the answers of a document, or null when it has none. */
export function answerSwitch(text: string): AnswerSwitch | null {
  const code = preamble(text);
  const cls = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{\s*exam\s*\}/.exec(code);
  if (cls) {
    const options = (cls[1] ?? "").split(",").map((o) => o.trim());
    const set = lastMatch(code, /\\(no)?printanswers(?![A-Za-z@])/g);
    return { kind: "exam", shown: set ? !set[1] : options.includes("answers"), name: null, env: "solution", exercise: null };
  }
  if (loadedPackages(head(text)).some((p) => p.names.includes("xsim"))) {
    const set = lastMatch(code, /solution\/print\s*=\s*(true|false)/g);
    return { kind: "xsim", shown: set?.[1] === "true", name: null, env: "solution", exercise: "exercise" };
  }
  for (const m of code.matchAll(/\\newtoggle\s*\{([A-Za-z]+)\}/g)) {
    const name = m[1];
    if (!ANSWER_NAME.test(name)) continue;
    const set = lastMatch(code, toggleSet(name));
    return { kind: "toggle", shown: (set?.[1] ?? set?.[2]) === "true", name, env: solutionEnv(code, `\\iftoggle{${name}}`), exercise: exerciseEnv(code) };
  }
  for (const m of code.matchAll(/\\newif\s*\\if([A-Za-z]+)/g)) {
    const name = m[1];
    if (!ANSWER_NAME.test(name)) continue;
    const set = lastMatch(code, newifSet(name));
    return { kind: "newif", shown: set?.[1] === "true", name, env: solutionEnv(code, `\\if${name}`), exercise: exerciseEnv(code) };
  }
  return null;
}

const toggleSet = (name: string) => new RegExp(`\\\\(?:toggle(true|false)\\s*\\{${name}\\}|settoggle\\s*\\{${name}\\}\\s*\\{(true|false)\\})`, "g");
const newifSet = (name: string) => new RegExp(`\\\\${name}(true|false)(?![A-Za-z@])`, "g");

/** Where a line ends after `offset`. */
function lineEnd(text: string, offset: number): number {
  const nl = text.indexOf("\n", offset);
  return nl < 0 ? text.length : nl;
}

const splice = (text: string, from: number, to: number, insert: string) => text.slice(0, from) + insert + text.slice(to);

/**
 * The document with its answers shown or hidden: the switch turned where it
 * is written (a commented `% \printanswers` uncommented, `\corrigefalse`
 * becoming `\corrigetrue`…), else set just after what defines it. The text
 * as it was when it has no switch or is that way already.
 */
export function withAnswers(text: string, shown: boolean): string {
  const sw = answerSwitch(text);
  if (!sw || sw.shown === shown) return text;
  const code = preamble(text);
  if (sw.kind === "exam") {
    if (shown) {
      const off = lastMatch(code, /\\noprintanswers(?![A-Za-z@])/g);
      if (off) return splice(text, off.index!, off.index! + off[0].length, "\\printanswers");
      const commented = /^([ \t]*)%[ \t]*(\\printanswers)(?![A-Za-z@])/m.exec(text.slice(0, code.length));
      if (commented) return splice(text, commented.index, commented.index + commented[0].length, `${commented[1]}${commented[2]}`);
      const at = lineEnd(text, statementEnd(text, code.indexOf("\\documentclass"), "\\documentclass"));
      return splice(text, at, at, "\n\\printanswers");
    }
    let out = text;
    // From the end, so that the offsets found stay right.
    const on = [...code.matchAll(/\\printanswers(?![A-Za-z@])/g)].reverse();
    for (const m of on) {
      const start = out.lastIndexOf("\n", m.index! - 1) + 1;
      const end = lineEnd(out, m.index!);
      const alone = out.slice(start, end).trim() === "\\printanswers";
      out = alone ? splice(out, m.index!, m.index!, "% ") : splice(out, m.index!, m.index! + m[0].length, "\\noprintanswers");
    }
    const cls = /\\documentclass\s*\[([^\]]*)\]/.exec(preamble(out));
    if (cls && cls[1].split(",").some((o) => o.trim() === "answers")) {
      const options = cls[1].split(",").filter((o) => o.trim() !== "answers");
      const from = cls.index + cls[0].indexOf("[");
      out = splice(out, from, from + cls[1].length + 2, options.length ? `[${options.join(",")}]` : "");
    }
    return out;
  }
  if (sw.kind === "xsim") {
    const set = lastMatch(code, /solution\/print\s*=\s*(true|false)/g);
    if (set) {
      const at = set.index! + set[0].length - set[1].length;
      return splice(text, at, at + set[1].length, String(shown));
    }
    const pkg = loadedPackages(head(text)).find((p) => p.names.includes("xsim"))!;
    return splice(text, lineEnd(text, pkg.to), lineEnd(text, pkg.to), "\n\\xsimsetup{solution/print=true}");
  }
  const name = sw.name!;
  if (sw.kind === "toggle") {
    const set = lastMatch(code, toggleSet(name));
    if (set) return splice(text, set.index!, set.index! + set[0].length, `\\toggle${shown}{${name}}`);
    const def = new RegExp(`\\\\newtoggle\\s*\\{${name}\\}`).exec(code)!;
    return splice(text, lineEnd(text, def.index + def[0].length), lineEnd(text, def.index + def[0].length), `\n\\toggletrue{${name}}`);
  }
  const set = lastMatch(code, newifSet(name));
  if (set) return splice(text, set.index!, set.index! + set[0].length, `\\${name}${shown}`);
  const def = new RegExp(`\\\\newif\\s*\\\\if${name}`).exec(code)!;
  return splice(text, lineEnd(text, def.index + def[0].length), lineEnd(text, def.index + def[0].length), `\n\\${name}true`);
}

/** The language of the names RayTeX writes: French in a French document. */
export function keyLang(text: string, fallback: KeyLang): KeyLang {
  const code = preamble(text);
  if (/\\usepackage\s*\[[^\]]*\bfrench\b[^\]]*\]\s*\{babel\}|\\documentclass\s*\[[^\]]*\bfrench\b[^\]]*\]|\\set(?:default|main)language\s*(?:\[[^\]]*\])?\s*\{french\}|\\usepackage\s*\{french\}/.test(code)) return "fr";
  if (/\{babel\}|\{polyglossia\}/.test(code)) return "en";
  return fallback;
}

/** TeX that keeps `body` for the subject only (left out where the answers are shown). */
function subjectOnly(sw: AnswerSwitch, body: string): string {
  if (sw.kind === "toggle") return `\\iftoggle{${sw.name}}{}{%\n${body}}`;
  return `\\if${sw.kind === "exam" ? "printanswers" : sw.name}\\else\n${body}\n\\fi`;
}

/** Whether `piece` can be written in a document with that switch (xsim has its own ways). */
export function canWrite(sw: AnswerSwitch | null, piece: Piece): boolean {
  if (!sw) return true;
  if (sw.kind === "xsim") return piece === "solution" || piece === "exercise";
  return true;
}

/**
 * The preamble with what `piece` needs: the switch and the environment of
 * the solutions first (when the document has none), then the definition of
 * the piece. The class exam and xsim bring their own: nothing is added.
 */
export function withPiece(text: string, piece: Piece, lang: KeyLang): string {
  let sw = answerSwitch(text);
  if (sw?.kind === "exam" || sw?.kind === "xsim") return text;
  const n = NAMES[lang];
  const add = (out: string, code: string, packages: string[] = []) => addBlock(addPackages(out, packages.map((name) => ({ name }))), code);
  let out = text;
  if (!sw) {
    out = add(out, switchBlock(lang), []);
    sw = answerSwitch(out);
    if (!sw) return text;
  }
  const code = () => preamble(out);
  if (piece === "solution" && !sw.env) out = add(out, solutionBlock(sw, n.solution, n.title, lang), ["tcolorbox"]);
  if (piece === "exercise" && !sw.exercise && !exerciseEnv(code())) out = add(out, exerciseBlock(n.exercise, n.heading, lang));
  if (piece === "lines" && !defines(code(), n.lines)) out = add(out, linesBlock(sw, n.lines, lang));
  if (piece === "space" && !defines(code(), n.space)) out = add(out, spaceBlock(sw, n.space, lang));
  if (piece === "grid" && !defines(code(), n.grid)) out = add(out, gridBlock(sw, n.grid, lang), ["tikz"]);
  return out;
}

/** What is written where the cursor is (a snippet: `${1}`, `${SELECTION}`). */
export function pieceSnippet(text: string, piece: Piece, lang: KeyLang, inQuestions = false): string | null {
  const sw = answerSwitch(text);
  const n = NAMES[lang];
  if (sw && !canWrite(sw, piece)) return null;
  if (sw?.kind === "exam") {
    if (piece === "solution") return "\\begin{solution}\n\t${1:${SELECTION}}\n\\end{solution}";
    if (piece === "exercise") return inQuestions ? "\\question[${1:2}] ${2:${SELECTION}}" : "\\begin{questions}\n\t\\question[${1:2}] ${2:${SELECTION}}\n\\end{questions}";
    if (piece === "lines") return "\\fillwithdottedlines{${1:3cm}}";
    if (piece === "space") return "\\makeemptybox{${1:3cm}}";
    return "\\fillwithgrid{${1:4cm}}";
  }
  const env = (name: string, arg = "") => `\\begin{${name}}${arg}\n\t\${2:\${SELECTION}}\n\\end{${name}}`;
  if (piece === "solution") return `\\begin{${sw?.env ?? n.solution}}\n\t\${1:\${SELECTION}}\n\\end{${sw?.env ?? n.solution}}`;
  if (piece === "exercise") {
    const name = sw?.exercise ?? n.exercise;
    return name === n.exercise && sw?.kind !== "xsim" ? env(name, `[\${1:${n.points}}]`) : env(name).replace("${2:", "${1:");
  }
  if (piece === "lines") return `\\${n.lines}{\${1:5}}`;
  if (piece === "space") return `\\${n.space}{\${1:3cm}}`;
  return `\\${n.grid}{\${1:4cm}}`;
}

/** Whether the preamble defines the command `\name` already. */
function defines(code: string, name: string): boolean {
  return new RegExp(`\\\\(?:(?:re)?newcommand|providecommand|(?:New|Renew|Provide|Declare)DocumentCommand)\\*?\\s*\\{?\\\\${name}(?![A-Za-z@])`).test(code);
}

/**
 * Adds lines at the end of the preamble, just before `\begin{document}`:
 * after every package and definition they may use.
 */
function addBlock(text: string, block: string): string {
  const end = preambleEnd(text);
  if (end >= text.length) return text;
  return `${text.slice(0, end).replace(/\s*$/, "")}\n\n${block}\n\n${text.slice(end)}`;
}

function switchBlock(lang: KeyLang): string {
  const { flag } = NAMES[lang];
  return lang === "fr"
    ? `% Sujet et corrigé : \\${flag}true montre les corrigés, \\${flag}false les cache\n% (l'aperçu de RayTeX bascule cette ligne, et exporte le sujet et le corrigé).\n\\newif\\if${flag}\n\\${flag}false`
    : `% Subject and answer key: \\${flag}true shows the solutions, \\${flag}false hides them\n% (the preview of RayTeX turns this line, and exports both).\n\\newif\\if${flag}\n\\${flag}false`;
}

/** The solutions: in a frame where they are shown, read and left out of the subject. */
function solutionBlock(sw: AnswerSwitch, env: string, title: string, lang: KeyLang): string {
  const shown = `\\newtcolorbox{${env}}{breakable, colback=green!3, colframe=green!45!black, fonttitle=\\bfseries, title=${title}}%`;
  const hidden = `\\NewDocumentEnvironment{${env}}{+b}{}{}%`;
  const test = sw.kind === "toggle" ? [`  \\iftoggle{${sw.name}}{%`, `    ${shown}`, "  }{%", `    ${hidden}`, "  }}"] : [`  \\if${sw.name}`, `    ${shown}`, "  \\else", `    ${hidden}`, "  \\fi}"];
  const note = lang === "fr" ? `% Le corrigé : encadré dans le corrigé, absent du sujet.` : `% A solution: framed in the answer key, left out of the subject.`;
  return [note, "\\tcbuselibrary{breakable}", "\\AtBeginDocument{%", ...test].join("\n");
}

function exerciseBlock(env: string, heading: string, lang: KeyLang): string {
  const note = lang === "fr" ? `% Un exercice numéroté, avec son barème : \\begin{${env}}[4 points].` : `% A numbered exercise, with its points: \\begin{${env}}[4 points].`;
  return `${note}\n\\newcounter{${env}}\n\\NewDocumentEnvironment{${env}}{o}\n  {\\par\\bigskip\\refstepcounter{${env}}\\noindent\\textbf{${heading}~\\the${env}}\\IfValueT{#1}{\\enspace\\textit{(#1)}}\\par\\nobreak\\smallskip}\n  {\\par}`;
}

function linesBlock(sw: AnswerSwitch, name: string, lang: KeyLang): string {
  const note = lang === "fr" ? `% Des lignes pour répondre, dans le sujet seulement : \\${name}{5}.` : `% Lines to answer on, in the subject only: \\${name}{5}.`;
  const body = `  \\par\\setcounter{${name}}{#1}%\n  \\loop\\ifnum\\value{${name}}>0\n    \\vspace{4mm}\\noindent\\makebox[\\linewidth]{\\dotfill}\\par\n    \\addtocounter{${name}}{-1}%\n  \\repeat`;
  return `${note}\n\\newcounter{${name}}\n\\newcommand\\${name}[1]{${subjectOnly(sw, body)}}`;
}

function spaceBlock(sw: AnswerSwitch, name: string, lang: KeyLang): string {
  const note = lang === "fr" ? `% Une place vide pour répondre, dans le sujet seulement : \\${name}{3cm}.` : `% Room to answer, in the subject only: \\${name}{3cm}.`;
  return `${note}\n\\newcommand\\${name}[1]{${subjectOnly(sw, "  \\par\\vspace*{#1}")}}`;
}

function gridBlock(sw: AnswerSwitch, name: string, lang: KeyLang): string {
  const note = lang === "fr" ? `% Un quadrillage de 5 mm pour répondre, dans le sujet seulement : \\${name}{4cm}.` : `% A 5 mm grid to answer on, in the subject only: \\${name}{4cm}.`;
  const body = `  \\par\\medskip\\noindent\n  \\begin{tikzpicture}\\draw[step=5mm, gray!40, very thin] (0,0) grid (\\linewidth,#1);\\end{tikzpicture}\\par`;
  return `${note}\n\\newcommand\\${name}[1]{${subjectOnly(sw, body)}}`;
}

/** The total of the points of the exercises (`[4 points]`, `\question[2]`), or null when none is given. */
export function totalPoints(text: string, sw: AnswerSwitch | null): number | null {
  const body = mask(text).slice(preambleEnd(text));
  let total = 0;
  let any = false;
  const add = (s: string) => {
    const n = Number(s.replace(",", "."));
    if (Number.isFinite(n)) {
      total += n;
      any = true;
    }
  };
  if (sw?.kind === "exam") {
    for (const m of body.matchAll(/\\(?:question|part|subpart|subsubpart)\s*\[\s*(\d+(?:[.,]\d+)?)\s*\]/g)) add(m[1]);
  } else {
    const env = sw?.exercise ?? "exercice|exercise";
    for (const m of body.matchAll(new RegExp(`\\\\begin\\{(?:${env})\\}\\s*\\[\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:points?|pts?)?\\s*\\]`, "g"))) add(m[1]);
  }
  return any ? Math.round(total * 100) / 100 : null;
}
