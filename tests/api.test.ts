import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Dataset } from "../src/adapters/nomad/places";
import { createPapersAdapter } from "../src/adapters/papers";
import { createPodcastsAdapter } from "../src/adapters/podcasts";
import { createRedditAdapter } from "../src/adapters/reddit";
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
          personName: null,
          showName: "No Priors",
          saidOn: "2026-09-03T10:00:00.000Z",
        },
      ],
    });
  return Response.json({ error: "not_found" }, { status: 404 });
};

const app = createApp({
  nomad: async () => dataset,
<<<<<<< HEAD
  papers: () => createPapersAdapter({ fetch: async () => new Response(null, { status: 404 }) }),
||||||| a225c94
=======
  reddit: () => createRedditAdapter({ fetch: async () => Response.json(redditCatalog) }),
>>>>>>> origin/main
  podcasts: () => createPodcastsAdapter({ base: "https://api.example/api", fetch: upstream }),
});
const get = async (path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("api", () => {
<<<<<<< HEAD
  it("lists collections with provenance", async () => {
||||||| a225c94
  it("lists both collections with provenance", async () => {
=======
  it("lists all collections with provenance", async () => {
>>>>>>> origin/main
    const { body } = await get("/api/collections");
    const list = body.collections as { id: string; counts: Record<string, number> }[];
<<<<<<< HEAD
    expect(list.map((c) => c.id)).toEqual(["nomad", "podcasts", "papers"]);
||||||| a225c94
    expect(list.map((c) => c.id)).toEqual(["nomad", "podcasts"]);
=======
    expect(list.map((c) => c.id)).toEqual(["nomad", "podcasts", "reddit", "ph"]);
>>>>>>> origin/main
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
    expect(hits.find((h) => h.kind === "people")?.title).toBe("Ben Gilbert");
  });

  it("maps upstream failures to 404/502", async () => {
    expect((await get("/api/podcasts/claims/missing")).status).toBe(404);
    expect((await get("/api/unknown")).status).toBe(404);
  });
});
