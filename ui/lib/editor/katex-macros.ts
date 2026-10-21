// The commands of a project as KaTeX draws them: a body with its arguments,
// an optional first argument with its default (`\vect[v]{x}`, `\vect{x}`),
// the delimiters of `\DeclarePairedDelimiter` (`\abs{x}`, `\abs*{x}`,
// `\abs[\big]{x}`), and a few commands of packages KaTeX does not know,
// common in the definitions (`\ensuremath`, `\xspace`, `\mathds`).

/** A command of the project, as the engine gives it (`math_macros`). */
export interface MathMacro {
  name: string;
  body: string;
  args: number;
  default?: string;
  paired?: [string, string];
}

interface Token {
  text: string;
}

/** What KaTeX gives a macro written as a function (its `MacroContextInterface`). */
interface MacroContext {
  future(): Token;
  popToken(): Token;
  consumeSpaces(): void;
  consumeArg(delims?: string[]): { tokens: Token[] };
  consumeArgs(n: number): Token[][];
}

export type KatexMacro = string | ((context: MacroContext) => string);

const COMPAT: Record<string, string> = {
  "\\ensuremath": "#1",
  "\\xspace": "",
  "\\mathds": "\\mathbb{#1}",
  "\\mathbbm": "\\mathbb{#1}",
};

/** The text of tokens as KaTeX keeps them (last one first), a space after a command word followed by a letter. */
function text(tokens: Token[]): string {
  let out = "";
  let previous = "";
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].text;
    if (/^\\[a-zA-Z@]+$/.test(previous) && /^[a-zA-Z@]/.test(t)) out += " ";
    out += t;
    previous = t;
  }
  return out;
}

/** `[…]` read when it comes next. */
function optional(context: MacroContext): string | null {
  context.consumeSpaces();
  if (context.future().text !== "[") return null;
  context.popToken();
  return text(context.consumeArg(["]"]).tokens);
}

const fill = (body: string, args: string[]) => body.replace(/#([1-9])/g, (_, k: string) => args[Number(k) - 1] ?? "");

function macro(m: MathMacro): KatexMacro {
  if (m.paired) {
    const [left, right] = m.paired;
    return (context) => {
      context.consumeSpaces();
      let star = false;
      if (context.future().text === "*") {
        context.popToken();
        star = true;
      }
      const size = star ? null : optional(context)?.trim();
      const x = text(context.consumeArgs(1)[0]);
      if (star) return `\\left${left} ${x} \\right${right}`;
      if (size) return `${size}l${left} ${x} ${size}r${right}`;
      return `\\mathopen{${left}} ${x} \\mathclose{${right}}`;
    };
  }
  if (!m.args) return m.body;
  return (context) => {
    const args: string[] = [];
    let left = m.args;
    if (m.default !== undefined) {
      args.push(optional(context) ?? m.default);
      left--;
    }
    for (const a of context.consumeArgs(left)) args.push(text(a));
    return fill(m.body, args);
  };
}

/** The macros for KaTeX of the commands of a project (theirs before the ones added for packages). */
export function katexMacros(list: MathMacro[]): Record<string, KatexMacro> {
  const out: Record<string, KatexMacro> = { ...COMPAT };
  for (const m of list) out[m.name] = macro(m);
  return out;
}
