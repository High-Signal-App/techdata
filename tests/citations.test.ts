import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildGraph,
  collectionPapers,
  fetchWorks,
  normalizeArxiv,
  normalizeDoi,
  paperIdentifiers,
  politeFetch,
} from "../scripts/papers-citations.mjs";
import { type CitationGraph, CitationLists } from "../src/components/papers/Citations";

const works = JSON.parse(readFileSync(new URL("./fixtures/citations/works.json", import.meta.url), "utf8"));
const papers = collectionPapers([
  [
    { arxiv_id: "1706.03762", title: "Attention", citation_count: 12 },
    { paper_id: "openreview:verified", doi: "10.1234/verified", title: "Verified DOI" },
    { arxiv_id: "2000.00001", title: "Conflict" },
    { paper_id: "openreview:unknown", title: "Attention" },
  ],
  [{ arxiv_id: "1706.03762", title: "Lower priority", citation_count: 99 }],
]);
const fetchedAt = "2026-10-10T12:00:00.000Z";
const graph = buildGraph(papers, works, fetchedAt) as CitationGraph & { edges: string[][] };

describe("OpenAlex citation snapshot", () => {
  it("normalizes DOI and versioned/legacy arXiv identifiers without title inference", () => {
    expect(normalizeDoi("https://doi.org/10.1234/ABC")).toBe("10.1234/abc");
    expect(normalizeDoi("not a DOI")).toBeNull();
    expect(normalizeArxiv("https://arxiv.org/pdf/hep-th/9901001v2.pdf")).toBe("hep-th/9901001");
    expect(normalizeArxiv("1706.03762v5")).toBe("1706.03762");
    expect(normalizeArxiv("https://example.com/1706.03762")).toBeNull();
    expect(paperIdentifiers({ id: "arxiv:1706.03762" }).lookup).toEqual(["10.48550/arxiv.1706.03762"]);
    expect(papers.find((p) => p.id === "arxiv:1706.03762")).toMatchObject({ title: "Attention", citation_count: 12 });
  });

  it("verifies alternate DOI locations, excludes outsiders/self/duplicates and retains reciprocal lists", () => {
    expect(graph.edges).toEqual([["arxiv:1706.03762", "openreview:verified"]]);
    expect(graph.papers["arxiv:1706.03762"].references).toEqual(["openreview:verified"]);
    expect(graph.papers["openreview:verified"].citedBy).toEqual(["arxiv:1706.03762"]);
    expect(graph.papers["arxiv:2000.00001"].status).toBe("ambiguous");
    expect(graph.papers["openreview:unknown"].status).toBe("unmatched");
    expect(buildGraph([...papers].reverse(), [...works].reverse(), fetchedAt)).toEqual(graph);
  });

  it("uses batches of at most 50, mailto, verified fields and cursor pagination", async () => {
    const urls: URL[] = [];
    const get = vi.fn(async (raw: string) => {
      const url = new URL(raw);
      urls.push(url);
      return url.searchParams.get("cursor") === "*"
        ? { results: [works[0]], meta: { next_cursor: "next" } }
        : { results: [], meta: { next_cursor: null } };
    });
    await fetchWorks(
      Array.from({ length: 51 }, (_, n) => `10.1234/${n}`),
      get,
    );
    expect(urls).toHaveLength(4);
    for (const url of urls) {
      expect(url.searchParams.get("filter")?.slice(4).split("|").length).toBeLessThanOrEqual(50);
      expect(url.searchParams.get("mailto")).toBe("techdata@users.noreply.github.com");
      expect(url.searchParams.get("select")).toContain("referenced_works");
    }
    await expect(fetchWorks(["10.1234/invalid"], async () => ({ results: [{}] }))).rejects.toThrow("Invalid OpenAlex");
  });

  it("paces starts and retries 429/5xx/network failures; fails fast on permanent errors", async () => {
    let time = 0;
    const starts: number[] = [];
    const responses = [
      new Response("", { status: 429, headers: { "retry-after": "2" } }),
      new Response("", { status: 503 }),
      new Response('{"results":[]}'),
    ];
    const get = politeFetch({
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
      fetcher: async () => {
        starts.push(time);
        return responses.shift() as Response;
      },
    });
    expect(await get("https://api.openalex.org/works")).toEqual({ results: [] });
    expect(starts).toEqual([0, 2000, 4000]);
    const fetcher = vi.fn(async () => new Response("", { status: 400 }));
    await expect(politeFetch({ fetcher, sleep: async () => {} })("https://api.openalex.org/works")).rejects.toThrow(
      "400",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const network = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      politeFetch({ fetcher: network, sleep: async () => {} })("https://api.openalex.org/works"),
    ).rejects.toThrow("offline");
    expect(network).toHaveBeenCalledTimes(5);
  });

  it("renders in-app links, both directions, attribution/date and honest unavailable states", () => {
    const render = (id: string) => renderToStaticMarkup(createElement(CitationLists, { id, graph }));
    const references = render("arxiv:1706.03762");
    expect(references).toContain("/papers/?paper=openreview%3Averified");
    expect(references).toContain("Verified DOI");
    expect(references).toContain("references within this collection");
    expect(references).toContain("cited by within this collection");
    expect(references).toContain("OpenAlex (CC0)");
    expect(references).toContain("10 Oct 2026");
    expect(render("openreview:verified")).toContain("/papers/?paper=arxiv%3A1706.03762");
    expect(render("openreview:unknown")).toContain("No verified OpenAlex identifier match");
    expect(render("arxiv:2000.00001")).toContain("conflicting identifier matches");
    expect(render("new-paper")).toContain("No verified OpenAlex identifier match");
  });
});
