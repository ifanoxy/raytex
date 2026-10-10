// The bibliography panel: the rows of the form, the remarks of the list.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type BibItem, filled, formRows, matches, remarks, sourceOf, validKey } from "./bibliography.ts";

const item = (over: Partial<BibItem> = {}): BibItem => ({
  file: "/p/refs.bib",
  line: 1,
  key: "knuth1984",
  kind: "book",
  authors: "Knuth",
  year: "1984",
  title: "The TeXbook",
  venue: "Addison-Wesley",
  fields: [],
  cited: 2,
  sameKey: false,
  sameAs: null,
  ...over,
});

test("the form shows the fields of the kind, then what the entry has", () => {
  const rows = formRows("article", [
    { name: "title", value: "On {\\TeX}", raw: false },
    { name: "year", value: "1984", raw: true },
    { name: "keywords", value: "typography", raw: false },
  ]);
  assert.deepEqual(rows.main.map((f) => [f.name, f.value, f.raw]), [
    ["author", "", false],
    ["title", "On {\\TeX}", false],
    ["journal", "", false],
    ["year", "1984", true],
  ]);
  assert.deepEqual(rows.more.map((f) => f.name), ["volume", "number", "pages", "month", "doi", "url", "note", "keywords"]);
  // A kind the form does not know has the fields of `misc`.
  assert.deepEqual(formRows("software", []).main.map((f) => f.name), ["author", "title", "year"]);
});

test("only what is filled is written, a text typed over a number gets braces", () => {
  assert.deepEqual(
    filled([
      { name: "Author", value: " Knuth, Donald ", raw: false },
      { name: "journal", value: "  ", raw: false },
      { name: "year", value: "1984", raw: true },
      { name: "month", value: "jan", raw: true },
      { name: "note", value: "to appear", raw: true },
    ]),
    [
      { name: "author", value: "Knuth, Donald", raw: false },
      { name: "year", value: "1984", raw: true },
      { name: "month", value: "jan", raw: true },
      { name: "note", value: "to appear", raw: false },
    ],
  );
});

test("the remarks of an entry", () => {
  assert.deepEqual(remarks(item(), false), []);
  assert.deepEqual(remarks(item({ cited: 0, sameKey: true, sameAs: "other" }), false), ["sameKey", "sameAs", "unused"]);
  // With \nocite{*}, an entry that is not cited is still printed.
  assert.deepEqual(remarks(item({ cited: 0 }), true), []);
});

test("the filter matches every word, anywhere", () => {
  assert.ok(matches(item(), "knuth 1984"));
  assert.ok(matches(item(), "TEXBOOK addison"));
  assert.ok(!matches(item(), "knuth 1986"));
  assert.ok(matches(item(), "  "));
});

test("what is pasted is recognised", () => {
  assert.equal(sourceOf("@article{a, title={T}}"), "bibtex");
  assert.equal(sourceOf("https://doi.org/10.1016/j.jcp.2019.108925"), "doi");
  assert.equal(sourceOf("10.1000/182"), "doi");
  assert.equal(sourceOf("arXiv:2301.01234v2"), "arxiv");
  assert.equal(sourceOf("https://arxiv.org/abs/1706.03762"), "arxiv");
  assert.equal(sourceOf("hep-th/9901001"), "arxiv");
  assert.equal(sourceOf("the TeXbook"), null);
  assert.equal(sourceOf(""), null);
});

test("keys", () => {
  assert.ok(validKey("knuth1984") && validKey("knuth:1984-a") && validKey(" spaced-around "));
  assert.ok(!validKey("two words") && !validKey("a,b") && !validKey("") && !validKey("a{b}"));
});
