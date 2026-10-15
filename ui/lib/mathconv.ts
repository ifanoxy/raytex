// Formulas from elsewhere into LaTeX: MathML (web pages, Word when it is
// asked to copy MathML) and OMML, the format of Word's equations, which
// Word puts in the HTML of what it copies. A formula that carries its TeX
// (Wikipedia and many sites do, in an annotation) is taken as it is.
// No local imports but `.ts` ones: tested directly by Node (`npm test`).

import { findAll, localName, type MNode, textOf } from "./markup.ts";

/** A formula read: its LaTeX, and whether it is a displayed one. */
export interface Formula {
  latex: string;
  display: boolean;
}

// ------------------------------------------------------------ symbols

const SYMBOLS: Record<string, string> = {
  // Greek
  α: "\\alpha", β: "\\beta", γ: "\\gamma", δ: "\\delta", ε: "\\varepsilon", ϵ: "\\epsilon", ζ: "\\zeta", η: "\\eta", θ: "\\theta", ϑ: "\\vartheta",
  ι: "\\iota", κ: "\\kappa", λ: "\\lambda", μ: "\\mu", ν: "\\nu", ξ: "\\xi", π: "\\pi", ϖ: "\\varpi", ρ: "\\rho", ϱ: "\\varrho", σ: "\\sigma",
  ς: "\\varsigma", τ: "\\tau", υ: "\\upsilon", φ: "\\varphi", ϕ: "\\phi", χ: "\\chi", ψ: "\\psi", ω: "\\omega",
  Γ: "\\Gamma", Δ: "\\Delta", Θ: "\\Theta", Λ: "\\Lambda", Ξ: "\\Xi", Π: "\\Pi", Σ: "\\Sigma", Υ: "\\Upsilon", Φ: "\\Phi", Ψ: "\\Psi", Ω: "\\Omega",
  // Operators and relations
  "±": "\\pm", "∓": "\\mp", "×": "\\times", "÷": "\\div", "·": "\\cdot", "⋅": "\\cdot", "∗": "\\ast", "∘": "\\circ", "•": "\\bullet",
  "≤": "\\leq", "≥": "\\geq", "≠": "\\neq", "≈": "\\approx", "≡": "\\equiv", "≃": "\\simeq", "≅": "\\cong", "∼": "\\sim", "∝": "\\propto",
  "≪": "\\ll", "≫": "\\gg", "≺": "\\prec", "≻": "\\succ", "⊥": "\\perp", "∥": "\\parallel", "∣": "\\mid",
  "→": "\\to", "←": "\\leftarrow", "↔": "\\leftrightarrow", "⇒": "\\Rightarrow", "⇐": "\\Leftarrow", "⇔": "\\Leftrightarrow", "↦": "\\mapsto",
  "⟶": "\\longrightarrow", "⟹": "\\Longrightarrow", "⟺": "\\Longleftrightarrow", "↑": "\\uparrow", "↓": "\\downarrow",
  "∈": "\\in", "∉": "\\notin", "∋": "\\ni", "⊂": "\\subset", "⊃": "\\supset", "⊆": "\\subseteq", "⊇": "\\supseteq", "⊄": "\\not\\subset",
  "∪": "\\cup", "∩": "\\cap", "∖": "\\setminus", "∅": "\\emptyset", "∀": "\\forall", "∃": "\\exists", "∄": "\\nexists", "¬": "\\neg",
  "∧": "\\wedge", "∨": "\\vee", "⊕": "\\oplus", "⊗": "\\otimes", "⊙": "\\odot",
  "∞": "\\infty", "∂": "\\partial", "∇": "\\nabla", "ℏ": "\\hbar", "ℓ": "\\ell", "ℜ": "\\Re", "ℑ": "\\Im", "ℵ": "\\aleph", "℘": "\\wp",
  "…": "\\ldots", "⋯": "\\cdots", "⋮": "\\vdots", "⋱": "\\ddots", "′": "'", "″": "''", "°": "^\\circ",
  "⟨": "\\langle", "⟩": "\\rangle", "‖": "\\|", "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil", "⌉": "\\rceil",
  "∑": "\\sum", "∏": "\\prod", "∐": "\\coprod", "∫": "\\int", "∬": "\\iint", "∭": "\\iiint", "∮": "\\oint", "⋃": "\\bigcup", "⋂": "\\bigcap",
  "√": "\\surd", "−": "-", "∶": ":", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℝ": "\\mathbb{R}", "ℂ": "\\mathbb{C}",
  "{": "\\{", "}": "\\}", "%": "\\%", "#": "\\#", "&": "\\&", "$": "\\$", "_": "\\_",
  // Invisible operators (function application, times, separator, plus).
  "⁡": "", "⁢": "", "⁣": "", "⁤": "", "​": "",
};

