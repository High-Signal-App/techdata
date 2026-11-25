import { describe, expect, it } from "vitest";
import { createFoodAdapter, FoodUpstreamError } from "../src/adapters/food";
import type { Dataset } from "../src/adapters/nomad/places";
import { createApp } from "../src/server/app";

function recorder(body: unknown = {}, status = 200) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    return Response.json(body, { status });
  };
  return { calls, fetch };
}

describe("Food public adapter", () => {
  it("sends only bounded, recognized product filters", async () => {
    const r = recorder({ products: [], pagination: { page: 1, pageSize: 50, total: 0, pages: 0 } });
    const adapter = createFoodAdapter({ base: "https://food.example/api", fetch: r.fetch });
    await adapter.products(
      new URLSearchParams("q=tofu&category=protein_powder&page=999999&pageSize=999&sort=drop&admin=1"),
    );
    expect(r.calls[0]).toBe(
      "https://food.example/api/products?q=tofu&category=protein_powder&minCompleteness=0&page=100000&pageSize=50",
    );
  });

  it("preserves recipe serving basis and provenance, and caps search text", async () => {
    const r = recorder({
      collectedAt: "2026-08-15T00:00:00.000Z",
      recipes: [
        {
          id: "tofu",
          title: "Tofu bowl",
          url: "https://example.com/recipe",
          nutrition: { protein: 20, calories: null, servingBasis: "1 bowl", sourceNote: "estimate" },
        },
      ],
    });
    const adapter = createFoodAdapter({
      base: "https://food.example/api",
      fetch: r.fetch,
      now: () => new Date("2026-11-26T00:00:00Z"),
    });
    const result = await adapter.recipes(new URLSearchParams(`q=${"x".repeat(140)}&dietary=vegan&secret=1`));
    const url = new URL(r.calls[0]);
    expect(url.pathname).toBe("/api/recipes");
    expect(url.searchParams.get("q")).toHaveLength(120);
    expect(url.searchParams.get("dietary")).toBe("vegan");
    expect(url.searchParams.has("secret")).toBe(false);
    expect(result.data.recipes[0]?.nutrition?.servingBasis).toBe("1 bowl");
    expect(result.provenance).toMatchObject({
      source: "Significant Hobbies Food",
      collectedAt: "2026-08-15T00:00:00.000Z",
      fetchedAt: "2026-11-26T00:00:00.000Z",
    });
  });

  it("reports upstream failures without turning them into empty results", async () => {
    const adapter = createFoodAdapter({ fetch: recorder({}, 503).fetch });
    await expect(adapter.products(new URLSearchParams())).rejects.toBeInstanceOf(FoodUpstreamError);
  });

  it("exposes only Food read routes and marks failed public reads no-store", async () => {
    const dataset = { cities: [] } as unknown as Dataset;
    const empty = { products: [], pagination: { page: 1, pageSize: 24, total: 0, pages: 0 } };
    const app = createApp({
      nomad: async () => dataset,
      food: () => createFoodAdapter({ fetch: recorder(empty, 503).fetch }),
    });
    const response = await app.request("/api/food/products?page=1&pageSize=24", {}, {});
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const writeResponse = await Promise.resolve(app.request("/api/food/write", { method: "POST" }, {}));
    expect(writeResponse.status).toBe(404);
  });
});
