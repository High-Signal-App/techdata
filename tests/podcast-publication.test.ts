import { describe, expect, it } from "vitest";
import { createPodcastsAdapter, speakerLabel } from "../src/adapters/podcasts";
import { createPodcastPublication, eligibleEpisode } from "../src/lib/podcast-publication";

const source = {
  id: "episode-1",
  title: "How reliable systems fail",
  showName: "Example public show",
  showSlug: "public-show",
  sourceUrl: "https://example.com/episodes/1",
  publishedAt: "2026-10-20T12:00:00Z",
  durationS: null,
  status: "published",
  transcriptKind: "publisher_html",
  claimCount: 1,
};
const claim = {
  id: "claim-1",
  assertion: "Retries need an idempotent boundary.",
  attributionStatus: "speaker_unverified",
  personName: "UNVERIFIED_CANARY",
};

describe("published podcast episode pages", () => {
  it("keeps source dates, public claims and verified-only speaker labels", async () => {
    const adapter = createPodcastsAdapter({
      fetch: async () => Response.json({ source, claims: [claim] }),
      now: () => new Date("2026-11-08T06:00:00Z"),
    });
    const data = await createPodcastPublication(adapter).episode(source.id);
    expect(data?.data.source.publishedAt).toBe(source.publishedAt);
    expect(data?.provenance.fetchedAt).toBe("2026-11-08T06:00:00.000Z");
    expect(data?.data.claims[0].assertion).toBe(claim.assertion);
    expect(speakerLabel(data?.data.claims[0] ?? claim)).toBe("unverified speaker");
    expect(eligibleEpisode({ ...source, sourceUrl: "javascript:alert(1)" })).toBe(false);
    expect(eligibleEpisode({ ...source, publishedAt: null })).toBe(false);
    expect(eligibleEpisode({ ...source, claimCount: 0 })).toBe(false);
  });

  it("expires cached public content and fails closed when an episode is withdrawn", async () => {
    let time = 0,
      calls = 0,
      withdrawn = false;
    const adapter = createPodcastsAdapter({
      fetch: async () => {
        calls++;
        return withdrawn ? new Response("withdrawn", { status: 404 }) : Response.json({ source, claims: [claim] });
      },
    });
    const pages = createPodcastPublication(adapter, () => time);
    await pages.episode(source.id);
    withdrawn = true;
    time = 59_999;
    expect((await pages.episode(source.id))?.data.source.id).toBe(source.id);
    expect(calls).toBe(1);
    time = 60_001;
    await expect(pages.episode(source.id)).rejects.toMatchObject({ status: 404 });
    await expect(pages.episode(source.id)).rejects.toMatchObject({ status: 404 });
    expect(calls).toBe(3);
  });

  it("never turns source failure or an empty-claim source into an admitted page", async () => {
    const failed = createPodcastPublication(
      createPodcastsAdapter({ fetch: async () => new Response("offline", { status: 503 }) }),
    );
    await expect(failed.episode(source.id)).rejects.toMatchObject({ status: 503 });
    await expect(failed.sitemap()).rejects.toMatchObject({ status: 503 });
    const empty = createPodcastPublication(
      createPodcastsAdapter({ fetch: async () => Response.json({ source, claims: [] }) }),
    );
    expect(await empty.episode(source.id)).toBeNull();
    expect(await empty.episode("../private")).toBeNull();
    expect(await empty.catalog("01")).toBeNull();
  });

  it("uses paginated public lists for the sitemap, omits ineligible sources and rejects partial traversals", async () => {
    const sources = Array.from({ length: 201 }, (_, n) => ({ ...source, id: `episode-${n}` }));
    sources[5] = { ...sources[5], claimCount: 0 };
    let incomplete = false;
    const adapter = createPodcastsAdapter({
      fetch: async (input) => {
        const offset = Number(new URL(input).searchParams.get("offset"));
        return Response.json({
          total: 201,
          sources: incomplete && offset ? [] : sources.slice(offset, offset + 200),
          publishers: [],
        });
      },
    });
    const urls = await createPodcastPublication(adapter).sitemap();
    expect(urls.filter((url) => url.startsWith("/podcasts/episodes/"))).toHaveLength(200);
    expect(urls).not.toContain("/podcasts/episodes/episode-5/");
    expect(urls.filter((url) => url.startsWith("/podcasts/catalog/"))).toHaveLength(3);
    incomplete = true;
    await expect(createPodcastPublication(adapter).sitemap()).rejects.toThrow("changed during traversal");
  });
});
