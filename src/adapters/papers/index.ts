/** Read-only public exports; operator ClickHouse stays private. */
import { type FilterDef, facetCounts, filterRows, readFilters } from "@saas-maker/ui/lib/filters";
import { fold } from "../nomad/model.js";
import type { CollectionSummary, Provenance, SearchHit } from "../types";

export const PAPERS_BASE = "https://papers.highsignal.app";
export const PAPERS_SOURCE = "Research Papers (High Signal), CC-BY 4.0";
export const EDGE_NOTE =
  "Citation edges are not in the public export (operator ClickHouse only). Paper details separately show identifier-verified OpenAlex links within this collection.";
export const PAPER_LISTS = ["top_papers", "hot", "sleepers", "review_top_papers"] as const;
export type PaperList = (typeof PAPER_LISTS)[number];
export type PublishedPaper = {
  doi?: string;
  arxiv_id?: string;
  paper_id?: string;
  title: string;
  authors?: string[];
  year?: number;
  primary_category?: string;
  submitted_date?: string;
  citation_count?: number;
  cites_per_year?: number;
  in_corpus_degree?: number;
  pagerank_score?: number;
  pagerank?: number;
  katz_score?: number;
  topic_tags?: string[];
  top_keywords?: string[];
  avg_rating?: number | null;
  avg_confidence?: number;
  n_reviews?: number;
  venue?: string;
  decision?: string;
  hotness?: number;
  n_urls?: number;
  source?: string;
};
export type Paper = PublishedPaper & {
  id: string;
  lists: PaperList[];
  /** Preserve differing metrics exactly as each list published them. */
  published: Partial<Record<PaperList, PublishedPaper>>;
};
export type Reading = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  url: string;
  arxivId?: string;
  kind?: string;
  relation?: string;
  brief?: string;
  focus?: string;
};
export type ReadingPath = {
  id: string;
  title: string;
  subtitle: string;
  audience: string;
  estimate: string;
  status: string;
  difficulty: string;
  outcome: string;
  sourceNote: string;
  trustNote: string;
  tags: string[];
  tracks: string[];
  sourceUrls: { label: string; url: string }[];
  papers: Reading[];
};
export type CitedWork = {
  title: string;
  global_citations: number;
  in_corpus_citations: number;
  arxiv_id: string | null;
  doi: string | null;
  publication_year: number | null;
  primary_topic: string | null;
};
export type Author = {
  author: string;
  n_papers: number;
  sum_citations: number;
  sum_pr: number;
  top_arxiv_ids: string[];
};
export type Envelope<T> = { data: T; provenance: Provenance; missing: string[]; freshness: Record<string, string> };
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Resource = { data: unknown; fetchedAt: string; freshness: string; missing: boolean };

/** Years are identifiers, not quantities: never group their digits. */
export const formatYear = (year: number | null | undefined) => (year == null ? "" : String(year));
export const paperYear = (p: Paper) => p.year ?? (p.submitted_date ? Number(p.submitted_date.slice(0, 4)) : null);
export const paperSearchText = (p: Paper) =>
  [p.title, ...(p.authors ?? []), ...(p.topic_tags ?? []), ...(p.top_keywords ?? [])].join(" ");
export const paperFilters: FilterDef<Paper>[] = [
  { kind: "facet", id: "list", label: "published list", value: (p) => p.lists },
  { kind: "facet", id: "category", label: "primary category", value: (p) => p.primary_category },
  { kind: "range", id: "year", label: "year", value: paperYear, format: formatYear, step: 1 },
  { kind: "facet", id: "venue", label: "venue", value: (p) => p.venue },
  { kind: "facet", id: "decision", label: "decision", value: (p) => p.decision },
  { kind: "facet", id: "topic", label: "topic tag", value: (p) => [...new Set(p.topic_tags ?? [])] },
];
export const paperSortFields = [
  "title",
  "year",
  "primary_category",
  "citation_count",
  "cites_per_year",
  "in_corpus_degree",
  "pagerank_score",
  "katz_score",
  "avg_rating",
  "venue",
  "decision",
] as const;
export function sortPapers(rows: Paper[], raw = "citation_count:desc") {
  const [key, direction] = raw.split(":");
  const id = paperSortFields.find((s) => s === key) ?? "citation_count";
  const value = (p: Paper) => (id === "year" ? paperYear(p) : p[id]);
  return [...rows].sort((a, b) => {
    const x = value(a),
      y = value(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null) || a.id.localeCompare(b.id);
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return (direction === "asc" ? cmp : -cmp) || a.id.localeCompare(b.id);
  });
}
const bounded = (raw: string | null, fallback: number, max: number) => {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.trunc(n))) : fallback;
};