const LARGE = new Set(["\\sum", "\\prod", "\\coprod", "\\int", "\\iint", "\\iiint", "\\oint", "\\bigcup", "\\bigcap", "\\lim"]);

const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "coth", "exp", "log", "ln", "lg", "lim", "liminf", "limsup", "max", "min", "sup", "inf", "det", "dim", "ker", "deg", "gcd", "arg", "Pr", "hom"]);

/** Mathematical italic, bold… letters of Unicode back to plain ones (`𝑥` → `x`). */
function plainLetter(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x210e) return "h";
  if (code < 0x1d400 || code > 0x1d7ff) return ch;
  if (code >= 0x1d7ce) return String.fromCharCode(48 + ((code - 0x1d7ce) % 10));
  const k = (code - 0x1d400) % 52;
  return String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26);
}

/** A piece of text of a formula, written for LaTeX. */
function symbols(text: string): string {
  let out = "";
  for (const raw of text) {
    const ch = plainLetter(raw);
    const s = SYMBOLS[ch];
    out = join(out, s ?? (ch === " " ? "~" : ch));
  }
  return out;
}

/** Two pieces put together, with the space a command needs before a letter. */
function join(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  // A script of one character before a letter reads better apart (`^n x`).
  return (/\\[a-zA-Z]+$/.test(a) || /[_^][a-zA-Z0-9]$/.test(a)) && /^[a-zA-Z0-9]/.test(b) ? `${a} ${b}` : a + b;
}

function group(s: string): string {
  return s.length === 1 || /^\\[a-zA-Z]+$/.test(s) ? s : `{${s}}`;
}

// ------------------------------------------------------------ MathML

function elements(n: MNode): MNode[] {
  return n.children.filter((c) => c.tag !== "#text" && c.tag !== "#comment" && c.tag !== "#marker");
}

