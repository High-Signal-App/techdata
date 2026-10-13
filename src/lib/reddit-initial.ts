import { rangeBounds } from "@saas-maker/ui/lib/filters";
import { type Catalog, createRedditAdapter, type Envelope, type Snapshot } from "../adapters/reddit";

export type CaptureMetadata = Pick<
  Snapshot,
  "subreddit" | "date" | "source" | "window" | "capturedAt" | "coverage" | "expiresAt"
>;
export type RedditInitial = {
  catalog?: Envelope<Catalog>;
  metadata?: Envelope<CaptureMetadata>;
  bounds?: { min: number; max: number } | null;
};

/** A bounded read through the same public adapter; never cache a serving lease in page HTML. */
export async function redditInitial(
  params: URLSearchParams,
  options: { base?: string; fetch?: typeof fetch; now?: () => Date } = {},
): Promise<RedditInitial> {
  const now = options.now ?? (() => new Date());
  const signal = AbortSignal.timeout(1500);
  const read = options.fetch ?? fetch;
  const bounded: typeof fetch = async (url, init) => {
    const response = await read(url, { ...init, signal });
    if (!response.ok) return response;
    if (Number(response.headers.get("content-length")) > 2_000_000) {
      await response.body?.cancel();
      throw new Error("capture exceeds initial-render budget");
    }
    const reader = response.body?.getReader();
    if (!reader) return response;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new Error("capture exceeds initial-render budget");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return new Response(body, { status: response.status, headers: response.headers });
  };
  const adapter = createRedditAdapter({ ...options, fetch: bounded, now });
  let catalog: Envelope<Catalog>;
  try {
    catalog = await adapter.catalog();
  } catch {
    return {};
  }
  const entries = catalog.data.entries.filter((entry) => Date.parse(entry.expiresAt) > now().getTime());
  const community = params.get("subreddit") ?? entries[0]?.subreddit;
  const dates = entries
    .filter((entry) => entry.subreddit === community)
    .map((entry) => entry.date)
    .sort()
    .reverse();
  const day = params.get("date") ?? dates[0];
  if (!community || !day) return { catalog };
  const entry = entries.find((item) => item.subreddit === community && item.date === day);
  const revision = params.get("v") ?? entry?.source.revision.slice(0, 12);
  try {
    const snapshot = await adapter.snapshot(community, day, revision);
    if (!Number.isFinite(Date.parse(snapshot.data.expiresAt)) || Date.parse(snapshot.data.expiresAt) <= now().getTime())
      return { catalog };
    const { subreddit, date, source, window, capturedAt, coverage, expiresAt } = snapshot.data;
    return {
      catalog,
      metadata: {
        data: { subreddit, date, source, window, capturedAt, coverage, expiresAt },
        provenance: snapshot.provenance,
      },
      bounds: rangeBounds(snapshot.data.posts, (post) => post.score),
    };
  } catch {
    return { catalog };
  }
}
