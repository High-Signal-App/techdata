import type { SearchHit } from "../types";
import { PH_DATA_URL, PH_META, phProvenance } from "./meta";

export type Product = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website_url: string | null;
  categories: string[];
  producthunt_url: string | null;
};
export type PhFilters = { q?: string; categories?: string[]; website?: string[] };
export type PhSort = { id: string; desc: boolean };
export type Sql = { text: string; params: (string | number)[] };
const fields = "slug, name, tagline, description, website_url, categories, producthunt_url";
const website = "coalesce(trim(website_url), '') <> ''";
const sortColumns: Record<string, string> = {
  name: "lower(strip_accents(name))",
  tagline: "lower(strip_accents(tagline))",
  categories: "array_to_string(categories, ', ')",
  website_url: "lower(regexp_extract(website_url, '^https?://([^/]+)', 1))",
};

export function whereSql(filters: PhFilters, except?: string): Sql {
  const clauses: string[] = [];
  const params: Sql["params"] = [];
  for (const term of filters.q?.trim().split(/\s+/).filter(Boolean) ?? []) {
    clauses.push("contains(lower(strip_accents(concat_ws(' ', name, tagline, description))), lower(strip_accents(?)))");
    params.push(term);
  }
  if (except !== "category" && filters.categories?.length) {
    clauses.push(`(${filters.categories.map(() => "list_contains(categories, ?)").join(" OR ")})`);
    params.push(...filters.categories);
  }
  const wants = filters.website?.filter((v) => v === "yes" || v === "no") ?? [];
  if (except !== "website" && wants.length === 1) clauses.push(wants[0] === "yes" ? website : `NOT (${website})`);
  return { text: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

export function rowsSql(filters: PhFilters, sort: PhSort = { id: "name", desc: false }, page?: number): Sql {
  const where = whereSql(filters);
  const column = sortColumns[sort.id] ?? sortColumns.name;
  return {
    text: `SELECT ${fields} FROM ph_products${where.text} ORDER BY ${column} ${sort.desc ? "DESC" : "ASC"} NULLS LAST, slug ASC${page === undefined ? "" : " LIMIT ? OFFSET ?"}`,
    params: [
      ...where.params,
      ...(page === undefined ? [] : [50, Math.max(0, Math.trunc(Number.isFinite(page) ? page : 0)) * 50]),
    ],
  };
}
export function countSql(filters: PhFilters): Sql {
  const where = whereSql(filters);
  return { text: `SELECT count(*) AS count FROM ph_products${where.text}`, params: where.params };
}
export function facetSql(filters: PhFilters, facet: "category" | "website"): Sql {
  const where = whereSql(filters, facet);
  const from =
    facet === "category"
      ? `SELECT DISTINCT slug, unnest(categories) AS value FROM ph_products${where.text}`
      : `SELECT slug, CASE WHEN ${website} THEN 'yes' ELSE 'no' END AS value FROM ph_products${where.text}`;
  return {
    text: `SELECT value, count(*) AS count FROM (${from}) GROUP BY value ORDER BY count DESC, value ASC`,
    params: where.params,
  };
}
export const recordSql = (slug: string): Sql => ({
  text: `SELECT ${fields} FROM ph_products WHERE slug = ?`,
  params: [slug],
});
export type Execute = (sql: Sql) => Promise<Record<string, unknown>[]>;
const products = (rows: Record<string, unknown>[]): Product[] =>
  rows.map((r) => ({ ...r, categories: r.categories ? Array.from(r.categories as Iterable<string>) : [] }) as Product);

/** Shared by the browser engine and fixture-backed Node WASM tests. */
export function createPhQuery(execute: Execute, fetchedAt: string) {
  const provenance = phProvenance(fetchedAt);
  const rows = async (filters: PhFilters, sort?: PhSort, page?: number) =>
    products(await execute(rowsSql(filters, sort, page)));
  return {
    provenance,
    rows,
    async count(filters: PhFilters = {}) {
      return Number((await execute(countSql(filters)))[0].count);
    },
    async facets(filters: PhFilters, facet: "category" | "website") {
      const options = (await execute(facetSql(filters, facet))).map((r) => ({
        value: String(r.value),
        count: Number(r.count),
      }));
      for (const value of (facet === "category" ? filters.categories : filters.website) ?? []) {
        if (!options.some((o) => o.value === value)) options.push({ value, count: 0 });
      }
      return options;
    },
    async record(slug: string) {
      return products(await execute(recordSql(slug)))[0] ?? null;
    },
    async export(filters: PhFilters, sort?: PhSort) {
      return {
        source: provenance.source,
        collectedAt: provenance.collectedAt,
        provenance,
        exportedAt: PH_META.exportedAt,
        attribution: PH_META.attribution,
        filters,
        rows: await rows(filters, sort),
      };
    },
    async search(q: string, limit = 5): Promise<SearchHit[]> {
      if (!q.trim()) return [];
      return (await rows({ q }, undefined, 0)).slice(0, Math.max(0, Math.min(50, limit))).map((p) => ({
        collection: "ph",
        kind: "products",
        id: p.slug,
        title: p.name,
        subtitle: p.tagline ?? undefined,
        meta: PH_META.coverageLabel,
        href: `/ph/?product=${encodeURIComponent(p.slug)}`,
      }));
    },
  };
}

let cached: Promise<ReturnType<typeof createPhQuery>> | undefined;
export function loadPhQuery() {
  if (typeof window === "undefined") return Promise.reject(new Error("PH queries run in the browser only."));
  cached ??= openBrowserQuery().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
export const searchPh = async (query: string, limit = 5) => (await loadPhQuery()).search(query, limit);

async function openBrowserQuery() {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const assetUrl = (name: string) => new URL(`/api/files/duckdb/1.32.0/${name}`, location.origin).href;
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: assetUrl("duckdb-mvp.wasm"), mainWorker: assetUrl("duckdb-browser-mvp.worker.js") },
    eh: { mainModule: assetUrl("duckdb-eh.wasm"), mainWorker: assetUrl("duckdb-browser-eh.worker.js") },
  });
  if (!bundle.mainWorker) throw new Error("DuckDB worker is unavailable.");
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts(${JSON.stringify(bundle.mainWorker)});`], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    try {
      await db.registerFileURL(
        "ph.parquet",
        new URL(PH_DATA_URL, location.origin).href,
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
    } catch (error) {
      throw new Error("PH Parquet HTTP range file could not be registered. Check access to the Worker data route.", {
        cause: error,
      });
    }
    const fetchedAt = new Date().toISOString();
    const conn = await db.connect();
    await conn.query("CREATE VIEW ph_products AS SELECT * FROM read_parquet('ph.parquet')");
    return createPhQuery(async ({ text, params }) => {
      const stmt = await conn.prepare(text);
      try {
        return (await stmt.query(...params)).toArray().map((r) => r.toJSON());
      } finally {
        await stmt.close();
      }
    }, fetchedAt);
  } catch (error) {
    await db.terminate();
    worker.terminate();
    throw error;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}
