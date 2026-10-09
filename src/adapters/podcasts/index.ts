/**
 * High Signal Podcasts adapter: read-only, over the project's public API
 * (api.podcasts.highsignal.app). The API already applies the product's
 * publishing rules (published claims only, withheld shows removed, speakers
 * shown only when verified, timestamps only for caption transcripts); this
 * adapter passes those fields through untouched and adds provenance.
 *
 * Later this can switch to read-only D1/R2 bindings without changing the
 * routes the UI calls.
 */
import type { CollectionSummary, Provenance, SearchHit } from "../types";

export const PODCASTS_API_BASE = "https://api.podcasts.highsignal.app/api";
export const PODCASTS_SITE = "https://podcasts.highsignal.app";

export const CLAIM_TYPES = [
  "belief",
  "prediction",
  "recommendation",
  "evaluation",
  "observation",
  "preference",
  "commitment",
  "disagreement",
  "uncertainty",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export type AttributionStatus = "verified_speaker" | "speaker_unverified" | string;

export type Claim = {
  id: string;
  assertion: string;
  quote: string;
  claimType: ClaimType | string;
  stance: string | null;
  attributionStatus: AttributionStatus;
  reviewStatus: string;
  saidOn: string | null;
  /** Seconds into the episode; only set for caption transcripts. */
  timestampS: number | null;
  deepLinkUrl: string | null;
  episodeId: string;
  episodeTitle: string;
  showName: string;
  showSlug: string;
  sourceUrl: string | null;
  transcriptKind: string | null;
  personId: string | null;
  personName: string | null;
  personOrg: string | null;
  personSlug: string | null;
  personTitle: string | null;
};

export type Episode = {
  id: string;
  title: string;
  showName: string;
  showSlug: string;
  publishedAt: string | null;
  durationS: number | null;
  sourceUrl: string | null;
  status: string;
  transcriptKind: string | null;
  claimCount?: number;
  peopleCount?: number;
};

export type Person = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  org: string | null;
  bio: string | null;
  links: Record<string, string> | null;
  status: string;
  claimCount?: number;
  sourceCount?: number;
};

export type Evidence = {
  id: string;
  claimId: string;
  episodeId: string;
  quote: string;
  role: "primary" | "corroboration" | "contradiction";
  timestampS: number | null;
  deepLinkUrl: string | null;
};

export type ClaimReference = { id: string; claimId: string; kind: string; name: string; role: string };
export type TranscriptContext = { text: string; quoteStart: number; quoteEnd: number };

export type Stats = {
  catalogEpisodes: number;
  episodes: number;
  people: number;
  publishedClaims: number;
  publishedReferences: number;
  transcriptEpisodes: number;
  trustedShows: number;
  trustPolicy?: { withheldShows: number; wording: string };
};

