import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import summary from "../public/data/ph/summary.json";
import { EXPORT_SHA256, summarizeParquet } from "../scripts/ph-summary.mjs";
import { PH_META } from "../src/adapters/ph/meta";
import { createPhQuery } from "../src/adapters/ph/query";
import { afterPhPaint, latestPhRead, summaryPage } from "../src/adapters/ph/summary";
import type fixture from "./fixtures/ph/rows.json";

describe("PH precomputed summary", () => {
  it("pins the real export, full counts, display fields and size budget", () => {
    expect(summary).toMatchObject({
      version: 1,
      sort: "name:asc",
      total: PH_META.fullCount,
      withCategories: PH_META.fullWithCategories,
    });
    expect(summary.provenance).toMatchObject({
      source: "Product Hunt",
      revision: PH_META.revision,
      sha256: EXPORT_SHA256,
      collectedAt: null,
    });
    expect(summary.rows).toHaveLength(100);
    expect(new Set(summary.rows.map((row) => row.slug)).size).toBe(100);
    for (const row of summary.rows) {
      expect(typeof row.name).toBe("string");
      expect(typeof row.slug).toBe("string");
      expect(Array.isArray(row.categories)).toBe(true);
      expect(row).toHaveProperty("tagline");
      expect(row).toHaveProperty("website_url");
      expect(row).toHaveProperty("producthunt_url");
    }
    expect(summary.websites.reduce((n, facet) => n + facet.count, 0)).toBe(summary.total);
    expect(gzipSync(readFileSync(new URL("../public/data/ph/summary.json", import.meta.url))).length).toBeLessThan(
      150 * 1024,
    );
  });

  it("reproduces real fixture rows and independently counted facets from Parquet", async () => {
    const generated = await summarizeParquet(new URL("./fixtures/ph/sample.parquet", import.meta.url));
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
    db.registerFileBuffer("fixture.parquet", readFileSync(new URL("./fixtures/ph/sample.parquet", import.meta.url)));
    const conn = db.connect();
    try {
      conn.query("CREATE VIEW ph_products AS SELECT * FROM read_parquet('fixture.parquet')");
      const all = conn
        .query("SELECT * FROM ph_products")
        .toArray()
        .map((r: { toJSON: () => (typeof fixture)[number] }) => r.toJSON());
      expect(generated.total).toBe(all.length);
      expect(generated.total).toBe(2000);
      expect(generated.withCategories).toBe(all.filter((p: (typeof fixture)[number]) => p.categories.length).length);
      const query = createPhQuery(async ({ text, params }) => {
        const stmt = conn.prepare(text);
        try {
          return stmt
            .query(...params)
            .toArray()
            .map((r: { toJSON: () => Record<string, unknown> }) => r.toJSON());
        } finally {
          stmt.close();
        }
      }, "2026-10-10T00:00:00Z");
      const prefix = [...(await query.rows({}, undefined, 0)), ...(await query.rows({}, undefined, 1))];
      expect(generated.rows).toEqual(prefix.map((p) => ({ ...p, description: null })));
      const counts = new Map<string, number>();
      for (const p of all)
        for (const category of new Set<string>(p.categories)) counts.set(category, (counts.get(category) ?? 0) + 1);
      expect(new Map(generated.categories.map((f: { value: string; count: number }) => [f.value, f.count]))).toEqual(
        counts,
      );
      for (const facet of generated.websites)
        expect(facet.count).toBe(
          all.filter((p: (typeof fixture)[number]) => Boolean(p.website_url?.trim()) === (facet.value === "yes"))
            .length,
        );
    } finally {
      conn.close();
    }
  }, 30000);
});

describe("PH summary to engine handoff", () => {
  const sort = { id: "name", desc: false };
  it("serves two complete default pages, queues unsupported URL views", () => {
    expect(summaryPage(summary, {}, sort, 0)).toEqual(summary.rows.slice(0, 50));
    expect(summaryPage(summary, {}, sort, 1)).toEqual(summary.rows.slice(50));
    for (const filters of [{ q: "AI" }, { categories: ["Design Tools"] }, { website: ["yes"] }]) {
      expect(summaryPage(summary, filters, sort, 0)).toBeNull();
    }
    expect(summaryPage(summary, {}, { id: "name", desc: true }, 0)).toBeNull();
    expect(summaryPage(summary, {}, { id: "tagline", desc: false }, 0)).toBeNull();
    expect(summaryPage(summary, {}, sort, 2)).toBeNull();
  });
  it("publishes only the latest URL read and ignores obsolete errors", async () => {
    let finish!: (value: string) => void;
    let reject!: (error: Error) => void;
    const publish = vi.fn();
    const fail = vi.fn();
    const cancel = latestPhRead(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      publish,
      fail,
    );
    cancel();
    const cancelError = latestPhRead(
      () =>
        new Promise<string>((_, r) => {
          reject = r;
        }),
      publish,
      fail,
    );
    cancelError();
    latestPhRead(async () => "current filtered view", publish, fail);
    finish("obsolete default view");
    reject(new Error("obsolete error"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(publish.mock.calls).toEqual([["current filtered view"]]);
    expect(fail).not.toHaveBeenCalled();
  });
  it("starts engine work after paint and cancels it on unmount", () => {
    const frames: FrameRequestCallback[] = [];
    const idle = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("window", { requestIdleCallback: idle, cancelIdleCallback: vi.fn() });
    try {
      const start = vi.fn();
      const cancel = afterPhPaint(start);
      expect(idle).not.toHaveBeenCalled();
      frames[0](0);
      expect(idle).not.toHaveBeenCalled();
      frames[1](16);
      expect(idle).toHaveBeenCalledWith(start, { timeout: 500 });
      expect(start).not.toHaveBeenCalled();
      cancel();
      expect(cancelAnimationFrame).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
