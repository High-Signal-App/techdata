import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url),
  astro = createRequire(require.resolve("astro/package.json"));
const { build } = astro("esbuild");
const root = new URL("../", import.meta.url),
  generated = new URL("src/generated/", root);
if (process.argv.includes("--if-missing")) {
  try {
    await Promise.all(["public-build.mjs", "public-markdown.json"].map((name) => access(new URL(name, generated))));
    process.exit(0);
  } catch {}
}
await mkdir(new URL(".astro/", root), { recursive: true });
await mkdir(generated, { recursive: true });
const outfile = fileURLToPath(new URL(".astro/public-readability-build.mjs", root));
await build({
  entryPoints: [fileURLToPath(new URL("scripts/public-build-entry.ts", root))],
  outfile,
  bundle: true,
  banner: {
    js: 'import {createRequire as createBundleRequire} from "node:module";const require=createBundleRequire(import.meta.url);',
  },
  platform: "node",
  format: "esm",
  jsx: "automatic",
  external: ["react", "react/*", "react-dom", "react-dom/*", "@duckdb/duckdb-wasm"],
  logLevel: "warning",
});
const { capturePublicBuild, buildPublicMarkdown, NOMAD_SNAPSHOT } = await import(pathToFileURL(outfile));
const parserPackage = astro.resolve("ultrahtml/package.json");
const { parse, TEXT_NODE, COMMENT_NODE } = await import(new URL("./dist/index.js", pathToFileURL(parserPackage)));
const { unescape: decodeEntities } = astro("html-escaper");
let source = await readFile(new URL("src/pages/nomad/notes.astro", root), "utf8");
source = source.match(/<article\b[\s\S]*?<\/article>/)?.[0];
assert.ok(source, "Authored notes article required");
source = source
  .replace(/\{NOMAD_SNAPSHOT\.(records|explorable)\.toLocaleString\("en-US"\)\}/g, (_, key) =>
    NOMAD_SNAPSHOT[key].toLocaleString("en-US"),
  )
  .replaceAll("{NOMAD_SNAPSHOT.file}", JSON.stringify(NOMAD_SNAPSHOT.file));
assert.ok(!/[{}]/.test(source), "Unmapped source expression in authored notes");
const normalize = (text) => decodeEntities(text).replace(/\s+/g, " ").trim();
function render(node) {
  if (node.type === TEXT_NODE) return decodeEntities(node.value).replace(/\s+/g, " ");
  if (node.type === COMMENT_NODE) return "";
  const body = (node.children || []).map(render).join("");
  if (node.name === "a") return `[${normalize(body)}](${node.attributes.href})`;
  if (node.name === "h2") return `\n\n## ${normalize(body)}\n\n`;
  if (["p", "article", "section"].includes(node.name)) return `\n\n${body.trim()}\n\n`;
  return body;
}
const notes =
  render(parse(source)).trim() +
  `\n\nRecords: ${NOMAD_SNAPSHOT.records} · places shown: ${NOMAD_SNAPSHOT.explorable} · countries & territories: ${NOMAD_SNAPSHOT.countries} · metrics compared: ${NOMAD_SNAPSHOT.metrics}\n\nPublished 13 Sep 2026 (${NOMAD_SNAPSHOT.sourceCommit})\n\nSHA256 ${NOMAD_SNAPSHOT.sha256}\n`;
const snapshot = await capturePublicBuild();
const documents = buildPublicMarkdown(snapshot, notes);
await writeFile(new URL("public-build.mjs", generated), `export default ${JSON.stringify(snapshot)};\n`);
await writeFile(new URL("public-markdown.json", generated), JSON.stringify(documents, null, 2) + "\n");
console.log(
  `Captured ${Object.keys(documents).length} static public documents at ${snapshot.capturedAt}; Reddit remains request-time and uncached.`,
);
