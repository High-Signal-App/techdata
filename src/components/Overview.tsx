import { ErrorState } from "@saas-maker/ui/components/error-state";
import { ArrowUpRightIcon } from "lucide-react";
import { useMemo } from "react";
import type { CollectionSummary } from "../adapters/types";
import { useJsonResource } from "../lib/resource";
import { formatDate } from "../lib/url-state";

export type OverviewRow = CollectionSummary | { id: string; error: string };

export const VIEWS: Record<string, { label: string; href: string }[]> = {
  ph: [{ label: "products", href: "/ph/" }],
  reddit: [
    { label: "subreddits", href: "/reddit/" },
    { label: "threads", href: "/reddit/posts/" },
  ],
  nomad: [
    { label: "places", href: "/nomad/" },
    { label: "compare", href: "/nomad/compare/" },
    { label: "data notes", href: "/nomad/notes/" },
  ],
  papers: [
    { label: "papers", href: "/papers/" },
    { label: "reading paths", href: "/papers/paths/" },
    { label: "cited works", href: "/papers/cited/" },
    { label: "authors", href: "/papers/authors/" },
  ],
  podcasts: [
    { label: "claims", href: "/podcasts/claims/" },
    { label: "episodes", href: "/podcasts/" },
    { label: "people", href: "/podcasts/people/" },
  ],
};

export const NAMES: Record<string, string> = {
  ph: "PH Catalog",
  reddit: "Reddit Insights",
  nomad: "Nomad Atlas",
  podcasts: "High Signal Podcasts",
  papers: "Research Papers",
};

/** One row per collection: what it holds, where it comes from, how fresh it is. */
export default function Overview({ rows }: { rows: OverviewRow[] }) {
  const initial = useMemo(() => ({ collections: rows }), [rows]);
  const resource = useJsonResource("/api/collections", initial);
  const collections = resource.data?.collections ?? rows;
  return (
    <>
      {resource.status === "error" && (
        <ErrorState title="the sources did not answer." description={null} onRetry={resource.retry} />
      )}
      <ul className="flex max-w-4xl flex-col divide-y divide-border border-y border-border">
        {collections.map((c) => (
          <li key={c.id} className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_16rem] md:gap-10">
            <div className="min-w-0">
              <h2 className="font-display text-2xl normal-case">{"label" in c ? c.label : NAMES[c.id]}</h2>
              {"error" in c ? (
                <ErrorState title={c.error.toLowerCase()} description={null} onRetry={resource.retry} />
              ) : (
                <>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.description}</p>
                  {c.id === "papers" && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.provenance.note}</p>
                  )}
                  <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
                    {Object.entries(c.counts).map(([k, v]) => (
                      <div key={k}>
                        <dt className="ui-case text-xs text-muted-foreground">{k}</dt>
                        <dd className="text-lg font-medium tabular-nums">{v.toLocaleString("en-US")}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              <nav aria-label={`${NAMES[c.id]} views`} className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {VIEWS[c.id]?.map((v) => (
                  <a key={v.href} href={v.href} className="ui-case underline-offset-4 hover:underline">
                    {v.label}
                  </a>
                ))}
              </nav>
            </div>
            {"provenance" in c && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">source</dt>
                <dd className="min-w-0 truncate">
                  <a
                    href={c.provenance.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    {c.provenance.source}
                    <ArrowUpRightIcon className="size-3.5 text-muted-foreground" aria-hidden />
                  </a>
                </dd>
                <dt className="text-muted-foreground">via</dt>
                <dd className="min-w-0 truncate">{c.provenance.via}</dd>
                {c.provenance.collectedAt ? (
                  <>
                    <dt className="text-muted-foreground">collected</dt>
                    <dd>{formatDate(c.provenance.collectedAt)}</dd>
                  </>
                ) : (
                  c.provenance.fetchedAt && (
                    <>
                      <dt className="text-muted-foreground">read</dt>
                      <dd>{formatDate(c.provenance.fetchedAt)}</dd>
                    </>
                  )
                )}
                <dt className="text-muted-foreground">mode</dt>
                <dd>{c.mode}</dd>
              </dl>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
