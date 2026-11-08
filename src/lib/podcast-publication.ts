import type { Episode, PodcastsAdapter } from "../adapters/podcasts";
import { safeWebUrl } from "./ph-publication";

export function eligibleEpisode(source: Episode, claims = source.claimCount ?? 0) {
  return !!(
    /^[a-zA-Z0-9-]{1,120}$/.test(source.id) &&
    source.title.trim() &&
    source.showName.trim() &&
    safeWebUrl(source.sourceUrl) &&
    source.publishedAt &&
    Number.isFinite(Date.parse(source.publishedAt)) &&
    claims > 0
  );
}

/** Short-lived reads preserve the upstream's publishing/withholding boundary. */
export function createPodcastPublication(adapter: PodcastsAdapter, now = () => Date.now()) {
  const cache = new Map<string, { expires: number; pending: Promise<unknown> }>();
  function cached<T>(key: string, read: () => Promise<T>): Promise<T> {
    const entry = cache.get(key);
    if (entry && entry.expires > now()) return entry.pending as Promise<T>;
    const pending = read();
    const next = { expires: now() + 60_000, pending };
    cache.set(key, next);
    if (cache.size > 32) cache.delete(cache.keys().next().value as string);
    pending.catch(() => {
      if (cache.get(key) === next) cache.delete(key);
    });
    return pending;
  }
  const list = (limit: number, offset: number) =>
    cached(`list:${limit}:${offset}`, () =>
      adapter.episodes(new URLSearchParams({ limit: String(limit), offset: String(offset) })),
    );
  return {
    async episode(id: string) {
      if (!/^[a-zA-Z0-9-]{1,120}$/.test(id)) return null;
      const result = await cached(`episode:${id}`, () => adapter.episode(id));
      return eligibleEpisode(result.data.source, result.data.claims.length) ? result : null;
    },
    async catalog(raw: string) {
      if (!/^[1-9]\d*$/.test(raw) || Number(raw) > 1000) return null;
      const result = await list(100, (Number(raw) - 1) * 100);
      const sources = result.data.sources.filter((source) => eligibleEpisode(source));
      return sources.length ? { ...result, data: { ...result.data, sources } } : null;
    },
    async sitemap() {
      const first = await list(200, 0);
      const total = first.data.total;
      if (!Number.isSafeInteger(total) || total < 0 || total > 100_000)
        throw new Error("Unexpected episode catalog size");
      const pages = Math.ceil(total / 200);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, n) => list(200, (n + 1) * 200)),
      );
      const results = [first, ...rest];
      // A changing/incomplete traversal must not silently produce a successful partial sitemap.
      const sources = results.flatMap((result) => result.data.sources);
      if (
        results.some((result) => result.data.total !== total) ||
        sources.length !== total ||
        new Set(sources.map((source) => source.id)).size !== total
      )
        throw new Error("Episode catalog changed during traversal");
      return [
        ...sources
          .filter((source) => eligibleEpisode(source))
          .map((source) => `/podcasts/episodes/${encodeURIComponent(source.id)}/`),
        ...Array.from({ length: Math.ceil(total / 100) }, (_, n) => `/podcasts/catalog/${n + 1}/`),
      ];
    },
  };
}
