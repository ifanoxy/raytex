// The folder the pictures of a project are copied into.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pictureFolder } from "./pictures.ts";

test("the folder a project keeps its pictures in", () => {
  assert.equal(pictureFolder(["chapitres", "Images", "build"], []), "Images");
  assert.equal(pictureFolder(["chapitres", "img", "figures"], ["media/"]), "img");
  // No folder of a usual name: the one the document reads its pictures from.
  assert.equal(pictureFolder(["chapitres"], ["media/", "autres/"]), "media");
  assert.equal(pictureFolder(["chapitres"], []), "figures");
  assert.equal(pictureFolder([], []), "figures");
});
