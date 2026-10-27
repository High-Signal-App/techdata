import type { DataColumn } from "@saas-maker/ui/components/data-table";
import type { CatalogEntry, Post } from "../adapters/reddit";
export type Community = CatalogEntry & { dates: string[] };
export const communityColumns: DataColumn<Community>[] = [
  { id: "subreddit", header: "subreddit", value: (e) => e.subreddit, hideable: false },
  { id: "posts", header: "latest posts", value: (e) => e.coverage.posts, align: "right" },
  { id: "comments", header: "retained comments", value: (e) => e.coverage.comments, align: "right" },
  { id: "coverage", header: "latest coverage", value: (e) => e.coverage.status },
  { id: "date", header: "latest date", value: (e) => e.date },
  { id: "dates", header: "dates available", value: (e) => e.dates.join(", ") },
];

export function publicCommunities(entries: CatalogEntry[], now = Date.now()) {
  const map = new Map<string, Community>();
  for (const entry of entries
    .filter((entry) => Date.parse(entry.expiresAt) > now)
    .sort((a, b) => b.date.localeCompare(a.date) || b.capturedAt.localeCompare(a.capturedAt))) {
    const existing = map.get(entry.subreddit);
    if (existing) {
      if (!existing.dates.includes(entry.date)) existing.dates.push(entry.date);
    } else map.set(entry.subreddit, { ...entry, dates: [entry.date] });
  }
  return [...map.values()];
}
export const publicPostColumns: DataColumn<Post>[] = [
  { id: "title", header: "thread", value: (post) => post.title },
  { id: "score", header: "recorded score", value: (post) => post.score },
  { id: "commentCount", header: "reported replies", value: (post) => post.commentCount },
  { id: "flair", header: "post label", value: (post) => post.flair ?? "not recorded" },
  {
    id: "createdUtc",
    header: "created (UTC)",
    value: (post) => post.createdUtc,
    cell: (post) => new Date(post.createdUtc * 1000).toISOString(),
  },
];