export type Show = { name: string; slug: string };

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Podcasts API ${status} for ${url}`);
  }
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type Envelope<T> = { data: T; provenance: Provenance };

const clampInt = (raw: string | null | undefined, def: number, min: number, max: number) => {
  const n = Number(raw ?? def);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
};
const isoDay = (raw: string | null | undefined) => (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined);
const trimmed = (raw: string | null | undefined, max = 200) => raw?.trim().slice(0, max) || undefined;

export function podcastsProvenance(apiUrl: string, fetchedAt: string, siteUrl = PODCASTS_SITE): Provenance {
  return {
    source: "High Signal Podcasts",
    sourceUrl: siteUrl,
    via: "public API",
    viaUrl: apiUrl,
    collectedAt: null,
    fetchedAt,
    note: "Live read of published claims. Withheld shows stay out; unverified speakers are labelled, never guessed.",
  };
}

export function createPodcastsAdapter(opts: { base?: string; fetch?: Fetcher; now?: () => Date } = {}) {
  const base = (opts.base ?? PODCASTS_API_BASE).replace(/\/$/, "");
  const doFetch: Fetcher = opts.fetch ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? (() => new Date());

  async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, siteUrl?: string) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const res = await doFetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) throw new UpstreamError(res.status, url.toString());
    const data = (await res.json()) as T;
    return { data, provenance: podcastsProvenance(url.toString(), now().toISOString(), siteUrl) } satisfies Envelope<T>;
  }

  return {
    id: "podcasts",
    stats: () => get<Stats>("/stats"),

    /** Episodes with at least one published claim, newest first. */
    episodes: (q: URLSearchParams) =>
      get<{ sources: Episode[]; total: number; publishers: Show[] }>("/sources", {
        q: trimmed(q.get("q")),
        show: trimmed(q.get("show"), 80),
        limit: clampInt(q.get("limit"), 50, 1, 200),
        offset: clampInt(q.get("offset"), 0, 0, 100_000),
      }),

    episode: (id: string) =>
      get<{ source: Episode; claims: Claim[] }>(
        `/sources/${encodeURIComponent(id)}`,
        {},
        `${PODCASTS_SITE}/sources/${encodeURIComponent(id)}`,
      ),

    people: (q: URLSearchParams) =>
      get<{ people: Person[]; total: number }>("/people", {
        q: trimmed(q.get("q")),
        limit: clampInt(q.get("limit"), 50, 1, 200),
        offset: clampInt(q.get("offset"), 0, 0, 100_000),
      }),

    person: (slug: string) =>
      get<{ person: Person; claims: Claim[] }>(
        `/people/${encodeURIComponent(slug)}`,
        {},
        `${PODCASTS_SITE}/people/${encodeURIComponent(slug)}`,
      ),

    claim: (id: string, withContext: boolean) =>
      get<{
        claim: Claim;
        evidence: Evidence[];
        references: ClaimReference[];
        context?: TranscriptContext | null;
        contextStatus?: string;
      }>(
        `/claims/${encodeURIComponent(id)}`,
        { context: withContext ? "1" : undefined },
        `${PODCASTS_SITE}/claims/${encodeURIComponent(id)}`,
      ),

    /** Full-text claim search (the API returns at most 50, newest first). */
    claims: (q: URLSearchParams) => {
      const type = q.get("type");
      return get<{ claims: Claim[]; evidence?: "insufficient" }>("/search", {
        q: trimmed(q.get("q")),
        person: trimmed(q.get("person"), 120),
        type: type && (CLAIM_TYPES as readonly string[]).includes(type) ? type : undefined,
        from: isoDay(q.get("from")),
        to: isoDay(q.get("to")),
      });
    },

    async summary(): Promise<CollectionSummary> {
      const { data, provenance } = await get<Stats>("/stats");
      return {
        id: "podcasts",
        label: "High Signal Podcasts",
        description: "Claims from podcast episodes, with the speaker, quote, timestamp and source link.",
        counts: {
          claims: data.publishedClaims,
          episodes: data.episodes,
          people: data.people,
          shows: data.trustedShows,
        },
        provenance,
        mode: "read-only",
      };
    },

    async search(query: string, limit = 5): Promise<SearchHit[]> {
      const [people, claims] = await Promise.allSettled([
        get<{ people: Person[] }>("/people", { q: query, limit }),
        get<{ claims: Claim[] }>("/search", { q: query }),
      ]);
      const hits: SearchHit[] = [];
      if (people.status === "fulfilled") {
        for (const p of people.value.data.people.slice(0, limit)) {
          hits.push({
            collection: "podcasts",
            kind: "people",
            id: p.slug,
            title: p.name,
            subtitle: [p.title, p.org].filter(Boolean).join(", ") || undefined,
            meta: p.claimCount !== undefined ? `${p.claimCount.toLocaleString("en-US")} claims` : undefined,
            href: `/podcasts/people/?person=${encodeURIComponent(p.slug)}`,
          });
        }
      }
      if (claims.status === "fulfilled") {
        for (const c of claims.value.data.claims.slice(0, limit)) {
          hits.push({
            collection: "podcasts",
            kind: "claims",
            id: c.id,
            title: c.assertion,
            subtitle: `${speakerLabel(c)} · ${c.showName}`,
            meta: c.saidOn?.slice(0, 10),
            href: `/podcasts/claims/?q=${encodeURIComponent(query)}&claim=${encodeURIComponent(c.id)}`,
          });
        }
      }
      return hits;
    },
  };
}

export type PodcastsAdapter = ReturnType<typeof createPodcastsAdapter>;

/** The API only names verified speakers; everything else is labelled, never guessed. */
export function speakerLabel(c: Pick<Claim, "attributionStatus" | "personName">): string {
  return c.attributionStatus === "verified_speaker" && c.personName ? c.personName : "unverified speaker";
}

/** Human label for how the transcript was obtained (drives whether timestamps exist). */
export function transcriptLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "youtube_captions":
      return "YouTube captions (timed)";
    case "publisher_html":
    case "publisher_json":
      return "publisher transcript";
    case "publisher_html_coarse":
      return "publisher transcript (coarse)";
    case "rss_vtt":
      return "RSS captions";
    case "rss_named_text":
    case "rss_text_coarse":
      return "RSS transcript";
    default:
      return kind ?? "unknown";
  }
}
