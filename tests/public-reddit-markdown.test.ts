import { describe, expect, it, vi } from "vitest";
import type { CatalogEntry, Snapshot } from "../src/adapters/reddit";
import { redditMarkdown } from "../src/lib/public-reddit-markdown";

const now = Date.parse("2026-10-27T00:00:00Z");
const entry: CatalogEntry = {
  subreddit: "public",
  date: "2026-10-26",
  source: { run: "1", attempt: "1", revision: "abc1234567890123" },
  capturedAt: "2026-10-26T00:00:00Z",
  expiresAt: "2026-10-28T00:00:00Z",
  coverage: {
    status: "complete",
    posts: 1,
    comments: 1,
    commentsSeen: 1,
    commentsDropped: 0,
    reportedReplies: 1,
    listingCapped: false,
    note: "Recorded capture",
  },
};
const provenance = {
  source: "Reddit",
  sourceUrl: "https://reddit.com",
  via: "Reddit Insights",
  viaUrl: "https://reddit-insights.highsignal.app",
  collectedAt: entry.capturedAt,
  fetchedAt: "2026-10-27T00:00:00Z",
};
const snapshot: Snapshot = {
  ...entry,
  schema: "reddit-insights.snapshot.v1",
  window: { start: entry.capturedAt, end: "2026-10-27T00:00:00Z", semantics: "recorded" },
  posts: [
    {
      id: "p1",
      subreddit: "public",
      title: "Public thread",
      body: "CLOSED_DETAIL_CANARY",
      permalink: "/r/public/p1",
      createdUtc: 1,
      retrievedAt: entry.capturedAt,
      score: 0,
      upvoteRatio: 1,
      commentCount: 1,
      flair: null,
      nsfw: false,
      spoiler: false,
      removalState: null,
    },
  ],
  comments: [],
};
const catalog = async () => ({
  data: { schema: "reddit-insights.catalog.v1" as const, generatedAt: "2026-10-27T00:00:00Z", entries: [entry] },
  provenance,
});
describe("fresh public Reddit exports", () => {
  it("rechecks every request, exports visible allowlisted cells, and preserves zero/missing values", async () => {
    const read = vi.fn(async () => ({ data: snapshot, provenance }));
    for (let i = 0; i < 2; i++) {
      const text = await redditMarkdown("/reddit/posts/", { adapter: { catalog, snapshot: read }, now: () => now });
      expect(text).toContain("Public thread");
      expect(text).toContain("| 0 | 1 | not recorded |");
      expect(text).not.toContain("CLOSED_DETAIL_CANARY");
      expect(text).toContain(entry.source.revision);
    }
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("keeps hostile Markdown syntax in upstream titles as plain text", async () => {
    const text = await redditMarkdown("/reddit/posts/", {
      adapter: {
        catalog,
        snapshot: async () => ({
          data: { ...snapshot, posts: [{ ...snapshot.posts[0], title: "[x](http://[) <script> |" }] },
          provenance,
        }),
      },
      now: () => now,
    });
    expect(text).toContain(String.raw`\[x\]\(http://\[\) \<script\> \|`);
    expect(text).toContain("Default public capture");
  });
  it("fails closed on expired or changed revisions instead of returning cached data", async () => {
    for (const data of [
      { ...snapshot, expiresAt: "2026-10-26T00:00:00Z" },
      { ...snapshot, source: { ...snapshot.source, revision: "changed" } },
    ])
      await expect(
        redditMarkdown("/reddit/posts/", {
          adapter: { catalog, snapshot: async () => ({ data, provenance }) },
          now: () => now,
        }),
      ).rejects.toThrow("expired_or_changed");
  });
  it("drops expired catalog rows without reading a capture", async () => {
    const read = vi.fn();
    const result = await redditMarkdown("/reddit/posts/", {
      adapter: {
        catalog: async () => ({
          data: {
            schema: "reddit-insights.catalog.v1",
            generatedAt: "2026-10-27",
            entries: [{ ...entry, expiresAt: "2026-10-26" }],
          },
          provenance,
        }),
        snapshot: read,
      },
      now: () => now,
    });
    expect(result).toContain("No current public captures");
    expect(read).not.toHaveBeenCalled();
  });
});
