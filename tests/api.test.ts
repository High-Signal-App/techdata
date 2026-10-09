import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Dataset } from "../src/adapters/nomad/places";
import { createPapersAdapter } from "../src/adapters/papers";
import { createPodcastsAdapter } from "../src/adapters/podcasts";
import { createRedditAdapter } from "../src/adapters/reddit";
import { SEARCH_TIMEOUT_MS, type SearchResponse } from "../src/search";
import { createApp } from "../src/server/app";
import redditCatalog from "./fixtures/reddit/catalog.json";

const dataset = JSON.parse(
  readFileSync(new URL("../public/data/nomad/cities.json", import.meta.url), "utf8"),
) as Dataset;

const upstream = async (url: string) => {
  const u = new URL(url);
  if (u.pathname.endsWith("/stats"))
    return Response.json({ publishedClaims: 10, episodes: 2, people: 3, trustedShows: 1 });
  if (u.pathname.endsWith("/people"))
    return Response.json({
      people: [{ slug: "ben-gilbert", name: "Ben Gilbert", title: "Host", org: "Acquired", claimCount: 5 }],
      total: 1,
    });
  if (u.pathname.endsWith("/search"))
    return Response.json({
      claims: [
        {
          id: "c1",
          assertion: "Chips matter.",
          attributionStatus: "speaker_unverified",
          personName: "Unverified supplied name",
          showName: "No Priors",
          saidOn: "2026-09-03T10:00:00.000Z",
        },
      ],
    });
  return Response.json({ error: "not_found" }, { status: 404 });
};

