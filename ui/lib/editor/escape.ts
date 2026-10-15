// Special characters typed in text: `&`, `_`, `#` (and `%` after a number)
// are an error of LaTeX there, and are written `\&`, `\_`, `\#`, `\%`.
// Only where the character is surely text: never in a formula, a comment,
// the preamble, a table or an alignment (for `&`), the name of a label, a
// file, a link or a key, a definition (for `#`), TikZ or verbatim code.
// No local imports: tested directly by Node (`npm test`).

/** Commands whose arguments are names, keys or code, not text. */
const NAME_ARGUMENT =
  /^(label|[a-zA-Z]*ref|[a-zA-Z]*cite[a-zA-Z]*|nocite|input|include|includeonly|includegraphics|includepdf|includesvg|subfile|import|subimport|url|href|nolinkurl|path|bibliography|addbibresource|bibliographystyle|usepackage|RequirePackage|documentclass|usetikzlibrary|begin|end|newcommand|renewcommand|providecommand|DeclareMathOperator|DeclareRobustCommand|def|edef|gdef|newenvironment|renewenvironment|NewDocumentCommand|RenewDocumentCommand|NewDocumentEnvironment|newtheorem|graphicspath|lstinputlisting|inputminted|verb|hypersetup|setlength|addtolength|color|textcolor|colorbox|definecolor|pagecolor|SI|si|qty|num|unit|ang|tikzset|pgfkeys|pgfplotsset|lstset|setminted|captionsetup|geometry|newgeometry|fancyhead|fancyfoot|index|glossary|newglossaryentry|newacronym|gls|acrshort|acrlong|acrfull)$/;

/** Environments of code: nothing in them is escaped. */
const CODE_ENV = /^(verbatim\*?|Verbatim|lstlisting|minted|comment|filecontents\*?|tikzpicture|tikzcd|circuitikz|axis|semilogxaxis|semilogyaxis|loglogaxis|forest|algorithmic|pycode|luacode\*?|sagesilent|sageblock)$/;

/** Environments where `&` separates columns. */
const ALIGN_ENV = /tabular|tabu|tblr|array|align|matrix|cases|split|eqnarray|gather|multline|alignat|flalign|NiceTabular|NiceArray|longtable|xltabular|supertabular/;

/** Definitions of commands: `#1` is a parameter there. */
const DEFINITION = /\\(newcommand|renewcommand|providecommand|DeclareRobustCommand|def|edef|gdef|xdef|newenvironment|renewenvironment|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|NewDocumentEnvironment|newcolumntype|tikzset|pgfkeys|pgfplotsset|foreach)\b/;

/** The environments open before the end of `text`, innermost last. */
function openEnvironments(text: string): string[] {
  const stack: string[] = [];
  for (const m of text.matchAll(/\\(begin|end)\s*\{([^{}]+)\}/g)) {
    // A `\begin` in a comment does not count.
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    if (commentAt(text.slice(lineStart, m.index))) continue;
    if (m[1] === "begin") stack.push(m[2].trim());
    else {
      const at = stack.lastIndexOf(m[2].trim());
      if (at >= 0) stack.length = at;
    }
  }
  return stack;
}

/** Whether the end of `line` is in a comment (an unescaped `%` before it). */
function commentAt(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "%") return true;
  }
  return false;
}

/** The command whose brace or bracket argument the end of `text` is in, and which of the two. */
function argumentOf(text: string): { command: string; bracket: boolean } | null {
  let depth = 0;
  let squares = 0;
  // A few lines back is enough: arguments seldom run longer.
  const from = Math.max(0, text.length - 800);
  for (let i = text.length - 1; i >= from; i--) {
    const ch = text[i];
    if (text[i - 1] === "\\" && (ch === "{" || ch === "}" || ch === "[" || ch === "]")) {
      i--;
      continue;
    }
    if (ch === "}") depth++;
    else if (ch === "]") squares++;
    else if (ch === "[") {
      if (squares) squares--;
      else if (depth === 0) {
        const m = /\\([a-zA-Z]+)\*?\s*(?:\{[^{}]*\}|\[[^\]]*\])*\s*$/.exec(text.slice(0, i));
        return { command: m?.[1] ?? "", bracket: true };
      }
    } else if (ch === "{") {
      if (depth) depth--;
      else {
        const m = /\\([a-zA-Z]+)\*?\s*(?:\{[^{}]*\}|\[[^\]]*\])*\s*$/.exec(text.slice(0, i));
        return { command: m?.[1] ?? "", bracket: false };
      }
    }
  }
  return null;
}

/**
 * Whether `ch`, typed after `before` (the text of the file up to the cursor),
 * is meant as the character itself and is to be written escaped.
 */
export function escapeTyped(ch: string, before: string, inMath: boolean): boolean {
  if (!"&_#%".includes(ch) || inMath) return false;
  // Already escaped: `\` just typed before it.
  const slashes = /\\*$/.exec(before)![0].length;
  if (slashes % 2 === 1) return false;
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.slice(lineStart);
  if (commentAt(line)) return false;
  // `%` only after a number (`50 %`, `50~%`): elsewhere it starts a comment.
  if (ch === "%") {
    if (!/\d[  ~]?$/.test(line)) return false;
  }
  // The preamble is code.
  if (/\\documentclass\b/.test(before) && !/\\begin\s*\{document\}/.test(before)) return false;
  const envs = openEnvironments(before.slice(-60_000));
  if (envs.some((e) => CODE_ENV.test(e))) return false;
  if (ch === "&" && envs.some((e) => ALIGN_ENV.test(e))) return false;
  if (ch === "#" && DEFINITION.test(line)) return false;
  const arg = argumentOf(before);
  if (arg && (arg.bracket || NAME_ARGUMENT.test(arg.command))) return false;
  // `\verb|…`, `\url|…` and the like on the line: code.
  if (/\\(verb|lstinline|mintinline)\*?(.).*$/.test(line)) return false;
  return true;
}
