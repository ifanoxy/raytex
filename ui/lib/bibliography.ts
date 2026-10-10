// The bibliography panel: what the engine says of the entries of a project
// (crates/raytex-core/src/bibliography.rs), the kinds of entries with the
// fields each one is made of, and what the list and the form show of them.

/** A field of an entry, as written in the file. */
export interface BibField {
  name: string;
  /** What stands between the braces; for a raw field, the expression itself. */
  value: string;
  /** Written without braces: a number, a macro (`jan`), pieces joined by `#`. */
  raw: boolean;
}

/** An entry of the bibliography of the project. */
export interface BibItem {
  file: string;
  /** Line of the entry in its file (1-based). */
  line: number;
  key: string;
  kind: string;
  authors: string;
  year: string;
  title: string;
  venue: string;
  fields: BibField[];
  /** Number of times the project cites it. */
  cited: number;
  /** Another entry has the same key. */
  sameKey: boolean;
  /** Key of an earlier entry that is the same work. */
  sameAs: string | null;
}

export interface Bibliography {
  files: string[];
  entries: BibItem[];
  /** `\nocite{*}`: every entry is printed, cited or not. */
  allCited: boolean;
}

/** An entry read from pasted or fetched BibTeX, or being written. */
export interface BibDraft {
  kind: string;
  key: string;
  fields: BibField[];
}

/** The kinds of entries the form offers: the fields in sight, and the others. */
export const KINDS: Record<string, { main: string[]; more: string[] }> = {
  article: { main: ["author", "title", "journal", "year"], more: ["volume", "number", "pages", "month", "doi", "url", "note"] },
  book: { main: ["author", "title", "publisher", "year"], more: ["editor", "edition", "volume", "series", "address", "isbn", "doi", "url", "note"] },
  inproceedings: { main: ["author", "title", "booktitle", "year"], more: ["editor", "pages", "publisher", "address", "month", "organization", "doi", "url", "note"] },
  incollection: { main: ["author", "title", "booktitle", "publisher", "year"], more: ["editor", "pages", "chapter", "edition", "address", "doi", "url", "note"] },
  phdthesis: { main: ["author", "title", "school", "year"], more: ["type", "address", "month", "url", "note"] },
  mastersthesis: { main: ["author", "title", "school", "year"], more: ["type", "address", "month", "url", "note"] },
  techreport: { main: ["author", "title", "institution", "year"], more: ["type", "number", "address", "month", "url", "note"] },
  online: { main: ["author", "title", "url", "year"], more: ["urldate", "organization", "note"] },
  misc: { main: ["author", "title", "year"], more: ["howpublished", "month", "eprint", "archiveprefix", "primaryclass", "doi", "url", "note"] },
  unpublished: { main: ["author", "title", "note"], more: ["year", "month", "url"] },
};

/** The fields of a kind (those of `misc` for a kind the form does not know). */
export const fieldsOf = (kind: string) => KINDS[kind.toLowerCase()] ?? KINDS.misc;

/**
 * The rows of the form for an entry of `kind`: the main fields first, then
 * the others, those of the kind and those the entry already has. What is
 * written in the entry is kept as it is.
 */
export function formRows(kind: string, fields: BibField[]): { main: BibField[]; more: BibField[] } {
  const { main, more } = fieldsOf(kind);
  const has = new Map(fields.map((f) => [f.name.toLowerCase(), f]));
  const row = (name: string): BibField => ({ ...(has.get(name) ?? { name, value: "", raw: false }), name });
  const extra = fields.map((f) => f.name.toLowerCase()).filter((n) => !main.includes(n) && !more.includes(n));
  return { main: main.map(row), more: [...more, ...extra].map(row) };
}

/** The fields of the form that hold something, as the entry will have them. */
export function filled(rows: BibField[]): BibField[] {
  return rows
    .filter((f) => f.name.trim() && f.value.trim())
    .map((f) => {
      const value = f.value.trim();
      // A number or a macro stays as it was written; a text typed over it gets its braces.
      const raw = f.raw && /^[\w.:#" -]+$/.test(value) && !/\s/.test(value.replace(/"[^"]*"/g, "").replace(/\s*#\s*/g, "#"));
      return { name: f.name.trim().toLowerCase(), value, raw };
    });
}

/** What is wrong with an entry, the most serious first. */
export type BibRemark = "sameKey" | "sameAs" | "unused";

export function remarks(e: BibItem, allCited: boolean): BibRemark[] {
  const out: BibRemark[] = [];
  if (e.sameKey) out.push("sameKey");
  if (e.sameAs) out.push("sameAs");
  if (!e.cited && !allCited) out.push("unused");
  return out;
}

/** Whether an entry matches what is typed in the filter (every word, anywhere). */
export function matches(e: BibItem, query: string): boolean {
  const text = `${e.key} ${e.title} ${e.authors} ${e.year} ${e.venue} ${e.kind}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/** What a pasted text is: BibTeX, a DOI, or an arXiv identifier. */
export function sourceOf(text: string): "bibtex" | "doi" | "arxiv" | null {
  const s = text.trim();
  if (!s) return null;
  if (s.startsWith("@")) return "bibtex";
  if (/\b10\.\d{4,9}(\.\d+)*\/\S+/.test(s)) return "doi";
  if (/(^|[:/\s])(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?(\.pdf)?$/i.test(s)) return "arxiv";
  return null;
}

/** A key that can be written in a `.bib` file and in `\cite{…}`. */
export const validKey = (key: string) => /^[^\s,{}"#%\\]+$/.test(key.trim());
