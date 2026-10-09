/** Read-only public captures. Author/profile metadata is deliberately excluded. */
import type { CollectionSummary, Provenance, SearchHit, SearchOptions } from "../types";

export const REDDIT_SITE = "https://reddit-insights.highsignal.app";
export const ATTRIBUTION =
  "Reddit, via Reddit Insights capture runs. Author/profile metadata is omitted. Retained comments are filtered; scores and reply totals are recorded values, not current Reddit values.";
export type Source = { run: string; attempt: string; revision: string };
export type Coverage = {
  status: string;
  posts: number;
  comments: number;
  commentsSeen: number;
  commentsDropped: number;
  reportedReplies: number;
  listingCapped: boolean;
  note: string;
  commentFailures?: number;
  unresolvedMore?: number;
};
export type CatalogEntry = {
  subreddit: string;
  date: string;
  source: Source;
  capturedAt: string;
  coverage: Coverage;
  expiresAt: string;
};
export type Catalog = { schema: "reddit-insights.catalog.v1"; generatedAt: string; entries: CatalogEntry[] };
export type Post = {
  id: string;
  subreddit: string;
  title: string;
  body: string;
  permalink: string;
  createdUtc: number;
  retrievedAt: string;
  score: number;
  upvoteRatio: number;
  commentCount: number;
  flair: string | null;
  nsfw: boolean;
  spoiler: boolean;
  removalState: string | null;
};
export type Comment = {
  id: string;
  subreddit: string;
  postId: string;
  parentId: string;
  body: string;
  createdUtc: number;
  retrievedAt: string;
  score: number;
  depth: number;
  isSubmitter: boolean;
  removalState: string | null;
};
export type Snapshot = CatalogEntry & {
  schema: "reddit-insights.snapshot.v1";
  window: { start: string; end: string; semantics: string };
  posts: Post[];
  comments: Comment[];
};
export type Envelope<T> = { data: T; provenance: Provenance };
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly state: string,
    readonly provenance: Provenance,
  ) {
    super(`Reddit Snapshot API ${status}: ${state}`);
  }
}
const postFields = [
  "id",
  "subreddit",
  "title",
  "body",
  "permalink",
  "createdUtc",
  "retrievedAt",
  "score",
  "upvoteRatio",
  "commentCount",
  "flair",
  "nsfw",
  "spoiler",
  "removalState",
] as const;
const commentFields = [
  "id",
  "subreddit",
  "postId",
  "parentId",
  "body",
  "createdUtc",
  "retrievedAt",
  "score",
  "depth",
  "isSubmitter",
  "removalState",
] as const;
const pick = <T>(row: T, fields: readonly (keyof T)[]): T => Object.fromEntries(fields.map((k) => [k, row[k]])) as T;

export function snapshotHref(s: CatalogEntry, post?: string) {
  const q = new URLSearchParams({ subreddit: s.subreddit, date: s.date, v: s.source.revision.slice(0, 12) });
  if (post) q.set("post", post);
  return `/reddit/posts/?${q}`;
}

