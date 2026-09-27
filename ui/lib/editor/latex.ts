// LaTeX and BibTeX languages for CodeMirror (stream tokenizers).
//
// The tokenizer is context-aware: it knows when it is in math mode, in a
// verbatim environment, in the argument of \section (heading), \label or
// \ref (keys), \begin/\end (environment names), \textbf/\emph (bold,
// italics), so highlighting reflects the structure of the document.

import { HighlightStyle, LanguageSupport, StreamLanguage, type StreamParser, syntaxHighlighting } from "@codemirror/language";
import { Tag, tags } from "@lezer/highlight";

export const mathTag = Tag.define();
export const mathDelimTag = Tag.define();

const SECTIONS = new Set(["part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph", "addchap", "addsec", "frametitle", "title", "caption"]);
const KEYS = new Set([
  "label", "ref", "eqref", "pageref", "autoref", "nameref", "cref", "Cref", "cpageref", "vref", "cite", "citep", "citet",
  "parencite", "textcite", "autocite", "footcite", "fullcite", "nocite", "citeauthor", "citeyear", "citetitle", "supercite",
  "gls", "Gls", "glspl", "acrshort", "acrlong", "acrfull", "ac", "subref", "input", "include", "includegraphics", "subfile",
  "bibliography", "addbibresource", "usepackage", "documentclass", "RequirePackage", "includeonly", "import", "subimport",
]);
const STRONG = new Set(["textbf", "mathbf", "boldsymbol", "bm"]);
const EMPH = new Set(["emph", "textit", "textsl"]);
const URLS = new Set(["url", "href", "path", "nolinkurl"]);
const MATH_ENVS = new Set([
  "equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "flalign", "flalign*",
  "alignat", "alignat*", "eqnarray", "eqnarray*", "displaymath", "math", "dmath", "dmath*",
]);
const VERBATIM_ENVS = new Set([
  "verbatim", "verbatim*", "Verbatim", "Verbatim*", "BVerbatim", "lstlisting", "minted", "comment", "filecontents",
  "filecontents*", "luacode", "luacode*", "pycode", "tcblisting", "spverbatim",
]);

type ArgKind = "env" | "key" | "heading" | "strong" | "em" | "url";

interface Arg {
  kind: ArgKind;
  pending: boolean;
  depth: number;
  begin: boolean;
  name: string;
}

interface LatexState {
  /** Closing delimiter of the current math, or the math environment name. */
  math: string | null;
  mathEnv: string | null;
  arg: Arg | null;
  verbatim: string | null;
}

