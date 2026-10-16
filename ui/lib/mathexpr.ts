// Functions of x written as on paper: `x^2 - 2x + 1`, `2sin(x)`, `e^(-x)`,
// `ln(x)/x`, `|x - 1|`, `√x`, `1,5x` (a comma between digits is a decimal
// point). Read into a tree that is computed, differentiated, simplified,
// and written for pgfplots (`trig format plots=rad`) or in LaTeX.

export type Expr =
  | { kind: "num"; value: number }
  | { kind: "x" }
  | { kind: "const"; name: "pi" | "e" }
  | { kind: "neg"; arg: Expr }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "^"; left: Expr; right: Expr }
  | { kind: "call"; fn: Fn; arg: Expr };

/** The functions that are known, by their name in the tree. */
export type Fn = "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "sinh" | "cosh" | "tanh" | "exp" | "ln" | "log" | "sqrt" | "abs" | "floor" | "ceil";

/** Names that are read, and the function they stand for. */
const NAMES: Record<string, Fn> = {
  sin: "sin",
  cos: "cos",
  tan: "tan",
  arcsin: "asin",
  asin: "asin",
  arccos: "acos",
  acos: "acos",
  arctan: "atan",
  atan: "atan",
  sinh: "sinh",
  cosh: "cosh",
  tanh: "tanh",
  sh: "sinh",
  ch: "cosh",
  th: "tanh",
  exp: "exp",
  ln: "ln",
  log: "log",
  sqrt: "sqrt",
  racine: "sqrt",
  abs: "abs",
  floor: "floor",
  ent: "floor",
  E: "floor",
  ceil: "ceil",
};

/** Why an expression cannot be read, and where. */
export class ExprError extends Error {
  /** Where, in the text (characters). */
  readonly at: number;
  /** What was found there. */
  readonly what: string;
  constructor(message: "empty" | "unexpected" | "unknown" | "unclosed" | "missing", at: number, what = "") {
    super(message);
    this.at = at;
    this.what = what;
  }
}

type Token = { t: "num"; v: number; at: number } | { t: "name"; v: string; at: number } | { t: "sym"; v: string; at: number };

function tokenize(text: string): Token[] {
  const s = text
    .replace(/[−–]/g, "-")
    .replace(/[×·∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/\*\*/g, "^");
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c) || (c === "," && /[0-9]/.test(s[i - 1] ?? "") && /[0-9]/.test(s[i + 1] ?? ""))) {
      const m = /^[0-9]*(?:[.,][0-9]+)?(?:[eE][+-]?[0-9]+(?![a-zA-Z(]))?/.exec(s.slice(i))!;
      const raw = m[0] || c;
      const v = Number(raw.replace(",", "."));
      if (!raw || Number.isNaN(v)) throw new ExprError("unexpected", i, c);
      out.push({ t: "num", v, at: i });
      i += raw.length;
    } else if (/[a-zA-Z]/.test(c)) {
      const m = /^[a-zA-Z]+/.exec(s.slice(i))!;
      // A run of letters is split into the names it is made of: `xe` is x·e,
      // `2xsin(x)` is 2·x·sin(x).
      let word = m[0];
      let at = i;
      while (word) {
        const name = Object.keys(NAMES)
          .concat(["pi", "x", "e"])
          .filter((n) => word.startsWith(n))
          .sort((a, b) => b.length - a.length)[0];
        if (!name) throw new ExprError("unknown", at, word);
        out.push({ t: "name", v: name, at });
        word = word.slice(name.length);
        at += name.length;
      }
      i += m[0].length;
    } else if ("+-*/^()|[]".includes(c)) {
      out.push({ t: "sym", v: c === "[" ? "(" : c === "]" ? ")" : c, at: i });
      i++;
    } else {
      throw new ExprError("unexpected", i, c);
    }
  }
  return out;
}

