/** A thin index over adapter hits, never a shared record schema. */
import type { Provenance, SearchHit } from "../adapters/types";
import { fold } from "../lib/nomad-search";

export type { SearchHit };
export { fold };
export const COLLECTIONS = [
  { id: "nomad", label: "Nomad Atlas" },
  { id: "podcasts", label: "High Signal Podcasts" },
  { id: "reddit", label: "Reddit Insights" },
  { id: "papers", label: "Research Papers" },
  { id: "ph", label: "PH Catalog" },
] as const;
export const COLLECTION_CAP = 8;
export const GLOBAL_CAP = 30;
export const SEARCH_TIMEOUT_MS = 5000;
export type SearchResponse = {
  hits: SearchHit[];
  collections: { id: string; ok: boolean; ms: number; count: number; error?: string }[];
  provenance: Record<string, Provenance>;
};
export type SearchLimits = { limit?: number; perCollection?: number | Record<string, number> };

function match(text: string, query: string): number {
  if (text === query) return 4;
  if (text.startsWith(query)) return 3;
  if (text.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query))) return 2;
  return text.includes(query) ? 1 : 0;
}

/** All title matches outrank subtitle matches; adapter-only matches are kept. */
export function scoreHit(hit: SearchHit, query: string): number {
  const q = fold(query.trim());
  if (!q) return 0;
  const title = match(fold(hit.title), q);
  return title ? title + 4 : match(fold(hit.subtitle ?? ""), q);
}

export function rankResults(hits: readonly SearchHit[], query: string): SearchHit[] {
  return hits
    .map((hit, position) => ({ hit, position, score: scoreHit(hit, query) }))
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map(({ hit }) => hit);
}

const bound = (n: number | undefined, fallback: number) =>
  n === undefined || !Number.isFinite(n) ? fallback : Math.max(0, Math.trunc(n));

/** Deduplicate by collection/kind/id, rank globally, then apply both caps. */
export function mergeResults(
  server: readonly SearchHit[],
  client: readonly SearchHit[],
  query: string,
  limits: SearchLimits = {},
): SearchHit[] {
  if (!fold(query.trim())) return [];
  const seen = new Set<string>();
  const unique = [...server, ...client].filter((hit) => {
    const key = JSON.stringify([hit.collection, hit.kind, hit.id]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const counts = new Map<string, number>();
  return rankResults(unique, query)
    .filter((hit) => {
      const cap =
        typeof limits.perCollection === "number" ? limits.perCollection : limits.perCollection?.[hit.collection];
      const count = counts.get(hit.collection) ?? 0;
      if (count >= bound(cap, COLLECTION_CAP)) return false;
      counts.set(hit.collection, count + 1);
      return true;
    })
    .slice(0, bound(limits.limit, GLOBAL_CAP));
}

/** Known collections have a fixed order; unknown additive collections sort by id. */
export function groupResults(hits: readonly SearchHit[]) {
  const ids = [
    ...COLLECTIONS.map((c) => c.id),
    ...[...new Set(hits.map((h) => h.collection))].filter((id) => !COLLECTIONS.some((c) => c.id === id)).sort(),
  ];
  return ids
    .map((id) => ({
      id,
      label: COLLECTIONS.find((c) => c.id === id)?.label ?? id,
      hits: hits.filter((hit) => hit.collection === id),
    }))
    .filter((group) => group.hits.length);
}
