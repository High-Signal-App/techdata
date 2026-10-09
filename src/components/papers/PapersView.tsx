import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import {
  ActiveFilters,
  FacetFilter,
  FilterBar,
  FilterSearch,
  RangeFilter,
  useUrlFilters,
} from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { type DataColumn, DataTable } from "@saas-maker/ui/components/data-table";
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import { facetCounts, filterRows, rangeBounds } from "@saas-maker/ui/lib/filters";
import {
  EDGE_NOTE,
  formatYear,
  type Paper,
  paperFilters,
  paperSearchText,
  paperSortFields,
  paperYear,
  type ReadingPath,
  sortPapers,
} from "../../adapters/papers";
import { today, useUrlParam } from "../../lib/url-state";
import { LoadingDetail, MissingExports, PublicProvenance, provenanceColumns, showValue, usePapersApi } from "./shared";

export const paperColumns: DataColumn<Paper>[] = paperSortFields.map((id) => ({
  id,
  header:
    (
      {
        primary_category: "category",
        citation_count: "citations",
        cites_per_year: "cites / yr",
        in_corpus_degree: "in-corpus degree",
        pagerank_score: "PageRank",
        katz_score: "Katz",
        avg_rating: "review rating",
      } as Record<string, string>
    )[id] ?? id,
  value: (p) => (id === "year" ? paperYear(p) : p[id]),
  align: ["title", "primary_category", "venue", "decision"].includes(id) ? "left" : "right",
  hideable: id !== "title",
  hidden: !["title", "year", "primary_category", "citation_count"].includes(id),
  minWidth: id === "title" ? "11rem" : undefined,
  cell:
    id === "title"
      ? (p) => (
          <span title={p.title} className="block max-w-[15rem] truncate font-medium">
            {p.title}
          </span>
        )
      : id === "primary_category"
        ? (p) => (
            <span title={p.primary_category} className="block max-w-[8rem] truncate">
              {p.primary_category ?? "—"}
            </span>
          )
        : id === "year"
          ? (p) => formatYear(paperYear(p)) || "—"
          : ["pagerank_score", "katz_score", "cites_per_year", "avg_rating"].includes(id)
            ? (p) => formatPaperMetric(id, p[id as keyof Paper])
            : undefined,
}));
export const paperExport: ExportColumn<Paper>[] = [
  "id",
  "arxiv_id",
  "paper_id",
  "title",
  "authors",
  "year",
  "primary_category",
  "submitted_date",
  "citation_count",
  "cites_per_year",
  "in_corpus_degree",
  "pagerank_score",
  "katz_score",
  "topic_tags",
  "top_keywords",
  "avg_rating",
  "avg_confidence",
  "n_reviews",
  "venue",
  "decision",
  "hotness",
  "n_urls",
  "lists",
  "published",
].map((id) => ({ id, value: (p) => (id === "year" ? paperYear(p) : p[id as keyof Paper]) }));

const countFields = new Set(["citation_count", "in_corpus_degree", "n_reviews", "n_urls"]);
export function formatPaperMetric(field: string, value: unknown): string {
  if (typeof value !== "number") return value == null ? "—" : showValue(value);
  if (["pagerank_score", "katz_score"].includes(field))
    return value === 0 ? "0" : Number(value.toPrecision(4)).toString();
  return value.toLocaleString("en-US", { maximumFractionDigits: countFields.has(field) ? 0 : 1 });
}
export function paperDetailItems(p: Paper) {
  return paperExport
    .filter((c) => !["arxiv_id", "paper_id", "published", "title"].includes(c.id))
    .map((c) => ({ field: c.id, value: c.value(p) }))
    .filter(({ value }) => value != null && value !== "" && (!Array.isArray(value) || value.length > 0))
    .map(({ field, value }) => ({
      label:
        (
          {
            citation_count: "citations",
            cites_per_year: "cites / year",
            in_corpus_degree: "in-corpus degree",
            pagerank_score: "PageRank",
            katz_score: "Katz",
            avg_rating: "review rating",
            avg_confidence: "review confidence",
            n_reviews: "reviews",
            n_urls: "URLs",
            lists: "published lists",
          } as Record<string, string>
        )[field] ?? field.replaceAll("_", " "),
      value:
        field === "year"
          ? formatYear(value as number)
          : typeof value === "number"
            ? formatPaperMetric(field, value)
            : showValue(value),
    }));
}

