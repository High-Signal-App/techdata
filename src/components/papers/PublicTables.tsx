import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { ActiveFilters, FacetFilter, FilterBar, FilterSearch, useUrlFilters } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { type FilterDef, facetCounts, filterRows } from "@saas-maker/ui/lib/filters";
import type { ReactNode } from "react";
import { type Author, type CitedWork, type Envelope, formatYear, type ReadingPath } from "../../adapters/papers";
import { pinFromColumns } from "../../lib/compare";
import { today, useUrlParam } from "../../lib/url-state";
import type { ViewPath } from "../../lib/views";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";
import { MissingExports, PublicProvenance, provenanceColumns, showValue, usePapersApi } from "./shared";

const pathColumns: DataColumn<ReadingPath>[] = [
  { id: "title", header: "reading path", value: (r) => r.title, minWidth: "16rem", hideable: false },
  { id: "difficulty", header: "difficulty", value: (r) => r.difficulty },
  { id: "status", header: "attribution status", value: (r) => r.status },
  { id: "readings", header: "readings", value: (r) => r.papers.length, align: "right" },
  { id: "estimate", header: "estimate", value: (r) => r.estimate },
];
const pathFilters: FilterDef<ReadingPath>[] = [
  { kind: "facet", id: "difficulty", label: "difficulty", value: (r) => r.difficulty },
  { kind: "facet", id: "status", label: "attribution status", value: (r) => r.status },
  { kind: "facet", id: "tag", label: "tag", value: (r) => r.tags },
  { kind: "facet", id: "track", label: "track", value: (r) => r.tracks },
];
const citedColumns: DataColumn<CitedWork>[] = [
  { id: "title", header: "cited work", value: (r) => r.title, minWidth: "18rem", hideable: false },
  {
    id: "publication_year",
    header: "year",
    value: (r) => r.publication_year,
    cell: (r) => formatYear(r.publication_year) || "—",
  },
  { id: "global_citations", header: "global citations", value: (r) => r.global_citations, align: "right" },
  { id: "in_corpus_citations", header: "in-corpus citations", value: (r) => r.in_corpus_citations, align: "right" },
  { id: "primary_topic", header: "topic", value: (r) => r.primary_topic },
];
const citedFilters: FilterDef<CitedWork>[] = [
  { kind: "facet", id: "topic", label: "primary topic", value: (r) => r.primary_topic },
  {
    kind: "facet",
    id: "year",
    label: "publication year",
    value: (r) => (r.publication_year == null ? null : formatYear(r.publication_year)),
  },
];
const authorColumns: DataColumn<Author>[] = [
  { id: "author", header: "author", value: (r) => r.author, minWidth: "12rem", hideable: false },
  { id: "n_papers", header: "papers", value: (r) => r.n_papers, align: "right" },
  { id: "sum_citations", header: "citations", value: (r) => r.sum_citations, align: "right" },
  { id: "sum_pr", header: "sum PageRank", value: (r) => r.sum_pr, align: "right" },
];
const authorFilters: FilterDef<Author>[] = [
  { kind: "facet", id: "paper", label: "listed arXiv paper", value: (r) => r.top_arxiv_ids },
];
export function PathsView({ initial }: { initial?: Envelope<{ rows: ReadingPath[] }> }) {
  return (
    <PublicTable
      initial={initial}
      endpoint="paths"
      label="Reading paths"
      columns={pathColumns}
      defs={pathFilters}
      rowId={(r) => r.id}
      search={(r) => [r.title, r.subtitle, r.audience, ...r.tags, ...r.papers.map((p) => p.title)].join(" ")}
      detail={(r) => (
        <>
          <KeyValueList
            items={[
              "subtitle",
              "audience",
              "estimate",
              "status",
              "difficulty",
              "outcome",
              "sourceNote",
              "trustNote",
            ].map((k) => ({ label: k, value: showValue(r[k as keyof ReadingPath]) }))}
          />
          <ul className="space-y-2 text-sm">
            {r.sourceUrls.map((s) => (
              <li key={s.url}>
                <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <h3 className="ui-case text-xs text-muted-foreground">readings in published order</h3>
          <ol className="list-decimal space-y-5 pl-5 text-sm">
            {r.papers.map((p) => (
              <li key={p.id}>
                <a className="font-medium underline" href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.title}
                </a>
                <KeyValueList
                  items={[
                    { label: "authors", value: showValue(p.authors) },
                    { label: "year", value: formatYear(p.year) || "not recorded" },
                    { label: "venue", value: showValue(p.venue) },
                    { label: "relation", value: showValue(p.relation) },
                    { label: "brief", value: showValue(p.brief) },
                    { label: "focus", value: showValue(p.focus) },
                  ]}
                />
                {(p.arxivId || p.id.startsWith("arxiv:")) && (
                  <a
                    className="underline"
                    href={`/papers/?paper=${encodeURIComponent(p.arxivId ? `arxiv:${p.arxivId}` : p.id)}`}
                  >
                    look up in public paper export
                  </a>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    />
  );
}
export function CitedView({ initial }: { initial?: Envelope<{ rows: CitedWork[] }> }) {
  return (
    <PublicTable
      initial={initial}
      endpoint="cited-works"
      label="Top cited works"
      columns={citedColumns}
      defs={citedFilters}
      rowId={(r) => r.doi ?? r.arxiv_id ?? r.title}
      search={(r) => [r.title, r.primary_topic, r.doi].join(" ")}
      detail={(r) => (
        <>
          <KeyValueList
            items={Object.entries(r).map(([k, v]) => ({ label: k.replaceAll("_", " "), value: showValue(v) }))}
          />
          {r.doi && (
            <a className="text-sm underline" href={r.doi} target="_blank" rel="noopener noreferrer">
              DOI record
            </a>
          )}
          {r.arxiv_id && (
            <a
              className="text-sm underline"
              href={`https://arxiv.org/abs/${encodeURIComponent(r.arxiv_id)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              arXiv record
            </a>
          )}
        </>
      )}
    />
  );
}
export function AuthorsView({ initial }: { initial?: Envelope<{ rows: Author[] }> }) {
  return (
    <PublicTable
      initial={initial}
      endpoint="authors"
      label="Top authors"
      columns={authorColumns}
      defs={authorFilters}
      rowId={(r) => r.author}
      search={(r) => [r.author, ...r.top_arxiv_ids].join(" ")}
      detail={(r) => (
        <>
          <KeyValueList items={authorColumns.map((c) => ({ label: c.header, value: showValue(c.value(r)) }))} />
          <h3 className="ui-case text-xs text-muted-foreground">published top arXiv IDs</h3>
          <ul className="space-y-2 text-sm">
            {r.top_arxiv_ids.map((id) => (
              <li key={id}>
                <a
                  className="underline"
                  href={`https://arxiv.org/abs/${encodeURIComponent(id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {id}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Author ranking records are not per-paper author lists.</p>
        </>
      )}
    />
  );
}
/** Small local composition of library controls shared only within this collection. */
function PublicTable<T extends object>({
  endpoint,
  initial,
  label,
  columns,
  defs,
  rowId,
  search,
  detail,
}: {
  endpoint: string;
  initial?: Envelope<{ rows: T[] }>;
  label: string;
  columns: DataColumn<T>[];
  defs: FilterDef<T>[];
  rowId: (r: T) => string;
  search: (r: T) => string;
  detail: (r: T) => ReactNode;
}) {
  const [state, retry] = usePapersApi<{ rows: T[] }>(endpoint, initial);
  const [filters, setFilters] = useUrlFilters(defs);
  const [id, setId] = useUrlParam("record");
  const [sortParam, setSort] = useUrlParam("sort");
  const [pageParam, setPage] = useUrlParam("page");
  const all = state.value?.data.rows ?? [];
  const [key, direction] = (sortParam ?? `${columns[0].id}:asc`).split(":");
  const column = columns.find((c) => c.id === key) ?? columns[0];
  const rows = filterRows(all, defs, filters, { search }).sort((a, b) => {
    const x = column.value(a),
      y = column.value(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null);
    const n = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return direction === "desc" ? -n : n;
  });
  const page = Math.min(Math.max(0, Math.ceil(rows.length / 50) - 1), Math.max(0, Number(pageParam ?? 1) - 1) || 0);
  const selected = all.find((r) => rowId(r) === id);
  const group = `/papers/${endpoint === "cited-works" ? "cited" : endpoint}/` as ViewPath;
  const pin = (r: T) =>
    pinFromColumns(group, rowId(r), String(columns[0].value(r)), r, columns, state.value?.provenance, "record");
  const exportColumns = [...new Set(all.flatMap((r) => Object.keys(r)))].map((k) => ({
    id: k,
    value: (r: T) => r[k as keyof T],
  }));
  const changeFilters: typeof setFilters = (next) => {
    setFilters(next);
    setPage(null);
  };
  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <FilterBar>
          <SaveView />
          <FilterSearch
            value={filters.q ?? ""}
            onChange={(q) => changeFilters((s) => ({ ...s, q: q || undefined }))}
            placeholder={`Search ${label.toLowerCase()}…`}
          />
          {defs.map(
            (def) =>
              def.kind === "facet" && (
                <FacetFilter
                  key={def.id}
                  label={def.label}
                  options={facetCounts(all, defs, filters, def.id, { search })}
                  selected={filters.facets[def.id] ?? []}
                  onChange={(v) => changeFilters((s) => ({ ...s, facets: { ...s.facets, [def.id]: v } }))}
                />
              ),
          )}
        </FilterBar>
        <ActiveFilters defs={defs} state={filters} onChange={changeFilters} />
      </div>
      <MissingExports missing={state.value?.missing ?? []} />
      <RecordLayout>
        <DataTable
          pin={pin}
          className="flex-1"
          label={label}
          data={rows.slice(page * 50, (page + 1) * 50)}
          columns={columns}
          getRowId={rowId}
          status={state.status}
          onRetry={retry}
          error="This public export did not load."
          onRowClick={(r) => setId(rowId(r))}
          selectedId={id}
          sort={[{ id: column.id, desc: direction === "desc" }]}
          onSortChange={(s) => {
            setSort(s[0] ? `${s[0].id}:${s[0].desc ? "desc" : "asc"}` : null);
            setPage(null);
          }}
          pageSize={50}
          manual={{ rowCount: rows.length, page, onPageChange: (p) => setPage(p ? String(p + 1) : null) }}
          toolbar={() => (
            <>
              <p className="mr-auto text-sm text-muted-foreground tabular-nums">
                {rows.length} of {all.length} records
              </p>
              {state.value && (
                <ExportMenu
                  rows={rows}
                  columns={[...exportColumns, ...provenanceColumns<T>(state.value.provenance)]}
                  filename={`papers-${endpoint}-${today()}`}
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
          actions={selected && <PinButton item={pin(selected)} />}
          open={!!id}
          onOpenChange={(v) => !v && setId(null)}
          title={selected ? String(columns[0].value(selected)) : label}
          className="lg:w-[28rem]"
        >
          {selected && state.value ? (
            <>
              {detail(selected)}
              <PublicProvenance info={state.value.provenance} />
            </>
          ) : (
            <p className="text-sm">This record is not in the available public export.</p>
          )}
        </RecordDetail>
      </RecordLayout>
      {state.value && <PublicProvenance info={state.value.provenance} />}
    </>
  );
}
