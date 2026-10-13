import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostsView from "../src/components/reddit/PostsView";
import { redditInitial } from "../src/lib/reddit-initial";

const catalog = JSON.parse(readFileSync(new URL("./fixtures/reddit/catalog.json", import.meta.url), "utf8"));
const snapshot = JSON.parse(
  readFileSync(new URL("./fixtures/reddit/snapshot-AI_Agents-2026-10-09.json", import.meta.url), "utf8"),
);
const now = () => new Date("2026-10-09T12:00:00Z");
const query = "subreddit=AI_Agents&date=2026-10-09";
const read = () =>
  vi.fn<typeof fetch>(
    async (url) => new Response(JSON.stringify(String(url).endsWith("catalog") ? catalog : snapshot)),
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("bounded Reddit initial render", () => {
  it("pins the catalog revision and renders verified metadata with honest row loading", async () => {
    const fetch = read();
    const initial = await redditInitial(new URLSearchParams(query), { fetch, now });
    expect(fetch.mock.calls).toHaveLength(2);
    expect(String(fetch.mock.calls[1][0])).toContain(`?v=${snapshot.source.revision.slice(0, 12)}`);
    const html = renderToStaticMarkup(
      createElement(PostsView, {
        initialCatalog: initial.catalog,
        initialMetadata: initial.metadata,
        initialBounds: initial.bounds,
        initialQuery: `?${query}`,
      }),
    );
    expect(initial.metadata?.data).not.toHaveProperty("posts");
    expect(initial.metadata?.data).not.toHaveProperty("comments");
    expect(html).not.toContain(snapshot.posts[0].title);
    expect(html).toContain(snapshot.window.start);
    expect(html).toContain('data-slot="data-table-skeleton"');
  });
  it("applies requested filters and loading column visibility in server HTML", async () => {
    const initial = await redditInitial(new URLSearchParams(query), { fetch: read(), now });
    const html = renderToStaticMarkup(
      createElement(PostsView, {
        initialCatalog: initial.catalog,
        initialMetadata: initial.metadata,
        initialBounds: initial.bounds,
        initialQuery: `?${query}&q=never-match-this-fixture&columns=title`,
      }),
    );
    expect(html).toContain("never-match-this-fixture");
    expect(html).not.toContain(">reported replies<");
    expect(html).not.toContain(snapshot.posts[0].title);
  });
  it("never supplies expired, removed or mismatched pinned data", async () => {
    const expired = await redditInitial(new URLSearchParams(query), {
      fetch: read(),
      now: () => new Date("2026-10-11T00:00:00Z"),
    });
    expect(expired.metadata).toBeUndefined();
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
      String(url).endsWith("catalog")
        ? new Response(JSON.stringify(catalog))
        : new Response('{"error":"removed"}', { status: 410 }),
    );
    expect(
      (await redditInitial(new URLSearchParams(`${query}&v=123456abcdef`), { fetch, now })).metadata,
    ).toBeUndefined();
    expect(
      (await redditInitial(new URLSearchParams(`${query}&v=123456abcdef`), { fetch: read(), now })).metadata,
    ).toBeUndefined();
  });
  it("falls back without inventing data when the source fails or exceeds the read budget", async () => {
    expect(
      await redditInitial(new URLSearchParams(), {
        fetch: vi.fn(async () => {
          throw new TypeError("offline");
        }),
        now,
      }),
    ).toEqual({});
    const oversized = vi.fn(async () => new Response("{}", { headers: { "content-length": "2000001" } }));
    expect(await redditInitial(new URLSearchParams(), { fetch: oversized, now })).toEqual({});
    expect(oversized).toHaveBeenCalledTimes(1);
  });
});
