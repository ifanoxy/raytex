// Tests of the calls made in order: `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { inOrder, pending } from "./order.ts";

const later = <T>(ms: number, value: T, fail = false) =>
  new Promise<T>((resolve, reject) => setTimeout(() => (fail ? reject(new Error(String(value))) : resolve(value)), ms));

test("calls of a key reach their end in the order they were made", async () => {
  const ended: string[] = [];
  // The first is the slowest: alone, it would end last.
  const a = inOrder("settings", () => later(40, "a").then((v) => (ended.push(v), v)));
  const b = inOrder("settings", () => later(1, "b").then((v) => (ended.push(v), v)));
  const c = inOrder("settings", () => later(5, "c").then((v) => (ended.push(v), v)));
  assert.deepEqual(await Promise.all([a, b, c]), ["a", "b", "c"]);
  assert.deepEqual(ended, ["a", "b", "c"]);
});

test("a call that fails does not stop the next ones, and says it failed", async () => {
  const a = inOrder("file:x", () => later(5, "a", true));
  const b = inOrder("file:x", () => later(1, "b"));
  await assert.rejects(a, /a/);
  assert.equal(await b, "b");
});

test("other keys do not wait", async () => {
  const ended: string[] = [];
  const slow = inOrder("file:slow", () => later(30, "slow").then((v) => (ended.push(v), v)));
  const quick = inOrder("file:quick", () => later(1, "quick").then((v) => (ended.push(v), v)));
  await Promise.all([slow, quick]);
  assert.deepEqual(ended, ["quick", "slow"]);
});

test("nothing is kept once the calls are over", async () => {
  await inOrder("open-files", () => later(1, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pending("open-files"), false);
});
