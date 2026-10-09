import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { ActiveFilters, FacetFilter, FilterBar, FilterSearch, useUrlFilters } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, Provenance, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { type DataColumn, DataTable } from "@saas-maker/ui/components/data-table";
import type { FilterDef, FilterState } from "@saas-maker/ui/lib/filters";
import * as React from "react";
import { PH_META } from "../../adapters/ph/meta";
import { loadPhQuery, type PhSort, type Product } from "../../adapters/ph/query";
import { today, useUrlParam } from "../../lib/url-state";

const defs: FilterDef<Product>[] = [
  { kind: "facet", id: "category", label: "category", value: (p) => p.categories },
  { kind: "facet", id: "website", label: "has website", value: (p) => (p.website_url ? "yes" : "no") },
];
function host(url: string | null) {
  try {
    return url ? new URL(url).host : "not recorded";
  } catch {
    return "not recorded";
  }
}
function link(url: string | null, label: string) {
  if (!url || !/^https?:\/\//i.test(url)) return "not recorded";
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
      {label}
    </a>
  );
}
const columns: DataColumn<Product>[] = [
  { id: "name", header: "name", value: (p) => p.name, hideable: false, minWidth: "12rem" },
  {
    id: "tagline",
    header: "tagline",
    value: (p) => p.tagline,
    cell: (p) => <span className="block max-w-96 truncate text-muted-foreground">{p.tagline ?? "not recorded"}</span>,
  },
  {
    id: "categories",
    header: "categories",
    value: (p) => p.categories.join(", "),
    cell: (p) => <span className="block max-w-64 truncate">{p.categories.join(", ") || "not recorded"}</span>,
  },
  { id: "website_url", header: "website host", value: (p) => host(p.website_url) },
];
const exportColumns = ["slug", "name", "tagline", "description", "website_url", "categories", "producthunt_url"].map(
  (id) => ({ id, value: (p: Product) => p[id as keyof Product] }),
);
type Result = {
  rows: Product[];
  total: number;
  categories: { value: string; count: number }[];
  websites: { value: string; count: number }[];
  detail: Product | null;
  exported: Awaited<ReturnType<Awaited<ReturnType<typeof loadPhQuery>>["export"]>>;
};

