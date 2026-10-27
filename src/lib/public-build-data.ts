import { nomadSummary } from "../adapters/nomad/meta";
import { createPapersAdapter } from "../adapters/papers";
import { phAdapter } from "../adapters/ph";
import { createPodcastsAdapter } from "../adapters/podcasts";
import { createRedditAdapter } from "../adapters/reddit";

/** One public build snapshot feeds HTML initial props and Markdown. No user state. */
export async function capturePublicBuild() {
  const bounded: typeof fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const podcasts = createPodcastsAdapter({ fetch: bounded });
  const papers = createPapersAdapter({ fetch: bounded });
  const summaries = Promise.allSettled([
    Promise.resolve(nomadSummary),
    podcasts.summary(),
    createRedditAdapter({ fetch: bounded }).summary(),
    phAdapter.summary(),
    papers.summary(),
  ]);
  const [results, claims, episodes, people, paperRows, paths, cited, authors] = await Promise.all([
    summaries,
    podcasts.claims(new URLSearchParams()).catch(() => null),
    podcasts.episodes(new URLSearchParams({ limit: "50" })).catch(() => null),
    podcasts.people(new URLSearchParams({ limit: "50", offset: "0" })).catch(() => null),
    papers
      .papers(new URLSearchParams({ limit: "10" }))
      .then(({ data, ...metadata }) => ({ ...metadata, data: { rows: data.rows, total: data.total } }))
      .catch(() => null),
    papers.paths().catch(() => null),
    papers.citedWorks().catch(() => null),
    papers.authors().catch(() => null),
  ]);
  const ids = ["nomad", "podcasts", "reddit", "ph", "papers"];
  return {
    capturedAt: new Date().toISOString(),
    overview: results.map((result, i) =>
      result.status === "fulfilled" ? result.value : { id: ids[i], error: "The source did not answer at build time." },
    ),
    claims,
    episodes,
    people,
    papers: paperRows,
    paths,
    cited,
    authors,
  };
}
export type PublicBuildSnapshot = Awaited<ReturnType<typeof capturePublicBuild>>;
