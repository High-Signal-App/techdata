import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const EXPORT_SHA256 = "e1d25bc8c46fe0e92c68b51a107702d12c3da87b738cbfdfa8c7cd84424cd006";

/** Uses the already pinned WASM dependency; no native DuckDB installation needed. */
export async function summarizeParquet(path) {
  const require = createRequire(import.meta.url);
  const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
  const db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm") },
      eh: { mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm") },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate();
  const bytes = readFileSync(path);
  db.registerFileBuffer("ph.parquet", bytes);
  const conn = db.connect();
  const rows = (sql) =>
    conn
      .query(sql)
      .toArray()
      .map((row) => row.toJSON());
  try {
    conn.query("CREATE VIEW ph_products AS SELECT * FROM read_parquet('ph.parquet')");
    const totals = rows(
      "SELECT count(*) AS total, count(*) FILTER (WHERE len(categories) > 0) AS withCategories FROM ph_products",
    )[0];
    return {
      version: 1,
      sort: "name:asc",
      total: Number(totals.total),
      withCategories: Number(totals.withCategories),
      rows: rows(
        "SELECT slug, name, tagline, website_url, categories, producthunt_url FROM ph_products ORDER BY lower(strip_accents(name)) ASC NULLS LAST, slug ASC LIMIT 100",
      ).map((row) => ({ ...row, description: null, categories: row.categories ? Array.from(row.categories) : [] })),
      categories: rows(
        "SELECT value, count(*) AS count FROM (SELECT DISTINCT slug, unnest(categories) AS value FROM ph_products) GROUP BY value ORDER BY count DESC, value ASC",
      ).map(({ value, count }) => ({ value, count: Number(count) })),
      websites: rows(
        "SELECT CASE WHEN coalesce(trim(website_url), '') <> '' THEN 'yes' ELSE 'no' END AS value, count(*) AS count FROM ph_products GROUP BY value ORDER BY count DESC, value ASC",
      ).map(({ value, count }) => ({ value, count: Number(count) })),
      provenance: {
        source: "Product Hunt",
        sourceUrl: "https://www.producthunt.com/",
        via: "ph-catalog Parquet · precomputed first pages",
        viaUrl: "/api/files/ph/producthunt-full.parquet",
        collectedAt: null,
        revision: "catalog-state-2026-10-10",
        exportedAt: "2026-10-10",
        releaseUrl: "https://github.com/Significant-Hobbies/ph-catalog/releases/tag/catalog-state",
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    };
  } finally {
    conn.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output = "public/data/ph/summary.json"] = process.argv.slice(2);
  if (!input) throw new Error("Usage: node scripts/ph-summary.mjs <producthunt-full.parquet> [output.json]");
  const summary = await summarizeParquet(input);
  if (summary.provenance.sha256 !== EXPORT_SHA256 || summary.total !== 575479 || summary.withCategories !== 93897) {
    throw new Error(
      "Export checksum/counts differ from catalog-state-2026-10-10; review the revision before regenerating.",
    );
  }
  const json = `${JSON.stringify(summary)}\n`;
  const gzipBytes = gzipSync(json).length;
  if (gzipBytes > 150 * 1024) throw new Error(`Summary exceeds gzip budget: ${gzipBytes}`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, json);
  console.log(
    `${summary.total} products; ${summary.rows.length} initial rows; ${Buffer.byteLength(json)} bytes; ${gzipBytes} gzip bytes`,
  );
}
