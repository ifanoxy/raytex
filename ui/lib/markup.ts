// A small, tolerant reader of HTML and XML as they come on the clipboard
// (Word, Google Docs, LibreOffice, web pages): a tree of elements, texts and
// comments. It never throws: what it cannot read is taken as text. No local
// imports: tested directly by Node (`npm test`).

export interface MNode {
  /** Lower-case tag name, `#text` or `#comment`; a namespace stays (`m:omath`). */
  tag: string;
  attrs: Record<string, string>;
  children: MNode[];
  /** Text of a text node or of a comment. */
  text: string;
}

const VOID = new Set(["br", "img", "hr", "meta", "link", "input", "col", "area", "base", "wbr", "source", "param", "embed", "track"]);
const RAW = new Set(["script", "style", "title", "xml"]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ugrave: "ù",
  ucirc: "û",
  icirc: "î",
  ocirc: "ô",
  euml: "ë",
  iuml: "ï",
  Eacute: "É",
  Agrave: "À",
  Ccedil: "Ç",
  deg: "°",
  times: "×",
  divide: "÷",
  plusmn: "±",
  middot: "·",
  euro: "€",
  copy: "©",
  reg: "®",
  shy: "",
  zwnj: "",
  zwj: "",
};

/** Text with its entities read (`&eacute;`, `&#233;`, `&#xE9;`). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? all;
  });
}

function node(tag: string, attrs: Record<string, string> = {}, text = ""): MNode {
  return { tag, attrs, children: [], text };
}

const BLOCKS = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "blockquote", "pre", "hr"]);

/** HTML leaves some elements open: a new paragraph, item or cell closes the one before. */
function closeImplied(stack: MNode[], tag: string) {
  const tags = stack.map((n) => n.tag);
  const closeTo = (name: string, containers: string[]) => {
    const at = tags.lastIndexOf(name);
    const container = Math.max(...containers.map((c) => tags.lastIndexOf(c)));
    if (at > 0 && at > container) stack.length = at;
  };
  if (tag === "p" || BLOCKS.has(tag)) closeTo("p", ["div", "td", "th", "li", "blockquote"]);
  if (tag === "li") closeTo("li", ["ul", "ol"]);
  if (tag === "td" || tag === "th") {
    closeTo("td", ["tr", "table"]);
    closeTo("th", ["tr", "table"]);
  }
  if (tag === "tr") closeTo("tr", ["table", "tbody", "thead", "tfoot"]);
}

/** Reads `src` into a tree whose root is a `#root` element. */
export function parseMarkup(src: string): MNode {
  const root = node("#root");
  const stack: MNode[] = [root];
  const top = () => stack[stack.length - 1];
  const addText = (text: string) => {
    if (!text) return;
    top().children.push(node("#text", {}, decodeEntities(text)));
  };
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      addText(src.slice(i));
      break;
    }
    addText(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      const stop = end < 0 ? src.length : end;
      top().children.push(node("#comment", {}, src.slice(lt + 4, stop)));
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt);
      addText(src.slice(lt + 9, end < 0 ? src.length : end));
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    // Word's markers that are not comments: `<![if !supportLists]>`, `<![endif]>`.
    if (src.startsWith("<![", lt)) {
      const end = src.indexOf("]>", lt);
      const what = src.slice(lt + 3, end < 0 ? src.length : end).trim();
      top().children.push(node("#marker", {}, what));
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (src.startsWith("<!", lt) || src.startsWith("<?", lt)) {
      const end = src.indexOf(">", lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (src.startsWith("</", lt)) {
      const end = src.indexOf(">", lt);
      const name = src.slice(lt + 2, end < 0 ? src.length : end).trim().toLowerCase();
      i = end < 0 ? src.length : end + 1;
      // Up to the element it closes; a closing tag that closes nothing is left.
      const at = stack.map((n) => n.tag).lastIndexOf(name);
      if (at > 0) stack.length = at;
      continue;
    }
    const m = /^<([a-zA-Z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*)\s*(\/?)>/.exec(src.slice(lt, lt + 4000));
    if (!m) {
      addText("<");
      i = lt + 1;
      continue;
    }
    const tag = m[1].toLowerCase();
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/g)) {
      const value = a[2] ?? "";
      attrs[a[1].toLowerCase()] = decodeEntities(/^["']/.test(value) ? value.slice(1, -1) : value);
    }
    i = lt + m[0].length;
    closeImplied(stack, tag);
    const el = node(tag, attrs);
    top().children.push(el);
    if (RAW.has(tag)) {
      const end = src.toLowerCase().indexOf(`</${tag}`, i);
      i = end < 0 ? src.length : src.indexOf(">", end) + 1 || src.length;
      continue;
    }
    // An open paragraph or item ends where the next one starts (HTML leaves them open).
    if (!m[3] && !VOID.has(tag)) stack.push(el);
  }
  return root;
}

/** The text of a node and of all it holds. */
export function textOf(n: MNode): string {
  if (n.tag === "#text") return n.text;
  if (n.tag === "#comment" || n.tag === "#marker") return "";
  return n.children.map(textOf).join("");
}

/** Elements under `n` (itself first) whose tag, its namespace aside, is one of `names`. */
export function findAll(n: MNode, names: string[], out: MNode[] = []): MNode[] {
  if (names.includes(localName(n.tag))) out.push(n);
  for (const c of n.children) findAll(c, names, out);
  return out;
}

/** A tag without its namespace (`m:omath` → `omath`). */
export function localName(tag: string): string {
  const at = tag.indexOf(":");
  return at < 0 ? tag : tag.slice(at + 1);
}

/** The value of `name` in an inline style (`font-weight:bold;…`). */
export function styleOf(n: MNode, name: string): string | null {
  const style = n.attrs.style;
  if (!style) return null;
  for (const part of style.split(";")) {
    const at = part.indexOf(":");
    if (at > 0 && part.slice(0, at).trim().toLowerCase() === name) return part.slice(at + 1).trim().toLowerCase();
  }
  return null;
}