export function createRedditAdapter(
  opts: {
    base?: string;
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
    now?: () => Date;
    searchThreadsBudgetMs?: number;
  } = {},
) {
  const base = (opts.base ?? REDDIT_SITE).replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  // Only search uses this bounded cache; snapshot reads always recheck upstream revocation.
  const loaded = new Map<string, Snapshot>();
  const provenance = (
    url: string,
    capturedAt: string | null = null,
    revision?: string,
    note = ATTRIBUTION,
  ): Provenance => ({
    source: "Reddit, via Reddit Insights capture runs",
    sourceUrl: REDDIT_SITE,
    via: "public Snapshot API",
    viaUrl: url,
    collectedAt: capturedAt,
    fetchedAt: now().toISOString(),
    revision,
    note,
  });
  async function get<T>(path: string) {
    const url = `${base}/api/snapshots/${path}`;
    let res: Response;
    try {
      res = await doFetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    } catch {
      throw new UpstreamError(503, url, "unavailable", provenance(url));
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const state =
        res.status === 404
          ? "not-archived"
          : res.status === 410 && body.error === "removed"
            ? "revision-removed"
            : res.status === 410 && body.error === "expired"
              ? "expired"
              : "unavailable";
      throw new UpstreamError(res.status, url, state, provenance(url));
    }
    return { data: (await res.json()) as T, url };
  }
  async function catalog(): Promise<Envelope<Catalog>> {
    const { data, url } = await get<Catalog>("catalog");
    if (data.schema !== "reddit-insights.catalog.v1" || !Array.isArray(data.entries))
      throw new UpstreamError(502, url, "unavailable", provenance(url));
    const latest = [data.generatedAt, ...data.entries.map((e) => e.capturedAt)].sort().at(-1) ?? null;
    return { data, provenance: provenance(url, latest) };
  }
  async function snapshot(subreddit: string, date: string, version?: string): Promise<Envelope<Snapshot>> {
    if (
      !/^[A-Za-z0-9_]{2,30}$/.test(subreddit) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      (version !== undefined && !/^[a-f0-9]{12}$/.test(version))
    ) {
      throw new UpstreamError(400, base, "invalid", provenance(base));
    }
    const { data, url } = await get<Snapshot>(
      `${date}/${encodeURIComponent(subreddit)}${version ? `?v=${version}` : ""}`,
    );
    if (
      data.schema !== "reddit-insights.snapshot.v1" ||
      data.subreddit.toLowerCase() !== subreddit.toLowerCase() ||
      data.date !== date ||
      (version && !data.source.revision.startsWith(version)) ||
      !Array.isArray(data.posts) ||
      !Array.isArray(data.comments)
    )
      throw new UpstreamError(502, url, "unavailable", provenance(url));
    data.posts = data.posts.map((p) => pick(p, postFields));
    data.comments = data.comments.map((c) => pick(c, commentFields));
    const key = `${data.subreddit}/${data.date}`;
    loaded.delete(key);
    loaded.set(key, data);
    if (loaded.size > 4) loaded.delete(loaded.keys().next().value as string);
    return {
      data,
      provenance: provenance(
        url,
        data.capturedAt,
        data.source.revision,
        `${data.coverage.status}: ${data.coverage.note} ${ATTRIBUTION} Window ${data.window.start}–${data.window.end} (${data.window.semantics}).`,
      ),
    };
  }
  return {
    id: "reddit",
    catalog,
    snapshot,
    async summary(): Promise<CollectionSummary> {
      const { data, provenance } = await catalog();
      return {
        id: "reddit",
        label: "Reddit Insights",
        description: "Captured community threads and retained discussion, with coverage and pinned revisions.",
        counts: {
          communities: new Set(data.entries.map((e) => e.subreddit.toLowerCase())).size,
          "snapshot dates": new Set(data.entries.map((e) => e.date)).size,
          snapshots: data.entries.length,
        },
        provenance,
        mode: "read-only",
      };
    },
    async search(query: string, limit = 5, options: SearchOptions = {}): Promise<SearchHit[]> {
      const q = query.trim().toLowerCase().slice(0, 120);
      if (!q) return [];
      const { data } = await catalog();
      const bound = Math.min(10, Math.max(1, limit));
      const latest = new Map<string, CatalogEntry>();
      for (const e of data.entries)
        if (!latest.has(e.subreddit) || e.date > (latest.get(e.subreddit)?.date ?? "")) latest.set(e.subreddit, e);
      const hits: SearchHit[] = [...latest.values()]
        .filter((e) => e.subreddit.toLowerCase().includes(q))
        .slice(0, bound)
        .map((e) => ({
          collection: "reddit",
          kind: "communities",
          id: e.subreddit,
          title: `r/${e.subreddit}`,
          meta: e.date,
          href: snapshotHref(e),
        }));
      options.onPartial?.(hits);
      // Community matches are ready now: never wait for or scan snapshots for them.
      if (hits.length) return hits;
      // Thread-only queries use already loaded snapshots, with no fetch or pending-read wait.
      const deadline = performance.now() + (opts.searchThreadsBudgetMs ?? 25);
      for (const s of [...loaded.values()].reverse()) {
        if (performance.now() >= deadline) break;
        const entry = latest.get(s.subreddit);
        if (
          !entry ||
          entry.source.revision !== s.source.revision ||
          entry.date !== s.date ||
          Date.parse(entry.expiresAt) <= now().getTime()
        )
          continue;
        for (const p of s.posts
          .slice(0, 500)
          .filter((p) => performance.now() < deadline && p.title.toLowerCase().includes(q))
          .slice(0, bound)) {
          if (hits.filter((h) => h.kind === "posts").length >= bound) break;
          hits.push({
            collection: "reddit",
            kind: "posts",
            id: `${s.subreddit}/${s.date}/${p.id}`,
            title: p.title,
            subtitle: `r/${s.subreddit}`,
            meta: s.date,
            href: snapshotHref(s, p.id),
          });
        }
      }
      options.onPartial?.(hits);
      return hits;
    },
  };
}
export type RedditAdapter = ReturnType<typeof createRedditAdapter>;
