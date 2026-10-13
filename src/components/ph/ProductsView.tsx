import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { ActiveFilters, FacetFilter, FilterBar, FilterSearch, useUrlFilters } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, Provenance, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import { Button } from "@saas-maker/ui/components/button";
import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import type { FilterDef, FilterState } from "@saas-maker/ui/lib/filters";
import { createResourceClient, resourceClient, useResource } from "@saas-maker/ui/lib/use-resource";
import * as React from "react";
import { PH_META } from "../../adapters/ph/meta";
import { loadPhQuery, type PhSort, type Product } from "../../adapters/ph/query";
import { afterPhPaint, type PhPreview, type PhSummary, summaryPage } from "../../adapters/ph/summary";
import { pinFromColumns } from "../../lib/compare";
import { today, useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";

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
const productRowId = (product: Product) => product.slug;
const exportColumns = ["slug", "name", "tagline", "description", "website_url", "categories", "producthunt_url"].map(
  (id) => ({ id, value: (p: Product) => p[id as keyof Product] }),
);
type Result = {
  rows: Product[];
  total: number;
  categories: { value: string; count: number }[];
  websites: { value: string; count: number }[];
  detail: Product | null;
  provenance: PhSummary["provenance"] | Awaited<ReturnType<typeof loadPhQuery>>["provenance"];
};

export default function ProductsView({
  summary,
  previewOnly = false,
  previewError,
  retryPreview,
}: {
  summary: PhSummary | PhPreview;
  previewOnly?: boolean;
  previewError?: string;
  retryPreview?: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [filters, setFilters] = useUrlFilters(defs);
  const [pageParam, setPage] = useUrlParam("page");
  const [sortParam, setSort] = useUrlParam("sort");
  const [slug, setSlug] = useUrlParam("product");
  const requestedPage = Number(pageParam ?? 1);
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.trunc(requestedPage) - 1) : 0;
  const [id, direction] = (sortParam ?? "name:asc").split(":");
  const sort = React.useMemo<PhSort>(() => ({ id, desc: direction === "desc" }), [id, direction]);
  const sorting = React.useMemo(() => [sort], [sort]);
  const key = JSON.stringify({ q: filters.q, categories: filters.facets.category, website: filters.facets.website });
  const client = React.useMemo(() => (typeof window === "undefined" ? createResourceClient() : resourceClient), []);
  const engine = useResource(
    previewOnly ? "ph-engine-preview" : "ph-engine",
    (signal) =>
      new Promise<Awaited<ReturnType<typeof loadPhQuery>>>((resolve, reject) => {
        const cancel = afterPhPaint(() => {
          signal.removeEventListener("abort", abort);
          void loadPhQuery().then(resolve, reject);
        });
        const abort = () => {
          cancel();
          reject(new DOMException("cancelled", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
      }),
    { client, staleTime: previewOnly ? Infinity : 300_000, cacheTime: Infinity },
  );
  const query = engine.data;
  const read = useResource<Result>(
    `ph:${key}:${page}:${id}:${direction}:${slug ?? ""}:${!!query}`,
    async () => {
      if (!query) throw new Error("catalog is unavailable");
      const filter = JSON.parse(key);
      const sorting = { id, desc: direction === "desc" };
      const unfiltered = !filter.q?.trim() && !filter.categories?.length && !filter.website?.length;
      const [rows, total, categories, websites, detail] = await Promise.all([
        query.rows(filter, sorting, page),
        unfiltered ? Promise.resolve(summary.total) : query.count(filter),
        unfiltered
          ? Promise.resolve("categories" in summary ? summary.categories : [])
          : query.facets(filter, "category"),
        unfiltered ? Promise.resolve(summary.websites) : query.facets(filter, "website"),
        slug ? query.record(slug) : Promise.resolve(null),
      ]);
      performance.mark("ph-query-ready");
      return { rows, total, categories, websites, detail, provenance: query.provenance };
    },
    { client, staleTime: query && !previewOnly ? 30_000 : Infinity },
  );
  const state = previewOnly
    ? "loading"
    : engine.status === "error" || read.status === "error"
      ? "error"
      : read.data
        ? "ready"
        : "loading";
  const prefix = React.useMemo(() => summary.rows.slice(0, 50), [summary]);
  const result = read.data ?? {
    rows: prefix,
    total: summary.total,
    categories: "categories" in summary ? summary.categories : [],
    websites: summary.websites,
    detail: null,
    provenance: summary.provenance,
  };
  const retryTarget = engine.status === "error" ? engine.retry : read.retry;
  const retry = React.useCallback(() => void retryTarget(), [retryTarget]);
  const preview = React.useMemo(
    () => summaryPage(summary, JSON.parse(key), { id, desc: direction === "desc" }, page),
    [summary, key, id, direction, page],
  );
  const showingSummary = previewOnly || !query || state !== "ready";
  const visibleRows = showingSummary ? (preview ?? prefix) : result.rows;
  // The fixed viewport never displays more than 20 rows. Restore the complete
  // established page at hydration; no summary rows or full-catalog counts change.
  const paintedRows = mounted ? visibleRows : visibleRows.slice(0, 20);
  const update = (next: FilterState) => {
    setFilters(next);
    setPage(null);
  };
  const facet = (name: string, values: string[]) =>
    update({ ...filters, facets: { ...filters.facets, [name]: values } });
  const detail = state === "ready" ? result?.detail : null;
  const provenance = showingSummary ? summary.provenance : result.provenance;
  const pin = React.useCallback(
    (p: Product) =>
      pinFromColumns("/ph/", p.slug, p.name, p, columns, provenance, "product", {}, p.producthunt_url ?? undefined),
    [provenance],
  );
  const openProduct = React.useCallback((product: Product) => setSlug(product.slug), [setSlug]);
  const changeSort = React.useCallback(
    (next: PhSort[]) => {
      setSort(next[0] ? `${next[0].id}:${next[0].desc ? "desc" : "asc"}` : null);
      setPage(null);
    },
    [setSort, setPage],
  );
  const rowCount = mounted ? (showingSummary ? summary.total : result.total) : paintedRows.length;
  const tablePage = showingSummary && !preview ? 0 : page;
  const manual = React.useMemo(
    () => ({ rowCount, page: tablePage, onPageChange: (next: number) => setPage(next ? String(next + 1) : null) }),
    [rowCount, tablePage, setPage],
  );
  const matchingTotal = showingSummary ? summary.total : result.total;
  const exportQuery = state === "ready" ? query : undefined;
  const toolbar = React.useCallback(
    () => (
      <>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {`${matchingTotal.toLocaleString("en-US")} matching products`}
        </p>
        {exportQuery ? (
          <PhExport key={`${key}:${id}:${direction}`} query={exportQuery} filters={JSON.parse(key)} sort={sort} />
        ) : (
          <Button variant="ghost" size="sm" disabled>
            prepare export
          </Button>
        )}
      </>
    ),
    [matchingTotal, exportQuery, key, id, direction, sort],
  );
  return (
    <>
      <FilterBar>
        <SaveView />
        <fieldset disabled={previewOnly} className="contents">
          <FilterSearch
            value={filters.q ?? ""}
            onChange={(q) => update({ ...filters, q })}
            placeholder="Name, tagline or description…"
          />
          <FacetFilter
            label="category"
            options={showingSummary ? ("categories" in summary ? summary.categories : []) : result.categories}
            selected={filters.facets.category ?? []}
            onChange={(v) => facet("category", v)}
          />
          <FacetFilter
            label="has website"
            options={showingSummary ? summary.websites : result.websites}
            selected={filters.facets.website ?? []}
            onChange={(v) => facet("website", v)}
          />
        </fieldset>
      </FilterBar>
      <ActiveFilters defs={defs} state={filters} onChange={update} className="my-3" />
      <div className="ph-engine-status my-3 text-sm text-muted-foreground" role="status">
        {previewError ? (
          <ErrorState title="initial catalog could not refresh." description={null} onRetry={retryPreview} />
        ) : state === "error" ? (
          <ErrorState title="full catalog could not load." description={null} onRetry={retry} />
        ) : showingSummary ? (
          <>
            Loading full catalog…{" "}
            {previewOnly
              ? "Showing 20 initial products."
              : preview
                ? "You can browse the first 100 products by name."
                : "Your view is queued; showing the first 50 products by name until ready."}
          </>
        ) : (
          "Full catalog ready."
        )}
      </div>
      <RecordLayout>
        <DataTable
          pin={pin}
          className="flex-1"
          label="PH products"
          data={paintedRows}
          columns={columns}
          getRowId={productRowId}
          status="ready"
          selectedId={slug}
          onRowClick={openProduct}
          pageSize={mounted ? 50 : 20}
          sort={sorting}
          onSortChange={changeSort}
          manual={manual}
          empty="No products match these filters."
          toolbar={toolbar}
        />
        <RecordDetail
          actions={detail && <PinButton item={pin(detail)} />}
          open={!!slug}
          onOpenChange={(open) => !open && setSlug(null)}
          title={detail?.name ?? "product"}
          subtitle={detail?.tagline ?? undefined}
          className="lg:w-[28rem]"
        >
          {state === "loading" ? (
            <RecordDetailSkeleton className="border-0 rounded-none max-w-none" />
          ) : state === "error" ? (
            <ErrorState title="product could not load." description={null} onRetry={retry} />
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
                {PH_META.coverageLabel}. Not a ranking: the catalogue has no votes/dates.
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
            <p className="text-sm">This slug is not in the loaded catalogue.</p>
          )}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}

/** Export is expensive: read all filtered rows only on explicit request. */
function PhExport({
  query,
  filters,
  sort,
}: {
  query: Awaited<ReturnType<typeof loadPhQuery>>;
  filters: Parameters<typeof query.export>[0];
  sort: PhSort;
}) {
  const [exported, setExported] = React.useState<Awaited<ReturnType<typeof query.export>> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const active = React.useRef(true);
  React.useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  if (exported)
    return (
      <ExportMenu
        rows={exported.rows}
        columns={[
          ...exportColumns,
          { id: "source", value: () => exported.source },
          { id: "collectedAt", value: () => exported.collectedAt },
          { id: "fetchedAt", value: () => exported.provenance.fetchedAt },
          { id: "revision", value: () => PH_META.revision },
        ]}
        filename={`ph-products-${today()}`}
        meta={{ ...exported, rows: undefined }}
      />
    );
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const value = await query.export(filters, sort);
            if (active.current) setExported(value);
          } catch (e) {
            if (active.current) setError(e instanceof Error ? e.message : "Export failed.");
          } finally {
            if (active.current) setBusy(false);
          }
        }}
      >
        {busy ? "Preparing export…" : "prepare export"}
      </Button>
      {error && (
        <span role="status" className="text-sm">
          {error}
        </span>
      )}
    </>
  );
}
