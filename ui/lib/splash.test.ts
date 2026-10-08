// The page of the application holds no style of its own: `npm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// A <style> element in index.html makes Tauri add a nonce to the style
// policy of the installed application, and a policy with a nonce refuses
// every inline style: panel sizes, formula previews, menus (0.4.0). The
// launch screen is styled from ui/styles/splash.css.
test("index.html has no style element and no style attribute", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  assert.equal(/<style[\s>]/i.test(html), false, "a <style> element in index.html");
  assert.equal(/\sstyle\s*=/i.test(html), false, "a style attribute in index.html");
  assert.equal(/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), false, "an inline script in index.html");
  assert.ok(html.includes('href="/ui/styles/splash.css"'));
});
