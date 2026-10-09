/**
 * techdata API (Hono), mounted at /api/* by src/pages/api/[...path].ts. Every
 * route is read-only and wraps data with its provenance.
 */
import { Hono } from "hono";
import { nomadProvenance, nomadSummary } from "../adapters/nomad/meta";
import { type Dataset, explorable, type Place, queryPlaces, readPlacesQuery } from "../adapters/nomad/places";
import { createPapersAdapter, type PapersAdapter } from "../adapters/papers";
import { phAdapter } from "../adapters/ph";
import { createPodcastsAdapter, type PodcastsAdapter, UpstreamError } from "../adapters/podcasts";
import { createRedditAdapter, type RedditAdapter, UpstreamError as RedditUpstreamError } from "../adapters/reddit";
import type { CollectionAdapter, CollectionSummary, Provenance, SearchHit } from "../adapters/types";
import { searchPlaces } from "../lib/nomad-search";
import { COLLECTION_CAP, GLOBAL_CAP, mergeResults, SEARCH_TIMEOUT_MS } from "../search";

export type Env = { PODCASTS_API_BASE?: string; REDDIT_INSIGHTS_API_BASE?: string; RESEARCH_PAPERS_BASE?: string };

export type AppDeps = {
  /** Loads the Nomad Atlas snapshot (bundled JSON in the Worker; injectable in tests). */
  nomad: () => Promise<Dataset>;
  podcasts?: (env: Env) => PodcastsAdapter;
  reddit?: (env: Env) => RedditAdapter;
  papers?: (env: Env) => PapersAdapter;
  /** Per-adapter search deadline; does not change adapter fetch behaviour. */
  searchTimeoutMs?: number;
};

