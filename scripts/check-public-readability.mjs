import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const documents = JSON.parse(await readFile(new URL("../src/generated/public-markdown.json", import.meta.url), "utf8"));
for (const path of [...Object.keys(documents), "/reddit/"]) {
  const html = await readFile(new URL(`../dist/client${path}index.html`, import.meta.url), "utf8");
  assert.match(html, /<main\b/, `${path}: prerendered main content missing`);
  assert.ok(
    html.includes('name="ai-summary"') && html.includes('type="text/markdown"'),
    `${path}: discovery metadata missing`,
  );
}
console.log("Verified nonempty prerendered public pages and their discovery metadata.");