/** The LaTeX of a MathML element. */
function fromMathml(n: MNode): string {
  const tag = localName(n.tag);
  const kids = elements(n);
  const all = () => kids.map(fromMathml).reduce(join, "");
  switch (tag) {
    case "math":
    case "mrow":
    case "mstyle":
    case "mpadded":
    case "merror":
    case "menclose":
      return all();
    case "semantics":
      return kids.length ? fromMathml(kids[0]) : "";
    case "annotation":
    case "annotation-xml":
    case "mphantom":
    case "none":
    case "mprescripts":
      return "";
    case "mi": {
      const text = textOf(n).trim();
      const variant = n.attrs.mathvariant;
      if (FUNCTIONS.has(text)) return `\\${text}`;
      const base = text.length > 1 && /^[a-zA-Z]+$/.test(text) ? `\\mathrm{${text}}` : symbols(text);
      if (variant === "bold" || variant === "bold-italic") return `\\mathbf{${base}}`;
      if (variant === "double-struck") return `\\mathbb{${base}}`;
      if (variant === "script" || variant === "bold-script") return `\\mathcal{${base}}`;
      if (variant === "fraktur") return `\\mathfrak{${base}}`;
      if (variant === "normal" && text.length === 1 && /[a-zA-Z]/.test(text)) return `\\mathrm{${base}}`;
      return base;
    }
    case "mn":
      return symbols(textOf(n).trim());
    case "mo": {
      const text = textOf(n).trim();
      if (FUNCTIONS.has(text)) return `\\${text}`;
      return symbols(text);
    }
    case "mtext": {
      const text = textOf(n);
      return text.trim() ? `\\text{${text.replace(/[{}\\]/g, "")}}` : "\\ ";
    }
    case "ms":
      return `\\text{"${textOf(n)}"}`;
    case "mspace": {
      const width = parseFloat(n.attrs.width ?? "0");
      return width >= 0.9 ? "\\quad" : width > 0.2 ? "\\," : "";
    }
    case "msup":
      return `${group(fromMathml(kids[0] ?? n))}^${group(fromMathml(kids[1] ?? n))}`;
    case "msub":
      return `${group(fromMathml(kids[0] ?? n))}_${group(fromMathml(kids[1] ?? n))}`;
    case "msubsup":
      return `${group(fromMathml(kids[0] ?? n))}_${group(fromMathml(kids[1] ?? n))}^${group(fromMathml(kids[2] ?? n))}`;
    case "mfrac": {
      const [a, b] = kids.map(fromMathml);
      return n.attrs.linethickness === "0" || n.attrs.linethickness === "0px" ? `\\binom{${a}}{${b}}` : `\\frac{${a}}{${b}}`;
    }
    case "msqrt":
      return `\\sqrt{${all()}}`;
    case "mroot":
      return `\\sqrt[${fromMathml(kids[1] ?? n)}]{${fromMathml(kids[0] ?? n)}}`;
    case "mover":
    case "munder":
    case "munderover":
      return underOver(tag, kids.map(fromMathml), n.attrs);
    case "mfenced": {
      const open = n.attrs.open ?? "(";
      const close = n.attrs.close ?? ")";
      const sep = n.attrs.separators ?? ",";
      return `\\left${fence(open)} ${kids.map(fromMathml).join(`${sep.trim()[0] ?? ","} `)} \\right${fence(close)}`;
    }
    case "mtable":
      return `\\begin{matrix}\n${kids.map((row) => elements(row).map((cell) => fromMathml(cell)).join(" & ")).join(" \\\\\n")}\n\\end{matrix}`;
    case "mtr":
    case "mlabeledtr":
    case "mtd":
      return all();
    case "mmultiscripts": {
      const base = fromMathml(kids[0] ?? n);
      return `${group(base)}_${group(kids[1] ? fromMathml(kids[1]) : "")}^${group(kids[2] ? fromMathml(kids[2]) : "")}`;
    }
    default:
      return n.tag === "#text" ? symbols(n.text.trim()) : all();
  }
}

function fence(ch: string): string {
  if (!ch) return ".";
  const s = SYMBOLS[ch];
  return s && s !== "-" ? s : ch;
}

const ACCENTS: Record<string, string> = {
  "^": "\\hat", ˆ: "\\hat", "̂": "\\hat", "~": "\\tilde", "˜": "\\tilde", "̃": "\\tilde", "¯": "\\bar", "̄": "\\bar",
  "̅": "\\overline", "‾": "\\overline", "→": "\\vec", "⃗": "\\vec", "˙": "\\dot", "̇": "\\dot", "¨": "\\ddot",
  "̈": "\\ddot", "⏞": "\\overbrace", "⏟": "\\underbrace", "_": "\\underline", "̲": "\\underline", "←": "\\overleftarrow",
};

function underOver(tag: string, parts: string[], attrs: Record<string, string>): string {
  const [base = "", first = "", second = ""] = parts;
  const raw = (s: string) => s.replace(/^\\?/, "");
  if (LARGE.has(base) || base === "\\lim") {
    if (tag === "mover") return `${base}^${group(first)}`;
    if (tag === "munder") return `${base}_${group(first)}`;
    return `${base}_${group(first)}^${group(second)}`;
  }
  // An arrow over a letter is a vector (`→` is already written `\to`).
  const accent = ACCENTS[first] ?? ACCENTS[raw(first)] ?? (first === "\\to" ? "\\vec" : undefined);
  if (tag === "mover" && (accent || attrs.accent === "true")) return `${accent ?? "\\overset{" + first + "}"}{${base}}`;
  if (tag === "munder" && (first === "_" || first === "⏟" || ACCENTS[first] === "\\underbrace" || ACCENTS[first] === "\\underline")) {
    return `${ACCENTS[first]}{${base}}`;
  }
  if (tag === "mover") return `\\overset{${first}}{${base}}`;
  if (tag === "munder") return `\\underset{${first}}{${base}}`;
  return `\\overset{${second}}{\\underset{${first}}{${base}}}`;
}