/** Reads an expression of x. Throws an {@link ExprError}. */
export function parseExpr(text: string): Expr {
  const tokens = tokenize(text);
  if (!tokens.length) throw new ExprError("empty", 0);
  let i = 0;
  /** Bars of absolute values open: a `|` closes the last one when an operand ends before it. */
  let bars = 0;
  const peek = () => tokens[i];
  const end = () => tokens[i - 1]?.at ?? 0;

  const startsOperand = (tok: Token | undefined) => !!tok && (tok.t === "num" || tok.t === "name" || (tok.t === "sym" && (tok.v === "(" || (tok.v === "|" && !closesBar()))));
  // A bar after an operand closes; one where an operand is awaited opens.
  let lastWasOperand = false;
  const closesBar = () => bars > 0 && lastWasOperand;

  function sum(): Expr {
    let left = product();
    for (;;) {
      const tok = peek();
      if (tok?.t === "sym" && (tok.v === "+" || tok.v === "-")) {
        i++;
        lastWasOperand = false;
        left = { kind: "op", op: tok.v, left, right: product() };
      } else return left;
    }
  }

  function product(): Expr {
    let left = unary();
    for (;;) {
      const tok = peek();
      if (tok?.t === "sym" && (tok.v === "*" || tok.v === "/")) {
        i++;
        lastWasOperand = false;
        left = { kind: "op", op: tok.v, left, right: unary() };
      } else if (startsOperand(tok)) {
        // Written side by side: a product (`2x`, `x(x+1)`, `(x-1)(x+1)`).
        left = { kind: "op", op: "*", left, right: power() };
      } else return left;
    }
  }

  function unary(): Expr {
    const tok = peek();
    if (tok?.t === "sym" && (tok.v === "-" || tok.v === "+")) {
      i++;
      lastWasOperand = false;
      const arg = unary();
      return tok.v === "-" ? { kind: "neg", arg } : arg;
    }
    return power();
  }

  function power(): Expr {
    const base = atom();
    const tok = peek();
    if (tok?.t === "sym" && tok.v === "^") {
      i++;
      lastWasOperand = false;
      // Right to left: 2^3^2 is 2^9; a sign may follow (`e^-x`).
      return { kind: "op", op: "^", left: base, right: unary() };
    }
    return base;
  }

  function atom(): Expr {
    const tok = peek();
    if (!tok) throw new ExprError("missing", end());
    i++;
    if (tok.t === "num") {
      lastWasOperand = true;
      return { kind: "num", value: tok.v };
    }
    if (tok.t === "name") {
      if (tok.v === "x") {
        lastWasOperand = true;
        return { kind: "x" };
      }
      if (tok.v === "pi" || tok.v === "e") {
        lastWasOperand = true;
        return { kind: "const", name: tok.v };
      }
      const fn = NAMES[tok.v];
      // `sin x`, `ln 2x`: the argument may go without brackets (up to the next sign).
      const next = peek();
      lastWasOperand = false;
      if (next?.t === "sym" && next.v === "^") {
        // sin^2(x): the square of sin(x).
        i++;
        const exponent = atom();
        const arg = argument();
        return { kind: "op", op: "^", left: { kind: "call", fn, arg }, right: exponent };
      }
      return { kind: "call", fn, arg: argument() };
    }
    if (tok.v === "(") {
      lastWasOperand = false;
      const inner = sum();
      const close = peek();
      if (close?.t !== "sym" || close.v !== ")") throw new ExprError("unclosed", tok.at);
      i++;
      lastWasOperand = true;
      return inner;
    }
    if (tok.v === "|") {
      bars++;
      lastWasOperand = false;
      const inner = sum();
      const close = peek();
      if (close?.t !== "sym" || close.v !== "|") throw new ExprError("unclosed", tok.at);
      i++;
      bars--;
      lastWasOperand = true;
      return { kind: "call", fn: "abs", arg: inner };
    }
    throw new ExprError("unexpected", tok.at, tok.v);
  }

  /**
   * The argument of a function: its brackets (`sin(x)^2` is the square of
   * sin x), or, without them, the product that follows up to a sign or
   * another function (`ln 2x`, `sin 2x cos x`).
   */
  function argument(): Expr {
    const next = peek();
    if (next?.t === "sym" && next.v === "(") return atom();
    if (!startsOperand(next)) throw new ExprError("missing", end());
    let arg = power();
    for (let tok = peek(); startsOperand(tok) && !(tok!.t === "name" && NAMES[tok!.v]); tok = peek()) {
      arg = { kind: "op", op: "*", left: arg, right: power() };
    }
    return arg;
  }

  const expr = sum();
  if (i < tokens.length) {
    const tok = tokens[i];
    throw new ExprError(tok.t === "sym" && tok.v === ")" ? "unexpected" : "unexpected", tok.at, String(tok.v));
  }
  return expr;
}

