import { mkdir, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const LISTS = ["top_papers", "hot", "sleepers", "review_top_papers"];
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function normalizeDoi(value) {
  if (typeof value !== "string") return null;
  const doi = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}

export function normalizeArxiv(value) {
  if (typeof value !== "string") return null;
  const id = value
    .trim()
    .replace(/^arxiv:/i, "")
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "")
    .toLowerCase();
  return /^(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})$/.test(id) ? id : null;
}

/** Same list precedence and membership as the papers adapter; no title matching. */
export function collectionPapers(lists) {
  const papers = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) throw new Error("Paper export must be an array");
    for (const raw of list) {
      const id = raw.paper_id ?? (raw.arxiv_id ? `arxiv:${raw.arxiv_id}` : null);
      if (!id || !/^(arxiv|openreview):[^\s]+$/.test(id)) continue;
      papers.set(id, {
        ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null)),
        ...papers.get(id),
        id,
      });
    }
  }
  return [...papers.values()].sort((a, b) => compare(a.id, b.id));
}

export function paperIdentifiers(paper) {
  const arxiv = normalizeArxiv(paper.arxiv_id ?? (paper.id?.startsWith("arxiv:") ? paper.id.slice(6) : null));
  const doi = normalizeDoi(paper.doi);
  return { arxiv, doi, lookup: [...new Set([doi, arxiv ? `10.48550/arxiv.${arxiv}` : null].filter(Boolean))] };
}

/** OpenAlex may return a different primary DOI: verify all published locations. */
export function workIdentifiers(work) {
  const locations = work.locations ?? [];
  const dois = new Set([work.doi, work.ids?.doi, ...locations.map((l) => l.doi)].map(normalizeDoi).filter(Boolean));
  const arxiv = new Set(
    locations
      .flatMap((l) => [l.landing_page_url, l.pdf_url])
      .map(normalizeArxiv)
      .filter(Boolean),
  );
  for (const doi of dois)
    if (doi.startsWith("10.48550/arxiv.")) {
      const id = normalizeArxiv(doi.slice("10.48550/arxiv.".length));
      if (id) arxiv.add(id);
    }
  return { dois, arxiv };
}

export function buildGraph(papers, works, fetchedAt) {
  const verified = [...new Map(works.map((work) => [work.id, work])).values()].filter((work) =>
    /^https:\/\/openalex\.org\/W\d+$/.test(work.id),
  );
  const identities = verified.map((work) => ({ work, identifiers: workIdentifiers(work) }));
  const byWork = new Map();
  /** @type {import("../src/components/papers/Citations").CitationGraph["papers"]} */
  const records = {};
  for (const paper of [...papers].sort((a, b) => compare(a.id, b.id))) {
    const ids = paperIdentifiers(paper);
    const matches = identities.filter(
      ({ identifiers }) =>
        (ids.doi && identifiers.dois.has(ids.doi)) || (ids.arxiv && identifiers.arxiv.has(ids.arxiv)),
    );
    // Conflicting identifier matches stay explicitly unavailable, never guessed.
    const match = matches.length === 1 ? matches[0].work : null;
    records[paper.id] = {
      title: paper.title,
      status: match ? "matched" : matches.length ? "ambiguous" : "unmatched",
      openalex: match?.id ?? null,
      references: [],
      citedBy: [],
    };
    if (match) byWork.set(match.id, [...(byWork.get(match.id) ?? []), paper.id]);
  }
  const edges = [];
  for (const work of verified) {
    for (const from of byWork.get(work.id) ?? []) {
      for (const target of [...new Set(work.referenced_works ?? [])].sort(compare)) {
        if (target === work.id) continue;
        for (const to of byWork.get(target) ?? []) {
          edges.push([from, to]);
          records[from].references.push(to);
          records[to].citedBy.push(from);
        }
      }
    }
  }
  for (const record of Object.values(records)) {
    record.references.sort(compare);
    record.citedBy.sort(compare);
  }
  edges.sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]));
  return {
    version: 1,
    source: "OpenAlex (CC0)",
    sourceUrl: "https://openalex.org/",
    fetchedAt,
    collectionSource: "https://papers.highsignal.app/data",
    collectionFetchedAt: fetchedAt,
    note: "Identifier-matched papers only. References and cited-by are restricted to this public collection and this snapshot; unmatched papers and citations outside it are not covered.",
    edges,
    papers: records,
  };
}

/** Serial requests: at most 8/s, including retries; bounded exponential backoff. */
export function politeFetch({
  fetcher = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
} = {}) {
  let lastStart = -Infinity;
  return async (url) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(Math.max(0, 125 - (now() - lastStart)));
      lastStart = now();
      let response;
      try {
        response = await fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      } catch (error) {
        if (attempt === 4) throw error;
      }
      if (response?.ok) return response.json();
      if (response && response.status !== 429 && response.status < 500)
        throw new Error(`GET ${new URL(url).origin}: ${response.status}`);
      if (attempt === 4) throw new Error(`Upstream unavailable after 5 attempts: ${new URL(url).origin}`);
      const retry = response?.headers.get("retry-after");
      const seconds = retry ? Number(retry) : NaN;
      const delay = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - now() : 0;
      await sleep(Math.min(30000, Math.max(1000 * 2 ** attempt, delay || 0)));
    }
  };
}

export async function fetchWorks(dois, get) {
  const works = [];
  const ids = [...new Set(dois)].sort(compare);
  for (let offset = 0; offset < ids.length; offset += 50) {
    let cursor = "*";
    do {
      const url = new URL("https://api.openalex.org/works");
      url.search = new URLSearchParams({
        filter: `doi:${ids.slice(offset, offset + 50).join("|")}`,
        "per-page": "200",
        select: "id,doi,ids,locations,referenced_works",
        mailto: "techdata@users.noreply.github.com",
        cursor,
      }).toString();
      const page = await get(url.href);
      if (!Array.isArray(page.results) || page.results.some((w) => !Array.isArray(w.referenced_works)))
        throw new Error("Invalid OpenAlex works response");
      works.push(...page.results);
      const next = page.meta?.next_cursor;
      if (next === cursor) throw new Error("OpenAlex cursor did not advance");
      cursor = page.results.length ? next : null;
    } while (cursor);
  }
  return works;
}

export async function main() {
  const get = politeFetch();
  const fetchedAt = new Date().toISOString();
  const lists = [];
  for (const list of LISTS) lists.push(await get(`https://papers.highsignal.app/data/${list}.json`));
  const papers = collectionPapers(lists);
  if (!papers.length) throw new Error("Empty collection; refusing to replace the graph");
  const works = await fetchWorks(
    papers.flatMap((p) => paperIdentifiers(p).lookup),
    get,
  );
  const graph = buildGraph(papers, works, fetchedAt);
  const json = `${JSON.stringify(graph)}\n`;
  if (Buffer.byteLength(json) > 1500000)
    throw new Error("Citation snapshot exceeds 1.5 MB; keep existing output and arrange lazy storage");
  const output = new URL("../public/data/papers/citations.json", import.meta.url);
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(`${fileURLToPath(output)}.tmp`, json);
  await rename(`${fileURLToPath(output)}.tmp`, output);
  console.log(
    `${papers.length} papers, ${Object.values(graph.papers).filter((p) => p.status === "matched").length} matched, ${graph.edges.length} edges; ${Buffer.byteLength(json)} bytes`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