/** The TeX a formula carries with it, when it does. */
function annotation(math: MNode): string | null {
  for (const a of findAll(math, ["annotation"])) {
    const encoding = (a.attrs.encoding ?? "").toLowerCase();
    if (encoding.includes("tex")) {
      const tex = textOf(a).trim();
      // `{\displaystyle …}` of Wikipedia: the formula itself.
      const m = /^\{\\displaystyle\s*([\s\S]*)\}$/.exec(tex);
      return (m ? m[1] : tex).trim();
    }
  }
  return null;
}

/** A MathML formula (`<math>`, with or without a namespace) into LaTeX. */
export function mathmlToLatex(math: MNode): Formula {
  const display = math.attrs.display === "block" || math.attrs.mode === "display";
  const tex = annotation(math);
  return { latex: tidy(tex ?? fromMathml(math)), display };
}

// ------------------------------------------------------------ OMML (Word)

function child(n: MNode, name: string): MNode | undefined {
  return n.children.find((c) => localName(c.tag) === name);
}

/** The value of a property of Word (`<m:chr m:val="∑"/>`). */
function prop(n: MNode | undefined, ...path: string[]): string | null {
  let at = n;
  for (const p of path) at = at && child(at, p);
  if (!at) return null;
  return at.attrs["m:val"] ?? at.attrs.val ?? "";
}

