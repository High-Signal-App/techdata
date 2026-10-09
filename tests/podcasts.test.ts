import { describe, expect, it } from "vitest";
import { createPodcastsAdapter, formatTimestamp, speakerLabel, UpstreamError } from "../src/adapters/podcasts";

function recorder(body: unknown = {}, status = 200) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}

const now = () => new Date("2026-10-09T12:00:00Z");

describe("podcasts adapter", () => {
  it("passes only known, bounded params to the public API", async () => {
    const r = recorder({ claims: [] });
    const a = createPodcastsAdapter({ base: "https://api.example/api", fetch: r.fetch, now });
    await a.claims(new URLSearchParams("q=ai&type=prediction&from=2026-01-01&to=bad&person=sam&admin=1"));
    expect(r.calls[0]).toBe("https://api.example/api/search?q=ai&person=sam&type=prediction&from=2026-01-01");
    await a.claims(new URLSearchParams("type=drop table"));
    expect(r.calls[1]).toBe("https://api.example/api/search");
    await a.episodes(new URLSearchParams("limit=9999&offset=-4&show=lex-fridman"));
    expect(r.calls[2]).toBe("https://api.example/api/sources?show=lex-fridman&limit=200&offset=0");
    await a.episode("../admin");
    expect(r.calls[3]).toBe("https://api.example/api/sources/..%2Fadmin");
  });

  it("wraps every response with provenance", async () => {
    const r = recorder({ claims: [] });
    const a = createPodcastsAdapter({ base: "https://api.example/api", fetch: r.fetch, now });
    const out = await a.claim("abc", true);
    expect(out.provenance).toMatchObject({
      source: "High Signal Podcasts",
      via: "public API",
      viaUrl: "https://api.example/api/claims/abc?context=1",
      sourceUrl: "https://podcasts.highsignal.app/claims/abc",
      fetchedAt: "2026-10-09T12:00:00.000Z",
      collectedAt: null,
    });
  });

  it("raises upstream errors with the status", async () => {
    const a = createPodcastsAdapter({ fetch: recorder({}, 503).fetch, now });
    await expect(a.stats()).rejects.toBeInstanceOf(UpstreamError);
  });

  it("never names an unverified speaker", () => {
    expect(speakerLabel({ attributionStatus: "speaker_unverified", personName: "Someone" })).toBe("unverified speaker");
    expect(speakerLabel({ attributionStatus: "verified_speaker", personName: "Ben Gilbert" })).toBe("Ben Gilbert");
    expect(speakerLabel({ attributionStatus: "verified_speaker", personName: null })).toBe("unverified speaker");
  });

  it("formats timestamps", () => {
    expect(formatTimestamp(854.24)).toBe("14:14");
    expect(formatTimestamp(3723)).toBe("1:02:03");
    expect(formatTimestamp(null)).toBeNull();
  });
});