const clamp = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw ?? def);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
};

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Bindings: Env }>().basePath("/api");
  const podcastsFor = deps.podcasts ?? ((env: Env) => createPodcastsAdapter({ base: env?.PODCASTS_API_BASE }));
  const redditAdapters = new Map<string, RedditAdapter>();
  const redditFor =
    deps.reddit ??
    ((env: Env) => {
      const base = env?.REDDIT_INSIGHTS_API_BASE ?? "https://reddit-insights.highsignal.app";
      let adapter = redditAdapters.get(base);
      if (!adapter) {
        adapter = createRedditAdapter({ base });
        redditAdapters.set(base, adapter);
      }
      return adapter;
    });
  const paperAdapters = new Map<string, PapersAdapter>();
  const papersFor =
    deps.papers ??
    ((env: Env) => {
      const base = env?.RESEARCH_PAPERS_BASE ?? "https://papers.highsignal.app";
      let adapter = paperAdapters.get(base);
      if (!adapter) {
        adapter = createPapersAdapter({ base });
        paperAdapters.set(base, adapter);
      }
      return adapter;
    });
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
    if (err instanceof RedditUpstreamError) {
      c.header("cache-control", "no-store");
      return c.json(
        { error: err.state, status: err.status, provenance: err.provenance },
        err.status === 404 ? 404 : err.status === 410 ? 410 : err.status === 400 ? 400 : 502,
      );
    }
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
    try {
      collections.push(await redditFor(c.env).summary());
    } catch {
      collections.push({ id: "reddit", error: "The Reddit Snapshot API did not answer." });
    }
    collections.push(await phAdapter.summary());
    try {
      collections.push(await papersFor(c.env).summary());
    } catch {
      collections.push({ id: "papers", error: "The Research Papers public exports did not answer." });
    }
    return c.json({ collections });
  });

  app.get("/ph/summary", async (c) => c.json(await phAdapter.summary()));

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

  app.get("/reddit/catalog", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await redditFor(c.env).catalog());
  });
  app.get("/reddit/snapshots/:date/:subreddit", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await redditFor(c.env).snapshot(c.req.param("subreddit"), c.req.param("date"), c.req.query("v")));
  });

  /* Research Papers: public GET exports only. */
  app.get("/papers/papers", async (c) => c.json(await papersFor(c.env).papers(new URL(c.req.url).searchParams)));
  app.get("/papers/papers/:id", async (c) => {
    const result = await papersFor(c.env).paper(c.req.param("id"));
    return result ? c.json(result) : c.json({ error: "not_found" }, 404);
  });
  app.get("/papers/paths", async (c) => c.json(await papersFor(c.env).paths()));
  app.get("/papers/paths/:id", async (c) => {
    const result = await papersFor(c.env).path(c.req.param("id"));
    return result ? c.json(result) : c.json({ error: "not_found" }, 404);
  });
  app.get("/papers/cited-works", async (c) => c.json(await papersFor(c.env).citedWorks()));
  app.get("/papers/authors", async (c) => c.json(await papersFor(c.env).authors()));

  /* ⌘K: parallel bounded reads; PH stays in the browser. */
  app.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 120);
    const collection = c.req.query("collection");
    const kind = c.req.query("kind");
    const limit = clamp(c.req.query("limit"), GLOBAL_CAP, 1, GLOBAL_CAP);
    if (!q) return c.json({ hits: [], collections: [], provenance: {} });
    const source = (name: string, site: string, via: string, url: string): Provenance => ({
      source: name,
      sourceUrl: site,
      via,
      viaUrl: url,
      collectedAt: null,
      note: "Search source summary; collection dates and pinned revisions are shown in the record view.",
    });
    const runSearch = (adapter: Pick<CollectionAdapter, "search">, onPartial: (hits: readonly SearchHit[]) => void) =>
      adapter.search(q, COLLECTION_CAP, { onPartial });
    const adapters: {
      id: string;
      search: (onPartial: (hits: readonly SearchHit[]) => void) => Promise<SearchHit[]>;
      provenance: Provenance;
    }[] = [
      { id: "nomad", search: async () => searchPlaces(await places(), q, COLLECTION_CAP), provenance: nomadProvenance },
      {
        id: "podcasts",
        search: (onPartial) => runSearch(podcastsFor(c.env), onPartial),
        provenance: source(
          "High Signal Podcasts",
          "https://podcasts.highsignal.app",
          "public API",
          `${c.env?.PODCASTS_API_BASE ?? "https://api.podcasts.highsignal.app/api"}/search`,
        ),
      },
      {
        id: "reddit",
        search: (onPartial) => runSearch(redditFor(c.env), onPartial),
        provenance: source(
          "Reddit, via Reddit Insights capture runs",
          "https://reddit-insights.highsignal.app",
          "public Snapshot API",
          `${c.env?.REDDIT_INSIGHTS_API_BASE ?? "https://reddit-insights.highsignal.app"}/api/snapshots/catalog`,
        ),
      },
      {
        id: "papers",
        search: (onPartial) => runSearch(papersFor(c.env), onPartial),
        provenance: source(
          "Research Papers (High Signal), CC-BY 4.0",
          "https://papers.highsignal.app",
          "public JSON exports",
          c.env?.RESEARCH_PAPERS_BASE ?? "https://papers.highsignal.app",
        ),
      },
    ];
    const results = await Promise.all(
      adapters
        .filter((a) => !collection || a.id === collection)
        .map(async (adapter) => {
          const started = performance.now();
          let timer: ReturnType<typeof setTimeout> | undefined;
          let partial: SearchHit[] = [];
          let accepting = true;
          const onPartial = (hits: readonly SearchHit[]) => {
            if (accepting) partial = hits.filter((h) => h.collection === adapter.id && (!kind || h.kind === kind));
          };
          try {
            const hits = await Promise.race([
              Promise.resolve().then(() => adapter.search(onPartial)),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("timeout")), deps.searchTimeoutMs ?? SEARCH_TIMEOUT_MS);
              }),
            ]);
            return {
              adapter,
              hits: hits.filter((h) => !kind || h.kind === kind),
              status: { id: adapter.id, ok: true, ms: Math.round(performance.now() - started), count: 0 },
            };
          } catch (error) {
            const timedOut = error instanceof Error && error.message === "timeout";
            return {
              adapter,
              hits: timedOut ? partial : [],
              status: {
                id: adapter.id,
                ok: false,
                ms: Math.round(performance.now() - started),
                count: 0,
                error: timedOut ? "timeout" : "unavailable",
              },
            };
          } finally {
            accepting = false;
            clearTimeout(timer);
          }
        }),
    );
    const hits = mergeResults(
      results.flatMap((r) => r.hits),
      [],
      q,
      { limit },
    );
    if (results.some((r) => !r.status.ok)) c.header("cache-control", "no-store");
    return c.json({
      hits,
      collections: results.map(({ status }) => ({
        ...status,
        count: hits.filter((h) => h.collection === status.id).length,
      })),
      provenance: Object.fromEntries(results.map(({ adapter }) => [adapter.id, adapter.provenance])),
    });
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}