function omml(n: MNode | undefined): string {
  if (!n) return "";
  const tag = localName(n.tag);
  const kids = elements(n);
  const all = () => kids.map(omml).reduce(join, "");
  const e = () => omml(child(n, "e"));
  switch (tag) {
    case "omathpara":
      return kids.filter((k) => localName(k.tag) === "omath").map(omml).join(" \\\\\n");
    case "omath":
    case "e":
    case "num":
    case "den":
    case "sub":
    case "sup":
    case "deg":
    case "lim":
    case "fname":
    case "box":
      return all();
    case "r": {
      const text = kids.filter((k) => localName(k.tag) === "t").map(textOf).join("");
      // Text written as text in the equation (`m:nor`), and words.
      const normal = prop(child(n, "rpr"), "nor") !== null;
      if (normal && text.trim()) return `\\text{${text}}`;
      const word = text.trim();
      if (FUNCTIONS.has(word)) return `\\${word}`;
      if (word.length > 1 && /^[a-zA-Z]+$/.test(word) && prop(child(n, "rpr"), "sty") === "p") return `\\mathrm{${word}}`;
      return symbols(text.replace(/ /g, ""));
    }
    case "t":
      return symbols(textOf(n));
    case "f": {
      const type = prop(child(n, "fpr"), "type");
      const num = omml(child(n, "num"));
      const den = omml(child(n, "den"));
      if (type === "noBar") return `\\binom{${num}}{${den}}`;
      if (type === "lin") return `${group(num)}/${group(den)}`;
      return `\\frac{${num}}{${den}}`;
    }
    case "ssup":
      return `${group(e())}^${group(omml(child(n, "sup")))}`;
    case "ssub":
      return `${group(e())}_${group(omml(child(n, "sub")))}`;
    case "ssubsup":
      return `${group(e())}_${group(omml(child(n, "sub")))}^${group(omml(child(n, "sup")))}`;
    case "spre":
      return `{}_${group(omml(child(n, "sub")))}^${group(omml(child(n, "sup")))}${group(e())}`;
    case "rad": {
      const hidden = prop(child(n, "radpr"), "deghide");
      const deg = omml(child(n, "deg"));
      return hidden === "1" || hidden === "on" || !deg ? `\\sqrt{${e()}}` : `\\sqrt[${deg}]{${e()}}`;
    }
    case "nary": {
      const pr = child(n, "narypr");
      const chr = prop(pr, "chr") || "∫";
      const op = SYMBOLS[chr] ?? chr;
      const sub = prop(pr, "subhide") === "1" ? "" : omml(child(n, "sub"));
      const sup = prop(pr, "suphide") === "1" ? "" : omml(child(n, "sup"));
      return join(`${op}${sub ? `_${group(sub)}` : ""}${sup ? `^${group(sup)}` : ""}`, e());
    }
    case "d": {
      const pr = child(n, "dpr");
      const beg = prop(pr, "begchr");
      const end = prop(pr, "endchr");
      const sep = prop(pr, "sepchr") ?? "|";
      const inner = kids.filter((k) => localName(k.tag) === "e").map(omml).join(` ${symbols(sep)} `);
      return `\\left${fence(beg ?? "(")} ${inner} \\right${fence(end ?? ")")}`;
    }
    case "m":
      return `\\begin{matrix}\n${kids
        .filter((k) => localName(k.tag) === "mr")
        .map((row) => elements(row).filter((c) => localName(c.tag) === "e").map(omml).join(" & "))
        .join(" \\\\\n")}\n\\end{matrix}`;
    case "func":
      return join(omml(child(n, "fname")), group(e()));
    case "acc": {
      const chr = prop(child(n, "accpr"), "chr") || "̂";
      return `${ACCENTS[chr] ?? "\\hat"}{${e()}}`;
    }
    case "bar":
      return `${prop(child(n, "barpr"), "pos") === "bot" ? "\\underline" : "\\overline"}{${e()}}`;
    case "groupchr": {
      const pr = child(n, "groupchrpr");
      const chr = prop(pr, "chr") || "⏟";
      return `${chr === "⏞" ? "\\overbrace" : "\\underbrace"}{${e()}}`;
    }
    case "limlow": {
      const base = e();
      const lim = omml(child(n, "lim"));
      return base === "\\lim" || LARGE.has(base) ? `${base}_${group(lim)}` : `\\underset{${lim}}{${base}}`;
    }
    case "limupp":
      return `\\overset{${omml(child(n, "lim"))}}{${e()}}`;
    case "eqarr":
      return `\\begin{aligned}\n${kids
        .filter((k) => localName(k.tag) === "e")
        .map(omml)
        .join(" \\\\\n")}\n\\end{aligned}`;
    case "borderbox":
      return `\\boxed{${e()}}`;
    case "rpr":
    case "ctrlpr":
    case "fpr":
    case "radpr":
    case "narypr":
    case "dpr":
    case "accpr":
    case "barpr":
    case "funcpr":
    case "mpr":
    case "ssuppr":
    case "ssubpr":
    case "ssubsuppr":
    case "limlowpr":
    case "limupppr":
    case "groupchrpr":
    case "eqarrpr":
    case "boxpr":
    case "borderboxpr":
    case "omathparapr":
    case "sprepr":
      return "";
    default:
      // Word's run properties (`w:rPr`) and the like say nothing of the formula.
      return n.tag.startsWith("w:") ? "" : all();
  }
}

/** An equation of Word (`<m:oMath>` or `<m:oMathPara>`) into LaTeX. */
export function ommlToLatex(math: MNode): Formula {
  return { latex: tidy(omml(math)), display: localName(math.tag) === "omathpara" };
}

/** A formula written cleanly: spaces gathered, braces of a lone letter dropped. */
function tidy(latex: string): string {
  return latex
    .replace(/[ \t]+/g, " ")
    .replace(/\{([a-zA-Z0-9])\}(?=[_^])/g, "$1")
    .trim();
}

/** Every formula of a piece of markup, in order: MathML, then Word's (inside its comments too). */
export function formulasIn(root: MNode): MNode[] {
  return findAll(root, ["math", "omathpara", "omath"]).filter((m, _i, all) => {
    // An `oMath` inside an `oMathPara` is part of it.
    if (localName(m.tag) !== "omath") return true;
    return !all.some((p) => localName(p.tag) === "omathpara" && p !== m && findAll(p, ["omath"]).includes(m));
  });
}