export default function ProductsView() {
  const [filters, setFilters] = useUrlFilters(defs);
  const [pageParam, setPage] = useUrlParam("page");
  const [sortParam, setSort] = useUrlParam("sort");
  const [slug, setSlug] = useUrlParam("product");
  const requestedPage = Number(pageParam ?? 1);
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.trunc(requestedPage) - 1) : 0;
  const [id, direction] = (sortParam ?? "name:asc").split(":");
  const sort: PhSort = { id, desc: direction === "desc" };
  const [state, setState] = React.useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<Result | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const key = JSON.stringify({ q: filters.q, categories: filters.facets.category, website: filters.facets.website });
  React.useEffect(() => {
    let current = true;
    void nonce;
    setState("loading");
    const filter = JSON.parse(key);
    loadPhQuery()
      .then(async (query) => {
        const sorting = { id, desc: direction === "desc" };
        const [rows, total, categories, websites, detail, exported] = await Promise.all([
          query.rows(filter, sorting, page),
          query.count(filter),
          query.facets(filter, "category"),
          query.facets(filter, "website"),
          slug ? query.record(slug) : Promise.resolve(null),
          query.export(filter, sorting),
        ]);
        if (current) {
          setResult({ rows, total, categories, websites, detail, exported });
          setState("ready");
        }
      })
      .catch((e: unknown) => {
        if (current) {
          setError(e instanceof Error ? e.message : "Engine or Parquet file failed.");
          setState("error");
        }
      });
    return () => {
      current = false;
    };
  }, [key, page, id, direction, slug, nonce]);
  const update = (next: FilterState) => {
    setFilters(next);
    setPage(null);
  };
  const facet = (name: string, values: string[]) =>
    update({ ...filters, facets: { ...filters.facets, [name]: values } });
  const detail = state === "ready" ? result?.detail : null;
  const provenance = result?.exported.provenance;
  return (
    <>
      <FilterBar>
        <FilterSearch
          value={filters.q ?? ""}
          onChange={(q) => update({ ...filters, q })}
          placeholder="Name, tagline or description…"
        />
        <FacetFilter
          label="category"
          options={result?.categories ?? []}
          selected={filters.facets.category ?? []}
          onChange={(v) => facet("category", v)}
        />
        <FacetFilter
          label="has website"
          options={result?.websites ?? []}
          selected={filters.facets.website ?? []}
          onChange={(v) => facet("website", v)}
        />
      </FilterBar>
      <ActiveFilters defs={defs} state={filters} onChange={update} className="my-3" />
      <RecordLayout>
        <DataTable
          className="flex-1"
          label="PH products"
          data={state === "ready" ? (result?.rows ?? []) : []}
          columns={columns}
          getRowId={(p) => p.slug}
          status={state}
          error={`PH Catalog could not load: ${error}`}
          onRetry={() => setNonce((n) => n + 1)}
          selectedId={slug}
          onRowClick={(p) => setSlug(p.slug)}
          pageSize={50}
          sort={[sort]}
          onSortChange={(s) => {
            setSort(s[0] ? `${s[0].id}:${s[0].desc ? "desc" : "asc"}` : null);
            setPage(null);
          }}
          manual={{ rowCount: result?.total ?? 0, page, onPageChange: (p) => setPage(p ? String(p + 1) : null) }}
          empty="No products match these filters."
          toolbar={() => (
            <>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {state === "ready"
                  ? `${result?.total.toLocaleString("en-US")} matching products`
                  : state === "error"
                    ? "PH Catalog engine or file failed to load."
                    : "Loading DuckDB engine and PH Parquet sample…"}
              </p>
              {state === "ready" && result && (
                <ExportMenu
                  rows={result.exported.rows}
                  columns={[
                    ...exportColumns,
                    { id: "source", value: () => result.exported.source },
                    { id: "collectedAt", value: () => result.exported.collectedAt },
                    { id: "fetchedAt", value: () => provenance?.fetchedAt },
                    { id: "revision", value: () => PH_META.revision },
                  ]}
                  filename={`ph-products-${today()}`}
                  meta={{ ...result.exported, rows: undefined }}
                />
              )}
            </>
          )}
        />
        <RecordDetail
          open={!!slug}
          onOpenChange={(open) => !open && setSlug(null)}
          title={detail?.name ?? "product"}
          subtitle={detail?.tagline ?? undefined}
          className="lg:w-[28rem]"
        >
          {state === "loading" ? (
            <p className="text-sm">Loading product…</p>
          ) : state === "error" ? (
            <p className="text-sm">Product could not load. {error}</p>
          ) : detail ? (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-line">{detail.description || "not recorded"}</p>
              <KeyValueList
                align="start"
                items={[
                  { label: "slug", value: detail.slug },
                  { label: "categories", value: detail.categories.join(", ") || "not recorded" },
                  { label: "website", value: link(detail.website_url, host(detail.website_url)) },
                  { label: "Product Hunt", value: link(detail.producthunt_url, "public product page") },
                  { label: "release", value: link(PH_META.releaseUrl, `${PH_META.release} · ${PH_META.publishedAt}`) },
                  { label: "collector", value: PH_META.collector },
                  { label: "attribution", value: PH_META.attribution },
                  { label: "collected at", value: "not recorded" },
                ]}
              />
              <p className="text-sm text-muted-foreground">
                {PH_META.sampleLabel}. Not a ranking: the catalogue has no votes/dates.
              </p>
              {provenance && (
                <Provenance
                  info={{
                    source: provenance.source,
                    url: detail.producthunt_url ?? provenance.sourceUrl,
                    via: provenance.via,
                    viaUrl: provenance.viaUrl,
                    readAt: provenance.fetchedAt,
                    revision: provenance.revision,
                    note: provenance.note,
                  }}
                />
              )}
            </>
          ) : (
            <p className="text-sm">This slug is not in the loaded sample.</p>
          )}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}