/** The expression `text` reads, or null. */
export function tryParse(text: string): Expr | null {
  try {
    return parseExpr(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- computing

const FN: Record<Fn, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: (v) => (v > 0 ? Math.log(v) : Number.NaN),
  log: (v) => (v > 0 ? Math.log10(v) : Number.NaN),
  sqrt: (v) => (v >= 0 ? Math.sqrt(v) : Number.NaN),
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
};

/** The value at x (NaN where it is not defined, ±Infinity at a pole). */
export function evaluate(e: Expr, x: number): number {
  switch (e.kind) {
    case "num":
      return e.value;
    case "x":
      return x;
    case "const":
      return e.name === "pi" ? Math.PI : Math.E;
    case "neg":
      return -evaluate(e.arg, x);
    case "call":
      return FN[e.fn](evaluate(e.arg, x));
    case "op": {
      const a = evaluate(e.left, x);
      const b = evaluate(e.right, x);
      switch (e.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return b === 0 ? (a === 0 ? Number.NaN : a / b) : a / b;
        case "^": {
          // A negative number to an odd root (x^(1/3)) is read as in mathematics.
          if (a < 0 && !Number.isInteger(b)) {
            const q = Math.round(1 / b);
            if (Math.abs(1 / b - q) < 1e-9 && q % 2 !== 0) return -Math.pow(-a, b);
            return Number.NaN;
          }
          return Math.pow(a, b);
        }
      }
    }
  }
}

/** Whether x does not appear in `e`. */
export function isConstant(e: Expr): boolean {
  switch (e.kind) {
    case "x":
      return false;
    case "num":
    case "const":
      return true;
    case "neg":
    case "call":
      return isConstant(e.arg);
    case "op":
      return isConstant(e.left) && isConstant(e.right);
  }
}

const num = (value: number): Expr => ({ kind: "num", value });
const isNum = (e: Expr, v?: number) => e.kind === "num" && (v === undefined || e.value === v);
const op = (o: "+" | "-" | "*" | "/" | "^", left: Expr, right: Expr): Expr => simplify({ kind: "op", op: o, left, right });
const neg = (arg: Expr): Expr => simplify({ kind: "neg", arg });
const call = (fn: Fn, arg: Expr): Expr => ({ kind: "call", fn, arg });

/** Smaller and tidier, the same function: 0 and 1 taken out, numbers worked out. */
export function simplify(e: Expr): Expr {
  if (e.kind === "neg") {
    const a = e.arg.kind === "op" || e.arg.kind === "neg" ? simplify(e.arg) : e.arg;
    if (a.kind === "num") return num(-a.value);
    if (a.kind === "neg") return a.arg;
    return { kind: "neg", arg: a };
  }
  if (e.kind === "call") return { kind: "call", fn: e.fn, arg: simplify(e.arg) };
  if (e.kind !== "op") return e;
  const l = simplify(e.left);
  const r = simplify(e.right);
  if (l.kind === "num" && r.kind === "num" && e.op !== "/" && e.op !== "^") {
    return num(evaluate({ kind: "op", op: e.op, left: l, right: r }, 0));
  }
  switch (e.op) {
    case "+":
      if (isNum(l, 0)) return r;
      if (isNum(r, 0)) return l;
      if (r.kind === "neg") return { kind: "op", op: "-", left: l, right: r.arg };
      if (r.kind === "num" && r.value < 0) return { kind: "op", op: "-", left: l, right: num(-r.value) };
      break;
    case "-":
      if (isNum(r, 0)) return l;
      if (isNum(l, 0)) return neg(r);
      if (r.kind === "neg") return { kind: "op", op: "+", left: l, right: r.arg };
      if (r.kind === "num" && r.value < 0) return { kind: "op", op: "+", left: l, right: num(-r.value) };
      break;
    case "*":
      if (isNum(l, 0) || isNum(r, 0)) return num(0);
      if (isNum(l, 1)) return r;
      if (isNum(r, 1)) return l;
      if (isNum(l, -1)) return neg(r);
      if (isNum(r, -1)) return neg(l);
      if (l.kind === "neg") return neg(op("*", l.arg, r));
      if (r.kind === "neg") return neg(op("*", l, r.arg));
      // The number first: x·2 is 2x.
      if (r.kind === "num" && l.kind !== "num") return op("*", r, l);
      if (l.kind === "num" && r.kind === "op" && r.op === "*" && r.left.kind === "num") return op("*", num(l.value * r.left.value), r.right);
      break;
    case "/":
      if (isNum(l, 0)) return num(0);
      if (isNum(r, 1)) return l;
      if (l.kind === "num" && r.kind === "num" && Number.isInteger(l.value / r.value)) return num(l.value / r.value);
      break;
    case "^":
      if (isNum(r, 0)) return num(1);
      if (isNum(r, 1)) return l;
      if (l.kind === "num" && r.kind === "num" && Number.isInteger(r.value)) return num(Math.pow(l.value, r.value));
      break;
  }
  return { kind: "op", op: e.op, left: l, right: r };
}

/** The derivative (simplified). */
export function derivative(e: Expr): Expr {
  return simplify(d(e));
}

function d(e: Expr): Expr {
  switch (e.kind) {
    case "num":
    case "const":
      return num(0);
    case "x":
      return num(1);
    case "neg":
      return neg(d(e.arg));
    case "op": {
      const { left: u, right: v } = e;
      switch (e.op) {
        case "+":
          return op("+", d(u), d(v));
        case "-":
          return op("-", d(u), d(v));
        case "*":
          if (isConstant(u)) return op("*", u, d(v));
          if (isConstant(v)) return op("*", v, d(u));
          return op("+", op("*", d(u), v), op("*", u, d(v)));
        case "/":
          if (isConstant(v)) return op("/", d(u), v);
          return op("/", op("-", op("*", d(u), v), op("*", u, d(v))), op("^", v, num(2)));
        case "^":
          if (isConstant(v)) {
            // (u^n)' = n u^(n-1) u'
            const n = simplify(v);
            const lower = n.kind === "num" ? num(n.value - 1) : op("-", n, num(1));
            return op("*", op("*", n, op("^", u, lower)), d(u));
          }
          if (u.kind === "const" && u.name === "e") return op("*", d(v), e);
          // u^v = exp(v ln u)
          return op("*", e, op("+", op("*", d(v), call("ln", u)), op("/", op("*", v, d(u)), u)));
      }
      break;
    }
    case "call": {
      const u = e.arg;
      const du = d(u);
      const inner = (outer: Expr) => op("*", outer, du);
      switch (e.fn) {
        case "sin":
          return inner(call("cos", u));
        case "cos":
          return inner(neg(call("sin", u)));
        case "tan":
          return inner(op("+", num(1), op("^", call("tan", u), num(2))));
        case "asin":
          return op("/", du, call("sqrt", op("-", num(1), op("^", u, num(2)))));
        case "acos":
          return neg(op("/", du, call("sqrt", op("-", num(1), op("^", u, num(2))))));
        case "atan":
          return op("/", du, op("+", num(1), op("^", u, num(2))));
        case "sinh":
          return inner(call("cosh", u));
        case "cosh":
          return inner(call("sinh", u));
        case "tanh":
          return inner(op("-", num(1), op("^", call("tanh", u), num(2))));
        case "exp":
          return inner(call("exp", u));
        case "ln":
          return op("/", du, u);
        case "log":
          return op("/", du, op("*", u, call("ln", num(10))));
        case "sqrt":
          return op("/", du, op("*", num(2), call("sqrt", u)));
        case "abs":
          return op("/", op("*", u, du), call("abs", u));
        case "floor":
        case "ceil":
          return num(0);
      }
    }
  }
  return num(0);
}

/** The slope at x, worked out from the derivative (NaN where there is none). */
export function slopeAt(e: Expr, x: number): number {
  const exact = evaluate(derivative(e), x);
  if (Number.isFinite(exact)) return exact;
  return Number.NaN;
}

// ------------------------------------------------------------------ writing

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3, "^": 4 };

function prec(e: Expr): number {
  if (e.kind === "op") return PRECEDENCE[e.op];
  if (e.kind === "neg") return PRECEDENCE.neg;
  return 9;
}

/** A number as short as it is exact enough (`0.3333`, `2`, `-1.5`). */
export function formatNumber(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  const s = v.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

/** For pgfplots (its mathematics, angles in radians: the axis says `trig format plots=rad`). */
export function toPgf(e: Expr): string {
  switch (e.kind) {
    case "num":
      return e.value < 0 ? `(${formatNumber(e.value, 6)})` : formatNumber(e.value, 6);
    case "x":
      return "x";
    case "const":
      return e.name === "pi" ? "pi" : "exp(1)";
    case "neg": {
      // pgf reads -x^2 as (-x)^2: what the sign stands before is in brackets.
      const a = toPgf(e.arg);
      return e.arg.kind === "op" || e.arg.kind === "neg" ? `-(${a})` : `-${a}`;
    }
    case "call": {
      const a = toPgf(e.arg);
      if (e.fn === "log") return `log10(${a})`;
      return `${e.fn}(${a})`;
    }
    case "op": {
      if (e.op === "^" && e.left.kind === "const" && e.left.name === "e") return `exp(${toPgf(e.right)})`;
      const p = PRECEDENCE[e.op];
      const wrap = (side: Expr, right: boolean) => {
        const s = toPgf(side);
        const q = prec(side);
        // Both sides of a power in brackets unless a plain number or x
        // (pgf reads -x^2 as (-x)^2).
        if (e.op === "^") return side.kind === "x" || (side.kind === "num" && side.value >= 0) || side.kind === "const" || side.kind === "call" ? s : `(${s})`;
        return q < p || (right && q === p && (e.op === "-" || e.op === "/")) ? `(${s})` : s;
      };
      const sep = e.op === "+" || e.op === "-" ? ` ${e.op} ` : e.op;
      return `${wrap(e.left, false)}${sep}${wrap(e.right, true)}`;
    }
  }
}

const LATEX_FN: Record<Fn, string> = {
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  asin: "\\arcsin",
  acos: "\\arccos",
  atan: "\\arctan",
  sinh: "\\sinh",
  cosh: "\\cosh",
  tanh: "\\tanh",
  exp: "\\exp",
  ln: "\\ln",
  log: "\\log",
  sqrt: "\\sqrt",
  abs: "",
  floor: "\\lfloor",
  ceil: "\\lceil",
};

/** A number in LaTeX: a decimal comma in French (`1{,}5`). */
export function latexNumber(v: number, comma = false, digits = 4): string {
  const s = formatNumber(v, digits);
  return comma ? s.replace(".", "{,}") : s;
}

/** In LaTeX, as it is written on paper (`x^{2} - 2x + 1`, `\frac{1}{x}`, `\mathrm{e}^{x}`). */
export function toLatex(e: Expr, comma = false): string {
  const w = (x: Expr) => toLatex(x, comma);
  switch (e.kind) {
    case "num":
      return latexNumber(e.value, comma);
    case "x":
      return "x";
    case "const":
      return e.name === "pi" ? "\\pi" : "\\mathrm{e}";
    case "neg":
      return prec(e.arg) < PRECEDENCE.neg ? `-\\left(${w(e.arg)}\\right)` : `-${w(e.arg)}`;
    case "call": {
      const a = w(e.arg);
      if (e.fn === "sqrt") return `\\sqrt{${a}}`;
      if (e.fn === "abs") return `\\left|${a}\\right|`;
      if (e.fn === "floor") return `\\left\\lfloor ${a}\\right\\rfloor`;
      if (e.fn === "ceil") return `\\left\\lceil ${a}\\right\\rceil`;
      if (e.fn === "exp") return `\\mathrm{e}^{${a}}`;
      const simple = e.arg.kind === "x" || e.arg.kind === "num";
      return simple ? `${LATEX_FN[e.fn]} ${a}` : `${LATEX_FN[e.fn]}\\left(${a}\\right)`;
    }
    case "op": {
      if (e.op === "/") return `\\frac{${w(e.left)}}{${w(e.right)}}`;
      if (e.op === "^") {
        const base = e.left.kind === "x" || e.left.kind === "const" || (e.left.kind === "num" && e.left.value >= 0) ? w(e.left) : `\\left(${w(e.left)}\\right)`;
        // sin^2 x
        if (e.left.kind === "call" && e.left.fn !== "sqrt" && e.left.fn !== "abs" && e.left.fn !== "exp" && e.left.fn !== "floor" && e.left.fn !== "ceil") {
          return `${LATEX_FN[e.left.fn]}^{${w(e.right)}}\\left(${w(e.left.arg)}\\right)`;
        }
        return `${base}^{${w(e.right)}}`;
      }
      const p = PRECEDENCE[e.op];
      const side = (x: Expr, right: boolean) => {
        const s = w(x);
        const q = prec(x);
        return q < p || (right && q === p && e.op === "-") || (right && e.op !== "*" && x.kind === "neg") ? `\\left(${s}\\right)` : s;
      };
      if (e.op === "*") {
        const l = side(e.left, false);
        const r = side(e.right, true);
        // 2x, 3\sin x, x\mathrm{e}^{x}; a number after something else needs a sign.
        if (e.right.kind === "num" || /^[0-9-]/.test(r)) return `${l} \\times ${r}`;
        return `${l}${/[a-z]$/i.test(l) && /^[a-z]/i.test(r) ? " " : ""}${r}`;
      }
      return `${side(e.left, false)} ${e.op} ${side(e.right, true)}`;
    }
  }
}
