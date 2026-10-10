import { describe, expect, it } from "vitest";
import { phAdapter } from "../src/adapters/ph";
import { PH_META } from "../src/adapters/ph/meta";
import { countSql, createPhQuery, facetSql, recordSql, rowsSql, whereSql } from "../src/adapters/ph/query";
import fixture from "./fixtures/ph/rows.json";

describe("PH SQL builders", () => {
  it("binds user input and allowlists sort columns", () => {
    const input = "x'); DROP TABLE ph_products; --";
    const sql = rowsSql({ categories: [input], q: "Café  tools", website: ["no"] }, { id: input, desc: true }, -1);
    expect(sql.text).not.toContain(input);
    expect(sql.text).toContain("ORDER BY lower(strip_accents(name)) DESC NULLS LAST, slug ASC LIMIT ? OFFSET ?");
    expect(sql.params).toEqual(["Café", "tools", input, 50, 0]);
    expect(recordSql(input).params).toEqual([input]);
    expect(whereSql({ website: ["yes", "no"] }).text).toBe("");
    expect(countSql({}).params).toEqual([]);
  });
  it("excludes the counted facet while preserving other filters", () => {
    const filters = { categories: ["Design Tools"], website: ["yes"], q: "AI" };
    expect(facetSql(filters, "category").params).toEqual(["AI"]);
    expect(facetSql(filters, "website").params).toEqual(["AI", "Design Tools"]);
  });
});

describe("PH query contract (injected executor; no network)", () => {
  it("keeps source fields, provenance and filters in exports and client search", async () => {
    const calls: { text: string; params: (string | number)[] }[] = [];
    const query = createPhQuery(async (sql) => {
      calls.push(sql);
      return fixture as unknown as Record<string, unknown>[];
    }, "2026-10-09T12:00:00Z");
    const filters = { categories: ["File storage and sharing apps"] };
    const exported = await query.export(filters);
    expect(exported.rows).toEqual(fixture);
    expect(exported).toMatchObject({
      source: "Product Hunt",
      exportedAt: PH_META.exportedAt,
      collectedAt: null,
      filters,
      provenance: { revision: PH_META.revision, fetchedAt: "2026-10-09T12:00:00Z" },
    });
    expect(calls[0]).toEqual(rowsSql(filters));
    expect((await query.search("0up", 1))[0]).toMatchObject({
      collection: "ph",
      kind: "products",
      id: "0up",
      href: "/ph/?product=0up",
    });
    const callCount = calls.length;
    expect(await query.search(" ")).toEqual([]);
    expect(calls.length).toBe(callCount);
    await query.record("0up");
    expect(calls.at(-1)).toEqual(recordSql("0up"));
  });
  it("provides a static read-only full-export summary", async () => {
    expect(await phAdapter.summary()).toMatchObject({
      id: "ph",
      mode: "read-only",
      counts: { products: 575479, "with categories": 93897 },
      provenance: { revision: PH_META.revision, collectedAt: null },
    });
  });
});