const STOP = /[\\{}%$[\]&~#^_]/;

const latexParser: StreamParser<LatexState> = {
  name: "latex",
  startState: () => ({ math: null, mathEnv: null, arg: null, verbatim: null }),
  copyState: (s) => ({ ...s, arg: s.arg ? { ...s.arg } : null }),
  blankLine(state) {
    // Inline math cannot cross a paragraph.
    if (state.math === "$" || state.math === "\\)") state.math = null;
    if (state.arg?.pending) state.arg = null;
  },
  token(stream, state) {
    if (state.verbatim) {
      if (stream.match(`\\end{${state.verbatim}}`, false)) {
        state.verbatim = null;
      } else {
        if (!stream.skipTo("\\end{")) stream.skipToEnd();
        else if (!stream.match(`\\end{${state.verbatim}}`, false)) stream.next();
        return "string";
      }
    }
    const ch = stream.peek()!;
    if (ch === "%") {
      const magic = stream.match(/^%\s*!\s*(TEX|TeX|tex|BIB|bib)\b.*/);
      if (magic) return "meta";
      stream.skipToEnd();
      return "comment";
    }
    if (ch === "\\") {
      stream.next();
      const word = stream.match(/^[a-zA-Z@]+\*?/);
      if (word) {
        const name = stream.current().slice(1).replace(/\*$/, "");
        if (name === "begin" || name === "end") {
          state.arg = { kind: "env", pending: true, depth: 0, begin: name === "begin", name: "" };
          return "keyword";
        }
        if (name === "verb" || name === "lstinline") {
          const delim = stream.next();
          if (delim && delim !== "{") {
            stream.skipTo(delim) ? stream.next() : stream.skipToEnd();
          }
          return "string";
        }
        let kind: ArgKind | null = null;
        if (SECTIONS.has(name)) kind = "heading";
        else if (KEYS.has(name)) kind = "key";
        else if (STRONG.has(name)) kind = "strong";
        else if (EMPH.has(name)) kind = "em";
        else if (URLS.has(name)) kind = "url";
        if (kind) state.arg = { kind, pending: true, depth: 0, begin: false, name: "" };
        if (kind === "heading") return "heading keyword";
        return state.math ? "keyword math" : "keyword";
      }
      const next = stream.next();
      if (next === "[" || next === "(") {
        if (!state.math) state.math = next === "[" ? "\\]" : "\\)";
        return "mathDelim";
      }
      if (next === "]" || next === ")") {
        if (state.math === `\\${next}`) state.math = null;
        return "mathDelim";
      }
      if (next === "\\") return "operator";
      return state.math ? "math" : "escape";
    }
    if (ch === "$") {
      stream.next();
      const double = stream.eat("$");
      if (!state.math) state.math = double ? "$$" : "$";
      else if (state.math === "$" || (state.math === "$$" && double)) state.math = null;
      return "mathDelim";
    }
    if (ch === "{") {
      stream.next();
      const a = state.arg;
      if (a) {
        if (a.pending) {
          a.pending = false;
          a.depth = 1;
        } else {
          a.depth++;
        }
      }
      return "bracket";
    }
    if (ch === "}") {
      stream.next();
      const a = state.arg;
      if (a && !a.pending) {
        a.depth--;
        if (a.depth <= 0) {
          if (a.kind === "env") {
            const env = a.name.trim();
            if (a.begin) {
              if (VERBATIM_ENVS.has(env)) state.verbatim = env;
              else if (MATH_ENVS.has(env) && !state.math) {
                state.math = "env";
                state.mathEnv = env;
              }
            } else if (state.mathEnv === env) {
              state.math = null;
              state.mathEnv = null;
            }
          }
          state.arg = null;
        }
      }
      return "bracket";
    }
    if (ch === "[" || ch === "]") {
      stream.next();
      return "bracket";
    }
    if (ch === "*" && state.arg?.pending) {
      stream.next();
      return "keyword";
    }
    if (ch === "&" || ch === "~" || ch === "#") {
      stream.next();
      return "operator";
    }
    if ((ch === "^" || ch === "_") && state.math) {
      stream.next();
      return "operator math";
    }
    if (stream.eatSpace()) return null;
    if (state.arg && state.arg.pending) state.arg = null;
    if (!stream.eatWhile((c) => !STOP.test(c) && !/\s/.test(c))) stream.next();
    const a = state.arg;
    if (a && !a.pending) {
      if (a.kind === "env") {
        a.name += stream.current();
        return "typeName";
      }
      if (a.kind === "key") return "labelName";
      if (a.kind === "heading") return "heading";
      if (a.kind === "strong") return state.math ? "math strong" : "strong";
      if (a.kind === "em") return "emphasis";
      if (a.kind === "url") return "link";
    }
    if (state.math) return /^\d/.test(stream.current()) ? "number math" : "math";
    return null;
  },
  languageData: {
    commentTokens: { line: "%" },
    // `$` is handled by editor/dollar.ts (no pair after text).
    closeBrackets: { brackets: ["(", "[", "{"], before: ")]}$:;,. \n" },
    wordChars: "@",
  },
  tokenTable: {
    math: mathTag,
    mathDelim: mathDelimTag,
    heading: tags.heading,
    strong: tags.strong,
    emphasis: tags.emphasis,
    escape: tags.escape,
  },
};

export const latexLanguage = StreamLanguage.define(latexParser);

// ---------------------------------------------------------------- BibTeX

interface BibState {
  inEntry: boolean;
  depth: number;
  expectKey: boolean;
  inValue: boolean;
}

const bibParser: StreamParser<BibState> = {
  name: "bibtex",
  startState: () => ({ inEntry: false, depth: 0, expectKey: false, inValue: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;
    const ch = stream.peek()!;
    if (!state.inEntry) {
      if (ch === "@") {
        stream.next();
        stream.eatWhile(/[A-Za-z]/);
        return "keyword";
      }
      if (ch === "{" || ch === "(") {
        stream.next();
        state.inEntry = true;
        state.depth = 1;
        state.expectKey = true;
        return "bracket";
      }
      if (ch === "%") {
        stream.skipToEnd();
        return "comment";
      }
      stream.next();
      return "comment";
    }
    if (state.expectKey) {
      if (ch === ",") {
        stream.next();
        state.expectKey = false;
        return "punctuation";
      }
      stream.eatWhile(/[^,\s}]/);
      return "labelName";
    }
    if (ch === "{" || ch === "(") {
      stream.next();
      state.depth++;
      return "bracket";
    }
    if (ch === "}" || ch === ")") {
      stream.next();
      state.depth--;
      if (state.depth <= 0) {
        state.inEntry = false;
        state.inValue = false;
      }
      return "bracket";
    }
    if (state.depth > 1 || ch === '"') {
      if (ch === '"') {
        stream.next();
        stream.skipTo('"') ? stream.next() : stream.skipToEnd();
        return "string";
      }
      if (ch === "\\") {
        stream.next();
        stream.eatWhile(/[a-zA-Z]/);
        return "keyword";
      }
      stream.eatWhile(/[^{}\\"]/);
      return "string";
    }
    if (ch === "=") {
      stream.next();
      state.inValue = true;
      return "operator";
    }
    if (ch === ",") {
      stream.next();
      state.inValue = false;
      return "punctuation";
    }
    if (ch === "#") {
      stream.next();
      return "operator";
    }
    if (/\d/.test(ch)) {
      stream.eatWhile(/\d/);
      return "number";
    }
    stream.eatWhile(/[A-Za-z0-9_:.+-]/) || stream.next();
    return state.inValue ? "variableName" : "propertyName";
  },
  languageData: {
    commentTokens: { line: "%" },
    closeBrackets: { brackets: ["{", '"'] },
  },
};

export const bibtexLanguage = StreamLanguage.define(bibParser);

// ----------------------------------------------------------- highlighting

export const latexHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--hl-command)" },
  { tag: tags.heading, color: "var(--hl-heading)", fontWeight: "650" },
  { tag: tags.comment, color: "var(--hl-comment)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--hl-magic)", fontWeight: "600" },
  { tag: tags.typeName, color: "var(--hl-env)" },
  { tag: tags.labelName, color: "var(--hl-key)" },
  { tag: mathTag, color: "var(--hl-math)" },
  { tag: mathDelimTag, color: "var(--hl-math-delim)", fontWeight: "600" },
  { tag: tags.bracket, color: "var(--hl-bracket)" },
  { tag: tags.operator, color: "var(--hl-operator)" },
  { tag: tags.string, color: "var(--hl-string)" },
  { tag: tags.link, color: "var(--hl-link)", textDecoration: "underline" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.escape, color: "var(--hl-operator)" },
  { tag: tags.number, color: "var(--hl-number)" },
  { tag: tags.propertyName, color: "var(--hl-command)" },
  { tag: tags.variableName, color: "var(--hl-env)" },
  { tag: tags.punctuation, color: "var(--hl-bracket)" },
]);

export function latex(): LanguageSupport {
  return new LanguageSupport(latexLanguage, [syntaxHighlighting(latexHighlight)]);
}

export function bibtex(): LanguageSupport {
  return new LanguageSupport(bibtexLanguage, [syntaxHighlighting(latexHighlight)]);
}