export function createPapersAdapter(opts: { base?: string; fetch?: Fetcher; now?: () => Date } = {}) {
  const base = (opts.base ?? PAPERS_BASE).replace(/\/$/, "");
  const doFetch = opts.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const now = opts.now ?? (() => new Date());
  const cache = new Map<string, Promise<Resource>>();
  function get(path: string) {
    let promise = cache.get(path);
    if (!promise) {
      promise = (async () => {
        const fetchedAt = now().toISOString();
        try {
          const res = await doFetch(base + path, {
            headers: { accept: path.endsWith(".md") ? "text/markdown" : "application/json" },
          });
          if (!res.ok) throw new Error(String(res.status));
          const data: unknown = path.endsWith(".md") ? await res.text() : await res.json();
          const header = res.headers.get("last-modified") ?? res.headers.get("date");
          const date = header ? new Date(header) : null;
          return {
            data,
            fetchedAt,
            freshness: date && !Number.isNaN(date.getTime()) ? date.toISOString() : fetchedAt,
            missing: false,
          };
        } catch {
          return { data: null, fetchedAt, freshness: fetchedAt, missing: true };
        }
      })();
      cache.set(path, promise);
    }
    return promise;
  }
  async function wrap<T>(data: T, paths: string[]): Promise<Envelope<T>> {
    const resources = await Promise.all(paths.map(get));
    const missing = paths.filter((_, i) => resources[i].missing);
    return {
      data,
      missing,
      freshness: Object.fromEntries(paths.map((p, i) => [p, resources[i].freshness])),
      provenance: {
        source: PAPERS_SOURCE,
        sourceUrl: `${base}/data`,
        via: "public site JSON exports",
        viaUrl: base + paths[0],
        collectedAt: null,
        fetchedAt: resources
          .map((r) => r.fetchedAt)
          .sort()
          .at(-1),
        note: `CC-BY 4.0. Collection date is not recorded in the public exports; submitted dates and paths.generatedAt are not collection dates. ${EDGE_NOTE}${missing.length ? ` Unavailable exports: ${missing.join(", ")}. Counts cover available files only.` : ""}`,
      },
    };
  }
  const listPaths = PAPER_LISTS.map((list) => `/data/${list}.json`);
  let indexCache: Promise<Paper[]> | undefined;
  function index() {
    indexCache ??= (async () => {
      const files = await Promise.all(listPaths.map(get));
      const papers = new Map<string, Paper>();
      files.forEach((file, i) => {
        if (!Array.isArray(file.data)) return;
        for (const raw of file.data as PublishedPaper[]) {
          const id = raw.paper_id ?? (raw.arxiv_id ? `arxiv:${raw.arxiv_id}` : null);
          if (!id || !/^(arxiv|openreview):[^\s]+$/.test(id)) continue;
          const previous = papers.get(id);
          const list = PAPER_LISTS[i];
          // Top-papers metrics win when lists disagree; retain every raw list record.
          const fields = Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null));
          const merged = {
            ...fields,
            ...previous,
            id,
            lists: [...(previous?.lists ?? []), list],
            published: { ...previous?.published, [list]: raw },
          } as Paper;
          if (merged.pagerank_score == null && merged.pagerank != null) merged.pagerank_score = merged.pagerank;
          papers.set(id, merged);
        }
      });
      const file = await get("/paths.json");
      const paths = (file.data as { items?: ReadingPath[] } | null)?.items ?? [];
      for (const path of paths)
        for (const reading of path.papers) {
          const id = reading.arxivId ? `arxiv:${reading.arxivId}` : reading.id;
          const paper = papers.get(id);
          if (paper) paper.authors = [...new Set([...(paper.authors ?? []), ...(reading.authors ?? [])])];
        }
      return [...papers.values()];
    })();
    return indexCache;
  }
  async function paths() {
    const file = await get("/paths.json");
    const raw = file.data as { items?: ReadingPath[]; generatedAt?: string } | null;
    return wrap({ rows: raw?.items ?? [], generatedAt: raw?.generatedAt ?? null }, ["/paths.json"]);
  }
  async function citedWorks() {
    const file = await get("/data/top_cited_works.json");
    return wrap({ rows: Array.isArray(file.data) ? (file.data as CitedWork[]) : [] }, ["/data/top_cited_works.json"]);
  }
  async function authors() {
    const file = await get("/data/top_authors.json");
    return wrap({ rows: Array.isArray(file.data) ? (file.data as Author[]) : [] }, ["/data/top_authors.json"]);
  }
  return {
    id: "papers",
    paths,
    citedWorks,
    authors,
    async papers(params = new URLSearchParams()) {
      const all = await index();
      const filters = readFilters(paperFilters, params);
      const rows = sortPapers(
        filterRows(all, paperFilters, filters, { search: paperSearchText }),
        params.get("sort") ?? undefined,
      );
      const limit = Math.max(1, bounded(params.get("limit"), 50, 2000));
      const offset = bounded(params.get("offset"), 0, 100_000);
      const facets = Object.fromEntries(
        paperFilters
          .filter((d) => d.kind === "facet")
          .map((d) => [d.id, facetCounts(all, paperFilters, filters, d.id, { search: paperSearchText })]),
      );
      return wrap({ rows: rows.slice(offset, offset + limit), total: rows.length, limit, offset, facets, filters }, [
        ...listPaths,
        "/paths.json",
      ]);
    },
    async paper(id: string) {
      const paper = (await index()).find((p) => p.id === id);
      if (!paper) return null;
      const readings = await paths();
      const memberships = readings.data.rows.filter((path) =>
        path.papers.some((r) => r.id === id || (r.arxivId && `arxiv:${r.arxivId}` === id)),
      );
      const markdownPath =
        paper.lists.includes("top_papers") && paper.arxiv_id ? `/paper/${encodeURIComponent(paper.arxiv_id)}.md` : null;
      const markdown = markdownPath ? ((await get(markdownPath)).data as string | null) : null;
      return wrap({ paper, paths: memberships, markdown, edgeNote: EDGE_NOTE }, [
        ...listPaths,
        "/paths.json",
        ...(markdownPath ? [markdownPath] : []),
      ]);
    },
    async path(id: string) {
      const result = await paths();
      const path = result.data.rows.find((p) => p.id === id);
      return path ? { ...result, data: path } : null;
    },
    async summary(): Promise<CollectionSummary & Pick<Envelope<null>, "freshness" | "missing">> {
      const [papers, readingPaths, cited, people, corpus] = await Promise.all([
        index(),
        paths(),
        citedWorks(),
        authors(),
        get("/data/summary.json"),
      ]);
      const totals = corpus.data as { papers_total?: number; paper_edges?: number } | null;
      const counts: Record<string, number> = {
        papers: papers.length,
        "reading paths": readingPaths.data.rows.length,
        "cited works": cited.data.rows.length,
        authors: people.data.rows.length,
      };
      if (typeof totals?.papers_total === "number") counts["corpus papers"] = totals.papers_total;
      if (typeof totals?.paper_edges === "number") counts["corpus edges (not exported)"] = totals.paper_edges;
      const result = await wrap(null, [
        ...listPaths,
        "/data/summary.json",
        "/paths.json",
        "/data/top_cited_works.json",
        "/data/top_authors.json",
      ]);
      return {
        id: "papers",
        label: "Research Papers",
        description:
          "Selected public papers, citation metrics, reviews and attributed reading paths; not the full operator corpus.",
        counts,
        freshness: result.freshness,
        missing: result.missing,
        provenance: result.provenance,
        mode: "read-only",
      };
    },
    async search(query: string, limit = 6): Promise<SearchHit[]> {
      const terms = fold(query.trim().slice(0, 200)).split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      return (await index())
        .filter((p) => {
          const text = fold(paperSearchText(p));
          return terms.every((t) => text.includes(t));
        })
        .slice(0, Math.max(0, Math.min(20, Number.isFinite(limit) ? Math.trunc(limit) : 6)))
        .map((p) => ({
          collection: "papers",
          kind: "papers",
          id: p.id,
          title: p.title,
          subtitle: p.primary_category ?? p.venue,
          href: `/papers/?paper=${encodeURIComponent(p.id)}`,
        }));
    },
  };
}
export type PapersAdapter = ReturnType<typeof createPapersAdapter>;