export default function PapersView() {
  const [filters, setFilters] = useUrlFilters(paperFilters);
  const [sortParam, setSort] = useUrlParam("sort");
  const [paperId, setPaperId] = useUrlParam("paper");
  const [pageParam, setPage] = useUrlParam("page");
  const [state, retry] = usePapersApi<{ rows: Paper[] }>("papers?limit=2000");
  const all = state.value?.data.rows ?? [];
  const filtered = filterRows(all, paperFilters, filters, { search: paperSearchText });
  const rows = sortPapers(filtered, sortParam ?? undefined);
  const [sortId, direction] = (sortParam ?? "citation_count:desc").split(":");
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const page = Math.min(pageCount - 1, Math.max(0, Number(pageParam ?? 1) - 1) || 0);
  const changeFilters: typeof setFilters = (next) => {
    setFilters(next);
    setPage(null);
  };
  const current = all.find((p) => p.id === paperId);
  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <FilterBar>
          <FilterSearch
            value={filters.q ?? ""}
            onChange={(q) => changeFilters((s) => ({ ...s, q: q || undefined }))}
            placeholder="Title, authors, topics or keywords…"
          />
          {paperFilters.map((def) =>
            def.kind === "facet" ? (
              <FacetFilter
                key={def.id}
                label={def.label}
                options={facetCounts(all, paperFilters, filters, def.id, { search: paperSearchText })}
                selected={filters.facets[def.id] ?? []}
                onChange={(v) => changeFilters((s) => ({ ...s, facets: { ...s.facets, [def.id]: v } }))}
              />
            ) : def.kind === "range" ? (
              <RangeFilter
                key={def.id}
                label={def.label}
                bounds={rangeBounds(all, def.value) ?? { min: 0, max: 0 }}
                value={filters.ranges[def.id]}
                step={1}
                format={def.format}
                onChange={(v) =>
                  changeFilters((s) => {
                    const ranges = { ...s.ranges };
                    if (v) ranges[def.id] = v;
                    else delete ranges[def.id];
                    return { ...s, ranges };
                  })
                }
              />
            ) : null,
          )}
        </FilterBar>
        <ActiveFilters defs={paperFilters} state={filters} onChange={changeFilters} />
      </div>
      <MissingExports missing={state.value?.missing ?? []} />
      <RecordLayout>
        <DataTable
          className="flex-1"
          label="Research papers"
          data={rows.slice(page * 50, (page + 1) * 50)}
          columns={paperColumns}
          getRowId={(p) => p.id}
          status={state.status}
          onRetry={retry}
          error="The public papers exports did not load."
          selectedId={paperId}
          onRowClick={(p) => setPaperId(p.id)}
          sort={[{ id: sortId, desc: direction !== "asc" }]}
          onSortChange={(s) => {
            setSort(s[0] ? `${s[0].id}:${s[0].desc ? "desc" : "asc"}` : null);
            setPage(null);
          }}
          pageSize={50}
          manual={{ rowCount: rows.length, page, onPageChange: (p) => setPage(p ? String(p + 1) : null) }}
          toolbar={() => (
            <>
              <p className="mr-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {rows.length} of {all.length} publicly exported papers
              </p>
              {state.value && (
                <ExportMenu
                  rows={rows}
                  columns={[...paperExport, ...provenanceColumns<Paper>(state.value.provenance)]}
                  filename={`research-papers-${today()}`}
                  meta={{
                    collection: "papers",
                    ...state.value.provenance,
                    license: "CC-BY 4.0",
                    filters,
                    sort: sortParam,
                    missing: state.value.missing,
                  }}
                />
              )}
            </>
          )}
        />
        <RecordDetail
          open={!!paperId}
          onOpenChange={(v) => !v && setPaperId(null)}
          title={current?.title ?? "paper"}
          className="lg:w-[24rem]"
        >
          {paperId && <PaperDetail id={paperId} />}
        </RecordDetail>
      </RecordLayout>
      {state.value && <PublicProvenance info={state.value.provenance} />}
    </>
  );
}
function PaperDetail({ id }: { id: string }) {
  const [state] = usePapersApi<{ paper: Paper; paths: ReadingPath[]; markdown: string | null }>(
    `papers/${encodeURIComponent(id)}`,
  );
  if (!state.value || state.status !== "ready") return <LoadingDetail error={state.status === "error"} />;
  const { paper: p, paths, markdown } = state.value.data;
  const arxiv = p.arxiv_id ?? (p.id.startsWith("arxiv:") ? p.id.slice(6) : null);
  return (
    <>
      <KeyValueList items={paperDetailItems(p)} />
      <p className="text-sm text-muted-foreground">{EDGE_NOTE}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        {arxiv && (
          <a
            href={`https://arxiv.org/abs/${encodeURIComponent(arxiv)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            arXiv record
          </a>
        )}
        {p.id.startsWith("openreview:") && (
          <a
            href={`https://openreview.net/forum?id=${encodeURIComponent(p.id.slice(11))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            OpenReview record
          </a>
        )}
      </div>
      <section>
        <h3 className="ui-case mb-2 text-xs text-muted-foreground">reading paths containing this paper</h3>
        {paths.length ? (
          <ul className="space-y-2 text-sm">
            {paths.map((path) => (
              <li key={path.id}>
                <a className="underline" href={`/papers/paths/?record=${encodeURIComponent(path.id)}`}>
                  {path.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not listed in the published paths.</p>
        )}
      </section>
      {markdown && (
        <section>
          <h3 className="ui-case mb-2 text-xs text-muted-foreground">public paper markdown</h3>
          <p className="max-h-80 overflow-y-auto text-sm whitespace-pre-wrap break-words">{markdown}</p>
        </section>
      )}
      <MissingExports missing={state.value.missing} />
      <PublicProvenance info={state.value.provenance} />
    </>
  );
}
