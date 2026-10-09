import { describe, expect, it } from "vitest";
import { createRedditAdapter, UpstreamError } from "../src/adapters/reddit";
import { createApp } from "../src/server/app";
import catalog from "./fixtures/reddit/catalog.json";
import snapshot from "./fixtures/reddit/snapshot-AI_Agents-2026-10-09.json";

const now = () => new Date("2026-10-09T12:00:00Z");
function fixtureFetcher() {
  const calls: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    calls.push(url);
    return Response.json(new URL(url).pathname.endsWith("catalog") ? catalog : snapshot);
  };
  return { calls, fetch };
}
const adapter = () => createRedditAdapter({ fetch: fixtureFetcher().fetch, now });
describe("reddit adapter", () => {
  it("reads the real catalog and computes only catalog counts and freshness", async () => {
    const a = adapter();
    expect((await a.catalog()).data).toEqual(catalog);
    const summary = await a.summary();
    expect(summary.counts).toEqual({
      communities: new Set(catalog.entries.map((e) => e.subreddit)).size,
      "snapshot dates": new Set(catalog.entries.map((e) => e.date)).size,
      snapshots: catalog.entries.length,
    });
    expect(summary.provenance.collectedAt).toBe(catalog.generatedAt);
  });
  it("reads a snapshot with the exact 12-character pinned query and provenance", async () => {
    const r = fixtureFetcher();
    const a = createRedditAdapter({ fetch: r.fetch, now });
    const v = snapshot.source.revision.slice(0, 12);
    const out = await a.snapshot(snapshot.subreddit, snapshot.date, v);
    expect(r.calls).toEqual([
      `https://reddit-insights.highsignal.app/api/snapshots/${snapshot.date}/${snapshot.subreddit}?v=${v}`,
    ]);
    expect(out.data.posts).toHaveLength(12);
    expect(out.data.comments).toHaveLength(snapshot.comments.length);
    expect(out.data.posts[0]).toMatchObject({
      title: snapshot.posts[0]?.title,
      score: snapshot.posts[0]?.score,
      flair: snapshot.posts[0]?.flair,
      commentCount: snapshot.posts[0]?.commentCount,
    });
    expect(out.provenance).toMatchObject({
      source: "Reddit, via Reddit Insights capture runs",
      sourceUrl: "https://reddit-insights.highsignal.app",
      via: "public Snapshot API",
      collectedAt: snapshot.capturedAt,
      fetchedAt: now().toISOString(),
      revision: snapshot.source.revision,
    });
    expect(out.provenance.note).toContain(snapshot.coverage.note);
    expect(out.provenance.note).toContain(snapshot.window.start);
    expect(out.provenance.note).toContain(snapshot.coverage.status);
  });
  it.each([
    [404, "missing", "not-archived"],
    [410, "removed", "revision-removed"],
    [410, "expired", "expired"],
    [503, "unavailable", "unavailable"],
  ])("preserves upstream %s %s", async (status, error, state) => {
    const a = createRedditAdapter({ fetch: async () => Response.json({ error }, { status: Number(status) }), now });
    await expect(a.snapshot(snapshot.subreddit, snapshot.date)).rejects.toMatchObject({ status, state });
    await expect(a.catalog()).rejects.toBeInstanceOf(UpstreamError);
  });
  it("does not expose author/profile fields even if upstream unexpectedly supplies them", async () => {
    const a = createRedditAdapter({
      fetch: async () =>
        Response.json({
          ...snapshot,
          posts: snapshot.posts.map((p) => ({
            ...p,
            author: "should never leak",
            authorId: "private",
            profile: "private",
          })),
          comments: snapshot.comments.map((c) => ({ ...c, author: "should never leak" })),
        }),
      now,
    });
    const out = await a.snapshot(snapshot.subreddit, snapshot.date);
    for (const row of [...out.data.posts, ...out.data.comments])
      expect(Object.keys(row).some((key) => /author|profile/i.test(key))).toBe(false);
    expect(JSON.stringify(out)).not.toContain("should never leak");
  });
  it("searches communities and only already loaded recent posts, without fetching snapshots", async () => {
    const r = fixtureFetcher();
    const a = createRedditAdapter({ fetch: r.fetch, now });
    expect((await a.search("AI_Agents"))[0]).toMatchObject({ kind: "communities", title: "r/AI_Agents" });
    expect(await a.search(snapshot.posts[0]?.title ?? "")).toEqual([]);
    await a.snapshot(snapshot.subreddit, snapshot.date);
    const hits = await a.search(snapshot.posts[0]?.title ?? "");
    expect(hits[0]).toMatchObject({ kind: "posts", title: snapshot.posts[0]?.title });
    expect(hits[0]?.href).toContain(`v=${snapshot.source.revision.slice(0, 12)}`);
    expect(r.calls.filter((url) => !url.endsWith("catalog"))).toHaveLength(1);
    expect(await a.search("")).toEqual([]);
  });
  it("does not search revoked or expired loaded revisions", async () => {
    let removed = false;
    const a = createRedditAdapter({
      now,
      fetch: async (url) =>
        Response.json(
          url.endsWith("catalog")
            ? {
                ...catalog,
                entries: removed ? [] : catalog.entries.map((e) => ({ ...e, expiresAt: "2026-10-09T01:00:00Z" })),
              }
            : snapshot,
        ),
    });
    await a.snapshot(snapshot.subreddit, snapshot.date);
    expect(await a.search(snapshot.posts[0]?.title ?? "")).toEqual([]);
    removed = true;
    expect(await a.search(snapshot.posts[0]?.title ?? "")).toEqual([]);
  });
  it("rejects invalid and mismatched pinned identities", async () => {
    const a = adapter();
    await expect(a.snapshot("../admin", snapshot.date)).rejects.toMatchObject({ status: 400 });
    await expect(a.snapshot(snapshot.subreddit, snapshot.date, "bad")).rejects.toMatchObject({ status: 400 });
    await expect(a.snapshot(snapshot.subreddit, snapshot.date, "000000000000")).rejects.toMatchObject({ status: 502 });
  });
});

