/**
 * techdata API (Hono), mounted at /api/* by src/pages/api/[...path].ts. Every
 * route is read-only and wraps data with its provenance.
 */
import { Hono } from "hono";
import { nomadProvenance, nomadSummary } from "../adapters/nomad/meta";
import { type Dataset, explorable, type Place, queryPlaces, readPlacesQuery } from "../adapters/nomad/places";
import { createPodcastsAdapter, type PodcastsAdapter, UpstreamError } from "../adapters/podcasts";
import type { CollectionSummary, SearchHit } from "../adapters/types";
import { searchPlaces } from "../lib/nomad-search";

export type Env = { PODCASTS_API_BASE?: string };

export type AppDeps = {
  /** Loads the Nomad Atlas snapshot (bundled JSON in the Worker; injectable in tests). */
  nomad: () => Promise<Dataset>;
  podcasts?: (env: Env) => PodcastsAdapter;
};

const clamp = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw ?? def);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
};

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Bindings: Env }>().basePath("/api");
  const podcastsFor = deps.podcasts ?? ((env: Env) => createPodcastsAdapter({ base: env?.PODCASTS_API_BASE }));
  let placesCache: Promise<Place[]> | null = null;
  const places = () => {
    placesCache ??= deps.nomad().then((d) => explorable(d.cities));
    return placesCache;
  };

  app.use("*", async (c, next) => {
    await next();
    c.header("x-robots-tag", "noindex");
    if (!c.res.headers.has("cache-control")) c.header("cache-control", "private, max-age=60");
  });

  app.onError((err, c) => {
    if (err instanceof UpstreamError) {
      return c.json({ error: "upstream", status: err.status }, err.status === 404 ? 404 : 502);
    }
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/collections", async (c) => {
    const collections: (CollectionSummary | { id: string; error: string })[] = [nomadSummary];
    try {
      collections.push(await podcastsFor(c.env).summary());
    } catch {
      collections.push({ id: "podcasts", error: "The Podcasts API did not answer." });
    }
    return c.json({ collections });
  });

  /* Nomad Atlas: the same query string the places view writes. */
  app.get("/nomad/places", async (c) => {
    const url = new URL(c.req.url);
    const rows = queryPlaces(await places(), readPlacesQuery(url.searchParams));
    const limit = clamp(c.req.query("limit"), 50, 1, 2000);
    const offset = clamp(c.req.query("offset"), 0, 0, 100_000);
    return c.json({
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
      provenance: nomadProvenance,
    });
  });

  app.get("/nomad/places/:slug", async (c) => {
    const place = (await places()).find((p) => p.slug === c.req.param("slug"));
    if (!place) return c.json({ error: "not_found" }, 404);
    return c.json({ data: place, provenance: nomadProvenance });
  });

  /* Podcasts: read-only pass-through of the public API. */
  app.get("/podcasts/stats", async (c) => c.json(await podcastsFor(c.env).stats()));
  app.get("/podcasts/episodes", async (c) =>
    c.json(await podcastsFor(c.env).episodes(new URL(c.req.url).searchParams)),
  );
  app.get("/podcasts/episodes/:id", async (c) => c.json(await podcastsFor(c.env).episode(c.req.param("id"))));
  app.get("/podcasts/people", async (c) => c.json(await podcastsFor(c.env).people(new URL(c.req.url).searchParams)));
  app.get("/podcasts/people/:slug", async (c) => c.json(await podcastsFor(c.env).person(c.req.param("slug"))));
  app.get("/podcasts/claims", async (c) => c.json(await podcastsFor(c.env).claims(new URL(c.req.url).searchParams)));
  app.get("/podcasts/claims/:id", async (c) =>
    c.json(await podcastsFor(c.env).claim(c.req.param("id"), c.req.query("context") === "1")),
  );

  /* ⌘K: one call per collection so a slow source never blocks the others. */
  app.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 120);
    const collection = c.req.query("collection");
    if (!q) return c.json({ hits: [] });
    let hits: SearchHit[] = [];
    if (!collection || collection === "nomad") hits = hits.concat(searchPlaces(await places(), q));
    if (!collection || collection === "podcasts") {
      try {
        hits = hits.concat(await podcastsFor(c.env).search(q));
      } catch {
        // A failed source returns nothing rather than failing the palette.
      }
    }
    return c.json({ hits });
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}
