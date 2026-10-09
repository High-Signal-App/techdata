import { readFileSync } from "node:fs";
import { toCSV } from "@saas-maker/ui/lib/export";
import { activeFilters, readFilters } from "@saas-maker/ui/lib/filters";
import { describe, expect, it } from "vitest";
import {
  createPapersAdapter,
  EDGE_NOTE,
  formatYear,
  PAPER_LISTS,
  type PublishedPaper,
  paperFilters,
  type ReadingPath,
} from "../src/adapters/papers";
import { createPodcastsAdapter } from "../src/adapters/podcasts";
import { paperColumns, paperDetailItems, paperExport } from "../src/components/papers/PapersView";
import { createApp } from "../src/server/app";

// Byte-for-byte public responses, papers.highsignal.app, 2026-10-09; CC-BY 4.0.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/papers/${name}`, import.meta.url), "utf8");
const json = <T>(name: string): T => JSON.parse(fixture(name));
const now = () => new Date("2026-10-09T12:00:00Z");
function reader(missing: string[] = []) {
  const calls: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    calls.push(url);
    const path = new URL(url).pathname;
    if (missing.includes(path)) return new Response(null, { status: 404 });
    const filename = path.startsWith("/paper/") ? `paper-${path.slice(7)}` : (path.split("/").at(-1) as string);
    try {
      return new Response(fixture(filename), {
        headers: {
          date: "Fri, 09 Oct 2026 03:10:00 GMT",
          "content-type": filename.endsWith(".md") ? "text/markdown" : "application/json",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
  return { calls, fetch };
}
const adapter = (missing: string[] = []) => {
  const r = reader(missing);
  return { ...r, a: createPapersAdapter({ fetch: r.fetch, now }) };
};

describe("papers public export adapter", () => {
  it("renders years without digit grouping in tables, range chips, details and CSV", async () => {
    const { a } = adapter();
    const rows = (await a.papers(new URLSearchParams("limit=2000"))).data.rows;
    const paper = rows.find((p) => p.year === 2015);
    expect(paper).toBeDefined();
    if (!paper) throw new Error("Real fixture must contain a 2015 paper");
    expect(formatYear(2015)).toBe("2015");
    expect(formatYear(null)).toBe("");
    const yearColumn = paperColumns.find((c) => c.id === "year");
    expect(yearColumn?.value(paper)).toBe(2015); // Sorting stays numeric.
    expect(yearColumn?.cell?.(paper)).toBe("2015");
    const range = paperFilters.find((d) => d.id === "year");
    expect(range?.kind === "range" && range.format?.(2015)).toBe("2015");
    const chips = activeFilters(paperFilters, readFilters(paperFilters, "year=2015..2020"));
    expect(chips[0]?.value).toBe("2015–2020");
    expect(paperDetailItems(paper).find((r) => r.label === "year")?.value).toBe("2015");
    expect(
      toCSV(
        [paper],
        paperExport.filter((c) => c.id === "year"),
      ),
    ).toBe("year\r\n2015\r\n");
    const visible = paperColumns.filter((c) => !c.hidden).map((c) => c.id);
    expect(visible).toEqual(["title", "year", "primary_category", "citation_count"]);
    expect(paperColumns.filter((c) => c.hidden).every((c) => c.hideable)).toBe(true);
  });
  it("shows one identifier, omits absent detail fields and formats published metrics", async () => {
    const { a } = adapter();
    const p = (await a.paper("arxiv:1706.03762"))?.data.paper;
    if (!p) throw new Error("Real fixture must contain Attention Is All You Need");
    const detail = paperDetailItems(p);
    expect(detail.filter((r) => r.label === "id")).toEqual([{ label: "id", value: p.id }]);
    expect(detail.some((r) => ["arxiv id", "paper id", "review rating", "venue", "decision"].includes(r.label))).toBe(
      false,
    );
    expect(detail.some((r) => r.value === "not recorded")).toBe(false);
    expect(detail.find((r) => r.label === "citations")?.value).toBe("180,186");
    expect(detail.find((r) => r.label === "cites / year")?.value).toBe("19,949.4");
    expect(detail.find((r) => r.label === "PageRank")?.value).toBe("0.000613");
    expect(detail.find((r) => r.label === "Katz")?.value).toBe("0.08875");
    const sleeper = (await a.paper("openreview:u1cQYxRI1H"))?.data.paper;
    if (!sleeper) throw new Error("Real fixture must contain the first sleeper");
    expect(paperDetailItems(sleeper).find((r) => r.label === "citations")?.value).toBe("0");
  });
  it("fetches lazily and caches concurrent reads per instance", async () => {
    const { a, calls } = adapter();
    expect(calls).toEqual([]);
    await Promise.all([a.authors(), a.authors()]);
    expect(calls).toEqual(["https://papers.highsignal.app/data/top_authors.json"]);
    await Promise.all([a.papers(), a.papers(), a.summary()]);
    expect(new Set(calls).size).toBe(calls.length);
  });
  it("merges exactly by published IDs and retains every list membership and raw metric", async () => {
    const { a } = adapter();
    const result = await a.papers(new URLSearchParams("limit=2000"));
    const ids = new Map<string, string[]>();
    for (const list of PAPER_LISTS)
      for (const raw of json<PublishedPaper[]>(`${list}.json`)) {
        const id = raw.paper_id ?? `arxiv:${raw.arxiv_id}`;
        ids.set(id, [...(ids.get(id) ?? []), list]);
      }
    expect(result.data.total).toBe(ids.size);
    expect(result.data.rows).toHaveLength(ids.size);
    for (const p of result.data.rows) {
      expect(p.lists).toEqual(ids.get(p.id));
      for (const list of p.lists)
        expect(p.published[list]).toEqual(
          json<PublishedPaper[]>(`${list}.json`).find((r) => (r.paper_id ?? `arxiv:${r.arxiv_id}`) === p.id),
        );
    }
    const review = result.data.rows.find((p) => p.id === "openreview:u1cQYxRI1H");
    expect(review).toMatchObject({
      avg_rating: 10,
      citation_count: 0,
      venue: "ICLR-2025",
      lists: ["sleepers", "review_top_papers"],
    });
  });
  it("filters, sorts, bounds pages and computes deduplicated faceted counts", async () => {
    const { a } = adapter();
    const result = await a.papers(
      new URLSearchParams("list=top_papers&year=2010..2020&sort=citation_count:asc&limit=3&offset=1"),
    );
    const expected = json<PublishedPaper[]>("top_papers.json")
      .filter((r) => r.year != null && r.year >= 2010 && r.year <= 2020)
      .sort((a, b) => (a.citation_count ?? 0) - (b.citation_count ?? 0));
    expect(result.data.total).toBe(expected.length);
    expect(result.data.rows.map((p) => p.arxiv_id)).toEqual(expected.slice(1, 4).map((p) => p.arxiv_id));
    const topics = (await a.papers(new URLSearchParams("list=top_papers&limit=2000"))).data;
    const topic = "Artificial Intelligence";
    expect(topics.facets.topic.find((f) => f.value === topic)?.count).toBe(
      topics.rows.filter((r) => r.topic_tags?.includes(topic)).length,
    );
    expect((await a.papers(new URLSearchParams("limit=NaN&offset=-10"))).data).toMatchObject({ limit: 50, offset: 0 });
    expect((await a.papers(new URLSearchParams("list=absent"))).data.rows).toEqual([]);
  });
  it("folds accents and searches titles, real path authors, topics and keywords with bounds", async () => {
    const { a } = adapter();
    expect(await a.search("átténtion")).toEqual(await a.search("attention"));
    expect(await a.search("attention", 1)).toHaveLength(1);
    expect(await a.search("", 20)).toEqual([]);
    expect(await a.search("attention", -1)).toEqual([]);
    const paths = json<{ items: ReadingPath[] }>("paths.json").items;
    const readings = paths.flatMap((p) => p.papers);
    const indexed = (await a.papers(new URLSearchParams("limit=2000"))).data.rows;
    const reading = readings.find((r) => r.authors.length && indexed.some((p) => p.id === r.id));
    expect(reading).toBeDefined();
    expect((await a.search(reading?.authors[0] ?? "")).some((h) => h.id === reading?.id)).toBe(true);
    expect(
      (await a.papers(new URLSearchParams({ q: reading?.authors[0] ?? "", limit: "2000" }))).data.rows.some(
        (p) => p.id === reading?.id,
      ),
    ).toBe(true);
    expect((await a.search("Handwritten Text Recognition Techniques")).length).toBeGreaterThan(0);
    expect((await a.search("BLEU")).length).toBeGreaterThan(0);
  });
  it("serves detail, public markdown and only actual reading-path memberships", async () => {
    const { a } = adapter();
    const detail = await a.paper("arxiv:1706.03762");
    expect(detail?.data.paper.title).toBe("Attention Is All You Need");
    expect(detail?.data.markdown).toBe(fixture("paper-1706.03762.md"));
    expect(detail?.data.edgeNote).toBe(EDGE_NOTE);
    expect(detail?.data).not.toHaveProperty("references");
    expect(detail?.data.paths.map((p) => p.id)).toEqual(
      json<{ items: ReadingPath[] }>("paths.json")
        .items.filter((p) => p.papers.some((r) => r.id === "arxiv:1706.03762" || r.arxivId === "1706.03762"))
        .map((p) => p.id),
    );
    const path = await a.path("sutskever-carmack-core");
    expect(path?.data).toEqual(json<{ items: ReadingPath[] }>("paths.json").items[0]);
    expect(await a.paper("arxiv:missing")).toBeNull();
    expect(await a.path("missing")).toBeNull();
  });
  it("records license, read time, response freshness and unknown collection date", async () => {
    const { a } = adapter();
    const result = await a.papers();
    expect(result.provenance).toMatchObject({
      source: "Research Papers (High Signal), CC-BY 4.0",
      collectedAt: null,
      fetchedAt: now().toISOString(),
      via: "public site JSON exports",
    });
    expect(result.provenance.note).toContain("Collection date is not recorded");
    expect(result.freshness["/data/top_papers.json"]).toBe("2026-10-09T03:10:00.000Z");
    const summary = await a.summary();
    expect(summary.counts).toMatchObject({
      "corpus papers": json<{ papers_total: number }>("summary.json").papers_total,
      "corpus edges (not exported)": 8981698,
      "reading paths": 10,
      "cited works": 200,
      authors: 200,
    });
    expect((await a.paths()).data.generatedAt).toBe("2026-10-09T03:05:04.143Z");
    for (const result of [await a.paths(), await a.citedWorks(), await a.authors()])
      expect(result.provenance.collectedAt).toBeNull();
  });
  it("degrades missing files explicitly while retaining available records", async () => {
    const { a } = adapter(["/data/hot.json", "/data/summary.json", "/paths.json"]);
    const result = await a.papers(new URLSearchParams("limit=2000"));
    expect(result.missing).toEqual(["/data/hot.json", "/paths.json"]);
    expect(result.provenance.note).toContain("Unavailable exports");
    expect(result.data.rows.length).toBeGreaterThan(200);
    expect(result.data.rows.every((r) => !r.lists.includes("hot"))).toBe(true);
    const summary = await a.summary();
    expect(summary.counts).not.toHaveProperty("corpus papers");
    expect((await a.paths()).missing).toEqual(["/paths.json"]);
    expect((await a.paper("arxiv:1706.03762"))?.data.paths).toEqual([]);
    const fallback = createPapersAdapter({ now, fetch: async () => new Response("[]") });
    expect((await fallback.authors()).freshness["/data/top_authors.json"]).toBe(now().toISOString());
  });
  it("wires GET API routes, summaries, search, base override and 404s without network", async () => {
    const { fetch, calls } = reader();
    const a = createPapersAdapter({ fetch, now, base: "https://fixtures.example" });
    const app = createApp({
      nomad: async () => ({ cities: [], count: 0 }),
      podcasts: () => createPodcastsAdapter({ fetch: async () => Response.json({}) }),
      papers: (env) => {
        expect(env.RESEARCH_PAPERS_BASE).toBe("https://fixtures.example");
        return a;
      },
    });
    const get = async (path: string) =>
      app.request(path, undefined, { RESEARCH_PAPERS_BASE: "https://fixtures.example" });
    for (const route of [
      "papers?list=top_papers&limit=2",
      "papers/arxiv:1706.03762",
      "paths",
      "paths/sutskever-carmack-core",
      "cited-works",
      "authors",
    ]) {
      const response = await get(`/api/papers/${route}`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as { provenance: { source: string } }).provenance.source).toContain("CC-BY 4.0");
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
    }
    expect((await get("/api/papers/papers/openreview:missing")).status).toBe(404);
    expect((await get("/api/papers/paths/missing")).status).toBe(404);
    expect(
      (
        (await get("/api/collections").then((r) => r.json())) as {
          collections: { id: string; counts: { papers: number } }[];
        }
      ).collections.find((c: { id: string }) => c.id === "papers")?.counts.papers,
    ).toBe((await a.summary()).counts.papers);
    expect(
      ((await get("/api/search?collection=papers&q=attention").then((r) => r.json())) as { hits: unknown[] }).hits
        .length,
    ).toBeGreaterThan(0);
    expect(calls.every((url) => url.startsWith("https://fixtures.example/"))).toBe(true);
  });
});