const app = createApp({
  nomad: async () => dataset,
  papers: () => createPapersAdapter({ fetch: async () => new Response(null, { status: 404 }) }),
  reddit: () => createRedditAdapter({ fetch: async () => Response.json(redditCatalog) }),
  podcasts: () => createPodcastsAdapter({ base: "https://api.example/api", fetch: upstream }),
});
const get = async (path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("api", () => {
  it("lists all collections with provenance", async () => {
    const { body } = await get("/api/collections");
    const list = body.collections as { id: string; counts: Record<string, number> }[];
    expect(list.map((c) => c.id)).toEqual(["nomad", "podcasts", "reddit", "ph", "papers"]);
    expect(list[0]?.counts.places).toBe(1374);
    expect(list[1]?.counts.claims).toBe(10);
    expect(list[3]?.counts["sample products"]).toBe(2000);
    expect((await get("/api/ph/summary")).body.provenance).toMatchObject({
      source: "Product Hunt",
      revision: "catalog-handoff-v1",
      collectedAt: null,
    });
  });

  it("serves Nomad places with the view's query string", async () => {
    const { body } = await get("/api/nomad/places?region=Europe&cost=..1500&sort=cost&limit=3");
    const rows = body.rows as { region: string; cost_for_nomad_usd_per_month: number }[];
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.region === "Europe" && r.cost_for_nomad_usd_per_month <= 1500)).toBe(true);
    expect(rows[0]?.cost_for_nomad_usd_per_month ?? 0).toBeLessThanOrEqual(rows[1]?.cost_for_nomad_usd_per_month ?? 0);
    expect(body.provenance).toMatchObject({ source: "Nomads.com", collectedAt: "2026-09-07" });
    expect((await get("/api/nomad/places/lisbon-portugal")).status).toBe(200);
    expect((await get("/api/nomad/places/nowhere")).status).toBe(404);
  });

  it("searches across collections without naming unverified speakers", async () => {
    const { body } = await get("/api/search?q=lisbon");
    const hits = body.hits as { collection: string; kind: string; title: string; subtitle?: string }[];
    expect(hits.find((h) => h.collection === "nomad")?.title).toBe("Lisbon");
    const claim = hits.find((h) => h.kind === "claims");
    expect(claim?.subtitle).toBe("unverified speaker · No Priors");
    expect(JSON.stringify(hits)).not.toContain("Unverified supplied name");
    expect(hits.find((h) => h.kind === "people")?.title).toBe("Ben Gilbert");
  });

  it("fans out in parallel with source summaries and a global limit", async () => {
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const podcasts = createPodcastsAdapter({ fetch: upstream });
    const reddit = createRedditAdapter({ fetch: async () => Response.json(redditCatalog) });
    const papers = createPapersAdapter({ fetch: async () => new Response(null, { status: 404 }) });
    const parallel = createApp({
      nomad: async () => {
        calls.push("nomad");
        await gate;
        return dataset;
      },
      podcasts: () => ({
        ...podcasts,
        search: async (q) => {
          calls.push("podcasts");
          await gate;
          return podcasts.search(q);
        },
      }),
      reddit: () => ({
        ...reddit,
        search: async () => {
          calls.push("reddit");
          await gate;
          return [];
        },
      }),
      papers: () => ({
        ...papers,
        search: async () => {
          calls.push("papers");
          await gate;
          return [];
        },
      }),
    });
    const request = parallel.request("/api/search?q=lisbon&limit=1");
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    release();
    const response = await request;
    const body = (await response.json()) as SearchResponse;
    expect(body.hits).toHaveLength(1);
    expect(body.collections.map((c: { id: string }) => c.id)).toEqual(["nomad", "podcasts", "reddit", "papers"]);
    expect(body.collections.every((c: { ok: boolean; ms: number }) => c.ok && c.ms >= 0)).toBe(true);
    expect(body.collections.reduce((n: number, c: { count: number }) => n + c.count, 0)).toBe(1);
    expect(body.provenance.nomad).toMatchObject({ source: "Nomads.com", collectedAt: "2026-09-07" });
    expect(body.provenance.podcasts).toMatchObject({
      source: "High Signal Podcasts",
      via: "public API",
      collectedAt: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it.each(["timeout", "unavailable"])("isolates an adapter %s and does not cache partial failures", async (failure) => {
    vi.useFakeTimers();
    try {
      const isolated = createApp({
        nomad: async () => dataset,
        searchTimeoutMs: 25,
        podcasts: () => ({
          ...createPodcastsAdapter({ fetch: upstream }),
          search: async () => {
            if (failure === "timeout") return new Promise<never>(() => {});
            throw new Error("upstream details stay private");
          },
        }),
        reddit: () => createRedditAdapter({ fetch: async () => Response.json(redditCatalog) }),
        papers: () => createPapersAdapter({ fetch: async () => new Response(null, { status: 404 }) }),
      });
      const request = isolated.request("/api/search?q=lisbon");
      await vi.advanceTimersByTimeAsync(25);
      const response = await request;
      const body = (await response.json()) as SearchResponse;
      expect(response.status).toBe(200);
      expect(body.hits.some((h: { collection: string }) => h.collection === "nomad")).toBe(true);
      expect(body.collections.find((c: { id: string }) => c.id === "podcasts")).toMatchObject({
        ok: false,
        count: 0,
        error: failure,
      });
      expect(
        body.collections.filter((c: { id: string }) => c.id !== "podcasts").every((c: { ok: boolean }) => c.ok),
      ).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a 5000 ms default adapter timeout", async () => {
    expect(SEARCH_TIMEOUT_MS).toBe(5000);
    vi.useFakeTimers();
    try {
      const a = createApp({
        nomad: async () => dataset,
        reddit: () => ({
          ...createRedditAdapter({ fetch: async () => Response.json(redditCatalog) }),
          search: async () => new Promise<never>(() => {}),
        }),
      });
      let finished = false;
      const request = Promise.resolve(a.request("/api/search?q=agent&collection=reddit")).then((response) => {
        finished = true;
        return response;
      });
      await vi.advanceTimersByTimeAsync(4999);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const body = (await (await request).json()) as SearchResponse;
      expect(body.hits).toEqual([]);
      expect(body.collections).toMatchObject([{ id: "reddit", ok: false, error: "timeout", count: 0 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows a cold catalog read beyond the former 2500 ms deadline", async () => {
    vi.useFakeTimers();
    try {
      const a = createApp({
        nomad: async () => dataset,
        reddit: () =>
          createRedditAdapter({
            fetch: async () => {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              return Response.json(redditCatalog);
            },
          }),
      });
      const request = a.request("/api/search?q=agent&collection=reddit");
      await vi.advanceTimersByTimeAsync(3000);
      const body = (await (await request).json()) as SearchResponse;
      expect(body.hits).toContainEqual(expect.objectContaining({ title: "r/AI_Agents" }));
      expect(body.collections).toMatchObject([{ id: "reddit", ok: true, count: body.hits.length }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains request-local partial hits on timeout, applying kind filters and caps", async () => {
    vi.useFakeTimers();
    try {
      const reddit = createRedditAdapter({ fetch: async () => Response.json(redditCatalog) });
      const a = createApp({
        nomad: async () => dataset,
        searchTimeoutMs: 25,
        reddit: () => ({
          ...reddit,
          search: async (q, limit, options) => {
            const hits = await reddit.search(q, limit, options);
            // Simulate an adapter with an optional enrichment path still running.
            options?.onPartial?.([...hits, ...hits]);
            return new Promise<never>(() => {});
          },
        }),
      });
      const request = a.request("/api/search?q=agent&collection=reddit&kind=communities&limit=1");
      await vi.advanceTimersByTimeAsync(25);
      const response = await request;
      const body = (await response.json()) as SearchResponse;
      expect(body.hits).toHaveLength(1);
      expect(body.hits[0]).toMatchObject({ title: "r/AI_Agents", kind: "communities" });
      expect(body.collections).toMatchObject([{ id: "reddit", ok: false, error: "timeout", count: 1 }]);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const filteredRequest = a.request("/api/search?q=agent&collection=reddit&kind=posts");
      await vi.advanceTimersByTimeAsync(25);
      const filtered = (await (await filteredRequest).json()) as SearchResponse;
      expect(filtered.hits).toEqual([]);
      expect(filtered.collections).toMatchObject([{ ok: false, error: "timeout", count: 0 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps collection/kind filters and an empty-query envelope", async () => {
    const { body } = await get("/api/search?q=lisbon&collection=podcasts&kind=claims");
    expect(body.hits).toMatchObject([
      { collection: "podcasts", kind: "claims", subtitle: "unverified speaker · No Priors" },
    ]);
    expect((body.collections as { id: string }[]).map((c) => c.id)).toEqual(["podcasts"]);
    expect((await get("/api/search?q=")).body).toEqual({ hits: [], collections: [], provenance: {} });
    expect((await get("/api/search?q=lisbon&collection=unknown")).body).toEqual({
      hits: [],
      collections: [],
      provenance: {},
    });
  });

  it("maps upstream failures to 404/502", async () => {
    expect((await get("/api/podcasts/claims/missing")).status).toBe(404);
    expect((await get("/api/unknown")).status).toBe(404);
  });
});