describe("reddit API", () => {
  const a = adapter();
  // These tests target Reddit routes only; no source file or network is read.
  const app = createApp({ nomad: async () => ({ cities: [] }) as never, reddit: () => a });
  it("serves catalog and pinned snapshots with provenance and no-store", async () => {
    const catalogResponse = await app.request("/api/reddit/catalog");
    expect(catalogResponse.status).toBe(200);
    expect(await catalogResponse.json()).toMatchObject({ data: catalog, provenance: { via: "public Snapshot API" } });
    const res = await app.request(
      `/api/reddit/snapshots/${snapshot.date}/${snapshot.subreddit}?v=${snapshot.source.revision.slice(0, 12)}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      data: { subreddit: snapshot.subreddit },
      provenance: { revision: snapshot.source.revision },
    });
    const search = await app.request("/api/search?collection=reddit&q=AI_Agents");
    expect(((await search.json()) as { hits: { kind: string }[] }).hits[0]?.kind).toBe("communities");
    expect((await app.request("/api/reddit/catalog", { method: "POST" })).status).toBe(404);
  });
  it.each([
    [404, "missing", "not-archived"],
    [410, "removed", "revision-removed"],
    [503, "unavailable", "unavailable"],
  ])("returns honest %s states with provenance", async (status, error, state) => {
    const app = createApp({
      nomad: async () => ({ cities: [] }) as never,
      reddit: () =>
        createRedditAdapter({ fetch: async () => Response.json({ error }, { status: Number(status) }), now }),
    });
    const res = await app.request(`/api/reddit/snapshots/${snapshot.date}/${snapshot.subreddit}`);
    expect(res.status).toBe(status === 503 ? 502 : status);
    expect(await res.json()).toMatchObject({
      error: state,
      provenance: { source: "Reddit, via Reddit Insights capture runs" },
    });
  });
});
